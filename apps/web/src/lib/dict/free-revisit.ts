/**
 * 10-22 进度表 90 免費讀者也給回訪 — the words of the block under a free 六爻 reading (components/cast/FreeRevisit) and
 * the 「你打算怎麼做」 line of the paid reading page (components/RevisitPlan). Chinese pages only; client-safe (no
 * converter): both scripts written out.
 */
export type FreeRevisitWords = {
  head: string; sub: string; outcome: string; outcomePh: string; plan: string; planPh: string; when: string;
  d14: string; d30: string; d90: string; email: string; mine: string; go: string; saved: string; undo: string; undone: string; error: string;
  /** the paid reading page (before its window closes) */
  willAsk: string; planSaved: string; planGo: string;
};

const HANT: FreeRevisitWords = {
  head: "到期回來問你",
  sub: "免費的也算。選個時間，到時候寫信問你這件事後來怎麼樣了；應了沒應，都記下來。",
  outcome: "怎樣算有結果？（選填）", outcomePh: "例：他先傳訊息來",
  plan: "你打算怎麼做？（選填，只給你自己看）", planPh: "例：先不主動，等他開口",
  when: "什麼時候回來問你", d14: "2 週後", d30: "1 個月後", d90: "3 個月後",
  email: "寄到哪個信箱", mine: "只用來寄這一封，不寄廣告。", go: "到時候問我",
  saved: "好，{date} 寫信問你這件事後來怎麼樣。", undo: "不用了", undone: "好，不寄了。", error: "沒存成，再試一次。",
  willAsk: "到 {date}，我們回來問你", planSaved: "記下了，到時候信裡會提醒你自己說過的話。", planGo: "記下來",
};
const HANS: FreeRevisitWords = {
  head: "到期回来问你",
  sub: "免费的也算。选个时间，到时候写信问你这件事后来怎么样了；应了没应，都记下来。",
  outcome: "怎样算有结果？（选填）", outcomePh: "例：他先发消息来",
  plan: "你打算怎么做？（选填，只给你自己看）", planPh: "例：先不主动，等他开口",
  when: "什么时候回来问你", d14: "2 周后", d30: "1 个月后", d90: "3 个月后",
  email: "寄到哪个邮箱", mine: "只用来寄这一封，不寄广告。", go: "到时候问我",
  saved: "好，{date} 写信问你这件事后来怎么样。", undo: "不用了", undone: "好，不寄了。", error: "没存成，再试一次。",
  willAsk: "到 {date}，我们回来问你", planSaved: "记下了，到时候信里会提醒你自己说过的话。", planGo: "记下来",
};

export const freeRevisitWords = (locale: string): FreeRevisitWords | null => (locale === "zh-hant" ? HANT : locale === "zh" ? HANS : null);
