import { describe, expect, it } from "vitest";
import { marketingBoxStartsTicked } from "../src/lib/consent";

/** 09-23: ticked by default, except where a pre-ticked box is not valid consent. */
describe("推广邮件勾选框的默认值", () => {
  it("台港日美默认勾上", () => {
    for (const c of ["TW", "HK", "JP", "US", "MY", "SG"]) expect(marketingBoxStartsTicked(c), c).toBe(true);
    expect(marketingBoxStartsTicked(null, undefined)).toBe(true);
  });
  it("欧盟、英国、瑞士、加拿大、韩国默认不勾", () => {
    for (const c of ["DE", "FR", "GB", "CH", "CA", "KR", "no"]) expect(marketingBoxStartsTicked(c), c).toBe(false);
  });
  it("时钟和 IP 任一指向这些地方就不勾", () => {
    expect(marketingBoxStartsTicked("TW", "DE")).toBe(false);
    expect(marketingBoxStartsTicked("GB", "HK")).toBe(false);
  });
});
