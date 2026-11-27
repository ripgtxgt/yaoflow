/**
 * Self-declared crawlers, previewers and automation browsers by user agent (presence deviceFromUA, lib/machine-ua.ts).
 * 11-27: Lightpanda/1.0 (a headless browser whose user agent names no bot) brought 118 requests in an hour; the
 * automation drivers are listed with it — no reader browses with them.
 */
export const BOT_UA_RE = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|quora link|whatsapp|telegrambot|lightpanda|phantomjs|puppeteer|playwright|selenium|jsdom/i;
