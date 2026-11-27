import { describe, expect, it } from "vitest";
import { upsertCustomer, upsertSubscription } from "../src/lib/db";
import { RIGHTS, allowance, can, capped, followupLimitFor, rightsFor, rightsOf, spendRight, useRight, type Right } from "../src/lib/entitlements";
import { recordCard } from "../src/lib/today-qian";
import { DAY_CAPS, MEMBER_DAY_CAPS } from "../src/lib/caps";
import { MEMBER_FOLLOWUP_LIMIT } from "../src/lib/sub-plan";

process.env.TONGKA_MODEL = "on"; // 10-22: the rights table is asserted under the 通卡 model

/** 10-22 进度表 56 — who may use what, from one table */
const D = 86_400_000;
const now = Date.UTC(2026, 9, 22, 2); // 10:00 台北
const sub = (cid: number, id: string, extra: Partial<Parameters<typeof upsertSubscription>[0]> = {}) =>
  upsertSubscription({ customerId: cid, stripeCustomerId: id.startsWith("sub_") ? `cus_${id}` : null, stripeSubscriptionId: id, status: "active", plan: "month", periodStart: now - D, periodEnd: now + 29 * D, cancelAtPeriodEnd: !id.startsWith("sub_"), currency: "twd", amountMinor: 26900, ...extra });

describe("会员权益表 (56)", () => {
  it("standing: member / comp / pass / card / none", async () => {
    const m = upsertCustomer("rt-member@example.com", "zh-hant"); sub(m, "sub_rt_m");
    const c = upsertCustomer("rt-comp@example.com", "zh-hant"); sub(c, "comp_rt_c", { plan: "year", amountMinor: 0 });
    const p = upsertCustomer("rt-pass@example.com", "zh-hant"); sub(p, "pass_rt_p", { passDays: 7, amountMinor: 19900 });
    const k = upsertCustomer("rt-card@example.com", "zh-hant"); recordCard({ customerId: k, sessionId: "cs_rt_card", currency: "twd", amount: 5900, now });
    const n = upsertCustomer("rt-none@example.com", "zh-hant");
    const lapsed = upsertCustomer("rt-lapsed@example.com", "zh-hant"); sub(lapsed, "sub_rt_lapsed", { status: "canceled", periodEnd: now - 10 * D });
    expect((await rightsFor(m, now)).standing).toBe("member");
    expect((await rightsFor(c, now)).standing).toBe("comp");
    const rp = await rightsFor(p, now);
    expect(rp.standing).toBe("pass"); expect(rp.passDays).toBe(7); expect(rp.unlimited).toBe(true);
    expect((await rightsFor(k, now)).standing).toBe("card");
    expect((await rightsFor(n, now)).standing).toBe("none");
    expect((await rightsFor(null, now)).standing).toBe("none");
    expect((await rightsFor(lapsed, now)).standing).toBe("none");
  });

  it("the table: 會員 and comp have everything; a 通卡 has the readings but not the letters, the rewrite, the 8 折 or (92) the 運勢／每天 side; a 籤卡 only the daily lot", () => {
    const all = Object.keys(RIGHTS) as Right[];
    expect(rightsOf("member")).toEqual(all);
    expect(rightsOf("comp")).toEqual(all);
    const pass = rightsOf("pass");
    for (const r of ["deep_reading", "member_followups", "tarot_reading", "qian_personal", "chart_report", "chart_qa"] as Right[]) expect(pass).toContain(r);
    // 10-22 进度表 92 「通卡看本命，會員看流年」 (a pass bought before the split keeps the first two — test/rights-split.test.ts)
    for (const r of ["chart_rewrite", "member_letter", "bigs_discount", "daily_qian_full", "chart_flow", "daily_personal"] as Right[]) expect(pass).not.toContain(r);
    expect(rightsOf("card")).toEqual(["daily_qian_full"]);
    expect(rightsOf("none")).toEqual([]);
  });

  it("can / allowance / the follow-up size, per standing", async () => {
    const m = upsertCustomer("rt-m2@example.com", "zh-hant"); sub(m, "sub_rt_m2");
    const p = upsertCustomer("rt-p2@example.com", "zh-hant"); sub(p, "pass_rt_p2", { passDays: 1 });
    const n = upsertCustomer("rt-n2@example.com", "zh-hant");
    const rm = await rightsFor(m, now), rp = await rightsFor(p, now), rn = await rightsFor(n, now);
    expect(can(rm, "bigs_discount")).toBe(true); expect(can(rp, "bigs_discount")).toBe(false); expect(can(rn, "deep_reading")).toBe(false);
    expect(allowance(rm, "one")).toBe(Infinity); expect(allowance(rp, "deep")).toBe(Infinity); expect(allowance(rn, "one")).toBe(0);
    expect(followupLimitFor(rm, 5)).toBe(MEMBER_FOLLOWUP_LIMIT); expect(followupLimitFor(rp, 5)).toBe(MEMBER_FOLLOWUP_LIMIT); expect(followupLimitFor(rn, 5)).toBe(5);
  });

  it("useRight: the day's cap for a member or pass holder, a bigger one for a member's questions, none for a complimentary account, and a 'not_allowed' for the rest", async () => {
    const m = upsertCustomer("rt-cap-m@example.com", "zh-hant"); sub(m, "sub_rt_cap");
    const c = upsertCustomer("rt-cap-c@example.com", "zh-hant"); sub(c, "comp_rt_cap", { plan: "year", amountMinor: 0 });
    const k = upsertCustomer("rt-cap-k@example.com", "zh-hant"); recordCard({ customerId: k, sessionId: "cs_rt_cap_k", currency: "twd", amount: 5900, now });
    const rm = await rightsFor(m, now), rc = await rightsFor(c, now), rk = await rightsFor(k, now);
    expect(capped(rm, "tarot_reading")).toBe(true); expect(capped(rc, "tarot_reading")).toBe(false); expect(capped(rm, "chart_rewrite")).toBe(false);
    for (let i = 0; i < DAY_CAPS.tarot; i++) {
      expect(useRight(rm, "tarot_reading", { ref: `t${i}`, now: now + i * 20_000 }).ok).toBe(true);
      spendRight(rm, "tarot_reading", `t${i}`, now + i * 20_000);
    }
    const over = useRight(rm, "tarot_reading", { ref: "t-new", now: now + 3600_000 });
    expect(over).toEqual({ ok: false, why: "cap_day" });
    expect(useRight(rm, "tarot_reading", { ref: "t3", now: now + 3600_000 }).ok).toBe(true); // reopening one of today's
    expect(useRight(rc, "tarot_reading", { ref: "x", now: now + 3600_000 })).toEqual({ ok: true, cap: null });
    expect(useRight(rk, "tarot_reading")).toEqual({ ok: false, why: "not_allowed" });
    expect(useRight(rk, "daily_qian_full")).toEqual({ ok: true, cap: null });
    // a member's questions: 60 a day, a pass holder's 20
    expect(MEMBER_DAY_CAPS.qa).toBe(60); expect(DAY_CAPS.qa).toBe(20);
    for (let i = 0; i < DAY_CAPS.qa; i++) spendRight(rm, "chart_qa", null, now + i * 15_000);
    expect(useRight(rm, "chart_qa", { now: now + 2 * 3600_000 }).ok).toBe(true);
  });
});
