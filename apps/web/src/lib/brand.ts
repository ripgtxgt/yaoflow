/**
 * 10-22 进度表 81 「爻流」上站 (10-21 定稿設計: the Chinese name beside the Latin one): on Chinese pages the brand reads
 * 「爻流 YaoFlow」 — in the masthead, the <title> tail, the share cards, the footer line and the sender's name; every
 * other language keeps "YaoFlow". The domain, the URLs and the social handles do not change.
 */
export const BRAND_LATIN = "YaoFlow";
export const BRAND_HAN = "爻流";
export const isHan = (locale: string): boolean => locale === "zh" || locale === "zh-hant";
/** the name as it is written in this language */
export const brandName = (locale: string): string => (isHan(locale) ? `${BRAND_HAN} ${BRAND_LATIN}` : BRAND_LATIN);
/** the mail sender's display name (the address stays what EMAIL_FROM says) */
export const senderName = (locale: string | null | undefined): string => (locale && isHan(locale) ? `${BRAND_HAN} ${BRAND_LATIN}` : BRAND_LATIN);
