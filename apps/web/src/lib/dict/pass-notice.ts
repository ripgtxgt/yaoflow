/**
 * 10-14 进度表 §四 42 单月会员到期提醒 (Neil: 「把这几个做了吧」). One service letter before a pass ends: what it held,
 * then three buttons of the same size and weight — buy one more, switch to the monthly plan, or no thanks. 「不用了」 is
 * taken at its word: no pleading, no questions beyond one optional tap.
 *
 * 10-22 (Neil: 「要」 — the reader-facing words follow the 通卡): the one-off month is the 30 天通卡 now, so the letter
 * names the pass it is about ({name}: 7 天通卡 / 30 天通卡; an old one-off month is a 30 天通卡) and what 「再買」 buys
 * ({name30}); {period} is 「這個月」 for 30 days, 「這幾天」 for 7. The quiet line no longer speaks of an allowance.
 * {date} the end date, {pass} the 30-day pass's price, {month} the monthly price, {n} matters asked, {dates} revisit dates.
 */
export const PASS_NOTICE_T = {
  "zh-hant": {
    subject: "你的 {name}將在 {date} 到期",
    title: "你的 {name}將在 {date} 到期",
    asked: "{period}你問了 {n} 件事。",
    revisits: "其中有幾件，我們會在 {dates} 回來問你結果。",
    quiet: "{period}你還沒問事。",
    choose: "到期之後要怎麼辦，你來決定：",
    pass: "再買一張 {name30}（{pass}，不自動續）",
    month: "改成月訂 {month}／月（可隨時取消）",
    no: "不用了",
    foot: "到期不會自動扣款。已經解鎖的解讀、追問紀錄和到期回訪都照常保留。",
    help: "這是通卡服務通知。有問題直接回覆這封信。",
    // the pages behind the buttons
    pagePass: "再買一張 {name30}", pagePassLead: "新的一張從 {date} 接上，{pass}，一次付清、不會自動續。",
    pageMonth: "改成月訂", pageMonthLead: "月訂 {month}／月，從 {date} 開始扣款，今天不扣；之後可以在帳號頁隨時取消。",
    go: "前往付款",
    pageNo: "好的", pageNoLead: "到期後，已解鎖的解讀和回訪都照常保留。謝謝你。",
    survey: "（可以不答）這段時間用起來怎麼樣？", s1: "很有用", s2: "普通", s3: "沒怎麼用到",
    thanks: "收到了，謝謝。",
    stale: "這個連結已經過期，或已經處理過了。到帳號頁看看目前的狀態。",
    account: "到我的帳號",
  },
  zh: {
    subject: "你的 {name}将在 {date} 到期",
    title: "你的 {name}将在 {date} 到期",
    asked: "{period}你问了 {n} 件事。",
    revisits: "其中有几件，我们会在 {dates} 回来问你结果。",
    quiet: "{period}你还没问事。",
    choose: "到期之后怎么办，你来决定：",
    pass: "再买一张 {name30}（{pass}，不自动续）",
    month: "改成月订 {month}／月（可随时取消）",
    no: "不用了",
    foot: "到期不会自动扣款。已经解锁的解读、追问记录和到期回访都照常保留。",
    help: "这是通卡服务通知。有问题直接回复这封信。",
    pagePass: "再买一张 {name30}", pagePassLead: "新的一张从 {date} 接上，{pass}，一次付清、不会自动续。",
    pageMonth: "改成月订", pageMonthLead: "月订 {month}／月，从 {date} 开始扣款，今天不扣；之后可以在账号页随时取消。",
    go: "前往付款",
    pageNo: "好的", pageNoLead: "到期后，已解锁的解读和回访都照常保留。谢谢你。",
    survey: "（可以不答）这段时间用起来怎么样？", s1: "很有用", s2: "一般", s3: "没怎么用到",
    thanks: "收到了，谢谢。",
    stale: "这个链接已经过期，或者已经处理过了。到账号页看看现在的状态。",
    account: "到我的账号",
  },
  en: {
    subject: "Your {name} ends on {date}",
    title: "Your {name} ends on {date}",
    asked: "{period} you asked about {n} matters.",
    revisits: "For some of them we'll come back on {dates} to ask how it went.",
    quiet: "You haven't asked about anything yet.",
    choose: "What happens after it ends is up to you:",
    pass: "Another {name30} ({pass}, no auto-renewal)",
    month: "Switch to monthly {month}/month (cancel any time)",
    no: "No thanks",
    foot: "Nothing will be charged when it ends. Every reading you unlocked, your follow-ups and the check-ins stay as they are.",
    help: "This is a service notice about your pass. Questions? Just reply to this email.",
    pagePass: "Another {name30}", pagePassLead: "The new pass starts on {date}, right after this one: {pass}, paid once, no auto-renewal.",
    pageMonth: "Switch to monthly", pageMonthLead: "Monthly at {month}/month, first charge on {date} — nothing today; cancel any time from your account.",
    go: "Continue to payment",
    pageNo: "All right", pageNoLead: "After it ends, every reading you unlocked and the check-ins stay as they are. Thank you.",
    survey: "(Optional) How was it?", s1: "Very useful", s2: "So-so", s3: "Barely used it",
    thanks: "Got it — thank you.",
    stale: "This link has expired, or this has already been taken care of. Your account page shows where things stand.",
    account: "My account",
  },
} as const;
export type PassNoticeWords = (typeof PASS_NOTICE_T)["en"];
export const passNoticeWords = (locale: string): PassNoticeWords =>
  (locale === "zh-hant" || locale === "zh" || locale === "en" ? PASS_NOTICE_T[locale] : PASS_NOTICE_T.en) as PassNoticeWords;

/** {period}: the stretch the letter looks back on — 「這個月」 for a 30-day pass, 「這幾天」 for a 7-day one */
export function passNoticePeriod(locale: string, days: number): string {
  if (locale === "zh-hant") return days >= 30 ? "這個月" : "這幾天";
  if (locale === "zh") return days >= 30 ? "这个月" : "这几天";
  return days >= 30 ? "This month" : "This week";
}
