import { describe, expect, it } from "vitest";
import type { LineValue } from "@yaoflow/engine";
import { chartGuard, resolveServerChart, resolveTiming, timingOffense } from "../src/lib/reading";
import { oddsFor } from "../src/lib/generate";
import { isContactQuestion } from "../src/lib/contact-question";
import { dayOfSkipsLean } from "../src/lib/headsup";
import { judgeEvent, parseEvent } from "../src/lib/revisit-judge";

/**
 * 10-31 进度表 129 (Neil: 「有很多人反馈说六爻的应期不准确」→「全部都做吧」).
 * ① 联络/复合类题从基础概率出发 ② 应期是观察期＋截止日，不点「最可能哪天」 ③ 不会/难说只给截止日
 */
describe("① 联络／复合类题", () => {
  it("knows the kind", () => {
    for (const q of ["他會不會主動聯絡我", "前任会回来找我吗", "她什么时候回我消息", "我们还会复合吗", "元彼から連絡は来ますか", "그 사람이 연락할까요", "Will my ex reach out?", "Will he text me this week?"])
      expect(isContactQuestion(q), q).toBe(true);
    for (const q of ["這次面試會不會錄取", "我下个月能找到工作吗", "Will I pass the exam?", "这个房子能卖出去吗"])
      expect(isContactQuestion(q), q).toBe(false);
  });

  it("never rated likely unless the chart argues hard for it", () => {
    const at = Date.UTC(2026, 9, 13, 3);
    let capped = 0, kept = 0, seen = 0;
    for (let n = 0; n < 4096 && seen < 600; n += 7) {
      const values = [0, 1, 2, 3, 4, 5].map((i) => ([6, 7, 8, 9] as LineValue[])[(n >> (i * 2)) & 3]!);
      const input = { question: "他會不會主動聯絡我", values, castAtMs: at, tzOffsetMinutes: 480 };
      const chart = resolveServerChart(input, true);
      const timing = resolveTiming(input, chart, true);
      if (!timing.focal.how_zh.startsWith("以应爻")) continue;
      seen += 1;
      const g = chartGuard(chart, timing, input.question);
      if (g?.signals.includes("contact_base")) {
        capped += 1;
        expect(oddsFor("strong", chart, input, true)).not.toMatch(/^(strong|good)$/);
      } else kept += 1;
      // the same chart asked about something else carries no contact rule
      expect(chartGuard(chart, timing, "這次面試會不會錄取")?.signals ?? []).not.toContain("contact_base");
    }
    expect(seen).toBeGreaterThan(50);
    expect(capped).toBeGreaterThan(kept); // most charts lack the hard evidence
  });
});

describe("② 观察期＋截止日", () => {
  it("rejects a likeliest day picked out of a window, in any language", () => {
    expect(timingOffense({ timing: "10月16日到23日這段多留意，20日前後機會最大。" }, "zh-hant")).toMatch(/^peak:/);
    expect(timingOffense({ timing: "10月16日到23日之間，20日前後。" }, "zh-hant")).toMatch(/^peak:/);
    expect(timingOffense({ timing: "Watch October 16 to 23, most likely around the 20th." }, "en")).toMatch(/^peak:/);
    expect(timingOffense({ timing: "October 16 to 23, around the 20th." }, "en")).toMatch(/^peak:/);
    expect(timingOffense({ timing: "10月16日〜23日（目安）、20日頃が一番です。" }, "ja")).toMatch(/^peak:/);
  });
  it("accepts an observation period with its check-back date, and one backup", () => {
    expect(timingOffense({ timing: "10月16日到23日這段多留意；到23日還沒動靜，這一輪就先當作沒有。" }, "zh-hant")).toBeNull();
    expect(timingOffense({ timing: "Watch October 16 to 23; if nothing has moved by the 23rd, let this round go." }, "en")).toBeNull();
    expect(timingOffense({ timing: "10月16日〜23日（目安）。23日までに動きがなければ、今回はいったん区切りに。" }, "ja")).toBeNull();
    expect(timingOffense({ timing: "10月16日到23日先看；沒動靜就看11月2日到9日。" }, "zh-hant")).toBeNull();
  });
});

describe("③ 不会／难说：只给截止日", () => {
  it("one check-back date passes; a window list on a 'no' reading is a rewrite", () => {
    expect(timingOffense({ timing: "卦上看不太會自己動。給它到10月23日——那天前沒有他的消息，就把重心收回自己身上。", odds: "hard" }, "zh-hant")).toBeNull();
    expect(timingOffense({ timing: "10月16日到23日這段多留意；沒動靜就看11月2日到9日。", odds: "hard" }, "zh-hant")).toBe("deadline:hard");
    expect(timingOffense({ timing: "10月16日到23日這段多留意；沒動靜就看11月2日到9日。", odds: "good" }, "zh-hant")).toBeNull();
  });
  it("the day-of letter is not sent on a reading that leaned no or even", () => {
    const body = (odds: string) => JSON.stringify({ odds: { zh: odds }, verdict: { zh: "x" } });
    expect(dayOfSkipsLean({ body_json: body("hard"), locale: "zh" })).toBe(true);
    expect(dayOfSkipsLean({ body_json: body("even"), locale: "zh" })).toBe(true);
    expect(dayOfSkipsLean({ body_json: body("good"), locale: "zh" })).toBe(false);
    expect(dayOfSkipsLean({ body_json: null, locale: "zh" })).toBe(false);
  });
});

describe("④ 发生了，但不在那几天", () => {
  it("scores the what without the when", () => {
    expect(parseEvent("offwindow")).toBe("offwindow");
    expect(judgeEvent("likely", "offwindow")).toBe("partial");
    expect(judgeEvent("unlikely", "offwindow")).toBe("miss");
    expect(judgeEvent("even", "offwindow")).toBe("unclear");
    expect(judgeEvent("likely", "offwindow", "signals")).toBe("unclear");
  });
});
