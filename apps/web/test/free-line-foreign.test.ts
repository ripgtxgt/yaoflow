import { afterEach, describe, expect, it } from "vitest";
import { freeLineOn } from "../src/lib/free-line";
import { askFromPageLocale } from "../src/lib/ask-from-page";

/** 11-04 (Neil：「做1，2吧」): the free line back for the languages outside 简体／繁體; a question box on their content pages. */
describe("free line by language", () => {
  afterEach(() => { delete process.env.FREE_LINE; delete process.env.FREE_LINE_FOREIGN; });

  it("11-05 进度表 141: on for every language", () => {
    for (const l of ["en", "ja", "ko", "fr", "de", "es", "pt", "zh", "zh-hant"]) expect(freeLineOn(l)).toBe(true);
    expect(freeLineOn(undefined)).toBe(true);
  });

  it("FREE_LINE_FOREIGN=off turns it off outside Chinese; FREE_LINE=off turns it off everywhere", () => {
    process.env.FREE_LINE_FOREIGN = "off";
    expect(freeLineOn("en")).toBe(false);
    expect(freeLineOn("zh-hant")).toBe(true);
    process.env.FREE_LINE = "off";
    expect(freeLineOn("zh-hant")).toBe(false);
  });

  it("the question box is for the foreign pages only", () => {
    expect(askFromPageLocale("en")).toBe(true);
    expect(askFromPageLocale("ja")).toBe(true);
    expect(askFromPageLocale("zh-hant")).toBe(false);
    expect(askFromPageLocale("zh")).toBe(false);
  });
});
