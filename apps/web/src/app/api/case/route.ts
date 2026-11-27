import { NextRequest, NextResponse } from "next/server";
import { customerFromRequest } from "@/lib/auth";
import { asLocale } from "@/lib/locales";
import { casePath, cleanCaseFraming, publishCase, withdrawCase } from "@/lib/cases";
import { caseBySession } from "@/lib/db";
import { caseRewardView, chooseCaseReward, offerCaseReward } from "@/lib/case-reward";
import { deviceFor, keepDevice } from "@/lib/device";

export const runtime = "nodejs";

const SID_RE = /^(cs_|pi_|sub_|gf_|gr_|rw_)[a-zA-Z0-9_-]+$/;

/**
 * Publish or withdraw a reading as a public case. Possession of the reading
 * link is the credential, as everywhere else on the reading page. The
 * question is never published unless the owner writes a public wording.
 */
export async function POST(req: NextRequest) {
  let body: { sid?: unknown; action?: unknown; framing?: unknown; locale?: unknown; who?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const sid = typeof body.sid === "string" ? body.sid : "";
  if (!SID_RE.test(sid)) return NextResponse.json({ error: "bad_session" }, { status: 400 });
  const site = (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "");

  // 09-26 公开卦例回礼: the owner picks who the reading it earned is for
  if (body.action === "reward") {
    const c = caseBySession(sid);
    if (!c || c.unpublished_at) return NextResponse.json({ error: "not_published" }, { status: 409 });
    const who = body.who === "gift" ? "gift" : "self";
    // 09-27 赠送审核 B: the gift remembers the browser it was made in
    const dev = deviceFor(req);
    return keepDevice(NextResponse.json({ reward: chooseCaseReward(sid, who, site, asLocale(body.locale ?? c.locale), dev.id) }), dev);
  }

  if (body.action === "unpublish") {
    const ok = withdrawCase(sid);
    return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
  }

  const check = cleanCaseFraming(body.framing);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
  const me = customerFromRequest(req);
  const r = publishCase(sid, check.framing, me?.customerId ?? null);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "not_found" ? 404 : 403 });
  const locale = asLocale(r.row.locale);
  const reward = offerCaseReward(sid, site, asLocale(body.locale ?? locale));
  return NextResponse.json({ publicId: r.row.public_id, framing: r.row.framing, url: `${site}${casePath(locale, r.row.public_id)}`, reward });
}

/** GET ?sid= — the case state of a reading, for the panel's first paint. */
export async function GET(req: NextRequest) {
  const sid = req.nextUrl.searchParams.get("sid") ?? "";
  if (!SID_RE.test(sid)) return NextResponse.json({ error: "bad_session" }, { status: 400 });
  const row = caseBySession(sid);
  if (!row || row.unpublished_at) return NextResponse.json({ published: false }, { headers: { "Cache-Control": "no-store" } });
  const site = (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  return NextResponse.json({ published: true, publicId: row.public_id, framing: row.framing, url: `${site}${casePath(asLocale(row.locale), row.public_id)}`, hidden: !!row.hidden_at, reward: caseRewardView(sid, site, asLocale(row.locale)) }, { headers: { "Cache-Control": "no-store" } });
}
