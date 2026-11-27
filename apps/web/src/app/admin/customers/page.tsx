import { cookies } from "next/headers";
import { listCustomers, markOwnOrdersAsTest, membershipRevenue, membershipsByCustomer, moneyByCustomer, revenueByCurrency, stats } from "@/lib/db";
import { INTERNAL_EMAILS } from "@/lib/internal";
import { formatMoney, isCurrency } from "@/lib/money";
import { homeDay, homeMinute } from "@/lib/clock";
import { referralFacts } from "@/lib/admin-referrals";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { AdminLogin, AdminShell, Legend, Stat } from "../ui";

export const dynamic = "force-dynamic";

// 09-21: money is shown in the currency it was paid in — a NT$ and a ¥ never add up as dollars
const fmt = (cur: string, minor: number) => (isCurrency(cur) ? formatMoney(cur, minor, "en") : `${cur} ${(minor / 100).toFixed(2)}`);
const moneyList = (parts: { currency: string; cents: number }[] | undefined) =>
  parts && parts.length ? parts.map((p) => fmt(p.currency, p.cents)).join(" · ") : "—";

const TOPIC_LABEL: Record<string, string> = {
  career: "事业", relationship: "感情", money: "财运",
  health: "健康", study: "学业", decision: "抉择", other: "其他",
};
const PHASE_LABEL: Record<string, string> = {
  wood: "木", fire: "火", earth: "土", metal: "金", water: "水",
};

const th = "py-2 pr-3 font-normal text-xs opacity-50 whitespace-nowrap";
const td = "py-2 pr-3 whitespace-nowrap";

const SORTS = [["recent", "最近"], ["login", "最近在线"], ["spend", "消费"], ["casts", "卦"], ["brought", "推荐"]] as const;
type Sort = (typeof SORTS)[number][0];

export default async function CustomersPage(
  { searchParams }: { searchParams: Promise<{ key?: string; denied?: string; q?: string; sort?: string; ref?: string; test?: string; all?: string }> },
) {
  const { key, denied, q, sort, ref, test, all: allRows } = await searchParams;
  if (!(await isAdmin((await cookies()).get(ADMIN_COOKIE)?.value, key))) return <AdminLogin denied={denied === "1"} back="/admin/customers" />;

  // 09-21: our own addresses are marked first (customers + orders), then everything below counts the rest
  markOwnOrdersAsTest(INTERNAL_EMAILS);
  const s = stats();
  const showTest = test === "1";
  const all = listCustomers(1000).filter((c) => showTest || c.test_flag !== 1);
  const revenue = revenueByCurrency();
  // 09-27 (Neil: 「客户档案订单收入版块也是没有会员订单的统计」)
  const memberRev = membershipRevenue();
  // 09-22: one source for money, orders and memberships alike (moneyByCustomer)
  const money = moneyByCustomer();
  const spendOf = (id: number) => {
    const m = money.get(id);
    if (!m) return "—";
    const parts = [moneyList(m.orders)].filter((x) => x !== "—");
    if (m.membership.n > 0) parts.push(`会员 $${(m.membership.grossCents / 100).toFixed(2)}`);
    // 09-29 会员增购包
    if (m.packs.n > 0) parts.push(`增购 ${m.packs.money.map((p) => fmt(p.currency, p.cents)).join(" · ")}`);
    return parts.join(" + ") || "—";
  };
  // 09-21: membership straight from the local mirror — a hundred rows must not mean a hundred Stripe calls
  const subs = membershipsByCustomer();
  const LIVE = new Set(["active", "trialing", "past_due"]);
  const subLabel = (id: number) => {
    const m = subs.get(id);
    if (!m || !LIVE.has(m.status)) return null;
    // 11-01 (Neil: 通卡和会员一定要区分清楚)
    if (m.sid.startsWith("pass_")) return m.period_end && m.period_end < Date.now() ? null : `通卡 ${m.pass_days ?? 30} 天`;
    if (m.sid.startsWith("comp_")) return "赠送会员";
    return `会员 · ${m.plan === "year" ? "年" : "月"}${m.cancel_at_period_end ? " · 将取消" : m.status === "past_due" ? " · 欠费" : ""}`;
  };
  // 09-18 Neil: the 推荐 column should say how many — people brought in, and readings those people took
  // 09-29: the column now counts only records that name one person (gift claimed, share ref, thank-you
  // earned) — the old share-code count credited everyone who ever threw the same figure
  const facts = referralFacts();
  const broughtOf = (id: number) => {
    const f = facts.get(id);
    return { people: (f?.claimed ?? 0) + (f?.viaRef ?? 0), rewards: f?.rewards ?? 0, gifts: f?.gifts ?? 0 };
  };
  const fmtBrought = (id: number) => {
    const b = broughtOf(id);
    if (!b.people && !b.rewards) return null;
    return `${b.people} 人${b.rewards ? ` · 回礼 ${b.rewards}` : ""}`;
  };

  // 09-18: search / sort / only-referrers — the list outgrew a single scroll
  const query = (q ?? "").trim().toLowerCase();
  const sortBy: Sort = (SORTS.some(([k]) => k === sort) ? sort : "recent") as Sort;
  const onlyRef = ref === "1";
  const matched = all
    .filter((c) => !query || c.email.toLowerCase().includes(query))
    .filter((c) => !onlyRef || fmtBrought(c.id) !== null)
    .sort((a, b) => {
      // 09-22: sort by what actually landed, memberships included — not by the counter
      if (sortBy === "spend") return (money.get(b.id)?.netUsdCents ?? 0) - (money.get(a.id)?.netUsdCents ?? 0) || b.last_seen - a.last_seen;
      if (sortBy === "login") return (b.last_online ?? 0) - (a.last_online ?? 0) || b.last_seen - a.last_seen;
      if (sortBy === "casts") return b.casts - a.casts || b.last_seen - a.last_seen;
      if (sortBy === "brought") { const x = broughtOf(a.id), y = broughtOf(b.id); return y.people - x.people || y.rewards - x.rewards || y.gifts - x.gifts || b.last_seen - a.last_seen; }
      return b.last_seen - a.last_seen;
    });
  // 09-25: the page rendered every customer twice (table + phone cards) — 650 KB a view; 100 rows by default
  const PAGE = 100;
  const showAll = allRows === "1";
  const rows = showAll || query ? matched : matched.slice(0, PAGE);
  const href = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q: query || undefined, sort: sortBy === "recent" ? undefined : sortBy, ref: onlyRef ? "1" : undefined, test: showTest ? "1" : undefined, ...extra };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const qs = p.toString();
    return `/admin/customers${qs ? `?${qs}` : ""}`;
  };

  return (
    <AdminShell title="客户档案" nav={[]}>
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mb-6">
        <Stat label="客户" value={s.customers} sub={s.testCustomers ? `另 ${s.testCustomers} 个自家地址不计` : undefined} />
        <Stat label="卦" value={s.casts} />
        <Stat label="解读" value={s.readings} />
        <Stat label="复购客户" value={s.repeatBuyers} sub="两单以上真实付费" />
        <Stat label="单次购买收入" value={moneyList(revenue)} sub="一次性解读 · 按客户付款币种 · 退款与自测已除" />
        <Stat label="会员收入" value={`US$${(memberRev.grossCents / 100).toFixed(2)}`} sub={`${memberRev.n} 笔 · ${memberRev.people} 人 · 月付、年付与通卡 · Stripe 实扣（按结算币种 USD），到账 US$${(memberRev.netCents / 100).toFixed(2)}`} />
      </div>

      <form method="get" action="/admin/customers" className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="搜邮箱"
          className="bg-transparent border border-black/20 rounded-[2px] px-2.5 py-1.5 text-sm outline-none focus:border-black/60 w-full sm:w-64"
        />
        {sortBy !== "recent" && <input type="hidden" name="sort" value={sortBy} />}
        {onlyRef && <input type="hidden" name="ref" value="1" />}
        {showTest && <input type="hidden" name="test" value="1" />}
        <span className="flex items-baseline gap-1">
          <span className="opacity-40 mr-1">排序</span>
          {SORTS.map(([k, label]) => (
            <a key={k} href={href({ sort: k === "recent" ? undefined : k })} className={`px-2 py-1 rounded-[2px] ${sortBy === k ? "bg-[var(--ink)] text-[var(--paper)]" : "opacity-60 hover:opacity-100"}`}>{label}</a>
          ))}
        </span>
        <a href={href({ ref: onlyRef ? undefined : "1" })} className={`px-2 py-1 rounded-[2px] border ${onlyRef ? "border-[var(--gold)] text-[var(--gold-text)]" : "border-black/15 opacity-60 hover:opacity-100"}`}>只看推荐过人的</a>
        {s.testCustomers > 0 && <a href={href({ test: showTest ? undefined : "1" })} className="opacity-40 hover:opacity-100 underline underline-offset-4">{showTest ? "隐藏自家地址" : "含自家地址"}</a>}
        <span className="opacity-40 tabular-nums">{matched.length === all.length ? `${all.length} 位` : `${matched.length} / ${all.length} 位`}</span>
        {matched.length > rows.length && <a href={href({ all: "1" })} className="opacity-60 hover:opacity-100 underline underline-offset-4">显示全部 {matched.length} 位</a>}
      </form>

      {all.length === 0 ? (
        <p className="text-sm opacity-40">还没有客户。第一份留了邮箱的解读之后这里会出现档案。</p>
      ) : rows.length === 0 ? (
        <p className="text-sm opacity-40">没有符合的。<a className="underline underline-offset-4 ml-1" href="/admin/customers">清掉筛选</a></p>
      ) : (
        <>
          {/* desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className={th}>邮箱</th>
                  <th className={`${th} text-right`}>消费</th>
                  <th className={`${th} text-right`}>单</th>
                  <th className={th}>会员／通卡</th>
                  <th className={`${th} text-right`}>卦</th>
                  <th className={th}>关注</th>
                  <th className={th}>五行</th>
                  <th className={th}>语言</th>
                  <th className={th}>最近</th>
                  <th className={th}>最近在线</th>
                  <th className={th}>推荐来的人</th>
                  <th className={th}>通知</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-t border-black/5">
                    <td className={td}><a href={`/admin/customers/${c.id}`} className="underline underline-offset-4 decoration-black/25 hover:decoration-current">{c.email}</a>{c.test_flag === 1 && <span className="ml-1 rounded-[2px] border border-current px-1 text-[10px] opacity-60">自己</span>}</td>
                    <td className={`${td} text-right tabular-nums`}>{spendOf(c.id)}</td>
                    <td className={`${td} text-right tabular-nums opacity-70`}>{c.paid_orders}{c.paid_orders > 1 ? <span className="text-[var(--gold-text)] ml-1 text-[11px]">复购</span> : null}</td>
                    <td className={`${td} opacity-70`}>{subLabel(c.id) ?? ""}</td>
                    <td className={`${td} text-right tabular-nums opacity-70`}>{c.casts}</td>
                    <td className={`${td} opacity-70`}>{(c.topics ?? "").split(",").filter(Boolean).map((t) => TOPIC_LABEL[t] ?? t).join(" · ") || "—"}</td>
                    <td className={`${td} opacity-70`}>{(c.phases ?? "").split(",").filter(Boolean).map((p) => PHASE_LABEL[p] ?? p).join("") || "—"}</td>
                    <td className={`${td} opacity-50`}>{c.locale ?? "—"}</td>
                    <td className={`${td} opacity-50 tabular-nums`}>{homeDay(c.last_seen)}</td>
                    <td className={`${td} opacity-50 tabular-nums`}>{c.last_online ? homeMinute(c.last_online) : <span className="opacity-40">—</span>}</td>
                    <td className={`${td} tabular-nums`}>{fmtBrought(c.id) ?? <span className="opacity-30">—</span>}</td>
                    <td className={`${td} opacity-70`}>{c.marketing_ok ? "✓ 愿收" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* phone cards */}
          <div className="md:hidden space-y-2">
            {rows.map((c) => (
              <a key={c.id} href={`/admin/customers/${c.id}`} className="block rounded-[2px] border border-black/10 p-3 text-xs">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm truncate">{c.email}{c.test_flag === 1 ? " · 自己" : ""}</span>
                  <span className="tabular-nums opacity-60 whitespace-nowrap">{homeDay(c.last_seen)}</span>
                </div>
                <div className="mt-1 opacity-70 flex flex-wrap gap-x-3 gap-y-0.5 tabular-nums">
                  <span>卦 {c.casts}</span>
                  <span>单 {c.paid_orders}{c.paid_orders > 1 ? "（复购）" : ""}</span>
                  {subLabel(c.id) && <span>{subLabel(c.id)}</span>}
                  {money.has(c.id) && <span>消费 {spendOf(c.id)}</span>}
                  <span>{(c.topics ?? "").split(",").filter(Boolean).map((t) => TOPIC_LABEL[t] ?? t).join("·") || "—"}</span>
                  <span>{c.locale ?? ""}</span>
                  {c.marketing_ok ? <span>愿收通知</span> : null}
                  <span>登录 {c.last_login_at ? homeMinute(c.last_login_at) : "—"}</span>
                </div>
                {fmtBrought(c.id) && <div className="mt-1 text-[var(--gold-text)]">推荐来 {fmtBrought(c.id)}</div>}
              </a>
            ))}
          </div>
          <Legend>推荐来的人 = 能认出是 TA 带来的人：朋友领取了 TA 的送卦链接，或者新人经 TA 的分享链接（带个人推荐码，09-29 起）领了首份免费；回礼 = TA 因此得到的深断（含 09-29 补发）。只按卦码相同算的旧数字不再计入，客户页里以灰字另列。通知 = 领取或登录时勾了「告诉我正式上线和新功能」。最近 = 最后一次有动静（起卦、付款、领取等）；最后登录 = 最后一次点登录链接进账号（台北时间），— 表示从没登录过；09-29 之前的登录只能从还没过期的会话和用过的登录链接里补回，可能偏早。</Legend>
        </>
      )}
    </AdminShell>
  );
}
