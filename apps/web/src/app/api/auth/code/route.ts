import { NextRequest, NextResponse } from "next/server";
import { redeemLoginCode, safeNextPath, setSessionCookies } from "@/lib/auth";
import { asLocale } from "@/lib/locales";
import { recordOps } from "@/lib/db";
import { markCustomer } from "@/lib/browsers";

export const runtime = "nodejs";

/**
 * 10-02 登录码: the six digits from the sign-in letter, typed on the page the reader is on — so a reader inside
 * Threads / Instagram signs in THAT browser (the letter's link opens another one). lib/auth.ts redeemLoginCode has the
 * rules (hashed, five wrong tries per letter, the same 15 minutes as the link, one use between code and link).
 */
const BUCKET = new Map<string, { n: number; t: number }>();
function limited(ip: string, now: number): boolean {
  const b = BUCKET.get(ip);
  if (!b || now - b.t > 10 * 60_000) { BUCKET.set(ip, { n: 1, t: now }); return false; }
  b.n += 1;
  if (BUCKET.size > 5000) BUCKET.clear();
  return b.n > 30;
}

export async function POST(req: NextRequest) {
  const now = Date.now();
  if (limited(req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local", now)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  let body: { email?: unknown; code?: unknown; locale?: unknown };
  try { body = (await req.json()) as typeof body; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const email = typeof body.email === "string" ? body.email : "";
  const code = typeof body.code === "string" ? body.code : "";
  const r = redeemLoginCode(email, code, now);
  if (!r.ok) {
    if (r.reason === "too_many") recordOps("login_code_locked", email.replace(/^(.).*(@.*)$/, "$1…$2"));
    return NextResponse.json({ error: r.reason }, { status: r.reason === "too_many" ? 429 : 400 });
  }
  const locale = asLocale(r.locale ?? body.locale);
  const next = safeNextPath(r.nextPath) ?? `/${locale}/account`;
  const res = NextResponse.json({ ok: true, next });
  setSessionCookies(res, r.sessionId);
  markCustomer(req, res, r.customerId, "login_code");
  recordOps("login", `${locale} code`);
  return res;
}
