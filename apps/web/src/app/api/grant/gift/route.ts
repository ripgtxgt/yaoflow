import { NextRequest, NextResponse } from "next/server";
import { sameDevice, TOKEN_RE } from "@/lib/grants";
import { giftNoteFor, grantByToken } from "@/lib/db";
import { deviceOf } from "@/lib/device";
import { customerFromRequest } from "@/lib/auth";
import { isReviewGrant } from "@/lib/review-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 09-29 会员裂变 ④: the line the giver wrote, shown to the friend who opened the
 * gift. Nothing else about the giver or their reading ever leaves here.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (!TOKEN_RE.test(token)) return NextResponse.json({ error: "bad_token" }, { status: 400 });
  // 10-16: an old link opened again — already spent or past its date — is said so up front. 156 errors in 12 sessions
  // (one reader tapped 深斷 66 times) were readers back on a spent gift link: every tap hit 409 and showed 「出錯了」.
  // The browser that spent it also gets the way back to its reading.
  const g = grantByToken(token);
  const state = !g || g.kind !== "gift_cast" ? "unknown" : g.used_at ? "used" : g.expires_at < Date.now() ? "expired" : "open";
  const dev = deviceOf(req);
  const mine = state === "used" && !!dev && g?.claim_device === dev ? g?.redeem_session_id ?? null : null;
  // 10-22 (客服 #1928): the page now remembers an open gift for this browser's later casts — not the giver's own
  // (their account, or the browser that made it / got the reading it was made from), which the redeem would refuse
  let own = false;
  if (state === "open" && g) {
    let cid: number | null = null;
    try { cid = customerFromRequest(req)?.customerId ?? null; } catch { cid = null; }
    own = (!!cid && !!g.from_customer_id && cid === g.from_customer_id) || sameDevice(g, dev);
  }
  // 10-16 进度表 52: a review site's trial link says so, instead of 「朋友送了你一次深斷」
  return NextResponse.json({ note: giftNoteFor(token), review: isReviewGrant(token), state, ...(mine ? { sid: mine } : {}), ...(own ? { own: true } : {}) }, { headers: { "Cache-Control": "no-store" } });
}
