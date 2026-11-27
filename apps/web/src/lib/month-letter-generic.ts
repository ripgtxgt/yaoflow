import { randomBytes } from "node:crypto";
import { SolarDay, SolarTerm } from "tyme4ts";
import { db, recordOps } from "./db";
import { chatJson, parseJsonLoose, type LlmMessage } from "./llm";
import { HK_WRITTEN_NOTE } from "./reading";
import { toHans, toHant } from "./hant";
import { nsOffense, nsScript } from "./mingli/nianshu/report";
import { eclipsesOf, retrogrades } from "./mingli/astro/report-sky";
import { letterUnsubUrl } from "./member-letter";

/**
 * 11-01 进度表 133 (Neil：「要」) — the 流月信 for a member with no chart on file. On 11-01 43 of the 66 members it reached
 * were skipped as `no_chart`: the member perk reached a third of them. Those members now get the month as everyone shares it —
 * the 節氣 inside the 國曆 month and the 節氣月 they open, the year's 干支, the sky (水星／金星／火星 retrograde, eclipses)
 * — nothing about a person, and one line with a button: add your birth details and from next month the letter is your own.
 * The words are written once per month and script (繁 / 简 / 港) and kept; each send gets a token so the button's clicks
 * and the charts added after them are counted (/admin/letters). Same checks as the personal letter (nsOffense).
 */
const TPE_MS = 8 * 3600_000;
const XUN = (d: number) => (d <= 10 ? "上旬" : d <= 20 ? "中旬" : "下旬");

export interface GenericBits {
  ym: string; year: number; monthNo: number; yearGz: string;
  terms: { name: string; jie: boolean; when: string }[];   // the 節氣 inside the month, 「國曆 N 月上旬」
  monthGz: { gz: string; from: string }[];                  // the 節氣月 the month spans (the second one opens at the month's 節)
  sky: string[];                                            // the month's retrogrades and eclipses, in words, no day
}

export function genericBits(now = Date.now()): GenericBits {
  const t = new Date(now + TPE_MS);
  const year = t.getUTCFullYear(), monthNo = t.getUTCMonth() + 1;
  const ym = `${year}-${String(monthNo).padStart(2, "0")}`;
  const found: { name: string; jie: boolean; day: number }[] = [];
  for (const y of [year, year + 1]) for (let i = 0; i < 24; i++) {
    const s = SolarTerm.fromIndex(y, i);
    const d = s.getJulianDay().getSolarDay();
    if (d.getYear() === year && d.getMonth() === monthNo && !found.some((x) => x.name === toHant(s.getName()))) found.push({ name: toHant(s.getName()), jie: s.isJie(), day: d.getDay() });
  }
  found.sort((x, y) => x.day - y.day);
  const terms = found.map((x) => ({ name: x.name, jie: x.jie, when: `國曆 ${monthNo} 月${XUN(x.day)}` }));
  const gzOn = (d: number) => SolarDay.fromYmd(year, monthNo, d).getSixtyCycleDay();
  const monthGz: GenericBits["monthGz"] = [{ gz: gzOn(1).getMonth().getName(), from: `國曆 ${monthNo} 月初` }];
  const jie = found.find((x) => x.jie);
  if (jie) { const g = gzOn(jie.day).getMonth().getName(); if (g !== monthGz[0]!.gz) monthGz.push({ gz: g, from: `${jie.name}（國曆 ${monthNo} 月${XUN(jie.day)}）起` }); }
  const yearGz = gzOn(15).getYear().getName();

  // the sky: a stretch counts when it covers any of the month (Taipei)
  const m0 = Date.UTC(year, monthNo - 1, 1) - TPE_MS, m1 = Date.UTC(year, monthNo, 1) - TPE_MS;
  const xun = (ms: number) => { const d = new Date(ms + TPE_MS); return d.getUTCFullYear() === year && d.getUTCMonth() + 1 === monthNo ? `${monthNo} 月${XUN(d.getUTCDate())}` : `${d.getUTCFullYear() !== year ? `${d.getUTCFullYear()} 年` : ""}${d.getUTCMonth() + 1} 月${XUN(d.getUTCDate())}`; };
  const sky: string[] = [];
  for (const planet of ["水星", "金星", "火星"]) {
    let list: { fromMs: number; toMs: number }[] = [];
    try { list = retrogrades(planet, year, "Asia/Taipei", null); } catch { list = []; }
    for (const r of list) if (r.fromMs < m1 && r.toMs >= m0) sky.push(`${planet}逆行：國曆 ${xun(r.fromMs)}到 ${xun(r.toMs)}`);
  }
  try {
    for (const e of eclipsesOf(year, "Asia/Taipei")) if (e.ms >= m0 && e.ms < m1) sky.push(`${e.type === "solar" ? "日食" : "月食"}：國曆 ${xun(e.ms)}，在${e.sign}`);
  } catch { /* no sky */ }
  return { ym, year, monthNo, yearGz, terms, monthGz, sky };
}

/* ------------------------------------------------------------------ the words, once a month per script */
export interface GenericText { keyword: string; season: string; sky: string }

const RULES = [
  "You write for YaoFlow, a Taiwanese site about the Yijing, temple lots, tarot and birth charts. A member gets a short letter at the start of each 國曆 month. This member has no birth chart on file, so the letter is about THIS month as everyone shares it — you are given public facts only, as JSON. Never guess anything about the reader's own chart, age, sign or life.",
  "`terms`: the 節氣 inside the month and when (上旬 / 中旬 / 下旬); `monthGz`: the 節氣月 the month spans (its 干支, and when the second one opens); `yearGz`: the year's 干支; `sky`: the month's retrogrades and eclipses (may be empty — then the sky is calm, say so in one or two sentences and what that is good for).",
  "\"season\": what the 節氣 and the 節氣月 mean for daily life this month — the season's turn, the element of the month's 干支 in plain words, what the time favours (rest, planning, finishing, people…). \"sky\": what the retrogrades / eclipses tend to bring and what to do with them. Each paragraph ends with one concrete thing to do, or to leave alone, this month.",
  "VOICE: a friend who knows the calendar; plain words, short sentences (about 25 characters each), second person 你. Tendencies, not fate: 容易、多半、傾向、可以.",
  "TIME: name the month only as 「國曆 N 月」. Inside the month say 上旬 / 中旬 / 下旬 or 月初 / 月中 / 月底 — never a day of the month, never 「M/D」, never 「N月N日」. Never a lunar word (農曆, 正月, 臘月, 初一).",
  "HARD RULES — never write 吉, 凶, 準 as a claim of accuracy, 保證, 一定會, 必定, 注定, AI, 人工智慧, 神明說, 靈驗, 改運, 化解, 開運, 風水, 大師, 血光, 破財, 離婚, 太歲, 克 / 剋 (say 制 or 帶著走), 免費; no medical, investment or legal advice; never talk about how the letter is made, never mention rules, data, JSON or a model. No English words. Plain text, no markdown, no emoji.",
];
function languageLine(variant: string): string {
  if (variant === "zh") return "LANGUAGE: Simplified Chinese as written in mainland China (简体中文), second person 你. The calendar word is 公历.";
  if (variant === "hk") return `LANGUAGE: Traditional Chinese, second person 你. ${HK_WRITTEN_NOTE}`;
  return "LANGUAGE: Traditional Chinese as people in Taiwan write it (繁體中文，台灣用語), second person 你.";
}
const chars = (s: string) => [...s.replace(/\s/g, "")].length;

function ensure() {
  db().exec(`CREATE TABLE IF NOT EXISTS month_letter_generic (ym TEXT NOT NULL, variant TEXT NOT NULL, json TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (ym, variant));
    CREATE TABLE IF NOT EXISTS month_letter_birth (token TEXT PRIMARY KEY, customer_id INTEGER NOT NULL, ym TEXT NOT NULL, sent_at INTEGER NOT NULL, clicked_at INTEGER);
    CREATE INDEX IF NOT EXISTS month_letter_birth_ym ON month_letter_birth (ym);`);
}

/** the month's shared words for one script (zh / zh-hant / hk): written once, kept */
export async function genericText(b: GenericBits, variant: string): Promise<GenericText | null> {
  ensure();
  const kept = db().prepare("SELECT json FROM month_letter_generic WHERE ym = ? AND variant = ?").get(b.ym, variant) as { json: string } | undefined;
  if (kept) { try { return JSON.parse(kept.json) as GenericText; } catch { /* write again */ } }
  const locale = variant === "zh" ? "zh" : "zh-hant";
  const facts = { month: `國曆 ${b.monthNo} 月`, yearGz: b.yearGz, terms: b.terms, monthGz: b.monthGz, sky: b.sky };
  const messages: LlmMessage[] = [
    { role: "system", content: [...RULES, languageLine(variant)].join("\n") },
    { role: "user", content: JSON.stringify({ task: 'Write this month\'s letter. Fields: "keyword": one word for the month, 2–4 Chinese characters; "season": 150–240 characters; "sky": 90–200 characters. Output JSON only.', ...facts }) },
  ];
  let last = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const raw = await chatJson(messages, { temperature: attempt === 0 ? 0.7 : 0.5, maxTokens: 1600 });
      let j: Record<string, unknown> | null = null;
      try { j = parseJsonLoose<Record<string, unknown>>(raw).value; } catch { j = null; }
      const str = (v: unknown) => (typeof v === "string" ? nsScript(v.trim(), locale) : "");
      const out: GenericText = { keyword: str(j?.keyword).replace(/[\s，。、「」]/g, "").slice(0, 6), season: str(j?.season), sky: str(j?.sky) };
      const bad = !out.keyword ? "keyword" : chars(out.season) < 60 ? "short:season" : chars(out.sky) < 30 ? "short:sky" : /免費|免费/.test(out.season + out.sky) ? "banned:免費" : nsOffense(out as unknown as Record<string, unknown>);
      if (!bad) {
        db().prepare("INSERT OR REPLACE INTO month_letter_generic (ym, variant, json, at) VALUES (?,?,?,?)").run(b.ym, variant, JSON.stringify(out), Date.now());
        return out;
      }
      last = bad;
      messages.push({ role: "assistant", content: raw }, { role: "user", content: `REWRITE REQUIRED (${bad}). Follow the TIME and HARD RULES and keep every field full length. Output the JSON again.` });
    } catch (e) { last = (e instanceof Error ? e.message : "?").slice(0, 60); }
  }
  recordOps("month_letter_fail", `generic ${variant}: ${last}`);
  return null;
}

/* ------------------------------------------------------------------ the letter */
const PAPER = "#f4f2ec", INK = "#14151c", INK_86 = "rgba(20,21,28,0.86)", INK_66 = "rgba(20,21,28,0.66)", INK_50 = "rgba(20,21,28,0.5)", GOLD = "#8a6c2c", RULE = "rgba(20,21,28,0.14)";
const FONT = "'Noto Serif TC','Songti TC','PingFang TC',serif";
const BTN = `display:inline-block;padding:12px 24px;border-radius:2px;background:${INK};color:${PAPER};text-decoration:none;font-size:14px;letter-spacing:.08em;`;
const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]!));

/** a send's token: the button goes through /api/member-letter/birth?t=… (counts the click, then the chart page) */
export function birthToken(customerId: number, ym: string, now = Date.now()): string {
  ensure();
  const token = randomBytes(12).toString("base64url");
  db().prepare("INSERT INTO month_letter_birth (token, customer_id, ym, sent_at) VALUES (?,?,?,?)").run(token, customerId, ym, now);
  return token;
}

export const SUBJECT_TAIL = "大家的這個月";

/** 11-05 进度表 137: a member with no chart but a 本命卦 gets the month read against it (lib/bmg-month.ts) */
export interface BmgMonthBlock { title: string; body: string; yueling: string; tiandi: string; tip: string; hexName: string }

export function buildGenericLetter(b: GenericBits, t: GenericText, locale: "zh" | "zh-hant", site: string, email: string, token: string, bmg?: BmgMonthBlock | null): { subject: string; html: string; text: string; unsubUrl: string } {
  const z = (s: string) => (locale === "zh" ? toHans(s).replace(/国历/g, "公历") : s);
  const unsubUrl = letterUnsubUrl(site, email, locale);
  const birthUrl = `${site}/api/member-letter/birth?t=${encodeURIComponent(token)}&l=${locale}`;
  const castUrl = `${site}/${locale}/cast?c=moletter`;
  const block = (label: string, body: string) => `<p style="font-size:12px;letter-spacing:.2em;color:${GOLD};margin:26px 0 8px;">${esc(z(label))}</p><p style="font-size:15px;line-height:1.9;margin:0;color:${INK_86};">${esc(body)}</p>`;
  const seasonLabel = `節氣 · ${b.terms.map((x) => x.name).join("、")}${b.monthGz.length > 1 ? ` · 入${b.monthGz[1]!.gz}月` : ` · ${b.monthGz[0]!.gz}月`}`;
  const head = z(`國曆 ${b.monthNo} 月 · 流月信`);
  const birthLine = z("這封寫的是大家共有的這個月。補上出生資料，下個月起這封信就按你自己的命盤寫。");
  const html = `<!doctype html><html lang="${locale === "zh" ? "zh-CN" : "zh-Hant"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${PAPER};color:${INK};font-family:${FONT};"><div style="max-width:560px;margin:0 auto;padding:40px 24px 36px;">
<p style="letter-spacing:.35em;font-size:12px;color:${INK_50};margin:0 0 6px;">YAOFLOW</p>
<p style="font-size:13px;color:${INK_66};margin:0 0 10px;">${esc(head)}</p>
<p style="font-size:26px;line-height:1.3;margin:0;color:${INK};">${esc(t.keyword)}</p>
${bmg ? `${block(bmg.title, z(bmg.body))}
<p style="font-size:14px;line-height:1.9;margin:14px 0 0;color:${INK_66};">《禮記・月令》：${esc(z(bmg.yueling))}</p>
<p style="font-size:15px;line-height:1.9;margin:8px 0 0;color:${INK_86};">${esc(z(bmg.tiandi))}</p>
<p style="font-size:15px;line-height:1.9;margin:8px 0 0;color:${INK_86};">${esc(z(bmg.tip))}</p>` : ""}
${block(seasonLabel, t.season)}
${block("天象", t.sky)}
<div style="margin:30px 0 8px;padding:18px 18px 20px;border:1px solid ${RULE};">
<p style="font-size:14px;line-height:1.8;margin:0 0 14px;color:${INK_86};">${esc(birthLine)}</p>
<a href="${esc(birthUrl)}" style="${BTN}">${esc(z("補上出生資料"))}</a>
</div>
<p style="margin:18px 0 22px;"><a href="${esc(castUrl)}" style="font-size:13px;color:${INK_66};">${esc(z("這個月有事要問，起一卦"))} →</a></p>
<hr style="border:none;border-top:1px solid ${RULE};margin:8px 0 14px;">
<p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(z("會員專屬，每個月初一封；說的是這個月的傾向，不是結論。"))} <a href="${esc(unsubUrl)}" style="color:${INK_50};">${esc(z("不用再寄"))}</a></p>
</div></body></html>`;
  const bmgText = bmg ? [z(bmg.title), z(bmg.body), z(`《禮記・月令》：${bmg.yueling}`), z(bmg.tiandi), z(bmg.tip), ""] : [];
  const text = [head, t.keyword, "", ...bmgText, z(seasonLabel), t.season, "", z("天象"), t.sky, "", birthLine, `${z("補上出生資料")}: ${birthUrl}`, "", `${z("起一卦")}: ${castUrl}`, "", `${z("不用再寄")}: ${unsubUrl}`].join("\n");
  return { subject: z(bmg ? `流月信｜國曆 ${b.monthNo} 月：${bmg.hexName}卦的這個月` : `流月信｜國曆 ${b.monthNo} 月：${SUBJECT_TAIL}`), html, text, unsubUrl };
}

/* ------------------------------------------------------------------ the click and the numbers */
export function noteBirthClick(token: string, now = Date.now()): boolean {
  ensure();
  const had = db().prepare("SELECT 1 FROM month_letter_birth WHERE token = ?").get(token);
  if (!had) return false;
  db().prepare("UPDATE month_letter_birth SET clicked_at = COALESCE(clicked_at, ?) WHERE token = ?").run(now, token);
  return true;
}

/** /admin/letters: this month's 流月信 by version, the button's clicks, and the charts added within 7 days of a click */
export function monthLetterSplit(ym: string): { ym: string; personal: number; generic: number; skipped: number; clicked: number; charted: number } {
  ensure();
  const one = (sql: string, ...a: unknown[]) => { try { return Number((db().prepare(sql).get(...(a as never[])) as { v: number } | undefined)?.v ?? 0); } catch { return 0; } };
  const like = `mo:%:${ym}`;
  // the key is mo:<customer>:<ym>; a generic send is one whose customer got a 「補上出生資料」 token this month
  const gen = `CAST(substr(session_id, 4, instr(substr(session_id, 4), ':') - 1) AS INTEGER) IN (SELECT customer_id FROM month_letter_birth WHERE ym = ?)`;
  return {
    ym,
    personal: one(`SELECT COUNT(*) AS v FROM emails WHERE kind = 'month_letter' AND session_id LIKE ? AND status = 'sent' AND NOT ${gen}`, like, ym),
    generic: one(`SELECT COUNT(*) AS v FROM emails WHERE kind = 'month_letter' AND session_id LIKE ? AND status = 'sent' AND ${gen}`, like, ym),
    skipped: one("SELECT COUNT(*) AS v FROM emails WHERE kind = 'month_letter' AND session_id LIKE ? AND status = 'skipped'", like),
    clicked: one("SELECT COUNT(*) AS v FROM month_letter_birth WHERE ym = ? AND clicked_at IS NOT NULL", ym),
    charted: one(`SELECT COUNT(DISTINCT b.customer_id) AS v FROM month_letter_birth b WHERE b.ym = ? AND b.clicked_at IS NOT NULL
      AND (EXISTS (SELECT 1 FROM bazi_reports r WHERE r.customer_id = b.customer_id AND r.paid_at IS NOT NULL AND r.created_at BETWEEN b.clicked_at AND b.clicked_at + 7 * 86400000)
        OR EXISTS (SELECT 1 FROM astro_reports r WHERE r.customer_id = b.customer_id AND r.paid_at IS NOT NULL AND r.created_at BETWEEN b.clicked_at AND b.clicked_at + 7 * 86400000))`, ym),
  };
}
