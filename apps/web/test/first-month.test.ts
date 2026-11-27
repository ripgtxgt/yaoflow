import { afterEach, describe, expect, it, vi } from "vitest";
import { CURRENCIES, PASS_PRICES, PRICES, firstMonthExtraMinor, firstMonthMinor } from "../src/lib/money";
import { FIRST_MONTH_T, firstT } from "../src/lib/dict/first-month";
import { LOCALES } from "../src/lib/locales";
import { db, markMembershipRefunded, startsAtMonthlyFee, upsertCustomer, upsertSubscription } from "../src/lib/db";
import { TERMS } from "../src/lib/legal";
import { TERMS_HANT } from "../src/lib/legal-hant";

/**
 * 10-10 首月同价 (Neil: 「按第1种做吧，然后需要把这个续费269写清楚」): a member who turned renewal off within the hour
 * had the one-off month for NT$269 while a one-month buyer paid NT$349. A first-time member's first month now costs the
 * one-off month's price; the monthly fee from the second month on, and every offer says both numbers.
 */
afterEach(() => vi.unstubAllGlobals());

describe("首月同价：价格", () => {
  it("the first month is the one-off month's price in every currency, the difference rides on top of the monthly fee", () => {
    for (const c of CURRENCIES) {
      expect(firstMonthMinor(c)).toBe(PASS_PRICES[c]);
      expect(firstMonthExtraMinor(c), c).toBeGreaterThan(0);
      expect(PRICES[c].month + firstMonthExtraMinor(c)).toBe(PASS_PRICES[c]);
    }
    expect(firstMonthExtraMinor("TWD")).toBe(8000); // NT$349 − NT$269
  });

  it("Stripe's page gets a one-time first-month line next to the recurring price, and never without being asked", async () => {
    process.env.STRIPE_SECRET_KEY ??= "sk_test_dummy";
    const bodies: URLSearchParams[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: { body?: string }) => { bodies.push(new URLSearchParams(init?.body ?? "")); return new Response(JSON.stringify({ id: "cs_x", url: "https://x" }), { status: 200 }); }));
    const { createSubscriptionSession } = await import("../src/lib/stripe");
    const base = { productName: "YaoFlow 會員", amountCents: 26900, currency: "twd", interval: "month" as const, customerEmail: "a@b.c", successUrl: "https://s", cancelUrl: "https://c", locale: "zh-hant" as const, metadata: {}, managedPayments: false };
    await createSubscriptionSession({ ...base, firstMonthExtra: { amountMinor: 8000, name: firstT("zh-hant", "stripeName", { first: "NT$349", month: "NT$269" }) } });
    const b = bodies[0]!;
    expect(b.get("line_items[0][price_data][unit_amount]")).toBe("26900");
    expect(b.get("line_items[0][price_data][recurring][interval]")).toBe("month");
    expect(b.get("line_items[1][price_data][unit_amount]")).toBe("8000");
    expect(b.get("line_items[1][price_data][recurring][interval]")).toBeNull(); // one-time: the first invoice only
    expect(b.get("line_items[1][price_data][tax_behavior]")).toBe("inclusive");
    expect(b.get("line_items[1][price_data][product_data][name]")).toBe("首月差額：首月共 NT$349，續訂起每月 NT$269");
    await createSubscriptionSession(base);
    expect(bodies[1]!.get("line_items[1][quantity]")).toBeNull();
  });
});

describe("首月同价：谁付首月价", () => {
  const D = 86_400_000;
  const sub = (cid: number, id: string, o: { created: number; periodStart: number; status?: string }) => {
    upsertSubscription({ customerId: cid, stripeCustomerId: "cus_fm", stripeSubscriptionId: id, status: o.status ?? "canceled", plan: "month", periodStart: o.periodStart, periodEnd: o.periodStart + 30 * D, cancelAtPeriodEnd: true });
    db().prepare("UPDATE subscriptions SET created_at = ? WHERE stripe_subscription_id = ?").run(o.created, id);
  };
  const pass = (cid: number, id: string, end: number) => {
    upsertSubscription({ customerId: cid, stripeCustomerId: null, stripeSubscriptionId: id, status: "active", plan: "month", periodStart: end - 30 * D, periodEnd: end, cancelAtPeriodEnd: true });
    db().prepare("UPDATE subscriptions SET created_at = ? WHERE stripe_subscription_id = ?").run(end - 30 * D, id);
  };
  const now = Date.now();

  it("never a member, a gift, an unpaid attempt: the first-month price", () => {
    expect(startsAtMonthlyFee(upsertCustomer("fm-fresh@example.com", "zh-hant"))).toBe(false);
    const gifted = upsertCustomer("fm-gift@example.com", "zh-hant");
    upsertSubscription({ customerId: gifted, stripeCustomerId: null, stripeSubscriptionId: "comp_fm_1", status: "active", plan: "month", periodStart: now, periodEnd: now + D, cancelAtPeriodEnd: true });
    expect(startsAtMonthlyFee(gifted)).toBe(false);
    const tried = upsertCustomer("fm-tried@example.com", "zh-hant");
    sub(tried, "sub_fm_unpaid", { created: now - D, periodStart: now - D, status: "incomplete_expired" });
    expect(startsAtMonthlyFee(tried)).toBe(false);
  });

  it("10-10 漏洞: subscribed once and turned renewal off without renewing — the first-month price again next time", () => {
    const quick = upsertCustomer("fm-quick@example.com", "zh-hant");
    sub(quick, "sub_fm_quick", { created: now - 40 * D, periodStart: now - 40 * D }); // never renewed
    expect(startsAtMonthlyFee(quick, now)).toBe(false);
  });

  // 10-24 (Neil: 「会员期失效之后，再购买会员的话，恢复原价，而不是续订价」): renewed or not, a membership that ran out
  // starts again at the first-month price
  it("a member whose membership ran out comes back at the first-month price, even after renewing", () => {
    const loyal = upsertCustomer("fm-loyal@example.com", "zh-hant");
    sub(loyal, "sub_fm_loyal", { created: now - 100 * D, periodStart: now - 40 * D }); // renewed twice, ended 10 days ago
    expect(startsAtMonthlyFee(loyal, now)).toBe(false);
  });

  it("carrying on from a one-off month: the monthly fee while it runs or within a week of its end, and only if never subscribed", () => {
    const p1 = upsertCustomer("fm-pass-now@example.com", "zh-hant");
    pass(p1, "pass_fm_now", now + 5 * D);
    expect(startsAtMonthlyFee(p1, now)).toBe(true);
    const p2 = upsertCustomer("fm-pass-old@example.com", "zh-hant");
    pass(p2, "pass_fm_old", now - 20 * D);
    expect(startsAtMonthlyFee(p2, now)).toBe(false); // long over: a new start
    const p3 = upsertCustomer("fm-pass-loop@example.com", "zh-hant");
    pass(p3, "pass_fm_loop", now - 2 * D);
    sub(p3, "sub_fm_after_pass", { created: now - 3 * D, periodStart: now - 3 * D });
    expect(startsAtMonthlyFee(p3, now)).toBe(false); // the pass → subscription step was already taken
  });

  it("10-10: a membership whose money came back no longer counts — the one-off month by its session, a subscription by its Stripe customer", () => {
    const p = upsertCustomer("fm-pass-refund@example.com", "zh-hant");
    pass(p, "pass_cs_fm_refund_000001", now + 5 * D);
    expect(startsAtMonthlyFee(p, now)).toBe(true);
    expect(markMembershipRefunded({ passSessionId: "cs_fm_refund_000001" })).toBe("pass_cs_fm_refund_000001");
    expect(startsAtMonthlyFee(p, now)).toBe(false);
    const r = upsertCustomer("fm-sub-refund@example.com", "zh-hant");
    sub(r, "sub_fm_refunded", { created: now - 100 * D, periodStart: now - 10 * D }); // renewed
    db().prepare("UPDATE subscriptions SET stripe_customer_id = 'cus_fm_refund' WHERE stripe_subscription_id = 'sub_fm_refunded'").run();
    expect(markMembershipRefunded({ stripeCustomer: "cus_fm_refund", chargeAt: now - 10 * D })).toBe("sub_fm_refunded");
    expect(startsAtMonthlyFee(r, now)).toBe(false); // 10-24: any earlier subscription starts again at the first-month price
    expect(markMembershipRefunded({ stripeCustomer: "cus_nobody" })).toBeNull();
  });
});

describe("首月同价：写清楚", () => {
  it("every language names the first month and the monthly fee it renews at, and keeps the link to the Terms", () => {
    for (const l of LOCALES) {
      const t = FIRST_MONTH_T[l]!;
      expect(t, l).toBeTruthy();
      for (const k of ["monthly", "consent", "optSub", "stripeName"] as const) {
        expect(t[k], `${l}.${k}`).toContain("{first}");
        expect(t[k], `${l}.${k}`).toContain("{month}");
      }
      expect(t.consent, l).toMatch(/<a>[^<]+<\/a>/);
      expect(t.paren, l).toContain("{first}");
      expect(t.cta, l).toContain("{first}");
      expect(t.optSubSave, l).toContain("{save}");
      expect(t.renewNote, l).toContain("{month}");
    }
    expect(firstT("zh-hant", "monthly", { first: "NT$349", month: "NT$269" })).toBe("首月 NT$349，之後每月 NT$269");
  });

  it("the Terms say it in every language", () => {
    const says: Record<string, string> = { zh: "首月价格", en: "First-month price", ja: "初月価格", ko: "첫 달 가격", fr: "Prix du premier mois", de: "Preis im ersten Monat", es: "Precio del primer mes", pt: "Preço do primeiro mês" };
    for (const [l, s] of Object.entries(says)) expect(JSON.stringify(TERMS.map((x) => (x as unknown as Record<string, unknown>)[l])), l).toContain(s);
    expect(JSON.stringify(TERMS_HANT)).toContain("首月價格");
  });
});
