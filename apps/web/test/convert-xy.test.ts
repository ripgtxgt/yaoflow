import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { AB_RE, abArms, PREVIEW_BIT, SAVE_BIT } from "../src/lib/ab";
import { abStats } from "../src/lib/ab-stats";
import type { TrackedEvent } from "../src/lib/analytics-server";
import { CONVERT_T, cv } from "../src/lib/dict/convert";
import { PRIVACY } from "../src/lib/legal";
import { PRIVACY_HANT } from "../src/lib/legal-hant";
import { LOCALES } from "../src/lib/locales";

/** 10-02 (Neil: 「做 3 和 4 吧，然后话术上面还能优化吗」): two more experiments on the same browser draw. */
function withDraw<T>(n: number, f: () => T): T {
  const g = globalThis as unknown as { window?: unknown; localStorage?: unknown };
  const had = { window: g.window, localStorage: g.localStorage };
  g.window = globalThis;
  g.localStorage = { getItem: () => String(n), setItem: () => {} };
  try { return f(); } finally { g.window = had.window; g.localStorage = had.localStorage; }
}

describe("对照测试 x / y：抽签与标签", () => {
  it("x is the 32s bit, y the 64s bit, independent of the others; the tag carries both", () => {
    expect(PREVIEW_BIT(32)).toBe(true);
    expect(PREVIEW_BIT(31)).toBe(false);
    expect(SAVE_BIT(64)).toBe(true);
    expect(SAVE_BIT(63)).toBe(false);
    const a = withDraw(32 + 64 + 16 + 1, () => abArms()!);
    // 10-08: f, o, h, y ended too — free for everyone, plain preview, old hero, no save; the tag says so
    expect(a).toMatchObject({ free: true, odds: false, home: false, preview: true, save: false, onePrice: false, verdict: false });
    expect(a.tag).toBe("f1o0p0v0h0x1y0");
    // 10-05: x ended in favour of the preview — a draw outside the old x arm gets it too, and the tag says x1
    expect(withDraw(0, () => abArms()!)).toMatchObject({ preview: true, save: false });
    expect(withDraw(0, () => abArms()!.tag)).toBe("f1o0p0v0h0x1y0");
    // over the whole draw each arm is half
    let x = 0, y = 0, both = 0;
    for (let n = 0; n < 10000; n++) { const p = PREVIEW_BIT(n), s = SAVE_BIT(n); if (p) x++; if (s) y++; if (p && s) both++; }
    expect(x).toBeGreaterThan(4900); expect(x).toBeLessThan(5100);
    expect(y).toBeGreaterThan(4900); expect(y).toBeLessThan(5100);
    expect(both).toBeGreaterThan(2400); expect(both).toBeLessThan(2600);
  });

  it("every older tag is still accepted, and the new one everywhere the tag is read", () => {
    for (const t of ["f1o0", "f1o0p0v1", "f1o0p0v1h1", "f1o0p0v0h1x1y0"]) expect(AB_RE.test(t), t).toBe(true);
    for (const t of ["f1o0x1", "f1o0p0v0h1x1", "f1o0p0v0h1x2y0"]) expect(AB_RE.test(t), t).toBe(false);
    const track = readFileSync(new URL("../src/app/api/track/route.ts", import.meta.url), "utf8");
    const checkout = readFileSync(new URL("../src/app/api/checkout/route.ts", import.meta.url), "utf8");
    expect(track).toContain("AB_RE.test(b.ab)");
    expect(checkout).toContain("AB_RE.test(");
    expect(track).toMatch(/"cast_saved", "saved_open"/);
  });
});

describe("对照测试 x / y：看板", () => {
  const ev = (s: string, e: TrackedEvent["e"], ab: string, method?: string): TrackedEvent => ({ t: 1, s, e, ab, ...(method ? { method } : {}) });

  it("x: read on the 12th character; taps on the new button counted", () => {
    const evs = [
      ev("a", "teaser_shown", "f0o0p0v0h0x1y0"), ev("a", "heat_click", "f0o0p0v0h0x1y0", "preview-deep"), ev("a", "checkout_start", "f0o0p0v0h0x1y0"),
      ev("b", "teaser_shown", "f0o0p0v0h0x0y0"),
      ev("c", "teaser_shown", "f0o0p0v0h1"), // drawn before today: neither arm
    ];
    const r = abStats(evs, new Set(["a"]));
    expect(r.preview.find((x) => x.arm === "1")).toMatchObject({ sessions: 1, teased: 1, checkout: 1, previewTaps: 1, paid: 1 });
    expect(r.preview.find((x) => x.arm === "0")).toMatchObject({ sessions: 1, teased: 1, previewTaps: 0, paid: 0 });
  });

  it("y: saves counted; a visit back from the letter adds what it paid to y1 — even on another device that drew y0", () => {
    const evs = [
      ev("a", "teaser_shown", "f0o0p0v0h0x0y1"), ev("a", "cast_saved", "f0o0p0v0h0x0y1", "ok"),
      ev("b", "teaser_shown", "f0o0p0v0h0x0y1"), ev("b", "cast_saved", "f0o0p0v0h0x0y1", "too_many"),
      ev("c", "teaser_shown", "f0o0p0v0h0x0y0"),
      ev("r1", "saved_open", "f0o0p0v0h0x0y1"), // the same browser, the next day
      ev("r2", "saved_open", "f1o1p0v0h1x1y0"), // the letter opened on a phone
    ];
    const r = abStats(evs, new Set(["r1", "r2"]));
    const y1 = r.save.find((x) => x.arm === "1")!;
    const y0 = r.save.find((x) => x.arm === "0")!;
    expect(y1).toMatchObject({ sessions: 2, teased: 2, saved: 1, returned: 2, returnPaid: 2, paid: 2 });
    expect(y0).toMatchObject({ sessions: 1, teased: 1, saved: 0, returned: 0, paid: 0 });
    // a return visit is nobody's first sight of the free line, in any experiment
    expect(r.free.reduce((n, x) => n + x.sessions, 0)).toBe(3);
    expect(r.preview.reduce((n, x) => n + x.paid, 0)).toBe(0);
  });
});

describe("对照测试 x / y：文案", () => {
  it("every language has every line, with the same blanks as the Chinese", () => {
    const blanks = (s: string) => (s.match(/\{\w+\}/g) ?? []).map((b) => (b === "{m}" || b === "{month}" ? "{M}" : b)).sort().join();
    for (const l of LOCALES) {
      const t = (CONVERT_T as Record<string, Record<string, string>>)[l]!;
      expect(Object.keys(t).sort(), l).toEqual(Object.keys(CONVERT_T.zh).sort());
      for (const [k, v] of Object.entries(CONVERT_T.zh)) expect(blanks(t[k]!), `${l}.${k}`).toBe(blanks(v));
      expect(t.pvWhen, l).toContain("▇▇");
      expect(t.pvWhenMonth, l).not.toContain("▇▇");
    }
  });

  it("the words say what each reading gives — the light one owns what it leaves out", () => {
    expect(cv("zh-hant", "btnDeep")).toBe("深斷 · 答案、日期、做法");
    expect(cv("zh-hant", "payOne", { price: "NT$75" })).toBe("NT$75 · 處境和走向；不含日期、做法和追問");
    expect(cv("zh-hant", "payDeepFirst", { price: "NT$75", full: "NT$269", n: 5 })).toBe("首次 NT$75（原價 NT$269）· 給結論、應期日期、下一步 · 可追問 5 次");
    expect(cv("zh", "svOpen")).toBe("还没想好？把这一卦存到邮箱 →");
    expect(cv("en", "pvWhen", { month: "October" })).toBe("around October ▇▇");
    expect(cv("xx", "svGo")).toBe("Save this cast"); // unknown language → English
  });

  it("the privacy policy says what a saved cast keeps, in every language", () => {
    // 10-03: §4 now opens with the cast log's 365 days; the saved cast's own 30 days and its button follow in the same paragraph
    const sec = PRIVACY.find((s) => JSON.stringify(s.zh).includes("**起卦记录保存 365 天。**"))!;
    expect(sec).toBeTruthy();
    for (const l of LOCALES) {
      const text = l === "zh-hant" ? JSON.stringify(PRIVACY_HANT) : JSON.stringify((sec as unknown as Record<string, unknown>)[l]);
      expect(text, l).toMatch(/30/);
    }
    // the policy names the button the reader actually sees
    const named: Record<string, string> = {
      zh: "把这一卦存到邮箱", en: "Email yourself this cast", ja: "この卦をメールで保存", ko: "이 괘를 메일로 저장",
      fr: "Envoyez-vous ce tirage par e-mail", de: "Schick dir diesen Wurf per E-Mail", es: "Envíate esta tirada por correo", pt: "Envie esta tiragem para o seu e-mail",
    };
    for (const [l, b] of Object.entries(named)) {
      expect(JSON.stringify((sec as unknown as Record<string, unknown>)[l]), l).toContain(b);
      expect(cv(l, "svOpen"), l).toContain(b);
    }
    expect(JSON.stringify(PRIVACY_HANT)).toContain("把這一卦存到信箱");
    expect(cv("zh-hant", "svOpen")).toContain("把這一卦存到信箱");
  });
});
