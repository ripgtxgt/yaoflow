import { describe, expect, it, beforeAll } from "vitest";

/**
 * 09-23 挽回. Neil's rules, pinned: a receipt for everyone, one letter three
 * days out, never to heavy users, never twice, never a discount — and the
 * buttons must not change anything on a mere GET (mail scanners open links).
 */
beforeAll(() => { process.env.ADMIN_KEY ??= "test-key-for-signing"; });

describe("分层", () => {
  it("kiki 那种 36 分钟 15 次追问 = 高频", async () => {
    const { segmentFor } = await import("../src/lib/retain");
    expect(segmentFor({ readings: 4, followups: 15 }, 4)).toBe("heavy");
    expect(segmentFor({ readings: 5, followups: 0 }, 5)).toBe("heavy");
  });
  it("这一期一次没用 = 低频；其余普通", async () => {
    const { segmentFor } = await import("../src/lib/retain");
    expect(segmentFor({ readings: 0, followups: 0 }, 0)).toBe("low");
    expect(segmentFor({ readings: 1, followups: 2 }, 3)).toBe("normal");
  });
});

describe("到期前那一封", () => {
  it("高频不发，哪怕从没发过", async () => {
    const { planWinback } = await import("../src/lib/retain");
    expect(planWinback({ segment: "heavy", plan: "month", hadBefore: false })).toEqual({ send: false, kind: "skipped:heavy" });
  });
  it("一个人一辈子只收一封", async () => {
    const { planWinback } = await import("../src/lib/retain");
    expect(planWinback({ segment: "normal", plan: "month", hadBefore: true }).send).toBe(false);
  });
  it("普通月付 → 暂停/年付；年付会员和低频 → 提醒到期前还能用的（93：不再看剩几份，没有可数的了）", async () => {
    const { planWinback } = await import("../src/lib/retain");
    expect(planWinback({ segment: "normal", plan: "month", hadBefore: false })).toMatchObject({ send: true, letter: "winback" });
    expect(planWinback({ segment: "normal", plan: "year", hadBefore: false })).toMatchObject({ send: true, letter: "reminder" });
    expect(planWinback({ segment: "low", plan: "month", hadBefore: false })).toMatchObject({ send: true, letter: "reminder" });
  });
});

describe("恢复续订只动设了的那个字段", () => {
  it("flag 开着就只关 flag（Stripe 同时填了 cancel_at，两个一起送会被拒）", async () => {
    const { unCancelBody } = await import("../src/lib/retain");
    expect(unCancelBody({ cancel_at_period_end: true, cancel_at: 1792678953 })).toEqual({ cancel_at_period_end: "false" });
  });
  it("门户那种 cancel_at 取消 → 清空 cancel_at", async () => {
    const { unCancelBody } = await import("../src/lib/retain");
    expect(unCancelBody({ cancel_at_period_end: false, cancel_at: 1792678953 })).toEqual({ cancel_at: "" });
  });
});

describe("签名链接", () => {
  it("一个动作的签名不能拿去做另一个动作", async () => {
    const { retainToken, verifyRetainToken } = await import("../src/lib/retain");
    const t = retainToken("sub_abc", "resume");
    expect(verifyRetainToken("sub_abc", "resume", t)).toBe(true);
    expect(verifyRetainToken("sub_abc", "pause", t)).toBe(false);
    expect(verifyRetainToken("sub_other", "resume", t)).toBe(false);
  });
});

describe("信的内容", () => {
  it("确认信（93）：生效、到期前一切照常、到期后留什么停什么、一键恢复、之后有事买通卡；不数剩几份，不推销", async () => {
    const { buildRetainEmail } = await import("../src/lib/email");
    const m = buildRetainEmail({ locale: "zh-hant", letter: "confirm", date: "2026年10月22日", resumeUrl: "https://x/r", castUrl: "https://x/c", passUrl: "https://x/pass" });
    expect(m.subject).toContain("2026年10月22日");
    expect(m.text).toContain("一切照常");
    expect(m.text).toContain("已經寫好的報告");
    expect(m.text).toContain("會員價會停");
    expect(m.text).toContain("買一張通卡就好");
    expect(m.html).toContain("https://x/r");
    expect(m.html).toContain("https://x/pass");
    expect(m.text).not.toMatch(/還剩|深斷|年付|暫停/);
    const r = buildRetainEmail({ locale: "zh-hant", letter: "reminder", date: "10/25", resumeUrl: "https://x/r", castUrl: "https://x/c" });
    expect(r.subject + r.text).not.toMatch(/還剩 \d|\{n\}/);
    expect(r.text).toContain("到期前這些都還能用");
  });
  it("挽回信带暂停和年付，没有折扣", async () => {
    const { buildRetainEmail } = await import("../src/lib/email");
    const m = buildRetainEmail({ locale: "en", letter: "winback", date: "Oct 22", deepLeft: 2, resumeUrl: "https://x/r", pauseUrl: "https://x/p", yearUrl: "https://x/y", yearPrice: "NT$1,990", yearPct: 34, castUrl: "https://x/c" });
    expect(m.html).toContain("https://x/p");
    expect(m.html).toContain("https://x/y");
    expect(m.text).toContain("34%");
    expect(m.text).not.toMatch(/discount|% off|half/i);
  });
});

describe("暂停那个月不给额度", () => {
  it("只在 [from, until) 里算暂停", async () => {
    const { inPause } = await import("../src/lib/subscription");
    expect(inPause({ paused_from: 100, paused_until: 200 }, 150)).toBe(true);
    expect(inPause({ paused_from: 100, paused_until: 200 }, 99)).toBe(false);
    expect(inPause({ paused_from: 100, paused_until: 200 }, 200)).toBe(false);
    expect(inPause({ paused_from: null, paused_until: null }, 150)).toBe(false);
  });
});

describe("九种语言一模一样（Neil 09-23：「所有语言都一样的」）", () => {
  const L = ["zh", "zh-hant", "en", "ja", "ko", "fr", "de", "es", "pt"] as const;
  it("每种语言都写全了，键和占位符与简体一致", async () => {
    const { RETAIN_T } = await import("../src/lib/dict/retain");
    const base = RETAIN_T.zh as Record<string, string>;
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
    for (const l of L) {
      const t = (RETAIN_T as Record<string, Record<string, string>>)[l];
      expect(t, l).toBeDefined();
      expect(Object.keys(t).sort(), l).toEqual(Object.keys(base).sort());
      for (const k of Object.keys(base)) expect(ph(t[k]!), `${l}.${k}`).toBe(ph(base[k]!));
    }
  });
  it("三封信在每种语言里按钮、段落一样多，没有漏填的占位符", async () => {
    const { buildRetainEmail } = await import("../src/lib/email");
    for (const letter of ["confirm", "winback", "reminder"] as const) {
      const shapes = L.map((locale) => {
        const m = buildRetainEmail({ locale, letter, date: "D", resumeUrl: "https://r", pauseUrl: "https://p", yearUrl: "https://y", yearPrice: "P", yearPct: 34, castUrl: "https://c", passUrl: "https://pass" });
        expect(m.html + m.subject + m.text, `${letter}/${locale}`).not.toMatch(/\{\w+\}/);
        return `${(m.html.match(/<a /g) ?? []).length}/${(m.html.match(/<p /g) ?? []).length}/${m.text.split("\n").length}`;
      });
      expect(new Set(shapes).size, `${letter}: ${shapes.join(" ")}`).toBe(1);
    }
  });
});
