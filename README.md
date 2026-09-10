# Lucky Coin — "Next" 🪙

A coin-based luck game built with **Next.js 15 (App Router)** + **Supabase**.
Pick the lucky coin from a board of 50, crack it open, and win gold, silver or
bronze straight to your account.

## Features

- **Auth** — register (nickname, email, password, nationality, Discord ID) & login via a modal.
- **The game** — spend 1 silver to scatter 50 tiles (1 gold, 4 silver, 20 bronze, 25 empty). Pick one, it cracks open, the prize is credited. The board then reveals where everything was.
- **Rewards** — 50-coin welcome bonus, +5 bronze daily, +20 bronze for a 7-day login streak (a missed day resets the streak).
- **Buy** — purchase silver coins by **credit card (Stripe Checkout)**. This is the only payment method; every card is charged in JPY at the fixed ¥150/$1 book rate. Packs: 10/$2, 100/$15, 1,000/$100.
- **Exchange** — value-preserving conversion between gold/silver/bronze.
- **Profile** — `/profile`: every user (and the admin) can edit their own info and upload an avatar.
- **Admin** — `/admin`: full CRUD over all users (create/edit/delete, coins by type, role, login dates), a **Transactions** tab, and a **Payments** tab that reads the live Stripe income for **this site only** (see [Admin payment history](#admin-payment-history)) with real-time charts.
- **Avatars** — uploaded files are stored in the **Supabase Storage** `avatar` bucket (must be public); only the URL is saved in the database. Works on read-only serverless hosts like Vercel.
- **Language** — the site is **Japanese only**. There is no language switch. See [Copy and wording](#copy-and-wording).
- Fully responsive, bright UI on a white base, set in the rounded Japanese typeface *M PLUS Rounded 1c*.

## Economy

Base unit is **bronze**. `1 silver = 10 bronze`, `1 gold = 500 bronze` (so 1 gold = 50 silver).
All values are tunable in [`src/lib/coins.ts`](src/lib/coins.ts).

> Note on the spec: the board is **1 gold + 4 silver + 20 bronze + 25 empty = 50**
> tiles. Empty tiles award nothing. Each round costs **1 silver or 10 bronze**.

## Security model

Coin balances are **only** written by server-side API routes using the Supabase
service-role key. The browser can read its own profile (Row Level Security) but
can never update balances directly, the game board is generated and stored
server-side so picks can't be predicted, and purchase amounts are validated
against a server price list.

## Setup

1. **Install**
   ```bash
   npm install
   ```

2. **Database** — open your Supabase project → SQL Editor → paste and run
   [`supabase/schema.sql`](supabase/schema.sql). This single file is the entire
   schema (tables, indexes, RLS) and is idempotent — safe to run on a fresh
   project or re-run on an existing one to bring it up to date.

3. **Seed the administrator** — creates/refreshes the built-in admin account
   (idempotent — safe to run any time; it never wipes the admin's coins):
   ```bash
   npm run seed
   ```
   Admin login: `kindman207@gmail.com` / `LuckyCoin!@#`. This account always has
   `is_admin = true`, so it gets the **Admin** nav link and dashboard access.

   > Note: `.env.local` is already filled in with your project's keys. For a
   > fresh clone, copy `.env.example` → `.env.local` and set
   > `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key)
   > and `SUPABASE_SERVICE_ROLE_KEY` (secret key — **server only, never commit**).
   > The secret key bypasses all security; if it leaks, rotate it in
   > Supabase → Settings → API.

4. **Run**
   ```bash
   npm run dev
   ```
   Open the printed URL (http://localhost:3000, or the next free port).

To promote any other player to admin, run in the SQL Editor:
```sql
update public.profiles set is_admin = true where email = 'someone@example.com';
```

## Going to production

### Vercel environment variables

Set these in **Vercel → Project → Settings → Environment Variables** (then redeploy):

| Variable | Required |
|----------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes |
| `NEXT_PUBLIC_SITE_URL` | Recommended (`https://luckybronzecoin.com`) |
| `GOOGLE_CLIENT_ID` | Yes (for Google login) |
| `GOOGLE_CLIENT_SECRET` | Yes (for Google login) |
| `SMTP_*`, `CONTACT_EMAIL` | If using email login / contact form |
| `STRIPE_SECRET_KEY` | Yes (for card payments) |
| `STRIPE_WEBHOOK_SECRET` | Yes (for card payments) |
| `STRIPE_CURRENCY` | Optional (default `usd`) |

### Google login (production)

1. **Supabase** → Authentication → URL Configuration:
   - Site URL: `https://luckybronzecoin.com`
   - Redirect URLs: `https://luckybronzecoin.com/auth/callback`

2. **Google Cloud Console** → APIs & Services → Credentials → your OAuth client:
   - Authorized JavaScript origins: `https://luckybronzecoin.com`
   - Authorized redirect URIs (add **both**):
     - `https://YOUR-PROJECT.supabase.co/auth/v1/callback` (Supabase fallback)
     - `https://luckybronzecoin.com/api/auth/google/callback` (server-side flow)

3. Copy the same **Client ID** and **Client secret** into Vercel as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

The app uses a **server-side Google OAuth** route (`/api/auth/google`) so the user's browser never opens `supabase.co` during sign-in. This fixes `ERR_TUNNEL_CONNECTION_FAILED` when `supabase.co` is blocked on the network.

### Card payments (Stripe)

The `/buy` page offers **card only**. Payments run through Stripe Checkout — no
card details ever reach this site. The crypto checkout (on-chain verification,
receiving wallets, the LuckyCoinPayments contract) has been removed entirely.

1. **Get your keys** — Stripe Dashboard → Developers → API keys. Set
   `STRIPE_SECRET_KEY` (server only; never expose it to the browser).

2. **Add the webhook** — Stripe Dashboard → Developers → Webhooks → *Add endpoint*:
   - URL: `https://YOUR-DOMAIN/api/stripe/webhook`
   - Events: `checkout.session.completed`,
     `checkout.session.async_payment_succeeded`,
     `checkout.session.async_payment_failed`, `checkout.session.expired`
   - Copy the signing secret (`whsec_…`) into `STRIPE_WEBHOOK_SECRET`.

3. **Run the schema again** — [`supabase/schema.sql`](supabase/schema.sql) adds the
   `stripe_session_id` / `stripe_payment_intent` columns and their unique index.
   It is idempotent, so re-running it on an existing project is safe.

4. **Test locally** with the Stripe CLI:
   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```

**How a card purchase is credited**

| Step | What happens |
|------|--------------|
| 1 | `/api/purchase/stripe` prices the pack **server-side**, writes a pending `purchases` row, and creates a Checkout Session carrying the order id. |
| 2 | The buyer pays on Stripe's hosted page. |
| 3 | The webhook (`checkout.session.completed`) verifies the signature and credits the silver. |
| 4 | On return to `/buy`, `/api/purchase/stripe/status` asks Stripe directly so the balance updates immediately instead of waiting for the webhook. |

Steps 3 and 4 both call `creditPurchase()`, which claims the order with a single
`credited = false` UPDATE — whichever arrives first wins and the other is a
no-op, so **one payment can never credit twice**. Prices are never taken from
the browser, and the webhook rejects any request whose signature does not verify.

## Copy and wording

The site is **Japanese only**. There is no language switch, no `lang` cookie and
no English catalogue — an earlier JA/EN toggle was removed when the product
became a Japan-only service.

- All copy lives in [`src/lib/i18n/messages/ja.ts`](src/lib/i18n/messages/ja.ts),
  which is the single source of message keys. `MessageKey` is derived from it, so
  **TypeScript fails the build on a key that does not exist**.
- Client components read it with `useI18n()`; server code uses `getT()` from
  [`src/lib/i18n/server.ts`](src/lib/i18n/server.ts). Both return the same
  translator — the tiny runtime is kept so every existing `t("…")` call site, and
  the "an API may answer with a message key" convention, keep working.
- Strings with inline emphasis are rendered through `<RichText>`, which lets the
  copy move the `<b>` / `<strong>` to wherever the Japanese grammar needs it.
- Generated bot players also get Japanese display names (see `src/lib/bots.ts`),
  so nothing English shows up in the public rankings.

To add a string: add the key to `ja.ts` and use `t("your.key")`.

## Email deliverability

The app sends three transactional emails from its own SMTP (not Supabase's
email service): the sign-up confirmation, the password reset, and a copy of
contact-form messages. They are built in
[`src/lib/email-template.ts`](src/lib/email-template.ts) and sent through
[`src/lib/mailer.ts`](src/lib/mailer.ts).

**The From domain is what decides inbox vs. spam.** Receiving providers judge a
sender by the domain in the `From` header, and Gmail's sender guidelines expect
SPF + DKIM + DMARC aligned to it. A free mailbox (`@gmail.com`, `@yahoo.co.jp`,
…) can never satisfy that for this brand — you cannot publish DNS records for a
domain you do not own — and "brand-looking automated mail from an unrelated free
mailbox" is the strongest spam signal there is. `mailer.ts` logs a warning on
first send when it detects one.

So the fix is operational, not a code change:

1. Pick a transactional provider — Resend, Amazon SES, SendGrid, Mailgun,
   Postmark. Gmail SMTP is personal mail: ~500/day and no reputation for
   app-generated mail.
2. Verify `luckybronzecoin.com` there and publish the DNS records it hands you
   (SPF `TXT`, the DKIM `CNAME`/`TXT` pair, and a `_dmarc` `TXT`; start at
   `p=none` and tighten once reports show SPF and DKIM passing).
3. Point `SMTP_*` at the provider and set `SMTP_FROM` to an address on that
   domain, e.g. `Lucky Coin <no-reply@luckybronzecoin.com>`.
4. Set `NEXT_PUBLIC_SITE_URL` — the links inside the emails are built from it.
5. Check the result at [mail-tester.com](https://www.mail-tester.com); 9/10 or
   better means SPF, DKIM and DMARC all line up.

What the code already does, so the message itself is not the problem:

- `multipart/alternative` — a plain-text part alongside the HTML, always.
- Envelope sender aligned to the authenticated account; `Message-ID` issued on
  the `From` domain; explicit `Date`.
- `Auto-Submitted: auto-generated` and `X-Auto-Response-Suppress`, marking it
  as transactional and suppressing auto-replies.
- A per-message `X-Entity-Ref-ID` so Gmail does not collapse repeated mails.
- **No** `List-Unsubscribe` on login/reset mail — an unsubscribe header marks a
  message as bulk. It is added only when `MAIL_UNSUBSCRIBE_URL` is set to an
  https endpoint, as RFC 8058 requires (a `mailto:` claiming One-Click is
  invalid and counts against you).
- No images, one link per message, anchor text matching its destination, a
  preheader line, and a signature block naming the sender and the site.
- Optional in-app DKIM signing (`DKIM_DOMAIN` / `DKIM_SELECTOR` /
  `DKIM_PRIVATE_KEY`) for SMTP servers that do not sign for you.

## Admin payment history

The **Payments** tab (`/admin`) shows the real Stripe income for this site, read
live from the Stripe API by
[`/api/admin/stripe/payments`](src/app/api/admin/stripe/payments/route.ts).

The Stripe account is shared with another product, so an unfiltered list would
mix in income that is not ours. A PaymentIntent is counted **only** when:

1. its `metadata.app` is `"luckycoin"` — every Checkout Session and PaymentIntent
   created by `/api/purchase/stripe` carries that marker; **or**
2. its id appears in our own `purchases.stripe_payment_intent` column, which
   catches orders placed before the marker existed.

Everything else in the account is skipped. Buyer name, granted silver and the
"credited" flag are joined from `purchases`; the amount, refunds, card brand and
status come from Stripe itself, so a refund issued in the Stripe dashboard shows
up here too.

Stripe's Search API is **not** used: its metadata index lags by up to a minute,
which would defeat the point. The route pages through `paymentIntents.list` over
the selected window (up to 2,000 records) and filters in-process, and the panel
polls every 5 seconds while the tab is visible — so the summary cards, the
revenue area chart and the count bar chart update in real time.

### Other production notes

- Consider tightening the daily-bonus reset and adding rate limits.

## Project layout

```
src/
  app/
    page.tsx              landing + "Start Game"
    game/                 the board
    buy/                  purchase silver
    exchange/             convert coins
    admin/                all-users dashboard
    api/                  register, me, daily-bonus, game/*, exchange, purchase/stripe/*, stripe/webhook, admin/* (incl. admin/stripe/payments)
  components/             Nav, AuthModal, UserProvider, CoinIcon, CoinBalance, StripePaymentsPanel
  lib/
    coins.ts             economy constants + board builder
    auth.ts              requireProfile() helper
    stripe.ts            Stripe client + JPY helpers (server only)
    purchase-credit.ts   idempotent "credit this order once" helper
    fx-book.ts           the fixed ¥150/$1 book rate used for every charge
    payout-methods.ts    networks offered for the /sell payout (labels only)
    i18n/                Japanese message catalogue, provider, server helper
    supabase/            client / server / admin clients
supabase/schema.sql      database + RLS
```
