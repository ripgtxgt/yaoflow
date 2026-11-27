import { randomBytes } from "node:crypto";
import { db, orderBySession, outcomeHintFor, recordOps, revisitById, revisitCastContext, markRevisit, upsertSubscription, type SubscriptionRow } from "./db";
import { buildRefundEmail, buildRevisitEmail, buildSelfRevisitEmail, sendEmail } from "./email";
import { cancelSubscriptionNow, createBalanceCredit, createRefund, updateSubscription } from "./stripe";
import { refundSession } from "./refund";
import { markOwnPartialRefund, partialWhat } from "./refund-letters";
import { latestRunningPass } from "./pass";
import { resendWelcome } from "./welcome";
import { resendReadingEmail } from "./reading-mail";
import { formatMoney, isCurrency, type Currency } from "./money";
import { asLocale } from "./locales";
import { hexName } from "./names";
import { outcomeUrl } from "./outcome-token";
import { selfReportUrl } from "./self-revisit";
import { resolveCast, type LineValue } from "@yaoflow/engine";
import type { RefundReason } from "./email";

/**
 * 10-23 进度表 107 ②④ (Neil: 「后期我需要后台要有运营的功能」): what the last days were done by hand on the server — a 1 日
 * card added (101 ④), a pass lengthened and a membership's money credited (102), letters sent again — as buttons on the
 * customer page. Every one asks twice (a box to tick, and for money the amount typed again), needs a reason, and writes
 * one line in `admin_actions` (who, when, to whom, what, with what, why, how it went, Stripe's receipt), shown on the
 * customer page and in 设置与记录 → 操作记录. A failed try is written down too.
 *
 * Money moves only through Stripe's own API (a refund on the payment, a credit on the customer balance, free days through
 * the subscription's trial end) — nothing is changed locally that Stripe does not know.
 */

let ready = false;
function ensure(): void {
  if (ready) return;
  db().exec(`
    CREATE TABLE IF NOT EXISTS admin_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, actor TEXT NOT NULL, customer_id INTEGER,
      action TEXT NOT NULL, params_json TEXT NOT NULL DEFAULT '{}', reason TEXT NOT NULL, ok INTEGER NOT NULL,
      result TEXT NOT NULL, stripe_ref TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_admin_actions_cust ON admin_actions(customer_id, at);
    CREATE INDEX IF NOT EXISTS idx_admin_actions_at ON admin_actions(at);
  `);
  ready = true;
}

export type ActionName = "grant_pass" | "extend" | "credit" | "refund" | "resend" | "test_flag" | "note" | "end_now";
export const ACTION_ZH: Record<ActionName | "merge" | "campaign" | "letter_switch" | "case_feature" | "case_hide" | "outcome_fix" | "promo" | "cap_set" | "erase_confirm" | "erase", string> = {
  grant_pass: "补通卡", extend: "延期", credit: "存会员费抵扣", refund: "退款", resend: "重寄信", test_flag: "标测试／自己", note: "备注",
  end_now: "立即结束会员／通卡",
  merge: "合并帐号", campaign: "群发",
  // 10-23 进度表 108
  letter_switch: "自动信开关", case_feature: "卦例精选", case_hide: "卦例撤下／恢复", outcome_fix: "改应验状态",
  // 10-23 进度表 109
  promo: "优惠码", cap_set: "改上限",
  // 10-23 进度表 111 ③
  erase_confirm: "寄删除确认信", erase: "删除帐号",
};

export interface ActionRow { id: number; at: number; actor: string; customer_id: number | null; action: string; params_json: string; reason: string; ok: number; result: string; stripe_ref: string | null }

export function logAction(i: { actor?: string; customerId: number | null; action: string; params?: Record<string, unknown>; reason: string; ok: boolean; result: string; stripeRef?: string | null }, now = Date.now()): number {
  ensure();
  const r = db().prepare("INSERT INTO admin_actions (at, actor, customer_id, action, params_json, reason, ok, result, stripe_ref) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(now, i.actor ?? "admin", i.customerId, i.action, JSON.stringify(i.params ?? {}), i.reason.slice(0, 500), i.ok ? 1 : 0, i.result.slice(0, 500), i.stripeRef ?? null) as unknown as { lastInsertRowid: number | bigint };
  return Number(r.lastInsertRowid);
}
export function actionsFor(customerId: number, limit = 50): ActionRow[] {
  ensure();
  return db().prepare("SELECT * FROM admin_actions WHERE customer_id = ? ORDER BY at DESC, id DESC LIMIT ?").all(customerId, limit) as unknown as ActionRow[];
}
export function recentActions(limit = 200, action?: string): ActionRow[] {
  ensure();
  return (action
    ? db().prepare("SELECT * FROM admin_actions WHERE action = ? ORDER BY at DESC, id DESC LIMIT ?").all(action, limit)
    : db().prepare("SELECT * FROM admin_actions ORDER BY at DESC, id DESC LIMIT ?").all(limit)) as unknown as ActionRow[];
}

const DAY = 86_400_000;
const ZERO_DECIMAL = new Set(["JPY", "KRW"]);
/** 「12.5」 in a currency → its minor units (yen and won have none) */
export function toMinor(amount: string | number, currency: string): number | null {
  const n = typeof amount === "number" ? amount : Number(String(amount).replace(/[,\s]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  const minor = ZERO_DECIMAL.has(currency.toUpperCase()) ? n : n * 100;
  return Math.round(minor) === Math.round(minor * 1000) / 1000 ? Math.round(minor) : null;
}
const subRow = (customerId: number, id: number): SubscriptionRow | null =>
  (db().prepare("SELECT * FROM subscriptions WHERE id = ? AND customer_id = ?").get(id, customerId) as SubscriptionRow | undefined) ?? null;
const day = (ms: number) => new Date(ms + 8 * 3_600_000).toISOString().slice(0, 16).replace("T", " ");

export type ActionResult = { ok: true; result: string; stripeRef?: string | null } | { ok: false; error: string };

/** 补通卡: a 1 / 7 / 30-day pass on the house — from now, or from the end of the pass they hold. No money, no order row. */
export function grantPass(customerId: number, days: 1 | 7 | 30, start: "now" | "after", now = Date.now()): ActionResult {
  const running = latestRunningPass(customerId, now);
  const from = start === "after" && running?.period_end && running.period_end > now ? running.period_end : now;
  const sid = `pass_comp_${randomBytes(8).toString("hex")}`;
  const row = upsertSubscription({
    customerId, stripeCustomerId: null, stripeSubscriptionId: sid, status: from > now ? "scheduled" : "active", plan: "month",
    periodStart: from, periodEnd: from + days * DAY, cancelAtPeriodEnd: true, currency: null, amountMinor: 0, passDays: days,
  });
  recordOps("pass_granted", `${sid} ${days}d cust ${customerId} ${from > now ? "after running pass" : "now"}`);
  return { ok: true, result: `${days === 1 ? "1 日" : `${days} 天`}通卡（我们送的，${row.id}），${day(from)} → ${day(from + days * DAY)}` };
}

/** 延期: N more days — a pass or a gift locally; a paying membership through Stripe (the next charge moves N days later) */
export async function extend(customerId: number, subId: number, days: number, now = Date.now()): Promise<ActionResult> {
  if (!(Number.isInteger(days) && days >= 1 && days <= 90)) return { ok: false, error: "天数要在 1–90 之间" };
  const s = subRow(customerId, subId);
  if (!s) return { ok: false, error: "找不到这个客户的这条通卡／会员" };
  const sid = s.stripe_subscription_id;
  const end = (s.period_end ?? now) + days * DAY;
  if (sid.startsWith("sub_")) {
    // the subscription runs on without a charge until the new date (Stripe's trial end), then bills as before
    const u = await updateSubscription(sid, { trial_end: Math.floor(end / 1000), proration_behavior: "none" });
    db().prepare("UPDATE subscriptions SET period_end = ?, updated_at = ? WHERE id = ?").run(end, now, s.id);
    recordOps("sub_extended", `${sid} +${days}d cust ${customerId}`);
    return { ok: true, result: `会员延 ${days} 天，下次扣款改到 ${day(end)}（Stripe ${u.status ?? ""}）`, stripeRef: sid };
  }
  const reopen = s.status !== "active" && s.status !== "scheduled" && end > now;
  db().prepare(`UPDATE subscriptions SET period_end = ?, updated_at = ?${reopen ? ", status = 'active'" : ""} WHERE id = ?`).run(end, now, s.id);
  recordOps(sid.startsWith("pass_") ? "pass_extended" : "comp_extended", `${sid} +${days}d cust ${customerId}`);
  return { ok: true, result: `${sid.startsWith("pass_") ? "通卡" : "赠送的会员"}延 ${days} 天，到 ${day(end)}${reopen ? "（已重新开通）" : ""}` };
}

/**
 * 10-23 立即结束 (Neil: a member who disputed the year's charge and got it back still read 「会员 · 年付 · 已关续订，2027-09-22
 * 到期」, kept the member letters, and 「删除」 refused while that subscription was live): end a membership or a pass now.
 * A paying membership is cancelled in Stripe at once — no proration credit, no final invoice, so no money moves either
 * way; a pass or a gift ends here. The reader loses the access from this moment; the member letters stop with it.
 */
export async function endNow(customerId: number, subId: number, now = Date.now()): Promise<ActionResult> {
  const s = subRow(customerId, subId);
  if (!s) return { ok: false, error: "找不到这个客户的这条会员／通卡" };
  const sid = s.stripe_subscription_id;
  const live = ["active", "trialing", "past_due", "paused", "scheduled"].includes(s.status) && (s.status === "scheduled" || !s.period_end || s.period_end > now);
  if (!live) return { ok: false, error: "这条已经结束了" };
  const end = Math.min(s.period_end ?? now, now);
  if (sid.startsWith("sub_")) {
    const u = await cancelSubscriptionNow(sid);
    db().prepare("UPDATE subscriptions SET status = 'canceled', period_end = ?, cancel_at = NULL, updated_at = ? WHERE id = ?").run(end, now, s.id);
    recordOps("sub_ended_admin", `${sid} cust ${customerId} → ${u.status ?? "?"}`);
    return { ok: true, result: `会员已在 Stripe 立即结束（Stripe：${u.status ?? "?"}），不退款也不再扣款，权益到此为止`, stripeRef: sid };
  }
  db().prepare("UPDATE subscriptions SET status = 'canceled', period_end = ?, updated_at = ? WHERE id = ?").run(end, now, s.id);
  recordOps(sid.startsWith("pass_") ? "pass_ended_admin" : "comp_ended_admin", `${sid} cust ${customerId}`);
  return { ok: true, result: `${sid.startsWith("pass_") ? "通卡" : "我们送的会员"}已结束，权益到此为止` };
}

/** 存会员费抵扣: a credit on their Stripe balance, in their membership's currency — the next invoices take it first */
export async function credit(customerId: number, subId: number, amount: string, reason: string): Promise<ActionResult> {
  const s = subRow(customerId, subId);
  if (!s || !s.stripe_subscription_id.startsWith("sub_")) return { ok: false, error: "要选一条付费会员（有 Stripe 订阅的）" };
  if (!s.stripe_customer_id) return { ok: false, error: "这条会员没有 Stripe 客户号" };
  const cur = (s.currency ?? "").toUpperCase();
  const minor = toMinor(amount, cur || "USD");
  if (!cur || !minor) return { ok: false, error: "金额不对" };
  const t = await createBalanceCredit(s.stripe_customer_id, minor, cur, `YaoFlow 后台：${reason}`);
  recordOps("balance_credit", `cust ${customerId} ${cur} ${minor} ${t.id}`);
  const label = isCurrency(cur) ? formatMoney(cur as Currency, minor, "zh") : `${cur} ${minor}`;
  return { ok: true, result: `存入 ${label}，下次会员费先扣${t.ending_balance != null ? `（余额 ${-t.ending_balance}）` : ""}`, stripeRef: t.id };
}

/** 退款: the whole payment (the order flips to refunded, the reader is told), or a part of it (the order stays paid) */
export async function refund(customerId: number, sessionId: string, amount: string | null, reasonCode: RefundReason): Promise<ActionResult> {
  const o = orderBySession(sessionId);
  if (!o || o.customer_id !== customerId) return { ok: false, error: "找不到这个客户的这一单" };
  // an order from before payment_state was kept reads its status
  const state = o.payment_state ?? (o.status === "paid" ? "paid" : o.status);
  if (state !== "paid" && state !== "disputed") return { ok: false, error: `这一单是 ${state}，没有可退的` };
  if (!o.amount_cents) return { ok: false, error: "这一单没收钱" };
  const cur = (o.currency ?? "USD").toUpperCase();
  const minor = amount ? toMinor(amount, cur) : null;
  if (amount && !minor) return { ok: false, error: "金额不对" };
  if (minor && minor > o.amount_cents) return { ok: false, error: "比这一单收的还多" };
  // the refund letter in the reader's own language
  const locale = asLocale((db().prepare("SELECT locale FROM customers WHERE id = ?").get(customerId) as { locale: string | null } | undefined)?.locale ?? null);
  if (!minor || minor === o.amount_cents) {
    const r = await refundSession({ sessionId, reason: reasonCode, by: "admin", fallback: { tier: o.tier, amountCents: o.amount_cents, currency: o.currency, email: o.email, locale, paymentIntent: o.payment_intent, customerId: o.customer_id } });
    return r.ok ? { ok: true, result: `全额退款 ${r.amountLabel ?? ""}`.trim(), stripeRef: r.refundId ?? null } : { ok: false, error: r.error ?? "退款失败" };
  }
  if (!o.payment_intent) return { ok: false, error: "这一单没有 Stripe 付款编号，部分退款要在 Stripe 后台做" };
  // 10-23 进度表 111 ②: the webhook that follows this refund must not write the reader a second letter
  markOwnPartialRefund(o.payment_intent, o.email);
  const r = await createRefund(o.payment_intent, reasonCode, minor);
  const label = isCurrency(cur) ? formatMoney(cur as Currency, minor, locale) : `${cur} ${minor}`;
  recordOps("refund_partial", `${sessionId} admin ${reasonCode} ${minor} ${cur} ${r.id}`);
  if (o.email) {
    // a part: say so, and what is left of what was bought (a 通卡 carries on until its end)
    const w = partialWhat(o, locale);
    const mail = buildRefundEmail({ locale, amountLabel: label, reason: reasonCode, partial: true, what: w.what, until: w.until });
    await sendEmail(o.email, mail.subject, mail.html, mail.text, { kind: "refund", sessionId, customerId: o.customer_id }).catch(() => undefined);
  }
  return { ok: true, result: `部分退款 ${label}（这一单仍算已付）`, stripeRef: r.id };
}

/** 重寄信: the opening letter of a pass / membership, a reading's letter, or a revisit letter — again, now */
export async function resend(customerId: number, kind: "welcome" | "reading" | "revisit", ref: string, site: string, now = Date.now()): Promise<ActionResult> {
  if (kind === "welcome") {
    const s = subRow(customerId, Number(ref));
    if (!s) return { ok: false, error: "找不到这条通卡／会员" };
    const r = await resendWelcome(s);
    return r.ok ? { ok: true, result: "开通信已重寄" } : { ok: false, error: r.error ?? "寄不出去" };
  }
  if (kind === "reading") {
    const o = orderBySession(ref);
    if (!o || o.customer_id !== customerId) return { ok: false, error: "找不到这个客户的这一份解读" };
    const r = await resendReadingEmail(ref);
    return r.ok ? { ok: true, result: "交付信已重寄" } : { ok: false, error: r.error ?? "寄不出去" };
  }
  const rv = revisitById(Number(ref));
  if (!rv || rv.customer_id !== customerId) return { ok: false, error: "找不到这个客户的这条回访" };
  const locale = asLocale(rv.locale);
  const urls = { hit: outcomeUrl(site, rv.id, "happened", locale), partial: outcomeUrl(site, rv.id, "stirred", locale), miss: outcomeUrl(site, rv.id, "nothing", locale), open: outcomeUrl(site, rv.id, "open", locale) };
  let mail: { subject: string; html: string; text: string };
  if (rv.kind) {
    mail = buildSelfRevisitEmail({ locale, kind: rv.kind, label: rv.label ?? "", hint: rv.hint ?? null, plan: rv.plan ?? null, reportUrl: selfReportUrl(site, rv.kind, rv.ref ?? "", locale), castUrl: `${site}/${locale}`, outcomeUrls: urls });
  } else {
    const ctx = rv.cast_id ? revisitCastContext(rv.cast_id) : null;
    if (!ctx) return { ok: false, error: "这条回访的卦已经不在了" };
    const values = ctx.values_str.split(",").map(Number) as LineValue[];
    const cast = resolveCast(values);
    mail = buildRevisitEmail({
      reminder: false, locale, question: ctx.question, values, hexName: hexName(cast.primary, locale), changedName: cast.changed ? hexName(cast.changed, locale) : null,
      timingQuote: rv.timing_quote, windowDays: rv.window_days, readingUrl: `${site}/${locale}/reading?sid=${encodeURIComponent(rv.session_id)}`, castUrl: `${site}/${locale}`,
      giftUrl: null, outcomeUrls: urls, ask: rv.ask === "signals" ? "signals" : "event", qianLine: null, hint: outcomeHintFor(rv.cast_id), plan: rv.plan ?? null,
    });
  }
  const r = await sendEmail(rv.email, mail.subject, mail.html, mail.text, { kind: "revisit", sessionId: rv.session_id, customerId: rv.customer_id });
  if (!r.ok) return { ok: false, error: r.error ?? "寄不出去" };
  if (rv.status === "pending") markRevisit(rv.id, "sent");
  recordOps("revisit_resend", `${rv.id} cust ${customerId} ${day(now)}`);
  return { ok: true, result: `回访信已重寄${rv.status === "pending" ? "（原本还在排队，已记为寄出）" : ""}` };
}

/** 标测试／自己: their rows leave every count (on), or come back (off) */
export function setTestFlag(customerId: number, on: boolean): ActionResult {
  db().prepare("UPDATE customers SET test_flag = ? WHERE id = ?").run(on ? 1 : 0, customerId);
  return { ok: true, result: on ? "已标为测试／自己，所有统计不再算这个人" : "取消测试标记，重新算进统计" };
}
