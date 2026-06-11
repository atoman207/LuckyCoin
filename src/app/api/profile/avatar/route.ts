import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { saveAvatarFile } from "@/lib/avatar";

export const runtime = "nodejs";

// Upload an avatar. The image is stored in Supabase Storage and only its public
// URL is saved to the profiles table.
export async function POST(req: Request) {
  const ctx = await requireProfile();
  if (!ctx) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("avatar");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }

  const id = ctx.profile.id;

  let url: string;
  try {
    url = await saveAvatarFile(ctx.admin, id, file);
  } catch (e) {
    // Validation errors (type/size) carry a user-facing message; anything else
    // is treated as a storage failure.
    const msg = e instanceof Error ? e.message : "";
    const isValidation = /Unsupported image type|2 MB/.test(msg);
    return NextResponse.json(
      { error: isValidation ? msg : "Could not save the image on the server." },
      { status: isValidation ? 400 : 500 }
    );
  }

  const { data, error } = await ctx.admin
    .from("profiles")
    .update({ avatar_url: url })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ profile: data, avatar_url: url });
}
