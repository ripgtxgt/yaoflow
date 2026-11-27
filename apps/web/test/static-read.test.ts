import { describe, expect, it } from "vitest";
import type { LineValue } from "@yaoflow/engine";
import { buildUserPayload, resolveServerChart, resolveTiming, staticRead } from "../src/lib/reading";

/**
 * 09-09: the same still chart (水風井, no moving line) was called 復合有望 once
 * and 復合難成 the next time. The engine now pre-judges still charts —
 * 用神旺衰 + 旬空/月破 + 日辰生克 → lean — and the prompt binds the verdict to it.
 */
describe("静卦判读", () => {
  const at = Date.UTC(2026, 8, 9, 3); // 2026-09-09 11:00 Taipei
  const still = { question: "還有可能復合嗎", values: [8, 7, 7, 8, 7, 8] as LineValue[], castAtMs: at, tzOffsetMinutes: 480 };
  const moving = { ...still, values: [8, 7, 9, 8, 7, 8] as LineValue[] };

  it("gives a still chart a lean and a citable rule, and the same one every time", () => {
    const chart = resolveServerChart(still, true);
    const timing = resolveTiming(still, chart, true);
    const a = staticRead(chart, timing)!;
    const b = staticRead(chart, resolveTiming(still, chart, true))!;
    expect(a).not.toBeNull();
    expect(["favorable", "unfavorable", "mixed"]).toContain(a.lean);
    expect(a.rule_zh).toMatch(/^静卦：用神[旺相休囚死]/);
    expect(a.rule_en).toMatch(/^Still chart/);
    expect(a.focal_pos).toBe(timing.focal.pos);
    expect(b).toEqual(a);
  });

  it("is absent when a line moves — the computed changes anchor those charts already", () => {
    const chart = resolveServerChart(moving, true);
    const timing = resolveTiming(moving, chart, true);
    expect(staticRead(chart, timing)).toBeNull();
    expect(buildUserPayload(moving.question, chart, timing)).not.toContain("static_read");
  });

  it("rides in the payload only for still charts, with the lean the model must follow", () => {
    const chart = resolveServerChart(still, true);
    const timing = resolveTiming(still, chart, true);
    const payload = JSON.parse(buildUserPayload(still.question, chart, timing)) as { static_read?: { lean: string; rule_zh: string } };
    expect(payload.static_read?.lean).toBeTruthy();
    expect(payload.static_read?.rule_zh).toContain("世");
  });
});
