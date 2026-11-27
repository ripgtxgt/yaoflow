import { cookies } from "next/headers";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { markOwnOrdersAsTest, revisitAnswerRate, revisitBacklog, revisitStateTable } from "@/lib/db";
import { INTERNAL_EMAILS } from "@/lib/internal";
import { homeDay, homeMinute } from "@/lib/clock";
import { revisitBoard, revisitRows, RV_PRODUCT, RV_PRODUCT_PAGE } from "@/lib/admin-revisits";
import { timingCalibration, TIMING_129_AT } from "@/lib/admin-timing-calib";
import { AdminLogin, AdminShell, Legend, Section, Stat } from "../ui";

export const dynamic = "force-dynamic";

/**
 * 10-22 进度表 94 第二批 「到期回访」 (Neil: 「我们的后台要怎么改呢？」→「好，可以的」): the letters that ask 「那件事後來怎樣了」,
 * per product — until now the backlog was only in the weekly report, and the page called 「回访」 was the return rate
 * (renamed 「留存」). By channel once LINE／WhatsApp exist; email only for now. A product's line opens its revisits.
 */

const th = "py-2 pr-3 font-normal text-xs opacity-50 whitespace-nowrap text-left";
const td = "py-2 pr-3 whitespace-nowrap align-top tabular-nums";
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "—");
const STATUS: Record<string, string> = { pending: "待寄", sent: "已寄", skipped: "跳过（太晚了）", failed: "寄失败" };
const OUTCOME: Record<string, string> = { hit: "发生了", partial: "部分对上", miss: "没发生", open: "还在等", unclear: "说不准", happened: "发生了", nothing: "没发生", stirred: "有动静", offwindow: "发生了，但不在那几天" };

/** 11-05 进度表 135: 状态 × 行动 × 结果 (30 days, counts only) and the answer rate around the day the two questions came in */
const STATE_ZH: Record<string, string> = { smooth: "顺", tight: "有点紧", pressure: "压力大", breaking: "快撑不住", "—": "没答" };
const ACTED_ZH: Record<string, string> = { done: "做了", some: "做了一部分", not: "没做", no_plan: "没写打算", "—": "没答" };
const Q135_AT = Date.UTC(2026, 10, 4, 16); // 11-05 00:00 台北
function StateTable({ now }: { now: number }) {
  const rows = revisitStateTable(now - 30 * 86_400_000);
  const before = revisitAnswerRate(Q135_AT - 14 * 86_400_000, Q135_AT);
  const after = revisitAnswerRate(Q135_AT, now);
  const total = rows.reduce((a, r) => a + r.n, 0);
  return (
    <div className="mt-8">
      <h3 className="text-sm font-sans opacity-70 mb-2">状态 × 行动 × 结果（30 天内回答的，只看数字）</h3>
      <p className="text-xs opacity-60 mb-3">回答率：加题前两周 {pct(before.answered, before.due)}（{before.answered}/{before.due}）· 加题后 {pct(after.answered, after.due)}（{after.answered}/{after.due}），其中答了状态题 {after.withState} 条</p>
      {total === 0 ? <p className="text-sm opacity-50">还没有。</p> : (
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-sm min-w-[32rem]">
            <thead><tr><th className={th}>状态</th><th className={th}>上次打算的</th><th className={th}>结果</th><th className={th}>条数</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-black/5">
                  <td className={td}>{STATE_ZH[r.state] ?? r.state}</td><td className={td}>{ACTED_ZH[r.acted] ?? r.acted}</td>
                  <td className={td}>{OUTCOME[r.outcome] ?? r.outcome}</td><td className={td}>{r.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default async function RevisitsPage({ searchParams }: { searchParams: Promise<{ key?: string; denied?: string; test?: string; p?: string; cal?: string }> }) {
  const { key, denied, test, p, cal } = await searchParams;
  if (!(await isAdmin((await cookies()).get(ADMIN_COOKIE)?.value, key))) return <AdminLogin denied={denied === "1"} back="/admin/revisits" />;
  markOwnOrdersAsTest(INTERNAL_EMAILS);
  const now = Date.now();
  const showTest = test === "1";
  const b = revisitBoard(now, showTest);
  const bl = revisitBacklog(now);
  const sum = (k: keyof (typeof b.rows)[number]) => b.rows.reduce((a, r) => a + (typeof r[k] === "number" ? (r[k] as number) : 0), 0);
  const q = (extra: Record<string, string | null>) => {
    const u = new URLSearchParams();
    if (showTest) u.set("test", "1");
    if (p) u.set("p", p);
    for (const [k, v] of Object.entries(extra)) { if (v == null) u.delete(k); else u.set(k, v); }
    const s = u.toString();
    return `/admin/revisits${s ? `?${s}` : ""}`;
  };
  const detail = p && RV_PRODUCT[p] ? revisitRows(p, showTest) : null;
  // 10-31 进度表 129 ⑤: 应期校准表 — all answered 六爻 revisits, or only readings cast under the 129 rules
  const calNew = cal === "new";
  const calib = timingCalibration({ since: calNew ? TIMING_129_AT : 0, test: showTest });
  return (
    <AdminShell
      title="到期回访"
      nav={[{ href: "#products", label: "按产品" }, { href: "#calib", label: "应期校准" }, ...(detail ? [{ href: "#rows", label: `${RV_PRODUCT[p!]}的明细` }] : []), { href: "/admin/retention", label: "留存 →" }, { href: "/admin/outcomes", label: "应验记录 →" }]}
      right={<a href={q({ test: showTest ? null : "1" })} className="opacity-60 underline underline-offset-4">{showTest ? "隐藏自测" : "含自测"}</a>}
    >
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-10">
        <Stat label="今天到期" value={sum("dueToday")} sub={homeDay(now)} />
        <Stat label="今天寄出" value={sum("sentToday")} sub={`7 天 ${sum("sent7")} 条`} />
        <Stat label="积压（到期没寄）" value={sum("waiting")} sub={`超过 7 天的 ${sum("waitingOver7")} · 涉及 ${bl.emails} 个信箱`} good={sum("waitingOver7") === 0} />
        <Stat label="满 14 天跳过" value={sum("skipped7")} sub="近 7 天 · 太晚了，不再问" good={sum("skipped7") === 0} />
        <Stat label="合并成一封" value={b.merged7} sub={`近 7 天回访信 ${b.letters7} 封，其中 ${b.merged7} 封一次装了 ${b.mergedItems7} 条`} />
      </div>
      <Section id="products" title="按产品" sub="今天、7 天、积压，和 30 天的回答率 · 点一行看这个产品的回访">
        {b.rows.length === 0 ? <p className="text-sm opacity-50">还没有回访。</p> : (
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-sm min-w-[52rem]">
              <thead>
                <tr>
                  <th className={th}>产品</th><th className={th}>今天到期</th><th className={th}>今天寄出</th><th className={th}>7 天寄出</th>
                  <th className={th}>积压</th><th className={th}>积压超 7 天</th><th className={th}>7 天跳过</th><th className={th}>30 天回答率</th>
                </tr>
              </thead>
              <tbody>
                {b.rows.map((r) => (
                  <tr key={r.key} className={`border-t border-black/5 ${p === r.key ? "bg-[var(--gold)]/[0.08]" : ""}`}>
                    <td className={`${td} font-sans`}>
                      <a className="underline underline-offset-4" href={`${q({ p: r.key })}#rows`}>{r.name}</a>
                      {RV_PRODUCT_PAGE[r.key] ? <a className="ml-2 text-[11px] opacity-50 underline underline-offset-2" href={`/admin/products/${RV_PRODUCT_PAGE[r.key]}`}>产品 →</a> : null}
                    </td>
                    <td className={td}>{r.dueToday || "—"}</td>
                    <td className={td}>{r.sentToday || "—"}</td>
                    <td className={td}>{r.sent7 || "—"}</td>
                    <td className={`${td} ${r.waiting ? "" : "opacity-40"}`}>{r.waiting || "—"}</td>
                    <td className={`${td} ${r.waitingOver7 ? "text-[var(--cinnabar)]" : "opacity-40"}`}>{r.waitingOver7 || "—"}</td>
                    <td className={`${td} ${r.skipped7 ? "text-[var(--cinnabar)]" : "opacity-40"}`}>{r.skipped7 || "—"}</td>
                    <td className={td}>{r.sent30 ? `${pct(r.answered30, r.sent30)}（${r.answered30}/${r.sent30}）` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <StateTable now={now} />
        <Legend>每天 09:10（北京时间）寄一次：同一个信箱当天到期的几条合成一封（77），每人每天最多一封；到期超过 14 天还没寄出的不再问，记「跳过」。积压 = 已经到期、还没寄的。回答率 = 30 天内寄出的回访里，已经回答的比例（点了信里的按钮或在页面上答）。塔罗的回访记在塔罗自己的表里，规则相同。只有邮件一种通道；LINE／WhatsApp 上线后再按通道分。{showTest ? "现在含测试账号。" : "不含测试账号。"}</Legend>
      </Section>
      <Section id="calib" title="应期校准（六爻）" sub={`已回答的六爻回访 · 按题型 × 联络/复合 × 卦的倾向 × 应期宽度 · ${calNew ? "只看 129 新规则之后起的卦" : "全部"} · 每周看一次`}>
        <p className="text-xs opacity-60 mb-3">
          <a href={q({ cal: calNew ? null : "new" })} className="underline underline-offset-4">{calNew ? "看全部" : "只看 129 之后"}</a>
          {" · "}「窗内发生」= 在卦给的日子里发生；「窗外发生」= 回访里点了「发生了，但不在那几天」（{calib.offDates} 条留了大概日期）。倾向「会」的行，窗内发生率越低越该查；倾向「不会」的行，没发生是对的。
        </p>
        {calib.rows.length === 0 ? <p className="text-sm opacity-50">还没有回答。</p> : (
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-sm min-w-[56rem]">
              <thead>
                <tr>
                  <th className={th}>题型</th><th className={th}>联络/复合</th><th className={th}>倾向</th><th className={th}>应期宽度</th><th className={th}>回答</th>
                  <th className={th}>窗内发生</th><th className={th}>窗外发生</th><th className={th}>有动静</th><th className={th}>没发生</th><th className={th}>还在等</th><th className={th}>窗内发生率</th><th className={th}>发生率（含窗外）</th>
                </tr>
              </thead>
              <tbody>
                {[...calib.rows, calib.total].map((r, i) => {
                  const settled = r.n - r.open;
                  return (
                    <tr key={i} className={`border-t border-[var(--ink-16,#ddd)] ${r === calib.total ? "font-medium" : ""}`}>
                      <td className={td}>{r.topic}</td><td className={td}>{r === calib.total ? "" : r.contact ? "是" : "—"}</td><td className={td}>{r.lean}</td><td className={td}>{r.width}</td>
                      <td className={td}>{r.n}</td><td className={td}>{r.happened}</td><td className={td}>{r.offwindow}</td><td className={td}>{r.stirred}</td><td className={td}>{r.nothing}</td><td className={td}>{r.open}</td>
                      <td className={td}>{pct(r.happened, settled)}</td><td className={td}>{pct(r.happened + r.offwindow, settled)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      {detail && (
        <Section id="rows" title={`${RV_PRODUCT[p!]}的回访`} sub={`最近 ${detail.length} 条 · 到期没寄的排在前面`}>
          {detail.length === 0 ? <p className="text-sm opacity-50">没有。</p> : (
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-sm min-w-[44rem]">
                <thead><tr><th className={th}>客户</th><th className={th}>到期</th><th className={th}>状态</th><th className={th}>寄出</th><th className={th}>回答</th><th className={th}>问的是</th></tr></thead>
                <tbody>
                  {detail.map((r) => (
                    <tr key={r.id} className="border-t border-black/5">
                      <td className={td}>{r.customerId ? <a className="underline underline-offset-4" href={`/admin/customers/${r.customerId}`}>#{r.customerId}</a> : <span className="opacity-40">没登录</span>}</td>
                      <td className={`${td} ${r.status === "pending" && r.due <= now ? "text-[var(--cinnabar)]" : ""}`}>{homeDay(r.due).slice(5)}</td>
                      <td className={td}>{STATUS[r.status] ?? r.status}</td>
                      <td className={`${td} opacity-70`}>{r.sentAt ? homeMinute(r.sentAt).slice(5) : "—"}</td>
                      <td className={td}>{r.outcome ? OUTCOME[r.outcome] ?? r.outcome : <span className="opacity-30">—</span>}</td>
                      <td className="py-2 pr-3 align-top text-xs opacity-60">{r.label ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-sm mt-3"><a className="underline underline-offset-4" href={q({ p: null })}>收起</a></p>
        </Section>
      )}
    </AdminShell>
  );
}
