/** 11-04 外语转化: the languages that get the question box on content pages (components/AskFromPage). Kept outside the
 *  client component so the server pages can call it. */
export const ASK_FROM_PAGE_LOCALES = ["en", "ja", "ko", "fr", "de", "es", "pt"] as const;
export type AskLocale = (typeof ASK_FROM_PAGE_LOCALES)[number];
export const askFromPageLocale = (l: string): l is AskLocale => (ASK_FROM_PAGE_LOCALES as readonly string[]).includes(l);
