// Resource library: user avatar images.
//
// Avatars come from a POOL of free, no-key, deterministic image services
// (DiceBear SVG across ~18 styles + RoboHash) defined in ./avatars.json. Each
// user is mapped to one template by hashing their unique id, then their id is
// used as the seed. The result:
//   * unique  — a unique id seed yields a unique image (no duplicates);
//   * varied  — users are spread across many styles/providers;
//   * robust  — spreading across endpoints avoids the rate-limit that breaks a
//               leaderboard loading 50 avatars from a single endpoint at once.
// Real users who upload their own picture keep it; this is the avatar source
// for bot-generated players.
import data from "@/lib/avatars.json";

export const AVATAR_TEMPLATES: readonly string[] = data.templates;

// Avatar URL with a RANDOMLY-chosen style/provider from the pool, seeded by the
// given unique value (the user's id) so the image itself stays unique. Random
// selection keeps the styles well mixed across users; the unique seed prevents
// any two users sharing the same image.
export function avatarUrl(seed: string): string {
  const s = seed || "anon";
  const tpl = AVATAR_TEMPLATES[Math.floor(Math.random() * AVATAR_TEMPLATES.length)];
  return tpl.replace("{seed}", encodeURIComponent(s));
}
