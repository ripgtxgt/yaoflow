import { hkWords, NARROW_EXAMPLES, SIGN_TEXT, type Sign } from "./jiaobei";
import { toHans } from "./hant";

/** 10-16 进度表 67: every word the 擲筊／求籤 pages show, in 繁體 (Taiwan); built server-side for the reader's register */
export const JB_UI_HANT = {
  qLabel: "想問的事（可以不填，不會公開）",
  qPh: "例：這個月底前，他會不會主動傳訊息給我？",
  qqLabel: "想問的事",
  qqPh: "例：這份工作我下週一前答應好不好？",
  tossBtn: "擲筊",
  tossing: "擲……",
  again: "把問題改清楚，再擲一次",
  same: "這件事的杯象在上面。想問別的事，換一件再擲。",
  examplesHead: "可以這樣改：",
  newMatter: "問另一件事",
  toQiuqian: "抽一支籤 →",
  // 10-22 进度表 86 承接地圖 (设计稿第 3 節): 聖筊 → 求籤 first; the cast stays as the quiet second
  shengLead: "聖筊了，抽一支籤看更多。", toQiuqianBtn: "抽一支籤 →", toCastQuiet: "想知道哪幾天會有動靜，起一卦 →",
  toCast: "起一卦看日子 →",
  toCastSheng: "起一卦，看哪幾天會有動靜 →",
  toCastYin: "起一卦，看卡在哪、哪幾天會動 →",
  toTarot: "抽一張塔羅，看這件事現在 →",
  howToAsk: "怎麼問比較好 →",
  templeLabel: "在哪間廟求籤",
  step1: "先擲筊請示可不可以抽籤：要一個聖筊。",
  requestBtn: "擲筊請示",
  requestNo: "再靜一下，換個說法再請示（第 {n}／3 次）",
  requestOut: "三次都沒有聖筊，建議改天再求。",
  requestOk: "聖筊，可以抽籤了。",
  drawBtn: "搖籤筒，抽一支",
  drawn: "抽到第 {n} 籤",
  confirmBtn: "擲筊確認籤號",
  ruleOne: "確認籤號要一個聖筊",
  ruleThree: "這間廟的規矩是連續三個聖筊才確認籤號",
  progress: "聖筊 {have}／{need}",
  confirmFail: "不是聖筊——這支不算，重抽一支。",
  confirmed: "籤號確認了。",
  goLot: "看第 {n} 籤的籤詩與白話 →",
  sameDay: "這件事今天已經求過一支籤：",
  ruleLabel: "要擲幾次",
  ruleThreeTw: "三個聖筊（問大事）",
  ruleThreeCn: "三個聖杯（問大事）",
  ruleThreeHk: "三個聖筊（問大事）",
  ruleOneAsk: "擲一次（日常小事）",
  nextToss: "聖筊 {have}／3，擲第 {n} 次",
  threeOk: "三個聖筊",
  xiaoGoOn: "笑筊：把問法說得更清楚一點，再擲。",
  threeOkLine: "這件事得到確認（不是保證結果）。",
  stopAt: "第 {n} 次",
  yinStop: "這件事今天還沒確認，先停一停、換個角度想。",
  soundOn: "聲音 開",
  soundOff: "聲音 關",
  notReplace: "線上擲筊不取代到廟裡親手擲筊，適合先把想問的事想清楚。",
};
const BASE = JB_UI_HANT;
export type JiaobeiUi = typeof BASE & { signs: Record<Sign, { name: string; line: string; next: string }>; examples: string[] };

export function jiaobeiUi(opts: { hans: boolean; hk: boolean }): JiaobeiUi {
  const f = (s: string) => { const w = opts.hk ? hkWords(s) : s; return opts.hans ? toHans(w) : w; };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(BASE)) out[k] = f(v);
  out.signs = Object.fromEntries(Object.entries(SIGN_TEXT).map(([k, v]) => [k, { name: f(v.name), line: f(v.line), next: f(v.next) }]));
  out.examples = NARROW_EXAMPLES.map(f);
  return out as JiaobeiUi;
}
