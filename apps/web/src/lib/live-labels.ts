/**
 * 实时在线 (10-02, Neil: 「后台能做一个实时在线的监测功能吗？」): the words the live board uses for an event
 * and for a page. Pure — shared by the server snapshot and the client board.
 */

const EVENT_ZH: Record<string, string> = {
  page_view: "打开页面",
  pulse: "还在看",
  page_leave: "切走 / 离开",
  cast_start: "开始摇卦",
  cast_complete: "六爻摇完",
  teaser_shown: "看到免费一句",
  price_seen: "价格进入视野",
  reading_click: "点了解读按钮",
  reading_click_blocked: "点解读被闸门拦",
  reading_done: "解读生成完成",
  checkout_start: "去付款",
  checkout_back: "从 Stripe 退回（未付）",
  checkout_retry: "点了「回到付款」",
  purchase: "付款成功，解读已打开",
  followup_ask: "追问了一句",
  repeat_blocked: "同一问题提醒", // 10-02: since the cap stopped blocking, the only panel left — and it can be passed (see eventLabel)
  repeat_capped: "问满了照常起卦（不送免费一句）",
  cast_saved: "把这一卦存到邮箱",
  saved_open: "从信里回到存下的卦",
  question_blocked: "问题被把关拦下",
  question_override: "坚持要问",
  share_click: "分享",
  proof_share: "分享应验卡",
  sub_redeem: "用通卡／会员额度看了一份",
  sub_intent: "点了会员方案",
  gift_claim: "领取赠送",
  gift_open: "打开赠送链接",
  seal_sent: "封卦发出",
  seal_watch: "围观封卦",
  daily_pick: "今日三卦：选了一叠",
  daily_react: "今日三卦：反应",
  daily_ask: "今日三卦：去起卦",
  daily_sub: "订了每日一封",
  home_card_view: "看到加到主屏幕卡",
  home_card_close: "关掉主屏幕卡",
  home_icon_open: "从主屏幕图标进来",
  visit_day: "今天第一次来",
  client_error: "页面报错", // hy: 前缀的是可自愈的水合重绘，见下方 eventLabel
  heat_click: "点了",
};

const HEAT_ZH: Record<string, string> = {
  "price-deep": "深断价格", "price-one-link": "轻解读价格", "guarantee-line": "首单保障说明",
  "hta-cast": "怎么问（起卦页）", "hta-followup": "怎么问（追问区）", "hta-account": "怎么问（账号页）",
  wallet: "钱包支付", "wallet-card": "钱包卡", "upgrade-credit": "升级抵扣", "timing-hint": "应期提示",
  "thread-matter": "这件事（时间线）", "reading-matter": "这件事（解读页卡）", "matter-ask": "就这件事再问", "matter-note": "记一笔进展",
  "matter-daily": "今日一句", "matter-dates": "应期一览", "matter-questions": "问过的问题", "matter-q-jump": "跳到问题区",
  "teaser-odds": "免费一句·可能性", "teaser-more": "免费一句·更多", "teaser-blur": "免费一句·模糊区",
  "sub-return": "回访日会员提示", situation: "处境", "share-story": "分享卡", "share-ask-bar": "分享页·问一件事（底栏）", "share-ask": "分享页·问一件事",
  "sent-to": "送给谁", "second-today": "第二天提示", "second-sub": "第二天·会员", "second-single": "第二天·单买", "second-pass": "第二天·通卡", "second-cast": "第二天·再问",
  "revisit-here": "站内报应验", "reply-new": "回复·新问", "reply-like": "回复·点赞", "reply-go": "回复·去看",
  "proof-story": "应验卡竖图", "proof-here": "应验卡", "pause-note": "停顿提示", "pass-link": "通卡链接", "pass-buy": "买通卡", "pack-buy": "买增购包（15 份）", "pack-buy-small": "买增购小包（5 份）", "pack-nudge": "单买抵扣提示", "pack-nudge-reading": "单买解读页·换成 15 份",
  "outcome-records": "应验记录", "note-send": "发进展", name: "改名字",
  "member-out-gift": "额度用完·送卦", "member-nudge-chat": "追问第 3 次会员提示", "member-gift-card": "会员赠卦卡", "member-daily": "会员今日一句", "member-card": "会员卡",
  "link-note": "进展链接", "invite-share": "邀请·分享", "invite-gift": "邀请·送卦", "invite-card": "邀请卡",
  "home-card": "主屏幕卡", "home-begin": "首页开始起卦", "gift-share": "送卦分享", "gift-recv-done": "收礼完成", "gift-recv": "收礼", "gift-make": "生成送卦",
  "gate-note": "闸门·记进展", "gate-other": "闸门·问另一件事", "acct-ask-bar": "账号页底栏·再问", "cast-enter": "进入起卦",
  "nudge-cta": "付费引导·合起来断", "thread-chain": "同一件事·前几卦",
  // 10-06 瘦身: the 4th+ cast's fixed block sells the membership — its button and the one-off month link under it
  "nudge-member": "付费引导·开会员", "nudge-pass": "付费引导·通卡",
};

/**
 * 10-02 (Neil saw 「访客 dk8i 被一事一占拦下」 after the cap had stopped blocking): the one-matter panel left is the
 * "same question" reminder, which one tap ("情况变了") passes — the old words read like a wall. `num` is the event's
 * small number: for this panel, how alike the two wordings were (0–100).
 */
function repeatLabel(method?: string | null, tier?: string | null, num?: number | null): string {
  if (method === "reply_go") return "像回复 → 去追问";
  if (method === "reply_new") return "像回复 → 仍起新卦";
  if (method === "cap") return "问满被拦（旧版页面）";
  const alike = typeof num === "number" ? ` · 问法相似 ${num}%` : "";
  return tier === "spent" ? `同一问题提醒（「情况变了」已用完）${alike}` : `同一问题提醒（可继续）${alike}`;
}

/** 「点了「这件事（解读页卡）」」 / 「追问了一句」 / an unknown name as it came */
export function eventLabel(e: string, method?: string | null, tier?: string | null, num?: number | null): string {
  if (e === "repeat_blocked") return repeatLabel(method, tier, num);
  // 10-03 起卦记录: the free line / the block before the price on the n-th cast of one matter
  if (e === "teaser_shown" && typeof num === "number" && num >= 2) return `看到免费一句（同一件事第 ${num} 卦，连起来说）`;
  if (e === "nudge_shown") return `看到付费引导（同一件事第 ${typeof num === "number" ? num : "?"} 卦${method ? ` · ${method}` : ""}）`;
  if (e === "heat_click") return `点了「${(method && HEAT_ZH[method]) ?? method ?? "?"}」`;
  if (e === "reading_click" && tier) return tier === "deep" ? "点了深断" : "点了轻解读";
  if (e === "purchase" && tier) return tier === "deep" ? "付款成功：深断" : "付款成功：轻解读";
  if (e === "sub_redeem" && tier) return tier === "deep" ? "用通卡／会员看了深断" : "用通卡／会员看了轻解读";
  if (e === "client_error" && method) {
    // 10-03 (Neil saw 「页面报错 hy:React #418」 on the board and asked 「新bug？」): a hydration mismatch (hy:) is
    // recoverable — React re-renders on the client and the page works; every hit so far completed the funnel, none
    // fell to the error page. Concentrated in in-app browsers (Threads/FB) and old Safari, which alter the DOM
    // before React hydrates. So it reads as a self-healed redraw, not a page failure; the detail stays for diagnosis.
    if (method.startsWith("hy:")) return `页面水合重绘·已自愈 ${method.slice(3)}`;
    return `页面报错 ${method}`;
  }
  if (e === "share_click" && method) return method === "native" ? "分享（系统分享）" : method === "copy" ? "分享（复制链接）" : "分享";
  if (e === "question_blocked" && method) return method === "model" ? "问题被把关拦下（模型）" : "问题被把关拦下（规则）";
  return EVENT_ZH[e] ?? e;
}

const PAGE_ZH: [RegExp, string][] = [
  [/^\/?$/, "首页"],
  [/^\/cast\b/, "起卦页"],
  [/^\/reading\b/, "解读页"],
  [/^\/account\/cancel\b/, "取消续订说明"],
  [/^\/account\b/, "账号页"],
  [/^\/matter\/\d+/, "这件事"],
  [/^\/gua\/table\b/, "64 卦速查表"],
  [/^\/gua\/[^/]+\/to\b/, "变卦页"],
  [/^\/gua\/[^/]+/, "卦页"],
  [/^\/gua\b/, "64 卦索引"],
  [/^\/cases\/[^/]+/, "公开卦例"],
  [/^\/cases\b/, "卦例索引"],
  [/^\/share\b/, "分享卡页"],
  [/^\/proof\b/, "应验卡页"],
  [/^\/seal\b/, "封卦页"],
  [/^\/pair\b/, "合参页"],
  [/^\/for\/[^/]+/, "场景页"],
  [/^\/for\b/, "场景索引"],
  [/^\/glossary\b/, "术语对照"],
  [/^\/timing\b/, "应期怎么推"],
  [/^\/how-to-ask\b/, "怎么问怎么看"],
  [/^\/today\b/, "今日三卦"],
  [/^\/about\b/, "关于"],
  [/^\/terms\b/, "条款"],
  [/^\/privacy\b/, "隐私"],
  [/^\/login\b/, "登录页"],
];

/** "/zh-hant/gua/1-qian" → { locale: "zh-hant", rest: "/gua/1-qian", label: "卦页" } */
export function pageLabel(path: string | null | undefined): { locale: string | null; rest: string; label: string } {
  if (!path) return { locale: null, rest: "", label: "—" };
  const m = /^\/([a-z]{2}(?:-hant)?)(\/.*)?$/.exec(path.split("?")[0]!);
  const locale = m ? m[1]! : null;
  const rest = m ? (m[2] ?? "/") : path;
  const hit = PAGE_ZH.find(([re]) => re.test(rest));
  return { locale, rest, label: hit ? hit[1] : rest };
}

/** "3 秒" / "2 分 05 秒" / "1 小时 12 分" */
export function spanLabel(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} 秒`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分 ${String(s % 60).padStart(2, "0")} 秒`;
  const h = Math.floor(m / 60);
  return `${h} 小时 ${String(m % 60).padStart(2, "0")} 分`;
}
