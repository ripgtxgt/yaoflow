import { minOf } from "@/lib/minmax";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { customerHadWinback, markOwnOrdersAsTest, membersForPanel, type MemberRow } from "@/lib/db";
import { INTERNAL_EMAILS } from "@/lib/internal";
import { refreshFx, toUsdCents } from "@/lib/live";
import { formatMoney, isCurrency } from "@/lib/money";
import { homeDay, homeMinute } from "@/lib/clock";
import { allowanceWindow, inPause } from "@/lib/subscription";
import { FEEDBACK_LABEL, periodSegment, planWinback, type Segment } from "@/lib/retain";
import { AdminLogin, AdminShell, Legend, Section, Stat } from "../ui";
import { passNoticeStats } from "@/lib/pass-notice";
import { GUARANTEE_WHY, guaranteeStats, passDaysOfRow, passName, passSales, passToMember, returnedAfterLeaving, usageLine, usageWithCaps } from "@/lib/admin-members";

export const dynamic = "force-dynamic";

/**
 * 会员 (09-23, Neil: 「月付会员有人取消下一次的订阅，面板上面是没有显示的……要不我们再做一个会员面板？」).
 *
 * 10-22 进度表 94 第一批 (Neil: 「我们的后台要怎么改呢？」→「好，可以的」): two blocks now — 会员 (a renewing plan, or one
 * we gave) and 通卡 (1 日／7 天／30 天, bought once, never renews). The 「额度用量」 table of the monthly-allowance days is
 * gone (nothing is counted against an allowance any more); each row says what was used this period instead — full
 * readings, tarot, lots, reports, chart questions — and how often a fair-use cap was met. 「单月会员」 is now the pass's
 * own length.
 */

const th = "py-2 pr-3 font-normal text-xs opacity-50 whitespace-nowrap text-left";
const td = "py-2 pr-3 whitespace-nowrap align-top";
const DAY = 86_400_000;

const money = (cur: string | null, minor: number | null) =>
  cur && minor != null ? (isCurrency(cur.toUpperCase()) ? formatMoney(cur.toUpperCase() as never, minor, "en") : `${cur} ${(minor / 100).toFixed(2)}`) : "—";
const day = (ms: number | null | undefined) => (ms ? homeDay(ms).slice(5) : "—");
const minute = (ms: number | null | undefined) => (ms ? homeMinute(ms).slice(5) : "—");
const monthlyUsd = (m: MemberRow) => (m.currency && m.amount_minor != null ? toUsdCents(m.plan === "year" ? Math.round(m.amount_minor / 12) : m.amount_minor, m.currency) : 0);

const isPass = (m: MemberRow) => m.stripe_subscription_id.startsWith("pass_");
const isComp = (m: MemberRow) => m.stripe_subscription_id.startsWith("comp_");

type MState = "renewing" | "ending" | "paused" | "past_due" | "gift" | "ended";
type PState = "live" | "queued" | "ended";
const endOf = (m: MemberRow) => m.cancel_at ?? m.period_end;
function memberState(m: MemberRow, now = Date.now()): MState {
  if (m.status === "past_due" || m.status === "unpaid") return "past_due";
  if (m.status !== "active" && m.status !== "trialing") return "ended";
  // 09-27: a row still marked active after its period ran out (the mirror missed the end) has ended
  if (m.period_end && m.period_end < now - DAY) return "ended";
  if (isComp(m)) return "gift";
  if (inPause(m, now)) return "paused";
  return m.cancel_at_period_end === 1 || m.cancel_at != null ? "ending" : "renewing";
}
function passState(m: MemberRow, now = Date.now()): PState {
  if (m.status === "scheduled") return "queued";
  if (m.status !== "active" || !m.period_end || m.period_end < now) return "ended";
  return "live";
}
const M_LABEL: Record<MState, string> = { renewing: "续订中", ending: "已关续订", paused: "暂停中", past_due: "扣款失败", gift: "赠送（不续订）", ended: "已结束" };
const M_CLASS: Record<MState, string> = { renewing: "", ending: "text-[var(--cinnabar)]", paused: "opacity-70", past_due: "text-[var(--cinnabar)]", gift: "opacity-70", ended: "opacity-50" };
const planLabel = (m: MemberRow) => (isPass(m) ? passName(passDaysOfRow(m)) : isComp(m) ? "赠送" : m.plan === "year" ? "年付" : "月付");
const SEG: Record<Segment, string> = { heavy: "高频", low: "低频", normal: "普通" };

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ key?: string; denied?: string; test?: string }> }) {
  const { key, denied, test } = await searchParams;
  if (!(await isAdmin((await cookies()).get(ADMIN_COOKIE)?.value, key))) return <AdminLogin denied={denied === "1"} back="/admin/members" />;
  markOwnOrdersAsTest(INTERNAL_EMAILS);
  await refreshFx();
  const now = Date.now();
  const showTest = test === "1";
  const everyone = membersForPanel();
  const all = everyone.filter((m) => showTest || m.test_flag !== 1);
  const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

  /* ---------------- 会员 ---------------- */
  const members = all.filter((m) => !isPass(m)).map((m) => ({ m, s: memberState(m, now) }));
  const by = (s: MState) => members.filter((x) => x.s === s);
  const renewing = by("renewing"), ending = by("ending"), paused = by("paused"), pastDue = by("past_due"), gifts = by("gift"), ended = by("ended");
  const liveMembers = [...pastDue, ...ending, ...paused, ...renewing, ...gifts];
  const paying = [...pastDue, ...ending, ...paused, ...renewing];
  const mrrNow = paying.reduce((a, x) => a + monthlyUsd(x.m), 0);
  const mrrNext = [...renewing, ...paused].reduce((a, x) => a + monthlyUsd(x.m), 0);
  const nextRenewals = renewing.filter((x) => x.m.period_end && x.m.period_end < now + 30 * DAY).sort((a, b) => (a.m.period_end ?? 0) - (b.m.period_end ?? 0));
  const returned = returnedAfterLeaving(all, now);

  /** the one letter three days before the end (lib/retain planWinback) — decided, or what it would be now */
  const winbackNote = (m: MemberRow): string => {
    if (m.retain_winback_kind) return m.retain_winback_kind.startsWith("skipped") ? `到期前不寄（${m.retain_winback_kind === "skipped:heavy" ? "高频" : "已寄过一次"}）` : `到期前那封已寄 ${day(m.retain_winback_at)}（${m.retain_winback_kind === "winback" ? "暂停／改年付" : "提醒"}）`;
    const seg = (m.retain_segment as Segment | null) ?? periodSegment(m, now);
    const p = planWinback({ segment: seg, plan: m.plan, hadBefore: customerHadWinback(m.customer_id) });
    return `${SEG[seg]} · ${p.send ? (p.letter === "winback" ? "到期前 3 天寄「暂停一个月／改年付」" : "到期前 3 天寄提醒") : p.kind === "skipped:heavy" ? "到期前不寄（高频）" : "到期前不寄（已寄过一次）"}`;
  };
  const leaveNote = (m: MemberRow) => {
    const bits: string[] = [];
    if (m.cancel_feedback || m.cancel_comment) bits.push(`原因：${m.cancel_feedback ? FEEDBACK_LABEL[m.cancel_feedback] ?? m.cancel_feedback : ""}${m.cancel_comment ? `「${m.cancel_comment}」` : ""}`);
    else if (m.cancel_at_period_end === 1 || m.cancel_at != null || m.status === "canceled") bits.push("原因：没填");
    if (m.retain_confirm_at) bits.push(`确认信 ${day(m.retain_confirm_at)}`);
    return bits;
  };

  const MemberTable = ({ rows, past = false }: { rows: { m: MemberRow; s: MState }[]; past?: boolean }) => (
    <div className="overflow-x-auto -mx-4 px-4">
      <table className="w-full text-sm min-w-[56rem]">
        <thead>
          <tr>
            <th className={th}>客户</th><th className={th}>档位</th><th className={th}>开通</th><th className={th}>{past ? "结束" : "本期到"}</th>
            <th className={th}>状态</th>{past ? null : <th className={th}>本期用了什么</th>}<th className={th}>{past ? "离开原因" : "关续订 · 到期前那封"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ m, s }) => {
            const u = past ? null : usageWithCaps(m.customer_id, allowanceWindow(m, now).since, now);
            const note = past ? leaveNote(m)
              : s === "ending" ? [...leaveNote(m), winbackNote(m)]
              : s === "paused" ? [`暂停 ${day(m.paused_from)}–${day(m.paused_until)}`]
              : s === "past_due" ? ["Stripe 会自动重试"] : [];
            return (
              <tr key={m.id} className="border-t border-black/5">
                <td className={td}><a className="underline underline-offset-4" href={`/admin/customers/${m.customer_id}`}>{m.email}</a>{m.test_flag === 1 ? <span className="ml-1 opacity-40">自测</span> : null}</td>
                <td className={td}>{planLabel(m)}{isComp(m) ? "" : ` · ${money(m.currency, m.amount_minor)}`}</td>
                <td className={td}>{day(m.created_at)}</td>
                <td className={td}>{day(s === "ending" ? endOf(m) : m.period_end)}</td>
                <td className={`${td} ${M_CLASS[s]}`}>{M_LABEL[s]}</td>
                {past ? null : <td className={`${td} tabular-nums`}>{u ? usageLine(u) : "—"}{u?.letters ? <span className="opacity-50"> · 每日信 {u.letters}</span> : null}</td>}
                <td className={`${td} whitespace-normal min-w-[14rem] opacity-80`}>{note.join(" · ") || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  /* ---------------- 通卡 ---------------- */
  const passes = all.filter(isPass).map((m) => ({ m, s: passState(m, now) }));
  const livePasses = passes.filter((x) => x.s !== "ended").sort((a, b) => (a.m.period_end ?? 0) - (b.m.period_end ?? 0));
  const endedPasses = passes.filter((x) => x.s === "ended" && (x.m.period_end ?? 0) > now - 30 * DAY);
  const countBy = (days: number) => livePasses.filter((x) => x.s === "live" && passDaysOfRow(x.m) === days).length;
  const queued = livePasses.filter((x) => x.s === "queued").length;
  const sales = passSales(showTest, now);
  const d1 = sales.find((x) => x.days === 1)!;
  const conv = passToMember(all);
  const g = guaranteeStats(now - 30 * DAY);
  const refusals = Object.entries(g.denied).sort((a, b) => b[1] - a[1]);
  const pn = passNoticeStats();

  return (
    <AdminShell
      title="会员与通卡"
      nav={[{ href: "#members", label: "会员" }, { href: "#calendar", label: "续费日历" }, { href: "#returned", label: "离开又回来" }, { href: "#ended", label: "已结束" }, { href: "#passes", label: "通卡" }, { href: "#pass-notice", label: "通卡到期提醒" }]}
      right={<><a href={showTest ? "/admin/members" : "/admin/members?test=1"} className="opacity-60 underline underline-offset-4">{showTest ? "隐藏自测" : "含自测"}</a></>}
    >
      <h2 className="text-xs uppercase tracking-widest opacity-40 mb-3">会员（续订的月付／年付，和我们赠送的）</h2>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-10">
        <Stat label="续订中" value={renewing.length} sub={`月付 ${renewing.filter((x) => x.m.plan === "month").length} · 年付 ${renewing.filter((x) => x.m.plan === "year").length}${gifts.length ? ` · 另有赠送 ${gifts.length}` : ""}`} />
        <Stat label="已关续订" value={ending.length} sub={ending.length ? `到期前照常 · 最早 ${day(minOf(ending.map((x) => endOf(x.m) ?? now)))} 到期` : "没有人关"} good={ending.length === 0} />
        <Stat label="暂停中" value={paused.length} sub={paused.length ? "暂停的那个月不扣款" : "—"} />
        <Stat label="扣款失败" value={pastDue.length} sub={pastDue.length ? "Stripe 会自动重试" : "—"} good={pastDue.length === 0} />
        <Stat label="MRR" value={usd(mrrNow)} sub={`${mrrNext !== mrrNow ? `续费后 ${usd(mrrNext)}（去掉已关续订的）` : "全部续订中"} · 通卡、赠送不算`} />
      </div>

      <Section id="members" title="在册会员" sub={`${liveMembers.length} 位 · 扣款失败与已关续订排在前面`}>
        {liveMembers.length === 0 ? <p className="text-sm opacity-50">还没有会员。</p> : <MemberTable rows={liveMembers} />}
        <Legend>「本期用了什么」从本期开始日算，每样东西一天只算一次（同一张盘当天重开、同一支籤重看不重复算）；「碰上限」= 本期碰到每日合理使用上限的次数（同一种上限 10 分钟内只记一次）；「每日信」= 本期寄到的会员每日信封数。关了续订的人：到期前一切照常；到期前 3 天那封按 93 的分群——高频不寄、每人只寄一次、普通月付给「暂停一个月／改年付」、其他给提醒；还没寄的按现在的用量预估。取消原因来自 Stripe 客户门户。MRR 按每位会员自己的币种与档位、用当日牌价折美元（年付 ÷ 12）。</Legend>
      </Section>

      <Section id="calendar" title="续费日历" sub="未来 30 天会自动扣款的">
        {nextRenewals.length === 0 ? <p className="text-sm opacity-50">未来 30 天没有续费。</p> : (
          <ul className="text-sm flex flex-col gap-1">
            {nextRenewals.map(({ m }) => (
              <li key={m.id}><span className="tabular-nums">{day(m.period_end)}</span><span className="mx-2 opacity-30">·</span>{m.email}<span className="mx-2 opacity-30">·</span>{m.plan === "year" ? "年付" : "月付"} {money(m.currency, m.amount_minor)}</li>
            ))}
          </ul>
        )}
        <Legend>续费当天如果扣不到钱，会员会变成「扣款失败」，排在在册会员最前面，同时给你发提醒邮件。</Legend>
      </Section>

      <Section id="returned" title="离开后又回来的" sub={`${returned.length} 位`}>
        {returned.length === 0 ? <p className="text-sm opacity-50">还没有。</p> : (
          <ul className="text-sm flex flex-col gap-1">
            {returned.map((r) => (
              <li key={r.customerId}><a className="underline underline-offset-4" href={`/admin/customers/${r.customerId}`}>{r.email}</a><span className="mx-2 opacity-30">·</span>{day(r.leftAt)} 会员结束<span className="mx-2 opacity-30">→</span>{day(r.backAt)} 回来买了{r.backTo}</li>
            ))}
          </ul>
        )}
        <Legend>会员（月付／年付）结束之后，又开了会员或买了通卡的人。再开会员的价格：10-24 起会员到期后再开，一律从首月价格开始（以前续过的也一样）；通卡结束 7 天内转会员的按月费。</Legend>
      </Section>

      <Section id="ended" title="已结束的会员" sub={`${ended.length} 位`}>
        {ended.length === 0 ? <p className="text-sm opacity-50">没有。</p> : <MemberTable rows={ended} past />}
      </Section>

      <h2 id="passes" className="text-xs uppercase tracking-widest opacity-40 mt-14 mb-3">通卡（1 日／7 天／30 天，买一次、不续订）</h2>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-10">
        <Stat label="在用" value={countBy(1) + countBy(7) + countBy(30)} sub={`1 日 ${countBy(1)} · 7 天 ${countBy(7)} · 30 天 ${countBy(30)}${queued ? ` · 排队 ${queued}` : ""}`} />
        <Stat label="今天卖出" value={sales.reduce((a, x) => a + x.today, 0)} sub={sales.map((x) => `${x.days === 1 ? "1 日" : `${x.days} 天`} ${x.today}`).join(" · ")} />
        <Stat label="7 天卖出" value={sales.reduce((a, x) => a + x.week, 0)} sub={`${sales.map((x) => `${x.days === 1 ? "1 日" : `${x.days} 天`} ${x.week}`).join(" · ")}${d1.week ? ` · 1 日里首张价 ${d1.firstWeek}（${Math.round((d1.firstWeek / d1.week) * 100)}%）` : ""}`} />
        <Stat label="转会员" value={conv.converted} sub={`差额折抵 ${conv.credited} 次${Object.keys(conv.credit).length ? ` · ${Object.entries(conv.credit).map(([c, v]) => money(c, v)).join(" + ")}` : ""}`} />
        <Stat label="首次保证（30 天）" value={`退 ${g.refundedPass}`} sub={`拒 ${refusals.reduce((a, [, n]) => a + n, 0)}${refusals.length ? `：${refusals.map(([w, n]) => `${GUARANTEE_WHY[w] ?? w} ${n}`).join("、")}` : ""}${g.refunded > g.refundedPass ? ` · 另有旧单买退 ${g.refunded - g.refundedPass}` : ""}`} />
      </div>

      <Section id="pass-live" title="在用的通卡" sub={`${livePasses.length} 张 · 按到期先后`}>
        {livePasses.length === 0 ? <p className="text-sm opacity-50">没有。</p> : (
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-sm min-w-[52rem]">
              <thead><tr><th className={th}>客户</th><th className={th}>卡</th><th className={th}>开始</th><th className={th}>到期</th><th className={th}>用了什么</th></tr></thead>
              <tbody>
                {livePasses.map(({ m, s }) => {
                  const days = passDaysOfRow(m);
                  const u = s === "live" ? usageWithCaps(m.customer_id, m.period_start ?? m.created_at, now) : null;
                  return (
                    <tr key={m.id} className="border-t border-black/5">
                      <td className={td}><a className="underline underline-offset-4" href={`/admin/customers/${m.customer_id}`}>{m.email}</a>{m.test_flag === 1 ? <span className="ml-1 opacity-40">自测</span> : null}</td>
                      <td className={td}>{passName(days)} · {money(m.currency, m.amount_minor)}{m.pass_days == null ? <span className="opacity-40">（通卡开卖前买的）</span> : null}</td>
                      <td className={td}>{s === "queued" ? <span className="opacity-60">排队：{day(m.period_start)} 起</span> : days === 1 ? minute(m.period_start) : day(m.period_start)}</td>
                      <td className={td}>{days === 1 ? minute(m.period_end) : day(m.period_end)}</td>
                      <td className={`${td} tabular-nums`}>{u ? usageLine(u) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Legend>通卡在到期前不限次（每日合理使用上限照算）；在用时又买一张会排在后面，接着前一张到期那一刻开始。「首张价」= 帐号第一张 1 日通卡的首次价。转会员 = 买过通卡、之后开了会员的人；开会员时通卡还没用完的，剩下的天数折成第一期的折扣（差额折抵），金额是结账时算的。首次保证只给帐号第一张 1 日通卡：24 小时内、用掉不超过两份，可一键全额退款。</Legend>
      </Section>

      <Section id="pass-notice" title="通卡到期提醒" sub={`已发 ${pn.sent} 封${pn.skipped ? ` · 跳过 ${pn.skipped}（已有续订或已预购）` : ""}`}>
        <p className="text-sm">
          点了：再买一张 <b>{pn.clicks.pass}</b> · 改月订 <b>{pn.clicks.month}</b> · 不用了 <b>{pn.clicks.no}</b>
          <span className="opacity-60">　→　实际：预购了下一张 <b>{pn.boughtPass}</b> · 开了月订 <b>{pn.switched}</b> · 记录「不用了」 <b>{pn.declined}</b></span>
        </p>
        <Legend>7 天通卡到期前 1 天、30 天通卡到期前 3 天（台北日期）寄一封服务信（1 日卡不寄），三个按钮一样大：再买一张（接在这张后面，不自动续）、改成月订（第一笔在通卡到期那天扣，今天不扣）、不用了（只记录、不挽留，可选一题）。同一位已有续订中的会员或已预购下一张，不发。</Legend>
      </Section>

      <Section id="pass-ended" title="近 30 天结束的通卡" sub={`${endedPasses.length} 张`}>
        {endedPasses.length === 0 ? <p className="text-sm opacity-50">没有。</p> : (
          <ul className="text-sm flex flex-col gap-1">
            {endedPasses.map(({ m }) => (
              <li key={m.id}><span className="tabular-nums">{day(m.period_end)}</span><span className="mx-2 opacity-30">·</span><a className="underline underline-offset-4" href={`/admin/customers/${m.customer_id}`}>{m.email}</a><span className="mx-2 opacity-30">·</span>{passName(passDaysOfRow(m))} {money(m.currency, m.amount_minor)}{m.status === "canceled" && (m.period_end ?? 0) < (m.period_start ?? 0) + passDaysOfRow(m) * DAY - 60_000 ? <span className="opacity-50">（提前结束：转会员折抵或退款）</span> : null}</li>
            ))}
          </ul>
        )}
      </Section>
    </AdminShell>
  );
}
