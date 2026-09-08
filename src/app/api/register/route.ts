import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { saveAvatarFile } from "@/lib/avatar";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const t = await getT();
  try {
    // Sent as multipart form-data so the avatar can be uploaded at sign-up.
    const form = await req.formData();
    const nickname = String(form.get("nickname") ?? "").trim();
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    const nationality = String(form.get("nationality") ?? "").trim() || null;
    const discord_id = String(form.get("discord_id") ?? "").trim() || null;
    const avatar = form.get("avatar");

    if (!nickname || !email || !password) {
      return NextResponse.json(
        { error: t("api.admin.userFields") },
        { status: 400 }
      );
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: t("api.register.passwordShort") },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Create the auth user with email pre-confirmed so the magic link can log
    // them in. (First-login verification is handled by the app-level flag.)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nickname },
    });

    if (createErr || !created.user) {
      const msg = createErr?.message ?? "";
      const already = /registered|already/i.test(msg);
      if (!already) console.error("[register] createUser failed:", createErr);
      return NextResponse.json(
        { error: already ? t("api.register.emailTaken") : t("api.register.createFailed") },
        { status: 400 }
      );
    }

    // Save the avatar (if provided) before inserting the profile.
    let avatar_url: string | null = null;
    if (avatar instanceof File && avatar.size > 0) {
      try {
        avatar_url = await saveAvatarFile(admin, created.user.id, avatar);
      } catch {
        /* invalid/oversized image — proceed without an avatar */
      }
    }

    // New accounts start with ZERO coins. The sign-up + day-1 daily bonus is
    // granted later when the user clicks "Claim Rewards" (/api/claim).
    const { error: profileErr } = await admin.from("profiles").insert({
      id: created.user.id,
      nickname,
      email,
      nationality,
      discord_id,
      avatar_url,
      gold: 0,
      silver: 0,
      bronze: 0,
      streak: 0,
      rewards_claimed: false,
      first_login_done: false, // first login is confirmed via an email magic link
      kind: "real", // self-service signup
    });

    if (profileErr) {
      // Roll back the auth user so the email can be reused.
      await admin.auth.admin.deleteUser(created.user.id);
      return NextResponse.json(
        { error: t("api.register.profileFailed", { detail: profileErr.message }) },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[register] unexpected error:", e);
    return NextResponse.json({ error: t("api.unexpected") }, { status: 500 });
  }
}
