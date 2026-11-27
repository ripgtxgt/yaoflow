import { describe, expect, it } from "vitest";
import { FEATURES, featureOn, featureRows, featureState, featureVisible, setFeature } from "../src/lib/features";
import { adminToken } from "../src/lib/admin-auth";

/** 10-15 功能开关: preview → only the admin's browser; on → everyone; off → no one */
describe("功能开关", () => {
  it("defaults, preview, on, off", async () => {
    process.env.ADMIN_KEY ??= "test-admin-key";
    const tok = (await adminToken())!;
    expect(featureState("today-qian")).toBe(FEATURES.find((f) => f.name === "today-qian")!.def);
    setFeature("today-qian", "preview");
    expect(await featureVisible("today-qian", undefined)).toBe(false);
    expect(await featureVisible("today-qian", tok)).toBe(true);
    expect(featureOn("today-qian")).toBe(false);
    setFeature("today-qian", "on");
    expect(await featureVisible("today-qian", undefined)).toBe(true);
    expect(featureOn("today-qian")).toBe(true);
    setFeature("today-qian", "off");
    expect(await featureVisible("today-qian", tok)).toBe(false);
    expect(featureRows().find((r) => r.name === "today-qian")!.state).toBe("off");
    setFeature("today-qian", "on");
    expect(featureState("nope")).toBe("off");
  });
});
