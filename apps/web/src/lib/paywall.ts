import type { Tier } from "./reading";
import type { Locale } from "./locales";

/**
 * Paywall switch + pricing. Off by default (free beta).
 * Flip by setting PAYWALL=on and NEXT_PUBLIC_PAYWALL=on, plus STRIPE_SECRET_KEY.
 * 账单描述符与产品名走中性文化内容措辞（见 MVP 文档 §6.2 Stripe 合规姿势）。
 *
 * Three positions (PAYWALL and NEXT_PUBLIC_PAYWALL must agree):
 *   off  — free beta: readings generate directly, no prices anywhere
 *   on   — the real thing: prices shown, Stripe Checkout collects the money
 *   gift — the painted door for a promotion test without live payments:
 *          prices shown exactly as in `on`, the tap on a priced button is
 *          counted as intent, and instead of Stripe the reading is delivered
 *          free with a note that says so. Everything downstream (email,
 *          revisit, archive, follow-ups) runs as for a paid reading.
 */

export type PaywallMode = "off" | "on" | "gift";

export function paywallMode(): PaywallMode {
  const v = process.env.PAYWALL;
  return v === "on" ? "on" : v === "gift" ? "gift" : "off";
}

/** Prices are shown and free generation is closed — true for both `on` and `gift`. */
export function paywallOn(): boolean {
  return paywallMode() !== "off";
}

/** The painted door: priced buttons deliver a free reading instead of a checkout. */
export function giftMode(): boolean {
  return paywallMode() === "gift";
}

/**
 * Whether the painted door's claim panel insists on an address for this tier
 * (09-15: 92% of readers skipped the optional field, so the timing revisit —
 * the product's whole retention loop — never reached them). A real checkout
 * collects the address anyway, so requiring it keeps the door honest.
 *   NEXT_PUBLIC_GIFT_EMAIL = deep → the deep reading only (its timing is what
 *                                   the revisit is for); the light one stays skippable
 *                            all  → both tiers
 *                            unset → optional everywhere (the original door)
 * Read by the claim panel (inlined at build time) and by /api/checkout.
 */
export function giftEmailRequired(tier: Tier): boolean {
  const v = process.env.NEXT_PUBLIC_GIFT_EMAIL;
  return v === "all" || (v === "deep" && tier === "deep");
}

export interface Price {
  cents: number;
  nameEn: string;
  nameZh: string;
  /** the Stripe line-item name in the buyer's language — neutral "digital content" wording in every one */
  name: (locale: Locale) => string;
}

const NAMES: Record<Tier, Record<Locale, string>> = {
  deep: {
    zh: "YaoFlow 深度解读（数字内容）",
    "zh-hant": "YaoFlow 深度解讀（數位內容）",
    en: "YaoFlow Full Reading (digital content)",
    ja: "YaoFlow 本格鑑定（デジタルコンテンツ）",
    ko: "YaoFlow 심층 풀이 (디지털 콘텐츠)",
    fr: "Lecture approfondie YaoFlow (contenu numérique)",
    de: "YaoFlow Tiefendeutung (digitaler Inhalt)",
    es: "Lectura profunda YaoFlow (contenido digital)",
    pt: "Leitura completa YaoFlow (conteúdo digital)",
  },
  one: {
    zh: "YaoFlow 轻解读（数字内容）",
    "zh-hant": "YaoFlow 輕解讀（數位內容）",
    en: "YaoFlow Light Reading (digital content)",
    ja: "YaoFlow ライト鑑定（デジタルコンテンツ）",
    ko: "YaoFlow 간단 풀이 (디지털 콘텐츠)",
    fr: "Lecture express YaoFlow (contenu numérique)",
    de: "YaoFlow Kurzdeutung (digitaler Inhalt)",
    es: "Lectura YaoFlow (contenido digital)",
    pt: "Leitura YaoFlow (conteúdo digital)",
  },
};

export function priceFor(tier: Tier): Price {
  const names = NAMES[tier === "deep" ? "deep" : "one"];
  return {
    cents: Number(tier === "deep" ? process.env.PRICE_DEEP_CENTS ?? 999 : process.env.PRICE_ONE_CENTS ?? 299),
    nameEn: names.en,
    nameZh: names.zh,
    name: (locale) => names[locale] ?? names.en,
  };
}
