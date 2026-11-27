import { NextRequest, NextResponse } from "next/server";
import { deepReadingOf, reaskRevisit, revisitById, revisitRewardForSession, setRevisitOffDate, setRevisitOutcome } from "@/lib/db";
import { judgeEvent, parseEvent, readingLean } from "@/lib/revisit-judge";
import { selfReportUrl, selfReviewLabel, selfVerdict } from "@/lib/self-revisit";
import { proofUrl, verifyOutcomeToken } from "@/lib/outcome-token";
import { afterLink, canMintGift, giftLink, mintGiftCast, mintPoolGift, mintRevisitReward } from "@/lib/grants";
import { giftCastForSession, orderBySession } from "@/lib/db";
import { giftPoolFor } from "@/lib/membership";
import { deviceFor, keepDevice } from "@/lib/device";
import { record } from "@/lib/analytics-server";
import { LOCALE_META, asLocale, type Locale } from "@/lib/locales";
import { contentFor } from "@/lib/content";
import { OUTCOME_T } from "@/lib/dict/email";
import { t } from "@/lib/i18n";
import { tt } from "@/lib/dict/thread";
import { caseBySession } from "@/lib/db";
import { resetResultsCache } from "@/lib/results-line";
import { STATE_T } from "@/lib/dict/revisit-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One tap from the revisit email records how the matter turned out. Returns a
 * small page in the customer's language; tapping another button later simply
 * overwrites. This is the product keeping score on itself.
 *
 * 10-07 回访改问法 (lib/revisit-judge.ts): the tap says what HAPPENED
 * (happened / stirred / nothing / open); the score — hit, miss, partial,
 * unclear — is derived here from the reading's own lean, so a reading that
 * called the matter unlikely is right when nothing happened. The old links
 * (v=hit/partial/miss) still work and mean the fact they always meant.
 *
 * 09-21 回访奖励 (Neil: 只给「应验了」的人轻解读，「没应验」给一次追问):
 *   hit  → 应验卡 + a light reading on what comes next (30 days) + 替朋友问一卦
 *   miss / partial / unclear → one extra follow-up on that reading
 *   open → nothing; asked once more two weeks later
 * One reward per reading, whichever answer came first — the mail never says
 * which answer earns what, so the answer stays honest.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const id = Number(q.get("id"));
  const v = q.get("v");
  const token = q.get("t") ?? "";
  const locale = asLocale(q.get("l"));
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  const copy = contentFor(OUTCOME_T, locale);

  const event = parseEvent(v);
  const valid = Number.isInteger(id) && id > 0 && !!event && verifyOutcomeToken(id, token);
  const row = valid ? revisitById(id) : null;
  if (!row || !event) return page({ msg: copy.invalid, locale, site, status: 400 });

  // 10-22 进度表 80: a 看自己 revisit scores itself — the reader said what became of the result they set; no rewards, back to the report
  if (row.kind) {
    const verdict = selfVerdict(event);
    setRevisitOutcome(id, verdict, { event, lean: null });
    resetResultsCache(); // 10-23 进度表 104 ②: the home page / /outcomes figure shows the answer at once
    record({ t: Date.now(), e: "revisit_answer", s: row.session_id.slice(-12), locale: row.locale, tier: row.tier, method: `${event}:${verdict}`, path: `/${row.kind}` });
    const back = selfReportUrl(site, row.kind, row.ref ?? "", locale);
    const msg = verdict === "hit" ? copy.hit : verdict === "miss" ? copy.miss : verdict === "partial" ? copy.partial : copy.open;
    return page({ msg, after: stateForm({ id, token, locale, plan: row.plan ?? null }), locale, site, status: 200, actions: [{ href: back, label: selfReviewLabel(row.kind, locale), primary: true }] });
  }
  // the reading's lean (its odds code, else its verdict's words) decides what the fact means for the score
  const ask = row.ask === "signals" ? "signals" : "event";
  const deep = row.cast_id && ask === "event" ? deepReadingOf(row.cast_id) : null;
  const lean = deep ? readingLean(deep.body, deep.locale || row.locale) : null;
  const verdict = judgeEvent(lean, event, ask);
  setRevisitOutcome(id, verdict, { event, lean });
  // 10-31 进度表 129 ④: 「發生了，但不在那幾天」 may carry roughly when (a day between the cast and tomorrow)
  if (event === "offwindow") {
    const d = q.get("d") ?? "";
    const ok = /^\d{4}-\d{2}-\d{2}$/.test(d) && Date.parse(`${d}T00:00:00Z`) <= Date.now() + 86_400_000 && Date.parse(`${d}T00:00:00Z`) >= row.created_at - 2 * 86_400_000;
    setRevisitOffDate(id, ok ? d : null);
  } else if (event !== "open") setRevisitOffDate(id, null);
  resetResultsCache();
  record({ t: Date.now(), e: "revisit_answer", s: row.session_id.slice(-12), locale: row.locale, tier: row.tier, method: `${event}:${verdict}`, path: "/revisit" });

  const readingUrl = `${site}/${locale}/reading?sid=${encodeURIComponent(row.session_id)}`;
  const actions: { href: string; label: string; primary?: boolean }[] = [];
  let extra: string | null = null;
  let gift: string | null = null;
  const dev = deviceFor(req);

  if (verdict === "hit") {
    // 应验卡: the moment someone most wants to tell others is right here
    if (row.cast_id) actions.push({ href: proofUrl(site, id, locale), label: t(locale, "proofMake"), primary: true });
    const reward = mintRevisitReward(row, "hit");
    if (reward?.kind === "revisit_light" && !reward.used_at && reward.expires_at > Date.now()) {
      extra = copy.hitReward;
      actions.push({ href: afterLink(site, locale, reward.token), label: copy.hitAfter });
    }
    // 09-27 (Neil: 「改改送一卦的时机」): "it came true" is when a reading is most worth passing on — the link is
    // made right here, ready to send, instead of a pointer to a folded row at the bottom of the reading page
    gift = hitGift(row.session_id, row.customer_id, locale, site, dev.id);
  } else if (verdict === "miss" || verdict === "partial" || verdict === "unclear") {
    // 09-26: "happened, but not as said" earns what a miss earns — one more question on where it differed;
    // 10-07: so does an answer the reading cannot be scored on — they told us what happened, and may say more
    const reward = mintRevisitReward(row, "miss");
    if (reward?.kind === "revisit_followup") {
      extra = verdict === "partial" ? copy.partialReward : verdict === "unclear" ? copy.unclearReward : copy.missReward;
      actions.push({ href: `${readingUrl}#followup`, label: copy.missAsk, primary: true });
    } else {
      actions.push({ href: readingUrl, label: copy.missAsk });
    }
  } else {
    if (reaskRevisit(id)) extra = copy.openReask;
  }
  // what the page says: the fact they gave, read against what the reading had said
  const msg = event === "offwindow" ? copy.offwindow : ask === "signals"
    ? (event === "happened" ? copy.sigSeen : event === "stirred" ? copy.sigSome : event === "nothing" ? copy.sigNone : copy.open)
    : verdict === "hit" ? (event === "nothing" ? copy.nothingRight : copy.hit)
    : verdict === "miss" ? (event === "happened" ? copy.happenedWrong : copy.miss)
    : verdict === "partial" ? copy.partial
    : verdict === "unclear" ? (event === "happened" ? copy.happenedUnclear : copy.nothingUnclear)
    : copy.open;
  // whatever they earned earlier stays reachable from any later tap
  if (!extra && verdict !== "open") {
    const earlier = revisitRewardForSession(row.session_id);
    if (earlier?.kind === "revisit_light" && !earlier.used_at && earlier.expires_at > Date.now() && !actions.some((a) => a.href.includes("after="))) {
      actions.push({ href: afterLink(site, locale, earlier.token), label: copy.hitAfter });
    }
  }
  // 09-26 公开卦例: having just told us how it went is the moment the case is most worth sharing
  if (verdict !== "open" && !caseBySession(row.session_id)) actions.push({ href: `${readingUrl}#case`, label: tt(locale, "revisitPublish") });
  actions.push({ href: `${site}/${locale}`, label: t(locale, "askAnother") });

  // 10-31 进度表 129 ④: 「發生了」 on a reading that named days — was it in those days? One more tap if not, with roughly when
  const when = event === "happened" && ask === "event" && row.timing_quote ? whenForm({ id, token, locale, copy }) : null;
  // 11-05 进度表 135: two optional taps after the answer — the state they were in, and whether they did what they planned
  const state = stateForm({ id, token, locale, plan: row.plan ?? null });
  return keepDevice(page({ msg, after: `${when ?? ""}${state}`, extra, actions, gift, locale, site, status: 200 }), dev);
}

/** The 送一卦 link for this reading: its own gift for a purchase, one from the monthly pool for a member's reading. */
function hitGift(sid: string, customerId: number | null, locale: Locale, site: string, device: string): string | null {
  if (!canMintGift(sid)) return null;
  const existing = giftCastForSession(sid);
  if (existing) return existing.used_at || existing.expires_at < Date.now() ? null : giftLink(site, locale, existing.token);
  if (sid.startsWith("sub_")) {
    const pool = customerId ? giftPoolFor(customerId) : null;
    if (!pool || pool.available <= 0 || !customerId) return null;
    return giftLink(site, locale, mintPoolGift(customerId, pool.sub.id, locale, sid, device).token);
  }
  return giftLink(site, locale, mintGiftCast(sid, locale, customerId ?? orderBySession(sid)?.customer_id ?? null, orderBySession(sid)?.via ?? null, device).token);
}

function whenForm(i: { id: number; token: string; locale: Locale; copy: { whenAsk: string; whenNo: string; whenSubmit: string } }): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  return `<form method="get" action="/api/revisit/outcome" style="border:1px solid #d0cfcb;border-radius:2px;padding:16px 18px;margin:0 0 28px;">
    <p style="font-size:14px;line-height:1.8;margin:0 0 12px;">${esc(i.copy.whenAsk)}</p>
    <input type="hidden" name="id" value="${i.id}"><input type="hidden" name="v" value="offwindow"><input type="hidden" name="t" value="${esc(i.token)}"><input type="hidden" name="l" value="${i.locale}">
    <label style="font-size:13px;display:block;margin:0 0 10px;">${esc(i.copy.whenNo)} <input type="date" name="d" style="font-size:14px;padding:6px 8px;border:1px solid #d0cfcb;background:#fbfaf6;border-radius:2px;"></label>
    <button type="submit" style="background:#fbfaf6;color:#14151c;border:1px solid #14151c;padding:8px 18px;border-radius:2px;font-size:13px;cursor:pointer;">${esc(i.copy.whenSubmit)}</button>
  </form>`;
}

/** 11-05 进度表 135: the two optional questions, one small form; nothing chosen = nothing sent */
function stateForm(i: { id: number; token: string; locale: Locale; plan: string | null }): string {
  const c = STATE_T[i.locale] ?? STATE_T["zh-hant"];
  const esc = (s: string) => s.replace(/[&<>"]/g, (x) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[x]!));
  const radio = (name: string, value: string, label: string) =>
    `<label style="display:inline-block;margin:0 14px 8px 0;font-size:14px;cursor:pointer;"><input type="radio" name="${name}" value="${value}" style="margin-right:6px;">${esc(label)}</label>`;
  const states = (["smooth", "tight", "pressure", "breaking"] as const).map((v, k) => radio("s", v, c.states[k]!)).join("");
  const acted = i.plan ? `<p style="font-size:14px;line-height:1.8;margin:14px 0 8px;">${esc(c.planAsk(i.plan))}</p>${(["done", "some", "not"] as const).map((v, k) => radio("a", v, c.acted[k]!)).join("")}` : "";
  return `<form method="get" action="/api/revisit/state" style="border:1px solid #d0cfcb;border-radius:2px;padding:16px 18px;margin:0 0 28px;">
    <input type="hidden" name="id" value="${i.id}"><input type="hidden" name="t" value="${esc(i.token)}"><input type="hidden" name="l" value="${i.locale}">
    <p style="font-size:14px;line-height:1.8;margin:0 0 8px;">${esc(c.ask)}</p>${states}${acted}
    <p style="margin:12px 0 0;"><button type="submit" style="background:#fbfaf6;color:#14151c;border:1px solid #14151c;padding:8px 18px;border-radius:2px;font-size:13px;cursor:pointer;">${esc(c.submit)}</button></p>
  </form>`;
}

function page(i: { msg: string; after?: string | null; extra?: string | null; actions?: { href: string; label: string; primary?: boolean }[]; gift?: string | null; locale: Locale; site: string; status: number }) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  const btn = (a: { href: string; label: string; primary?: boolean }) =>
    a.primary
      ? `<p style="margin:0 0 14px;"><a href="${esc(a.href)}" style="display:inline-block;background:#14151c;color:#f4f2ec;text-decoration:none;padding:12px 24px;border-radius:2px;font-size:14px;letter-spacing:.08em;">${esc(a.label)} →</a></p>`
      : `<p style="margin:0 0 14px;"><a href="${esc(a.href)}" style="font-size:14px;color:#14151c;">${esc(a.label)} →</a></p>`;
  const html = `<!doctype html><html lang="${LOCALE_META[i.locale].htmlLang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>YaoFlow</title></head>
<body style="margin:0;background:#f4f2ec;color:#14151c;font-family:Georgia,'Songti SC','Noto Serif SC',serif;">
<div style="max-width:520px;margin:0 auto;padding:64px 24px;">
  <p style="letter-spacing:.35em;text-transform:uppercase;font-size:11px;opacity:.5;margin:0 0 40px;"><a href="${i.site}" style="color:inherit;text-decoration:none;">YaoFlow</a></p>
  <p style="font-size:18px;line-height:1.8;margin:0 0 ${i.extra || i.after ? 20 : 32}px;">${esc(i.msg)}</p>
  ${i.after ?? ""}
  ${i.extra ? `<div style="border-left:2px solid #b8963e;padding-left:16px;margin:0 0 28px;"><p style="font-size:15px;line-height:1.8;margin:0;">${esc(i.extra)}</p></div>` : ""}
  ${(i.actions ?? []).slice(0, 1).map(btn).join("")}
  ${i.gift ? giftBlock(i.gift, i.locale, esc) : ""}
  ${(i.actions ?? []).slice(1).map(btn).join("")}
</div></body></html>`;
  return new NextResponse(html, { status: i.status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

function giftBlock(url: string, locale: Locale, esc: (s: string) => string): string {
  const msg = tt(locale, "rvGiftMsg", { url });
  const line = `https://line.me/R/share?text=${encodeURIComponent(msg)}`;
  const wa = `https://wa.me/?text=${encodeURIComponent(msg)}`;
  const link = "font-size:13px;color:#14151c;margin-right:18px;";
  return `<div style="border:1px solid #b8963e;border-radius:2px;padding:18px 18px 16px;margin:8px 0 28px;">
    <p style="font-size:16px;margin:0 0 8px;">${esc(tt(locale, "rvGiftTitle"))}</p>
    <p style="font-size:14px;line-height:1.8;margin:0 0 14px;color:#333439;">${esc(tt(locale, "rvGiftBody"))}</p>
    <input id="gl" readonly value="${esc(url)}" style="width:100%;box-sizing:border-box;font-size:13px;padding:9px 10px;border:1px solid #d0cfcb;background:#fbfaf6;color:#14151c;border-radius:2px;margin:0 0 12px;" onclick="this.select()">
    <p style="margin:0 0 12px;"><button type="button" id="gc" style="background:#14151c;color:#f4f2ec;border:0;padding:10px 20px;border-radius:2px;font-size:13px;letter-spacing:.06em;cursor:pointer;">${esc(tt(locale, "rvGiftCopy"))}</button></p>
    <p style="margin:0 0 10px;"><a href="${esc(line)}" style="${link}">${esc(tt(locale, "rvGiftLine"))} →</a><a href="${esc(wa)}" style="${link}">${esc(tt(locale, "rvGiftWa"))} →</a></p>
    <p style="font-size:12px;line-height:1.7;margin:0;color:#7a6425;">${esc(tt(locale, "giftRewardNote"))}</p>
  </div>
  <script>document.getElementById("gc").onclick=function(){var b=this,t=${JSON.stringify(msg).replace(/</g, "\\u003c")};(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(function(){b.textContent=${JSON.stringify(tt(locale, "rvGiftCopied"))};},function(){var i=document.getElementById("gl");i.select();document.execCommand("copy");b.textContent=${JSON.stringify(tt(locale, "rvGiftCopied"))};});};</script>`;
}
