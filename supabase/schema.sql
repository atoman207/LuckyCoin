-- =====================================================================
--  Lucky Coin — "Next"  |  Supabase schema
--  Paste this whole file into the Supabase SQL Editor and run it once.
-- =====================================================================

-- ---------- profiles ----------------------------------------------------
-- One row per registered user. Mirrors auth.users via the id FK.
-- Coin balances live here. They are ONLY ever written by the server
-- (service-role key), never by the browser — see the RLS policies below.
create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  nickname      text        not null,
  email         text        not null,
  nationality   text,
  discord_id    text,
  avatar_url    text,                                   -- URL only; file lives in /public/avatars
  gold          integer     not null default 0,
  silver        integer     not null default 0,
  bronze        integer     not null default 0,
  is_admin      boolean     not null default false,
  streak        integer     not null default 0,        -- consecutive daily-bonus days
  last_bonus_at date,                                   -- last day the daily bonus was claimed
  created_at    timestamptz not null default now()
);

-- ---------- game_rounds -------------------------------------------------
-- Each round costs 1 silver. The 50-coin board is generated and stored
-- server-side so the reveal can't be re-rolled or read ahead by the client.
create table if not exists public.game_rounds (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  board        jsonb not null,                          -- ['bronze','gold',...] length 50
  status       text  not null default 'active',         -- 'active' | 'done'
  picked_index integer,
  reward       jsonb,                                    -- {"type":"gold","gold":1,"silver":0,"bronze":0}
  created_at   timestamptz not null default now()
);
create index if not exists game_rounds_user_idx on public.game_rounds (user_id, created_at desc);

-- ---------- purchases ---------------------------------------------------
-- Log of (simulated) crypto purchases of silver coins.
create table if not exists public.purchases (
  id          uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  silver         integer not null,
  usd_amount     numeric not null,                      -- price paid (USD)
  currency       text,                                  -- chain / coin used to pay
  wallet_address text,                                  -- payer's wallet address
  method         text not null default 'crypto-sim',
  status         text not null default 'completed',
  created_at     timestamptz not null default now()
);
create index if not exists purchases_user_idx on public.purchases (user_id, created_at desc);

-- =====================================================================
--  Row Level Security
--  Strategy: the browser may only READ its own profile. Every write to
--  balances / rounds / purchases happens through Next.js API routes that
--  use the service-role key, which bypasses RLS. So there are no client
--  INSERT/UPDATE policies on purpose.
-- =====================================================================
alter table public.profiles    enable row level security;
alter table public.game_rounds enable row level security;
alter table public.purchases   enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile"
  on public.profiles for select
  using ( auth.uid() = id );

drop policy if exists "read own rounds" on public.game_rounds;
create policy "read own rounds"
  on public.game_rounds for select
  using ( auth.uid() = user_id );

drop policy if exists "read own purchases" on public.purchases;
create policy "read own purchases"
  on public.purchases for select
  using ( auth.uid() = user_id );

-- =====================================================================
--  Administrator: after running this file, seed the built-in admin with
--    npm run seed
--  (creates kindman207@gmail.com with is_admin = true). To promote any other
--  player, run:
--    update public.profiles set is_admin = true where email = 'you@example.com';
-- =====================================================================
