import { cookies } from "next/headers";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { homeDay } from "@/lib/clock";
import { CLASS_LABEL, checkoutBoard, pct, syncCheckoutAudit, type Dist } from "@/lib/checkout-audit";
import { AdminLogin, AdminShell, Legend, Section, Stat } from "../ui";

export const dynamic = "force-dynamic";

/**
 * 10-14 进度表 49 结账失败原因看板: of the people who opened a payment page, how many paid — and for those who did not,
 * whether the card was declined (A), the bank check was not finished (B), they left without trying (C), something else
 * failed (D), or they paid within a day after all (E). Counts only; a row is named by the tail of its session id.
 * Data: lib/checkout-audit.ts, re-read from Stripe once an hour (read-only), from 09-21 (real money) on.
 */
const th = "py-2 pr-3 font-normal text-xs opacity-50 whitespace-nowrap text-left";
const td = "py-1.5 pr-3 whitespace-nowrap tabular-nums";
const DEVICE: Record<string, string> = { ios: "iPhone/iPad", android: "Android", desktop: "电脑", other: "其他" };
// 10-23 进度表 105 (次要): the chart products' checkouts were shown as raw codes
const TIER: Record<string, string> = {
  deep: "深断", light: "轻解读", qian: "解籤个人解读", pass: "通卡（旧单月）", pass_1d: "1 日通卡", pass_7d: "7 天通卡", pass_30d: "30 天通卡", sub: "月订", sub_year: "年订",
  pack: "增购包", qiancard: "籤卡", tarot: "塔罗个人解读", bazi: "八字报告", ziwei: "紫微报告", astro: "星盘报告", hepan: "合盘", nianshu: "年书", other: "其他",
};

function Table({ rows, label, limit = 12 }: { rows: Dist[]; label?: (k: string) => string; limit?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className={th}></th><th className={th}>打开</th><th className={th}>有尝试</th><th className={th}>付成</th><th className={th}>成功率</th>
            <th className={th}>A 被拒</th><th className={th}>B 验证</th><th className={th}>C 没尝试</th><th className={th}>D 其他</th><th className={th}>E 后来付了</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, limit).map((r) => (
            <tr key={r.key} className="border-t border-black/5">
              <td className={td}>{label ? label(r.key) : r.key}</td>
              <td className={td}>{r.opened}</td>
              <td className={td}>{r.attempted}</td>
              <td className={td}>{r.paid}</td>
              <td className={`${td} font-medium`}>{pct(r.paid, r.opened)}</td>
              <td className={td}>{r.A || ""}</td>
              <td className={td}>{r.B || ""}</td>
              <td className={td}>{r.C ? `${r.C}（${pct(r.C, r.opened)}）` : ""}</td>
              <td className={td}>{r.D || ""}</td>
              <td className={td}>{r.E || ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ key?: string; denied?: string; days?: string; sync?: string; test?: string }> }) {
  const { key, denied, days: daysRaw, sync, test } = await searchParams;
  if (!(await isAdmin((await cookies()).get(ADMIN_COOKIE)?.value, key))) return <AdminLogin denied={denied === "1"} back="/admin/checkout" />;
  let synced: string | null = null;
  if (sync === "1") {
    try { const r = await syncCheckoutAudit({ full: true }); synced = `已从 Stripe 重新读取 ${r.rows} 个结账（自 ${homeDay(r.since)}）`; } catch (e) { synced = `读取失败：${e instanceof Error ? e.message.slice(0, 120) : "?"}`; }
  }
  const days = daysRaw === "7" ? 7 : daysRaw === "live" ? 3650 : 30;
  const b = checkoutBoard(days, Date.now(), test === "1");
  const t = b.total;
  const lost = t.opened - t.paid;
  const href = (d: string) => `/admin/checkout?days=${d}${test === "1" ? "&test=1" : ""}`;
  return (
    <AdminShell
      title="结账"
      nav={[{ href: "#funnel", label: "漏斗" }, { href: "#why", label: "没付成的原因" }, { href: "#cross", label: "交叉" }, { href: "#codes", label: "拒付原因" }, { href: "#methods", label: "付款方式" }, { href: "#recent", label: "最近" }]}
      right={
        <>
          {[["7", "7 天"], ["30", "30 天"], ["live", "上线以来"]].map(([k, l]) => (
            <a key={k} href={href(k!)} className={`px-2 py-1 rounded-[2px] ${(k === "7" && days === 7) || (k === "30" && days === 30) || (k === "live" && days > 60) ? "bg-[var(--ink)] text-[var(--paper)]" : "opacity-60 hover:opacity-100"}`}>{l}</a>
          ))}
        </>
      }
    >
      {synced && <p className="text-sm mb-6">{synced}</p>}
      <Section id="funnel" title="漏斗" sub={`自 ${homeDay(b.since)} · 上次从 Stripe 读取 ${b.lastSync ? homeDay(b.lastSync) + " " + new Date(b.lastSync + 8 * 3_600_000).toISOString().slice(11, 16) : "—"}（每小时一次）`}
        right={<a href="/admin/checkout?sync=1" className="text-xs underline underline-offset-4">现在重读 →</a>}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="打开付款页" value={t.opened} />
          <Stat label="有付款尝试" value={t.attempted} sub={pct(t.attempted, t.opened)} />
          <Stat label="付成" value={t.paid} sub={`结账成功率 ${pct(t.paid, t.opened)}`} good />
          <Stat label="没付成" value={lost} sub={`其中 E 一天内又付成 ${t.E}`} />
        </div>
        <Legend>「打开付款页」= Stripe 结账页，加上页内 Apple Pay / Google Pay 弹窗（各算一次）。还开着、不到 24 小时的不算。我们自己的测试账号不算{test === "1" ? "（现在包含测试）" : ""}。</Legend>
      </Section>

      <Section id="why" title="没付成的原因（A–E）">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {(["A", "B", "C", "D", "E"] as const).map((k) => (
            <Stat key={k} label={CLASS_LABEL[k]} value={t[k]} sub={`占没付成 ${pct(t[k], lost)} · 占打开 ${pct(t[k], t.opened)}`} />
          ))}
        </div>
        <Legend>
          A：付款被发卡行或 Stripe 风控拒绝（含余额不足、交易不被允许、风险过高）。B：3-D Secure 验证开始了没完成。C：页面过期，没有任何付款尝试——看了价格或付款方式就走。
          D：支付宝跳转没完成、处理错误等。E：同一浏览器、信箱或账号 24 小时内另一个结账付成了（算挽回）；其中挽回信寄出过的 {b.eLetters} 个。
          {b.subBlind > 0 && ` 注意：订阅结账过期时 Stripe 不留付款尝试，${b.subBlind} 个订阅结账只能按 C 计（可能有少数其实是被拒）。`}
        </Legend>
      </Section>

      <Section id="cross" title="交叉：币种、地区、设备、浏览器、档位、渠道">
        <h3 className="text-xs opacity-60 mb-2">来源</h3><Table rows={b.bySource} />
        <h3 className="text-xs opacity-60 mt-6 mb-2">币种</h3><Table rows={b.byCurrency} />
        <h3 className="text-xs opacity-60 mt-6 mb-2">地区（下单时的国家）</h3><Table rows={b.byCountry} />
        <h3 className="text-xs opacity-60 mt-6 mb-2">设备</h3><Table rows={b.byDevice} label={(k) => DEVICE[k] ?? k} />
        <h3 className="text-xs opacity-60 mt-6 mb-2">应用内浏览器与否</h3><Table rows={b.byApp} />
        <h3 className="text-xs opacity-60 mt-6 mb-2">档位</h3><Table rows={b.byTier} label={(k) => TIER[k] ?? k} />
        <h3 className="text-xs opacity-60 mt-6 mb-2">首触渠道（c=）</h3><Table rows={b.byChannel} />
        <Legend>设备和浏览器：10-14 起结账时直接记下；之前的从同一浏览器的起卦记录补，补不上的算「未知」。</Legend>
      </Section>

      <Section id="codes" title="拒付／失败原因前 10">
        {b.declines.length ? (
          <table className="text-sm"><tbody>
            {b.declines.map((d) => <tr key={d.code} className="border-t border-black/5"><td className={td}>{d.code}</td><td className={td}>{d.n}</td></tr>)}
          </tbody></table>
        ) : <p className="text-sm opacity-60">这段时间没有。</p>}
        <Legend>Stripe 的原因码：insufficient_funds 余额不足 · do_not_honor 发卡行拒绝不说原因 · transaction_not_allowed 卡不允许这类交易（常见于境外／网购未开通）· highest_risk_level Stripe 风控挡下 · try_again_later 稍后再试 · authentication_required 需要验证。</Legend>
      </Section>

      <Section id="methods" title="付成的付款方式">
        <table className="text-sm"><tbody>
          {b.methods.map((m) => <tr key={m.method} className="border-t border-black/5"><td className={td}>{m.method}</td><td className={td}>{m.n}</td><td className={td}>{pct(m.n, t.paid)}</td></tr>)}
        </tbody></table>
        <Legend>card* = 订阅结账（Stripe 不在会话上给出具体方式）。link = Stripe Link。</Legend>
      </Section>

      <Section id="recent" title="最近没付成的 40 个">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr><th className={th}>时间</th><th className={th}>会话尾号</th><th className={th}>分类</th><th className={th}>原因码</th><th className={th}>币种</th><th className={th}>档位</th><th className={th}>设备</th><th className={th}>来源</th></tr></thead>
            <tbody>
              {b.recent.map((r) => (
                <tr key={r.tail + r.at} className="border-t border-black/5">
                  <td className={td}>{homeDay(r.at).slice(5)} {new Date(r.at + 8 * 3_600_000).toISOString().slice(11, 16)}</td>
                  <td className={td}>…{r.tail}</td>
                  <td className={td}>{CLASS_LABEL[r.cls]}</td>
                  <td className={td}>{r.code ?? ""}</td>
                  <td className={td}>{r.currency ?? ""}</td>
                  <td className={td}>{TIER[r.tier] ?? r.tier}</td>
                  <td className={td}>{r.device ? `${DEVICE[r.device] ?? r.device}${r.app && r.app !== "browser" ? ` · ${r.app}` : ""}` : "—"}</td>
                  <td className={td}>{r.source === "wallet" ? "页内钱包" : "结账页"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Legend>只显示会话尾号，不显示信箱和卡号。</Legend>
      </Section>
    </AdminShell>
  );
}
