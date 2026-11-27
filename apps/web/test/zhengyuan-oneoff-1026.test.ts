import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

/**
 * 10-26 (Neil: 正緣畫像「跟合盤和年書一樣的模式」): sold on its own — a 會員／通卡 no longer opens a new one from the 八字
 * page (402 → the product page), one already written still opens, and the product page's free taste needs no payment.
 */
const { createSession, upsertCustomer, upsertSubscription } = await import("../src/lib/db");
const { SESSION_COOKIE } = await import("../src/lib/auth");
const { setFeature } = await import("../src/lib/features");
const { createReport, factsFromBirth, birthFromBody } = await import("../src/lib/mingli/bazi/report");
const report = await import("../src/app/api/bazi/report/route");
const preview = await import("../src/app/api/zhengyuan/preview/route");
const { crossFor } = await import("../src/lib/cross-map");
const { ONE_OFF_KINDS, discounted } = await import("../src/lib/recover-offer");

const place = { id: "1668341", name: "Taipei Daan", lat: 25.03, lon: 121.54, tz: "Asia/Taipei" };
const A = { calendar: "solar", y: 1991, m: 3, d: 9, leap: false, timeMode: "exact", h: 8, mi: 15, place } as const;
process.env.TONGKA_MODEL = "on";
const D = 86_400_000;
const post = (mod: { POST: (r: NextRequest) => Promise<Response> }, url: string, body: unknown, cookie?: string) =>
  mod.POST(new NextRequest(`http://localhost${url}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) } }));

describe("正緣畫像單賣", () => {
  it("the free taste: one line of what TA feels like, in the page's script", async () => {
    const r = await post(preview, "/api/zhengyuan/preview", { input: A, gender: "female", locale: "zh-hant" });
    expect(r.status).toBe(200);
    const j = (await r.json()) as { text: string; element: string };
    expect(j.text.length).toBeGreaterThan(10);
    expect("木火土金水").toContain(j.element);
  });

  it("a 通卡 holder no longer opens a new one from the 八字 page; one already written still opens", async () => {
    setFeature("bazi-paid", "on");
    const cid = upsertCustomer("zy-pass1026@example.com", "zh-hant");
    upsertSubscription({ customerId: cid, stripeCustomerId: null, stripeSubscriptionId: "pass_zy1026", status: "active", plan: "month", periodStart: Date.now() - D, periodEnd: Date.now() + D, cancelAtPeriodEnd: true, passDays: 1 });
    const sid = "7".repeat(64); createSession(sid, cid, 3_600_000);
    const cookie = `${SESSION_COOKIE}=${sid}`;
    const r = await post(report, "/api/bazi/report", { kind: "love", input: A, gender: "female", locale: "zh-hant" }, cookie);
    expect(r.status).toBe(402);
    expect(await r.json()).toMatchObject({ error: "buy_zhengyuan", url: "/zh-hant/zhengyuan" });
    const same = await post(report, "/api/bazi/report", { kind: "love", input: A, gender: "female", locale: "zh-hant", partner: "same" }, cookie);
    expect(await same.json()).toMatchObject({ url: "/zh-hant/zhengyuan?ta=same" });

    // written while a pass still covered it → it opens
    const b = birthFromBody(A, "female");
    if ("error" in b) throw new Error("birth");
    const t = createReport({ kind: "love", locale: "zh-hant", register: null, customerId: cid, email: null, facts: factsFromBirth(b.n, "female", "love"), paid: { session: "member:old", amountMinor: 0 } }).token;
    const again = await post(report, "/api/bazi/report", { kind: "love", input: A, gender: "female", locale: "zh-hant" }, cookie);
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ token: t });

    // the deep report is still the pass's
    const deep = await post(report, "/api/bazi/report", { kind: "deep", input: A, gender: "female", locale: "zh-hant" }, cookie);
    expect(deep.status).toBe(200);
  });

  it("a 六爻 reading of a love question points at it first; the reminder letter knows it, at the same price", () => {
    expect(crossFor("reading_love", ["cast"]).main?.id).toBe("zhengyuan");
    expect(crossFor("reading", ["cast"]).main?.id).toBe("zeri");
    expect(ONE_OFF_KINDS.has("bazi")).toBe(true);
    expect(discounted("bazi")).toBe(false);
  });
});
