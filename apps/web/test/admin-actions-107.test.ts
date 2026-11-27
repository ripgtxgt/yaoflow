import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { LineValue } from "@yaoflow/engine";

/**
 * 10-23 进度表 107 ②④ 客户页动作: 补通卡、延期、存会员费抵扣、退款（全额／部分）、重寄信、标测试、备注 — each needs a reason
 * and the box ticked, money the amount typed twice; every try is written to admin_actions. Stripe (fetch) and the mail
 * sender are stubbed — no money moves and no letter leaves.
 */
const sent: { to: string | string[]; subject: string; kind: string }[] = [];
vi.mock("../src/lib/email", async (orig) => {
  const real = await orig<typeof import("../src/lib/email")>();
  return {
    ...real,
    sendEmail: vi.fn(async (to: string | string[], subject: string, _html: string, _text: string, opts: { kind: string }) => {
      sent.push({ to, subject, kind: opts.kind });
      return { ok: true, id: `re_107_${sent.length}` };
    }),
  };
});

process.env.STRIPE_SECRET_KEY = "sk_test_107";
process.env.ADMIN_KEY = "admin-key-107";
process.env.SITE_URL = "https://yaoflow.com";
const stripe: { path: string; body: URLSearchParams }[] = [];
let stripeRefuses = false;
vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: { body?: string }) => {
  const path = String(url).replace("https://api.stripe.com/v1", "");
  const body = new URLSearchParams(init?.body ?? "");
  stripe.push({ path, body });
  if (stripeRefuses) return new Response(JSON.stringify({ error: { message: "charge_already_refunded" } }), { status: 400 });
  if (path === "/refunds") return Response.json({ id: `re_stripe_${stripe.length}`, status: "succeeded", amount: Number(body.get("amount") ?? 0) });
  if (path.endsWith("/balance_transactions")) return Response.json({ id: `cbtxn_${stripe.length}`, amount: Number(body.get("amount")), currency: body.get("currency"), ending_balance: Number(body.get("amount")) });
  if (path.startsWith("/subscriptions/")) return Response.json({ id: path.slice(15), status: "trialing" });
  return new Response("{}", { status: 404 });
}));

const { db, upsertCustomer, upsertSubscription, recordOrder, orderBySession, saveCast, scheduleRevisit, revisitById } = await import("../src/lib/db");
const { grantPass, extend, credit, refund, resend, setTestFlag, actionsFor, recentActions, logAction, toMinor, endNow } = await import("../src/lib/admin-actions");
const { resolveServerChart } = await import("../src/lib/reading");
const { POST } = await import("../src/app/api/admin/action/route");
const { POST: mergePost } = await import("../src/app/api/admin/merge-customer/route");

const DAY = 86_400_000;
const NOW = Date.now();
const cid = upsertCustomer("ops107@example.com", "zh-hant");
const other = upsertCustomer("ops107-other@example.com", "zh");

function post(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries({ key: "admin-key-107", ...fields })) f.set(k, v);
  return POST(new NextRequest("http://localhost/api/admin/action", { method: "POST", body: f }));
}
const result = (r: Response) => { const u = new URL(r.headers.get("location")!); return { done: u.searchParams.get("done"), failed: u.searchParams.get("failed"), id: Number(u.searchParams.get("action")) || null, hash: u.hash }; };

describe("金额换算", () => {
  it("toMinor: cents for most, none for yen and won; nothing for nonsense", () => {
    expect(toMinor("83", "TWD")).toBe(8300);
    expect(toMinor("18.5", "USD")).toBe(1850);
    expect(toMinor("1,200", "JPY")).toBe(1200);
    expect(toMinor("0", "USD")).toBeNull();
    expect(toMinor("abc", "USD")).toBeNull();
    expect(toMinor("1.234", "USD")).toBeNull();
  });
});

describe("补通卡", () => {
  it("from now: a pass_comp_ row, no money, active for the days given", () => {
    const r = grantPass(cid, 7, "now", NOW);
    expect(r.ok).toBe(true);
    const row = db().prepare("SELECT * FROM subscriptions WHERE customer_id = ? AND substr(stripe_subscription_id, 1, 10) = 'pass_comp_'").get(cid) as { status: string; period_start: number; period_end: number; amount_minor: number; pass_days: number };
    expect(row).toMatchObject({ status: "active", amount_minor: 0, pass_days: 7 });
    expect(row.period_end - row.period_start).toBe(7 * DAY);
  });
  it("after the one they hold: it waits (scheduled) and starts when that one ends", () => {
    const running = db().prepare("SELECT period_end AS pe FROM subscriptions WHERE customer_id = ? AND status = 'active' ORDER BY period_end DESC LIMIT 1").get(cid) as { pe: number };
    const r = grantPass(cid, 1, "after", NOW);
    expect(r.ok).toBe(true);
    const row = db().prepare("SELECT * FROM subscriptions WHERE customer_id = ? AND status = 'scheduled'").get(cid) as { period_start: number; period_end: number };
    expect(row.period_start).toBe(running.pe);
    expect(row.period_end).toBe(running.pe + DAY);
  });
});

describe("延期", () => {
  it("a pass: the end moves; an ended one opens again", () => {
    const s = upsertSubscription({ customerId: cid, stripeCustomerId: null, stripeSubscriptionId: "pass_ext107xyz", status: "expired", plan: "month", periodStart: NOW - 3 * DAY, periodEnd: NOW - DAY, cancelAtPeriodEnd: true, passDays: 1, amountMinor: 2500, currency: "TWD" });
    return extend(cid, s.id, 3, NOW).then((r) => {
      expect(r.ok).toBe(true);
      const row = db().prepare("SELECT status, period_end FROM subscriptions WHERE id = ?").get(s.id) as { status: string; period_end: number };
      expect(row).toMatchObject({ status: "active", period_end: NOW + 2 * DAY });
    });
  });
  it("a paying membership: through Stripe — no charge until the new date (trial_end), no proration", async () => {
    const s = upsertSubscription({ customerId: cid, stripeCustomerId: "cus_ops107", stripeSubscriptionId: "sub_ops107", status: "active", plan: "month", periodStart: NOW - 10 * DAY, periodEnd: NOW + 20 * DAY, cancelAtPeriodEnd: false, currency: "TWD", amountMinor: 26900 });
    const r = await extend(cid, s.id, 5, NOW);
    expect(r.ok && r.stripeRef).toBe("sub_ops107");
    const call = stripe.find((c) => c.path === "/subscriptions/sub_ops107")!;
    expect(Number(call.body.get("trial_end"))).toBe(Math.floor((NOW + 25 * DAY) / 1000));
    expect(call.body.get("proration_behavior")).toBe("none");
    expect((db().prepare("SELECT period_end FROM subscriptions WHERE id = ?").get(s.id) as { period_end: number }).period_end).toBe(NOW + 25 * DAY);
  });
  it("someone else's row, or more than 90 days: refused", async () => {
    const s = db().prepare("SELECT id FROM subscriptions WHERE stripe_subscription_id = 'sub_ops107'").get() as { id: number };
    expect((await extend(other, s.id, 3, NOW)).ok).toBe(false);
    expect((await extend(cid, s.id, 120, NOW)).ok).toBe(false);
  });
});

describe("存会员费抵扣", () => {
  it("a negative balance transaction in the membership's own currency", async () => {
    const s = db().prepare("SELECT id FROM subscriptions WHERE stripe_subscription_id = 'sub_ops107'").get() as { id: number };
    const r = await credit(cid, s.id, "83", "102 增购包折算");
    expect(r.ok).toBe(true);
    const call = stripe.find((c) => c.path === "/customers/cus_ops107/balance_transactions")!;
    expect(call.body.get("amount")).toBe("-8300");
    expect(call.body.get("currency")).toBe("twd");
    expect(r.ok && r.stripeRef).toMatch(/^cbtxn_/);
  });
  it("only on a paying membership", async () => {
    const pass = db().prepare("SELECT id FROM subscriptions WHERE stripe_subscription_id = 'pass_ext107xyz'").get() as { id: number };
    expect((await credit(cid, pass.id, "10", "x")).ok).toBe(false);
  });
});

describe("退款", () => {
  recordOrder({ sessionId: "cs_ops107_full", customerId: cid, castId: null, tier: "pass_1d", amountCents: 9900, currency: "TWD", email: "ops107@example.com", status: "paid", paymentIntent: "pi_ops107full" });
  recordOrder({ sessionId: "cs_ops107_part", customerId: cid, castId: null, tier: "pass_7d", amountCents: 29900, currency: "TWD", email: "ops107@example.com", status: "paid", paymentIntent: "pi_ops107part" });

  it("a part: Stripe refunds that much, the order stays paid, the reader hears in their language", async () => {
    sent.length = 0;
    const r = await refund(cid, "cs_ops107_part", "100", "requested");
    expect(r.ok).toBe(true);
    const call = stripe.filter((c) => c.path === "/refunds").at(-1)!;
    expect(call.body.get("payment_intent")).toBe("pi_ops107part");
    expect(call.body.get("amount")).toBe("10000");
    expect(orderBySession("cs_ops107_part")!.payment_state).toBe("paid");
    expect(sent.find((m) => m.kind === "refund")?.subject).toMatch(/[一-鿿]/);
  });
  it("more than was paid, or someone else's order: refused before Stripe", async () => {
    const before = stripe.length;
    expect((await refund(cid, "cs_ops107_part", "999", "requested")).ok).toBe(false);
    expect((await refund(other, "cs_ops107_full", null, "requested")).ok).toBe(false);
    expect(stripe.length).toBe(before);
  });
  it("all of it: refunded, marked, told", async () => {
    const r = await refund(cid, "cs_ops107_full", null, "technical_failure");
    expect(r.ok).toBe(true);
    expect(orderBySession("cs_ops107_full")!.payment_state).toBe("refunded");
    expect((await refund(cid, "cs_ops107_full", null, "requested")).ok).toBe(false); // nothing left to refund
  });
});

describe("重寄信、标测试", () => {
  it("a revisit letter again (a queued one is then counted as sent); someone else's: refused", async () => {
    const V: LineValue[] = [7, 8, 9, 8, 7, 8];
    const chart = resolveServerChart({ question: "工作會不會有變動", values: V, castAtMs: NOW - 20 * DAY, tzOffsetMinutes: 480 }, true) as unknown as Record<string, unknown>;
    const castId = saveCast({ customerId: cid, castAtMs: NOW - 20 * DAY, tzOffsetMinutes: 480, locale: "zh-hant", question: "工作會不會有變動", topic: "career", values: V, chart });
    recordOrder({ sessionId: "cs_ops107_rv", customerId: cid, castId, tier: "deep", amountCents: 0, currency: "TWD", email: "ops107@example.com", status: "paid" });
    scheduleRevisit({ sessionId: "cs_ops107_rv", castId, customerId: cid, email: "ops107@example.com", locale: "zh-hant", tier: "deep", castAtMs: NOW - 20 * DAY, windowDays: 10, timingQuote: null });
    const rv = db().prepare("SELECT id FROM revisits WHERE session_id = 'cs_ops107_rv'").get() as { id: number };
    sent.length = 0;
    const r = await resend(cid, "revisit", String(rv.id), "https://yaoflow.com", NOW);
    expect(r.ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "ops107@example.com", kind: "revisit" });
    expect(revisitById(rv.id)!.status).toBe("sent");
    expect((await resend(other, "revisit", String(rv.id), "https://yaoflow.com", NOW)).ok).toBe(false);
  });
  it("the opening letter of a pass again", async () => {
    const s = db().prepare("SELECT * FROM subscriptions WHERE stripe_subscription_id = 'pass_ext107xyz'").get() as { id: number };
    sent.length = 0;
    const r = await resend(cid, "welcome", String(s.id), "https://yaoflow.com", NOW);
    expect(r.ok).toBe(true);
    expect(sent[0]).toMatchObject({ to: "ops107@example.com", kind: "sub_welcome" });
  });
  it("test flag on and off", () => {
    expect(setTestFlag(other, true).ok).toBe(true);
    expect((db().prepare("SELECT test_flag AS t FROM customers WHERE id = ?").get(other) as { t: number }).t).toBe(1);
    setTestFlag(other, false);
    expect((db().prepare("SELECT test_flag AS t FROM customers WHERE id = ?").get(other) as { t: number }).t).toBe(0);
  });
});

describe("按钮（/api/admin/action）：理由、确认、金额打两次，每次都记下", () => {
  it("not the admin: refused", async () => {
    const f = new FormData();
    f.set("customer_id", String(cid)); f.set("action", "note"); f.set("reason", "x x"); f.set("confirm", "yes");
    const r = await POST(new NextRequest("http://localhost/api/admin/action", { method: "POST", body: f }));
    expect(r.status).toBe(403);
  });
  it("no reason, no tick, an unknown action, an unknown customer: back with why, nothing done", async () => {
    const before = recentActions(1000).length;
    expect(result(await post({ customer_id: String(cid), action: "grant_pass", days: "1", start: "now", reason: "", confirm: "yes" })).failed).toMatch(/理由/);
    expect(result(await post({ customer_id: String(cid), action: "grant_pass", days: "1", start: "now", reason: "补偿" })).failed).toMatch(/确认/);
    expect(result(await post({ customer_id: String(cid), action: "wipe", reason: "补偿", confirm: "yes" })).failed).toMatch(/不认得/);
    expect(result(await post({ customer_id: "999999", action: "note", reason: "补偿", confirm: "yes" })).failed).toMatch(/找不到/);
    expect(recentActions(1000).length).toBe(before);
  });
  it("money typed twice must match; a full refund's second amount is the order's own", async () => {
    const s = db().prepare("SELECT id FROM subscriptions WHERE stripe_subscription_id = 'sub_ops107'").get() as { id: number };
    const bad = result(await post({ customer_id: String(cid), action: "credit", sub_id: String(s.id), amount: "83", confirm_amount: "38", reason: "补偿", confirm: "yes" }));
    expect(bad.failed).toMatch(/对不上/);
    const good = result(await post({ customer_id: String(cid), action: "credit", sub_id: String(s.id), amount: "83", confirm_amount: "83", reason: "102 折算", confirm: "yes" }));
    expect(good.done).toMatch(/存入/);
    expect(good.hash).toBe("#ops");
    const row = actionsFor(cid).find((a) => a.id === good.id)!;
    expect(row).toMatchObject({ action: "credit", reason: "102 折算", ok: 1, actor: "admin" });
    expect(row.stripe_ref).toMatch(/^cbtxn_/);
    expect(JSON.parse(row.params_json)).toMatchObject({ sub_id: String(s.id), amount: "83" });

    recordOrder({ sessionId: "cs_ops107_btn", customerId: cid, castId: null, tier: "pass_1d", amountCents: 9900, currency: "TWD", email: "ops107@example.com", status: "paid", paymentIntent: "pi_ops107btn" });
    expect(result(await post({ customer_id: String(cid), action: "refund", session_id: "cs_ops107_btn", confirm_amount: "98", reason_code: "requested", reason: "读者要求", confirm: "yes" })).failed).toMatch(/对不上/);
    const ok = result(await post({ customer_id: String(cid), action: "refund", session_id: "cs_ops107_btn", confirm_amount: "99", reason_code: "requested", reason: "读者要求", confirm: "yes" }));
    expect(ok.done).toMatch(/全额退款/);
  });
  it("Stripe saying no is written down too, as not done", async () => {
    stripeRefuses = true;
    const s = db().prepare("SELECT id FROM subscriptions WHERE stripe_subscription_id = 'sub_ops107'").get() as { id: number };
    const r = result(await post({ customer_id: String(cid), action: "extend", sub_id: String(s.id), days: "2", reason: "延两天", confirm: "yes" }));
    stripeRefuses = false;
    expect(r.failed).toMatch(/没做成/);
    expect(actionsFor(cid).find((a) => a.id === r.id)).toMatchObject({ action: "extend", ok: 0 });
  });
  it("补通卡 / 重寄 / 标测试 / 备注 through the button; resend takes 「kind:ref」", async () => {
    expect(result(await post({ customer_id: String(other), action: "grant_pass", days: "30", start: "now", reason: "客服补偿", confirm: "yes" })).done).toMatch(/30 天通卡/);
    expect(result(await post({ customer_id: String(other), action: "grant_pass", days: "3", start: "now", reason: "客服补偿", confirm: "yes" })).failed).toMatch(/1／7／30/);
    const s = db().prepare("SELECT id FROM subscriptions WHERE customer_id = ? ORDER BY id DESC LIMIT 1").get(other) as { id: number };
    expect(result(await post({ customer_id: String(other), action: "resend", ref: `welcome:${s.id}`, reason: "读者说没收到", confirm: "yes" })).done).toMatch(/开通信/);
    expect(result(await post({ customer_id: String(other), action: "test_flag", on: "1", reason: "我们自己的帐号", confirm: "yes" })).done).toMatch(/测试/);
    setTestFlag(other, false);
    expect(result(await post({ customer_id: String(other), action: "note", reason: "来信问能不能换成会员", confirm: "yes" })).done).toMatch(/记下/);
    expect(actionsFor(other).map((a) => a.action)).toEqual(["note", "test_flag", "resend", "grant_pass", "grant_pass"]);
  });
  it("10-23 立即结束: a disputed year membership ends in Stripe now (no proration, no invoice), the row reads ended; then 删除 goes through — before, it refused with a bare JSON page", async () => {
    const who = upsertCustomer("ops107-dispute@example.com", "zh-hant");
    const s = upsertSubscription({ customerId: who, stripeCustomerId: "cus_ops107d", stripeSubscriptionId: "sub_ops107dispute", status: "active", plan: "year", periodStart: NOW - 30 * DAY, periodEnd: NOW + 335 * DAY, cancelAtPeriodEnd: true, currency: "USD", amountMinor: 7900 });
    db().prepare("UPDATE subscriptions SET refunded_at = ? WHERE id = ?").run(NOW - 10 * DAY, s.id);
    const { POST: erasePost } = await import("../src/app/api/admin/erase/route");
    const erase = () => {
      const f = new FormData();
      f.set("key", "admin-key-107"); f.set("customer_id", String(who)); f.set("confirm", "ops107-dispute@example.com");
      return erasePost(new NextRequest("http://localhost:3201/api/admin/erase", { method: "POST", body: f }));
    };
    // refused, in words, back on the customer page (not a JSON page)
    const no = await erase();
    expect(no.status).toBe(303);
    const loc = new URL(no.headers.get("location")!);
    expect(loc.origin).toBe("https://yaoflow.com");
    expect(loc.pathname).toBe(`/admin/customers/${who}`);
    expect(loc.searchParams.get("failed")).toMatch(/年付，到 .+立即结束会员／通卡/);
    // the button: Stripe cancels now — no proration credit, no final invoice
    const r = result(await post({ customer_id: String(who), action: "end_now", sub_id: String(s.id), reason: "争议输掉，钱已退回", confirm: "yes" }));
    expect(r.done).toMatch(/立即结束会员／通卡：会员已在 Stripe 立即结束/);
    const call = stripe.filter((c) => c.path.startsWith("/subscriptions/sub_ops107dispute")).at(-1)!;
    expect(call.path).toContain("invoice_now=false");
    expect(call.path).toContain("prorate=false");
    expect(db().prepare("SELECT status FROM subscriptions WHERE id = ?").get(s.id)).toEqual({ status: "canceled" });
    expect(actionsFor(who)[0]).toMatchObject({ action: "end_now", ok: 1, reason: "争议输掉，钱已退回", stripe_ref: "sub_ops107dispute" });
    // ended twice: refused; a pass ends here without Stripe, and never blocks 删除
    expect((await endNow(who, s.id)).ok).toBe(false);
    const p = upsertSubscription({ customerId: who, stripeCustomerId: null, stripeSubscriptionId: "pass_ops107end", status: "active", plan: "month", periodStart: NOW - DAY, periodEnd: NOW + 6 * DAY, cancelAtPeriodEnd: true, passDays: 7, amountMinor: 19900, currency: "TWD" });
    const before = stripe.length;
    expect(await endNow(who, p.id)).toMatchObject({ ok: true, result: "通卡已结束，权益到此为止" });
    expect(stripe.length).toBe(before);
    db().prepare("UPDATE subscriptions SET status = 'active', period_end = ? WHERE id = ?").run(NOW + 6 * DAY, p.id);
    const yes = await erase();
    expect(new URL(yes.headers.get("location")!).searchParams.get("erased")).toBe(String(who));
  });
  it("合并帐号 is written to 操作记录 too, and the log follows the account it went into", async () => {
    const a = upsertCustomer("ops107-merge-a@example.com", "zh-hant");
    const b = upsertCustomer("ops107-merge-b@example.com", "zh-hant");
    logAction({ customerId: b, action: "note", reason: "合并前的备注", ok: true, result: "已记下" });
    const f = new FormData();
    f.set("key", "admin-key-107"); f.set("a", String(a)); f.set("b", String(b)); f.set("dir", "in"); f.set("reason", "同一个人两个信箱"); f.set("sure", "1");
    const r = await mergePost(new NextRequest("http://localhost/api/admin/merge-customer", { method: "POST", body: f }));
    expect(r.status).toBe(303);
    const log = actionsFor(a);
    expect(log.find((x) => x.action === "merge")).toMatchObject({ ok: 1, reason: "同一个人两个信箱" });
    expect(log.some((x) => x.reason === "合并前的备注")).toBe(true);
  });
});
