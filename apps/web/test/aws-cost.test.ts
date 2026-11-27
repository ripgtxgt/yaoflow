import { describe, expect, it } from "vitest";
import { parseCostExplorer } from "../src/lib/aws-cost";
import { awsCostBetween, saveAwsCostDays } from "../src/lib/db";

describe("服务器成本按 AWS 实时账单（09-27）", () => {
  it("reads Cost Explorer's days by service, and a later read overwrites an estimated day", () => {
    const rows = parseCostExplorer({
      ResultsByTime: [
        { TimePeriod: { Start: "2026-09-01" }, Groups: [
          { Keys: ["EC2 - Other"], Metrics: { UnblendedCost: { Amount: "1.50" } } },
          { Keys: ["Amazon Elastic Compute Cloud - Compute"], Metrics: { UnblendedCost: { Amount: "0.80" } } },
        ] },
        { TimePeriod: { Start: "2026-09-02" }, Estimated: true, Groups: [
          { Keys: ["EC2 - Other"], Metrics: { UnblendedCost: { Amount: "1.00" } } },
        ] },
      ],
    });
    expect(rows).toHaveLength(3);
    saveAwsCostDays(rows);
    expect(awsCostBetween("2026-09-01", "2026-09-03").map((r) => [r.service, Math.round(r.usd * 100)])).toEqual([["EC2 - Other", 250], ["Amazon Elastic Compute Cloud - Compute", 80]]);
    expect(awsCostBetween("2026-09-02", "2026-09-03")[0]!.estimated).toBe(true);
    // AWS settles the day: same key, new figure, no longer estimated
    saveAwsCostDays([{ day: "2026-09-02", service: "EC2 - Other", usd: 1.2, estimated: false }]);
    const d2 = awsCostBetween("2026-09-02", "2026-09-03")[0]!;
    expect(Math.round(d2.usd * 100)).toBe(120);
    expect(d2.estimated).toBe(false);
    expect(awsCostBetween("2026-09-03", "2026-09-04")).toEqual([]);
  });
});
