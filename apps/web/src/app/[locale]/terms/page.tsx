import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale, t, type Locale, LOCALES } from "@/lib/i18n";
import { asLocale, pageAlternates } from "@/lib/locales";
import { isEnglishFallback } from "@/lib/content";
import { TERMS } from "@/lib/legal";
import LegalPage from "@/components/LegalPage";
import { brandName } from "@/lib/brand";

/** Locales that carry their own text; the rest read the English page. */
const TERMS_LOCALES: readonly Locale[] = LOCALES.filter((l) => !isEnglishFallback(TERMS[0]!, l));

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ locale: string }> },
): Promise<Metadata> {
  const { locale } = await params;
  const l = asLocale(locale);
  // Seven URLs served the same English text and each claimed a different
  // canonical — Search Console filed them as duplicates with no valid
  // canonical. A fallback page now points at the English original, and the
  // hreflang set lists only the languages that really have their own version.
  const fallback = isEnglishFallback(TERMS[0]!, l);
  return {
    title: `${t(l, "termsTitle")} · ${brandName(l)}`,
    alternates: fallback ? { canonical: "/en/terms" } : pageAlternates(l, "/terms", TERMS_LOCALES),
  };
}

export default async function TermsPage(
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const l = locale as Locale;
  return <LegalPage locale={l} title={t(l, "termsTitle")} sections={TERMS} />;
}
