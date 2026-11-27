import { cookies } from "next/headers";
import { tierLabelZh } from "@/lib/catalog";
import { notFound } from "next/navigation";
import { hexagramByNumber, type LineValue } from "@yaoflow/engine";
import { resolveServerChart } from "@/lib/reading";
import CastDossier from "@/components/admin/CastDossier";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { castsForTrail, paidReadingFor, personTrail, type TrailCast, type TrailOrder } from "@/lib/people";
import ReadingArticle from "@/components/ReadingArticle";
import { asLocale } from "@/lib/locales";
import type { DeepReading, Reading } from "@/lib/reading";
import { isPaidSession } from "@/lib/cast-log";
import { eventLabel, pageLabel } from "@/lib/live-labels";
import { homeMinute } from "@/lib/clock";
import { hexName } from "@/lib/names";
import { formatMoney, isCurrency } from "@/lib/money";
import type { TrackedEvent } from "@/lib/analytics-server";
import { AdminLogin, AdminShell, Legend, Section, Stat } from "../../ui";
import { NetPanel, ProfilePanel } from "@/components/admin/PersonPanels";

export const dynamic = "force-dynamic";

/** 10-03 按人看: one browser (/admin/people/<id>) or one customer's browsers (/admin/people/c<customer id>), day by day. */
const STATUS_ZH: Record<string, string> = {
  paid: "付款", refunded: "付款（已退款）", disputed: "付款（争议中）", subscription: "通卡／会员额度", invite_light: "领取（分享新人 / 新客免费）", ref_light: "推荐回馈（朋友第一卦）",
  gift_cast: "领取（朋友送的）", case_light: "领取（卦例回礼）", reward: "领取（推荐奖励）", revisit_light: "领取（回访奖励）", joint: "合参", gift: "赠送", comp: "补偿",
};
const money = (o: TrailOrder) => (o.cents ? (isCurrency((o.currency ?? "").toUpperCase()) ? formatMoney((o.currency ?? "").toUpperCase() as never, o.cents, "en") : `${(o.currency ?? "").toUpperCase()} ${(o.cents / 100).toFixed(2)}`) : "");
const orderLine = (o: TrailOrder, cover?: string) => `${o.status === "subscription" && cover ? `${cover}额度` : STATUS_ZH[o.status] ?? o.status} · ${tierLabelZh(o.tier)}${o.firstDeep ? "（首次价）" : ""}${o.cents ? ` · ${money(o)}` : ""}`;
const SKIP = new Set(["page_leave", "pulse", "visit_day", "price_seen"]);
const WEEK = ["日", "一", "二", "三", "四", "五", "六"];
const dayTitle = (day: string) => `${day.slice(5).replace("-", "/")}（周${WEEK[new Date(`${day}T00:00:00Z`).getUTCDay()]}）`;

function line(e: TrackedEvent, castNo: number): string {
  if (e.e === "page_view") return `打开${pageLabel(e.path).label}`;
  if (e.e === "cast_complete") return `摇完第 ${castNo} 卦${e.hex ? `：${hexName(hexagramByNumber(e.hex), "zh")}` : ""}`;
  return eventLabel(e.e, e.method, e.tier, e.e === "repeat_blocked" || e.e === "teaser_shown" || e.e === "nudge_shown" ? e.hex : null);
}

const SENS_ZH: Record<string, string> = { health: "健康", sex: "性", crime: "犯罪前科" };
// 10-22 进度表 94: the one-off month is a 通卡 now (1 日／7 天／30 天)
const MEMBER_KIND: Record<"monthly" | "month" | "given", string> = { monthly: "会员（月付／年付）", month: "通卡", given: "赠送会员" };
// 11-01 (Neil: 通卡和会员一定要区分清楚): the badge names what runs now — 会员, 通卡 or 赠送会员 — and what ran before
const NOW_NAME: Record<"monthly" | "month" | "given", string> = { monthly: "会员", month: "通卡", given: "赠送会员" };
const PAST_NAME: Record<"monthly" | "month" | "given", string> = { monthly: "前会员", month: "通卡已到期", given: "赠送会员已结束" };
const hexOf = (n: number) => { const h = hexagramByNumber(n); return h ? hexName(h, "zh") : `#${n}`; };

/** 10-03 起卦记录: one cast as it was asked — the words, the figure, the line shown, its place on the matter, the block before the price */
function CastItem({ c, cover }: { c: TrailCast; cover: string }) {
  return (
    <li className="flex gap-3">
      <span className="opacity-40 tabular-nums text-xs w-10 shrink-0">{homeMinute(c.at).slice(11)}</span>
      <div className="min-w-0">
        <p>
          <span className="opacity-50">问：</span>{c.question ? `「${c.question}」` : <span className="opacity-60">（{SENS_ZH[c.sensitive ?? ""] ?? c.sensitive ?? "?"}类问题，原文不存）</span>}
          <span className="opacity-60"> → {hexOf(c.primary)}{c.changed ? ` 之 ${hexOf(c.changed)}` : ""}</span>
          {c.n ? <span className={c.n >= 3 ? "text-[var(--cinnabar)]" : "text-[var(--gold-text)]"}> · 这件事第 {c.n} 卦</span> : null}
          {c.paidSid ? <span className="text-emerald-700"> · {isPaidSession(c.paidSid) ? "买了这一卦的解读" : c.paidSid.startsWith("sub_") ? `用${cover}看了这一卦` : "领了这一卦的解读"}</span> : null}
          {c.member && <span className="text-[var(--gold-text)]"> · {cover}在用（看不到价格，不算进转化）</span>}
        </p>
        {c.teaser && <p className="text-xs opacity-70 mt-0.5">免费一句{c.style ? `（${c.style}）` : ""}：「{c.teaser}」</p>}
        {c.capped && <p className="text-xs opacity-60 mt-0.5">问满了（一事一占），没给免费一句</p>}
        {c.nudge && <p className="text-xs opacity-70 mt-0.5">付费引导：{c.nudge}{c.nudgeSeen ? "（页面显示了）" : "（没显示）"}</p>}
      </div>
    </li>
  );
}

const LEAN_ZH: Record<string, string> = { good: "偏顺", mixed: "有阻", bad: "偏不顺" };

/** 10-13 全部起卦 (Neil: 「能把这种没有付费的所有卦象也都显示出来吗」): one cast, folded — the line on top, the chart inside */
function CastChart({ c, cover }: { c: TrailCast; cover: string }) {
  // cast_log keeps the six values as one string ("977677"); casts.values_str uses commas — take the digits either way
  const values = (c.values.match(/[6-9]/g) ?? []).map(Number) as LineValue[];
  let chart: ReturnType<typeof resolveServerChart> | null = null;
  try { chart = resolveServerChart({ question: "", values, castAtMs: c.at, tzOffsetMinutes: c.tz }, true); } catch { chart = null; }
  const status = c.paidSid
    ? <span className="text-emerald-700">{isPaidSession(c.paidSid) ? "买了" : c.paidSid.startsWith("sub_") ? `${cover}看了` : "领了"}</span>
    : c.member ? <span className="text-[var(--gold-text)]">{cover}时段</span> : <span className="opacity-40">没买</span>;
  return (
    <details className="border-t border-black/5 py-1.5">
      <summary className="cursor-pointer text-sm flex gap-3 items-baseline">
        <span className="opacity-40 tabular-nums text-xs w-24 shrink-0">▸ {homeMinute(c.at).slice(5, 16)}</span>
        <span className="shrink-0">{hexOf(c.primary)}{c.changed ? <span className="opacity-60"> 之 {hexOf(c.changed)}</span> : <span className="opacity-40"> 静</span>}</span>
        <span className="min-w-0 truncate opacity-80">{c.question ?? `（${SENS_ZH[c.sensitive ?? ""] ?? c.sensitive ?? "?"}类，原文不存）`}</span>
        <span className="text-xs whitespace-nowrap ml-auto">{status}</span>
        {/* 11-05 (Neil: 「要像解读过后一样的页面」): the reader's own page, as they see it — admin opens are not counted as views */}
        {!c.paidSid && <a href={`/admin/cast/${c.id}`} target="_blank" rel="noopener" className="text-xs whitespace-nowrap underline underline-offset-2 text-[var(--cinnabar)]">读者页 ↗</a>}
        {c.paidSid && <a href={`/${asLocale(paidReadingFor(c.paidSid)?.locale ?? c.locale ?? "zh-hant")}/reading?sid=${encodeURIComponent(c.paidSid)}`} target="_blank" rel="noopener" className="text-xs whitespace-nowrap underline underline-offset-2 text-[var(--cinnabar)]">读者页 ↗</a>}
      </summary>
      <div className="pl-2 md:pl-[6.75rem] pr-2 pb-6 pt-4">
        {chart ? <CastDossier chart={chart} values={values} question={c.question} teaser={c.teaser} readerLocale={c.locale} /> : <p className="text-xs opacity-60">排盘失败</p>}
        {(() => {
          const pr = c.paidSid ? paidReadingFor(c.paidSid) : null;
          if (!c.paidSid) return null;
          if (!pr) return <p className="text-xs opacity-60 mt-6">这一卦{isPaidSession(c.paidSid) ? "买了" : "领了"}解读，但没找到解读正文（订单没有对上卦，或还没生成）。</p>;
          const rl = asLocale(pr.locale);
          return (
            <div className="max-w-[560px] mt-[var(--s-6)] pt-[var(--s-5)] border-t-2 border-[var(--ink)]" style={{ fontFamily: rl === "zh" ? "var(--serif-zh)" : "var(--serif-hant)" }}>
              <p className="t-label mb-1">{isPaidSession(c.paidSid) ? "读者买到的解读" : c.paidSid.startsWith("sub_") ? `读者用${cover}看到的解读` : "读者领到的解读"} · {pr.tier === "deep" ? "深断" : "轻解读"}</p>
              <ReadingArticle locale={rl} tier={pr.tier} reading={pr.body as Reading | DeepReading} />
              {pr.followups.length > 0 && (
                <section className="mt-[var(--s-6)] pt-[var(--s-5)] border-t border-[var(--ink-16)]">
                  <h2 className="t-sect mb-[var(--s-4)]">追问（{pr.followups.filter((f) => f.role === "user").length} 问）</h2>
                  <div className="flex flex-col gap-[var(--s-3)]">
                    {pr.followups.map((f, i) => f.role === "user"
                      ? <p key={i} className="t-body border-l-2 border-[var(--cinnabar)] pl-3">{f.content}</p>
                      : <p key={i} className="t-body !text-[var(--ink-66)] pl-3 whitespace-pre-line">{f.content}</p>)}
                  </div>
                </section>
              )}
            </div>
          );
        })()}
        <p className="text-xs opacity-60 mt-4">
          {c.lean ? `免费一句倾向：${LEAN_ZH[c.lean] ?? c.lean}` : ""}
          {c.capped ? "问满了（一事一占），没给免费一句" : ""}
          {c.n ? ` · 这件事第 ${c.n} 卦` : ""}
          {c.nudge ? ` · 付费引导：${c.nudge}${c.nudgeSeen ? "（显示了）" : "（没显示）"}` : ""}
        </p>
      </div>
    </details>
  );
}

export default async function PersonPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ key?: string; denied?: string; erased?: string }> }) {
  const { id } = await params;
  const { key, denied, erased } = await searchParams;
  if (!(await isAdmin((await cookies()).get(ADMIN_COOKIE)?.value, key))) return <AdminLogin denied={denied === "1"} back={`/admin/people/${id}`} />;
  const cm = /^c(\d{1,9})$/.exec(id);
  if (!cm && !/^[0-9a-f]{16}$/.test(id)) notFound();
  const tr = personTrail(cm ? { customerId: Number(cm[1]) } : { bid: id });
  const s = tr.summary;
  let castNo = 0;
  // 10-03 起卦记录: the casts themselves (question, figure, line, matter), placed in the tab that made them
  const { casts, threads } = castsForTrail(tr.bids, Date.now() - 60 * 86_400_000, tr.memberships.map((m) => [m.from, m.to ?? Infinity]));
  // 10-04 排除会员: whether they are (or were) a member — a member sees no price
  const now = Date.now();
  // 11-01 (Neil: 通卡和会员一定要区分清楚): what covered a moment — 通卡, 会员 or 赠送会员 — from their own rows
  const coverAt = (t: number): string => { const m = tr.memberships.filter((x) => x.from <= t + 60_000 && (x.to === null || t < x.to)).at(-1); return m ? NOW_NAME[m.kind] : "通卡／会员"; };
  const memberNow = tr.memberships.some((m) => m.from <= now && (m.to === null || now < m.to));
  const tabIds = new Set(tr.days.flatMap((d) => d.sessions.map((x) => x.s)));
  const loose = casts.filter((c) => !c.s || !tabIds.has(c.s));

  return (
    <AdminShell title="按人看 · 轨迹" nav={[]} right={<><a href="/admin/people" className="underline underline-offset-4">← 按人看</a></>}>
      <div className="max-w-3xl">
        <h1 className="text-xl mb-1">
          {tr.customers.length
            ? tr.customers.map((c, i) => <span key={c.id}>{i ? "、" : ""}<a className="underline underline-offset-4" href={`/admin/customers/${c.id}`}>{c.email ?? `#${c.id}`}</a></span>)
            : <span className="opacity-60">访客 {id.slice(0, 6)}</span>}
          {tr.memberships.length > 0 && (
            <span className={`ml-2 align-middle text-xs px-2 py-0.5 rounded-full ${memberNow ? "bg-[var(--gold)]/15 text-[var(--gold-text)]" : "bg-black/5 opacity-60"}`}>{(() => { const cur = tr.memberships.filter((m) => m.from <= now && (m.to === null || now < m.to)).at(-1); const last = tr.memberships.at(-1)!; return cur ? NOW_NAME[cur.kind] : PAST_NAME[last.kind]; })()}</span>
          )}
        </h1>
        {tr.memberships.length > 0 && (
          <p className="text-xs opacity-60 mb-1">
            会员／通卡：{tr.memberships.map((m) => `${MEMBER_KIND[m.kind]} ${homeMinute(m.from).slice(0, 10)} 起${m.to === null ? "，进行中" : now < m.to ? `，到 ${homeMinute(m.to).slice(0, 10)}` : `，${homeMinute(m.to).slice(0, 10)} 已到期`}`).join("；")}。会员或通卡时段里起的卦看不到价格，不算进转化（按人看的列表、按人漏斗、付费话术面板都不算）。
          </p>
        )}
        <p className="text-xs opacity-50 mb-6">
          {cm ? `这位客户名下的浏览器 ${tr.bids.length} 个` : "一个浏览器"}{tr.bids.length ? `：${tr.bids.map((b) => b.slice(0, 6)).join("、")}` : "（还没有：他付款、领取或登录时用的浏览器还没有编号）"}
          {!cm && tr.customers.length === 1 && <> · <a className="underline underline-offset-2" href={`/admin/people/c${tr.customers[0]!.id}`}>看这位客户所有浏览器 →</a></>}
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Stat label="第一次来" value={s.firstDayLocal ?? (s.firstAt ? homeMinute(s.firstAt).slice(0, 10) : "—")} sub={s.firstFrom ? `来自 ${s.firstFrom}` : undefined} />
          <Stat label="来了几天" value={s.visitDays} sub={`${s.sessions} 次打开`} />
          <Stat label="摇了几卦" value={s.casts} sub={`看到免费一句 ${s.teased} 次`} />
          <Stat label="付款" value={s.paid} sub={`点价格 ${s.clicks} · 去付款 ${s.checkouts}`} good={s.paid > 0} />
        </div>
        {s.firstPaidAt && (
          <p className="text-sm mb-8">第一次付款在 <b>第 {s.dayOfFirstPaid} 个来访日</b>（{homeMinute(s.firstPaidAt)}），之前摇了 <b>{s.castsBeforePaid} 卦</b>，距第一次来 {s.calendarDaysToPaid} 天。</p>
        )}

        {/* 10-31 进度表 130: address, device, similar traces; the reader's profile */}
        <ProfilePanel bids={tr.bids} customerId={tr.customers.length === 1 ? tr.customers[0]!.id : cm ? Number(cm[1]) : null} />
        <NetPanel bids={tr.bids} />

        <Section id="matters" title="问过的事" sub={`起卦记录 · 最近 60 天 · ${threads.length} 件`}>
          {erased && <p className="text-sm text-emerald-700 mb-3">已删除 {erased} 条起卦记录。</p>}
          {threads.length === 0 && <p className="text-sm opacity-50">还没有起卦记录（10-03 起才记）。</p>}
          {threads.length > 0 && (
            <table className="text-sm w-full mb-2"><tbody>{threads.map((t) => (
              <tr key={t.id} className="border-t border-black/5">
                <td className="py-1.5 pr-3">{t.title && !t.title.startsWith("[") ? t.title : t.sensitive ? `（${SENS_ZH[t.sensitive] ?? t.sensitive}类）` : <span className="opacity-50">（未命名）</span>}</td>
                <td className={`tabular-nums whitespace-nowrap pr-3 ${t.casts >= 3 && !t.paid ? "text-[var(--cinnabar)]" : ""}`}>{t.casts} 卦</td>
                <td className="text-xs opacity-60 whitespace-nowrap pr-3">{homeMinute(t.firstAt).slice(5, 10)}{t.lastAt - t.firstAt > 86_400_000 ? ` – ${homeMinute(t.lastAt).slice(5, 10)}` : ""}</td>
                <td className="text-xs whitespace-nowrap">{t.paid ? <span className="text-emerald-700">买过解读</span> : t.viewed ? <span className="text-emerald-700">用额度看了解读</span> : <span className="opacity-40">没买</span>}</td>
              </tr>
            ))}</tbody></table>
          )}
          {casts.length > 0 && (
            <form method="post" action="/api/admin/cast-log-erase" className="mt-3">
              <input type="hidden" name="target" value={id} />
              {key && <input type="hidden" name="key" value={key} />}
              <button className="text-xs underline underline-offset-2 opacity-60 hover:opacity-100">删除{cm ? "这位客户所有浏览器" : "这个浏览器"}的起卦记录（读者要求时用；不可恢复）</button>
            </form>
          )}
          <Legend>同一件事由模型判断（规则兜底），按人归：这个浏览器，加上归到同一位客户名下的其他浏览器。问 3 次以上还没买的标红。</Legend>
        </Section>

        <Section id="all-casts" title="全部起卦" sub={`最近 60 天 · ${casts.length} 卦 · 买了 ${casts.filter((c) => isPaidSession(c.paidSid)).length} · 用额度看了 ${casts.filter((c) => c.paidSid && !isPaidSession(c.paidSid)).length} · 没买 ${casts.filter((c) => !c.paidSid && !c.member).length}`}>
          {casts.length === 0 && <p className="text-sm opacity-50">还没有起卦记录（10-03 起才记）。</p>}
          {casts.length > 0 && <div className="mb-2">{[...casts].reverse().map((c) => <CastChart key={c.id} c={c} cover={coverAt(c.at)} />)}</div>}
          <Legend>新的在上。点一行（▸）展开，就是读者起完卦看到的那一页：卦象、卦名、动爻与旬空、卦辞爻辞，专业排盘直接展开（多了变爻和动变关系）。买了或用额度看了的，行尾有「读者页 ↗」，新分页打开就是读者解读后看到的那一整页（你打开不算进浏览数）；展开后也接着有解读正文和追问。没买的也有「读者页 ↗」，还原他摇完卦看到的那一页：问题、盘面、这件事前几卦、付费引导和通卡面板（按他的地区币种，按钮不能点）。</Legend>
        </Section>

        <Section id="trail" title="每天做了什么" sub="UTC+8 · 最近 60 天">
          {tr.days.length === 0 && <p className="text-sm opacity-50">这段时间没有记录。</p>}
          {tr.days.map((d) => (
            <div key={d.day} className="mb-6">
              <p className="text-sm mb-2"><span className="tracking-[0.1em]">第 {d.index} 天</span><span className="opacity-50 ml-2">{dayTitle(d.day)}</span></p>
              {d.sessions.map((t) => (
                <div key={t.s} className="ml-1 pl-3 border-l border-black/10 mb-3">
                  <p className="text-xs opacity-60 mb-1">{homeMinute(t.start).slice(11)}–{homeMinute(t.end).slice(11)} · 进来在{pageLabel(t.landing).label}{t.from ? ` · 来自 ${t.from}` : ""}</p>
                  <ol className="text-sm space-y-0.5">
                    {t.events.filter((e) => !SKIP.has(e.e)).map((e, i, arr) => {
                      if (e.e === "cast_complete") castNo += 1;
                      const text = line(e, castNo);
                      const prev = i > 0 ? line(arr[i - 1]!, castNo) : null;
                      if (prev === text && e.e !== "cast_complete") return null;
                      return <li key={`${e.t}-${i}`} className="flex gap-3"><span className="opacity-40 tabular-nums text-xs w-10 shrink-0">{homeMinute(e.t).slice(11)}</span><span className={e.e === "cast_complete" ? "" : "opacity-80"}>{text}</span></li>;
                    })}
                    {t.orders.map((o) => (
                      <li key={`o-${o.at}`} className="flex gap-3"><span className="opacity-40 tabular-nums text-xs w-10 shrink-0">{homeMinute(o.at).slice(11)}</span><span className={o.paid ? "text-emerald-700" : "text-[var(--gold-text)]"}>{orderLine(o, coverAt(o.at))}</span></li>
                    ))}
                  </ol>
                  {casts.some((c) => c.s === t.s) && (
                    <ol className="text-sm space-y-1 mt-2 pt-2 border-t border-black/5">
                      {casts.filter((c) => c.s === t.s).map((c) => <CastItem key={c.id} c={c} cover={coverAt(c.at)} />)}
                    </ol>
                  )}
                </div>
              ))}
              {loose.some((c) => homeMinute(c.at).slice(0, 10) === d.day) && (
                <div className="ml-1 pl-3 border-l border-black/10 mb-3">
                  <p className="text-xs opacity-60 mb-1">这一天的其他起卦（标签页没有对上事件）</p>
                  <ol className="text-sm space-y-1">{loose.filter((c) => homeMinute(c.at).slice(0, 10) === d.day).map((c) => <CastItem key={c.id} c={c} cover={coverAt(c.at)} />)}</ol>
                </div>
              )}
            </div>
          ))}
          {loose.some((c) => !tr.days.some((d) => d.day === homeMinute(c.at).slice(0, 10))) && (
            <div className="mt-6">
              <p className="text-xs opacity-50 mb-2">起卦记录里有、事件里没有这一天的</p>
              <ol className="text-sm space-y-1">{loose.filter((c) => !tr.days.some((d) => d.day === homeMinute(c.at).slice(0, 10))).map((c) => <CastItem key={c.id} c={c} cover={coverAt(c.at)} />)}</ol>
            </div>
          )}
          {tr.otherOrders.length > 0 && (
            <div className="mt-8">
              <p className="text-xs opacity-50 mb-2">不是在这些浏览器里下的单（别的浏览器、编号上线前，或别人送的）</p>
              <ol className="text-sm space-y-0.5">{tr.otherOrders.map((o) => <li key={`x-${o.at}`} className="flex gap-3"><span className="opacity-40 tabular-nums text-xs">{homeMinute(o.at)}</span><span>{orderLine(o, coverAt(o.at))}</span></li>)}</ol>
            </div>
          )}
          <Legend>一行一个动作，按时间排；同样的动作连着出现只记一次。每个标签页下面是这次起的卦（10-03 起的起卦记录）：问题、卦、免费那一句、同一件事第几卦、付费引导用了哪个版本。「付款」以订单为准（下单的那个标签页）。编号 10-03 才上线，之前的来访这里没有。</Legend>
        </Section>
      </div>
    </AdminShell>
  );
}
