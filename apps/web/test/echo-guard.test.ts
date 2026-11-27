import { describe, expect, it } from "vitest";
import { contrastOffense, echoInReply, echoOffense, lightMatter } from "../src/lib/echo-guard";
import type { MatterSoFar } from "../src/lib/reading";

/**
 * 10-12 (进度表 §四 30, 10-11 一周复查没过): four light readings handed a member's old words back or read her present
 * mood off a note days old. The patterns below are the review's own cases, reworded.
 */
const M = (o: Partial<MatterSoFar> = {}): MatterSoFar => ({
  title: "和他",
  earlier_casts: [{ date: "2026-10-04", days_ago: 3, question: "現在的局面有一點崩裂，我這邊沒有打算再前進了", hexagram: "乾", tier: "light", call: "x" }],
  reader_notes: [{ date: "2026-10-06", days_ago: 1, note: "我跟他說想再往後推一點時間，先不要急著定下來" }],
  ...o,
});
const KEYS = ["summary", "inner_condition", "outer_condition", "direction"];

describe("一件事 · 不把读者的话引回去", () => {
  it("catches 「你昨天說的…」 and 「你嘴上說…」 pointing at their earlier words", () => {
    expect(echoOffense({ direction: "你昨天說的想再往後推一點時間，這個念頭沒有錯。" }, KEYS, M(), "他今天心裡怎麼想")).toMatch(/^direction:你昨天說的/);
    expect(echoOffense({ inner_condition: "你嘴上說不打算再前進了，心裡其實還沒放下。" }, KEYS, M(), "他還會找我嗎")).toMatch(/^inner_condition:你嘴上說/);
  });

  it("a long lift with no marker counts too", () => {
    expect(echoOffense({ summary: "你心裡其實想再往後推一點時間，只是還不甘心。" }, KEYS, M(), "什麼時候講比較好")).toMatch(/^summary:/);
  });

  it("today's question said back, a paraphrase of it, and an event named in passing are fine", () => {
    expect(echoOffense({ summary: "你問「他會不會主動找我」，卦上看他這幾天在收。" }, KEYS, M(), "他會主動找我嗎")).toBeNull();
    expect(echoOffense({ summary: "你嘴上說只是想輕鬆聊聊，其實很在意他的反應。" }, KEYS, M(), "我只是想輕鬆聊聊可以嗎")).toBeNull();
    expect(echoOffense({ outer_condition: "前幾天那頓飯之後，他這邊是放鬆的。" }, KEYS, M(), "他對我有感覺嗎")).toBeNull();
  });

  it("no record, a switched-off matter, dates: nothing to check", () => {
    expect(echoOffense({ summary: "你昨天說的想再往後推一點時間" }, KEYS, undefined, "q")).toBeNull();
    expect(echoOffense({ summary: "你昨天說的想再往後推一點時間" }, KEYS, M({ no_context: true }), "q")).toBeNull();
    expect(echoOffense({ summary: "內地假期到10月8日，這幾天推不動。" }, KEYS, M({ reader_notes: [{ date: "x", days_ago: 1, note: "那邊假期到10月8日" }] }), "q")).toBeNull();
  });

  it("English: 「you said」 plus their words", () => {
    const m = M({ earlier_casts: [], reader_notes: [{ date: "x", days_ago: 1, note: "I told him I want to slow things down for a while" }] });
    expect(echoOffense({ summary: "You said you want to slow things down for a while, and that still holds." }, KEYS, m, "Will he call me?")).toMatch(/^summary:You said/);
    expect(echoOffense({ summary: "He is pulling back for now." }, KEYS, m, "Will he call me?")).toBeNull();
  });
});

describe("一件事 · 轻解读看不到三天前的原话", () => {
  it("notes older than three days leave the payload, counted in the background line; older questions lose their wording", () => {
    const m = M({
      earlier_casts: [
        { date: "2026-10-01", days_ago: 6, question: "他會不會罵我", hexagram: "乾", tier: "light", call: "c" },
        { date: "2026-10-06", days_ago: 1, question: "今天適合傳訊息嗎", hexagram: "坤", tier: "light", call: "c" },
      ],
      reader_notes: [
        { date: "2026-09-28", days_ago: 9, note: "每次忍不住去罵他" },
        { date: "2026-10-03", days_ago: 4, note: "忘了還他東西" },
        { date: "2026-10-06", days_ago: 1, note: "今天一起吃飯" },
      ],
      background: "「和他」: 3 earlier casts and 1 note from 5–9 days ago, not shown here; the latest of those asked 「他會不會罵我」",
    });
    const l = lightMatter(m)!;
    expect(l.reader_notes.map((n) => n.note)).toEqual(["今天一起吃飯"]);
    expect(JSON.stringify(l)).not.toContain("罵");
    expect(JSON.stringify(l)).not.toContain("還他東西");
    expect(l.earlier_casts[0]!.question).toMatch(/^\(asked 6 days ago/);
    expect(l.earlier_casts[1]!.question).toBe("今天適合傳訊息嗎");
    expect(l.background).toMatch(/2 older progress notes from 4–9 days ago left out/);
    // the reader's old words are still what the check compares against
    expect(echoOffense({ inner_condition: "你每次忍不住去罵他，都是在等他回頭。" }, KEYS, m, "他還在意我嗎")).toMatch(/^inner_condition:/);
  });

  it("a switched-off matter passes through untouched", () => {
    const off: MatterSoFar = { title: "t", earlier_casts: [], reader_notes: [], no_context: true };
    expect(lightMatter(off)).toBe(off);
    expect(lightMatter(undefined)).toBeUndefined();
  });

  it("10-22: nor what our own reading said back then — an old call restates the reader's situation of that day", () => {
    const m = M({
      earlier_casts: [
        { date: "2026-10-11", days_ago: 11, question: "我去求了個法術，要連續七天送飲料給他", hexagram: "復", tier: "deep", call: "你替他做的術法和每天送的飲料，他都看在眼裡卻不會因此回頭。", timing: "10月20日前後" },
        { date: "2026-10-21", days_ago: 1, question: "他現在還喜歡我嗎", hexagram: "否", tier: "light", call: "他心裡有你，但不打算靠近。" },
      ],
    });
    const l = lightMatter(m)!;
    expect(JSON.stringify(l)).not.toMatch(/術法|飲料/);
    expect(l.earlier_casts[0]!.call).toMatch(/^\(what that reading said 11 days ago is withheld/);
    expect("timing" in l.earlier_casts[0]!).toBe(false);
    expect(l.earlier_casts[0]!.hexagram).toBe("復");
    expect(l.earlier_casts[1]!.call).toBe("他心裡有你，但不打算靠近。");
  });
});

describe("10-22 复查 · 「你嘴上說…」与「你感覺…」", () => {
  it("their words set against a heart the reading claims to see — whatever the words were", () => {
    expect(contrastOffense({ inner_condition: "你嘴上說好奇，心裡其實已經被這種沒回應的狀態磨得很累。" }, KEYS)).toMatch(/^inner_condition:contrast:你嘴上說/);
    expect(contrastOffense({ inner_condition: "你嘴上問她氣消了沒，心裡其實已經在數。" }, KEYS)).toMatch(/contrast:你嘴上問/);
    expect(contrastOffense({ summary: "你表面上說無所謂，其實一直在等。" }, KEYS)).toMatch(/contrast:你表面上說/);
    expect(contrastOffense({ summary: "You say you're fine, but deep down you are still waiting." }, KEYS)).toMatch(/contrast:/);
    // the other person's words, plain "you said it right", and nothing at all are fine
    expect(contrastOffense({ outer_condition: "他嘴上說不在乎，動作卻很誠實。", summary: "你說得對，這一步不急。" }, KEYS)).toBeNull();
    expect(contrastOffense({}, KEYS)).toBeNull();
  });

  it("「你主觀感覺他客氣被動」: the note she wrote that morning handed back", () => {
    const m = M({ earlier_casts: [], reader_notes: [{ date: "2026-10-20", days_ago: 0, note: "10月16號我回覆他了，之後他在10月19號才回我訊息。但是我主觀感受他回覆的語氣是很客氣被動的。" }] });
    expect(echoOffense({ summary: "你主觀感覺他客氣被動，這跟卦裡看到的一致。" }, KEYS, m, "他現在怎麼想？")).toMatch(/^summary:你主觀感覺…/);
    expect(echoOffense({ summary: "你覺得他冷淡，其實他手上的事還沒忙完。" }, KEYS, m, "他現在怎麼想？")).toBeNull();
    // the question asked now is theirs to hear again
    expect(echoOffense({ summary: "你覺得他客氣被動，卦上看是他在收。" }, KEYS, m, "我覺得他客氣被動，他是不是不喜歡我")).toBeNull();
  });

  it("a follow-up answer gets both checks; what they asked in this conversation is theirs", () => {
    const m = M({ reader_notes: [{ date: "2026-10-20", days_ago: 0, note: "我跟他說想再往後推一點時間，先不要急著定下來" }] });
    expect(echoInReply("你嘴上說不急，心裡其實很想要一個答案。", m, "他什麼時候會回覆")).toMatch(/^reply:contrast:/);
    expect(echoInReply("你昨天說的想再往後推一點時間，這個念頭沒有錯。", m, "我該等嗎")).toMatch(/^reply:你昨天說的/);
    expect(echoInReply("你剛剛問想再往後推一點時間行不行，可以。", m, "我想再往後推一點時間行不行")).toBeNull();
    expect(echoInReply("10月25日前後他會先有動靜。", undefined, "什麼時候")).toBeNull();
  });
});
