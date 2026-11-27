import { customerEmailById, customerLocaleById, db, latestSubscription, recordEmail, recordOps, type SubscriptionRow } from "./db";
import { buildResetEmail, sendEmail } from "./email";
import { allowanceWindow, entitlementFor, inPause, isCompSubscription, isPassSubscription, LIVE_STATUSES } from "./subscription";
import { fmtDay } from "./retain";
import { asLocale, type Locale } from "./locales";
import { MEMBER_FOLLOWUP_LIMIT } from "./sub-plan";

/**
 * 10-14 会员额度刷新提醒 (Neil: 「会员每月额度重置时……发一封提醒信」→「做吧」). When a member's allowance period turns
 * over, one short letter: this period's full readings (with what carried over and what friends added), unlimited light
 * readings, follow-ups, the next refresh date, and a button to cast.
 *   - monthly renewals and the 30-day windows of the old yearly plans; not the first period (the welcome letter says it),
 *     not a gift membership (comp_), not a one-off month (pass_ — it never refreshes), not inside a paused month;
 *   - only in the first 36 hours of the new period, and between 9:00 and 21:00 in the member's own zone (customers.tz,
 *     else Taipei) — a late night refresh goes out the next morning;
 *   - once per period: the emails row `reset:<subscription>:<period start>` is the claim; test addresses are skipped.
 * Runs from the fulfil sweep once an hour.
 */
const H = 3_600_000;
const DAY = 24 * H;

export function localHourOf(tz: string | null, now: number): number {
  try { if (tz) return Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(now)); } catch { /* unknown zone */ }
  return Math.floor((((now + 8 * H) % DAY) + DAY) % DAY / H);
}

/** Whether this subscription's current window is a fresh one worth the letter now (pure, for the tests). */
export function resetDue(sub: Pick<SubscriptionRow, "stripe_subscription_id" | "status" | "plan" | "period_start" | "period_end" | "created_at" | "paused_from" | "paused_until">, now: number): { since: number; until: number } | null {
  if (!LIVE_STATUSES.has(sub.status)) return null;
  if (isCompSubscription(sub.stripe_subscription_id) || isPassSubscription(sub.stripe_subscription_id)) return null;
  if (inPause(sub, now)) return null;
  const w = allowanceWindow(sub as SubscriptionRow, now);
  if (now < w.since || now - w.since > 36 * H) return null;
  // the first period is the welcome letter's
  if (w.since - sub.created_at < 2 * DAY) return null;
  return w;
}

/**
 * 10-22 进度表 95 ② (Neil: 「我们的通卡开通的邮件和会员邮件很有问题啊」): stopped. Since 10-22 a membership is
 * unlimited, so there is no allowance to refresh — the letter went out as 「999 份深斷已經刷新」 (deepTotal is the
 * unlimited placeholder). The month's letter is now the 流月信 (lib/month-letter.ts). The plan said setting
 * SUB_RESET_MAIL=off would stop it, but no such switch existed: it is off unless SUB_RESET_MAIL=on, and goes with the
 * fulfil sweep's call when that file is next edited.
 */
export async function runResetMail(now = Date.now()): Promise<{ sent: number; failed: number }> {
  const out = { sent: 0, failed: 0 };
  if (process.env.SUB_RESET_MAIL !== "on") return out;
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  const rows = db().prepare(
    `SELECT s.* FROM subscriptions s JOIN customers c ON c.id = s.customer_id
     WHERE s.status IN ('active','trialing') AND COALESCE(c.test_flag, 0) = 0
       AND substr(s.stripe_subscription_id,1,5) NOT IN ('comp_','pass_')`,
  ).all() as unknown as SubscriptionRow[];
  for (let sub of rows) {
    // a monthly mirror still showing last period (the renewal not synced yet): re-read it from Stripe first
    if (sub.plan === "month" && sub.period_end && sub.period_end < now) {
      await entitlementFor(sub.customer_id).catch(() => null);
      sub = latestSubscription(sub.customer_id) ?? sub;
    }
    const w = resetDue(sub, now);
    if (!w) continue;
    const tz = (db().prepare("SELECT tz FROM customers WHERE id = ?").get(sub.customer_id) as { tz: string | null } | undefined)?.tz ?? null;
    const h = localHourOf(tz, now);
    if (h < 9 || h >= 21) continue;
    const email = customerEmailById(sub.customer_id);
    if (!email) continue;
    const key = `reset:${sub.id}:${w.since}`;
    const claimed = (db().prepare("INSERT INTO emails (session_id, kind, email, sent_at, status, detail) VALUES (?, 'sub-reset', ?, ?, 'sending', NULL) ON CONFLICT(session_id, kind) DO NOTHING")
      .run(key, email, now) as unknown as { changes?: number }).changes;
    if (!claimed) continue;
    const ent = await entitlementFor(sub.customer_id);
    if (!ent.active) { recordEmail(key, "sub-reset", email, "skipped", "inactive"); continue; }
    const locale: Locale = asLocale(customerLocaleById(sub.customer_id) ?? "en");
    const carry = ent.carried ?? 0, friends = ent.friendBonus ?? 0;
    const m = buildResetEmail({
      locale, deep: ent.deepTotal, carry, friends, follow: MEMBER_FOLLOWUP_LIMIT,
      until: fmtDay(ent.resetsAt ?? w.until, locale), castUrl: `${site}/${locale}/cast?c=sub-reset`, manageUrl: `${site}/${locale}/account#membership`,
    });
    const r = await sendEmail(email, m.subject, m.html, m.text, { kind: "sub_reset", customerId: sub.customer_id, locale });
    recordEmail(key, "sub-reset", email, r.ok ? "sent" : "failed", r.ok ? r.id : r.error);
    recordOps("sub_reset", `${sub.stripe_subscription_id} ${locale} ${r.ok ? "sent" : "failed:" + (r.error ?? "?")}`);
    if (r.ok) out.sent += 1; else out.failed += 1;
  }
  return out;
}
