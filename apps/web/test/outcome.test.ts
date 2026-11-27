import { beforeAll, describe, expect, it } from "vitest";
// DATA_DIR is a fresh temp dir (test/setup.ts)

import { fullChart, type LineValue } from "@yaoflow/engine";
import {
  customerDetail, opsSummary, outcomeStats, recordOps, revisitById, saveCast, scheduleRevisit,
  setRevisitOutcome, upsertCustomer,
} from "../src/lib/db";
import { outcomeToken, outcomeUrl, verifyOutcomeToken } from "../src/lib/outcome-token";
import { buildRevisitEmail } from "../src/lib/email";

beforeAll(() => { process.env.ADMIN_KEY = "test-secret-key"; });

describe("回访闭环 — one-tap outcomes", () => {
  it("signs a link per revisit id and rejects tampering", () => {
    const t = outcomeToken(42);
    expect(t).toMatch(/^[0-9a-f]{32}$/);
    expect(verifyOutcomeToken(42, t)).toBe(true);
    expect(verifyOutcomeToken(43, t)).toBe(false);
    expect(verifyOutcomeToken(42, t.replace(/^./, t[0] === "a" ? "b" : "a"))).toBe(false);
    expect(verifyOutcomeToken(42, "nope")).toBe(false);
    const u = outcomeUrl("https://yaoflow.com", 42, "hit", "zh");
    expect(u).toContain("/api/revisit/outcome?id=42&v=hit&t=");
    expect(u).toContain("&l=zh");
  });

  it("records the customer's verdict, latest tap wins, and the numbers add up", () => {
    const values: LineValue[] = [7, 8, 9, 8, 7, 8];
    const chart = fullChart({ values, utcMs: Date.UTC(2026, 8, 1, 6), tzOffsetMinutes: 480 });
    const cid = upsertCustomer("revisit@example.com", "zh");
    const castId = saveCast({
      customerId: cid, castAtMs: Date.UTC(2026, 8, 1, 6), tzOffsetMinutes: 480,
      locale: "zh", question: "这单能成吗", topic: "money", values,
      chart: chart as unknown as Record<string, unknown>,
    });
    scheduleRevisit({
      sessionId: "cs_test_rv1", castId, customerId: cid, email: "revisit@example.com",
      locale: "zh", tier: "deep", castAtMs: Date.UTC(2026, 8, 1, 6), windowDays: 12,
      timingQuote: "9月12日前后见分晓",
    });
    const rv = customerDetail(cid).revisits as { id: number; outcome: string | null }[];
    expect(rv).toHaveLength(1);
    const id = rv[0]!.id;
    expect(revisitById(id)?.outcome).toBeNull();

    expect(setRevisitOutcome(id, "open")).toBe(true);
    expect(revisitById(id)?.outcome).toBe("open");
    setRevisitOutcome(id, "hit");
    expect(revisitById(id)?.outcome).toBe("hit");

    const st = outcomeStats();
    expect(st.hit).toBe(1);
    expect(st.miss).toBe(0);
    expect(st.byTier.find((t) => t.tier === "deep")?.hit).toBe(1);
  });

  it("the revisit email carries the three buttons when links are given", () => {
    const m = buildRevisitEmail({
      locale: "zh", question: "这单能成吗", values: [7, 8, 9, 8, 7, 8], hexName: "山火贲", changedName: "地天泰",
      timingQuote: "9月12日前后", windowDays: 12, readingUrl: "https://yaoflow.com/zh/reading?sid=x",
      castUrl: "https://yaoflow.com/zh",
      outcomeUrls: { hit: "https://yaoflow.com/o?v=hit", partial: "https://yaoflow.com/o?v=partial", miss: "https://yaoflow.com/o?v=miss", open: "https://yaoflow.com/o?v=open" },
    });
    // 09-26 四选一 · 10-07 回访改问法: the buttons name a fact, never a verdict
    expect(m.html).toContain(">发生了<");
    expect(m.html).toContain("有一点动静，但没成");
    expect(m.html).toContain("还没有，还在等");
    expect(m.html).toContain("完全没发生");
    expect(m.html).not.toContain("像说的那样");
    expect(m.html).toContain("v=partial");
    expect(m.text).toContain("https://yaoflow.com/o?v=miss");
  });

  it("ops events count and surface", () => {
    recordOps("gen_fail", "deep timeout");
    recordOps("cron_revisit", "due=0");
    const o = opsSummary();
    expect(o.genFail24h).toBe(1);
    expect(o.lastRevisitRun).not.toBeNull();
    expect(o.lastGenFail?.detail).toBe("deep timeout");
  });
});
