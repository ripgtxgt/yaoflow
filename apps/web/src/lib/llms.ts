import { LOCALES, LOCALE_META, type Locale } from "./locales";
import { CURRENCIES, PRICES, PASS_PRICES, TONGKA_PRICES, HEPAN_PRICES, NIANSHU_PRICES, NIANSHU_EARLY_PRICES, formatMoney } from "./money";
import { MEMBER_FOLLOWUP_LIMIT, GIFT_POOL_PER_MONTH } from "./sub-plan";
import { paywallMode } from "./paywall";
import { GUA, guaLocales, guaSlug } from "./gua";
import { hexName } from "./names";
import { HOW_TO_ASK_LOCALES, howToAskFor } from "./how-to-ask";
import { LOVE_LANDINGS, loveLandingPath } from "./love-landing";
import { JIEQIAN_PATH, qianPath } from "./qian-meta";
import { REFERENCE_PATHS, referenceFor } from "./reference";
import { isEnglishFallback } from "./content";
import { PRIVACY, TERMS } from "./legal";
import { CONTACT_EMAIL } from "./trust";
import { OPERATOR_NAME } from "./operator";

/**
 * /llms.txt and /llms-full.txt (进度表 26, 竞品观察 O15): what the site is, in plain facts, for AI search engines.
 *
 * Rules for this text (Neil, 10-02): facts only — how the chart is cast and computed, how the timing (應期) is
 * given, where free ends and paid begins, the main pages. Every price, count and allowance below is read from the
 * same constants the checkout charges (money.ts, sub-plan.ts, followup-limit.ts), so a price change cannot leave this
 * file behind. Never: an accuracy figure or any percentage, "very accurate", user numbers, or the language model as
 * a selling point (one neutral sentence on who does what, as on /about — and not "no AI" either).
 *
 * English body, key terms with their Traditional Chinese.
 */

const LANG_LABEL: Record<Locale, string> = {
  zh: "简体中文", "zh-hant": "繁體中文", en: "English", ja: "日本語", ko: "한국어", fr: "Français", de: "Deutsch", es: "Español", pt: "Português",
};

function others(site: string, path: string, locales: readonly Locale[]): string {
  return locales.filter((l) => l !== "en").map((l) => `[${LANG_LABEL[l]}](${site}/${l}${path})`).join(" · ");
}

/** one bullet: the English page, then the same page in every other language it exists in */
function page(site: string, title: string, path: string, note: string, locales: readonly Locale[] = LOCALES): string {
  const main = locales.includes("en") ? `${site}/en${path}` : `${site}/${locales[0]}${path}`;
  const rest = others(site, path, locales.filter((l) => `${site}/${l}${path}` !== main));
  return `- [${title}](${main}): ${note}${rest ? `\n  Also: ${rest}` : ""}`;
}

function priceTable(): string[] {
  // 10-22 通卡 (进度表 78): the passes, the membership and the one-off reports — every figure read from money.ts
  const head = "| Currency | 1-day pass | 7-day pass | 30-day pass | Membership / month | Membership / year | Tarot or lot reading | Pair report | Year book (early bird) |";
  const rule = "|---|---|---|---|---|---|---|---|---|";
  const rows = CURRENCIES.map((c) => {
    const p = PRICES[c];
    const f = (minor: number) => formatMoney(c, minor, "en");
    return `| ${c} | ${f(TONGKA_PRICES[1][c])} | ${f(TONGKA_PRICES[7][c])} | ${f(PASS_PRICES[c])} | ${f(p.month)} | ${f(p.year)} | ${f(p.one)} | ${f(HEPAN_PRICES[c])} | ${f(NIANSHU_PRICES[c])} (${f(NIANSHU_EARLY_PRICES[c])}) |`;
  });
  return [head, rule, ...rows, "", "An account's first 1-day pass costs the tarot-or-lot-reading price. A first-time member's first month is charged at the 30-day pass price; the monthly membership price applies from the second month, and someone whose membership has ended starts again at the first-month price. Members pay a fifth less for the pair report and the year book (the lower of that and the early-bird price, 1 November – 31 January)."];
}

function freeAndPaid(site: string): string[] {
  const mode = paywallMode();
  const free = "Free: casting, the full chart (排盤), the classical judgment and line texts (卦辭、爻辭), with no sign-up; moon blocks (擲筊) and temple lots (求籤); drawing tarot cards and each card's meaning; Bazi (八字), Zi Wei (紫微) and natal charts (the chart itself — its plain reading needs a pass or membership); the almanac (黃曆), date picking (擇日 — also by use: the next three months of wedding, moving-house and shop-opening days), the daily forecast and the daily lot (今日一籤); a name lookup (姓名學: each character's meaning, readings, Kangxi stroke count and five-element attribution, the five-grid numbers, and — with a birth — the Bazi favourable elements beside the name, with a page for every character used in names); 200 common dreams with the traditional sayings and a plain reading (解夢); the Tai Sui table for the coming year by zodiac sign and how the custom of 安太歲 is kept (犯太歲); and 尋物 (「東西不見了？」, /zh-hant/xunwu): three taps (what was lost, where it was last seen, how long ago) and three dice cast by the Plum Blossom method (梅花易數〈失物占〉) give the chance of it turning up, the direction to look in and the kinds of places to search first, with the practical steps (reporting an ID card lost, stopping bank cards, locating a phone) — no account needed; asking the I Ching about the same lost thing afterwards does need one; and the 本命卦 quiz (/zh-hant/bmg, Traditional Chinese): twelve questions (or the four letters of the 16-type system plus two), no account and no birth date, give the reader's own hexagram — six lines for six everyday habits, what pressure turns it into, one thing to try — with a page for each of the 16 four-letter types (/zh-hant/bmg/type/intj) and each of the 64 hexagrams as a personality (/zh-hant/bmg/gua/1); two people can lay theirs side by side (合卦). Casting, tarot, moon blocks, temple lots and lot readings need a free account (email sign-in).";
  if (mode === "off") {
    return ["## Free and paid", "", free, "", "Readings are currently free (beta): the light and the full reading are both delivered without payment.", ""];
  }
  return [
    "## Free and paid",
    "",
    free,
    "",
    "Paid: the readings written for the reader's own matter — the full I Ching reading (深斷: the call first, a dated timing window 應期, the immediate step, what to avoid, what to watch, the chart's reasoning, and follow-up questions on the same cast), the tarot reading, the personal lot reading (解籤), the Bazi / Zi Wei / natal-chart deep reports and chart Q&A (命盤問答).",
    "",
    "Passes (通卡), bought once and never renewed — the usual way to pay:",
    "",
    "- A 1-day, 7-day or 30-day pass, counted in hours from payment. While it runs, all of the paid readings above are included without counting (each with a fair-use daily ceiling that normal use never meets) — of the chart deep reports, the natal chapters. A pass does not include the time-bound chapters (the Bazi luck periods and this year, the Zi Wei decades, the natal chart's month ahead), the daily lot's full text, the day read from the reader's own chart, the member price on the year book and the pair report, the monthly refresh of deep reports, or the member letters.",
    `- ${MEMBER_FOLLOWUP_LIMIT} follow-up questions per full reading.`,
    "",
    "Membership (會員), a subscription:",
    "",
    "- Renews automatically every month or every year until it is cancelled from the account page; access continues to the end of the paid period and nothing further is charged; renewals stay at the price subscribed at.",
    `- Everything a pass includes, plus what moves with time: the time-bound chapters of the deep reports rewritten each month for the current month, the daily lot's full text, the day read from the reader's own Bazi (on the daily forecast, the almanac and date picking, which also looks a whole year ahead), a daily and a monthly letter, a fifth off the year book and the pair report, and ${GIFT_POOL_PER_MONTH} gift readings a month to send to friends (only while renewal is on).`,
    "- After a membership ends, reports already written stay readable (the time-bound chapters as last rewritten); the letters, rewrites, daily personal content and member prices stop.",
    "",
    "Sold on their own, one-off: the year book (三合一年書: Bazi, Zi Wei and natal chart for one year, with an early-bird price from 1 November to 31 January; it includes a Tai Sui chapter), the pair report (合盤), the partner portrait (正緣畫像), the baby-name reference and the rename reference (寶寶取名參考 / 改名參考: candidate characters and ten names chosen against the Bazi favourable elements, each with meaning, readings and homophone notes, stroke counts and the five grids — priced like the pair report; no claims that a name changes luck), and — for anyone without a pass or membership — the tarot reading and the personal lot reading. Members pay a fifth less for the one-off reports.",
    "",
    "Prices include any applicable tax and are set per currency by hand, not converted at the day's rate. The site picks the currency from the device's region; the reader can switch it before paying.",
    "",
    ...priceTable(),
    "",
    `Refunds, renewal and the full conditions: ${site}/en/terms`,
    "",
  ];
}

function legalLocales(doc: typeof TERMS | typeof PRIVACY): Locale[] {
  return LOCALES.filter((l) => !isEnglishFallback(doc[0]!, l));
}

/** the locales that have at least one live public case — the index exists everywhere, but only these have cases in it */
export function llmsTxt(site: string, caseLocales: readonly Locale[]): string {
  const ex = GUA[0]!;
  const ex2 = GUA.find((h) => h.number === 32)!;
  const lines = [
    "# YaoFlow",
    "",
    "> YaoFlow (yaoflow.com) is a Liu Yao (六爻) I Ching divination site. The reader writes down one question, casts six lines with three coins, and receives a chart computed by fixed classical rules (納甲 najia) and a plain-language reading that names a date or a window of days for when the matter should move (應期). When that date comes, YaoFlow writes to ask what happened (應了沒). One matter, one cast (一事一卦).",
    "",
    `Interface languages: ${LOCALES.map((l) => LANG_LABEL[l]).join(", ")}. A reading is written in the language of the question. Operated by ${OPERATOR_NAME}. Contact: ${CONTACT_EMAIL}.`,
    "",
    "## How a cast works",
    "",
    "- Casting (起卦): six throws of three coins give six lines, bottom to top. Old yang and old yin (老陽、老陰) are moving lines; they turn the primary hexagram (本卦) into the transformed hexagram (之卦 / 變卦).",
    "- The chart (排盤) is computed by a deterministic rule engine: 納甲 stem-and-branch assignment, the eight palaces with the self and other lines (世應), the six relations (六親), the six spirits (六神), the year, month and day of the moment of casting (月建、日辰), voids (旬空), month breaks (月破), clashes, seasonal strength, moving and changed lines (動變) and hidden spirits (伏神). The same six lines cast at the same moment always give the same chart. The rules follow the classical manuals 《卜筮正宗》 and 《京氏易傳》.",
    `- A language model writes the interpretation from the finished chart, which it receives as fixed facts: it cannot change a line or add features the chart does not have. How the two layers divide: ${site}/en/about`,
    "- The 64 judgments and 384 line statements are the received Zhouyi (周易) text, from the public-domain Wikisource edition.",
    "",
    "## How the timing (應期) is given",
    "",
    "- The reading picks the line that stands for the matter asked about (用神, the Useful God) and reads the date from its state on the chart:",
    "  - moving: the day of its combination (合) or its own day (值);",
    "  - still: the day that clashes it (沖) or its own day;",
    "  - void (旬空): the day it leaves the void, or the day that clashes it;",
    "  - broken by the month (月破): when that month has passed, or the day that fills it;",
    "  - in its tomb (入墓): the day that clashes the tomb open.",
    "- Each rule falls on specific days of the calendar, so the reading gives a date or a window of a few days rather than \"soon\". A full worked example, step by step: " + `${site}/en/timing`,
    "- When the window comes, the reader is emailed and asked how it went — happened as said, happened but differently, not yet, or didn't happen — and the answer is kept with the reading.",
    "",
    ...freeAndPaid(site),
    "## What the readings do not do",
    "",
    "- No medical, legal or investment prescriptions.",
    "- About another person, the reading gives the chart's lean, not certainty, and brings it back to what the reader can do. On a third party's private affairs, it answers only what bears on the reader.",
    "- If a question speaks of self-harm or crisis, there is no cast and nothing is sold; the page shows local helplines.",
    "- The same question cast again within a day is stopped with a reminder of the hexagram already received (Hexagram 4, 蒙: 初筮告，再三瀆，瀆則不告). The reader can still cast again.",
    "- A reading gives a lean and a window, not a guarantee; the decision stays with the reader.",
    "",
    "## Main pages",
    "",
    page(site, "Home", "", "ask one question and cast"),
    page(site, "The 64 hexagrams", "/gua", "one page per hexagram: judgment, line texts, plain-language reading, love / work / money, and real casts of that hexagram", guaLocales()),
    page(site, "64 hexagrams quick table", `/${REFERENCE_PATHS.table}`, "all 64 hexagrams with their trigrams and a one-line meaning"),
    page(site, "Liu Yao glossary (六爻術語)", `/${REFERENCE_PATHS.glossary}`, "the terms of the chart: 世應、用神、六親、六神、旬空、月破, and more"),
    page(site, "How timing is derived (應期怎麼推)", `/${REFERENCE_PATHS.timing}`, "the rules for 應期, worked through on one real cast"),
    page(site, "How to ask, and how to read a bad hexagram (怎麼問、怎麼看)", "/how-to-ask", "phrasing a question the chart can answer, what to do with a bad hexagram, when to ask again", HOW_TO_ASK_LOCALES),
    // 10-14 (进度表 §四 45): 應驗紀錄
    ...(process.env.SHOW_OUTCOME_RECORDS === "1" ? [`- [應驗紀錄 / 应验记录 (outcome records)](${site}/zh-hant/outcomes): Traditional (and Simplified at ${site}/zh/outcomes) — public cases only, chosen by their authors: what each reader reported after the timing window passed (came true, partly, did not, not settled, unclear), all listed, newest first, with raw counts and no percentages; it is not an accuracy rate.`] : []),
    // 10-12 (进度表 §四 36): 解籤
    `- [線上解籤 (temple lot readings, 六十甲子籤, 天后宮一百籤, 關聖帝君一百籤, 觀音一百籤, 月老聖籤, 保生大帝六十籤, 註生娘娘三十籤, 觀音二十八籤, 觀音二十四籤, 金錢卦三十二籤, 淺草寺觀音籤 and 黃大仙靈籤)](${site}${JIEQIAN_PATH}): Traditional Chinese — type the number of a lot drawn at a temple, write the question, and get the plain reading, what it says for love and for work, and a reading for that question (a paid reading, included in membership); one page per lot (the poem) at ${site}${qianPath(1).replace(/\/1$/, "/{1-60}")}; also the 天后宮一百籤 (as at 臺南大天后宮, 鹿港天后宮, 關渡宮, 1–100) at ${site}${qianPath(1, "tianhou").replace(/\/1$/, "/{1-100}")}, the 觀音一百籤 (as at 艋舺龍山寺, 1–100) at ${site}${qianPath(1, "guanyin").replace(/\/1$/, "/{1-100}")}, the 月老聖籤 (as at 新竹普天宮, love only, 1–100) at ${site}${qianPath(1, "yuelao").replace(/\/1$/, "/{1-100}")}, the 關聖帝君一百籤 (as at 臺北行天宮, 1–100) at ${site}${qianPath(1, "guandi").replace(/\/1$/, "/{1-100}")}, six more sets (保生大帝、註生娘娘、觀音二十八、觀音二十四、金錢卦、東京淺草寺) at ${site}/zh-hant/qian/{set}/{n}, and the 黃大仙靈籤 of 嗇色園黃大仙祠, Hong Kong (1–100), at ${site}${qianPath(1, "huangdaxian").replace(/\/1$/, "/{1-100}")}. A lot gives a direction, not a date; for the days, cast for the same question.`,
    // 10-12 (进度表 §四 37): the four 繁體 love pages
    ...LOVE_LANDINGS.map((x) => `- [${x.short}](${site}${loveLandingPath(x.slug)}): Traditional Chinese — ${x.description}`),
    ...(caseLocales.length ? [page(site, "Public cases (公開卦例)", "/cases", "real readings published anonymously with the reader's consent", caseLocales)] : []),
    page(site, "About", "/about", "how the chart is computed, the sources, who runs the site"),
    page(site, "Privacy", "/privacy", "what is kept and why", legalLocales(PRIVACY)),
    page(site, "Terms", "/terms", "prices, renewal, refunds", legalLocales(TERMS)),
    "",
    "## Linking",
    "",
    `- A specific hexagram: ${site}/{language}/gua/{number}-{pinyin} — for example ${site}/en/gua/${guaSlug(ex)} (${hexName(ex, "zh-hant")}) or ${site}/zh-hant/gua/${guaSlug(ex2)} (${hexName(ex2, "zh-hant")}). Every hexagram page, in every language: ${site}/llms-full.txt`,
    `- Timing (應期): ${site}/{language}/timing`,
    `- Language codes: ${LOCALES.map((l) => `${l} (${LOCALE_META[l].native})`).join(", ")}.`,
    "",
    "## Optional",
    "",
    `- [llms-full.txt](${site}/llms-full.txt): this file, followed by the full text of the timing and how-to-ask pages and the list of all 64 hexagram pages`,
    page(site, "Today's three charts", "/today", "three public charts cast each day"),
    `- [Sitemap](${site}/sitemap.xml)`,
    "",
  ];
  return lines.join("\n");
}

/** llms.txt, then the two explanatory articles in English and the 64 hexagram pages */
export function llmsFullTxt(site: string, caseLocales: readonly Locale[]): string {
  const t = referenceFor("en").timing;
  const timing = [
    `# ${t.title}`,
    "",
    `Source: ${site}/en/${REFERENCE_PATHS.timing}`,
    "",
    t.lead,
    "",
    ...t.sections.flatMap((s) => [
      `## ${s.h}`,
      "",
      ...s.p.flatMap((p) => [p, ""]),
      ...(s.list?.length ? [...s.list.map((x) => `- ${x}`), ""] : []),
      ...(s.after ?? []).flatMap((p) => [p, ""]),
    ]),
    t.note,
    "",
  ];
  const h = howToAskFor("en");
  const ask = [
    `# ${h.title}`,
    "",
    `Source: ${site}/en/how-to-ask`,
    "",
    h.lead,
    "",
    `## ${h.ask.h}`,
    "",
    ...h.ask.rules.map((r) => `- ${r}`),
    "",
    h.ask.pairsLead,
    "",
    ...h.ask.pairs.map((p) => `- ${p.topic}: ${h.ask.vague} "${p.from}" → ${h.ask.specific} "${p.to}"`),
    "",
    h.ask.after,
    "",
    `## ${h.bad.h}`,
    "",
    ...h.bad.intro.flatMap((p) => [p, ""]),
    ...h.bad.angles.map((a) => `- ${a.q} — ${a.note}`),
    "",
    h.bad.after,
    "",
    `## ${h.again.h}`,
    "",
    ...h.again.rules.map((r) => `- ${r}`),
    "",
    `## ${h.check.h}`,
    "",
    h.check.intro,
    "",
    ...h.check.steps.map((s, i) => `${i + 1}. ${s}`),
    "",
    h.check.after,
    "",
  ];
  const hexes = [
    "# The 64 hexagram pages",
    "",
    `Each page exists in ${guaLocales().map((l) => LANG_LABEL[l]).join(", ")}: replace /en/ with /${guaLocales().filter((l) => l !== "en").join("/, /")}/.`,
    "",
    ...GUA.map((x) => `- ${x.number}. [${x.en} · ${hexName(x, "zh-hant")}](${site}/en/gua/${guaSlug(x)})`),
    "",
  ];
  return [llmsTxt(site, caseLocales), "---", "", ...timing, "---", "", ...ask, "---", "", ...hexes].join("\n");
}
