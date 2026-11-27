import { describe, expect, it } from "vitest";
import { decide, ensureAutoColumns, gatherFacts, readerText, redact, renderD1, supportAutoHandle, supportAutoMode, tierLabel, type Facts, type Read } from "../src/lib/support-auto";
import { stripFence } from "../src/lib/support-llm";
import { ensureInboxTable } from "../src/lib/inbound";
import { db } from "../src/lib/db";

const H = 3_600_000;
const NOW = Date.UTC(2026, 9, 18, 14, 0); // 10-18 22:00 Taipei

const read = (o: Partial<Read> = {}): Read => ({ cls: "F", summary: "x", language: "zh-hant", negative: false, wants_cancel: false, wants_refund: false, new_question: false, ...o });
const facts = (o: Partial<Facts> = {}): Facts => ({ email: "reader@example.com", customerId: 7, locale: "zh-hant", orders: [], subs: [], priorLetters: 0, priorAutoReplies: 0, onRevisitMail: false, ...o });
const order = (o: Partial<Facts["orders"][number]> = {}): Facts["orders"][number] => ({
  session_id: "cs_test_abcdefgh12345678", created_at: NOW - 2 * H, tier: "deep", amount_cents: 7500, currency: "TWD", payment_state: "paid", refund_reason: null,
  cast_id: 1, reading_locale: "zh-hant", mail_delivered_at: NOW - 2 * H + 60_000, mail_opened_at: null, ...o,
});

describe("10-18 客服实时自动处理 · 读信", () => {
  it("keeps the reader's words and drops the quoted mail under them", () => {
    const t = readerText({ text: "請問付款了怎麼沒有收到？\n\n> 你好，這是交付信\n> …", html: null });
    expect(t).toBe("請問付款了怎麼沒有收到？");
    expect(readerText({ text: "謝謝！\n\nOn Sat, Oct 17, 2026 YaoFlow wrote:\n> …", html: null })).toBe("謝謝！");
    expect(readerText({ text: "好喔\n\n寄件者: YaoFlow <support@yaoflow.com>\n…", html: null })).toBe("好喔");
    expect(readerText({ text: null, html: "<p>我咋没看到<br>报告</p><style>x{}</style>" })).toBe("我咋没看到\n报告");
  });
  it("reads a fenced or chatty JSON answer", () => {
    expect(stripFence('```json\n{"cls":"A"}\n```')).toBe('{"cls":"A"}');
    expect(stripFence('好的，这是结果：{"cls":"B","x":1} 以上')).toBe('{"cls":"B","x":1}');
  });
  it("never writes a reader's whole address", () => {
    expect(redact("someone@example.com")).toBe("som…@example.com");
    expect(redact("ab@x.io")).toBe("ab…@x.io");
  });
  it("mode defaults to off", () => {
    const was = process.env.SUPPORT_AUTO;
    delete process.env.SUPPORT_AUTO;
    expect(supportAutoMode()).toBe("off");
    process.env.SUPPORT_AUTO = "DRY"; expect(supportAutoMode()).toBe("dry");
    process.env.SUPPORT_AUTO = "weird"; expect(supportAutoMode()).toBe("off");
    if (was === undefined) delete process.env.SUPPORT_AUTO; else process.env.SUPPORT_AUTO = was;
  });
});

describe("10-18 客服实时自动处理 · 决策（规程 §2）", () => {
  it("hard gates first: other language, hostile tone, second letter in the thread → Neil", () => {
    expect(decide(facts(), read({ cls: "B", language: "other" }), NOW)).toMatchObject({ kind: "escalate", cls: "F" });
    expect(decide(facts(), read({ cls: "C", negative: true }), NOW)).toMatchObject({ kind: "escalate", cls: "F" });
    expect(decide(facts({ priorLetters: 1 }), read({ cls: "B" }), NOW)).toMatchObject({ kind: "escalate", cls: "B" });
    expect(decide(facts({ priorAutoReplies: 1 }), read({ cls: "C" }), NOW)).toMatchObject({ kind: "escalate" });
    // a thank-you after an earlier letter is still just a thank-you
    expect(decide(facts({ priorLetters: 2 }), read({ cls: "A" }), NOW)).toMatchObject({ kind: "ack" });
  });
  it("A: a thank-you is marked handled and not answered; one with a question goes to Neil", () => {
    expect(decide(facts(), read({ cls: "A" }), NOW)).toEqual({ kind: "ack", note: "auto: ack" });
    expect(decide(facts(), read({ cls: "A", new_question: true }), NOW)).toMatchObject({ kind: "escalate", cls: "F" });
  });
  it("E: only when the subject really answers a revisit letter", () => {
    expect(decide(facts({ onRevisitMail: true }), read({ cls: "E" }), NOW)).toMatchObject({ kind: "handled_notify", cls: "E" });
    expect(decide(facts({ onRevisitMail: false }), read({ cls: "E" }), NOW)).toMatchObject({ kind: "escalate", cls: "F" });
  });
  it("B1: no subscription → the list of one-time payments, no second-guessing", () => {
    const d = decide(facts({ orders: [order({ created_at: Date.UTC(2026, 9, 1, 2, 0) }), order({ session_id: "cs_2", tier: "one", amount_cents: 2900, created_at: Date.UTC(2026, 9, 3, 2, 0) })] }), read({ cls: "B" }), NOW);
    expect(d.kind).toBe("reply");
    if (d.kind !== "reply") return;
    expect(d.text).toContain("沒有開通會員");
    expect(d.text).toContain("10月1日　深斷 NT$75");
    expect(d.text).toContain("10月3日　輕解讀 NT$29");
    expect(d.text).toContain("——Neil · YaoFlow");
    expect(d.tellNeil).toBeNull();
  });
  it("B1 in simplified Chinese for a 简体 reader", () => {
    const d = decide(facts({ locale: "zh" }), read({ cls: "B", language: "zh" }), NOW);
    expect(d.kind).toBe("reply");
    if (d.kind === "reply") { expect(d.text).toContain("没有开通会员"); expect(d.text).not.toContain("沒有"); }
  });
  it("B2: a live membership and a wish to cancel → the self-service path, nothing changed, Neil told", () => {
    const f = facts({ subs: [{ stripe_subscription_id: "sub_1", status: "active", plan: "month", period_end: Date.UTC(2026, 9, 27, 0, 0), cancel_at_period_end: 0 }] });
    const d = decide(f, read({ cls: "B", wants_cancel: true }), NOW);
    expect(d).toMatchObject({ kind: "reply", cls: "B" });
    if (d.kind === "reply") { expect(d.text).toContain("本期到 10月27日"); expect(d.tellNeil).toContain("有效会员"); }
    // a live membership but no wish to cancel: the 规程 has no template → Neil
    expect(decide(f, read({ cls: "B" }), NOW)).toMatchObject({ kind: "escalate", cls: "B" });
    // a comp / pass membership is not a Stripe subscription: neither template fits
    expect(decide(facts({ subs: [{ stripe_subscription_id: "comp_9", status: "active", plan: "month", period_end: null, cancel_at_period_end: 0 }] }), read({ cls: "B", wants_cancel: true }), NOW)).toMatchObject({ kind: "escalate" });
    // a cancelled one counts as none
    expect(decide(facts({ subs: [{ stripe_subscription_id: "sub_old", status: "canceled", plan: "month", period_end: null, cancel_at_period_end: 1 }] }), read({ cls: "B" }), NOW)).toMatchObject({ kind: "reply" });
  });
  it("C1: a fresh payment whose reading exists AND whose letter was delivered gets the link; anything else → Neil", () => {
    const d = decide(facts({ orders: [order()] }), read({ cls: "C" }), NOW);
    expect(d.kind).toBe("reply");
    if (d.kind === "reply") { expect(d.text).toContain("/zh-hant/reading?sid=cs_test_abcdefgh12345678"); expect(d.text).toContain("10月18日 20:00"); expect(d.text).toContain("深斷"); }
    expect(decide(facts({ orders: [order({ mail_delivered_at: null })] }), read({ cls: "C" }), NOW)).toMatchObject({ kind: "escalate", cls: "C" });
    // minutes after payment with no reading yet: too early to say anything — let go, the sweep looks again
    expect(decide(facts({ orders: [order({ reading_locale: null, created_at: NOW - 10 * 60_000 })] }), read({ cls: "C" }), NOW).kind).toBe("defer");
    expect(decide(facts({ orders: [order({ mail_delivered_at: null, created_at: NOW - 10 * 60_000 })] }), read({ cls: "C" }), NOW).kind).toBe("defer");
    expect(decide(facts({ orders: [order({ reading_locale: null, created_at: NOW - 2 * H })] }), read({ cls: "C" }), NOW).kind).toBe("escalate");
    expect(decide(facts({ orders: [order({ created_at: NOW - 30 * H })] }), read({ cls: "C" }), NOW).kind).toBe("escalate");
    expect(decide(facts(), read({ cls: "C" }), NOW).kind).toBe("escalate");
  });
  it("D: every condition of the first-payment guarantee is checked in code, not trusted from the model", () => {
    expect(decide(facts({ orders: [order()] }), read({ cls: "D", wants_refund: false }), NOW).kind).toBe("escalate");
    expect(decide(facts({ orders: [order(), order({ session_id: "cs_2", created_at: NOW - 40 * H })] }), read({ cls: "D", wants_refund: true }), NOW)).toMatchObject({ kind: "escalate", cls: "D" });
    expect(decide(facts({ orders: [order({ created_at: NOW - 25 * H })] }), read({ cls: "D", wants_refund: true }), NOW)).toMatchObject({ kind: "escalate", cls: "D" });
    expect(decide(facts({ orders: [order({ payment_state: "refunded", refund_reason: "guarantee" })] }), read({ cls: "D", wants_refund: true }), NOW)).toMatchObject({ kind: "escalate", cls: "D" });
    // the one eligible shape still has to pass guaranteeCheck against the database (no such order here → escalate, never refund)
    expect(decide(facts({ orders: [order()] }), read({ cls: "D", wants_refund: true }), NOW)).toMatchObject({ kind: "escalate", cls: "D" });
  });
  it("D1 and the tier labels read right in both scripts", () => {
    expect(renderD1("NT$75", "zh-hant")).toContain("NT$75 已退回原付款方式");
    expect(renderD1("¥9.90", "zh")).toContain("已退回原付款方式");
    expect(renderD1("¥9.90", "zh")).not.toContain("這");
    expect(tierLabel("deep", "zh")).toBe("深断");
    expect(tierLabel("one", "zh-hant")).toBe("輕解讀");
  });
});

describe("10-18 客服实时自动处理 · 存储", () => {
  it("adds its columns once, and a letter is claimed by exactly one caller", async () => {
    ensureInboxTable(); ensureAutoColumns(); ensureAutoColumns();
    const cols = (db().prepare("PRAGMA table_info(support_inbox)").all() as { name: string }[]).map((c) => c.name);
    expect(cols).toContain("auto_at"); expect(cols).toContain("auto_draft");
    const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    db().prepare("INSERT OR IGNORE INTO support_inbox (id, received_at, from_addr, subject, text, forwarded_at) VALUES (?,?,?,?,?,?)").run(id, NOW, "reader@example.com", "謝謝", "謝謝你", NOW);
    const was = process.env.SUPPORT_AUTO;
    process.env.SUPPORT_AUTO = "off";
    expect(await supportAutoHandle(id, NOW)).toBe("skipped"); // off: untouched
    expect((db().prepare("SELECT auto_at FROM support_inbox WHERE id = ?").get(id) as { auto_at: number | null }).auto_at).toBeNull();
    if (was === undefined) delete process.env.SUPPORT_AUTO; else process.env.SUPPORT_AUTO = was;
    const f = gatherFacts({ id, received_at: NOW, from_addr: "reader@example.com", from_name: null, to_addrs: null, subject: "謝謝", text: "謝謝你", html: null, auth: null, attachments: null, customer_id: null, forwarded_at: NOW, forward_error: null, handled_at: null, note: null }, NOW);
    expect(f.orders).toEqual([]); expect(f.priorLetters).toBe(0); expect(f.onRevisitMail).toBe(false);
    expect(gatherFacts({ id, received_at: NOW, from_addr: "reader@example.com", from_name: null, to_addrs: null, subject: "Re: 你問過的事，應期近了", text: "", html: null, auth: null, attachments: null, customer_id: null, forwarded_at: NOW, forward_error: null, handled_at: null, note: null }, NOW).onRevisitMail).toBe(true);
  });
  it("a letter with a cached reading is decided without the model (the deferral path)", async () => {
    ensureInboxTable(); ensureAutoColumns();
    const id = "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee";
    const cached = JSON.stringify({ cls: "A", summary: "道谢", language: "zh-hant", negative: false, wants_cancel: false, wants_refund: false, new_question: false });
    db().prepare("INSERT OR IGNORE INTO support_inbox (id, received_at, from_addr, subject, text, forwarded_at, auto_read) VALUES (?,?,?,?,?,?,?)").run(id, NOW, "ack@example.com", "謝謝", "謝謝你", NOW, cached);
    const was = process.env.SUPPORT_AUTO;
    process.env.SUPPORT_AUTO = "on";
    delete process.env.RESEND_API_KEY; // nothing may leave in a test
    expect(await supportAutoHandle(id, NOW)).toBe("ack");
    const row = db().prepare("SELECT handled_at, note, auto_action, auto_class FROM support_inbox WHERE id = ?").get(id) as { handled_at: number | null; note: string | null; auto_action: string; auto_class: string };
    expect(row.handled_at).not.toBeNull(); expect(row.note).toBe("auto: ack"); expect(row.auto_action).toBe("ack"); expect(row.auto_class).toBe("A");
    expect(await supportAutoHandle(id, NOW)).toBe("skipped"); // handled: never touched again
    if (was === undefined) delete process.env.SUPPORT_AUTO; else process.env.SUPPORT_AUTO = was;
  });
});
