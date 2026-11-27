import { cookies } from "next/headers";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { discountLine, PROMO_PRODUCT_ZH, PROMO_PRODUCTS, productsOf, promoLink, promoReports, sourceReport } from "@/lib/promos";
import { CURRENCIES } from "@/lib/money";
import { homeMinute } from "@/lib/clock";
import { tierLabelZh } from "@/lib/catalog";
import { AdminLogin, AdminShell, Legend, Section } from "../ui";

export const dynamic = "force-dynamic";

/**
 * 10-23 进度表 109 ① 优惠码与活动连结: make a promo (a Stripe coupon + which products, when, how many), hand out its link,
 * and see what each source brought — paid orders by the tag the buyer arrived with. Our own test accounts left out.
 */
const LANDINGS: { path: string; label: string }[] = [
  { path: "/", label: "首页" }, { path: "/services", label: "全部服务" }, { path: "/account?want=pass#membership", label: "买通卡（帐号页）" },
  { path: "/cast", label: "起卦" }, { path: "/tarot", label: "塔罗" }, { path: "/jieqian", label: "解籤" }, { path: "/nianshu", label: "年书" }, { path: "/hepan", label: "合盘" },
];
const PERIODS = [{ id: "7", label: "7 天", days: 7 }, { id: "30", label: "30 天", days: 30 }, { id: "90", label: "90 天", days: 90 }];
const money = (cur: string, minor: number) => `${cur} ${cur === "JPY" || cur === "KRW" ? minor.toLocaleString() : (minor / 100).toFixed(2)}`;

export default async function PromosPage({ searchParams }: { searchParams: Promise<{ key?: string; denied?: string; done?: string; failed?: string; p?: string; l?: string; lp?: string }> }) {
  const sp = await searchParams;
  if (!(await isAdmin((await cookies()).get(ADMIN_COOKIE)?.value, sp.key))) return <AdminLogin denied={sp.denied === "1"} back="/admin/promos" />;
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  const locale = sp.l === "zh" ? "zh" : "zh-hant";
  const landing = LANDINGS.find((x) => x.path === sp.lp) ?? LANDINGS[2]!;
  const period = PERIODS.find((x) => x.id === sp.p) ?? PERIODS[1]!;
  const now = Date.now();
  const reports = await promoReports(true);
  const sources = sourceReport(now - period.days * 86_400_000, now);
  const input = "bg-transparent border border-black/20 rounded-[2px] px-2 py-1.5";
  const chip = (h: string, label: string, on: boolean) => <a key={h} href={h} className={`shrink-0 px-2.5 py-1 rounded-full border ${on ? "border-black/60" : "border-black/10 opacity-70 hover:opacity-100"}`}>{label}</a>;
  const q = (x: Record<string, string>) => `/admin/promos?${new URLSearchParams({ p: period.id, l: locale, lp: landing.path, ...x }).toString()}`;
  return (
    <AdminShell title="优惠码与活动连结" nav={[{ href: "#list", label: "优惠码" }, { href: "#new", label: "建一个" }, { href: "#sources", label: "按来源" }]}>
      {sp.done && <p className="text-sm mb-6 text-emerald-700">{sp.done}</p>}
      {sp.failed && <p className="text-sm mb-6 text-[var(--cinnabar)]">{sp.failed}</p>}

      <Section id="list" title="优惠码" sub="结账套用的次数按我们的订单算；Stripe 那栏是 Stripe 自己记的使用次数（会员只有这一栏）">
        <div className="flex flex-wrap gap-1 text-xs mb-3">
          <span className="opacity-50 mr-1">连结落在：</span>{LANDINGS.map((x) => chip(q({ lp: x.path }), x.label, x.path === landing.path))}
          <span className="opacity-50 mx-1">语言：</span>{chip(q({ l: "zh-hant" }), "繁体", locale === "zh-hant")}{chip(q({ l: "zh" }), "简体", locale === "zh")}
        </div>
        {reports.length === 0 ? <p className="text-sm opacity-50">还没有。</p> : (
          <div className="space-y-3">
            {reports.map(({ promo: p, checkouts, paid, byCurrency, stripeRedeemed, stripeValid }) => {
              const link = promoLink(site, locale, landing.path, p.campaign, p.code);
              const ended = p.ends_at != null && p.ends_at <= now;
              return (
                <div key={p.id} className={`border border-black/10 rounded-[2px] p-3 text-sm ${p.status !== "active" || ended ? "opacity-60" : ""}`}>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-mono text-base">{p.code}</span>
                    <span>{discountLine(p)}</span>
                    <span className="text-xs opacity-60">{productsOf(p).map((x) => PROMO_PRODUCT_ZH[x]).join("、")}</span>
                    <span className={`text-xs ${p.status === "active" && !ended ? "text-emerald-700" : "text-[var(--cinnabar)]"}`}>{p.status !== "active" ? "停用" : ended ? "已结束" : p.starts_at && p.starts_at > now ? "还没开始" : "可用"}</span>
                  </div>
                  <p className="text-xs opacity-60 mt-1">
                    {p.starts_at ? `${homeMinute(p.starts_at)} 起` : "现在起"} · {p.ends_at ? `${homeMinute(p.ends_at)} 止` : "不设结束"} · {p.max_uses ? `最多 ${p.max_uses} 次` : "次数不限"}{p.campaign ? ` · 来源标签 ${p.campaign}` : ""} · 建于 {homeMinute(p.created_at)}{p.reason ? `（${p.reason}）` : ""}
                  </p>
                  <p className="text-xs mt-1">结账带上它 {checkouts} 次 · 付了 {paid} 笔{Object.keys(byCurrency).length ? `（${Object.entries(byCurrency).map(([c, v]) => money(c, v)).join(" · ")}）` : ""} · Stripe 记的使用 {stripeRedeemed ?? "—"}{stripeValid === false ? "（Stripe 说已失效）" : ""}</p>
                  <p className="text-xs mt-1 break-all"><span className="opacity-50">活动连结（{landing.label}）：</span><span className="font-mono">{link}</span></p>
                  <details className="mt-1 text-xs">
                    <summary className="cursor-pointer underline underline-offset-2 opacity-60">{p.status === "active" ? "停用" : "重新打开"}</summary>
                    <form method="post" action="/api/admin/promos" className="mt-1 flex flex-wrap items-center gap-2">
                      <input type="hidden" name="op" value={p.status === "active" ? "off" : "on"} /><input type="hidden" name="id" value={p.id} />
                      <input name="reason" required minLength={2} placeholder="理由（进操作记录）" className={input} />
                      <label className="flex items-center gap-1.5"><input type="checkbox" name="confirm" value="yes" required /> 确认</label>
                      <button className="px-2 py-1 rounded-[2px] border border-black/30">{p.status === "active" ? "停用" : "打开"}</button>
                    </form>
                  </details>
                </div>
              );
            })}
          </div>
        )}
        <Legend>读者点活动连结进站，优惠码在这个浏览器里记 7 天；结账时如果这张码能用在他买的东西上，Stripe 付款页和收据上会直接扣掉。不叠加：第一张 1 日通卡本来就是首张价，不再套码；开会员时已经有抵扣（之前买过的单次或手上的通卡折抵首月）的，用抵扣不用码。Apple Pay／Google Pay 直付页带不了优惠，有码的读者会转到 Stripe 付款页。停用只影响以后的结账。</Legend>
      </Section>

      <Section id="new" title="建一个优惠码" sub="会在 Stripe 建一张优惠券（不动钱）；钱只在读者付款时少收">
        <form method="post" action="/api/admin/promos" className="space-y-3 max-w-3xl text-sm">
          <input type="hidden" name="op" value="create" />
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1"><span className="text-xs opacity-50">优惠码（英文字母、数字、- _）</span><input name="code" required pattern="[A-Za-z0-9][A-Za-z0-9_-]{2,23}" placeholder="例：NOV20" className={`${input} font-mono uppercase w-40`} /></label>
            <label className="flex flex-col gap-1"><span className="text-xs opacity-50">怎么折</span>
              <select name="kind" className={input}><option value="percent">打折（%）</option><option value="amount">减金额</option></select>
            </label>
            <label className="flex flex-col gap-1"><span className="text-xs opacity-50">多少（% 或金额）</span><input name="value" required inputMode="decimal" placeholder="20 或 50" className={`${input} w-28`} /></label>
            <label className="flex flex-col gap-1"><span className="text-xs opacity-50">币别（减金额才要）</span>
              <select name="currency" className={input}><option value="">—</option>{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            </label>
          </div>
          <fieldset className="flex flex-wrap gap-3">
            <legend className="text-xs opacity-50 mb-1">能用在（至少一种）</legend>
            {PROMO_PRODUCTS.map((x) => <label key={x} className="flex items-center gap-1.5"><input type="checkbox" name="products" value={x} defaultChecked={x.startsWith("pass_")} /> {PROMO_PRODUCT_ZH[x]}</label>)}
          </fieldset>
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1"><span className="text-xs opacity-50">开始（北京时间，空着＝现在）</span><input name="starts" type="datetime-local" className={input} /></label>
            <label className="flex flex-col gap-1"><span className="text-xs opacity-50">结束（北京时间，空着＝不设）</span><input name="ends" type="datetime-local" className={input} /></label>
            <label className="flex flex-col gap-1"><span className="text-xs opacity-50">最多用几次（空着＝不限）</span><input name="max_uses" type="number" min={1} className={`${input} w-28`} /></label>
            <label className="flex flex-col gap-1"><span className="text-xs opacity-50">来源标签（?c=，小写，≤16 字）</span><input name="campaign" pattern="[a-z0-9_-]{1,16}" placeholder="例：ig-1101" className={`${input} w-40`} /></label>
          </div>
          <label className="flex flex-col gap-1"><span className="text-xs opacity-50">备注（只在后台）</span><input name="note" className={input} /></label>
          <label className="flex flex-col gap-1"><span className="text-xs opacity-50">为什么建（进操作记录）</span><input name="reason" required minLength={2} className={input} /></label>
          <label className="flex items-center gap-2"><input type="checkbox" name="confirm" value="yes" required /> 我确认要在 Stripe 建这张优惠券</label>
          <button className="px-4 py-2 rounded-[2px] bg-[var(--ink)] text-[var(--paper)]">建</button>
        </form>
        <Legend>打折：1%–90%；减金额：只在那个币别的结账用得上。会员只折第一期。用词照规矩：不写「準」「AI」「靈驗」，活动文案不承诺结果。</Legend>
      </Section>

      <Section id="sources" title="按来源" sub={`近 ${period.label} 付费的单（通卡、单买；会员没有订单，不在这里）· 来源＝读者进站带的 ?c=，没带的按来路猜（~开头）`}>
        <div className="flex flex-wrap gap-1 text-xs mb-3">{PERIODS.map((x) => chip(q({ p: x.id }) + "#sources", x.label, x.id === period.id))}</div>
        {sources.length === 0 ? <p className="text-sm opacity-50">这段时间没有。</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[40rem]">
              <thead><tr className="text-xs opacity-50 text-left"><th className="py-1 pr-3 font-normal">来源</th><th className="pr-3 font-normal text-right">单</th><th className="pr-3 font-normal text-right">人</th><th className="pr-3 font-normal">收入</th><th className="font-normal">买了什么</th></tr></thead>
              <tbody>
                {sources.map((r) => (
                  <tr key={r.tag} className="border-t border-black/5 align-top">
                    <td className="py-1.5 pr-3 font-mono text-xs">{r.tag}</td>
                    <td className="pr-3 text-right tabular-nums">{r.orders}</td>
                    <td className="pr-3 text-right tabular-nums">{r.customers}</td>
                    <td className="pr-3 text-xs">{Object.entries(r.byCurrency).map(([c, v]) => money(c, v)).join(" · ")}</td>
                    <td className="text-xs opacity-70">{Object.entries(r.byTier).map(([t, n]) => `${tierLabelZh(t)} ${n}`).join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </AdminShell>
  );
}
