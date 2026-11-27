import { describe, expect, it, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";

/**
 * 10-23 进度表 111 ① ② / 110: the member hears what happened to their own membership — a renewal that failed (with
 * Stripe's page to pay that bill), paid after all, the end the retries led to, renewal back on (from the letter's link
 * or from Stripe's page — one letter between them), the month's pause; the review before a renewal leaves a paused
 * month out. Stripe (fetch) and the mail sender are stubbed: no money moves, no letter leaves.
 */
const sent: { to: string | string[]; subject: string; html: string; text: string; kind: string }[] = [];
vi.mock("../src/lib/email", async (orig) => {
  const real = await orig<typeof import("../src/lib/email")>();
  return {
    ...real,
    sendEmail: vi.fn(async (to: string | string[], subject: string, html: string, text: string, opts: { kind: string }) => {
      sent.push({ to, subject, html, text, kind: opts.kind });
      return { ok: true, id: `re_111_${sent.length}` };
    }),
  };
});

process.env.STRIPE_SECRET_KEY = "sk_test_111";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_111";
process.env.ADMIN_KEY ??= "admin-key-111";
process.env.SITE_URL = "https://yaoflow.com";

const DAY = 86_400_000;
const NOW = Date.now();
const sec = (ms: number) => Math.floor(ms / 1000);
const stripeCalls: { method: string; path: string; body: URLSearchParams }[] = [];
/** what Stripe answers for GET /subscriptions/<id> and POST /subscriptions/<id> in the link tests */
const live: Record<string, Record<string, unknown>> = {};
let previewFails = false;

vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: { method?: string; body?: string }) => {
  const path = String(url).replace("https://api.stripe.com/v1", "");
  const method = init?.method ?? "GET";
  const body = new URLSearchParams(init?.body ?? "");
  stripeCalls.push({ method, path, body });
  if (path.startsWith("/invoices?subscription=") && path.includes("status=open")) {
    return Response.json({ data: [{ id: "in_open", created: sec(NOW - 3_600_000), amount_due: 26900, currency: "twd", hosted_invoice_url: "https://invoice.stripe.com/i/test_open", next_payment_attempt: sec(NOW + 3 * DAY), attempt_count: 1 }] });
  }
  if (path === "/invoices/create_preview") {
    if (previewFails) return new Response(JSON.stringify({ error: { message: "nope" } }), { status: 400 });
    return Response.json({ total: 26900, amount_due: 20000, currency: "twd" });
  }
  if (path.startsWith("/customers/")) return Response.json({ id: path.slice(11), balance: -5000, currency: "twd" });
  const m = path.match(/^\/subscriptions\/(sub_[A-Za-z0-9]+)$/);
  if (m) {
    const cur = live[m[1]!];
    if (!cur) return new Response("{}", { status: 404 });
    if (method === "POST") {
      if (body.get("cancel_at_period_end") === "false" || body.get("cancel_at") === "") Object.assign(cur, { cancel_at_period_end: false, cancel_at: null });
      if (body.get("pause_collection[behavior]")) cur.pause_collection = { behavior: body.get("pause_collection[behavior]"), resumes_at: Number(body.get("pause_collection[resumes_at]")) };
    }
    return Response.json(cur);
  }
  return new Response("{}", { status: 404 });
}));

const { upsertCustomer, upsertSubscription, subscriptionByStripeId, subsForRecap, setPause, db } = await import("../src/lib/db");
const { subLetterFor, buildSubLetter, sendSubLetter, letterKey } = await import("../src/lib/sub-letters");
const { SUB_NOTICE_T } = await import("../src/lib/dict/sub-notice");
const { setLetterOn, resetLetterSwitches } = await import("../src/lib/letter-switch");
const { performRetain } = await import("../src/lib/retain");
const { autoMail, renderSample, SAMPLE_READER } = await import("../src/lib/auto-mail");
const { POST: webhook } = await import("../src/app/api/stripe/webhook/route");

function subObj(id: string, o: Partial<{ status: string; cancel: boolean; cancelAt: number | null; end: number; reason: string; pause: boolean }> = {}) {
  const end = o.end ?? NOW + 20 * DAY;
  return {
    id, customer: `cus_${id.slice(4)}`, status: o.status ?? "active", cancel_at_period_end: o.cancel ?? false,
    cancel_at: o.cancelAt === undefined ? (o.cancel ? sec(end) : null) : o.cancelAt,
    metadata: {}, cancellation_details: o.reason ? { reason: o.reason } : null,
    pause_collection: o.pause ? { behavior: "void", resumes_at: sec(end + 28 * DAY) } : null,
    items: { data: [{ price: { unit_amount: 26900, currency: "twd", recurring: { interval: "month" } }, current_period_start: sec(end - 30 * DAY), current_period_end: sec(end) }] },
  };
}

function member(id: string, email: string, o: Partial<{ status: string; cancel: boolean; end: number; locale: string }> = {}) {
  const cid = upsertCustomer(email, o.locale ?? "zh-hant");
  const end = o.end ?? NOW + 20 * DAY;
  upsertSubscription({ customerId: cid, stripeCustomerId: `cus_${id.slice(4)}`, stripeSubscriptionId: id, status: o.status ?? "active", plan: "month",
    periodStart: end - 30 * DAY, periodEnd: end, cancelAtPeriodEnd: !!o.cancel, cancelAt: o.cancel ? sec(end) * 1000 : null, currency: "TWD", amountMinor: 26900 });
  // the opening letter went out when they joined — not what these tests are about
  db().prepare("UPDATE subscriptions SET welcomed_at = ? WHERE stripe_subscription_id = ?").run(NOW - 40 * DAY, id);
  return { cid, row: subscriptionByStripeId(id)! };
}

async function deliver(type: string, obj: unknown) {
  const payload = JSON.stringify({ type, data: { object: obj } });
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", "whsec_111").update(`${t}.${payload}`).digest("hex");
  return webhook(new NextRequest("http://localhost/api/stripe/webhook", { method: "POST", body: payload, headers: { "stripe-signature": `t=${t},v1=${sig}` } }));
}
const ofKind = (k: string) => sent.filter((m) => m.kind === k);

beforeEach(() => { sent.length = 0; stripeCalls.length = 0; previewFails = false; });

describe("九语的信：键与占位一致", () => {
  it("every language has the same keys and the same {placeholders} as zh-hant", () => {
    const base = SUB_NOTICE_T["zh-hant"];
    const marks = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
    for (const [l, t] of Object.entries(SUB_NOTICE_T)) {
      expect(Object.keys(t).sort(), l).toEqual(Object.keys(base).sort());
      for (const k of Object.keys(base) as (keyof typeof base)[]) expect(marks(t[k]), `${l}.${k}`).toBe(marks(base[k]));
    }
  });
  it("no banned words in the Chinese copy", () => {
    for (const l of ["zh", "zh-hant"] as const) for (const v of Object.values(SUB_NOTICE_T[l])) expect(v).not.toMatch(/準|准确|AI|靈驗|灵验|神明|吉凶|化解|改運|改运/);
  });
});

describe("哪种变化寄哪封", () => {
  const row = (o: Partial<{ status: string; cancel: number; cancel_at: number | null }> = {}) => ({ status: o.status ?? "active", cancel_at_period_end: o.cancel ?? 0, cancel_at: o.cancel_at ?? null }) as never;
  it("active → past_due: 扣款失败", () => expect(subLetterFor(row(), subObj("sub_a", { status: "past_due" }) as never, false)).toBe("payfail"));
  it("past_due → active: 补缴成功", () => expect(subLetterFor(row({ status: "past_due" }), subObj("sub_a") as never, false)).toBe("paid"));
  it("past_due → deleted, or deleted for payment_failed: 欠费结束", () => {
    expect(subLetterFor(row({ status: "past_due" }), subObj("sub_a", { status: "canceled" }) as never, true)).toBe("unpaid_end");
    expect(subLetterFor(row(), subObj("sub_a", { status: "canceled", reason: "payment_failed" }) as never, true)).toBe("unpaid_end");
    expect(subLetterFor(row({ status: "past_due" }), subObj("sub_a", { status: "unpaid" }) as never, false)).toBe("unpaid_end");
  });
  it("an ending they asked for is not a payment letter (the cancel receipt covers it)", () => {
    expect(subLetterFor(row({ cancel: 1 }), subObj("sub_a", { status: "canceled", reason: "cancellation_requested" }) as never, true)).toBeNull();
  });
  it("ending undone: 恢复续订 — but not when the pause undid it (the pause letter covers that)", () => {
    expect(subLetterFor(row({ cancel: 1 }), subObj("sub_a") as never, false)).toBe("resume");
    expect(subLetterFor(row({ cancel_at: NOW + DAY }), subObj("sub_a", { cancelAt: null }) as never, false)).toBe("resume");
    expect(subLetterFor(row({ cancel: 1 }), subObj("sub_a", { pause: true }) as never, false)).toBeNull();
  });
  it("a renewal that went through, a new subscription: nothing (Stripe's receipt; the welcome letter)", () => {
    expect(subLetterFor(row(), subObj("sub_a") as never, false)).toBeNull();
    expect(subLetterFor(null, subObj("sub_a") as never, false)).toBeNull();
  });
});

describe("webhook：扣款失败 → 补缴 → 欠费结束", () => {
  it("first failure: one letter with Stripe's pay page, the next try, the amount; a repeated event sends nothing more", async () => {
    const { row } = member("sub_fail1", "fail1@example.com");
    expect((await deliver("customer.subscription.updated", subObj("sub_fail1", { status: "past_due" }))).status).toBe(200);
    const mails = ofKind("sub_payfail");
    expect(mails).toHaveLength(1);
    expect(mails[0]!.to).toBe("fail1@example.com");
    expect(mails[0]!.subject).toContain("沒有扣成功");
    expect(mails[0]!.html).toContain("https://invoice.stripe.com/i/test_open");
    expect(mails[0]!.text).toContain("269");
    expect(mails[0]!.text).toMatch(/下一次在 .+ 前後/);
    // Neil's alert says the reader was told
    expect(ofKind("sub_alert").at(-1)!.text).toContain("读者信　扣款失败通知：已寄给读者");
    sent.length = 0;
    // Stripe delivers the same turn again (before is now past_due → no turn) and a duplicate with the old before-picture
    await deliver("customer.subscription.updated", subObj("sub_fail1", { status: "past_due" }));
    expect(ofKind("sub_payfail")).toHaveLength(0);
    expect(await sendSubLetter("payfail", subscriptionByStripeId("sub_fail1")!, { before: row })).toBe("already");
  });

  it("paid after all: 会员已恢复, once", async () => {
    member("sub_fail2", "fail2@example.com", { status: "past_due" });
    await deliver("customer.subscription.updated", subObj("sub_fail2"));
    const m = ofKind("sub_payfail");
    expect(m).toHaveLength(1);
    expect(m[0]!.subject).toContain("會員已恢復");
    expect(ofKind("sub_welcome")).toHaveLength(0);
  });

  it("the retries ran out: 欠费结束, once, nothing charged after", async () => {
    member("sub_fail3", "fail3@example.com", { status: "past_due" });
    await deliver("customer.subscription.deleted", subObj("sub_fail3", { status: "canceled", reason: "payment_failed" }));
    await deliver("customer.subscription.deleted", subObj("sub_fail3", { status: "canceled", reason: "payment_failed" }));
    const m = ofKind("sub_unpaid_end");
    expect(m).toHaveLength(1);
    expect(m[0]!.text).toContain("不會再扣款");
  });

  it("no open bill to be found: the button goes to the account page and says Stripe tries again in a few days", () => {
    const { row } = member("sub_fail4", "fail4@example.com");
    const m = buildSubLetter("payfail", row, "zh", { bill: null });
    expect(m.html).toContain("https://yaoflow.com/zh/account#membership");
    expect(m.text).toContain("接下来几天自动再试");
  });

  it("switched off on /admin/letters: nothing sent, nothing claimed, and Neil's alert says so", async () => {
    member("sub_fail5", "fail5@example.com");
    setLetterOn("sub_payfail", false);
    resetLetterSwitches();
    try {
      await deliver("customer.subscription.updated", subObj("sub_fail5", { status: "past_due" }));
      expect(ofKind("sub_payfail")).toHaveLength(0);
      expect(ofKind("sub_alert").at(-1)!.text).toContain("后台关着");
      expect(db().prepare("SELECT COUNT(*) AS n FROM emails WHERE session_id LIKE 'sub-payfail:sub_fail5:%'").get()).toEqual({ n: 0 });
    } finally {
      setLetterOn("sub_payfail", true);
      resetLetterSwitches();
    }
  });

  it("a 通卡 or a complimentary membership is never billed — no payment letters for them", async () => {
    const cid = upsertCustomer("passer@example.com", "zh-hant");
    upsertSubscription({ customerId: cid, stripeCustomerId: null, stripeSubscriptionId: "pass_abc111", status: "active", plan: "month", periodStart: NOW, periodEnd: NOW + DAY, cancelAtPeriodEnd: false });
    expect(await sendSubLetter("payfail", subscriptionByStripeId("pass_abc111")!)).toBe("skipped");
  });
});

describe("恢复续订确认（110）", () => {
  it("from Stripe's page: one letter, next charge from Stripe's preview with the balance taken off", async () => {
    member("sub_res1", "res1@example.com", { cancel: true });
    await deliver("customer.subscription.updated", subObj("sub_res1"));
    const m = ofKind("sub_resume");
    expect(m).toHaveLength(1);
    expect(m[0]!.subject).toContain("已恢復續訂");
    expect(m[0]!.text).toContain("200"); // NT$200 due
    expect(m[0]!.text).toContain("已用帳戶餘額抵");
    expect(m[0]!.text).toContain("69"); // NT$69 from the balance
    expect(m[0]!.text).toContain("送一卦"); // the member list from the rights table
    expect(stripeCalls.some((c) => c.path === "/invoices/create_preview" && c.body.get("subscription") === "sub_res1")).toBe(true);
  });

  it("preview refused: the plan's price less the customer's balance", async () => {
    previewFails = true;
    const { row } = member("sub_res2", "res2@example.com");
    expect(await sendSubLetter("resume", row, { before: { ...row, cancel_at: row.period_end } })).toBe("sent");
    const m = ofKind("sub_resume").at(-1)!;
    expect(m.text).toContain("219"); // 269 − 50 balance
    expect(m.text).toContain("已用帳戶餘額抵");
  });

  it("from the letter's one-tap link: one letter, and the webhook that follows sends nothing", async () => {
    member("sub_res3", "res3@example.com", { cancel: true });
    live.sub_res3 = subObj("sub_res3", { cancel: true });
    const r = await performRetain("resume", "sub_res3", "zh-hant");
    expect(r).toMatchObject({ ok: true, done: "resume" });
    expect(ofKind("sub_resume")).toHaveLength(1);
    expect(ofKind("sub_alert").at(-1)!.text).toContain("读者确认信：已寄");
    await deliver("customer.subscription.updated", live.sub_res3);
    expect(ofKind("sub_resume")).toHaveLength(1);
  });

  it("webhook first, then the link (a race): still one letter", async () => {
    const { row } = member("sub_res4", "res4@example.com", { cancel: true });
    await deliver("customer.subscription.updated", subObj("sub_res4"));
    expect(ofKind("sub_resume")).toHaveLength(1);
    // the link's path, with the before-picture it had (still ending) — the same key
    expect(letterKey("resume", subscriptionByStripeId("sub_res4")!, row)).toBe(letterKey("resume", row, row));
    expect(await sendSubLetter("resume", subscriptionByStripeId("sub_res4")!, { before: row })).toBe("already");
    expect(ofKind("sub_resume")).toHaveLength(1);
  });
});

describe("暂停一个月（111 ②）", () => {
  it("the pause letter says from / until and the fee that follows; no resume letter; the review skips the voided renewal", async () => {
    const end = NOW + 2 * DAY;
    member("sub_pz1", "pz1@example.com", { cancel: true, end });
    live.sub_pz1 = subObj("sub_pz1", { cancel: true, end });
    const r = await performRetain("pause", "sub_pz1", "zh-hant");
    expect(r).toMatchObject({ ok: true, done: "pause" });
    const m = ofKind("sub_pause");
    expect(m).toHaveLength(1);
    expect(m[0]!.subject).toContain("自動接上");
    expect(m[0]!.text).toContain("269");
    expect(ofKind("sub_resume")).toHaveLength(0);
    // Stripe's webhook for the same change: the pause cleared the ending, but this is not a resume
    await deliver("customer.subscription.updated", live.sub_pz1);
    expect(ofKind("sub_resume")).toHaveLength(0);
    // 续费前回顾: the renewal at the start of the pause is voided — not in the list
    expect(subsForRecap(0, 5 * DAY).map((s) => s.stripe_subscription_id)).not.toContain("sub_pz1");
  });

  it("the review still covers a member who is not paused, and one whose pause is over", () => {
    const end = NOW + 2 * DAY;
    const { row } = member("sub_pz2", "pz2@example.com", { end });
    expect(subsForRecap(0, 5 * DAY).map((s) => s.stripe_subscription_id)).toContain("sub_pz2");
    setPause(row.id, end - 31 * DAY, end - DAY); // a pause that ended before this renewal
    expect(subsForRecap(0, 5 * DAY).map((s) => s.stripe_subscription_id)).toContain("sub_pz2");
  });
});

describe("后台「自动寄的信」看得到、能预览", () => {
  it("each new letter renders a sample for a reader without an account", async () => {
    for (const id of ["sub_payfail", "sub_paid", "sub_unpaid_end", "sub_resume", "sub_pause"]) {
      const a = autoMail(id);
      expect(a, id).not.toBeNull();
      expect(a!.switchId).not.toBeNull();
      const m = await renderSample(a!, SAMPLE_READER, "https://yaoflow.com", NOW);
      expect("error" in m ? m.error : null, id).toBeNull();
      expect("html" in m ? m.html : "", id).toContain("<html");
      expect("subject" in m ? m.subject : "", id).not.toBe("");
    }
  });
});
