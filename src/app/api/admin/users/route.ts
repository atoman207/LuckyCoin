import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Build a map of auth-user id -> { last_sign_in_at, auth_created_at } so the
// admin can see real login dates (these live in auth.users, not profiles).
async function authDatesMap() {
  const admin = createAdminClient();
  const map = new Map<string, { last_sign_in_at: string | null; auth_created_at: string | null }>();
  for (let page = 1; page <= 40; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 50 });
    if (error) break;
    for (const u of data.users) {
      map.set(u.id, {
        last_sign_in_at: u.last_sign_in_at ?? null,
        auth_created_at: u.created_at ?? null,
      });
    }
    if (data.users.length < 50) break;
  }
  return map;
}

// ---- READ: list every user with balances + login dates --------------------
export async function GET() {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Admins only." }, { status: 403 });

  const { data, error } = await ctx.admin
    .from("profiles")
    .select("id, nickname, email, nationality, discord_id, avatar_url, gold, silver, bronze, is_admin, kind, streak, last_bonus_at, created_at")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const dates = await authDatesMap();

  // Per-player draw tally (consolidated view of daily prize-wheel spins).
  const drawCount = new Map<string, number>();
  const { data: draws } = await ctx.admin.from("draws").select("user_id");
  for (const d of draws ?? []) drawCount.set(d.user_id, (drawCount.get(d.user_id) ?? 0) + 1);

  const users = (data ?? []).map((u) => ({
    ...u,
    last_sign_in_at: dates.get(u.id)?.last_sign_in_at ?? null,
    draws: drawCount.get(u.id) ?? 0,
  }));

  return NextResponse.json({ users });
}

// ---- CREATE: admin makes a new account ------------------------------------
export async function POST(req: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Admins only." }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const nickname = (b.nickname ?? "").trim();
  const email = (b.email ?? "").trim().toLowerCase();
  const password = b.password ?? "";

  if (!nickname || !email || !password) {
    return NextResponse.json({ error: "Nickname, email and password are required." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }

  const { data: created, error: createErr } = await ctx.admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nickname },
  });
  if (createErr || !created.user) {
    return NextResponse.json({ error: createErr?.message ?? "Could not create user." }, { status: 400 });
  }

  const { error: profErr } = await ctx.admin.from("profiles").insert({
    id: created.user.id,
    nickname,
    email,
    nationality: (b.nationality ?? "").trim() || null,
    discord_id: (b.discord_id ?? "").trim() || null,
    gold: Math.max(0, Math.floor(Number(b.gold) || 0)),
    silver: Math.max(0, Math.floor(Number(b.silver) || 0)),
    bronze: Math.max(0, Math.floor(Number(b.bronze) || 0)),
    is_admin: !!b.is_admin,
    kind: "bot", // created by the administrator
  });
  if (profErr) {
    await ctx.admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: profErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id: created.user.id });
}

// ---- UPDATE: edit any user's info / coins / role / password ---------------
export async function PATCH(req: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Admins only." }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const id = b.id;
  if (typeof id !== "string") {
    return NextResponse.json({ error: "Missing user id." }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof b.nickname === "string") patch.nickname = b.nickname.trim();
  if (typeof b.nationality === "string") patch.nationality = b.nationality.trim() || null;
  if (typeof b.discord_id === "string") patch.discord_id = b.discord_id.trim() || null;
  if (b.gold !== undefined) patch.gold = Math.max(0, Math.floor(Number(b.gold) || 0));
  if (b.silver !== undefined) patch.silver = Math.max(0, Math.floor(Number(b.silver) || 0));
  if (b.bronze !== undefined) patch.bronze = Math.max(0, Math.floor(Number(b.bronze) || 0));
  if (b.is_admin !== undefined) patch.is_admin = !!b.is_admin;

  // Email / password live in auth.users — update there if provided.
  const authUpdate: { email?: string; password?: string } = {};
  if (typeof b.email === "string" && b.email.trim()) authUpdate.email = b.email.trim().toLowerCase();
  if (typeof b.password === "string" && b.password.length >= 6) authUpdate.password = b.password;

  if (Object.keys(authUpdate).length > 0) {
    const { error: authErr } = await ctx.admin.auth.admin.updateUserById(id, {
      ...authUpdate,
      email_confirm: true,
    });
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 });
    if (authUpdate.email) patch.email = authUpdate.email;
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await ctx.admin.from("profiles").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// ---- DELETE: remove a user (auth + profile cascade) -----------------------
export async function DELETE(req: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Admins only." }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing user id." }, { status: 400 });
  if (id === ctx.profile.id) {
    return NextResponse.json({ error: "You can't delete your own account here." }, { status: 400 });
  }

  // Deleting the auth user cascades to the profile (FK on delete cascade).
  const { error } = await ctx.admin.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
