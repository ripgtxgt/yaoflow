import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { jargonOffense, timingOffense } from "../src/lib/reading";
import ReadingArticle from "../src/components/ReadingArticle";
import { t } from "../src/lib/i18n";
import { LOCALES } from "../src/lib/locales";

/** 09-15 内测反馈"整个解读比较难以理解"——版面与文风两步。 */

describe("应期 guard", () => {
  it("rejects 干支 leaking into timing and lists of dates, accepts one window plus one sign", () => {
    expect(timingOffense({ timing: "9月12日前后（己丑日）先见信号" }, "zh")).toBe("ganzhi:己丑日");
    expect(timingOffense({ timing: "9月15日前後（壬辰日）" }, "zh-hant")).toBe("ganzhi:壬辰日");
    expect(timingOffense({ timing: "9月12日前后、9月18日或9月24日前后会有推进；不动就要等明年1月6日到2月3日" }, "zh")).toBe("dates:5");
    expect(timingOffense({ timing: "9月12日前后先有眉目；真正定下来要到明年1月6日到2月3日这一段。" }, "zh")).toBeNull();
    // 10-13 应验校准: the smallest unit is a day — an hour range is now a rewrite
    expect(timingOffense({ timing: "今天不用急，13点到15点这一段最踏实。" }, "zh")).toMatch(/^clock:/);
    expect(timingOffense({ timing: "9월 12일 전후에 먼저 기별이 옵니다. 정해지는 것은 내년 1월 6일에서 2월 3일 사이입니다." }, "ko")).toBeNull();
    expect(timingOffense({ timing: "A first sign around September 12; the real window is January 6 to February 3." }, "en")).toBeNull();
    expect(timingOffense({ timing: "September 12, September 18, September 24, then January 6 to February 3." }, "en")).toBe("dates:5");
    expect(timingOffense({ verdict: "x" }, "zh")).toBeNull();
  });

  it("treats branch-day names and bookish phrasing outside basis as jargon, but not everyday words", () => {
    expect(jargonOffense({ strategy: "没冒出来，就再等一个子日，9月23日左右。" }, ["basis"], "zh")).toBe("strategy:个子日");
    expect(jargonOffense({ tendency: "此局吉中带阻。" }, ["basis"], "zh")).toBe("tendency:此局");
    expect(jargonOffense({ closing: "履虎尾而不被咬，靠的是脚下有准头。" }, ["basis"], "zh")).toBe("closing:履虎尾");
    expect(jargonOffense({ closing: "鴻雁落在磐石上。" }, ["basis"], "zh-hant")).toBe("closing:鴻雁");
    expect(jargonOffense({ strategy: "孩子日常的安排先别动；9月17日前后再说。", basis: "用神午火旬空，出空在午日——9月17日" }, ["basis"], "zh")).toBeNull();
  });
});

describe("深断版面", () => {
  const z = (s: string) => ({ zh: s });
  const reading = {
    verdict: z("断"), tendency: z("势"), timing: z("期"), basis: z("世爻旺相，用神休囚"), strategy: z("策"), caution: z("忌"), next_step: z("步"), closing: z("结"),
  };

  it("puts the chart's logic last, folded, after the closing line — and the action before the strategy", () => {
    const html = renderToStaticMarkup(createElement(ReadingArticle, { locale: "zh", tier: "deep", reading }));
    const order = ["断", "势", "期", "步", "策", "忌", "结", "世爻旺相"].map((s) => html.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain("<details");
    expect(html.indexOf("<details")).toBeLessThan(html.indexOf("世爻旺相"));
    expect(html).toContain(t("zh", "dBasisAside"));
    expect(html).toContain(t("zh", "dBasisHint"));
    expect(html).not.toMatch(/<details[^>]*\sopen/);
  });

  it("carries the fold's label, hint and the reading guide in every language, with no placeholders", () => {
    for (const l of LOCALES) {
      for (const k of ["dBasisAside", "dBasisHint", "readHow"] as const) {
        const s = t(l, k);
        expect(s.length, `${l}.${k}`).toBeGreaterThan(8);
        expect(s, `${l}.${k}`).not.toMatch(/\{\w+\}/);
      }
    }
  });
});
