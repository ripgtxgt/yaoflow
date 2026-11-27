import { askWindow, scaleFromWindow } from "./ask-window";
import { SCALE_KW, scaleText } from "./keywords";
import type { QuestionScale } from "./timing";

/**
 * What time scale a question lives on — the words only (09-24: split out of
 * timing.ts so the cast page can show it live under the question box).
 * Runs in the browser too, so NO lookbehind anywhere in here or in what it
 * imports (older Safari rejects the whole bundle; test/ask-window.test.ts).
 * Simplified and Traditional both, because the browser has no OpenCC — the
 * server converts to Simplified first, the page does not.
 */

/**
 * 择时 — "when should I do X" is a different calculation from "when will X
 * happen": pick the months in which the focal line is strong or fed
 * (用神旺相、得月建生扶), avoid the months that break it. Phase-level by nature.
 */
const CHOOSE_RE = /(?:什么|什麼)(?:时候|時候)(?:去|开始|開始|做|适合|適合|合适|合適|该|該|应该|應該|动手|動手|着手|著手|启动|啟動|推出|上线|上線|推广|推廣|发布|發布|辞|辭|离|離|搬|买|買|卖|賣|提|谈|談|签|簽|出手|行动|行動)|何[时時](?:开始|開始|去|做|适合|適合|动手|動手|启动|啟動|推出|出手)|(?:什么|什麼)(?:时机|時機)|时机|時機|择日|擇日|择时|擇時|哪天(?:开始|開始|去|做|动手|動手)|哪(?:个|個)月(?:开始|開始|去|做|合适|合適|适合|適合)|when should i|when is (?:a|the) (?:good|best|right) time|best time to|good time to|when to (?:start|launch|begin|move|sell|buy|quit)/i;

const NOW_RE = /此刻|马上|馬上|立刻|眼下|今天|今日|今早|今晚|今夜|上午|中午|午觉|午覺|午休|下午|傍晚|晚上|一会|一會|待会|待會|等下|等会|等會|现在(?!的)|現在(?!的)|right now|\bnow\b|today|tonight|this (?:morning|afternoon|evening)|at the moment/i;
const DAY_RE = /明天|明日|后天|後天|本周|本週|这周|這週|周末|週末|下周|下週|这几天|這幾天|近几天|近幾天|几天内|幾天內|\d{1,2}\s*月\s*\d{1,2}\s*[日号號]|[周週][一二三四五六日天]|tomorrow|this week|next week|weekend|in a few days|(?:mon|tues|wednes|thurs|fri|satur|sun)day/i;
/**
 * Matters that take months by their nature — pinning them to a day is fake
 * precision. 出国/移民/买房/结婚/转行/创业/考研… these get a month-level
 * window (a phase), with at most a nearer "first sign" date.
 */
const LONG_RE = /出国|出國|移民|留学|留學|定居|移居|[买買].{0,4}房|[卖賣]房|置业|置業|[购購]房|房子|房产|房產|[结結]婚|[离離]婚|生子|备孕|備孕|怀孕|懷孕|创业|創業|开公司|開公司|开店|開店|转行|轉行|换行|換行|考研|考博|读博|讀博|考公|考编|考編|高考|升学|升學|搬去|换城市|換城市|长期|長期|未来几年|未來幾年|几年内|幾年內|前景|命运|命運|一生|一辈子|一輩子|大方向|emigrat|immigra|abroad|overseas|relocat|study abroad|buy(?:ing)? a (?:house|home|flat)|marry|marriage|divorce|start(?:ing)? a (?:business|company)|career change|long[- ]term|next few years|the future/i;

export function questionScale(question: string, castMs = Date.now(), tzOffsetMinutes = 480): QuestionScale {
  const q = scaleText(question);
  // a named day wins over a time-of-day word: "明天下午的面试" is a day question
  if (DAY_RE.test(q) || SCALE_KW.day.test(q)) return "day";
  if (NOW_RE.test(q) || SCALE_KW.now.test(q)) return "now";
  if (CHOOSE_RE.test(q) || SCALE_KW.choose.test(q)) return "choose";
  if (LONG_RE.test(q) || SCALE_KW.long.test(q)) return "long";
  // 09-24: "这个月能签吗" / "三天内会回吗" / "年底前能还清吗" named a window the words above miss
  const w = askWindow(question, castMs, tzOffsetMinutes);
  if (w) {
    const s = scaleFromWindow(w);
    // a month- or year-sized phrase is at least "weeks", however few days are left in it
    return s === "day" && /月|年|month|year|mes|mois|monat|달|년|jahr|année|año|ano/i.test(w.phrase) ? "weeks" : s;
  }
  return "open";
}
