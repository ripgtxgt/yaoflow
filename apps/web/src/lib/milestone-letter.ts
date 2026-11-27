import { db, emailAlreadySent, recordEmail, recordOps } from "./db";
import { letterOn } from "./letter-switch";
import { featureOn } from "./features";
import { toHans } from "./hant";
import { baziFactsOnFile, letterUnsubUrl, memberLetterEligible, memberLetterOff } from "./member-letter";
import type { ChartFacts, MonthPoint } from "./mingli/bazi/report-facts";
import type { Decade } from "./mingli/bazi/chart";
import { nianshuPath } from "./mingli/nianshu/report";
import { nsForeignText } from "./mingli/nianshu/foreign-text";
import { josa } from "./mingli/bazi/names-fmt";
import { fmt, isForeign, type Foreign } from "./l10n/core";
import { mdIn } from "./l10n/dates";
import { isLocale, LOCALE_META, type Locale } from "./locales";
import { KEY_MONTH_WORD, keyMonthEndUtc, keyMonthSpanIn, scheduleNianshuRevisit } from "./self-revisit";
/** 10-22 进度表 85: moved to lib/self-revisit.ts (a 年書 now gets its key months at purchase); re-exported for the letter's tests */
export { keyMonthEndUtc };

/**
 * 10-22 进度表 75 ⑦ 「在報告裡埋回來的日子」 — two letters that go out when a day the reports named arrives, written from
 * the facts on file (no model call), nothing about a birth:
 *   大運交接   a member whose 八字 大運 changes this calendar year (Decade.startYear) hears it once, the first time the sweep
 *             finds them in that year: which 十神 the new ten years carry and what that tends to mean
 *   年書關鍵月  a 年書 buyer hears when one of the three months the book singled out (pivot / slow / smooth, YearBook.key)
 *             begins — the 節氣月's start, the first three days — once per month per book
 * Same one-click stop as the member letters (member_letter_off). 08:00–21:00 台北.
 */
const TPE_MS = 8 * 3600_000, DAY = 86_400_000;
const PAPER = "#f4f2ec", INK = "#14151c", INK_86 = "rgba(20,21,28,0.86)", INK_66 = "rgba(20,21,28,0.66)", INK_50 = "rgba(20,21,28,0.5)", GOLD = "#8a6c2c", RULE = "rgba(20,21,28,0.14)";
const FONT = "'Noto Serif TC','Songti TC','PingFang TC',serif";
const BTN = `display:inline-block;padding:12px 24px;border-radius:2px;background:${INK};color:${PAPER};text-decoration:none;font-size:14px;letter-spacing:.08em;`;
const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]!));

/** the ten 十神 as tendencies for a ten-year stretch (繁體; 简体 converted) */
export const TEN_WORDS: Record<string, string> = {
  比肩: "比肩當運，靠自己、靠同輩的十年：合作與競爭都會多，錢多半自己掙；適合把本事練紮實，別急著替人扛。",
  劫財: "劫財當運，人多事雜的十年：朋友多、往來多，錢進得快也出得快；合夥要寫清楚，花錢先想過。",
  食神: "食神當運，鬆一點的十年：想做的事、想吃的、想玩的都上來，表達與創作順手；留意把興趣做成事，而不是只享受。",
  傷官: "傷官當運，有想法、有脾氣的十年：才華露得出來，也容易與上面的人對撞；把鋒利放在作品上，少放在話上。",
  正財: "正財當運，務實的十年：收入偏穩，靠耐心累積；適合定計畫、置產、經營長久的關係，別貪快。",
  偏財: "偏財當運，機會多的十年：錢來自多處、人脈活絡，也容易散；投入與花費都設上限，看清楚再動。",
  正官: "正官當運，被看見、被要求的十年：職位、責任、名聲多半往上走，規矩也多；穩住節奏，承諾過的事要做到。",
  七殺: "七殺當運，壓力與突破並存的十年：事情推著你走，磨出能力也磨人；把力氣放在一件值得拼的事上，身體要顧。",
  正印: "正印當運，有人撐、有東西學的十年：長輩、老師、文書與學習的事順；適合進修、沉澱，別把安穩當成不動。",
  偏印: "偏印當運，往內走的十年：思考多、直覺強，容易獨來獨往；給自己一門專精的功夫，也別把人推太遠。",
};
/** the marks a key month carries (monthFlags) in plain words */
const FLAG_WORDS: Record<string, string> = {
  冲日支: "跟你的日支相沖，變動大的一個月：換位置、換主意、有人走有人來",
  合日支: "合你的日支，容易有人靠近、有事談成",
  合日干: "合你的日干，想配合人、也容易被人帶著走",
  冲月支: "沖月支，家裡與工作的節奏會被打亂一下",
  合月支: "合月支，環境順，適合把事定下來",
  刑日支: "刑日支，心裡容易有疙瘩，話慢一點說",
  害日支: "害日支，小人小事多，別為小事翻臉",
  天乙贵人: "天乙貴人到，有人幫一把的月份，該開口就開口",
  禄神: "祿神到，靠本事吃飯的月份，手上的活要做足",
  驿马: "驛馬動，走動、出差、搬遷的事多",
  桃花: "桃花到，人緣與感情的月份",
  旬空: "旬空，事情先別急著定，等它落地",
  文昌: "文昌到，讀書、考試、寫東西順",
  伏吟大运: "與大運伏吟，老問題會再回來一次，這次把它處理完",
  伏吟流年: "與流年伏吟，同一件事重複出現，別用同一個方法",
};
/** tyme4ts names the 十神 in 简体 (正财, 伤官, 七杀); the letters and the lookups use 繁體 */
export const hantTen = (s: string) => s.replace(/财/g, "財").replace(/伤/g, "傷").replace(/杀/g, "殺");
const KIND_WORD = KEY_MONTH_WORD;

/* ------------------------------------------------------------------ 大運交接 */
export function decadeChange(f: Pick<ChartFacts, "decades">, year: number): { from: Decade | null; to: Decade } | null {
  const i = f.decades.findIndex((d) => d.startYear === year);
  if (i < 0) return null;
  return { from: i > 0 ? f.decades[i - 1]! : null, to: f.decades[i]! };
}

export function buildDecadeLetter(i: { year: number; from: Decade | null; to: Decade; dayMaster: string }, locale: "zh" | "zh-hant", site: string, email: string): { subject: string; html: string; text: string; unsubUrl: string } {
  const z = (s: string) => (locale === "zh" ? toHans(s) : s);
  const unsubUrl = letterUnsubUrl(site, email, locale);
  const chartUrl = `${site}/${locale}/bazi/chart?c=dy-letter`, castUrl = `${site}/${locale}/cast?c=dy-letter`;
  const head = z(`大運交接 · 國曆 ${i.year} 年`);
  const toTen = hantTen(i.to.ten), fromTen = i.from ? hantTen(i.from.ten) : "";
  const p1 = z(i.from
    ? `國曆 ${i.year} 年起，你的大運從 ${i.from.gz}（${fromTen}）走到 ${i.to.gz}（${toTen}），這一步管到 ${i.to.startYear + 9} 年。換運的第一年，常常先感覺到環境在變、人在變，自己還沒跟上——那是正常的。`
    : `國曆 ${i.year} 年起，你走進第一步大運 ${i.to.gz}（${toTen}），管到 ${i.to.startYear + 9} 年。`);
  const p2 = z(TEN_WORDS[toTen] ?? `${toTen}當運的十年，先把手上的事做穩，再看新的。`);
  const p3 = z("說的是這十年的傾向，不是結論。有一件具體的事放不下，就為它起一卦，看它的走向和日子。");
  const html = `<!doctype html><html lang="${locale === "zh" ? "zh-CN" : "zh-Hant"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${PAPER};color:${INK};font-family:${FONT};"><div style="max-width:560px;margin:0 auto;padding:40px 24px 36px;">
<p style="letter-spacing:.35em;font-size:12px;color:${INK_50};margin:0 0 6px;">YAOFLOW</p>
<p style="font-size:13px;color:${INK_66};margin:0 0 10px;">${esc(head)}</p>
<p style="font-size:26px;line-height:1.3;margin:0;color:${INK};">${esc(z(`${i.to.gz} · ${toTen}`))}</p>
<p style="font-size:15px;line-height:1.9;margin:24px 0 0;color:${INK_86};">${esc(p1)}</p>
<p style="font-size:12px;letter-spacing:.2em;color:${GOLD};margin:26px 0 8px;">${esc(z("這十年"))}</p>
<p style="font-size:15px;line-height:1.9;margin:0;color:${INK_86};">${esc(p2)}</p>
<p style="font-size:14px;line-height:1.8;margin:22px 0 0;color:${INK_66};">${esc(p3)}</p>
<p style="margin:28px 0 10px;"><a href="${esc(castUrl)}" style="${BTN}">${esc(z("這十年的一件事，起一卦"))}</a></p>
<p style="margin:0 0 22px;"><a href="${esc(chartUrl)}" style="font-size:13px;color:${INK_66};">${esc(z("看你的盤"))} →</a></p>
<hr style="border:none;border-top:1px solid ${RULE};margin:8px 0 14px;">
<p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(z("會員專屬：大運換了才寄這一封。"))} <a href="${esc(unsubUrl)}" style="color:${INK_50};">${esc(z("不用再寄"))}</a></p>
</div></body></html>`;
  const text = [head, z(`${i.to.gz} · ${toTen}`), "", p1, "", p2, "", p3, "", `${z("起一卦")}: ${castUrl}`, "", `${z("不用再寄")}: ${unsubUrl}`].join("\n");
  return { subject: z(`你的大運換了：${i.to.gz}（${toTen}），國曆 ${i.year} 年起`), html, text, unsubUrl };
}

/* ------------------------------------------------------------------ 年書關鍵月 */
export interface KeyMonth { kind: "pivot" | "slow" | "smooth"; i: number; month: MonthPoint; flags: string[] }

/** the key month of a 年書 (book year `year`) whose 節氣月 begins within the last three days — the 八字 year runs 立春 → next 小寒 */
export function keyMonthDue(f: Pick<ChartFacts, "book" | "months">, year: number, now = Date.now()): KeyMonth | null {
  const book = f.book, months = f.months?.[String(year)];
  if (!book || !months || book.year !== year) return null;
  const d = new Date(now + TPE_MS);
  const today = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  for (const kind of ["pivot", "slow", "smooth"] as const) {
    const i = book.key[kind];
    const m = months[i];
    if (!m) continue;
    const [mm, dd] = m.start.split("/").map(Number);
    const startsIn = mm! >= 2 ? year : year + 1;
    const start = Date.UTC(startsIn, mm! - 1, dd!);
    if (today >= start && today < start + 3 * DAY) return { kind, i, month: m, flags: book.flags[i] ?? [] };
  }
  return null;
}

export function buildKeyMonthLetter(i: { year: number; km: KeyMonth; token: string; monthEndUtc?: number }, locale: Locale, site: string, email: string): { subject: string; html: string; text: string; unsubUrl: string } {
  if (isForeign(locale)) return keyMonthLetterIn(i, locale, site, email);
  const z = (s: string) => (locale === "zh" ? toHans(s).replace(/国历/g, "公历") : s);
  const unsubUrl = letterUnsubUrl(site, email, locale);
  const bookUrl = `${site}${nianshuPath(i.token, locale)}?c=km-letter`, castUrl = `${site}/${locale}/cast?c=km-letter`;
  const m = i.km.month;
  const head = z(`年書 ${i.year} · 關鍵月到了`);
  const title = z(`${m.term}月（${m.gz}）· ${KIND_WORD[i.km.kind]}`);
  const p1 = z(`你的 ${i.year} 年書把 ${m.term}月——國曆 ${m.start} 起的這一個節氣月——標成${KIND_WORD[i.km.kind]}。它現在開始了。`);
  const marks = i.km.flags.map((f) => FLAG_WORDS[f]).filter((x): x is string => !!x).slice(0, 3);
  const p2 = z(marks.length ? `這個月的記號：${marks.join("；")}。` : `這個月的天干地支是 ${m.gz}，${hantTen(m.stemTen)}、${hantTen(m.branchTen)}當月。`);
  const p3 = z(i.km.kind === "slow" ? "放慢不是停下：把要定的事往後挪一挪，手上的先收尾。" : i.km.kind === "pivot" ? "有動靜的月份，事情來了先接住，再決定要不要接下去。" : "順手的月份，把拖了很久的那件事排進來。");
  const html = `<!doctype html><html lang="${locale === "zh" ? "zh-CN" : "zh-Hant"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${PAPER};color:${INK};font-family:${FONT};"><div style="max-width:560px;margin:0 auto;padding:40px 24px 36px;">
<p style="letter-spacing:.35em;font-size:12px;color:${INK_50};margin:0 0 6px;">YAOFLOW</p>
<p style="font-size:13px;color:${INK_66};margin:0 0 10px;">${esc(head)}</p>
<p style="font-size:22px;line-height:1.4;margin:0;color:${INK};">${esc(title)}</p>
<p style="font-size:15px;line-height:1.9;margin:24px 0 0;color:${INK_86};">${esc(p1)}</p>
<p style="font-size:15px;line-height:1.9;margin:14px 0 0;color:${INK_86};">${esc(p2)}</p>
<p style="font-size:14px;line-height:1.8;margin:22px 0 0;color:${INK_66};">${esc(p3)}</p>
<p style="margin:28px 0 10px;"><a href="${esc(bookUrl)}" style="${BTN}">${esc(z("回到年書看這個月"))}</a></p>
<p style="margin:0 0 22px;"><a href="${esc(castUrl)}" style="font-size:13px;color:${INK_66};">${esc(z("這個月有事要問，起一卦"))} →</a></p>
<hr style="border:none;border-top:1px solid ${RULE};margin:8px 0 14px;">
<p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(z("買了年書才寄這一封；一年最多三封，關鍵月到了才有。"))} <a href="${esc(unsubUrl)}" style="color:${INK_50};">${esc(z("不用再寄"))}</a></p>
</div></body></html>`;
  const text = [head, title, "", p1, "", p2, "", p3, "", `${z("回到年書")}: ${bookUrl}`, "", `${z("不用再寄")}: ${unsubUrl}`].join("\n");
  return { subject: z(`年書 ${i.year}：${m.term}月到了——${KIND_WORD[i.km.kind]}`), html, text, unsubUrl };
}

/**
 * 10-30 进度表 128 ④-5: the same letter for a 年書 bought on a page in another language — its words from
 * nianshu/foreign-text.ts (km), the month by its first and last day in that language's writing, the marks in plain words
 * (no stem-branch names), a font that has the script
 */
const FONT_IN: Record<Foreign, string> = {
  en: "Georgia,'Times New Roman',serif", fr: "Georgia,'Times New Roman',serif", de: "Georgia,'Times New Roman',serif", es: "Georgia,'Times New Roman',serif", pt: "Georgia,'Times New Roman',serif",
  ja: "'Noto Serif JP','Hiragino Mincho ProN','Yu Mincho',serif", ko: "'Noto Serif KR','AppleMyungjo','Batang',serif",
};
function keyMonthLetterIn(i: { year: number; km: KeyMonth; token: string; monthEndUtc?: number }, l: Foreign, site: string, email: string): { subject: string; html: string; text: string; unsubUrl: string } {
  const T = nsForeignText(l).km;
  const ko = (s: string) => (l === "ko" ? josa(s) : s);
  const cap = (s: string) => (s ? s.charAt(0).toLocaleUpperCase(LOCALE_META[l].htmlLang) + s.slice(1) : s);
  const unsubUrl = letterUnsubUrl(site, email, l);
  const bookUrl = `${site}${nianshuPath(i.token, l)}?c=km-letter`, castUrl = `${site}/${l}/cast?c=km-letter`;
  const m = i.km.month, kind = T.kind[i.km.kind];
  const span = i.monthEndUtc ? keyMonthSpanIn(l, i.year, m.start, i.monthEndUtc) : mdIn(l, m.start, i.year, true);
  const head = fmt(T.head, { y: i.year });
  const title = cap(kind);
  const p1 = ko(fmt(T.p1, { y: i.year, m: span, k: kind }));
  const marks = i.km.flags.map((f) => (T.flag as Record<string, string>)[f]).filter((x): x is string => !!x).slice(0, 3).map(cap);
  const p3 = T.p3[i.km.kind];
  const marksHtml = marks.length
    ? `<p style="font-size:15px;line-height:1.9;margin:14px 0 4px;color:${INK_86};">${esc(T.marks)}</p>
<ul style="margin:0;padding:0 0 0 20px;">${marks.map((x) => `<li style="font-size:15px;line-height:1.8;margin:0 0 6px;color:${INK_86};">${esc(x)}</li>`).join("")}</ul>`
    : `<p style="font-size:15px;line-height:1.9;margin:14px 0 0;color:${INK_86};">${esc(T.noMarks)}</p>`;
  const html = `<!doctype html><html lang="${LOCALE_META[l].htmlLang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${PAPER};color:${INK};font-family:${FONT_IN[l]};"><div style="max-width:560px;margin:0 auto;padding:40px 24px 36px;">
<p style="letter-spacing:.35em;font-size:12px;color:${INK_50};margin:0 0 6px;">YAOFLOW</p>
<p style="font-size:13px;color:${INK_66};margin:0 0 10px;">${esc(head)}</p>
<p style="font-size:22px;line-height:1.4;margin:0;color:${INK};">${esc(title)}</p>
<p style="font-size:15px;line-height:1.9;margin:24px 0 0;color:${INK_86};">${esc(p1)}</p>
${marksHtml}
<p style="font-size:14px;line-height:1.8;margin:22px 0 0;color:${INK_66};">${esc(p3)}</p>
<p style="margin:28px 0 10px;"><a href="${esc(bookUrl)}" style="${BTN}">${esc(T.bookBtn)}</a></p>
<p style="margin:0 0 22px;"><a href="${esc(castUrl)}" style="font-size:13px;color:${INK_66};">${esc(T.cast)} →</a></p>
<hr style="border:none;border-top:1px solid ${RULE};margin:8px 0 14px;">
<p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(T.foot)} <a href="${esc(unsubUrl)}" style="color:${INK_50};">${esc(T.stop)}</a></p>
</div></body></html>`;
  const text = [head, title, "", p1, "", ...(marks.length ? [T.marks, ...marks.map((x) => `- ${x}`)] : [T.noMarks]), "", p3, "", `${T.bookBtn}: ${bookUrl}`, "", `${T.stop}: ${unsubUrl}`].join("\n");
  return { subject: fmt(T.subject, { y: i.year, k: kind }), html, text, unsubUrl };
}

/* ------------------------------------------------------------------ the run */
export async function runMilestoneLetters(now = Date.now(), site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, ""), max = 30): Promise<{ decade: number; keyMonth: number; failed: number }> {
  const out = { decade: 0, keyMonth: 0, failed: 0 };
  if ((process.env.MILESTONE_LETTER ?? "on") === "off") return out;
  const d = new Date(now + TPE_MS);
  if (d.getUTCHours() < 8 || d.getUTCHours() >= 21) return out;
  const year = d.getUTCFullYear();
  const { sendEmail } = await import("./email");
  let n = 0;
  const send = async (key: string, kind: string, email: string, m: { subject: string; html: string; text: string; unsubUrl: string }, locale: Locale, cid: number | null): Promise<boolean> => {
    recordEmail(key, kind, email, "pending");
    const res = await sendEmail(email, m.subject, m.html, m.text, { kind: "daily", customerId: cid, locale, unsubUrl: m.unsubUrl });
    recordEmail(key, kind, email, res.ok ? "sent" : "failed", res.error ?? res.id);
    return res.ok;
  };

  // 大運交接 — members with a chart on file (10-23 进度表 108: each of the two can be turned off in /admin/letters)
  if (featureOn("tongka") && letterOn("decade")) {
    const members = db().prepare(`SELECT DISTINCT c.id AS cid, c.email, c.locale FROM subscriptions s JOIN customers c ON c.id = s.customer_id
      WHERE s.status IN ('active','trialing','past_due') AND substr(s.stripe_subscription_id,1,5) <> 'pass_' AND c.locale IN ('zh','zh-hant') AND c.email LIKE '%@%'`).all() as { cid: number; email: string; locale: string }[];
    for (const r of members) {
      if (n >= max) break;
      const key = `dy:${r.cid}:${year}`;
      if (emailAlreadySent(key, "milestone")) continue;
      if (!memberLetterEligible(r.cid, r.locale, now)) continue;
      const f = baziFactsOnFile(r.cid);
      const ch = f ? decadeChange(f, year) : null;
      if (!f || !ch) { recordEmail(key, "milestone", r.email, "skipped", "no_change"); continue; }
      n++;
      const locale = r.locale === "zh" ? "zh" : "zh-hant";
      const ok = await send(key, "milestone", r.email, buildDecadeLetter({ year, ...ch, dayMaster: f.dayMaster }, locale, site, r.email), locale, r.cid);
      if (ok) out.decade++; else out.failed++;
    }
  }

  // 年書關鍵月 — every paid 年書 whose year is this one (or next, from 11/1), with an address
  if (featureOn("nianshu") && letterOn("key_month")) {
    const books = db().prepare(`SELECT n.token, n.year, n.locale, n.customer_id AS cid, n.bazi_token AS bt, COALESCE(c.email, n.email) AS email
      FROM nianshu_reports n LEFT JOIN customers c ON c.id = n.customer_id
      WHERE n.paid_at IS NOT NULL AND n.year IN (?, ?) AND n.bazi_token IS NOT NULL AND COALESCE(c.email, n.email) LIKE '%@%'`).all(year, year + 1) as { token: string; year: number; locale: string; cid: number | null; bt: string; email: string }[];
    for (const b of books) {
      if (n >= max) break;
      if (b.cid && memberLetterOff(b.cid)) continue;
      const row = db().prepare("SELECT chart_json FROM bazi_reports WHERE token = ?").get(b.bt) as { chart_json: string } | undefined;
      if (!row) continue;
      let f: ChartFacts;
      try { f = JSON.parse(row.chart_json) as ChartFacts; } catch { continue; }
      const km = keyMonthDue(f, b.year, now);
      if (!km) continue;
      const key = `km:${b.token}:${km.kind}`;
      if (emailAlreadySent(key, "milestone")) continue;
      n++;
      // 10-30 进度表 128 ④-5: a 年書 bought on a page in another language gets the letter in that language
      const locale: Locale = isLocale(b.locale) && isForeign(b.locale) ? b.locale : b.locale === "zh" ? "zh" : "zh-hant";
      const monthEndUtc = keyMonthEndUtc(f, b.year, km.i);
      const ok = await send(key, "milestone", b.email, buildKeyMonthLetter({ year: b.year, km, token: b.token, monthEndUtc }, locale, site, b.email), locale, b.cid);
      if (ok) out.keyMonth++; else out.failed++;
      // 10-22 进度表 80: the book said what this month would be like — two days after it ends, ask whether it was
      if (ok) try { scheduleNianshuRevisit({ token: b.token, year: b.year, keyKind: km.kind, term: km.month.term, start: km.month.start, kindWord: KIND_WORD[km.kind], monthEndUtc, customerId: b.cid, email: b.email, locale }, now); } catch { /* the letter went; the revisit is best effort */ }
    }
  }
  if (out.decade || out.keyMonth || out.failed) recordOps("milestone_letter_run", JSON.stringify(out));
  return out;
}
