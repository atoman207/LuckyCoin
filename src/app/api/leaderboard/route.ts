import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUser } from "@/lib/supabase/server";
import { compareRank } from "@/lib/ranking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // always live — the notice page polls this

const TOP_N = 50;

type Row = { id: string; nickname: string; avatar_url: string | null; gold: number; silver: number; bronze: number };
type Ranked = Row & { rank: number };

const sameCoins = (a: Row, b: Row) =>
  a.gold === b.gold && a.silver === b.silver && a.bronze === b.bronze;

// Public leaderboard: total participants, the top 50, and — when logged in —
// the caller's own current rank. Players are ordered by gold, then silver,
// then bronze (see src/lib/ranking.ts). The notice page polls this every few
// seconds, so rankings track the database in near real time.
export async function GET() {
  const admin = createAdminClient();

  // Pull every non-admin player (paged). Only the columns we rank on.
  const all: Row[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("profiles")
      .select("id, nickname, avatar_url, gold, silver, bronze")
      .eq("is_admin", false)
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    all.push(...((data ?? []) as Row[]));
    if (!data || data.length < PAGE) break;
  }

  // Sort best-first, then assign standard competition ranks (ties share a rank).
  all.sort(compareRank);
  const ranked: Ranked[] = [];
  let prevRank = 0;
  all.forEach((p, i) => {
    const rank = i > 0 && sameCoins(all[i - 1], p) ? prevRank : i + 1;
    ranked.push({ ...p, rank });
    prevRank = rank;
  });

  const top = ranked.slice(0, TOP_N);

  // The caller's own standing (null if logged out or an admin, who aren't ranked).
  let you: Ranked | null = null;
  const user = await getUser();
  if (user) you = ranked.find((p) => p.id === user.id) ?? null;

  return NextResponse.json({ total: ranked.length, top, you });
}
