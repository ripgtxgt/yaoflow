import { describe, expect, it } from "vitest";
import { db, upsertCustomer } from "../src/lib/db";
import * as ro from "../src/lib/recover-offer";
import { OFFER_T, buildRecoverOfferEmail } from "../src/lib/recover-offer-mail";
import { OFFER_PAGE_T } from "../src/lib/dict/recover-offer-page";
import { setFeature } from "../src/lib/features";

/** 10-15 挽回信改版: one letter, 5 minutes after 「返回」 (else 15 after the page opened), 1 hour, 70 % */
const T0 = Date.UTC(2026, 9, 15, 3);
const META = { tier: "deep", locale: "zh-hant", question: "他會回來找我嗎", values: "7,8,9,8,7,8", castAtMs: String(T0 - 600_000), tz: "480", currency: "TWD", remind: "1" };

describe("挽回信改版", () => {
  it("70 % rounds to what the page shows", () => {
    expect(ro.offerMinor(26900, "TWD")).toBe(18800);
    expect(ro.offerMinor(999, "USD")).toBe(699);
    expect(ro.offerMinor(1100, "JPY")).toBe(770);
    expect(ro.offerMinor(8800, "HKD")).toBe(6200);
  });
  it("due 5 minutes after 「返回」, else 15 minutes after the page opened", () => {
    expect(ro.dueAt({ created: T0, left_at: T0 + 60_000 })).toBe(T0 + 6 * 60_000);
    expect(ro.dueAt({ created: T0, left_at: null })).toBe(T0 + 15 * 60_000);
    expect(ro.dueAt({ created: T0, left_at: T0 + 14 * 60_000 })).toBe(T0 + 15 * 60_000);
  });
  it("the offer page: open within the hour, expired after it (the server's clock), used once paid", () => {
    upsertCustomer("ro-test@example.com", "zh-hant");
    ro.notePending({ co: "coTEST0001", sessionId: "cs_test_ro_1", kind: "deep", email: "ro-test@example.com", remind: true, locale: "zh-hant", currency: "twd", amount: 26900, product: "深斷", managed: false, cardHint: true, metadata: META, cancelUrl: "https://yaoflow.com/zh-hant/cast", successUrl: "https://yaoflow.com/zh-hant/reading?sid={CHECKOUT_SESSION_ID}", now: T0 });
    expect(ro.markLeft("coTEST0001", T0 + 30_000)?.left_at).toBe(T0 + 30_000);
    db().prepare("INSERT INTO recover_offers (token, co, session_id, kind, email, locale, currency, base_minor, offer_minor, sent_at, expires_at, fallback_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
      .run("tokTEST000000000001", "coTEST0001", "cs_test_ro_1", "deep", "ro-test@example.com", "zh-hant", "TWD", 26900, 18800, T0 + 6 * 60_000, T0 + 66 * 60_000, "https://yaoflow.com/zh-hant/cast?saved=x");
    const open = ro.offerView("tokTEST000000000001", T0 + 30 * 60_000);
    expect(open.state).toBe("open");
    expect(ro.offerView("tokTEST000000000001", T0 + 67 * 60_000).state).toBe("expired");
    ro.noteOfferPaid({ ro: "tokTEST000000000001" }, "cs_test_paid", T0 + 40 * 60_000);
    expect(ro.offerView("tokTEST000000000001", T0 + 41 * 60_000).state).toBe("used");
    expect(ro.offerView("nope").state).toBe("none");
  });
  it("the letter: 70 % next to the full price, the hour, and that the cast stays", () => {
    const p = db().prepare("SELECT * FROM pending_checkouts WHERE co = 'coTEST0001'").get() as unknown as ro.PendingRow;
    const m = buildRecoverOfferEmail({ p, locale: "zh-hant", url: "https://yaoflow.com/zh-hant/offer/x", base: "NT$269", offer: "NT$188", until: "10:46", unsub: "https://u" });
    expect(m.text).toContain("NT$188（原價 NT$269）");
    expect(m.text).toContain("1 小時內有效（到 10:46）");
    expect(m.text).toContain("可以照原價看");
    expect(m.subject).toContain("7 折");
  });
  it("same keys in every language (letter and page)", () => {
    const k = (o: object) => Object.keys(o).sort().join();
    for (const l of Object.keys(OFFER_T)) expect(k(OFFER_T[l]!)).toBe(k(OFFER_T.en!));
    for (const l of Object.keys(OFFER_PAGE_T)) expect(k(OFFER_PAGE_T[l]!)).toBe(k(OFFER_PAGE_T.en!));
    expect(Object.keys(OFFER_T)).toHaveLength(9);
  });
  it("10-23 进度表 101: with the 通卡 open to everyone, an offer on a single full reading is over (page and checkout); a pass's stays open", async () => {
    const prev = process.env.TONGKA_MODEL;
    process.env.TONGKA_MODEL = "on";
    try {
      const ins = db().prepare("INSERT INTO recover_offers (token, co, session_id, kind, email, locale, currency, base_minor, offer_minor, sent_at, expires_at, fallback_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
      ro.notePending({ co: "coTEST0002", sessionId: "cs_test_ro_2", kind: "deep", email: "ro-test@example.com", remind: true, locale: "zh-hant", currency: "twd", amount: 26900, product: "深斷", managed: false, cardHint: true, metadata: META, cancelUrl: "https://yaoflow.com/zh-hant/cast", successUrl: "https://yaoflow.com/zh-hant/reading?sid={CHECKOUT_SESSION_ID}", now: T0 });
      ins.run("tokTEST000000000002", "coTEST0002", "cs_test_ro_2", "deep", "ro-test@example.com", "zh-hant", "TWD", 26900, 18800, T0 + 6 * 60_000, T0 + 66 * 60_000, "https://yaoflow.com/zh-hant/cast?saved=y");
      expect(ro.offerView("tokTEST000000000002", T0 + 30 * 60_000).state).toBe("expired");
      expect(await ro.offerCheckout("tokTEST000000000002", "https://yaoflow.com", T0 + 30 * 60_000)).toEqual({ error: "expired" });
      ro.notePending({ co: "coTEST0003", sessionId: "cs_test_ro_3", kind: "pass", email: "ro-test@example.com", remind: true, locale: "zh-hant", currency: "twd", amount: 9900, product: "1 日通卡", managed: false, cardHint: true, metadata: { ...META, kind: "pass", days: "1" }, cancelUrl: "https://yaoflow.com/zh-hant/cast", successUrl: "https://yaoflow.com/zh-hant/reading?sid={CHECKOUT_SESSION_ID}", now: T0 });
      ins.run("tokTEST000000000003", "coTEST0003", "cs_test_ro_3", "pass", "ro-test@example.com", "zh-hant", "TWD", 9900, 6900, T0 + 6 * 60_000, T0 + 66 * 60_000, null);
      expect(ro.offerView("tokTEST000000000003", T0 + 30 * 60_000).state).toBe("open");
    } finally {
      if (prev === undefined) delete process.env.TONGKA_MODEL; else process.env.TONGKA_MODEL = prev;
    }
  });
  it("off sends nothing", async () => {
    setFeature("recover-offer", "off");
    expect((await ro.runRecoverOffers(T0 + 10 * 60_000)).sent).toBe(0);
    setFeature("recover-offer", "preview");
  });
});

describe("10-24: no reminder for someone already covered", () => {
  it("a running 通卡 or membership on the address counts as covered; an ended one does not", async () => {
    const { coveredNow } = await import("../src/lib/recover-offer");
    const { upsertCustomer, upsertSubscription } = await import("../src/lib/db");
    const now = Date.now(), D = 86_400_000;
    const a = upsertCustomer("ro-covered1024@example.com", "zh-hant");
    upsertSubscription({ customerId: a, stripeCustomerId: null, stripeSubscriptionId: "pass_ro_cov1024", status: "active", plan: "month", periodStart: now - D, periodEnd: now + 29 * D, cancelAtPeriodEnd: true, currency: "twd", amountMinor: 34900, passDays: 30 });
    expect(coveredNow("RO-Covered1024@example.com", now)).toBe(true);
    const b = upsertCustomer("ro-ended1024@example.com", "zh-hant");
    upsertSubscription({ customerId: b, stripeCustomerId: null, stripeSubscriptionId: "pass_ro_end1024", status: "active", plan: "month", periodStart: now - 3 * D, periodEnd: now - D, cancelAtPeriodEnd: true, currency: "twd", amountMinor: 7500, passDays: 1 });
    expect(coveredNow("ro-ended1024@example.com", now)).toBe(false);
    expect(coveredNow("nobody1024@example.com", now)).toBe(false);
  });
});
