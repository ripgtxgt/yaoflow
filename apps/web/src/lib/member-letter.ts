import { db, emailAlreadySent, recordEmail, recordOps } from "./db";
import { letterOn } from "./letter-switch";
import { isPassSubscription } from "./subscription";
import { activeMembership } from "./membership";
import { homeDay } from "./clock";
import { featureOn } from "./features";
import { toHans } from "./hant";
import { unsubToken, unsubValid } from "./unsub";
import { yunshiFor } from "./mingli/yunshi/zodiac";
import { monthCurve, type MonthPoint } from "./mingli/bazi/report-facts";
import type { ChartFacts } from "./mingli/bazi/report-facts";

/**
 * 10-22 會員每日信 (进度表 75 ③, 第二批 — Neil: 會員要有通卡沒有的東西；「一封每天的信」是最直觀的那個) — one letter a day,
 * 07:30 台北, to members (a renewing or complimentary membership — never a 通卡) whose pages are Chinese:
 *   1. 今日一籤 — the member's own lot for the day (lib/today-qian.ts), the full reading
 *   2. 你的今日運勢 — by the 生肖 of the chart they have on file (the year pillar of their latest 八字 report; no chart → nothing)
 *   3. 今日一卦筆記 — the line written for the matter they are carrying (lib/daily-line.ts), when there is one today
 *   4. 應期 — their casts whose window opens within three days
 *   5. 本月 — the 節氣月 they are in, from their chart (level + tags of the month curve), when a chart is on file
 *   6. 你的今天 (10-22 进度表 92) — the day against their own 八字 (lib/mingli/bazi/today.ts: the 十神 of the day, its
 *      地支 against their 日支, a level) and 黃曆「今天對你」, from the 生辰檔案 marked 自己 or the chart on file
 * No model call of its own; everything is read from what already exists. Nothing about a birth is in the letter — the
 * 生肖 and the month are derived from the report's facts, which hold no date.
 * The 今日一籤 letter (tq mail) is not sent on top of this one; the member turns this one off with one click (the
 * same unsubscribe token as the other letters, kind "mletter") and the tq letter comes back by itself.
 */
export const LETTER_HOUR = 7, LETTER_MIN = 30;
const TPE_MS = 8 * 3600_000, DAY = 86_400_000;
const minuteOfDay = (now: number) => Math.floor(((now + TPE_MS) % DAY) / 60_000);

let ready = false;
function ensure(): void {
  if (ready) return;
  db().exec("CREATE TABLE IF NOT EXISTS member_letter_off (customer_id INTEGER PRIMARY KEY, at INTEGER NOT NULL)");
  ready = true;
}
export function memberLetterOff(customerId: number): boolean { ensure(); return !!db().prepare("SELECT 1 FROM member_letter_off WHERE customer_id = ?").get(customerId); }
export function setMemberLetterOff(customerId: number, off: boolean): void {
  ensure();
  if (off) db().prepare("INSERT OR REPLACE INTO member_letter_off (customer_id, at) VALUES (?, ?)").run(customerId, Date.now());
  else db().prepare("DELETE FROM member_letter_off WHERE customer_id = ?").run(customerId);
}
export const letterUnsubUrl = (site: string, email: string, locale: string) => `${site}/api/member-letter/unsub?e=${encodeURIComponent(email.trim().toLowerCase())}&t=${unsubToken(`mletter:${email.trim().toLowerCase()}`)}&l=${encodeURIComponent(locale)}`;
export const letterUnsubValid = (email: string, token: string) => unsubValid(`mletter:${email.trim().toLowerCase()}`, token);

/** a member who gets this letter (so the 今日一籤 letter stays quiet for them) */
export function memberLetterEligible(customerId: number, locale: string | null, now = Date.now()): boolean {
  // the letter starts with the 通卡 model (the switch open to everyone); until then the 今日一籤 letter keeps going as before
  if ((process.env.MEMBER_LETTER ?? "on") === "off" || !featureOn("tongka")) return false;
  if (locale !== "zh" && locale !== "zh-hant") return false;
  const sub = activeMembership(customerId, now);
  if (!sub || isPassSubscription(sub.stripe_subscription_id)) return false;
  return !memberLetterOff(customerId);
}

/* ------------------------------------------------------------------ the pieces */

/** the member's 八字 facts on file — the latest report of any kind (facts hold no date, time or place) */
export function baziFactsOnFile(customerId: number): ChartFacts | null {
  try {
    const r = db().prepare("SELECT chart_json FROM bazi_reports WHERE customer_id = ? AND paid_at IS NOT NULL ORDER BY created_at DESC LIMIT 1").get(customerId) as { chart_json: string } | undefined;
    return r ? (JSON.parse(r.chart_json) as ChartFacts) : null;
  } catch { return null; } // the table exists once a report was ever written
}
const BRANCHES = "子丑寅卯辰巳午未申酉戌亥";
const LEVEL_WORD: Record<number, string> = { 5: "最順手的一個月", 4: "偏順的一個月", 3: "平穩的一個月", 2: "要放慢的一個月", 1: "最需要放慢的一個月" };

/** today's 節氣月 for a chart: the last month whose start is on or before today (the 12 months run from 立春) */
export function monthNow(f: Pick<ChartFacts, "pillars" | "favour" | "avoid">, now = Date.now()): MonthPoint | null {
  const d = new Date(now + TPE_MS);
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, day = d.getUTCDate();
  const input = { pillars: f.pillars.map((p) => p.gz), favour: f.favour, avoid: f.avoid };
  const today = y * 10000 + m * 100 + day;
  const pick = (year: number) => {
    const months = monthCurve(input, year);
    let cur: MonthPoint | null = null;
    for (const mp of months) {
      const [mm, dd] = mp.start.split("/").map(Number);
      // the 八字 year's months run from 立春 (February) to the next 小寒 (January of the next calendar year)
      const startsIn = mm! >= 2 ? year : year + 1;
      if (startsIn * 10000 + mm! * 100 + dd! <= today) cur = mp;
    }
    return cur;
  };
  // January (and early February) still belong to the previous 八字 year
  return pick(y) ?? pick(y - 1);
}

export interface LetterPieces {
  day: string; locale: "zh" | "zh-hant";
  lot: { title: string; poem: string[]; section: string; text: string; yi?: string; ji?: string; askNext: string; setName: string; num: number } | null;
  yunshi: { name: string; tierName: string; line: string; yi: string; ji: string } | null;
  note: { text: string; matterId: number } | null;
  due: { question: string; dueAt: number; castId: number | null }[];
  month: { term: string; start: string; word: string; tags: string[] } | null;
  /** 10-22 进度表 92: 你的今天 + 黃曆「今天對你」 */
  me?: { dayGz: string; word: string; line: string; tip: string | null; almanac: string } | null;
  /** 10-26 (Neil: 「全部做吧」): 宜忌、顏色方位數字、順的時段、桃花日、你們倆、七天、沖日預告 (lib/mingli/bazi/today-plus.ts) */
  plus?: (import("./mingli/bazi/today-plus").DayPlus & { hasLove: boolean }) | null;
  /** 11-05 进度表 137: no chart, but a 本命卦 — this month read against it (lib/bmg-month.ts) */
  bmg?: { title: string; body: string; tip: string } | null;
}

export async function letterPieces(customerId: number, locale: "zh" | "zh-hant", now = Date.now()): Promise<LetterPieces> {
  const day = homeDay(now);
  const { drawToday, lotView, sectionFor, accessOf } = await import("./today-qian");
  let lot: LetterPieces["lot"] = null;
  try {
    if (accessOf(customerId, now)) {
      const draw = drawToday(`c:${customerId}`, now, "zh-hant");
      const v = lotView(draw, { full: true, section: sectionFor(customerId, null, now), hk: false });
      if (v?.full) lot = { title: v.title, poem: v.poem, section: v.full.section, text: v.full.text, yi: v.full.yi ?? undefined, ji: v.full.ji ?? undefined, askNext: v.full.askNext, setName: v.setName, num: v.num };
    }
  } catch { lot = null; }
  const facts = baziFactsOnFile(customerId);
  let yunshi: LetterPieces["yunshi"] = null, month: LetterPieces["month"] = null;
  if (facts?.pillars?.[0]) {
    const sign = BRANCHES.indexOf(facts.pillars[0].gz[1]!);
    const y = sign >= 0 ? yunshiFor(sign, day) : null;
    if (y) yunshi = { name: y.name, tierName: y.tierName, line: y.line, yi: y.yi, ji: y.ji };
    const mp = monthNow(facts, now);
    if (mp) month = { term: mp.term, start: mp.start, word: LEVEL_WORD[mp.level] ?? "", tags: mp.tags.slice(0, 3) };
  }
  let noteRow: { text: string; matter_id: number } | undefined;
  try { noteRow = db().prepare("SELECT text, matter_id FROM daily_lines WHERE customer_id = ? AND day = ? ORDER BY created_at DESC LIMIT 1").get(customerId, day) as typeof noteRow; } catch { noteRow = undefined; } // the table exists once a daily line was ever written
  const note = noteRow ? { text: noteRow.text, matterId: noteRow.matter_id } : null;
  const due = (db().prepare(`SELECT r.due_at, r.cast_id, c.question FROM revisits r LEFT JOIN casts c ON c.id = r.cast_id
    WHERE r.customer_id = ? AND r.outcome IS NULL AND r.due_at >= ? AND r.due_at < ? ORDER BY r.due_at LIMIT 3`).all(customerId, now - DAY, now + 3 * DAY) as { due_at: number; cast_id: number | null; question: string | null }[])
    .map((r) => ({ question: (r.question ?? "").slice(0, 40), dueAt: r.due_at, castId: r.cast_id }));
  let me: LetterPieces["me"] = null;
  try {
    const { myChart } = await import("./my-chart");
    const { myToday } = await import("./mingli/bazi/today");
    const c = myChart(customerId, "self", now);
    const t = c ? myToday(c, day) : null;
    if (t) me = { dayGz: t.dayGz, word: t.word, line: t.line, tip: t.tip, almanac: t.almanac };
  } catch { me = null; }
  let plus: LetterPieces["plus"] = null;
  try {
    const { myChart } = await import("./my-chart");
    const { dayPlus } = await import("./mingli/bazi/today-plus");
    const c = myChart(customerId, "self", now);
    const x = c ? dayPlus(c, day, myChart(customerId, "partner", now)) : null;
    let hasLove = false;
    try { hasLove = !!db().prepare("SELECT 1 FROM bazi_reports WHERE customer_id = ? AND kind = 'love' AND paid_at IS NOT NULL LIMIT 1").get(customerId); } catch { hasLove = false; }
    if (x) plus = { ...x, hasLove };
  } catch { plus = null; }
  let bmg: LetterPieces["bmg"] = null;
  if (!month && !me) {
    try {
      const { featureOn } = await import("./features");
      const { latestBmg } = await import("./bmg-store");
      const { linesOf } = await import("./bmg");
      const { monthBmgText } = await import("./bmg-month");
      const b = featureOn("bmg") ? latestBmg({ customerId }) : null;
      if (b) { const t = monthBmgText(linesOf(b.lines), now); bmg = { title: t.title, body: t.body, tip: t.tip }; }
    } catch { bmg = null; }
  }
  return { day, locale, lot, yunshi, note, due, month, me, plus, bmg };
}

/* ------------------------------------------------------------------ the letter */
const PAPER = "#f4f2ec", INK = "#14151c", INK_86 = "rgba(20,21,28,0.86)", INK_66 = "rgba(20,21,28,0.66)", INK_50 = "rgba(20,21,28,0.5)", GOLD = "#8a6c2c", RULE = "rgba(20,21,28,0.14)";
const FONT = "'Noto Serif TC','Songti TC','PingFang TC',serif";
const BTN = `display:inline-block;padding:12px 24px;border-radius:2px;background:${INK};color:${PAPER};text-decoration:none;font-size:14px;letter-spacing:.08em;`;
const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]!));
const SECTION: Record<string, string> = { love: "放在感情上", work: "放在工作上", overall: "今天怎麼看" };
const tpeDate = (ms: number) => { const d = new Date(ms + TPE_MS); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };

export function buildMemberLetter(p: LetterPieces, site: string, email: string): { subject: string; html: string; text: string; unsubUrl: string } {
  const z = (s: string) => (p.locale === "zh" ? toHans(s) : s);
  const l = p.locale;
  const [m, d] = p.day.slice(5).split("-").map(Number);
  const unsubUrl = letterUnsubUrl(site, email, l);
  const castUrl = `${site}/${l}/cast?c=mletter`, todayUrl = `${site}/${l}/today-qian?c=mletter`, acctUrl = `${site}/${l}/account?c=mletter`, baziUrl = `${site}/${l}/bazi?c=mletter`;
  const block = (label: string, body: string) => `<p style="font-size:12px;letter-spacing:.2em;color:${GOLD};margin:26px 0 8px;">${esc(z(label))}</p>${body}`;
  const para = (s: string, size = 15) => `<p style="font-size:${size}px;line-height:1.85;margin:0 0 10px;color:${INK_86};">${esc(z(s))}</p>`;
  const parts: string[] = [];
  const lines: string[] = [];
  if (p.lot) {
    parts.push(block("今日一籤", `<p style="font-size:20px;line-height:1.45;margin:0 0 10px;color:${INK};">${esc(z(p.lot.title))}</p><p style="font-size:16px;line-height:1.9;margin:0 0 12px;color:${INK_86};">${p.lot.poem.map((x) => esc(z(x))).join("<br>")}</p>${para(`${SECTION[p.lot.section] ?? ""}：${p.lot.text}`)}${p.lot.yi || p.lot.ji ? para(`${p.lot.yi ? `今日宜 ${p.lot.yi}` : ""}${p.lot.yi && p.lot.ji ? "　" : ""}${p.lot.ji ? `今日忌 ${p.lot.ji}` : ""}`, 14) : ""}`));
    lines.push(`今日一籤：${p.lot.title}`, ...p.lot.poem, `${SECTION[p.lot.section] ?? ""}：${p.lot.text}`);
  }
  if (p.me) {
    const x = p.plus;
    const yj = x && (x.yi.length || x.ji.length) ? `${x.yi.length ? `今日宜 ${x.yi.join("、")}` : ""}${x.yi.length && x.ji.length ? "　" : ""}${x.ji.length ? `今日忌 ${x.ji.join("、")}` : ""}` : null;
    const extra = [yj, x?.hours ?? null, x?.habits ?? null, x?.clashAhead ?? null].filter((v): v is string => !!v);
    parts.push(block("你的今天", para(`${p.me.dayGz}日 · ${p.me.word}。${p.me.line}`) + (p.me.tip ? para(p.me.tip, 14) : "") + extra.map((v) => para(v, 14)).join("") + para(`黃曆今天對你：${p.me.almanac}`, 14)));
    lines.push(`你的今天：${p.me.dayGz}日 · ${p.me.word}。${p.me.line}`, ...(p.me.tip ? [p.me.tip] : []), ...extra, `黃曆今天對你：${p.me.almanac}`);
    if (x?.peach) {
      const link = x.hasLove ? "" : `<p style="margin:0 0 6px;"><a href="${esc(`${site}/${l}/zhengyuan?c=mletter`)}" style="font-size:13px;color:${INK_66};">${esc(z("容易和你走在一起的是哪一類人，看正緣畫像"))} →</a></p>`;
      parts.push(block("桃花日", para(x.peach) + link));
      lines.push(`桃花日：${x.peach}`);
    }
    if (x?.pair) {
      parts.push(block("你們倆的今天", para(x.pair)));
      lines.push(`你們倆的今天：${x.pair}`);
    }
    if (x?.week.length === 7) {
      const row = x.week.map((w) => `<td style="padding:6px 2px;text-align:center;font-size:12px;line-height:1.5;color:${w.level >= 4 ? GOLD : w.level <= 2 ? INK_50 : INK_86};">${esc(z(w.md.split(" ")[0] ?? ""))}<br>${esc(z(w.md.split(" ")[1] ?? ""))}<br><b>${esc(z(w.word))}</b></td>`).join("");
      parts.push(block("這七天", `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 10px;"><tr>${row}</tr></table>` + (x.weekLine ? para(x.weekLine, 14) : "") + `<p style="margin:0 0 6px;"><a href="${esc(`${site}/${l}/zeri?c=mletter`)}" style="font-size:13px;color:${INK_66};">${esc(z("挑日子辦事，看擇日"))} →</a></p>`));
      lines.push(`這七天：${x.week.map((w) => `${w.md} ${w.word}`).join(" · ")}`, ...(x.weekLine ? [x.weekLine] : []));
    }
  }
  if (p.yunshi) {
    parts.push(block(`屬${p.yunshi.name}今日`, para(`${p.yunshi.tierName}。${p.yunshi.line}`) + para(`宜 ${p.yunshi.yi}　忌 ${p.yunshi.ji}`, 14)));
    lines.push(`屬${p.yunshi.name}今日：${p.yunshi.tierName}。${p.yunshi.line}`);
  }
  if (p.note) {
    parts.push(block("你那件事，今天", para(p.note.text) + `<p style="margin:0 0 6px;"><a href="${esc(`${site}/${l}/matter/${p.note.matterId}?c=mletter`)}" style="font-size:13px;color:${INK_66};">${esc(z("看這件事的紀錄"))} →</a></p>`));
    lines.push(`你那件事，今天：${p.note.text}`);
  }
  if (p.due.length) {
    parts.push(block("應期", p.due.map((x) => para(`國曆 ${tpeDate(x.dueAt)}：${x.question || "你問過的一件事"}`)).join("") + `<p style="margin:0 0 6px;"><a href="${esc(acctUrl)}" style="font-size:13px;color:${INK_66};">${esc(z("到期會問你結果，在「我的」能先看"))} →</a></p>`));
    lines.push(...p.due.map((x) => `應期 國曆 ${tpeDate(x.dueAt)}：${x.question}`));
  }
  if (p.month) {
    parts.push(block("本月", para(`${p.month.term}（國曆 ${p.month.start} 起）是你${p.month.word}${p.month.tags.length ? `：${p.month.tags.join("、")}` : "。"}`)));
    lines.push(`本月 ${p.month.term}（國曆 ${p.month.start} 起）：${p.month.word}${p.month.tags.length ? ` ${p.month.tags.join("、")}` : ""}`);
  }
  if (p.bmg) {
    parts.push(block("本月 · 你的本命卦", para(p.bmg.title) + para(p.bmg.body) + para(p.bmg.tip, 14)));
    lines.push(`本月 · ${p.bmg.title}：${p.bmg.body}`);
  }
  if (!p.yunshi && !p.month && !p.me) {
    parts.push(block("你的盤", para("填一次你的生辰（標成「自己」）或排一張八字盤，這封信就會多按你八字算的今天、你的生肖運勢和本月節奏。") + `<p style="margin:0 0 6px;"><a href="${esc(baziUrl)}" style="font-size:13px;color:${INK_66};">${esc(z("去排盤"))} →</a></p>`));
  }
  const head = z(`${m}月${d}日 · 會員每日信`);
  const html = `<!doctype html><html lang="${l === "zh" ? "zh-CN" : "zh-Hant"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${PAPER};color:${INK};font-family:${FONT};"><div style="max-width:560px;margin:0 auto;padding:40px 24px 36px;">
<p style="letter-spacing:.35em;font-size:12px;color:${INK_50};margin:0 0 6px;">YAOFLOW</p>
<p style="font-size:13px;color:${INK_66};margin:0 0 6px;">${esc(head)}</p>
${parts.join("")}
<p style="margin:28px 0 10px;"><a href="${esc(castUrl)}" style="${BTN}">${esc(z("有事就問，起一卦"))}</a></p>
<p style="margin:0 0 22px;"><a href="${esc(todayUrl)}" style="font-size:13px;color:${INK_66};">${esc(z("本月的籤日曆"))} →</a></p>
<hr style="border:none;border-top:1px solid ${RULE};margin:8px 0 14px;">
<p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(z("這封信是會員專屬，每天早上一封；籤和運勢說的是大方向和心態，不是結論。"))} <a href="${esc(unsubUrl)}" style="color:${INK_50};">${esc(z("不用再寄"))}</a></p>
</div></body></html>`;
  const text = [head, "", ...lines.map(z), "", `${z("起一卦")}: ${castUrl}`, `${z("本月的籤日曆")}: ${todayUrl}`, "", `${z("不用再寄")}: ${unsubUrl}`].join("\n");
  const subject = z(p.lot ? `每日信｜${p.lot.title}` : p.yunshi ? `每日信｜屬${p.yunshi.name}今天${p.yunshi.tierName}` : `每日信｜${m}月${d}日`);
  return { subject, html, text, unsubUrl };
}

/* ------------------------------------------------------------------ the run (the fulfil sweep, every few minutes) */

export async function runMemberLetters(now = Date.now(), site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "")): Promise<{ sent: number; failed: number; skipped: number }> {
  ensure();
  const out = { sent: 0, failed: 0, skipped: 0 };
  if ((process.env.MEMBER_LETTER ?? "on") === "off") return out;
  if (!letterOn("member_letter")) return out; // 10-23 进度表 108: turned off in /admin/letters
  const mins = minuteOfDay(now);
  if (mins < LETTER_HOUR * 60 + LETTER_MIN || mins >= 22 * 60) return out;
  const day = homeDay(now);
  const rows = db().prepare(`SELECT DISTINCT c.id AS cid, c.email, c.locale FROM subscriptions s JOIN customers c ON c.id = s.customer_id
    WHERE s.status IN ('active','trialing','past_due') AND substr(s.stripe_subscription_id,1,5) <> 'pass_' AND c.locale IN ('zh','zh-hant') AND c.email LIKE '%@%'`).all() as { cid: number; email: string; locale: string }[];
  const { sendEmail } = await import("./email");
  for (const r of rows.slice(0, 3000)) {
    const key = `ml:${r.cid}:${day}`;
    if (emailAlreadySent(key, "member_letter")) continue;
    if (!memberLetterEligible(r.cid, r.locale, now)) { out.skipped++; continue; }
    const locale = r.locale === "zh" ? "zh" : "zh-hant";
    let m;
    try { m = buildMemberLetter(await letterPieces(r.cid, locale, now), site, r.email); } catch (e) { recordOps("member_letter_fail", `${r.cid} build ${(e instanceof Error ? e.message : "?").slice(0, 100)}`); out.failed++; continue; }
    recordEmail(key, "member_letter", r.email, "pending");
    const res = await sendEmail(r.email, m.subject, m.html, m.text, { kind: "daily", customerId: r.cid, locale, unsubUrl: m.unsubUrl });
    recordEmail(key, "member_letter", r.email, res.ok ? "sent" : "failed", res.error ?? res.id);
    if (res.ok) out.sent++; else out.failed++;
  }
  return out;
}
