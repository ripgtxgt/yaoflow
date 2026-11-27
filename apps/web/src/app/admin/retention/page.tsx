import { cookies } from "next/headers";
import { HUMAN_EVENTS } from "@/lib/cloud-ip";
import { isMachineVisit, machineBrowsers } from "@/lib/machine-visit";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { readEvents } from "@/lib/analytics-server";
import { activeDaysByCustomer } from "@/lib/db";
import { cohortTotals, customerCohorts, heavyShare, visitorCohorts, type CohortRow } from "@/lib/retention";
import { homeDay } from "@/lib/clock";
import { AdminLogin, AdminShell, Legend, Section, Stat } from "../ui";

export const dynamic = "force-dynamic";

/** 回访 (09-23, 用户粘性数据分析-0923.md §五): does a reader come back on another day? */

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

function CohortTable({ rows }: { rows: CohortRow[] }) {
  if (rows.length === 0) return <p className="text-sm opacity-50">还没有数据。</p>;
  const cell = (a: number, n: number, ready: boolean) => (
    <td className={`pr-4 ${ready ? "" : "opacity-40"}`}>{pct(a, n)} <span className="opacity-40 text-xs">{a}</span></td>
  );
  return (
    <table className="text-sm w-full max-w-2xl">
      <thead><tr className="text-left text-xs opacity-50"><th className="py-1 font-normal">首次来的日子</th><th className="font-normal">人数</th><th className="font-normal">次日回来</th><th className="font-normal">7 天内回来</th><th className="font-normal">30 天内回来</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.day} className="border-t border-black/5">
            <td className="py-1 pr-4">{r.day}</td>
            <td className="pr-4">{r.n}</td>
            {cell(r.d1, r.n, r.age >= 1)}
            {cell(r.w7, r.n, r.age >= 7)}
            {cell(r.w30, r.n, r.age >= 30)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Totals({ rows }: { rows: CohortRow[] }) {
  const t = cohortTotals(rows);
  return (
    <div className="grid grid-cols-3 gap-3 mb-4 max-w-2xl">
      <Stat label="次日回访率" value={pct(...t.d1)} sub={`${t.d1[0]} / ${t.d1[1]}（满 1 天的组）`} />
      <Stat label="7 日回访率" value={pct(...t.w7)} sub={`${t.w7[0]} / ${t.w7[1]}（满 7 天的组）`} />
      <Stat label="30 日回访率" value={pct(...t.w30)} sub={`${t.w30[0]} / ${t.w30[1]}（满 30 天的组）`} />
    </div>
  );
}

export default async function RetentionPage({ searchParams }: { searchParams: Promise<{ key?: string; denied?: string }> }) {
  const { key, denied } = await searchParams;
  if (!(await isAdmin((await cookies()).get(ADMIN_COOKIE)?.value, key))) return <AdminLogin denied={denied === "1"} back="/admin/retention" />;
  const today = homeDay(Date.now());
  const evs = readEvents(62, { only: ["visit_day", "progress_note", "heat_click", "gift_sent", "gift_open", "gift_claimed", ...HUMAN_EVENTS] }); // 10-15 进度表 60: the kinds this page counts
  // 11-06: link checkers on server-room networks are not visitors here either (lib/machine-visit.ts, as on the overview)
  const machines = machineBrowsers(evs);
  const visitors = visitorCohorts(evs.filter((e) => !(e.e === "visit_day" && isMachineVisit(e, machines))), today).slice(0, 45);
  // 10-23 进度表 105 (次要): every product's days, not only the casts
  const days = activeDaysByCustomer();
  const customers = customerCohorts(days, today).filter((r) => r.day >= "2026-09-01").slice(0, 45);
  const heavy = heavyShare([...days.values()].map((l) => l.length));
  const since7 = Date.now() - 7 * 86_400_000;
  const recent = evs.filter((e) => e.t >= since7);
  const count = (pred: (e: (typeof evs)[number]) => boolean) => recent.filter(pred).length;
  const notes = count((e) => e.e === "progress_note");
  const gateNote = count((e) => e.e === "heat_click" && e.method === "gate-note");
  const subReturn = count((e) => e.e === "heat_click" && e.method === "sub-return");
  // 09-24 R3: 送一卦 end to end — made, opened, cast on, claimed
  const giftMade = count((e) => e.e === "gift_sent");
  const giftOpened = count((e) => e.e === "gift_open" && e.method === "open");
  const giftCast = count((e) => e.e === "gift_open" && e.method === "cast");
  const giftClaimed = count((e) => e.e === "gift_claimed");

  return (
    <AdminShell
      title="留存"
      nav={[{ href: "#visitors", label: "所有访客" }, { href: "#customers", label: "留了邮箱的" }, { href: "#heavy", label: "高频用户" }, { href: "#levers", label: "粘性与送一卦" }, { href: "/admin/revisits", label: "到期回访信 →" }]}
    >
      {/* 10-22 进度表 94 第二批: this page was called 「回访」 and shares the word with the revisit letters — renamed 「留存」 */}
      <p className="text-xs opacity-50 mb-8">留存（这一页的「回访率」）= 某天第一次来的人里，后来又在另一天回来的比例。灰色 = 这一组还没满那么多天，数字还会涨。到期寄出的回访信在「到期回访」页。</p>

      <Section id="visitors" title="所有访客" sub="浏览器只记三个日期（第一次、上一次、今天），没有编号；09-23 起才开始记">
        <Totals rows={visitors} />
        <CohortTable rows={visitors} />
        <Legend>09-23 之前第一次来过的人，回来时没有「第一次」的日期可报，不计入任何一组——所以最初几周的回访数偏低，属正常。</Legend>
      </Section>

      <Section id="customers" title="留了邮箱的客户" sub="按第一次用的日子分组，看后来有没有在另一天再用——起卦、塔罗、解籤、擲筊、命盘问答、报告都算（10-23 起；以前只算起卦），只来看不算">
        <Totals rows={customers} />
        <CohortTable rows={customers} />
      </Section>

      <Section id="heavy" title="高频用户" sub="用过 6 次以上的客户（起卦、塔罗、解籤、擲筊、问盘、报告合计）">
        <div className="grid grid-cols-3 gap-3 max-w-2xl">
          <Stat label="高频用户" value={heavy.heavy} sub={`共 ${heavy.customers} 位客户`} />
          <Stat label="占全部使用" value={`${Math.round(heavy.share * 100)}%`} />
          <Stat label="占客户" value={pct(heavy.heavy, heavy.customers)} />
        </div>
      </Section>

      <Section id="levers" title="粘性功能（近 7 天）" sub="09-23 上线的几样东西有没有人用">
        <div className="grid grid-cols-3 gap-3 max-w-2xl">
          <Stat label="记一笔进展" value={notes} sub="解读页里写下的进展" />
          <Stat label="闸门 → 记进展" value={gateNote} sub="被一事一占拦下后点了「记一笔进展」" />
          <Stat label="第二天的会员提示" value={subReturn} sub="回访那天点了会员入口" />
        </div>
        <div className="grid grid-cols-4 gap-3 max-w-2xl mt-3">
          <Stat label="送一卦 · 生成" value={giftMade} />
          <Stat label="被打开" value={giftOpened} sub="赠送链接被点开（会话数）" />
          <Stat label="打开后起卦" value={giftCast} />
          <Stat label="领取" value={giftClaimed} />
        </div>
        <Legend>应期当天的短信版提醒，打开与点击在看板的邮件表里（类型 dayof）。送一卦四个数从 09-24 起才有「打开 / 起卦」两格。</Legend>
      </Section>
    </AdminShell>
  );
}
