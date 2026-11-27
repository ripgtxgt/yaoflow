import { describe, expect, it } from "vitest";
// DATA_DIR is a fresh temp dir (test/setup.ts)
import { dueStep, localHour, planSeq, SEQ_OFFSETS_MS } from "../src/lib/recover-seq";
import { recordEmail } from "../src/lib/db";
import { RECOVER_SEQ_T } from "../src/lib/dict/recover-seq";
import { MATTER_SAVE_T } from "../src/lib/dict/matter-save";
import { buildRecoverSeqEmail, buildSavedRemindEmail } from "../src/lib/email";
import { matterReminder } from "../src/lib/saved-cast";
import { inN4Control, N4_CONTROL_SHARE } from "../src/lib/nudge";
import { LOCALES } from "../src/lib/locales";
import type { ListedSession } from "../src/lib/stripe";

/** 10-12 (Neil: 「做 1–4」): 挽回信序列, 付款框关掉后的面板, 第 3–4 卦存这件事, 第 4 卦起 10% 对照. */
const H = 3_600_000, D = 86_400_000;

describe("挽回信序列 · 哪一封该寄", () => {
  it("an hour, a day, three days, five days — a step fallen behind is skipped, never sent late", () => {
    const c = 0;
    expect(dueStep(c, new Set(), false, c + 30 * 60_000)).toBeNull();
    expect(dueStep(c, new Set(), false, c + H + 1)).toEqual({ step: 1, skip: [] });
    expect(dueStep(c, new Set([1]), false, c + 5 * H)).toBeNull();
    expect(dueStep(c, new Set([1]), false, c + D + 1)).toEqual({ step: 2, skip: [] });
    expect(dueStep(c, new Set(), false, c + 3 * D + 1)).toEqual({ step: 3, skip: [1, 2] });
    expect(dueStep(c, new Set([1, 2, 3]), false, c + SEQ_OFFSETS_MS[3] + 1)).toEqual({ step: 4, skip: [] });
    expect(dueStep(c, new Set([1, 2, 3, 4]), false, c + 6 * D)).toBeNull();
  });

  it("a membership gets the hour letter only", () => {
    expect(dueStep(0, new Set(), true, H + 1)).toEqual({ step: 1, skip: [] });
    expect(dueStep(0, new Set([1]), true, 4 * D)).toBeNull();
  });

  it("the reader's own hour: the cast's offset, else the device zone, else Taipei", () => {
    const noonUtc = Date.UTC(2026, 9, 12, 12);
    expect(localHour({ tz: "480" }, noonUtc)).toBe(20);
    expect(localHour({ tzname: "Europe/London" }, noonUtc)).toBe(13);
    expect(localHour({}, noonUtc)).toBe(20);
  });

  it("only a ticked checkout with an address, unpaid, in the daytime, not a pack", () => {
    const now = Date.UTC(2026, 9, 12, 4); // 12:00 in Taipei
    const base = (id: string, md: Record<string, string>, extra: Partial<ListedSession> = {}): ListedSession => ({
      id, url: null, mode: "payment", payment_status: "unpaid", status: "expired", created: Math.floor((now - 2 * H) / 1000),
      metadata: { tz: "480", castAtMs: String(now - 3 * H), values: "7,8,9,7,8,8", question: "他會回來嗎", locale: "zh-hant", ...md },
      customer_details: { email: `${id}@example.com` }, amount_total: 26900, currency: "twd", ...extra,
    });
    const plan = planSeq([
      base("seq-yes", { remind: "1" }),
      base("seq-no-box", {}),
      base("seq-pack", { remind: "1", kind: "pack" }),
      base("seq-paid", { remind: "1" }, { payment_status: "paid", status: "complete" }),
      base("seq-noemail", { remind: "1" }, { customer_details: null }),
    ], now);
    expect(plan.due.map((x) => x.sessionId)).toEqual(["seq-yes"]);
    expect(plan.due[0]!.step).toBe(1);
    expect(plan.skipped.kind).toBe(1);
    expect(plan.skipped.no_email).toBe(1);
    const night = planSeq([base("seq-night", { remind: "1", tz: "-300" })], now); // 23:00 in New York
    expect(night.due).toEqual([]);
    expect(night.skipped.night).toBe(1);
  });

  it("10-13 bug: a letter sent is remembered — the next hourly run sends nothing, and never two within 20 hours", () => {
    const now = Date.UTC(2026, 9, 12, 4);
    const s = (id: string): ListedSession => ({
      id, url: null, mode: "payment", payment_status: "unpaid", status: "expired", created: Math.floor((now - 2 * H) / 1000),
      metadata: { remind: "1", tz: "480", castAtMs: String(now - 3 * H), values: "7,8,9,7,8,8", question: "他會回來嗎", locale: "zh-hant" },
      customer_details: { email: "seq-once@example.com" }, amount_total: 26900, currency: "twd",
    });
    expect(planSeq([s("seq-once")], now).due.map((x) => x.step)).toEqual([1]);
    recordEmail("seq:seq-once", "recover-seq-1", "seq-once@example.com", "sent", "id");
    expect(planSeq([s("seq-once")], now + H).due).toEqual([]);
    expect(planSeq([s("seq-once")], now + 5 * H).due).toEqual([]);
    // a second checkout from the same address an hour later: the 20-hour backstop holds it
    const other = planSeq([{ ...s("seq-once-b"), created: Math.floor((now - H) / 1000) }], now + 2 * H);
    expect(other.due).toEqual([]);
  });

  it("every language has every letter's words; the letter counts itself and names the price shown", () => {
    for (const l of LOCALES) {
      const t = RECOVER_SEQ_T[l]!;
      expect(t, l).toBeTruthy();
      expect(t.foot, l).toBeTruthy(); // 10-17: the footer no longer counts the letters (Neil: 不把产品逻辑给读者看)
      expect(t.price, l).toContain("{price}");
      for (const k of ["subject1", "subject2", "subject3", "subject4"] as const) expect(t[k], `${l}.${k}`).toContain("{hex}");
    }
    const m = buildRecoverSeqEmail({ locale: "zh-hant", step: 2, kind: "deep", date: "10月12日", q: "他會回來嗎", hex: "乾", price: "NT$269", url: "https://x/u", unsubUrl: "https://x/s", n: 5 });
    expect(m.subject).toBe("那一卦還在：乾");
    expect(m.text).toContain("NT$269");
    expect(m.text).not.toContain("這是第 2 封");
    const last = buildRecoverSeqEmail({ locale: "zh-hant", step: 4, kind: "deep", date: "10月12日", q: null, hex: "乾", price: "NT$269", url: "https://x/u", unsubUrl: "https://x/s", n: 5 });
    expect(last.text).toContain("之後不會再寄");
  });
});

describe("第 3–4 卦存这件事", () => {
  it("the date letter goes at 10:00 their time the day before the first time named — not under 12 hours away, not past 30 days", () => {
    const now = Date.UTC(2026, 9, 12, 2);
    const r = matterReminder("2026-10-20", 480, "zh-hant", now)!;
    expect(r.at).toBe(Date.UTC(2026, 9, 19, 10) - 480 * 60_000);
    expect(r.when).toBe("10月中旬");
    expect(matterReminder("2026-10-12", 480, "zh-hant", now)).toBeNull();
    expect(matterReminder("2026-12-30", 480, "zh-hant", now)).toBeNull();
    expect(matterReminder("bad", 480, "zh-hant", now)).toBeNull();
  });

  it("every language has the box and both letters", () => {
    for (const l of LOCALES) {
      const t = MATTER_SAVE_T[l]!;
      expect(t.title, l).toContain("{n}");
      expect(t.body, l).toContain("{when}");
      expect(t.rLead, l).toContain("{when}");
    }
    const m = buildSavedRemindEmail({ locale: "zh-hant", hex: "乾", question: "他會回來嗎", when: "10月中旬", url: "https://x/u", unsubUrl: "https://x/s" });
    expect(m.subject).toBe("你問的那件事，卦裡的日子快到了");
    expect(m.text).toContain("10月中旬");
  });
});

describe("第 4 卦起 10% 对照", () => {
  it("about one browser in ten, always the same answer for the same browser", () => {
    let n = 0;
    for (let i = 0; i < 5000; i++) if (inN4Control(`b${i}`)) n++;
    expect(n / 5000).toBeGreaterThan(N4_CONTROL_SHARE - 0.02);
    expect(n / 5000).toBeLessThan(N4_CONTROL_SHARE + 0.02);
    expect(inN4Control("same")).toBe(inN4Control("same"));
    expect(inN4Control(null)).toBe(false);
  });
});
