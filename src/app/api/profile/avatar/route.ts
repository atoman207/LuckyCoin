import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth";
import { saveAvatarFile } from "@/lib/avatar";
import { getT } from "@/lib/i18n/server";
import { isMessageKey } from "@/lib/i18n";

export const runtime = "nodejs";

// Upload an avatar. The image is stored in Supabase Storage and only its public
// URL is saved to the profiles table.
export async function POST(req: Request) {
  const t = await getT();
  const ctx = await requireProfile();
  if (!ctx) return NextResponse.json({ error: t("api.notAuthenticated") }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("avatar");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: t("api.profile.noFile") }, { status: 400 });
  }

  const id = ctx.profile.id;

  let url: string;
  try {
    url = await saveAvatarFile(ctx.admin, id, file);
  } catch (e) {
    // Validation errors (type/size) throw a MESSAGE KEY; anything else is
    // treated as a storage failure.
    const msg = e instanceof Error ? e.message : "";
    const isValidation = isMessageKey(msg) && msg.startsWith("avatar.");
    return NextResponse.json(
      { error: isValidation ? t(msg) : t("api.profile.imageSaveFailed") },
      { status: isValidation ? 400 : 500 }
    );
  }

  const { data, error } = await ctx.admin
    .from("profiles")
    .update({ avatar_url: url })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: t("api.serverError") }, { status: 500 });
  return NextResponse.json({ profile: data, avatar_url: url });
}
