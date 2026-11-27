import { SixtyCycleYear } from "tyme4ts";
import { letterOn } from "./letter-switch";
import { db, emailAlreadySent, recordEmail, recordOps } from "./db";
import { chatJson, parseJsonLoose, type LlmMessage } from "./llm";
import { HK_WRITTEN_NOTE } from "./reading";
import { toHans } from "./hant";
import { nsOffense, nsScript } from "./mingli/nianshu/report";
import { exactHits } from "./mingli/astro/report-sky";
import { SIGNS } from "./mingli/astro/chart";
import type { AstroFacts, MonthA } from "./mingli/astro/report-facts";
import type { ZiweiFacts, MonthZ } from "./mingli/ziwei/report-facts";
import type { MonthPoint } from "./mingli/bazi/report-facts";
import { baziFactsOnFile, letterUnsubUrl, memberLetterEligible, monthNow } from "./member-letter";
import { birthToken, buildGenericLetter, genericBits, genericText } from "./month-letter-generic";
import { featureOn } from "./features";
import { linesOf } from "./bmg";
import { latestBmg } from "./bmg-store";
import { monthBmgText } from "./bmg-month";

/**
 * 10-22 每月流月信 (进度表 75 ③ 會員權益, 第二批) — on the first days of each 國曆 month, one letter to each member (a
 * renewing or complimentary membership, never a 通卡) with a chart on file: this month read from their own charts.
 *   八字 — the 節氣月 the month falls in (its 十神 for the day master, the month curve's level and tags, the year's 干支)
 *   紫微 — the 流月 entry of a 紫微年書 they own for this year (the 年書's child report), when there is one
 *   星象 — this month's page of an 星盤年書 they own (level, tags, the dated sky in words), or, with only a deep 星盤 report
 *         on file, 木星／土星 exact to their 太陽／月亮／金星／上升 inside the month, read from the chart's sign and degree
 * One model call per member, the 年書's voice and its checks (nsOffense: no banned words, no English, no day of the month,
 * no lunar word) — timing inside the month is said as 上旬／中旬／下旬 only. Nothing about a birth is in the letter.
 * Same eligibility and the same one-click stop as the daily member letter (lib/member-letter.ts).
 */
const TPE_MS = 8 * 3600_000;
const XUN = (d: number) => (d <= 10 ? "上旬" : d <= 20 ? "中旬" : "下旬");
/** 「M/D」 (or 「Y/M/D」 outside the book's year) → { y?, m, d } */
const ymd = (s: string): { y: number | null; m: number; d: number } | null => {
  const p = s.split("/").map(Number);
  if (p.length === 2 && p.every(Number.isFinite)) return { y: null, m: p[0]!, d: p[1]! };
  if (p.length === 3 && p.every(Number.isFinite)) return { y: p[0]!, m: p[1]!, d: p[2]! };
  return null;
};
/** 「國曆 2/26 水星開始逆行」 → 「國曆 2 月下旬水星開始逆行」: the 年書's dated sky lines, without the day */
export const xunify = (s: string) => s.replace(/(\d{4}\/)?(\d{1,2})\/(\d{1,2}) ?/g, (_m, _y, mm: string, dd: string) => `${Number(mm)} 月${XUN(Number(dd))}`);

export interface MonthBits {
  ym: string; monthNo: number; year: number; register: string | null;
  bazi: { month: Pick<MonthPoint, "term" | "start" | "gz" | "stemTen" | "branchTen" | "level" | "tags">; yearGz: string; yearTen: string | null; favour: string[]; avoid: string[]; dayMaster: string } | null;
  ziwei: { month: Pick<MonthZ, "gz" | "palace" | "stars" | "mut" | "level" | "tags" | "flags">; span: string; yearGz: string } | null;
  astro: { page: (Pick<MonthA, "level" | "tags" | "flags"> & { sky: string[] }) | null; hits: { planet: string; point: string; aspect: string; when: string }[] } | null;
}

/* ------------------------------------------------------------------ what is on file */
function latest<T>(table: string, customerId: number, cols: string, n = 1): T[] {
  try { return db().prepare(`SELECT ${cols} FROM ${table} WHERE customer_id = ? AND paid_at IS NOT NULL ORDER BY created_at DESC LIMIT ${n}`).all(customerId) as T[]; } catch { return []; } // the table exists once a report was ever written
}
function parse<T>(s: string): T | null { try { return JSON.parse(s) as T; } catch { return null; } }

/** the 紫微年書 facts (a 年書's child report, kind year) for lunar year `year` */
export function ziweiYearBookOnFile(customerId: number, year: number): ZiweiFacts | null {
  for (const r of latest<{ chart_json: string }>("ziwei_reports", customerId, "chart_json", 6)) {
    const f = parse<ZiweiFacts>(r.chart_json);
    if (f?.book?.year === year) return f;
  }
  return null;
}
export function astroYearBookOnFile(customerId: number, year: number): AstroFacts | null {
  for (const r of latest<{ chart_json: string }>("astro_reports", customerId, "chart_json", 6)) {
    const f = parse<AstroFacts>(r.chart_json);
    if (f?.book?.year === year) return f;
  }
  return null;
}
export function astroFactsOnFile(customerId: number): AstroFacts | null {
  const r = latest<{ chart_json: string }>("astro_reports", customerId, "chart_json")[0];
  return r ? parse<AstroFacts>(r.chart_json) : null;
}
function registerOnFile(customerId: number): string | null {
  const r = latest<{ register: string | null }>("bazi_reports", customerId, "register")[0];
  return r?.register ?? null;
}

/* ------------------------------------------------------------------ this month in each chart */

/** the 八字 year the 國曆 date (y, m) with this 節氣月 belongs to: January, and February before 立春, are the year before */
export const baziYearOf = (y: number, m: number, term: string) => (m === 1 || (m === 2 && term === "小寒") ? y - 1 : y);
const yearGzOf = (y: number) => SixtyCycleYear.fromYear(y).getSixtyCycle().getName();

/** the 流月 of a 紫微年書 (lunar year `bookYear`) that covers the 國曆 date — the book's months cross into the next calendar year */
export function monthZNow(months: MonthZ[], bookYear: number, today: { y: number; m: number; d: number }): MonthZ | null {
  const t = today.y * 10000 + today.m * 100 + today.d;
  let yFrom = bookYear, yTo = bookYear, prevFrom = 0, prevTo = 0;
  for (const mo of months) {
    const a = ymd(mo.from), b = ymd(mo.to);
    if (!a || !b) continue;
    if (a.m < prevFrom) yFrom++;
    if (b.m < prevTo) yTo++;
    prevFrom = a.m; prevTo = b.m;
    const from = (a.y ?? yFrom) * 10000 + a.m * 100 + a.d, to = (b.y ?? yTo) * 10000 + b.m * 100 + b.d;
    if (from <= t && t <= to) return mo;
  }
  return null;
}

/** the natal points a transit is read against, from the facts' sign and whole degree (the middle of that degree) */
export function pointsOf(af: AstroFacts): { name: string; lon: number }[] {
  const lon = (sign: string, deg: number) => { const i = (SIGNS as readonly string[]).indexOf(sign); return i < 0 ? null : i * 30 + deg + 0.5; };
  const out: { name: string; lon: number }[] = [];
  for (const p of af.planets) {
    if (!["太陽", "月亮", "金星"].includes(p.name) || (p.name === "月亮" && af.moonApprox)) continue;
    const l = lon(p.sign, p.deg);
    if (l !== null) out.push({ name: p.name, lon: l });
  }
  if (af.asc) { const l = lon(af.asc.sign, af.asc.deg); if (l !== null) out.push({ name: "上升", lon: l }); }
  return out;
}

export function monthBits(customerId: number, now = Date.now()): MonthBits | null {
  const d = new Date(now + TPE_MS);
  const today = { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
  const year = today.y, monthNo = today.m;
  const ym = `${year}-${String(monthNo).padStart(2, "0")}`;
  const inMonth = (s: string) => { const x = ymd(s); return !!x && (x.y ?? year) === year && x.m === monthNo; };

  let bazi: MonthBits["bazi"] = null;
  const f = baziFactsOnFile(customerId);
  if (f) {
    const mp = monthNow(f, now);
    if (mp) {
      const by = baziYearOf(year, monthNo, mp.term);
      const yf = f.years?.find((y) => y.year === by);
      bazi = {
        month: { term: mp.term, start: mp.start, gz: mp.gz, stemTen: mp.stemTen, branchTen: mp.branchTen, level: mp.level, tags: mp.tags },
        yearGz: yf?.gz ?? yearGzOf(by), yearTen: yf ? `${yf.stemTen}／${yf.branchTen}` : null, favour: f.favour, avoid: f.avoid, dayMaster: `${f.dayMaster}${f.dmEl}`,
      };
    }
  }

  let ziwei: MonthBits["ziwei"] = null;
  for (const by of [year, year - 1]) {
    const zf = ziweiYearBookOnFile(customerId, by);
    const mo = zf?.book ? monthZNow(zf.book.months, by, today) : null;
    if (zf?.book && mo) {
      ziwei = { month: { gz: mo.gz, palace: mo.palace, stars: mo.stars, mut: mo.mut, level: mo.level, tags: mo.tags, flags: mo.flags }, span: `國曆 ${xunify(mo.from)}–${xunify(mo.to)}`, yearGz: zf.book.gz };
      break;
    }
  }

  let astro: MonthBits["astro"] = null;
  const ab = astroYearBookOnFile(customerId, year);
  if (ab?.book) {
    const page = ab.book.months.find((m) => m.n === monthNo) ?? null;
    const hits = ab.book.hits
      .filter((h) => h.exact.some(inMonth))
      .map((h) => ({ planet: h.planet, point: h.point, aspect: h.aspect, when: `國曆 ${xunify(h.exact.find(inMonth)!)}` }))
      .slice(0, 5);
    astro = { page: page ? { level: page.level, tags: page.tags, flags: page.flags, sky: page.sky.map(xunify).slice(0, 8) } : null, hits };
  } else {
    const af = astroFactsOnFile(customerId);
    const pts = af ? pointsOf(af) : [];
    if (pts.length) {
      const hits: NonNullable<MonthBits["astro"]>["hits"] = [];
      try {
        for (const planet of ["木星", "土星"]) {
          for (const h of exactHits(planet, pts, year, "Asia/Taipei", 1)) {
            if (h.exact.some(inMonth)) hits.push({ planet: h.planet, point: h.point, aspect: h.aspect, when: `國曆 ${monthNo} 月（前後幾天）` });
            else if (inMonth(h.from) || inMonth(h.to)) hits.push({ planet: h.planet, point: h.point, aspect: h.aspect, when: `國曆 ${monthNo} 月前後` });
          }
        }
      } catch { /* no sky this month */ }
      if (hits.length) astro = { page: null, hits: hits.slice(0, 4) };
    }
  }

  if (!bazi && !ziwei && !astro) return null;
  return { ym, monthNo, year, register: registerOnFile(customerId), bazi, ziwei, astro };
}

/* ------------------------------------------------------------------ the writing */
const RULES = [
  "You write for YaoFlow, a Taiwanese site about the Yijing, temple lots, tarot and birth charts. A member gets a short letter at the start of each 國曆 month about THIS month, read from their own charts. You are given computed facts only, as JSON; write the paragraphs asked for and nothing else.",
  "`bazi` (when given): the 節氣月 this month falls in — its 干支 (gz), the 十神 of its stem and branch for the day master (stemTen, branchTen), its level (1 = the month to slow down most … 5 = the smoothest) and its tags (喜用 = helps the chart, 偏耗 = drains it, and the month branch's relation to the day or month branch), plus the year's 干支 and 十神, the chart's favour / avoid elements and its day master. `ziwei` (when given): the 流月 entry of the member's 紫微年書 — the natal palace the month's 命宮 sits in, its stars, the month's 四化 (mut), level, tags and flags, and the span of the lunar month in 國曆 terms. `astro` (when given): this month's page of the member's 星盤年書 (level, tags, flags, the sky in words) and the exact transits of 木星 / 土星 to their 太陽 / 月亮 / 金星 / 上升 this month.",
  "VOICE: a friend who knows the charts; plain words, short sentences (about 25 characters each), second person 你. Tendencies, not fate: 容易、多半、傾向、可以. Name the chart terms (the 十神, the palace, the stars, the planets) once each so the reader sees it is THEIR chart, then say what it means in daily life. Each paragraph ends with one concrete thing to do, or to leave alone, this month.",
  "TIME: name the month only as 「國曆 N 月」. Inside the month say 上旬 / 中旬 / 下旬 or 月初 / 月中 / 月底 — never a day of the month, never 「M/D」, never 「N月N日」. Never a lunar word (農曆, 正月, 臘月, 初一).",
  "HARD RULES — never write 吉, 凶, 準 as a claim of accuracy, 保證, 一定會, 必定, 注定, AI, 人工智慧, 神明說, 靈驗, 改運, 化解, 開運, 風水, 大師, 血光, 破財, 離婚, 太歲, 克 / 剋 (say 制 or 帶著走); no medical, investment or legal advice; never talk about how the letter or the reading is made, never mention rules, levels as numbers, data, JSON or a model. No English words. Plain text, no markdown, no emoji, no headings inside a paragraph.",
];
function languageLine(locale: string, register: string | null): string {
  if (locale === "zh") return "LANGUAGE: Simplified Chinese as written in mainland China (简体中文), second person 你. Write chart terms in Simplified too; the calendar word is 公历.";
  if (register === "hk") return `LANGUAGE: Traditional Chinese, second person 你. ${HK_WRITTEN_NOTE}`;
  return "LANGUAGE: Traditional Chinese as people in Taiwan write it (繁體中文，台灣用語), second person 你. Write every chart term in Traditional characters.";
}
export interface MonthText { keyword: string; bazi?: string; ziwei?: string; astro?: string }
const chars = (s: string) => [...s.replace(/\s/g, "")].length;

/** what the model is given: the bits without the dated field the letter prints itself (the 節氣月's start) */
export function modelFacts(b: MonthBits): Record<string, unknown> {
  return {
    month: `國曆 ${b.monthNo} 月`,
    bazi: b.bazi ? { month: { term: b.bazi.month.term, gz: b.bazi.month.gz, stemTen: b.bazi.month.stemTen, branchTen: b.bazi.month.branchTen, level: b.bazi.month.level, tags: b.bazi.month.tags }, year: { gz: b.bazi.yearGz, ten: b.bazi.yearTen }, favour: b.bazi.favour, avoid: b.bazi.avoid, dayMaster: b.bazi.dayMaster } : undefined,
    ziwei: b.ziwei ? { ...b.ziwei.month, span: b.ziwei.span, yearGz: b.ziwei.yearGz } : undefined,
    astro: b.astro ? { page: b.astro.page ?? undefined, hits: b.astro.hits } : undefined,
  };
}

export async function writeMonthLetter(b: MonthBits, locale: string, register: string | null): Promise<MonthText | null> {
  const want = [b.bazi ? '"bazi": the 八字 paragraph (150–260 characters)' : "", b.ziwei ? '"ziwei": the 紫微 paragraph (150–260 characters)' : "", b.astro ? '"astro": the sky paragraph (120–220 characters)' : ""].filter(Boolean).join(", ");
  const task = `Write this month's letter. Fields: "keyword": one word for the month, 2–4 Chinese characters; ${want}. Output JSON only.`;
  const messages: LlmMessage[] = [
    { role: "system", content: [...RULES, languageLine(locale, register)].join("\n") },
    { role: "user", content: JSON.stringify({ task, ...modelFacts(b) }) },
  ];
  let last = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const raw = await chatJson(messages, { temperature: attempt === 0 ? 0.7 : 0.5, maxTokens: 2200 });
      let j: Record<string, unknown> | null = null;
      try { j = parseJsonLoose<Record<string, unknown>>(raw).value; } catch { j = null; }
      const str = (v: unknown) => (typeof v === "string" ? nsScript(v.trim(), locale) : "");
      const out: MonthText = { keyword: str(j?.keyword).replace(/[\s，。、「」]/g, "").slice(0, 6) };
      if (b.bazi) out.bazi = str(j?.bazi);
      if (b.ziwei) out.ziwei = str(j?.ziwei);
      if (b.astro) out.astro = str(j?.astro);
      const short = (["bazi", "ziwei", "astro"] as const).find((k) => k in out && chars(out[k] ?? "") < 60);
      const bad = !out.keyword ? "keyword" : short ? `short:${short}` : nsOffense(out as unknown as Record<string, unknown>);
      if (!bad) return out;
      last = bad;
      const hint = /^(date|lunar):/.test(bad) ? "Name the month only as 「國曆 N 月」 and a time inside it only as 上旬 / 中旬 / 下旬." : bad.startsWith("short") || bad === "keyword" ? "Keep every field and write the full length." : "Follow the HARD RULES.";
      messages.push({ role: "assistant", content: raw }, { role: "user", content: `REWRITE REQUIRED (${bad}). ${hint} Output the JSON again.` });
    } catch (e) { last = (e instanceof Error ? e.message : "?").slice(0, 60); }
  }
  recordOps("month_letter_fail", last);
  return null;
}

/* ------------------------------------------------------------------ the letter and the run */
const PAPER = "#f4f2ec", INK = "#14151c", INK_86 = "rgba(20,21,28,0.86)", INK_66 = "rgba(20,21,28,0.66)", INK_50 = "rgba(20,21,28,0.5)", GOLD = "#8a6c2c", RULE = "rgba(20,21,28,0.14)";
const FONT = "'Noto Serif TC','Songti TC','PingFang TC',serif";
const BTN = `display:inline-block;padding:12px 24px;border-radius:2px;background:${INK};color:${PAPER};text-decoration:none;font-size:14px;letter-spacing:.08em;`;
const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]!));

export function buildMonthLetter(b: MonthBits, t: MonthText, locale: "zh" | "zh-hant", site: string, email: string): { subject: string; html: string; text: string; unsubUrl: string } {
  const z = (s: string) => (locale === "zh" ? toHans(s).replace(/国历/g, "公历") : s);
  const unsubUrl = letterUnsubUrl(site, email, locale);
  const castUrl = `${site}/${locale}/cast?c=moletter`, chartUrl = `${site}/${locale}/bazi/chart?c=moletter`;
  const block = (label: string, body: string) => `<p style="font-size:12px;letter-spacing:.2em;color:${GOLD};margin:26px 0 8px;">${esc(z(label))}</p><p style="font-size:15px;line-height:1.9;margin:0;color:${INK_86};">${esc(body)}</p>`;
  const parts: string[] = [], lines: string[] = [];
  if (t.bazi && b.bazi) { const l = `八字 · ${b.bazi.month.term}月（國曆 ${b.bazi.month.start} 起）`; parts.push(block(l, t.bazi)); lines.push(`${z(l)}\n${t.bazi}`); }
  if (t.ziwei && b.ziwei) { const l = `紫微 · 流月在${b.ziwei.month.palace}`; parts.push(block(l, t.ziwei)); lines.push(`${z(l)}\n${t.ziwei}`); }
  if (t.astro && b.astro) { parts.push(block("星象", t.astro)); lines.push(`${z("星象")}\n${t.astro}`); }
  const head = z(`國曆 ${b.monthNo} 月 · 流月信`);
  const html = `<!doctype html><html lang="${locale === "zh" ? "zh-CN" : "zh-Hant"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${PAPER};color:${INK};font-family:${FONT};"><div style="max-width:560px;margin:0 auto;padding:40px 24px 36px;">
<p style="letter-spacing:.35em;font-size:12px;color:${INK_50};margin:0 0 6px;">YAOFLOW</p>
<p style="font-size:13px;color:${INK_66};margin:0 0 10px;">${esc(head)}</p>
<p style="font-size:26px;line-height:1.3;margin:0;color:${INK};">${esc(t.keyword)}</p>
${parts.join("")}
<p style="margin:28px 0 10px;"><a href="${esc(castUrl)}" style="${BTN}">${esc(z("這個月有事要問，起一卦"))}</a></p>
<p style="margin:0 0 22px;"><a href="${esc(chartUrl)}" style="font-size:13px;color:${INK_66};">${esc(z("看你的盤"))} →</a></p>
<hr style="border:none;border-top:1px solid ${RULE};margin:8px 0 14px;">
<p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(z("會員專屬，每個月初一封；說的是這個月的傾向，不是結論。"))} <a href="${esc(unsubUrl)}" style="color:${INK_50};">${esc(z("不用再寄"))}</a></p>
</div></body></html>`;
  const text = [head, t.keyword, "", ...lines.flatMap((x) => [x, ""]), `${z("起一卦")}: ${castUrl}`, "", `${z("不用再寄")}: ${unsubUrl}`].join("\n");
  return { subject: z(`流月信｜國曆 ${b.monthNo} 月：${t.keyword}`), html, text, unsubUrl };
}

/** a letter that failed (the model or the send) is tried again after six hours, not on every sweep */
const triedLately = (key: string, now: number) =>
  !!db().prepare("SELECT 1 FROM emails WHERE session_id = ? AND kind = 'month_letter' AND status <> 'sent' AND sent_at > ?").get(key, now - 6 * 3600_000);

/** the fulfil sweep: the first three days of a 國曆 month, 08:00–21:00 台北, each member once a month, a few per sweep (each is a model call) */
export async function runMonthLetters(now = Date.now(), site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, ""), max = 12): Promise<{ sent: number; failed: number; skipped: number; generic?: number }> {
  const out: { sent: number; failed: number; skipped: number; generic?: number } = { sent: 0, failed: 0, skipped: 0 };
  if ((process.env.MONTH_LETTER ?? "on") === "off") return out;
  if (!letterOn("month_letter")) return out; // 10-23 进度表 108: turned off in /admin/letters
  const d = new Date(now + TPE_MS);
  if (d.getUTCDate() > 3 || d.getUTCHours() < 8 || d.getUTCHours() >= 21) return out;
  const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const rows = db().prepare(`SELECT DISTINCT c.id AS cid, c.email, c.locale FROM subscriptions s JOIN customers c ON c.id = s.customer_id
    WHERE s.status IN ('active','trialing','past_due') AND substr(s.stripe_subscription_id,1,5) <> 'pass_' AND c.locale IN ('zh','zh-hant') AND c.email LIKE '%@%'`).all() as { cid: number; email: string; locale: string }[];
  const { sendEmail } = await import("./email");
  let n = 0;
  for (const r of rows) {
    if (n >= max) break;
    const key = `mo:${r.cid}:${ym}`;
    if (emailAlreadySent(key, "month_letter") || triedLately(key, now)) continue;
    if (!memberLetterEligible(r.cid, r.locale, now)) { out.skipped++; continue; }
    const bits = monthBits(r.cid, now);
    const locale = r.locale === "zh" ? "zh" : "zh-hant";
    if (!bits) {
      // 11-01 进度表 133: no chart on file — the month as everyone shares it, and the way to make next month's their own.
      // The words are written once per month and script, so this costs no model call per member and is not capped by `max`
      const g = genericBits(now);
      const variant = locale === "zh" ? "zh" : registerOnFile(r.cid) === "hk" ? "hk" : "zh-hant";
      const gt = await genericText(g, variant);
      if (!gt) { recordEmail(key, "month_letter", r.email, "failed", "generic_write"); out.failed++; continue; }
      // 11-05 进度表 137: a 本命卦 on file reads the month against it (the birth button stays — a chart is still the fuller letter)
      let bmgBlock: ReturnType<typeof monthBmgText> | null = null;
      try { const b = featureOn("bmg") ? latestBmg({ customerId: r.cid }) : null; if (b) bmgBlock = monthBmgText(linesOf(b.lines), now); } catch { /* the plain version */ }
      const m = buildGenericLetter(g, gt, locale, site, r.email, birthToken(r.cid, ym, now), bmgBlock);
      recordEmail(key, "month_letter", r.email, "pending", bmgBlock ? "generic_bmg" : "generic"); // a sent row keeps the mail id (opens); the version is read from month_letter_birth
      const res = await sendEmail(r.email, m.subject, m.html, m.text, { kind: "daily", customerId: r.cid, locale, unsubUrl: m.unsubUrl });
      recordEmail(key, "month_letter", r.email, res.ok ? "sent" : "failed", res.ok ? res.id : `generic:${res.error ?? "?"}`);
      if (res.ok) out.sent++; else out.failed++;
      out.generic = (out.generic ?? 0) + (res.ok ? 1 : 0);
      continue;
    }
    n++;
    const text = await writeMonthLetter(bits, locale, bits.register);
    if (!text) { recordEmail(key, "month_letter", r.email, "failed", "write"); out.failed++; continue; }
    const m = buildMonthLetter(bits, text, locale, site, r.email);
    recordEmail(key, "month_letter", r.email, "pending");
    const res = await sendEmail(r.email, m.subject, m.html, m.text, { kind: "daily", customerId: r.cid, locale, unsubUrl: m.unsubUrl });
    recordEmail(key, "month_letter", r.email, res.ok ? "sent" : "failed", res.error ?? res.id);
    if (res.ok) out.sent++; else out.failed++;
  }
  return out;
}
