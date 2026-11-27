import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { createSession, upsertCustomer, upsertSubscription } from "../src/lib/db";
import { chartReader } from "../src/lib/chart-reader";

process.env.TONGKA_MODEL = "on";

/** 10-25 (Neil: 「没有登录，为什么会有解读？解读必须要有付费」): a chart's plain reading is for a 通卡 or a membership (the text routes answer 402 otherwise) */
describe("命盤白話要付費", () => {
  const req = (cookie?: string) => new NextRequest("http://localhost/api/bazi/text", { method: "POST", body: "{}", headers: cookie ? { cookie } : {} });
  it("not signed in, signed in without a pass, a pass holder", async () => {
    expect(await chartReader(req())).toEqual({ signedIn: false, covered: false });
    const plain = upsertCustomer("chart-plain1025@example.com", "zh-hant");
    createSession("a1".repeat(32), plain, 3_600_000);
    expect(await chartReader(req(`yf_session=${"a1".repeat(32)}`))).toEqual({ signedIn: true, covered: false });
    const holder = upsertCustomer("chart-pass1025@example.com", "zh-hant");
    upsertSubscription({ customerId: holder, stripeCustomerId: null, stripeSubscriptionId: "pass_chart1025", status: "active", plan: "month", periodStart: Date.now() - 3_600_000, periodEnd: Date.now() + 86_400_000, cancelAtPeriodEnd: true, passDays: 1 });
    createSession("b2".repeat(32), holder, 3_600_000);
    expect(await chartReader(req(`yf_session=${"b2".repeat(32)}`))).toEqual({ signedIn: true, covered: true });
  });
});
