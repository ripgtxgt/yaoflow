import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// 10-18 (#1928, 10-12): six callers waited on one generation and each wrote its own cast + reading for one payment.
// Every place that writes a paid reading must look again, right before writing, whether the order already has its cast.
describe("一次付款只存一份起卦和解读", () => {
  const SRC = join(import.meta.dirname, "..", "src");
  for (const f of ["app/[locale]/reading/page.tsx", "app/api/fulfill/run/route.ts"]) {
    it(f, () => {
      const lines = readFileSync(join(SRC, f), "utf8").split("\n");
      const writes = lines.map((l, i) => (/const castId = saveCast\(\{/.test(l) ? i : -1)).filter((i) => i >= 0);
      expect(writes.length).toBeGreaterThan(0);
      for (const i of writes) {
        const before = lines.slice(Math.max(0, i - 4), i).join("\n");
        expect(before, `${f}:${i + 1}`).toMatch(/castIdForSession\([^)]*\) !== null/);
        // and nothing awaited between that look and the write
        expect(before.split(/castIdForSession/).pop()).not.toMatch(/\bawait\b/);
      }
    });
  }
});
