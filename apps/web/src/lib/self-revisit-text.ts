import GEN from "@/data/l10n/selfrev.json";
import { isForeign, type Generated } from "@/lib/l10n/core";
import { localize } from "@/lib/l10n/server";
import { toHans } from "@/lib/hant";

/**
 * 10-22 进度表 80「到期回來問你」 for a paid report, the 年書, a picked day and a free cast (lib/self-revisit.ts) — the
 * report page block, the account page list, the choices, the names and the letter, 繁體 as written.
 * 10-30 进度表 128 ④: in all nine languages (data/l10n/selfrev.json; scripts/l10n/translate.ts selfrev).
 */
const UI = {
  head: "到期回來問你", sub: "選個時間，我們寫信問你這份報告說的，後來怎麼樣了。", outcome: "怎樣算有結果？（選填）", outcomePh: "例：換到想去的部門", when: "什麼時候回來問你",
  go: "到時候問我", saved: "{date} 會寫信問你。", change: "改", cancel: "不用了", email: "寄到哪個信箱", error: "沒存成，再試一次。", mine: "只用來寄這一封，不寄廣告。", answered: "這一次你已經回答過了。",
  // 10-22 进度表 89 (设计稿 R7): one line only the reader sees again — on 「我的」 and in the letter
  plan: "你打算怎麼做？（選填，只給你自己看）", planPh: "例：先不主動，等他開口", planShow: "你當時打算：{p}",
  // the account page's list (「我的」→ 回訪)
  listHead: "看自己：到期回來問你", listNote: "報告、年書和選的日子，到了日子寫信問你一句；答過的留在這裡。",
  willAsk: "{date} 問你", askedWaiting: "已寄信，等你一句", said: "你說", open: "還沒定", daysLeft: "還有 {n} 天",
  aHappened: "發生了", aStirred: "有一點動靜", aNothing: "沒發生", aOpen: "還沒有",
  // 进度表 90: the free block under a free reading
  freeHead: "到期回來問你", freeSub: "免費的也算。選個時間，到時候寫信問你這件事後來怎麼樣了；應了沒應，都會放進紀錄。",
  d14: "2 週後", d30: "1 個月後", d90: "3 個月後", freeSaved: "{date} 會寫信問你這件事後來怎麼樣。",
};
export const SELF_REV_HANT = {
  ui: UI,
  /** the choices on a report page (lib/self-revisit.ts OPTIONS) */
  opt: { m1: "1 個月後", m3: "3 個月後", m6: "半年後", ye: "今年年底", lyThis: "這個流月過完（農曆{lunar}，到 {d}）", lyNext: "下一個流月過完（農曆{lunar}，到 {d}）", lyBare: "這個流月過完" },
  kind: { bazi: "八字深度報告", ziwei: "紫微深度報告", astro: "星盤深度報告", nianshu: "三合一年書", zeri: "擇日", cast: "六爻起卦" },
  review: { report: "回看這份報告", nianshu: "回看年書", zeri: "回看那一天", cast: "再起一卦" },
  mail: {
    subject: "{label}，後來怎麼樣了？",
    leadReport: "買報告的時候，報告頁寫著到了這一天回來問你", leadNianshu: "年書標過的那個月，過去了", leadZeri: "你選的那一天，過了三天", leadCast: "你起卦的時候說，到了這一天回來問你",
    whyReport: "你收到這封郵件，是因為你買了這份報告；報告頁寫著到期回來問你，在那裡可以改日子或取消。這不是營銷郵件。",
    whyNianshu: "你收到這封郵件，是因為你買了年書，它標過的關鍵月過去了才問這一句。這不是營銷郵件。",
    whyZeri: "你收到這封郵件，是因為你設過這一天的提醒。這不是營銷郵件。",
    whyCast: "你收到這封郵件，是因為你起卦後選了「到期回來問我」。這不是營銷郵件。",
    thanks: "點一下就好；想多說幾句，直接回覆這封信。", plan: "你當時打算：{p}",
  },
};
export type SelfRevText = typeof SELF_REV_HANT;
export type SelfRevisitWords = typeof UI;

const hansDeep = <T>(t: T): T => (typeof t === "string" ? (toHans(t) as T) : t && typeof t === "object" ? (Object.fromEntries(Object.entries(t).map(([k, v]) => [k, hansDeep(v)])) as T) : t);
const HANS = hansDeep(SELF_REV_HANT);
/** the words in a language: 繁體 as written, 简体 converted, the others generated */
export function selfRevText(locale: string): SelfRevText {
  if (isForeign(locale)) return localize(SELF_REV_HANT, GEN as unknown as Generated, locale);
  return locale === "zh" ? HANS : SELF_REV_HANT;
}
