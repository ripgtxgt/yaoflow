import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * 10-07 首次付费保证补洞 (Neil: 「现在弄好」): "once per person" used to be the account plus its email addresses, so a
 * new address bought a second one-tap refund. Now the same browser and the same payment method (Stripe's identifier
 * of the card / wallet / Alipay account — never a card number) count as the same person too. Buying stays open to
 * everyone; only the one-tap refund closes. Stripe is stubbed.
 */
const stripe = vi.hoisted(() => { process.env.STRIPE_SECRET_KEY ??= "sk_test_dummy"; return { fp: new Map<string, unknown>(), refunds: [] as string[] }; });
vi.mock("../src/lib/stripe", async (orig) => {
  const real = await orig<typeof import("../src/lib/stripe")>();
  return {
    ...real,
    getPaymentIntent: vi.fn(async (id: string) => {
      if (!stripe.fp.has(id)) throw new Error(`stripe /payment_intents/${id} 404: resource_missing`);
      return { id, status: "succeeded", amount_received: 7500, currency: "twd", created: 0, metadata: {}, latest_charge: stripe.fp.get(id) };
    }),
    createRefund: vi.fn(async (pi: string) => { stripe.refunds.push(pi); return { id: `re_${pi}`, status: "succeeded", amount: 7500, currency: "twd", payment_intent: pi }; }),
  };
});

const { db, guaranteeCheck, guaranteeIdentity, markOrderRefunded, recordOrder, upsertCustomer } = await import("../src/lib/db");
const { linkBrowser } = await import("../src/lib/browsers");
const { ensureOrderCardFp, fingerprintOf, sweepCardFps } = await import("../src/lib/card-fp");
const { POST: guaranteeRoute } = await import("../src/app/api/refund/guarantee/route");

const H = 3_600_000;
afterEach(() => { stripe.refunds.length = 0; });

/** a paid first-time deep reading: its own tab (→ browser), its own payment intent and (optionally) card */
function buy(sid: string, email: string, o: { cid?: number | null; bid?: string; fp?: string | null; ago?: number; test?: boolean } = {}) {
  const tab = `tab_${sid.slice(-10)}`;
  const pi = `pi_${sid.replace(/[^A-Za-z0-9]/g, "").slice(-20)}`;
  if (o.bid) db().prepare("INSERT OR IGNORE INTO tab_browsers (s, bid, at) VALUES (?,?,?)").run(tab, o.bid, Date.now());
  recordOrder({ sessionId: sid, customerId: o.cid ?? null, castId: null, tier: "deep", amountCents: 7500, currency: "twd", email, status: "paid", paymentIntent: pi, browserSid: o.bid ? tab : null });
  db().prepare("UPDATE orders SET created_at = ?, entitlement_kind = 'purchase', payment_state = 'paid', test_flag = ? WHERE session_id = ?").run(Date.now() - (o.ago ?? 0), o.test ? 1 : 0, sid);
  if (o.fp !== undefined) stripe.fp.set(pi, o.fp === null ? { payment_method_details: { type: "link", link: {} } } : { payment_method_details: { type: "card", card: { fingerprint: o.fp, country: "TW", wallet: { type: "apple_pay" } } } });
  return { tab, pi };
}

describe("支付方式识别码", () => {
  it("reads the card, wallet card or Alipay account; a method without one gives null", () => {
    expect(fingerprintOf({ payment_method_details: { type: "card", card: { fingerprint: "Ab12", wallet: { type: "apple_pay" } } } })).toBe("card:Ab12");
    expect(fingerprintOf({ payment_method_details: { type: "alipay", alipay: { fingerprint: "ALI9", buyer_id: "2088" } } })).toBe("alipay:ALI9");
    expect(fingerprintOf({ payment_method_details: { type: "alipay", alipay: { buyer_id: "2088" } } })).toBe("alipay:2088");
    expect(fingerprintOf({ payment_method_details: { type: "link", link: { country: "TW" } } })).toBeNull();
    expect(fingerprintOf(null)).toBeNull();
    expect(fingerprintOf("ch_123")).toBeNull(); // a charge not expanded
  });

  it("is looked up once per order and kept; Stripe saying 'gone' is kept as '' and not asked again", async () => {
    buy("cs_fp_one_0001", "fp-one@example.com", { fp: "FP_ONE" });
    expect(await ensureOrderCardFp("cs_fp_one_0001")).toBe("card:FP_ONE");
    expect(db().prepare("SELECT card_fp FROM orders WHERE session_id = ?").get("cs_fp_one_0001")).toEqual({ card_fp: "card:FP_ONE" });
    stripe.fp.clear();
    expect(await ensureOrderCardFp("cs_fp_one_0001")).toBe("card:FP_ONE"); // kept, Stripe not asked
    buy("cs_fp_gone_0001", "fp-gone@example.com");
    expect(await ensureOrderCardFp("cs_fp_gone_0001")).toBe("");
    buy("cs_fp_link_0001", "fp-link@example.com", { fp: null });
    expect(await ensureOrderCardFp("cs_fp_link_0001")).toBe("");
  });

  it("the sweep fills the orders that lack one, newest first, and leaves test orders alone", async () => {
    buy("cs_fp_sw_a_0001", "sw-a@example.com", { fp: "SW_A", ago: 2 * H });
    buy("cs_fp_sw_b_0001", "sw-b@example.com", { fp: "SW_B", ago: H });
    buy("cs_fp_sw_t_0001", "sw-t@example.com", { fp: "SW_T", test: true });
    const r = await sweepCardFps(50, 10_000, 0);
    expect(r.found).toBeGreaterThanOrEqual(2);
    const fp = (sid: string) => (db().prepare("SELECT card_fp FROM orders WHERE session_id = ?").get(sid) as { card_fp: string | null }).card_fp;
    expect(fp("cs_fp_sw_a_0001")).toBe("card:SW_A");
    expect(fp("cs_fp_sw_b_0001")).toBe("card:SW_B");
    expect(fp("cs_fp_sw_t_0001")).toBeNull();
  });
});

describe("同一个人：账号、邮箱、浏览器、付款方式", () => {
  it("a new address on the same browser is the same person — the second one-tap refund is closed", () => {
    const a = upsertCustomer("gi-a@example.com", "zh-hant");
    linkBrowser("gibrowser0000001", a, "pay");
    buy("cs_gi_a_000001", "gi-a@example.com", { cid: a, bid: "gibrowser0000001", ago: 3 * H });
    markOrderRefunded("cs_gi_a_000001", "guarantee");
    const b = upsertCustomer("gi-b-new@example.com", "zh-hant");
    const { tab } = buy("cs_gi_b_000001", "gi-b-new@example.com", { cid: b, bid: "gibrowser0000001" });
    expect(guaranteeCheck("cs_gi_b_000001")).toMatchObject({ ok: false, why: "used" });
    const id = guaranteeIdentity({ customer_id: b, email: "gi-b-new@example.com", browser_sid: tab });
    expect(id.cids).toEqual(expect.arrayContaining([a, b]));
    expect(id.bids).toContain("gibrowser0000001");
  });

  it("a new address on a new browser, paid with the same card, is the same person", async () => {
    buy("cs_gi_c_000001", "gi-c@example.com", { bid: "gibrowser0000003", fp: "SAME_CARD", ago: 5 * H });
    await ensureOrderCardFp("cs_gi_c_000001");
    markOrderRefunded("cs_gi_c_000001", "guarantee");
    buy("cs_gi_d_000001", "gi-d-other@example.com", { bid: "gibrowser0000004", fp: "SAME_CARD" });
    expect(guaranteeCheck("cs_gi_d_000001").ok).toBe(true); // the card is not known for this order yet …
    await ensureOrderCardFp("cs_gi_d_000001");
    expect(guaranteeCheck("cs_gi_d_000001")).toEqual({ ok: false, why: "used", by: "card" }); // … once it is, it matches
  });

  it("an earlier paid order with the same card makes this one not the first; a stranger still qualifies", async () => {
    buy("cs_gi_e_000001", "gi-e@example.com", { bid: "gibrowser0000005", fp: "CARD_E", ago: 30 * 24 * H });
    await ensureOrderCardFp("cs_gi_e_000001");
    buy("cs_gi_f_000001", "gi-f@example.com", { bid: "gibrowser0000006", fp: "CARD_E" });
    await ensureOrderCardFp("cs_gi_f_000001");
    expect(guaranteeCheck("cs_gi_f_000001")).toEqual({ ok: false, why: "not_first", by: "card" });
    buy("cs_gi_g_000001", "gi-g@example.com", { bid: "gibrowser0000007", fp: "CARD_G" });
    await ensureOrderCardFp("cs_gi_g_000001");
    expect(guaranteeCheck("cs_gi_g_000001").ok).toBe(true);
  });

  it("our own test accounts and test orders never tie strangers together", () => {
    const t = upsertCustomer("gi-owner-test@example.com", "zh-hant");
    db().prepare("UPDATE customers SET test_flag = 1 WHERE id = ?").run(t);
    linkBrowser("gibrowser0000008", t, "login");
    buy("cs_gi_t_000001", "gi-owner-test@example.com", { cid: t, bid: "gibrowser0000008", ago: 2 * H, test: true });
    markOrderRefunded("cs_gi_t_000001", "guarantee");
    const s = upsertCustomer("gi-stranger@example.com", "zh-hant");
    buy("cs_gi_s_000001", "gi-stranger@example.com", { cid: s, bid: "gibrowser0000008" });
    expect(guaranteeCheck("cs_gi_s_000001").ok).toBe(true);
  });
});

describe("一键退款的路由", () => {
  it("looks the card up first, refuses a second refund on the same card without saying why, and logs which signal matched", async () => {
    buy("cs_gr_first_00001", "gr-first@example.com", { bid: "grbrowser0000001", fp: "ROUTE_CARD", ago: 6 * H });
    let res = await guaranteeRoute(new NextRequest("http://localhost/api/refund/guarantee", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.71" }, body: JSON.stringify({ sid: "cs_gr_first_00001", locale: "zh-hant" }) }));
    expect(res.status).toBe(200);
    expect(stripe.refunds).toHaveLength(1);
    buy("cs_gr_again_00001", "gr-again-new@example.com", { bid: "grbrowser0000002", fp: "ROUTE_CARD" });
    res = await guaranteeRoute(new NextRequest("http://localhost/api/refund/guarantee", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.72" }, body: JSON.stringify({ sid: "cs_gr_again_00001", locale: "zh-hant" }) }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "used" });
    expect(stripe.refunds).toHaveLength(1); // no money moved
    const op = db().prepare("SELECT detail FROM ops_events WHERE kind = 'guarantee_denied' ORDER BY id DESC LIMIT 1").get() as { detail: string };
    expect(op.detail).toContain("used by card");
    // the order itself is untouched: still paid, the reader keeps the reading
    expect(db().prepare("SELECT payment_state FROM orders WHERE session_id = ?").get("cs_gr_again_00001")).toEqual({ payment_state: "paid" });
  });
});
