import { NextRequest, NextResponse } from "next/server";
import { REVISIT_ACTED, REVISIT_STATES, revisitById, setRevisitState, type RevisitActed, type RevisitState } from "@/lib/db";
import { verifyOutcomeToken } from "@/lib/outcome-token";
import { record } from "@/lib/analytics-server";
import { LOCALE_META, asLocale } from "@/lib/locales";
import { STATE_T } from "@/lib/dict/revisit-state";
import { CRISIS_T, HELPLINE_DIRECTORY } from "@/lib/crisis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 11-05 进度表 135: the two optional questions under the revisit answer (api/revisit/outcome) — the state the reader was in
 * and whether they did what they planned. Same signed link as the answer. 「快撐不住了」 gets care and the helplines
 * (the crisis note's own lines), never a judgement and never a sales line.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const id = Number(q.get("id"));
  const token = q.get("t") ?? "";
  const locale = asLocale(q.get("l"));
  const c = STATE_T[locale];
  const s = q.get("s");
  const a = q.get("a");
  const state = (REVISIT_STATES as readonly string[]).includes(s ?? "") ? (s as RevisitState) : null;
  const acted = (REVISIT_ACTED as readonly string[]).includes(a ?? "") ? (a as RevisitActed) : null;
  const ok = Number.isInteger(id) && id > 0 && verifyOutcomeToken(id, token) && !!revisitById(id);
  if (!ok) return html(locale, `<p style="font-size:16px;line-height:1.8;">${esc(c.skip)}</p>`, 400);
  if (state || acted) {
    setRevisitState(id, state, acted);
    record({ t: Date.now(), e: "revisit_state", s: `rv${id}`, locale, method: `${state ?? "-"}:${acted ?? "-"}`, path: "/revisit" });
  }
  if (state === "breaking") {
    const cr = CRISIS_T[locale];
    const lines = cr.lines.map((l) => `<li style="margin:0 0 6px;">${esc(l.where)} · ${esc(l.name)} · <a href="tel:${esc(l.tel.replace(/\s/g, ""))}" style="color:#14151c;">${esc(l.tel)}</a></li>`).join("");
    return html(locale, `<p style="font-size:17px;line-height:1.8;margin:0 0 18px;">${esc(c.care)}</p>
      <ul style="padding-left:18px;font-size:15px;line-height:1.7;margin:0 0 14px;">${lines}</ul>
      <p style="font-size:13px;line-height:1.7;margin:0 0 6px;">${esc(cr.more)} <a href="${HELPLINE_DIRECTORY}" style="color:#14151c;">findahelpline.com</a></p>
      <p style="font-size:13px;line-height:1.7;margin:0;">${esc(cr.emergency)}</p>`);
  }
  return html(locale, `<p style="font-size:17px;line-height:1.8;">${esc(state || acted ? c.thanks : c.skip)}</p>`);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (x) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[x]!));

function html(locale: ReturnType<typeof asLocale>, body: string, status = 200) {
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  return new NextResponse(`<!doctype html><html lang="${LOCALE_META[locale].htmlLang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>YaoFlow</title></head>
<body style="margin:0;background:#f4f2ec;color:#14151c;font-family:Georgia,'Songti SC','Noto Serif SC',serif;">
<div style="max-width:520px;margin:0 auto;padding:64px 24px;">
  <p style="letter-spacing:.35em;text-transform:uppercase;font-size:11px;opacity:.5;margin:0 0 40px;"><a href="${site}" style="color:inherit;text-decoration:none;">YaoFlow</a></p>
  ${body}
  <p style="margin:32px 0 0;"><a href="${site}/${locale}" style="font-size:14px;color:#14151c;">YaoFlow →</a></p>
</div></body></html>`, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
