import { decodeCast } from "@/lib/share";
import { shareOgImage } from "@/lib/og-share";
import { OG_SIZE } from "@/lib/og";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "YaoFlow hexagram";

/** The link-preview card for a shared cast — see lib/og-share. */
export default async function OgImage({ params }: { params: Promise<{ code: string; locale: string }> }) {
  const { code, locale } = await params;
  return shareOgImage(locale, decodeCast(code), null);
}
