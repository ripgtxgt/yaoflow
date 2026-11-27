import { NextResponse } from "next/server";
import { publishableKey } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 09-26 钱包直付: the publishable key (public by design), or null while it is not configured — the page then keeps the redirect. */
export function GET() {
  return NextResponse.json({ pk: publishableKey() }, { headers: { "Cache-Control": "no-store" } });
}
