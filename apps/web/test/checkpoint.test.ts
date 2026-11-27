import { describe, expect, it } from "vitest";
process.env.REVISIT_SECRET ??= "test-secret";
// DATA_DIR is a fresh temp dir (test/setup.ts)
import type { LineValue } from "@yaoflow/engine";
import { parseTimingDays, timingCheckpoints, timingSegments } from "../src/lib/revisit";
import { checkpointById, checkpointsOf, db, dueCheckpoints, saveCast, scheduleRevisit, upsertCustomer } from "../src/lib/db";
import { CHECKPOINT_T, cpT, formatSpan, nextStretch } from "../src/lib/dict/checkpoint";
import { buildCheckpointEmail } from "../src/lib/email";
import { checkpointUrl, verifyCheckpointToken, verifyOutcomeToken } from "../src/lib/outcome-token";
import { LOCALES } from "../src/lib/locales";
import { resolveServerChart } from "../src/lib/reading";

/**
 * 10-12 多段应期 (进度表 §四 29): a reading that names several windows gets a check-in after each earlier one; the
 * revisit after the last still asks how it turned out. 客服 10-06: #1359's reading named 10/4–7 and 12/7–1/5 — the
 * heads-up spoke of the 7th and promised a question after it, and nothing came until December.
 */
const FROM = new Date(2026, 9, 11, 12);
const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
const segs = (t: string) => timingSegments(t, FROM).map((s) => `${fmt(s.start)}-${fmt(s.end)}`);

describe("多段应期：读出几段", () => {
  it("a sign first, then the real window — even one that crosses into next year", () => {
    expect(segs("先會有個眉目：10月17日前後他可能主動傳訊或約你。真正讓關係定下來，要等到12月7日到1月5日這一段。")).toEqual(["10/17-10/17", "12/7-1/5"]);
  });

  it("「如果那幾天沒動靜，下一個點」 and a day named inside a span stays one segment", () => {
    expect(segs("10月13日到16日之間會先有個小動靜，14日前後最明顯。如果那幾天沒消沒息，下一個點是10月18日到22日，20日前後。")).toEqual(["10/13-10/16", "10/18-10/22"]);
    expect(segs("10月16日到20日這一段，10月18日前後最可能。")).toEqual(["10/16-10/20"]);
  });

  it("the reader's own deadline is no window — and no longer pushes the revisit out", () => {
    const t = "你問的是1月20日之前，就在這個範圍內。10月13日到16日之間會先有個眉目；真正把狀態定下來，是10月24日到28日這一段，26日前後最可能。";
    expect(segs(t)).toEqual(["10/13-10/16", "10/24-10/28"]);
    expect(parseTimingDays(t, FROM)).toBe(18); // Oct 28 + 1, not the 60-day ceiling
    // without anything else named, the date still counts
    expect(parseTimingDays("你問的是10月20日之前。", FROM)).toBe(10);
  });

  it("Cantonese 號, three windows, English ranges", () => {
    expect(segs("10月13號到17號係最順嘅一段，中間10月15號前後最易成事。第四件就要等到10月19號至23號。")).toEqual(["10/13-10/17", "10/19-10/23"]);
    expect(segs("10月12日到16日最關鍵。下一個點是10月24日到28日。真正穩定下來，要拖到明年4月5日到5月5日那一段。")).toEqual(["10/12-10/16", "10/24-10/28", "4/5-5/5"]);
    expect(segs("between October 14 and 17 a first sign; the real answer comes November 3 to 7.")).toEqual(["10/14-10/17", "11/3-11/7"]);
  });
});

describe("多段应期：哪几段要来问", () => {
  it("one check-in per earlier window, with room before the final revisit", () => {
    const t = "10月13日到16日之間會先有個小動靜。下一個點是10月24日到28日。";
    const final = parseTimingDays(t, FROM)!;
    expect(timingCheckpoints(t, FROM, final).map((c) => c.days)).toEqual([6]); // the 17th
    expect(timingCheckpoints("10月13日到17日先有動靜；10月19日到23日約得成。", FROM, 13).map((c) => c.days)).toEqual([7]); // the 18th, then the 24th
  });

  it("no check-in for a single window, one too soon after the cast, or one that crowds the final revisit", () => {
    expect(timingCheckpoints("10月16日到20日這一段。", FROM, 10)).toEqual([]);
    expect(timingCheckpoints("今天10月11日晚上。真正看得出是10月16日到20日。", FROM, 10)).toEqual([]);
    expect(timingCheckpoints("10月13日到17日先有動靜；10月19日到23日約得成。", FROM, 9)).toEqual([]); // the 18th crowds a revisit on the 20th
    // a window and the very next day read as one stretch
    expect(segs("10月13日到16日先有動靜，10月17日最明顯。")).toEqual(["10/13-10/17"]);
  });

  it("at most two check-ins", () => {
    const t = "10月13日先動。10月20日再動。10月27日又動。11月5日到8日定下來。";
    expect(timingCheckpoints(t, FROM, parseTimingDays(t, FROM)!).length).toBe(2);
  });
});

describe("多段应期：排程、发信、点按", () => {
  const V: LineValue[] = [7, 8, 9, 8, 7, 6];
  const quote = "先會有個眉目：10月17日前後他可能主動傳訊或約你。真正讓關係定下來，要等到12月7日到1月5日這一段。";

  it("scheduling a revisit schedules its check-ins, once; a due one is listed with its revisit", () => {
    const cid = upsertCustomer("cp-1@example.com", "zh-hant");
    const castAt = FROM.getTime();
    const chart = resolveServerChart({ question: "他會回來嗎", values: V, castAtMs: castAt, tzOffsetMinutes: 480 }, true) as unknown as Record<string, unknown>;
    const castId = saveCast({ customerId: cid, castAtMs: castAt, tzOffsetMinutes: 480, locale: "zh-hant", question: "他會回來嗎", topic: "love", values: V, chart });
    const final = parseTimingDays(quote, FROM)!;
    const cps = timingCheckpoints(quote, FROM, final);
    expect(cps.length).toBe(1);
    const args = { sessionId: "cs_cp_1", castId, customerId: cid, email: "cp-1@example.com", locale: "zh-hant", tier: "deep", castAtMs: castAt, windowDays: final, timingQuote: quote, question: "他會回來嗎", checkpoints: cps };
    scheduleRevisit(args);
    scheduleRevisit(args);
    const rv = db().prepare("SELECT * FROM revisits WHERE session_id = 'cs_cp_1'").get() as { id: number; due_at: number; created_at: number; timing_quote: string };
    const list = checkpointsOf(rv.id);
    expect(list.length).toBe(1);
    expect(list[0]!.due_at).toBeLessThan(rv.due_at);
    db().prepare("UPDATE revisit_checkpoints SET due_at = ? WHERE id = ?").run(Date.now() - 1000, list[0]!.id);
    expect(dueCheckpoints().some((k) => k.id === list[0]!.id && k.revisit.id === rv.id)).toBe(true);
    // the page after a tap names the last window, not the 60-day ceiling
    expect(nextStretch({ ...rv, id: rv.id, created_at: FROM.getTime() }, 1, "zh-TW")).toMatch(/12月7日/);
  });

  it("a check-in link can never set a revisit's outcome, and the other way round", () => {
    const url = new URL(checkpointUrl("https://x", 5, "seen", "zh-hant"));
    const t = url.searchParams.get("t")!;
    expect(verifyCheckpointToken(5, t)).toBe(true);
    expect(verifyOutcomeToken(5, t)).toBe(false);
  });

  it("the letter names this stretch and the next, in every language, with the three taps", () => {
    for (const l of LOCALES) {
      const c = CHECKPOINT_T[l]!;
      expect(c, l).toBeTruthy();
      for (const k of ["subject", "title", "how"] as const) expect(c[k], `${l}.${k}`).toContain("{range}");
      for (const k of ["later", "pSeen", "pNone", "pUnsure"] as const) expect(c[k], `${l}.${k}`).toContain("{next}");
    }
    const m = buildCheckpointEmail({
      locale: "zh-hant", question: "他會回來嗎", hexName: "乾", timingQuote: quote,
      range: formatSpan(new Date(2026, 9, 17), new Date(2026, 9, 17), "zh-TW"), next: formatSpan(new Date(2026, 11, 7), new Date(2027, 0, 5), "zh-TW"),
      urls: { seen: "https://x/s", none: "https://x/n", unsure: "https://x/u" }, readingUrl: "https://x/r", noteUrl: "https://x/r#progress",
    });
    expect(m.subject).toBe("10月17日 這段，有沒有一點動靜？");
    expect(m.html).toContain("https://x/s");
    expect(m.html).toContain("https://x/u");
    expect(m.text).toMatch(/12月7日/);
    expect(cpT("en", "pNone", { range: "Oct 17", next: "Dec 7 – Jan 5" })).toContain("Dec 7 – Jan 5");
    expect(checkpointById(999999)).toBeNull();
  });
});
