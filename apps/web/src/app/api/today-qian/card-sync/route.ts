import { NextRequest, NextResponse } from "next/server";
import { customerFromRequest } from "@/lib/auth";
import { getCheckoutSession } from "@/lib/stripe";
import { fulfilCard } from "@/lib/today-qian";

export const runtime = "nodejs";

/** 10-14 进度表 50: back from Checkout with ?card=cs_… — record the card now, no waiting on the cron. */
export async function POST(req: NextRequest) {
  const c = customerFromRequest(req);
  if (!c) return NextResponse.json({ error: "login_required" }, { status: 401 });
  let body: { session?: unknown } = {};
  try { body = (await req.json()) as typeof body; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const sid = typeof body.session === "string" ? body.session : "";
  if (!/^cs_[a-zA-Z0-9_]+$/.test(sid)) return NextResponse.json({ error: "bad_session" }, { status: 400 });
  try {
    const r = fulfilCard(await getCheckoutSession(sid));
    if (!r.ok) return NextResponse.json({ error: r.why }, { status: 400 });
    return NextResponse.json({ ok: true, endsAt: r.row.ends_at });
  } catch (e) {
    return NextResponse.json({ error: "sync_failed", detail: e instanceof Error ? e.message.slice(0, 120) : "?" }, { status: 502 });
  }
}
