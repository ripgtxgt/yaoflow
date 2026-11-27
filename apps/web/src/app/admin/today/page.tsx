import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { todayBoard } from "@/lib/today-board";
import { DELIVERY_PRODUCTS, DELIVERY_ZH, sourceLine } from "@/lib/deliveries";
import { homeDay, homeMinute } from "@/lib/clock";
import { AdminLogin, AdminShell, Legend, Section, Stat } from "../ui";
import { funnel131 } from "@/lib/ops-checks";
import { swr } from "@/lib/swr";

export const dynamic = "force-dynamic";

/**
 * 10-23 进度表 108 ③ 「今天」: the day so far (北京时间 00:00 on) and what needs a hand — every box opens the page where
 * it is dealt with. Same counting as the overview (进度表 105). Everything else stays on 看板.
 */
const ago = (ms: number, now: number) => {
  const h = Math.floor((now - ms) / 3_600_000);
  return h < 1 ? "不到 1 小时" : h < 48 ? `${h} 小时` : `${Math.floor(h / 24)} 天`;
};
const TONE = { bad: "border-[var(--cinnabar)]/50 bg-[var(--cinnabar)]/[0.04]", watch: "border-amber-500/40 bg-amber-500/[0.04]", ok: "border-black/10" } as const;
const DOT = { bad: "text-[var(--cinnabar)]", watch: "text-amber-700", ok: "text-emerald-700" } as const;

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ key?: string; denied?: string }> }) {
  const { key, denied } = await searchParams;
  if (!(await isAdmin((await cookies()).get(ADMIN_COOKIE)?.value, key))) return <AdminLogin denied={denied === "1"} back="/admin/today" />;
  const now = Date.now();
  const b = todayBoard(now);
  const c = b.charges, y = b.chargesYesterday;
  const kinds = [
    c.passes.d1 ? `1 日通卡 ${c.passes.d1}` : null, c.passes.d7 ? `7 天通卡 ${c.passes.d7}` : null, c.passes.d30 ? `30 天通卡 ${c.passes.d30}` : null,
    c.members ? `会员 ${c.members}` : null, c.singles ? `单买 ${c.singles}` : null, c.packs ? `增购包 ${c.packs}` : null,
  ].filter(Boolean).join(" · ") || "还没有";
  const topProducts = DELIVERY_PRODUCTS.map((p) => ({ p, n: b.deliveries.byProduct[p].total })).filter((x) => x.n > 0).sort((a, z) => z.n - a.n).slice(0, 4);
  const bad = b.alerts.filter((a) => a.level !== "ok");
  const Box = ({ href, children }: { href: string; children: ReactNode }) => <a href={href} className="block hover:opacity-80">{children}</a>;
  return (
    <AdminShell title="今天" nav={[{ href: "#now", label: "今天的数" }, { href: "#alerts", label: `要处理的${bad.length ? ` ${bad.length}` : ""}` }]}
      right={<span className="opacity-60">{homeDay(now)} · 截至 {homeMinute(now).slice(11)}（北京时间）· <a className="underline underline-offset-4" href="/admin">看板</a></span>}>
      <Section id="now" title="今天的数" sub="北京时间 00:00 起 · 不含测试帐号 · 和看板同一套算法 · 点一格去处理">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Box href="/admin/finance"><Stat label="付费（笔）" value={c.total} prev={y.total} sub={kinds} /></Box>
          <Box href="/admin/finance"><Stat label="Stripe 到账（结算币种）" value={b.money ? `US$${(b.money.gross / 100).toFixed(2)}` : "—"} sub={b.money ? `净 US$${(b.money.net / 100).toFixed(2)}${b.money.refunds ? ` · 退款 ${b.money.refunds} 笔` : ""} · 账本每 10 分钟同步` : "账本还没同步"} /></Box>
          <Box href="/admin/people"><Stat label="新人（新帐号）" value={b.people.newAccounts} prev={b.people.yesterdayNew} sub={`第一次付钱 ${b.people.firstPay} 人`} /></Box>
          <Box href="/admin/products"><Stat label="交付" value={b.deliveries.all.total} sub={`${sourceLine(b.deliveries.all)}${topProducts.length ? ` · ${topProducts.map((x) => `${DELIVERY_ZH[x.p]} ${x.n}`).join(" · ")}` : ""}`} /></Box>
          <Box href="/admin/revisits"><Stat label="回访积压（到期没寄）" value={b.revisits.queued} good={b.revisits.queued === 0} sub={`${b.revisits.oldestDue ? `最久的等了 ${ago(b.revisits.oldestDue, now)} · ` : ""}今天寄出 ${b.revisits.sentToday} · 今天回答 ${b.revisits.answeredToday}`} /></Box>
          <Box href="/admin/inbox"><Stat label="客服待办" value={b.inbox.open} good={b.inbox.open === 0} sub={b.inbox.oldest ? `最早一封等了 ${ago(b.inbox.oldest, now)}` : "都处理了"} /></Box>
        </div>
        <Legend>付费：一笔收款算一次（通卡一张一次，会员只算新开、不算续费）；箭头是和昨天全天比。交付：读者今天拿到的解读、报告、籤解，按凭什么拿到分（付费、通卡、会员、免费）。回访积压：应期已过、信还在排队的（一天一封、一周三封的上限压着的那些）。</Legend>
      </Section>
      {/* 10-31 进度表 131: casting opened up and the free line went — the four ratios, day by day, against 10-26→31 */}
      {(() => {
        const DAY = 86_400_000;
        const start = Date.parse("2026-10-26T00:00:00+08:00");
        const days: number[] = [];
        for (let t = start; t <= now; t += DAY) days.push(t);
        const rows = swr(`f131|${homeDay(now)}|${Math.floor(now / 600_000)}`, 600_000, 1_800_000, () => days.slice(-21).map((t) => ({ t, ...funnel131(t, Math.min(t + DAY, now)) })));
        const p = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "—");
        return (
          <Section id="f131" title="起卦免登录、没有免费一句之后（进度表 131）" sub="每天：访客 → 起卦 → 看到价格 → 付款 · 11-01 起是新做法，10-26→31 是对照（30%／23%／2.4%）· 11-15 定时核对会把结论寄给你">
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-sm min-w-[36rem]">
                <thead><tr className="text-left text-xs opacity-50"><th className="py-1 pr-3 font-normal">日期</th><th className="pr-3 font-normal">访客</th><th className="pr-3 font-normal">起卦</th><th className="pr-3 font-normal">看到价格</th><th className="pr-3 font-normal">付款</th><th className="font-normal">付款／访客</th></tr></thead>
                <tbody>{rows.map((r) => (
                  <tr key={r.t} className={`border-t border-black/5 ${r.t >= Date.parse("2026-11-01T00:00:00+08:00") ? "" : "opacity-60"}`}>
                    <td className="py-1 pr-3 tabular-nums">{homeDay(r.t).slice(5)}</td><td className="pr-3 tabular-nums">{r.visitors}</td>
                    <td className="pr-3 tabular-nums">{p(r.cast, r.visitors)}</td><td className="pr-3 tabular-nums">{p(r.price, r.visitors)}</td>
                    <td className="pr-3 tabular-nums">{r.paid}</td><td className="tabular-nums">{p(r.paid, r.visitors)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </Section>
        );
      })()}
      <Section id="alerts" title="要处理的" sub={bad.length ? `${bad.length} 项要看` : "现在没有异常"}>
        <div className="grid md:grid-cols-2 gap-3">
          {b.alerts.map((a) => (
            <a key={a.id} href={a.href} className={`block rounded-[2px] border p-3 hover:opacity-80 ${TONE[a.level]}`}>
              <p className="text-sm"><span className={`mr-2 ${DOT[a.level]}`}>●</span>{a.title}<span className="float-right text-xs opacity-50">去处理 →</span></p>
              <p className="text-xs opacity-70 mt-1 leading-relaxed">{a.line}</p>
            </a>
          ))}
        </div>
        <Legend>红：寄信失败 5 封以上；退信／投诉占当天寄出的比例比前 7 天高一倍、且到 1%（至少 3 起），或投诉到 0.3%（至少 2 起）——按比例算，群发那天寄得多不会误报；结账失败比前 7 天平均多一倍（至少 3 起）；3 人以上碰到上限；定时核对没过或机器负载／内存吃紧。黄：有但不多；服务器那张只在有没自动补上的出错时变黄（重试成功、报告补写完的不算）。绿：没有。退信、投诉过的地址以后群发自动跳过，投诉的同时记为退订，不用手动处理。</Legend>
      </Section>
    </AdminShell>
  );
}
