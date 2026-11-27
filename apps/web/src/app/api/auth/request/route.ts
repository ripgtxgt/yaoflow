import { customerTimeZone } from "@/lib/db";
import { serverCheckEmail } from "@/lib/email-mx";
import { NextRequest, NextResponse } from "next/server";
import { asLocale } from "@/lib/locales";
import { issueLoginToken, safeNextPath } from "@/lib/auth";
import { buildLoginEmail, sendEmail } from "@/lib/email";
import { recordOps } from "@/lib/db";

export const runtime = "nodejs";

/** Per-instance brake on one address being hammered from many places: 30 requests / 10 min / IP. */
const BUCKET = new Map<string, { n: number; t: number }>();
function limited(ip: string): boolean {
  const now = Date.now();
  const b = BUCKET.get(ip);
  if (!b || now - b.t > 10 * 60_000) { BUCKET.set(ip, { n: 1, t: now }); return false; }
  b.n += 1;
  return b.n > 30;
}

/**
 * Ask for a magic link. Always answers "sent" for a well-formed address —
 * whether the address exists is nobody's business but its owner's.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (limited(ip)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  let body: { email?: unknown; locale?: unknown; next?: unknown; notify?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const checked = await serverCheckEmail(typeof body.email === "string" ? body.email : ""); // 09-26 邮箱校对
  if (!checked.ok) return NextResponse.json({ error: checked.error, suggestion: checked.suggestion }, { status: 400 });
  const email = checked.email;
  const locale = asLocale(body.locale);
  const next = safeNextPath(body.next);

  const issued = issueLoginToken(email, locale, next, body.notify === true);
  if (!issued) return NextResponse.json({ ok: true, throttled: true }); // same face as success: no oracle
  const { raw, code } = issued;

  const site = (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  const link = `${site}/api/auth/verify?t=${raw}&l=${locale}`;
  const stamp = (() => {
    const zone = customerTimeZone(email) ?? ({ "zh-hant": "Asia/Taipei", zh: "Asia/Shanghai", ja: "Asia/Tokyo", ko: "Asia/Seoul" } as Record<string, string>)[locale] ?? "UTC";
    try { return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: zone }).format(Date.now()); } catch { return undefined; }
  })();
  const mail = buildLoginEmail(locale, link, email, stamp, code); // 10-02: and the six digits, for in-app browsers
  const sent = await sendEmail(email, mail.subject, mail.html, mail.text, { kind: "login" });
  if (!sent.ok) {
    recordOps("login_mail_fail", sent.error ?? "unknown");
    return NextResponse.json({ error: "mail_failed" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
