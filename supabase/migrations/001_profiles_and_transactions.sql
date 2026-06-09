-- =====================================================================
--  Migration 001 — avatars + richer transaction records
--  Run this in the Supabase SQL Editor if you already created the schema
--  before this update. (Fresh installs get these columns from schema.sql.)
-- =====================================================================

-- Avatar: only the URL is stored here; the file itself lives in the project
-- under /public/avatars (served at /avatars/...).
alter table public.profiles
  add column if not exists avatar_url text;

-- Transactions: record the payer's wallet address and the currency/chain used.
-- (Price = usd_amount, date = created_at already exist.)
alter table public.purchases
  add column if not exists wallet_address text;
alter table public.purchases
  add column if not exists currency text;
