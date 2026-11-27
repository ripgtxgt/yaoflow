import { describe, expect, it } from "vitest";
import { followupStateBlock } from "@/lib/followup-state";
import { followupSystem } from "@/lib/reading";

describe("追问按轮次 (09-29)", () => {
  it("counts the question and what is left after it", () => {
    const b = followupStateBlock({ n: 4, allowance: 5, earlier: ["他还想我吗", "他会回来吗", "他在想什么"], said: "verdict: 会有联系", today: "2026-09-29", noteName: "記一筆進展" });
    expect(b).toContain("question_number: 4 of 5");
    expect(b).toContain("questions_left_after_this: 1");
    expect(b).toContain("closing_required: yes");
    expect(b).toContain("  3. 他在想什么");
    expect(b).toContain("note_box_name: 記一筆進展");
    expect(b).toContain("WHAT THE READING ALREADY SAID:\nverdict: 会有联系");
  });

  it("never goes below zero and clips long questions", () => {
    const b = followupStateBlock({ n: 12, allowance: 10, earlier: ["x".repeat(400)], said: "", today: "2026-09-29", noteName: "n" });
    expect(b).toContain("questions_left_after_this: 0");
    expect(b).toMatch(/1\. x{140}…/);
    expect(b).not.toContain("WHAT THE READING ALREADY SAID");
  });

  it("the staged rules appear only when asked for", () => {
    expect(followupSystem("deep", "zh-hant")).not.toContain("SAME QUESTION AGAIN");
    const s = followupSystem("deep", "zh-hant", { staged: true });
    expect(s).toContain("SAME QUESTION AGAIN");
    expect(s).toContain("closing_required");
    expect(s).toContain("NOT a repeat");
    expect(s).toContain("`note_box_name`");
    expect(s).not.toMatch(/membership.*upsell/i);
  });
});
