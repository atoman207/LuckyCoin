import { NextResponse } from "next/server";
import { writeFile, unlink, readdir } from "fs/promises";
import path from "path";
import { requireProfile } from "@/lib/auth";

export const runtime = "nodejs"; // needs the filesystem

const AVATAR_DIR = path.join(process.cwd(), "public", "avatars");
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

// Upload an avatar. The image file is written into the project
// (public/avatars/<userId>.<ext>) and only its URL is saved to the database.
export async function POST(req: Request) {
  const ctx = await requireProfile();
  if (!ctx) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("avatar");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }

  const ext = EXT[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: "Unsupported image type. Use PNG, JPG, WEBP or GIF." },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image must be 2 MB or smaller." }, { status: 400 });
  }

  const id = ctx.profile.id;
  const filename = `${id}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  try {
    // Remove any previous avatar for this user (possibly a different extension).
    try {
      const existing = await readdir(AVATAR_DIR);
      await Promise.all(
        existing
          .filter((f) => f.startsWith(`${id}.`))
          .map((f) => unlink(path.join(AVATAR_DIR, f)).catch(() => {}))
      );
    } catch {
      // directory may not exist yet — writeFile below will fail clearly if so
    }

    await writeFile(path.join(AVATAR_DIR, filename), bytes);
  } catch (e) {
    return NextResponse.json(
      { error: "Could not save the image on the server." },
      { status: 500 }
    );
  }

  // Cache-busting query so the browser picks up the new image immediately.
  const url = `/avatars/${filename}?v=${Date.now()}`;

  const { data, error } = await ctx.admin
    .from("profiles")
    .update({ avatar_url: url })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile: data, avatar_url: url });
}
