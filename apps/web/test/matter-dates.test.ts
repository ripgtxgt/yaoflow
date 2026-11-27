import { describe, expect, it } from "vitest";
import { matterDates } from "../src/lib/matter-dates";

const DAY = 86_400_000;

/** 10-01 (#838): every date a matter's readings and follow-ups named, in one list. */
describe("matterDates", () => {
  const at = new Date(2026, 8, 29, 12).getTime();
  const now = new Date(2026, 9, 1, 12).getTime();
  const out = matterDates([
    { kind: "reading", castId: 1, sessionId: "sub_a", at, text: "這個月（9月26日到30日）不會有消息。最可能先有動靜的是10月3日到7日之間，5日前後他會先探個頭。" },
    { kind: "followup", castId: 1, sessionId: "sub_a", at: at + DAY, text: "如果你問十月中，10月14日到18日之間比較像真正的轉折。在那之前別急。" },
    { kind: "followup", castId: 1, sessionId: "sub_a", at: at + 2 * DAY, text: "還是一樣：10月3日到7日之間。沒有日期的句子不收。" },
  ], now);

  it("pulls one entry per dated sentence, sorted by date, with no duplicate windows", () => {
    expect(out.map((d) => [new Date(d.start).getDate(), new Date(d.end).getDate(), d.kind])).toEqual([
      [26, 30, "reading"],
      [3, 7, "reading"],
      [14, 18, "followup"],
    ]);
  });

  it("marks where each window stands against now", () => {
    expect(out.map((d) => d.status)).toEqual(["past", "soon", "later"]);
  });

  it("is empty for text without dates", () => {
    expect(matterDates([{ kind: "reading", castId: 2, sessionId: null, at, text: "短期內不會有變化。" }], now)).toEqual([]);
  });

  it("splits a sentence that names separate days, keeps a window inside one clause", () => {
    const r = matterDates([{ kind: "followup", castId: 3, sessionId: null, at, text: "最近的是10月3日（庚子日），再往後10月15日。9月30日或10月2日前後先有動靜；真正上線要等到明年2月4日到3月5日這一段。" }], now);
    expect(r.map((d) => [new Date(d.start).getMonth() + 1, new Date(d.start).getDate(), new Date(d.end).getMonth() + 1, new Date(d.end).getDate()])).toEqual([
      [9, 30, 9, 30], [10, 2, 10, 2], [10, 3, 10, 3], [10, 15, 10, 15], [2, 4, 3, 5],
    ]);
  });
});
