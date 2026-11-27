import { cookies } from "next/headers";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { gaReports, type GaTable } from "@/lib/ga-data";
import { GA_ID, GA_PROPERTY } from "@/lib/ga";
import { toUsdCents } from "@/lib/live";
import { AdminLogin, AdminShell, Legend, Section, Stat } from "../ui";

export const dynamic = "force-dynamic";

/**
 * 10-27 流量来源（Google Analytics）— Neil: 「有效的數據和我們的後台做一下融合」. What only GA knows (channel, source, landing
 * page, country, device, new vs returning) beside what only we know (who paid, for what), on one page. The reports come
 * from lib/ga-data.ts (an hour's cache, refreshed by the hourly cron); purchases reach GA from lib/ga-mp.ts.
 */
const DIM_ZH: Record<string, string> = {
  sessionDefaultChannelGroup: "渠道", sessionSource: "来源", sessionMedium: "媒介", landingPage: "落地页", country: "国家/地区",
  deviceCategory: "设备", eventName: "事件", newVsReturning: "新/回访", date: "日期",
};
const MET_ZH: Record<string, string> = {
  sessions: "工作阶段", activeUsers: "活跃用户", newUsers: "新用户", engagementRate: "互动率", transactions: "付款", purchaseRevenue: "收入",
  eventCount: "次数", totalUsers: "用户", engagedSessions: "有互动的工作阶段", averageSessionDuration: "平均时长", screenPageViews: "浏览量",
};
const fmt = (m: string, v: number) =>
  m === "engagementRate" ? `${Math.round(v * 1000) / 10}%` : m === "purchaseRevenue" ? `$${Math.round(v).toLocaleString()}` : m === "averageSessionDuration" ? `${Math.round(v)}s` : Math.round(v).toLocaleString();

function Table({ t }: { t?: GaTable }) {
  if (!t || !t.rows.length) return <p className="t-small opacity-50">还没有数据。</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <thead><tr className="text-left opacity-50">{t.dims.map((d) => <th key={d} className="py-1 pr-4 font-normal">{DIM_ZH[d] ?? d}</th>)}{t.mets.map((m) => <th key={m} className="py-1 pr-4 font-normal text-right">{MET_ZH[m] ?? m}</th>)}</tr></thead>
        <tbody>
          {t.rows.map((r, i) => (
            <tr key={i} className="border-t border-black/5">
              {r.dims.map((d, j) => <td key={j} className="py-1 pr-4 max-w-[28ch] truncate">{d || "（无）"}</td>)}
              {r.mets.map((v, j) => <td key={j} className="py-1 pr-4 text-right">{fmt(t.mets[j]!, v)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** our own side for the same 28 days: paid orders and money, test accounts out */
function ourSide(days: number) {
  const since = Date.now() - days * 86_400_000;
  let n = 0, usd = 0;
  try {
    for (const r of db().prepare("SELECT amount_cents, currency FROM orders WHERE created_at >= ? AND status = 'paid' AND COALESCE(test_flag,0) = 0 AND (customer_id IS NULL OR customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1))").all(since) as { amount_cents: number | null; currency: string | null }[]) {
      n++; if (r.amount_cents && r.currency) usd += toUsdCents(r.amount_cents, r.currency);
    }
  } catch { /* none */ }
  let sent = 0, failed = 0;
  try {
    sent = (db().prepare("SELECT COUNT(*) AS n FROM ga_sent WHERE kind = 'purchase' AND ok = 1 AND at >= ?").get(since) as { n: number }).n;
    failed = (db().prepare("SELECT COUNT(*) AS n FROM ga_sent WHERE ok = 0").get() as { n: number }).n;
  } catch { /* table not yet */ }
  return { n, usd: Math.round(usd / 100), sent, failed };
}

export default async function TrafficPage({ searchParams }: { searchParams: Promise<{ key?: string; denied?: string; fresh?: string }> }) {
  const { key, denied, fresh } = await searchParams;
  if (!(await isAdmin((await cookies()).get(ADMIN_COOKIE)?.value, key))) return <AdminLogin denied={denied === "1"} back="/admin/traffic" />;
  const rep = await gaReports({ fresh: fresh === "1" });
  const ours = ourSide(28);
  const mpOn = !!process.env.GA_MP_SECRET;
  const t = rep?.tables ?? {};
  const o28 = t.overview28?.totals ?? [], o7 = t.overview7?.totals ?? [], y = t.yesterday?.totals ?? [];
  const usersPerPay = o28[0] && ours.n ? Math.round((ours.n / o28[0]) * 10000) / 100 : null;

  return (
    <AdminShell
      title="流量来源（Google Analytics）"
      nav={[{ href: "#status", label: "连接" }, { href: "#overview", label: "概览" }, { href: "#channels", label: "渠道" }, { href: "#sources", label: "来源" }, { href: "#landing", label: "落地页" }, { href: "#geo", label: "地区与设备" }, { href: "#events", label: "事件" }]}
    >
      <Section id="status" title="连接" sub={`衡量 ID ${GA_ID} · 资源 ${GA_PROPERTY}`}>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span>网站代码：<b>已装</b>（广告功能全关；欧洲经济区/英国/瑞士默认不写 Cookie；问题、信箱、链接里的令牌不送出）</span>
          <span>报表读取：<b>{rep ? (rep.error ? `出错（${rep.error}）` : "已连接") : "未连接"}</b>{rep?.at ? ` · ${new Date(rep.at).toLocaleString("zh-CN", { timeZone: "Asia/Taipei" })} 取的` : ""}{rep ? <> · <a className="underline" href="/admin/traffic?fresh=1">现在重取</a></> : null}</span>
          <span>付款回传：<b>{mpOn ? "已开" : "未开"}</b>{mpOn ? ` · 28 天送出 ${ours.sent} 笔${ours.failed ? `，失败 ${ours.failed}` : ""}` : ""}</span>
        </div>
        <Legend>报表读取需要服务帐号金钥（GA_SA_FILE）；付款回传需要 Measurement Protocol 密钥（GA_MP_SECRET）。两样都在服务器上，不进代码。</Legend>
      </Section>

      {rep && (
        <>
          <Section id="overview" title="概览" sub="GA 看到的人 · 我们自己记的付款（不含测试帐号）">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="活跃用户 · 28 天" value={o28[0] ?? 0} sub={`新用户 ${fmt("newUsers", o28[1] ?? 0)}`} />
              <Stat label="工作阶段 · 28 天" value={o28[2] ?? 0} sub={`有互动 ${o28[2] ? Math.round(((o28[3] ?? 0) / o28[2]) * 100) : 0}% · 平均 ${fmt("averageSessionDuration", o28[4] ?? 0)}`} />
              <Stat label="活跃用户 · 7 天" value={o7[0] ?? 0} sub={`工作阶段 ${fmt("sessions", o7[2] ?? 0)}`} />
              <Stat label="昨天" value={y[0] ?? 0} sub={`新 ${fmt("newUsers", y[1] ?? 0)} · 工作阶段 ${fmt("sessions", y[2] ?? 0)}`} />
              <Stat label="付款 · 28 天（我们记的）" value={ours.n} sub={`约 US$${ours.usd.toLocaleString()}`} />
              <Stat label="付款 · 28 天（GA 收到的）" value={o28[6] ?? 0} sub={`$${Math.round(o28[7] ?? 0).toLocaleString()}（GA 按各自币别折算）`} />
              <Stat label="每百位访客付款" value={usersPerPay ?? "—"} sub="我们的付款 ÷ GA 活跃用户" />
            </div>
            <Legend>两边的付款数应该接近：差的多半是付款回传开通之前的单，或回传失败（上面「连接」一行）。</Legend>
            <div className="mt-4"><Table t={t.daily} /></div>
          </Section>
          <Section id="channels" title="渠道" sub="28 天 · GA 的默认渠道分组；付款与收入来自付款回传"><Table t={t.channels} /></Section>
          <Section id="sources" title="来源 / 媒介" sub="28 天 · 带 ?c= 或 utm 的链接在这里分开"><Table t={t.sources} /></Section>
          <Section id="landing" title="落地页" sub="28 天 · 第一页；读者自己的页面（解读、报告）路径里的令牌折成 :id"><Table t={t.landing} /></Section>
          <Section id="geo" title="地区与设备" sub="28 天">
            <div className="grid md:grid-cols-2 gap-6"><Table t={t.countries} /><div className="flex flex-col gap-6"><Table t={t.devices} /><Table t={t.returning} /></div></div>
          </Section>
          <Section id="events" title="事件" sub="28 天 · 站内动作的名字（和我们自己的统计同名；begin_checkout = 去付款、share = 分享）"><Table t={t.events} /></Section>
        </>
      )}
    </AdminShell>
  );
}
