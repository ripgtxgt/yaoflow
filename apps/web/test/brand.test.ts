import { describe, expect, it } from "vitest";
import { BRAND_HAN, brandName, isHan, senderName } from "../src/lib/brand";
import { senderFor } from "../src/lib/email";
import { t } from "../src/lib/i18n";
import { ABOUT, ABOUT_META } from "../src/lib/trust";

/** 10-22 进度表 81 「爻流」上站: the Chinese name beside the Latin one on Chinese pages and letters, nowhere else */
describe("爻流 (81)", () => {
  it("the name per language", () => {
    expect(BRAND_HAN).toBe("爻流");
    expect(brandName("zh")).toBe("爻流 YaoFlow");
    expect(brandName("zh-hant")).toBe("爻流 YaoFlow");
    for (const l of ["en", "ja", "ko", "fr", "de", "es", "pt"]) { expect(brandName(l)).toBe("YaoFlow"); expect(isHan(l)).toBe(false); }
    expect(senderName(null)).toBe("YaoFlow"); expect(senderName("zh-hant")).toBe("爻流 YaoFlow");
  });

  it("the masthead, the footer and the disclaimer carry it in both scripts; English keeps YaoFlow", () => {
    expect(t("zh-hant", "brand")).toBe("爻流 YaoFlow"); expect(t("zh", "brand")).toBe("爻流 YaoFlow"); expect(t("en", "brand")).toBe("YaoFlow");
    expect(t("zh-hant", "footer")).toBe("© 爻流 YaoFlow · 一事一卦"); expect(t("zh", "footer")).toBe("© 爻流 YaoFlow · 一事一卦");
    expect(t("zh-hant", "disclaimer")).toContain("爻流 YaoFlow 是"); expect(t("en", "footer")).toContain("© YaoFlow");
    expect(ABOUT[0]!.zh.p[0]).toMatch(/^爻流（YaoFlow）是/); expect(ABOUT_META.zh).toMatch(/^爻流 YaoFlow 是/); expect(ABOUT_META.en).toMatch(/^YaoFlow is/);
  });

  it("the sender: the same address under the Chinese name for a Chinese reader, untouched otherwise", () => {
    expect(senderFor("YaoFlow <noreply@yaoflow.com>", true)).toBe("爻流 YaoFlow <noreply@yaoflow.com>");
    expect(senderFor("noreply@yaoflow.com", true)).toBe("爻流 YaoFlow <noreply@yaoflow.com>");
    expect(senderFor("\"YaoFlow\" <hello@yaoflow.com> ", true)).toBe("爻流 YaoFlow <hello@yaoflow.com>");
    expect(senderFor("YaoFlow <noreply@yaoflow.com>", false)).toBe("YaoFlow <noreply@yaoflow.com>");
  });
});
