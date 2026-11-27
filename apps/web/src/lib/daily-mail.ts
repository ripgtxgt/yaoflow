import { letterOn } from "./letter-switch";
import { resolveCast } from "@yaoflow/engine";
import { claimDailySend, dailySubsDue, recordOps, unclaimDailySend } from "./db";
import { buildDailyEmail, sendEmail } from "./email";
import { PILES, dailyValues } from "./daily";
import { homeDay } from "./clock";
import { hexName } from "./names";
import { asLocale } from "./locales";
import { unsubToken, unsubValid } from "./unsub";
import { validTimeZone } from "./tz";

/**
 * 每日三卦邮件 (09-26, Neil: 「1，2，3 都做吧」). Double opt-in (the confirmation
 * link sets confirmed_at); one letter a day with the day's three figure names
 * and a link to pick one — no reading text, nothing generated per person.
 * Sent from the fulfil cron once the subscriber's own clock passes 07:00, at
 * most once per day key; every letter carries a one-click unsubscribe.
 */
export const DAILY_SEND_HOUR = 7;
const site = () => (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");

/** the unsubscribe token is scoped to this list, so a launch-mail link cannot stop the daily and vice versa */
export const dailyUnsubUrl = (email: string, locale: string) =>
  `${site()}/api/daily/sub?u=${encodeURIComponent(email.trim().toLowerCase())}&t=${unsubToken(`daily:${email}`)}&l=${encodeURIComponent(locale)}`;
export const dailyUnsubValid = (email: string, token: string) => unsubValid(`daily:${email}`, token);
export const dailyConfirmUrl = (token: string, locale: string) => `${site()}/api/daily/sub?c=${token}&l=${encodeURIComponent(locale)}`;

export function localHour(tz: string | null, now = Date.now()): number {
  const zone = tz && validTimeZone(tz) ? tz : "Asia/Taipei";
  const h = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", hourCycle: "h23" }).format(now);
  return Number(h) % 24;
}

export async function runDailyMail(now = Date.now()): Promise<{ sent: number; failed: number; waiting: number }> {
  const out = { sent: 0, failed: 0, waiting: 0 };
  if (!letterOn("daily_mail")) return out; // 10-23 进度表 108: turned off in /admin/letters
  const day = homeDay(now);
  const names = new Map<string, string[]>();
  for (const row of dailySubsDue(day)) {
    if (localHour(row.tz, now) < DAILY_SEND_HOUR) { out.waiting += 1; continue; }
    if (!claimDailySend(row.id, day)) continue;
    const locale = asLocale(row.locale);
    if (!names.has(locale)) names.set(locale, PILES.map((p) => hexName(resolveCast(dailyValues(day, p)).primary, locale)));
    const m = buildDailyEmail({ locale, names: names.get(locale)!, todayUrl: `${site()}/${locale}/today?c=dailymail`, unsubUrl: dailyUnsubUrl(row.email, locale) });
    const r = await sendEmail(row.email, m.subject, m.html, m.text, { kind: "daily", locale, unsubUrl: dailyUnsubUrl(row.email, locale) });
    if (r.ok) out.sent += 1;
    else { out.failed += 1; unclaimDailySend(row.id, row.last_day); }
  }
  if (out.sent || out.failed) recordOps("daily_mail", `${day} sent ${out.sent} failed ${out.failed}`);
  return out;
}
