import { cookies } from "next/headers";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { qianBreakdown, qianDetails, qianStats, realPaidBrowserSessions, type QianSliceRow } from "@/lib/db";
import { homeMinute } from "@/lib/clock";
import { allQian } from "@/lib/qian";
import { qianFollowupOf, type QianPersonal } from "@/lib/qian-personal";
import { QIAN_SETS, QIAN_SITUATIONS, TEMPLES, qianResultPath } from "@/lib/qian-meta";
import { refreshFx, toUsdCents } from "@/lib/live";
import { formatMoney, isCurrency } from "@/lib/money";
import { readEvents } from "@/lib/analytics-server";
import { qianSearchFunnel } from "@/lib/qian-funnel";
import { AdminLogin, AdminShell, Legend, Section, Stat } from "../ui";
import { listPhotos } from "@/lib/qian-photo-store";
import { madeUnder } from "@/lib/mingli/flow-view";

export const dynamic = "force-dynamic";

/** 10-12 解籤承接 (进度表 §四 36 ⑨⑩): lot → cast, cast → lot, and matters with both against matters with casts only. */
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "—");

export default async function QianAdminPage({ searchParams }: { searchParams: Promise<{ key?: string; denied?: string; days?: string }> }) {
  const { key, denied, days } = await searchParams;
  if (!(await isAdmin((await cookies()).get(ADMIN_COOKIE)?.value, key))) return <AdminLogin denied={denied === "1"} back="/admin/qian" />;
  const n = days && /^\d{1,3}$/.test(days) ? Number(days) : 30;
  const s = qianStats(Date.now() - n * 86_400_000);
  // 10-13 (Neil: 「全部都补上吧」): by set, by kind of matter, and the money
  const b = qianBreakdown(Date.now() - n * 86_400_000);
  const details = qianDetails(Date.now() - n * 86_400_000);
  // 10-13 进度表 40 ⑥: from a search landing, per set — read → cast → paid
  const funnel = qianSearchFunnel(readEvents(n, { only: ["page_view", "page_leave", "cast_complete"] }), realPaidBrowserSessions(Date.now() - n * 86_400_000));
  await refreshFx().catch(() => false);
  const keptPhotos = listPhotos().length;
  const net = b.money.reduce((a, m) => a + toUsdCents(m.minor - m.refundedMinor, m.currency), 0);
  const setName = (id: string) => QIAN_SETS.find((x) => x.id === id)?.short ?? id;
  const sitName = (id: string) => QIAN_SITUATIONS.find((x) => x.id === id)?.label ?? id;
  const sliceTable = (rows: QianSliceRow[], name: (k: string) => string) => rows.length === 0 ? <p className="text-sm opacity-50">这段时间还没有解籤。</p> : (
    <table className="text-sm">
      <thead><tr className="text-left text-xs opacity-50"><th className="py-1 pr-6 font-normal"></th><th className="pr-6 font-normal">解籤</th><th className="pr-6 font-normal">→ 起卦</th><th className="pr-6 font-normal">个人化 · 付费</th><th className="pr-6 font-normal">通卡／会员</th><th className="font-normal">追问用了</th></tr></thead>
      <tbody>{rows.map((r) => (
        <tr key={r.key} className="border-t border-black/5"><td className="py-1 pr-6">{name(r.key)}</td><td className="pr-6 tabular-nums">{r.draws}</td><td className="pr-6 tabular-nums">{r.toCast} · {pct(r.toCast, r.draws)}</td><td className="pr-6 tabular-nums">{r.paid} · {pct(r.paid, r.draws)}</td><td className="pr-6 tabular-nums">{r.member}</td><td className="tabular-nums">{r.followups}</td></tr>
      ))}</tbody>
    </table>
  );
  // 10-12 解籤收尾 ②: sessions whose first page was a lot page or the entry, arriving from a search engine
  const SEARCH = /(^|\.)(google|bing|yahoo|duckduckgo|baidu|naver|yandex|ecosia)\./;
  const firstPage = new Map<string, { path: string; ref: string }>();
  // 10-13 拍照认籤: how the photos went (one = filled in, some = the reader chose, none / notslip / fail)
  const photo: Record<string, number> = { one: 0, some: 0, none: 0, notslip: 0, fail: 0 };
  for (const e of readEvents(n, { only: ["page_view", "qian_photo"] })) {
    if (e.e === "qian_photo") { photo[e.method ?? "fail"] = (photo[e.method ?? "fail"] ?? 0) + 1; continue; }
    if (e.e !== "page_view" || !e.s || firstPage.has(e.s)) continue;
    firstPage.set(e.s, { path: e.path ?? "", ref: e.ref ?? "" });
  }
  const landings = [...firstPage.values()].filter((v) => /^\/zh-hant\/(qian\/|jieqian)/.test(v.path) && SEARCH.test(v.ref));
  const byPage = new Map<string, number>();
  for (const v of landings) { const k = v.path.split("?")[0]!; byPage.set(k, (byPage.get(k) ?? 0) + 1); }
  const topPages = [...byPage.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const row = (label: string, g: typeof s.withQian) => (
    <tr className="border-t border-black/5"><td className="py-1 pr-6">{label}</td><td className="pr-6 tabular-nums">{g.matters}</td><td className="pr-6 tabular-nums">{g.paid} · {pct(g.paid, g.matters)}</td><td className="tabular-nums">{g.revisitsAnswered}/{g.revisitsSent} · {pct(g.revisitsAnswered, g.revisitsSent)}</td></tr>
  );
  return (
    <AdminShell title="解籤 · 承接" nav={[{ href: "#flow", label: "两个方向" }, { href: "#list", label: "明细" }, { href: "#money", label: "收入" }, { href: "#sets", label: "按籤系" }, { href: "#situations", label: "按处境" }, { href: "#search", label: "搜索" }, { href: "#matters", label: "同一件事" }]}>
      <p className="text-sm opacity-60 mb-6">近 {n} 天（?days= 可改）· 我们自己的测试账号不算</p>
      <Section id="flow" title="两个方向" sub="籤 → 卦目标 ≥ 25%">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-4xl">
          <Stat label="解籤次数" value={s.draws} />
          <Stat label="解籤 → 起卦" value={pct(s.drawsToCast, s.draws)} sub={`${s.drawsToCast} 次之后起了卦`} good={s.draws > 0 ? s.drawsToCast / s.draws >= 0.25 : undefined} />
          <Stat label="卦 → 籤（从解读或事页加的）" value={s.drawsJoined} />
          <Stat label="起卦客户 → 解籤" value={pct(s.castCustomersWithQian, s.castCustomers)} sub={`${s.castCustomersWithQian} / ${s.castCustomers} 位繁體起卦客户`} />
          <Stat label="个人化解读 · 付费" value={s.personalPaid} />
          <Stat label="个人化解读 · 通卡／会员" value={`${s.personalPass} / ${s.personalMember}`} sub="通卡期内用的、会员用的（10-23 前合称「会员额度」）" />
          <Stat label="含的那次追问 · 用了" value={pct(s.followups, s.personalPaid + s.personalMember + s.personalPass)} sub={`${s.followups} 次 · 之后起卦 ${s.followupsToCast}`} />
        </div>
        {(() => {
          const total = Object.values(photo).reduce((a, b) => a + b, 0);
          return (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-4xl mt-3">
              <Stat label="拍照找籤" value={total} sub={`看不出 ${photo.none} · 不是籤诗 ${photo.notslip} · 读取失败 ${photo.fail}`} />
              <Stat label="拍照 · 直接认出" value={pct(photo.one!, total - photo.notslip!)} sub={`${photo.one} 次 · 另有 ${photo.some} 次给几首让读者选`} />
              <a href="/admin/qian/photos" className="block"><Stat label="认不出的照片（留 30 天）" value={keptPhotos} sub="点开看照片和读出的字 →" /></a>
            </div>
          );
        })()}
        <Legend>「起卦客户」只算认得出人的（登录过或留过邮箱）；没留邮箱的访客两边对不上，不在分母里。拍照找籤：认出的照片不存；认不出、读取失败、要读者选的照片留 30 天（10-14 起），点「认不出的照片」看；「直接认出」的分母去掉了「不是籤诗」。</Legend>
      </Section>
      {/* 10-13 (Neil: 「解签的详细内容也显示在解签页的面板里面吧」): every draw, newest first */}
      <Section id="list" title="解籤明细" sub={`近 ${n} 天 · ${details.length} 笔 · 新的在上 · 灰色 = 测试账号`}>
        {details.length === 0 ? <p className="text-sm opacity-50">这段时间还没有解籤。</p> : (
          <div className="flex flex-col gap-2 max-w-5xl">
            {details.map((r) => {
              const e = allQian(r.set_name).find((x) => x.num === r.num);
              const temple = TEMPLES.find((t) => t.id === r.temple)?.name ?? r.temple ?? "—";
              let personal: QianPersonal | null = null;
              try { personal = r.personal_json ? (JSON.parse(r.personal_json) as QianPersonal) : null; } catch { /* */ }
              const fu = qianFollowupOf(r);
              const paidKind = !r.paid_at ? null : r.paid_session?.startsWith("member:") ? (madeUnder(r.paid_session) === "pass" ? "通卡" : "会员") : `付费 ${r.currency ?? ""} ${r.amount_minor != null ? (r.amount_minor / 100).toFixed(r.currency === "JPY" || r.currency === "KRW" ? 0 : 2) : ""}`;
              return (
                <details key={r.id} className={`border border-black/10 rounded-[2px] px-3 py-2 text-sm ${r.test_flag ? "opacity-40" : ""}`}>
                  <summary className="cursor-pointer list-none flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    <span className="tabular-nums opacity-60">{homeMinute(r.created_at)}</span>
                    <span className="font-medium">{setName(r.set_name)} 第 {r.num} 籤</span>
                    <span className="opacity-70">{e?.title ?? ""}</span>
                    <span className="opacity-60">{sitName(r.situation)}</span>
                    <span className="opacity-60">{temple}</span>
                    {r.register && <span className="opacity-60">{r.register === "hk" ? "港式" : r.register === "yue" ? "粤语" : r.register}</span>}
                    {r.cast_id ? <span className="text-emerald-700">→ 起卦{r.cast_paid ? ` · 已付（${r.cast_tier === "deep" ? "深断" : r.cast_tier === "one" ? "轻解读" : r.cast_tier ?? ""}）` : ""}</span> : <span className="opacity-40">没起卦</span>}
                    {paidKind && <span className="text-[var(--gold-text)]">个人化 · {paidKind}</span>}
                    {fu && <span className="opacity-70">追问 ✓</span>}
                    <span className="ml-auto opacity-60">{r.customer_id ? <a className="underline underline-offset-2" href={`/admin/customers/${r.customer_id}`}>{r.cust_email ?? `#${r.customer_id}`}</a> : "匿名"}</span>
                  </summary>
                  <div className="mt-2 pl-1 flex flex-col gap-2">
                    <p><span className="opacity-50">问题：</span>{r.question}</p>
                    {personal && (
                      <div className="border-l-2 border-[var(--gold)] pl-3">
                        <p className="opacity-50 text-xs">个人化解读{r.personal_at ? ` · ${homeMinute(r.personal_at)}` : ""}</p>
                        <p className="mt-1 leading-relaxed">{personal.reading}</p>
                        {personal.watch && <p className="mt-1 opacity-80">留意：{personal.watch}</p>}
                        {personal.next && <p className="mt-1 opacity-80">结尾：{personal.next}</p>}
                      </div>
                    )}
                    {r.paid_at && !personal && <p className="text-[var(--cinnabar)]">已付但个人化解读还没写出来</p>}
                    {fu && (
                      <div className="border-l-2 border-black/20 pl-3">
                        <p className="opacity-50 text-xs">追问{r.followup_at ? ` · ${homeMinute(r.followup_at)}` : ""}{fu.followup.cast ? " · 接到起卦" : ""}</p>
                        <p className="mt-1"><span className="opacity-50">问：</span>{fu.question}</p>
                        <p className="mt-1 leading-relaxed"><span className="opacity-50">答：</span>{fu.followup.answer}</p>
                      </div>
                    )}
                    <p className="text-xs opacity-60">
                      <a className="underline underline-offset-2" href={qianResultPath(r.token)} target="_blank" rel="noreferrer">打开读者看到的结果页</a>
                      {r.matter_id ? ` · 事 #${r.matter_id}` : ""}{r.cast_id ? ` · 卦 #${r.cast_id}` : ""}
                    </p>
                  </div>
                </details>
              );
            })}
          </div>
        )}
        <Legend>点一行展开：读者的问题、个人化解读全文、追问与回答。只给后台看，不要截图外传。「打开读者看到的结果页」会算作一次页面浏览。</Legend>
      </Section>
      <Section id="money" title="收入" sub="个人化解读（这支籤放在我这件事上）的付款 · 订单表 tier = qian">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-4xl">
          <Stat label="净收入（折美元）" value={`$${(net / 100).toFixed(2)}`} sub="扣掉已退款 · 未扣 Stripe 手续费" />
          <Stat label="付费单数" value={b.money.reduce((a, m) => a + m.orders, 0)} sub={`退款 ${b.money.reduce((a, m) => a + m.refunded, 0)} 单`} />
        </div>
        {b.money.length > 0 && (
          <table className="text-sm mt-3">
            <thead><tr className="text-left text-xs opacity-50"><th className="py-1 pr-6 font-normal">币种</th><th className="pr-6 font-normal">单数</th><th className="pr-6 font-normal">收款</th><th className="font-normal">退款</th></tr></thead>
            <tbody>{b.money.map((m) => (
              <tr key={m.currency} className="border-t border-black/5"><td className="py-1 pr-6">{m.currency}</td><td className="pr-6 tabular-nums">{m.orders}</td><td className="pr-6 tabular-nums">{isCurrency(m.currency) ? formatMoney(m.currency, m.minor, "zh") : m.minor}</td><td className="tabular-nums">{m.refunded > 0 ? `${m.refunded} 单 · ${isCurrency(m.currency) ? formatMoney(m.currency, m.refundedMinor, "zh") : m.refundedMinor}` : "—"}</td></tr>
            ))}</tbody>
          </table>
        )}
        <Legend>通卡期内和会员解的籤不另收钱，不在这里（上面「通卡／会员」那格）。精确到账（扣手续费、税）看 /admin/finance 里标「解签」的行。</Legend>
      </Section>
      <Section id="sets" title="按籤系" sub="14 套籤各自有多少人来解、接到起卦、买个人化解读">
        {sliceTable(b.bySet, setName)}
      </Section>
      <Section id="situations" title="按处境" sub="读者解籤时选的事情类别">
        {sliceTable(b.bySituation, sitName)}
        <Legend>月老聖籤只给感情类处境；「其他」也包含没选的。</Legend>
      </Section>
      <Section id="search" title="从搜索进来的" sub="第一页就是籤页或解籤入口、来源是搜索引擎的会话">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-4xl">
          <Stat label="搜索落地会话" value={landings.length} />
          <Stat label="→ 看完白话" value={pct(funnel.total.read, funnel.total.landed)} sub={`${funnel.total.read} 个会话`} />
          <Stat label="→ 起卦" value={pct(funnel.total.cast, funnel.total.landed)} sub={`${funnel.total.cast} 个会话`} />
          <Stat label="→ 付费" value={pct(funnel.total.paid, funnel.total.landed)} sub={`${funnel.total.paid} 个会话`} />
        </div>
        {funnel.rows.length > 0 && (
          <table className="text-sm mt-3">
            <thead><tr className="text-left text-xs opacity-50"><th className="py-1 pr-6 font-normal">落地在</th><th className="pr-6 font-normal">搜索落地</th><th className="pr-6 font-normal">看完白话</th><th className="pr-6 font-normal">起卦</th><th className="font-normal">付费</th></tr></thead>
            <tbody>{funnel.rows.map((r) => (
              <tr key={r.key} className="border-t border-black/5"><td className="py-1 pr-6">{r.key === "entry" ? "解籤入口页" : setName(r.key)}</td><td className="pr-6 tabular-nums">{r.landed}</td><td className="pr-6 tabular-nums">{r.read} · {pct(r.read, r.landed)}</td><td className="pr-6 tabular-nums">{r.cast} · {pct(r.cast, r.landed)}</td><td className="tabular-nums">{r.paid} · {pct(r.paid, r.landed)}</td></tr>
            ))}</tbody>
          </table>
        )}
        <p className="text-xs opacity-50 mt-4">落地最多的页面</p>
        {topPages.length > 0 && (
          <table className="text-sm mt-3"><tbody>{topPages.map(([p, c]) => <tr key={p} className="border-t border-black/5"><td className="py-1 pr-6">{p}</td><td className="tabular-nums">{c}</td></tr>)}</tbody></table>
        )}
        <Legend>按浏览器记的「来源网站」判断（Google / Bing / Yahoo 等）；有的浏览器不报来源，实际会比这里多一点。「看完白话」= 在籤页停了 15 秒以上或滑过六成，或打开了解籤结果页；起卦、付费都算同一个会话里的；付费不含我们自己的测试单。</Legend>
      </Section>
      <Section id="matters" title="同一件事：有籤又有卦 vs 只有卦" sub="繁體、近期有动静的事">
        <table className="text-sm">
          <thead><tr className="text-left text-xs opacity-50"><th className="py-1 pr-6 font-normal"></th><th className="pr-6 font-normal">事数</th><th className="pr-6 font-normal">有付费</th><th className="font-normal">回访回答率</th></tr></thead>
          <tbody>{row("有籤又有卦", s.withQian)}{row("只有卦", s.castsOnly)}</tbody>
        </table>
        <Legend>「有付费」= 这件事里有一卦付过钱（或用了通卡／会员）；回访回答率 = 已寄回访里读者点了回答的比例。样本小的时候只看方向。</Legend>
      </Section>
    </AdminShell>
  );
}
