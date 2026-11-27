import { cookies } from "next/headers";
import { tierLabelZh } from "@/lib/catalog";
import { SALE_KEYS, saleBucket, type SaleKey } from "@/lib/sale-bucket";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { AdminLogin, AdminShell, Legend, Section, Stat } from "../ui";
import {
  activeSubscriptionAmounts, addCost, costsSeeded, listCosts, markOwnOrdersAsTest, ordersByPaymentIntent, packPaymentIntents,
  providerList, txnsBetween, type CostRow, reconcile, awsCostBetween, awsCostFetchedAt, awsCostDays, feeCreditBalance } from "@/lib/db";
import { INTERNAL_EMAILS } from "@/lib/internal";
import { providerSpend, refreshBooks, refreshProviderBalances } from "@/lib/ledger";
import { AWS_SERVICE_LABEL, refreshAwsCost } from "@/lib/aws-cost";
import { homeDay, homeMinute } from "@/lib/clock";
import { LIVE_SINCE, fxAsOf, refreshFx, toUsdCents } from "@/lib/live";
import { stripeBalanceUsd } from "@/lib/ledger";

export const dynamic = "force-dynamic";

/**
 * 流水 · 成本 · 净利 (09-21, Neil).
 *
 * Revenue is never the sticker price: Managed Payments settles everything into
 * one currency and takes processing, withheld tax and FX out of it, so this
 * page reads the settled figures from each charge's balance transaction.
 * Costs are the rows Neil types in, plus model spend derived from the
 * provider's balance dropping. Profit is what is left.
 */

/** 09-21: one rough rate, only for showing costs entered in yuan. */
const CNY_USD = Number(process.env.FX_CNY_USD) || 0.141;

const usd = (cents: number) => `${cents < 0 ? "−" : ""}$${(Math.abs(cents) / 100).toFixed(2)}`;
const th = "py-1.5 pr-3 font-normal text-xs opacity-50 whitespace-nowrap";
const td = "py-1.5 pr-3 whitespace-nowrap";
const num = "text-right tabular-nums";

/** Months (as a fraction) that a monthly cost was live inside the window. */
function monthsInWindow(c: CostRow, since: number, until: number): number {
  const start = c.started_on ? Date.parse(`${c.started_on}T00:00:00Z`) : since;
  const end = c.ended_on ? Date.parse(`${c.ended_on}T23:59:59Z`) : until;
  const from = Math.max(start, since);
  const to = Math.min(end, until);
  if (!(to > from)) return 0;
  return (to - from) / (30.44 * 86_400_000);
}

const PERIODS = [
  ["live", "上线以来"],
  ["month", "本月"],
  ["last", "上月"],
  ["all", "全部"],
] as const;
type Period = (typeof PERIODS)[number][0];

// 10-22 进度表 55: which sales bucket an orders.tier belongs to — shared with the dashboard since 10-23 (lib/sale-bucket.ts)

export default async function FinancePage(
  { searchParams }: { searchParams: Promise<{ key?: string; denied?: string; p?: string; sync?: string }> },
) {
  const { key, denied, p, sync: syncParam } = await searchParams;
  if (!(await isAdmin((await cookies()).get(ADMIN_COOKIE)?.value, key))) return <AdminLogin denied={denied === "1"} back="/admin/finance" />;
  await refreshFx();
  const fxAt = fxAsOf();

  markOwnOrdersAsTest(INTERNAL_EMAILS);
  // the books come from Stripe's own balance transactions; the per-order figures
  // are a convenience for the customer pages
  // 09-25: a human is looking — refresh now, but do not make them wait the ~1s of Stripe round trips
  // (the page renders from the local ledger, which the 10-minute cron keeps within 30 minutes anyway);
  // ?sync=1 waits for it, for the moment a payment just landed
  const sync = syncParam === "1";
  const refreshing = refreshBooks(true).catch(() => ({ ran: false })).then(() => refreshProviderBalances().catch(() => undefined)).then(() => refreshAwsCost().catch(() => undefined));
  if (sync) await refreshing;
  // 09-26: Stripe's own balance, read live, so the two can be matched on one line
  const liveBalance = await stripeBalanceUsd().catch(() => null);

  // first run: seed what we already know, so the page is not empty
  if (!costsSeeded()) {
    addCost({ kind: "monthly", label: "Resend Pro", amountCents: 2000, currency: "USD", startedOn: "2026-09-21", note: "5 万封/月，超出 $0.90/千封" });
    // 09-27: the server is no longer an estimate — it is read from the AWS bill (lib/aws-cost)
  }

  const period: Period = (PERIODS.some(([k]) => k === p) ? p : "live") as Period;
  const now = Date.now();
  // 10-23 进度表 105 (次要): the months are Taipei months — they were cut at UTC midnight, 8 hours late
  const tpe = new Date(now + 8 * 3_600_000);
  const monthStart = Date.UTC(tpe.getUTCFullYear(), tpe.getUTCMonth(), 1) - 8 * 3_600_000;
  const lastStart = Date.UTC(tpe.getUTCFullYear(), tpe.getUTCMonth() - 1, 1) - 8 * 3_600_000;
  const since = period === "month" ? monthStart : period === "last" ? lastStart : period === "all" ? 0 : LIVE_SINCE;
  const until = period === "last" ? monthStart : now;
  const label = period === "month" ? `本月（${homeDay(monthStart)} 起）`
    : period === "last" ? `上月（${homeDay(lastStart)} → ${homeDay(monthStart)}）`
    : period === "all" ? "全部" : `上线以来（${homeDay(LIVE_SINCE)} 起）`;

  const costs = listCosts();

  /* ---- the books: every balance transaction, classified by what it paid for ---- */
  const txns = txnsBetween(since, until);
  const byPi = ordersByPaymentIntent();
  // 09-29 会员增购包: no order row either, but not a membership invoice
  const packPis = packPaymentIntents();
  type Bucket = { label: string; n: number; amount: number; fee: number; net: number };
  const buckets: Record<string, Bucket> = {
    one: { label: "轻解读", n: 0, amount: 0, fee: 0, net: 0 },
    deep: { label: "深断", n: 0, amount: 0, fee: 0, net: 0 },
    sub: { label: "会员", n: 0, amount: 0, fee: 0, net: 0 },
    pack: { label: "会员增购包", n: 0, amount: 0, fee: 0, net: 0 },
    pass: { label: "通卡", n: 0, amount: 0, fee: 0, net: 0 }, // 10-22 通卡 (orders tier pass_<days>d)
    // 10-22 进度表 55 (the catalog): the lots, tarot and the chart products used to be counted as 轻解读 here
    qian: { label: "解籤（个人解读、籤卡）", n: 0, amount: 0, fee: 0, net: 0 },
    tarot: { label: "塔罗", n: 0, amount: 0, fee: 0, net: 0 },
    mingli: { label: "命理（合盘、年书、报告）", n: 0, amount: 0, fee: 0, net: 0 },
    refund: { label: "退款", n: 0, amount: 0, fee: 0, net: 0 },
    // 09-22: Stripe's own charges to us (type stripe_fee, no payment_intent).
    // They landed in 退款 in this table and in 会员 in the list below — two
    // wrong answers on one page for the same two rows.
    platform: { label: "Stripe 平台费", n: 0, amount: 0, fee: 0, net: 0 },
    // 09-26: a chargeback (type adjustment) is money pulled back plus a $15 fee — it sat in 平台费 and made that $103
    dispute: { label: "争议（拒付）", n: 0, amount: 0, fee: 0, net: 0 },
    // 09-25: payouts are the balance going to the bank — ours already, never a cost (they were 平台费 and cut 到账 by $43)
    payout: { label: "已提现到银行", n: 0, amount: 0, fee: 0, net: 0 },
    other: { label: "其他", n: 0, amount: 0, fee: 0, net: 0 },
    test: { label: "自测（不计入营收）", n: 0, amount: 0, fee: 0, net: 0 },
    // 09-30 (Neil: 「这 500USD 是 stripe 费用抵扣券啊，又不是真的 500USD」): Stripe's fee-credit coupon. The +$500
    // funding line landed in 其他 and lifted 到账 by $500. It is not money: it never reaches the balance or the bank,
    // it only pays Stripe's own fees. Kept on its own line, outside every sum (docs.stripe.com/stripe-fee-credits).
    feecredit: { label: "Stripe 费用抵扣金（不是钱）", n: 0, amount: 0, fee: 0, net: 0 },
  };
  const currencies = new Set<string>();
  let salesTax = 0; // 09-26: withheld sales tax inside the sales fees — goes to governments, not Stripe
  let testSales = 0; // 09-26: our own test charges still count on Stripe's Payments page
  for (const t of txns) {
    currencies.add(t.currency);
    const order = t.payment_intent ? byPi.get(t.payment_intent) : undefined;
    const key = t.balance_type === "fee_credits" || t.type === "fee_credit_funding" ? "feecredit"
      : order?.test_flag === 1 ? "test"
      : t.type === "refund" || t.type === "payment_refund" ? "refund"
      : t.type === "charge" || t.type === "payment"
        ? (order ? saleBucket(order.tier) : t.payment_intent && packPis.has(t.payment_intent) ? "pack" : "sub")   // no order row = a membership invoice, unless it bought a pack
        : t.type.startsWith("payout") ? "payout"
        : t.type === "adjustment" || t.type.startsWith("dispute") ? "dispute"
        : t.amount < 0 ? "platform"
        : "other";
    if (key === "test" && (t.type === "charge" || t.type === "payment")) testSales += t.amount;
    if (SALE_KEYS.includes(key as SaleKey)) salesTax += t.fee_tax ?? 0;
    const b = buckets[key]!;
    b.n += 1; b.amount += t.amount; b.fee += t.fee; b.net += t.net;
  }
  const business = ([...SALE_KEYS, "refund", "dispute", "platform", "other"] as const).map((k) => buckets[k]!).filter((b) => b.n > 0);
  const settled = business.reduce((a, b) => a + b.amount, 0);
  const fee = business.reduce((a, b) => a + b.fee, 0);
  const net = business.reduce((a, b) => a + b.net, 0);
  const paidOut = -buckets.payout!.amount; // positive = left Stripe for the bank
  const unpaid = net - paidOut;             // what Stripe still holds of this window's 到账 (≈ its 可用 + 待处理 balance)
  // 09-25 (Neil: 「Stripe 是收入 350 多，扣除手续费 301 多」): the Dashboard's 付款 tab sums charges only —
  // gross minus per-charge fees. Our 到账 goes on to subtract Stripe's separate daily bills (Managed
  // Payments / Billing usage fees) and refunds. Show the Dashboard's number too so the two can be matched.
  const sum = (f: (b: Bucket) => number) => SALE_KEYS.reduce((a, k) => a + f(buckets[k]!), 0);
  const salesGross = sum((b) => b.amount);
  const salesFee = sum((b) => b.fee);
  const salesNet = salesGross - salesFee;
  const orders = sum((b) => b.n);
  const mixedCurrency = currencies.size > 1;
  // 09-30: the fee-credit coupon — what Stripe granted, what it has paid of our fees so far (all time; Stripe's page is the authority)
  const feeCredit = feeCreditBalance();

  // costs: the typed rows, prorated, plus model spend from the balance drop
  const monthly = costs.filter((c) => c.kind === "monthly");
  const once = costs.filter((c) => c.kind === "once" && c.spent_on && Date.parse(`${c.spent_on}T12:00:00Z`) >= since && Date.parse(`${c.spent_on}T12:00:00Z`) < until);
  // 10-23 进度表 105 (次要): a cost in any currency at today's rate — only CNY was converted, a TWD or JPY cost was taken as dollars
  const toUsd = (cents: number, cur: string) => (cur.toUpperCase() === "USD" ? cents : toUsdCents(cents, cur));
  const monthlyUsd = monthly.reduce((a, c) => a + Math.round(toUsd(c.amount_cents, c.currency) * monthsInWindow(c, since, until)), 0);
  const onceUsd = once.reduce((a, c) => a + toUsd(c.amount_cents, c.currency), 0);

  // 09-27 (Neil: 「按 AWS 的实时账单来算」): every AWS service, per UTC day, from Cost Explorer
  const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  // 09-27 (Neil: 「这个月账单，你得添加从月初到现在的所有费用」): AWS bills the whole month, so a period that begins
  // mid-month (上线以来 starts 09-21) still carries the server from the 1st of that month
  const awsSince = Date.UTC(new Date(since).getUTCFullYear(), new Date(since).getUTCMonth(), 1);
  const awsRows = awsCostBetween(dayOf(awsSince), dayOf(until === now ? now + 86_400_000 : until));
  const awsUsd = Math.round(awsRows.reduce((a, r) => a + r.usd, 0) * 100);
  const awsAt = awsCostFetchedAt();
  const awsSpan = awsCostDays();

  const models = providerList().map((name) => providerSpend(name, since));
  const modelUsd = models.reduce((a, m) => a + Math.round(m.spent * 100 * (m.currency === "CNY" ? CNY_USD : 1)), 0);

  // 会员 MRR in the real currencies, not an assumed $9.99
  const subs = activeSubscriptionAmounts();
  const mrrUsd = subs.reduce((a, s) => a + toUsdCents(s.plan === "year" ? Math.round(s.amount_minor / 12) : s.amount_minor, s.currency), 0);
  const subByCur = Object.entries(
    // 09-22: this summed the amounts and then printed "×N", so two HK$68
    // members read as "HKD 136.00×2". Keep one member's price; N is headcount.
    subs.reduce<Record<string, { n: number; minor: number }>>((a, s) => {
      const k = `${s.currency} ${s.plan === "year" ? "年付" : "月付"}`;
      a[k] = { n: (a[k]?.n ?? 0) + 1, minor: s.amount_minor };
      return a;
    }, {}),
  );

  const costTotal = monthlyUsd + onceUsd + modelUsd + awsUsd;
  const profit = net - costTotal;
  // 09-30 (Neil: 「净利这块是不是得算总共收了多少钱，stripe 抽了多少钱，再是减去我们的成本？」): it always was
  // 收款 − Stripe 的各项 − 成本, but the card showed only the result, and the rate divided by 到账 — after Stripe's cut —
  // which flattered it (89.6%). The rate is over what customers paid; the chain is written on the card.
  const stripeCut = salesFee - buckets.platform!.net;                    // Stripe's own take: per-charge fees (incl. withheld tax) + platform bills
  const givenBack = -(buckets.dispute!.net + buckets.refund!.net);        // money that went back to customers (and dispute fees), not Stripe's
  const margin = salesGross > 0 ? Math.round((profit / salesGross) * 1000) / 10 : null;

  const back = "/admin/finance";
  const href = (extra: Record<string, string>) => `/admin/finance?${new URLSearchParams({ p: period, ...extra }).toString()}`;

  return (
    <AdminShell
      title="流水 · 成本 · 净利"
      nav={[{ href: "#flow", label: "流水" }, { href: "#cost", label: "成本" }, { href: "#add", label: "录入" }]}
      right={
        <>
          {PERIODS.map(([k, t]) => (
            <a key={k} href={href({ p: k })} className={`px-2 py-1 rounded-[2px] ${period === k ? "bg-[var(--ink)] text-[var(--paper)]" : "opacity-60 hover:opacity-100"}`}>{t}</a>
          ))}
        </>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-2">
        <Stat label="到账（扣手续费、争议、平台费与退款）" value={usd(net)} sub={`收款 ${orders} 笔 ${usd(salesGross)} − 手续费 ${usd(salesFee)} = ${usd(salesNet)}（Stripe「付款」页的数）${buckets.dispute!.n ? ` − 争议 ${usd(-buckets.dispute!.net)}` : ""}${buckets.platform!.n ? ` − 平台费 ${usd(-buckets.platform!.net)}` : ""}${buckets.refund!.n ? ` − 退款 ${usd(-buckets.refund!.net)}` : ""}${buckets.payout!.n ? ` · 已提现 ${usd(paidOut)} · Stripe 里还有 ${usd(unpaid)}` : ""} · ${label}`} />
        <Stat label="成本" value={usd(costTotal)} sub={`服务器（AWS 账单）${usd(awsUsd)} · 固定 ${usd(monthlyUsd)}${onceUsd ? ` · 一次性 ${usd(onceUsd)}` : ""} · 模型 ${usd(modelUsd)}`} />
        <Stat
          label="净利"
          value={usd(profit)}
          good={profit >= 0}
          sub={margin === null ? "还没有收款" : `收款 ${usd(salesGross)} − Stripe ${usd(stripeCut)}${givenBack ? ` − 退款争议 ${usd(givenBack)}` : ""} − 成本 ${usd(costTotal)} · 净利率 ${margin}%（÷ 收款）${buckets.sub!.n > 0 ? " · 见下方提醒" : ""}`}
        />
        {/* 09-26 (Neil: 「stripe 的收费好高啊，占 20%？」): the old 21% divided every fee — tax withheld for governments and the
            one dispute fee included — by a 流水 that had the dispute already taken out. Stripe's own take, over what customers paid: */}
        {(() => {
          const stripeTake = salesFee - salesTax - buckets.platform!.net;
          const pctOf = (x: number) => (salesGross > 0 ? `${Math.round((x / salesGross) * 1000) / 10}%` : "—");
          return <Stat label="Stripe 实收费用" value={usd(stripeTake)} sub={`占收款 ${pctOf(stripeTake)}（处理费 + 汇兑 + 平台日账单）· 另：代扣销售税 ${usd(salesTax)}（${pctOf(salesTax)}，交给政府）${buckets.dispute!.n ? ` · 争议费 ${usd(buckets.dispute!.fee)}` : ""}${feeCredit.issued ? ` · 费用抵扣金已抵 ${usd(feeCredit.used)}，还剩 ${usd(feeCredit.left)}` : ""}`} />;
        })()}
      </div>
      <p className="text-xs opacity-50 mb-6">
        数字直接来自 Stripe 的 balance transactions（{txns.length} 条），会员发票、退款留下的手续费都在里面。自测单已剔除（见下表末行），所以比 Stripe 少那几笔。「Stripe 平台费」是 Stripe 每天另开的账单（Managed Payments 附加费、Billing 使用费），Stripe「付款」页不含它，「所有活动」页才有。
        {buckets.sub!.n > 0 && (
          <>
            {" "}
            <b>会员费是预收的</b>：一笔年费在收到的当天全额记进这一期，往后十一个月却还要继续付服务器与模型的钱。
            所以只要这期里有会员进来，这里的「净利率」就会偏高——看趋势要看只含一次性解读的那几行，或者等一个完整的月份。
          </>
        )}
        {mixedCurrency ? " 注意：这一期有多种结算币种，表格按币种分列。" : ""}
      </p>

      {/* ---- 对账 (09-23): the two books, side by side ---- */}
      {(() => {
        const rc = reconcile(LIVE_SINCE);
        const clean = rc.ordersNoTxn.length === 0 && rc.ordersNoPi === 0 && rc.txnsNoOrder.length === 0;
        return (
          <Section id="reconcile" title="跟 Stripe 对账" sub={`切正式以来 · 订单 ${rc.checked.orders} 笔 · Stripe 收款 ${rc.checked.txns} 笔 · ${sync ? "刚从 Stripe 刷新" : "后台正在从 Stripe 刷新，下一次打开即为最新"}`} right={sync ? undefined : <a href={`/admin/finance?p=${period}&sync=1`} className="text-xs underline underline-offset-4 opacity-60 hover:opacity-100">等 Stripe 刷完再看 →</a>}>
            {/* 09-26 (Neil: 「后台的财务数据和 stripe 的相差很大」): the same figures, named the way Stripe's Dashboard names them */}
            <table className="text-sm mb-4">
              <tbody>
                <tr><td className={td}>Stripe「付款」页的总额（成功收款）</td><td className={`${td} ${num}`}>{usd(salesGross + testSales)}</td><td className={`${td} text-xs opacity-50`}>我们的收款 {usd(salesGross)}{testSales ? ` + 自测单 ${usd(testSales)}（已退，不计营收）` : ""}</td></tr>
                <tr><td className={td}>− 每笔手续费</td><td className={`${td} ${num}`}>{usd(-salesFee)}</td><td /></tr>
                {buckets.dispute!.n > 0 && <tr><td className={td}>− 争议（拒付被扣回的钱 + Stripe 争议费）</td><td className={`${td} ${num}`}>{usd(buckets.dispute!.net)}</td><td className={`${td} text-xs opacity-50`}>Stripe「争议」页；赢了会原数退回</td></tr>}
                {buckets.platform!.n > 0 && <tr><td className={td}>− Stripe 平台费（Managed Payments / Billing 日账单）</td><td className={`${td} ${num}`}>{usd(buckets.platform!.net)}</td><td className={`${td} text-xs opacity-50`}>只在 Stripe「余额 → 所有活动」里</td></tr>}
                {buckets.refund!.n > 0 && <tr><td className={td}>− 退款</td><td className={`${td} ${num}`}>{usd(buckets.refund!.net)}</td><td /></tr>}
                <tr className="border-t border-black/10"><td className={td}>= 到账</td><td className={`${td} ${num}`}>{usd(net)}</td><td /></tr>
                {feeCredit.issued > 0 && <tr><td className={`${td} opacity-60`}>（Stripe 费用抵扣金 · 不计入）</td><td className={`${td} ${num} opacity-60`}>{usd(feeCredit.left)}</td><td className={`${td} text-xs opacity-50`}>Stripe 送的 {usd(feeCredit.issued)} 只能抵它自己的手续费，已抵 {usd(feeCredit.used)}；不进余额、不能提现，所以不在到账里，也不在 Stripe「可用 + 待入账」里</td></tr>}
                {buckets.payout!.n > 0 && <tr><td className={td}>− 已提现到银行</td><td className={`${td} ${num}`}>{usd(-paidOut)}</td><td /></tr>}
                <tr className="border-t border-black/10"><td className={td}>= 按我们的账，Stripe 里应有</td><td className={`${td} ${num}`}>{usd(unpaid)}</td><td /></tr>
                <tr><td className={td}>Stripe 余额（实时：可用 + 待入账）</td><td className={`${td} ${num}`}>{liveBalance ? usd(liveBalance.total) : "—"}</td><td className={`${td} text-xs opacity-50`}>{liveBalance ? `可用 ${usd(liveBalance.available)} · 待入账 ${usd(liveBalance.pending)}${period === "all" ? ` · 差 ${usd(liveBalance.total - unpaid)}${buckets.test!.n ? `（自测单净 ${usd(buckets.test!.net)}）` : ""}` : " · 选「全部」时两行才能直接相比"}` : "读不到"}</td></tr>
              </tbody>
            </table>
            {clean ? (
              <p className="text-sm">两边对得上：每一笔付费订单都在 Stripe 流水里，每一笔 Stripe 收款都能对上订单或会员。</p>
            ) : (
              <div className="text-sm flex flex-col gap-2">
                {rc.ordersNoTxn.length > 0 && <p>我们记了付款、Stripe 流水里没有（超过 2 小时）：{rc.ordersNoTxn.map((o) => `${o.session_id.slice(-8)} ${o.currency?.toUpperCase() ?? ""} ${((o.amount_cents ?? 0) / 100).toFixed(2)}`).join(" · ")}</p>}
                {rc.ordersNoPi > 0 && <p>付费订单没有 PaymentIntent（无法退款）：{rc.ordersNoPi} 笔</p>}
                {rc.txnsNoOrder.length > 0 && <p>Stripe 收了钱、对不上订单也不是会员：{rc.txnsNoOrder.map((t) => `${t.id.slice(-8)} ${t.currency} ${(t.amount / 100).toFixed(2)}`).join(" · ")}</p>}
              </div>
            )}
          </Section>
        );
      })()}

      {/* ---- 流水 ---- */}
      <Section id="flow" title="流水" sub={`${label} · Stripe 实际结算 · 自测单另列`}>
        {business.length === 0 ? (
          <p className="text-sm opacity-40">这个区间没有收款。</p>
        ) : (
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-sm min-w-[34rem]">
              <thead>
                <tr className="text-left">
                  <th className={th}>来源</th>
                  <th className={`${th} ${num}`}>笔数</th>
                  <th className={`${th} ${num}`}>流水</th>
                  <th className={`${th} ${num}`}>手续费</th>
                  <th className={`${th} ${num}`}>到账</th>
                </tr>
              </thead>
              <tbody>
                {business.map((b) => (
                  <tr key={b.label} className="border-t border-black/5">
                    <td className={td}>{b.label}</td>
                    <td className={`${td} ${num} opacity-70`}>{b.n}</td>
                    <td className={`${td} ${num} ${b.amount < 0 ? "text-[var(--cinnabar)]" : ""}`}>{usd(b.amount)}</td>
                    <td className={`${td} ${num} opacity-70`}>{b.fee ? usd(-b.fee) : "—"}</td>
                    <td className={`${td} ${num} ${b.net < 0 ? "text-[var(--cinnabar)]" : ""}`}>{usd(b.net)}</td>
                  </tr>
                ))}
                <tr className="border-t border-[var(--ink-45)] font-medium">
                  <td className={td}>合计</td>
                  <td className={`${td} ${num}`}>{business.reduce((a, b) => a + b.n, 0)}</td>
                  <td className={`${td} ${num}`}>{usd(settled)}</td>
                  <td className={`${td} ${num}`}>{usd(-fee)}</td>
                  <td className={`${td} ${num}`}>{usd(net)}</td>
                </tr>
                {buckets.feecredit!.n > 0 && (
                  <tr className="border-t border-black/5 opacity-40">
                    <td className={td}>{buckets.feecredit!.label}</td>
                    <td className={`${td} ${num}`}>{buckets.feecredit!.n}</td>
                    <td className={`${td} ${num}`}>{usd(buckets.feecredit!.amount)}</td>
                    <td className={`${td} ${num}`}></td>
                    <td className={`${td} ${num}`}>不计入</td>
                  </tr>
                )}
                {buckets.test!.n > 0 && (
                  <tr className="border-t border-black/5 opacity-40">
                    <td className={td}>{buckets.test!.label}</td>
                    <td className={`${td} ${num}`}>{buckets.test!.n}</td>
                    <td className={`${td} ${num}`}>{usd(buckets.test!.amount)}</td>
                    <td className={`${td} ${num}`}>{usd(-buckets.test!.fee)}</td>
                    <td className={`${td} ${num}`}>{usd(buckets.test!.net)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {buckets.test!.net !== 0 && (
          <p className="text-xs opacity-50 mt-3">
            自测那一行是我们自己买再退的：退款不退手续费，所以它净亏 {usd(-buckets.test!.net)}，没有计进上面的合计。
          </p>
        )}

        {/* the most recent transactions, so a number can always be traced */}
        {txns.length > 0 && (
          <details className="mt-4 text-xs">
            <summary className="cursor-pointer opacity-60 hover:opacity-100">逐笔（最近 20 条）</summary>
            <div className="overflow-x-auto -mx-4 px-4 mt-3">
              <table className="w-full text-xs min-w-[34rem]">
                <tbody>
                  {txns.slice(0, 20).map((t) => {
                    const o = t.payment_intent ? byPi.get(t.payment_intent) : undefined;
                    return (
                      <tr key={t.id} className="border-t border-black/5">
                        <td className={`${td} tabular-nums opacity-60`}>{homeMinute(t.created)}</td>
                        <td className={td}>
                          {o ? tierLabelZh(o.tier)
                            : t.type === "refund" || t.type === "payment_refund" ? "退款"
                            : (t.type === "charge" || t.type === "payment") && t.payment_intent && packPis.has(t.payment_intent) ? "会员增购包"
                            : t.type === "charge" || t.type === "payment" ? "会员"
                            : t.type.startsWith("payout") ? "提现到银行"
                            : t.balance_type === "fee_credits" || t.type === "fee_credit_funding" ? (t.amount > 0 ? "费用抵扣金到账（不是钱）" : "手续费由抵扣金支付")
                            : "Stripe 平台费"}
                        </td>
                        <td className={`${td} opacity-60`}>{o ? `${(o.currency ?? "").toUpperCase()} ${((o.amount_cents ?? 0) / 100).toFixed(2)}` : ""}</td>
                        <td className={`${td} ${num}`}>{usd(t.amount)}</td>
                        <td className={`${td} ${num} opacity-60`}>{t.fee ? usd(-t.fee) : ""}</td>
                        <td className={`${td} ${num}`}>{usd(t.net)}</td>
                        <td className={`${td} opacity-30`}>{o?.test_flag === 1 ? "自测" : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        )}

        {subs.length > 0 && (
          <p className="text-xs opacity-60 mt-4">
            会员在册 {subs.length} 位 · MRR ≈ {usd(mrrUsd)}（{subByCur.map(([k, v]) => `${k} ${(v.minor / 100).toFixed(2)} × ${v.n} 位`).join(" · ")}）——按每位会员真实的币种与档位折算，不是按美元价假设的。汇率：{fxAt ? `当日牌价（${new Date(fxAt + 8 * 3_600_000).toISOString().slice(5, 16).replace("T", " ")} 取）` : "内置表（取牌价失败）"}。
          </p>
        )}
        <Legend>Managed Payments 以商户身份收款：它把每一笔换成结算币种，并从中扣掉手续费、代收的销售税和汇兑费。例：NT$72.45 → 流水 $2.28、手续费 $0.53、到账 $1.75。会员发票没有订单行，只能从这里看到；退款会把本金退回去但手续费不退。「到账」才是能用来算利润的数。</Legend>
      </Section>

      {/* ---- 成本 ---- */}
      <Section id="cost" title="成本" sub={`${label} · 非美元按当日牌价折美元（模型余额按 1 CNY ≈ ${CNY_USD} USD）`}>
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-sm min-w-[34rem]">
            <thead>
              <tr className="text-left">
                <th className={th}>项目</th>
                <th className={th}>类型</th>
                <th className={`${th} ${num}`}>金额</th>
                <th className={`${th} ${num}`}>本期计入</th>
                <th className={th}>备注</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {monthly.map((c) => {
                const m = monthsInWindow(c, since, until);
                return (
                  <tr key={c.id} className="border-t border-black/5">
                    <td className={td}>{c.label}</td>
                    <td className={`${td} opacity-60`}>每月{c.started_on ? ` · ${c.started_on} 起` : ""}{c.ended_on ? ` · ${c.ended_on} 止` : ""}</td>
                    <td className={`${td} ${num}`}>{c.currency} {(c.amount_cents / 100).toFixed(2)}</td>
                    <td className={`${td} ${num}`}>{usd(Math.round(toUsd(c.amount_cents, c.currency) * m))}<span className="opacity-40 ml-1 text-[11px]">×{m.toFixed(2)}月</span></td>
                    <td className={`${td} opacity-50 text-xs whitespace-normal max-w-[16rem]`}>{c.note ?? ""}</td>
                    <td className={td}>
                      <form method="post" action="/api/admin/cost">
                        <input type="hidden" name="action" value="delete" />
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="key" value={key ?? ""} />
                        <input type="hidden" name="back" value={back} />
                        <button type="submit" className="text-xs opacity-40 hover:opacity-100 hover:text-[var(--cinnabar)]">删</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
              {once.map((c) => (
                <tr key={c.id} className="border-t border-black/5">
                  <td className={td}>{c.label}</td>
                  <td className={`${td} opacity-60`}>一次性 · {c.spent_on}</td>
                  <td className={`${td} ${num}`}>{c.currency} {(c.amount_cents / 100).toFixed(2)}</td>
                  <td className={`${td} ${num}`}>{usd(toUsd(c.amount_cents, c.currency))}</td>
                  <td className={`${td} opacity-50 text-xs whitespace-normal max-w-[16rem]`}>{c.note ?? ""}</td>
                  <td className={td}>
                    <form method="post" action="/api/admin/cost">
                      <input type="hidden" name="action" value="delete" />
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="key" value={key ?? ""} />
                      <input type="hidden" name="back" value={back} />
                      <button type="submit" className="text-xs opacity-40 hover:opacity-100 hover:text-[var(--cinnabar)]">删</button>
                    </form>
                  </td>
                </tr>
              ))}
              {/* 09-27: the server, straight from the AWS bill */}
              <tr className="border-t border-black/5">
                <td className={td}>AWS 服务器（实时账单）</td>
                <td className={`${td} opacity-60`}>按 AWS 账单 · 从 {dayOf(awsSince)} 起{awsAt ? ` · 读于 ${homeMinute(awsAt)}` : " · 还没读到"}{awsSpan.last ? ` · 账单到 ${awsSpan.last}` : ""}</td>
                <td className={`${td} ${num}`}>USD {(awsUsd / 100).toFixed(2)}</td>
                <td className={`${td} ${num}`}>{usd(awsUsd)}</td>
                <td className={`${td} opacity-50 text-xs whitespace-normal max-w-[16rem]`}>
                  {awsRows.length ? awsRows.map((r) => `${AWS_SERVICE_LABEL[r.service] ?? r.service} $${r.usd.toFixed(2)}`).join(" · ") : "本期没有 AWS 费用"}
                  {awsRows.some((r) => r.estimated) ? " · 本月的数在 AWS 月结（次月初）前都是估计数，最近一两天还没记全，之后自动更正" : ""}
                </td>
                <td className={td} />
              </tr>
              {models.map((m) => (
                <tr key={m.provider} className="border-t border-black/5">
                  <td className={td}>{m.provider === "deepseek" ? "DeepSeek（模型）" : m.provider}</td>
                  <td className={`${td} opacity-60`}>按余额差 · {m.readings} 次读数{m.firstAt ? ` · 从 ${homeMinute(m.firstAt)} 起` : ""}</td>
                  <td className={`${td} ${num}`}>{m.currency} {m.spent.toFixed(2)}{m.toppedUp > 0 ? <span className="opacity-40 ml-1 text-[11px]">（另充值 {m.toppedUp.toFixed(2)}）</span> : null}</td>
                  <td className={`${td} ${num}`}>{usd(Math.round(m.spent * 100 * (m.currency === "CNY" ? CNY_USD : 1)))}</td>
                  <td className={`${td} opacity-50 text-xs whitespace-normal max-w-[16rem]`}>
                    {m.readings <= 1 ? "刚开始记账，要两次读数之后才有花费" : `余额还剩 ${m.currency} ${m.latest?.toFixed(2)}`}
                  </td>
                  <td className={td} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Legend>每月项按它在本期内实际存在的天数折算（表里写着 ×几月）。模型花费是从 DeepSeek 余额的下降推出来的——每 6 小时随履约 cron 读一次余额，跌了多少就是花了多少，涨了算充值不计入。<b>第一次读数之前花掉的钱没有基线，永远补不回来</b>，所以本期若早于「从…起」那个时刻，模型这一项必然偏低。硅基流动与方舟没有可用的余额接口，若有消耗请当作一次性成本录入。服务器按 AWS 的实时账单（Cost Explorer，按天、按服务）计入，本期若从月中开始，服务器仍从当月 1 日算起；每 12 小时读一次；AWS 自己每天更新几次：最近一两天还没记全，本月的数在月结（次月初）前都是估计数，之后会自动更正。</Legend>
      </Section>

      {/* ---- 录入 ---- */}
      <Section id="add" title="记一笔成本" sub="每月固定支出，或一次性支出">
        <form method="post" action="/api/admin/cost" className="flex flex-wrap items-end gap-3 text-sm">
          <input type="hidden" name="key" value={key ?? ""} />
          <input type="hidden" name="back" value={back} />
          <label className="flex flex-col gap-1">
            <span className="text-xs opacity-50">类型</span>
            <select name="kind" className="bg-transparent border border-black/20 rounded-[2px] px-2 py-1.5">
              <option value="monthly">每月</option>
              <option value="once">一次性</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs opacity-50">项目</span>
            <input name="label" required placeholder="域名 / 方舟充值 …" className="bg-transparent border border-black/20 rounded-[2px] px-2 py-1.5 w-44" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs opacity-50">金额</span>
            <input name="amount" required inputMode="decimal" placeholder="20" className="bg-transparent border border-black/20 rounded-[2px] px-2 py-1.5 w-24 tabular-nums" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs opacity-50">币种</span>
            <input name="currency" defaultValue="USD" className="bg-transparent border border-black/20 rounded-[2px] px-2 py-1.5 w-20 uppercase" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs opacity-50">起始 / 发生日</span>
            <input name="on" placeholder="2026-09-21" className="bg-transparent border border-black/20 rounded-[2px] px-2 py-1.5 w-32 tabular-nums" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs opacity-50">备注</span>
            <input name="note" className="bg-transparent border border-black/20 rounded-[2px] px-2 py-1.5 w-52" />
          </label>
          <button type="submit" className="px-4 py-2 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-xs tracking-[0.16em]">记下</button>
        </form>
      </Section>
    </AdminShell>
  );
}
