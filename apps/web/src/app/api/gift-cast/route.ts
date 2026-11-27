import { NextRequest, NextResponse } from "next/server";
import { asLocale } from "@/lib/locales";
import { customerFromRequest } from "@/lib/auth";
import { canMintGift, giftLink, mintGiftCast, mintPoolGift } from "@/lib/grants";
import { giftCastForSession, orderBySession, setGiftNote } from "@/lib/db";
import { cleanGiftNote } from "@/lib/dict/member-gift";
import { giftPoolFor } from "@/lib/membership";
import { deviceFor, keepDevice } from "@/lib/device";

export const runtime = "nodejs";

/**
 * 送一卦. Two ways to make one:
 *
 *   { sid }         from a reading. A single-purchase deep reading carries its
 *                   own gift (possession of the reading link is the receipt).
 *                   A member's reading (sub_…) draws on the member's monthly
 *                   pool instead (09-24, M3). Idempotent per reading.
 *   { pool: true }  from the account page — a signed-in member, no reading.
 *
 * Answers with the link and, for members, what is left in the pool.
 */
export async function POST(req: NextRequest) {
  let body: { sid?: unknown; locale?: unknown; pool?: unknown; note?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const locale = asLocale(body.locale);
  const site = (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  const me = customerFromRequest(req);
  // 09-27 赠送审核 B: every gift remembers the browser it was made in
  const dev = deviceFor(req);
  // 09-29 会员裂变 ④: an optional line for the friend, kept on the gift until it is spent
  const note = cleanGiftNote(body.note);
  const withNote = (token: string, used: boolean) => { if (note && !used) setGiftNote(token, note); };

  if (body.pool === true) {
    if (!me) return NextResponse.json({ error: "login_required" }, { status: 401 });
    const pool = giftPoolFor(me.customerId);
    if (!pool) return NextResponse.json({ error: "not_member" }, { status: 403 });
    if (pool.available <= 0) return NextResponse.json({ error: "pool_empty", left: 0 }, { status: 403 });
    const g = mintPoolGift(me.customerId, pool.sub.id, locale, null, dev.id);
    withNote(g.token, false);
    return keepDevice(NextResponse.json({ url: giftLink(site, locale, g.token), expiresAt: g.expires_at, used: false, left: pool.available - 1 }), dev);
  }

  const sid = typeof body.sid === "string" ? body.sid : "";
  if (!/^(cs_|pi_|sub_)[a-zA-Z0-9_]+$/.test(sid)) return NextResponse.json({ error: "bad_session" }, { status: 400 });
  if (!canMintGift(sid)) return NextResponse.json({ error: "not_eligible" }, { status: 403 });
  const order = orderBySession(sid);

  if (sid.startsWith("sub_")) {
    const owner = order?.customer_id ?? me?.customerId ?? null;
    const existing = giftCastForSession(sid);
    const pool = owner ? giftPoolFor(owner) : null;
    if (existing) { withNote(existing.token, !!existing.used_at); return NextResponse.json({ url: giftLink(site, locale, existing.token), expiresAt: existing.expires_at, used: !!existing.used_at, left: pool?.available ?? null }); }
    if (!owner || !pool) return NextResponse.json({ error: "not_member" }, { status: 403 });
    if (pool.available <= 0) return NextResponse.json({ error: "pool_empty", left: 0 }, { status: 403 });
    const g = mintPoolGift(owner, pool.sub.id, locale, sid, dev.id);
    withNote(g.token, false);
    return keepDevice(NextResponse.json({ url: giftLink(site, locale, g.token), expiresAt: g.expires_at, used: false, left: pool.available - 1 }), dev);
  }

  const g = mintGiftCast(sid, locale, me?.customerId ?? order?.customer_id ?? null, order?.via ?? null, dev.id);
  withNote(g.token, !!g.used_at);
  return keepDevice(NextResponse.json({ url: giftLink(site, locale, g.token), expiresAt: g.expires_at, used: !!g.used_at }), dev);
}
