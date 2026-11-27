import { describe, expect, it } from "vitest";

/**
 * 09-22 (Neil: 「如果客户取消了续订，我们会不会收到通知呢？」). The answer was no:
 * the webhook mirrored the cancellation faithfully and then said nothing, so
 * it surfaced as a number on the dashboard or in Monday's digest — up to seven
 * days later. With four members that is four silent ways to lose a quarter of
 * the recurring revenue.
 *
 * These pin down WHEN it speaks. An alert nobody trusts is one that fires on
 * every renewal, so only the turns are mailed, never the steady state.
 */
const sub = (o: Partial<{ status: string; cancel: boolean }> = {}) => ({
  id: "sub_x",
  status: o.status ?? "active",
  cancel_at_period_end: o.cancel ?? false,
  items: { data: [{ price: { unit_amount: 6800, currency: "hkd", recurring: { interval: "month" } }, current_period_end: 1790000000 }] },
}) as never;
const row = (o: Partial<{ status: string; cancel: number }> = {}) => ({
  status: o.status ?? "active",
  cancel_at_period_end: o.cancel ?? 0,
  plan: "month",
  customer_id: 1,
}) as never;

describe("会员变化的通知，只在转折时响", () => {
  it("speaks when they switch auto-renew off", async () => {
    const { turnFor } = await import("../src/lib/sub-alert");
    expect(turnFor(row({ cancel: 0 }), sub({ cancel: true }), false)).toBe("canceling");
  });

  it("speaks when the subscription actually ends", async () => {
    const { turnFor } = await import("../src/lib/sub-alert");
    expect(turnFor(row(), sub({ status: "canceled" }), true)).toBe("gone");
  });

  it("speaks when a renewal payment fails", async () => {
    const { turnFor } = await import("../src/lib/sub-alert");
    expect(turnFor(row({ status: "active" }), sub({ status: "past_due" }), false)).toBe("past_due");
  });

  it("speaks when they change their mind", async () => {
    const { turnFor } = await import("../src/lib/sub-alert");
    expect(turnFor(row({ cancel: 1 }), sub({ cancel: false }), false)).toBe("revived");
  });

  it("stays quiet on a renewal that simply went through", async () => {
    const { turnFor } = await import("../src/lib/sub-alert");
    expect(turnFor(row({ status: "active", cancel: 0 }), sub({ status: "active", cancel: false }), false)).toBeNull();
  });

  it("stays quiet while a cancellation it already reported is still pending", async () => {
    const { turnFor } = await import("../src/lib/sub-alert");
    expect(turnFor(row({ cancel: 1 }), sub({ cancel: true }), false)).toBeNull();
  });

  it("does not shout about a brand-new subscription — that is good news, not an alert", async () => {
    const { turnFor } = await import("../src/lib/sub-alert");
    expect(turnFor(null, sub(), false)).toBeNull();
  });
});

/**
 * 09-23, from the first real cancellation — which we missed.
 *
 * Stripe schedules an ending two ways and the dashboard prints 「取消日期」 for
 * both: `cancel_at_period_end` (a flag) and `cancel_at` (a timestamp).
 * kiki0931611144 cancelled through the portal, which used `cancel_at`; the
 * flag stayed false. The webhook arrived, was mirrored as an ordinary update,
 * and raised nothing. The alert shipped the night before and the first thing
 * it had to catch, it did not.
 */
describe("Stripe 的两种取消，都得认", () => {
  const cancelAtSub = {
    id: "sub_kiki",
    status: "active",
    cancel_at_period_end: false,          // the flag Stripe did NOT set
    cancel_at: 1792680000,                 // the timestamp it did
    items: { data: [{ price: { unit_amount: 24900, currency: "twd", recurring: { interval: "month" } }, current_period_end: 1792680000 }] },
  } as never;
  const live = { status: "active", cancel_at_period_end: 0, cancel_at: null, plan: "month", customer_id: 1 } as never;

  it("catches a cancellation scheduled with cancel_at, not just the flag", async () => {
    const { turnFor } = await import("../src/lib/sub-alert");
    expect(turnFor(live, cancelAtSub, false)).toBe("canceling");
  });

  it("does not repeat itself once that ending is already on record", async () => {
    const { turnFor } = await import("../src/lib/sub-alert");
    const known = { status: "active", cancel_at_period_end: 0, cancel_at: 1792680000, plan: "month", customer_id: 1 } as never;
    expect(turnFor(known, cancelAtSub, false)).toBeNull();
  });

  it("notices when a cancel_at ending is called off", async () => {
    const { turnFor } = await import("../src/lib/sub-alert");
    const known = { status: "active", cancel_at_period_end: 0, cancel_at: 1792680000, plan: "month", customer_id: 1 } as never;
    const called_off = { ...(cancelAtSub as object), cancel_at: null } as never;
    expect(turnFor(known, called_off, false)).toBe("revived");
  });
});
