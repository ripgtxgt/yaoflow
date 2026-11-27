import { describe, expect, it } from "vitest";
import { maxOf, minOf } from "../src/lib/minmax";

// 10-11: /admin died with "Maximum call stack size exceeded" — Math.min(...events) over ~200k values
describe("minOf / maxOf", () => {
  it("handle arrays far past the spread limit, and empty ones", () => {
    const big = Array.from({ length: 500_000 }, (_, i) => 1_000_000 - i);
    expect(minOf(big)).toBe(500_001);
    expect(maxOf(big)).toBe(1_000_000);
    expect(minOf([])).toBe(Infinity);
    expect(maxOf([])).toBe(-Infinity);
  });
});
