import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { localDay } from "@/lib/clock";

/**
 * 10-29 React #418 on /reading: RevisitPlan named the ask day with the runtime's own clock, so the server (UTC) and a
 * phone in UTC+8 disagreed for every ask between 00:00 and 08:00 Taipei (305 of 1,467 pending). The day now comes from
 * the page, in the reader's clock.
 */
describe("RevisitPlan day", () => {
  it("is the reader's own day, the same on the server and in the browser", () => {
    const due = Date.UTC(2026, 9, 30, 17, 0); // 10-31 01:00 in Taipei, still 10-30 in UTC
    expect(localDay(due, 480)).toBe("2026-10-31");
    expect(localDay(due, 0)).toBe("2026-10-30");
  });
  it("the component no longer reads a clock while rendering", () => {
    const src = readFileSync(join(__dirname, "../src/components/RevisitPlan.tsx"), "utf8");
    expect(src).not.toMatch(/new Date\(|getMonth\(|getDate\(|Date\.now\(/);
    const page = readFileSync(join(__dirname, "../src/app/[locale]/reading/page.tsx"), "utf8");
    expect(page).toMatch(/<RevisitPlan[^>]*dueDay=\{localDay\(/);
  });
});
