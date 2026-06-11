import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

// All gold sell-back requests with the seller, payout amount, chosen crypto and
// wallet address, so the team can fulfil them.
export async function GET() {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Admins only." }, { status: 403 });

  const { data, error } = await ctx.admin
    .from("sells")
    .select(
      "id, gold, usdt_amount, method_id, payout_address, status, created_at, profiles ( nickname, email )"
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sells: data });
}

// Mark a sell request as paid (or back to requested) once the payout is sent.
export async function PATCH(req: Request) {
  const ctx = await requireAdmin();
  if (!ctx) return NextResponse.json({ error: "Admins only." }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : null;
  const status = body.status === "paid" ? "paid" : body.status === "requested" ? "requested" : null;
  if (!id || !status) {
    return NextResponse.json({ error: "id and a valid status are required." }, { status: 400 });
  }

  const { data, error } = await ctx.admin
    .from("sells")
    .update({ status })
    .eq("id", id)
    .select("id, status")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, sell: data });
}
