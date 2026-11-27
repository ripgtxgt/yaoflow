import GEN from "@/data/l10n/qa.json";
import { isForeign, type Generated } from "@/lib/l10n/core";
import { localize } from "@/lib/l10n/server";
import { toHans } from "@/lib/hant";

/**
 * 10-22 命盤問答 「問這張盤」 — the page words and the suggested questions (lib/mingli/qa.ts), 繁體 as written.
 * 10-30 进度表 128 ④: in all nine languages (data/l10n/qa.json; scripts/l10n/translate.ts qa).
 */
export const QA_UI = {
  head: "問這張盤", lead: "有什麼想問這張盤的，直接問。答案從盤面來，說的是傾向，不下定論。",
  ph: "例如：我適合什麼樣的工作？（200 字以內）", ask: "問", asking: "正在看盤……",
  suggest: "你可能想問", locked: "開一張通卡或會員，就能對著這張盤直接問：", signIn: "已經有通卡或會員？登入",
  covered: "通卡／會員：想問幾題就問幾題", cast: "想看這件事接下來的走向和時間，為它起一卦 →", report: "這張盤的深度報告 →",
  err: "這一題沒答成，再試一次。", capHit: "今天先到這裡，明天再來。", tooShort: "再多說一點，至少四個字。",
  disclaimer: "問答描述的是盤面的傾向，不替你下結論；不談健康、投資與法律。",
};
/** rules, no model: three of these, picked by the chart */
export const QA_POOL = {
  bazi: ["我適合什麼樣的工作？", "我在感情裡容易卡在哪裡？", "我的錢比較容易從哪裡來？", "我最需要留意的習慣是什麼？", "今年對我來說是什麼樣的一年？", "我跟人相處的方式有什麼特點？", "這個大運我該把力氣放在哪？", "我的身心節奏適合怎麼安排？"],
  ziwei: ["我的命宮主星說我是什麼樣的人？", "我的事業適合往哪個方向走？", "我的夫妻宮怎麼看感情？", "財帛宮說我和錢的關係是什麼？", "今年流年落在哪一宮，該注意什麼？", "我的福德宮說我怎麼才會安定？", "遷移宮適合我到外地發展嗎？", "我的四化最明顯的影響在哪？"],
  astro: ["我的太陽和月亮一起看，我是什麼樣的人？", "我的上升給人的第一印象是什麼？", "金星說我在感情裡要什麼？", "我適合什麼樣的工作節奏？", "土星在我盤上的功課是什麼？", "今年哪顆行星對我影響最大？", "我的水星說我怎麼溝通比較順？", "第七宮怎麼看我的伴侶關係？"],
};
export const QA_HANT = { ui: QA_UI, pool: QA_POOL };
export type QaText = typeof QA_HANT;

/** the words in a language: 繁體 as written, 简体 converted, the others generated */
export function qaText(locale: string): QaText {
  if (isForeign(locale)) return localize(QA_HANT, GEN as unknown as Generated, locale);
  if (locale !== "zh") return QA_HANT;
  return {
    ui: Object.fromEntries(Object.entries(QA_UI).map(([k, v]) => [k, toHans(v)])) as typeof QA_UI,
    pool: Object.fromEntries(Object.entries(QA_POOL).map(([k, v]) => [k, v.map(toHans)])) as typeof QA_POOL,
  };
}

/**
 * the box's words for one chart: the generated Japanese says 命盤 for every chart, as 紫微斗数 does — a 星盤 page says
 * ホロスコープ and a 八字 page 命式, the words Japanese readers use for those
 */
export function qaUi(locale: string, system: "bazi" | "ziwei" | "astro"): Record<string, string> {
  const ui = qaText(locale).ui as Record<string, string>;
  if (locale !== "ja" || system === "ziwei") return ui;
  const w = system === "astro" ? "ホロスコープ" : "命式";
  return Object.fromEntries(Object.entries(ui).map(([k, v]) => [k, v.replace(/命盤/g, w)]));
}
