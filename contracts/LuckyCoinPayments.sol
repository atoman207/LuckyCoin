// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title  LuckyCoinPayments
 * @notice Order-bound crypto checkout for Lucky Coin.
 *
 * WHY THIS EXISTS
 * ---------------
 * Without a contract, buyers send coins straight to a shared receiving
 * address and the backend has to guess which order a payment belongs to by
 * matching "an amount that looks right, at roughly the right time". Two
 * buyers paying the same pack in the same minute is enough to mis-match a
 * payment, and nothing on-chain ties a transfer to an order.
 *
 * Here the order id travels *inside* the payment:
 *
 *      payNative(orderId)                    -> ETH / BNB
 *      payToken(orderId, token, amount)      -> USDT and other ERC-20s
 *
 * Each call emits `PaymentReceived(orderId, payer, token, amount)`, which the
 * backend watches. The moment that event appears the order is settled and the
 * player's coins are credited — no polling for look-alike transfers, no
 * ambiguity about who paid for what.
 *
 * SAFETY PROPERTIES
 * -----------------
 *  1. NO CUSTODY. Every payment is forwarded to `treasury` in the same
 *     transaction. The contract is never meant to hold a balance, so there is
 *     no pot for an attacker to drain.
 *  2. ONE ORDER, ONE PAYMENT. `paid[orderId]` is set before any external call,
 *     so an order can never be paid — or credited — twice.
 *  3. CHECKS-EFFECTS-INTERACTIONS, plus a reentrancy guard on both entry
 *     points.
 *  4. USDT-SAFE. Tether does not return a bool from `transferFrom`; the
 *     low-level helper below accepts both the standard and the non-standard
 *     shape, so USDT works on every chain it lives on.
 *  5. HONEST AMOUNTS. The emitted token amount is the treasury's measured
 *     balance delta, so a fee-on-transfer token reports what actually arrived
 *     rather than what was requested.
 *  6. PLAIN TRANSFERS REVERT. Sending coins to this address without an order
 *     id is a mistake that cannot be credited, so it is rejected outright
 *     instead of silently swallowing the buyer's money.
 *
 * WHAT THIS CONTRACT DELIBERATELY DOES NOT DO
 * -------------------------------------------
 * It does not know USD prices and does not police the amount. Pricing stays
 * on the server, which already has to do that job for Bitcoin, XRP and
 * Stellar (chains with no contracts at all). The contract guarantees
 * *attribution*; the backend guarantees *sufficiency* before crediting.
 *
 * DEPLOY: one instance per EVM chain (Ethereum, BNB Smart Chain, and — since
 * the TVM is EVM-compatible — TRON). See contracts/README.md.
 */
contract LuckyCoinPayments {
    // ---------------------------------------------------------------- state

    /// @notice Where funds are forwarded. Never accumulates here.
    address public treasury;

    /// @notice Can pause, rotate the treasury and rescue stuck funds.
    address public owner;

    /// @notice Ownership handover is two-step, so a typo cannot orphan it.
    address public pendingOwner;

    /// @notice When true, new payments are rejected (does not affect rescue).
    bool public paused;

    /// @notice Order ids that have already been paid. Also readable off-chain
    ///         as a cheap fallback when log queries are unavailable.
    mapping(bytes32 => bool) public paid;

    uint256 private _lock = 1; // 1 = open, 2 = entered

    // --------------------------------------------------------------- events

    /// @notice Emitted once per settled order. `token` is address(0) for the
    ///         chain's native coin. This is the signal the backend credits on.
    event PaymentReceived(
        bytes32 indexed orderId,
        address indexed payer,
        address indexed token,
        uint256 amount
    );

    event TreasuryChanged(address indexed previous, address indexed current);
    event PausedSet(bool paused);
    event OwnershipTransferStarted(address indexed previous, address indexed pending);
    event OwnershipTransferred(address indexed previous, address indexed current);
    event Rescued(address indexed token, address indexed to, uint256 amount);

    // --------------------------------------------------------------- errors

    error NotOwner();
    error NotPendingOwner();
    error ZeroAddress();
    error ZeroAmount();
    error Paused();
    error OrderAlreadyPaid(bytes32 orderId);
    error Reentrancy();
    error NativeTransferFailed();
    error TokenTransferFailed();
    error NoDirectTransfers();

    // ------------------------------------------------------------ modifiers

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    // ---------------------------------------------------------- constructor

    /// @param _treasury Address that receives every payment.
    /// @param _owner    Administrator. Use a hardware wallet or multisig.
    constructor(address _treasury, address _owner) {
        if (_treasury == address(0) || _owner == address(0)) revert ZeroAddress();
        treasury = _treasury;
        owner = _owner;
        emit TreasuryChanged(address(0), _treasury);
        emit OwnershipTransferred(address(0), _owner);
    }

    // ------------------------------------------------------------- payments

    /**
     * @notice Pay an order with the chain's native coin (ETH on Ethereum,
     *         BNB on BNB Smart Chain, TRX on TRON).
     * @param orderId The order's id, as bytes32. The backend derives this from
     *        the order's UUID, so the payment is bound to exactly one order.
     *
     * Reverts if the order was already paid, so a double-click or a resent
     * transaction cannot charge the buyer twice.
     */
    function payNative(bytes32 orderId) external payable nonReentrant {
        if (paused) revert Paused();
        if (msg.value == 0) revert ZeroAmount();
        if (paid[orderId]) revert OrderAlreadyPaid(orderId);

        // Effects before interactions.
        paid[orderId] = true;
        emit PaymentReceived(orderId, msg.sender, address(0), msg.value);

        (bool sent, ) = treasury.call{value: msg.value}("");
        if (!sent) revert NativeTransferFailed();
    }

    /**
     * @notice Pay an order with an ERC-20 token (USDT on ERC-20/BEP-20/TRC-20).
     * @dev    The buyer must `approve` this contract for at least `amount`
     *         first — the standard two-step ERC-20 flow the checkout UI walks
     *         them through.
     * @param orderId The order's id, as bytes32.
     * @param token   The token contract being paid in.
     * @param amount  Amount in the token's smallest unit (USDT: 6 decimals on
     *                Ethereum/TRON, 18 on BNB Smart Chain).
     *
     * The event reports the treasury's actual balance delta, so a token that
     * takes a transfer fee is recorded at what really arrived.
     */
    function payToken(bytes32 orderId, address token, uint256 amount) external nonReentrant {
        if (paused) revert Paused();
        if (token == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (paid[orderId]) revert OrderAlreadyPaid(orderId);

        // Effects before interactions: even a malicious token that calls back
        // in cannot pay this order a second time.
        paid[orderId] = true;

        address to = treasury;
        uint256 before = _balanceOf(token, to);
        _safeTransferFrom(token, msg.sender, to, amount);
        uint256 received = _balanceOf(token, to) - before;

        emit PaymentReceived(orderId, msg.sender, token, received);
    }

    // --------------------------------------------------------------- admin

    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert ZeroAddress();
        emit TreasuryChanged(treasury, _treasury);
        treasury = _treasury;
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PausedSet(_paused);
    }

    function transferOwnership(address _pending) external onlyOwner {
        if (_pending == address(0)) revert ZeroAddress();
        pendingOwner = _pending;
        emit OwnershipTransferStarted(owner, _pending);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        emit OwnershipTransferred(owner, pendingOwner);
        owner = pendingOwner;
        pendingOwner = address(0);
    }

    /**
     * @notice Recover funds that reached this contract outside of a payment —
     *         a token sent straight to the address, or native coin forced in
     *         by `selfdestruct`. Normal payments never sit here.
     */
    function rescue(address token, address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        if (token == address(0)) {
            (bool sent, ) = to.call{value: amount}("");
            if (!sent) revert NativeTransferFailed();
        } else {
            _safeTransfer(token, to, amount);
        }
        emit Rescued(token, to, amount);
    }

    // ---------------------------------------------------- ERC-20 low level

    /**
     * @dev ERC-20 calls that tolerate Tether and friends. The spec says
     *      `transfer`/`transferFrom` return a bool, but USDT on Ethereum
     *      returns nothing at all — calling it through a typed interface
     *      reverts on the ABI decode. Accept both: success plus either empty
     *      return data or an explicit `true`.
     */
    function _safeTransferFrom(address token, address from, address to, uint256 amount) private {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSelector(0x23b872dd, from, to, amount) // transferFrom(address,address,uint256)
        );
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TokenTransferFailed();
    }

    function _safeTransfer(address token, address to, uint256 amount) private {
        (bool ok, bytes memory data) = token.call(
            abi.encodeWithSelector(0xa9059cbb, to, amount) // transfer(address,uint256)
        );
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TokenTransferFailed();
    }

    function _balanceOf(address token, address who) private view returns (uint256) {
        (bool ok, bytes memory data) = token.staticcall(
            abi.encodeWithSelector(0x70a08231, who) // balanceOf(address)
        );
        if (!ok || data.length < 32) revert TokenTransferFailed();
        return abi.decode(data, (uint256));
    }

    // ------------------------------------------------------------ fallback

    /// @dev A bare transfer carries no order id, so it could never be credited
    ///      to anyone. Rejecting it hands the buyer their money back in the
    ///      same transaction instead of stranding it.
    receive() external payable {
        revert NoDirectTransfers();
    }

    fallback() external payable {
        revert NoDirectTransfers();
    }
}
