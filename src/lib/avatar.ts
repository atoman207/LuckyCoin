import { writeFile, unlink, readdir, mkdir } from "fs/promises";
import path from "path";

// Saves an uploaded avatar into the project (public/avatars/<userId>.<ext>) and
// returns its public URL. Used by registration and the profile avatar route.
const AVATAR_DIR = path.join(process.cwd(), "public", "avatars");
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function saveAvatarFile(userId: string, file: File): Promise<string> {
  const ext = EXT[file.type];
  if (!ext) throw new Error("Unsupported image type. Use PNG, JPG, WEBP or GIF.");
  if (file.size > MAX_BYTES) throw new Error("Image must be 2 MB or smaller.");

  await mkdir(AVATAR_DIR, { recursive: true });

  // Remove any previous avatar for this user (possibly a different extension).
  try {
    const existing = await readdir(AVATAR_DIR);
    await Promise.all(
      existing
        .filter((f) => f.startsWith(`${userId}.`))
        .map((f) => unlink(path.join(AVATAR_DIR, f)).catch(() => {}))
    );
  } catch {
    /* directory may not exist yet — mkdir above handles it */
  }

  const filename = `${userId}.${ext}`;
  await writeFile(path.join(AVATAR_DIR, filename), Buffer.from(await file.arrayBuffer()));
  return `/avatars/${filename}?v=${Date.now()}`; // cache-bust
}
