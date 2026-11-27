import { brandName } from "./brand";
import { LOCALE_META, type Locale } from "./locales";

/**
 * 11-02 T-003 (Hermes SEO 体检：首页／today／about 没有结构化数据): schema.org for the three pages — the site and who runs
 * it on the home page, the page itself on 今天 and 關於. Plain facts only; nothing about readers.
 */
const site = () => (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");

export function orgJsonLd(): Record<string, unknown> {
  const s = site();
  return { "@type": "Organization", "@id": `${s}/#org`, name: "YaoFlow", alternateName: "爻流", url: s, logo: `${s}/icon-512.png` };
}

export function homeJsonLd(l: Locale, description: string | null): Record<string, unknown> {
  const s = site();
  return {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebSite", "@id": `${s}/${l}#website`, name: brandName(l), url: `${s}/${l}`, inLanguage: LOCALE_META[l].htmlLang, ...(description ? { description } : {}), publisher: { "@id": `${s}/#org` } },
      orgJsonLd(),
    ],
  };
}

export function pageJsonLd(l: Locale, path: string, type: "WebPage" | "AboutPage", name: string, description: string | null): Record<string, unknown> {
  const s = site();
  return {
    "@context": "https://schema.org",
    "@type": type,
    name, url: `${s}/${l}${path}`, inLanguage: LOCALE_META[l].htmlLang,
    ...(description ? { description } : {}),
    isPartOf: { "@type": "WebSite", "@id": `${s}/${l}#website`, name: brandName(l), url: `${s}/${l}` },
    ...(type === "AboutPage" ? { mainEntity: orgJsonLd() } : { publisher: { "@id": `${s}/#org` } }),
  };
}
