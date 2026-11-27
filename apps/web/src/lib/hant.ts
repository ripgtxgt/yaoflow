// server-side only: never import from a client component (see below)
import { createRequire } from "node:module";
import type { Locale } from "./locales";

/**
 * Simplified ⇄ Traditional Chinese, server-side only (the dictionaries are
 * ~1MB; the client never needs them — client copy comes from lib/dict).
 * twp = Taiwan/HK vocabulary as well as script (連結, 重新整理, 軟體…).
 */
const require_ = createRequire(import.meta.url);
type Conv = (s: string) => string;
let s2t: Conv | null = null;
let t2s: Conv | null = null;
let s2tScript: Conv | null = null;

function load(): { s2t: Conv; t2s: Conv; s2tScript: Conv } {
  if (!s2t || !t2s || !s2tScript) {
    const OpenCC = require_("opencc-js") as { Converter: (o: { from: string; to: string }) => Conv };
    s2t = OpenCC.Converter({ from: "cn", to: "twp" });
    t2s = OpenCC.Converter({ from: "tw", to: "cn" });
    // 09-22: script only — no vocabulary swap (twp turns 消息 into 訊息).
    // 09-24 zh-hant review: `tw`, not `t`. Both leave 消息 / 對方 alone (re-measured:
    // tw('还没有消息') = 還沒有消息), but `t` writes OpenCC's own standard forms that
    // Taiwan and Hong Kong do not use — 爲 裏 着 羣 祕 牀 喫 峯 — and, because it
    // also rewrites those characters when the reader's text already has 為 群 秘 床
    // 吃 峰, every zh-hant field containing 秘密 / 吃飯 / 床 was being "repaired" into
    // 祕密 / 喫飯 / 牀. `tw` is the same script conversion with Taiwan glyph standards.
    s2tScript = OpenCC.Converter({ from: "cn", to: "tw" });
  }
  return { s2t, t2s, s2tScript };
}

/**
 * Simplified characters that fold two Traditional ones, where OpenCC's
 * default pick is the wrong one for what a reading says: 复合 in a question
 * about an ex is 復合 (reconcile), never 複合 (composite).
 */
const HANT_FIXES: [RegExp, string][] = [
  [/複合/g, "復合"],
  // 09-24 zh-hant review: 咸 (hexagram 31, 澤山咸) is also the simplified form of 鹹 (salty) and
  // both `twp` and `t` always pick 鹹 — the 咸 page and every 澤山咸 reading said 「鹹卦」.
  [/鹹/g, "咸"],
  // the Liu Yao clash is 沖 in Taiwan/HK books (日沖、月沖、暗沖); OpenCC writes 日衝. 衝動/衝突/衝刺 stay.
  [/([日月暗逢])衝(?![動突擊刺撞])/g, "$1沖"],
  // 占 = divine, 佔 = occupy. OpenCC turns the divining 占 into 佔 (一事一佔、六爻事業佔、佔一卦) —
  // even in text that is already Traditional. 佔據 / 佔上風 are left alone.
  [/(?<=[事業爻再卦一重])佔|佔(?=[問卜卦斷筮])/g, "占"],
  // OpenCC (twp, t and tw alike) turns every 台 into 臺 — also in text that is already Traditional
  // (台北 → 臺北, 平台 → 平臺). Taiwan and Hong Kong write 台 in everyday copy.
  [/臺/g, "台"],
];

/**
 * Taiwan/HK wording fixes for our own copy converted with `twp` (legal, emails,
 * trust, 64-hexagram commentary) — applied in toHant only, never to a reader's
 * or the model's own Traditional text. 09-24 zh-hant review; each one was seen
 * on a live page or email.
 */
const TW_FIXES: [RegExp, string][] = [
  [/賬/g, "帳"], [/到帳/g, "入帳"], [/郵箱/g, "信箱"], [/營銷/g, "行銷"], [/數字內容/g, "數位內容"],
  [/時機視窗/g, "應期"], [/視窗/g, "窗口"], // 时机窗口 → 視窗 (a UI window)
  [/迴音/g, "回音"], [/迴歸/g, "回歸"], [/迴圈/g, "循環"], // 回归/循环 → 迴歸/迴圈 (迴圈 = a code loop)
  [/永珍/g, "萬象"], [/區域性/g, "局部"], [/全域性/g, "全局"], [/釋出/g, "發布"], [/質量/g, "品質"],
  [/瞭解讀/g, "了解讀"], [/重復/g, "重複"], [/被髮/g, "被發"], [/揹/g, "背"], [/矇/g, "蒙"], [/剋制/g, "克制"],
  [/(?<![一二兩三四五六七八九十幾每這那哪單另])隻/g, "只"], // 只 → 隻 (「別隻盯著」「沒有隻去不回」)
  [/兇(?![手殘狠猛悍惡])/g, "凶"], [/(?<!象)徵凶/g, "征凶"], [/見鬥/g, "見斗"], [/遁/g, "遯"], // 吉凶、征凶、日中見斗、天山遯
  [/欺詐/g, "詐欺"], [/運營/g, "營運"], [/構建/g, "打造"], [/批次抓取/g, "大量抓取"], [/退出即清除/g, "登出即清除"],
  [/註疏/g, "注疏"], [/斯坦福/g, "史丹佛"], [/回復(?=確認|這封)/g, "回覆"], [/衝正/g, "沖正"], [/卡組織/g, "發卡機構"],
  [/沒有訊息/g, "沒有消息"], [/重複訪問/g, "重複開啟"], [/交付與訪問/g, "交付與存取"], [/限制訪問/g, "限制存取"],
  // Taiwan/HK quote marks
  [/“([^“”\n]*)”/g, "「$1」"], [/‘([^‘’\n]*)’/g, "「$1」"], [/'([^'\n]*\p{Script=Han}[^'\n]*)'/gu, "「$1」"],
];

/**
 * Taiwan *vocabulary* substitutions (the "p" in twp) that are wrong in a
 * reading, because the word we mean is the everyday one, not the technical
 * one the substitution assumes:
 *   对象 — the person you are seeing (對象), never an item (物件). 09-17: a
 *          relationship reading came out "今年到明年是有物件的".
 *   支持 — backing someone (支持), not sending reinforcements (支援).
 * Masked with private-use sentinels so OpenCC cannot touch them, then
 * restored. Masking the source (rather than rewriting 物件/支援 afterwards)
 * leaves hand-written Traditional copy alone — "支援大陸卡" stays as written.
 */
const KEEP: [RegExp, string][] = [
  [/对象|對象/g, "對象"],
  [/支持/g, "支持"],
];

/** 简 → 繁（台港用词）。 */
export function toHant(s: string): string {
  const held: string[] = [];
  let src = s;
  KEEP.forEach(([re, to], i) => {
    src = src.replace(re, () => {
      held.push(to);
      return `${i}${held.length - 1}`;
    });
  });
  let out = load().s2t(src);
  out = out.replace(/\d+(\d+)/g, (_, n: string) => held[Number(n)] ?? "");
  for (const [re, to] of HANT_FIXES) out = out.replace(re, to);
  for (const [re, to] of TW_FIXES) out = out.replace(re, to);
  return out;
}

/**
 * 简 → 繁, script only — no Taiwan vocabulary substitution (09-22).
 *
 * `toHant` uses OpenCC's `twp`, which also swaps words: 消息→訊息, 軟件→軟體.
 * That is right for our own copy, and wrong for cleaning up a model answer
 * that is already Traditional — it would rewrite the reader's own idiom. This
 * one uses `t`, which moves Simplified characters and leaves vocabulary alone.
 */
export function toHantScript(s: string): string {
  let out = load().s2tScript(s);
  for (const [re, to] of HANT_FIXES) out = out.replace(re, to);
  return out;
}

/**
 * 繁 → 简 — used to normalise questions before keyword rules (topic, timing scale).
 * Japanese is left alone: kana marks it, and t2s would turn 復縁 into 复縁 and lose
 * every kanji keyword (09-10, found by the nine-language run).
 */
export function toHans(s: string): string {
  if (/[\u3040-\u30ff]/.test(s)) return s;
  return load().t2s(s);
}

/** Any simplified-Chinese text a reader in `locale` should see in their script. */
export function forLocale(zh: string, locale: Locale): string {
  // Japanese readers get the traditional forms too (兌／澤, the kanji their books use)
  return locale === "zh-hant" || locale === "ja" ? toHant(zh) : zh;
}

/** Map every string in a flat record (email tables, legal sections). */
export function hantRecord<T extends Record<string, string>>(r: T): T {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(r)) out[k] = toHant(v);
  return out as T;
}

/**
 * How much of a text OpenCC would rewrite on the way to Traditional: ~0 for
 * text that already is Traditional (a handful of variant forms at most),
 * 0.2–0.4 for a Simplified paragraph. Counted over CJK characters only.
 */
export function hansRatio(s: string): number {
  const cjk = s.match(/[一-鿿]/g);
  if (!cjk || cjk.length === 0) return 0;
  // 09-22: this measured the distance to `toHant` (twp), which also swaps
  // vocabulary — so 「還沒有消息」, perfectly good Traditional, scored 0.17 and
  // was judged Simplified, and the "repair" then rewrote it to 「訊息」. We were
  // corrupting readers' words and logging it as a leak. Script only now: a
  // Traditional sentence scores ~0 whatever words it uses.
  const t = toHantScript(s);
  if (t.length !== s.length) return 1; // a phrase rewrite changed the length: certainly Simplified vocabulary
  let diff = 0;
  for (let i = 0; i < s.length; i++) if (s[i] !== t[i]) diff++;
  return diff / cjk.length;
}

/** Above this share of rewritten CJK characters a field is judged to be Simplified, not a variant here and there. */
export const HANS_LEAK_THRESHOLD = 0.04;

/**
 * The model was seen answering a zh-hant reading entirely in Simplified
 * (09-09, 水風井). Rather than burn a retry, convert the leaking fields with
 * OpenCC (cn → twp: script and Taiwan vocabulary) and report which ones
 * leaked so the ops log shows how often it happens. Fields that are already
 * Traditional are left byte-for-byte alone.
 */
export function ensureHant<T extends Record<string, string>>(fields: T): { fixed: T; leaked: string[] } {
  const fixed: Record<string, string> = { ...fields };
  const leaked: string[] = [];
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v !== "string") continue;
    if (hansRatio(v) > HANS_LEAK_THRESHOLD) {
      // the whole field is Simplified: convert it properly, Taiwan vocabulary included
      fixed[k] = toHant(v);
      leaked.push(k);
    } else if (v !== toHantScript(v)) {
      // 09-22: below the threshold the field used to be shipped untouched, so a
      // paragraph with three stray Simplified characters reached the reader as
      // written. That was tolerable while the readings were free; it is not now.
      // Script-only, so a reader's own Traditional idiom is never rewritten —
      // 消息 stays 消息, and only the Simplified characters move.
      fixed[k] = toHantScript(v);
    }
  }
  return { fixed: fixed as T, leaked };
}

