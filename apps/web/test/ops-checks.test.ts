import { describe, expect, it, vi } from "vitest";

/**
 * 10-23 定时核对 (lib/ops-checks.ts): checks with a due time, run by the server's hourly cron — once each, the result kept
 * and mailed to the owner; "not ready yet" is tried again until a day past due. Resend and Stripe are stubbed.
 */
const sent: { to: string | string[]; subject: string; text: string; kind: string }[] = [];
vi.mock("../src/lib/email", async (orig) => {
  const real = await orig<typeof import("../src/lib/email")>();
  return {
    ...real,
    sendEmail: vi.fn(async (to: string | string[], subject: string, _html: string, text: string, opts: { kind: string }) => {
      sent.push({ to, subject, text, kind: opts.kind });
      return { ok: true, id: `re_chk_${sent.length}` };
    }),
  };
});
const stripeState: { invoices: import("../src/lib/stripe").InvoiceAmounts[]; balance: number } = { invoices: [], balance: 0 };
vi.mock("../src/lib/stripe", async (orig) => {
  const real = await orig<typeof import("../src/lib/stripe")>();
  return {
    ...real,
    subscriptionInvoicesSince: vi.fn(async () => stripeState.invoices),
    customerBalance: vi.fn(async () => ({ balance: stripeState.balance, currency: "twd" })),
  };
});

const { runDueChecks, singleSalesSince, packCreditInvoice, OPS_CHECKS, checkStates, memoryRecheckDue } = await import("../src/lib/ops-checks");
const db = await import("../src/lib/db");
type OpsCheck = import("../src/lib/ops-checks").OpsCheck;

const H = 3_600_000;
const NOW = Date.UTC(2026, 9, 25, 5, 0);

describe("定时核对：什么时候跑、跑几次、结果去哪", () => {
  it("a due check runs once: kept, one ops line, one mail to the owner; the next hour leaves it alone", async () => {
    let runs = 0;
    const checks: OpsCheck[] = [
      { id: "t-due", title: "测试：到期的", due: NOW - H, run: async () => { runs++; return { ok: true, lines: ["一切如预期"] }; } },
      { id: "t-later", title: "测试：还没到期的", due: NOW + 5 * H, run: async () => { runs += 100; return { ok: true, lines: [] }; } },
    ];
    const before = sent.length;
    const r1 = await runDueChecks(NOW, { checks });
    expect(r1.map((x) => [x.id, x.state, x.ok])).toEqual([["t-due", "done", true]]);
    expect(runs).toBe(1);
    const mail = sent.slice(before);
    expect(mail).toHaveLength(1);
    expect(mail[0]!.kind).toBe("ops_check");
    expect(mail[0]!.subject).toContain("通过");
    expect(mail[0]!.subject).toContain("测试：到期的");
    expect(mail[0]!.text).toContain("一切如预期");
    expect((db.db().prepare("SELECT COUNT(*) AS n FROM ops_events WHERE kind = 'ops_check' AND detail LIKE 't-due %'").get() as { n: number }).n).toBe(1);
    // the next hour: done, so nothing runs and nothing is sent
    const r2 = await runDueChecks(NOW + H, { checks });
    expect(r2).toEqual([]);
    expect(runs).toBe(1);
    expect(sent.length).toBe(before + 1);
  });

  it("not ready yet: tried every hour, no mail — a day past due it is reported as needing a look, with what was seen", async () => {
    const checks: OpsCheck[] = [{ id: "t-retry", title: "测试：帐单还没出", due: NOW - H, run: async () => ({ retry: "续费帐单还没出来", lines: ["看到的东西"] }) }];
    const before = sent.length;
    expect((await runDueChecks(NOW, { checks }))[0]).toMatchObject({ state: "retry" });
    expect((await runDueChecks(NOW + 2 * H, { checks }))[0]).toMatchObject({ state: "retry" });
    expect(sent.length).toBe(before);
    const late = await runDueChecks(NOW + 24 * H, { checks });
    expect(late[0]).toMatchObject({ state: "done", ok: false });
    expect(late[0]!.lines[0]).toContain("到期一天了还是：续费帐单还没出来");
    expect(late[0]!.lines).toContain("看到的东西");
    expect(sent.at(-1)!.subject).toContain("要看一下");
  });

  it("dry runs everything now and keeps nothing; only= runs that one now", async () => {
    let runs = 0;
    const checks: OpsCheck[] = [
      { id: "t-dry-a", title: "a", due: NOW + 100 * H, run: async () => { runs++; return { ok: true, lines: ["a"] }; } },
      { id: "t-dry-b", title: "b", due: NOW + 200 * H, run: async () => { runs++; return { ok: false, lines: ["b"] }; } },
    ];
    const before = sent.length;
    expect((await runDueChecks(NOW, { checks, dry: true })).map((x) => x.id)).toEqual(["t-dry-a", "t-dry-b"]);
    expect(sent.length).toBe(before);
    expect(db.db().prepare("SELECT COUNT(*) AS n FROM ops_checks WHERE id LIKE 't-dry-%'").get()).toEqual({ n: 0 });
    expect((await runDueChecks(NOW, { checks, only: "t-dry-b" })).map((x) => [x.id, x.ok])).toEqual([["t-dry-b", false]]);
    expect(runs).toBe(3);
    expect(sent.length).toBe(before + 1);
  });

  it("the list: unique ids, each with a title and a due time; the admin view reads it", () => {
    const ids = OPS_CHECKS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(["102-pack-593", "101-single-week"]));
    for (const c of OPS_CHECKS) { expect(c.title.length).toBeGreaterThan(4); expect(Number.isFinite(c.due)).toBe(true); }
    expect(checkStates().map((c) => c.id)).toEqual(ids);
  });
});

describe("定时核对：试跑不寄信；记忆复查只给数字", () => {
  it("?dry=1 never sends 112's test letters — it says what it would send", async () => {
    const c = OPS_CHECKS.find((x) => x.id === "112-test-letters")!;
    const before = sent.length;
    const r = await runDueChecks(NOW, { dry: true, checks: [c] });
    expect(sent.length).toBe(before);
    expect(r[0]!.lines.join("\n")).toContain("试跑：没寄");
  });
  it("memory-recheck-1026: the guards' counts and the reminder to ask a session — never a reader's words", async () => {
    const since = Date.now() - 60_000;
    db.recordOps("echo_light", "zh-hant 你說過的那句原話在這裡");
    db.recordOps("stale_deep", "zh-hant 這幾天不要再送東西");
    db.recordOps("stale_deep", "zh-hant 另一句");
    const r = await memoryRecheckDue(since, Date.now() + 60_000);
    expect("ok" in r && r.ok).toBe(false);
    const text = ("lines" in r ? r.lines ?? [] : []).join("\n");
    expect(text).toContain("做记忆复查");
    expect(text).toContain("轻解读引原话 1");
    expect(text).toContain("深断把旧记录当现在 2");
    expect(text).not.toContain("原話");
    expect(text).not.toContain("送東西");
    expect(OPS_CHECKS.map((x) => x.id)).toContain("memory-recheck-1026");
  });
});

describe("定时核对：两项具体的", () => {
  it("101: paid single readings through Stripe since a moment — passes, gifts, memberships and test customers do not count", async () => {
    const since = Date.now() - 60_000;
    const real = db.upsertCustomer("chk-single@example.com", "zh-hant");
    const tester = db.upsertCustomer("chk-tester@example.com", "zh-hant");
    db.db().prepare("UPDATE customers SET test_flag = 1 WHERE id = ?").run(tester);
    db.recordOrder({ sessionId: "cs_chk_deep_1", customerId: real, castId: null, tier: "deep", amountCents: 7500, currency: "TWD", email: null, status: "paid" });
    db.recordOrder({ sessionId: "pi_chk_one_1", customerId: real, castId: null, tier: "one", amountCents: 7500, currency: "TWD", email: null, status: "paid" });
    db.recordOrder({ sessionId: "cs_chk_pass_1", customerId: real, castId: null, tier: "pass_1", amountCents: 9900, currency: "TWD", email: null, status: "paid" });
    db.recordOrder({ sessionId: "cs_chk_test_1", customerId: tester, castId: null, tier: "deep", amountCents: 7500, currency: "TWD", email: null, status: "paid" });
    db.recordOrder({ sessionId: "gf_chk_gift_1", customerId: real, castId: null, tier: "deep", amountCents: 7500, currency: "TWD", email: null, status: "paid" });
    db.recordOrder({ sessionId: "sub_chk_mem_1", customerId: real, castId: null, tier: "deep", amountCents: 0, currency: "TWD", email: null, status: "paid" });
    db.recordOps("single_retired", "deep direct guest");
    const r = await singleSalesSince(since, Date.now() + 60_000);
    expect("ok" in r && r.ok).toBe(false);
    if (!("ok" in r)) throw new Error("not done");
    expect(r.lines[0]).toContain("单买 2 单");
    expect(r.lines.filter((l) => l.startsWith("· 订单"))).toHaveLength(2);
    expect(r.lines.at(-1)).toContain("1 次");
    // and none in an empty window
    const none = await singleSalesSince(Date.now() + 10 * 60_000, Date.now() + 20 * 60_000);
    expect(none).toMatchObject({ ok: true });
  });

  it("102: the first renewal after the conversion is billed the fee less the credit — draft or unpaid is tried again", async () => {
    const cid = db.upsertCustomer("chk-pack@example.com", "zh-hant");
    const now = Date.now();
    db.upsertSubscription({ customerId: cid, stripeCustomerId: "cus_chkpack", stripeSubscriptionId: "sub_chkpack", status: "active", plan: "month", periodStart: now - 30 * 86_400_000, periodEnd: now + 2 * 86_400_000, cancelAtPeriodEnd: false, currency: "TWD", amountMinor: 26900 });
    db.recordPack({ customerId: cid, sessionId: "cs_chkpack", paymentIntent: "pi_chkpack", units: 15, currency: "TWD", amountMinor: 69900 });
    db.markPackConverted(db.packsForCustomer(cid)[0]!.id, { units: 4, how: "balance", minor: 18600 });
    const inv = (over: Partial<import("../src/lib/stripe").InvoiceAmounts>) => ({ id: "in_chk", created: now + 3 * 86_400_000, status: "paid", billingReason: "subscription_cycle", currency: "twd", total: 26900, startingBalance: -18600, amountDue: 8300, amountPaid: 8300, ...over });

    stripeState.invoices = [];
    expect(await packCreditInvoice(cid, 8300)).toMatchObject({ retry: "续费帐单还没出来" });
    stripeState.invoices = [inv({ status: "draft" })];
    expect(await packCreditInvoice(cid, 8300)).toHaveProperty("retry");
    stripeState.invoices = [inv({ status: "open", amountPaid: 0 })];
    expect(await packCreditInvoice(cid, 8300)).toHaveProperty("retry");
    stripeState.invoices = [inv({})];
    stripeState.balance = 0;
    const ok = await packCreditInvoice(cid, 8300);
    expect(ok).toMatchObject({ ok: true });
    if (!("ok" in ok)) throw new Error("not done");
    expect(ok.lines[0]).toContain("应付 NT$83");
    expect(ok.lines.join("\n")).toContain("余额已抵完");
    // charged the full fee: the balance was not used — that needs a look
    stripeState.invoices = [inv({ startingBalance: 0, amountDue: 26900, amountPaid: 26900 })];
    expect(await packCreditInvoice(cid, 8300)).toMatchObject({ ok: false });
  });
});
