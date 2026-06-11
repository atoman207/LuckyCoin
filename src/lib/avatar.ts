import type { SupabaseClient } from "@supabase/supabase-js";

// Saves an uploaded avatar to Supabase Storage (bucket "avatar", object
// "<userId>.<ext>") and returns its public URL. Used by registration and the
// profile avatar route. Storage is used instead of the local filesystem so it
// works on read-only serverless hosts (Vercel).
const BUCKET = "avatar";
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

// Make sure the bucket exists and is public so the saved URLs are servable.
// createBucket errors if it already exists (fine, ignored); updateBucket then
// enforces public on the pre-existing bucket.
let bucketEnsured = false;
async function ensureBucket(admin: SupabaseClient) {
  if (bucketEnsured) return;
  await admin.storage
    .createBucket(BUCKET, { public: true, fileSizeLimit: MAX_BYTES })
    .catch(() => {});
  await admin.storage.updateBucket(BUCKET, { public: true }).catch(() => {});
  bucketEnsured = true;
}

export async function saveAvatarFile(
  admin: SupabaseClient,
  userId: string,
  file: File
): Promise<string> {
  const ext = EXT[file.type];
  if (!ext) throw new Error("Unsupported image type. Use PNG, JPG, WEBP or GIF.");
  if (file.size > MAX_BYTES) throw new Error("Image must be 2 MB or smaller.");

  await ensureBucket(admin);

  const filename = `${userId}.${ext}`;

  // Remove any previous avatar stored under a different extension so we don't
  // leave an orphan (same-extension uploads are overwritten by upsert below).
  const stale = Object.values(EXT)
    .filter((e) => e !== ext)
    .map((e) => `${userId}.${e}`);
  if (stale.length) await admin.storage.from(BUCKET).remove(stale).catch(() => {});

  const bytes = Buffer.from(await file.arrayBuffer());
  const { error } = await admin.storage.from(BUCKET).upload(filename, bytes, {
    contentType: file.type,
    upsert: true,
  });
  if (error) throw new Error(error.message);

  const { data } = admin.storage.from(BUCKET).getPublicUrl(filename);
  return `${data.publicUrl}?v=${Date.now()}`; // cache-bust so the new image shows immediately
}
