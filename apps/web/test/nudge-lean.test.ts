import { describe, expect, it, vi, beforeAll, afterEach } from "vitest";
import type { LineValue } from "@yaoflow/engine";

/**
 * 10-05 不顺卦话术 (Neil: 「要，然后把下面这个也做了」): a free line that leaned against the reader paid half as often as a
 * "mixed" one (10-03..05: 4.7% vs 8.8%). Three seeds, one per stage, are shown only after such a line; on such casts
 * every version is judged by its results after such lines; the learner may draft more of them.
 * 10-06 瘦身: at most two versions per slot — the bad-line version is tried at the 3rd cast (n3-bad); n2-bad and n4-bad
 * were retired by the one-time cut (words kept, can be switched back on).
 */
const llm = vi.hoisted(() => ({ json: [] as unknown[] }));
vi.mock("../src/lib/llm", async (orig) => {
  const real = await orig<typeof import("../src/lib/llm")>();
  return {
    ...real,
    chatJson: vi.fn(async () => { const v = llm.json.shift(); if (v === undefined) throw new Error("no model in tests"); if (v instanceof Error) throw v; return v as string; }),
    chatText: vi.fn(async () => { throw new Error("no model in tests"); }),
  };
});

const { db, recordOrder } = await import("../src/lib/db");
const cl = await import("../src/lib/cast-log");
const nudge = await import("../src/lib/nudge");
const { LOCALES } = await import("../src/lib/locales");

const H = 3_600_000;
const NOW = Date.now();
const V1: LineValue[] = [7, 8, 7, 8, 7, 8];
const V2: LineValue[] = [9, 8, 7, 7, 8, 6];
const inp = (question: string, at: number, values: LineValue[] = V1) => ({ question, values, castAtMs: at, tzOffsetMinutes: 480 });

afterEach(() => { llm.json.length = 0; delete process.env.NUDGE_PERSONAL; });
beforeAll(() => { nudge.variants("n2"); });

let seq = 0;
/** One reader, one matter: a first cast whose line leaned `lean` (a block was shown), then a second cast. */
async function secondCast(lean: string | null): Promise<NonNullable<Awaited<ReturnType<typeof cl.logCast>>>> {
  seq += 1;
  const bid = `ba${String(seq).padStart(14, "0")}`;
  const t0 = NOW - 10 * H + seq * 60_000;
  const a1 = (await cl.logCast({ bid, input: inp("他還會回來嗎", t0), locale: "zh-hant" }))!;
  cl.setLogTeaser(a1.logId, "他那邊沒有要回頭的意思。", null);
  db().prepare("UPDATE cast_log SET lean = ?, nudge = 'n2-plain', nudge_seen = 1 WHERE id = ?").run(lean, a1.logId);
  return (await cl.logCast({ bid, input: inp("他還會回來嗎", t0 + H, V2), locale: "zh-hant" }))!;
}

describe("不顺卦话术：三个版本，只给上一句偏凶的人", () => {
  it("the seeds are in, in every language, within the guards, and marked lean:bad; since 10-06 only the 3rd cast's is live", () => {
    for (const id of ["n2-bad", "n3-bad", "n4-bad"]) {
      const v = nudge.variantById(id)!;
      expect(v).toMatchObject({ status: id === "n3-bad" ? "active" : "retired", source: "seed", segment: "lean:bad" });
      for (const l of LOCALES) expect(nudge.nudgeOffenses(v.texts[l]!, l), `${id}/${l}`).toEqual([]);
    }
    expect(nudge.variantById("n2-bad")!.status_why).toContain("10-06 瘦身");
    expect(nudge.segmentOf("lean:bad")).toEqual({ kind: "lean", value: "bad" });
    expect(nudge.segmentOf("topic:career")).toEqual({ kind: "topic", value: "career" });
    expect(nudge.leanSegment("bad")).toBe("lean:bad");
    expect(nudge.leanSegment("mixed")).toBeNull();
  });

  it("leanSeen: this cast's line when judged, else the latest judged earlier line", () => {
    const row = (lean: string | null) => ({ lean } as unknown as import("../src/lib/cast-log").LogRow);
    expect(nudge.leanSeen({ row: row(null), earlier: [row("mixed"), row("bad"), row(null)] })).toBe("bad");
    expect(nudge.leanSeen({ row: row("good"), earlier: [row("bad")] })).toBe("good");
    expect(nudge.leanSeen({ row: row(null), earlier: [] })).toBeNull();
  });

  it("the draw: after a line that leaned against them the bad version is among the picks; otherwise never", () => {
    const picks = (ctx: { lean?: string | null; topic?: string | null }) => new Set(Array.from({ length: 300 }, () => nudge.pickVariant("n3", "zh-hant", NOW, Math.random, { ...ctx, personal: false })!.id));
    expect(picks({ lean: "bad" }).has("n3-bad")).toBe(true);
    expect(picks({ lean: "bad", topic: "relationship" }).has("n3-bad")).toBe(true);
    expect(picks({ lean: "mixed" }).has("n3-bad")).toBe(false);
    expect(picks({}).has("n3-bad")).toBe(false);
    expect(picks({ topic: "career" }).has("n3-bad")).toBe(false);
    // 10-06: the 2nd cast keeps its two ready versions only — the retired bad version never joins
    expect(new Set(Array.from({ length: 200 }, () => nudge.pickVariant("n2", "zh-hant", NOW, Math.random, { lean: "bad", personal: false })!.id))).toEqual(new Set(["n2-merge", "n2-plain"]));
  });

  it("nudgeFor writes the lean the reader last saw on the cast; a mixed line writes nothing", async () => {
    process.env.NUDGE_PERSONAL = "off";
    const bad = await secondCast("bad");
    const out = await nudge.nudgeFor(bad, "zh-hant", NOW);
    expect(out).not.toBeNull();
    expect(cl.logRow(bad.logId)!.nudge_lean).toBe("bad");
    const mixed = await secondCast("mixed");
    await nudge.nudgeFor(mixed, "zh-hant", NOW);
    expect(cl.logRow(mixed.logId)!.nudge_lean ?? null).toBeNull();
  });

  it("on such casts every version is judged by its results after such lines", () => {
    const d = db();
    const put = (bid: string, variant: string, lean: string | null, i: number) =>
      d.prepare(`INSERT INTO cast_log (bid, s, at, tz, locale, question, values_str, primary_num, thread_n, nudge, nudge_seen, nudge_lean, created_at, updated_at)
                 VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?)`).run(bid, `tablean${String(i).padStart(5, "0")}`, NOW - 5 * 24 * H - i, 480, "zh-hant", "q", "787878", 1, 3, variant, lean, NOW - 5 * 24 * H, NOW - 5 * 24 * H);
    // n3-settle: 40 showings after a bad line, none paid; 40 after other lines, 20 paid
    for (let i = 0; i < 40; i++) put(`cccccccccc00${String(i).padStart(4, "0")}`, "n3-settle", "bad", i);
    for (let i = 0; i < 40; i++) put(`cccccccccc01${String(i).padStart(4, "0")}`, "n3-settle", null, 100 + i);
    for (let i = 0; i < 20; i++) {
      d.prepare("INSERT OR IGNORE INTO tab_browsers (s, bid, at) VALUES (?,?,?)").run(`tablean${String(100 + i).padStart(5, "0")}`, `cccccccccc01${String(i).padStart(4, "0")}`, NOW - 5 * 24 * H);
      recordOrder({ sessionId: `cs_lean_${i}`, customerId: null, castId: null, tier: "deep", amountCents: 7500, currency: "twd", email: null, status: "paid", firstDeep: true, browserSid: `tablean${String(100 + i).padStart(5, "0")}` });
      d.prepare("UPDATE orders SET created_at = ? WHERE session_id = ?").run(NOW - 5 * 24 * H + 2 * H, `cs_lean_${i}`);
    }
    const s = nudge.variantStats("n3", NOW, true).get("n3-settle")!;
    expect(s.byLean.bad).toMatchObject({ settled: 40, paid: 0 });
    expect(s.paid).toBe(20);
    // overall it looks strong; after a bad line it has done nothing — the posterior for such a cast says so
    const [a1, b1] = nudge.posteriorFor(s, {});
    const [a2, b2] = nudge.posteriorFor(s, { lean: "bad" });
    expect(a1 / (a1 + b1)).toBeGreaterThan(0.2);
    expect(a2 / (a2 + b2)).toBeLessThan(0.06);
    // 10-06: with the slot's pool as the prior, a version with no data of its own sits at the slot's rate, not at 50%
    const pool = nudge.poolOf(nudge.variantStats("n3", NOW, true).values());
    expect(pool).toEqual({ paid: 20, settled: 80 });
    const [a3, b3] = nudge.basePosterior(undefined, pool);
    expect(a3 / (a3 + b3)).toBeCloseTo(21 / 82, 6);
    expect(a3 + b3).toBeCloseTo(20, 6);
    // the version meant for such lines is judged on them: a loser there is retired on those numbers
    d.prepare("INSERT INTO nudge_variants (id, slot, status, source, texts_json, created_at, updated_at, segment) VALUES (?,?,?,?,?,?,?,?)")
      .run("ai-n3-lean-loser", "n3", "active", "ai", JSON.stringify({ "zh-hant": { title: "t", body: "深斷把這幾卦一起讀完，說清楚卡在哪。", cta: "斷 · {price}" } }), NOW, NOW, "lean:bad");
    for (let i = 0; i < 90; i++) put(`cccccccccc02${String(i).padStart(4, "0")}`, "ai-n3-lean-loser", "bad", 200 + i);
    // and a strong one after bad lines, so the loser has something to lose to
    for (let i = 0; i < 30; i++) {
      put(`cccccccccc03${String(i).padStart(4, "0")}`, "n3-bad", "bad", 300 + i);
      if (i < 12) {
        d.prepare("INSERT OR IGNORE INTO tab_browsers (s, bid, at) VALUES (?,?,?)").run(`tablean${String(300 + i).padStart(5, "0")}`, `cccccccccc03${String(i).padStart(4, "0")}`, NOW - 5 * 24 * H);
        recordOrder({ sessionId: `cs_lean_w_${i}`, customerId: null, castId: null, tier: "deep", amountCents: 7500, currency: "twd", email: null, status: "paid", firstDeep: true, browserSid: `tablean${String(300 + i).padStart(5, "0")}` });
        d.prepare("UPDATE orders SET created_at = ? WHERE session_id = ?").run(NOW - 5 * 24 * H + 2 * H, `cs_lean_w_${i}`);
      }
    }
    expect(nudge.retireLosers(NOW)).toContain("ai-n3-lean-loser");
    expect(nudge.variantById("ai-n3-lean-loser")!.status_why).toContain("lean:bad");
    expect(nudge.variantById("n3-bad")!.status).toBe("active"); // 12/30 after bad lines: the strong one, not a loser
  });

  it("a draft may be meant for readers whose last line leaned against them; a hand-added one too", async () => {
    llm.json.push(JSON.stringify({ variants: [
      { title: "卦不順，先看卡在哪", body: "上一句不順，再問也問不出別的。深斷把這幾卦一起讀，說清楚卡在哪一環、現在能做的一步、哪幾天會鬆動。", cta: "看卡在哪 · {price}", for_lean: "bad", idea: "x" },
    ] }));
    llm.json.push(JSON.stringify({ ok: true })); // the claim check
    const r = await nudge.draftVariants("n3", "zh-hant", { count: 1, now: NOW });
    expect(r.created).toHaveLength(1);
    expect(nudge.variantById(r.created[0]!.id)!.segment).toBe("lean:bad");
    const h = nudge.addVariant("n4", "zh-hant", { title: "不順的卦也有路", body: "深斷把這 {n} 卦一起讀完，說清楚卡在哪、現在先做哪一步、什麼時候會鬆動。", cta: "看卡在哪 · {price}" }, NOW, "lean:bad");
    expect(h.id).toBeTruthy();
    expect(nudge.variantById(h.id!)!.segment).toBe("lean:bad");
    expect(nudge.addVariant("n4", "zh-hant", { title: "x", body: "深斷把這 {n} 卦一起讀完，說清楚卡在哪、現在先做哪一步。", cta: "看 · {price}" }, NOW, "career").id).toBeTruthy();
  });
});
