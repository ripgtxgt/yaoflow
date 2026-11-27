import { describe, expect, it } from "vitest";
import type { LineValue } from "@yaoflow/engine";
import {
  castsInMatter, createMatter, matterById, matterForSession, mattersForCustomer, recordOrder, saveCast, saveProgressNote, saveReading,
  sessionMatter, setCastMatter, upsertCustomer,
} from "../src/lib/db";
import { fallbackTitle, fileCast, parseMatterAnswer, resolveSessionMatter, ruleMatter } from "../src/lib/matter-assign";
import { moveCast } from "../src/lib/matter-move";
import { matterSoFar } from "../src/lib/matter-context";
import { buildUserPayload, resolveServerChart, resolveTiming } from "../src/lib/reading";
import { MATTER_T } from "../src/lib/dict/matter";
import { LOCALES } from "../src/lib/locales";

const V: LineValue[] = [7, 8, 9, 7, 8, 8];
const AT = Date.UTC(2026, 8, 27, 12);

function cast(cid: number, question: string, sid: string, at = AT, deep = true) {
  const chart = resolveServerChart({ question, values: V, castAtMs: at, tzOffsetMinutes: -480 }, true) as unknown as Record<string, unknown>;
  const castId = saveCast({ customerId: cid, castAtMs: at, tzOffsetMinutes: -480, locale: "zh-hant", question, topic: "relationship", values: V, chart });
  saveReading(castId, cid, deep ? "deep" : "one", "zh-hant", deep
    ? { verdict: { "zh-hant": "會聯絡，但不是現在。" }, timing: { "zh-hant": "10月3日到8日之間。" }, tendency: { "zh-hant": "x" }, basis: { "zh-hant": "x" }, strategy: { "zh-hant": "x" }, caution: { "zh-hant": "x" }, next_step: { "zh-hant": "x" }, closing: { "zh-hant": "x" } }
    : { summary: { "zh-hant": "他還在猶豫。" } } as never);
  recordOrder({ sessionId: sid, customerId: cid, castId, tier: deep ? "deep" : "one", amountCents: 0, currency: null, email: null, status: "subscription" });
  return castId;
}

describe("「一件事」 (09-29)", () => {
  it("every language has every key", () => {
    const keys = Object.keys(MATTER_T.zh).sort();
    for (const l of LOCALES) {
      const row = (MATTER_T as Record<string, Record<string, string>>)[l];
      expect(Object.keys(row).sort(), l).toEqual(keys);
      for (const k of keys) {
        expect(row[k]!.length, `${l}.${k}`).toBeGreaterThan(0);
        expect((row[k]!.match(/\{\w+\}/g) ?? []).sort(), `${l}.${k}`).toEqual(((MATTER_T.zh as Record<string, string>)[k]!.match(/\{\w+\}/g) ?? []).sort());
      }
    }
  });

  it("reads the model's answer, never a matter that was not offered", () => {
    expect(parseMatterAnswer('{"matter": 12, "title": "和大叔的關係。"}', new Set([12]))).toEqual({ matter: 12, title: "和大叔的關係" });
    expect(parseMatterAnswer('{"matter": 99, "title": "x"}', new Set([12]))?.matter).toBeNull();
    expect(parseMatterAnswer('{"matter": null, "title": "轉職面試"}', new Set([12]))).toEqual({ matter: null, title: "轉職面試" });
    expect(parseMatterAnswer("not json", new Set())).toBeNull();
  });

  it("the word rules: shared words, or a love question right after a love matter", () => {
    const now = AT;
    const cands = [
      { id: 1, customer_id: 1, created_at: now - 1e6, last_at: now - 3_600_000, title: "t", title_by: "model", topic: "relationship", questions: ["我跟大叔什麼時候會恢復曖昧"] },
      { id: 2, customer_id: 1, created_at: now - 1e6, last_at: now - 3_600_000, title: "t", title_by: "model", topic: "career", questions: ["面試會過嗎"] },
    ];
    expect(ruleMatter(cands, "大叔什麼時候會恢復曖昧呢", "relationship", "zh-hant", now)).toBe(1);
    expect(ruleMatter(cands, "明年2月會怎麼相處", "relationship", "zh-hant", now)).toBe(1); // no shared word, same kind of matter, same evening
    expect(ruleMatter(cands, "要不要換房子", "other", "zh-hant", now)).toBeNull();
    expect(fallbackTitle("一".repeat(30), "zh-hant").length).toBe(17);
  });

  it("a session's matter is decided once; the cast saved later lands in it", async () => {
    const cid = upsertCustomer("matter-a@example.com", "zh-hant");
    // nothing open yet: decided without waiting on the model
    const mid = await resolveSessionMatter("sub_matter_1", cid, "大叔還會找我嗎", "relationship", "zh-hant");
    expect(mid).toBeTruthy();
    expect(sessionMatter("sub_matter_1")).toBe(mid);
    expect(await resolveSessionMatter("sub_matter_1", cid, "whatever", "relationship", "zh-hant")).toBe(mid);
    const c1 = cast(cid, "大叔還會找我嗎", "sub_matter_1");
    fileCast(c1, "sub_matter_1", cid, "大叔還會找我嗎", "relationship", "zh-hant");
    expect(matterForSession("sub_matter_1")).toBe(mid);
    expect(castsInMatter(mid!).map((c) => c.id)).toEqual([c1]);
    expect(mattersForCustomer(cid)).toHaveLength(1);
  });

  it("the matter so far: earlier casts and the reader's notes; the light tier sees no dates", () => {
    const cid = upsertCustomer("matter-b@example.com", "zh-hant");
    const m = createMatter(cid, "和大叔的關係", "model", "relationship", AT - 86_400_000);
    const c1 = cast(cid, "大叔還會找我嗎", "sub_mb_1", AT - 86_400_000);
    setCastMatter(c1, m, "model");
    saveProgressNote(c1, "他今天回了一個貼圖", "回應");
    const c2 = cast(cid, "明年2月會怎麼相處", "sub_mb_2", AT, false);
    setCastMatter(c2, m, "model");

    const so = matterSoFar(m, { sessions: ["sub_mb_2"] }, "zh-hant")!;
    expect(so.title).toBe("和大叔的關係");
    expect(so.earlier_casts).toHaveLength(1);
    expect(so.earlier_casts[0]!.question).toBe("大叔還會找我嗎");
    expect(so.earlier_casts[0]!.call).toContain("會聯絡");
    expect(so.earlier_casts[0]!.timing).toContain("10月3日");
    expect(so.reader_notes[0]!.note).toBe("他今天回了一個貼圖");

    const chart = resolveServerChart({ question: "q", values: V, castAtMs: AT, tzOffsetMinutes: -480 }, true);
    const timing = resolveTiming({ question: "q", values: V, castAtMs: AT, tzOffsetMinutes: -480 }, chart, true);
    const deep = JSON.parse(buildUserPayload("q", chart, timing, { matter: so }));
    expect(deep.matter_so_far.earlier_casts[0].timing).toContain("10月3日");
    const light = JSON.parse(buildUserPayload("q", chart, timing, { tellTime: false, matter: so }));
    expect(light.matter_so_far.earlier_casts[0].timing).toBeUndefined();
    expect(light.matter_so_far.reader_notes).toHaveLength(1);
  });

  it("a cast can move to another matter or out on its own; an emptied matter goes away", () => {
    const cid = upsertCustomer("matter-c@example.com", "zh-hant");
    const other = upsertCustomer("matter-d@example.com", "zh-hant");
    const a = createMatter(cid, "A", "model", "relationship", AT);
    const b = createMatter(cid, "B", "model", "career", AT);
    const c1 = cast(cid, "q1", "sub_mc_1");
    const c2 = cast(cid, "q2", "sub_mc_2");
    setCastMatter(c1, a, "model");
    setCastMatter(c2, a, "model");
    expect(moveCast(c2, b, cid, null, "reader")).toBe(b);
    expect(matterForSession("sub_mc_2")).toBe(b);
    expect(sessionMatter("sub_mc_2")).toBe(b);
    const fresh = moveCast(c1, null, cid, "新的", "reader")!;
    expect(fresh).not.toBe(a);
    expect(matterById(a)).toBeNull(); // nothing left in it
    expect(moveCast(c1, b, other, null, "reader")).toBeNull(); // not theirs
  });
});
