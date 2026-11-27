import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

/**
 * Regression guard. --yao-h was once declared inside `.yao` only, but the yin
 * line's three segments are matched by `.yao-yin > span` — not descendants of
 * `.yao` — so the variable never resolved there, height collapsed to zero, and
 * every broken line rendered invisible. Half the chart silently disappeared.
 */
describe("yao line geometry", () => {
  const rootBlock = css.slice(css.indexOf(":root"), css.indexOf("}", css.indexOf(":root")));

  it("declares the line geometry on :root, where both line shapes can see it", () => {
    expect(rootBlock).toMatch(/--yao-h:\s*\d/);
    expect(rootBlock).toMatch(/--yao-gap:\s*\d/);
  });

  it("does not re-declare --yao-h inside .yao, which would hide the yin lines", () => {
    const yaoBlock = css.slice(css.indexOf("\n.yao {"), css.indexOf("}", css.indexOf("\n.yao {")));
    expect(yaoBlock).not.toMatch(/--yao-h\s*:/);
  });

  it("gives both line shapes a resolvable height", () => {
    for (const sel of ["\n.yao {", ".yao-yin > span {"]) {
      const block = css.slice(css.indexOf(sel), css.indexOf("}", css.indexOf(sel)));
      expect(block, `${sel} must set a height`).toMatch(/height:\s*var\(--yao-h\)/);
    }
  });
});
