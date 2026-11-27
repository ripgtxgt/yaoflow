import { cookies } from "next/headers";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { audience } from "@/lib/admin-audience";
import { homeDay } from "@/lib/clock";
import { AdminLogin, AdminShell, Legend, Section } from "../ui";

export const dynamic = "force-dynamic";

/**
 * 10-31 进度表 130 ③ 受众画像 (Neil: 「后期我投放广告的时候需要用」): paying readers beside heavy non-payers and everyone,
 * dimension by dimension, as shares of people — the columns to read when setting an ad audience by hand.
 */
const pct = (x: number) => `${Math.round(x * 100)}%`;

export default async function AudiencePage({ searchParams }: { searchParams: Promise<{ key?: string; denied?: string; d?: string }> }) {
  const { key, denied, d } = await searchParams;
  if (!(await isAdmin((await cookies()).get(ADMIN_COOKIE)?.value, key))) return <AdminLogin denied={denied === "1"} back="/admin/audience" />;
  const days = d === "30" ? 30 : d === "180" ? 180 : 60;
  const { groups, since } = audience(days);
  const dims = [...new Set(groups.flatMap((g) => Object.keys(g.dims)))];
  return (
    <AdminShell title="受众画像" nav={[30, 60, 180].map((n) => ({ href: `/admin/audience?d=${n}`, label: `${n} 天${n === days ? " ✓" : ""}` }))}>
      <p className="text-sm opacity-70 mb-6">从 {homeDay(since)} 起起过卦的人（会员时段的卦、自测帐号不算）：付过钱的人和「问了很多卦却没付」的人分别长什么样。投放时照「付费读者」那一栏挑地区、设备、App、年龄、时段和题材；和「全部」差得越多的格子，越值得单独设受众。每一格是「人」的占比（「几点起卦」按卦算）。</p>
      <div className="grid grid-cols-3 gap-3 mb-8 text-sm">
        {groups.map((g) => (
          <div key={g.name} className="border border-black/10 p-3"><p className="text-xs opacity-50">{g.name}</p><p className="text-2xl tabular-nums">{g.people}</p><p className="text-xs opacity-50">人 · {g.casts} 卦</p></div>
        ))}
      </div>
      {dims.map((dim) => (
        <Section key={dim} id={dim} title={dim}>
          <div className="grid md:grid-cols-3 gap-6">
            {groups.map((g) => {
              const x = g.dims[dim];
              return (
                <div key={g.name}>
                  <p className="text-xs opacity-50 mb-1">{g.name}{x ? `（${x.base} ${dim.includes("按卦") ? "卦" : "人"}）` : ""}</p>
                  {!x ? <p className="text-sm opacity-40">没有数据</p> : (
                    <ul className="text-sm space-y-0.5">{x.rows.map((r) => (
                      <li key={r.k} className="flex items-center gap-2">
                        <span className="w-28 shrink-0 truncate" title={r.k}>{r.k}</span>
                        <span className="flex-1 h-2 bg-black/5"><span className="block h-2 bg-[var(--gold,#b8963e)]/70" style={{ width: pct(r.n) }} /></span>
                        <span className="w-10 text-right tabular-nums text-xs">{pct(r.n)}</span>
                      </li>
                    ))}</ul>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      ))}
      <Legend>国家／城市／型号从 10-31 起才记（Cloudflare 判定的 IP 所在地；城市要在 Cloudflare 开「访客位置标头」才有）；在那之前用「时区」和「语言」看地区。年龄、性别只来自读者自己存的「自己」那份生辰档案，样本小。只在后台看，不上传给任何广告平台。</Legend>
    </AdminShell>
  );
}
