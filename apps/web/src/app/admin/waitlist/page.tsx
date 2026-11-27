import { cookies } from "next/headers";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { yearWaitlistStats } from "@/lib/db";
import { AdminLogin, AdminShell, Legend, Section, Stat } from "../ui";

export const dynamic = "force-dynamic";

/** 10-12 「2027 年卦」预约名单 (进度表 §四 38): ≥ 100 before the product is built. Counts only — no addresses on the page. */
const KIND: Record<string, string> = { love: "感情", work: "工作", money: "财", other: "其他" };

export default async function WaitlistPage({ searchParams }: { searchParams: Promise<{ key?: string; denied?: string; sent?: string; failed?: string; skipped?: string }> }) {
  const { key, denied, sent, failed, skipped } = await searchParams;
  if (!(await isAdmin((await cookies()).get(ADMIN_COOKIE)?.value, key))) return <AdminLogin denied={denied === "1"} back="/admin/waitlist" />;
  const s = yearWaitlistStats();
  return (
    <AdminShell title="2027 年卦 · 预约名单" nav={[]}>
      <Section id="total" title="人数" sub="页面 /zh-hant/nian-gua-2027 · 我们自己的测试账号不算 · 每次打开现查">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 max-w-3xl">
          <Stat label="合计" value={s.total} sub={s.total >= 100 ? "过 100，可以开做" : `离 100 还差 ${100 - s.total}`} />
          {Object.keys(KIND).map((k) => <Stat key={k} label={KIND[k]!} value={s.byKind[k] ?? 0} />)}
        </div>
        <Legend>验证用（进度表 §四 38）：预约 ≥ 100 再开发正式产品，12 月中上线。同一信箱只算一次，再填一次只更新类型。</Legend>
      </Section>
      <Section id="via" title="从哪来" sub="链接上的 ?c= 标签">
        {s.byVia.length === 0 ? <p className="text-sm opacity-40">还没有。</p> : (
          <table className="text-sm"><tbody>{s.byVia.map((v) => <tr key={v.via} className="border-t border-black/5"><td className="py-1 pr-6">{v.via || "（无标签）"}</td><td className="tabular-nums">{v.n}</td></tr>)}</tbody></table>
        )}
      </Section>
      {/* 10-22 进度表 38 (Neil: 併入年書): the one letter, sent only from here */}
      <Section id="letter" title="寄那一封：年卦变成了三合一年书" sub="每个信箱只寄一次；11/1 年书开卖后再按。文案在 lib/waitlist-letter.ts（繁體；早鸟 NT$890、原价 1,190、到 1/31；带退订）">
        {sent !== undefined && <p className="text-sm mb-3">已寄 {sent} · 失败 {failed} · 之前寄过跳过 {skipped}</p>}
        <form method="post" action="/api/admin/waitlist-letter" className="flex flex-wrap items-center gap-3">
          <label className="text-sm flex items-center gap-2"><input type="checkbox" name="confirm" value="yes" /> 我看过文案，现在寄给名单上还没收到的人（{s.total} 人）</label>
          <button className="text-sm px-3 py-1.5 rounded-[2px] border border-black/20">寄出</button>
        </form>
        <Legend>没勾确认不会寄。寄过的信箱记在 emails 表（kind waitlist_letter），再按只补没寄到的。</Legend>
      </Section>
      <Section id="day" title="逐日" sub="台北日期">
        {s.byDay.length === 0 ? <p className="text-sm opacity-40">还没有。</p> : (
          <table className="text-sm"><tbody>{s.byDay.map((d) => <tr key={d.day} className="border-t border-black/5"><td className="py-1 pr-6 tabular-nums">{d.day}</td><td className="tabular-nums">{d.n}</td></tr>)}</tbody></table>
        )}
      </Section>
    </AdminShell>
  );
}
