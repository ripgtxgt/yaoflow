import { describe, expect, it } from "vitest";
import { gateNext, LOGIN_GATE_T } from "../src/lib/dict/login-gate";
import { safeNextPath } from "../src/lib/auth";
import { LOCALES } from "../src/lib/i18n";

/** 10-25 (Neil: 「把这些可以不登录使用的产品也改为需要登录才能使用」): the login card brings the reader back with what they typed */
describe("登入卡", () => {
  it("the way back keeps the question and passes the login page's check", () => {
    const n = gateNext("/zh-hant/cast", { q: "他 會回來嗎*", gift: "abc", empty: "", many: ["x", "y"] });
    expect(n).toBe("/zh-hant/cast?q=%E4%BB%96%20%E6%9C%83%E5%9B%9E%E4%BE%86%E5%97%8E%2A&gift=abc");
    expect(safeNextPath(n)).toBe(n);
    expect(gateNext("/zh/tarot", {})).toBe("/zh/tarot");
  });
  it("every language has the card", () => {
    for (const l of LOCALES) expect(LOGIN_GATE_T[l]?.btn, l).toBeTruthy();
  });
});
