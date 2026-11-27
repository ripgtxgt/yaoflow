import { featureOn } from "@/lib/features";
import { nameCharsByUse } from "@/lib/mingli/name/chars";

/**
 * 10-29 进度表 122 姓名學: the character pages (the ones usable in names, ok ≥ 1 — about 2,500 per script), 繁體 and 简体,
 * in their own sitemap so the main one keeps its focus. Listed in robots.txt.
 */
export const revalidate = 86400;
const BUILT = new Date("2026-10-29T00:00:00Z").toISOString();
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

export function GET() {
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  const chars = featureOn("name") ? nameCharsByUse().filter((c) => c.o >= 1).slice(0, 3000) : [];
  const urls = (["zh-hant", "zh"] as const).flatMap((l) => chars.map((c) => `${site}/${l}/name/zi/${encodeURIComponent(l === "zh" ? c.s : c.h)}`));
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${esc(u)}</loc><lastmod>${BUILT}</lastmod><changefreq>yearly</changefreq><priority>0.4</priority></url>`).join("\n")}\n</urlset>\n`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
