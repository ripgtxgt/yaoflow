import { describe, expect, it } from "vitest";
// DATA_DIR is a fresh temp dir (test/setup.ts)
import {
  addCost, costsSeeded, deleteCost, ledgerTotals, listCosts, markOrderRefunded, ordersNeedingLedger,
  recordOrder, recordProviderBalance, saveOrderLedger, upsertCustomer,
} from "../src/lib/db";
import { providerSpend } from "../src/lib/ledger";

/**
 * 流水 · 成本 · 净利 (09-21, Neil). The sticker price is not revenue: Managed
 * Payments settles into one currency and takes its cut out of that, so only
 * the balance transaction's net may reach a profit line.
 */
describe("账本", () => {
  it("keeps what Stripe settled apart from what the buyer saw, and nets refunds out", () => {
    const cid = upsertCustomer("ledger@example.org", "zh-hant");
    recordOrder({ sessionId: "cs_led_tw", customerId: cid, castId: null, tier: "deep", amountCents: 7245, currency: "twd", email: "ledger@example.org", status: "paid", via: null, firstDeep: true, paymentIntent: "pi_led_1" });
    recordOrder({ sessionId: "cs_led_gb", customerId: cid, castId: null, tier: "deep", amountCents: 229, currency: "gbp", email: "ledger@example.org", status: "paid", via: null, firstDeep: true, paymentIntent: "pi_led_2" });

    expect(ordersNeedingLedger(10).map((o) => o.session_id).sort()).toEqual(["cs_led_gb", "cs_led_tw"]);
    // NT$72.45 arrives as US$2.28 gross − US$0.53 fee = US$1.75 net (the real 09-21 numbers)
    saveOrderLedger("cs_led_tw", { currency: "usd", settled: 228, fee: 53, net: 175, refundNet: 0 });
    saveOrderLedger("cs_led_gb", { currency: "usd", settled: 301, fee: 62, net: 239, refundNet: 0 });
    expect(ordersNeedingLedger(10)).toHaveLength(0); // priced once, left alone

    const [row] = ledgerTotals(0);
    expect(row).toMatchObject({ currency: "USD", orders: 2, settled: 529, fee: 115, net: 414, unpriced: 0 });

    // a refund comes back as a negative net, and re-opens the row for a re-read
    markOrderRefunded("cs_led_gb", "requested");
    expect(ordersNeedingLedger(10).map((o) => o.session_id)).toEqual(["cs_led_gb"]);
    saveOrderLedger("cs_led_gb", { currency: "usd", settled: 301, fee: 62, net: 239, refundNet: -301 });
    const [after] = ledgerTotals(0);
    expect(after!.net + after!.refundNet).toBe(113); // 175 + 239 − 301, the fee stays gone
  });

  it("counts a test order out of the books entirely", async () => {
    const count = () => ledgerTotals(0).reduce((a, r) => a + r.orders, 0);
    const before = count();
    recordOrder({ sessionId: "cs_test_led", customerId: null, castId: null, tier: "one", amountCents: 299, currency: "usd", email: "x@example.org", status: "paid", via: null, firstDeep: false, paymentIntent: "pi_led_3" });
    expect(count()).toBe(before + 1);
    const { markOwnOrdersAsTest } = await import("../src/lib/db");
    markOwnOrdersAsTest([]);
    expect(count()).toBe(before); // the cs_test_ prefix is ours, so it leaves the books
  });

  it("takes model spend from the balance dropping, and reads a rise as a top-up", () => {
    const t = Date.now();
    recordProviderBalance("deepseek", "CNY", 50);
    recordProviderBalance("deepseek", "CNY", 47.5);   // spent 2.50
    recordProviderBalance("deepseek", "CNY", 97.5);   // topped up 50
    recordProviderBalance("deepseek", "CNY", 96.1);   // spent 1.40
    const s = providerSpend("deepseek", t - 60_000);
    expect(s.spent).toBeCloseTo(3.9, 2);
    expect(s.toppedUp).toBeCloseTo(50, 2);
    expect(s.latest).toBeCloseTo(96.1, 2);
    expect(s.readings).toBe(4);
    // one reading says nothing at all
    recordProviderBalance("lonely", "CNY", 10);
    expect(providerSpend("lonely", t - 60_000)).toMatchObject({ spent: 0, readings: 1 });
  });

  it("keeps cost rows Neil types in, monthly and one-off", () => {
    expect(costsSeeded()).toBe(false);
    addCost({ kind: "monthly", label: "Resend Pro", amountCents: 2000, currency: "usd", startedOn: "2026-09-21", note: "5 万封/月" });
    addCost({ kind: "once", label: "方舟充值", amountCents: 10000, currency: "cny", spentOn: "2026-09-15" });
    expect(costsSeeded()).toBe(true);
    const rows = listCosts();
    expect(rows.map((r) => [r.kind, r.label, r.amount_cents, r.currency])).toEqual([
      ["monthly", "Resend Pro", 2000, "USD"],
      ["once", "方舟充值", 10000, "CNY"],
    ]);
    deleteCost(rows[0]!.id);
    expect(listCosts()).toHaveLength(1);
  });
});

/**
 * 09-22: every panel query actually runs. The first version of firstToFull
 * built its WHERE clause by prefixing one alias onto the whole string, so the
 * self-join saw a bare amount_cents and SQLite refused the statement — the
 * dashboard 500'd although the types were fine. A test that merely calls each
 * function would have caught it, so here it is.
 */
describe("panel queries parse and run", () => {
  it("returns numbers rather than throwing", async () => {
    const db = await import("../src/lib/db");
    const shapes: [string, () => object][] = [
      ["firstToFull", () => db.firstToFull()],
      ["ltvStats", () => db.ltvStats()],
      ["sealStats", () => db.sealStats()],
      ["dailyCastStats", () => db.dailyCastStats()],
      ["revisitRewardStats", () => db.revisitRewardStats(0)],
      ["genTiming", () => db.genTiming(0)],
      ["refundSeries", () => db.refundSeries(0)],
    ];
    for (const [name, run] of shapes) {
      const out = run() as Record<string, unknown>;
      expect(out, name).toBeTypeOf("object");
      for (const [k, v] of Object.entries(out)) {
        if (typeof v === "number") expect(Number.isFinite(v), `${name}.${k}`).toBe(true);
      }
    }
  });
});

/**
 * 09-22, after Neil found a $79 annual membership that the panel showed
 * nowhere: a membership has no order row, so anything computed from `orders`
 * is blind to it. liveMoney reads the Stripe ledger instead and has to put an
 * invoice with no matching order into the membership bucket, not throw it away.
 */
describe("liveMoney counts memberships", () => {
  it("splits reading charges from membership invoices and keeps the total whole", async () => {
    const db = await import("../src/lib/db");
    const t0 = Date.now() - 3600_000;
    const pi = `pi_test_${Math.random().toString(36).slice(2, 10)}`;
    // a reading we sold: order row + its balance transaction
    db.recordOrder({ sessionId: `cs_lm_${pi}`, customerId: null, castId: null, tier: "deep", amountCents: 299, currency: "usd", email: "lm@example.com", status: "paid", paymentIntent: pi });
    db.saveStripeTxn({ id: `txn_a_${pi}`, created: t0, type: "charge", currency: "USD", amount: 299, fee: 39, net: 260, source: "ch_x", payment_intent: pi });
    // a membership invoice: no order anywhere
    db.saveStripeTxn({ id: `txn_b_${pi}`, created: t0, type: "payment", currency: "USD", amount: 7900, fee: 259, net: 7641, source: "ch_y", payment_intent: `pi_none_${pi}` });

    const m = db.liveMoney(t0 - 1000);
    expect(m.memberships.net).toBeGreaterThanOrEqual(7641);
    expect(m.orders.net).toBeGreaterThanOrEqual(260);
    // the split must not lose money: buckets add back up to the whole
    expect(m.orders.net + m.memberships.net + m.refunds.net).toBe(m.net);
    expect(m.gross - m.fee).toBe(m.net);
  });
});

/**
 * 09-22, after Neil: 「面板里面还有很多数据是不对的」. Two口径 bugs that made the
 * same dashboard contradict itself, both now locked down.
 */
describe("会员额度不是收入", () => {
  it("a membership redemption is delivered but never counted as a sale", async () => {
    const db = await import("../src/lib/db");
    const t0 = Date.now() - 7200_000;
    const tag = Math.random().toString(36).slice(2, 8);
    db.recordOrder({ sessionId: `cs_sale_${tag}`, customerId: null, castId: null, tier: "deep", amountCents: 999, currency: "usd", email: `a${tag}@e.com`, status: "paid", paymentIntent: `pi_${tag}` });
    // what a member's monthly allowance leaves behind: an order with no money on it
    db.recordOrder({ sessionId: `cs_sub_${tag}`, customerId: null, castId: null, tier: "deep", amountCents: 0, currency: null, email: `a${tag}@e.com`, status: "subscription" });

    const sold = db.paidOrdersIn(t0);
    const redeemed = db.subRedemptionsIn(t0);
    expect(sold.sessions.has(`cs_sale_${tag}`.slice(-12))).toBe(true);
    expect(sold.sessions.has(`cs_sub_${tag}`.slice(-12))).toBe(false);
    expect(redeemed).toBeGreaterThanOrEqual(1);
  });
});

describe("Stripe 的平台费不是退款", () => {
  it("keeps stripe_fee out of the refund bucket", async () => {
    const db = await import("../src/lib/db");
    const t0 = Date.now() - 1800_000;
    const tag = Math.random().toString(36).slice(2, 8);
    db.saveStripeTxn({ id: `txn_fee_${tag}`, created: t0, type: "stripe_fee", currency: "USD", amount: -67, fee: 0, net: -67, source: null, payment_intent: null });
    db.saveStripeTxn({ id: `txn_ref_${tag}`, created: t0, type: "refund", currency: "USD", amount: -148, fee: 0, net: -148, source: "ch_z", payment_intent: `pi_ref_${tag}` });

    const m = db.liveMoney(t0 - 1000);
    expect(m.platformFees.net).toBeLessThanOrEqual(-67);
    expect(m.refunds.net).toBeLessThanOrEqual(-148);
    // and the buckets still add up to the whole
    expect(m.orders.net + m.memberships.net + m.refunds.net + m.platformFees.net + m.disputes.net).toBe(m.net);
  });

  it("09-26: a chargeback is a dispute, not a platform fee, and 收款 is sales alone", async () => {
    const db = await import("../src/lib/db");
    const t0 = Date.UTC(2026, 8, 26, 1);
    const tag = Math.random().toString(36).slice(2, 8);
    db.saveStripeTxn({ id: `txn_c_${tag}`, created: t0, type: "payment", currency: "USD", amount: 7900, fee: 259, net: 7641, source: "ch_d", payment_intent: `pi_d_${tag}` });
    db.saveStripeTxn({ id: `txn_d_${tag}`, created: t0 + 1, type: "adjustment", currency: "USD", amount: -7900, fee: 1500, net: -9400, source: "du_x", payment_intent: null });
    db.saveStripeTxn({ id: `txn_f_${tag}`, created: t0 + 2, type: "stripe_fee", currency: "USD", amount: -290, fee: 0, net: -290, source: null, payment_intent: null });
    const m = db.liveMoney(t0 - 1, t0 + 10);
    expect(m.disputes).toEqual({ n: 1, net: -9400 });
    expect(m.platformFees).toEqual({ n: 1, net: -290 });
    expect(m.sales).toEqual({ n: 1, gross: 7900, fee: 259 });
    expect(m.net).toBe(7641 - 9400 - 290);
  });
});

describe("事件过滤只能挡带订单会话号的事件", () => {
  it("never filters follow-ups or seals, which carry a browser session id", async () => {
    const db = await import("../src/lib/db");
    const real = new Set(["abcdefabcdef"]);
    // these two carry the BROWSER's id — filtering them by order tails zeroed
    // 114 follow-ups and 2 seals for half a day on 09-22
    expect(db.isRealDeliveryEvent({ e: "followup_ask", s: "zzzzzzzzzzzz" }, real)).toBe(true);
    expect(db.isRealDeliveryEvent({ e: "seal_sent", s: "zzzzzzzzzzzz" }, real)).toBe(true);
    // these do carry the order's, and must still be filtered
    expect(db.isRealDeliveryEvent({ e: "purchase", s: "zzzzzzzzzzzz" }, real)).toBe(false);
    expect(db.isRealDeliveryEvent({ e: "purchase", s: "abcdefabcdef" }, real)).toBe(true);
  });
});

/**
 * 09-22, after Neil: 「流水面板和客户档案面板也是一样的」. Two more口径 holes.
 */
describe("会员的钱要算在那位客户头上", () => {
  it("attributes an invoice with no order row to the member who paid it", async () => {
    const db = await import("../src/lib/db");
    const tag = Math.random().toString(36).slice(2, 8);
    const cid = db.upsertCustomer(`mem_${tag}@e.com`, "zh-hant");
    db.upsertSubscription({
      customerId: cid, stripeCustomerId: `cus_${tag}`, stripeSubscriptionId: `sub_${tag}`,
      status: "active", plan: "month", periodStart: Date.now(), periodEnd: Date.now() + 30 * 86400_000,
      cancelAtPeriodEnd: false, currency: "HKD", amountMinor: 6800,
    });
    // the invoice: a charge with Stripe's customer on it and no order anywhere
    db.saveStripeTxn({
      id: `txn_inv_${tag}`, created: Date.now(), type: "payment", currency: "USD",
      amount: 867, fee: 77, net: 790, source: `ch_${tag}`, payment_intent: `pi_inv_${tag}`,
      stripe_customer: `cus_${tag}`,
    });
    const paid = db.membershipPaidByCustomer().get(cid);
    expect(paid?.n).toBe(1);
    expect(paid?.gross).toBe(867);
  });

  it("does not count a one-off reading's charge as membership money", async () => {
    const db = await import("../src/lib/db");
    const tag = Math.random().toString(36).slice(2, 8);
    const cid = db.upsertCustomer(`both_${tag}@e.com`, "zh-hant");
    db.upsertSubscription({
      customerId: cid, stripeCustomerId: `cus2_${tag}`, stripeSubscriptionId: `sub2_${tag}`,
      status: "active", plan: "month", periodStart: Date.now(), periodEnd: Date.now() + 30 * 86400_000,
      cancelAtPeriodEnd: false, currency: "HKD", amountMinor: 6800,
    });
    // the same person also bought a reading outright: that one HAS an order row
    db.recordOrder({ sessionId: `cs_one_${tag}`, customerId: cid, castId: null, tier: "deep", amountCents: 1800, currency: "hkd", email: `both_${tag}@e.com`, status: "paid", paymentIntent: `pi_one_${tag}` });
    db.saveStripeTxn({ id: `txn_one_${tag}`, created: Date.now(), type: "charge", currency: "USD", amount: 229, fee: 42, net: 187, source: `ch2_${tag}`, payment_intent: `pi_one_${tag}`, stripe_customer: `cus2_${tag}` });
    expect(db.membershipPaidByCustomer().get(cid)).toBeUndefined();
  });
});

/**
 * 09-22, the guard for the bug that started the whole audit. `orders` holds
 * both sales and deliveries; a membership allowance writes a row with no money
 * and status "subscription", and because nothing said so it counted as a sale —
 * 22 sales were reported as 31. Any new status must be classified deliberately.
 */
describe("orders.status 必须归好类", () => {
  it("every status in the table is either a sale or a delivery", async () => {
    const db = await import("../src/lib/db");
    expect(db.unclassifiedOrderStatuses()).toEqual([]);
  });

  it("a status nobody classified is caught rather than counted", async () => {
    const db = await import("../src/lib/db");
    const tag = Math.random().toString(36).slice(2, 8);
    db.recordOrder({ sessionId: `cs_odd_${tag}`, customerId: null, castId: null, tier: "deep", amountCents: 0, currency: null, email: null, status: `brand_new_thing_${tag}` });
    expect(db.unclassifiedOrderStatuses()).toContain(`brand_new_thing_${tag}`);
    // and it must not have been counted as money
    const sold = db.paidOrdersIn(0);
    expect(sold.sessions.has(`cs_odd_${tag}`.slice(-12))).toBe(false);
  });

  it("the sale list and the delivery list never overlap", async () => {
    const db = await import("../src/lib/db");
    const overlap = (db.SALE_STATUSES as readonly string[]).filter((x) => (db.DELIVERY_ONLY_STATUSES as readonly string[]).includes(x));
    expect(overlap).toEqual([]);
  });
});

/**
 * 09-22 (Neil, looking at the readings table: 「会员还是会被当作付费？」).
 * The headline had been taught to ask the orders table, but computeStats still
 * counted every `purchase` event — so the per-day table, the hourly bars and
 * the per-language table went on reporting members as buyers. The set of
 * paying sessions has to reach all of them.
 */
describe("computeStats 里的付费必须是真的付了钱", () => {
  it("counts a sale, and counts a membership redemption as delivery only", async () => {
    const { computeStats } = await import("../src/lib/analytics-server");
    const evs = [
      { t: Date.now(), e: "cast_complete", s: "aaaaaaaaaaaa" },
      { t: Date.now(), e: "cast_complete", s: "bbbbbbbbbbbb" },
      { t: Date.now(), e: "purchase", s: "aaaaaaaaaaaa", locale: "zh-hant" },  // paid
      { t: Date.now(), e: "purchase", s: "bbbbbbbbbbbb", locale: "zh-hant" },  // membership allowance
    ] as never[];
    const paid = new Set(["aaaaaaaaaaaa"]);

    const withSet = computeStats(evs, paid);
    expect(withSet.funnel.purchase).toBe(1);
    expect(withSet.byDay.at(-1)?.purchases).toBe(1);
    expect(withSet.byDay.at(-1)?.readings).toBe(2);       // both were delivered
    const hant = withSet.byLocaleFunnel.find((x) => x.locale === "zh-hant");
    expect(hant?.purchases).toBe(1);
    expect(hant?.readings).toBe(2);

    // no set = the painted-door reading, where a delivery is all we had
    expect(computeStats(evs).funnel.purchase).toBe(2);
  });
});

/**
 * 09-22 (Neil: 「从底层把这个统计弄好」). `orders.status` answered two questions
 * with one value — where the money got to, and why the reading was handed over.
 * That is why a membership redemption counted as a sale and why a member who
 * also bought something could not be represented. The column is now split; for
 * a fortnight both are written, and these keep them honest.
 */
describe("orders.status 拆成两列", () => {
  it("the mapping is total: every status the code writes has a split", async () => {
    const db = await import("../src/lib/db");
    for (const s of [...db.SALE_STATUSES, ...db.DELIVERY_ONLY_STATUSES]) {
      // "pair" is a historical alias with no rows; everything else must map
      if (s === "pair") continue;
      expect(db.STATUS_SPLIT[s], `status ${s} 没有归类`).toBeDefined();
    }
  });

  it("no row disagrees with what its status says", async () => {
    const db = await import("../src/lib/db");
    expect(db.splitDrift()).toEqual([]);
  });

  it("a membership redemption is a delivery with no money, a purchase is both", async () => {
    const db = await import("../src/lib/db");
    const tag = Math.random().toString(36).slice(2, 8);
    db.recordOrder({ sessionId: `cs_sp_a_${tag}`, customerId: null, castId: null, tier: "deep", amountCents: 999, currency: "usd", email: null, status: "paid" });
    db.recordOrder({ sessionId: `cs_sp_b_${tag}`, customerId: null, castId: null, tier: "deep", amountCents: 0, currency: null, email: null, status: "subscription" });
    const a = db.orderBySession(`cs_sp_a_${tag}`)! as unknown as Record<string, unknown>;
    const b = db.orderBySession(`cs_sp_b_${tag}`)! as unknown as Record<string, unknown>;
    expect([a.entitlement_kind, a.payment_state]).toEqual(["purchase", "paid"]);
    expect([b.entitlement_kind, b.payment_state]).toEqual(["membership", "none"]);
    expect(db.splitDrift()).toEqual([]);
  });

  it("a refund moves the payment state and leaves the reason they got it alone", async () => {
    const db = await import("../src/lib/db");
    const tag = Math.random().toString(36).slice(2, 8);
    db.recordOrder({ sessionId: `cs_sp_r_${tag}`, customerId: null, castId: null, tier: "deep", amountCents: 999, currency: "usd", email: null, status: "paid" });
    db.markOrderRefunded(`cs_sp_r_${tag}`, "requested");
    const r = db.orderBySession(`cs_sp_r_${tag}`)! as unknown as Record<string, unknown>;
    expect(r.payment_state).toBe("refunded");
    expect(r.entitlement_kind).toBe("purchase");   // 他当初凭什么拿到这份解读，没有变
    expect(db.splitDrift()).toEqual([]);
  });
});

/**
 * 09-22 第二批. The reads moved from `status` to the two new columns. This is
 * the check that matters: not that the rows agree (splitDrift does that), but
 * that the ANSWERS agree — every number the panel shows, computed the old way
 * and the new way, must be identical. A query can read the right column and
 * still mean something different; this catches that.
 */
describe("迁移期间新旧口径必须给出同一个数", () => {
  it("every headline figure is the same computed either way", async () => {
    const db = await import("../src/lib/db");
    expect(db.splitParity()).toEqual([]);
  });

  it("still the same after a sale, a membership redemption and a refund", async () => {
    const db = await import("../src/lib/db");
    const tag = Math.random().toString(36).slice(2, 8);
    db.recordOrder({ sessionId: `cs_p1_${tag}`, customerId: null, castId: null, tier: "deep", amountCents: 999, currency: "usd", email: null, status: "paid" });
    db.recordOrder({ sessionId: `cs_p2_${tag}`, customerId: null, castId: null, tier: "one", amountCents: 0, currency: null, email: null, status: "subscription" });
    db.recordOrder({ sessionId: `cs_p3_${tag}`, customerId: null, castId: null, tier: "deep", amountCents: 299, currency: "usd", email: null, status: "paid" });
    db.markOrderRefunded(`cs_p3_${tag}`, "requested");
    expect(db.splitParity()).toEqual([]);
    expect(db.splitDrift()).toEqual([]);
  });
});

describe("公开卦例回礼的订单归类（09-26 面板报警）", () => {
  it("a case_light delivery is classified: a delivery, never a sale", async () => {
    const db = await import("../src/lib/db");
    const tag = Math.random().toString(36).slice(2, 8);
    db.recordOrder({ sessionId: `cl_${tag}`, customerId: null, castId: null, tier: "one", amountCents: 0, currency: null, email: `cl${tag}@e.com`, status: "case_light" });
    expect(db.unclassifiedOrderStatuses()).not.toContain("case_light");
    const row = db.db().prepare("SELECT entitlement_kind AS k, payment_state AS p FROM orders WHERE session_id = ?").get(`cl_${tag}`) as { k: string; p: string };
    expect(row).toEqual({ k: "case_reward", p: "none" });
    expect(db.paidOrdersIn(0).sessions.has(`cl_${tag}`.slice(-12))).toBe(false);
  });
});

describe("备份日志轮转（09-27 面板报警）", () => {
  it("reads last week's compressed log when the current one was just rotated empty", async () => {
    const { writeFileSync, mkdtempSync } = await import("node:fs");
    const { gzipSync } = await import("node:zlib");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const dir = mkdtempSync(join(tmpdir(), "bk-"));
    const path = join(dir, "backup.log");
    writeFileSync(path, "");
    writeFileSync(`${path}.1.gz`, gzipSync("2026-09-26T18:00:07+00:00 OFFSITE_OK 已上传 s3://x/y.tar.gz (3.5M)\n"));
    process.env.BACKUP_LOG = path;
    const db = await import("../src/lib/db");
    const b = db.backupState();
    expect(b.offsite).toBe("ok");
    expect(b.at).toBe(Date.parse("2026-09-26T18:00:07+00:00"));
    delete process.env.BACKUP_LOG;
  });
});
