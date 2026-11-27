import { shareOgImage } from "@/lib/og-share";
import { caseView } from "@/lib/db";
import { PUBLIC_ID_RE } from "@/lib/cases";
import type { LineValue } from "@yaoflow/engine";
import { OG_SIZE } from "@/lib/og";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "YaoFlow — a public case";

/** The same card as a shared cast: the figure, and the public wording when there is one. Never the original question. */
export default async function OgImage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  const c = PUBLIC_ID_RE.test(id) ? caseView(id) : null;
  const values = c ? (c.values_str.split(",").map(Number) as LineValue[]) : null;
  return shareOgImage(c?.locale ?? locale, values, c?.framing ?? null);
}
