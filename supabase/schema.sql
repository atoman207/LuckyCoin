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
  avatar_url    text,                                   -- public URL; file lives in the "avatar" storage bucket
  gold          integer     not null default 0,
  silver        integer     not null default 0,
  bronze        integer     not null default 0,
  is_admin      boolean     not null default false,
  kind          text        not null default 'real',   -- 'real' (self signed-up) | 'bot' (admin/seeded)
  streak        integer     not null default 0,        -- consecutive daily-reward days
  last_bonus_at timestamptz,                            -- when the daily reward was last claimed (24h timer)
  game_round    integer     not null default 0,        -- current play round (1 = first game)
  game_mode     text,                                  -- restart mode: 'continuous' | 'multiplier'
  game_restarts integer     not null default 0,        -- restarts used this game (max 10)
  last_draw_at  timestamptz,                            -- last daily prize-wheel spin (24h timer)
  continue_until timestamptz,                           -- persistent 2h "Continue" timer deadline
  rewards_claimed boolean   not null default false,    -- claimed the sign-up + day-1 bonus?
  first_login_done boolean  not null default false,    -- completed the email magic-link first login?
  created_at    timestamptz not null default now()
);
create index if not exists profiles_created_idx on public.profiles (created_at);

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
alter table public.profiles  add column if not exists kind text not null default 'real';
alter table public.profiles  add column if not exists game_round integer not null default 0;
alter table public.profiles  add column if not exists game_mode text;
alter table public.profiles  add column if not exists game_restarts integer not null default 0;
alter table public.profiles  add column if not exists last_draw_at timestamptz;
alter table public.profiles  add column if not exists continue_until timestamptz;
alter table public.profiles  add column if not exists rewards_claimed boolean not null default false;
alter table public.profiles  add column if not exists first_login_done boolean not null default false;
-- Registered payout wallet for selling gold back.
alter table public.profiles  add column if not exists payout_address text;
alter table public.profiles  add column if not exists payout_method  text;
-- Free rounds banked from picking "free turn" gems in Multiplier Play. While > 0,
-- the next round's silver/bronze entry cost is waived (one per round).
alter table public.profiles  add column if not exists free_rounds integer not null default 0;
-- Existing/established accounts have already logged in — don't gate them.
update public.profiles set first_login_done = true
  where first_login_done = false
    and (is_admin = true or rewards_claimed = true or last_bonus_at is not null
         or gold > 0 or silver > 0 or bronze > 0);
-- Existing accounts (any coins or a prior daily claim) count as already claimed,
-- so the new "Claim Rewards" flow only applies to brand-new sign-ups.
update public.profiles set rewards_claimed = true
  where rewards_claimed = false and (last_bonus_at is not null or gold > 0 or silver > 0 or bronze > 0);

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

-- ---------- sells -------------------------------------------------------
-- Coin sell-back requests (gold @ 1,000 USDT each), only during the Sunday
-- trading windows. USDT payout is fulfilled by the admin (no auto-send).
create table if not exists public.sells (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  gold        integer not null,                          -- gold coins sold
  usdt_amount numeric not null,                          -- gold * 1000
  method_id      text,                                   -- payout crypto/network (PaymentMethod id)
  payout_address text,                                   -- wallet the payout is sent to
  status      text not null default 'requested',         -- 'requested' | 'paid'
  created_at  timestamptz not null default now()
);
alter table public.sells add column if not exists method_id      text;
alter table public.sells add column if not exists payout_address text;
create index if not exists sells_user_idx on public.sells (user_id, created_at desc);

-- ---------- draws -------------------------------------------------------
-- Daily prize-wheel results (bronze rewards). Used for the per-player draw
-- tally on the admin page.
create table if not exists public.draws (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  value      integer not null,                          -- bronze won (0 allowed)
  coin       text not null default 'bronze',
  created_at timestamptz not null default now()
);
create index if not exists draws_user_idx on public.draws (user_id, created_at desc);

-- ---------- visits ------------------------------------------------------
-- Anonymous visitor pings (one row per browser per UTC day) so the admin can
-- see how many people tried the service for free.
create table if not exists public.visits (
  id         uuid primary key default gen_random_uuid(),
  visitor_id text not null,                             -- random id stored in the browser
  day        date not null,
  created_at timestamptz not null default now()
);
create unique index if not exists visits_visitor_day_key on public.visits (visitor_id, day);

-- ---------- contacts ----------------------------------------------------
-- Messages submitted through the contact page; shown on the admin page.
create table if not exists public.contacts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles (id) on delete set null,
  name       text,
  email      text,
  message    text not null,
  handled    boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists contacts_created_idx on public.contacts (created_at desc);

-- ---------- app_config --------------------------------------------------
-- Simple key/value store for server-side settings the admin can tune at
-- runtime (no redeploy). Currently drives the daily bot-subscriber drip:
--   bot_enabled     'true' | 'false'  — master on/off switch
--   bot_mode        'auto' | 'manual' — how the day's target is chosen
--   bot_specific_count exact users/day when > 0 (overrides mode/range)
--   bot_daily_count admin's exact users-per-day (used when mode = 'manual')
--   bot_daily_min   lower bound of the random daily target (default 100)
--   bot_daily_max   upper bound of the random daily target (default 200)
-- The day's target = (admin's number, if set/changed this day) else random(min,max).
-- So if the admin doesn't set a number (or leaves it unchanged), the bot
-- auto-adds a random number of users between 100 and 200, dripped across 24h.
-- Written/read only via the service role (see RLS below).
create table if not exists public.app_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
-- Seed the bot defaults once (do nothing if an admin already changed them).
insert into public.app_config (key, value) values
  ('bot_enabled',    'true'),
  ('bot_mode',       'auto'),
  ('bot_specific_count','0'),
  ('bot_daily_count','0'),
  ('bot_daily_min',  '100'),
  ('bot_daily_max',  '200')
on conflict (key) do nothing;
-- Reset the daily max to the new 100–200 default, but only if an admin hasn't
-- customised it (i.e. it's still one of the old defaults 500 or 1000).
update public.app_config set value = '200' where key = 'bot_daily_max' and value in ('500', '1000');

-- ---------- bot_plan ----------------------------------------------------
-- One row per UTC day. The daily target is chosen ONCE (random in
-- [bot_daily_min, bot_daily_max]); each hourly bot run then tops `added` up
-- toward `target` so new "users" trickle in across the 24h window instead of
-- all at once. Re-running an hour is safe — it only adds the shortfall.
create table if not exists public.bot_plan (
  day        date primary key,
  target     integer not null,
  added      integer not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

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
alter table public.sells       enable row level security;
alter table public.draws       enable row level security;
alter table public.visits      enable row level security;
alter table public.contacts    enable row level security;
alter table public.app_config  enable row level security;
alter table public.bot_plan    enable row level security;
-- contacts / app_config / bot_plan: no client policy on purpose
-- (written and read only through the service role).

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

drop policy if exists "read own sells" on public.sells;
create policy "read own sells"
  on public.sells for select
  using ( auth.uid() = user_id );

drop policy if exists "read own draws" on public.draws;
create policy "read own draws"
  on public.draws for select
  using ( auth.uid() = user_id );
-- visits: no client policy on purpose (written/read only via the service role).

-- =====================================================================
--  Administrator: after running this file, seed the built-in admin with
--    npm run seed
--  (creates kindman207@gmail.com with is_admin = true). To promote any other
--  player, run:
--    update public.profiles set is_admin = true where email = 'you@example.com';
-- =====================================================================
