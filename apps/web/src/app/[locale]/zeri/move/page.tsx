import ZeriPurposePage, { purposeMetadata } from "@/components/mingli/ZeriPurposePage";
import { notFound } from "next/navigation";
import { JaZeri, zeriMeta } from "@/components/mingli/EastAlmanac";
import { brandName } from "@/lib/brand";
import { canSee } from "@/lib/features";
import { serviceOpenIn } from "@/lib/services";
import { WestZeri, westZeriMeta } from "@/components/mingli/WestAlmanac";
import { WEST } from "@/lib/mingli/calendar/almanac-west";
import type { Foreign } from "@/lib/l10n/core";

export const dynamic = "force-dynamic";

/** 10-29 进度表 123: /zeri/move — the next three months of suitable days (components/mingli/ZeriPurposePage.tsx) */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const locale = (await params).locale;
  // 10-30 进度表 128 ⑤: 吉日カレンダー by purpose (ja only)
  if (locale === "ja" && serviceOpenIn("zeri", "ja")) { const m = zeriMeta("ja", "move"); return { title: { absolute: `${m.title} — ${brandName("ja")}` }, description: m.description, alternates: { canonical: "/ja/zeri/move" } }; }
  if (WEST.has(locale) && serviceOpenIn("zeri", locale as Foreign)) { const m = westZeriMeta(locale as Foreign, "move"); return { title: { absolute: `${m.title} — ${brandName(locale as Foreign)}` }, description: m.description, alternates: { canonical: `/${locale}/zeri/move` } }; }
  return purposeMetadata(locale, "move");
}
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const locale = (await params).locale;
  if (locale === "ja" && serviceOpenIn("zeri", "ja")) { if (!(await canSee("zeri"))) notFound(); return <JaZeri purpose="move" />; }
  if (WEST.has(locale) && serviceOpenIn("zeri", locale as Foreign)) { if (!(await canSee("zeri"))) notFound(); return <WestZeri l={locale as Foreign} purpose="move" />; }
  return <ZeriPurposePage locale={locale} slug="move" />;
}
