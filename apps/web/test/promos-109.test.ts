import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { LineValue } from "@yaoflow/engine";

/**
 * 10-23 进度表 109 ① 优惠码与活动连结: a promo is a Stripe coupon plus our rules (products, dates, uses); a campaign
 * link leaves its code in the browser; the checkouts put the coupon on Stripe's page only when the promo is good for what
 * is bought — never stacked on a first 1-day pass or a membership credit, never on the wallet sheet; and the report
 * reads back what each promo and each source brought. ② cap changes are in 操作记录. Stripe is stubbed.
 */
type Captured = { fn: string; couponId?: string | null; metadata: Record<string, string> };
const captured: Captured[] = [];
let refuseCoupon = false;
vi.mock("../src/lib/stripe", async (orig) => {
  const real = await orig<typeof import("../src/lib/stripe")>();
  const session = (fn: string) => vi.fn(async (i: { couponId?: string | null; metadata: Record<string, string> }) => {
    if (refuseCoupon && i.couponId) throw new Error("stripe /checkout/sessions 400: No such coupon");
    captured.push({ fn, couponId: i.couponId ?? null, metadata: i.metadata });
    return { id: `cs_test_promo_${captured.length}`, url: "https://checkout.stripe.test/x", payment_status: "unpaid", status: "open", metadata: {} };
  });
  return {
    ...real,
    createPromoCoupon: vi.fn(async (i: { code: string }) => ({ id: `coupon_${i.code}` })),
    getCoupon: vi.fn(async (id: string) => ({ id, times_redeemed: 2, valid: true })),
    createPassSession: session("pass"), createCheckoutSession: session("checkout"), createSubscriptionSession: session("sub"),
  };
});

const db = await import("../src/lib/db");
const pr = await import("../src/lib/promos");
const { setFeature } = await import("../src/lib/features");
const { recentActions } = await import("../src/lib/admin-actions");
const { SESSION_COOKIE } = await import("../src/lib/auth");
const { POST: passCheckout } = await import("../src/app/api/pass/checkout/route");
const { POST: castCheckout } = await import("../src/app/api/checkout/route");
const { POST: subCheckout } = await import("../src/app/api/sub/checkout/route");
const { POST: promosPost } = await import("../src/app/api/admin/promos/route");
const { POST: limitsPost } = await import("../src/app/api/admin/limits/route");
const { middleware } = await import("../src/middleware");

const DAY = 86_400_000;
let prev: Record<string, string | undefined> = {};
beforeAll(() => {
  prev = { PAYWALL: process.env.PAYWALL, STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY, STRIPE_GEO_ROUTING: process.env.STRIPE_GEO_ROUTING, WALLET_PAY: process.env.WALLET_PAY, STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY, ADMIN_KEY: process.env.ADMIN_KEY };
  process.env.PAYWALL = "on"; process.env.STRIPE_SECRET_KEY ??= "sk_test_dummy"; process.env.STRIPE_GEO_ROUTING = "on";
  process.env.WALLET_PAY = "on"; process.env.STRIPE_PUBLISHABLE_KEY = "pk_test_promo109"; process.env.ADMIN_KEY = "admin-key-109";
  setFeature("tongka", "on");
});
afterAll(() => { for (const [k, v] of Object.entries(prev)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });

let ip = 10;
const json = (url: string, body: Record<string, unknown>, cookie = "") => new NextRequest(url, {
  method: "POST", body: JSON.stringify(body),
  headers: { "content-type": "application/json", "x-forwarded-for": `198.51.100.${++ip}`, "cf-ipcountry": "TW", "accept-language": "zh-TW,zh;q=0.9", ...(cookie ? { cookie } : {}) },
});
const form = (url: string, fields: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries({ key: "admin-key-109", ...fields })) for (const x of [v].flat()) f.append(k, x);
  return new NextRequest(url, { method: "POST", body: f });
};
const back = (r: Response) => { const u = new URL(r.headers.get("location")!); return { done: u.searchParams.get("done"), failed: u.searchParams.get("failed") }; };
const base = { locale: "zh-hant", currency: "TWD", timeZone: "Asia/Taipei", tzOffsetMinutes: 480 };

describe("① 建优惠码", () => {
  it("checks what it is given, makes the Stripe coupon, keeps the rules, and writes it down", async () => {
    expect((await pr.createPromo({ code: "x", kind: "percent", value: 20, products: ["pass_7"], reason: "试" })).ok).toBe(false);
    expect((await pr.createPromo({ code: "NOV20", kind: "percent", value: 95, products: ["pass_7"], reason: "试" }))).toMatchObject({ ok: false, error: expect.stringMatching(/1%–90%/) });
    expect((await pr.createPromo({ code: "NOV20", kind: "percent", value: 20, products: [], reason: "试" }))).toMatchObject({ ok: false, error: expect.stringMatching(/至少一种/) });
    expect((await pr.createPromo({ code: "NOV20", kind: "amount", value: 5000, currency: null, products: ["pass_7"], reason: "试" })).ok).toBe(false);
    expect((await pr.createPromo({ code: "NOV20", kind: "percent", value: 20, products: ["pass_7"], campaign: "Bad Tag!", reason: "试" })).ok).toBe(false);
    const ok = await pr.createPromo({ code: "nov20", kind: "percent", value: 20, products: ["pass_7", "pass_30", "month", "pass_1"], campaign: "ig-1101", reason: "11 月活动" });
    expect(ok).toMatchObject({ ok: true, promo: { code: "NOV20", stripe_coupon_id: "coupon_NOV20", campaign: "ig-1101", status: "active" } });
    expect((await pr.createPromo({ code: "NOV20", kind: "percent", value: 10, products: ["pass_7"], reason: "再一次" })).ok).toBe(false); // the same code twice
    expect(recentActions(5, "promo")[0]).toMatchObject({ ok: 1, stripe_ref: "coupon_NOV20", reason: "11 月活动" });
    expect(pr.discountLine({ kind: "percent", value: 20, currency: null })).toBe("20% off（8 折）");
  });

  it("good for: the products picked, the currency of a fixed amount, its dates, while on, not on a first pass, until used up", async () => {
    await pr.createPromo({ code: "TWD50", kind: "amount", value: 5000, currency: "TWD", products: ["pass_7"], maxUses: 1, reason: "減 50" });
    await pr.createPromo({ code: "LATER", kind: "percent", value: 10, products: ["pass_7"], startsAt: Date.now() + DAY, reason: "下週" });
    expect(pr.promoFor("NOV20", "pass_7", "TWD").ok).toBe(true);
    expect(pr.promoFor("NOV20", "tarot", "TWD")).toEqual({ ok: false, why: "product" });
    expect(pr.promoFor("NOV20", "pass_1", "TWD", { first: true })).toEqual({ ok: false, why: "first" });
    expect(pr.promoFor("TWD50", "pass_7", "HKD")).toEqual({ ok: false, why: "currency" });
    expect(pr.promoFor("LATER", "pass_7", "TWD")).toEqual({ ok: false, why: "early" });
    expect(pr.promoFor("NOPE1", "pass_7", "TWD")).toEqual({ ok: false, why: "unknown" });
    expect(pr.promoFor(null, "pass_7", "TWD")).toEqual({ ok: false, why: "none" });
    // one paid use of a one-use promo: used up
    pr.notePromoUse({ sessionId: "cs_promo_paid_1", code: "TWD50", product: "pass_7", currency: "TWD", customerId: null });
    db.recordOrder({ sessionId: "cs_promo_paid_1", customerId: null, castId: null, tier: "pass_7d", amountCents: 14900, currency: "TWD", email: "p1@example.org", status: "paid" });
    expect(pr.promoFor("TWD50", "pass_7", "TWD")).toEqual({ ok: false, why: "used_up" });
    const id = pr.promoByCode("NOV20")!.id;
    await pr.setPromoActive(id, false, "暂停");
    expect(pr.promoFor("NOV20", "pass_7", "TWD")).toEqual({ ok: false, why: "off" });
    await pr.setPromoActive(id, true, "继续");
  });
});

describe("① 活动连结与结账", () => {
  it("the link leaves the code in the browser for seven days; a malformed one is not kept", async () => {
    const res = await middleware(new NextRequest("https://yaoflow.com/zh-hant/services?c=ig-1101&promo=nov20", { headers: { "accept-language": "zh-TW" } }));
    expect(res.cookies.get(pr.PROMO_COOKIE)?.value).toBe("NOV20");
    const bad = await middleware(new NextRequest("https://yaoflow.com/zh-hant/services?promo=%3Cx%3E", { headers: { "accept-language": "zh-TW" } }));
    expect(bad.cookies.get(pr.PROMO_COOKIE)).toBeUndefined();
    expect(pr.promoLink("https://yaoflow.com", "zh-hant", "/account?want=pass#membership", "ig-1101", "NOV20")).toBe("https://yaoflow.com/zh-hant/account?want=pass&c=ig-1101&promo=NOV20#membership");
    expect(pr.promoLink("https://yaoflow.com", "zh", "/", null, "NOV20")).toBe("https://yaoflow.com/zh?promo=NOV20");
  });

  it("a pass bought with the code carries the coupon; without it, or for something it is not good for, none", async () => {
    captured.length = 0;
    const cookie = `${pr.PROMO_COOKIE}=NOV20`;
    expect((await passCheckout(json("http://localhost/api/pass/checkout", { days: 7, ...base }, cookie))).status).toBe(200);
    expect(captured[0]).toMatchObject({ fn: "pass", couponId: "coupon_NOV20", metadata: expect.objectContaining({ promo: "NOV20", days: "7" }) });
    expect((await passCheckout(json("http://localhost/api/pass/checkout", { days: 7, ...base }))).status).toBe(200);
    expect(captured[1]).toMatchObject({ couponId: null });
    expect(captured[1]!.metadata.promo).toBeUndefined();
    // the first 1-day pass of a fresh browser is already at its first price
    expect((await passCheckout(json("http://localhost/api/pass/checkout", { days: 1, ...base }, cookie))).status).toBe(200);
    expect(captured[2]).toMatchObject({ couponId: null });
    const uses = db.db().prepare("SELECT code, product FROM promo_uses").all() as { code: string; product: string }[];
    expect(uses.filter((u) => u.code === "NOV20")).toEqual([{ code: "NOV20", product: "pass_7" }]);
  });

  it("a coupon Stripe refuses never blocks the sale — the same checkout goes on without it", async () => {
    captured.length = 0;
    refuseCoupon = true;
    const res = await passCheckout(json("http://localhost/api/pass/checkout", { days: 30, ...base }, `${pr.PROMO_COOKIE}=NOV20`));
    refuseCoupon = false;
    expect(res.status).toBe(200);
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({ couponId: null });
    expect((db.db().prepare("SELECT COUNT(*) AS n FROM ops_events WHERE kind = 'promo_coupon_refused'").get() as { n: number }).n).toBe(1);
  });

  it("the cast page: a pass with the code goes to Stripe's page with the coupon; the wallet sheet hands it over to Stripe's page", async () => {
    captured.length = 0;
    const cast = { question: "這次面試能過嗎", values: [7, 8, 9, 8, 7, 8] as LineValue[], castAtMs: Date.now(), ...base };
    const cookie = `${pr.PROMO_COOKIE}=NOV20`;
    const r = await castCheckout(json("http://localhost/api/checkout", { tier: "deep", pass: 7, ...cast }, cookie));
    expect(r.status).toBe(200);
    expect(captured[0]).toMatchObject({ fn: "checkout", couponId: "coupon_NOV20", metadata: expect.objectContaining({ promo: "NOV20", kind: "pass", days: "7" }) });
    const w = await castCheckout(json("http://localhost/api/checkout", { tier: "deep", pass: 7, wallet: true, amountSeen: 19900, ...cast }, cookie));
    expect(w.status).toBe(409);
    expect(await w.json()).toMatchObject({ error: "amount_changed" });
    const plain = await castCheckout(json("http://localhost/api/checkout", { tier: "deep", pass: 7, ...cast }));
    expect(plain.status).toBe(200);
    expect(captured.at(-1)).toMatchObject({ couponId: null });
  });

  it("a membership: the code on its first invoice — when it is good for the plan", async () => {
    captured.length = 0;
    const cid = db.upsertCustomer("p109-member@example.org", "zh-hant");
    const SID = "cd".repeat(32); // a session id is 64 hex characters
    db.createSession(SID, cid, DAY);
    const cookie = `${SESSION_COOKIE}=${SID}; ${pr.PROMO_COOKIE}=NOV20`;
    expect((await subCheckout(json("http://localhost/api/sub/checkout", { plan: "month", ...base }, cookie))).status).toBe(200);
    expect(captured[0]).toMatchObject({ fn: "sub", couponId: "coupon_NOV20", metadata: expect.objectContaining({ promo: "NOV20", plan: "month" }) });
    await pr.createPromo({ code: "PASSONLY", kind: "percent", value: 10, products: ["pass_7"], reason: "只给通卡" });
    expect((await subCheckout(json("http://localhost/api/sub/checkout", { plan: "month", ...base }, `${SESSION_COOKIE}=${SID}; ${pr.PROMO_COOKIE}=PASSONLY`))).status).toBe(200);
    expect(captured[1]).toMatchObject({ couponId: null });
  });
});

describe("① 报表与后台", () => {
  it("each promo: checkouts that carried it, those paid and how much, Stripe's own count; paid orders by source", async () => {
    db.recordOrder({ sessionId: "cs_test_promo_1", customerId: null, castId: null, tier: "pass_7d", amountCents: 19900, currency: "TWD", email: "x@example.org", status: "paid" });
    const rep = (await pr.promoReports(true)).find((r) => r.promo.code === "NOV20")!;
    expect(rep.stripeRedeemed).toBe(2);
    expect(rep.checkouts).toBeGreaterThanOrEqual(1);
    const now = Date.now();
    db.recordOrder({ sessionId: "cs_src_1", customerId: null, castId: null, tier: "pass_1d", amountCents: 9900, currency: "TWD", email: "s1@example.org", status: "paid" });
    db.recordOrder({ sessionId: "cs_src_2", customerId: null, castId: null, tier: "tarot", amountCents: 7500, currency: "TWD", email: "s2@example.org", status: "paid" });
    db.db().prepare("UPDATE orders SET campaign = 'ig-1101' WHERE session_id IN ('cs_src_1', 'cs_src_2')").run();
    const src = pr.sourceReport(now - DAY, now + DAY);
    expect(src.find((r) => r.tag === "ig-1101")).toMatchObject({ orders: 2, byCurrency: { TWD: 17400 }, byTier: { pass_1d: 1, tarot: 1 } });
    expect(pr.sourceLineFor(["tarot"], now - DAY, now + DAY)).toContain("ig-1101 1");
  });

  it("the admin form: create with the box ticked and a reason, stop, start again", async () => {
    expect(back(await promosPost(form("http://localhost/api/admin/promos", { op: "create", code: "WINTER15", kind: "percent", value: "15", products: ["pass_7", "pass_30"], reason: "冬季", confirm: "" }))).failed).toMatch(/确认/);
    expect(back(await promosPost(form("http://localhost/api/admin/promos", { op: "create", code: "WINTER15", kind: "percent", value: "15", products: ["pass_7", "pass_30"], ends: "2030-01-01T00:00", reason: "冬季", confirm: "yes" }))).done).toMatch(/WINTER15 建好了/);
    const p = pr.promoByCode("WINTER15")!;
    expect(pr.productsOf(p)).toEqual(["pass_7", "pass_30"]);
    expect(p.ends_at).toBe(Date.UTC(2029, 11, 31, 16, 0));
    expect(back(await promosPost(form("http://localhost/api/admin/promos", { op: "off", id: String(p.id), reason: "先停", confirm: "yes" }))).done).toMatch(/停用/);
    expect(pr.promoByCode("WINTER15")!.status).toBe("off");
    expect(back(await promosPost(form("http://localhost/api/admin/promos", { op: "create", code: "YEN100", kind: "amount", value: "100", currency: "JPY", products: ["pass_7"], reason: "日圓", confirm: "yes" }))).done).toBeTruthy();
    expect(pr.promoByCode("YEN100")).toMatchObject({ value: 100, currency: "JPY" }); // yen have no minor unit
  });

  it("② a cap changed from the admin is in 操作记录, with its reason", async () => {
    const f = new FormData(); f.set("key", "cap:cast"); f.set("value", "25"); f.set("reason", "有人一天问了二十多件");
    const req = new NextRequest("http://localhost/api/admin/limits", { method: "POST", body: f, headers: { cookie: "" } });
    // the limits route answers to the admin cookie only: sign in the way the page does
    const { adminToken, ADMIN_COOKIE } = await import("../src/lib/admin-auth");
    req.cookies.set(ADMIN_COOKIE, (await adminToken())!);
    const r = await limitsPost(req);
    expect(r.status).toBe(303);
    expect(recentActions(5, "cap_set")[0]).toMatchObject({ ok: 1, reason: "有人一天问了二十多件" });
    expect(recentActions(5, "cap_set")[0]!.result).toMatch(/cap:cast：默认 → 25/);
  });

  it("10-23 (Neil landed on 「localhost 拒绝了连接」 after saving): the admin forms go back to the site's address, never the one nginx proxies to", async () => {
    const prevSite = process.env.SITE_URL;
    process.env.SITE_URL = "https://yaoflow.com";
    try {
      const f = new FormData(); f.set("key", "cap:report"); f.set("value", "6"); f.set("reason", "真读者正常用就碰到");
      const req = new NextRequest("http://localhost:3201/api/admin/limits", { method: "POST", body: f });
      const { adminToken, ADMIN_COOKIE } = await import("../src/lib/admin-auth");
      req.cookies.set(ADMIN_COOKIE, (await adminToken())!);
      const r = await limitsPost(req);
      expect(r.headers.get("location")).toBe("https://yaoflow.com/admin/limits?ok=cap%3Areport");
    } finally { if (prevSite === undefined) delete process.env.SITE_URL; else process.env.SITE_URL = prevSite; }
    // and no route builds a redirect on req.url (behind nginx it is http://localhost:3200 / 3201)
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : /route\.tsx?$/.test(n) ? [p] : []; });
    const bad = walk(join(__dirname, "../src/app/api")).filter((p) => /new URL\([^\n]*,\s*req\.url\s*\)/.test(readFileSync(p, "utf8")));
    expect(bad).toEqual([]);
  });
});
