import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JA } from "../src/lib/dict/ja";
import { JA_BANNED, jargonOffense } from "../src/lib/reading";

/**
 * 09-30 日本線 (进度表待定 22, 《日本线调研-2026-10.md》§3). 景表法 forbids promising an outcome, so the Japanese
 * copy — every dictionary's ja block — never says 絶対 / 必ず / 100% / 当たる. The reading guard rejects them too,
 * and turns a pass/fail verdict on an exam into a rewrite.
 */
const KANA = /[぀-ヿ]/;
const BANNED = /絶対|必ず|100\s*%|１００％|(?<![心見思突行ちにい])当た(?:ります|る|った|って|り(?!前))/;

describe("日本語のコピー", () => {
  it("no dictionary's Japanese line promises an outcome", () => {
    const dir = join(__dirname, "../src/lib/dict");
    const files = readdirSync(dir).filter((f) => f.endsWith(".ts")).map((f) => join(dir, f));
    files.push(join(__dirname, "../src/lib/legal.ts"), join(__dirname, "../src/lib/i18n.ts"));
    const bad: string[] = [];
    for (const f of files) {
      readFileSync(f, "utf8").split("\n").forEach((ln, i) => {
        if (ln.trim().startsWith("*") || ln.trim().startsWith("//")) return; // comments may name the banned words
        if (KANA.test(ln) && BANNED.test(ln)) bad.push(`${f.split(/[\\/]/).pop()}:${i + 1} ${ln.trim().slice(0, 80)}`);
      });
    }
    expect(bad).toEqual([]);
  });

  it("the three words Japanese readers already pay for are on the home and cast copy, and the disclaimer is the 景表法 one", () => {
    expect(JA.heroTitle).toContain("一問一答");
    expect(JA.heroTitle + JA.heroSub).toContain("吉凶がはっきり");
    expect(JA.heroSub).toContain("応期");
    expect(JA.questionHint).toContain("一問一答");
    expect(JA.tierDeepNote).toContain("吉凶をはっきり");
    expect(JA.tierDeepNote).toContain("目安");
    expect(JA.disclaimer).toBe("鑑定結果はご自身で判断いただくための参考です。特定の結果を保証するものではありません。医療・法律・投資の助言ではありません。");
    expect(JA.dTiming).toBe("応期（目安）");
  });
});

describe("日本語の鑑定ガード", () => {
  it("rejects promises and pass/fail verdicts in every field, basis included; lets ordinary words through", () => {
    expect(jargonOffense({ verdict: "この卦は当たります。" }, [], "ja")).toBe("verdict:当たります");
    expect(jargonOffense({ basis: "必ず来ます。" }, ["basis"], "ja")).toBe("basis:必ず");
    expect(jargonOffense({ verdict: "100% 大丈夫です。" }, [], "ja")).toMatch(/^verdict:100/);
    expect(jargonOffense({ verdict: "試験には合格します。" }, [], "ja")).toBe("verdict:合格します");
    expect(jargonOffense({ verdict: "準備が実る時期は10月12日頃（目安）です。当たり前のことですが、心当たりがあれば。" }, [], "ja")).toBeNull();
    expect(JA_BANNED.length).toBe(3);
  });
});
