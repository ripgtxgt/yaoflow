import { describe, expect, it } from "vitest";
// DATA_DIR is a fresh temp dir (test/setup.ts)
import type { LineValue } from "@yaoflow/engine";
import { recentReadings, recordOrder, salesByCurrency, saveCast, setOrdersTest, upsertCustomer } from "../src/lib/db";
import { resolveServerChart } from "../src/lib/reading";

/**
 * 后台"最近的解读"(09-12): every delivered reading in the window, the
 * anonymous painted-door ones included — they have no customer row, so
 * 客户档案 cannot show them and this table is their only trace.
 */
const V: LineValue[] = [6, 7, 8, 9, 7, 8]; // 泽水困, lines 1 and 4 moving → 水泽节 (the friend's cast in the 09-12 screenshot)
const AT = Date.UTC(2026, 8, 10, 12);

function cast(customerId: number | null, question: string, locale = "zh") {
  const chart = resolveServerChart({ question, values: V, castAtMs: AT, tzOffsetMinutes: 480 }, true) as unknown as Record<string, unknown>;
  return saveCast({ customerId, castAtMs: AT, tzOffsetMinutes: 480, locale, question, topic: "career", values: V, chart });
}

describe("最近的解读", () => {
  it("lists anonymous gift readings next to customer ones, newest first, with question and figure", () => {
    // 1. the friend who tapped "不留邮箱，直接看": cast + order, no customer, no email
    const anonCast = cast(null, "我现在在工作的地方需要换吗？");
    recordOrder({ sessionId: "gf_anon_1", customerId: null, castId: anonCast, tier: "deep", amountCents: 0, currency: "CNY", email: null, status: "gift", firstDeep: true });
    // 2. someone who left an address → customer row exists
    const cid = upsertCustomer("left@example.com", "en");
    const namedCast = cast(cid, "Should I take the offer?", "en");
    recordOrder({ sessionId: "gf_named_1", customerId: cid, castId: namedCast, tier: "one", amountCents: 0, currency: "USD", email: "left@example.com", status: "gift", via: "787878" });

    const rows = recentReadings(Date.now() - 60_000);
    expect(rows.map((r) => r.session_id)).toEqual(["gf_named_1", "gf_anon_1"]);

    const anon = rows[1]!;
    expect(anon.customer_id).toBeNull();
    expect(anon.email).toBeNull();
    expect(anon.status).toBe("gift");
    expect(anon.first_deep).toBe(1);
    expect(anon.currency).toBe("CNY");
    expect(anon.locale).toBe("zh");
    expect(anon.question).toBe("我现在在工作的地方需要换吗？");
    expect(anon.primary_name).toBe("泽水困");
    expect(anon.changed_name).toBe("水泽节");
    expect(anon.followups).toBe(0);

    const named = rows[0]!;
    expect(named.customer_id).toBe(cid);
    expect(named.email).toBe("left@example.com");
    expect(named.via).toBe("787878");
    expect(named.locale).toBe("en");
  });

  it("keeps an order whose cast never materialised, and respects the window and the limit", () => {
    recordOrder({ sessionId: "cs_no_cast", customerId: null, castId: null, tier: "deep", amountCents: 999, currency: "USD", email: "x@example.com", status: "paid" });
    const rows = recentReadings(Date.now() - 60_000);
    const orphan = rows.find((r) => r.session_id === "cs_no_cast");
    expect(orphan).toBeDefined();
    expect(orphan!.question).toBeNull();
    expect(orphan!.primary_name).toBeNull();
    expect(recentReadings(Date.now() - 60_000, 1)).toHaveLength(1);
    expect(recentReadings(Date.now() + 60_000)).toHaveLength(0);
  });

  it("marks our own test runs and keeps them out of the per-market scoreboard, reversibly", () => {
    const since = Date.now() - 60_000;
    const before = salesByCurrency(since).gifts.find((g) => g.currency === "CNY" && g.tier === "deep");
    expect(before?.n).toBe(1);
    expect(recentReadings(since).find((r) => r.session_id === "gf_anon_1")?.test_flag ?? null).toBeNull();

    expect(setOrdersTest(["gf_anon_1", "nope_never_existed"], true)).toBe(1);
    expect(recentReadings(since).find((r) => r.session_id === "gf_anon_1")?.test_flag).toBe(1);
    expect(salesByCurrency(since).gifts.find((g) => g.currency === "CNY" && g.tier === "deep")).toBeUndefined();

    expect(setOrdersTest(["gf_anon_1"], false)).toBe(1);
    expect(recentReadings(since).find((r) => r.session_id === "gf_anon_1")?.test_flag).toBe(0);
    expect(salesByCurrency(since).gifts.find((g) => g.currency === "CNY" && g.tier === "deep")?.n).toBe(1);
  });
});
