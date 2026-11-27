import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * 10-23 进度表 113 (Neil: 「为什么会员也有 1 小时 7 折？」→「要改」) and 111 ③: a membership left unpaid gets the same one
 * letter without a discount — the hour's link reopens it at the price they saw, with a line on a 1-day pass to try first;
 * a 通卡 keeps the hour at 70 %; 合盤／年書 (and 塔羅／解籤) checkouts are reminded the same way, at their own price.
 * The privacy policy says so in every language. Stripe (fetch) and the sender are stubbed.
 */
const sent: { to: string; subject: string; text: string; html: string }[] = [];
vi.mock("../src/lib/email", async (orig) => {
  const real = await orig<typeof import("../src/lib/email")>();
  return { ...real, sendEmail: vi.fn(async (to: string, subject: string, html: string, text: string) => { sent.push({ to, subject, text, html }); return { ok: true, id: `re_113_${sent.length}` }; }) };
});
process.env.STRIPE_SECRET_KEY = "sk_test_113";
process.env.SITE_URL = "https://yaoflow.com";
const calls: { path: string; body: URLSearchParams }[] = [];
vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: { method?: string; body?: string }) => {
  const path = String(url).replace("https://api.stripe.com/v1", "");
  const body = new URLSearchParams(init?.body ?? "");
  calls.push({ path, body });
  if (path.startsWith("/checkout/sessions/cs_test_")) return Response.json({ id: path.slice(19), status: "open", payment_status: "unpaid", metadata: {}, customer_details: null });
  if (path === "/checkout/sessions") return Response.json({ id: `cs_test_new_${calls.length}`, url: `https://checkout.stripe.com/c/pay/new_${calls.length}`, status: "open", payment_status: "unpaid", metadata: {} });
  if (path === "/coupons") return Response.json({ id: `coupon_${calls.length}` });
  return new Response("{}", { status: 404 });
}));

const { db, upsertCustomer } = await import("../src/lib/db");
const ro = await import("../src/lib/recover-offer");
const { setFeature } = await import("../src/lib/features");
const { OFFER_PAGE_T } = await import("../src/lib/dict/recover-offer-page");
const { OFFER_T } = await import("../src/lib/recover-offer-mail");
const { PRIVACY } = await import("../src/lib/legal");

const T0 = Date.now() - 20 * 60_000;
const note = (co: string, kind: "month" | "pass" | "nianshu" | "hepan", email: string, amount: number, extra: Record<string, string> = {}, product = "YaoFlow 會員", cancelUrl = "https://yaoflow.com/zh-hant/account") => {
  const cid = upsertCustomer(email, "zh-hant");
  db().prepare("UPDATE customers SET marketing_ok = 1 WHERE id = ?").run(cid);
  ro.notePending({ co, sessionId: `cs_test_${co}`, kind, email, remind: true, locale: "zh-hant", currency: "twd", amount, product, managed: false, cardHint: true,
    metadata: { locale: "zh-hant", currency: "TWD", ...extra }, cancelUrl, successUrl: "https://yaoflow.com/zh-hant/account?sub={CHECKOUT_SESSION_ID}", now: T0 });
};
const offerOf = (co: string) => db().prepare("SELECT * FROM recover_offers WHERE co = ?").get(co) as { token: string; base_minor: number; offer_minor: number; fallback_url: string | null } | undefined;

beforeEach(() => { sent.length = 0; calls.length = 0; setFeature("recover-offer", "on"); });

describe("会员：只提醒，不打折", () => {
  it("one letter, the price they saw, the hour's link, a 1-day pass to try first — no 7 折 anywhere", async () => {
    note("co113m1", "month", "m113@reader113.net", 34900);
    await ro.runRecoverOffers(Date.now());
    const m = sent.find((x) => x.to === "m113@reader113.net")!;
    expect(m, String((db().prepare("SELECT letter_state FROM pending_checkouts WHERE co = 'co113m1'").get() as { letter_state: string } | undefined)?.letter_state)).toBeTruthy();
    expect(m.subject).toContain("會員還沒開通");
    expect(m.subject).not.toMatch(/7 ?折/);
    expect(m.text).not.toMatch(/7 ?折/);
    expect(m.text).toContain("價格照原來的：NT$349");
    expect(m.text).toContain("1 日通卡");
    expect(m.text).toContain("/zh-hant/account?want=pass");
    const o = offerOf("co113m1")!;
    expect(o.offer_minor).toBe(o.base_minor);
  });

  it("the link reopens it at that price: no coupon is made, none is put on the checkout", async () => {
    const o = offerOf("co113m1")!;
    const r = await ro.offerCheckout(o.token, "https://yaoflow.com", Date.now());
    expect(r).toHaveProperty("url");
    expect(calls.some((c) => c.path === "/coupons")).toBe(false);
    const made = calls.find((c) => c.path === "/checkout/sessions")!;
    expect(made.body.get("discounts[0][coupon]")).toBeNull();
    expect(made.body.get("mode")).toBe("subscription");
  });
});

describe("通卡：照旧 1 小时 7 折", () => {
  it("a pass checkout still gets the hour at 70 %", async () => {
    note("co113p1", "pass", "p113@reader113.net", 9900, { kind: "pass", days: "1" }, "1 日通卡");
    await ro.runRecoverOffers(Date.now());
    const m = sent.find((x) => x.to === "p113@reader113.net")!;
    expect(m.subject).toContain("7 折");
    const o = offerOf("co113p1")!;
    expect(o.offer_minor).toBeLessThan(o.base_minor);
  });
});

describe("合盘／年书：结账没完成也提醒一次，照原价", () => {
  it("年書: the letter names it, no discount, and the expired link leads back to the 年書 page", async () => {
    note("co113n1", "nianshu", "n113@reader113.net", 89000, { nianshu: "tok113", report: "year", years: "2027", c: "nianshu" }, "2027 年書", "https://yaoflow.com/zh-hant/nianshu");
    await ro.runRecoverOffers(Date.now());
    const m = sent.find((x) => x.to === "n113@reader113.net")!;
    expect(m.subject).toContain("付款沒有完成：2027 年書");
    expect(m.text).toContain("價格照原來的：NT$890");
    expect(m.text).not.toMatch(/7 ?折/);
    const o = offerOf("co113n1")!;
    expect(o.offer_minor).toBe(o.base_minor);
    expect(o.fallback_url).toBe("https://yaoflow.com/zh-hant/nianshu");
  });
  it("its checkout is the same one-off checkout again: kind and the report's token carried over, the same amount", async () => {
    const o = offerOf("co113n1")!;
    const r = await ro.offerCheckout(o.token, "https://yaoflow.com", Date.now());
    expect(r).toHaveProperty("url");
    const made = calls.find((c) => c.path === "/checkout/sessions")!;
    expect(made.body.get("mode")).toBe("payment");
    expect(made.body.get("metadata[kind]")).toBe("nianshu");
    expect(made.body.get("metadata[nianshu]")).toBe("tok113");
    expect(made.body.get("line_items[0][price_data][unit_amount]")).toBe("89000");
  });
  it("discounted() says who gets the 70 %", () => {
    expect(ro.discounted("pass")).toBe(true);
    for (const k of ["month", "year", "tarot", "qian", "hepan", "nianshu"] as const) expect(ro.discounted(k)).toBe(false);
  });
});

describe("勾了「寄一封信提醒我」就寄：没答应过收营销信不算退订，点过退订才不寄", () => {
  const notePass = (co: string, email: string) => ro.notePending({ co, sessionId: `cs_test_${co}`, kind: "pass", email, remind: true, locale: "zh-hant", currency: "twd", amount: 9900,
    product: "1 日通卡", managed: false, cardHint: true, metadata: { locale: "zh-hant", currency: "TWD", kind: "pass", days: "1" },
    cancelUrl: "https://yaoflow.com/zh-hant/account", successUrl: "https://yaoflow.com/zh-hant/account?sub={CHECKOUT_SESSION_ID}", now: T0 });
  const stateOf = (co: string) => (db().prepare("SELECT letter_state FROM pending_checkouts WHERE co = ?").get(co) as { letter_state: string | null } | undefined)?.letter_state;
  it("a reader with an account who never said yes to marketing (marketing_ok 0, the default) but ticked the box gets the one letter", async () => {
    upsertCustomer("never113@reader113.net", "zh-hant");
    expect(db().prepare("SELECT marketing_ok FROM customers WHERE email = 'never113@reader113.net'").get()).toEqual({ marketing_ok: 0 });
    notePass("co113u0", "never113@reader113.net");
    await ro.runRecoverOffers(Date.now());
    expect(stateOf("co113u0")).toBe("sent");
    expect(sent.some((x) => x.to === "never113@reader113.net")).toBe(true);
  });
  it("one who clicked unsubscribe gets nothing, ticked or not", async () => {
    const { recordUnsub, setMarketingConsent } = await import("../src/lib/db");
    upsertCustomer("out113@reader113.net", "zh-hant");
    setMarketingConsent("out113@reader113.net", false);
    recordUnsub("out113@reader113.net", "link");
    notePass("co113u1", "out113@reader113.net");
    await ro.runRecoverOffers(Date.now());
    expect(stateOf("co113u1")).toBe("unsub");
    expect(sent.some((x) => x.to === "out113@reader113.net")).toBe(false);
  });
});

describe("字句与隐私说明", () => {
  it("letter and page keep the same keys in all nine languages", () => {
    const k = (o: object) => Object.keys(o).sort().join();
    for (const l of Object.keys(OFFER_T)) expect(k(OFFER_T[l]!), l).toBe(k(OFFER_T.en!));
    for (const l of Object.keys(OFFER_PAGE_T)) expect(k(OFFER_PAGE_T[l]!), l).toBe(k(OFFER_PAGE_T.en!));
  });
  it("the privacy policy says it — 70 % for a pass only — in every language, and no longer 「會員為第一期 7 折」", () => {
    const all = (l: string) => JSON.stringify(PRIVACY.map((sec) => (sec as unknown as Record<string, unknown>)[l] ?? ""));
    expect(all("zh-hant")).toContain("會員、合盤、年書只提醒、不打折");
    expect(all("zh-hant")).not.toContain("會員為第一期 7 折");
    expect(all("zh")).toContain("会员、合盘、年书只提醒、不打折");
    expect(all("en")).toContain("only reminded, at the usual price");
    for (const l of ["ja", "ko", "fr", "de", "es", "pt"]) expect(all(l), l).toMatch(/30 ?%/);
  });
});
