/**
 * 10-01 (Neil: 「以 resend 重置额度的时间为准」): Resend's monthly quota resets on the account's BILLING day, not the
 * calendar month. The Pro plan renews on the 21st (billing page "Renews Oct 21", invoice Sep 21), so the gauge counts
 * from the most recent 21st (UTC). RESEND_CYCLE_DAY overrides if the plan is ever re-subscribed on another day.
 */
export const RESEND_CYCLE_DAY = Number(process.env.RESEND_CYCLE_DAY) || 21;

const dayIn = (y: number, m: number, day: number) => Date.UTC(y, m, Math.min(day, new Date(Date.UTC(y, m + 1, 0)).getUTCDate()));

/** The current billing cycle (UTC): starts on the latest cycle day on or before now, ends on the next one. */
export function resendCycle(nowMs: number, cycleDay = RESEND_CYCLE_DAY): { start: number; end: number } {
  const d = new Date(nowMs);
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  const start = dayIn(y, m, cycleDay) <= nowMs ? dayIn(y, m, cycleDay) : dayIn(y, m - 1, cycleDay);
  const s = new Date(start);
  return { start, end: dayIn(s.getUTCFullYear(), s.getUTCMonth() + 1, cycleDay) };
}
