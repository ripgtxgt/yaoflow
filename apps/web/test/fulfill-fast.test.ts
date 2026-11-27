import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// 10-18 (#2378): paid, never came back to our page, reading waited ~9 minutes for the 10-minute sweep.
// The every-minute lane (?only=pay) must do the paid-session sweep and nothing else.
describe("付款履约快车道（每分钟）", () => {
  const src = readFileSync(join(import.meta.dirname, "..", "src", "app", "api", "fulfill", "run", "route.ts"), "utf8");
  it("不探模型、给买家自己的页面留两分钟、扫完付款就返回", () => {
    expect(src).toMatch(/const probe = dry \|\| onlyPay \? \[\]/);
    expect(src).toMatch(/if \(onlyPay && Date\.now\(\) \/ 1000 - s\.created < FAST_LANE_GRACE_S\) continue;/);
    const early = src.indexOf("if (onlyPay) return");
    expect(early).toBeGreaterThan(src.indexOf("for (const s of sessions)"));
    expect(early).toBeLessThan(src.indexOf("refreshStaleSubscriptions()"));
  });
});
