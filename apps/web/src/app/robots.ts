import type { MetadataRoute } from "next";

// private pages in every language (wildcard for the locale segment), the paid API surface, and the dashboard. Share cards
// stay crawlable for link previews but carry noindex themselves.
const PRIVATE_PATHS = ["/*/reading", "/*/login", "/*/account", "/admin", "/api/"];

/**
 * 11-09 (Neil：「今天的爬虫怎么这么多啊」→「好，就按这个改」): ElevenlabsCrawler only collects training data for ElevenLabs'
 * models (4,100 hits on 11-09, none of it sends readers) — blocked; ElevenlabsBot (their agents' knowledge bases) is a
 * separate token and stays allowed. Backlink-index crawlers for other people's SEO tools — blocked; Ahrefs and Semrush
 * stay, 推广 uses Ahrefs on our own site. ExaSearchBot (an AI search engine) stays but slower: a group naming a bot
 * replaces the * group for it, so the private paths are repeated there.
 * 11-27 (Sakura): meta-externalagent — Meta's crawler for AI training, 30–44k requests a day 11-20..11-23 — blocked. Link
 * previews in Threads / Facebook come from facebookexternalhit, a separate token that stays allowed.
 */
const BLOCKED_BOTS = ["ElevenlabsCrawler", "MJ12bot", "SERankingBacklinksBot", "dotbot", "meta-externalagent"];

export default function robots(): MetadataRoute.Robots {
  const site = process.env.SITE_URL ?? "https://yaoflow.com";
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE_PATHS },
      { userAgent: "ExaSearchBot", allow: "/", disallow: PRIVATE_PATHS, crawlDelay: 2 },
      { userAgent: BLOCKED_BOTS, disallow: "/" },
    ],
    // 10-29 进度表 122: the 姓名學 character pages have their own file
    sitemap: [`${site}/sitemap.xml`, `${site}/name-sitemap.xml`],
  };
}
