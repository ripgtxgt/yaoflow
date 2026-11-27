import { NextRequest, NextResponse } from "next/server";
import { markCustomer } from "@/lib/browsers";
import { asLocale, LOCALE_META } from "@/lib/locales";
import { t } from "@/lib/i18n";
import { redeemLoginToken, setSessionCookies } from "@/lib/auth";
import { recordOps } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_RE = /^[0-9a-f]{64}$/;

/**
 * The link in the email lands here. GET only shows a tiny page that posts
 * the token straight back (auto-submitted; a button for no-JS) — mail
 * scanners and link previewers fetch GETs, and a single-use token must not
 * be spent by a robot before the person clicks. POST is the real redemption:
 * a good token becomes a session cookie and a redirect to the account (or
 * wherever the person was headed); a bad one goes to the login page with a
 * reason, never to a blank error.
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("t") ?? "";
  const locale = asLocale(req.nextUrl.searchParams.get("l"));
  const site = (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  if (!TOKEN_RE.test(raw)) return NextResponse.redirect(`${site}/${locale}/login?e=invalid`, { status: 303 });

  const html = `<!doctype html>
<html lang="${LOCALE_META[locale].htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(t(locale, "loginTitle"))} · YaoFlow</title>
<style>
  body{margin:0;background:#f4f2ec;color:#14151c;font-family:Georgia,'Songti SC','Noto Serif SC',serif;}
  main{max-width:34rem;margin:0 auto;padding:6rem 1.5rem;}
  .mark{letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:#8f8f8e;margin:0 0 2.5rem;}
  button{font:inherit;font-size:15px;background:#14151c;color:#f4f2ec;border:0;border-radius:999px;padding:13px 30px;cursor:pointer;}
</style>
</head>
<body>
<main>
  <p class="mark">YaoFlow</p>
  <form method="post" action="/api/auth/verify" id="f">
    <input type="hidden" name="t" value="${esc(raw)}">
    <input type="hidden" name="l" value="${locale}">
    <button type="submit">${esc(t(locale, "loginContinue"))}</button>
  </form>
</main>
<script>document.getElementById("f").submit();</script>
</body>
</html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" },
  });
}

export async function POST(req: NextRequest) {
  const site = (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  let raw = "";
  let hint: string | null = null;
  try {
    const form = await req.formData();
    raw = String(form.get("t") ?? "");
    hint = typeof form.get("l") === "string" ? String(form.get("l")) : null;
  } catch { /* not a form post */ }
  const r = redeemLoginToken(raw);
  if (!r) return NextResponse.redirect(`${site}/${asLocale(hint)}/login?e=invalid`, { status: 303 });
  const locale = asLocale(r.locale);
  const dest = r.nextPath ?? `/${locale}/account`;
  const res = NextResponse.redirect(`${site}${dest}`, { status: 303 });
  setSessionCookies(res, r.sessionId);
  markCustomer(req, res, r.customerId, "login"); // 10-02/03: the board still knows this browser after the sign-in ends; its id is theirs
  recordOps("login", locale);
  return res;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
