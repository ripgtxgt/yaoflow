import { cookies } from "next/headers";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { ANON_STEP_ZH, anonReturners, type AnonStep } from "@/lib/people";
import { homeDay, homeMinute } from "@/lib/clock";
import { AdminLogin, AdminShell, Legend, Section, Stat } from "../../ui";

export const dynamic = "force-dynamic";

/**
 * 10-24 没登录的回头客 (Neil: 「除了我们有邮箱记录的，所有的浏览器……这个数据有吗？」→「要」): browsers that came on two days
 * or more and never signed in, paid or became a member — what they used, what they asked last, where they stopped.
 */
const STEPS: AnonStep[] = ["checkout", "price", "teaser", "cast", "tools", "browse"];
const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "—");

export default async function AnonReturnersPage({ searchParams }: { searchParams: Promise<{ key?: string; denied?: string; days?: string; s?: string }> }) {
  const { key, denied, days, s } = await searchParams;
  if (!(await isAdmin((await cookies()).get(ADMIN_COOKIE)?.value, key))) return <AdminLogin denied={denied === "1"} back="/admin/people/anon" />;
  const d = Math.min(30, Math.max(1, Number(days) || 7));
  const only = STEPS.includes(s as AnonStep) ? (s as AnonStep) : null;
  const { rows: all, total, steps } = anonReturners(Date.now() - d * 86_400_000, 1000);
  const list = (only ? all.filter((r) => r.step === only) : all).slice(0, 300);
  const q = (o: { days?: number; s?: string | null }) => {
    const p = new URLSearchParams({ days: String(o.days ?? d) });
    const st = o.s === undefined ? only : o.s;
    if (st) p.set("s", st);
    return `/admin/people/anon?${p}`;
  };
  const used = (r: (typeof all)[number]) => [
    r.casts ? `六爻 ${r.casts}` : "", r.tarot ? `塔罗 ${r.tarot}` : "", r.jiaobei ? `擲筊 ${r.jiaobei}` : "", r.qiuqian ? `求籤 ${r.qiuqian}` : "", r.qa ? `问答 ${r.qa}` : "",
  ].filter(Boolean).join(" · ");

  return (
    <AdminShell title="没登录的回头客" nav={[{ href: "/admin/people", label: "← 按人看" }, { href: "#steps", label: "卡在哪一步" }, { href: "#list", label: "名单" }]}>
      <p className="text-xs opacity-50 mb-8">来过 2 天以上、从没登录、没付过钱、不是会员的浏览器。我们只知道浏览器，没有邮箱，联系不上；同一个人换手机或清了 cookie 会算成另一个。</p>

      <Section id="steps" title="卡在哪一步" sub={`最近 ${d} 天来过的 · 共 ${total} 个浏览器`}
        right={<>{[3, 7, 14, 30].map((n) => <a key={n} href={q({ days: n })} className={n === d ? "underline underline-offset-4" : "opacity-50 hover:opacity-100"}>{n} 天</a>)}</>}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {STEPS.map((k) => (
            <a key={k} href={q({ s: only === k ? null : k })} className={`block ${only === k ? "ring-1 ring-current rounded-[2px]" : ""}`}>
              <Stat label={ANON_STEP_ZH[k]} value={steps[k]} sub={pct(steps[k], total)} />
            </a>
          ))}
        </div>
        <Legend>按每个浏览器走到的最远一步算：去付款（打开了付款页）＞ 点价格 ＞ 看到六爻免费那一句 ＞ 起了卦 ＞ 只用擲筊、求籤、塔罗抽牌、命盘问答（10-24 前不用登录）＞ 只看页面。点一格只看那一种，再点一次取消。</Legend>
      </Section>

      <Section id="list" title="名单" sub={`${only ? `只看「${ANON_STEP_ZH[only]}」 · ` : ""}${list.length} 个${list.length === 300 ? "（最新的 300 个）" : ""}`}>
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="text-sm w-full min-w-[900px]">
            <thead><tr className="text-left text-xs opacity-50"><th className="py-1 font-normal">浏览器</th><th className="font-normal">第一次来</th><th className="font-normal">来了几天</th><th className="font-normal">用过</th><th className="font-normal">卡在</th><th className="font-normal">最近问的</th><th className="font-normal">最近一次来</th><th /></tr></thead>
            <tbody>{list.map((r) => (
              <tr key={r.bid} className="border-t border-black/5 align-top">
                <td className="py-1.5 whitespace-nowrap opacity-60">{r.bid.slice(0, 6)}</td>
                <td className="whitespace-nowrap">{r.first_day ?? homeDay(r.first_at)}<span className="opacity-50 text-xs ml-1">{r.first_c ?? r.first_ref ?? ""}</span></td>
                <td className="tabular-nums">{r.days}</td>
                <td className="text-xs">{used(r) || <span className="opacity-30">—</span>}</td>
                <td className="text-xs whitespace-nowrap">{ANON_STEP_ZH[r.step]}</td>
                <td className="max-w-[18rem]">{r.lastQ ? <span className="block truncate" title={r.lastQ}>{r.lastQ}</span> : <span className="opacity-30">—</span>}</td>
                <td className="whitespace-nowrap text-xs opacity-60">{homeMinute(r.last_at).slice(5)}</td>
                <td><a className="text-xs underline underline-offset-2" href={`/admin/people/${r.bid}`}>轨迹 →</a></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <Legend>「第一次来」旁边是第一次带进来的渠道或来源网站。「用过」是这个浏览器从编号上线（{homeDay(Date.parse("2026-10-03T00:00:00+08:00"))}）起的累计次数。「最近问的」是在任何产品里最后打的那个问题（六爻里健康、性、犯罪类的只记类别）；问题是读者的私密数据，不要外传。时间是 UTC+8。</Legend>
      </Section>
    </AdminShell>
  );
}
