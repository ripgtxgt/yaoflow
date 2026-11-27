import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveCast, textsFor } from "@yaoflow/engine";
import { isLocale, type Locale } from "@/lib/i18n";
import { decodeCast } from "@/lib/share";
import { asLocale } from "@/lib/locales";
import { hexName, judgmentFor } from "@/lib/names";
import { localTextsFor } from "@/lib/originals";
import SharePageBody from "@/components/SharePageBody";
import { brandName } from "@/lib/brand";

export const dynamic = "force-static";
export const revalidate = 86400;

export async function generateMetadata(
  { params }: { params: Promise<{ locale: string; code: string }> },
): Promise<Metadata> {
  const { locale, code } = await params;
  const values = decodeCast(code);
  if (!values) return { title: "YaoFlow" };
  const cast = resolveCast(values);
  const texts = textsFor(cast.primary.number);
  const l = asLocale(locale);
  const name = hexName(cast.primary, l);
  const line = judgmentFor(texts, l, localTextsFor(cast.primary.number, l)).main;
  // no Unicode hexagram in titles: the U+4DC0 glyphs are tofu on much of
  // Android and drawn wrongly by several platform fonts — the card image
  // carries the figure, and it renders identically everywhere
  return {
    title: `${name} · ${brandName(l)}`,
    description: line.slice(0, 140),
    // a card for link previews: 4096 codes × 9 languages of near-identical
    // pages is not something to rank, and never something to inherit the
    // home's canonical
    robots: { index: false, follow: true },
    alternates: { canonical: `/${l}/share/${code}` },
    openGraph: {
      title: name,
      description: line.slice(0, 140),
      type: "website",
    },
  };
}

/** A public card: hexagram + classical judgment only. No question, no reading, ever. */
export default async function SharePage(
  { params }: { params: Promise<{ locale: string; code: string }> },
) {
  const { locale, code } = await params;
  if (!isLocale(locale)) notFound();
  const values = decodeCast(code);
  if (!values) notFound();
  return <SharePageBody locale={locale as Locale} code={code} values={values} quote={null} />;
}
