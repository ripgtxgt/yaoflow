import { describe, expect, it } from "vitest";
import { jiaobeiAsk, parsePre, prePromptNote, preFromBody, preFunnel, saveJiaobeiAsk } from "../src/lib/pre-cast";
import { createDraw } from "../src/lib/tarot";
import { readCastExtras } from "../src/lib/cast-extras";
import { cv } from "../src/lib/dict/convert";

/** 10-17 承接: a 擲筊 or tarot spread carried into the cast that follows */
const BANNED = /準|靈驗|保證|神明說/;

describe("承接 · 擲筊／塔羅 → 起卦", () => {
  it("a finished 擲筊 is kept and read back; only our own fresh rows are believed", () => {
    const tk = saveJiaobeiAsk({ question: "這份工作要不要接", rule: 3, seq: ["sheng", "xiao", "sheng", "sheng"], locale: "zh-hant", bid: "pc-b1", customerId: null });
    expect(jiaobeiAsk(tk)).toMatchObject({ rule: 3, sign: "sheng", seq: ["sheng", "xiao", "sheng", "sheng"] });
    expect(parsePre(`jb:${tk}`)).toEqual({ kind: "jb", token: tk });
    expect(parsePre(`jb:${"a".repeat(24)}`)).toBeUndefined();
    expect(parsePre("jb:nope")).toBeUndefined();
    const old = saveJiaobeiAsk({ question: "很久以前的事", rule: 1, seq: ["yin"], locale: "zh-hant", bid: null, customerId: null }, Date.now() - 8 * 86_400_000);
    expect(parsePre(`jb:${old}`)).toBeUndefined();
    expect(preFromBody({ pre: `jb:${tk}` })).toEqual({ kind: "jb", token: tk });
    expect(readCastExtras({ pre: `jb:${tk}` }, "這份工作要不要接", "zh-hant").pre).toEqual({ kind: "jb", token: tk });
  });

  it("the reading is told it as background, without a deity, a promise or a redo", () => {
    const tk = saveJiaobeiAsk({ question: "他會回來嗎", rule: 1, seq: ["yin"], locale: "zh-hant", bid: null, customerId: null });
    const note = prePromptNote({ kind: "jb", token: tk });
    expect(note).toMatch(/MOON BLOCKS/);
    expect(note).toMatch(/陰筊/);
    expect(note).toMatch(/Never say a deity/);
    const { token } = createDraw({ question: "這段關係接下來呢", spread: 3, locale: "zh-hant", bid: "pc-b2", customerId: null, register: null });
    expect(parsePre(`tarot:${token}`)).toEqual({ kind: "tarot", token });
    const t = prePromptNote({ kind: "tarot", token });
    expect(t).toMatch(/TAROT/);
    expect(t).toMatch(/卡住的地方/);
    expect(prePromptNote(undefined)).toBe("");
  });

  it("the weekly numbers count by how the 擲筊 ended", () => {
    const f = preFunnel(Date.now() - 86_400_000);
    expect(f.jb.sheng3?.asks ?? 0).toBeGreaterThanOrEqual(1);
    expect(f.tarot.draws).toBeGreaterThanOrEqual(1);
  });

  it("the cast page's lines exist in every language and say nothing about how it works", () => {
    for (const l of ["zh-hant", "zh", "en", "ja", "ko", "fr", "de", "es", "pt"]) {
      for (const k of ["jbLineS3", "jbLineS", "jbLineY", "jbLineX", "tarotLine", "jbEntry"] as const) expect(cv(l, k), `${l}.${k}`).toBeTruthy();
    }
    for (const k of ["jbLineS3", "jbLineS", "jbLineY", "jbLineX", "tarotLine", "jbEntry"] as const) expect(BANNED.test(cv("zh-hant", k))).toBe(false);
    expect(cv("zh", "jbEntry")).toContain("掷");
  });
});
