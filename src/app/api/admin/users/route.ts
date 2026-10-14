import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getT } from "@/lib/i18n/server";

export const runtime = "nodejs";
// The admin list must never be served from a cache — a brand-new signup has to
// show up on the very next load.
export const dynamic = "force-dynamic";

type AuthUser = {
  id: string;
  email: string | null;
  nickname: string | null;
  last_sign_in_at: string | null;
  auth_created_at: string | null;
};

// Every account in auth.users, which is the real source of truth for "who
// registered". profiles rows can be missing (see reconcile below), auth rows
// cannot.
async function listAuthUsers(): Promise<AuthUser[]> {
  const admin = createAdminClient();
  const users: AuthUser[] = [];
  const PER_PAGE = 200;
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) {
      console.error("[admin/users] listUsers failed:", error);
      break;
    }
    for (const u of data.users) {
      const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
      const nickname = (meta.nickname || meta.full_name || meta.name || meta.user_name || null) as
        | string
        | null;
      users.push({
        id: u.id,
        email: u.email ?? null,
        nickname,
        last_sign_in_at: u.last_sign_in_at ?? null,
        auth_created_at: u.created_at ?? null,
      });
    }
    if (data.users.length < PER_PAGE) break;
  }
  return users;
}

const PROFILE_COLUMNS =
  "id, nickname, email, nationality, discord_id, chatwork_id, phone, avatar_url, gold, silver, bronze, is_admin, kind, streak, last_bonus_at, created_at";

// ---- READ: list every user with balances + login dates --------------------
export async function GET() {
  const t = await getT();
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: t("api.admin.only") }, { status: 403 });

  const { data, error } = await ctx.admin
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .order("created_at", { ascending: false }); // newest signups first

  if (error) {
    console.error("[admin/users] profiles select failed:", error);
    return NextResponse.json({ error: t("api.serverError") }, { status: 500 });
  }

  const profiles = data ?? [];
  const authUsers = await listAuthUsers();

  // ---- Reconcile auth.users against profiles ------------------------------
  // A registered account with no profiles row (e.g. a social sign-in whose
  // profile insert failed) used to be invisible here. Create the missing row
  // so the account shows up, and list it either way.
  const known = new Set(profiles.map((p) => p.id));
  const orphans = authUsers.filter((u) => !known.has(u.id));

  if (orphans.length > 0) {
    const rows = orphans.map((u) => ({
      id: u.id,
      nickname: u.nickname?.trim() || u.email?.split("@")[0] || "Player",
      email: (u.email || `${u.id}@social.luckycoin`).toLowerCase(),
      gold: 0,
      silver: 0,
      bronze: 0,
      streak: 0,
      rewards_claimed: false,
      // They already authenticated at least once, so don't re-gate the login.
      first_login_done: !!u.last_sign_in_at,
      kind: "real",
      ...(u.auth_created_at ? { created_at: u.auth_created_at } : {}),
    }));

    const { data: healed, error: healErr } = await ctx.admin
      .from("profiles")
      .upsert(rows, { onConflict: "id" })
      .select(PROFILE_COLUMNS);

    if (healErr) {
      console.error("[admin/users] could not backfill missing profiles:", healErr);
      // Still surface the accounts, so a failed backfill can't hide a signup.
      for (const r of rows) {
        profiles.push({
          ...r,
          nationality: null,
          discord_id: null,
          chatwork_id: null,
          phone: null,
          avatar_url: null,
          is_admin: false,
          last_bonus_at: null,
          created_at: r.created_at ?? new Date().toISOString(),
        } as (typeof profiles)[number]);
      }
    } else {
      profiles.push(...((healed ?? []) as typeof profiles));
    }
  }

  // Per-player draw tally (consolidated view of daily prize-wheel spins).
  const drawCount = new Map<string, number>();
  const { data: draws } = await ctx.admin.from("draws").select("user_id");
  for (const d of draws ?? []) drawCount.set(d.user_id, (drawCount.get(d.user_id) ?? 0) + 1);

  const dates = new Map(authUsers.map((u) => [u.id, u]));

  const users = profiles
    .map((u) => ({
      ...u,
      last_sign_in_at: dates.get(u.id)?.last_sign_in_at ?? null,
      draws: drawCount.get(u.id) ?? 0,
    }))
    .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());

  return NextResponse.json({ users });
}

// ---- CREATE: admin makes a new account ------------------------------------
export async function POST(req: Request) {
  const t = await getT();
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: t("api.admin.only") }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const nickname = (b.nickname ?? "").trim();
  const email = (b.email ?? "").trim().toLowerCase();
  const password = b.password ?? "";

  if (!nickname || !email || !password) {
    return NextResponse.json({ error: t("api.admin.userFields") }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: t("api.admin.passwordShort") }, { status: 400 });
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
    chatwork_id: (b.chatwork_id ?? "").trim() || null,
    phone: (b.phone ?? "").trim() || null,
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
  const t = await getT();
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: t("api.admin.only") }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const id = b.id;
  if (typeof id !== "string") {
    return NextResponse.json({ error: t("api.admin.missingUserId") }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof b.nickname === "string") patch.nickname = b.nickname.trim();
  if (typeof b.chatwork_id === "string") patch.chatwork_id = b.chatwork_id.trim() || null;
  if (typeof b.phone === "string") patch.phone = b.phone.trim() || null;
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
    if (error) return NextResponse.json({ error: t("api.serverError") }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// ---- DELETE: remove one or more users (auth + profile cascade) ------------
export async function DELETE(req: Request) {
  const t = await getT();
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: t("api.admin.only") }, { status: 403 });

  const url = new URL(req.url);
  const ids = new Set<string>();
  const one = url.searchParams.get("id");
  if (one) ids.add(one);
  const many = url.searchParams.get("ids");
  if (many) {
    for (const part of many.split(",")) {
      const id = part.trim();
      if (id) ids.add(id);
    }
  }
  const body = await req.json().catch(() => null);
  if (body && Array.isArray(body.ids)) {
    for (const value of body.ids) {
      if (typeof value === "string" && value.trim()) ids.add(value.trim());
    }
  }

  if (ids.size === 0) {
    return NextResponse.json({ error: t("api.admin.missingUserId") }, { status: 400 });
  }

  const targets = [...ids].filter((id) => id !== ctx.profile.id);
  if (targets.length === 0) {
    return NextResponse.json({ error: t("api.admin.cannotDeleteSelf") }, { status: 400 });
  }

  let deleted = 0;
  let failed = 0;
  for (const id of targets) {
    const { error } = await ctx.admin.auth.admin.deleteUser(id);
    if (error) {
      console.error("[admin/users] deleteUser failed:", id, error);
      failed += 1;
    } else {
      deleted += 1;
    }
  }

  if (deleted === 0) {
    return NextResponse.json({ error: t("api.serverError") }, { status: 500 });
  }
  if (failed > 0) {
    return NextResponse.json({
      ok: false,
      deleted,
      failed,
      error: t("api.admin.deletePartial", { deleted, failed }),
    });
  }
  return NextResponse.json({ ok: true, deleted });
}
