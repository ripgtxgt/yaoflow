import { describe, expect, it } from "vitest";
import { grantInviteLight } from "../src/lib/grants";
import { customerHadInviteLight, emailHadInviteLight, upsertCustomer } from "../src/lib/db";

// 10-18 (#2350): a first-timer's free reading was filed with the address but no customer id; the check by id
// never saw it, and the same address took a second free reading from another browser two minutes later
describe("新人免费：同一个邮箱只能一次（10-18）", () => {
  it("先领免费、后建客户：按客户查也能查到", () => {
    grantInviteLight("ab_free", "{}", "Twice@Example.com", null, "zh-hant");
    const cid = upsertCustomer("twice@example.com", "zh-hant");
    expect(customerHadInviteLight(cid)).toBe(true);
    expect(emailHadInviteLight(" twice@example.com")).toBe(true);
  });
  it("没领过的照常可以领", () => {
    const cid = upsertCustomer("fresh@example.com", "zh-hant");
    expect(customerHadInviteLight(cid)).toBe(false);
    expect(emailHadInviteLight("fresh@example.com")).toBe(false);
  });
});
