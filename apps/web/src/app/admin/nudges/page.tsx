import type { ReactNode } from "react";
import { tierLabelZh } from "@/lib/catalog";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { castLogOn, keepSensitiveText } from "@/lib/cast-log";
import { aiMax, aiMode, aiOn, ALL_SLOTS, isPersonal, learnOn, lastRun, localesOf, PERSONAL_BUDGET_MS, personalOn, recentPersonal, recentRuns, segmentOf, variantGoal, variants, variantStats, type PurchaseRec, type Slot, type Variant, type VariantStats , N4_CONTROL_ID, N4_CONTROL_SHARE } from "@/lib/nudge";
import { cohort, DIMS, PERSON_DIMS, personFeatures, personLabels, segmentTable, stageFunnel, STAGES, TOPIC_ZH, type Dim, type PayerRow, type StageKey } from "@/lib/stage-funnel";
import { PEOPLE_SINCE } from "@/lib/people";
import { homeDayStart, homeMinute } from "@/lib/clock";
import { formatMoney, isCurrency } from "@/lib/money";
import { recentReviews, reviewById, reviewOn, REVIEW_DAYS, REVIEW_MAX } from "@/lib/ai-review";
import { AdminLogin, AdminShell, Legend, Section } from "../ui";
import { repeatTestOn, repeatTestStats, REPEAT_TEST_SINCE } from "@/lib/repeat-test";
import { readEvents } from "@/lib/analytics-server";

export const dynamic = "force-dynamic";

/**
 * 10-03 付费话术学习 (lib/nudge.ts): the words shown before the price on the 2nd, 3rd and 4th+ cast of one matter, and
 * the styles of the linked free line — how often each was shown, how many of those people paid (settled after 24 hours
 * since 10-06, credited within 72), each one's chance of being the best, and the controls: turn on / off / retire,
 * draft new ones now, add one by hand. 10-06 瘦身: at most two versions per slot, the 4th+ cast's block is fixed on the
 * membership, AI drafts wait for a yes.
 */
/** 10-05: what a version's segment means, for the owner */
function segmentZh(seg: string): string {
  const sg = segmentOf(seg);
  if (!sg) return seg;
  return sg.kind === "lean" ? "上一句偏凶的人" : `${TOPIC_ZH[sg.value] ?? sg.value}类问题`;
}

const SLOT_ZH: Record<Slot, string> = { n1: "第 1 卦（和免费一句一起出；10-31→11-05 没有免费一句时单独出）", n2: "同一件事第 2 卦", n3: "同一件事第 3 卦", n4: "同一件事第 4 卦及以后（含问满）· 11-05 起推 1 日通卡／合起来读", style: "免费那一句的连法（第 2 卦起）" };
const STATUS_ZH: Record<Variant["status"], string> = { active: "上线", draft: "待定", retired: "退役" };
const SOURCE_ZH: Record<Variant["source"], string> = { seed: "手写", ai: "AI 起草", admin: "后台加的", personal: "按人写" };
const RUN_ZH: Record<string, string> = { draft: "起草", draft_week: "每周起草", draft_wait: "数据不够，先不起草", purge: "清理一年前的起卦记录", retire_check: "检查该退役的", claim_check: "说法核对", add: "后台新增", status_active: "上线", status_draft: "改为待定", status_retired: "退役", review_start: "AI 分析开始", review: "AI 分析完成", review_week: "每周 AI 分析", review_wait: "人数还不够，先不分析", slim_1006: "10-06 瘦身：退役的版本", auto_1017: "10-17 全自动：清掉的待定草稿" };
const pct = (x: number | null) => (x === null ? "—" : `${(x * 100).toFixed(1)}%`);
/** 「3/40 · 7.5%」: the two numbers a rate is made of, then the rate */
const rate = (a: number, b: number) => (b ? <><span className="tabular-nums">{a}/{b}</span> <b className="tabular-nums">{((100 * a) / b).toFixed(1)}%</b></> : <span className="opacity-40">—</span>);
const STAGE_ZH: Record<StageKey, string> = { "1": "一件事的第 1 卦", "2": "同一件事第 2 卦", "3": "同一件事第 3 卦", "4+": "同一件事第 4 卦及以后" };
const SENS_ZH: Record<string, string> = { health: "健康", sex: "性", crime: "犯罪前科" };
const PLAN_ZH: Record<string, string> = { monthly: "月付", yearly: "年付", month: "月付", year: "年付" };
const WINDOWS: [string, string][] = [["1", "今天"], ["7", "7 天"], ["30", "30 天"], ["all", "全部（10-03 起）"]];
const gap = (ms: number | null) => {
  if (ms === null) return "—";
  const m = Math.round(ms / 60_000);
  return m < 60 ? `${m} 分钟` : m < 48 * 60 ? `${Math.round(m / 6) / 10} 小时` : `${Math.round(m / 144) / 10} 天`;
};
const money = (p: PurchaseRec) => {
  if (!p.cents) return "";
  const cur = (p.currency ?? "").toUpperCase();
  return isCurrency(cur) ? formatMoney(cur as never, p.cents, "en") : `${cur} ${(p.cents / 100).toFixed(2)}`;
};
const bought = (p: PurchaseRec) =>
  p.kind === "membership"
    ? `开会员（${PLAN_ZH[p.plan ?? ""] ?? p.plan ?? "会员"}）`
    : `${tierLabelZh(p.tier)}${p.firstDeep ? "（首次价）" : ""} ${money(p)}${p.state === "refunded" ? "（已退款）" : p.state === "disputed" ? "（争议中）" : ""}`;
const clipQ = (s: string, n = 32) => (s.length > n ? `${s.slice(0, n)}…` : s);

export default async function NudgesPage({ searchParams }: { searchParams: Promise<{ key?: string; denied?: string; msg?: string; w?: string; d?: string; report?: string }> }) {
  const { key, denied, msg, w, d: dimParam, report } = await searchParams;
  if (!(await isAdmin((await cookies()).get(ADMIN_COOKIE)?.value, key))) return <AdminLogin denied={denied === "1"} back="/admin/nudges" />;
  const now = Date.now();
  const win = WINDOWS.some(([k]) => k === w) ? w! : "all";
  const since = win === "all" ? PEOPLE_SINCE : win === "1" ? homeDayStart(now) : now - Number(win) * 86_400_000;
  const co = cohort(since);
  const fn = stageFunnel(since, now, co);
  // 10-03 分组看转化: one dimension at a time
  const dim: Dim = (DIMS.some((x) => x.id === dimParam) ? dimParam : "topic") as Dim;
  // 10-14 按人的行为分组: the person tables need the window's events (price seen / clicked / checkout) and revisits
  const feats = PERSON_DIMS.has(dim) ? personFeatures(co, since, readEvents(Math.min(90, Math.ceil((now - since) / 86_400_000) + 1), { only: ["price_seen", "reading_click", "checkout_start"] })) : undefined;
  const seg = segmentTable(since, dim, co, feats);
  // 10-03 AI 每周分析: the asked-for report, else the latest
  const reviews = recentReviews(12);
  const rv = (report && /^\d+$/.test(report) ? reviewById(Number(report)) : null) ?? reviews[0] ?? null;
  // a proposal's status now (it may have been switched on, lost and retired, or set aside since the report)
  const nowVariant = new Map(variants().map((v) => [v.id, v]));
  const proposalStatus = (id: string) => {
    const v = nowVariant.get(id);
    if (v?.status === "active") return <span className="text-emerald-700">已上线</span>;
    if (v?.status === "retired") return <span className="opacity-60">已退役</span>;
    // waiting: say why when the claim check doubted it (说法核对)
    const why = v?.status_why?.match(/说法核对.*$/)?.[0];
    return <>待定{why ? <span className="block whitespace-normal max-w-[240px] opacity-70">{why}</span> : null}</>;
  };
  const codeLink = (code: string): ReactNode => {
    const c = rv?.body?.codes[code];
    const href = c?.customerId ? `/admin/people/c${c.customerId}` : c?.bid ? `/admin/people/${c.bid}` : null;
    return href ? <a key={code} href={href} className="underline underline-offset-2 font-mono">{code}</a> : <span key={code} className="font-mono">{code}</span>;
  };
  const slotStats = new Map<Slot, Map<string, VariantStats>>(ALL_SLOTS.map((s) => [s, variantStats(s, now)]));
  const label = personLabels([
    ...fn.stages.flatMap((s) => s.payers), ...fn.noCast,
    ...[...slotStats.values()].flatMap((m) => [...m.values()].flatMap((v) => v.payers.map((p) => ({ bid: p.bid, customerId: p.purchase.customerId })))),
  ].map((r) => ({ bid: r.bid, customerId: "customerId" in r ? r.customerId : null })));
  const whoLink = (bid: string | null, customerId: number | null): ReactNode => {
    const l = label(bid, customerId);
    return <a href={l.href} className={`underline underline-offset-2 ${l.known ? "" : "opacity-70"}`}>{l.who}</a>;
  };
  const hidden = key ? <input type="hidden" name="key" value={key} /> : null;
  const payerTable = (rows: PayerRow[], withCast: boolean) => (
    <div className="overflow-x-auto -mx-4 px-4">
      <table className="text-sm w-full min-w-[980px]">
        <thead><tr className="text-left text-xs opacity-50">
          <th className="py-1 font-normal">付款时间</th><th className="font-normal">是谁</th><th className="font-normal">买了什么</th>
          {withCast && <><th className="font-normal">付款前那一卦</th><th className="font-normal">这件事</th><th className="font-normal">隔了多久</th><th className="font-normal">买的是这一卦吗</th><th className="font-normal">那一卦的引导 / 连法</th></>}
        </tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={`${r.purchase.t}-${i}`} className={`border-t border-black/5 align-top ${r.purchase.state === "refunded" ? "opacity-50" : ""}`}>
            <td className="py-1.5 pr-3 whitespace-nowrap tabular-nums text-xs">{homeMinute(r.purchase.t).slice(5)}</td>
            <td className="pr-3 whitespace-nowrap">{whoLink(r.bid, r.customerId)}</td>
            <td className="pr-3 whitespace-nowrap">{bought(r.purchase)}</td>
            {withCast && <>
              <td className="pr-3 max-w-[260px]">{r.cast?.question ? `「${clipQ(r.cast.question)}」` : <span className="opacity-60">（{SENS_ZH[r.cast?.sensitive ?? ""] ?? "?"}类问题，原文不存）</span>}<span className="opacity-50 text-xs"> · 第 {r.n ?? 1} 卦 · {r.cast ? homeMinute(r.cast.t).slice(5) : ""}</span></td>
              <td className="pr-3 max-w-[200px] text-xs">{r.matter ? <>{r.matter.title && !r.matter.title.startsWith("[") ? clipQ(r.matter.title, 18) : r.matter.sensitive ? `（${SENS_ZH[r.matter.sensitive] ?? r.matter.sensitive}类）` : "（未命名）"}<span className="opacity-50"> · 共 {r.matter.casts} 卦 · 首卦 {homeMinute(r.matter.firstAt).slice(5, 10)}</span></> : "—"}</td>
              <td className="pr-3 whitespace-nowrap tabular-nums text-xs">{gap(r.gapMs)}</td>
              <td className="pr-3 whitespace-nowrap text-xs">{r.forThisCast ? <span className="text-emerald-700">是</span> : r.purchase.kind === "membership" ? "开了会员" : "不是"}</td>
              <td className="text-xs whitespace-nowrap">{r.cast?.nudge ? <>{r.cast.nudge}<span className="opacity-50">{r.cast.nudgeSeen ? "（显示了）" : "（没显示）"}</span></> : <span className="opacity-40">—</span>}{r.cast?.style ? <span className="opacity-60"> · {r.cast.style}</span> : null}</td>
            </>}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );

  return (
    <AdminShell
      title="付费话术学习"
      nav={[{ href: "#repeat", label: "反复问对照" }, { href: "#stages", label: "按阶段的转化" }, ...ALL_SLOTS.map((s) => ({ href: `#${s}`, label: SLOT_ZH[s] }))]}
    >
      {msg && <p className="text-sm mb-4 text-emerald-700">{msg}</p>}
      <p className="text-xs opacity-60 mb-6 max-w-3xl">
        同一个人就同一件事第 2 次起卦起，价格上面会多一块引导，免费那一句也会连着前几卦写。第 2、3 卦的引导各有两个手写版本（第 3 卦的第二个只给上一句偏凶的人）加一个按人写的，按「看到之后这个人有没有付款」自动分配：表现好的多给人看，所有上线版本都还会被试；第 4 卦起固定一句推会员，不抽签。
        10-06 起：看到后 24 小时内没付款就算「没付」（付款归到之前 72 小时内最后看到的那一块）；新版本从这一格的平均付费率起步，不再从五成起步。
        学习 <b>{learnOn() ? "开" : "关（所有人看手写的第一版）"}</b> · AI 起草 <b>{aiOn() ? "开" : "关"}</b>（{aiMode() === "auto" ? `过了检查直接上线、没过直接不要，每格 ${aiMax()} 个 AI 位子（第 2、3 卦和免费那一句的连法；第 4 卦起固定不起草）` : "只起草，等你在这里点上线"}）·
        起卦记录 <b>{castLogOn() ? "开" : "关"}</b>（健康 / 性 / 犯罪前科类问题{keepSensitiveText() ? "存原文" : "只记类别，不存原文"}）·
        上次每周起草 {lastRun("draft_week") ? homeMinute(lastRun("draft_week")!) : "还没有"}。
      </p>

      {/* 10-13 同一件事反复问 (lib/repeat-test.ts): half the browsers — ① read-together block from the 4th cast, ② lock
          from the 6th in 3 days, ③ the line waits for an address from the 3rd */}
      {(() => {
        const st = repeatTestStats();
        const gate: Record<string, number> = {};
        for (const e of readEvents(30, { only: ["repeat_gate"] })) if (e.e === "repeat_gate" && e.t >= REPEAT_TEST_SINCE) gate[e.method ?? "?"] = (gate[e.method ?? "?"] ?? 0) + 1;
        const pc = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "—");
        return (
          <Section id="repeat" title="同一件事反复问 · 对照" sub={`${repeatTestOn() ? "进行中" : "已停（REPEAT_TEST=off）"} · ${homeMinute(REPEAT_TEST_SINCE)} 起 · 非会员、问到第 4 卦以上的事`}>
            <table className="text-sm">
              <thead><tr className="text-left text-xs opacity-50"><th className="py-1 pr-6 font-normal"></th><th className="pr-6 font-normal">事数</th><th className="pr-6 font-normal">卦数</th><th className="font-normal">有付费 · 比例</th></tr></thead>
              <tbody>
                <tr className="border-t border-black/5"><td className="py-1 pr-6">新流程（一半）</td><td className="pr-6 tabular-nums">{st.arm.matters}</td><td className="pr-6 tabular-nums">{st.arm.casts}</td><td className="tabular-nums">{st.arm.paid} · {pc(st.arm.paid, st.arm.matters)}</td></tr>
                <tr className="border-t border-black/5"><td className="py-1 pr-6">原流程（一半）</td><td className="pr-6 tabular-nums">{st.ctl.matters}</td><td className="pr-6 tabular-nums">{st.ctl.casts}</td><td className="tabular-nums">{st.ctl.paid} · {pc(st.ctl.paid, st.ctl.matters)}</td></tr>
              </tbody>
            </table>
            <p className="text-xs opacity-60 mt-2">新流程这一半：第 3 卦起要信箱 {gate.email_ask ?? 0} 次 → 留了 {gate.email_given ?? 0} 次；第 6 卦锁住 {gate.lock ?? 0} 次。</p>
            <Legend>新流程：第 4 卦起价格上面那块换成「把這 N 卦合起來斷」（深断，没买过深断的人是首次价）；同一件事 3 天内第 6 卦起不再给新的一句；第 3 卦起看免费那句前要留信箱（已登录或已留过的不问）。原流程照旧（第 4 卦起推会员）。按浏览器一半一半，同一个人始终在同一边。付费 = 这件事任何一卦付过钱。停掉：REPEAT_TEST=off。</Legend>
          </Section>
        );
      })()}
      <Section
        id="stages"
        title="按阶段的转化"
        sub={`${WINDOWS.find(([k]) => k === win)![1]} · 起过卦的 ${fn.casters} 人 · 其中付过钱 ${fn.payersInCohort} 人 · 不含会员（${co.memberPeople} 位会员的 ${co.memberCasts} 卦）`}
        right={<>{WINDOWS.map(([k, l]) => <a key={k} href={`/admin/nudges?w=${k}#stages`} className={k === win ? "underline underline-offset-4" : "opacity-50 hover:opacity-100"}>{l}</a>)}</>}
      >
        <div className="overflow-x-auto -mx-4 px-4 mb-2">
          <table className="text-sm w-full min-w-[860px]">
            <thead><tr className="text-left text-xs opacity-50">
              <th className="py-1 font-normal">阶段</th><th className="font-normal">走到这一步的人</th><th className="font-normal">看到付费引导</th><th className="font-normal">在这一步付钱的人</th>
              <th className="font-normal">转化（付钱 ÷ 走到）</th><th className="font-normal">看到引导的人里付钱</th><th className="font-normal">累计：到这一步为止付过钱 ÷ 起过卦</th><th className="font-normal">还在 24 小时内</th>
            </tr></thead>
            <tbody>{fn.stages.map((s) => {
              return (
                <tr key={s.k} className="border-t border-black/5">
                  <td className="py-2 pr-3 whitespace-nowrap"><a href={`#stage-${s.k}`} className="underline underline-offset-2">{STAGE_ZH[s.k]}</a></td>
                  <td className="tabular-nums">{s.reached}</td>
                  <td className="tabular-nums">{s.k === "1" ? <span className="opacity-40">—</span> : s.saw}</td>
                  <td className="tabular-nums">{s.paid ? <span className="text-emerald-700">{s.paid}</span> : 0}</td>
                  <td>{rate(s.paid, s.reached)}</td>
                  <td>{s.k === "1" ? <span className="opacity-40">—</span> : rate(s.sawPaid, s.saw)}</td>
                  <td>{rate(s.cumulative, fn.casters)}</td>
                  <td className="tabular-nums">{s.pending ? <span className="text-[var(--gold-text)]">{s.pending} 人</span> : <span className="opacity-40">0</span>}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
        <Legend>
          按人算：一个浏览器，或归到同一位客户名下的所有浏览器，算一个人；同一个人在两件事上都走到第 2 卦，也只算一次。
          「在这一步付钱」：买的就是这一卦的解读时算在这一卦；买别的（会员、别的卦）时算在他付款前的最后一卦——不限时间，下面的名单写了隔多久。
          「付钱」= 付费解读或开会员（含通卡；领取、会员额度不算），包括后来退款的（名单里灰色）。
          不含会员（10-04 起）：会员看不到价格和引导块，他们的卦不是要转化的漏斗——起卦时页面说这一卦由会员额度覆盖的、或那时这个人正在会员期内的卦都不算，会员的加购、增购也不算付钱；开会员本身算付钱（开会员之前的卦照算）。下面的分组表和每周 AI 分析读的旅程同样不含会员。
          时间窗口按「这一卦是什么时候起的」选人，之后什么时候付的钱都算；「还在 24 小时内」的人可能还会付，所以最近一天的转化率偏低。
          起卦记录 10-03 才开始，之前的卦和付款不在这里。
        </Legend>

        {fn.stages.map((s) => (
          <div key={s.k} id={`stage-${s.k}`} className="mt-6">
            <p className="text-sm mb-2"><b>{STAGE_ZH[s.k]}</b> 付钱的 {s.paid} 人{s.payers.length > s.paid ? `（${s.payers.length} 笔）` : ""}</p>
            {s.payers.length ? payerTable(s.payers, true) : <p className="text-xs opacity-50">还没有。</p>}
          </div>
        ))}
        <div className="mt-6">
          <p className="text-sm mb-2"><b>付款前没有起卦记录的</b> {fn.noCast.length} 笔</p>
          {fn.noCast.length ? payerTable(fn.noCast, false) : <p className="text-xs opacity-50">没有。</p>}
          <Legend>这台浏览器（或这位客户）付款前没有记到起卦：起卦在 10-03 之前、在没记到的浏览器上起的、从邮件或解读页直接买的、或开会员前没起过卦。列在这里，是为了窗口里每一笔付款都看得到。</Legend>
        </div>
      </Section>

      <Section
        id="groups"
        title="分组看转化"
        sub={`${WINDOWS.find(([k]) => k === win)![1]} · 按${DIMS.find((x) => x.id === dim)!.zh}`}
        right={<>
          {DIMS.filter((x) => !PERSON_DIMS.has(x.id)).map((x) => <a key={x.id} href={`/admin/nudges?w=${win}&d=${x.id}#groups`} className={x.id === dim ? "underline underline-offset-4" : "opacity-50 hover:opacity-100"}>{x.zh}</a>)}
          <span className="opacity-30">｜按人的行为：</span>
          {DIMS.filter((x) => PERSON_DIMS.has(x.id)).map((x) => <a key={x.id} href={`/admin/nudges?w=${win}&d=${x.id}#groups`} className={x.id === dim ? "underline underline-offset-4" : "opacity-50 hover:opacity-100"}>{x.zh}</a>)}
        </>}
      >
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="text-sm w-full min-w-[860px]">
            <thead><tr className="text-left text-xs opacity-50">
              <th className="py-1 font-normal">{DIMS.find((x) => x.id === dim)!.zh}</th><th className="font-normal">全部阶段（付钱÷起过卦）</th>
              {STAGES.map((k) => <th key={k} className="font-normal">{STAGE_ZH[k]}</th>)}
            </tr></thead>
            <tbody>{seg.values.map((v) => (
              <tr key={v.key} className="border-t border-black/5">
                <td className="py-1.5 pr-3 whitespace-nowrap">{v.label}</td>
                <td className="pr-3 whitespace-nowrap">{rate(seg.all[v.key]!.paid, seg.all[v.key]!.reached)}</td>
                {STAGES.map((k) => <td key={k} className="pr-3 whitespace-nowrap">{rate(seg.byStage[k][v.key]!.paid, seg.byStage[k][v.key]!.reached)}</td>)}
              </tr>
            ))}</tbody>
          </table>
        </div>
        <Legend>
          和上面一样按人算、按「付款前那一卦」归：一个人在这一组里起过卦就算走到，付款前那一卦在这一组就算付钱。一个人可能在几组里都出现（问过感情也问过事业）。
          「免费一句吉凶」由一个小模型读那一句判断（偏吉 / 看条件 / 偏凶），10-03 起才有；「在哪个 App 打开」「手机还是电脑」也是 10-03 晚上才开始记，之前的卦写「之前没记」。
          <br />「按人的行为」六组（10-14）：按这个人在这段时间里**做了什么**分——摇了几卦、一件事最多追问到第几卦、是否多半在深夜 0–5 点摇、看到的免费一句多半是吉是凶、看价格走到哪一步（没看到 / 看到没点 / 点了没去付 / 到付款页没付 / 付了）、回访答过什么。只记行为，不猜心理；一个人只在每组的一行里。深夜一组是用来**少推**的，不是多推。
          话术按「问题类别」分组学习：每个版本在每一类问题上的成绩分开算，数据少的类别先借全部的成绩（见下面各版本的「分类成绩」）。
        </Legend>
      </Section>

      <Section
        id="review"
        title="AI 每周分析"
        sub={reviewOn() ? `开 · 每周一次，读最近 ${REVIEW_DAYS} 天起过卦的人（最多 ${REVIEW_MAX} 个）` : "关（NUDGE_REVIEW=off）"}
        right={<form method="post" action="/api/admin/nudges">{hidden}<input type="hidden" name="action" value="review" /><button className="border border-black/30 rounded-sm px-3 py-1 text-sm">现在分析一次（后台跑，约 2–4 分钟）</button></form>}
      >
        {!rv && <p className="text-sm opacity-50">还没有分析过。最近两周起过卦的人够 30 个时，每周会自动跑一次；也可以点右上角现在跑。</p>}
        {rv && (
          <div className="max-w-4xl">
            <p className="text-xs opacity-60 mb-3">
              #{rv.id} · {homeMinute(rv.at)} · {rv.by === "cron" ? "每周自动" : "手动"} · 读了 {homeMinute(rv.window_from).slice(5, 10)} 到 {homeMinute(rv.window_to).slice(5, 10)} 起过卦的 {rv.people ?? "?"} 人（其中付过钱 {rv.payers ?? "?"} 人）
              {rv.body ? ` · 逐条读了 ${rv.body.picked.payers + rv.body.picked.repeat + rv.body.picked.sampled} 段旅程（付过钱的 ${rv.body.picked.payers}、反复问的 ${rv.body.picked.repeat}、抽样 ${rv.body.picked.sampled}），分 ${rv.body.batches} 批` : ""}
            </p>
            {rv.status === "running" && <p className="text-sm text-[var(--gold-text)]">正在分析，过几分钟刷新。</p>}
            {rv.status === "failed" && <p className="text-sm text-[var(--cinnabar)]">这次没跑完：{/Unterminated|Unexpected (end|token)|cut off/.test(rv.error ?? "") ? `模型的回答写到一半被截断，没读出来（${rv.error}）` : rv.error}</p>}
            {rv.body?.notes?.length ? <p className="text-xs text-[var(--gold-text)] mb-3">{rv.body.notes.join("；")}。</p> : null}
            {rv.body && (
              <>
                <p className="text-[15px] leading-relaxed mb-4">{rv.body.summary}</p>
                {rv.body.findings.length > 0 && (
                  <ol className="space-y-3 mb-5">{rv.body.findings.map((f, i) => (
                    <li key={i} className="text-sm">
                      <b>{f.title}</b>{f.strength === "weak" ? <span className="text-xs opacity-50">（人少，先当线索）</span> : null}
                      <p className="opacity-80 mt-0.5">{f.detail}</p>
                      {f.people.length > 0 && <p className="text-xs mt-0.5 opacity-70">涉及：{f.people.map((c, k) => <span key={c}>{k ? "、" : ""}{codeLink(c)}</span>)}</p>}
                    </li>
                  ))}</ol>
                )}
                <div className="grid md:grid-cols-2 gap-6 mb-5 text-sm">
                  <div><p className="text-xs opacity-50 mb-1">为什么没付（各批读到的）</p><ul className="list-disc pl-5 space-y-0.5">{rv.body.why_not_paying.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                  <div><p className="text-xs opacity-50 mb-1">付钱的人有什么共同点</p><ul className="list-disc pl-5 space-y-0.5">{rv.body.what_payers_share.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                </div>
                {rv.body.owner.length > 0 && (
                  <div className="mb-5 text-sm"><p className="text-xs opacity-50 mb-1">要你决定的（AI 不会自己改）</p><ul className="list-disc pl-5 space-y-0.5">{rv.body.owner.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                )}
                {rv.body.copy.length > 0 && (
                  <div className="mb-5">
                    <p className="text-xs opacity-50 mb-1">它写的新话术（过检查的先待定，你点上线后进入自动分配，看付款数据定输赢）</p>
                    <table className="text-sm w-full"><tbody>{rv.body.copy.map((c, i) => (
                      <tr key={i} className="border-t border-black/5 align-top">
                        <td className="py-1.5 pr-3 whitespace-nowrap text-xs">{c.slot === "n1" ? "第 1 卦" : c.slot === "n2" ? "第 2 卦" : c.slot === "n3" ? "第 3 卦" : "第 4 卦起"}{c.for_topic ? ` · 只给${TOPIC_ZH[c.for_topic] ?? c.for_topic}类` : ""}</td>
                        <td className="pr-3"><b>{c.title}</b><br />{c.body}<br /><span className="text-xs opacity-60">按钮：{c.cta}</span><p className="text-xs opacity-50 mt-0.5">为什么：{c.why}</p></td>
                        <td className="text-xs whitespace-nowrap">{c.id ? <>{proposalStatus(c.id)}<br /><span className="font-mono opacity-50">{c.id}</span></> : <span className="text-[var(--cinnabar)] whitespace-normal">没过检查：{(c.rejected ?? []).join("；")}</span>}</td>
                      </tr>
                    ))}</tbody></table>
                  </div>
                )}
                {rv.body.styles.length > 0 && (
                  <div className="mb-2">
                    <p className="text-xs opacity-50 mb-1">它提的免费那一句新连法（要你在下面「连法」那格点上线才会用）</p>
                    <ul className="text-sm space-y-1">{rv.body.styles.map((x, i) => (
                      <li key={i}><b>{x.label}</b> <span className="text-xs opacity-70">{x.prompt}</span> <span className="text-xs opacity-50">— {x.why}</span> {x.id ? <span className="text-xs">（{proposalStatus(x.id)} · <span className="font-mono">{x.id}</span>）</span> : <span className="text-xs text-[var(--cinnabar)]">（没过检查：{(x.rejected ?? []).join("；")}）</span>}</li>
                    ))}</ul>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {reviews.length > 1 && (
          <p className="text-xs mt-4 opacity-70">以前的报告：{reviews.filter((r) => r.id !== rv?.id).map((r, i) => <span key={r.id}>{i ? " · " : ""}<a className="underline underline-offset-2" href={`/admin/nudges?report=${r.id}#review`}>#{r.id} {homeMinute(r.at).slice(5, 10)}{r.status === "failed" ? "（失败）" : r.status === "running" ? "（在跑）" : ""}</a></span>)}</p>
        )}
        <Legend>
          AI 逐条读的是匿名的「旅程」：每个人用代号（P1、P2…，顺序打乱），只给它来源、设备与 App、语言，以及每一卦的问题、免费那一句、偏吉偏凶、看到哪版引导、有没有买——不给邮箱、账号和浏览器编号；健康 / 性 / 犯罪前科类问题本来就不存原文。代号点进去是那个人的轨迹（只在这里有对照，不发给 AI）。
          它写的新话术和别的版本一样要过检查——守则（不催、不打折、不保证、不吓人……）、去重（和已有版本同标题或大半字一样的不要）、说法核对（一个小模型把它当成这一阶段每个人都会看到的话读一遍，可能对某些人不成立的说法，例如「答案在变」，就先待定等你点头）——10-17 起全自动：过了检查、格里有 AI 位子就直接上线，没过或没位子就不要（学习记录里写原因），上线后由付款数据决定留不留；价格、页面这些仍一律等你点头。
        </Legend>
      </Section>

      {ALL_SLOTS.map((slot) => {
        const stats = slotStats.get(slot)!;
        const list = variants(slot);
        return (
          <Section key={slot} id={slot} title={SLOT_ZH[slot]} sub={`${list.filter((v) => v.status === "active").length} 个上线`}>
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="text-sm w-full min-w-[900px]">
                <thead><tr className="text-left text-xs opacity-50"><th className="py-1 font-normal">版本</th><th className="font-normal">文字（{slot === "style" ? "给模型的指令" : "繁体"}）</th><th className="font-normal">看到</th><th className="font-normal">满 24 小时</th><th className="font-normal">付款</th><th className="font-normal">转化</th><th className="font-normal">最优概率</th><th className="font-normal">状态</th></tr></thead>
                <tbody>{list.map((v) => {
                  const s = stats.get(v.id);
                  const tx = slot === "style" ? v.texts["*"] : v.texts["zh-hant"] ?? v.texts.zh ?? v.texts.en;
                  return (
                    <tr key={v.id} className={`border-t border-black/5 align-top ${v.status === "retired" ? "opacity-40" : ""}`}>
                      <td className="py-2 pr-3 whitespace-nowrap"><span className="font-mono text-xs">{v.id}</span><br /><span className="text-xs opacity-50">{SOURCE_ZH[v.source]} · {isPersonal(v) ? "九语" : localesOf(v).join(" ")}</span>
                        {v.segment && <><br /><span className="text-xs text-[var(--gold-text)]">只给：{segmentZh(v.segment)}</span></>}
                        {/* 10-06: a block that sells the membership — its button goes to the membership page, with the one-off month under it */}
                        {slot !== "style" && variantGoal(v) === "member" && <><br /><span className="text-xs text-[var(--gold-text)]">按钮去会员页（下面带通卡链接）</span></>}
                        {/* 10-12: the 4th+ control — one browser in ten sees it, whatever its status */}
                        {v.id === N4_CONTROL_ID && <><br /><span className="text-xs text-[var(--cinnabar)]">10-12 起作对照：按浏览器固定抽 {Math.round(N4_CONTROL_SHARE * 100)}% 的人看它（退役也照样出）</span></>}</td>
                      <td className="pr-3 max-w-[380px]">
                        {isPersonal(v) ? (
                          // 10-04 按人写的引导: no words of its own — what it wrote lately, for the owner to read
                          <>
                            <b>每个人不同</b>
                            <p className="text-xs opacity-70 mt-0.5">抽到它时，AI 读这个人这件事前几卦的问题、免费那一句和吉凶、问满没给那一句的卦，还有他看过的引导，专门写给他；过守则、不引他的原话和卦名、按他自己的事实做说法核对，有一样没过或 {Math.round(PERSONAL_BUDGET_MS / 1000)} 秒内没写好，就换成现成版本（算在现成版本头上）。{personalOn() ? "" : "（现在关着：NUDGE_PERSONAL=off）"}</p>
                            {recentPersonal(v.id, 3).map((x, i) => (
                              <p key={i} className="text-xs mt-1.5 opacity-80">
                                <span className="opacity-50">{homeMinute(x.at).slice(5)} · {x.locale}{x.seen ? "" : " · 没显示"}：</span>
                                <b>{x.text.title}</b> {x.text.body} <span className="opacity-60">〔{x.text.cta}〕</span>
                              </p>
                            ))}
                          </>
                        ) : tx ? (slot === "style"
                          ? <><b>{tx.title}</b><br /><span className="text-xs opacity-70">{tx.body}</span></>
                          : <><b>{tx.title}</b><br />{tx.body}<br /><span className="text-xs opacity-60">按钮：{tx.cta}</span></>) : <span className="opacity-50">（没有繁体）</span>}
                        {v.notes && <p className="text-xs opacity-50 mt-1">想法：{v.notes}</p>}
                        {/* 10-03 按组挑版本: how this version does on each kind of question (only kinds with settled showings) */}
                        {s && Object.values(s.byTopic).some((t) => t.settled > 0) && (
                          <p className="text-xs mt-1 opacity-70">分类成绩：{Object.entries(s.byTopic).filter(([, t]) => t.settled > 0).sort((a, b) => b[1].settled - a[1].settled).map(([k, t]) => `${TOPIC_ZH[k] ?? k} ${t.paid}/${t.settled}`).join(" · ")}</p>
                        )}
                        {/* 10-05 不顺卦话术: how it does after a line that leaned against the reader (every version is judged on these casts there) */}
                        {s?.byLean.bad && s.byLean.bad.settled > 0 && (
                          <p className="text-xs mt-0.5 opacity-70">上一句偏凶时：{s.byLean.bad.paid}/{s.byLean.bad.settled}</p>
                        )}
                        {v.status_why && <p className="text-xs opacity-40 mt-0.5">{v.status_why}</p>}
                        {/* 10-03 (Neil: 「把每个阶段的所有付费客户都写上去」): who paid after seeing this version, and how soon */}
                        {!!s?.payers.length && (
                          <p className="text-xs mt-1.5">
                            <span className="opacity-50">付款的人：</span>
                            {s.payers.map((p, i) => (
                              <span key={`${p.purchase.t}-${i}`} className="whitespace-nowrap">
                                {i ? "、" : ""}{whoLink(p.bid, p.purchase.customerId)}
                                <span className="opacity-50">（{homeMinute(p.purchase.t).slice(5)} · 看到后 {gap(p.purchase.t - p.shownAt)} · {bought(p.purchase)}）</span>
                              </span>
                            ))}
                          </p>
                        )}
                      </td>
                      <td className="tabular-nums">{s?.shown ?? 0}</td>
                      <td className="tabular-nums">{s?.settled ?? 0}{s?.pending ? <span className="opacity-40 text-xs"> +{s.pending} 等</span> : null}</td>
                      <td className="tabular-nums">{s?.paid ?? 0}</td>
                      <td className="tabular-nums whitespace-nowrap">{s?.settled ? <>{s.paid}/{s.settled} <b>{pct(s.rate ?? null)}</b></> : "—"}</td>
                      <td className="tabular-nums">{v.status === "active" ? pct(s?.pBest ?? null) : "—"}</td>
                      <td className="whitespace-nowrap">
                        <span className={v.status === "active" ? "text-emerald-700" : ""}>{STATUS_ZH[v.status]}</span>
                        <form method="post" action="/api/admin/nudges" className="mt-1 flex gap-2 text-xs">
                          {hidden}
                          <input type="hidden" name="action" value="status" />
                          <input type="hidden" name="id" value={v.id} />
                          {v.status !== "active" && <button name="status" value="active" className="underline underline-offset-2">上线</button>}
                          {v.status !== "draft" && <button name="status" value="draft" className="underline underline-offset-2 opacity-70">待定</button>}
                          {v.status !== "retired" && <button name="status" value="retired" className="underline underline-offset-2 opacity-70">退役</button>}
                        </form>
                      </td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
            <form method="post" action="/api/admin/nudges" className="mt-3 flex flex-wrap items-end gap-3 text-sm">
              {hidden}
              <input type="hidden" name="action" value="draft" />
              <input type="hidden" name="slot" value={slot} />
              {slot !== "style" && (
                <label className="flex flex-col text-xs opacity-70">语言
                  <select name="locale" defaultValue="zh-hant" className="border border-black/20 rounded-sm px-2 py-1 text-sm">
                    {["zh-hant", "zh", "en", "ja", "ko", "fr", "de", "es", "pt"].map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </label>
              )}
              <button className="border border-black/30 rounded-sm px-3 py-1">现在让 AI 起草 2 个新版本</button>
            </form>
            {slot !== "style" && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer opacity-70">手写一个版本（同样的检查，通过就上线）</summary>
                <form method="post" action="/api/admin/nudges" className="mt-2 grid gap-2 max-w-xl">
                  {hidden}
                  <input type="hidden" name="action" value="add" />
                  <input type="hidden" name="slot" value={slot} />
                  <select name="locale" defaultValue="zh-hant" className="border border-black/20 rounded-sm px-2 py-1">{["zh-hant", "zh", "en", "ja", "ko", "fr", "de", "es", "pt"].map((l) => <option key={l} value={l}>{l}</option>)}</select>
                  <select name="topic" defaultValue="" className="border border-black/20 rounded-sm px-2 py-1"><option value="">所有类别的问题</option>{Object.entries(TOPIC_ZH).map(([k, l]) => <option key={k} value={k}>只给{l}类问题</option>)}<option value="lean:bad">只给上一句偏凶的人</option></select>
                  <input name="title" placeholder="标题（可用 {n} {span}）" className="border border-black/20 rounded-sm px-2 py-1" />
                  <textarea name="body" placeholder="正文（不能有数字、限时、折扣、保证、吓人的话）" rows={2} className="border border-black/20 rounded-sm px-2 py-1" />
                  <input name="cta" placeholder="按钮，结尾要有 · {price}" className="border border-black/20 rounded-sm px-2 py-1" />
                  <button className="justify-self-start border border-black/30 rounded-sm px-3 py-1">加上去</button>
                </form>
              </details>
            )}
          </Section>
        );
      })}

      <Section id="runs" title="学习记录" sub="最近 30 条">
        <ol className="text-sm space-y-1">{recentRuns(30).map((r, i) => (
          <li key={`${r.at}-${i}`} className="flex gap-3"><span className="opacity-40 tabular-nums text-xs whitespace-nowrap">{homeMinute(r.at)}</span><span>{RUN_ZH[r.kind] ?? r.kind}</span><span className="opacity-60 text-xs break-all">{r.detail}</span></li>
        ))}</ol>
        <Legend>
          「满 24 小时」：看到之后已经过了 24 小时（或者已经付款）的人数，只有这些算进转化；还没满的写在「等」里。一笔付款只记给他付款前 72 小时内最后看到的那一块。10-06 之前「没付」要等 72 小时才算，付款却立刻算，所以前三天的转化率看着有八九成、分配也跟着先中奖的版本走——10-03 到 10-06 归到引导块的 24 笔付款全在看到后 17 分钟内，24 小时一笔都不会漏。
          「最优概率」：按现在的数据，这个版本是这一格里最好的概率；新版本从这一格的平均付费率起步（算 20 次的分量），不再从五成起步。10-17 起所有版本满 80 人、最优概率低于 2% 都会自动退役（每格至少留两个；退了可以在这里点回来）；「按人写」另有一条：满 150 次、付费率不到这一格现成版本合计的 1.5 倍就退（它每次都要调一次模型）。
          「按人写」（10-04）：第 2、3 卦各有一个没有固定文字的版本，抽到它时 AI 读这个人这件事的前几卦专门写给他，和别的版本一样按看到后付不付钱定输赢；10-17 复查按标准定去留（见进度表）。第 4 卦起的按人写 10-06 退役了：那一格改成固定推会员。同一个人 30 天内已经看过的现成版本，下一次不再抽给他（还有别的可抽时），按人写的每次都是新写的。
          10-06 瘦身：每格最多两个手写版本，多的退役（可以在这里点回来）；AI 起草的新版本 10-17 起过了检查直接上线（每格一个位子，第 4 卦起不起草），没人等着点。流量撑不起更细的学习——第 2 卦一天约 100 次曝光，要分出 5% 和 7% 得每个版本两千多次；大的想法走按人分组的对照测试（像 10-02 的预览测试），不丢进这里。
          每周起草新版本时 AI 看这张表的数字和文字（含分类成绩和「按人写」的成绩）；每周分析会逐条读匿名的起卦记录（见上面「AI 每周分析」）。
        </Legend>
      </Section>
    </AdminShell>
  );
}
