import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { ENTRY_T } from "../src/lib/dict/entry";
import { LOCALES } from "../src/lib/locales";
import { gateVerdict, TOPIC_CAP, type PastCast } from "../src/lib/repeat-gate";
import { POST as trackPOST } from "../src/app/api/track/route";
import { eventLabel } from "../src/lib/live-labels";

/**
 * 10-02 (Neil: 「直接做 1 吧」): the topic cap no longer stops a cast. The gate's verdict is unchanged — the cast page
 * now lets a "cap" verdict through, gives no free line, and shows a word about 一事一占 instead.
 */
describe("一事一占：问满后照常起卦", () => {
  it("the verdict for the fourth cast on one topic is still 'cap' (the page decides what it means)", () => {
    const now = Date.now();
    const list: PastCast[] = Array.from({ length: TOPIC_CAP }, (_, i) => ({
      q: `different question number ${i} about my job`, at: now - (i + 1) * 3_600_000, hex: "乾為天", topic: "career", det: "career",
    }));
    const v = gateVerdict(list, "should I accept the new offer from another firm", "career", "en", now, "career");
    expect(v?.kind).toBe("cap");
  });

  it("the note exists in every language, with the count and the last figure", () => {
    for (const l of LOCALES) {
      const c = ENTRY_T[l]!;
      for (const k of ["capNoteTopic", "capNoteCircling"] as const) {
        expect(c[k], `${l}.${k}`).toContain("{n}");
        expect(c[k], `${l}.${k}`).toContain("{hex}");
      }
    }
  });

  it("the event is accepted and has a name on the live board", async () => {
    const res = await trackPOST(new NextRequest("http://localhost/api/track", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ e: "repeat_capped", s: "abcdefgh1234", locale: "zh-hant", method: "topic", hex: 3, mem: 0 }),
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(eventLabel("repeat_capped")).toContain("免费一句");
  });
});
