import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { START_SILVER, START_BRONZE, SIGNUP_REWARD_BRONZE } from "@/lib/coins";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const nickname = (body.nickname ?? "").trim();
    const email = (body.email ?? "").trim().toLowerCase();
    const password = body.password ?? "";
    const nationality = (body.nationality ?? "").trim() || null;
    const discord_id = (body.discord_id ?? "").trim() || null;

    if (!nickname || !email || !password) {
      return NextResponse.json(
        { error: "Nickname, email and password are required." },
        { status: 400 }
      );
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters." },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Create the auth user with email pre-confirmed so they can log in at once.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nickname },
    });

    if (createErr || !created.user) {
      const msg = createErr?.message ?? "Could not create account.";
      const already = /registered|already/i.test(msg);
      return NextResponse.json(
        { error: already ? "That email is already registered." : msg },
        { status: 400 }
      );
    }

    // Create the profile with the starting balance + signup reward.
    const { error: profileErr } = await admin.from("profiles").insert({
      id: created.user.id,
      nickname,
      email,
      nationality,
      discord_id,
      gold: 0,
      silver: START_SILVER,
      bronze: START_BRONZE + SIGNUP_REWARD_BRONZE,
    });

    if (profileErr) {
      // Roll back the auth user so the email can be reused.
      await admin.auth.admin.deleteUser(created.user.id);
      return NextResponse.json(
        { error: "Could not create profile: " + profileErr.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unexpected error." },
      { status: 500 }
    );
  }
}
