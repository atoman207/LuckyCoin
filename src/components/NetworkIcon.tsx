// Coin/network icons, sourced from CoinMarketCap's static CDN (the official
// per-coin id). For USDT (which runs on several chains) a small chain badge is
// overlaid so each network is visually distinct.

// https://s2.coinmarketcap.com/static/img/coins/64x64/<cmc-id>.png
const CMC: Record<string, string> = {
  USDT: "825",
  BTC: "1",
  ETH: "1027",
  BNB: "1839",
  SOL: "5426",
  TRX: "1958",
  XRP: "52",
  XLM: "512",
};

const iconUrl = (asset: string) =>
  `https://s2.coinmarketcap.com/static/img/coins/64x64/${CMC[asset]}.png`;

// Payment-method id → primary asset + (optional) chain badge.
const METHOD: Record<string, { asset: keyof typeof CMC; chain?: keyof typeof CMC }> = {
  "usdt-trc20": { asset: "USDT", chain: "TRX" },
  "usdt-erc20": { asset: "USDT", chain: "ETH" },
  "usdt-bep20": { asset: "USDT", chain: "BNB" },
  "usdt-spl": { asset: "USDT", chain: "SOL" },
  btc: { asset: "BTC" },
  eth: { asset: "ETH" },
  bnb: { asset: "BNB" },
  sol: { asset: "SOL" },
  trx: { asset: "TRX" },
  xrp: { asset: "XRP" },
  xlm: { asset: "XLM" },
};

function CoinImg({ asset, size }: { asset: string; size: number }) {
  // Plain <img> (not next/image) so no remote-domain config is needed.
  // referrerPolicy="no-referrer": CoinMarketCap's CDN blocks hot-linked images
  // that carry a referrer, which previously left the chain badge blank — making
  // every USDT network look identical. Sending no referrer fixes the load.
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={iconUrl(asset)}
      alt={asset}
      title={asset}
      width={size}
      height={size}
      loading="lazy"
      referrerPolicy="no-referrer"
      style={{ width: size, height: size, borderRadius: 4 }}
    />
  );
}

export default function NetworkIcon({ methodId, size = 32 }: { methodId: string; size?: number }) {
  const map = METHOD[methodId];
  if (!map) return null;
  const chainSize = Math.round(size * 0.52);
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      <CoinImg asset={map.asset} size={size} />
      {map.chain && (
        // Chain badge: identifies the network (e.g. BNB for BEP-20, ETH for
        // ERC-20) so USDT networks are never confused.
        <span
          className="absolute -bottom-1 -right-1 ring-1 ring-black/20"
          style={{ borderRadius: 4, padding: 1, background: "#fff" }}
        >
          <CoinImg asset={map.chain} size={chainSize} />
        </span>
      )}
    </span>
  );
}
