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
  streak        integer     not null default 0,        -- consecutive daily-reward days
  last_bonus_at timestamptz,                            -- when the daily reward was last claimed (24h timer)
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
-- Log of crypto purchases of silver coins, verified directly on-chain.
create table if not exists public.purchases (
  id          uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  silver         integer not null,
  usd_amount     numeric not null,                      -- price paid (USD)
  currency       text,                                  -- "ASSET · NETWORK" label
  wallet_address text,                                  -- payer's wallet address (legacy)
  to_address     text,                                  -- admin address paid to
  method_id      text,                                  -- payment method id (e.g. usdt-trc20)
  pay_address    text,                                  -- admin address shown at checkout
  pay_amount     numeric,                               -- crypto amount the buyer must send
  pay_currency   text,                                  -- asset the buyer pays in
  tx_hash        text,                                  -- buyer's on-chain transaction hash
  credited       boolean not null default false,        -- coins granted for this order?
  method         text not null default 'crypto-direct',
  status         text not null default 'awaiting_payment',
  created_at     timestamptz not null default now()
);
-- ---------- idempotent upgrades ----------------------------------------
-- `create table if not exists` above won't touch an EXISTING table, so add
-- any later columns here — and do it BEFORE the indexes below, which depend
-- on them (e.g. tx_hash). Harmless on a fresh database (columns already exist).
alter table public.profiles  add column if not exists avatar_url text;

-- The daily reward uses a precise 24h timer, so last_bonus_at must be a
-- timestamp. Convert it from the older `date` type on existing projects.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'last_bonus_at' and data_type = 'date'
  ) then
    alter table public.profiles
      alter column last_bonus_at type timestamptz using last_bonus_at::timestamptz;
  end if;
end $$;

alter table public.purchases add column if not exists currency       text;
alter table public.purchases add column if not exists wallet_address text;
alter table public.purchases add column if not exists to_address     text;
alter table public.purchases add column if not exists method_id      text;
alter table public.purchases add column if not exists pay_address    text;
alter table public.purchases add column if not exists pay_amount     numeric;
alter table public.purchases add column if not exists pay_currency   text;
alter table public.purchases add column if not exists tx_hash        text;
alter table public.purchases add column if not exists credited       boolean not null default false;

-- Indexes (after the columns above are guaranteed to exist).
-- One payment can only ever credit one order.
create unique index if not exists purchases_tx_hash_key on public.purchases (tx_hash) where tx_hash is not null;
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
