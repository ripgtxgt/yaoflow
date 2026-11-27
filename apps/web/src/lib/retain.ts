import { letterOn } from "./letter-switch";
import { createHmac, timingSafeEqual } from "node:crypto";
import { unsubUrl } from "./unsub";
import {
  claimRetainWinback, customerEmailById, customerHadWinback, customerLocaleById, markRetainConfirm, recordOps,
  releaseRetainWinback, setPause, subsEndingSoon, subscriptionByStripeId, usageIn, type SubscriptionRow, customerMarketingOk,
  claimRenewNotice, subsRenewingSoon, unclaimRenewNotice, db } from "./db";
import { buildRenewEmail, buildRetainEmail, ownerRecipients, sendEmail, type RetainLetter } from "./email";
import { asLocale, LOCALE_META, type Locale } from "./locales";
import { formatMoney, isCurrency, priceMinor, stripeCurrency, yearlySavePct } from "./money";
import { createSubscriptionSession, updateSubscription, type StripeSubscription } from "./stripe";
import { mirrorSubscription, PLANS, renewPerks, SUB_NAMES, syncSubscription, yearlyOn } from "./subscription";
import { sendSubLetter } from "./sub-letters";

/**
 * 挽回 (09-23, Neil: 「如果有人取消的话，就自动发送挽回方案的邮件？」).
 *
 * What prompted it: kiki0931611144 subscribed at 22:22, used it hard for
 * thirty-six minutes — two matters, light and deep on each, fifteen
 * follow-up questions — and cancelled at 22:58 without a word. Nobody
 * told her the cancellation worked, what she still had, or how to undo it.
 *
 * Neil's decisions, which this file encodes and nothing else:
 *   - Everyone who cancels gets a receipt at once: it worked, no more
 *     charges, usable until <date>, one tap to undo. 10-22 进度表 93: no count
 *     of readings left (a member has none under the 通卡 model) — instead what
 *     carries on until the end, what stays and what stops after it, and that a
 *     pass is there later (「之後有事再來，買通卡就好」).
 *   - Three days before the end, ONE letter, once per person:
 *       normal  → 暂停一个月 / 改年付 (no discount — ever)
 *       low     → a plain reminder of what can still be used before the end
 *                 (93: sent whatever is left — there is nothing to count)
 *       heavy   → nothing. Someone who asked fifteen follow-ups in half an
 *                 hour is working through something; a sales letter at
 *                 them is the wrong thing to send.
 *   - Stripe's portal now asks why (too expensive / unused / …) and the
 *     answer rides in the owner alert.
 */

export type Segment = "heavy" | "low" | "normal";
export type RetainAction = "resume" | "pause" | "year";
export const RETAIN_ACTIONS: readonly RetainAction[] = ["resume", "pause", "year"];

/** kiki's thirty-six minutes, as thresholds: 15 follow-ups, 4 readings */
export const HEAVY_FOLLOWUPS = 10;
export const HEAVY_READINGS = 5;
const DAY = 86_400_000;
export const WINBACK_LEAD_MS = 3 * DAY;

export function segmentFor(recent: { readings: number; followups: number }, periodReadings: number): Segment {
  if (recent.followups >= HEAVY_FOLLOWUPS || recent.readings >= HEAVY_READINGS) return "heavy";
  if (periodReadings === 0) return "low";
  return "normal";
}

export const SEGMENT_LABEL: Record<Segment, string> = {
  heavy: "高频（取消前 24 小时用得很多）→ 只发服务确认，不发挽回信",
  low: "低频（这一期一次没用过）→ 到期前 3 天发一封提醒，不推销",
  normal: "普通 → 到期前 3 天发一封：暂停一个月 / 改年付",
};

export const FEEDBACK_LABEL: Record<string, string> = {
  too_expensive: "太贵",
  missing_features: "缺功能",
  switched_service: "换了别家",
  unused: "用得少",
  customer_service: "客服不满意",
  too_complex: "太复杂",
  low_quality: "质量不好",
  other: "其他",
};

/* ---------------- signed links ---------------- */

function secret(): string {
  const s = process.env.REVISIT_SECRET ?? process.env.ADMIN_KEY;
  if (!s) throw new Error("no signing secret (REVISIT_SECRET/ADMIN_KEY)");
  return s;
}

export function retainToken(stripeSubId: string, action: RetainAction): string {
  return createHmac("sha256", secret()).update(`retain:${action}:${stripeSubId}`).digest("hex").slice(0, 24);
}

export function verifyRetainToken(stripeSubId: string, action: RetainAction, token: string): boolean {
  if (!/^[0-9a-f]{24}$/.test(token)) return false;
  const a = Buffer.from(retainToken(stripeSubId, action), "utf8");
  const b = Buffer.from(token, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function retainUrl(site: string, stripeSubId: string, action: RetainAction, locale: Locale): string {
  const p = new URLSearchParams({ s: stripeSubId, a: action, t: retainToken(stripeSubId, action), l: locale });
  return `${site}/api/sub/retain?${p.toString()}`;
}

/* ---------------- facts about one membership ---------------- */

export function endOf(row: Pick<SubscriptionRow, "cancel_at" | "period_end">): number | null {
  return row.cancel_at ?? row.period_end ?? null;
}

export function fmtDay(ms: number, locale: Locale): string {
  return new Intl.DateTimeFormat(LOCALE_META[locale].htmlLang, { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Shanghai" }).format(ms);
}

function localeOf(row: SubscriptionRow): Locale {
  return asLocale(customerLocaleById(row.customer_id) ?? "en");
}

function site(): string {
  return (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
}

/** How they used it: the 24 hours before they cancelled, and the whole current period. */
export function segmentOf(row: SubscriptionRow, cancelledAt: number): Segment {
  const recent = usageIn(row.customer_id, cancelledAt - DAY, cancelledAt + 1);
  const period = usageIn(row.customer_id, row.period_start ?? row.created_at, cancelledAt + 1);
  return segmentFor(recent, period.readings);
}

/** exported for /admin/members (94): which letter the one before the end would be, for someone who has not cancelled yet */
export function periodSegment(row: SubscriptionRow, now: number): Segment {
  const u = usageIn(row.customer_id, row.period_start ?? row.created_at, now);
  return segmentFor(u, u.readings);
}

/* ---------------- the moment they cancel ---------------- */

/**
 * Receipt to the customer, segment fixed for later. Runs once per
 * subscription (a second webhook for the same turn finds retain_confirm_at set).
 * Returns lines for the owner alert.
 */
export async function onCancelled(row: SubscriptionRow, now = Date.now()): Promise<string[]> {
  if (row.retain_confirm_at) return [];
  const seg = segmentOf(row, now);
  markRetainConfirm(row.id, seg);
  const email = customerEmailById(row.customer_id);
  const end = endOf(row);
  const lines = [`分层　　${SEGMENT_LABEL[seg]}`];
  if (!email || !end) return [...lines, "确认信　没发（缺邮箱或到期日）"];
  const locale = localeOf(row);
  const m = buildRetainEmail({
    locale, letter: "confirm", date: fmtDay(end, locale),
    resumeUrl: retainUrl(site(), row.stripe_subscription_id, "resume", locale), castUrl: `${site()}/${locale}/cast`,
    // 10-22 进度表 93: 「之後有事再來，買通卡就好」 — the passes on the account page
    passUrl: `${site()}/${locale}/account?want=pass#membership`,
    // 09-30 续订专属: say that resuming brings the renew-only perks back (not for rows grandfathered before the rule)
    perksBack: !renewPerks(row),
  });
  const sent = await sendEmail(email, m.subject, m.html, m.text, { kind: "sub_confirm", customerId: row.customer_id });
  recordOps("retain_confirm", `${row.stripe_subscription_id} ${seg} ${sent.ok ? "sent" : "failed:" + (sent.error ?? "?")}`);
  return [...lines, `确认信　${sent.ok ? "已发给客户（含一键恢复）" : "发送失败：" + (sent.error ?? "?")}`];
}

/* ---------------- three days before the end ---------------- */

export type WinbackPlan =
  | { send: false; kind: `skipped:${string}` }
  | { send: true; kind: "winback" | "reminder"; letter: RetainLetter };

/**
 * exported for the tests: what the one letter before the end should be.
 * 10-22 进度表 93: the reminder no longer waits on readings left (`deepLeft` — nothing is counted under the 通卡 model);
 * it says what can still be used before the end.
 */
export function planWinback(i: { segment: Segment; plan: string; hadBefore: boolean }): WinbackPlan {
  if (i.segment === "heavy") return { send: false, kind: "skipped:heavy" };
  if (i.hadBefore) return { send: false, kind: "skipped:once" };
  // a yearly member is not offered a pause or a switch to what they already have
  if (i.segment === "normal" && i.plan === "month") return { send: true, kind: "winback", letter: "winback" };
  return { send: true, kind: "reminder", letter: "reminder" };
}

export async function runWinbacks(now = Date.now()): Promise<{ sent: number; skipped: number; failed: number }> {
  const out = { sent: 0, skipped: 0, failed: 0 };
  if (!letterOn("sub_winback")) return out; // 10-23 进度表 108
  for (const row of subsEndingSoon(WINBACK_LEAD_MS, now)) {
    // cancelled before this existed (kiki): we don't know the minute they
    // cancelled (updated_at moves on every sync), so judge the period so far
    const seg = (row.retain_segment as Segment | null) ?? periodSegment(row, now);
    let plan = planWinback({ segment: seg, plan: row.plan, hadBefore: customerHadWinback(row.customer_id) });
    // 09-25 合规: the winback letter is commercial mail — someone who unsubscribed gets the plain reminder at most, never the pitch
    if (plan.send && plan.letter === "winback" && customerMarketingOk(row.customer_id) === false) plan = { send: true, kind: "reminder", letter: "reminder" };
    if (!claimRetainWinback(row.id, plan.kind)) continue;
    if (!plan.send) {
      out.skipped += 1;
      recordOps("retain_winback", `${row.stripe_subscription_id} ${plan.kind}`);
      continue;
    }
    const email = customerEmailById(row.customer_id);
    const end = endOf(row)!;
    const locale = localeOf(row);
    const s = site();
    const cur = row.currency && isCurrency(row.currency) ? row.currency : null;
    const offerYear = plan.letter === "winback" && cur != null && yearlyOn();
    const m = buildRetainEmail({
      locale, letter: plan.letter, date: fmtDay(end, locale),
      resumeUrl: retainUrl(s, row.stripe_subscription_id, "resume", locale),
      pauseUrl: plan.letter === "winback" ? retainUrl(s, row.stripe_subscription_id, "pause", locale) : null,
      yearUrl: offerYear ? retainUrl(s, row.stripe_subscription_id, "year", locale) : null,
      yearPrice: offerYear ? formatMoney(cur!, priceMinor(cur!, "year"), locale) : null,
      yearPct: offerYear ? yearlySavePct(cur!) : null,
      castUrl: `${s}/${locale}/cast`,
      unsubUrl: email ? unsubUrl(s, email, locale) : null,
      perksBack: !renewPerks(row),
    });
    const sent = email ? await sendEmail(email, m.subject, m.html, m.text, { kind: "sub_winback", customerId: row.customer_id, unsubUrl: unsubUrl(s, email, locale), locale }) : { ok: false, error: "no email" };
    if (!sent.ok) {
      releaseRetainWinback(row.id);
      out.failed += 1;
    } else out.sent += 1;
    recordOps("retain_winback", `${row.stripe_subscription_id} ${plan.kind} ${seg} ${sent.ok ? "sent" : "failed:" + (sent.error ?? "?")}`);
  }
  return out;
}

/* ---------------- the customer taps a link ---------------- */

export type RetainResult =
  | { ok: true; done: "resume" | "pause"; until?: number }
  | { ok: true; redirect: string }
  | { ok: false; reason: "stale" | "failed"; detail?: string };

function isEnding(s: StripeSubscription): boolean {
  return Boolean(s.cancel_at_period_end) || s.cancel_at != null;
}

/**
 * Undo only what is set: with the flag on, Stripe also fills cancel_at with
 * the period end, and clearing the flag clears both. Sending both parameters
 * at once is refused.
 */
export function unCancelBody(s: Pick<StripeSubscription, "cancel_at_period_end" | "cancel_at">): Record<string, string> {
  if (s.cancel_at_period_end) return { cancel_at_period_end: "false" };
  if (s.cancel_at != null) return { cancel_at: "" };
  return {};
}

export async function performRetain(action: RetainAction, stripeSubId: string, locale: Locale): Promise<RetainResult> {
  const known = subscriptionByStripeId(stripeSubId);
  if (!known) return { ok: false, reason: "stale" };
  let synced: SubscriptionRow | null;
  try {
    synced = await syncSubscription(stripeSubId, known.customer_id);
  } catch (e) {
    return fail(action, known, e);
  }
  if (!synced || !["active", "trialing"].includes(synced.status)) return { ok: false, reason: "stale" };
  const fresh: SubscriptionRow = synced;
  const ending = fresh.cancel_at_period_end === 1 || fresh.cancel_at != null;
  const end = endOf(fresh);

  try {
    if (action === "resume") {
      if (!ending) return { ok: true, done: "resume" };
      const s = await updateSubscription(stripeSubId, unCancelBody({ cancel_at_period_end: fresh.cancel_at_period_end === 1, cancel_at: fresh.cancel_at ? Math.floor(fresh.cancel_at / 1000) : null }));
      const after = mirrorSubscription(s, fresh.customer_id);
      recordOps("retain_done", `${stripeSubId} resume`);
      // 10-23 进度表 110: the reader gets a confirmation too (once — the webhook that follows finds it claimed)
      const told = after ? await sendSubLetter("resume", after, { before: fresh, via: "link" }).catch(() => "failed" as const) : "skipped";
      await tellOwner(`会员恢复续订了`, fresh, `客户点了邮件里的「恢复续订」。\n读者确认信：${told === "sent" ? "已寄" : told === "already" ? "之前已寄" : told === "off" ? "没寄（后台关着）" : `没寄（${told}）`}`);
      return { ok: true, done: "resume" };
    }

    if (action === "pause") {
      if (!ending || !end || fresh.plan !== "month") return { ok: false, reason: "stale" };
      const len = fresh.period_end && fresh.period_start ? fresh.period_end - fresh.period_start : 30 * DAY;
      // one call, so a refusal changes nothing: undo the ending AND void next month's bill.
      // Billing resumes before the following renewal, which is then charged as usual.
      const s = await updateSubscription(stripeSubId, {
        ...unCancelBody({ cancel_at_period_end: fresh.cancel_at_period_end === 1, cancel_at: fresh.cancel_at ? Math.floor(fresh.cancel_at / 1000) : null }),
        "pause_collection[behavior]": "void",
        "pause_collection[resumes_at]": Math.floor((end + len - 2 * DAY) / 1000),
      });
      mirrorSubscription(s, fresh.customer_id);
      setPause(fresh.id, end, end + len);
      recordOps("retain_done", `${stripeSubId} pause ${new Date(end).toISOString()}→${new Date(end + len).toISOString()}`);
      // 10-23 进度表 111 ②: the reader hears what they chose — no charge from … to …, picks up again on …
      const paused = subscriptionByStripeId(stripeSubId);
      const told = paused ? await sendSubLetter("pause", paused, { facts: { pause: { from: end, until: end + len } }, via: "link" }).catch(() => "failed" as const) : "skipped";
      await tellOwner(`会员选择暂停一个月`, fresh, `下一期（${fmtDay(end, "zh")} 起约一个月）不扣款、不给额度，之后自动恢复月付。\n读者确认信：${told === "sent" ? "已寄" : told === "already" ? "之前已寄" : told === "off" ? "没寄（后台关着）" : `没寄（${told}）`}`);
      return { ok: true, done: "pause", until: end + len };
    }

    // year: a fresh yearly subscription whose first charge waits for the monthly one to run out.
    // 09-26: also for a monthly member who is NOT cancelling (the review letter offers it) —
    // the monthly is then set to end at its period end once the yearly exists (onYearlyFromRetain).
    if (!end || fresh.plan !== "month") return { ok: false, reason: "stale" };
    // 09-26 (review): a second tap (email + account page, two tabs) must never make a second yearly plan
    if (activeYearlyFor(fresh.customer_id)) return { ok: false, reason: "stale" };
    const cur = fresh.currency && isCurrency(fresh.currency) ? fresh.currency : null;
    if (!cur) return { ok: false, reason: "stale" };
    const email = customerEmailById(fresh.customer_id);
    if (!email) return { ok: false, reason: "stale" };
    const anchor = end > Date.now() + 3_600_000 ? Math.floor(end / 1000) : undefined;
    const make = (mp: boolean | undefined) => createSubscriptionSession({
      productName: SUB_NAMES.year[locale],
      amountCents: priceMinor(cur, "year"),
      currency: stripeCurrency(cur),
      interval: PLANS.year.interval,
      customerEmail: email,
      stripeCustomerId: fresh.stripe_customer_id,
      successUrl: `${site()}/${locale}/account?sub={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${site()}/${locale}/account`,
      locale,
      managedPayments: mp,
      billingCycleAnchor: anchor,
      metadata: { email, locale, plan: "year", currency: cur, retain_from: stripeSubId },
    });
    let session;
    try {
      session = await make(undefined);
    } catch (e) {
      // same fallback as the ordinary checkout: sell it plainly if Managed Payments refuses
      if (!/not currently supported|managed_payments|subscription/i.test(e instanceof Error ? e.message : "")) throw e;
      session = await make(false);
    }
    if (!session.url) throw new Error("no checkout url");
    recordOps("retain_year_checkout", `${stripeSubId} → ${session.id}`);
    return { ok: true, redirect: session.url };
  } catch (e) {
    return fail(action, fresh, e);
  }
}

async function fail(action: RetainAction, row: SubscriptionRow, e: unknown): Promise<RetainResult> {
  const detail = e instanceof Error ? e.message : String(e);
  recordOps("retain_fail", `${row.stripe_subscription_id} ${action}: ${detail.slice(0, 300)}`);
  await tellOwner(`挽回操作失败（${action}）`, row, `客户点了邮件里的按钮，但 Stripe 没接受，客户看到的是「没成功，钱没动，我们会回邮件」。请回他一封。\n\n错误：${detail.slice(0, 400)}`);
  return { ok: false, reason: "failed", detail };
}

async function tellOwner(head: string, row: SubscriptionRow, body: string): Promise<void> {
  const email = customerEmailById(row.customer_id) ?? "—";
  const text = [head, "", body, "", `客户　　${email}`, `订阅　　${row.stripe_subscription_id}`, "", `客户档案：https://yaoflow.com/admin/customers/${row.customer_id}`].join("\n");
  const html = `<pre style="font:14px/1.7 ui-monospace,monospace;white-space:pre-wrap">${text.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!))}</pre>`;
  await sendEmail(ownerRecipients(), `YaoFlow · ${head}`, html, text, { kind: "sub_alert", customerId: row.customer_id }).catch(() => undefined);
}

/** Webhook: a yearly subscription born from the 改年付 link. */
export async function onYearlyFromRetain(s: StripeSubscription): Promise<void> {
  const from = s.metadata?.retain_from;
  if (!from) return;
  const old = subscriptionByStripeId(from);
  recordOps("retain_done", `${from} year → ${s.id}`);
  // 09-26 (review): two yearly plans born from the same monthly — end the newer one before its first charge
  const twin = old ? otherYearlyFor(old.customer_id, s.id) : null;
  if (old && twin) {
    try {
      const m = await updateSubscription(s.id, { cancel_at_period_end: "true" });
      mirrorSubscription(m, old.customer_id);
      await tellOwner("重复的年付已自动停掉", old, `客户建了第二个年付 ${s.id}（已有 ${twin}），已设为首次扣款前取消。请到 Stripe 确认它不会扣款。`);
    } catch (e) {
      await tellOwner("出现重复年付，没能自动停掉", old, `请到 Stripe 手动取消 ${s.id}（已有 ${twin}），否则会重复扣一年。\n\n错误：${e instanceof Error ? e.message.slice(0, 300) : "?"}`);
    }
    return;
  }
  // 09-26: switching from a running monthly — stop it at its period end so nothing is charged twice
  if (old && old.cancel_at_period_end !== 1 && old.cancel_at == null && ["active", "trialing"].includes(old.status)) {
    try {
      const m = await updateSubscription(from, { cancel_at_period_end: "true" });
      mirrorSubscription(m, old.customer_id);
    } catch (e) {
      await tellOwner("改年付后旧月付没能自动停掉", old, `请到 Stripe 手动把 ${from} 设为到期取消，否则会重复扣款。\n\n错误：${e instanceof Error ? e.message.slice(0, 300) : "?"}`);
    }
  }
  if (old) await tellOwner("会员改成年付了", old, `新年付订阅 ${s.id}，首次扣款在月付到期那天，不重复收费。旧月付照原计划到期结束。`);
}

/* ---------------- 年付续费预告 (09-25 合规) ---------------- */

/** the window: a notice goes out once the renewal is within 30 days, and never inside the last 15 (too late to count as advance notice) */
export const RENEW_NOTICE_FROM_MS = 15 * DAY;
export const RENEW_NOTICE_TO_MS = 30 * DAY;

/**
 * Yearly members who have not cancelled get one service notice about the
 * coming charge, ~30 days ahead, once per period (renew_notice_at, reset by
 * upsertSubscription when Stripe moves period_end). Not commercial mail:
 * no unsubscribe, sent regardless of the marketing box. Monthly members are
 * not covered — the laws that require this are about yearly and longer terms,
 * and a monthly notice every month would be noise.
 */
export async function runRenewalNotices(now = Date.now()): Promise<{ sent: number; failed: number }> {
  const out = { sent: 0, failed: 0 };
  for (const row of subsRenewingSoon(RENEW_NOTICE_FROM_MS, RENEW_NOTICE_TO_MS, now)) {
    if (!row.period_end || row.amount_minor == null || !row.currency || !isCurrency(row.currency)) continue;
    if (!claimRenewNotice(row.id, now)) continue;
    const email = customerEmailById(row.customer_id);
    if (!email) { unclaimRenewNotice(row.id); continue; }
    const locale = localeOf(row);
    const s = site();
    const m = buildRenewEmail({ locale, date: fmtDay(row.period_end, locale), price: formatMoney(row.currency, row.amount_minor, locale), manageUrl: `${s}/${locale}/account#membership` });
    const r = await sendEmail(email, m.subject, m.html, m.text, { kind: "sub_renew", customerId: row.customer_id, locale });
    recordOps("sub_renew_notice", `${row.stripe_subscription_id} ${locale} ${r.ok ? "sent" : "failed:" + (r.error ?? "?")}`);
    if (r.ok) out.sent += 1; else { out.failed += 1; unclaimRenewNotice(row.id); }
  }
  return out;
}

/** 09-26 (review): an active or trialing yearly plan already on this account. */
function activeYearlyFor(customerId: number): boolean {
  return !!db().prepare("SELECT 1 FROM subscriptions WHERE customer_id = ? AND plan = 'year' AND status IN ('active','trialing') AND substr(stripe_subscription_id,1,5) <> 'comp_'").get(customerId);
}
function otherYearlyFor(customerId: number, exceptStripeId: string): string | null {
  const r = db().prepare("SELECT stripe_subscription_id AS id FROM subscriptions WHERE customer_id = ? AND plan = 'year' AND status IN ('active','trialing') AND stripe_subscription_id <> ? AND substr(stripe_subscription_id,1,5) <> 'comp_' ORDER BY created_at ASC LIMIT 1").get(customerId, exceptStripeId) as { id: string } | undefined;
  return r?.id ?? null;
}
