import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { asLocale } from "@/lib/locales";
import { confirmDailySub, recordOps, requestDailySub, unsubDaily } from "@/lib/db";
import { serverCheckEmail } from "@/lib/email-mx";
import { buildDailyConfirmEmail, sendEmail } from "@/lib/email";
import { dailyConfirmUrl, dailyUnsubValid } from "@/lib/daily-mail";
import { validTimeZone } from "@/lib/tz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** a handful of requests per address source is plenty (confirmation mails are ours to pay for) */
const HITS = new Map<string, number[]>();
function limited(key: string): boolean {
  const now = Date.now();
  const list = (HITS.get(key) ?? []).filter((t) => now - t < 3_600_000);
  list.push(now);
  HITS.set(key, list);
  if (HITS.size > 4000) HITS.clear();
  return list.length > 5;
}

/** 09-26 每日三卦: ask for the letter — a confirmation mail goes out; nothing is sent daily until it is clicked. */
export async function POST(req: NextRequest) {
  // RFC 8058 one-click: mail clients POST to the List-Unsubscribe link itself
  const qu = (req.nextUrl.searchParams.get("u") ?? "").trim().toLowerCase();
  if (qu) {
    if (dailyUnsubValid(qu, req.nextUrl.searchParams.get("t") ?? "")) { unsubDaily(qu); return NextResponse.json({ ok: true }); }
    return NextResponse.json({ error: "bad_link" }, { status: 400 });
  }
  let body: { email?: unknown; locale?: unknown; tz?: unknown };
  try { body = (await req.json()) as typeof body; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const checked = await serverCheckEmail(typeof body.email === "string" ? body.email : "");
  if (!checked.ok) return NextResponse.json({ error: checked.error, suggestion: checked.suggestion }, { status: 400 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (limited(ip) || limited(checked.email)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const locale = asLocale(body.locale);
  const tz = validTimeZone(body.tz) ? body.tz : null;
  const row = requestDailySub(checked.email, locale, tz, randomBytes(18).toString("hex"));
  if (row.confirmed_at) return NextResponse.json({ ok: true, already: true });
  const m = buildDailyConfirmEmail({ locale, confirmUrl: dailyConfirmUrl(row.token, locale) });
  const r = await sendEmail(checked.email, m.subject, m.html, m.text, { kind: "daily_confirm", locale });
  recordOps("daily_sub_request", `${locale} ${r.ok ? "mailed" : "failed"}`);
  if (!r.ok) return NextResponse.json({ error: "send_failed" }, { status: 502 });
  return NextResponse.json({ ok: true });
}

/** ?c=<token> confirms; ?u=<email>&t=<hmac> unsubscribes. Both land back on the page with a one-line note. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const locale = asLocale(q.get("l"));
  const site = (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  const c = q.get("c");
  if (c && /^[0-9a-f]{36}$/.test(c)) {
    const row = confirmDailySub(c);
    if (row) recordOps("daily_sub_confirmed", row.locale);
    return NextResponse.redirect(`${site}/${locale}/today?sub=${row ? "ok" : "bad"}`, { status: 303 });
  }
  const u = (q.get("u") ?? "").trim().toLowerCase();
  const t = q.get("t") ?? "";
  if (u && dailyUnsubValid(u, t)) {
    if (unsubDaily(u)) recordOps("daily_unsub", locale);
    return NextResponse.redirect(`${site}/${locale}/today?sub=off`, { status: 303 });
  }
  return NextResponse.redirect(`${site}/${locale}/today`, { status: 303 });
}
