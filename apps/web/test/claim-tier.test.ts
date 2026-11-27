import { describe, expect, it } from "vitest";
import { INVITE_TIER, claimPanelTier } from "../src/lib/claim-tier";

/**
 * 10-03 (客服 Chun Yu, 台灣): the signed-out "寄給我，開始解讀" panel hardcoded "one", so a friend's invite — labelled
 * 「第一份深斷免費」 — checked out as a PAID light reading. The tier must follow what opened the panel.
 */
describe("the signed-out claim panel requests the tier that opened it", () => {
  it("a friend's invite is the free DEEP reading, not a paid light one", () => {
    expect(INVITE_TIER).toBe("deep");
    expect(claimPanelTier("invite")).toBe("deep");
    expect(claimPanelTier("invite", "one")).toBe("deep"); // a stale pair tier never overrides an invite
  });
  it("the free light reading (f1) stays light", () => {
    expect(claimPanelTier("free")).toBe("one");
    expect(claimPanelTier(null)).toBe("one");
  });
  it("同题合参 follows the inviter's tier", () => {
    expect(claimPanelTier("pair", "deep")).toBe("deep");
    expect(claimPanelTier("pair", "one")).toBe("one");
    expect(claimPanelTier("pair")).toBe("one"); // defensive: missing pair tier falls back, never crashes
  });
});
