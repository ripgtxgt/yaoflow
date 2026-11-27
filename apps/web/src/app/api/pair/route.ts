import { NextRequest, NextResponse } from "next/server";
import { asLocale } from "@/lib/locales";
import { customerFromRequest } from "@/lib/auth";
import { canInvite, mintPair, pairInfo, pairLink, pairPagePath, pairStatus } from "@/lib/pairs";
import { pairBySession } from "@/lib/db";
import { TOKEN_RE } from "@/lib/grants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SID_RE = /^(cs_|pi_|sub_|gf_|gr_|rw_)[a-zA-Z0-9_-]+$/;

/**
 * GET ?token=  — what an invitee may know before casting (framing, tier, state).
 * GET ?sid=    — the inviter's own invite for this reading, if any.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const sid = req.nextUrl.searchParams.get("sid") ?? "";
  if (token) {
    if (!TOKEN_RE.test(token)) return NextResponse.json({ error: "bad_token" }, { status: 400 });
    const info = pairInfo(token);
    if (!info) return NextResponse.json({ error: "unknown_token" }, { status: 404 });
    return NextResponse.json(info, { headers: { "Cache-Control": "no-store" } });
  }
  if (SID_RE.test(sid)) {
    const p = pairBySession(sid);
    if (!p || p.a_session_id !== sid) return NextResponse.json({ pair: null }, { headers: { "Cache-Control": "no-store" } });
    const locale = asLocale(p.a_locale);
    const site = (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
    return NextResponse.json(
      { pair: { status: pairStatus(p), framing: p.framing, url: pairLink(site, locale, p), expiresAt: p.expires_at, page: pairPagePath(locale, p.token, sid) } },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json({ error: "bad_request" }, { status: 400 });
}

/** POST { sid, framing, locale } — mint (or return) the invite for a reading. Possession of the reading link is the credential. */
export async function POST(req: NextRequest) {
  let body: { sid?: unknown; framing?: unknown; locale?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const sid = typeof body.sid === "string" ? body.sid : "";
  if (!SID_RE.test(sid)) return NextResponse.json({ error: "bad_session" }, { status: 400 });
  const stored = canInvite(sid);
  if (!stored) return NextResponse.json({ error: "not_eligible" }, { status: 403 });
  const locale = asLocale(body.locale);
  const me = customerFromRequest(req);
  const p = mintPair(sid, typeof body.framing === "string" ? body.framing : "", locale, me?.customerId ?? null);
  if (!p) return NextResponse.json({ error: "not_eligible" }, { status: 403 });
  const site = (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  return NextResponse.json({ status: pairStatus(p), framing: p.framing, url: pairLink(site, asLocale(p.a_locale), p), expiresAt: p.expires_at, page: pairPagePath(asLocale(p.a_locale), p.token, sid) });
}
