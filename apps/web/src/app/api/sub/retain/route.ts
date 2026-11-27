import { NextRequest, NextResponse } from "next/server";
import { payHop } from "@/lib/inapp-pay";
import { contentFor } from "@/lib/content";
import { subscriptionByStripeId } from "@/lib/db";
import { RETAIN_T } from "@/lib/dict/retain";
import { asLocale, LOCALE_META, type Locale } from "@/lib/locales";
import { formatMoney, isCurrency, priceMinor, yearlySavePct } from "@/lib/money";
import { endOf, fmtDay, performRetain, RETAIN_ACTIONS, verifyRetainToken, type RetainAction } from "@/lib/retain";

export const runtime = "nodejs";

/**
 * The buttons in the cancellation letters (09-23, 挽回).
 *
 * GET only shows what will happen and a button; POST does it. Mail scanners
 * (Outlook Safe Links, Gmail's image proxy, corporate gateways) open every
 * link in a message before the person does — a GET that changed a
 * subscription would un-cancel people who never clicked.
 */

type Parsed = { sub: string; action: RetainAction; token: string; locale: Locale };

function parse(p: URLSearchParams): Parsed | null {
  const sub = p.get("s") ?? "";
  const action = p.get("a") as RetainAction;
  const token = p.get("t") ?? "";
  if (!/^sub_[A-Za-z0-9]+$/.test(sub) || !RETAIN_ACTIONS.includes(action)) return null;
  if (!verifyRetainToken(sub, action, token)) return null;
  return { sub, action, token, locale: asLocale(p.get("l")) };
}

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]!));

function page(locale: Locale, title: string, lead: string, extra = ""): NextResponse {
  const t = contentFor(RETAIN_T, locale);
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  const html = `<!doctype html><html lang="${LOCALE_META[locale].htmlLang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>YaoFlow</title></head>
<body style="margin:0;background:#f4f2ec;color:#14151c;font-family:Georgia,'Songti SC','Noto Serif SC',serif;">
<div style="max-width:520px;margin:0 auto;padding:56px 20px;">
<p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:#7a7a7c;margin:0 0 32px;">YaoFlow</p>
<p style="font-size:22px;line-height:1.4;margin:0 0 16px;">${esc(title)}</p>
<p style="font-size:15px;line-height:1.8;color:#333439;margin:0 0 24px;">${esc(lead)}</p>
${extra}
<p style="margin:28px 0 0;"><a href="${site}/${locale}/account" style="font-size:13px;color:#606063;">${esc(t.account)} →</a></p>
</div></body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}

function vars(p: Parsed): { date: string; price: string; pct: string } {
  const row = subscriptionByStripeId(p.sub);
  const end = row ? endOf(row) : null;
  const cur = row?.currency && isCurrency(row.currency) ? row.currency : null;
  return {
    date: end ? fmtDay(end, p.locale) : "—",
    price: cur ? formatMoney(cur, priceMinor(cur, "year"), p.locale) : "",
    pct: cur ? String(yearlySavePct(cur)) : "",
  };
}

const fill = (s: string, v: { date: string; price: string; pct: string }) =>
  s.replace(/\{date\}/g, v.date).replace(/\{price\}/g, v.price).replace(/\{pct\}/g, v.pct);

export async function GET(req: NextRequest) {
  const p = parse(req.nextUrl.searchParams);
  if (!p) return page(asLocale(req.nextUrl.searchParams.get("l")), "—", contentFor(RETAIN_T, asLocale(req.nextUrl.searchParams.get("l"))).stale);
  const t = contentFor(RETAIN_T, p.locale);
  const v = vars(p);
  const [title, lead] = p.action === "resume" ? [t.pageResume, t.pageResumeLead]
    : p.action === "pause" ? [t.pagePause, fill(t.pagePauseLead, v)]
    : [t.pageYear, fill(t.pageYearLead, v)];
  const q = new URLSearchParams({ s: p.sub, a: p.action, t: p.token, l: p.locale });
  const form = `<form method="post" action="/api/sub/retain?${esc(q.toString())}">
<button type="submit" style="background:#14151c;color:#f4f2ec;border:0;padding:13px 30px;border-radius:2px;font-size:15px;font-family:inherit;cursor:pointer;">${esc(t.confirm)}</button></form>`;
  return page(p.locale, title, lead, form);
}

export async function POST(req: NextRequest) {
  const p = parse(req.nextUrl.searchParams);
  if (!p) return page(asLocale(req.nextUrl.searchParams.get("l")), "—", contentFor(RETAIN_T, asLocale(req.nextUrl.searchParams.get("l"))).stale);
  const t = contentFor(RETAIN_T, p.locale);
  const r = await performRetain(p.action, p.sub, p.locale);
  if (r.ok && "redirect" in r) return NextResponse.redirect(payHop(req, r.redirect, p.locale), 303); // 10-24: WeChat / QQ → our hop page
  if (r.ok) {
    return r.done === "resume"
      ? page(p.locale, t.doneResume, "")
      : page(p.locale, fill(t.donePause, { date: r.until ? fmtDay(r.until, p.locale) : "—", price: "", pct: "" }), "");
  }
  return page(p.locale, "—", r.reason === "stale" ? t.stale : t.failed);
}
