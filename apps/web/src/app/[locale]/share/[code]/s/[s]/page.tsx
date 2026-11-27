import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveCast } from "@yaoflow/engine";
import { isLocale, type Locale } from "@/lib/i18n";
import { decodeCast, decodeQuote } from "@/lib/share";
import { asLocale } from "@/lib/locales";
import { hexName } from "@/lib/names";
import SharePageBody from "@/components/SharePageBody";
import { brandName } from "@/lib/brand";

// 10-01 审计: the quoted sentence rides in the URL as base64 — a long one makes a cache file name past the 255-byte limit
// (ENAMETOOLONG in the log on every visit, 33 times in a week). The page is cheap and pure; render it per request.
export const dynamic = "force-dynamic";

export async function generateMetadata(
  { params }: { params: Promise<{ locale: string; code: string; s: string }> },
): Promise<Metadata> {
  const { locale, code, s } = await params;
  const values = decodeCast(code);
  const quote = decodeQuote(s);
  if (!values || !quote) return { title: "YaoFlow" };
  const cast = resolveCast(values);
  const l = asLocale(locale);
  const name = hexName(cast.primary, l);
  return {
    title: `${name} · ${brandName(l)}`,
    description: quote.slice(0, 140),
    robots: { index: false, follow: true },
    alternates: { canonical: `/${l}/share/${code}` },
    openGraph: { title: name, description: quote.slice(0, 140), type: "website" },
  };
}

/** The shared card with the one line the sharer chose to attach. */
export default async function SharePageWithQuote(
  { params }: { params: Promise<{ locale: string; code: string; s: string }> },
) {
  const { locale, code, s } = await params;
  if (!isLocale(locale)) notFound();
  const values = decodeCast(code);
  const quote = decodeQuote(s);
  if (!values || !quote) notFound();
  return <SharePageBody locale={locale as Locale} code={code} values={values} quote={quote} />;
}
