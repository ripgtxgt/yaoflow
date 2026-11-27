import { describe, expect, it } from "vitest";
import { LEDGER_EVERY_MS, ledgerDue } from "../src/lib/ledger";

/**
 * 10-13 (#1951's A$19.99 took 40 minutes to reach the books): with a 30-minute throttle and the 10-minute fulfil cron,
 * a sync at 12:10:06 made the 12:40:01 tick five seconds short — skipped — so the next one was 12:50. The pages say
 * "every 30 minutes"; the cadence must be that, whatever the phase.
 */
describe("Stripe ledger refresh: every 30 minutes on the 10-minute cron", () => {
  const MIN = 60_000;
  // cron ticks at hh:x0:01; a request can start late. Returns how many ticks apart the syncs land.
  const gaps = (offsetsSec: readonly number[]) => {
    const at: number[] = [];
    let last = -Infinity;                                   // like a fresh server: the first tick always syncs
    for (let tick = 0; tick < 36; tick++) {                 // six hours
      const now = tick * 10 * MIN + 1_000 + offsetsSec[tick % offsetsSec.length]! * 1000;
      if (ledgerDue(now, last)) { at.push(tick); last = now; }
    }
    return at.slice(1).map((t, i) => t - at[i]!);
  };

  it("the case that happened: a sync at :10:06, the tick at :40:01 now runs (it was 5 s short of 30 min)", () => {
    const last = 10 * MIN + 6_000, tick = 40 * MIN + 1_000;
    expect(ledgerDue(tick, last)).toBe(true);
  });

  it("the tick 20 minutes on never runs (it would double the Stripe calls)", () => {
    expect(ledgerDue(30 * MIN + 1_000, 10 * MIN + 6_000)).toBe(false);
    expect(ledgerDue(30 * MIN + 1_000 + 3 * MIN, 10 * MIN)).toBe(false); // even with a 3-minute slow tick
  });

  it("steady state is every third tick (30 minutes), whatever the phase and up to 4 minutes of lateness", () => {
    for (const offs of [[0], [5], [0, 150, 30, 170, 60, 10, 120, 90, 5, 160], [240, 0, 0], [0, 240, 0], [0, 0, 240, 200, 0, 30, 0]]) {
      expect(new Set(gaps(offs))).toEqual(new Set([3]));
    }
  });

  it("the throttle itself sits between two and three ticks", () => {
    expect(LEDGER_EVERY_MS).toBeGreaterThan(20 * MIN);
    expect(LEDGER_EVERY_MS).toBeLessThan(30 * MIN);
  });
});
