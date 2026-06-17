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
# Start it ONCE (double-click run-bot.bat). It then runs CONTINUOUSLY, topping
# the day's count up toward the target every ~10 minutes so new "users" trickle
# into the database across 24h:
#   * The admin sets the daily number / range in app_config (editable from the
#     admin dashboard -> Bots tab).
#   * At 09:00 (UTC+9) each day a fresh target is rolled and stored in
#     bot_plan(day): the admin's number if they set/changed it that day, else a
#     random count in [min, max] (default 100-200).
#   * Each cycle tops `added` up toward `target`, paced by how much of the day
#     has elapsed (+ jitter), finishing any remainder in the final hour.
#   * Pass --once for a single slice (e.g. under an external scheduler/cron).
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
from urllib.parse import quote

# Make stdout UTF-8 tolerant so the Windows console never crashes on output.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

HERE = Path(__file__).resolve().parent  # this folder = the self-contained unit

PASSWORD = "LuckyBot#2026"  # shared password (these are non-real accounts)

# Coin caps (must mirror the spec).
GOLD_MAX = 10          # inclusive
SILVER_MAX = 10_000    # players hold at most 10,000 silver
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

if not SUPABASE_URL or not SERVICE_KEY:
    print(
        "Missing settings. Provide NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.\n"
        f"  -> Create a .env file next to this script (copy .env.example) at:\n"
        f"     {HERE / '.env'}"
    )
    sys.exit(1)

# Avatar pool: free, no-key, deterministic image URLs across many styles and two
# providers. HUMAN-LIKE MIX so the player list looks hand-picked, not bot-made:
#   * NO_AVATAR_CHANCE of users get no image at all (None -> initial fallback);
#   * PEOPLE_SHARE of the rest get a REAL-PERSON PHOTO from a small finite set
#     (randomuser.me / pravatar.cc) -> photos naturally OVERLAP between users;
#   * the remainder get a unique illustrated avatar (DiceBear SVG / RoboHash).
# Embedded here so this folder stays fully self-contained on any device.
NO_AVATAR_CHANCE = 0.15
PEOPLE_SHARE = 0.6
PEOPLE = [
    ("https://randomuser.me/api/portraits/men/{n}.jpg", 0, 100),
    ("https://randomuser.me/api/portraits/women/{n}.jpg", 0, 100),
    ("https://i.pravatar.cc/300?img={n}", 1, 70),
]
ILLUSTRATED = [
    "https://api.dicebear.com/9.x/adventurer/svg?seed={seed}",
    "https://api.dicebear.com/9.x/adventurer-neutral/svg?seed={seed}",
    "https://api.dicebear.com/9.x/avataaars/svg?seed={seed}",
    "https://api.dicebear.com/9.x/big-ears/svg?seed={seed}",
    "https://api.dicebear.com/9.x/big-smile/svg?seed={seed}",
    "https://api.dicebear.com/9.x/bottts/svg?seed={seed}",
    "https://api.dicebear.com/9.x/croodles/svg?seed={seed}",
    "https://api.dicebear.com/9.x/fun-emoji/svg?seed={seed}",
    "https://api.dicebear.com/9.x/lorelei/svg?seed={seed}",
    "https://api.dicebear.com/9.x/lorelei-neutral/svg?seed={seed}",
    "https://api.dicebear.com/9.x/micah/svg?seed={seed}",
    "https://api.dicebear.com/9.x/miniavs/svg?seed={seed}",
    "https://api.dicebear.com/9.x/notionists/svg?seed={seed}",
    "https://api.dicebear.com/9.x/notionists-neutral/svg?seed={seed}",
    "https://api.dicebear.com/9.x/open-peeps/svg?seed={seed}",
    "https://api.dicebear.com/9.x/personas/svg?seed={seed}",
    "https://api.dicebear.com/9.x/pixel-art/svg?seed={seed}",
    "https://api.dicebear.com/9.x/thumbs/svg?seed={seed}",
    "https://robohash.org/{seed}.png?set=set1",
    "https://robohash.org/{seed}.png?set=set3",
    "https://robohash.org/{seed}.png?set=set4",
]


def avatar_url(seed):
    # Human-like pick: sometimes None (no avatar), often a real-person photo from
    # a finite set (so photos repeat), otherwise a unique illustrated avatar.
    if random.random() < NO_AVATAR_CHANCE:
        return None
    if random.random() < PEOPLE_SHARE:
        url, frm, cnt = random.choice(PEOPLE)
        return url.replace("{n}", str(frm + random.randrange(cnt)))
    s = seed or "anon"
    return random.choice(ILLUSTRATED).replace("{seed}", quote(s, safe=""))


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
# Default random daily range when the admin hasn't set (or hasn't changed) a
# fixed number: between DEFAULT_MIN and DEFAULT_MAX users per day.
DEFAULT_MIN = 100
DEFAULT_MAX = 200


def _parse_ts(value):
    """Parse a Supabase timestamptz string into an aware UTC datetime, or None."""
    if not value:
        return None
    try:
        s = str(value).strip().replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def read_config():
    try:
        rows = rest_get("app_config", "select=key,value,updated_at")
    except RuntimeError as e:
        raise RuntimeError(f"{e}\n   -> Run supabase/schema.sql first (creates app_config + bot_plan).")
    cfg = {r["key"]: r["value"] for r in rows}
    updated = {r["key"]: _parse_ts(r.get("updated_at")) for r in rows}
    enabled = True  # bot runner is always active
    mode = "manual" if cfg.get("bot_mode") == "manual" else "auto"
    try:
        specific = int(cfg.get("bot_specific_count", "0"))
    except ValueError:
        specific = 0
    if specific < 0:
        specific = 0
    try:
        count = int(cfg.get("bot_daily_count", "0"))
    except ValueError:
        count = 0
    if count < 0:
        count = 0
    try:
        mn = int(cfg.get("bot_daily_min", str(DEFAULT_MIN)))
    except ValueError:
        mn = DEFAULT_MIN
    try:
        mx = int(cfg.get("bot_daily_max", str(DEFAULT_MAX)))
    except ValueError:
        mx = DEFAULT_MAX
    if mn < 0:
        mn = DEFAULT_MIN
    if mx < mn:
        mx = max(mn, DEFAULT_MAX)
    return {
        "enabled": enabled, "mode": mode, "specific": specific, "count": count,
        "min": mn, "max": mx,
        "specific_updated": updated.get("bot_specific_count"),
        "count_updated": updated.get("bot_daily_count"),
    }


MIN_DAILY = 50  # absolute floor: never generate fewer than this in a day


def pick_target(cfg, day_start):
    """Choose today's target. Honour the admin's fixed number ONLY if they set or
    changed it during the current 09:00 business day; otherwise (no number, or it
    is unchanged from a previous day) fall back to a random count in [min, max]
    (default 100-200)."""
    # The admin's "specified number" is the explicit specific-count, or the
    # manual-mode per-day count.
    admin_num, admin_updated = 0, None
    if cfg.get("specific", 0) > 0:
        admin_num, admin_updated = cfg["specific"], cfg.get("specific_updated")
    elif cfg["mode"] == "manual" and cfg["count"] > 0:
        admin_num, admin_updated = cfg["count"], cfg.get("count_updated")

    if admin_num > 0 and admin_updated is not None and admin_updated >= day_start:
        return max(MIN_DAILY, admin_num)

    # No number entered, or the previous number is unchanged -> random 100-200.
    return max(MIN_DAILY, random.randint(cfg["min"], cfg["max"]))


def get_plan(day, cfg, day_start):
    existing = rest_get("bot_plan", f"day=eq.{day}&select=*")
    if existing:
        return existing[0]
    target = pick_target(cfg, day_start)
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
def to_add_this_run(target, added, now, day_start):
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
def create_bot(name, now, day_start):
    nationality = random.choice(COUNTRIES)
    discord_id = discord_handle(name)
    gold = random.randint(0, GOLD_MAX)
    silver = random.randint(0, SILVER_MAX)
    bronze = random.randint(0, BRONZE_MAX)
    span_ms = max(0, int((now - day_start).total_seconds() * 1000))
    created_at = (day_start + timedelta(milliseconds=random.randint(0, span_ms))).isoformat()

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
        # Seed the avatar with the user's own UUID -> guaranteed-unique image URL.
        av = avatar_url(uid)
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


def _safe_create(name, now, day_start):
    try:
        return create_bot(name, now, day_start)
    except Exception as e:
        print(f"  - skip \"{name}\": {e}")
        return False


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------
def run_once():
    """One drip slice: top today's count up toward the target, paced across 24h."""
    now = datetime.now(timezone.utc)
    tz_offset = timedelta(hours=9)
    start_hour = 9
    local_now = now + tz_offset
    anchor = local_now.replace(hour=start_hour, minute=0, second=0, microsecond=0)
    if local_now.hour < start_hour:
        anchor -= timedelta(days=1)
    day = anchor.strftime("%Y-%m-%d")
    day_start = anchor - tz_offset  # start of the 24h window, as an aware UTC dt

    cfg = read_config()

    plan = get_plan(day, cfg, day_start)
    if not plan:
        raise RuntimeError("Could not read or create today's bot_plan row.")

    want = to_add_this_run(plan["target"], plan["added"], now, day_start)
    print(f"[{day}] target={plan['target']}  added={plan['added']}/{plan['target']}  -> adding {want} this run")
    if want == 0:
        print("On pace -- nothing to add this run.")
        return

    taken = existing_names()
    names = unique_names(want, taken)

    added = 0
    with ThreadPoolExecutor(max_workers=5) as pool:
        for ok in pool.map(lambda n: _safe_create(n, now, day_start), names):
            if ok:
                added += 1

    _req("PATCH", f"/rest/v1/bot_plan?day=eq.{day}",
         body={"added": plan["added"] + added, "updated_at": now.isoformat()},
         headers={"Prefer": "return=minimal"})

    total = plan["added"] + added
    pct = round((total / plan["target"]) * 100) if plan["target"] else 100
    print(f"\n[ok] Added {added} new player{'' if added == 1 else 's'}. "
          f"Today: {total}/{plan['target']} ({pct}%).")


# How often (seconds) the always-on loop tops up the day's drip. Each cycle only
# adds the slice that's due, so frequent wake-ups are cheap. Override with the
# RUN_INTERVAL_SECONDS env var. Default: every 10 minutes.
try:
    RUN_INTERVAL_SECONDS = max(60, int(os.environ.get("RUN_INTERVAL_SECONDS", "600")))
except ValueError:
    RUN_INTERVAL_SECONDS = 600


def main():
    """Run forever. Start it ONCE (double-click run-bot.bat) and it keeps adding
    users automatically: a new 24h target is rolled at 09:00 each day and the
    target is dripped in across the day. Pass --once for a single slice (e.g.
    when driven by an external scheduler / GitHub Actions cron)."""
    import time

    once = "--once" in sys.argv
    if once:
        run_once()
        return

    print(f"Lucky Coin bot is now running continuously "
          f"(top-up every {RUN_INTERVAL_SECONDS // 60} min). Leave this window open; "
          f"press Ctrl+C to stop.")
    while True:
        try:
            run_once()
        except KeyboardInterrupt:
            print("\nStopped.")
            return
        except Exception as e:
            # Never let a transient error (network blip, rate limit) kill the
            # always-on loop -- log it and try again next cycle.
            print(f"[warn] cycle failed, will retry: {e}")
        try:
            time.sleep(RUN_INTERVAL_SECONDS)
        except KeyboardInterrupt:
            print("\nStopped.")
            return


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nStopped.")
    except Exception as e:
        print(f"\n[error] daily_bots failed: {e}")
        sys.exit(1)
