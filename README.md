# Lucky Coin — "Next" 🪙

A coin-based luck game built with **Next.js 15 (App Router)** + **Supabase**.
Pick the lucky coin from a board of 50, crack it open, and win gold, silver or
bronze straight to your account.

## Features

- **Auth** — register (nickname, email, password, nationality, Discord ID) & login via a modal.
- **The game** — spend 1 silver to scatter 50 tiles (1 gold, 4 silver, 20 bronze, 25 empty). Pick one, it cracks open, the prize is credited. The board then reveals where everything was.
- **Rewards** — 50-coin welcome bonus, +5 bronze daily, +20 bronze for a 7-day login streak (a missed day resets the streak).
- **Buy** — purchase silver coins with a crypto checkout (verified on-chain). Minimum 10 silver. Packs: 10/$2, 100/$15, 1,000/$100.
- **Exchange** — value-preserving conversion between gold/silver/bronze.
- **Profile** — `/profile`: every user (and the admin) can edit their own info and upload an avatar.
- **Admin** — `/admin`: full CRUD over all users (create/edit/delete, coins by type, role, login dates) plus a **Transactions** tab showing wallet address, price and date of each purchase.
- **Avatars** — uploaded files are stored in the **Supabase Storage** `avatar` bucket (must be public); only the URL is saved in the database. Works on read-only serverless hosts like Vercel.
- Fully responsive, dark, stylish UI. All copy in English.

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

### Other production notes

- Replace the simulated checkout in [`src/app/api/purchase/route.ts`](src/app/api/purchase/route.ts)
  with a real crypto provider (Coinbase Commerce / NOWPayments). Credit coins only
  from a verified webhook, not from the client request.
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
    api/                  register, me, daily-bonus, game/start, game/pick, exchange, purchase, admin/users
  components/             Nav, AuthModal, UserProvider, CoinIcon, CoinBalance
  lib/
    coins.ts             economy constants + board builder
    auth.ts              requireProfile() helper
    supabase/            client / server / admin clients
supabase/schema.sql      database + RLS
```
