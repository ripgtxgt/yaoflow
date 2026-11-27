import { describe, expect, it } from "vitest";
import { capCheck, capSpend, dayCapFor, DAY_CAPS, MEMBER_DAY_CAPS, ratePerMin, RATE_PER_MIN, setCapOverride, capOverrides } from "../src/lib/caps";
import { openLetterPerks } from "../src/lib/welcome";
import { db, upsertCustomer } from "../src/lib/db";

/** 10-22 进度表 94 第三批: the fair-use caps can be changed from /admin/limits, without a deploy, and every change is logged */
describe("上限可改 (94 ③)", () => {
  it("defaults until changed; a change takes effect at once, is checked, logged, and can be cleared", () => {
    expect(dayCapFor("tarot")).toBe(DAY_CAPS.tarot);
    expect(dayCapFor("qa", true)).toBe(MEMBER_DAY_CAPS.qa);
    expect(dayCapFor("cast", true)).toBe(DAY_CAPS.cast); // no member number: the pass's
    expect(ratePerMin()).toBe(RATE_PER_MIN);

    expect(setCapOverride("cap:nope", 3, "test")).toEqual({ ok: false, why: "key" });
    for (const bad of [0, 1001, 1.5, Number.NaN]) expect(setCapOverride("cap:tarot", bad, "test")).toEqual({ ok: false, why: "value" });

    expect(setCapOverride("cap:tarot", 2, "test")).toEqual({ ok: true, before: null, after: 2 });
    expect(dayCapFor("tarot")).toBe(2);
    const cid = upsertCustomer("caps-override@example.com", "zh-hant");
    const now = Date.UTC(2026, 9, 22, 2);
    capSpend(cid, "tarot", "a", now);
    capSpend(cid, "tarot", "b", now + 30_000);
    const v = capCheck(cid, "tarot", { ref: "c", now: now + 3_600_000 });
    expect(!v.ok && v.why).toBe("day");
    expect(!v.ok && v.cap).toBe(2);

    expect(setCapOverride("cap_member:qa", 80, "test").ok).toBe(true);
    expect(dayCapFor("qa", true)).toBe(80);
    expect(dayCapFor("qa", false)).toBe(DAY_CAPS.qa);
    // the member letter's list follows the number in force
    expect(openLetterPerks("member", "zh-hant").join("\n")).toContain("每天 80 題");
    expect(capOverrides().get("cap_member:qa")).toBe(80);

    expect(setCapOverride("cap:tarot", null, "test")).toEqual({ ok: true, before: 2, after: null });
    expect(setCapOverride("cap_member:qa", null, "test").ok).toBe(true);
    expect(dayCapFor("tarot")).toBe(DAY_CAPS.tarot);
    expect(dayCapFor("qa", true)).toBe(MEMBER_DAY_CAPS.qa);
    const log = db().prepare("SELECT detail FROM ops_events WHERE kind = 'cap_set' ORDER BY id").all() as { detail: string }[];
    expect(log.map((r) => r.detail)).toEqual([
      "cap:tarot 默认→2 by test", "cap_member:qa 默认→80 by test", "cap:tarot 2→默认 by test", "cap_member:qa 80→默认 by test",
    ]);
  });
});
