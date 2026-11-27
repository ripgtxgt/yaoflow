import { decodeCast, decodeQuote } from "@/lib/share";
import { shareOgImage } from "@/lib/og-share";
import { OG_SIZE } from "@/lib/og";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "YaoFlow hexagram";

/** The same card, with the one line the sharer chose to attach. */
export default async function OgImage({ params }: { params: Promise<{ code: string; locale: string; s: string }> }) {
  const { code, locale, s } = await params;
  return shareOgImage(locale, decodeCast(code), decodeQuote(s));
}
