import { describe, expect, it } from "vitest";
import { createMatter, customerIdByEmail, db, noteAlternateEmail, recordOrder, upsertCustomer, upsertSubscription } from "../src/lib/db";
import { linkBrowser } from "../src/lib/browsers";
import { customerColumns, kinCandidates, mergeCustomers, mergedInto, mergesInto } from "../src/lib/identity";

// 10-22 同一个人 (Neil: #1621 / #1733 — 「我们的系统目前有判断两个账号是同一个人的能力吗」→「把这两个做完吧」)

function order(sid: string, cid: number, email: string, fp: string | null, amount = 7500) {
  recordOrder({ sessionId: sid, customerId: cid, castId: null, tier: "deep", amountCents: amount, currency: "twd", email, status: "paid", paymentIntent: `pi_${sid}` });
  db().prepare("UPDATE orders SET payment_state = 'paid', entitlement_kind = 'purchase', card_fp = ? WHERE session_id = ?").run(fp, sid);
}
function cast(cid: number, q: string): number {
  const r = db().prepare(
    `INSERT INTO casts (customer_id, created_at, cast_at, tz_offset, locale, question, values_str, primary_num, primary_name, chart_json)
     VALUES (?, ?, ?, 480, 'zh-hant', ?, '7,7,7,7,7,7', 1, '乾為天', '{}')`,
  ).run(cid, Date.now(), Date.now(), q);
  const id = Number(r.lastInsertRowid);
  db().prepare("INSERT INTO readings (cast_id, customer_id, created_at, tier, locale, body_json) VALUES (?,?,?,?,?,?)").run(id, cid, Date.now(), "deep", "zh-hant", "{}");
  return id;
}

describe("可能是同一人：四种线索", () => {
  it("同一张卡、备用邮箱、付款邮箱、同一浏览器各算一条原因；只有浏览器的算「可能」，其余算「很可能」", () => {
    const a = upsertCustomer("ivanka-main@example.com", "zh-hant");
    const b = upsertCustomer("ivanka-side@example.com", "zh-hant");
    const stranger = upsertCustomer("stranger@example.com", "zh-hant");
    const tester = upsertCustomer("tester@example.com", "zh-hant");
    db().prepare("UPDATE customers SET test_flag = 1 WHERE id = ?").run(tester);
    order("cs_kin_a1", a, "ivanka-main@example.com", "card:SAME");
    order("cs_kin_b1", b, "ivanka-side@example.com", "card:SAME");
    order("cs_kin_b2", b, "ivanka-side@example.com", "card:SAME");
    order("cs_kin_t1", tester, "tester@example.com", "card:SAME");
    order("cs_kin_a2", a, "ivanka-side@example.com", null); // signed in as a, paid with b's address
    noteAlternateEmail(a, "ivanka-side@example.com");
    linkBrowser("bid-shared", a, "login");
    linkBrowser("bid-shared", b, "pay");
    linkBrowser("bid-shared", stranger, "free_first");

    const kin = kinCandidates(a);
    expect(kin.map((k) => k.id)).toEqual([b, stranger]); // strong first; the test account never
    const kb = kin[0]!;
    expect(kb.strong).toBe(true);
    expect(kb.why.map((w) => w.kind).sort()).toEqual(["alt_email", "browser", "card", "order_email"]);
    expect(kb.why.find((w) => w.kind === "card")).toMatchObject({ fp: "card:SAME", orders: 2 });
    expect(kb.why.find((w) => w.kind === "order_email")).toMatchObject({ email: "ivanka-side@example.com", orders: 1, held_by: "this" });
    expect(kb.paidOrders).toBe(2);
    const ks = kin[1]!;
    expect(ks.strong).toBe(false);
    expect(ks.why).toEqual([{ kind: "browser", browsers: 1, how: ["free_first"] }]);
    // seen from b's side the same pair shows, the other way round
    const fromB = kinCandidates(b);
    expect(fromB[0]!.id).toBe(a);
    expect(fromB[0]!.why.find((w) => w.kind === "alt_email")).toMatchObject({ held_by: "other" });
    expect(fromB[0]!.why.find((w) => w.kind === "order_email")).toMatchObject({ held_by: "other" });
  });
});

describe("合并：另一个帐号的一切归到留下的帐号", () => {
  it("卦、解读、订单、会员、一件事、浏览器都搬过去；邮箱成备用；旧 id 转到新 id；重复的浏览器记录不留", () => {
    const a = upsertCustomer("keep@example.com", "zh-hant");
    const b = upsertCustomer("gone@example.com", "zh");
    db().prepare("UPDATE customers SET first_seen = 1000, last_seen = 5000, note = '留' WHERE id = ?").run(a);
    db().prepare("UPDATE customers SET first_seen = 500, last_seen = 9000, last_login_at = 8000, alt_emails = 'gone-alt@example.com', marketing_ok = 1 WHERE id = ?").run(b);
    const ca = cast(a, "留下的卦"), cb = cast(b, "搬过来的卦");
    order("cs_merge_b", b, "gone@example.com", "card:X");
    const m = createMatter(b, "一件事", "model", "relationship");
    db().prepare("UPDATE casts SET matter_id = ? WHERE id = ?").run(m, cb);
    upsertSubscription({ customerId: b, stripeCustomerId: "cus_b", stripeSubscriptionId: "sub_merge_b", status: "active", plan: "month", periodStart: Date.now(), periodEnd: Date.now() + 30 * 864e5, cancelAtPeriodEnd: false });
    db().prepare("INSERT INTO sessions (id, customer_id, created_at, last_seen, expires_at) VALUES ('sess_b', ?, 1, 1, ?)").run(b, Date.now() + 864e5);
    linkBrowser("bid-both", a, "login");
    linkBrowser("bid-both", b, "pay");
    linkBrowser("bid-only-b", b, "pay");

    const r = mergeCustomers({ into: a, from: b, reason: "同一张卡，Neil 确认", by: "test" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.moved["casts.customer_id"]).toBe(1);
    expect(r.moved["readings.customer_id"]).toBe(1);
    expect(r.moved["orders.customer_id"]).toBe(1);
    expect(r.moved["subscriptions.customer_id"]).toBe(1);
    expect(r.moved["matters.customer_id"]).toBe(1);
    expect(r.moved["sessions.customer_id"]).toBe(1);
    expect(r.moved["browser_links.customer_id"]).toBe(1); // bid-only-b moved
    expect(r.dropped["browser_links.customer_id"]).toBe(1); // bid-both was already a's

    expect(db().prepare("SELECT customer_id FROM casts WHERE id = ?").get(cb)).toEqual({ customer_id: a });
    expect(db().prepare("SELECT customer_id FROM casts WHERE id = ?").get(ca)).toEqual({ customer_id: a });
    expect(db().prepare("SELECT customer_id FROM subscriptions WHERE stripe_subscription_id = 'sub_merge_b'").get()).toEqual({ customer_id: a });
    expect(db().prepare("SELECT customer_id FROM sessions WHERE id = 'sess_b'").get()).toEqual({ customer_id: a });
    expect(db().prepare("SELECT COUNT(*) AS n FROM browser_links WHERE customer_id = ?").get(b)).toEqual({ n: 0 });
    expect(db().prepare("SELECT COUNT(*) AS n FROM browser_links WHERE bid = 'bid-both'").get()).toEqual({ n: 1 });
    expect(db().prepare("SELECT id FROM customers WHERE id = ?").get(b)).toBeUndefined();
    const kept = db().prepare("SELECT first_seen, last_seen, last_login_at, alt_emails, marketing_ok, locale, note FROM customers WHERE id = ?").get(a) as Record<string, unknown>;
    expect(kept).toMatchObject({ first_seen: 500, last_seen: 9000, last_login_at: 8000, marketing_ok: 1, locale: "zh-hant" });
    expect(String(kept.alt_emails).split(",").sort()).toEqual(["gone-alt@example.com", "gone@example.com"]);
    expect(String(kept.note)).toContain("留");

    // the address keeps resolving to the survivor — a sign-in with it must not make a new account
    expect(customerIdByEmail("gone@example.com")).toBe(a);
    expect(customerIdByEmail("Gone-Alt@example.com")).toBe(a);
    expect(upsertCustomer("gone@example.com")).toBe(a);
    expect(db().prepare("SELECT COUNT(*) AS n FROM customers WHERE email = 'gone@example.com'").get()).toEqual({ n: 0 });
    // an address nobody holds still makes its own account
    expect(upsertCustomer("brand-new@example.com")).not.toBe(a);

    expect(mergedInto(b)).toBe(a);
    expect(mergedInto(a)).toBeNull();
    expect(mergesInto(a)).toMatchObject([{ from_id: b, from_email: "gone@example.com", reason: "同一张卡，Neil 确认" }]);
    // the clue is gone with the account
    expect(kinCandidates(a).some((k) => k.id === b)).toBe(false);
  });

  it("链式：b 并进 a，a 再并进 c，旧 b 的链接到 c", () => {
    const a = upsertCustomer("chain-a@example.com"), b = upsertCustomer("chain-b@example.com"), c = upsertCustomer("chain-c@example.com");
    expect(mergeCustomers({ into: a, from: b, reason: "x" }).ok).toBe(true);
    expect(mergeCustomers({ into: c, from: a, reason: "y" }).ok).toBe(true);
    expect(mergedInto(b)).toBe(c);
    expect(customerIdByEmail("chain-b@example.com")).toBe(c);
  });

  it("拒绝：并进自己、不存在、测试帐号对读者、没有原因", () => {
    const a = upsertCustomer("ref-a@example.com"), t = upsertCustomer("ref-t@example.com");
    db().prepare("UPDATE customers SET test_flag = 1 WHERE id = ?").run(t);
    expect(mergeCustomers({ into: a, from: a, reason: "x" })).toEqual({ ok: false, why: "same" });
    expect(mergeCustomers({ into: a, from: 999999, reason: "x" })).toEqual({ ok: false, why: "not_found" });
    expect(mergeCustomers({ into: a, from: t, reason: "x" })).toEqual({ ok: false, why: "test_mismatch" });
    expect(mergeCustomers({ into: a, from: t, reason: "  " })).toEqual({ ok: false, why: "no_reason" });
    expect(db().prepare("SELECT id FROM customers WHERE id = ?").get(t)).toBeDefined();
  });

  it("每张带客户号的表都在搬家名单上（新表自动算进来）", () => {
    const cols = customerColumns().map((c) => `${c.table}.${c.column}`);
    for (const must of ["casts.customer_id", "readings.customer_id", "orders.customer_id", "subscriptions.customer_id", "sub_uses.customer_id", "matters.customer_id",
      "sessions.customer_id", "grants.claimed_customer_id", "grants.from_customer_id", "referrals.referrer_customer_id", "referrals.referred_customer_id",
      "pairs.a_customer_id", "pairs.b_customer_id", "browser_links.customer_id", "revisits.customer_id", "followups.customer_id", "cases.customer_id"]) {
      expect(cols, must).toContain(must);
    }
    expect(cols).not.toContain("subscriptions.stripe_customer_id");
    expect(cols.some((c) => c.startsWith("customer_merges."))).toBe(false);
  });
});
