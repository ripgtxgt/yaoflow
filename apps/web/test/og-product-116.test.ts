import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { OG_CARDS, productOg } from "../src/lib/og-product";

/** 10-26 进度表 116: product pages share their own title, description and — on Chinese pages — the 素材工坊 card */
const meta = async (route: string, locale: string) => {
  const m = (await import(`../src/app/[locale]/${route}/page`)) as { generateMetadata: (a: { params: Promise<{ locale: string }> }) => Promise<Record<string, unknown>> };
  return m.generateMetadata({ params: Promise.resolve({ locale }) }) as Promise<{ openGraph?: { title?: string; images?: { url: string }[] }; twitter?: { images?: string[] }; description?: string }>;
};

describe("產品頁分享卡 (116)", () => {
  it("every card is a 1200×630 png in public/og", () => {
    for (const c of OG_CARDS) {
      const p = join(__dirname, "..", "public", "og", `og-${c}.png`);
      expect(existsSync(p)).toBe(true);
      const b = readFileSync(p);
      expect(b.readUInt32BE(16)).toBe(1200); expect(b.readUInt32BE(20)).toBe(630);
    }
  });

  it("Chinese pages carry the card; other languages and card-less pages keep the site's default card", () => {
    expect(productOg("zh-hant", "t", "d", "tarot").openGraph).toMatchObject({ images: [{ url: "/og/og-tarot.png" }] });
    expect(productOg("zh", "t", "d", "tarot").openGraph).toMatchObject({ images: [{ url: "/og/og-tarot.png" }] });
    expect(productOg("en", "t", "d", "tarot").openGraph).toMatchObject({ images: [{ url: "/en/opengraph-image" }] });
    expect(productOg("zh-hant", "t", "d", null).openGraph).toMatchObject({ images: [{ url: "/zh-hant/opengraph-image" }] });
  });

  it("the pages: own titles, the right card, and a chart page no longer says its reading is free", async () => {
    for (const [route, card] of [["jiaobei", "jiaobei"], ["tarot", "tarot"], ["bazi", "bazi"], ["ziwei", "ziwei"], ["xingpan", "xingpan"]] as const) {
      const m = await meta(route, "zh-hant");
      expect(m.openGraph?.images?.[0]?.url).toBe(`/og/og-${card}.png`);
      expect(m.twitter?.images?.[0]).toBe(`/og/og-${card}.png`);
      expect(m.openGraph?.title).not.toContain("一事一卦");
    }
    for (const route of ["huangli", "zeri", "qiuqian"]) {
      const m = await meta(route, "zh-hant");
      expect(m.openGraph?.images?.[0]?.url).toBe("/zh-hant/opengraph-image");
      expect(m.openGraph?.title).toBeTruthy();
    }
    for (const route of ["bazi", "ziwei", "xingpan"]) expect((await meta(route, "zh-hant")).description).toContain("白話解讀");
  }, 60_000); // importing eight page modules takes a few seconds
});
