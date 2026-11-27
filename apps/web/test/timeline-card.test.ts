import { describe, expect, it } from "vitest";
import { buildTimeline } from "../src/lib/timeline";
import { timelineGoogleUrl, timelineIcs } from "../src/lib/timeline-cal";
import { CONVERT_T, cv } from "../src/lib/dict/convert";

/** 10-14 进度表 §四 44 应期时间轴 + 43 付费卡. */
const CAST = Date.UTC(2026, 9, 13, 4); // 10-13 12:00 Taipei
describe("应期时间轴", () => {
  it("draws the windows the prose names, the second one too, and the return day from the revisit", () => {
    const t = buildTimeline({ timing: "10月15日到19日之間，17日前後最可能；如果那幾天沒動靜，下一個點是10月25日到29日。", castAtMs: CAST, tzOffsetMinutes: 480, revisitDueAt: Date.UTC(2026, 9, 29, 16) })!;
    expect(t.start).toBe("2026-10-13");
    expect(t.windows).toEqual([{ start: "2026-10-15", end: "2026-10-19" }, { start: "2026-10-25", end: "2026-10-29" }]);
    expect(t.revisit).toBe("2026-10-30");
  });
  it("the reader's own range said back (你問年底前，即係…) is not a window", () => {
    const yue = buildTimeline({ timing: "你問年底前，即係10月14日到12月31日，機會就喺呢個範圍入面。最旺係10月15日到18日呢幾日，16號前後最似有動靜；跟住10月26日到30日，28號前後仲有一轉。", castAtMs: Date.UTC(2026, 9, 14, 4), tzOffsetMinutes: 480 })!;
    expect(yue.windows).toEqual([{ start: "2026-10-15", end: "2026-10-18" }, { start: "2026-10-26", end: "2026-10-30" }]);
    const zh = buildTimeline({ timing: "你问的这周就是10月14日到18日，答案是：就在这周内，10月15日到19日之间最可能，17日前后最像。", castAtMs: Date.UTC(2026, 9, 14, 4), tzOffsetMinutes: 480 })!;
    expect(zh.windows[0]).toEqual({ start: "2026-10-15", end: "2026-10-19" });
    const one = buildTimeline({ timing: "你問的一個月後，就是國曆11月10日到11月16日。最可能在11月9日到13日之間；在那之前，10月16日到20日會先有一次聯絡。", castAtMs: Date.UTC(2026, 9, 14, 4), tzOffsetMinutes: 480 })!;
    expect(one.windows).toEqual([{ start: "2026-10-16", end: "2026-10-20" }, { start: "2026-11-09", end: "2026-11-13" }]);
  });
  it("no window in the prose, no timeline — nothing invented", () => {
    expect(buildTimeline({ timing: "這件事急不得，先把自己的事做好。", castAtMs: CAST, tzOffsetMinutes: 480 })).toBeNull();
    expect(buildTimeline({ timing: null, castAtMs: CAST, tzOffsetMinutes: 480 })).toBeNull();
  });
  it("without a revisit yet, the day after the last window", () => {
    const t = buildTimeline({ timing: "10月15日到19日之間。", castAtMs: CAST, tzOffsetMinutes: 480 })!;
    expect(t.revisit).toBe("2026-10-20");
  });
  it("the calendar file and link carry the kind of matter and a link — never the question", () => {
    const t = buildTimeline({ timing: "10月15日到19日之間。", castAtMs: CAST, tzOffsetMinutes: 480 })!;
    const ics = timelineIcs(t, { window: "YaoFlow：這件事的應期窗口", revisit: "YaoFlow：回訪日", kind: "問題類型：感情", link: "https://yaoflow.com/zh-hant/matter/12" }, "x");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261015");
    expect(ics).toContain("DTEND;VALUE=DATE:20261020"); // all-day end is the next day
    expect(ics).toContain("DTSTART;VALUE=DATE:20261020");
    expect(ics).toContain("問題類型：感情");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    const g = timelineGoogleUrl(t, { window: "YaoFlow：這件事的應期窗口", kind: "問題類型：感情", link: "https://yaoflow.com/zh-hant/matter/12" });
    expect(g).toContain("dates=20261015%2F20261020");
  });
});

describe("付费卡重写", () => {
  it("every language has the card's words, and none promise or name anyone", () => {
    for (const [l, tbl] of Object.entries(CONVERT_T)) {
      for (const k of ["cdLead", "cdTitle", "cdWin", "cdBasis", "cdRevisit", "cdTrust", "cdTrustMember", "cdNot"] as const) expect((tbl as Record<string, string>)[k], `${l}.${k}`).toBeTruthy();
    }
    expect(cv("zh-hant", "cdTitle")).toBe("想知道這件事大約哪幾天見分曉？");
    expect(cv("zh-hant", "cdLead")).toBe("應期到的那天，我們回來問你結果。");
    expect(cv("zh-hant", "cdTrust")).toBe("你的問題不會公開｜不會自動轉訂閱");
    for (const tbl of Object.values(CONVERT_T)) expect(JSON.stringify(tbl)).not.toMatch(/準確|准确|靈驗|灵验|神明說/);
  });
});
