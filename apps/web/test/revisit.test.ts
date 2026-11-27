import { describe, expect, it } from "vitest";
import {
  REVISIT_DEFAULT_DAYS, REVISIT_MAX_DAYS, REVISIT_MIN_DAYS,
  parseTimingDays, revisitWindow,
} from "../src/lib/revisit";
import { buildRevisitDigestEmail, buildRevisitEmail } from "../src/lib/email";
import { dueRevisits, markRevisit, scheduleRevisit } from "../src/lib/db";
import type { DeepReading } from "../src/lib/reading";

describe("timing-window parsing (应期 → days)", () => {
  it("takes the upper bound of a range, plus a day of grace", () => {
    expect(parseTimingDays("申酉出空后，约 11–19 日之间见明确回应")).toBe(20);
    expect(parseTimingDays("在 5-9 天内见分晓")).toBe(10);
    expect(parseTimingDays("expect movement within 11 to 19 days")).toBe(20);
  });

  it("handles single counts, weeks and months", () => {
    expect(parseTimingDays("七日之内？不，约 7 日内")).toBe(8);
    expect(parseTimingDays("within 10 days")).toBe(11);
    expect(parseTimingDays("两周左右见回应")).toBe(14);
    expect(parseTimingDays("about two weeks")).toBe(14);
    expect(parseTimingDays("一个月内")).toBe(30);
  });

  it("clamps to a sane window and returns null for no signal", () => {
    expect(parseTimingDays("1 日内")).toBe(REVISIT_MIN_DAYS);
    expect(parseTimingDays("200 日后")).toBe(REVISIT_MAX_DAYS);
    expect(parseTimingDays("时机未至，静待其变")).toBeNull();
    expect(parseTimingDays("")).toBeNull();
    expect(parseTimingDays(null)).toBeNull();
  });

  it("falls back to the default when a deep reading names no number", () => {
    const r = { timing: { zh: "出空之后自见分晓", en: "after the void clears" } } as DeepReading;
    const w = revisitWindow("deep", r);
    expect(w.days).toBe(REVISIT_DEFAULT_DAYS);
    expect(w.quote).toBe("出空之后自见分晓");
  });
});

describe("revisit scheduling", () => {
  it("schedules once per session, surfaces when due, and marks sent", () => {
    const sid = `cs_test_revisit_${Date.now()}`;
    const base = {
      sessionId: sid, castId: null, customerId: null,
      email: "Revisit@Example.com", locale: "zh", tier: "deep",
      castAtMs: Date.now() - 21 * 86_400_000, windowDays: 20, timingQuote: "约 11–19 日",
    };
    scheduleRevisit(base);
    scheduleRevisit(base); // idempotent

    const due = dueRevisits(100).filter((r) => r.session_id === sid);
    expect(due).toHaveLength(1);
    expect(due[0]!.email).toBe("revisit@example.com");
    expect(due[0]!.window_days).toBe(20);

    markRevisit(due[0]!.id, "sent");
    expect(dueRevisits(100).filter((r) => r.session_id === sid)).toHaveLength(0);
  });

  it("does not surface a revisit before its window closes", () => {
    const sid = `cs_test_future_${Date.now()}`;
    scheduleRevisit({
      sessionId: sid, castId: null, customerId: null,
      email: "later@example.com", locale: "en", tier: "one",
      castAtMs: Date.now(), windowDays: 14, timingQuote: null,
    });
    expect(dueRevisits(100).filter((r) => r.session_id === sid)).toHaveLength(0);
  });
});

describe("revisit email", () => {
  const base = {
    question: "要不要接下这个项目",
    values: [7, 7, 8, 9, 9, 7],
    hexName: "天泽履",
    changedName: "山泽损",
    timingQuote: "申酉出空后，约 11–19 日之间见明确回应",
    windowDays: 20,
    readingUrl: "https://yaoflow.com/zh/reading?sid=cs_test_x",
    castUrl: "https://yaoflow.com/zh",
  };

  it("keeps its word in both languages, draws the figure, opens the new door", () => {
    const zh = buildRevisitEmail({ ...base, locale: "zh" });
    expect(zh.subject).toContain("后来怎么样了");
    expect(zh.html).toContain(base.timingQuote);
    expect(zh.html).toContain(base.readingUrl);
    expect(zh.html).toContain("另起一卦");
    expect(zh.html).not.toMatch(/[䷀-䷿]/); // drawn figure, never a glyph
    expect(zh.html).toContain("#b0403c"); // moving lines in cinnabar
    expect(zh.html).toContain("background:#f4f2ec;color:#14151c"); // paper, like every email
    expect(zh.html).not.toContain("opacity:");

    const en = buildRevisitEmail({ ...base, locale: "en", hexName: "Treading", changedName: "Decrease" });
    expect(en.subject).toContain("how did it turn out");
    expect(en.html).toContain("reply to this email");
    expect(en.text).toContain(base.castUrl);
  });

  it("omits the quote block when the reading named no timing line", () => {
    const zh = buildRevisitEmail({ ...base, locale: "zh", timingQuote: null });
    expect(zh.html).not.toContain("当时的原话");
  });

  // 10-22 进度表 77 回访积压: several due revisits of one address in one letter, each with its own four answers
  it("the digest: one letter, every reading its own block and answers, in every language, no banned words", () => {
    const urls = (n: number) => ({ hit: `https://yaoflow.com/api/revisit/outcome?id=${n}&v=happened`, partial: `https://yaoflow.com/api/revisit/outcome?id=${n}&v=stirred`, miss: `https://yaoflow.com/api/revisit/outcome?id=${n}&v=nothing`, open: `https://yaoflow.com/api/revisit/outcome?id=${n}&v=open` });
    const items = [
      { ...base, outcomeUrls: urls(1), askedOn: "10月3日" },
      { ...base, question: "十一月換工作的機會會不會來", hexName: "震為雷", changedName: null, timingQuote: null, outcomeUrls: urls(2), askedOn: "10月9日", hint: "收到錄取通知", ask: "event" as const },
      { ...base, question: "他會不會主動聯絡", outcomeUrls: urls(3), askedOn: "10月12日", ask: "signals" as const },
    ];
    for (const locale of ["zh", "zh-hant", "en", "ja", "ko", "fr", "de", "es", "pt"] as const) {
      const m = buildRevisitDigestEmail({ locale, items, castUrl: base.castUrl, giftUrl: null });
      expect(m.subject).toContain("3");
      expect(m.html.match(/\/api\/revisit\/outcome\?/g)).toHaveLength(12);
      expect(m.text.match(/\/api\/revisit\/outcome\?/g)).toHaveLength(12);
      for (const it of items) { expect(m.html).toContain(it.question); expect(m.html).toContain(it.askedOn); }
      expect(m.html).toContain("收到錄取通知"); // the reader's own words replace the general question on that item
      expect(m.html).toContain(base.readingUrl);
      expect(m.html).not.toMatch(/[䷀-䷿]/);
      if (locale === "zh-hant") { expect(m.subject + m.html).not.toMatch(/準|AI|靈驗|神明說/); expect(m.subject).toBe("你問過的 3 件事，後來怎麼樣了？"); }
      if (locale === "zh") expect(m.html).toContain("10月3日 问的");
      if (locale === "en") expect(m.html).toContain("Asked on 10月3日");
    }
  });
});

/** 09-21 回访奖励: the subject leads with the reading's own timing line, the mail promises a thank-you without saying which answer earns what, and the reminder reads as one. */
describe("revisit mail (09-21)", () => {
  const base = {
    locale: "zh-hant" as const, question: "他心中的顧慮何時消除", values: [7, 8, 9, 8, 7, 8] as const, hexName: "澤山咸", changedName: null,
    windowDays: 21, readingUrl: "https://yaoflow.com/zh-hant/reading?sid=x", castUrl: "https://yaoflow.com/zh-hant",
    outcomeUrls: { hit: "https://yaoflow.com/api/revisit/outcome?v=hit", partial: "https://yaoflow.com/api/revisit/outcome?v=partial", miss: "https://yaoflow.com/api/revisit/outcome?v=miss", open: "https://yaoflow.com/api/revisit/outcome?v=open" },
  };
  it("quotes the timing line in the subject when it is short, falls back to the figure when it is long or absent", async () => {
    const { buildRevisitEmail } = await import("../src/lib/email");
    expect(buildRevisitEmail({ ...base, timingQuote: "十月中旬前會有回音" }).subject).toBe("當時說「十月中旬前會有回音」——後來怎麼樣了？");
    expect(buildRevisitEmail({ ...base, timingQuote: "很".repeat(40) }).subject).toContain("澤山咸");
    expect(buildRevisitEmail({ ...base, timingQuote: null }).subject).toContain("澤山咸");
  });
  it("says a thank-you follows, never which answer, and the footer no longer promises silence", async () => {
    const { buildRevisitEmail } = await import("../src/lib/email");
    const m = buildRevisitEmail({ ...base, timingQuote: "十月中旬前會有回音" });
    expect(m.text).toContain("小回禮");
    expect(m.text).not.toMatch(/應驗.*回禮|回禮.*應驗了/);
    expect(m.text).not.toContain("最多再提醒一次"); // 10-17
    expect(m.text).not.toContain("不會有下一封");
  });
  it("the reminder carries its own lead and subject", async () => {
    const { buildRevisitEmail } = await import("../src/lib/email");
    const m = buildRevisitEmail({ ...base, timingQuote: "十月中旬前會有回音", reminder: true });
    expect(m.subject).toContain("再問一次");
    expect(m.text).toMatch(/還沒有(訊息|消息)——再問一次/);
    const en = buildRevisitEmail({ ...base, locale: "en", hexName: "Influence", timingQuote: "a reply before mid-October", reminder: true });
    expect(en.subject).toMatch(/^Once more/);
  });
});

describe("10-14 读者问的范围被复述回来，不是应期", () => {
  it("parses the reading's own windows, not the range it restates", async () => {
    const { parseTimingDays, timingSegments, maskAskedRange } = await import("../src/lib/revisit");
    const from = new Date(2026, 9, 6);
    const q = "你問的是這兩個月，也就是國曆10月6日到12月5日。這兩個月裡，他不會有明確的動作，但你自己這邊會先有感覺：10月7日到10月10日之間。";
    expect(parseTimingDays(q, from)).toBe(5);
    expect(timingSegments(q, from).map((s) => s.end.getDate())).toEqual([10]);
    const yue = "你問年底前，即係10月14日到12月31日，機會就喺呢個範圍入面。最旺係10月15日到18日呢幾日。";
    expect(parseTimingDays(yue, new Date(2026, 9, 14))).toBe(5);
    // a reading that names its window with 就是 but not as a restatement of the question keeps it
    expect(maskAskedRange("答案就是10月15日到19日之間。")).toBe("答案就是10月15日到19日之間。");
  });
});
