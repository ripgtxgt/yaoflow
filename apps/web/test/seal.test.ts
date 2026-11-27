import { describe, expect, it } from "vitest";
// DATA_DIR is a fresh temp dir (test/setup.ts)
import type { LineValue } from "@yaoflow/engine";
import {
  db, markSealWatcherNotified, recordOrder, saveCast, saveReading, scheduleRevisit, sealData,
  sealWatcherCount, sealWatchersToNotify, setRevisitOutcome, revisitBySession, upsertCustomer, watchSeal,
} from "../src/lib/db";
import { parseProofRef, parseSealRef, proofToken, sealToken, sealUrl, verifyProofToken, verifySealToken } from "../src/lib/outcome-token";
import { sealState } from "../src/lib/seal";
import { buildSealEmail } from "../src/lib/email";
import { resolveServerChart } from "../src/lib/reading";
import { LOCALES } from "../src/lib/locales";

/**
 * 封卦 (09-21, A1 — 裂变玩法调研 §2.2 Long Bets「可问责预测」):
 * a prediction is public BEFORE it is settled, and the page turns over by
 * itself when the person who cast it says how it went. Never the question.
 */
const V: LineValue[] = [7, 8, 9, 8, 7, 8];
const AT = Date.UTC(2026, 8, 1, 3);

function deep(sid: string, email: string, quote: string | null, windowDays: number) {
  const cid = upsertCustomer(email, "zh");
  const input = { question: "这件事该不该现在开口", values: V, castAtMs: AT, tzOffsetMinutes: 480 };
  const chart = resolveServerChart(input, true) as unknown as Record<string, unknown>;
  const castId = saveCast({ customerId: cid, castAtMs: AT, tzOffsetMinutes: 480, locale: "zh", question: input.question, topic: "career", values: V, chart });
  saveReading(castId, cid, "deep", "zh", { verdict: { zh: "可成。" }, tendency: { zh: "x" }, timing: { zh: quote ?? "" }, basis: { zh: "世爻旺相" }, strategy: { zh: "x" }, caution: { zh: "y" }, next_step: { zh: "z" }, closing: { zh: "w" } } as never);
  recordOrder({ sessionId: sid, customerId: cid, castId, tier: "deep", amountCents: 999, currency: "USD", email, status: "paid" });
  scheduleRevisit({ sessionId: sid, castId, customerId: cid, email, locale: "zh", tier: "deep", castAtMs: AT, windowDays, timingQuote: quote });
  return revisitBySession(sid)!;
}

describe("封卦", () => {
  it("signs its own message — a seal link is neither a proof link nor a set-outcome link", () => {
    process.env.ADMIN_KEY ??= "test-admin-key";
    expect(sealToken(7)).not.toBe(proofToken(7));
    expect(verifySealToken(7, sealToken(7))).toBe(true);
    expect(verifySealToken(7, proofToken(7))).toBe(false);
    expect(verifyProofToken(7, sealToken(7))).toBe(false);
    expect(verifySealToken(8, sealToken(7))).toBe(false);
    const url = sealUrl("https://yaoflow.com", 7, "ja");
    expect(url).toContain("/ja/seal/7-");
    expect(parseSealRef(url.split("/seal/")[1]!)).toEqual({ id: 7, token: sealToken(7) });
    expect(parseSealRef("nope")).toBeNull();
    // the two refs have the same shape on purpose; the signature is what differs
    expect(parseProofRef(`7-${sealToken(7)}`)).not.toBeNull();
  });

  it("exists from the moment the reading named a window, and carries no question", () => {
    const r = deep("cs_seal_1", "s1@example.com", "10 月 8 日前会有回音", 30);
    const d = sealData(r.id)!;
    expect(d.timing_quote).toBe("10 月 8 日前会有回音");
    expect(d.outcome).toBeNull();
    expect(JSON.stringify(d)).not.toContain("该不该现在开口");
    expect(d.values_str).toBe("7,8,9,8,7,8");
    expect(d.primary_num).toBeGreaterThan(0);
  });

  it("shows four faces: open while the window runs, hit / miss once answered, silent when it passed unanswered", () => {
    const soon = { due_at: Date.now() + 86_400_000, outcome: null, outcome_at: null } as const;
    const past = { due_at: Date.now() - 86_400_000, outcome: null, outcome_at: null } as const;
    expect(sealState(soon)).toBe("open");
    expect(sealState(past)).toBe("silent");
    // "还没定" settles nothing — the page keeps waiting rather than claiming an answer
    expect(sealState({ ...past, outcome: "open" })).toBe("silent");
    expect(sealState({ ...past, outcome: "hit", outcome_at: Date.now() })).toBe("hit");
    expect(sealState({ ...soon, outcome: "miss", outcome_at: Date.now() })).toBe("miss");
  });

  it("collects watchers once per address and tells each of them once, after it settles", () => {
    const r = deep("cs_seal_2", "s2@example.com", "十月中旬", 20);
    expect(watchSeal(r.id, "Watcher@Example.com", "en")).toBe(true);
    expect(watchSeal(r.id, "watcher@example.com", "en")).toBe(false); // same address, normalised
    expect(watchSeal(r.id, "other@example.com", "ja")).toBe(true);
    expect(sealWatcherCount(r.id)).toBe(2);
    // nothing to announce while it is unsettled
    expect(sealWatchersToNotify(50).filter((w) => w.revisit_id === r.id)).toHaveLength(0);
    setRevisitOutcome(r.id, "miss");
    const pending = sealWatchersToNotify(50).filter((w) => w.revisit_id === r.id);
    expect(pending.map((w) => w.email).sort()).toEqual(["other@example.com", "watcher@example.com"]);
    for (const w of pending) markSealWatcherNotified(w.id);
    expect(sealWatchersToNotify(50).filter((w) => w.revisit_id === r.id)).toHaveLength(0); // never twice
  });

  it("writes the reveal letter for either verdict, in every locale, without the question", () => {
    for (const l of LOCALES) {
      const m = buildSealEmail({ locale: l, hexName: "山天大畜", timingQuote: "10 月 8 日前会有回音", hit: true, sealUrl: "https://yaoflow.com/x/seal/1-a", castUrl: "https://yaoflow.com/x" });
      expect(m.subject).toContain("山天大畜");
      expect(m.html).toContain("background:#f4f2ec;color:#14151c");
      expect(m.html).toContain("10 月 8 日前会有回音");
      expect(m.text).not.toMatch(/\{hex\}/);
    }
    expect(buildSealEmail({ locale: "zh", hexName: "咸", timingQuote: null, hit: true, sealUrl: "a", castUrl: "b" }).text).toContain("应验了");
    expect(buildSealEmail({ locale: "zh", hexName: "咸", timingQuote: null, hit: false, sealUrl: "a", castUrl: "b" }).text).toContain("没应验");
    expect(buildSealEmail({ locale: "en", hexName: "Influence", timingQuote: null, hit: false, sealUrl: "a", castUrl: "b" }).text).toContain("it didn't");
  });

  it("a reading with no timing line has no seal to offer", () => {
    const r = deep("cs_seal_3", "s3@example.com", null, 14);
    expect(sealData(r.id)!.timing_quote).toBeNull();
    // the reading page only mints a seal when timing_quote is present (see reading/page.tsx)
    const row = db().prepare("SELECT timing_quote FROM revisits WHERE id = ?").get(r.id) as { timing_quote: string | null };
    expect(row.timing_quote).toBeNull();
  });
});
