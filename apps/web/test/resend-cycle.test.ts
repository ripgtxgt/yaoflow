import { describe, expect, it } from "vitest";
import { resendCycle } from "../src/lib/resend-cycle";

/** 10-01: the mail quota gauge follows Resend's billing day (the 21st), not the calendar month. */
describe("resend billing cycle", () => {
  it("starts on the latest 21st and ends on the next", () => {
    expect(resendCycle(Date.UTC(2026, 9, 1, 5), 21)).toEqual({ start: Date.UTC(2026, 8, 21), end: Date.UTC(2026, 9, 21) });
    expect(resendCycle(Date.UTC(2026, 9, 21, 0), 21)).toEqual({ start: Date.UTC(2026, 9, 21), end: Date.UTC(2026, 10, 21) });
    expect(resendCycle(Date.UTC(2027, 0, 5), 21)).toEqual({ start: Date.UTC(2026, 11, 21), end: Date.UTC(2027, 0, 21) });
  });
  it("clamps a 31st to short months", () => {
    expect(resendCycle(Date.UTC(2026, 2, 5), 31)).toEqual({ start: Date.UTC(2026, 1, 28), end: Date.UTC(2026, 2, 31) });
  });
});
