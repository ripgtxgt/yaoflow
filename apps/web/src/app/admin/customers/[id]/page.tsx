import { cookies } from "next/headers";
import { tierLabelZh } from "@/lib/catalog";
import { notFound, redirect } from "next/navigation";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { referralFacts, referralsByCustomer } from "@/lib/admin-referrals";
import { AdminLogin, AdminShell } from "../../ui";
import { allowanceUsesForCustomer, customerDetail, mailsForCustomer, membershipChargesForCustomer, moneyByCustomer, readingViews, myOutcomes, paidOrdersByCustomer, pairsForCustomer, type MailRow } from "@/lib/db";
import { entitlementFor } from "@/lib/subscription";
import { formatMoney, isCurrency } from "@/lib/money";
import { pick } from "@/lib/reading";
import { asLocale } from "@/lib/locales";
import { homeMinute } from "@/lib/clock";
import Ledger from "./Ledger";
import Kin from "./Kin";
import Ops from "./Ops";
import { mergedInto } from "@/lib/identity";
import { customerIdentity, customerLetters, customerRevisits } from "@/lib/admin-customer";
import { castExtras, castLinesText, customerUsage, profilesReadable, readingSections } from "@/lib/admin-usage";
import Usage from "./Usage";
import { NetPanel, ProfilePanel } from "@/components/admin/PersonPanels";
import { browsersOfCustomer } from "@/lib/browsers";

export const dynamic = "force-dynamic";

// 09-21: shown in the currency it was paid in
const fmt = (c: number | null, cur?: string | null) => {
  if (c == null) return "—";
  const u = (cur ?? "usd").toUpperCase();
  return isCurrency(u) ? formatMoney(u, c, "en") : `${u} ${(c / 100).toFixed(2)}`;
};
const when = homeMinute; // UTC+8, the house clock

const TOPIC_LABEL: Record<string, string> = {
  career: "事业", relationship: "感情", money: "财运",
  health: "健康", study: "学业", decision: "抉择", other: "其他",
};
/** 10-23 进度表 115: the language a person uses, not its code */
const LOCALE_ZH: Record<string, string> = { "zh-hant": "繁体中文", zh: "简体中文", en: "英文", ja: "日文", ko: "韩文", fr: "法文", es: "西班牙文", pt: "葡萄牙文", de: "德文" };
const PHASE_LABEL: Record<string, string> = {
  wood: "木", fire: "火", earth: "土", metal: "金", water: "水",
};
const MAIL_KIND_LABEL: Record<string, string> = {
  reading: "解读交付", revisit: "应期回访", login: "登录链接", refund: "退款通知", pair: "合参通知",
  reward: "推荐奖励", launch: "上线邮件", digest: "周报", test: "测试", other: "其他（非本站发出）",
  seal: "封存通知", sub_alert: "会员异常", sub_confirm: "取消确认", sub_winback: "到期前挽回", headsup: "应期提醒", dayof: "应期当日", sub_welcome: "开通信（会员／通卡）", sub_renew: "年付续费预告",
  // 09-27: kinds added since, which printed as their raw codes
  // 10-22 进度表 94/95: the allowance letter is stopped; the one-off month is a 通卡 now
  sub_recap: "续费前回顾", sub_reset: "额度刷新（10-22 已停）", pass_notice: "通卡到期提醒", sub_perks: "会员权益说明",
  member_letter: "会员每日信", month_letter: "流月信", report_mended: "报告补写完成", gift_used: "赠送已被使用", daily: "每日三卦", daily_confirm: "每日三卦 · 订阅确认", pack_offer: "增购包提醒", pack_bought: "增购到账确认", support: "客服回信", comp_note: "补偿说明",
  sub_payfail: "扣款失败／补缴成功", sub_unpaid_end: "欠费结束", sub_resume: "恢复续订确认", sub_pause: "暂停确认", support_ack: "客服自动回执", nianshu_received: "年书已收到", erase: "删除帐号", nianshu_early_1101: "年书早鸟信", sub_renewed: "续费成功", // 10-23 进度表 111 / 110
};
/** 09-27: why a reading was handed over, in words — the raw status codes (subscription, invite_light…) meant nothing on the page */
const ENT_LABEL: Record<string, string> = {
  purchase: "单次购买", membership: "通卡／会员", painted_door: "上线前赠送", invite_free: "新人免费", gift_cast: "朋友送的",
  joint: "合参邀请", case_reward: "公开卦例回礼", revisit_reward: "应验回礼", referral_reward: "推荐奖励", goodwill: "补偿",
};

/** One line of status per mail: the worst thing that happened wins, else the best. */
function mailState(m: MailRow): { text: string; bad: boolean } {
  if (m.complained_at) return { text: `投诉为垃圾邮件 ${when(m.complained_at)}`, bad: true };
  if (m.bounced_at) return { text: `退信 ${when(m.bounced_at)}`, bad: true };
  if (m.failed_at) return { text: `发送失败 ${when(m.failed_at)}`, bad: true };
  if (m.opened_at) return { text: `已打开 ×${m.opens} · 首次 ${when(m.opened_at)}`, bad: false };
  if (m.delivered_at) return { text: `已送达 ${when(m.delivered_at)}`, bad: false };
  if (m.delayed_at) return { text: `投递延迟 ${when(m.delayed_at)}`, bad: false };
  return { text: "已发出", bad: false };
}

interface CastRow {
  id: number; created_at: number; locale: string; question: string; topic: string | null;
  primary_name: string; changed_name: string | null; palace_phase: string | null;
  day_pillar: string | null; values_str: string;
}
interface ReadingRow {
  id: number; cast_id: number; created_at: number; tier: string; locale: string; body_json: string;
}
interface OrderRow {
  session_id: string; created_at: number; tier: string;
  amount_cents: number | null; currency: string | null; status: string;
  dispute?: string | null;
  refund_reason?: string | null;
  // 09-22: the two questions `status` used to answer at once
  entitlement_kind?: string | null;
  payment_state?: string | null;
}
interface FollowupRow {
  cast_id: number; created_at: number; role: "user" | "assistant"; content: string;
}
interface RevisitRec {
  id: number; cast_id: number | null; tier: string; due_at: number; window_days: number;
  timing_quote: string | null; status: string; sent_at: number | null;
  outcome: "hit" | "partial" | "miss" | "open" | null; outcome_at: number | null;
}
interface CustomerRec {
  id: number; email: string; first_seen: number; last_seen: number;
  locale: string | null; marketing_ok: number; last_login_at: number | null; last_online?: number | null;
}

export default async function CustomerPage(
  { params, searchParams }: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ key?: string; merged?: string; done?: string; failed?: string }>;
  },
) {
  const { id } = await params;
  const { key, merged, done, failed } = await searchParams;
  if (!(await isAdmin((await cookies()).get(ADMIN_COOKIE)?.value, key))) return <AdminLogin back={`/admin/customers/${id}`} />;

  const d = customerDetail(Number(id));
  const c = d.customer as CustomerRec | undefined;
  if (!c) {
    // 10-22 同一个人: an id that was merged away still has a page — the one it went into
    const to = mergedInto(Number(id));
    if (to) redirect(`/admin/customers/${to}${key ? `?key=${encodeURIComponent(key)}` : ""}`);
    notFound();
  }
  const casts = d.casts as unknown as CastRow[];
  const pairs = pairsForCustomer(Number(id));
  const mails = mailsForCustomer(Number(id), c.email);
  const readings = d.readings as unknown as ReadingRow[];
  const orders = d.orders as unknown as OrderRow[];
  const followups = (d.followups ?? []) as unknown as FollowupRow[];
  const revisits = (d.revisits ?? []) as unknown as RevisitRec[];
  const revisitByCast = new Map<number, RevisitRec>();
  for (const r of revisits) if (r.cast_id !== null && !revisitByCast.has(r.cast_id)) revisitByCast.set(r.cast_id, r);
  // 10-23: the same words as the 应验记录 (/outcomes and the dashboard section); 「不确定」 was missing and showed nothing
  const OUTCOME_LABEL = { hit: "应了 ✓", partial: "部分 ~", miss: "没应 ✗", open: "还没定 …", unclear: "不确定 ?" } as const;

  const readingByCast = new Map<number, ReadingRow>();
  for (const r of readings) if (!readingByCast.has(r.cast_id)) readingByCast.set(r.cast_id, r);

  const followupsByCast = new Map<number, FollowupRow[]>();
  for (const f of followups) {
    const list = followupsByCast.get(f.cast_id) ?? [];
    list.push(f);
    followupsByCast.set(f.cast_id, list);
  }

  // 09-18: what this customer's sharing brought in (same numbers as the list page)
  const brought = referralsByCustomer(90).get(c.id);
  const facts = referralFacts().get(c.id);

  // 09-21 Neil：「客户属性，复购，会员（包括剩余次数）是不是要完善」
  // one customer, so the live entitlement is worth the Stripe round trip
  const ent = await entitlementFor(c.id).catch(() => null);
  const paid = paidOrdersByCustomer().get(c.id) ?? [];
  const record = myOutcomes(c.id);
  const answered = record.hit + record.miss;
  const topics = [...new Set(casts.map((x) => x.topic).filter(Boolean))] as string[];
  const langs = [...new Set(casts.map((x) => x.locale))];
  const deepPaid = paid.filter((o) => o.tier === "deep").length;
  // 09-22: what a membership paid, and how much allowance has been spent —
  // neither shows up anywhere in the orders table
  const money = moneyByCustomer().get(c.id) ?? null;
  // 10-23 进度表 105 ④: 通卡 and 会员 apart — they were all 「会员额度」
  const uses = allowanceUsesForCustomer(c.id);
  // 09-27 (Neil: 「订单版块加上会员的订单吧」): membership payments never write an order row — they come from Stripe
  const memberCharges = membershipChargesForCustomer(c.id);
  // 09-27: how often each reading page was opened (never counting the admin's own clicks)
  const views = readingViews(orders.map((o) => o.session_id));
  type Line = { at: number; key: string; order?: OrderRow; charge?: (typeof memberCharges)[number] };
  const lines: Line[] = [
    ...orders.map((o) => ({ at: o.created_at, key: o.session_id, order: o })),
    ...memberCharges.map((m) => ({ at: m.created, key: m.id, charge: m })),
  ].sort((a, b) => b.at - a.at);
  const spanDays = casts.length > 1 ? Math.round((casts[0]!.created_at - casts[casts.length - 1]!.created_at) / 86_400_000) : 0;
  // 10-22 进度表 94 第一批: who they are to us now, and every product — not only 六爻
  const who = customerIdentity(c.id);
  const rvs = customerRevisits(c.id);
  const letters = customerLetters(c.id);
  // 10-23 进度表 115: every use of every product, in words; the birth profiles written out (they were raw JSON)
  const usage = await customerUsage(c.id, c.email);
  const profiles = profilesReadable(c.id);
  // the 六爻 cards below: the lines in words (moving lines, palace, 世／应) instead of 「6,7,7,6,6,6」
  const castExtra = castExtras(c.id);

  return (
    <AdminShell title="客户" nav={[]} right={<><a href="/admin/customers" className="underline underline-offset-4">← 客户列表</a></>}>
      <div className="max-w-3xl">
        <h1 className="text-xl mb-1 break-all">{c.email}</h1>
        {/* 10-22 进度表 94: one line — 免费／通卡（几天卡，到哪天）／会员（续订中、已关续订到哪天、暂停到哪天）＋首次保证 */}
        <p className="text-sm mb-1">
          <span className={who.kind === "free" ? "opacity-60" : "text-[var(--gold-text)]"}>{who.line}</span>
          <span className="mx-2 opacity-30">·</span>
          <span className="opacity-70">首次保证：{who.guarantee.state}{who.guarantee.note ? `（${who.guarantee.note}）` : ""}</span>
        </p>
        {who.past.length > 0 && <p className="text-xs opacity-50 mb-1">{who.past.join("；")}</p>}
        {/* 10-03 按人看: every browser filed under this customer, day by day */}
        <p className="text-xs mb-2"><a className="underline underline-offset-2" href={`/admin/people/c${c.id}`}>按人看：从第一次来到现在的轨迹 →</a></p>
        <p className="text-sm opacity-50 mb-2">
          {/* 09-22: one source (moneyByCustomer) — a membership never writes an
              order row, so this line used to read 「HK$18 · 1 单」 for someone
              also paying HK$68 a month, and 「—」 for a member who only ever
              paid by subscription. c.orders_count was a counter and is gone. */}
          {[
            ...(money?.orders ?? []).map((p) => fmt(p.cents, p.currency)),
            ...(money && money.membership.n > 0 ? [`会员 $${(money.membership.grossCents / 100).toFixed(2)}（${money.membership.n} 期）`] : []),
            // 09-29 会员增购包
            ...(money && money.packs.n > 0 ? [`增购 ${money.packs.money.map((p) => fmt(p.cents, p.currency)).join(" + ")}（${money.packs.n} 包）`] : []),
          ].join(" · ") || "—"} · {money?.orderCount ?? 0} 单 · {casts.length} 卦 ·
          {" "}首次 {when(c.first_seen)} · 最近活动 {when(c.last_seen)} · 最近在线 {c.last_online ? when(c.last_online) : "从未登录"}{c.last_login_at ? `（上次登录 ${when(c.last_login_at)}）` : ""} · 语言 {c.locale ? LOCALE_ZH[c.locale] ?? c.locale : "—"}
          {c.marketing_ok ? " · 愿收上线通知" : ""}
        </p>
        {/* ---- 会员 · 复购 · 属性 ---- */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="rounded-[2px] border border-black/10 p-3">
            <p className="text-[11px] opacity-50">身份</p>
            {/* 10-22 进度表 94: the 「剩几次」 of the monthly allowance is gone — nothing is counted against one any more */}
            <p className="text-sm mt-1">{{ free: "免费", pass: "通卡", member: "会员", gift: "会员 · 赠送" }[who.kind]}</p>
            <p className="text-[11px] opacity-60 mt-1">{who.kind === "free" ? (who.past[0] ?? "从没开过") : who.line.split("；")[0]!.split(" · ").slice(1).join(" · ")}</p>
          </div>
          <div className="rounded-[2px] border border-black/10 p-3">
            <p className="text-[11px] opacity-50">付费单</p>
            <p className="text-2xl tabular-nums leading-none mt-1">{paid.length}</p>
            <p className="text-[11px] opacity-60 mt-1.5">
              {paid.length > 1 ? `复购 ${paid.length - 1} 次` : paid.length === 1 ? (ent?.active ? "另有会员" : "只买过一次") : ent?.active ? "靠通卡／会员" : "还没付过费"}
              {deepPaid ? ` · 深断 ${deepPaid}` : ""}
              {uses.pass > 0 ? ` · 通卡使用 ${uses.pass} 次` : ""}
              {uses.member > 0 ? ` · 会员使用 ${uses.member} 次` : ""}
            </p>
          </div>
          <div className="rounded-[2px] border border-black/10 p-3">
            <p className="text-[11px] opacity-50">应验记录</p>
            <p className="text-sm mt-1 tabular-nums">{answered === 0 ? "—" : `${record.hit} 应验 / ${record.miss} 没应验`}</p>
            <p className="text-[11px] opacity-60 mt-1">{record.waiting > 0 ? `${record.waiting} 件等着到期` : answered ? "都答过了" : "还没有到期的"}</p>
          </div>
          <div className="rounded-[2px] border border-black/10 p-3">
            <p className="text-[11px] opacity-50">关注</p>
            <p className="text-sm mt-1">{topics.map((t) => TOPIC_LABEL[t] ?? t).join(" · ") || "—"}</p>
            <p className="text-[11px] opacity-60 mt-1">{langs.map((l) => LOCALE_ZH[l] ?? l).join(" / ")}{spanDays > 0 ? ` · 跨 ${spanDays} 天` : ""}</p>
          </div>
        </div>

        {/* 10-31 进度表 130: where and on what they come, similar traces, and the profile an ad audience is cut from */}
        {(() => { const bids = browsersOfCustomer(c.id).map((x) => x.bid); return <><ProfilePanel bids={bids} customerId={c.id} /><NetPanel bids={bids} /></>; })()}

        {/* 10-22 同一个人: other accounts the card / addresses / browsers point at, and the merge the owner can decide */}
        <Kin customerId={c.id} email={c.email} back={`/admin/customers/${c.id}`} merged={merged} />

        {/* 10-23 进度表 107 ②④: what can be done for this customer, each asked twice and kept in the record */}
        <Ops customerId={c.id} back={`/admin/customers/${c.id}`} done={done} failed={failed}
          orders={orders as unknown as Parameters<typeof Ops>[0]["orders"]} revisits={revisits.map((r) => ({ id: r.id, due_at: r.due_at, status: r.status, outcome: r.outcome }))} />

        {/* 09-29 对账明细: where every free / allowance unit came from and went */}
        <Ledger customerId={c.id} locale={c.locale ?? "zh-hant"} back={`/admin/customers/${c.id}`} />

        {/* 10-22 进度表 94 第一批 → 10-23 进度表 115: every product, every use, in words (the 六爻 cards are further down) */}
        <Usage groups={usage.groups} unused={usage.unused} profiles={profiles} revisits={rvs} letters={letters} />

        <div className="text-sm mb-8">
          <p>
            <span className="opacity-50">TA 带来的人：</span>
            {facts && (facts.gifts || facts.viaRef || facts.rewards)
              ? <span className="tabular-nums">
                  送卦 {facts.gifts} 张，朋友领取 {facts.claimed}；经 TA 分享链接领首份免费 {facts.viaRef} 人{facts.viaRef ? `（读完 ${facts.viaRefRead}）` : ""}；回礼 {facts.rewards} 份{facts.rewards ? `，已用 ${facts.rewardsUsed}` : ""}
                </span>
              : <span className="opacity-40">还没有</span>}
          </p>
          {brought && (brought.sessions > 0 || brought.orders > 0) && (
            <p className="text-xs opacity-40 mt-1 tabular-nums">
              卦码相同（不代表是 TA 带来的）：{brought.sessions} 个会话进站带着 TA 摇过的某一卦的卦码，{brought.casts} 个摇完卦，{brought.orders} 份解读交付（最近 90 天）。卦码只是六爻，摇出同一卦的人都会被算上，推广素材里的示例卦尤其多。
            </p>
          )}
        </div>

        <section className="mb-10">
          <h2 className="text-xs uppercase tracking-widest opacity-40 mb-3">订单</h2>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <tbody>
              {lines.map(({ key: k, order: o, charge: m }) => m ? (
                <tr key={k} className="border-t border-black/5 align-top bg-[var(--gold)]/[0.06]">
                  <td className="py-1.5 opacity-60 tabular-nums">{when(m.created)}</td>
                  <td>{m.start?.comp ? "会员 · 赠送" : m.pass ? "通卡" : m.plan === "year" ? "会员 · 年付" : "会员 · 月付"}</td>
                  <td className="tabular-nums">{m.start ? ((m.start.pending || m.pass) && m.planAmount ? <span className="opacity-60">{fmt(m.planAmount - (m.start.credit?.cents ?? 0), m.planCurrency ?? m.currency)}</span> : fmt(0, m.currency)) : fmt(m.amount, m.currency)}{m.planCurrency && m.planAmount && (m.start || m.planCurrency.toUpperCase() !== m.currency.toUpperCase()) ? <span className="opacity-40 ml-1 text-[11px]">（{fmt(m.planAmount, m.planCurrency)}）</span> : null}</td>
                  <td />
                  <td className="opacity-50">{m.start
                    ? m.start.comp ? "开通 · 我们赠送，未收费"
                      : m.start.pending ? `开通 · 已扣款，Stripe 账目还没同步过来（每 30 分钟同步一次）${m.start.credit ? `；首月已由 ${when(m.start.credit.at)} 那笔单买抵扣 ${fmt(m.start.credit.cents, m.start.credit.currency)}` : ""}`
                      : m.start.credit ? `开通 · 首月由 ${when(m.start.credit.at)} 那笔单买（${fmt(m.start.credit.cents, m.start.credit.currency)}）抵扣`
                      /* 10-13: a pass is paid at checkout — if its charge is still not matched after the sync, say that, never 「未收费」 */
                      : m.pass ? "开通 · 通卡已在结账时付清，Stripe 账目里还没对上这笔（待查）"
                      : "开通 · 首月未收费（Stripe 发票 0 元）"
                    : `会员付款 · 到账 ${fmt(m.net, m.currency)}${m.credit ? ` · 首月已由 ${when(m.credit.at)} 那笔单买抵扣 ${fmt(m.credit.cents, m.credit.currency)}` : ""}`}</td>
                  <td />
                </tr>
              ) : o ? (
                <tr key={k} className="border-t border-black/5 align-top">
                  <td className="py-1.5 opacity-60 tabular-nums">{when(o.created_at)}</td>
                  <td>{tierLabelZh(o.tier)}</td>
                  {/* 09-22: an allowance redemption has no money and no currency;
                      printing it as US$0 made it look like a zero-dollar sale */}
                  <td className="tabular-nums">{o.payment_state === "paid" || o.payment_state === "refunded" || o.payment_state === "disputed" ? fmt(o.amount_cents, o.currency) : <span className="opacity-30">—</span>}</td>
                  <td className="opacity-50 tabular-nums whitespace-nowrap" title={views.get(o.session_id) ? `首次 ${when(views.get(o.session_id)!.first_at)} · 最近 ${when(views.get(o.session_id)!.last_at)}` : "09-27 起记录"}>{views.get(o.session_id) ? `打开 ${views.get(o.session_id)!.n} 次` : ""}</td>
                  <td className="opacity-50">{ENT_LABEL[o.entitlement_kind ?? ""] ?? o.status}{o.payment_state === "refunded" ? " · 已退款" : ""}{o.dispute ? ` · 争议 ${o.dispute}` : ""}{o.refund_reason ? ` · ${o.refund_reason}` : ""}</td>
                  <td className="text-right">
                    {(o.payment_state === "paid" || o.payment_state === "disputed") && (o.amount_cents ?? 0) > 0 ? (
                      // 10-23 进度表 107 ②: refunds (full or part) go through 「运营动作」 — a reason, a second confirmation, the record
                      <a href="#ops" className="text-xs opacity-60 hover:opacity-100 underline underline-offset-2">退款…</a>
                    ) : null}
                  </td>
                </tr>
              ) : null)}
            </tbody>
          </table></div>
          {memberCharges.length > 0 && <p className="text-xs opacity-30 mt-2">底色的是会员：每期付款（Stripe 实扣，按结算币种；括号里是会员定价），以及没有扣款的开通——首月由之前的单买抵扣，或我们赠送。通卡期内和会员拿的解读另列，不重复计钱；10-22 起买的通卡在订单里那一行，不再另出一行「开通」。</p>}
        </section>

        {/* 邮件：发了什么、到了没有、打开了没有（Resend webhook；打开数只是参考） */}
        {mails.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xs uppercase tracking-widest opacity-40 mb-3">邮件</h2>
            <div className="overflow-x-auto"><table className="w-full text-xs">
              <tbody>
                {mails.map((m) => {
                  const s = mailState(m);
                  return (
                    <tr key={m.id} className="border-t border-black/10 align-top">
                      <td className="py-1.5 pr-3 opacity-60 tabular-nums whitespace-nowrap">{when(m.created_at)}</td>
                      <td className="py-1.5 pr-3 whitespace-nowrap">{MAIL_KIND_LABEL[m.kind] ?? m.kind}
                        {/* 09-29 (Neil: 「为什么她会收到会员取消订阅的邮件」): an owner alert about this customer, not a letter to them */}
                        {m.email && !m.email.toLowerCase().split(/,\s*/).includes(c.email.toLowerCase()) && <span className="ml-1 rounded-[2px] border border-current px-1 text-[10px] opacity-60">发给我们</span>}
                      </td>
                      <td className="py-1.5 pr-3 opacity-60 max-w-[18rem] truncate">{m.subject}</td>
                      <td className={`py-1.5 whitespace-nowrap ${s.bad ? "text-[var(--cinnabar)]" : "opacity-70"}`}>{s.text}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
            <p className="text-xs opacity-30 mt-2">"已打开"来自邮件里的追踪像素：Gmail 会经代理预载图片、Apple 邮件隐私保护会把所有邮件标成已打开，纯文本或屏蔽图片的客户端则不会显示——只当参考，不当依据。</p>
          </section>
        )}

        {pairs.length > 0 && (
          <section>
            <h2 className="text-xs uppercase tracking-widest opacity-40 mb-3">同题合参（只列本账号这一侧）</h2>
            <table className="w-full text-xs">
              <tbody>
                {pairs.map((p) => (
                  <tr key={p.token} className="border-t border-black/10">
                    <td className="py-1.5 pr-3 opacity-60">{when(p.created_at)}</td>
                    <td className="py-1.5 pr-3">{p.role === "a" ? "发起" : "应邀"}</td>
                    <td className="py-1.5 pr-3 opacity-60">{p.dissolved_at ? "已解除" : p.claimed_at ? `对方已起卦 ${when(p.claimed_at)}` : "等对方起卦"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section id="casts">
          <h2 className="text-xs uppercase tracking-widest opacity-40 mb-1">六爻：每一卦的解读与追问</h2>
          <p className="text-xs opacity-40 mb-4">点开一卦：问题、本卦与之卦、动爻、读者看到的完整解读、追问对话、回访结果。</p>
          <div className="space-y-5">
            {casts.map((ct) => {
              const r = readingByCast.get(ct.id);
              let summary = "";
              try {
                const body = r ? (JSON.parse(r.body_json) as Record<string, Record<string, string>>) : null;
                const field = body?.verdict ?? body?.summary;
                summary = field ? pick(field, asLocale(ct.locale)) : "";
              } catch {
                /* ignore */
              }
              const ex = castExtra.get(ct.id);
              return (
                <details key={ct.id} id={`cast-${ct.id}`} className="border border-black/10 rounded-xl p-4 scroll-mt-16">
                  <summary className="cursor-pointer text-sm list-none">
                    <span className="opacity-45 tabular-nums mr-3">{when(ct.created_at)}</span>
                    <span className="mr-2">{ct.primary_name}</span>
                    {ct.changed_name && <span className="opacity-50 mr-2">→ {ct.changed_name}</span>}
                    {ct.topic && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-black/5">
                        {TOPIC_LABEL[ct.topic] ?? ct.topic}
                      </span>
                    )}
                    {ct.palace_phase && (
                      <span className="text-xs opacity-50 ml-2">用神{PHASE_LABEL[ct.palace_phase] ?? ct.palace_phase}</span>
                    )}
                    {(() => {
                      const rv = revisitByCast.get(ct.id);
                      if (!rv) return null;
                      const cls = rv.outcome === "hit" ? "text-emerald-700" : rv.outcome === "partial" ? "text-amber-700" : rv.outcome === "miss" ? "text-[var(--cinnabar)]" : "opacity-50";
                      return (
                        <span className={`text-xs ml-2 ${cls}`}>
                          {rv.outcome ? OUTCOME_LABEL[rv.outcome] : rv.status === "sent" ? "回访已发·未答" : `回访 ${when(rv.due_at).slice(0, 10)}`}
                        </span>
                      );
                    })()}
                  </summary>
                  <div className="mt-4 space-y-3 text-sm">
                    <p><span className="opacity-40">问题：</span>{ct.question}</p>
                    {/* 10-23 进度表 115: the lines in words, not 「爻值 6,7,7,6,6,6」 */}
                    <p className="opacity-60 text-xs">
                      {castLinesText(ex ?? { values_str: ct.values_str })} · {ct.day_pillar}日起卦 · {r ? (r.tier === "deep" ? "深断" : "轻解读") : "没有解读"}
                      {ex?.matter ? ` · 归在「${ex.matter}」这件事` : ""}
                    </p>
                    {summary && (
                      <p className="border-l-2 border-[var(--gold)]/50 pl-3 leading-relaxed">{summary}</p>
                    )}
                    {(() => {
                      const thread = followupsByCast.get(ct.id) ?? [];
                      if (thread.length === 0) return <p className="text-xs opacity-30">无追问</p>;
                      return (
                        <div className="mt-3">
                          <p className="text-xs uppercase tracking-widest opacity-40 mb-2">
                            追问对话（{thread.filter((x) => x.role === "user").length} 问）
                          </p>
                          <div className="space-y-2">
                            {thread.map((f, i) =>
                              f.role === "user" ? (
                                <p key={i} className="text-xs pl-3 border-l-2 border-[var(--cinnabar)] opacity-80">
                                  {f.content}
                                </p>
                              ) : (
                                <p key={i} className="text-xs opacity-60 leading-relaxed pl-3">
                                  {f.content}
                                </p>
                              ),
                            )}
                          </div>
                        </div>
                      );
                    })()}
                    {/* 10-23 进度表 115 (Neil: 「全是代码」): the whole reading, each part under its own name — not the JSON */}
                    {r && (() => {
                      const parts = readingSections(r.body_json, ct.locale);
                      return parts.length > 0 ? (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs underline underline-offset-2 opacity-60">读者看到的完整解读</summary>
                          <div className="mt-2 flex flex-col gap-2 border-l-2 border-[var(--gold)]/40 pl-3">
                            {parts.map((p, i) => (
                              <div key={i}>
                                <p className="text-[11px] opacity-50">{p.label}</p>
                                <p className="text-xs leading-relaxed whitespace-pre-line">{p.text}</p>
                              </div>
                            ))}
                          </div>
                        </details>
                      ) : null;
                    })()}
                  </div>
                </details>
              );
            })}
          </div>
        </section>

        {/* 09-25 合规: 隐私政策 §4 删除权。客户来信要求删除时用；订单只匿名化保留（记账义务），其余全删。 */}
        <section className="mb-10 border-t border-black/10 pt-6">
          <details>
            <summary className="cursor-pointer text-xs uppercase tracking-widest opacity-40 hover:opacity-100">删除此客户全部数据…</summary>
            {/* 10-23 进度表 111 ③: first the letter that tells the reader what goes and asks them to reply 「確定刪除」 */}
            <form method="post" action="/api/admin/erase" className="mt-3 flex flex-col gap-2 text-xs max-w-md">
              <p className="opacity-70 leading-relaxed">第一步：寄删除确认信给读者（写明会删什么、不能恢复，请他回信「确定删除」）。这一步什么都不删。</p>
              <input type="hidden" name="customer_id" value={c.id} />
              <input type="hidden" name="step" value="confirm" />
              {key ? <input type="hidden" name="key" value={key} /> : null}
              <button type="submit" className="self-start border border-black/30 rounded px-3 py-1 hover:bg-black/5">寄删除确认信</button>
            </form>
            <form method="post" action="/api/admin/erase" className="mt-4 flex flex-col gap-2 text-xs max-w-md">
              <p className="opacity-70 leading-relaxed">第二步（读者回信确认后）：删除。删完会自动寄一封「已删除」给原信箱，这封信的记录也不留。</p>
              <p className="opacity-70 leading-relaxed">
                删除客户记录、全部卦、解读、追问、回访、登录会话与邮件日志；订单保留金额/日期/Stripe 编号但抹去邮箱（记账义务）。
                有生效中的 Stripe 订阅时会拒绝——先在 Stripe 取消。<b>不可恢复</b>；先确认已有当晚备份。
              </p>
              <input type="hidden" name="customer_id" value={c.id} />
              {key ? <input type="hidden" name="key" value={key} /> : null}
              <input name="confirm" placeholder={`输入 ${c.email} 以确认`} autoComplete="off" className="bg-transparent border border-black/20 rounded px-2 py-1" />
              <button type="submit" className="self-start border border-[var(--cinnabar)] text-[var(--cinnabar)] rounded px-3 py-1 hover:bg-[var(--cinnabar)] hover:text-white">
                永久删除
              </button>
            </form>
          </details>
        </section>
      </div>
    </AdminShell>
  );
}
