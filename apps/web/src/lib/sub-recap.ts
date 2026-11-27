import { letterOn } from "./letter-switch";
import { claimRecap, customerEmailById, db, recordOps, subsForRecap, threadCastsForCustomer, unclaimRecap } from "./db";
import { buildRecapEmail, sendEmail } from "./email";
import { allowanceWindow, isPassSubscription, yearlyOn } from "./subscription";
import { formatMoney, isCurrency, priceMinor, tongkaMinor, yearlySavePct } from "./money";
import { fmtDay, retainUrl } from "./retain";
import { asLocale, type Locale } from "./locales";
import { customerLocaleById, customerMarketingOk } from "./db";
import { dayStart } from "./caps";

/**
 * 续费前的会员回顾 (Neil 09-26). Three days before a monthly membership
 * renews, one letter: what they used, the matters of the month and where each
 * stands, the renewal date — and, from the second month on, the yearly plan
 * offered once. Once per period (subscriptions.recap_at, reset when Stripe
 * moves period_end).
 *
 * 10-22 进度表 95 ④: a membership has no allowance any more, so the letter no longer counts 「輕解讀／深斷 of N」 nor
 * prices each one; it counts what was really used this period — 深斷, 塔羅, 解籤, 報告, 問答 (lib/caps.ts cap_events,
 * one per thing: a chart reopened or a lot reread the same day is one) and the daily letters received — and says
 * 「這個月有 {d} 天用到，按 1 日通卡算是 {d × 1 日通卡}」.
 */
export const RECAP_LEAD_MS = 3 * 86_400_000;
const DAY = 86_400_000;

export interface PeriodUse { deep: number; tarot: number; qian: number; report: number; qa: number; letters: number; days: number }

/** what this account used since `since` (pure SQL over cap_events and the member letters; the tests call it) */
export function periodUse(customerId: number, since: number, now = Date.now()): PeriodUse {
  const d = db();
  d.exec("CREATE TABLE IF NOT EXISTS cap_events (id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL, kind TEXT NOT NULL, ref TEXT, at INTEGER NOT NULL)");
  const rows = d.prepare(
    `SELECT kind, COUNT(DISTINCT COALESCE(ref, 'e' || id) || ':' || ((at + 28800000) / 86400000)) AS n
       FROM cap_events WHERE customer_id = ? AND at >= ? AND at < ? GROUP BY kind`,
  ).all(customerId, since, now) as { kind: string; n: number }[];
  const by = (k: string) => Number(rows.find((r) => r.kind === k)?.n ?? 0);
  // a day counts once whatever was used on it (Taipei days, as the caps count them)
  const days = Number((d.prepare(
    "SELECT COUNT(DISTINCT (at + 28800000) / 86400000) AS v FROM cap_events WHERE customer_id = ? AND at >= ? AND at < ?",
  ).get(customerId, since, now) as { v: number }).v ?? 0);
  // `ml:<id>:<day>` — a range on the key (';' follows ':'), so the unique index on emails serves it, not a scan
  const letters = Number((d.prepare(
    "SELECT COUNT(*) AS v FROM emails WHERE session_id >= ? AND session_id < ? AND kind = 'member_letter' AND status = 'sent' AND sent_at >= ? AND sent_at < ?",
  ).get(`ml:${customerId}:`, `ml:${customerId};`, since, now) as { v: number }).v ?? 0);
  return { deep: by("cast"), tarot: by("tarot"), qian: by("qian"), report: by("report"), qa: by("qa"), letters, days };
}

export async function runRecaps(now = Date.now()): Promise<{ sent: number; failed: number }> {
  const out = { sent: 0, failed: 0 };
  if (!letterOn("sub_recap")) return out; // 10-23 进度表 108
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  for (const row of subsForRecap(0, RECAP_LEAD_MS, now)) {
    // a 通卡 never renews: nothing to look back on before a renewal
    if (isPassSubscription(row.stripe_subscription_id)) continue;
    if (!row.period_end || !claimRecap(row.id, now)) continue;
    const email = customerEmailById(row.customer_id);
    if (!email) { unclaimRecap(row.id); continue; }
    const locale: Locale = asLocale(customerLocaleById(row.customer_id) ?? "en");
    const cur = (row.currency ?? "USD").toUpperCase();
    const w = allowanceWindow(row, now);
    const use = periodUse(row.customer_id, Math.max(w.since, dayStart(now) - 35 * DAY), now);
    const money = isCurrency(cur);
    const paidMinor = row.amount_minor ?? (money ? priceMinor(cur, "month") : 0);
    const valueMinor = money && use.days > 0 ? use.days * tongkaMinor(cur, 1, false) : 0;
    const matters = threadCastsForCustomer(row.customer_id)
      .filter((c) => c.created_at >= w.since && c.tier)
      .slice(0, 4)
      .map((c) => ({
        q: c.question.length > 36 ? c.question.slice(0, 36) + "…" : c.question,
        status: c.outcome ? ("answered" as const) : c.due_at && c.due_at > now ? ("next" as const) : ("waiting" as const),
        ...(c.due_at && c.due_at > now && !c.outcome ? { date: fmtDay(c.due_at, locale) } : {}),
      }));
    // the yearly plan: once they have renewed at least once
    // 09-26 (review): the yearly offer is a pitch — not for someone who said no to our other mail
    const year = money && yearlyOn() && now - row.created_at > 40 * DAY && customerMarketingOk(row.customer_id) !== false
      ? { url: retainUrl(site, row.stripe_subscription_id, "year", locale), price: formatMoney(cur, priceMinor(cur, "year"), locale), pct: yearlySavePct(cur) }
      : null;
    const m = buildRecapEmail({
      locale, date: fmtDay(row.period_end, locale),
      paid: money ? formatMoney(cur, paidMinor, locale) : "",
      days: use.days, value: money && valueMinor > 0 ? formatMoney(cur, valueMinor, locale) : null,
      deep: use.deep, tarot: use.tarot, qian: use.qian, report: use.report, qa: use.qa, letters: use.letters,
      matters, castUrl: `${site}/${locale}/cast`, manageUrl: `${site}/${locale}/account#membership`, year,
    });
    const r = await sendEmail(email, m.subject, m.html, m.text, { kind: "sub_recap", customerId: row.customer_id, locale });
    recordOps("sub_recap", `${row.stripe_subscription_id} ${locale} ${r.ok ? "sent" : "failed:" + (r.error ?? "?")}`);
    if (r.ok) out.sent += 1; else { out.failed += 1; unclaimRecap(row.id); }
  }
  return out;
}
