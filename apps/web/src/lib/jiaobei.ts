import { TEMPLES, qianSet } from "./qian-meta";

/**
 * 10-16 进度表 67 線上擲筊＋線上求籤 (推广 10-16 写需求，Neil「67、68 做吧」；调研 _research/线上擲筊-调研-1016.md).
 *
 *   擲筊 (/jiaobei)  a matter, asked once: write it (optional, kept in this browser only) → toss → the first sign is the
 *                    answer. Only 笑筊 (the question was not clear) lets the reader narrow it and toss again.
 *   求籤 (/qiuqian)  in the temple's order: temple → the matter → 請示 (a 聖筊 to draw; up to 3 tries) → draw one lot →
 *                    擲筊確認籤號 (one 聖筊, or three in a row where that temple asks for three) → the lot's page.
 *
 * Odds: each block lands flat or round side up with even chance — 聖筊 (one of each) 50%, 笑筊 (both flat) 25%,
 * 陰筊 (both round) 25%; the browser's crypto random, no 「虔誠版」, no weighting. School science-fair throws of real
 * bamboo blocks land 聖筊 45–54% (see the page's notes). Free, no sign-up, nothing paid here — the lot's own page keeps its
 * personal reading as it is. Nothing says 神明說 / 靈驗 / 改運; no temple's name in a title; no 代擲, no 點燈.
 *
 * Words: Taiwan says 筊 (聖筊／笑筊／陰筊、擲筊), Hong Kong says 杯 (聖杯／笑杯／陰杯、擲杯) — hkWords() rewrites.
 */
export type Sign = "sheng" | "xiao" | "yin";

/** one toss: two blocks, each flat (true) or round side up */
export function toss(rand: () => number = secureRandom): { sign: Sign; blocks: [boolean, boolean] } {
  const a = rand() < 0.5, b = rand() < 0.5;
  return { sign: a !== b ? "sheng" : a ? "xiao" : "yin", blocks: [a, b] };
}

export function secureRandom(): number {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) { const u = new Uint32Array(1); c.getRandomValues(u); return u[0]! / 2 ** 32; }
  return Math.random();
}

/** 1…count, uniformly */
export function drawLot(count: number, rand: () => number = secureRandom): number {
  return Math.min(count, 1 + Math.floor(rand() * count));
}

/** temples whose rule is three 聖筊 in a row to confirm the number (the page says it is that temple's rule) */
export const THREE_CONFIRM = new Set<string>(["longshan"]);
export const confirmsNeeded = (temple: string) => (THREE_CONFIRM.has(temple) ? 3 : 1);
export const REQUEST_TRIES = 3;

/** the temples offered on /qiuqian, grouped by set (the same list the 解籤 entry uses) */
export function qiuqianTemples(): { id: string; name: string; set: string; setName: string; count: number }[] {
  return TEMPLES.filter((t) => !("listed" in t) || t.listed !== false).map((t) => {
    const s = qianSet(t.set);
    return { id: t.id, name: t.name, set: s.id, setName: s.name, count: s.count };
  });
}

/** Taiwan → Hong Kong wording */
export function hkWords(s: string): string {
  return s.replace(/擲筊/g, "擲杯").replace(/聖筊/g, "聖杯").replace(/笑筊/g, "笑杯").replace(/陰筊/g, "陰杯").replace(/筊杯/g, "杯").replace(/筊/g, "杯");
}

/** What each sign says, and where it leads — the wording follows the research: a direction, never a promise */
export const SIGN_TEXT: Record<Sign, { name: string; line: string; next: string }> = {
  sheng: { name: "聖筊", line: "方向獲得確認（不是保證結果）。", next: "要不要抽一支籤，看這件事的更多細節？" },
  xiao: { name: "笑筊", line: "問法還不夠清楚——先把問題收窄，再問一次。", next: "把問題改得更具體，可以再擲一次。" },
  yin: { name: "陰筊", line: "方向還沒確認，先停一停、換個角度想。", next: "想知道這件事哪幾天會有動靜？起一卦看日子。" },
};

/** 笑筊: three ways to narrow a question (推广 may replace these) */
export const NARROW_EXAMPLES = [
  "「我們會復合嗎？」→「這個月底前，他會不會主動傳訊息給我？」",
  "「工作會順利嗎？」→「這個 offer 我下週一前答應，對嗎？」",
  "「我該不該搬家？」→「年底前搬到台中，對我現在的工作好嗎？」",
] as const;

/**
 * The page's own notes (what people search 擲筊 for: meaning, steps, odds, each temple's rule). A first version written
 * from the research; 推广 hands in the reviewed text by 10-20 and replaces it here. FAQ structured data comes from FAQ.
 */
export const NOTES: { h: string; p: string }[] = [
  { h: "聖筊、笑筊、陰筊是什麼", p: "筊杯兩片，各有一面平、一面凸。一平一凸是聖筊，表示所問的事方向獲得確認；兩片都是平面朝上是笑筊，多半是問法不清楚或答案還沒定；兩片都是凸面朝上是陰筊，表示方向還沒確認，先停一停、換個角度。" },
  { h: "怎樣擲才算數", p: "先想好一件具體的事，說清楚是誰、什麼事、什麼時間範圍。日常小事擲一次，接受第一個杯象；問大事，台灣和福建、閩南多要擲到三個聖筊（聖杯）才算數，中途出現陰筊就停。笑筊多半是問法還不清楚，把問題說清楚再擲。不要為了想要的結果一直重擲。" },
  { h: "為什麼聖筊大約是一半", p: "每片筊落地時平面朝上或凸面朝上的機會若各一半，四種組合裡一平一凸佔兩種，所以聖筊約 50%、笑筊與陰筊各約 25%。實體筊會因形狀、材質和擲法略偏：嘉義市第 37 屆科展用竹筊實擲 300 次，聖筊 51.3%、笑筊 26.3%、陰筊 22.3%；其他科展實測聖筊多在 45% 到 54% 之間。" },
  { h: "求籤要幾個聖筊", p: "各廟規矩不同：多數廟是抽到籤後擲一個聖筊確認籤號，也有廟要連續三個聖筊，例如艋舺龍山寺。抽籤前也常先擲筊請示可不可以抽。" },
  { h: "連續笑筊怎麼辦", p: "連續笑筊通常表示問題太大或太模糊。把問題縮到一件事、一個時間範圍，例如把「會不會順利」改成「下週一前答應這個 offer 好不好」，再擲一次。" },
  { h: "線上擲筊算不算數", p: "線上擲筊不取代到廟裡親手擲筊；它適合在去廟裡之前，先把想問的事想清楚，或在不方便出門時先問一次。結果是給你參考的方向，不是保證。" },
];
export const FAQ = NOTES;

export function cleanQuestion(q: string): string {
  return q.replace(/\s+/g, " ").trim().slice(0, 80);
}
