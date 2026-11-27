import type { Metadata } from "next";

/**
 * 10-26 进度表 116 (Neil: 分享卡「交給素材工坊吧」) — a product page's own share card: its title and description, and on
 * Chinese pages the 素材工坊 card (public/og/og-<key>.png, 1200×630; 繁簡 share it). A page that sets `openGraph` loses the
 * site's default card (Next does not merge the parent's file image into it — that is why 擲筊／塔羅 had none), so a page
 * without a card of its own points back at the default one.
 */
export type OgCard = "jiaobei" | "tarot" | "bazi" | "ziwei" | "xingpan" | "nianshu";
export const OG_CARDS: readonly OgCard[] = ["jiaobei", "tarot", "bazi", "ziwei", "xingpan", "nianshu"];

export function productOg(locale: string, title: string, description: string, card: OgCard | null): Pick<Metadata, "openGraph" | "twitter"> {
  const zh = locale === "zh" || locale === "zh-hant";
  const image = card && zh
    ? { url: `/og/og-${card}.png`, width: 1200, height: 630, alt: title }
    : { url: `/${locale}/opengraph-image`, width: 1200, height: 630, alt: title };
  return {
    openGraph: { title, description, type: "website", images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}
