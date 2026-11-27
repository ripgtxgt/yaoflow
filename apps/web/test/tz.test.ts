import { describe, expect, it } from "vitest";
import type { LineValue } from "@yaoflow/engine";
import { db, noteCustomerTimeZone, saveCast, upsertCustomer } from "../src/lib/db";
import { resolveServerChart } from "../src/lib/reading";
import { validTimeZone } from "../src/lib/tz";

describe("客户时区（09-26）", () => {
  it("accepts real IANA zones only", () => {
    for (const z of ["Asia/Taipei", "Asia/Hong_Kong", "America/Los_Angeles", "Europe/Berlin", "UTC"]) expect(validTimeZone(z), z).toBe(true);
    for (const z of ["", "Mars/Olympus", "Asia/Taipei; drop table", 480, null]) expect(validTimeZone(z as unknown), String(z)).toBe(false);
  });

  it("keeps the zone on the cast and the customer", () => {
    const cid = upsertCustomer("tz-test@example.com", "zh-hant");
    const V: LineValue[] = [7, 8, 7, 8, 7, 8];
    const chart = resolveServerChart({ question: "q", values: V, castAtMs: Date.now(), tzOffsetMinutes: 480 }, true) as unknown as Record<string, unknown>;
    const castId = saveCast({ customerId: cid, castAtMs: Date.now(), tzOffsetMinutes: 480, locale: "zh-hant", question: "這份工作能談成嗎", values: V, chart, tzName: "Asia/Taipei" });
    expect((db().prepare("SELECT tz_name AS v FROM casts WHERE id = ?").get(castId) as { v: string }).v).toBe("Asia/Taipei");
    expect((db().prepare("SELECT tz AS v FROM customers WHERE id = ?").get(cid) as { v: string }).v).toBe("Asia/Taipei");
    noteCustomerTimeZone(cid, "Europe/London"); // travelled
    expect((db().prepare("SELECT tz AS v FROM customers WHERE id = ?").get(cid) as { v: string }).v).toBe("Europe/London");
    noteCustomerTimeZone(cid, "not/a zone");
    expect((db().prepare("SELECT tz AS v FROM customers WHERE id = ?").get(cid) as { v: string }).v).toBe("Europe/London");
  });
});
