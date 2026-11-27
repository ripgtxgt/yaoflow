import { describe, expect, it, vi } from "vitest";
import type { LineValue } from "@yaoflow/engine";

/**
 * 10-23 进度表 84: the week-after check that the deep reading's 「下一步」「訊號」 no longer open alike (lib/ops-checks.ts
 * openingShares) — the share of openings whose first ten characters at least five readings share, both under 15% to
 * pass; fewer than 50 readings is "not yet". And the prompt no longer carries the example the readings copied.
 */
vi.mock("../src/lib/email", async (orig) => ({ ...(await orig<typeof import("../src/lib/email")>()), sendEmail: vi.fn(async () => ({ ok: true, id: "re_84" })) }));

const { saveCast, saveReading, upsertCustomer } = await import("../src/lib/db");
const { resolveServerChart, deepSystem } = await import("../src/lib/reading");
const { openingShares } = await import("../src/lib/ops-checks");

const V: LineValue[] = [7, 8, 9, 8, 7, 8];
const T0 = Date.now() - 3_600_000;
function reading(next: string, signals: string) {
  const cid = upsertCustomer(`r84-${Math.random().toString(36).slice(2)}@reader84.net`, "zh-hant");
  const chart = resolveServerChart({ question: "他會不會回來", values: V, castAtMs: T0, tzOffsetMinutes: 480 }, true) as unknown as Record<string, unknown>;
  const castId = saveCast({ customerId: cid, castAtMs: T0, tzOffsetMinutes: 480, locale: "zh-hant", question: "他會不會回來", topic: "relationship", values: V, chart });
  saveReading(castId, cid, "deep", "zh-hant", { next_step: { "zh-hant": next }, signals: { "zh-hant": signals } });
}

describe("深断开头雷同的一周核对", () => {
  it("fewer than 50 readings: not yet", async () => {
    for (let i = 0; i < 10; i++) reading(`找個理由約他第${i}次`, `他主動回你訊息第${i}回`);
    const r = await openingShares(T0 - 60_000);
    expect("retry" in r).toBe(true);
  });
  it("counts openings shared by five or more: varied ones pass, a stock opener fails", async () => {
    for (let i = 0; i < 50; i++) reading(`${"找傳問約寫挑放收停看"[i % 10]}一件跟第${i}號有關的小事`, `${"他她對你同這那十下"[i % 9]}個訊號編號${i}出現`);
    const ok = await openingShares(T0 - 60_000);
    expect("ok" in ok && ok.ok).toBe(true);
    for (let i = 0; i < 20; i++) reading(`這七天內，主動傳一則訊息給他`, `如果他先開口問你最近好不好`);
    const bad = await openingShares(T0 - 60_000);
    expect("ok" in bad && bad.ok).toBe(false);
    expect(("lines" in bad ? bad.lines ?? [] : []).join("\n")).toContain("时间词起头");
  });
  it("the prompt no longer carries the example readings copied, and asks for a specific opening", () => {
    const p = deepSystem("zh-hant", {});
    expect(p).not.toContain("如果他先开口问你近况");
    expect(p).not.toContain("7 days, concrete");
    expect(p).toContain("never with a time phrase");
    expect(p).toContain("no numbering");
  });
});
