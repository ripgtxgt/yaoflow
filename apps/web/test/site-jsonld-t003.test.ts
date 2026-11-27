import { describe, expect, it } from "vitest";
import { homeJsonLd, pageJsonLd } from "../src/lib/site-jsonld";

/** 11-02 T-003: the home, 今天 and 關於 pages carry schema.org. */
describe("T-003 結構化資料", () => {
  it("home: the site and who runs it", () => {
    const j = homeJsonLd("zh-hant", "線上卜卦") as { "@graph": { "@type": string; url?: string; inLanguage?: string }[] };
    expect(j["@graph"].map((x) => x["@type"])).toEqual(["WebSite", "Organization"]);
    expect(j["@graph"][0]!.url).toBe("https://yaoflow.com/zh-hant");
    expect(j["@graph"][0]!.inLanguage).toBe("zh-Hant");
  });
  it("today and about", () => {
    expect(pageJsonLd("en", "/today", "WebPage", "Today", null)).toMatchObject({ "@type": "WebPage", url: "https://yaoflow.com/en/today", inLanguage: "en" });
    expect(pageJsonLd("ja", "/about", "AboutPage", "について", "x")).toMatchObject({ "@type": "AboutPage", mainEntity: { "@type": "Organization" } });
  });
});
