import { allLiveCases } from "./db";
import { asLocale, LOCALES, type Locale } from "./locales";

/** Shared by /llms.txt and /llms-full.txt: the site root, the languages that have live public cases, the response. */
export function llmsSite(): string {
  return (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
}

export function caseLocales(): Locale[] {
  try {
    const have = new Set(allLiveCases().map((c) => asLocale(c.locale)));
    return LOCALES.filter((l) => have.has(l));
  } catch {
    return [];
  }
}

export function plainText(body: string): Response {
  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      // an hour, not a day: the prices in it follow the code, so a price change should reach it the same day
      "cache-control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
