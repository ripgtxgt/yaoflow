import { describe, expect, it } from "vitest";
import { t } from "../src/lib/i18n";
import { LOCALES } from "../src/lib/locales";
import { pick, TRUST_POINTS } from "../src/lib/trust";

/**
 * 10-12 进度表 39 (Neil: 首页以后不出现「AI」两个字；模型怎么分工，只在关于页讲). The home page's hero line and its
 * 「我们如何工作」 points carry no AI / IA / KI / 人工智慧 in any language. /about, the terms, the privacy policy and
 * llms.txt keep saying how the readings are written — that is disclosure, not a selling point.
 */
const AI = /\bAI\b|\bIA\b|\bKI\b|人工智|ＡＩ/;

describe("首页不出现 AI", () => {
  it("hero line and the three trust points, nine languages", () => {
    for (const l of LOCALES) {
      expect(t(l, "heroSub"), `${l} heroSub`).not.toMatch(AI);
      for (const p of TRUST_POINTS) {
        const c = pick(p, l);
        expect(`${c.title} ${c.body}`, `${l} ${p.k}`).not.toMatch(AI);
      }
    }
    expect(pick(TRUST_POINTS.find((p) => p.k === "engine")!, "zh-hant").title).toBe("盤照古法排");
    expect(pick(TRUST_POINTS.find((p) => p.k === "engine")!, "zh-hant").body).toMatch(/古書裡都查得到。$/);
  });
});
