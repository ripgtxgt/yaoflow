import { NextRequest, NextResponse } from "next/server";
import { payHop } from "@/lib/inapp-pay";
import { asLocale, LOCALE_META, type Locale } from "@/lib/locales";
import { recordOps } from "@/lib/db";
import { PASS_ACTIONS, pageVars, pageWords, performPassNotice, verifyPassNoticeToken, type PassAction } from "@/lib/pass-notice";

export const runtime = "nodejs";

/**
 * 10-14 进度表 42: the three buttons of the one-off month's reminder. GET shows what will happen and one button; POST
 * does it (mail scanners open every link). 「不用了」 records the choice and says goodbye — no plea, one optional tap.
 */
type Parsed = { pass: string; action: PassAction; token: string; locale: Locale };
function parse(p: URLSearchParams): Parsed | null {
  const pass = p.get("s") ?? "";
  const action = p.get("a") as PassAction;
  const token = p.get("t") ?? "";
  if (!/^pass_[A-Za-z0-9_]+$/.test(pass) || !PASS_ACTIONS.includes(action)) return null;
  if (!verifyPassNoticeToken(pass, action, token)) return null;
  return { pass, action, token, locale: asLocale(p.get("l")) };
}
const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]!));
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? "");

function page(locale: Locale, title: string, lead: string, extra = ""): NextResponse {
  const t = pageWords(locale);
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  const html = `<!doctype html><html lang="${LOCALE_META[locale].htmlLang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>YaoFlow</title></head>
<body style="margin:0;background:#f4f2ec;color:#14151c;font-family:Georgia,'Songti TC','Noto Serif TC',serif;">
<div style="max-width:520px;margin:0 auto;padding:56px 20px;">
<p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:#7a7a7c;margin:0 0 32px;">YaoFlow</p>
<p style="font-size:22px;line-height:1.4;margin:0 0 16px;">${esc(title)}</p>
<p style="font-size:15px;line-height:1.8;color:#333439;margin:0 0 24px;">${esc(lead)}</p>
${extra}
<p style="margin:28px 0 0;"><a href="${site}/${locale}/account" style="font-size:13px;color:#606063;">${esc(t.account)} →</a></p>
</div></body></html>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}

const BTN = "background:#ffffff;color:#14151c;border:1px solid #14151c;padding:12px 28px;border-radius:2px;font-size:15px;font-family:inherit;cursor:pointer;";

export async function GET(req: NextRequest) {
  const p = parse(req.nextUrl.searchParams);
  const lq = asLocale(req.nextUrl.searchParams.get("l"));
  if (!p) return page(lq, "—", pageWords(lq).stale);
  const t = pageWords(p.locale);
  const v = pageVars(p.pass, p.locale);
  const q = new URLSearchParams({ s: p.pass, a: p.action, t: p.token, l: p.locale });
  if (p.action === "no") {
    // even 「不用了」 waits for a press — a scanner opening the link is not the reader saying no
    return page(p.locale, t.no, "", `<form method="post" action="/api/pass/notice?${esc(q.toString())}"><button type="submit" style="${BTN}">${esc(t.no)}</button></form>`);
  }
  const [title, lead] = p.action === "pass" ? [fill(t.pagePass, v), fill(t.pagePassLead, v)] : [t.pageMonth, fill(t.pageMonthLead, v)];
  return page(p.locale, title, lead, `<form method="post" action="/api/pass/notice?${esc(q.toString())}"><button type="submit" style="${BTN}">${esc(t.go)}</button></form>`);
}

export async function POST(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  // the optional one-question survey after 「不用了」: s, l and the answer — signed with the same 「no」 token
  const answer = sp.get("q");
  const p = parse(sp);
  const lq = asLocale(sp.get("l"));
  if (!p) return page(lq, "—", pageWords(lq).stale);
  const t = pageWords(p.locale);
  if (answer && p.action === "no" && /^[123]$/.test(answer)) {
    recordOps("pass_notice_survey", `${p.pass} ${answer}`);
    return page(p.locale, t.thanks, "");
  }
  const r = await performPassNotice(p.action, p.pass, p.locale);
  if (r.ok && "redirect" in r) return NextResponse.redirect(payHop(req, r.redirect, p.locale), 303); // 10-24: WeChat / QQ → our hop page
  if (r.ok) {
    const q = (n: number) => new URLSearchParams({ s: p.pass, a: "no", t: p.token, l: p.locale, q: String(n) }).toString();
    const survey = `<p style="font-size:14px;color:#606063;margin:0 0 10px;">${esc(t.survey)}</p>
${[t.s1, t.s2, t.s3].map((label, i) => `<form method="post" action="/api/pass/notice?${esc(q(i + 1))}" style="display:inline-block;margin:0 8px 8px 0;"><button type="submit" style="background:#fff;color:#333439;border:1px solid #c9c4b6;padding:8px 16px;border-radius:2px;font-size:14px;font-family:inherit;cursor:pointer;">${esc(label)}</button></form>`).join("")}`;
    return page(p.locale, t.pageNo, t.pageNoLead, survey);
  }
  return page(p.locale, "—", t.stale);
}
