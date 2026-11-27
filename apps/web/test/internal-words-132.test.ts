import { describe, expect, it } from "vitest";
import { internalWord, scrubInternal, scrubReading } from "../src/lib/internal-words";
import { caseForDay, casesFor, timingAhead } from "../src/lib/carousel";

/** 11-01 进度表 132 ②③: our payload's words never reach the reader; the English carousel skips cases whose days have gone by. */
describe("132 内部词 & 过期卦例", () => {
  it("drops the clause that names guard / cap / against, keeps the rest", () => {
    const t = "世爻持月建而旺。guard 判「against」：用神月破，難成。應期看寅日。";
    expect(internalWord(t)).toBe("guard");
    const s = scrubInternal(t);
    expect(s).toBe("世爻持月建而旺。應期看寅日。");
    expect(scrubInternal("用神旬空，判定为cap；先等出旬。")).toBe("先等出旬。");
    expect(scrubInternal("static_read 显示妻财持世。")).not.toContain("static_read");
  });

  it("leaves ordinary text alone, including English that says cap / against", () => {
    const en = "Don't cap your hopes; nothing here is against you.";
    expect(internalWord(en)).toBeNull();
    expect(scrubInternal(en)).toBe(en);
    expect(scrubInternal("父母爻發動，消息將至。")).toBe("父母爻發動，消息將至。");
  });

  it("walks a whole reading", () => {
    const r = { verdict: { zh: "可成。" }, basis: { zh: "guard 判定为 cap。用神月破。", en: "The use god is broken by the month." } };
    const out = scrubReading(r);
    expect(out.changed).toEqual(["basis"]);
    expect(out.reading.basis.zh).toBe("用神月破。");
    expect(out.reading.verdict.zh).toBe("可成。");
  });

  it("timingAhead reads the case's own calendar", () => {
    const c = { timing: "Around November 20.", cast_at: "2026-10-30T02:00:00.000Z", tz: -300 };
    expect(timingAhead(c, "2026-11-01")).toBe(true);
    expect(timingAhead(c, "2026-11-25")).toBe(false);
  });

  it("caseForDay prefers a case still ahead; the index is its place in the whole list", () => {
    const day = "2026-11-01";
    const list = casesFor("en");
    const { index, c } = caseForDay("en", day);
    expect(list[index]).toBe(c);
    if (list.some((x) => timingAhead(x, day))) expect(timingAhead(c, day)).toBe(true);
  });
});
