# Lucky Coin — daily-bot (portable registry entry)

This folder is a **single, self-contained unit**. It generates the daily
"bot" players (unique Discord-style names, DiceBear avatars, random coins) and
trickles them into the Supabase database across the day.

It has **no dependency on the rest of the repo** — credentials and config live
inside this folder, and it uses only the Python standard library (nothing to
`pip install`).

## Files

| File | Purpose | Committed? |
|------|---------|-----------|
| `daily_bots.py` | The bot (stdlib only) | yes |
| `run-bot.bat` | Double-click launcher (Windows) | yes |
| `.env.example` | Settings template | yes |
| `.env` | **Your real credentials** | **no — git-ignored** |
| `README.md` | This file | yes |

## Run it on this machine

Double-click **`run-bot.bat`** **once**. The bot then runs **continuously** in
that window — it rolls a fresh daily target at **09:00** and trickles new users
in across the 24-hour window, topping up every ~10 minutes on its own. Leave the
window open; press **Ctrl+C** to stop. (Override the cadence with the
`RUN_INTERVAL_SECONDS` env var; pass `--once` for a single slice under an
external scheduler.)

### How many users per day?

* If the admin sets a **specific number** that day (dashboard → Bots tab), the
  bot creates exactly that many.
* If **no number is entered**, or the number is **unchanged** from a previous
  day, the bot generates a random **100–200** users that day.

## Run it on a DIFFERENT device

1. **Copy this entire `daily-bot` folder** to the other device (USB, zip, etc.).
   Make sure `.env` comes with it — it holds the credentials and is *not* in
   git, so a fresh `git clone` will not include it.
   - If you only have a clone (no `.env`), copy `.env.example` to `.env` and
     fill in the two values.
2. Install **Python 3** (https://www.python.org/downloads/ — tick *Add
   python.exe to PATH*).
3. Double-click **`run-bot.bat`**.

That's it — no Node, no npm, no project checkout required.

## Settings (`.env`)

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...            # service_role key (secret!)
# AVATAR_BASE_URL=https://api.dicebear.com/9.x/adventurer/png   # optional
```

The daily count and on/off switch are **not** here — they live in the
`app_config` table and are editable from the app's admin dashboard → Bots tab
(`bot_enabled`, `bot_daily_min`, `bot_daily_max`).

## Keep it running across reboots (optional)

The bot already runs continuously once started, so you don't need a scheduler.
To survive a reboot, drop a shortcut to `run-bot.bat` into the Startup folder
(`Win+R` → `shell:startup`) so Windows relaunches it automatically at login.

## Security

`.env` contains the Supabase **service-role** key, which can read/write the
whole database. Never commit it or share the folder publicly. `.gitignore`
already excludes every `.env` file, so it won't be pushed by accident.
