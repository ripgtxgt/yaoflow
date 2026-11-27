import { Fragment } from "react";
import { tierLabelZh } from "@/lib/catalog";
import { CHANNEL_LABEL, SURFACE_LABEL } from "@/lib/share-meta";
import { inboxOpenCount, inboxOldestOpen } from "@/lib/inbound";
import { heavyClaimGivers, qianBreakdown } from "@/lib/db";
import { QIAN_SETS } from "@/lib/qian-meta";
import { CLAIM_REWARD_WATCH } from "@/lib/referral";
import { cookies } from "next/headers";
import { computeStats, readEvents } from "@/lib/analytics-server";
import { resendCycle } from "@/lib/resend-cycle";
import { fetchEdgeStats } from "@/lib/cf-stats";
import { INTERNAL_EMAILS, isInternalEmail } from "@/lib/internal";
import { readingViews } from "@/lib/db";
import { isRecentKind, recentOtherProducts, RECENT_KINDS, RECENT_ZH, type OtherRow, type RecentKind } from "@/lib/admin-recent";
import { caseStats, mailStats, markOwnOrdersAsTest, opsSummary, recentCases, recentReadings, referralStats, refundStats, refundSeries, realOrderSessionTails, liveMoney, currencyMisses, paidOrdersIn, unclassifiedOrderStatuses, splitDrift, splitParity, salesByCurrency, subscriptionStats, isRealDeliveryEvent, activeSubscriptionAmounts,
  sealStats, revisitRewardStats, dailyCastStats, ltvStats, genTiming, ordersByPaymentIntent, txnsBetween } from "@/lib/db";
import { standing } from "@/lib/admin-money";
import { DELIVERY_PRODUCTS, DELIVERY_ZH, deliveryCounts, sourceLine } from "@/lib/deliveries";
import { SALE_KEYS, SALE_KEY_ZH } from "@/lib/sale-bucket";
import { casePath } from "@/lib/cases";
import { casesToPost } from "@/lib/db";
import { threadsDraft } from "@/lib/threads-draft";
import CopyDraft from "@/components/admin/CopyDraft";
import { asLocale } from "@/lib/locales";
import { HOME_TZ_LABEL, homeDay, homeMinute } from "@/lib/clock";
import { checkStates } from "@/lib/ops-checks";
import { latestInsight } from "@/lib/daily-insight";
import { ACTIONS, describeAction, listActions, TRIAL_DAYS, type Measure } from "@/lib/ops-actions";
import { OutcomeSite } from "./outcome-site";
import { formatMoney, isCurrency } from "@/lib/money";
import { LIVE_DAY, LIVE_SINCE, refreshFx, toUsdCents } from "@/lib/live";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { deliveredOf, moneyOf, WHO_ORDER, WHO_ZH, type DayCells, type Who } from "@/lib/daily-who";
import { AdminLogin, AdminShell, Card, Legend, Section, Stat } from "./ui";
import { adminBundle, doorStats } from "@/lib/admin-bundle";
import { swr } from "@/lib/swr";
import { pageRead } from "@/lib/admin-page-reads";

export const dynamic = "force-dynamic";

/** Gate 1 targets from the MVP plan. */
// 09-30 (Neil: 「调到70%吧」): the cast rate is now ÷ unique visitors, which roughly doubles it — 35% was set on sessions
const TARGETS = { activation: 70, conversion: 2.5 };

// 切正式 (09-21 14:50 UTC+8) — see lib/live.ts for why the cut sits there

/** how a reading came to be delivered (orders.status) */
const ORDER_SOURCE: Record<string, string> = {
  paid: "付费", gift: "赠送", reward: "推荐奖励", gift_cast: "送一卦", invite_light: "分享邀请免费", ref_light: "推荐回馈",
  joint: "合参应邀", subscription: "通卡／会员", refunded: "已退款", disputed: "争议", revisit_light: "回访回礼",
  case_light: "公开卦例回礼", comp: "补偿",
};
/** 11-01 (Neil: 通卡和会员一定要区分清楚): an allowance reading names what covered it */
const subName = (sid: string | null | undefined) => (sid?.startsWith("pass_") ? "通卡" : sid?.startsWith("comp_") ? "赠送会员" : sid ? "会员" : "通卡／会员");
const MAIL_KIND: Record<string, string> = {
  reading: "解读交付", revisit: "应期回访", login: "登录链接", refund: "退款通知", pair: "合参通知",
  reward: "推荐奖励", launch: "上线邮件", digest: "周报", seal: "封卦揭晓", test: "测试", other: "非本站发出", all: "合计",
  // 09-27: kinds added since, which showed as raw codes
  headsup: "应期提醒", dayof: "应期当日", sub_welcome: "开通信（会员／通卡）", sub_confirm: "取消确认", sub_alert: "会员异常", sub_winback: "到期前挽回",
  // 10-22 进度表 94/95: the allowance letter is stopped; the one-off month is a 通卡 now
  sub_renew: "年付续费预告", sub_recap: "续费前回顾", sub_reset: "额度刷新（10-22 已停）", pass_notice: "通卡到期提醒", sub_perks: "会员权益说明", member_letter: "会员每日信", month_letter: "流月信", gift_used: "赠送已被使用", daily: "每日三卦", daily_confirm: "每日三卦确认", support: "客服回信",
  sub_payfail: "扣款失败／补缴成功", sub_unpaid_end: "欠费结束", sub_resume: "恢复续订确认", sub_pause: "暂停确认", support_ack: "客服自动回执", nianshu_received: "年书已收到", erase: "删除帐号", nianshu_early_1101: "年书早鸟信", sub_renewed: "续费成功", // 10-23 进度表 111 / 110
};
const TOPIC_LABEL: Record<string, string> = {
  career: "事业", relationship: "感情", money: "财运", health: "健康", study: "学业", decision: "抉择", other: "其他",
};
/** how the page settled the currency (gifts record it since 09-18) */
const CUR_SRC: Record<string, string> = { chosen: "读者手动选的", tz: "设备时区", edge: "IP 国家", lang: "系统语言", default: "默认" };
/** "GBP ← 设备时区 Europe/London": the reason a row shows the currency it does */
function currencyWhy(r: { currency: string | null; cur_src: string | null; tz_name: string | null }): string | undefined {
  if (!r.currency || !r.cur_src) return undefined;
  const src = CUR_SRC[r.cur_src] ?? r.cur_src;
  return `${r.currency.toUpperCase()} ← ${src}${r.cur_src === "tz" && r.tz_name ? ` ${r.tz_name}` : r.tz_name ? `（设备时区 ${r.tz_name}）` : ""}`;
}

/** Addresses that are us, not customers — rows under them read as tests without any marking. INTERNAL_EMAILS overrides (comma-separated, * allowed). */

function Bar({ label, value, max, hint }: { label: string; value: number; max: number; hint?: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 2;
  return (
    <div className="mb-3">
      <div className="flex justify-between text-sm mb-1 gap-3">
        <span>{label}</span>
        <span className="tabular-nums whitespace-nowrap">
          {value}
          {hint && <span className="opacity-40 ml-2 text-xs">{hint}</span>}
        </span>
      </div>
      <div className="h-2 rounded bg-black/5">
        <div className="h-2 rounded bg-[var(--gold)]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const th = "py-1.5 pr-3 font-normal text-xs opacity-50 whitespace-nowrap";
const td = "py-1.5 pr-3 whitespace-nowrap";
const num = "text-right tabular-nums";

/**
 * The Resend plan the email gauge is drawn against. 09-21: Neil moved to Pro
 * ($20/mo) — 50,000 a month and NO daily cap; over that it is $0.90 per 1,000.
 * So the daily alarm is gone and the month is the only thing worth watching.
 * RESEND_MONTHLY_QUOTA overrides it without a code change.
 */
// 10-01 (Neil: 「以 resend 重置额度的时间为准」): Resend's monthly quota resets on the account's BILLING day, not the
// calendar month — the Pro plan renews on the 21st (billing page: "Renews Oct 21", invoice Sep 21). The gauge counts from
// the most recent 21st (UTC). RESEND_CYCLE_DAY overrides if the plan is ever re-subscribed on another day.
const RESEND_PLAN = { month: Number(process.env.RESEND_MONTHLY_QUOTA) || 50_000, overagePer1k: 0.9 };


export default async function AdminPage(
  { searchParams }: { searchParams: Promise<{ key?: string; days?: string; rows?: string; denied?: string; rp?: string }> },
) {
  const { key, days, rows, denied, rp } = await searchParams;
  const ok = await isAdmin((await cookies()).get(ADMIN_COOKIE)?.value, key);
  if (!ok) return <AdminLogin denied={denied === "1"} back="/admin" />;
  await refreshFx(); // 09-23: today's rates for every USD figure below (twice a day at most)

  // 09-21: "live" (since the paywall went on) is the default reading of every
  // rate on this page; 7/30/90 stay for looking back across the boundary, and
  // say so where it matters.
  const now = Date.now();
  const live = !days || days === "live";
  const window = live
    ? Math.max(1, Math.ceil((now - LIVE_SINCE) / 86400_000))
    : Math.min(Math.max(Number(days) || 30, 1), 365);
  // 09-18: the overview cards compare against the window just before this
  // one, so both windows are read at once and split at the boundary
  const since = live ? LIVE_SINCE : now - window * 86400_000;
  // 10-30: the page's cached readings (lib/admin-page-reads.ts — the cron warms the live window)
  const pw = { window, live, since };
  // comparing real money against the painted door is not a comparison — in
  // live mode the ▲▼ arrows are simply absent
  const spansDoor = since < LIVE_SINCE;
  // 09-21: whatever we bought ourselves is marked before anything is counted (idempotent; sandbox sessions + our own addresses)
  markOwnOrdersAsTest(INTERNAL_EMAILS);
  // 09-24: the Cloudflare call is the slowest thing on the page (0.2–0.7s) — start it now, await it where it is drawn
  const edgeP = fetchEdgeStats(window);
  // 10-14 后台变卡: the event-log readings (funnel, daily table, visitor types) come from lib/admin-bundle.ts — kept for
  // two minutes, served stale for up to 30 while recomputed behind the page, and warmed by the 10-minute cron
  const bundle = adminBundle(days);
  const { realTails, twoWindows, inWindow, stats, prev, daily, vtypes } = bundle;
  const paidSessions = paidOrdersIn(0).sessions;
  // the painted-door fortnight, kept for the record rather than mixed in
  // the painted door had no sales at all; a delivery is the only signal it has
  // 09-24: those days are over — computed once per process (and again after 6h), not on every refresh
  const door = doorStats(); // 10-14: kept 6 hours and warmed by the cron (lib/admin-bundle.ts)
  const referrals = referralStats();
  const subs = subscriptionStats();
  // 09-22: an HK$68 member is not $9.99 — MRR reads each membership's own currency and plan
  const mrrCents = activeSubscriptionAmounts().reduce(
    (a, s) => a + toUsdCents(s.plan === "year" ? Math.round(s.amount_minor / 12) : s.amount_minor, s.currency), 0,
  );
  const cases = { ...caseStats(since), recent: recentCases(12), toPost: casesToPost(6) };
  const siteUrl = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  const sales = salesByCurrency(since);
  const refunds = refundStats(since);
  // 09-22: money is what the orders table says. A membership allowance fires a
  // purchase event while paying nothing, so the funnel was reporting 31 sales
  // on a day with 22 — and the refund section below, which reads orders, said 22.
  const sold = paidOrdersIn(since);
  // 10-23 进度表 105: one line per charge (a pass is an order row and a subscriptions row — counted once), 六爻's own sales
  // for its rate, and what was delivered — every product, by why (付费／通卡／会员／免费)
  const charges = pageRead("charges", pw, now);
  const dc = pageRead("deliveries", pw, now);
  const dcPrev = live ? null : swr(`deliv105p|${window}`, 2 * 60_000, 30 * 60_000, () => deliveryCounts(since - window * 86_400_000, since));
  const fdp = pageRead("firstDayPass", pw, now);
  const stand = standing(now);
  // the allowance uses, 通卡 and 会员 apart (they were all 「会员额度」)
  const uses = `通卡使用 ${dc.all.pass} · 会员使用 ${dc.all.member}`;
  const books = liveMoney(LIVE_SINCE); // the books, memberships included — orders alone never see a membership
  const refundTrend = refundSeries(LIVE_SINCE);
  const curMisses = currencyMisses(LIVE_SINCE); // the card says one country, we charged another // since the paywall went live: the only stretch where a refund rate means anything
  const mail = mailStats(since);
  // the quota gauge: Resend counts a UTC day and a calendar month
  const utc = new Date(now);
  const mailToday = mailStats(Date.UTC(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate())).total.sent;
  const { start: cycleStart, end: cycleEnd } = resendCycle(now);
  const mailMonth = mailStats(cycleStart).total.sent;
  const rowLimit = Math.min(Math.max(Number(rows) || 20, 10), 500);
  // 10-24 (Neil: 「应该把用户所有的解读都放进去吧，包括各类产品的使用」): every product's rows, newest first; ?rp= one product
  const recentKind: RecentKind | null = isRecentKind(rp) ? rp : null;
  const recent = !recentKind || recentKind === "liuyao" ? recentReadings(since, rowLimit) : [];
  const others = recentKind === "liuyao" ? [] : recentOtherProducts(since, rowLimit, recentKind ? [recentKind] : undefined);
  type Feed = { type: "liuyao"; at: number; r: (typeof recent)[number] } | { type: "other"; at: number; o: OtherRow };
  const feed: Feed[] = [...recent.map((r): Feed => ({ type: "liuyao", at: r.created_at, r })), ...others.map((o): Feed => ({ type: "other", at: o.at, o }))]
    .sort((a, b) => b.at - a.at).slice(0, rowLimit);
  const feedCounts = pageRead("recentCounts", pw, now);
  // 09-27: how often each reading page was opened — the admin's own clicks are never counted
  const views = readingViews(recent.map((r) => r.session_id));
  // 09-18 Neil: the test-marking checkboxes are gone; our own addresses still read dimmed
  const isOwnRow = (r: (typeof recent)[number]) => r.test_flag === 1 || isInternalEmail(r.email);
  const isOwnOther = (o: OtherRow) => o.test || isInternalEmail(o.email);
  const href = (extra: Record<string, string> = {}) => {
    const q = new URLSearchParams({ days: live ? "live" : String(window), ...(rowLimit !== 20 ? { rows: String(rowLimit) } : {}), ...extra });
    return `/admin?${q.toString()}`;
  };
  const ops = opsSummary();
  const unknownStatuses = unclassifiedOrderStatuses();
  // 09-22: while both the old status column and the new split are written, the
  // two must agree on every row. If they ever stop agreeing, every number on
  // this page is suspect — so it gets the loudest line we have.
  const drift = splitDrift();
  // 09-22 第二批: the reads now go through the new columns. This runs the same
  // figures both ways and only speaks up if one of them moved — row agreement
  // (drift) is necessary but not sufficient, a query can read the right column
  // and still mean something else.
  const parity = splitParity();
  const stale = (t: number | null, hours: number) => t === null || Date.now() - t > hours * 3_600_000;
  // 09-29 客服来信: a reader's letter nobody has answered is a red line, with the age of the oldest
  const inboxOpen = inboxOpenCount();
  const inboxOldest = inboxOldestOpen();
  // 10-23 定时核对 (lib/ops-checks.ts): a check that came back wrong is a red line; the next one due is said on the health line
  const checks = checkStates();
  const checksBad = checks.filter((c) => c.ok === false);
  const checkNext = checks.filter((c) => c.doneAt == null).sort((a, b) => a.due - b.due)[0] ?? null;
  const healthProblems = [
    ...(checksBad.length ? [`定时核对有 ${checksBad.length} 项要看：${checksBad.map((c) => c.title).join("；")}`] : []),
    ...(inboxOpen > 0 ? [`客服来信 ${inboxOpen} 封未处理（最早 ${Math.max(1, Math.round((Date.now() - (inboxOldest ?? Date.now())) / 3_600_000))} 小时前）→ /admin/inbox`] : []),
    ...(ops.genDown ? [`生成在挂（3 小时失败 ${ops.genFail3h} 次，之后没有成功过）`] : []),
    ...(stale(ops.lastRevisitRun, 30) ? ["回访 cron 没动静"] : []),
    ...(stale(ops.lastFulfillRun, 1) ? ["履约 cron 没动静"] : []),
    ...(mailMonth >= RESEND_PLAN.month * 0.8 ? [`邮件本周期已发 ${mailMonth.toLocaleString()}/${RESEND_PLAN.month.toLocaleString()}`] : []),
    // 09-22: fourteen nightly archives, all on the same disk as the database.
    // Nothing said so, so nobody knew. It gets to be a red line now.
    ...(ops.backup.offsite !== "ok" ? [ops.backup.offsite === "none" ? "备份还没出本机（丢盘就全没）" : ops.backup.offsite === "fail" ? "备份异地上传失败" : "读不到备份日志"] : []),
    ...(ops.backup.offsite === "ok" && stale(ops.backup.at, 36) ? ["备份超过 36 小时没跑"] : []),
    // 09-22: the guard for the bug that started all this — a status nobody
    // classified used to count as a sale (that was `subscription`, 9 of them).
    ...(unknownStatuses.length > 0 ? [`订单里有没归类的 status：${unknownStatuses.join(" / ")}——它既不算销售也不算交付，去 db.ts 归好类`] : []),
    ...(drift.length > 0 ? [`口径漂移：${drift.length} 行的 entitlement_kind / payment_state 与 status 对不上（如 #${drift[0]!.id}）——面板上的数暂时都不可信`] : []),
    ...(subs.pastDue > 0 ? [`${subs.pastDue} 位会员扣款失败（Stripe 会重试，重试完不成就自动结束）`] : []),
    // 09-23 (Neil: 「有人取消下一次的订阅，面板上面是没有显示的」): say it at the top, not in a card at the bottom
    ...(subs.canceling > 0 ? [`${subs.canceling} 位会员已取消续订（这一期用完即结束）— 见「会员」页`] : []),
    ...(parity.length > 0 ? [`新旧口径不一致：${parity.map((x) => `${x.name} 旧 ${x.old} / 新 ${x.now}`).join("，")}——迁移出了问题，先别信这一页`] : []),
  ];
  const ago = (t: number | null) => {
    if (t === null) return "从未";
    const m = Math.round((Date.now() - t) / 60_000);
    return m < 60 ? `${m} 分钟前` : m < 48 * 60 ? `${Math.round(m / 60)} 小时前` : `${Math.round(m / 1440)} 天前`;
  };
  /* ---- 09-22 Neil 的面板清单 ---- */
  const seals = sealStats();
  const rewards = revisitRewardStats(since);
  const dailyCasts = dailyCastStats();
  const ltv = ltvStats();
  const timing = genTiming(now - 7 * 86_400_000);
  // the new plays only exist as events — count them out of the same window
  const countOf = (name: string) => inWindow.filter((e) => e.e === name).length;
  const play = {
    sealSent: countOf("seal_sent"),
    sealWatch: countOf("seal_watch"),
    dailyPick: countOf("daily_pick"),
    dailyByPile: [1, 2, 3].map((n) => inWindow.filter((e) => e.e === "daily_pick" && e.method === String(n)).length),
    answers: (["hit", "miss", "open", "partial"] as const).map((v) => inWindow.filter((e) => e.e === "revisit_answer" && e.method === v).length),
    rewardClaimed: countOf("revisit_light_claimed"),
  };

  /* ---- 渠道 → 钱 (09-22): first-touch c= tag, followed all the way to what Stripe settled ---- */
  const campaignOf = new Map<string, string>();
  for (const e of inWindow) if (e.c && !campaignOf.has(e.s)) campaignOf.set(e.s, e.c);
  const byPiAll = ordersByPaymentIntent();
  const netByTail = new Map<string, number>();
  const campaignOfTail = new Map<string, string>();
  for (const t of txnsBetween(since)) {
    const o = t.payment_intent ? byPiAll.get(t.payment_intent) : undefined;
    if (!o || o.test_flag === 1) continue;
    const tail = o.session_id.slice(-12);
    netByTail.set(tail, (netByTail.get(tail) ?? 0) + t.net);
    // 09-23: the order now says where it came from; before, this looked the
    // Stripe session up among BROWSER session ids and never found it
    const c = o.campaign ?? (o.browser_sid ? campaignOf.get(o.browser_sid) : undefined);
    if (c) campaignOfTail.set(tail, c);
  }
  const channelMoney = new Map<string, { orders: number; net: number }>();
  for (const [tail, netCents] of netByTail) {
    const c = campaignOfTail.get(tail) ?? "—";
    const row = channelMoney.get(c) ?? { orders: 0, net: 0 };
    row.orders += 1; row.net += netCents;
    channelMoney.set(c, row);
  }

  /* ---- 今天按小时 (UTC+8) ---- */
  const dayStart = Date.parse(`${homeDay(now)}T00:00:00Z`) - 8 * 3_600_000;
  const hours = Array.from({ length: 24 }, (_, h) => {
    const from = dayStart + h * 3_600_000, to = from + 3_600_000;
    const slice = inWindow.filter((e) => e.t >= from && e.t < to);
    return {
      h,
      // 09-30: unique visitors whose day began in this hour (visit_day), like everywhere else on the page
      visitors: slice.filter((e) => e.e === "visit_day").length,
      casts: slice.filter((e) => e.e === "cast_complete").length,
      paid: slice.filter((e) => e.e === "purchase" && paidSessions.has(e.s)).length,
      future: from > now,
    };
  });
  const maxHour = Math.max(1, ...hours.map((x) => Math.max(x.visitors, x.casts * 2)));

  const edge = await edgeP;
  const f = stats.funnel;
  // 10-23 进度表 105 ③: 六爻's rate is 六爻's sales — a reading bought on the cast page, or a pass bought with its cast — over
  // its casts; every product's sales over the I Ching casts was not a rate of anything
  const conv = f.castComplete > 0 ? Math.round((charges.liuyao / f.castComplete) * 1000) / 10 : 0;
  const sh = stats.sharing;
  const maxV = Math.max(f.visitors, 1);
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 1000) / 10}%` : "—");
  const money = (cur: string, minor: number) => (isCurrency(cur) ? formatMoney(cur, minor, "en") : `${cur} ${minor}`);
  const today = stats.byDay[stats.byDay.length - 1];
  // 10-23 进度表 105: today's deliveries and charges as the daily table counts them (every product; a pass once)
  const todayRow = today ? daily.find((r) => r.day === today.day) ?? null : null;

  /* ---- per-market scoreboard ---- */
  const currencyRows = (() => {
    const set = new Set<string>([...stats.byCurrency.map((c) => c.cur), ...sales.orders.map((o) => o.currency), ...sales.gifts.map((g) => g.currency), ...sales.members.map((m) => m.currency), ...sales.passes.map((m) => m.currency)]);
    return [...set].map((cur) => {
      const ev = stats.byCurrency.find((c) => c.cur === cur) ?? { cur, casts: 0, clicksOne: 0, clicksDeep: 0, checkout: 0, subRedeems: 0, subIntents: 0 };
      const paid = sales.orders.filter((o) => o.currency === cur);
      const one = paid.find((o) => o.tier === "one");
      const deep = paid.find((o) => o.tier === "deep");
      // 10-23 进度表 105 ⑨: by tier — passes and the rest of the one-off products apart; 付÷卦 takes the cast page's own sales
      const passN = paid.filter((o) => o.tier.startsWith("pass_")).reduce((a, o) => a + o.n, 0);
      const singleN = paid.filter((o) => !o.tier.startsWith("pass_")).reduce((a, o) => a + o.n, 0);
      const paidN = paid.reduce((a, o) => a + o.castPaid, 0);
      const revenue = paid.reduce((a, o) => a + o.amount, 0);
      const gifts = sales.gifts.filter((g) => g.currency === cur);
      const giftOne = gifts.find((g) => g.tier === "one");
      const giftDeep = gifts.find((g) => g.tier === "deep");
      const giftN = (giftOne?.n ?? 0) + (giftDeep?.n ?? 0);
      const giftEmails = gifts.reduce((a, g) => a + g.withEmail, 0);
      const mem = sales.members.find((m) => m.currency === cur);
      const passLive = sales.passes.find((m) => m.currency === cur)?.active ?? 0;
      return {
        ...ev, cur, oneN: one?.n ?? 0, deepN: deep?.n ?? 0, firstN: deep?.first ?? 0, paidN, passN, singleN, passLive, revenue,
        giftOneN: giftOne?.n ?? 0, giftDeepN: giftDeep?.n ?? 0, giftFirstN: giftDeep?.first ?? 0, giftN, giftEmails,
        members: mem?.active ?? 0, monthly: mem?.monthly ?? 0, yearly: mem?.yearly ?? 0,
      };
    }).sort((a, b) => b.casts - a.casts || b.paidN - a.paidN || b.giftN - a.giftN);
  })();

  // 10-22 进度表 94 第二批: the three groups and the money first; 09-21 「新玩法」 went into 「其他」
  const NAV = [
    ["groups", "三组"], ["overview", "概览"], ["funnel", "六爻漏斗"], ["hours", "今天"], ["daily", "每日"], ["qian", "解籤"],
    ["readings", "解读"], ["markets", "币种"], ["sharing", "分享"], ["channels", "渠道"], ["email", "邮件"],
    ["refunds", "退款"], ["currency", "币种"], ["cases", "卦例"], ["misc", "其他"],
  ] as const;
  const groups = pageRead("groups", pw, now);
  const money94 = pageRead("money", pw, now);
  const usd0 = (c: number) => `$${(c / 100).toFixed(0)}`;

  // 09-22: the three things worth knowing before scrolling
  const headline = [
    `到账 $${(books.net / 100).toFixed(2)}${books.memberships.n > 0 ? `（其中会员 $${(books.memberships.net / 100).toFixed(2)}${books.packs.n > 0 ? ` · 增购包 $${(books.packs.net / 100).toFixed(2)}` : ""}）` : books.packs.n > 0 ? `（其中增购包 $${(books.packs.net / 100).toFixed(2)}）` : ""} · 流水 $${(books.gross / 100).toFixed(2)}`,
    `付费 ${charges.total} 笔（通卡 ${charges.passes.n} · 会员新开 ${charges.members} · 单买 ${charges.singles}${charges.packs ? ` · 增购包 ${charges.packs}` : ""}）· 六爻转化 ${conv}%${conv >= TARGETS.conversion ? " ✓" : ""} · ${uses}`,
    // 10-23 进度表 105 ⑧: single readings are not sold any more — the first step now is the first 1-day pass
    fdp.first > 0
      ? `首张 1 日卡 ${fdp.first} 人 → 再买通卡 ${fdp.repass} 人 · 开会员 ${fdp.member} 人${fdp.either < fdp.repass + fdp.member ? `（两样都做的算一次：${fdp.either} 人）` : ""}`
      : "还没有首张 1 日卡",
    // 解读, explicitly: this one comes from the orders table, which has no membership rows
    ltv.payers > 0 ? `解读客均 $${(ltv.perPayer / 100).toFixed(2)} · 单均 $${(ltv.perOrder / 100).toFixed(2)}（不含会员）` : "还没有到账",
  ];

  // 10-13 (Neil: 「在这些框里面去显示出来会员和非会员的数据」): each overview box, non-members and members — the daily
  // table's own grouping (people per day, by what they were when they first showed up), from the first day it exists
  const whoSplit = (() => {
    const rows = daily.filter((r) => r.who);
    if (rows.length === 0) return null;
    const sum = (pick: (c: DayCells) => number, gs: Who[]) => rows.reduce((a, r) => a + gs.reduce((b, g) => b + pick(r.who![g]), 0), 0);
    // 10-23 进度表 105: a pass holder is not a member — the 通卡期内 group stays on the non-member side
    const NON: Who[] = ["none", "free", "paid", "pass", "unknown"], MEM: Who[] = ["member"];
    const side = (gs: Who[]) => ({
      visitors: sum((c) => c.visitors ?? 0, gs), casters: sum((c) => c.casters, gs), taps: sum((c) => c.taps, gs), claims: sum((c) => c.claims, gs),
      delivered: sum((c) => c.delivered.paid + c.delivered.pass + c.delivered.free, gs), allowance: sum((c) => c.delivered.member, gs),
      paid: sum((c) => c.money.readings + c.money.passes, gs), subs: sum((c) => c.money.memberships, gs), packs: sum((c) => c.money.packs, gs),
    });
    return { from: rows[0]!.day, non: side(NON), mem: side(MEM) };
  })();
  const n0 = (x: number) => x.toLocaleString();
  // 10-13: deliveries and sales come from the orders — those split from the window's first day, not just from 10-03
  const ordSplit = pageRead("orderSplit", pw, now);
  return (
    <AdminShell
      title="看板"
      nav={NAV.map(([id, label]) => ({ href: `#${id}`, label }))}
      right={
        <>
          <a href={href({ days: "live" })} className={`px-2 py-1 rounded-[2px] ${live ? "bg-[var(--ink)] text-[var(--paper)]" : "opacity-60 hover:opacity-100"}`}>上线以来</a>
          {[7, 30, 90].map((d) => (
            <a key={d} href={href({ days: String(d) })} className={`px-2 py-1 rounded-[2px] ${!live && window === d ? "bg-[var(--ink)] text-[var(--paper)]" : "opacity-60 hover:opacity-100"}`}>{d} 天</a>
          ))}
        </>
      }
    >
      {/* ---- 09-22: the headline, before anything that needs scrolling ---- */}
      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        {headline.map((h, i) => (
          <span key={i} className={i === 0 ? "font-medium" : "opacity-70"}>{h}</span>
        ))}
      </div>

      {/* 09-30 (进度表待定 21): what "访客" means on this page now */}
      <p className="-mt-2 mb-4 text-[11px] opacity-50">
        口径：独立访客 = 浏览器·天（每个浏览器每天只算一次，09-23 起才有；同一个人手机 App 内置浏览器和 Safari 算 2 个，无痕每次算新的）；会话 = 标签页，每开一个就多一个，约是独立访客的 2 倍。起卦率、点价格率、付费率都 ÷ 独立访客；秒退会话 = 只看一页、不到 3 秒就走，单列、不从访客里扣。
      </p>

      {/* ---- health: one line, red only when something is wrong ---- */}
      <div className={`mb-6 rounded-[2px] border px-4 py-3 text-xs flex flex-wrap gap-x-6 gap-y-1 ${healthProblems.length ? "border-[var(--cinnabar)] text-[var(--cinnabar)]" : "border-black/10 opacity-60"}`}>
        <span>{healthProblems.length ? `⚠ ${healthProblems.join(" · ")}` : "✓ 生成正常 · cron 都在跑"}</span>
        <span className="tabular-nums">生成失败 24h {ops.genFail24h} · 7d {ops.genFail7d} · 重试 {ops.genRetry24h}{ops.genFail24h > 0 && !ops.genDown ? "（已恢复）" : ""}</span>
        <span>回访 {ago(ops.lastRevisitRun)} · 履约 {ago(ops.lastFulfillRun)}</span>
        <span>定时核对 {checks.filter((c) => c.doneAt != null).length}/{checks.length} 已做{checkNext ? ` · 下一项 ${homeMinute(checkNext.due).slice(5)} ${checkNext.title}` : ""}</span>
        <span className="tabular-nums">备用模型 24h 顶了 {ops.llmFallback24h} 次{ops.lastLlmDown ? ` · 主线上次挂 ${ago(ops.lastLlmDown.at)}` : ""}</span>
        <span className={drift.length || parity.length ? "text-[var(--cinnabar)]" : ""}>
          口径迁移 {drift.length === 0 && parity.length === 0 ? "新旧一致" : "有差异"}
        </span>
        <span>备份 {ago(ops.backup.at)}{ops.backup.offsite === "ok" ? " · 已出本机" : ops.backup.offsite === "none" ? " · 只在本机" : ops.backup.offsite === "fail" ? " · 外传失败" : ""}</span>
        {timing.n > 0 && (
          <span className="tabular-nums">生成耗时 7d p50 {(timing.p50 / 1000).toFixed(1)}s · p95 {(timing.p95 / 1000).toFixed(1)}s（{timing.n} 次）</span>
        )}
      </div>

      {/* ---- 10-26 每日运营摘要 (lib/daily-insight.ts): yesterday against the week before, read by the model ---- */}
      {(() => {
        const ins = latestInsight();
        if (!ins) return null;
        const n = ins.numbers as Record<string, number | Record<string, number>>;
        const sh = (n.bridgeShown ?? {}) as Record<string, number>, ck = (n.bridgeClicked ?? {}) as Record<string, number>;
        return (
          <Section id="insight" title="运营摘要" sub={`${ins.day}（昨天）对比前七天日均 · 每天 08:05 自动写、寄你一份`}>
            {ins.text ? <div className="t-body whitespace-pre-line leading-relaxed">{ins.text}</div> : <p className="t-small opacity-60">模型这次没写成，只有数字。</p>}
            <p className="t-small opacity-60 mt-3 tabular-nums">
              起卦 {String(n.casts)}（日均 {String((ins.prev as Record<string, number>).casts ?? "—")}）· 付款 {String(n.paidOrders)} 笔 · US${String(n.revenueUsd)} · 感情推荐卡 出现 {Object.values(sh).reduce((a, b) => a + b, 0)} / 点击 {Object.values(ck).reduce((a, b) => a + b, 0)} · 正缘画像页 {String(n.zhengyuanViews)} 看 / {String(n.zhengyuanBuyClicks)} 点购买
            </p>
          </Section>
        );
      })()}

      {/* ---- 10-28 进度表 119 運營動作 (lib/ops-actions.ts): the summary's suggestions as switches — nothing moves until 批准 ---- */}
      {(() => {
        const acts = listActions(30);
        if (!acts.length) return null;
        const ago2 = (ms: number) => `${Math.max(0, Math.round((ms - Date.now()) / 86_400_000))} 天`;
        const m = (s: string | null): Measure | null => { try { return s ? (JSON.parse(s) as Measure) : null; } catch { return null; } };
        const pct = (x: Measure | null) => (x?.rate == null ? "—" : `${x.rate}%（${x.hit}/${x.shown}）`);
        const STATUS: Record<string, string> = { proposed: "待批", active: "试行中", done: "试完了", kept: "长期保留", rejected: "没要", revoked: "撤回了" };
        const VERDICT: Record<string, string> = { better: "有用", worse: "更差", same: "没差", unclear: "看不出" };
        const btn = "px-2.5 py-1 rounded-full border border-[var(--ink-16)] text-xs hover:border-[var(--ink)]";
        const Btn = ({ id, act, label }: { id: number; act: string; label: string }) => (
          <form method="post" action="/api/admin/ops-actions" className="inline"><input type="hidden" name="id" value={id} /><input type="hidden" name="do" value={act} /><button type="submit" className={btn}>{label}</button></form>
        );
        const open = acts.filter((a) => a.status === "proposed" || a.status === "active" || a.status === "done" || a.status === "kept");
        const closed = acts.filter((a) => a.status === "rejected" || a.status === "revoked").slice(0, 5);
        return (
          <Section id="actions" title="运营动作" sub={`摘要里的建议变成开关：模型只能从固定清单里挑（推荐卡文案／样式、「也可以试试」推哪两样），你批准才生效，试 ${TRIAL_DAYS} 天后自动还原并对比前 ${TRIAL_DAYS} 天`}>
            {open.length === 0 && <p className="t-small opacity-60">现在没有待批或试行中的。</p>}
            <div className="flex flex-col gap-3">
              {open.map((a) => {
                const before = m(a.before), result = m(a.result);
                return (
                  <div key={a.id} className="rounded-[6px] border border-[var(--ink-16)] p-3 text-sm">
                    <p className="flex flex-wrap items-baseline gap-x-2">
                      <span className="opacity-50 text-xs">#{a.id} · {a.day} · {STATUS[a.status]}{a.status === "active" && a.ends_at ? `（还剩 ${ago2(a.ends_at)}）` : ""}</span>
                      <span className="font-medium">{describeAction(a)}</span>
                    </p>
                    <p className="opacity-70 mt-1">依据：{a.reason}</p>
                    <p className="opacity-60 mt-1 text-xs tabular-nums">
                      看的数字：{ACTIONS[a.kind]?.metric}{before ? ` · 之前 ${TRIAL_DAYS} 天 ${pct(before)}` : ""}{result ? ` · 试行 ${result.days} 天 ${pct(result)}` : ""}{a.verdict ? ` → ${VERDICT[a.verdict] ?? a.verdict}` : ""}
                    </p>
                    <p className="mt-2 flex gap-2">
                      {a.status === "proposed" && <><Btn id={a.id} act="approve" label="批准，试一周" /><Btn id={a.id} act="reject" label="不要" /></>}
                      {a.status === "active" && <Btn id={a.id} act="revoke" label="现在撤回" />}
                      {a.status === "done" && <Btn id={a.id} act="keep" label="长期保留" />}
                      {a.status === "kept" && <Btn id={a.id} act="stop" label="停掉" />}
                    </p>
                  </div>
                );
              })}
            </div>
            {closed.length > 0 && <p className="t-small opacity-50 mt-3">没要／撤回的：{closed.map((a) => `#${a.id} ${describeAction(a)}`).join("；")}</p>}
          </Section>
        );
      })()}

      {/* ---- 10-22 进度表 94 第二批: 问事／看自己／每天, one short funnel each, and the money by what was bought ---- */}
      <Section id="groups" title="三组" sub={`问事 · 看自己 · 每天 — 和上面同一段时间（${live ? `${LIVE_DAY} 起` : `最近 ${window} 天`}）· 不含测试账号 · 每样产品的明细在「产品」页`}>
        <div className="grid md:grid-cols-3 gap-4">
          {groups.map((g) => (
            <Card key={g.id} title={g.name}>
              <div className="flex flex-col gap-2 text-sm">
                {g.steps.map((s, i) => (
                  <div key={s.label}>
                    <p className="flex justify-between gap-3">
                      <span className="opacity-70">{i > 0 ? "→ " : ""}{s.label}</span>
                      <span className="tabular-nums">{s.n.toLocaleString()}{i > 0 && g.steps[0]!.n > 0 && g.id !== "daily" ? <span className="opacity-40 text-xs ml-1">（{Math.round((s.n / g.steps[0]!.n) * 1000) / 10}%）</span> : null}</span>
                    </p>
                    {s.parts && <p className="text-[11px] opacity-45 leading-snug">{s.parts}</p>}
                  </div>
                ))}
              </div>
              <p className="text-[11px] opacity-40 mt-3 leading-snug">{g.legend}</p>
              <p className="text-xs mt-2"><a className="underline underline-offset-4 opacity-70 hover:opacity-100" href={`/admin/products#${g.name}`}>这一组每个产品的明细 →</a></p>
            </Card>
          ))}
        </div>
        <p className="text-sm mt-4 pt-3 border-t border-[var(--ink-16)] flex flex-wrap gap-x-5 gap-y-1">
          <span className="opacity-50">钱</span>
          {/* 进度表 94「每行点得进详情」: each part opens its page */}
          <a className="hover:underline" href="/admin/members#passes">通卡 1 日 {money94.passes.d1} · 7 天 {money94.passes.d7} · 30 天 {money94.passes.d30}<span className="opacity-50">（{usd0(money94.passes.usd)}）</span></a>
          <a className="hover:underline" href="/admin/members#members">会员新开 {money94.members.started}{money94.members.started ? <span className="opacity-50">（月 {money94.members.month} · 年 {money94.members.year} · 按定价 {usd0(money94.members.usd)}）</span> : null} · 关续订 {money94.members.closed}</a>
          <a className="hover:underline" href="/admin/products">单买 {money94.singles.map((x) => `${x.name} ${x.n}`).join(" · ")}<span className="opacity-50">（{usd0(money94.singles.reduce((a, x) => a + x.usd, 0))}）</span></a>
        </p>
        <Legend>钱按下单那一刻算、折美元（当日牌价），退款的单照算（退款看「退款」一节）；会员按定价算，首月实付以 Stripe 为准（「到账」一行）。六爻自己的漏斗在下面「六爻漏斗」。</Legend>
      </Section>

      {/* ---- overview ---- */}
      <Section
        id="overview"
        title="概览"
        sub={live
          ? `真实付款以来（${LIVE_DAY} 起，${window} 天）· 访客按独立访客计 · 时间为 ${HOME_TZ_LABEL}`
          : `最近 ${window} 天 · 访客按独立访客计 · 时间为 ${HOME_TZ_LABEL} · ▲▼ 对比再前 ${window} 天${spansDoor ? " · 含假门期，转化率不可比" : ""}`}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* 09-30 (进度表待定 21): people first — the session count is the old number, beside it */}
          <Stat label="独立访客" value={f.visitors} split={whoSplit ? { non: n0(whoSplit.non.visitors), member: n0(whoSplit.mem.visitors), from: whoSplit.from.slice(5) } : undefined} prev={prev?.visitors || undefined} sub={`${f.machineVisitors ? `另有机房 ${f.machineVisitors}（不计）· ` : ""}会话 ${f.sessions} · 首访 ${f.firstVisits} / 回访 ${f.returnVisits}${f.bounces ? ` · 秒退会话 ${f.bounces}` : ""}${edge ? ` · 边缘 ${edge.uniques.toLocaleString()}` : ""}`} />
          <Stat label="摇完卦" value={f.castComplete} split={whoSplit ? { non: `${n0(whoSplit.non.casters)} · ${pct(whoSplit.non.casters, whoSplit.non.visitors)}`, member: `${n0(whoSplit.mem.casters)} · ${pct(whoSplit.mem.casters, whoSplit.mem.visitors)}`, from: whoSplit.from.slice(5) } : undefined} prev={prev?.castComplete} sub={`起卦率 ${stats.rates.activation}%（÷独立访客）`} good={stats.rates.activation >= TARGETS.activation} />
          <Stat label="点了价格" value={f.readingClick} split={whoSplit ? { non: `${n0(whoSplit.non.taps)} · ${pct(whoSplit.non.taps, whoSplit.non.visitors)}`, member: `${n0(whoSplit.mem.taps)} · ${pct(whoSplit.mem.taps, whoSplit.mem.visitors)}`, from: whoSplit.from.slice(5) } : undefined} prev={prev?.readingClick} sub={`${stats.rates.priceRate}% 的独立访客 · ${stats.rates.intent}% 的卦`} />
          <Stat label="领取 / 结账" value={f.giftClaims + f.checkoutStart} split={whoSplit ? { non: n0(whoSplit.non.claims), member: n0(whoSplit.mem.claims), from: whoSplit.from.slice(5) } : undefined} prev={prev ? prev.giftClaims + prev.checkoutStart : undefined} sub={`${pct(f.giftClaims + f.checkoutStart, f.castComplete)} 的卦`} />
          <Stat
            label="交付"
            value={dc.all.total}
            prev={dcPrev ? dcPrev.all.total : undefined}
            sub={`${sourceLine(dc.all)} · ${DELIVERY_PRODUCTS.filter((p) => dc.byProduct[p].total > 0).map((p) => `${DELIVERY_ZH[p]} ${dc.byProduct[p].total}`).join(" · ")}`}
          />
          <Stat
            label="付费"
            value={charges.total}
            split={{ non: `单买 ${n0(ordSplit.non.paid)} · 通卡 ${n0(ordSplit.non.passes)} · 开会员 ${n0(ordSplit.non.subsStarted)}`, member: `单买 ${n0(ordSplit.member.paid)}${ordSplit.member.passes ? ` · 通卡 ${ordSplit.member.passes}` : ""}${ordSplit.member.packs ? ` · 增购包 ${ordSplit.member.packs}` : ""}` }}
            sub={`通卡 ${charges.passes.n}（1 日 ${charges.passes.d1} · 7 天 ${charges.passes.d7} · 30 天 ${charges.passes.d30}）· 会员新开 ${charges.members} · 单买 ${charges.singles}${charges.packs ? ` · 增购包 ${charges.packs}` : ""} · 六爻转化 ${conv}%（六爻付费 ${charges.liuyao} ÷ 摇完卦）${spansDoor ? " · 含假门期" : ""}`}
            good={!spansDoor && conv >= TARGETS.conversion}
          />
        </div>
        <p className="text-[11px] opacity-50 mt-2">10-23 起（进度表 105）：<b className="font-medium">交付</b> = 这段时间所有产品交出去的解读和报告（六爻、塔罗、解籤的个人解读、八字／紫微／星盘深度报告、正缘画像、合盘、年书），按凭什么给的分：付费（这一份花了钱，退款的照算）、通卡、会员（含我们赠送的会员）、免费（免费层、朋友送的、推荐与回访回礼、合参）；以前这格只数两种事件。<b className="font-medium">付费</b> = 一笔收款算一次：通卡、会员新开（续费不算）、单买、增购包——通卡 10-22 起既有订单行又有通卡行，以前算了两次。六爻转化 = 起卦页买的单＋带着卦买的通卡 ÷ 摇完卦；以前是全站所有产品的单数 ÷ 六爻摇卦。框里的「非会员／会员」按付款那一刻是不是会员分，通卡期内的人算非会员，两边加起来等于大数字。{whoSplit ? <><b className="font-medium">独立访客、摇完卦、点了价格、领取／结账</b>从 {whoSplit.from} 起（那天才开始记浏览器身份，之前分不出），按人计、同一人一天算一次，两边加起来和大数字口径不同。</> : null}会员费金额看「到账」一行。</p>
        {today && (
          <p className="text-xs opacity-50 mt-3 tabular-nums">
            今天（{today.day}）：独立访客 {today.visitors ?? "—"} · 会话 {today.sessions} · 起卦 {today.casts} · 点价格 {today.taps}{today.tapsBlocked ? `（另 ${today.tapsBlocked} 次点了先遇到一事一占提醒）` : ""} · 领取 {today.claims} · 交付 {todayRow ? deliveredOf(todayRow.all) : today.readings} · 付费 {todayRow ? moneyOf(todayRow.all) : today.purchases}
          </p>
        )}
        {/* 09-22: the books, on the front page. A membership has no order row,
            so everything computed from `orders` is blind to it — this reads the
            Stripe ledger, which is the only place all of it shows up. */}
        <div className="mt-4 pt-4 border-t border-[var(--ink-16)] grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* 09-26 (Neil: 「后台的财务数据和 stripe 的相差很大」): 流水 is Stripe's own sales total now, not sales minus the chargeback and Stripe's bills */}
          <Stat label="到账（净）" value={`$${(books.net / 100).toFixed(2)}`} sub={`收款 $${(books.sales.gross / 100).toFixed(2)}（${books.sales.n} 笔）− 手续费 $${(books.sales.fee / 100).toFixed(2)}${books.disputes.n ? ` − 争议 $${(-books.disputes.net / 100).toFixed(2)}` : ""}${books.platformFees.n ? ` − 平台费 $${(-books.platformFees.net / 100).toFixed(2)}` : ""}${books.refunds.n ? ` − 退款 $${(-books.refunds.net / 100).toFixed(2)}` : ""}`} />
          {/* 10-23 进度表 105 ⑤: what the one-off charges bought — 「解读」 was passes, 合盘 and the rest under one name */}
          <Stat label="通卡与单买" value={`$${(books.orders.net / 100).toFixed(2)}`} sub={`${books.orders.n} 笔：${SALE_KEYS.filter((k) => books.orderBuckets[k]?.n).map((k) => `${SALE_KEY_ZH[k]} ${books.orderBuckets[k]!.n} 笔 $${(books.orderBuckets[k]!.net / 100).toFixed(2)}`).join(" · ") || "—"}`} />
          <Stat label="会员" value={`$${(books.memberships.net / 100).toFixed(2)}`} sub={`${books.memberships.n} 笔发票${books.packs.n ? ` · 另有增购包 ${books.packs.n} 笔 $${(books.packs.net / 100).toFixed(2)}` : ""} · MRR ≈ $${(mrrCents / 100).toFixed(2)} · 在册会员 ${stand.members}（月 ${stand.monthly} · 年 ${stand.yearly}${stand.comps ? ` · 另有赠送 ${stand.comps}` : ""}）${subs.canceling ? ` · 已关续订 ${subs.canceling}` : ""}${subs.pastDue ? ` · 扣款失败 ${subs.pastDue}` : ""} · 通卡在用 ${stand.passes}`} />
          <Stat
            label="退款"
            value={`$${(books.refunds.net / 100).toFixed(2)}`}
            sub={`${books.refunds.n} 笔${books.disputes.n > 0 ? ` · 争议（拒付）$${(-books.disputes.net / 100).toFixed(2)}（含 Stripe 争议费）` : ""}${books.platformFees.n > 0 ? ` · Stripe 平台费 $${(-books.platformFees.net / 100).toFixed(2)}（${books.platformFees.n} 笔）` : " · 手续费不退"}${books.payouts.n > 0 ? ` · 已提现 $${(books.payouts.amount / 100).toFixed(2)}` : ""}`}
            good={books.refunds.n === 0}
          />
        </div>
        <p className="text-xs opacity-45 mt-2">
          来自 Stripe 结算流水（会员发票与退款留存手续费都在内），每 30 分钟随履约 cron 刷新一次 · 明细见 <a className="underline" href="/admin/finance">流水 · 成本 · 净利</a>
        </p>
        {(refunds.refunds > 0 || refunds.disputesOpen > 0) && (
          <p className="text-xs text-[var(--cinnabar)] mt-2">
            退款 {refunds.refunds}{refunds.refundedCents.length ? `（${refunds.refundedCents.map((x) => `${x.currency ?? "?"} ${(x.cents / 100).toFixed(2)}`).join("，")}）` : ""} · 争议进行中 {refunds.disputesOpen} · 已输 {refunds.disputesLost}
          </p>
        )}
        {/* the painted-door fortnight: kept, folded, never mixed into a rate */}
        {live && door.funnel.castComplete > 0 && (
          <details className="mt-3 text-xs opacity-60">
            <summary className="cursor-pointer hover:opacity-100">假门期（{LIVE_DAY} 之前，点价格即免费送）</summary>
            <p className="mt-2 tabular-nums leading-relaxed">
              会话 {door.funnel.sessions} · 摇完卦 {door.funnel.castComplete} · 点了价格 {door.funnel.readingClick}（{door.rates.intent}% 的卦）·
              领取赠送 {door.funnel.giftClaims} · 交付 {door.funnel.gifts + door.funnel.purchase}
            </p>
            <p className="mt-1 opacity-80">那两周没有真实付款，所以它的「付费率」不存在；留在这里只为对照起卦量与点价格的意愿。</p>
          </details>
        )}
      </Section>

      {/* ---- funnel ---- */}
      <Section id="funnel" title="漏斗" sub={`第一行是独立访客，之后每一步是会话数${live ? `（${LIVE_DAY} 起）` : spansDoor ? "（含假门期）" : ""}`}>
        <div className="grid md:grid-cols-[1fr_18rem] gap-8">
          <div>
            <Bar label="独立访客" value={f.visitors} max={maxV} hint={`会话 ${f.sessions}`} />
            <Bar label="开始摇卦" value={f.castStart} max={maxV} />
            <Bar label="摇完六爻" value={f.castComplete} max={maxV} hint={`${stats.rates.activation}%`} />
            <Bar label="点了价格按钮" value={f.readingClick} max={maxV} hint={`${stats.rates.intent}% 的卦`} />
            {f.giftClaims > 0 && <Bar label="领取赠送（假门）" value={f.giftClaims} max={maxV} hint={`${pct(f.giftClaims, f.castComplete)} 的卦`} />}
            <Bar label="到达结账页" value={f.checkoutStart} max={maxV} />
            <Bar label="六爻付费" value={charges.liuyao} max={maxV} hint={`${conv}% 的卦 · 起卦页单买＋带卦买的通卡 · ${uses}`} />
            {f.gifts > 0 && <Bar label="赠送已交付" value={f.gifts} max={maxV} hint={`${pct(f.gifts, f.castComplete)} 的卦`} />}
          </div>
          {/* 09-18 Neil: the funnel must say how much of it came in through sharing */}
          <Card title="其中经分享进来的">
            <dl className="text-sm space-y-1">
              {[
                ["进站（会话）", sh.referredSessions, pct(sh.referredSessions, f.sessions)],
                ["摇完六爻", sh.referredCasts, pct(sh.referredCasts, f.castComplete)],
                ["点了价格", sh.referredTaps, pct(sh.referredTaps, f.readingClick)],
                ["领取 / 结账", sh.referredClaims, pct(sh.referredClaims, f.giftClaims + f.checkoutStart)],
                ["付费", sh.referredPurchases, pct(sh.referredPurchases, charges.total)],
              ].map(([l, v, p]) => (
                <div key={String(l)} className="flex justify-between gap-3">
                  <dt className="opacity-70">{l}</dt>
                  <dd className="tabular-nums">{v}<span className="opacity-40 ml-2 text-xs">{p} 的总数</span></dd>
                </div>
              ))}
              <div className="flex justify-between gap-3 pt-2 mt-2 border-t border-black/10">
                <dt>K 值</dt>
                <dd className="tabular-nums">{sh.k.toFixed(2)}<span className="opacity-40 ml-2 text-xs">目标 W6 ≥0.1</span></dd>
              </div>
            </dl>
            <Legend>「经分享进来」= 第一次落地的链接带着别人的分享码；这个标记跟着该会话到起卦、领取、付费。K = 经分享摇完卦的会话 ÷ 所有摇完卦的会话。</Legend>
          </Card>
        </div>
        {/* 09-18: the same funnel per language — whether the English side moves at all is invisible in the total */}
        {stats.byLocaleFunnel.length > 0 && (
          <div className="mt-6 overflow-x-auto -mx-4 px-4">
            <table className="w-full text-sm tabular-nums min-w-[30rem]">
              <thead>
                <tr className="text-left">
                  <th className={th}>按语言</th>
                  <th className={`${th} ${num}`}>独立访客</th>
                  <th className={`${th} ${num} opacity-50`}>会话</th>
                  <th className={`${th} ${num}`}>摇完卦</th>
                  <th className={`${th} ${num}`}>起卦率</th>
                  <th className={`${th} ${num}`}>点价格</th>
                  <th className={`${th} ${num}`}>点价格率</th>
                  <th className={`${th} ${num}`}>领取</th>
                  <th className={`${th} ${num}`}>交付</th>
                  <th className={`${th} ${num}`}>付费</th>
                  <th className={`${th} ${num}`}>付费率</th>
                </tr>
              </thead>
              <tbody>
                {stats.byLocaleFunnel.map((r) => (
                  <tr key={r.locale} className="border-t border-black/5">
                    <td className={td}>{r.locale}</td>
                    <td className={`${td} ${num}`}>{r.visitors || ""}</td>
                    <td className={`${td} ${num} opacity-50`}>{r.sessions}</td>
                    <td className={`${td} ${num}`}>{r.casts}</td>
                    <td className={`${td} ${num} opacity-60`}>{r.visitors ? pct(r.casts, r.visitors) : ""}</td>
                    <td className={`${td} ${num}`}>{r.clicks || ""}</td>
                    <td className={`${td} ${num} opacity-60`}>{r.visitors && r.clicks ? pct(r.clicks, r.visitors) : ""}</td>
                    <td className={`${td} ${num}`}>{r.claims || ""}</td>
                    <td className={`${td} ${num}`}>{r.readings || ""}</td>
                    <td className={`${td} ${num}`}>{r.purchases || ""}</td>
                    <td className={`${td} ${num} opacity-60`}>{r.visitors && r.purchases ? pct(r.purchases, r.visitors) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Legend>独立访客按那天第一次打开时的界面语言归档；会话按第一次看到的界面语言归档；三个率都 ÷ 独立访客（窗口跨到 09-23 之前时，那几天没有独立访客，率会偏高）。交付按解读本身的语言计（提问语言跟随后，一个繁體会话可能拿到简体解读）。<b>交付与付费的差额是会员用额度换的</b>——同一个页面，同一个事件，但没有进账。</Legend>
          </div>
        )}
      </Section>

      {/* ---- daily ---- */}
      {/* ---- 今天按小时 (09-22) ---- */}
      <Section id="hours" title="今天" sub={`${homeDay(now)} · ${HOME_TZ_LABEL} · 每小时的进站 / 起卦 / 付费`}>
        <div className="flex items-end gap-[2px] h-28">
          {hours.map((x) => (
            <div key={x.h} className="flex-1 flex flex-col justify-end items-center gap-[2px]" title={`${String(x.h).padStart(2, "0")}:00 · 独立访客 ${x.visitors} · 起卦 ${x.casts} · 付费 ${x.paid}`}>
              {x.paid > 0 && <div className="w-full bg-[var(--cinnabar)]" style={{ height: `${Math.max(4, (x.paid / Math.max(1, ...hours.map((y) => y.paid))) * 22)}px` }} />}
              <div className="w-full bg-[var(--gold)]" style={{ height: `${(x.casts / maxHour) * 60}px` }} />
              <div className={`w-full ${x.future ? "bg-black/5" : "bg-black/15"}`} style={{ height: `${(x.visitors / maxHour) * 40}px` }} />
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[10px] opacity-40 mt-1 tabular-nums">
          {[0, 6, 12, 18, 23].map((h) => <span key={h}>{String(h).padStart(2, "0")}</span>)}
        </div>
        <Legend>朱砂 = 付费，金 = 起卦，灰 = 独立访客（那天第一次打开的钟点）（浅灰是还没到的钟点）。09-21 那天真正的起量是 15:00 之后，日粒度看不出来。</Legend>
      </Section>

      {/* ---- 解籤 (10-13, Neil: 「解签的数据…全部都补上吧」): the summary; the detail lives on /admin/qian ---- */}
      {(() => {
        const qs = pageRead("qianStats", pw, now);
        const qb = qianBreakdown(since);
        const qNet = qb.money.reduce((a, m) => a + toUsdCents(m.minor - m.refundedMinor, m.currency), 0);
        const qOrders = qb.money.reduce((a, m) => a + m.orders, 0);
        const top = qb.bySet.slice(0, 3).map((r) => `${QIAN_SETS.find((x) => x.id === r.key)?.short ?? r.key} ${r.draws}`).join(" · ");
        const pc = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "—");
        return (
          <Section id="qian" title="解籤" sub="输入籤号 → 白话 → 起卦 / 个人化解读 · 细节在解籤页">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label="解籤次数" value={qs.draws} sub={top || "还没有"} />
              <Stat label="解籤 → 起卦" value={pc(qs.drawsToCast, qs.draws)} sub={`${qs.drawsToCast} 次 · 目标 25%`} good={qs.draws > 0 ? qs.drawsToCast / qs.draws >= 0.25 : undefined} />
              <Stat label="个人化解读" value={qs.personalPaid + qs.personalMember + qs.personalPass} sub={`付费 ${qs.personalPaid}（${pc(qs.personalPaid, qs.draws)}）· 通卡 ${qs.personalPass} · 会员 ${qs.personalMember} · 追问用了 ${qs.followups}`} />
              <Stat label="解籤收入" value={`$${(qNet / 100).toFixed(2)}`} sub={`${qOrders} 单 · 扣退款 · 折美元`} />
            </div>
            <p className="text-sm mt-3"><a href="/admin/qian" className="underline underline-offset-4">解籤页 →</a> 按籤系、按处境、收入分币种、搜索落地、有籤的事 vs 只有卦的事</p>
          </Section>
        );
      })()}

      {/* ---- 新客 / 回访客 (09-30, Neil: 「我想要看一下新客的转化率和回访客的使用频率」) ---- */}
      <Section id="visitor-types" title="新客 / 回访客" sub={vtypes.since ? `${homeMinute(vtypes.since)} 起有标记的事件 · 新客 = 这个浏览器第一天来` : "还没有带标记的事件（09-30 上线后开始累计）"}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead><tr className="text-left opacity-60"><th className="py-1 pr-3"></th><th className="pr-3">独立访客</th><th className="pr-3">会话</th><th className="pr-3">起卦</th><th className="pr-3">点付费</th><th className="pr-3">进收银台</th><th className="pr-3">付费</th><th className="pr-3">起卦率</th><th>付费率</th></tr></thead>
            <tbody>
              {([["新客", vtypes.new], ["回访客", vtypes.back]] as const).map(([label, r]) => {
                const pct = (n: number) => (r.visitors ? `${Math.round((n / r.visitors) * 1000) / 10}%` : "—");
                return (
                  <tr key={label} className="border-t border-black/5">
                    <td className="py-1 pr-3">{label}</td><td className="pr-3">{r.visitors}</td><td className="pr-3">{r.sessions}</td><td className="pr-3">{r.casters}</td><td className="pr-3">{r.clickers}</td><td className="pr-3">{r.checkout}</td><td className="pr-3">{r.paid}</td><td className="pr-3">{pct(r.casters)}</td><td>{pct(r.paid)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
          <Stat label="回访客人均起卦" value={vtypes.castsPerReturnDay} sub="每个回访日摇了几卦" />
          <Stat label="回访：第几天来" value={vtypes.back.visitors} sub={vtypes.byVisitDay.map((b) => `${b.label} ${b.n}`).join(" · ")} />
          <Stat label="回访：隔多久" value={vtypes.back.visitors} sub={vtypes.byGap.map((b) => `${b.label} ${b.n}`).join(" · ")} />
        </div>
        <Legend>每个事件都带「新客 / 回访客」和「第几天来」两个值（浏览器本地记的，不含任何 id），所以每个会话都能分边，不只是发 visit_day 的那一个。付费按订单上的浏览器会话号接回，不含测试单。换浏览器或清缓存的人会算成新客，所以回访客是下限。</Legend>
      </Section>

      <Section id="daily" title="每日" sub={`${HOME_TZ_LABEL} 日 · 最近 30 天 · 金线以下（${LIVE_DAY} 之前）是假门期，付费一栏必然为空`}>
        {/* on a phone only the last 7 days show; the checkboxes (CSS :has, no script) unfold the rest / fold the groups away */}
        <div className="overflow-x-auto -mx-4 px-4 [&:has(#daily-more:checked)_.daily-rest]:table-row [&:has(#daily-more:checked)_.daily-toggle]:hidden [&:has(#daily-who:not(:checked))_.who-row]:hidden">
          <input type="checkbox" id="daily-more" className="hidden" />
          {daily.some((d) => d.who) && (
            <label className="inline-flex items-center gap-1.5 text-xs opacity-70 mb-2 cursor-pointer select-none">
              <input type="checkbox" id="daily-who" className="accent-[var(--gold)]" />{/* 11-06 Neil: 默认不勾 */}
              按身份分开看（会员 / 通卡期内 / 付过钱 / 领过免费 / 未转化，10-03 起有数）
            </label>
          )}
          <table className="w-full text-sm min-w-[50rem]">
            <thead>
              <tr className="text-left">
                <th rowSpan={2} className={`${th} sticky left-0 bg-[var(--paper)] align-bottom`}>日期</th>
                <th rowSpan={2} className={`${th} ${num} align-bottom`}>独立访客</th>
                <th rowSpan={2} className={`${th} ${num} opacity-40 align-bottom`} title="11-06 起：只从机房网络（腾讯云、华为云……）打开、没起卦没点价格没登录的浏览器——多半是微信、QQ、华为浏览器的链接检查，不算独立访客">机房</th>
                <th rowSpan={2} className={`${th} ${num} opacity-50 align-bottom`}>会话</th>
                <th rowSpan={2} className={`${th} ${num} align-bottom`} title="起卦人 ÷ 独立访客">起卦人<span className="block text-[10px]">÷访客</span></th>
                <th rowSpan={2} className={`${th} ${num} align-bottom`}>起卦</th>
                <th rowSpan={2} className={`${th} ${num} align-bottom`} title="点价格 ÷ 起卦人">点价格<span className="block text-[10px]">÷起卦人</span></th>
                <th rowSpan={2} className={`${th} ${num} opacity-30 align-bottom`}>被拦</th>
                <th rowSpan={2} className={`${th} ${num} align-bottom`} title="领取 ÷ 点价格">领取<span className="block text-[10px]">÷点价格</span></th>
                <th colSpan={4} className="pt-1.5 pb-0.5 pr-3 font-normal text-xs opacity-50 whitespace-nowrap text-center border-b border-black/10">交付（全部产品）</th>
                <th rowSpan={2} className={`${th} ${num} align-bottom`} title="付费 ÷ 点价格">付费<span className="block text-[10px]">÷点价格</span></th>
              </tr>
              <tr className="text-left">
                {["付费", "通卡", "会员", "免费"].map((h) => <th key={h} className={`pt-0.5 pb-1.5 pr-3 font-normal text-xs opacity-50 whitespace-nowrap ${num}`}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {daily.slice(-30).reverse().map((d, i) => {
                // one day: the whole site, then (from 10-03, when sessions carry a browser id) each group under it
                const groups = d.who ? WHO_ORDER.filter((g) => { const c = d.who![g]; return (c.visitors ?? 0) + c.sessions + deliveredOf(c) + moneyOf(c) > 0; }) : [];
                const cells = (c: DayCells, sub: boolean) => {
                  const r = (n: number, of: number | null) => (
                    <>{of ? n : n || ""}{of ? <span className="block text-[11px] leading-tight opacity-50">{pct(n, of)}</span> : null}</>
                  );
                  const extra = c.money.passes + c.money.memberships + c.money.packs;
                  return (
                    <>
                      <td className={`${td} ${num}`}>{c.visitors ?? "—"}</td>
                      <td className={`${td} ${num} opacity-40`}>{sub ? "" : c.machine || ""}</td>
                      <td className={`${td} ${num} opacity-50`}>{c.sessions || (sub ? "" : 0)}</td>
                      <td className={`${td} ${num} opacity-80`}>{r(c.casters, c.visitors)}</td>
                      <td className={`${td} ${num} opacity-70`}>{c.casts || ""}</td>
                      <td className={`${td} ${num}`}>{r(c.taps, c.casters)}</td>
                      <td className={`${td} ${num} opacity-30`}>{c.tapsBlocked || ""}</td>
                      <td className={`${td} ${num}`}>{r(c.claims, c.taps)}</td>
                      <td className={`${td} ${num}`}>{c.delivered.paid || ""}</td>
                      <td className={`${td} ${num}`}>{c.delivered.pass || ""}</td>
                      <td className={`${td} ${num}`}>{c.delivered.member || ""}</td>
                      <td className={`${td} ${num}`}>{c.delivered.free || ""}</td>
                      <td className={`${td} ${num}`} title={`单买 ${c.money.readings} · 通卡 ${c.money.passes} · 会员新开 ${c.money.memberships} · 增购包 ${c.money.packs}`}>
                        {r(moneyOf(c), c.taps)}
                        {extra > 0 && <span className="block text-[10px] leading-tight opacity-50">{[c.money.passes ? `通卡 ${c.money.passes}` : "", c.money.memberships ? `会员 ${c.money.memberships}` : "", c.money.packs ? `增购 ${c.money.packs}` : ""].filter(Boolean).join(" ")}</span>}
                      </td>
                    </>
                  );
                };
                return (
                  <Fragment key={d.day}>
                    <tr className={`border-t align-top ${d.day === LIVE_DAY ? "border-[var(--gold)]" : "border-black/5"} ${i >= 7 ? "daily-rest hidden md:table-row" : ""}`}>
                      <td className={`${td} sticky left-0 bg-[var(--paper)] tabular-nums`}>
                        {d.day.slice(5)}
                        {d.day === LIVE_DAY && <span className="ml-1.5 text-[10px] text-[var(--gold-text)]">切正式</span>}
                        {groups.length > 0 && <span className="who-row ml-1.5 text-[10px] opacity-50">全部</span>}
                      </td>
                      {cells(d.all, false)}
                    </tr>
                    {groups.map((g, k) => (
                      <tr key={g} className={`who-row align-top text-[13px] bg-black/[0.02] ${i >= 7 ? "hidden md:table-row" : ""}`}>
                        <td className={`${td} sticky left-0 bg-[var(--paper)] opacity-70`}>
                          <span className="opacity-40 mr-1">{k === groups.length - 1 ? "└" : "├"}</span>{WHO_ZH[g]}
                        </td>
                        {cells(d.who![g], true)}
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          {daily.length > 7 && (
            <label htmlFor="daily-more" className="daily-toggle md:hidden inline-block mt-2 text-xs underline underline-offset-4 opacity-60 cursor-pointer">展开 30 天</label>
          )}
        </div>
        <Legend>
          独立访客 = 浏览器·天（09-23 起，之前的日子是「—」），不含「机房」——只从机房网络打开、什么都没做的浏览器（多半是微信、QQ、华为的链接检查；10-31 起有网络记录，之前的日子没扣）；会话 = 标签页数（服务器记交付、回礼时用的订单号不再算成会话，所以比以前少一点）；起卦 = 摇了几卦。起卦人 = 摇过卦的人；点价格 = 点过轻解读/深断按钮的人（被拦 = 点了但先遇到一事一占提醒，同样算意向）；领取 = 领了免费解读或去了结账页的人——10-03 起按浏览器数人，同一个人开几个标签页只算一次（之前的日子、没有浏览器编号的会话按标签页算），所以 10-03 起这里的起卦率比「概览」（按标签页算）低一点，但每一组的转化率才不会超过 100%。
          每一步下面的百分比 = 这一步 ÷ 上一步：起卦人 ÷ 独立访客、点价格 ÷ 起卦人、领取 ÷ 点价格、付费 ÷ 点价格（付费按笔数，有人不点价格直接在账号页开会员，小组里偶尔会超过 100%）。
          交付 = 当天实际交付的解读和报告，10-23 起是全部产品（六爻、塔罗与解籤的个人解读、八字／紫微／星盘深度报告、正缘画像、合盘、年书），按凭什么给的拆四种：付费（这一份花了钱，退款的照算）、通卡（通卡期内用的，含带着卦买通卡的那一卦）、会员（会员额度，含我们赠送的会员）、免费（领取、朋友送的、推荐奖励、回访回礼、合参、公开卦例回礼、补偿）。付费 = 一笔收款算一次：单买 + 通卡 + 会员新开 + 增购包（续费不算）——通卡 10-22 起既有订单行又有通卡行，10-23 以前这里算了两次（10-22 显示 15、实际 11），旧日子已按新口径重算。
          按身份分开（10-03 起，那天起事件才带浏览器编号；一天里一半以上的会话有编号才分）：每个人按他当天第一次出现时是什么身份归一组，这一天都在这一组——会员（会员期内，或当天用了会员额度）、通卡期内（10-23 起单独一组，以前算在会员里）、付过钱（以前付过钱，含会员已到期的）、领过免费（领过免费解读、没付过钱）、未转化（都没有：新来的和来过但没买过没领过的）、没认出（没有浏览器编号）。所以当天第一次付钱的人还在「未转化」里，他的付款就是这一组的转化。「人」= 浏览器编号连上归到同一位客户名下的所有浏览器；交付和付费算在发生的那个人那天的组里。10-03 之前付过钱、之后还没在这台浏览器登录、付款或领取的老客，会先算在「未转化」，等他们下次登录或付款，往前的日子也会跟着归对（已登录的浏览器从现在起会自动归到账号下）。
        </Legend>
      </Section>

      {/* ---- recent readings: the detail — 10-24 every product (Neil: 「应该把用户所有的解读都放进去吧，包括各类产品的使用」) ---- */}
      <Section
        id="readings"
        title="最近的解读"
        sub={`${feed.length}${feed.length === rowLimit ? "+" : ""} 条 · ${recentKind ? `只看${RECENT_ZH[recentKind]}` : "全部产品"}`}
        right={feed.length === rowLimit && rowLimit < 500 ? <a className="underline underline-offset-2" href={`${href({ rows: String(Math.min(rowLimit * 5, 500)), ...(recentKind ? { rp: recentKind } : {}) })}#readings`}>更多</a> : undefined}
      >
        {/* which product: all of them, or one — and how many of each in this window */}
        <p className="text-xs mb-3 flex flex-wrap gap-x-3 gap-y-1" data-heat="recent-filter">
          <a href={`${href()}#readings`} className={recentKind ? "underline underline-offset-2 opacity-60" : "font-medium"}>全部</a>
          {RECENT_KINDS.map((k) => (feedCounts[k] > 0 || recentKind === k) ? (
            <a key={k} href={`${href({ rp: k })}#readings`} className={recentKind === k ? "font-medium" : "underline underline-offset-2 opacity-60"}>{RECENT_ZH[k]} {feedCounts[k]}{k === "jiaobei" ? " 回" : k === "qiuqian" ? " 支" : ""}</a>
          ) : null)}
        </p>
        {feed.length === 0 ? (
          <p className="text-sm opacity-40">这个区间没有{recentKind ? `「${RECENT_ZH[recentKind]}」的` : ""}记录。</p>
        ) : (
          <>
            {/* desktop: one row per use */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left">
                    <th className={th}>时间</th>
                    <th className={th}>产品</th>
                    <th className={th}>语言 / 币</th>
                    <th className={th}>档</th>
                    <th className={th}>来源</th>
                    <th className={th}>谁</th>
                    <th className={`${th} w-full`}>问题（私密）· 点开即读者看到的页面</th>
                    <th className={th}>卦 / 牌 / 籤 / 盘</th>
                    <th className={`${th} ${num}`}>追问</th>
                    <th className={`${th} ${num}`} title="解读页被打开的次数（只有六爻；不含后台点开、邮件扫描与爬虫；09-27 起）">打开</th>
                    <th className={th}>推荐码 / 送自</th>
                  </tr>
                </thead>
                <tbody>
                  {feed.map((f) => {
                    if (f.type === "other") {
                      const o = f.o;
                      return (
                        <tr key={o.key} className={`border-t border-black/5 align-top ${isOwnOther(o) ? "opacity-40" : ""}`}>
                          <td className={`${td} opacity-60 tabular-nums`}>{homeMinute(o.at)}</td>
                          <td className={td}>{RECENT_ZH[o.kind]}</td>
                          <td className={`${td} opacity-60`}>{o.locale ?? "—"}{o.currency ? ` · ${o.currency.toUpperCase()}` : ""}</td>
                          <td className={td}>{o.tier}</td>
                          <td className={td}>
                            {o.how}
                            {o.test && <span className="ml-1 rounded-[2px] border border-current px-1 text-[10px]">测试</span>}
                            {!o.test && isInternalEmail(o.email) && <span className="ml-1 rounded-[2px] border border-current px-1 text-[10px]">自己</span>}
                          </td>
                          <td className={td}>
                            {o.customerId
                              ? <><a className="underline underline-offset-2" href={`/admin/customers/${o.customerId}`}>{o.email ?? `#${o.customerId}`}</a>{o.viaBrowser && <span className="ml-1 opacity-40 text-[10px]" title="这次没登录，同一个浏览器登录过这个账号">同一浏览器</span>}</>
                              : <span className="opacity-40" title="没登录、没留邮箱，只知道是哪个浏览器">没登录{o.browser ? ` · 浏览器 ${o.browser}` : ""}</span>}
                          </td>
                          <td className="py-1.5 pr-3 max-w-[22rem]">
                            {o.href
                              ? <a className="block truncate underline decoration-black/20 underline-offset-2 hover:decoration-current" href={o.href} target="_blank" rel="noreferrer" title={o.text}>{o.text}</a>
                              : <span className="block truncate" title={o.text}>{o.text}</span>}
                          </td>
                          <td className="py-1.5 pr-3"><span className="block max-w-[16rem] truncate" title={o.detail}>{o.detail || "—"}</span></td>
                          <td className={`${td} ${num}`}>{o.followups ? `×${o.followups}` : ""}</td>
                          <td className={`${td} ${num}`}></td>
                          <td className={td}></td>
                        </tr>
                      );
                    }
                    const r = f.r;
                    const own = isOwnRow(r);
                    const readingHref = `/${asLocale(r.locale)}/reading?sid=${encodeURIComponent(r.session_id)}`;
                    return (
                      <tr key={r.session_id} className={`border-t border-black/5 align-top ${own ? "opacity-40" : ""}`}>
                        <td className={`${td} opacity-60 tabular-nums`}>{homeMinute(r.created_at)}</td>
                        <td className={td}>六爻</td>
                        <td className={`${td} opacity-60`} title={[r.page_locale && r.page_locale !== r.locale ? `在 ${r.page_locale} 页面提问，解读跟着提问语言写` : null, currencyWhy(r)].filter(Boolean).join("；") || undefined}>
                          {r.locale ?? "—"}{r.page_locale && r.page_locale !== r.locale ? <span className="opacity-60"> ←{r.page_locale}</span> : null}{r.currency ? ` · ${r.currency.toUpperCase()}` : ""}
                          {r.cur_src && r.cur_src !== "tz" && r.cur_src !== "chosen" ? <span className="opacity-50 text-[10px] align-super ml-0.5">{r.cur_src === "edge" ? "IP" : r.cur_src === "lang" ? "语" : "默"}</span> : null}
                        </td>
                        <td className={td}>{tierLabelZh(r.tier)}{r.first_deep ? <span className="opacity-40"> 首次价</span> : null}</td>
                        <td className={td}>
                          {r.status === "invite_light" && r.via === "ab_free" ? "首份免费（对照）" : r.status === "subscription" ? subName(r.sub_sid) : ORDER_SOURCE[r.status] ?? r.status}
                          {r.test_flag === 1 && <span className="ml-1 rounded-[2px] border border-current px-1 text-[10px]">测试</span>}
                          {r.test_flag !== 1 && isInternalEmail(r.email) && <span className="ml-1 rounded-[2px] border border-current px-1 text-[10px]">自己</span>}
                        </td>
                        <td className={td}>
                          {r.customer_id ? <a className="underline underline-offset-2" href={`/admin/customers/${r.customer_id}`}>{r.email ?? `#${r.customer_id}`}</a>
                            : r.email ? r.email : <span className="opacity-40">没留邮箱</span>}
                        </td>
                        <td className="py-1.5 pr-3 max-w-[22rem]">
                          <a className="block truncate underline decoration-black/20 underline-offset-2 hover:decoration-current" href={readingHref} target="_blank" rel="noreferrer" title={r.question ?? ""}>
                            {r.topic && <span className="opacity-40 mr-1">{TOPIC_LABEL[r.topic] ?? r.topic} ·</span>}
                            {r.question ?? <span className="opacity-30">（无卦，只有订单）</span>}
                          </a>
                        </td>
                        <td className={td}>{r.primary_name ?? "—"}{r.changed_name ? ` → ${r.changed_name}` : ""}</td>
                        <td className={`${td} ${num}`}>{r.followups ? `×${r.followups}` : ""}</td>
                        <td className={`${td} ${num}`} title={views.get(r.session_id) ? `最近 ${homeMinute(views.get(r.session_id)!.last_at)}` : undefined}>{views.get(r.session_id)?.n ?? ""}</td>
                        <td className={`${td} whitespace-nowrap`}>
                          {r.gift_from_id
                            ? <a className="underline decoration-black/20 underline-offset-2 opacity-70" href={`/admin/customers/${r.gift_from_id}`} title={`送一卦 · ${r.gift_from_kind === "member" ? "会员每月赠卦" : r.gift_from_kind === "case" ? "公开卦例回礼" : "付费深断附赠"}`}>送自 {(r.gift_from_email ?? `#${r.gift_from_id}`).split("@")[0]}</a>
                            : <span className="opacity-40 font-mono">{r.via && r.via !== "ab_free" ? r.via : ""}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* phone: one card per use */}
            <div className="md:hidden space-y-2">
              {feed.map((f) => {
                if (f.type === "other") {
                  const o = f.o;
                  return (
                    <div key={o.key} className={`rounded-[2px] border border-black/10 p-3 text-xs ${isOwnOther(o) ? "opacity-40" : ""}`}>
                      <div className="flex items-baseline justify-between gap-3 mb-1">
                        <span className="opacity-60 tabular-nums">{homeMinute(o.at)}</span>
                        <span className="text-right">{RECENT_ZH[o.kind]} · {o.tier} · {o.how}{o.followups ? <span className="opacity-60"> · 追问 ×{o.followups}</span> : null}</span>
                      </div>
                      {o.href
                        ? <a className="block underline decoration-black/20 underline-offset-2 text-sm" href={o.href} target="_blank" rel="noreferrer">{o.text}</a>
                        : <p className="text-sm">{o.text}</p>}
                      <div className="mt-1 opacity-60 flex flex-wrap gap-x-3">
                        {o.detail && <span>{o.detail}</span>}
                        <span>{o.locale ?? "—"}{o.currency ? ` · ${o.currency.toUpperCase()}` : ""}</span>
                        <span>{o.customerId ? <><a className="underline" href={`/admin/customers/${o.customerId}`}>{o.email ?? `#${o.customerId}`}</a>{o.viaBrowser ? "（同一浏览器）" : ""}</> : `没登录${o.browser ? ` · 浏览器 ${o.browser}` : ""}`}</span>
                      </div>
                    </div>
                  );
                }
                const r = f.r;
                const own = isOwnRow(r);
                const readingHref = `/${asLocale(r.locale)}/reading?sid=${encodeURIComponent(r.session_id)}`;
                return (
                  <div key={r.session_id} className={`rounded-[2px] border border-black/10 p-3 text-xs ${own ? "opacity-40" : ""}`}>
                    <div className="flex items-baseline justify-between gap-3 mb-1">
                      <span className="opacity-60 tabular-nums">{homeMinute(r.created_at)}</span>
                      <span className="whitespace-nowrap">
                        六爻 · {tierLabelZh(r.tier)} · {r.status === "invite_light" && r.via === "ab_free" ? "首份免费（对照测试）" : r.status === "subscription" ? subName(r.sub_sid) : ORDER_SOURCE[r.status] ?? r.status}
                        {r.followups ? <span className="opacity-60"> · 追问 ×{r.followups}</span> : null}
                        {views.get(r.session_id) ? <span className="opacity-60"> · 打开 ×{views.get(r.session_id)!.n}</span> : null}
                      </span>
                    </div>
                    <a className="block underline decoration-black/20 underline-offset-2 text-sm" href={readingHref} target="_blank" rel="noreferrer">
                      {r.topic && <span className="opacity-40 mr-1">{TOPIC_LABEL[r.topic] ?? r.topic} ·</span>}
                      {r.question ?? <span className="opacity-30">（无卦，只有订单）</span>}
                    </a>
                    <div className="mt-1 opacity-60 flex flex-wrap gap-x-3">
                      <span>{r.primary_name ?? "—"}{r.changed_name ? ` → ${r.changed_name}` : ""}</span>
                      <span>{r.locale ?? "—"}{r.page_locale && r.page_locale !== r.locale ? ` ←${r.page_locale}` : ""}{r.currency ? ` · ${r.currency.toUpperCase()}` : ""}{r.cur_src && r.cur_src !== "tz" && r.cur_src !== "chosen" ? `（${CUR_SRC[r.cur_src] ?? r.cur_src}）` : ""}</span>
                      <span>{r.customer_id ? <a className="underline" href={`/admin/customers/${r.customer_id}`}>{r.email ?? `#${r.customer_id}`}</a> : r.email ?? "没留邮箱"}</span>
                      {r.via && r.via !== "ab_free" && <span className="font-mono">via {r.via}</span>}
                      {r.gift_from_id && <a className="underline" href={`/admin/customers/${r.gift_from_id}`}>送自 {(r.gift_from_email ?? `#${r.gift_from_id}`).split("@")[0]}</a>}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
                <Legend>10-24 起是全部产品，一行一次使用，按时间排：六爻（订单，含免费的轻解读）、塔罗（每次抽牌；免费的只看牌义，「个人解读」是付费那层）、解籤（每次查籤；免费只看籤诗）、求籤（站内抽籤）、擲筊（写了问题的）——这两样一个人常常一天几十回，所以同一个人一天并成一行，写着当天几回、最近一回的问题和结果（上面一排的数字是一回一回、一支一支算的）、八字／紫微／星盘深度报告、正缘画像、合盘、年书（付了钱或用通卡／会员的；「还在写」= 没写完）、命盘问答。今日一籤没有问题，不列。上面一排点产品名只看那一种，数字是这个区间里的次数。来源：付费（金额）／通卡／会员／免费／测试；命盘问答写当时有效的通卡／会员；10-24 前有过每天 3 题免费，那些写「免费」，10-24 起命盘问答只给通卡／会员。六爻那几列（卦、追问、打开、推荐码）照旧；其他产品的「卦 / 牌 / 籤 / 盘」写抽到的牌、籤、盘面一句。问题是读者的私密数据，链接是读者自己的私密链接，不要外传。「谁」：擲筊、求籤、免费抽牌、六爻起卦、解籤 10-25 前不用登录就能用（命盘问答 10-24 前），10-25 起都要登录，所以有不少行没有账号——同一个浏览器登录过（之前或之后）的，写那个人，后面标「同一浏览器」；从来没登录过的写「没登录 · 浏览器 xxxx」（浏览器编号前 4 位，编号一样 = 同一台设备的同一个浏览器），这些人我们只知道浏览器，没有邮箱也没有客户档案。六爻轻解读「不留邮箱，直接看」的写「没留邮箱」。灰掉的行是我们自己的邮箱。语言 = 解读写成的语言（跟着提问语言走，「en ←zh-hant」是在繁體页用英文提问）；币 = 读者设备所在地解析出的币种（手动 &gt; 设备时区 &gt; IP 国家 &gt; 系统语言），所以 zh · JPY 是住在日本的简体读者、zh-hant · GBP 是在英国的港台读者，不是错配；鼠标悬停看是哪个信号定的（09-18 起的记录才有），上标 IP / 语 / 默 标出不是时区定的那些。</Legend>
      </Section>

      {/* ---- markets ---- */}
      <Section id="markets" title="按币种" sub="每张价格表各自转不转">
        {currencyRows.length === 0 ? (
          <p className="text-sm opacity-40">这个区间没有看到价格的会话。</p>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="text-left">
                    <th className={th}>币</th>
                    <th className={`${th} ${num}`}>起卦</th>
                    <th className={`${th} ${num}`}>点深断 / 轻</th>
                    <th className={`${th} ${num}`}>赠送 轻 / 深</th>
                    <th className={`${th} ${num}`}>留邮箱</th>
                    <th className={`${th} ${num}`}>结账页</th>
                    <th className={`${th} ${num}`}>通卡 / 单买</th>
                    <th className={`${th} ${num}`}>会员 · 通卡在用</th>
                    <th className={`${th} ${num}`}>收入</th>
                    <th className={`${th} ${num}`}>深÷卦</th>
                    <th className={`${th} ${num}`}>付÷卦</th>
                  </tr>
                </thead>
                <tbody>
                  {currencyRows.map((r) => (
                    <tr key={r.cur} className="border-t border-black/5">
                      <td className={td}>{r.cur}</td>
                      <td className={`${td} ${num}`}>{r.casts}</td>
                      <td className={`${td} ${num}`}>{r.clicksDeep}<span className="opacity-40"> / {r.clicksOne}</span></td>
                      <td className={`${td} ${num}`}>{r.giftOneN} / {r.giftDeepN}{r.giftFirstN ? <span className="opacity-40"> · 首次价 {r.giftFirstN}</span> : null}</td>
                      <td className={`${td} ${num}`}>{r.giftEmails}<span className="opacity-40"> / {r.giftN}</span></td>
                      <td className={`${td} ${num}`}>{r.checkout}</td>
                      <td className={`${td} ${num}`}>{r.passN} / {r.singleN}{r.oneN + r.deepN ? <span className="opacity-40"> · 其中解读 {r.oneN + r.deepN}</span> : null}</td>
                      <td className={`${td} ${num}`}>{r.members}{r.members ? <span className="opacity-40"> · {r.monthly}月 {r.yearly}年</span> : null}{r.passLive ? <span className="opacity-40"> · 通卡 {r.passLive}</span> : null}</td>
                      <td className={`${td} ${num}`}>{money(r.cur, r.revenue)}</td>
                      <td className={`${td} ${num}`}>{pct(r.clicksDeep, r.casts)}</td>
                      <td className={`${td} ${num}`}>{pct(r.paidN, r.casts)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* phone: a card only for markets where anything happened past the cast; the quiet ones share a line */}
            <div className="md:hidden grid grid-cols-1 sm:grid-cols-2 gap-2">
              {currencyRows.filter((r) => r.clicksDeep + r.clicksOne + r.giftN + r.passN + r.singleN + r.members > 0).map((r) => (
                <div key={r.cur} className="rounded-[2px] border border-black/10 p-3 text-xs">
                  <div className="flex items-baseline justify-between mb-1"><span className="text-sm">{r.cur}</span><span className="tabular-nums">{money(r.cur, r.revenue)}</span></div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 tabular-nums opacity-80">
                    <span>起卦 {r.casts}</span><span>点深断 {r.clicksDeep} <span className="opacity-50">/ 轻 {r.clicksOne}</span></span>
                    <span>赠送 {r.giftOneN}/{r.giftDeepN}</span><span>留邮箱 {r.giftEmails}/{r.giftN}</span>
                    <span>通卡 {r.passN} · 单买 {r.singleN}</span><span>会员 {r.members} · 通卡在用 {r.passLive}</span>
                    <span>深÷卦 {pct(r.clicksDeep, r.casts)}</span><span>付÷卦 {pct(r.paidN, r.casts)}</span>
                  </div>
                </div>
              ))}
              {currencyRows.some((r) => r.clicksDeep + r.clicksOne + r.giftN + r.passN + r.singleN + r.members === 0) && (
                <p className="text-xs opacity-50 tabular-nums leading-relaxed">
                  只起了卦：{currencyRows.filter((r) => r.clicksDeep + r.clicksOne + r.giftN + r.passN + r.singleN + r.members === 0).map((r) => `${r.cur} ${r.casts}`).join(" · ")}
                </p>
              )}
            </div>
          </>
        )}
        <Legend>会话按起卦时看到的币种归档；「收入」是一次性订单（通卡和单买）的原币金额，<b>不含会员发票</b>（会员的钱在概览的「到账」里）；会员是当前续订中的会员数，通卡在用另计（10-23 前两者混在一起）；付÷卦 = 起卦页买的单＋带着卦买的通卡 ÷ 起卦。赠送 = 假门：点了价格按钮后免费交付，「首次价」= 按钮当时显示的是首次价，「留邮箱」= 领取时留了地址。一个市场看两周再评价价格。</Legend>
      </Section>

      {/* ---- sharing ---- */}
      <Section id="sharing" title="分享与推荐" sub="分享卡 → 新访客 → 起卦 → 付费">
        {/* 09-29: the thank-you for a claimed gift has no ceiling — this is the human look instead */}
        {(() => {
          const heavy = heavyClaimGivers(Date.now() - 30 * 86_400_000, CLAIM_REWARD_WATCH);
          return heavy.length ? (
            <p className="text-sm mb-4 px-3 py-2 border border-[var(--cinnabar)]/40 rounded-[2px]">
              <span className="text-[var(--cinnabar)]">送卦回礼偏多（30 天 ≥{CLAIM_REWARD_WATCH} 次，看看是不是送给自己的小号）：</span>{" "}
              {heavy.map((h) => <a key={h.customer_id} href={`/admin/customers/${h.customer_id}`} className="underline underline-offset-4 mr-3">{h.email ?? `#${h.customer_id}`} ×{h.n}</a>)}
            </p>
          ) : null;
        })()}
        {/* 10-13 进度表 41 ①⑥: where shares happen and where they go — the target is 4% → 8% of finished casts */}
        <div className="mb-4 text-sm border border-[var(--ink-16)] rounded-[2px] px-3 py-3">
          <p className="mb-2">分享率（摇完卦的会话里有分享动作的）：<b>{sh.shareRate.rate}%</b>（{sh.shareRate.sharers} / {sh.shareRate.casters}）· 目标 8%</p>
          <table className="w-full text-xs tabular-nums">
            <thead><tr className="opacity-50 text-left"><th className="font-normal py-1">位置</th><th className="font-normal">分享人数 / 到达</th><th className="font-normal">分享率</th><th className="font-normal">渠道</th></tr></thead>
            <tbody>
              {sh.bySurface.map((r) => (
                <tr key={r.sf} className="border-t border-[var(--ink-16)]">
                  <td className="py-1">{SURFACE_LABEL[r.sf as keyof typeof SURFACE_LABEL] ?? r.sf}</td>
                  <td>{r.sharers} / {r.base}</td>
                  <td>{r.rate}%</td>
                  <td>{Object.entries(r.channels).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${CHANNEL_LABEL[c as keyof typeof CHANNEL_LABEL] ?? c} ${n}`).join(" · ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="opacity-50 mt-2">分享带来的来访 → 起卦 → 付费，看下面「渠道」表的 gua-share（卦）、qian-share（籤）、ying-share（应验卡）、qian-friend（籤页传给朋友）四行；10-13 之前的分享没有位置标记。</p>
        </div>
        <div className="grid sm:grid-cols-3 gap-4 text-sm">
          <Card title="分享动作">
            <Row l="调起分享面板" v={sh.clicks.native} />
            <Row l="复制链接" v={sh.clicks.copy} />
            <Row l="分享卡被打开" v={sh.cardViewers} />
            <Row l="送一卦 · 发出 / 领取" v={`${sh.giftSent} / ${sh.giftClaimed}`} />
            <Row l="合参 · 邀请 / 应邀" v={`${sh.pairSent} / ${sh.pairClaimed}`} />
            <Row l="应验卡分享" v={sh.proofShares} />
          </Card>
          <Card title="推荐结果">
            <Row l="经分享进站" v={sh.referredSessions} />
            <Row l="经分享摇完卦" v={sh.referredCasts} />
            <Row l="经分享领取 / 结账" v={sh.referredClaims} />
            <Row l="经分享付费" v={sh.referredPurchases} />
            <Row l="分享邀请 · 新人免费轻解读" v={sh.inviteFreeLight} />
            <Row l="首份免费（对照测试）" v={sh.abFreeLight} />
            <Row l="推荐奖励 · 发出 / 用掉 / 过期" v={`${referrals.granted} / ${referrals.redeemed} / ${referrals.expired}`} />
            <Row l="K 值" v={sh.k.toFixed(2)} strong />
          </Card>
          <Card title="会员与热门分享">
            <Row l="会员" v={`${stand.members}（月 ${stand.monthly} · 年 ${stand.yearly}${stand.comps ? ` · 赠送 ${stand.comps}` : ""}）· 通卡在用 ${stand.passes}`} />
            <Row l="即将取消" v={subs.canceling} />
            <Row l="MRR（按各自币种折美元）" v={`$${(mrrCents / 100).toFixed(2)}`} />
            <p className="text-xs opacity-40 mt-3 mb-1">被分享最多的卦</p>
            {sh.topCodes.length === 0 && <p className="opacity-30">—</p>}
            {sh.topCodes.filter((c) => /^[6-9]{6}$/.test(c.code)).slice(0, 6).map((c) => (
              <Row key={c.code} l={<a className="underline underline-offset-2 font-mono" href={`/en/share/${c.code}`} target="_blank" rel="noreferrer">{c.code}</a>} v={c.sessions} />
            ))}
          </Card>
        </div>
      </Section>

      {/* ---- channels + sources ---- */}
      <Section id="channels" title="渠道与来源" sub="推广链接的 ?c= 标签 · 以及浏览器带来的 referrer">
        <div className="grid md:grid-cols-[1fr_16rem] gap-6">
          <div>
            {stats.byChannel.some((c) => c.c !== "—") ? (
              <div className="overflow-x-auto -mx-4 px-4">
                <table className="w-full text-sm tabular-nums min-w-[30rem]">
                  <thead>
                    <tr className="text-left">
                      <th className={th}>?c=</th>
                      <th className={`${th} ${num}`}>独立访客</th>
                      <th className={`${th} ${num} opacity-50`}>会话</th>
                      <th className={`${th} ${num}`}>起卦</th>
                      <th className={`${th} ${num}`}>起卦率</th>
                      <th className={`${th} ${num}`}>点价格</th>
                      <th className={`${th} ${num}`}>点价格率</th>
                      <th className={`${th} ${num}`}>领取</th>
                      <th className={`${th} ${num}`}>付费</th>
                      <th className={`${th} ${num}`}>到账</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.byChannel.map((r, i) => (
                      <Fragment key={r.c}>
                      {r.c.startsWith("~") && !stats.byChannel[i - 1]?.c.startsWith("~") && (
                        <tr><td colSpan={10} className="pt-3 pb-1 text-xs opacity-50">没带 ?c=，按 referrer 推断的来源（~）</td></tr>
                      )}
                      <tr className={`border-t border-black/5 ${r.c.startsWith("~") ? "opacity-75" : ""}`}>
                        <td className={td}>{r.c}</td>
                        <td className={`${td} ${num}`}>{r.visitors || ""}</td>
                        <td className={`${td} ${num} opacity-50`}>{r.sessions}</td>
                        <td className={`${td} ${num}`}>{r.casts}</td>
                        <td className={`${td} ${num}`}>{r.visitors ? pct(r.casts, r.visitors) : ""}</td>
                        <td className={`${td} ${num}`}>{r.clicks}</td>
                        <td className={`${td} ${num}`}>{r.visitors ? pct(r.clicks, r.visitors) : ""}</td>
                        <td className={`${td} ${num}`}>{r.claims}</td>
                        <td className={`${td} ${num}`}>{channelMoney.get(r.c)?.orders ?? ""}</td>
                        <td className={`${td} ${num}`}>{channelMoney.get(r.c) ? `$${((channelMoney.get(r.c)!.net) / 100).toFixed(2)}` : ""}</td>
                      </tr>
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-sm opacity-40">还没有带 ?c= 的流量。</p>}
            <Legend>起卦率、点价格率 ÷ 独立访客（该标签那天的第一个会话带着它才算进来）。会话按第一次落地链接的 ?c= 归档（同一标签页内不变）；没带 ?c= 时按来访网站推断，记成 <code>~pinterest</code>、<code>~threads</code>、<code>~ref:域名</code> 这类（09-24 起），单独列在下面；「—」是既没标签也没外站来源的（直接输入、书签、搜索 App 不带 referrer 等）。领取 = 到了结账页或提交了领取面板。**付费与到账**顺着同一个会话追到 Stripe 的结算金额——到账是扣完手续费的真钱，没带标签的单子归在「—」。</Legend>
          </div>
          <Card title="来源（referrer）">
            {stats.topRefs.length === 0 && <p className="text-sm opacity-30">—</p>}
            {stats.topRefs.slice(0, 12).map((r) => <Row key={r.ref} l={<span className="truncate block max-w-[11rem]">{r.ref}</span>} v={r.n} />)}
          </Card>
        </div>
        {/* 09-29 (用户数据与需求全面分析 §5): not sessions — the people who stayed, by where they first came from */}
        {(() => {
          const ch = pageRead("customerChannels", pw, now);
          if (!ch.length) return null;
          return (
            <div className="mt-6 overflow-x-auto -mx-4 px-4">
              <p className="text-xs opacity-50 mb-2">按客户看：每位客户第一次来的地方，和他们后来成了什么样的读者（全部时间）</p>
              <table className="w-full text-sm tabular-nums min-w-[30rem]">
                <thead><tr className="text-left">
                  <th className={th}>首次来源</th><th className={`${th} ${num}`}>客户</th><th className={`${th} ${num}`}>起卦 ≥6</th><th className={`${th} ${num}`}>会员</th><th className={`${th} ${num}`}>付过费</th><th className={`${th} ${num}`}>人均卦</th>
                </tr></thead>
                <tbody>
                  {ch.map((r) => (
                    <tr key={r.source} className="border-t border-black/5">
                      <td className={td}>{r.source}</td>
                      <td className={`${td} ${num}`}>{r.customers}</td>
                      <td className={`${td} ${num}`}>{r.heavy} <span className="opacity-40 text-xs">{pct(r.heavy, r.customers)}</span></td>
                      <td className={`${td} ${num}`}>{r.members} <span className="opacity-40 text-xs">{pct(r.members, r.customers)}</span></td>
                      <td className={`${td} ${num}`}>{r.payers} <span className="opacity-40 text-xs">{pct(r.payers, r.customers)}</span></td>
                      <td className={`${td} ${num}`}>{(r.casts / Math.max(1, r.customers)).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Legend>事件本身不带客户身份（隐私政策的承诺）。客户的来源取自他最早一张说得出来源的订单：结账时带的 ?c= 标签，否则顺着那张订单的浏览器会话找到第一次进站的页面（?c= 或来访网站），再否则看有没有分享码。会员兑换的解读不带来源，所以只买会员、从没单买过的客户多半落在「没有标记」。</Legend>
            </div>
          );
        })()}
      </Section>

      {/* ---- email ---- */}
      <Section id="email" title="邮件" sub={`Resend 回报 · webhook ${mail.lastEventAt === null ? "从未收到" : `最近 ${ago(mail.lastEventAt)}`}`}>
        {/* 09-18: every deep reading now carries a delivery mail, and the free plan stops at 100 a day — the gauge turns red at 80 */}
        <div className="grid sm:grid-cols-2 gap-3 mb-5">
          <Quota label={`本周期已发（Pro · 5 万 · ${homeDay(cycleStart)} 起，${homeDay(cycleEnd)} 重置）`} used={mailMonth} cap={RESEND_PLAN.month} />
          <div className="rounded-[2px] border border-black/10 p-4">
            <p className="text-xs opacity-50">今天已发（UTC 日）</p>
            <p className="text-2xl tabular-nums leading-none mt-1">{mailToday.toLocaleString()}</p>
            <p className="text-[11px] opacity-50 mt-1.5 leading-snug">
              Pro 无每日上限{mailMonth > RESEND_PLAN.month ? ` · 已超额 ${(mailMonth - RESEND_PLAN.month).toLocaleString()} 封，约 $${(((mailMonth - RESEND_PLAN.month) / 1000) * RESEND_PLAN.overagePer1k).toFixed(2)}` : " · 超出按 $0.90/千封"}
            </p>
          </div>
        </div>
        {mail.total.sent === 0 ? <p className="text-sm opacity-40">这个区间没有发过邮件。</p> : (
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-sm tabular-nums min-w-[32rem]">
              <thead>
                <tr className="text-left">
                  <th className={th}>类型</th>
                  <th className={`${th} ${num}`}>发出</th>
                  <th className={`${th} ${num}`}>送达</th>
                  <th className={`${th} ${num}`}>打开</th>
                  <th className={`${th} ${num}`}>开÷达</th>
                  <th className={`${th} ${num}`}>退信</th>
                  <th className={`${th} ${num}`}>投诉</th>
                  <th className={`${th} ${num}`}>失败</th>
                </tr>
              </thead>
              <tbody>
                {[...mail.byKind, mail.total].map((k) => (
                  <tr key={k.kind} className={`border-t border-black/5 ${k.kind === "all" ? "font-medium" : ""}`}>
                    <td className={td}>{MAIL_KIND[k.kind] ?? k.kind}<span className="opacity-40 ml-2 text-xs">{k.kind === "all" ? "" : k.kind}</span></td>
                    <td className={`${td} ${num}`}>{k.sent}</td>
                    <td className={`${td} ${num}`}>{k.delivered}</td>
                    <td className={`${td} ${num}`}>{k.opened}</td>
                    <td className={`${td} ${num}`}>{pct(k.opened, k.delivered)}</td>
                    <td className={`${td} ${num} ${k.bounced ? "text-[var(--cinnabar)]" : ""}`}>{k.bounced || ""}</td>
                    <td className={`${td} ${num} ${k.complained ? "text-[var(--cinnabar)]" : ""}`}>{k.complained || ""}</td>
                    <td className={`${td} ${num} ${k.failed ? "text-[var(--cinnabar)]" : ""}`}>{k.failed || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {mail.problems.length > 0 && (
          <div className="mt-3 text-xs space-y-0.5">
            <p className="opacity-40 mb-1">出问题的（新的在前）</p>
            {mail.problems.map((p) => (
              <p key={p.id} className="flex flex-wrap gap-x-3">
                <span className="opacity-50 tabular-nums">{homeMinute(p.at)}</span>
                <span className="text-[var(--cinnabar)]">{p.what}</span>
                <span className="opacity-60">{MAIL_KIND[p.kind] ?? p.kind}</span>
                <span>{p.email}</span>
                {p.note && <span className="opacity-40 truncate max-w-full">{p.note}</span>}
              </p>
            ))}
          </div>
        )}
        <Legend>发出 = Resend 接收；送达/打开/退信由 webhook 回报。「打开」是追踪像素，只能当参考：Gmail 会预取图片、Apple Mail 隐私保护会把所有信标成已打开，纯文本客户端永远不显示。Resend Pro（$20/月）5 万封/月、无每日上限；超出按 $0.90/千封计。</Legend>
      </Section>

      {/* ---- public cases ---- */}
      {/* ---- refunds & disputes over time (09-22) ---- */}
      <Section
        id="refunds"
        title="退款与争议"
        sub={`按「下单那天」归集（不是退款那天）· ${LIVE_DAY} 真实付款以来 · 争议率超过 1% 会被 Stripe 盯上`}
      >
        {refundTrend.paid === 0 ? (
          <p className="text-xs opacity-60">还没有真实付款。</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="付费单" value={refundTrend.paid} />
              <Stat label="退款" value={refundTrend.refunded} sub={`${refundTrend.rate.toFixed(1)}%`} good={refundTrend.rate < 5} />
              <Stat label="争议" value={refundTrend.disputed} sub={`${refundTrend.disputeRate.toFixed(2)}% · 红线 1%`} good={refundTrend.disputeRate < 1} />
              <Stat label="争议进行中" value={refunds.disputesOpen} good={refunds.disputesOpen === 0} />
            </div>
            {/* running rate: one refund on a quiet day is not a 100% problem */}
            <div className="mt-5 flex items-end gap-[3px] h-24 border-b border-[var(--ink-16)]">
              {refundTrend.days.map((d) => (
                <div key={d.day} className="flex-1 min-w-[6px] flex flex-col justify-end items-center group relative" title={`${d.day} · 付费 ${d.paid} · 退款 ${d.refunded} · 争议 ${d.disputed} · 累计退款率 ${d.rate.toFixed(1)}%`}>
                  <div
                    className={d.rate > 5 ? "w-full bg-[var(--cinnabar)]" : "w-full bg-[var(--ink-45)]"}
                    style={{ height: `${Math.max(Math.min(d.rate, 25) * 4, d.rate > 0 ? 2 : 0)}%` }}
                  />
                  {d.refunded === 0 && d.rate === 0 && <div className="w-full h-[1px] bg-[var(--ink-16)]" />}
                </div>
              ))}
            </div>
            <p className="text-xs opacity-50 mt-2 tabular-nums">
              柱高 = 到当天为止的累计退款率（满格 25%）· 悬停看当日明细 · 5% 以上转朱
            </p>
            <details className="mt-4 text-xs opacity-70">
              <summary className="cursor-pointer hover:opacity-100">逐日</summary>
              <table className="mt-2 w-full tabular-nums">
                <thead className="opacity-60"><tr className="text-left"><th className="py-1 pr-4">日</th><th className="py-1 pr-4">付费</th><th className="py-1 pr-4">退款</th><th className="py-1 pr-4">争议</th><th className="py-1">累计退款率</th></tr></thead>
                <tbody>
                  {[...refundTrend.days].reverse().map((d) => (
                    <tr key={d.day} className="border-t border-[var(--ink-16)]">
                      <td className="py-1 pr-4">{d.day}</td>
                      <td className="py-1 pr-4">{d.paid}</td>
                      <td className={`py-1 pr-4 ${d.refunded ? "text-[var(--cinnabar)]" : "opacity-40"}`}>{d.refunded}</td>
                      <td className={`py-1 pr-4 ${d.disputed ? "text-[var(--cinnabar)]" : "opacity-40"}`}>{d.disputed}</td>
                      <td className="py-1">{d.rate.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </>
        )}
      </Section>

      {/* ---- currency: what we guessed vs what the card said (09-22) ---- */}
      <Section
        id="currency"
        title="币种判定"
        sub="付款前我们只能猜——设备时钟、再退一步看 IP。卡国是付完才知道的，所以这里是事后对账"
      >
        {curMisses.length === 0 ? (
          <p className="text-xs opacity-60">
            {refundTrend.paid > 0 ? "目前每一单的卡国都和收款币种对得上。" : "还没有可对账的付款。"}
          </p>
        ) : (
          <>
            <p className="text-xs text-[var(--cinnabar)] mb-3">
              {curMisses.length} 单的卡国与收款币种不一致 —— 猜错了币，钱照收，只是收的不是那个市场的价。
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs tabular-nums">
                <thead className="opacity-60">
                  <tr className="text-left">
                    <th className="py-1 pr-4">单</th><th className="py-1 pr-4">时间</th><th className="py-1 pr-4">收了</th>
                    <th className="py-1 pr-4">卡国</th><th className="py-1 pr-4">本该</th>
                    <th className="py-1 pr-4">当时凭什么判的</th><th className="py-1">客户</th>
                  </tr>
                </thead>
                <tbody>
                  {curMisses.map((m) => (
                    <tr key={m.id} className="border-t border-[var(--ink-16)]">
                      <td className="py-1 pr-4">#{m.id}</td>
                      <td className="py-1 pr-4">{homeMinute(m.created_at)}</td>
                      <td className="py-1 pr-4 text-[var(--cinnabar)]">{(m.currency ?? "?").toUpperCase()} {m.amount_cents}</td>
                      <td className="py-1 pr-4">{m.card_country}</td>
                      <td className="py-1 pr-4">{m.should_be}</td>
                      <td className="py-1 pr-4 opacity-70">
                        {m.cur_src ? CUR_SRC[m.cur_src] ?? m.cur_src : "没记录"}
                        {m.tz_name ? ` ${m.tz_name}` : ""}
                        {m.edge_country ? ` · IP ${m.edge_country}` : ""}
                      </td>
                      <td className="py-1 opacity-70">{m.email ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <p className="text-xs opacity-45 mt-3 leading-relaxed">
          规则（09-22 Neil 定，维持）：手选的币种最优先，其次设备时钟，再次 IP，最后系统语言。
          时钟排在 IP 前面是因为代理改得了 IP、改不了时钟——翻墙的大陆读者要按 CNY 收，否则 Stripe 会直接拒付。
          代价是「时钟在一地、卡在另一地」的人会被判错，这张表就是用来看这种人有多少的。
        </p>
      </Section>

      <Section id="cases" title="公开卦例" sub={`${cases.live} 条在线 · 区间内发布 ${cases.published}`}>
        {cases.recent.length === 0 ? <p className="text-sm opacity-40">—</p> : (
          <div className="space-y-2 text-sm">
            {cases.recent.map((c) => (
              <div key={c.public_id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-black/5 pt-2">
                <span className="opacity-50 tabular-nums text-xs">{homeDay(c.published_at)}</span>
                <span className="opacity-50 text-xs">{c.locale}</span>
                <a className="underline underline-offset-2" href={casePath(asLocale(c.locale), c.public_id)} target="_blank" rel="noreferrer">{c.framing ?? <span className="opacity-40">（没写公开说法）</span>}</a>
                <span className="opacity-40 text-xs truncate max-w-[18rem]" title={c.question}>原问：{c.question}</span>
                <span className="opacity-50 text-xs">{c.hidden_at ? "已撤下" : c.unpublished_at ? "作者撤回" : "在线"}</span>
                {!c.hidden_at && !c.unpublished_at && (
                  <form method="post" action="/api/admin/case-hide" className="inline">
                    <input type="hidden" name="public_id" value={c.public_id} />
                    <input type="hidden" name="back" value={href()} />
                    <button className="text-xs underline underline-offset-2 opacity-60 hover:opacity-100">撤下</button>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
        {/* 09-26 (裂变 ②): each new case, already written as a Threads post — copy, post, mark */}
        {cases.toPost.length > 0 && (
          <div className="mt-6">
            <p className="text-xs opacity-50 mb-2">Threads 草稿 · 只用公开页上已有的内容（不含原问），链接带 ?c=threads，发完点「已发」</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {cases.toPost.map((c) => {
                const draft = threadsDraft(c, siteUrl);
                return (
                  <div key={c.public_id} className="border border-black/10 rounded-[2px] p-3 text-sm">
                    <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed mb-2">{draft}</pre>
                    <div className="flex items-center gap-4">
                      <CopyDraft text={draft} />
                      <span className="text-xs opacity-40 tabular-nums">{draft.length}/500 · {c.locale}</span>
                      <form method="post" action="/api/admin/case-posted" className="inline ml-auto">
                        <input type="hidden" name="public_id" value={c.public_id} />
                        <input type="hidden" name="back" value="/admin#cases" />
                        <button className="text-xs underline underline-offset-2 opacity-60 hover:opacity-100">已发</button>
                      </form>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Section>

      {/* ---- 10-23 应验记录 (Neil: 「我框起来的这个不是应验记录吗？」): the record had no section of its own — a footnote under
          「09-21 上线的三件」 and two rows under 「其他 · 参与」, in words the public page does not use (说中／说错／不算对错).
          One section now: first the same figures in the same words as /outcomes (lib/results-line.ts — the page and this
          cannot disagree), then the public cases' line, then what only we look at. ---- */}
      <Section id="outcomes" title="应验记录" sub="和读者在 /outcomes 看到的同一套数 · 不含测试账号 · 最多晚 5 分钟" right={<a href="/admin/outcomes" className="text-xs underline underline-offset-2 opacity-60 hover:opacity-100">打开应验记录页 →</a>}>
        <OutcomeSite more={<>公开卦例逐条、逐件核对、按卦，在 <a href="/admin/outcomes" className="underline underline-offset-2">应验记录页</a>；读者看到的是 <a href="/zh-hant/outcomes" target="_blank" rel="noreferrer" className="underline underline-offset-2">/zh-hant/outcomes</a>。</>} />
      </Section>

      {/* ---- misc ---- */}
      <Section id="misc" title="其他" sub="语言 · 参与 · 卦象">
        <div className="grid sm:grid-cols-3 gap-4 text-sm">
          <Card title="按语言（会话）">
            {Object.entries(stats.byLocale).sort((a, b) => b[1] - a[1]).map(([k, v]) => <Row key={k} l={k} v={v} />)}
          </Card>
          <Card title="参与">
            {/* 09-28 (进度表 13 ②): what broke in readers' browsers, by kind — a reader had written 「一直 error」 and nothing server-side showed it */}
            {(() => {
              const errs = twoWindows.filter((e) => e.e === "client_error" && e.t >= since);
              const by = new Map<string, number>(); for (const e of errs) by.set(e.method ?? "?", (by.get(e.method ?? "?") ?? 0) + 1);
              // 10-02: the latest few in full — message, page, browser (the iOS 16.2 Threads crash was 21 letters before)
              const latest = [...errs].sort((a, b) => b.t - a.t).slice(0, 8);
              return errs.length
                ? <>
                    {[...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => <Row key={k} l={<span className="font-mono text-xs text-[var(--cinnabar)]">{k}</span>} v={v} />)}
                    <details className="text-xs mt-1 mb-2">
                      <summary className="cursor-pointer opacity-60">最近 {latest.length} 条详情</summary>
                      <ul className="mt-1 space-y-1.5">
                        {latest.map((e, i) => (
                          <li key={i} className="leading-snug">
                            <span className="opacity-50 tabular-nums">{homeDay(e.t).slice(5)} {new Date(e.t + 8 * 3_600_000).toISOString().slice(11, 16)}</span>
                            <span className="opacity-60 ml-1">{e.path}</span>
                            {e.ua && <span className="ml-1">· {e.ua}</span>}
                            <span className="block font-mono text-[var(--cinnabar)] break-all">{e.msg ?? e.method}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </>
                : <Row l="浏览器端报错" v="0" />;
            })()}
            <Row l="追问" v={f.followups} />
            <Row l="一事一占提醒（10-02 起只剩「同一问题」那一道，点「情况变了」可继续；之前的日子含问满硬拦）" v={f.repeatBlocked} />
            {(f.repeatCapped ?? 0) > 0 && <Row l="　问满后照常起卦（10-02 起不再拦，不送免费一句）" v={f.repeatCapped ?? 0} />}
            {/* 09-29: who the gate stops, and how many then went into the matter page */}
            {(f.repeatMember ?? 0) + (f.repeatSame ?? 0) > 0 && <Row l="　其中会员 / 同一件事 / 进了事页" v={`${f.repeatMember ?? 0} / ${f.repeatSame ?? 0} / ${f.repeatToMatter ?? 0}`} />}
            {/* 10-23: 回访、应验回复、自报准确率 moved to the 应验记录 section above */}
            {Object.keys(sold.byTier).length > 0 && (
              <>
                <p className="text-xs opacity-40 mt-3 mb-1">付费订单按档（通卡、单买；会员发票不是订单）</p>
                {Object.entries(sold.byTier).map(([k, v]) => <Row key={k} l={tierLabelZh(k)} v={v} />)}
                {dc.all.pass + dc.all.member > 0 && <Row l="通卡／会员使用（没另外进账）" v={`${dc.all.pass} / ${dc.all.member}`} />}
              </>
            )}
          </Card>
          <Card title="最常摇出的卦">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {stats.topHexagrams.map((h) => (
                <span key={h.hex} className="whitespace-nowrap">
                  {String.fromCodePoint(0x4dc0 + h.hex - 1)} #{h.hex}<span className="opacity-50 tabular-nums ml-1">×{h.n}</span>
                </span>
              ))}
              {stats.topHexagrams.length === 0 && <span className="opacity-30">—</span>}
            </div>
          </Card>
        </div>
      </Section>

      {/* ---- 新玩法 (09-22) — 10-22 进度表 94 第二批: kept, moved under 「其他」 ---- */}
      <Section id="play" title="其他 · 09-21 上线的三件" sub="封卦 · 大众一卦 · 回访奖励">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="封卦发出" value={play.sealSent} sub={`有人等揭晓 ${seals.withWatchers} 张 · 订阅 ${seals.watchers} 人`} />
          <Stat label="揭晓订阅" value={seals.watchers} sub={seals.pending > 0 ? `${seals.pending} 人还在等 · 已通知 ${seals.told}` : `已通知 ${seals.told}`} />
          <Stat label="大众一卦被选" value={play.dailyPick} sub={`1/2/3 = ${play.dailyByPile.join(" / ")} · 已写 ${dailyCasts.written} 份`} />
          <Stat label="回访回礼" value={rewards.light + rewards.followup} sub={`轻解读券 ${rewards.light}（用掉 ${rewards.lightUsed}）· 加次追问 ${rewards.followup}`} />
        </div>
        {/* 10-23: the 回访回答 line here was the 应验记录 — it has its own section now (#outcomes) */}
        {seals.settled > 0 && <p className="text-xs opacity-60 mt-3 tabular-nums">已揭晓的封卦 {seals.settled} 张 · 回访的应了没应见上面「应验记录」</p>}
        <Legend>封卦发出 = 解读页点了「把这句话说在前头」；揭晓订阅 = 陌生人在封卦页留了邮箱。大众一卦按选了哪一堆分列——三堆差得多说明第一眼的图影响选择，差不多说明是随机的。回访回礼只对「应验了」发轻解读券，「没应验」给一次加次追问。</Legend>
      </Section>
    </AdminShell>
  );
}

/** A quota bar: plain until 80% of the cap, cinnabar from there, and the words say what happens at the top. */
function Quota({ label, used, cap }: { label: string; used: number; cap: number }) {
  const share = Math.min(used / cap, 1);
  const hot = share >= 0.8;
  return (
    <div className={`rounded-[2px] border p-3 ${hot ? "border-[var(--cinnabar)]" : "border-black/10"}`}>
      <div className="flex justify-between text-xs mb-1.5 gap-3">
        <span className="opacity-60">{label}</span>
        <span className={`tabular-nums ${hot ? "text-[var(--cinnabar)]" : ""}`}>{used} / {cap}{used >= cap ? " · 超了，后面的发不出去" : hot ? " · 快到顶" : ""}</span>
      </div>
      <div className="h-1.5 rounded bg-black/5">
        <div className={`h-1.5 rounded ${hot ? "bg-[var(--cinnabar)]" : "bg-[var(--gold)]"}`} style={{ width: `${Math.max(share * 100, used > 0 ? 2 : 0)}%` }} />
      </div>
    </div>
  );
}

function Row({ l, v, strong }: { l: React.ReactNode; v: React.ReactNode; strong?: boolean }) {
  return (
    <p className={`flex justify-between gap-3 ${strong ? "pt-2 mt-2 border-t border-black/10" : ""}`}>
      <span className="opacity-70 min-w-0">{l}</span>
      <span className={`tabular-nums whitespace-nowrap ${strong ? "" : "opacity-80"}`}>{v}</span>
    </p>
  );
}
