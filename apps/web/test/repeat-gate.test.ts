import { describe, expect, it } from "vitest";
import { contentTokens, gateVerdict, normalizeQ, similarity, type PastCast } from "../src/lib/repeat-gate";
import { classifyTopic } from "../src/lib/topic";
import { toHans } from "../src/lib/hant";

/** 09-15: 一位读者一天 35 卦全是「前任」，35 种写法，逐字比对的闸门一次没拦住——闸门改为按"同一件事"判。 */

const H = 3_600_000;
const now = Date.UTC(2026, 8, 15, 10);
const past = (q: string, hoursAgo: number, topic: PastCast["topic"] = "relationship", hex = "水雷屯"): PastCast =>
  ({ q: normalizeQ(q), at: now - hoursAgo * H, hex, topic });

describe("content tokens", () => {
  it("keeps the words that carry the matter and drops pronouns, particles and question words", () => {
    expect([...contentTokens("我們是否會復合", "zh-hant")]).toEqual(["復", "合"]);
    expect([...contentTokens("我們還會不會復合", "zh-hant")]).toEqual(["復", "合"]);
    expect([...contentTokens("我该不该接这个 offer？", "zh")]).toEqual(["接", "offer"]);
    expect([...contentTokens("Will my ex text me in September?", "en")]).toEqual(["ex", "text", "september"]);
    expect([...contentTokens("元カレから連絡は来ますか", "ja")]).toEqual(["元", "カレ", "連", "絡", "来"]);
    expect([...contentTokens("전남친한테서 연락이 올까요", "ko")]).toEqual(["전", "남", "친", "연", "락", "올"]);
  });
});

describe("same matter", () => {
  it("reads today's rewordings as one matter", () => {
    const one = "前任9月會聯繫我嗎？";
    for (const other of ["9月前任會聯繫我嗎", "前任在9月會聯繫我嗎", "前任9月是否會聯繫我", "前任9月會不會聯繫我？原因是什麼？"]) {
      expect(similarity(one, other, "zh-hant"), other).toBeGreaterThanOrEqual(0.5);
    }
    expect(similarity("我們是否會復合", "我們還會不會復合", "zh-hant")).toBe(1);
    expect(similarity("我該不該在9月主動傳訊息給前任", "9月該不該主動找前任", "zh-hant")).toBeGreaterThanOrEqual(0.5);
    expect(similarity("9月我找得到好工作嗎", "9月我會找到工作嗎", "zh-hant")).toBe(1);
    expect(similarity("我该不该接这个offer", "这个offer要不要接", "zh")).toBe(1);
    expect(similarity("Will my ex text me in September?", "Is my ex going to text me this September", "en")).toBe(1);
    expect(similarity("元カレから連絡は来ますか", "元カレは連絡してくれますか", "ja")).toBeGreaterThanOrEqual(0.5);
    expect(similarity("전남친이 연락할까요", "전남친한테서 연락이 올까요", "ko")).toBeGreaterThanOrEqual(0.5);
  });

  it("keeps different matters apart", () => {
    expect(similarity("前任還愛我嗎", "9月我找得到好工作嗎", "zh-hant")).toBe(0);
    expect(similarity("前任還愛我嗎", "他不愛我了嗎", "zh-hant")).toBeLessThan(0.5);
    expect(similarity("我该不该接这个offer", "我该不该搬去台北", "zh")).toBe(0);
    expect(similarity("這份工作能拿到嗎", "那份工作適合我嗎", "zh-hant")).toBeLessThan(0.5);
    expect(similarity("Will I get the job at Google?", "Will my ex text me?", "en")).toBe(0);
    expect(similarity("Soll ich die Stelle annehmen?", "Meldet sich mein Ex wieder?", "de")).toBe(0);
  });
});

describe("gate verdict", () => {
  it("passes a fresh matter, and an empty question", () => {
    const list = [past("前任9月會聯繫我嗎", 2)];
    expect(gateVerdict(list, "9月我找得到好工作嗎", "career", "zh-hant", now)).toBeNull();
    expect(gateVerdict(list, "", "other", "zh-hant", now)).toBeNull();
  });

  it("soft-blocks the same matter — identical or reworded — inside 24 hours, and forgets it after", () => {
    const list = [past("前任9月會聯繫我嗎", 2)];
    expect(gateVerdict(list, "前任9月會聯繫我嗎？", "relationship", "zh-hant", now)).toMatchObject({ kind: "same" });
    expect(gateVerdict(list, "9月前任會不會聯繫我", "relationship", "zh-hant", now)).toMatchObject({ kind: "same" });
    expect(gateVerdict([past("前任9月會聯繫我嗎", 25)], "前任9月會聯繫我嗎", "relationship", "zh-hant", now)).toBeNull();
  });

  it("hard-blocks the fourth cast on one topic in a day, whatever the wording; the cap never applies to 'other'", () => {
    const three = [past("前任還愛我嗎", 1), past("他不愛我了嗎", 2), past("前任會解除封鎖我嗎", 3)];
    const v = gateVerdict(three, "我們是否會復合", "relationship", "zh-hant", now);
    expect(v).toMatchObject({ kind: "cap", count: 3 });
    expect(v && v.kind === "cap" ? v.past.q : "").toBe("前任還愛我嗎"); // the latest on the topic
    // two on the topic: still the soft gate only
    expect(gateVerdict(three.slice(1), "我們是否會復合", "relationship", "zh-hant", now)).toBeNull();
    // another topic is untouched
    expect(gateVerdict(three, "9月我找得到好工作嗎", "career", "zh-hant", now)).toBeNull();
    // yesterday's casts have rolled out of the window
    expect(gateVerdict(three.map((c) => ({ ...c, at: c.at - 24 * H })), "我們是否會復合", "relationship", "zh-hant", now)).toBeNull();
    // 'other' is a grab-bag, never capped
    const misc = [past("今天出門順利嗎", 1, "other"), past("包裹明天會到嗎", 2, "other"), past("貓會自己回來嗎", 3, "other")];
    expect(gateVerdict(misc, "晚上的聚會值得去嗎", "other", "zh-hant", now)).toBeNull();
    // 09-26: but no longer a free pass — twice the room, then capped
    const six = [...misc, past("新鞋會合腳嗎", 4, "other"), past("週末會下雨嗎", 5, "other"), past("樓下的店會開嗎", 6, "other")];
    expect(gateVerdict(six, "晚上的聚會值得去嗎", "other", "zh-hant", now)).toMatchObject({ kind: "cap" });
  });

  it("09-26: a reply to the last reading counts as the same matter, though it shares no words", () => {
    const three = [past("我跟她的關係要怎麼把話說開", 2, "other"), past("我跟她的關係要不要主動把話說開", 1, "other"), past("我跟她的關係什麼時候把話說開", 0.5, "other")];
    // the wording shares nothing with them, yet it is answering the latest — so the cluster of that matter counts
    expect(gateVerdict(three, "那就不用給他知道呀？", "other", "zh-hant", now)).toMatchObject({ kind: "cap", by: "circling" });
    // the same words without the reply shape are a new subject
    expect(gateVerdict(three, "明天的面試會順利嗎", "career", "zh-hant", now)).toBeNull();
  });

  it("counts the cap on the detector's topic as well, so moving the chip to 其他 does not reopen the door (09-16)", () => {
    const chipSaysOther = [past("前任還愛我嗎", 1, "other"), past("他不愛我了嗎", 2, "other"), past("前任會解除封鎖我嗎", 3, "other")]
      .map((c) => ({ ...c, det: "relationship" as const }));
    expect(gateVerdict(chipSaysOther, "我們是否會復合", "other", "zh-hant", now, "relationship")).toMatchObject({ kind: "cap", count: 3 });
    // the chip filed them under relationship, the detector missed — still capped when the detector catches the fourth
    const chipSaysRel = chipSaysOther.map((c) => ({ ...c, topic: "relationship" as const, det: "other" as const }));
    expect(gateVerdict(chipSaysRel, "我們今年會在一起嗎", "other", "zh-hant", now, "relationship")).toMatchObject({ kind: "cap" });
    // truly miscellaneous on both counts: never capped
    const misc = chipSaysOther.map((c) => ({ ...c, det: "other" as const }));
    expect(gateVerdict(misc, "我們是否會復合", "other", "zh-hant", now, "other")).toBeNull();
  });

  it("checks the cap before the wording, so a reworded fourth cast is the hard block", () => {
    const three = [past("前任9月會聯繫我嗎", 1), past("前任還愛我嗎", 2), past("我們是否會復合", 3)];
    expect(gateVerdict(three, "9月前任會聯繫我嗎", "relationship", "zh-hant", now)).toMatchObject({ kind: "cap" });
  });
});

describe("topic detection for the cap", () => {
  it("files the day's 前任 questions under relationship, in both scripts", () => {
    for (const q of ["前任還愛我嗎", "前任會解除封鎖我嗎", "他不愛我了嗎", "前任9月會聯繫我嗎？", "我該不該封鎖前任", "我應該怎麼做才能挽回這段感情", "前男友会回头吗", "我们还会不会复合"]) {
      expect(classifyTopic(toHans(q)), q).toBe("relationship");
      expect(classifyTopic(q), q).toBe("relationship");
    }
    expect(classifyTopic("Will my ex unblock me?")).toBe("relationship");
    expect(classifyTopic("Does he still love me")).toBe("relationship");
    expect(classifyTopic("9月我找得到好工作嗎")).toBe("career");
    // 09-16: wordings that slipped through as "other" on the day the cap went live
    for (const q of ["我們今年會在一起嗎", "分手斷聯的他會主動和我聯絡嗎", "我們這個月會有一次深層次的情感溝通對話嗎", "他冷淡是為什麼呢"]) expect(classifyTopic(q), q).toBe("relationship");
    for (const q of ["我這個月會做到銷售業績嗎", "9月內的消息是不是有關puyi 的China崗位"]) expect(classifyTopic(q), q).toBe("career");
  });
});

/**
 * 09-22, after two members spent a day circling one matter each.
 *
 * The cap exempted `other` — the catch-all — on the reasoning that three
 * unrelated unclassifiable questions should not block each other. But `other`
 * is also where most questions land (20 of 46 on day two), and twelve casts
 * about "does he still think of me" and "will my husband ask for a divorce"
 * went through it untouched. And the soft block was waivable without limit,
 * which only ever worked because each repeat cost money — membership removed
 * that brake.
 */
describe("一事一占 · 围着一件事打转", () => {
  const H = 3_600_000;
  const cast = (q: string, hoursAgo: number, topic: "other" | "relationship" = "other", waived = false) => ({
    q: q.toLowerCase(), at: Date.now() - hoursAgo * H, hex: "乾为天", topic, det: topic, ...(waived ? { waived: true } : {}),
  });

  it("caps someone rewording one matter under 其他, which used to be a free pass", async () => {
    const { gateVerdict } = await import("../src/lib/repeat-gate");
    const past = [
      cast("鄧樹仁偶爾還會想起雞女", 1),
      cast("鄧樹仁偶爾還會想起holly 想起時會想起什麼", 3),
      cast("分開了大半年 1992猴男仍有經常思念雞女嗎", 5),
    ];
    const v = gateVerdict(past, "猴男還會不會想起雞女呢", "other", "zh-hant", Date.now(), "other");
    expect(v?.kind).toBe("cap");
    expect((v as { by: string }).by).toBe("circling");
  });

  it("but three genuinely different 其他 questions still go through", async () => {
    const { gateVerdict } = await import("../src/lib/repeat-gate");
    const past = [
      cast("轉調總部職缺的關鍵人是不是男性主管", 1),
      cast("這台二手車值不值得買", 3),
      cast("下個月要不要搬去台中", 5),
    ];
    expect(gateVerdict(past, "媽媽的手術會順利嗎", "other", "zh-hant", Date.now(), "other")).toBeNull();
  });

  it("the soft block stops being waivable once the waivers are spent", async () => {
    const { gateVerdict, WAIVER_CAP } = await import("../src/lib/repeat-gate");
    const q = "我跟先生的婚姻狀況會怎麼樣";
    const first = gateVerdict([cast(q, 1, "relationship")], q, "relationship", "zh-hant", Date.now(), "relationship");
    expect(first?.kind).toBe("same");
    expect((first as { waivable: boolean }).waivable).toBe(true);

    // ...after WAIVER_CAP casts that were themselves waived through
    const spent = [cast(q, 1, "relationship", true), cast(q, 2, "relationship", true)];
    const later = gateVerdict(spent, q, "relationship", "zh-hant", Date.now(), "relationship");
    expect(later?.kind).toBe("same");
    expect((later as { waivable: boolean }).waivable).toBe(false);
    expect(WAIVER_CAP).toBe(2);
  });
});
