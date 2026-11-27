import { createHash } from "node:crypto";
import { db, recordOps } from "./db";
import { chatText } from "./llm";
import { classifyTopic } from "./topic";
import { toHans, toHant } from "./hant";
import { bridgeTone, type BridgeTone } from "./ops-actions";

/**
 * 10-26 (Neil: 「像這些問題，能不能在這些產品的下面推薦正緣畫像…三條路都做」) — under a love question's result on every asking
 * product (六爻 reading, 塔羅, 擲筊, 解籤, 命盤問答), one card to the next thing that answers the other half of the question:
 * 正緣畫像 (what kind of person you go well with), or 合盤 for a reader who already has a 正緣畫像.
 * The card's sentence is written by the model for THIS question (one short call, cached per question), checked here, and
 * replaced by the fixed sentence whenever the check fails or the model is slow — the card never waits on it.
 * Which questions count as love is the rules' classifyTopic (no model call); nothing is shown for any other topic.
 */
export type BridgeProduct = "zhengyuan" | "hepan";
export type BridgeSurface = "reading" | "tarot" | "jiaobei" | "jieqian" | "qa";
export const BRIDGE_SURFACES: readonly BridgeSurface[] = ["reading", "tarot", "jiaobei", "jieqian", "qa"];

const NAME: Record<BridgeProduct, string> = { zhengyuan: "正緣畫像", hepan: "合盤" };
const FIXED: Record<BridgeProduct, string> = {
  zhengyuan: "這件事怎麼走看結果；容易和你走在一起的是哪一類人，可以看正緣畫像。",
  hepan: "這件事怎麼走看結果；你們兩個人的相處節奏和容易卡住的地方，可以看合盤。",
};
/** 10-28 进度表 119: the 運營動作 bridge_tone switch (lib/ops-actions.ts) — another opening for the fixed line and the model's */
const TONED: Record<BridgeTone, Partial<Record<BridgeProduct, { fixed: string; hint: string }>>> = {
  result: {},
  person: { zhengyuan: { fixed: "容易和你走在一起的是哪一類人、相處起來是什麼節奏，正緣畫像從你的八字畫給你看。", hint: "開頭先說「容易和你走在一起的是哪一類人」，再接讀者問的那件事。" } },
  place: { zhengyuan: { fixed: "那類人可能在哪裡、哪個方向遇見，正緣畫像從你的八字畫給你看；這件事怎麼走看結果。", hint: "開頭先說「可能在哪裡、哪個方向遇見」，再接讀者問的那件事。" } },
};
/** words a bridge line may never carry (the site's banned list, plus a verdict on the relationship) */
const BANNED = /準|灵验|靈驗|AI|人工智能|神明|吉|凶|化解|改運|改运|注定|一定會|一定会|保證|保证|必定|命中|分手吧|離開他|离开他|他|她/;

export function isLoveQuestion(question: string): boolean {
  return classifyTopic(toHans(question)) === "relationship";
}

/** 合盤 for a reader who already has a 正緣畫像, else 正緣畫像 */
export function bridgeProductFor(customerId: number | null | undefined): BridgeProduct {
  if (!customerId) return "zhengyuan";
  try {
    return db().prepare("SELECT 1 FROM bazi_reports WHERE customer_id = ? AND kind = 'love' AND paid_at IS NOT NULL LIMIT 1").get(customerId) ? "hepan" : "zhengyuan";
  } catch { return "zhengyuan"; }
}

let ready = false;
function ensure(): void {
  if (ready) return;
  db().exec(`CREATE TABLE IF NOT EXISTS bridge_lines (
    key TEXT PRIMARY KEY, product TEXT NOT NULL, surface TEXT NOT NULL, line TEXT NOT NULL, how TEXT NOT NULL, created_at INTEGER NOT NULL
  )`);
  ready = true;
}

/** a model line is kept only when it is one short sentence, names the product, and says nothing the site never says */
export function lineOk(line: string, product: BridgeProduct): boolean {
  const s = toHant(line.trim());
  const n = [...s].length;
  return n >= 14 && n <= 70 && s.includes(NAME[product]) && !BANNED.test(s) && !/\n/.test(s) && (s.match(/[。！？]/g) ?? []).length <= 2;
}

const PROMPT = (product: BridgeProduct, tone: BridgeTone) => [
  `你為一個問事網站寫一句話，放在讀者看完結果之後，把他們帶到「${NAME[product]}」。`,
  product === "zhengyuan"
    ? "正緣畫像：從讀者自己的八字，畫出容易和他走在一起的那一類人——樣子、氣質、相處的節奏、可能在哪裡遇見。它看的是一類人，不是某一個人。"
    : "合盤：把兩個人的生辰放在一起看相處的節奏、容易卡住的地方、各自要讓的一步。",
  "要求：只寫一句，繁體中文，20 到 50 個字；用「你」稱呼讀者，提到對方一律寫「TA」，不要寫他或她；先接住讀者問的那件事（用自己的話，不要照抄問題），再說" + NAME[product] + "能幫他看清楚什麼；句子裡一定要出現「" + NAME[product] + "」四個字（或兩個字）。",
  ...(TONED[tone][product] ? [TONED[tone][product]!.hint] : []),
  "不可以：回答或暗示問題的答案；說準、靈驗、AI、神明、吉凶、化解、改運、注定、一定、保證；勸人分手或離開；用感嘆號；加引號或任何前後說明。",
  "只輸出那一句話。",
].join("\n");

/** the card's sentence: cached → the model (≤ 6 s, checked) → the fixed one */
export async function bridgeLine(question: string, product: BridgeProduct, surface: BridgeSurface, locale: string, opts: { model?: boolean } = {}): Promise<{ line: string; how: "model" | "fixed" | "cached" }> {
  const hans = locale === "zh";
  const out = (s: string) => (hans ? toHans(s) : toHant(s));
  ensure();
  const tone = bridgeTone();
  const fixed = TONED[tone][product]?.fixed ?? FIXED[product];
  const key = createHash("sha1").update(`${product}|${surface}|${tone === "result" ? "" : `${tone}|`}${question.trim()}`).digest("hex");
  const had = db().prepare("SELECT line FROM bridge_lines WHERE key = ?").get(key) as { line: string } | undefined;
  if (had) return { line: out(had.line), how: "cached" };
  if (opts.model === false) return { line: out(fixed), how: "fixed" };
  let line = fixed, how: "model" | "fixed" = "fixed";
  try {
    const raw = await chatText([{ role: "system", content: PROMPT(product, tone) }, { role: "user", content: `讀者問的是：${[...question.trim()].slice(0, 120).join("")}` }], { maxTokens: 120, temperature: 0.7, timeoutMs: 6000, light: true });
    const s = toHant(raw.trim().replace(/^["「『]|["」』]$/g, ""));
    if (lineOk(s, product)) { line = s; how = "model"; } else recordOps("bridge_line_rejected", `${product} ${surface} ${[...s].length}`);
  } catch (e) {
    recordOps("bridge_line_fail", (e instanceof Error ? e.message : "?").slice(0, 80));
  }
  try { db().prepare("INSERT OR IGNORE INTO bridge_lines (key, product, surface, line, how, created_at) VALUES (?,?,?,?,?,?)").run(key, product, surface, line, how, Date.now()); } catch { /* a race with another view */ }
  return { line: out(line), how };
}

export const bridgeHref = (product: BridgeProduct, locale: string, surface: BridgeSurface) => `/${locale}/${product}?c=bridge-${surface}`;
export const bridgeName = (product: BridgeProduct, locale: string) => (locale === "zh" ? toHans(NAME[product]) : NAME[product]);
