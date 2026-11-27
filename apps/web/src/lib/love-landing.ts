import type { Situation } from "./situation";

/**
 * 10-12 四個感情落地頁 (进度表 §四 37；竞品观察 O23). One page per search a heartbroken or hopeful reader actually types —
 * 復合占卜 / 他會回來嗎 / 正緣什麼時候出現 / 該不該主動聯絡 — each a door into the ordinary cast with the situation already
 * set and three ways to ask. 繁體 only. Copy: 内容/感情落地頁.md (推广会话 10-12); no 準 / AI / 保證.
 */
export const LOVE_LANDING_DATE = new Date("2026-10-13");
export const LOVE_LANDING_LOCALE = "zh-hant" as const;

export interface LoveLanding {
  slug: string;
  title: string;
  description: string;
  h1: string;
  sub: string;
  /** the cast page's 目前的狀態 chip, when one fits */
  situation?: Situation;
  /** what the box says the situation is */
  situationLabel: string;
  examples: string[];
  pairs: { from: string; to: string }[];
  timing: string[];
  faq: { q: string; a: string }[];
  /** public cases whose wording carries one of these are shown first */
  caseWords: RegExp;
  /** the short name other pages link with */
  short: string;
}

export const LOVE_SELL = "不用生辰，給你一個日子，到那天回來問你。";

const TIMING_BASE = "卦會挑出代表「他」或「這段關係」的那一爻，看它什麼時候被「合」、被「沖」、或從空亡裡出來——那幾天就是事情最容易動的時候。所以我們給的是日期或幾天的窗口，不是「再等等」。";

export const LOVE_LANDINGS: LoveLanding[] = [
  {
    slug: "fuhe",
    short: "復合占卜",
    title: "復合占卜｜他會不會回來、什麼時候有動靜 — 六爻卜卦",
    description: "分開了還放不下？寫一句話、親手搖六次，用六爻看這段關係還有沒有轉圜，給你一個日子，到那天回來問你。不用生辰。",
    h1: "復合占卜：這段關係，還有沒有回頭的那一天？",
    sub: "不是問「他還愛不愛我」，是問「這件事接下來會怎麼走、哪幾天會有動靜」。",
    situation: "apart",
    situationLabel: "復合",
    examples: ["分開兩個月了，他年底前會主動找我嗎？", "我傳了訊息他沒回，這段關係還有復合的機會嗎？", "如果我先開口，這個月有機會和好嗎？"],
    pairs: [
      { from: "他還愛我嗎？", to: "他這個月會不會主動跟我聯絡？" },
      { from: "我們會復合嗎？", to: "年底前，我們有沒有機會重新在一起？" },
      { from: "我該怎麼辦？", to: "如果我先傳訊息，這次他會回嗎？" },
    ],
    timing: [TIMING_BASE],
    faq: [
      { q: "問了一次結果不好，可以再問嗎？", a: "同一件事一天問一次就好。卦不好，先看它說卡在哪裡、你能做什麼；有新進展再問。" },
      { q: "需要他的生日嗎？", a: "不用。六爻問的是這件事，不是兩個人的命盤。" },
      { q: "給的日子沒發生怎麼辦？", a: "到那天我們會寄信問你。沒發生也照實記下，卦裡也會寫若沒動靜該怎麼看。" },
      { q: "會不會很貴？", a: "起卦、看盤面和卦辭都免費；想看日子和做法，用 1 日通卡看深斷，首張 NT$75，24 小時內其他事也不限次。" },
    ],
    caseWords: /復合|复合|回頭|回来|回來|前任|分手|和好|挽回/,
  },
  {
    slug: "hui-lai",
    short: "他會回來嗎",
    title: "他會回來嗎？斷聯後會不會聯絡、哪一天 — 線上卜卦",
    description: "斷聯、已讀不回、突然冷掉——他還會回來嗎？用六爻起一卦，看他會不會先開口、大概哪幾天，到那天我們回來問你。",
    h1: "他會回來嗎？先把問題問成卦答得了的樣子",
    sub: "「會不會」和「什麼時候」，是這類問題最常見、也最需要一個日子的兩件事。",
    situation: "apart",
    situationLabel: "斷聯",
    examples: ["斷聯三週了，他這個月會先傳訊息給我嗎？", "他已讀不回，這週會回我嗎？", "吵架之後他冷掉了，下個月前會主動找我嗎？"],
    pairs: [
      { from: "他到底在想什麼？", to: "他這兩週會不會主動找我？" },
      { from: "他會回來嗎？", to: "這個月底前，他會不會先開口？" },
      { from: "我要不要等他？", to: "如果我等到月底，他會不會聯絡？" },
    ],
    timing: [TIMING_BASE, "如果卦說他不會先開口，我們也會寫你可以先做什麼、哪幾天比較適合。"],
    faq: [
      { q: "一直問同一件事可以嗎？", a: "一天一次。之後有任何進展，到「這件事」頁記一筆，再依進展追問。" },
      { q: "能知道他心裡在想什麼嗎？", a: "卦能看出他的狀態和傾向，但不能代替他開口；我們會把重點放回你能做的事。" },
      { q: "需要他的生日嗎？", a: "不用。" },
      { q: "費用？", a: "起卦、盤面、卦辭免費；看深斷用 1 日通卡，首張 NT$75。" },
    ],
    caseWords: /斷聯|断联|聯絡|联络|已讀|已读|回我|找我|傳訊息|传讯息|回訊|主動/,
  },
  {
    slug: "zheng-yuan",
    short: "正緣什麼時候出現",
    title: "正緣什麼時候出現？不用生辰的六爻卜卦，給你一個日子",
    description: "單身很久、想知道對的人什麼時候出現？不用生辰八字，寫一句話起一卦，看感情的動靜落在哪幾個月、哪幾天。",
    h1: "正緣什麼時候出現？把「什麼時候」問清楚",
    sub: "命盤看一輩子的大方向；一卦看的是「這段時間」，會有什麼人、什麼時候出現。",
    situationLabel: "感情其他（單身）",
    examples: ["今年年底前，我會遇到可以認真交往的人嗎？", "明年上半年，我的感情會有新的開始嗎？", "最近認識的這個人，會發展成交往嗎？"],
    pairs: [
      { from: "我的正緣是誰？", to: "半年內，我會遇到可以認真交往的人嗎？" },
      { from: "我會結婚嗎？", to: "明年，我會不會開始一段穩定的關係？" },
      { from: "他是我的正緣嗎？", to: "我和這個人，三個月內會發展成交往嗎？" },
    ],
    timing: [TIMING_BASE, "時間範圍問得越清楚（例如「年底前」），給出的日子越具體。"],
    faq: [
      { q: "為什麼不用生辰？", a: "六爻看的是你問的這件事當下的卦，不需要八字。" },
      { q: "問「正緣是誰」可以嗎？", a: "卦答不了一個名字，但能答「這段時間會不會出現、從哪個方向」。" },
      { q: "和月老求籤有什麼不同？", a: "籤給方向；卦能給日子。已經在月老廟求了籤，可以到〈解籤〉選「月老聖籤」輸入籤號看白話，再為同一件事起一卦。" },
      { q: "費用？", a: "起卦、盤面、卦辭免費；看深斷用 1 日通卡，首張 NT$75。" },
    ],
    caseWords: /正緣|正缘|對象|对象|交往|遇到|桃花|單身|单身|新戀情|结婚|結婚/,
  },
  {
    slug: "zhu-dong",
    short: "該不該主動聯絡",
    title: "該不該主動聯絡他？什麼時候傳訊息比較好 — 六爻卜卦",
    description: "要不要先傳訊息？傳了會不會被已讀不回？起一卦看主動之後的走向，和比較適合開口的日子。",
    h1: "該不該主動聯絡？先看「主動之後會怎樣」",
    sub: "這個問題最怕兩件事：傳了沒回，或是錯過了。卦能幫你看走向，也能給比較適合開口的日子。",
    situation: "ambiguous",
    situationLabel: "曖昧",
    examples: ["如果我這週主動約他，他會答應嗎？", "我先傳訊息給他，這次會有好的回應嗎？", "要不要在他生日那天聯絡他？"],
    pairs: [
      { from: "我該不該主動？", to: "如果我這週先傳訊息，他會好好回我嗎？" },
      { from: "他會不會覺得我很煩？", to: "我主動約他吃飯，這個月會成嗎？" },
      { from: "怎樣他才會喜歡我？", to: "我們這個月有機會從朋友更進一步嗎？" },
    ],
    timing: [TIMING_BASE, "深斷會寫「比較適合開口的那幾天」和「先避開的做法」。"],
    faq: [
      { q: "卦說不要主動，是不是就沒希望了？", a: "不是，通常是時間還沒到，卦會寫要等的徵兆。" },
      { q: "可以問很多個時間點嗎？", a: "把它當同一件事，在「這件事」頁追問就好，不用重新起卦。" },
      { q: "需要他的生日嗎？", a: "不用。" },
      { q: "費用？", a: "起卦、盤面、卦辭免費；看深斷用 1 日通卡，首張 NT$75。" },
    ],
    caseWords: /主動|主动|約他|约他|傳訊息|传讯息|開口|开口|曖昧|暧昧|告白/,
  },
];

export function loveLanding(slug: string): LoveLanding | null {
  return LOVE_LANDINGS.find((p) => p.slug === slug) ?? null;
}

export const loveLandingPath = (slug: string) => `/${LOVE_LANDING_LOCALE}/ask/${slug}`;

/** The cast this page opens: its question, its situation chip, and its own campaign tag for the funnel. */
export function loveCastUrl(p: Pick<LoveLanding, "slug" | "situation">, question: string): string {
  const q = new URLSearchParams();
  if (question.trim()) q.set("q", question.trim());
  if (p.situation) q.set("st", p.situation);
  q.set("c", `ask-${p.slug}`);
  return `/${LOVE_LANDING_LOCALE}/cast?${q.toString()}`;
}

/** Up to five public cases: those that read like this page's question first, then other love cases, newest first. */
export function pickLoveCases<T extends { framing: string | null; public_id: string }>(p: Pick<LoveLanding, "caseWords">, love: T[], n = 5): T[] {
  const match = love.filter((c) => p.caseWords.test(c.framing ?? ""));
  const rest = love.filter((c) => !match.includes(c));
  return [...match, ...rest].slice(0, n);
}
