import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * 10-24 (Neil: 「然后续费为什么没有发邮件呢」): Stripe mails members nothing when a renewal is charged, so we do — once per
 * period, after the bill is paid (Stripe charges about an hour after the period turns over), with what was charged, the
 * receipt page and the next renewal. Not for a first period, not while the bill is still open, not for a period that
 * already had the 扣款失败／补缴成功 letters, never twice. Stripe (fetch) and the sender are stubbed.
 */
const sent: { to: string | string[]; subject: string; html: string; text: string; kind: string }[] = [];
vi.mock("../src/lib/email", async (orig) => {
  const real = await orig<typeof import("../src/lib/email")>();
  return {
    ...real,
    sendEmail: vi.fn(async (to: string | string[], subject: string, html: string, text: string, opts: { kind: string }) => {
      sent.push({ to, subject, html, text, kind: opts.kind });
      return { ok: true, id: `re_1024_${sent.length}` };
    }),
  };
});
process.env.STRIPE_SECRET_KEY = "sk_test_1024";
process.env.SITE_URL = "https://yaoflow.com";

const DAY = 86_400_000;
const NOW = Date.now();
const sec = (ms: number) => Math.floor(ms / 1000);
const START = NOW - 2 * 3_600_000; // the period turned over two hours ago
const bills: Record<string, Record<string, unknown>[]> = {};
const asked: string[] = [];
vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
  const path = String(url).replace("https://api.stripe.com/v1", "");
  const m = path.match(/^\/invoices\?subscription=(sub_[A-Za-z0-9]+)&limit=5$/);
  if (m) { asked.push(m[1]!); return Response.json({ data: bills[m[1]!] ?? [] }); }
  return new Response("{}", { status: 404 });
}));

const { upsertCustomer, upsertSubscription, recordEmail, db } = await import("../src/lib/db");
const { runRenewalReceipts, buildSubLetter } = await import("../src/lib/sub-letters");
const { setLetterOn, resetLetterSwitches } = await import("../src/lib/letter-switch");

const bill = (over: Record<string, unknown> = {}) => ({
  id: "in_x", billing_reason: "subscription_cycle", status: "paid", created: sec(START + 60_000), total: 34900, amount_paid: 34900, currency: "twd",
  hosted_invoice_url: "https://invoice.stripe.com/i/test_renewed", status_transitions: { paid_at: sec(START + 3_700_000) }, ...over,
});
function member(sid: string, email: string, i: { createdAt?: number; periodStart?: number; locale?: string } = {}) {
  const cid = upsertCustomer(email, i.locale ?? "zh-hant");
  upsertSubscription({ customerId: cid, stripeCustomerId: `cus_${sid}`, stripeSubscriptionId: sid, status: "active", plan: "month", periodStart: i.periodStart ?? START, periodEnd: (i.periodStart ?? START) + 30 * DAY, cancelAtPeriodEnd: false, currency: "twd", amountMinor: 34900 });
  db().prepare("UPDATE subscriptions SET created_at = ? WHERE stripe_subscription_id = ?").run(i.createdAt ?? NOW - 40 * DAY, sid);
  return cid;
}
const to = (email: string) => sent.filter((x) => x.to === email && x.kind === "sub_renewed");

beforeEach(() => { sent.length = 0; asked.length = 0; resetLetterSwitches(); setLetterOn("sub_renewed", true); });

describe("续费成功：扣款成功后寄一封，一期一封", () => {
  it("a paid renewal gets the letter: what was charged, the receipt, the next renewal — and only once", async () => {
    member("sub_rn1", "rn1@reader1024.net");
    bills.sub_rn1 = [bill()];
    const r = await runRenewalReceipts(NOW);
    expect(r.sent).toBeGreaterThanOrEqual(1);
    const m = to("rn1@reader1024.net");
    expect(m).toHaveLength(1);
    expect(m[0]!.subject).toBe("會員已續訂 · 已扣款 NT$349");
    expect(m[0]!.text).toContain("會費已經扣款（NT$349）");
    expect(m[0]!.text).toContain("https://invoice.stripe.com/i/test_renewed");
    expect(m[0]!.text).toContain("之後每月同一天續訂");
    expect(m[0]!.text).not.toMatch(/\{\w+\}/);
    sent.length = 0;
    await runRenewalReceipts(NOW + 10 * 60_000);
    expect(to("rn1@reader1024.net")).toHaveLength(0);
  });

  it("waits while Stripe has not charged yet, then sends once it has", async () => {
    member("sub_rn2", "rn2@reader1024.net");
    bills.sub_rn2 = [bill({ status: "open", amount_paid: 0, status_transitions: {} })];
    await runRenewalReceipts(NOW);
    expect(to("rn2@reader1024.net")).toHaveLength(0);
    bills.sub_rn2 = [bill()];
    await runRenewalReceipts(NOW + 10 * 60_000);
    expect(to("rn2@reader1024.net")).toHaveLength(1);
  });

  it("not a first period, not a period the 扣款失败 letters already told, not a pass or a gift", async () => {
    member("sub_rn3", "rn3@reader1024.net", { createdAt: START }); // the period began when it was made
    bills.sub_rn3 = [bill()];
    member("sub_rn4", "rn4@reader1024.net");
    bills.sub_rn4 = [bill()];
    recordEmail(`sub-payfail:sub_rn4:${START + 30 * DAY}`, "sub_payfail", "rn4@reader1024.net", "sent", "re_x");
    await runRenewalReceipts(NOW);
    expect(to("rn3@reader1024.net")).toHaveLength(0);
    expect(to("rn4@reader1024.net")).toHaveLength(0);
    expect(asked).not.toContain("sub_rn3");
    expect(asked).not.toContain("sub_rn4");
  });

  it("paid from the account balance: says so, and that the card was not charged", async () => {
    member("sub_rn5", "rn5@reader1024.net");
    bills.sub_rn5 = [bill({ amount_paid: 0 })];
    await runRenewalReceipts(NOW);
    const m = to("rn5@reader1024.net");
    expect(m).toHaveLength(1);
    expect(m[0]!.subject).toBe("會員已續訂 · 這期用帳戶餘額抵扣");
    expect(m[0]!.text).toContain("這次沒有刷卡");
  });

  it("a voided bill is written down and not asked about again", async () => {
    member("sub_rn6", "rn6@reader1024.net");
    bills.sub_rn6 = [bill({ status: "void" })];
    await runRenewalReceipts(NOW);
    expect(to("rn6@reader1024.net")).toHaveLength(0);
    asked.length = 0;
    await runRenewalReceipts(NOW + 10 * 60_000);
    expect(asked).not.toContain("sub_rn6");
  });

  it("off on /admin/letters: nothing is sent and Stripe is not asked", async () => {
    member("sub_rn7", "rn7@reader1024.net");
    bills.sub_rn7 = [bill()];
    setLetterOn("sub_renewed", false);
    await runRenewalReceipts(NOW);
    expect(to("rn7@reader1024.net")).toHaveLength(0);
    expect(asked).toHaveLength(0);
  });

  it("every language: the letter fills in, and an ending membership is not told when it renews next", () => {
    const row = { id: 1, customer_id: 1, stripe_customer_id: "cus_x", stripe_subscription_id: "sub_x", status: "active", plan: "year", period_start: START, period_end: START + 365 * DAY,
      cancel_at_period_end: 0, created_at: NOW - 400 * DAY, updated_at: NOW, synced_at: NOW, currency: "usd", amount_minor: 4990 };
    const renewal = { id: "in_x", total: 4990, paid: 3990, currency: "usd", at: START, hosted: "https://invoice.stripe.com/i/x" };
    for (const l of ["zh-hant", "zh", "en", "ja", "ko", "fr", "de", "es", "pt"] as const) {
      const m = buildSubLetter("renewed", row, l, { renewal });
      expect(m.subject.length).toBeGreaterThan(5);
      expect(m.subject + m.text).not.toMatch(/\{\w+\}/);
      expect(m.text).toContain("https://invoice.stripe.com/i/x");
    }
    const ending = buildSubLetter("renewed", { ...row, cancel_at_period_end: 1 }, "zh-hant", { renewal });
    expect(ending.text).not.toContain("下次扣款");
    expect(ending.text).not.toContain("每年同一天續訂");
    expect(buildSubLetter("renewed", row, "zh-hant", { renewal }).text).toContain("已用帳戶餘額抵 US$10");
  });
});
