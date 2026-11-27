import { describe, expect, it } from "vitest";
import type { LineValue } from "@yaoflow/engine";
import { db, eraseCustomer, logMailSent, recordOrder, saveCast, saveReading, upsertCustomer, upsertSubscription } from "../src/lib/db";
import { resolveServerChart } from "../src/lib/reading";

const V: LineValue[] = [7, 8, 7, 8, 7, 8];
const chart = resolveServerChart({ question: "q", values: V, castAtMs: Date.UTC(2026, 8, 10, 3), tzOffsetMinutes: 480 }, true) as unknown as Record<string, unknown>;

function seed(email: string) {
  const cid = upsertCustomer(email, "zh");
  const now = Date.now();
  const cast = saveCast({ customerId: cid, castAtMs: now, tzOffsetMinutes: 480, locale: "zh", question: "这个月能签约吗", values: V, chart });
  saveReading(cast, cid, "deep", "zh", { verdict: "x" });
  // an anonymous cast paid for with the same address before signing in
  const anon = saveCast({ customerId: null, castAtMs: now, tzOffsetMinutes: 480, locale: "zh", question: "匿名那一卦", values: V, chart });
  recordOrder({ sessionId: `cs_erase_${cid}_a`, customerId: null, castId: anon, tier: "deep", amountCents: 999, currency: "usd", email, status: "paid" });
  recordOrder({ sessionId: `cs_erase_${cid}_b`, customerId: cid, castId: cast, tier: "deep", amountCents: 999, currency: "usd", email, status: "paid" });
  logMailSent({ id: `m_erase_${cid}`, kind: "reading", email, subject: "s", customerId: cid });
  return { cid, cast, anon };
}

describe("删除客户全部数据（09-25 合规，隐私政策 §4）", () => {
  it("removes the person and every cast, keeps orders as an anonymised accounting record", () => {
    const email = "erase-me@example.com";
    const { cid, cast, anon } = seed(email);
    const r = eraseCustomer(cid);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.casts).toBe(2);
    const d = db();
    expect(d.prepare("SELECT COUNT(*) AS v FROM customers WHERE id = ?").get(cid)).toEqual({ v: 0 });
    expect(d.prepare("SELECT COUNT(*) AS v FROM casts WHERE id IN (?, ?)").get(cast, anon)).toEqual({ v: 0 });
    expect(d.prepare("SELECT COUNT(*) AS v FROM readings WHERE cast_id = ?").get(cast)).toEqual({ v: 0 });
    expect(d.prepare("SELECT COUNT(*) AS v FROM mail_log WHERE email = ?").get(email)).toEqual({ v: 0 });
    // money stays, the address does not
    const orders = d.prepare("SELECT email, customer_id, amount_cents FROM orders WHERE session_id LIKE ?").all(`cs_erase_${cid}_%`) as { email: string | null; customer_id: number | null; amount_cents: number }[];
    expect(orders).toHaveLength(2);
    for (const o of orders) { expect(o.email).toBeNull(); expect(o.customer_id).toBeNull(); expect(o.amount_cents).toBe(999); }
    expect(d.prepare("SELECT COUNT(*) AS v FROM orders WHERE lower(email) = ?").get(email)).toEqual({ v: 0 });
  });

  it("refuses while a Stripe-billed subscription is live, allows a comp one", () => {
    const { cid } = seed("erase-live@example.com");
    const now = Date.now();
    upsertSubscription({ customerId: cid, stripeCustomerId: "cus_x", stripeSubscriptionId: `sub_erase_${cid}`, status: "active", plan: "month", periodStart: now, periodEnd: now + 30 * 86_400_000, cancelAtPeriodEnd: false, currency: "usd", amountMinor: 999 });
    const r = eraseCustomer(cid);
    expect(r.ok).toBe(false);
    db().prepare("UPDATE subscriptions SET status = 'canceled' WHERE stripe_subscription_id = ?").run(`sub_erase_${cid}`);
    expect(eraseCustomer(cid).ok).toBe(true);
    expect(db().prepare("SELECT COUNT(*) AS v FROM subscriptions WHERE customer_id = ?").get(cid)).toEqual({ v: 0 });
  });

  it("says so for an unknown id", () => {
    expect(eraseCustomer(99_999_999).ok).toBe(false);
  });
});

