import type { Locale } from "./locales";

/**
 * 进度表 27 (竞品观察 O22, 10-02): the Traditional Chinese <title> and description say 卜卦.
 *
 * Google Trends, Taiwan, 12 months: 卜卦 76 against 六爻 47 (and 六爻 is also a novel and a song). The 繁體 home
 * title was 「YaoFlow · 一事一卦」 — neither word. Only the <head> changes: headings, leads and the home hero stay
 * as they are (the home A/B test h is still running). Each title and each description carries 卜卦 once — never
 * stuffed. No "AI", no accuracy. URLs, canonicals and hreflang are untouched.
 *
 * The other 繁體 heads live with their content: the 64 pages and their index in lib/dict/zh-hant.ts
 * (guaMetaTitle, guaIndexMetaTitle, guaIndexMetaDesc), /timing in data/reference.zh-hant.json (timing.metaTitle,
 * timing.metaDesc), /how-to-ask in lib/how-to-ask.ts (metaTitle, metaDesc), the case title's tail in
 * lib/dict/thread.ts (caseTitleTail).
 */
export const BUGUA = "卜卦";

interface Head { title: string; description: string }

/**
 * <head> for each home. 10-16 进度表 61 (深挖调研 SEO 体检, Neil「好，做吧」): only 繁體 had one — every other home's
 * title was the slogan ("YaoFlow · One question. One cast."), no word anyone searches. Each now names what people
 * type (Google Ads volumes, 07_真实搜索量: i ching online 22k/月 US, 易占い 無料 9.9k JP, i ging online 4.4k DE,
 * i ching online 6.6k BR …), with the slogan's idea kept. Casting is free (the reading is what is paid); no "AI" —
 * nobody searches it outside Chinese and Korean — and nothing about accuracy. Headings on the page stay as they are.
 */
const HOME: Partial<Record<Locale, Head>> = {
  "zh-hant": {
    title: "線上卜卦｜六爻起卦，告訴你哪一天有動靜 — 爻流 YaoFlow",
    description: "線上卜卦：一件事，一卦。納甲、六親、旬空、旺衰按老規矩算，解讀只照著盤面講人話，並給出一個應期日期——到那天我們回來問你應了沒。",
  },
  zh: {
    title: "六爻在线起卦｜免费排盘，告诉你哪一天有动静 — 爻流 YaoFlow",
    description: "一件事，一卦。三枚铜钱摇六次，纳甲、六亲、旬空、旺衰按老规矩排盘，起卦排盘免费；解读照着盘面讲人话，并给出一个应期日期——到那天我们回来问你应了没。",
  },
  en: {
    title: "I Ching Online — Free Coin Cast, a Reading and a Date | YaoFlow",
    description: "Ask one question and cast the I Ching with three coins, free. The chart follows the classical Liu Yao rules (Najia, six relations, void branches); the reading explains it in plain words and names a date — and on that day we write to ask what happened.",
  },
  ja: {
    title: "易占い 無料で卦を立てる｜六爻占い、一事一卦で時期まで — YaoFlow",
    description: "ひとつの事に、ひとつの卦。コイン3枚を6回振って卦を立てるのは無料。納甲・六親・空亡・旺衰を古典の規則どおりに組み、読み解きは盤面に沿って平易に。動きが出る時期の日付も示し、その日に結果をうかがいます。",
  },
  ko: {
    title: "무료 주역점 · 육효점 온라인｜한 가지 일, 한 번의 점괘 — YaoFlow",
    description: "한 가지 일에 한 번의 점괘. 동전 세 개를 여섯 번 던져 괘를 세우는 것은 무료입니다. 납갑·육친·공망·왕쇠를 전통 규칙대로 배치하고, 풀이는 괘에 따라 쉽게 설명하며 움직임이 있을 날짜를 알려 드립니다. 그날 결과를 여쭤봅니다.",
  },
  fr: {
    title: "Tirage Yi King gratuit en ligne — une question, une date | YaoFlow",
    description: "Une question, un tirage : trois pièces, six lancers, gratuitement. Le tableau suit les règles classiques du Liu Yao ; la lecture l'explique simplement et donne une date — ce jour-là, nous vous écrivons pour savoir ce qui s'est passé.",
  },
  de: {
    title: "I Ging online kostenlos befragen — eine Frage, ein Datum | YaoFlow",
    description: "Eine Frage, ein Wurf: drei Münzen, sechs Würfe, kostenlos. Das Zeichen folgt den klassischen Liu-Yao-Regeln; die Deutung erklärt es in klaren Worten und nennt ein Datum — an diesem Tag fragen wir nach, was geschehen ist.",
  },
  es: {
    title: "Tirada del I Ching gratis online — una pregunta, una fecha | YaoFlow",
    description: "Una pregunta, una tirada: tres monedas, seis lanzamientos, gratis. El hexagrama sigue las reglas clásicas del Liu Yao; la lectura lo explica con palabras sencillas y da una fecha — ese día te escribimos para saber qué pasó.",
  },
  pt: {
    title: "Consulta I Ching grátis online — uma pergunta, uma data | YaoFlow",
    description: "Uma pergunta, uma tirada: três moedas, seis lançamentos, grátis. O hexagrama segue as regras clássicas do Liu Yao; a leitura explica em palavras simples e dá uma data — nesse dia escrevemos para saber o que aconteceu.",
  },
};

/** 10-22 进度表 81: the Chinese heads end in 「爻流 YaoFlow」, the others in YaoFlow (lib/brand.ts). */
/** 10-16 进度表 61: /today's head — 「今日卦象｜每日一卦」 is what is searched (the page's own heading stays) */
const TODAY: Partial<Record<Locale, Head>> = {
  "zh-hant": { title: "今日卦象｜每日一卦，三個卦挑一個看 — 爻流 YaoFlow", description: "每天三個公開的卦，全站同一組、每天換。挑一個看它說什麼，再寫下它讓你想到的那件事，起一卦看看。" },
  zh: { title: "今日卦象｜每日一卦，三个卦挑一个看 — 爻流 YaoFlow", description: "每天三个公开的卦，全站同一组、每天换。挑一个看它说什么，再写下它让你想到的那件事，起一卦看看。" },
  en: { title: "Daily I Ching — Today's Three Hexagrams | YaoFlow", description: "Three hexagrams for the whole site, new every day. Pick one, read what it says, then write down the matter it brings to mind and cast on it." },
  ja: { title: "今日の卦｜毎日の易占い、三つの卦から一つ — YaoFlow", description: "サイト全体で同じ三つの卦が毎日入れ替わります。一つ選んで読み、思い浮かんだ事について卦を立ててみてください。" },
  ko: { title: "오늘의 괘｜매일 주역 세 괘 중 하나 — YaoFlow", description: "사이트 전체가 같은 세 괘를 보고, 매일 바뀝니다. 하나를 골라 읽고, 떠오른 일에 대해 괘를 세워 보세요." },
};

export const todayHead = (l: Locale): Head | null => TODAY[l] ?? null;

/** <head> for the 繁體 public-cases index (its H1 stays 「公開卦例」) */
const CASES_INDEX: Partial<Record<Locale, Head>> = {
  "zh-hant": {
    title: "公開卦例｜真實的六爻卜卦紀錄",
    description: "這些卜卦紀錄都是問卦的人自己選擇公開的：只有卦象、日期、問題類型和解讀裡的幾段，以及應期到了之後他們自己記下的結果。沒有名字，沒有原問題。",
  },
};

export const homeHead = (l: Locale): Head | null => HOME[l] ?? null;
export const casesIndexHead = (l: Locale): Head | null => CASES_INDEX[l] ?? null;

/** A 64-page description: the hexagram's one line, then what the page holds — in 繁體 with 卜卦 once. */
export function guaDescription(meta: string, name: string, l: Locale): string {
  if (l !== "zh-hant" || meta.includes(BUGUA)) return meta;
  const m = /[。！？]$/.test(meta) ? meta : `${meta}。`;
  return `${m}卦辭、六爻爻辭原文與白話講解；卜卦得到${name}時，事業、感情、財運怎麼看。`;
}

/**
 * A public case's title is the author's own question + the tail. In 繁體 the tail says 卜卦 — unless the author's
 * wording already does, so the title never says it twice.
 */
export function caseTitleHead(question: string, tail: string, l: Locale): string {
  const t = l === "zh-hant" && question.includes(BUGUA) ? tail.replace(BUGUA, "") : tail;
  return `${question} ${t}`;
}

/** A public case's description in 繁體: the call, introduced as the 卜卦's — once, and only if it is not said already. */
export function caseDescriptionHead(desc: string, l: Locale): string {
  if (l !== "zh-hant" || !desc || desc.includes(BUGUA)) return desc;
  const s = `卜卦斷語：${desc}`;
  return s.length > 160 ? `${s.slice(0, 157)}…` : s;
}
