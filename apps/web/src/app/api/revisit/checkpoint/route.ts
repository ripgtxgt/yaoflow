import { NextRequest, NextResponse } from "next/server";
import { checkpointById, revisitById, setCheckpointAnswer, type CheckpointAnswer } from "@/lib/db";
import { verifyCheckpointToken } from "@/lib/outcome-token";
import { record } from "@/lib/analytics-server";
import { LOCALE_META, asLocale } from "@/lib/locales";
import { cpT, formatSpan, nextStretch } from "@/lib/dict/checkpoint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 10-12 多段应期 (进度表 §四 29): one tap from the check-in letter after an earlier window — did that stretch bring a
 * stir? Kept on the check-in only; the reading's score still waits for the revisit after its last window, so a quiet
 * first stretch is never counted as "it did not come true". The latest tap wins.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const id = Number(q.get("id"));
  const v = q.get("v");
  const locale = asLocale(q.get("l"));
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  const answer: CheckpointAnswer | null = v === "seen" || v === "none" || v === "unsure" ? v : null;
  const ok = Number.isInteger(id) && id > 0 && !!answer && verifyCheckpointToken(id, q.get("t") ?? "");
  const cp = ok ? checkpointById(id) : null;
  const rv = cp ? revisitById(cp.revisit_id) : null;
  if (!cp || !rv || !answer) return page(cpT(locale, "pInvalid"), [], locale, site, 400);

  setCheckpointAnswer(id, answer);
  record({ t: Date.now(), e: "checkpoint_answer", s: rv.session_id.slice(-12), locale: rv.locale, tier: rv.tier, method: `${cp.seq}:${answer}`, path: "/revisit" });

  const lang = LOCALE_META[locale].htmlLang;
  const range = formatSpan(new Date(cp.start_at), new Date(cp.end_at), lang);
  const next = nextStretch(rv, cp.seq, lang);
  const msg = cpT(locale, answer === "seen" ? "pSeen" : answer === "none" ? "pNone" : "pUnsure", { range, next });
  const readingUrl = `${site}/${locale}/reading?sid=${encodeURIComponent(rv.session_id)}`;
  return page(msg, [
    { href: `${readingUrl}#progress`, label: cpT(locale, "pNote"), primary: true },
    { href: readingUrl, label: cpT(locale, "pOpen") },
  ], locale, site, 200);
}

function page(msg: string, actions: { href: string; label: string; primary?: boolean }[], locale: ReturnType<typeof asLocale>, site: string, status: number) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  const btn = (a: { href: string; label: string; primary?: boolean }) =>
    a.primary
      ? `<p style="margin:0 0 14px;"><a href="${esc(a.href)}" style="display:inline-block;background:#14151c;color:#f4f2ec;text-decoration:none;padding:12px 24px;border-radius:2px;font-size:14px;letter-spacing:.08em;">${esc(a.label)} →</a></p>`
      : `<p style="margin:0 0 14px;"><a href="${esc(a.href)}" style="font-size:14px;color:#14151c;">${esc(a.label)} →</a></p>`;
  const html = `<!doctype html><html lang="${LOCALE_META[locale].htmlLang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>YaoFlow</title></head>
<body style="margin:0;background:#f4f2ec;color:#14151c;font-family:Georgia,'Songti SC','Noto Serif SC',serif;">
<div style="max-width:520px;margin:0 auto;padding:64px 24px;">
  <p style="letter-spacing:.35em;text-transform:uppercase;font-size:11px;opacity:.5;margin:0 0 40px;"><a href="${site}" style="color:inherit;text-decoration:none;">YaoFlow</a></p>
  <p style="font-size:18px;line-height:1.8;margin:0 0 32px;">${esc(msg)}</p>
  ${actions.map(btn).join("")}
</div></body></html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
