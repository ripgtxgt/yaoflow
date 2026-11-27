import { SALE_KEYS, SALE_KEY_ZH } from "@/lib/sale-bucket";
import { db as _dbForHint, revisitBacklog, selfRevisitStats, SELF_REVISIT_KINDS } from "@/lib/db";
import { refRewardStats } from "@/lib/ref-reward";
import { checkoutDigestLines } from "@/lib/checkout-audit";
import { offerStats } from "@/lib/recover-offer";
import { productReviewLines } from "@/lib/product-review";
import { announceStats } from "@/lib/announce-1023";
import { northStarLine } from "@/lib/north-star";
import { todayQianStats } from "@/lib/today-qian";
import { guaSearchFunnel } from "@/lib/gua-funnel";
import { NextRequest, NextResponse } from "next/server";
import { SURFACE_LABEL } from "@/lib/share-meta";
import { qianBreakdown, qianStats, realPaidBrowserSessions } from "@/lib/db";
import { qianSearchFunnel } from "@/lib/qian-funnel";
import { QIAN_SETS } from "@/lib/qian-meta";
import { caseSearchLandings, computeStats, proofFunnel, readEvents } from "@/lib/analytics-server";
import { markOwnOrdersAsTest, opsSummary, outcomeStats, recordOps, referralStats, refundStats, revisitCounts, stats as dbStats, subscriptionStats, salesByCurrency, realOrderSessionTails, isRealDeliveryEvent, revenueByCurrency,
  sealStats, revisitRewardStats, dailyCastStats, firstToFull, ltvStats, genTiming, ordersByPaymentIntent, paidOrdersIn, subRedemptionsIn, txnsBetween, refundSeries, activeSubscriptionAmounts, liveMoney } from "@/lib/db";
import { INTERNAL_EMAILS } from "@/lib/internal";
import { ownerRecipients, sendEmail } from "@/lib/email";
import { homeDay } from "@/lib/clock";
import { LIVE_DAY, LIVE_SINCE, refreshFx, toUsdCents } from "@/lib/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 经营周报 — one email a week to the owner so the dashboard need not be
 * remembered: funnel, gates, customer-reported accuracy, referrals, health.
 * Hit by the server cron on Monday morning; ADMIN_KEY guarded; ?dry=1 previews.
 */
export async function POST(req: NextRequest) {
  const key = req.headers.get("x-cron-key");
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  await refreshFx();
  const to = ownerRecipients();
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");

  // 09-21: our own test orders leave the funnel here too (same rule as the dashboard)
  markOwnOrdersAsTest(INTERNAL_EMAILS);
  const realTails = realOrderSessionTails();
  // 10-15 进度表 60: one read of the fortnight, sliced per call (it was read eight times)
  const fortnight = readEvents(14).filter((e) => isRealDeliveryEvent(e, realTails));
  const events = (days: number) => { const from = Date.now() - days * 86400_000; return days >= 14 ? fortnight : fortnight.filter((e) => e.t >= from); };
  // 09-22: same as the panel — a membership allowance renders the same page and
  // fires the same event, so "付费" has to be told which sessions took money
  const paidSessions = paidOrdersIn(0).sessions;
  const week = computeStats(events(7), paidSessions);
  // 09-22: a 7-day window still straddles the painted door, where "conversion"
  // is meaningless — everything was free. Rates are quoted on the real-money
  // stretch only; the flow counts stay 7-day so the week still reads as a week.
  const liveOnly = computeStats(events(7).filter((e) => e.t >= LIVE_SINCE), paidSessions);
  // 09-22: a membership allowance fires a purchase event while paying nothing,
  // so "付费" and the conversion rate come from the orders table, not the log.
  const sold = paidOrdersIn(Math.max(LIVE_SINCE, Date.now() - 7 * 86400_000));
  const soldLive = paidOrdersIn(LIVE_SINCE);
  const redeemed = subRedemptionsIn(Math.max(LIVE_SINCE, Date.now() - 7 * 86400_000));
  const convLive = liveOnly.funnel.castComplete > 0 ? Math.round((soldLive.n / liveOnly.funnel.castComplete) * 1000) / 10 : 0;
  const spansDoor = Date.now() - 7 * 86400_000 < LIVE_SINCE; void spansDoor;
  const prev = computeStats(events(14), paidSessions);
  const f = week.funnel;
  // last week's numbers = 14-day totals minus this week's
  const pf = {
    visitors: Math.max(prev.funnel.visitors - f.visitors, 0),
    sessions: Math.max(prev.funnel.sessions - f.sessions, 0),
    castComplete: Math.max(prev.funnel.castComplete - f.castComplete, 0),
    purchase: Math.max(prev.funnel.purchase - f.purchase, 0),
  };
  const outcomes = outcomeStats();
  const accuracy = outcomes.hit + outcomes.miss > 0 ? Math.round((outcomes.hit / (outcomes.hit + outcomes.miss)) * 100) : null;
  const referrals = referralStats();
  const subs = subscriptionStats();
  const revisits = revisitCounts();
  const ops = opsSummary();
  const totals = dbStats();
  // 09-22: the things the dashboard grew this week, so the mail is not a stale copy of it
  const week7 = Date.now() - 7 * 86400_000;
  const seals = sealStats();
  const rewards = revisitRewardStats(week7);
  const dailyCasts = dailyCastStats();
  const firstFull = firstToFull();
  const ltv = ltvStats();
  const timing = genTiming(week7);
  const ev7 = events(7);
  const countOf = (name: string) => ev7.filter((e) => e.e === name).length;
  const answers = (["hit", "miss", "open", "partial"] as const).map((v) => ev7.filter((e) => e.e === "revisit_answer" && e.method === v).length);
  // money per campaign, followed to Stripe
  const byPiAll = ordersByPaymentIntent();
  const campaignOf = new Map<string, string>();
  for (const e of ev7) if (e.c && !campaignOf.has(e.s)) campaignOf.set(e.s, e.c);
  const channelNet = new Map<string, { n: number; net: number }>();
  for (const t of txnsBetween(week7)) {
    const o = t.payment_intent ? byPiAll.get(t.payment_intent) : undefined;
    if (!o || o.test_flag === 1) continue;
    const c = campaignOf.get(o.session_id.slice(-12)) ?? "—";
    const row = channelNet.get(c) ?? { n: 0, net: 0 };
    row.n += 1; row.net += t.net;
    channelNet.set(c, row);
  }

  const delta = (now: number, before: number) => (before === 0 ? (now > 0 ? "（上周 0）" : "") : `（上周 ${before}，${now >= before ? "+" : ""}${now - before}）`);
  const gate = (v: number, target: number) => (v >= target ? "✓ 达标" : `未达标（目标 ${target}%）`);
  const when = homeDay(Date.now()); // UTC+8

  const lines = [
    `YaoFlow 经营周报 · ${when}`,
    "",
    "【漏斗 · 最近 7 天】",
    // 09-30 (进度表待定 21): people, not tabs — the session count stays beside it
    "口径：独立访客 = 浏览器·天（每个浏览器每天算一次）；会话 = 标签页，约为独立访客的 2 倍；起卦率、点价格率、付费率都 ÷ 独立访客。",
    `独立访客 ${f.visitors} ${delta(f.visitors, pf.visitors)} · 会话 ${f.sessions} · 首访 ${f.firstVisits} / 回访 ${f.returnVisits}${f.bounces ? ` · 秒退会话 ${f.bounces}` : ""}`,
    `开始起卦 ${f.castStart} · 完成起卦 ${f.castComplete} ${delta(f.castComplete, pf.castComplete)}`,
    `点了解读 ${f.readingClick} · 到达支付 ${f.checkoutStart} · 付费 ${f.purchase} ${delta(f.purchase, pf.purchase)}`,
    `起卦率 ${week.rates.activation}% · 点价格率 ${week.rates.priceRate}% · 付费率 ${f.visitors ? Math.round((sold.n / f.visitors) * 1000) / 10 : 0}%（都 ÷ 独立访客）`,
    `Gate 1 激活 ${week.rates.activation}% ${gate(week.rates.activation, 70)}（全窗口；09-30 起分母是独立访客，目标随之从 35% 调到 70%）· 转化 ${convLive}% ${gate(convLive, 2.5)}（只算 ${LIVE_DAY} 真实付款以来：起卦 ${liveOnly.funnel.castComplete} → 真实付费 ${soldLive.n}）`,
    `本周真实付费 ${sold.n} 单${redeemed > 0 ? ` · 另有 ${redeemed} 份是会员用额度换的（交付了，但没进账）` : ""}`,
    // 10-22 进度表 75 ⑦: the north star of the 通卡 model — buyers who come back within 30 days (lib/north-star.ts)
    ...(() => { try { return [northStarLine()]; } catch { return []; } })(),
    // 10-22 进度表 77 回访积压: windows that closed this week, letters that went, and what is still waiting to be asked
    ...(() => { try {
      const b = revisitBacklog();
      return [`回访：本周到期 ${b.dueWeek} · 寄出 ${b.sentWeek} · 积压 ${b.waiting}（${b.emails} 个信箱${b.waitingOver7 ? `，其中超过 7 天 ${b.waitingOver7}` : ""}）`];
    } catch { return []; } })(),
    // 10-22 进度表 80 看自己的回访: set this week per kind, and what came back (set with a report page, a 年书 key-month letter, or a 择日 reminder)
    ...(() => { try {
      const st = selfRevisitStats(Date.now() - 7 * 86_400_000);
      const name: Record<string, string> = { bazi: "八字", ziwei: "紫微", astro: "星盘", nianshu: "年书", zeri: "择日", cast: "六爻免费" };
      const parts = SELF_REVISIT_KINDS.filter((k) => st[k].set || st[k].sent || st[k].answered).map((k) => `${name[k]} 设 ${st[k].set}／寄 ${st[k].sent}／答 ${st[k].answered}`);
      return [parts.length ? `看自己回访：${parts.join(" · ")}` : "看自己回访：本周没有新设的"];
    } catch { return []; } })(),
    // 10-22 进度表 75 ④ (Neil: 每週看一眼，正常人碰到就放寬): the fair-use caps that were hit this week, by kind and by account
    ...(() => { try {
      const rows = _dbForHint().prepare("SELECT detail FROM ops_events WHERE kind = 'cap_hit' AND at >= ?").all(Date.now() - 7 * 86_400_000) as { detail: string | null }[];
      if (!rows.length) return ["每日上限：本周没有人碰到"];
      const byKind = new Map<string, number>(), accounts = new Set<string>();
      for (const r of rows) { const m = /^cust (\d+) (\w+) (\w+)/.exec(r.detail ?? ""); if (!m) continue; accounts.add(m[1]!); const k = `${m[2]}/${m[3]}`; byKind.set(k, (byKind.get(k) ?? 0) + 1); }
      return [`每日上限：本周碰到 ${rows.length} 次（${accounts.size} 个帐号）· ${[...byKind.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(" · ")}（day＝当天数量到顶，rate＝一分钟内太快；正常人碰到就放宽 lib/caps.ts）`];
    } catch { return []; } })(),
    "",
    "【卦会不会兑现 · 客户自报 · 09-21 起累计】", // 10-12 (Neil: 「全部一起统计吧」): one cumulative figure, old and new answers together
    accuracy === null
      ? `还没有人回答回访（已发 ${revisits.sent}，排队 ${revisits.pending}）`
      : `准确率 ${accuracy}%（按解读自己的倾向计分：说中 ${outcomes.hit} · 部分 ${outcomes.partial} · 说错 ${outcomes.miss} · 不算对错 ${outcomes.unclear} · 还在等 ${outcomes.open} · 未答 ${outcomes.unanswered}）`,
    "",
    // 10-13 (Neil: 「解签的数据…全部都补上吧」): the lots, one block
    "【解籤】",
    ...(() => {
      const wk = Date.now() - 7 * 86400_000;
      const q = qianStats(wk);
      const b = qianBreakdown(wk);
      const net = b.money.reduce((a, m) => a + toUsdCents(m.minor - m.refundedMinor, m.currency), 0);
      const p = (a: number, n: number) => (n ? `${Math.round((a / n) * 1000) / 10}%` : "—");
      const sets = b.bySet.slice(0, 4).map((r) => `${QIAN_SETS.find((x) => x.id === r.key)?.short ?? r.key} ${r.draws}`).join("、");
      return [
        `解籤 ${q.draws} 次${sets ? `（${sets}）` : ""} · 接到起卦 ${q.drawsToCast}（${p(q.drawsToCast, q.draws)}，目标 25%）`,
        `个人化解读 付费 ${q.personalPaid} · 通卡 ${q.personalPass} · 会员 ${q.personalMember} · 追问用了 ${q.followups} · 收入 $${(net / 100).toFixed(2)}（扣退款）`,
        // 10-13 进度表 40 ⑥: the lot pages as a search door, all sets and per set
        (() => {
          const f = qianSearchFunnel(events(7), realPaidBrowserSessions(wk));
          const per = f.rows.slice(0, 6).map((r) => `${r.key === "entry" ? "入口页" : QIAN_SETS.find((x) => x.id === r.key)?.short ?? r.key} ${r.landed}`).join("、");
          return `籤页搜索落地 ${f.total.landed}${per ? `（${per}）` : ""} → 看完白话 ${f.total.read} → 起卦 ${f.total.cast} → 付费 ${f.total.paid}`;
        })(),
        // 10-14 进度表 48 ④: the hexagram pages as a search door — per hexagram, beside the lot pages
        (() => {
          const g = guaSearchFunnel(events(7), realPaidBrowserSessions(wk));
          const per = g.rows.slice(0, 8).map((r) => `${r.hex} 卦 ${r.landed}/${r.tapped}/${r.cast}`).join("、");
          return `卦页搜索落地 ${g.total.landed} → 看到「起一卦看應期」${g.total.saw} → 点了 ${g.total.tapped} → 起卦 ${g.total.cast} → 付费 ${g.total.paid}${per ? `（落地/点/起卦：${per}）` : ""}`;
        })(),
      ];
    })(),
    "",
    // 10-14 进度表 50 ⑧: 今日一籤 — daily drawers and whether they come back
    ...(() => { try {
      const q = todayQianStats();
      const ev = events(7).filter((e) => e.e === "today_qian");
      const n = (m: string) => ev.filter((e) => e.method === m).length;
      return ["【今日一籤】",
        `昨天抽籤 ${q.dau} 人（新 ${q.dauNew}）· 近 7 天 ${q.week} 人 · 7 日回访率 ${q.return7.base ? Math.round((100 * q.return7.back) / q.return7.base) : 0}%（${q.return7.back}/${q.return7.base}）`,
        `点「起一卦」${n("cast")} · 日历点击 ${n("cal_click")} · 籤卡新买 ${n("card_buy")}、续买 ${n("card_again")}（在用 ${q.cards}）· 开了每天寄信 ${q.mailOn} 人`, ""];
    } catch { return []; } })(),
    // 10-14 进度表 49 ④: the checkout — how many who opened a payment page paid, and how many left without trying
    ...(() => { try {
      const o = offerStats(Date.now() - 7 * 86_400_000);
      return ["【结账】", ...checkoutDigestLines(), `挽回信（离开 5 分钟后、1 小时内 7 折）：寄出 ${o.sent} · 打开 ${o.opened} · 点去付款 ${o.checkout} · 付成 ${o.paid} · 过期没用 ${o.expired}`, ""];
    } catch { return []; } })(),
    // 10-23 进度表 103: the October announcement — sent, opened, unsubscribed since, replies to support
    ...(() => { try {
      const a = announceStats();
      return a ? ["【10 月更新公告】", `寄出 ${a.sent}${a.failed ? `（失败 ${a.failed}）` : ""} · 打开 ${a.opened}（${a.sent ? Math.round((100 * a.opened) / a.sent) : 0}%）· 之后退订 ${a.unsubs} · 回信 ${a.replies}`, ""] : [];
    } catch { return []; } })(),
    // 10-16 进度表 59: every product opened in the last while, its numbers, and — two weeks on — 「该定去留了」
    ...(() => { try {
      const r = productReviewLines();
      return r.length ? ["【新产品 · 两周定去留】（docs/新产品上线流程.md）", ...r.map((x) => x.line), ""] : [];
    } catch { return []; } })(),
    "【分享与推荐】",
    `分享点击 ${week.sharing.clicks.native + week.sharing.clicks.copy} · 卡片被看 ${week.sharing.cardViewers} · 经分享进来 ${week.sharing.referredSessions} 人，其中起卦 ${week.sharing.referredCasts}、付费 ${week.sharing.referredPurchases}`,
    // 10-13 进度表 41 ⑥
    `分享率 ${week.sharing.shareRate.rate}%（摇完卦 ${week.sharing.shareRate.casters} 人中 ${week.sharing.shareRate.sharers} 人分享；目标 8%）· 按位置：${week.sharing.bySurface.filter((r) => r.base || r.clicks).map((r) => `${SURFACE_LABEL[r.sf as keyof typeof SURFACE_LABEL] ?? r.sf} ${r.rate}%`).join(" · ")}`,
    `分享带来的起卦／付费：${week.byChannel.filter((c) => /^(gua-share|qian-share|ying-share|qian-friend|story|proof)$/.test(c.c)).map((c) => `${c.c} 会话 ${c.sessions} · 起卦 ${c.casts} · 领取/到支付 ${c.claims}`).join("；") || "本周还没有"}`,
    `奖励：已发 ${referrals.granted} · 已领 ${referrals.redeemed} · 过期 ${referrals.expired}`,
    // 10-14 进度表 46 ⑤: 「怎樣算有結果？」 — how often written, and whether the check-ins it shapes come back clearer
    ...(() => {
      const d = _dbForHint();
      const wk = Date.now() - 7 * 86_400_000;
      const casts = (d.prepare("SELECT COUNT(*) AS n, SUM(outcome_hint IS NOT NULL) AS h FROM cast_log WHERE created_at >= ? AND COALESCE(member,0) = 0").get(wk) as { n: number; h: number | null });
      const rows = d.prepare(
        `SELECT r.outcome, r.event, (SELECT 1 FROM cast_log l WHERE l.at = c.cast_at AND l.values_str = replace(c.values_str, ',', '') AND l.outcome_hint IS NOT NULL LIMIT 1) AS hinted
         FROM revisits r JOIN casts c ON c.id = r.cast_id WHERE r.status = 'sent' AND r.sent_at >= ?`,
      ).all(Date.now() - 30 * 86_400_000) as { outcome: string | null; event: string | null; hinted: number | null }[];
      const grp = (h: boolean) => { const g = rows.filter((x) => !!x.hinted === h); const ans = g.filter((x) => x.outcome); const unclear = ans.filter((x) => x.outcome === "unclear" || x.outcome === "open").length; return `${g.length} 封、回 ${ans.length}（${g.length ? Math.round((100 * ans.length) / g.length) : 0}%）、不确定/还没定 ${ans.length ? Math.round((100 * unclear) / ans.length) : 0}%`; };
      return [`「怎樣算有結果」：本周起卦 ${casts.n} 次，填了 ${casts.h ?? 0}（${casts.n ? Math.round((100 * (casts.h ?? 0)) / casts.n) : 0}%，目标 30%）· 近 30 天回访——填了的 ${grp(true)}；没填的 ${grp(false)}`];
    })(),
    // 10-14 进度表 47 ⑤: a friend's first cast through a share — rewards, spent, paid within 30 days; ref share of new casters
    ...(() => {
      const wk = Date.now() - 7 * 86_400_000;
      const r = refRewardStats(wk);
      const ev = events(7);
      const self = ev.filter((e) => e.e === "ref_reward" && e.method === "self").length;
      const newCasters = (_dbForHint().prepare("SELECT COUNT(*) AS n FROM (SELECT bid FROM cast_log GROUP BY bid HAVING MIN(created_at) >= ?)").get(wk) as { n: number }).n;
      const viaRef = r.friends + self;
      return [`推荐回馈（朋友第一卦，双方各一次轻解读）：朋友得 ${r.friends} · 分享人得 ${r.sharers}（超过每月 5 次未发 ${r.capped}）· 自荐挡下 ${self} · 本周领用 ${r.claimed} · 朋友 30 天内付费 ${r.paidAfter} · 经分享人链接来的新起卦者占 ${newCasters ? Math.round((1000 * viaRef) / newCasters) / 10 : 0}%（${viaRef}/${newCasters}，目标 5%）`];
    })(),
    // 10-14 进度表 44 ⑥: the timing timeline — seen by how many, and how many of them put it in a calendar
    ...(() => {
      const ev = events(7);
      const seen = new Set(ev.filter((e) => e.e === "timeline_view").map((e) => e.b ?? e.s)).size;
      const cal = ev.filter((e) => e.e === "timeline_cal");
      const calPeople = new Set(cal.map((e) => e.b ?? e.s)).size;
      return [`应期时间轴：看到 ${seen} 人 · 加入日历 ${calPeople} 人（${seen ? Math.round((1000 * calPeople) / seen) / 10 : 0}%；ics ${cal.filter((e) => e.method === "ics").length} · Google ${cal.filter((e) => e.method === "google").length}）`];
    })(),
    // 09-28 (进度表 14): the public cases as a search door
    ...(() => {
      const c = caseSearchLandings(events(7));
      const pc = caseSearchLandings(events(14));
      const prevWeek = { sessions: pc.sessions - c.sessions, casts: pc.casts - c.casts };
      const eng = Object.entries(c.byEngine).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join("、");
      return [`公开卦例 · 自然搜索落地 ${c.sessions} 人（上周 ${prevWeek.sessions}${eng ? `；${eng}` : ""}）· 落地后起卦 ${c.casts}${c.sessions ? `（${Math.round((100 * c.casts) / c.sessions)}%）` : ""} · 付费 ${c.paid}`];
    })(),
    // 09-28 (进度表 15 ⑤): the proof card — cards ÷ hits, opened, arrived through one, cast
    ...(() => {
      const p = proofFunnel(events(7));
      const hits = outcomes.hit;
      return [`应验卡：本周说中 ${hits} 次 · 卡被打开 ${p.opened}${hits ? `（${Math.round((100 * p.opened) / hits)}% 的应验有人开了卡）` : ""} · 分享 ${p.shared} · 经卡进站 ${p.arrived} 人，其中起卦 ${p.casts}`];
    })(),
    `裂变：K ${week.sharing.k.toFixed(2)}（经分享起卦 ${week.sharing.referredCasts} ÷ 起卦 ${f.castComplete}；目标 W6 ≥ 0.10）· 送一卦 发出 ${week.sharing.giftSent} / 领取 ${week.sharing.giftClaimed} · 邀请免费轻解读 ${week.sharing.inviteFreeLight}`,
    "",
    "【累计】",
    `客户 ${totals.customers} · 复购客户 ${totals.repeatBuyers} · 卦例 ${totals.casts} · 解读 ${totals.readings} · 累计收入 ${revenueByCurrency().map((r) => `${r.currency} ${(r.cents / 100).toFixed(2)}`).join("，") || "0"}（按结算币种，退款与自测已除）`,
    `会员 ${subs.active}（月付 ${subs.monthly} · 年付 ${subs.yearly} · 已设取消 ${subs.canceling}）· MRR ≈ $${(activeSubscriptionAmounts().reduce((a, x) => a + toUsdCents(x.plan === "year" ? Math.round(x.amount_minor / 12) : x.amount_minor, x.currency), 0) / 100).toFixed(2)}（按各自真实币种折美元）`,
    "",
    ...(() => {
      // memberships have no order row, so this reads the Stripe ledger, not orders
      const m = liveMoney(LIVE_SINCE);
      return m.gross === 0
        ? [""]
        : [
            `Stripe 到账：收款 $${(m.sales.gross / 100).toFixed(2)} · 手续费 $${(m.sales.fee / 100).toFixed(2)}${m.disputes.n ? ` · 争议 $${(-m.disputes.net / 100).toFixed(2)}` : ""} · 平台费 $${(-m.platformFees.net / 100).toFixed(2)} · 净入 $${(m.net / 100).toFixed(2)}`,
            // 10-23 进度表 105 ⑤: the one-off charges by what was bought (passes were inside 「解读」)
            `　其中 通卡与单买 $${(m.orders.net / 100).toFixed(2)}（${m.orders.n} 笔${SALE_KEYS.some((k) => m.orderBuckets[k]?.n) ? `：${SALE_KEYS.filter((k) => m.orderBuckets[k]?.n).map((k) => `${SALE_KEY_ZH[k]} ${m.orderBuckets[k]!.n}`).join("、")}` : ""}）· 会员 $${(m.memberships.net / 100).toFixed(2)}（${m.memberships.n} 笔发票）${m.packs.n ? ` · 增购包 $${(m.packs.net / 100).toFixed(2)}（${m.packs.n} 笔）` : ""}· 退款 $${(m.refunds.net / 100).toFixed(2)}（${m.refunds.n} 笔）`,
            "",
          ];
    })(),
    "【按币种 · 最近 7 天】",
    ...(() => {
      const sales = salesByCurrency(Date.now() - 7 * 86400_000);
      const curs = new Set<string>([...week.byCurrency.map((c) => c.cur), ...sales.orders.map((o) => o.currency), ...sales.gifts.map((g) => g.currency)]);
      if (curs.size === 0) return ["还没有带币种的数据"];
      return [...curs].map((cur) => {
        const ev = week.byCurrency.find((c) => c.cur === cur);
        const paid = sales.orders.filter((o) => o.currency === cur);
        const n = paid.reduce((a, o) => a + o.n, 0);
        const first = paid.find((o) => o.tier === "deep")?.first ?? 0;
        const gifts = sales.gifts.filter((g) => g.currency === cur);
        const gn = gifts.reduce((a, g) => a + g.n, 0);
        const gEmails = gifts.reduce((a, g) => a + g.withEmail, 0);
        const mem = sales.members.find((m) => m.currency === cur)?.active ?? 0;
        // 假门（PAYWALL=gift）期间没有"到达支付"，赠送数就是点了价格按钮后领走的数
        const door = gn || ev?.subIntents ? ` · 假门赠送 ${gn}（留邮箱 ${gEmails}）· 点开通 ${ev?.subIntents ?? 0}` : "";
        return `${cur}：起卦 ${ev?.casts ?? 0} · 点深断 ${ev?.clicksDeep ?? 0} · 到达支付 ${ev?.checkout ?? 0} · 付费 ${n}${first ? `（首次价 ${first}）` : ""}${door} · 会员 ${mem}`;
      });
    })(),
    "",
    ...(week.byChannel.some((c) => c.c !== "—")
      ? [
          "【按渠道 · 最近 7 天】（链接里的 ?c= 标记，首触）",
          ...week.byChannel.map((c) => `${c.c}：会话 ${c.sessions} · 起卦 ${c.casts} · 点解读 ${c.clicks} · 领取/到支付 ${c.claims}`),
          "",
        ]
      : []),
    "【退款与争议 · 最近 7 天】",
    ...(() => {
      const r = refundStats(Date.now() - 7 * 86400_000);
      const money = r.refundedCents.map((x) => `${x.currency ?? "?"} ${(x.cents / 100).toFixed(2)}`).join("，");
      const trend = refundSeries(LIVE_SINCE);
      return [
        `退款 ${r.refunds} 笔${money ? `（${money}）` : ""} · 争议进行中 ${r.disputesOpen} · 争议败诉 ${r.disputesLost}`,
        trend.paid > 0
          ? `上线以来：付费订单 ${trend.paid} 笔（会员发票不在其中） · 退款 ${trend.refunded}（${trend.rate.toFixed(1)}%）· 争议 ${trend.disputed}（${trend.disputeRate.toFixed(2)}%，Stripe 红线 1%）`
          : "上线以来还没有真实付款",
      ];
    })(),
    "",
    "【首次价 → 全价】",
    `首次价深断 ${firstFull.firstPriced} 单 · 全价深断 ${firstFull.fullPriced} 单 · 用过首次价后又按全价买深断的 ${firstFull.converted} 人（回头买过任何一档的 ${firstFull.anyRepeat} 人）`,
    `付费客户 ${ltv.payers} 位 · 解读客均 $${(ltv.perPayer / 100).toFixed(2)} · 单均 $${(ltv.perOrder / 100).toFixed(2)}（不含会员）`,
    "",
    "【新玩法 · 最近 7 天】",
    `封卦：发出 ${countOf("seal_sent")} · 有人等揭晓 ${seals.withWatchers} 张 · 订阅 ${seals.watchers} 人（待通知 ${seals.pending}）`,
    `大众一卦：被选 ${countOf("daily_pick")} 次 · 已写 ${dailyCasts.written} 份`,
    `回访：回答 ${answers.reduce((a, b) => a + b, 0)} 次（说中 ${answers[0]} · 部分对上 ${answers[3]} · 没发生 ${answers[1]} · 还在等 ${answers[2]}）· 回礼轻解读 ${rewards.light} 张，用掉 ${rewards.lightUsed}`,
    "",
    ...(channelNet.size > 0
      ? [
          "【渠道带回的钱 · 最近 7 天】",
          ...[...channelNet.entries()].sort((a, b) => b[1].net - a[1].net).map(([c, v]) => `${c}：${v.n} 单 · 到账 $${(v.net / 100).toFixed(2)}`),
          "",
        ]
      : []),
    "【健康】",
    `解读生成失败 7 天 ${ops.genFail7d} 次 · 回访 cron ${ops.lastRevisitRun ? "正常" : "从未运行"} · 履约 cron ${ops.lastFulfillRun ? "正常" : "从未运行"}`,
    `备份：${ops.backup.at ? homeDay(ops.backup.at) : "从未"} · ${ops.backup.offsite === "ok" ? "已出本机" : ops.backup.offsite === "none" ? "⚠ 只在本机这一块盘上" : ops.backup.offsite === "fail" ? "⚠ 异地上传失败" : "⚠ 读不到备份日志"}`,
    timing.n > 0 ? `生成耗时 p50 ${(timing.p50 / 1000).toFixed(1)}s · p95 ${(timing.p95 / 1000).toFixed(1)}s · 最慢 ${(timing.slowest / 1000).toFixed(1)}s（${timing.n} 次）` : "生成耗时：本周还没有记录",
    "",
    `后台：${site}/admin`,
  ];
  const text = lines.join("\n");
  const html = `<pre style="font-family:Georgia,'Songti SC','Noto Serif SC',serif;font-size:14px;line-height:1.8;white-space:pre-wrap;color:#14151c;background:#f4f2ec;padding:24px;">${text.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!))}</pre>`;

  if (dry) return NextResponse.json({ to, text });
  const sent = await sendEmail(to, `YaoFlow 周报 · 独立访客 ${f.visitors} · 付费 ${f.purchase} · 准确率 ${accuracy === null ? "—" : accuracy + "%"}`, html, text, { kind: "digest" });
  recordOps("cron_digest", sent.ok ? "sent" : `failed:${sent.error}`);
  return NextResponse.json({ ok: sent.ok, to, error: sent.error ?? null });
}
