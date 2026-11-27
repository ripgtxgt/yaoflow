import { describe, expect, it, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";

/**
 * 10-23 进度表 111 ②: the refund letters and the support receipt.
 *   - a refund letter is in the reader's own language (a refund made in Stripe's dashboard came in Simplified to all);
 *   - a part of a payment says so, leaves the order paid, and is told once (our own button's letter is not repeated);
 *   - what became of what was paid for: a reading, a 通卡 (ended / carries on), a membership (ended / until / renews);
 *   - money back on a membership reaches the member, five minutes on, with the membership as it is then;
 *   - a reader's letter to support@ gets one receipt a day — not a directory, a robot, ourselves, or someone mid-conversation.
 * Stripe (fetch) and the mail sender are stubbed.
 */
const sent: { to: string | string[]; subject: string; html: string; text: string; kind: string }[] = [];
vi.mock("../src/lib/email", async (orig) => {
  const real = await orig<typeof import("../src/lib/email")>();
  return {
    ...real,
    sendEmail: vi.fn(async (to: string | string[], subject: string, html: string, text: string, opts: { kind: string }) => {
      sent.push({ to, subject, html, text, kind: opts.kind });
      return { ok: true, id: `re_r_${sent.length}` };
    }),
  };
});

process.env.STRIPE_SECRET_KEY = "sk_test_111r";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_111r";
process.env.ADMIN_KEY ??= "admin-key-111r";
process.env.SITE_URL = "https://yaoflow.com";

const DAY = 86_400_000;
const NOW = Date.now();
const sec = (ms: number) => Math.floor(ms / 1000);
const live: Record<string, Record<string, unknown>> = {};
vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: { method?: string; body?: string }) => {
  const path = String(url).replace("https://api.stripe.com/v1", "");
  const body = new URLSearchParams(init?.body ?? "");
  if (path === "/refunds") return Response.json({ id: "re_admin_1", status: "succeeded", amount: Number(body.get("amount") ?? 0), currency: "twd", payment_intent: body.get("payment_intent") });
  const m = path.match(/^\/subscriptions\/(sub_[A-Za-z0-9]+)$/);
  if (m && live[m[1]!]) return Response.json(live[m[1]!]);
  return new Response("{}", { status: 404 });
}));

const { db, upsertCustomer, upsertSubscription, recordOrder, orderBySession, setOrderPaymentIntent, logMailSent } = await import("../src/lib/db");
const { buildRefundEmail } = await import("../src/lib/email");
const { refundSession } = await import("../src/lib/refund");
const { runMemberRefundLetters, memberWhat, thisRefund } = await import("../src/lib/refund-letters");
const { refund } = await import("../src/lib/admin-actions");
const { ackLanguage, ackSkipReason, sendSupportAck } = await import("../src/lib/support-ack");
const { ensureInboxTable } = await import("../src/lib/inbound");
const { POST: webhook } = await import("../src/app/api/stripe/webhook/route");

async function deliver(type: string, obj: unknown, previous?: Record<string, unknown>) {
  const payload = JSON.stringify({ type, data: { object: obj, ...(previous ? { previous_attributes: previous } : {}) } });
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", "whsec_111r").update(`${t}.${payload}`).digest("hex");
  return webhook(new NextRequest("http://localhost/api/stripe/webhook", { method: "POST", body: payload, headers: { "stripe-signature": `t=${t},v1=${sig}` } }));
}
const refunds = () => sent.filter((m) => m.kind === "refund");
beforeEach(() => { sent.length = 0; });

describe("退款信的字句", () => {
  it("a part says the part, not 「全額」; a full refund of a reading keeps 「不必重新起」", () => {
    const part = buildRefundEmail({ locale: "zh-hant", amountLabel: "NT$100", reason: "other", partial: true });
    expect(part.text).toContain("這筆付款中的 NT$100");
    expect(part.text).not.toContain("全額");
    expect(part.text).not.toContain("不必重新起");
    const full = buildRefundEmail({ locale: "zh-hant", amountLabel: "NT$320", reason: "requested" });
    expect(full.text).toContain("全額退回");
    expect(full.text).toContain("不必重新起");
  });
  it("a 通卡 ends with a full refund and carries on after a part; a membership says ended / until / renews", () => {
    expect(buildRefundEmail({ locale: "zh-hant", amountLabel: "NT$149", reason: "requested", what: "pass_ended" }).text).toContain("通卡隨這次退款一起結束了");
    expect(buildRefundEmail({ locale: "zh", amountLabel: "¥20", reason: "other", partial: true, what: "pass_keeps", until: "10月30日" }).text).toContain("通卡照常用到 10月30日");
    expect(buildRefundEmail({ locale: "zh-hant", amountLabel: "NT$269", reason: "requested", what: "member_ended" }).text).toContain("會員已經結束");
    expect(buildRefundEmail({ locale: "zh-hant", amountLabel: "NT$269", reason: "requested", what: "member_until", until: "11月5日" }).text).toContain("會員照常用到 11月5日");
    expect(buildRefundEmail({ locale: "en", amountLabel: "US$8.99", reason: "requested", what: "member_renews", until: "Nov 5" }).text).toContain("next renewal is on Nov 5");
    // something else bought once: no line about a reading
    expect(buildRefundEmail({ locale: "zh-hant", amountLabel: "NT$1,190", reason: "requested", what: "other" }).text).not.toContain("不必重新起");
  });
  it("every language has the new lines with their placeholders", async () => {
    const { REFUND_EMAIL_T } = await import("../src/lib/dict/email");
    for (const [l, t] of Object.entries(REFUND_EMAIL_T)) {
      expect(t.leadPartial, l).toContain("{amount}");
      expect(t.leadPartial, l).toContain("{reason}");
      for (const k of ["passKeeps", "memberUntil", "memberRenews"] as const) expect(t[k], `${l}.${k}`).toContain("{until}");
      for (const k of ["passEnded", "memberEnded"] as const) expect(t[k], `${l}.${k}`).not.toMatch(/\{/);
    }
  });
});

describe("退款信用读者的语言", () => {
  it("a refund that arrives from Stripe (no language given) is written in the reader's own — not Simplified for everyone", async () => {
    const cid = upsertCustomer("hant-refund@example.com", "zh-hant");
    recordOrder({ sessionId: "cs_r111_hant", customerId: cid, castId: null, tier: "deep", amountCents: 32000, currency: "TWD", email: "hant-refund@example.com", status: "paid", paymentIntent: "pi_r111_hant" });
    expect((await refundSession({ sessionId: "cs_r111_hant", reason: "other", by: "stripe", alreadyRefunded: true })).ok).toBe(true);
    const m = refunds().at(-1)!;
    expect(m.subject).toContain("已退回");
    expect(m.text).toContain("全額退回");
    expect(m.text).toContain("不必重新起");
  });
  it("a refunded 通卡 says it ended", async () => {
    const cid = upsertCustomer("pass-refund@example.com", "zh-hant");
    recordOrder({ sessionId: "cs_r111_pass", customerId: cid, castId: null, tier: "pass_7d", amountCents: 64900, currency: "TWD", email: "pass-refund@example.com", status: "paid", paymentIntent: "pi_r111_pass" });
    await refundSession({ sessionId: "cs_r111_pass", reason: "requested", by: "admin" });
    expect(refunds().at(-1)!.text).toContain("通卡隨這次退款一起結束了");
  });
});

describe("部分退款：那一单仍算已付，读者只收一封", () => {
  it("from Stripe's dashboard: order stays paid, one letter with the part", async () => {
    const cid = upsertCustomer("part@example.com", "zh-hant");
    recordOrder({ sessionId: "cs_r111_part", customerId: cid, castId: null, tier: "deep", amountCents: 32000, currency: "TWD", email: "part@example.com", status: "paid", paymentIntent: "pi_r111_part" });
    const ch = { id: "ch_part", payment_intent: "pi_r111_part", amount: 32000, amount_refunded: 10000, currency: "twd", customer: null };
    await deliver("charge.refunded", ch, { amount_refunded: 0 });
    await deliver("charge.refunded", ch, { amount_refunded: 0 }); // Stripe delivers it twice
    expect(orderBySession("cs_r111_part")!.status).toBe("paid");
    expect(refunds()).toHaveLength(1);
    expect(refunds()[0]!.text).toContain("這筆付款中的 NT$100");
    // a second part later: its own amount, its own letter
    await deliver("charge.refunded", { ...ch, amount_refunded: 15000 }, { amount_refunded: 10000 });
    expect(refunds()).toHaveLength(2);
    expect(refunds()[1]!.text).toContain("NT$50");
  });
  it("from our own button: the button's letter, and the webhook after it stays quiet", async () => {
    const cid = upsertCustomer("own-part@example.com", "zh-hant");
    recordOrder({ sessionId: "cs_r111_own", customerId: cid, castId: null, tier: "deep", amountCents: 32000, currency: "TWD", email: "own-part@example.com", status: "paid", paymentIntent: "pi_r111_own" });
    setOrderPaymentIntent("cs_r111_own", "pi_r111_own");
    const r = await refund(cid, "cs_r111_own", "100", "requested");
    expect(r.ok).toBe(true);
    expect(refunds()).toHaveLength(1);
    expect(refunds()[0]!.text).toContain("這筆付款中的 NT$100");
    await deliver("charge.refunded", { id: "ch_own", payment_intent: "pi_r111_own", amount: 32000, amount_refunded: 10000, currency: "twd" }, { amount_refunded: 0 });
    expect(refunds()).toHaveLength(1);
    expect(orderBySession("cs_r111_own")!.status).toBe("paid");
  });
  it("thisRefund: what the event added, else everything refunded so far", () => {
    expect(thisRefund({ amount_refunded: 15000 }, { amount_refunded: 10000 })).toBe(5000);
    expect(thisRefund({ amount_refunded: 15000 }, null)).toBe(15000);
  });
});

describe("会员费退回：五分钟后照会员当时的状态寄", () => {
  it("queued by the webhook, sent by the run once five minutes have passed, saying until when", async () => {
    const cid = upsertCustomer("member-refund@example.com", "zh-hant");
    const end = NOW + 12 * DAY;
    upsertSubscription({ customerId: cid, stripeCustomerId: "cus_mr111", stripeSubscriptionId: "sub_mr111", status: "active", plan: "month", periodStart: end - 30 * DAY, periodEnd: end, cancelAtPeriodEnd: false, currency: "TWD", amountMinor: 26900 });
    db().prepare("UPDATE subscriptions SET created_at = ? WHERE stripe_subscription_id = 'sub_mr111'").run(NOW - 20 * DAY);
    // Neil cancels it in the same minute: Stripe now says it ends at the period end
    live.sub_mr111 = { id: "sub_mr111", customer: "cus_mr111", status: "active", cancel_at_period_end: true, cancel_at: sec(end), metadata: {}, items: { data: [{ price: { unit_amount: 26900, currency: "twd", recurring: { interval: "month" } }, current_period_start: sec(end - 30 * DAY), current_period_end: sec(end) }] } };
    await deliver("charge.refunded", { id: "ch_mr111", payment_intent: "pi_mr111", amount: 26900, amount_refunded: 26900, currency: "twd", customer: "cus_mr111", created: sec(NOW - 2 * DAY) }, { amount_refunded: 0 });
    expect(refunds()).toHaveLength(0);
    expect(await runMemberRefundLetters(NOW + 60_000)).toEqual({ sent: 0, failed: 0 }); // not yet
    expect(await runMemberRefundLetters(Date.now() + 6 * 60_000)).toEqual({ sent: 1, failed: 0 });
    const m = refunds().at(-1)!;
    expect(m.to).toBe("member-refund@example.com");
    expect(m.text).toContain("NT$269");
    expect(m.text).toContain("會員照常用到");
    expect(await runMemberRefundLetters(Date.now() + 7 * 60_000)).toEqual({ sent: 0, failed: 0 }); // once
  });
  it("memberWhat: ended / until / renews", () => {
    const base = { customer_id: 0, status: "active", period_end: NOW + 5 * DAY, cancel_at_period_end: 0, cancel_at: null } as never;
    expect(memberWhat({ ...(base as object), status: "canceled" } as never, "zh-hant", NOW).what).toBe("member_ended");
    expect(memberWhat({ ...(base as object), cancel_at_period_end: 1 } as never, "zh-hant", NOW).what).toBe("member_until");
    expect(memberWhat(base, "zh-hant", NOW).what).toBe("member_renews");
  });
});

describe("客服自动回执", () => {
  const row = (o: Partial<{ id: string; from_addr: string; kind: string | null; customer_id: number | null; subject: string; text: string }> = {}) => ({
    id: o.id ?? `in_${Math.random().toString(36).slice(2)}`, received_at: NOW, from_addr: o.from_addr ?? "reader@example.com", from_name: null, to_addrs: "support@yaoflow.com",
    subject: o.subject ?? "我付了款但沒收到", text: o.text ?? "請幫我看一下", html: null, auth: null, attachments: null, customer_id: o.customer_id ?? null, kind: o.kind ?? null,
    forwarded_at: NOW, forward_error: null, handled_at: null, handled_note: null,
  }) as never;
  const replies: { to: string; text: string; kind: string }[] = [];
  const send = async (r: { from_addr: string }, text: string, kind: string) => { replies.push({ to: r.from_addr, text, kind }); return { ok: true, id: `re_ack_${replies.length}` }; };

  it("who gets none: a directory, ourselves, a robot, bulk mail, someone we wrote to in the last two days", () => {
    ensureInboxTable();
    expect(ackSkipReason(row({ kind: "vendor" }), null)).toBe("vendor");
    expect(ackSkipReason(row({ from_addr: "neil@linedo.io" }), null)).toBe("ours");
    expect(ackSkipReason(row({ from_addr: "support@yaoflow.com" }), null)).toBe("ours");
    expect(ackSkipReason(row({ from_addr: "no-reply@shop.example" }), null)).toBe("robot");
    expect(ackSkipReason(row({ from_addr: "mailer-daemon@mx.example" }), null)).toBe("robot");
    expect(ackSkipReason(row({ from_addr: "news@letters.example" }), { "auto-submitted": "auto-generated" })).toBe("bulk");
    logMailSent({ id: "re_manual_111", kind: "support_manual", email: "talking@example.com", subject: "Re: 你好" });
    expect(ackSkipReason(row({ from_addr: "talking@example.com" }), null)).toBe("mid-conversation");
    expect(ackSkipReason(row(), null)).toBeNull();
  });
  it("one a day per address, in the reader's language", async () => {
    replies.length = 0;
    expect(await sendSupportAck(row({ from_addr: "ack1@example.com" }), send as never, null, NOW)).toBe("sent");
    expect(await sendSupportAck(row({ from_addr: "ack1@example.com" }), send as never, null, NOW + 3_600_000)).toBe("already");
    expect(await sendSupportAck(row({ from_addr: "ack1@example.com" }), send as never, null, NOW + DAY + 60_000)).toBe("sent");
    expect(replies).toHaveLength(2);
    expect(replies[0]!.text).toContain("您的來信我們收到了");
    expect(replies[0]!.kind).toBe("support_ack");
  });
  it("language: the account's, else the letter's own script", () => {
    expect(ackLanguage(row({ text: "我付了款但没收到解读，怎么办" }))).toBe("zh");
    expect(ackLanguage(row({ subject: "你好", text: "你好" }))).toBe("zh-hant");
    expect(ackLanguage(row({ subject: "Hello", text: "I paid but got nothing" }))).toBe("en");
    const cid = upsertCustomer("ack-hans@example.com", "zh");
    expect(ackLanguage(row({ customer_id: cid, subject: "Hi", text: "hello" }))).toBe("zh");
  });
  it("switched off: nothing", async () => {
    const { setLetterOn, resetLetterSwitches } = await import("../src/lib/letter-switch");
    setLetterOn("support_ack", false); resetLetterSwitches();
    try { expect(await sendSupportAck(row({ from_addr: "ack-off@example.com" }), send as never, null, NOW)).toBe("off"); }
    finally { setLetterOn("support_ack", true); resetLetterSwitches(); }
  });
});
