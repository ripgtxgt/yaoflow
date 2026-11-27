import { toHans } from "@/lib/hant";
import type { ZeriUi } from "@/components/mingli/ZeriPanel";

/** 10-17 进度表 70: the words of the 擇日 panel, in 繁體; 简体 through OpenCC */
const BASE = {
  zLabel: "屬什麼？（可以跳過）", zSkip: "不選", ghost: "避開農曆七月", span: "{n} 天內",
  head: "適合{m}的日子 · {n} 天", none60: "這段時間通書上沒有合適的日子，換成 90 天看看。", none90: "這段時間通書上沒有合適的日子，可以換一件相近的事，或請教熟悉的老師。",
  why: "通書寫宜{w} · 沖屬{c}", remind: "提醒我這一天",
  spanYear: "一整年", mineOn: "按{who}的八字再篩一次：去掉沖、刑{who}日柱的 {n} 天", mineOff: "沖刑{who}日柱", mineNeed: "填一次你的生辰（標成「自己」），就能按你的八字再篩一次。", mineNeedGo: "去填生辰",
  memberTease: "會員可看一整年，並按你的八字再篩掉沖、刑你日柱的日子", memberGo: "看會員方案", you: "你", both: "你和對方", remindDone: "好，前一天寄信提醒你；過了那天，再問你一句順不順。", remindSet: "已設提醒，前一天寄到 {e}，過了那天再問你一句", remindCancel: "取消", remindCancelled: "已取消提醒", remindGo: "提醒我", remindErr: "沒存成，稍後再試一次。", emailPh: "你的信箱",
};
const ZODIAC_TW = ["鼠", "牛", "虎", "兔", "龍", "蛇", "馬", "羊", "猴", "雞", "狗", "豬"];
const WEEK = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
export function zeriUi(hans: boolean): ZeriUi {
  const f = (s: string) => (hans ? toHans(s) : s);
  return {
    ...(Object.fromEntries(Object.entries(BASE).map(([k, v]) => [k, f(v)])) as typeof BASE),
    zodiac: ZODIAC_TW.map(f), week: WEEK.map(f), zodiacKeys: "鼠,牛,虎,兔,龙,蛇,马,羊,猴,鸡,狗,猪",
  };
}
