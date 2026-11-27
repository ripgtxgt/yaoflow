import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { markOwnOrdersAsTest } from "@/lib/db";
import { INTERNAL_EMAILS } from "@/lib/internal";
import { refreshFx } from "@/lib/live";
import { homeMinute } from "@/lib/clock";
import { productDetail } from "@/lib/admin-products";
import { productBlocks } from "@/lib/product-detail";
import { SOURCE_ZH, sourceLine } from "@/lib/deliveries";
import { AdminLogin, AdminShell, Legend, Section } from "../../ui";

export const dynamic = "force-dynamic";

/**
 * 10-22 进度表 94 第二批 → 10-23 进度表 106 (Neil: 「我看不到每个产品的详细使用情况和内容」): one product, four blocks —
 * ① 14 days (people, what it handed over by why, money: the same counting as the dashboard since 105), ② its funnel,
 * ③ the latest 50 with the reader's question and their page, ④ its revisits and what came of them. The reader's own
 * words appear only here.
 */

const th = "py-2 pr-3 font-normal text-xs opacity-50 whitespace-nowrap text-left";
const td = "py-1.5 pr-3 whitespace-nowrap align-top tabular-nums";
const SOURCE_TONE: Record<string, string> = { paid: "text-[var(--cinnabar)]", pass: "text-[var(--gold-text)]", member: "text-[var(--gold-text)]", free: "opacity-60" };

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ key?: string; denied?: string; test?: string }> }) {
  const { id } = await params;
  const { key, denied, test } = await searchParams;
  if (!(await isAdmin((await cookies()).get(ADMIN_COOKIE)?.value, key))) return <AdminLogin denied={denied === "1"} back={`/admin/products/${id}`} />;
  markOwnOrdersAsTest(INTERNAL_EMAILS);
  await refreshFx();
  const showTest = test === "1";
  const d = productDetail(id, Date.now(), showTest);
  if (!d) notFound();
  const since = Date.parse(`${d.days[d.days.length - 1]!.day}T00:00:00+08:00`);
  const b = productBlocks(id, since, Date.now(), { test: showTest });
  const first = b?.funnel[0]?.n ?? 0;
  return (
    <AdminShell title={d.def.name}
      nav={[
        { href: `/admin/products${showTest ? "?test=1" : ""}`, label: "← 全部产品" }, { href: "#days", label: "14 天" }, { href: "#funnel", label: "漏斗" },
        { href: "#recent", label: "最近 50 条" }, { href: "#revisits", label: "回访" }, ...(d.def.detail ? [{ href: d.def.detail, label: "原来的明细页 →" }] : []),
      ]}
      right={<a href={`/admin/products/${id}${showTest ? "" : "?test=1"}`} className="opacity-60 underline underline-offset-4">{showTest ? "隐藏自测" : "含自测"}</a>}>
      {d.review && (
        <div className="mb-8 text-sm whitespace-pre-line leading-relaxed">
          <p className={d.review.due ? "text-[var(--cinnabar)]" : ""}>{d.review.line}</p>
        </div>
      )}
      {b && b.stats.length > 0 && (
        <div className="mb-6 text-sm flex flex-col gap-1">
          {b.stats.map((s) => <p key={s.label}><span className="opacity-50 mr-2">{s.label}</span>{s.value}</p>)}
        </div>
      )}

      <Section id="days" title="① 14 天" sub="按日（UTC+8）· 最新在上 · 交付按凭什么给的分，口径同看板（进度表 105）">
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-sm min-w-[44rem]">
            <thead><tr><th className={th}>日期</th><th className={th}>人</th><th className={th}>交付</th><th className={th}>付费</th><th className={th}>收入</th><th className={th}>回访 寄出／答了</th></tr></thead>
            <tbody>
              {d.days.map((x) => (
                <tr key={x.day} className="border-t border-black/5">
                  <td className={td}>{x.day.slice(5)}</td><td className={td}>{x.people || "—"}</td>
                  <td className={td}>{x.delivered ? (x.delivered.total ? <>{x.delivered.total}<span className="opacity-50 text-[11px] ml-2">{sourceLine(x.delivered)}</span></> : "—") : <span className="opacity-30">·</span>}</td>
                  <td className={td}>{x.paid || "—"}{x.passes ? <span className="opacity-50 text-[11px] ml-1">含通卡 {x.passes}</span> : null}</td>
                  <td className={td}>{x.usd ? `$${(x.usd / 100).toFixed(2)}` : "—"}</td><td className={td}>{x.rvSent || x.rvAnswered ? `${x.rvSent} / ${x.rvAnswered}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {b && b.funnel.length > 0 && (
        <Section id="funnel" title="② 漏斗" sub="这 14 天 · 百分比是对第一步">
          <div className="flex flex-col gap-1.5 text-sm max-w-2xl">
            {b.funnel.map((s, i) => (
              <p key={s.label} className="flex justify-between gap-4 border-b border-black/5 py-1">
                <span className="opacity-70">{i > 0 ? "→ " : ""}{s.label}{s.note ? <span className="opacity-50 text-[11px] ml-2">{s.note}</span> : null}</span>
                <span className="tabular-nums">{s.n.toLocaleString()}{i > 0 && first > 0 ? <span className="opacity-40 text-xs ml-2">{Math.round((s.n / first) * 1000) / 10}%</span> : null}</span>
              </p>
            ))}
          </div>
        </Section>
      )}

      <Section id="recent" title="③ 最近 50 条" sub={b?.rowsNote ?? "最新在上 · 问题是读者自己写的，只在后台看，不外传"}>
        {!b || b.rows.length === 0 ? <p className="text-sm opacity-50">{b?.rowsNote ?? "还没有记录。"}</p> : (
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-sm min-w-[60rem]">
              <thead><tr><th className={th}>时间</th><th className={th}>客户</th><th className={th}>凭</th><th className={th}>是什么</th><th className={th}>问的／内容</th><th className={th}>追问</th><th className={th}>回访</th><th className={th}>其他</th></tr></thead>
              <tbody>
                {b.rows.map((r, i) => (
                  <tr key={i} className={`border-t border-black/5 ${r.test ? "opacity-40" : ""}`}>
                    <td className={`${td} opacity-60`}>{homeMinute(r.at)}{r.test ? <span className="ml-1 text-[10px]">测试</span> : null}</td>
                    <td className={td}>{r.customerId ? <a className="underline underline-offset-4" href={`/admin/customers/${r.customerId}`}>#{r.customerId}</a> : <span className="opacity-40">没登录</span>}</td>
                    <td className={`${td} ${r.source ? SOURCE_TONE[r.source] ?? "" : ""}`}>{r.source ? SOURCE_ZH[r.source] : <span className="opacity-30">—</span>}</td>
                    <td className={td}>{r.href ? <a className="underline underline-offset-4" href={r.href} target="_blank" rel="noreferrer">{r.what}</a> : r.what}</td>
                    <td className="py-1.5 pr-3 align-top min-w-[14rem] max-w-[22rem]">{r.summary ?? <span className="opacity-30">—</span>}</td>
                    <td className="py-1.5 pr-3 align-top text-xs opacity-70 max-w-[12rem]">{r.followup ?? ""}</td>
                    <td className="py-1.5 pr-3 align-top text-xs whitespace-nowrap">{r.revisit ?? ""}</td>
                    <td className="py-1.5 pr-3 align-top text-xs opacity-60 max-w-[18rem]">{r.extra ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section id="revisits" title="④ 回访与应验" sub="这 14 天：设的、寄出的、答了的">
        {!b?.revisits ? <p className="text-sm opacity-50">这个产品没有回访。</p> : (
          <div className="text-sm flex flex-col gap-1 max-w-2xl">
            <p className="tabular-nums">设了回访 {b.revisits.set} · 寄出 {b.revisits.sent} · 回答 {b.revisits.answered}</p>
            {b.revisits.answers.length > 0 && <p className="tabular-nums opacity-80">{b.revisits.answers.map((a) => `${a.label} ${a.n}`).join(" · ")}</p>}
            {b.revisits.note && <p className="text-xs opacity-50">{b.revisits.note}</p>}
            <p className="text-xs mt-1"><a className="underline underline-offset-4 opacity-70" href="/admin/revisits">到期回访页 →</a></p>
          </div>
        )}
      </Section>
      <Legend>口径同「产品」页与看板（进度表 105）；{showTest ? "现在含测试账号，测试的行是灰的" : "不含测试账号"}。时间为北京时间（UTC+8）。「凭」= 这一份凭什么给的：付费、通卡、会员（含赠送）、免费。链接打开的是读者自己的页面（解读页、报告页、个人解读页），看完别外传。</Legend>
    </AdminShell>
  );
}
