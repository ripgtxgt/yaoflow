import { describe, expect, it } from "vitest";
import { chartLabel, customerIdentity, customerProducts } from "../src/lib/admin-customer";
import { upsertCustomer, upsertSubscription } from "../src/lib/db";

/** 10-22 进度表 94: the customer page says which charts a person has, and who they are to us now */
describe("客户档案 (94)", () => {
  it("names a chart in a few words an operator can tell apart", () => {
    expect(chartLabel("bazi", JSON.stringify({ gender: "female", pillars: [{ gz: "甲子" }, { gz: "乙丑" }, { gz: "丙寅" }, { gz: "丁卯" }] }))).toBe("甲子 乙丑 丙寅 丁卯（女）");
    expect(chartLabel("ziwei", JSON.stringify({ gender: "male", soulBranch: "寅", soulStar: "祿存", fiveClass: "土五局" }))).toBe("命宮在寅 · 命主祿存 · 土五局（男）");
    expect(chartLabel("astro", JSON.stringify({ planets: [{ name: "太陽", sign: "天秤" }, { name: "月亮", sign: "天蠍" }], asc: { sign: "摩羯" } }))).toBe("日天秤 月天蠍 升摩羯");
    expect(chartLabel("astro", JSON.stringify({ planets: [{ name: "Sun", sign: "Libra" }], asc: null }))).toBe("日Libra");
    expect(chartLabel("bazi", "not json")).toBeNull();
    expect(chartLabel("ziwei", "{}")).toBeNull();
  });

  it("the top line: free, a pass to its end, a member's renewal; every product listed even when unused", () => {
    const now = Date.UTC(2026, 9, 22, 4);
    const free = upsertCustomer("cust94-free@example.com", "zh-hant");
    expect(customerIdentity(free, now).kind).toBe("free");
    expect(customerIdentity(free, now).guarantee.state).toBe("不适用");

    const pass = upsertCustomer("cust94-pass@example.com", "zh-hant");
    upsertSubscription({ customerId: pass, stripeCustomerId: null, stripeSubscriptionId: "pass_cust94_7d", status: "active", plan: "month", periodStart: now - 86_400_000, periodEnd: now + 6 * 86_400_000, cancelAtPeriodEnd: true, currency: "TWD", amountMinor: 19900, passDays: 7 });
    const p = customerIdentity(pass, now);
    expect(p.kind).toBe("pass");
    expect(p.line).toContain("7 天通卡");

    const mem = upsertCustomer("cust94-member@example.com", "zh-hant");
    upsertSubscription({ customerId: mem, stripeCustomerId: "cus_cust94", stripeSubscriptionId: "sub_cust94", status: "active", plan: "month", periodStart: now - 86_400_000, periodEnd: now + 29 * 86_400_000, cancelAtPeriodEnd: true, currency: "TWD", amountMinor: 26900 });
    const m = customerIdentity(mem, now);
    expect(m.kind).toBe("member");
    expect(m.line).toContain("已关续订");

    const names = customerProducts(free).map((x) => x.name);
    for (const n of ["塔罗", "解籤", "擲筊／线上求籤", "今日一籤", "八字报告", "紫微报告", "星盘报告", "正缘画像", "年书", "合盘", "命盘问答"]) expect(names).toContain(n);
    expect(customerProducts(free).every((x) => x.value === "—")).toBe(true);
  });
});
