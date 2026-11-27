import { describe, expect, it } from "vitest";
import { resetDue, localHourOf } from "../src/lib/sub-reset";
import { buildResetEmail } from "../src/lib/email";
import { LOCALES } from "../src/lib/locales";

/** 10-14 (Neil: 「做吧」): one letter when a member's allowance refreshes — not the first period, not comp/pass, not paused. */
const H = 3_600_000, D = 24 * H;
const now = Date.UTC(2026, 9, 14, 3);
const base = { stripe_subscription_id: "sub_x", status: "active", plan: "month", period_start: now - 5 * H, period_end: now + 30 * D, created_at: now - 31 * D, paused_from: null, paused_until: null };

describe("会员额度刷新提醒", () => {
  it("due in the first 36 hours of a renewed period only", () => {
    expect(resetDue(base as never, now)).toEqual({ since: base.period_start, until: base.period_end });
    expect(resetDue({ ...base, period_start: now - 40 * H } as never, now)).toBeNull();
  });
  it("never for the first period, a gift, a one-off month, a paused month or an ended one", () => {
    expect(resetDue({ ...base, created_at: now - 6 * H } as never, now)).toBeNull();
    expect(resetDue({ ...base, stripe_subscription_id: "comp_x" } as never, now)).toBeNull();
    expect(resetDue({ ...base, stripe_subscription_id: "pass_x" } as never, now)).toBeNull();
    expect(resetDue({ ...base, paused_from: now - D, paused_until: now + 20 * D } as never, now)).toBeNull();
    expect(resetDue({ ...base, status: "canceled" } as never, now)).toBeNull();
  });
  it("the member's own hour, Taipei when unknown", () => {
    expect(localHourOf("Asia/Taipei", now)).toBe(11);
    expect(localHourOf(null, now)).toBe(11);
    expect(localHourOf("America/New_York", now)).toBe(23);
  });
  it("every language: no placeholder left, the numbers in, the breakdown only when there is one", () => {
    for (const l of LOCALES) {
      const m = buildResetEmail({ locale: l, deep: 12, carry: 2, friends: 0, follow: 30, until: "2026-11-14", castUrl: "https://x/cast", manageUrl: "https://x/acc" });
      expect(m.subject + m.text, l).not.toMatch(/\{\w+\}/);
      expect(m.text, l).toContain("12");
      expect(m.text, l).toContain("2");
    }
    const zh = buildResetEmail({ locale: "zh-hant", deep: 10, carry: 0, friends: 0, follow: 30, until: "11月14日", castUrl: "u", manageUrl: "v" });
    expect(zh.text).not.toContain("順延");
    expect(zh.subject).toContain("10 份深斷");
  });
});

import { createQianDraw, markQianPaid, setQianPersonal, db } from "../src/lib/db";
import { mailQianOnce } from "../src/lib/qian-personal";

describe("解籤信：每支籤一封，不管谁先看到付款", () => {
  it("nothing before the reading is written; then one claim only, however many paths ask", async () => {
    const token = "t".repeat(24) + "mail1013";
    createQianDraw({ token, setName: "liushi", num: 23, temple: null, situation: "reunion", question: "他會回來嗎", locale: "zh-hant", device: null, customerId: null, email: "buyer@example.com" });
    expect(await mailQianOnce(token, "https://x")).toBe("skip");
    markQianPaid(token, { session: "member:1", email: "buyer@example.com", currency: "TWD", amountMinor: 0, customerId: null });
    setQianPersonal(token, { now: "x" });
    const first = await mailQianOnce(token, "https://x");
    expect(["sent", "failed"]).toContain(first); // no mail key in tests — what matters is that it was claimed
    expect(await mailQianOnce(token, "https://x")).toBe("already");
    expect((db().prepare("SELECT COUNT(*) AS n FROM emails WHERE session_id = ? AND kind = 'qian-mail'").get(`qian:${token}`) as { n: number }).n).toBe(1);
  });
});
