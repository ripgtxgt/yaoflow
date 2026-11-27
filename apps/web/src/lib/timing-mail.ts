import { lastMailAt, mailCountSince } from "./db";

/**
 * 10-07 应期类信收口 (Neil: 「有没有必要把应验的邮件全部给停了，因为现在的效果一点都不好」→ 收口，不全停 →「要」).
 *
 * Three letters are about a reading's timing: the heads-up a week before (headsup), the day itself (dayof) and the
 * "did it come true" revisit after the window (revisit). Each ran per reading, so a member using a reading a day got a
 * letter a day — in the fortnight to 10-06, 1,052 letters went to 364 addresses, 24 of them got 8 or more (max 21), and
 * 20 of those 24 were members. None of the three moved purchases (10.6–14.2% bought within 7 days against the same
 * buyers' ambient 11.4%), but they are read (55–70% opened, 0 complaints) and the revisit's answers (28%, 37% once a
 * week old) are the only outcome feedback there is. So the family is capped per address instead of stopped:
 *
 *   - one letter of the family a day (TIMING_DAY_MS): the crons run dayof, then revisit, then headsup — that order is
 *     the priority, since the one already sent today blocks the later ones;
 *   - at most TIMING_WEEK_MAX in seven days;
 *   - the revisit's 5-day reminder is off unless REVISIT_REMIND=on (52 reminders brought 3 answers);
 *   - members get no heads-up (the account page shows the next date; the day-of letter and the revisit still come);
 *   - a revisit whose window closed more than REVISIT_STALE_MS ago is not asked (a capped one waits a day, not weeks).
 *
 * Letters about a purchase itself (delivery, receipt, membership) are not in the family and are not counted.
 */
export const TIMING_KINDS = ["headsup", "dayof", "revisit"] as const;
export const TIMING_DAY_MS = 20 * 3_600_000;
export const TIMING_WEEK_MS = 7 * 86_400_000;
export const TIMING_WEEK_MAX = 3;
export const REVISIT_STALE_MS = 14 * 86_400_000;

export type TimingGate = "ok" | "today" | "week";

/** May this address get a letter of the family now? "today" = one went out in the last 20 hours; "week" = three in seven days. */
export function timingMailGate(email: string, now = Date.now()): TimingGate {
  const kinds = [...TIMING_KINDS];
  const last = lastMailAt(email, kinds);
  if (last !== null && now - last < TIMING_DAY_MS) return "today";
  if (mailCountSince(email, kinds, now - TIMING_WEEK_MS) >= TIMING_WEEK_MAX) return "week";
  return "ok";
}

/** The reminder five days after an unanswered revisit mail: off since 10-07 unless switched back on. */
export const revisitRemindOn = (): boolean => process.env.REVISIT_REMIND === "on";
