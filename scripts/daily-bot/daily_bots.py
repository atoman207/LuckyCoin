#!/usr/bin/env python3
# Lucky Coin -- daily bot-subscriber drip  (self-contained registry entry).
#
# This whole folder (scripts/daily-bot/) is ONE portable unit. Copy it to any
# device that has Python 3 and double-click run-bot.bat -- nothing else from the
# repo is required. It depends on no project files: credentials come from the
# .env sitting next to this script, and the avatar style is built in.
#
# No third-party packages -- standard library only, so there is nothing to
# `pip install`.
#
# Run it repeatedly (hourly, or each click). Every run adds only a SLICE of the
# day's target so new "users" trickle into the database across 24h:
#   * The admin sets bot_enabled / bot_daily_min / bot_daily_max in app_config
#     (editable from the admin dashboard -> Bots tab).
#   * The first run of each UTC day rolls a random target in [min, max]
#     (default 100-500) and stores it in bot_plan(day).
#   * Later runs top `added` up toward `target`, paced by how much of the day
#     has elapsed (+ jitter), finishing any remainder in the final hour.
#
# Each generated user gets: a unique Discord-style display name, a DiceBear
# avatar seeded by that name, random coins (gold 0-10, silver/bronze 0-999,999),
# kind='bot', and a backdated created_at within the current hour.
#
# Required settings (in the .env next to this file, or real environment vars):
#   NEXT_PUBLIC_SUPABASE_URL
#   SUPABASE_SERVICE_ROLE_KEY
# Optional:
#   AVATAR_BASE_URL   (defaults to the DiceBear "adventurer" style)

import json
import os
import random
import sys
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib import error, request

# Make stdout UTF-8 tolerant so the Windows console never crashes on output.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HERE = Path(__file__).resolve().parent  # this folder = the self-contained unit

PASSWORD = "LuckyBot#2026"  # shared password (these are non-real accounts)

# Coin caps (must mirror the spec).
GOLD_MAX = 10          # inclusive
SILVER_MAX = 999_999   # strictly fewer than 1,000,000
BRONZE_MAX = 999_999


# --------------------------------------------------------------------------
# Settings loading -- self-contained, no project files needed.
# --------------------------------------------------------------------------
def load_env():
    """Load KEY=VALUE pairs from .env files into os.environ (without overriding
    anything already set in the real environment). The .env beside this script
    is the portable source of truth; the others are dev-time conveniences when
    running inside the full project."""
    candidates = [
        HERE / ".env",                       # <- the portable one (ships in this folder)
        HERE / ".env.local",
        HERE.parent.parent / ".env.local",   # project root, when run inside the repo
    ]
    for env_path in candidates:
        try:
            if not env_path.is_file():
                continue
            for raw in env_path.read_text(encoding="utf-8").splitlines():
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, val = line.partition("=")
                os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))
        except Exception:
            continue


load_env()

SUPABASE_URL = (os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""
AVATAR_BASE = os.environ.get("AVATAR_BASE_URL") or "https://api.dicebear.com/9.x/adventurer/png"

if not SUPABASE_URL or not SERVICE_KEY:
    print(
        "Missing settings. Provide NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.\n"
        f"  -> Create a .env file next to this script (copy .env.example) at:\n"
        f"     {HERE / '.env'}"
    )
    sys.exit(1)


def avatar_url(seed):
    return f"{AVATAR_BASE}?seed={request.quote(seed or 'anon', safe='')}"


# --------------------------------------------------------------------------
# Supabase REST / Auth-Admin helpers (raw HTTP, service-role key)
# --------------------------------------------------------------------------
def _req(method, path, body=None, headers=None):
    """Return (status_code, parsed_json_or_None)."""
    data = json.dumps(body).encode("utf-8") if body is not None else None
    hdrs = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if headers:
        hdrs.update(headers)
    req = request.Request(SUPABASE_URL + path, data=data, method=method, headers=hdrs)
    try:
        with request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, (json.loads(raw) if raw else None)
    except error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            parsed = json.loads(raw)
        except Exception:
            parsed = {"message": raw}
        return e.code, parsed
    except Exception as e:  # network / timeout
        return 0, {"message": str(e)}


def rest_get(table, query=""):
    status, data = _req("GET", f"/rest/v1/{table}?{query}")
    if status >= 400:
        raise RuntimeError(f"GET {table}: {data}")
    return data or []


# --------------------------------------------------------------------------
# Word banks -- combinations read like real Discord display names.
# --------------------------------------------------------------------------
ADJ = ["Silent", "Crimson", "Lunar", "Solar", "Velvet", "Frost", "Shadow", "Golden",
       "Ember", "Cosmic", "Mystic", "Royal", "Swift", "Wild", "Hidden", "Brave",
       "Quiet", "Neon", "Iron", "Jade", "Amber", "Onyx", "Stormy", "Misty",
       "Radiant", "Feral", "Noble", "Dusty", "Electric", "Frozen", "Scarlet", "Wandering"]
NOUN = ["Fox", "Raven", "Wolf", "Falcon", "Tiger", "Otter", "Hawk", "Lynx", "Bear",
        "Viper", "Crane", "Heron", "Koi", "Moth", "Comet", "Ember", "Willow", "Cedar",
        "River", "Ridge", "Drift", "Echo", "Sage", "Frost", "Storm", "Ash", "Maple",
        "Phoenix", "Sparrow", "Panther", "Dragon", "Gecko"]
FIRST = ["Liam", "Mara", "Noah", "Yuki", "Sara", "Kai", "Aria", "Leo", "Mia", "Theo",
         "Ivan", "Lena", "Omar", "Nina", "Ravi", "Elsa", "Hugo", "Zoe", "Finn", "Ada",
         "Ezra", "Luca", "Maya", "Niko", "Tara", "Dmitri", "Hana", "Sven", "Priya", "Diego",
         "Anya", "Mateo", "Freya", "Rohan", "Lara", "Bjorn", "Amara", "Cyrus", "Iris", "Otto"]
LAST = ["Carter", "Quinn", "Voss", "Tanaka", "Hale", "Brooks", "Nash", "Reyes", "Park",
        "Lowe", "Frost", "Vance", "Cole", "Mori", "Adler", "Bennett", "Cruz", "Dane",
        "Flynn", "Grey", "Holt", "Kane", "Mercer", "Novak", "Pace", "Rhodes", "Sable",
        "Thorne", "Vega", "Ward", "Yates", "Zane"]
COUNTRIES = ["USA", "Japan", "Germany", "Brazil", "India", "Canada", "France", "Korea",
             "Spain", "Italy", "Mexico", "Australia", "Nigeria", "Turkey", "Sweden",
             "Poland", "Vietnam", "Egypt", "Chile", "Thailand", "Argentina", "Netherlands"]


def make_name():
    style = random.randint(1, 6)
    if style == 1:
        return random.choice(ADJ) + random.choice(NOUN)
    if style == 2:
        return f"{random.choice(ADJ).lower()}.{random.choice(NOUN).lower()}"
    if style == 3:
        return f"{random.choice(ADJ).lower()}_{random.choice(NOUN).lower()}"
    if style == 4:
        return f"{random.choice(FIRST)} {random.choice(LAST)}"
    if style == 5:
        return f"{random.choice(FIRST).lower()}{random.choice(LAST).lower()}"
    return f"{random.choice(NOUN)}{random.randint(2, 99)}"


def unique_names(count, taken):
    out = []
    while len(out) < count:
        name = make_name()
        guard = 0
        while name.lower() in taken:
            name = make_name() if guard < 6 else f"{name}{random.randint(0, 9)}"
            guard += 1
            if guard > 40:
                name = f"{random.choice(ADJ)}{random.choice(NOUN)}{random.randint(100, 9999)}"
                if name.lower() in taken:
                    continue
                break
        taken.add(name.lower())
        out.append(name)
    return out


def discord_handle(name):
    if random.random() > 0.6:
        return None
    base = "".join(c for c in name.lower() if c.isalnum())[:14] or "user"
    return f"{base}{random.randint(0, 999)}"


# --------------------------------------------------------------------------
# Config + plan
# --------------------------------------------------------------------------
def read_config():
    try:
        rows = rest_get("app_config", "select=key,value")
    except RuntimeError as e:
        raise RuntimeError(f"{e}\n   -> Run supabase/schema.sql first (creates app_config + bot_plan).")
    cfg = {r["key"]: r["value"] for r in rows}
    enabled = (cfg.get("bot_enabled", "true") != "false")
    try:
        mn = int(cfg.get("bot_daily_min", "100"))
    except ValueError:
        mn = 100
    try:
        mx = int(cfg.get("bot_daily_max", "500"))
    except ValueError:
        mx = 500
    if mn < 0:
        mn = 100
    if mx < mn:
        mx = max(mn, 500)
    return enabled, mn, mx


def get_plan(day, mn, mx):
    existing = rest_get("bot_plan", f"day=eq.{day}&select=*")
    if existing:
        return existing[0]
    target = random.randint(mn, mx)
    status, data = _req("POST", "/rest/v1/bot_plan",
                        body={"day": day, "target": target, "added": 0},
                        headers={"Prefer": "return=representation"})
    if status < 400 and data:
        return data[0]
    again = rest_get("bot_plan", f"day=eq.{day}&select=*")
    return again[0] if again else None


def existing_names():
    taken = set()
    page = 1000
    offset = 0
    while True:
        rows = rest_get("profiles", f"select=nickname&order=nickname&limit={page}&offset={offset}")
        for r in rows:
            if r.get("nickname"):
                taken.add(r["nickname"].lower())
        if len(rows) < page:
            break
        offset += page
    return taken


# --------------------------------------------------------------------------
# Pacing -- how many to add on THIS run, given today's progress.
# --------------------------------------------------------------------------
def to_add_this_run(target, added, now):
    day_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    elapsed = (now - day_start).total_seconds() / 86_400.0
    elapsed = min(1.0, max(0.0, elapsed))
    remaining = max(0, target - added)
    if remaining == 0:
        return 0
    if elapsed >= 0.95:
        return remaining
    on_pace = round(target * elapsed)
    shortfall = on_pace - added
    jitter = 0.6 + random.random() * 0.8
    return max(0, min(remaining, round(shortfall * jitter)))


# --------------------------------------------------------------------------
# Create one bot
# --------------------------------------------------------------------------
def create_bot(name, now):
    nationality = random.choice(COUNTRIES)
    discord_id = discord_handle(name)
    av = avatar_url(name)
    gold = random.randint(0, GOLD_MAX)
    silver = random.randint(0, SILVER_MAX)
    bronze = random.randint(0, BRONZE_MAX)
    created_at = (now - timedelta(milliseconds=random.randint(0, 55 * 60 * 1000))).isoformat()

    for attempt in range(3):
        email = f"bot.{uuid.uuid4().hex[:8]}@luckycoin.bot"
        status, data = _req("POST", "/auth/v1/admin/users",
                            body={"email": email, "password": PASSWORD, "email_confirm": True,
                                  "user_metadata": {"nickname": name}})
        uid = (data or {}).get("id") or ((data or {}).get("user") or {}).get("id")
        if status >= 400 or not uid:
            if attempt == 2:
                raise RuntimeError(f"create auth user: {data}")
            continue
        p_status, p_data = _req("POST", "/rest/v1/profiles",
                               body={"id": uid, "nickname": name, "email": email,
                                     "nationality": nationality, "discord_id": discord_id,
                                     "avatar_url": av, "gold": gold, "silver": silver,
                                     "bronze": bronze, "is_admin": False, "kind": "bot",
                                     "created_at": created_at},
                               headers={"Prefer": "return=minimal"})
        if p_status >= 400:
            _req("DELETE", f"/auth/v1/admin/users/{uid}")
            if attempt == 2:
                raise RuntimeError(f"insert profile: {p_data}")
            continue
        return True
    return False


def _safe_create(name, now):
    try:
        return create_bot(name, now)
    except Exception as e:
        print(f"  - skip \"{name}\": {e}")
        return False


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------
def main():
    now = datetime.now(timezone.utc)
    day = now.strftime("%Y-%m-%d")

    enabled, mn, mx = read_config()
    if not enabled:
        print("Bot drip is disabled (app_config.bot_enabled = false). Nothing to do.")
        return

    plan = get_plan(day, mn, mx)
    if not plan:
        raise RuntimeError("Could not read or create today's bot_plan row.")

    want = to_add_this_run(plan["target"], plan["added"], now)
    print(f"[{day}] target={plan['target']}  added={plan['added']}/{plan['target']}  -> adding {want} this run")
    if want == 0:
        print("On pace -- nothing to add this run.")
        return

    taken = existing_names()
    names = unique_names(want, taken)

    added = 0
    with ThreadPoolExecutor(max_workers=5) as pool:
        for ok in pool.map(lambda n: _safe_create(n, now), names):
            if ok:
                added += 1

    _req("PATCH", f"/rest/v1/bot_plan?day=eq.{day}",
         body={"added": plan["added"] + added, "updated_at": now.isoformat()},
         headers={"Prefer": "return=minimal"})

    total = plan["added"] + added
    pct = round((total / plan["target"]) * 100) if plan["target"] else 100
    print(f"\n[ok] Added {added} new player{'' if added == 1 else 's'}. "
          f"Today: {total}/{plan['target']} ({pct}%).")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\n[error] daily_bots failed: {e}")
        sys.exit(1)
