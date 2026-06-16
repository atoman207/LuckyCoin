// Resource library: user avatar images.
//
// The goal is a HUMAN-LOOKING mix, so the player list reads as hand-picked
// rather than bot-generated (see ./avatars.json):
//   * a share of users get NO avatar at all (null → initial fallback), like
//     real people who never set one;
//   * most of the rest get a REAL-PERSON PHOTO from a small finite set
//     (randomuser.me / pravatar.cc) — these naturally OVERLAP between users,
//     just like people reusing common stock images;
//   * the remainder get a unique illustrated avatar (DiceBear/RoboHash) seeded
//     by their id.
// All sources are free, no key, direct image URLs. Real users who upload their
// own picture keep it; this library is the avatar source for bot players.
import data from "@/lib/avatars.json";

type PeopleSet = { url: string; from: number; count: number };
const PEOPLE = data.people as PeopleSet[];
const ILLUSTRATED = data.illustrated as string[];

// Back-compat export (the illustrated style URLs).
export const AVATAR_TEMPLATES: readonly string[] = ILLUSTRATED;

// Random, human-like avatar for a user. Returns null when the user should have
// no image. A real-person photo is drawn from a finite set (so photos repeat
// across users); an illustrated avatar is seeded by the unique id (so it does
// not).
export function avatarUrl(seed: string): string | null {
  if (Math.random() < (data.noAvatarChance ?? 0)) return null;
  if (Math.random() < (data.peopleShare ?? 0)) {
    const p = PEOPLE[Math.floor(Math.random() * PEOPLE.length)];
    const n = (p.from ?? 0) + Math.floor(Math.random() * p.count);
    return p.url.replace("{n}", String(n));
  }
  const tpl = ILLUSTRATED[Math.floor(Math.random() * ILLUSTRATED.length)];
  return tpl.replace("{seed}", encodeURIComponent(seed || "anon"));
}
