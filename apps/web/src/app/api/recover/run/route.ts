import { NextRequest, NextResponse } from "next/server";
import { runRecoverOffers, sweepOfferPayments } from "@/lib/recover-offer";

export const runtime = "nodejs";

/** 10-15 挽回信改版: every minute (server cron) — the letters now due, and offers whose checkout was paid. */
export async function POST(req: NextRequest) {
  const key = req.headers.get("x-cron-key");
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const r = await runRecoverOffers();
  const paid = await sweepOfferPayments().catch(() => 0);
  return NextResponse.json({ ...r, paid });
}
