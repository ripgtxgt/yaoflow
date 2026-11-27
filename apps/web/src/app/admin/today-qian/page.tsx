import { cookies } from "next/headers";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { todayQianDays } from "@/lib/content-admin";
import { qianPath } from "@/lib/qian-meta";
import { AdminLogin, AdminShell, Legend, Section } from "../ui";

export const dynamic = "force-dynamic";

/**
 * 10-23 进度表 108 ② 今日一籤: which lot came up each day (Taipei day), for how many, and the most drawn — a day opens
 * every lot of that day. Each reader (an account, or a browser before they log in) draws once a day.
 */
export default async function TodayQianAdminPage({ searchParams }: { searchParams: Promise<{ key?: string; denied?: string; d?: string }> }) {
  const { key, denied, d } = await searchParams;
  if (!(await isAdmin((await cookies()).get(ADMIN_COOKIE)?.value, key))) return <AdminLogin denied={denied === "1"} back="/admin/today-qian" />;
  const days = todayQianDays(30, 5);
  const one = d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? todayQianDays(40, 0).find((x) => x.day === d) ?? null : null;
  const draws = days.reduce((a, x) => a + x.draws, 0);
  return (
    <AdminShell title="今日一籤 · 每天抽到哪支" nav={[{ href: "#days", label: "30 天" }, ...(one ? [{ href: "#day", label: one.day }] : [])]}>
      <Section id="days" title="每天" sub={`近 30 天 ${draws.toLocaleString()} 次 · 台北日期 · 点日期看那天每一支`}>
        {days.length === 0 ? <p className="text-sm opacity-50">还没有。</p> : (
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-sm min-w-[40rem]">
              <thead><tr className="text-xs opacity-50 text-left"><th className="py-1 pr-3 font-normal">日期</th><th className="pr-3 font-normal">抽籤</th><th className="pr-3 font-normal">人</th><th className="pr-3 font-normal">不同的籤</th><th className="font-normal">抽得最多的</th></tr></thead>
              <tbody>
                {days.map((x) => (
                  <tr key={x.day} className={`border-t border-black/5 align-top ${d === x.day ? "bg-[var(--gold)]/[0.08]" : ""}`}>
                    <td className="py-1.5 pr-3 tabular-nums whitespace-nowrap"><a className="underline underline-offset-2" href={`/admin/today-qian?d=${x.day}#day`}>{x.day.slice(5)}</a></td>
                    <td className="pr-3 tabular-nums">{x.draws}</td>
                    <td className="pr-3 tabular-nums">{x.people}</td>
                    <td className="pr-3 tabular-nums">{x.lots}</td>
                    <td className="text-xs">{x.top.map((t) => <a key={`${t.set}:${t.num}`} className="mr-3 underline underline-offset-2 decoration-black/20" href={qianPath(t.num, t.set)} target="_blank" rel="noreferrer">{t.title}（{t.n}）</a>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Legend>每人每天一支（登录的按帐号，没登录的按浏览器），当天再来还是同一支。</Legend>
      </Section>
      {one && (
        <Section id="day" title={one.day} sub={`${one.draws} 次 · ${one.lots} 支不同的籤`}>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {one.top.map((t) => <a key={`${t.set}:${t.num}`} className="underline underline-offset-2 decoration-black/20" href={qianPath(t.num, t.set)} target="_blank" rel="noreferrer">{t.title} <span className="opacity-50 tabular-nums">×{t.n}</span></a>)}
          </div>
          <p className="text-sm mt-3"><a className="underline underline-offset-4" href="/admin/today-qian">收起</a></p>
        </Section>
      )}
    </AdminShell>
  );
}
