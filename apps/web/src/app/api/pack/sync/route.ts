import { NextRequest, NextResponse } from "next/server";
import { customerFromRequest } from "@/lib/auth";
import { getCheckoutSession } from "@/lib/stripe";
import { fulfilPack, notifyPackBought } from "@/lib/pack";

export const runtime = "nodejs";

/** 09-29 会员增购包: back from Checkout with ?pack=cs_… — add the readings now, no waiting on the cron. */
export async function POST(req: NextRequest) {
  const c = customerFromRequest(req);
  if (!c) return NextResponse.json({ error: "login_required" }, { status: 401 });
  let body: { session?: unknown };
  try { body = (await req.json()) as typeof body; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const sid = typeof body.session === "string" ? body.session : "";
  if (!/^cs_[a-zA-Z0-9_]+$/.test(sid)) return NextResponse.json({ error: "bad_session" }, { status: 400 });
  try {
    const r = fulfilPack(await getCheckoutSession(sid));
    if (!r.ok) return NextResponse.json({ error: r.why }, { status: 400 });
    await notifyPackBought(r.row).catch(() => false);
    return NextResponse.json({ ok: true, units: r.row.units, mine: r.row.customer_id === c.customerId });
  } catch (e) {
    return NextResponse.json({ error: "sync_failed", detail: e instanceof Error ? e.message : "unknown" }, { status: 502 });
  }
}
