import { describe, expect, it } from "vitest";
import { addZeriRemind, cancelMyZeriRemind, myZeriReminds } from "@/lib/mingli/calendar/zeri-remind";

describe("擇日提醒（登入一鍵）", () => {
  const now = Date.UTC(2026, 9, 18, 4);
  it("keeps one reminder per day and matter, lists and cancels the reader's own", () => {
    const e = "zr@example.com";
    expect(addZeriRemind({ email: e, ymd: "2026-10-23", slug: "banjia", locale: "zh-hant" }, now).ok).toBe(true);
    expect(addZeriRemind({ email: e, ymd: "2026-10-23", slug: "banjia", locale: "zh-hant" }, now).ok).toBe(true);
    expect(addZeriRemind({ email: e, ymd: "2026-10-26", slug: "banjia", locale: "zh-hant" }, now).ok).toBe(true);
    expect(myZeriReminds(e, "banjia", now)).toEqual(["2026-10-23", "2026-10-26"]);
    expect(myZeriReminds("other@example.com", "banjia", now)).toEqual([]);
    expect(cancelMyZeriRemind(e, "2026-10-23", "banjia", now)).toBe(true);
    expect(myZeriReminds(e, "banjia", now)).toEqual(["2026-10-26"]);
  });
});
