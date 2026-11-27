import type { Foreign } from "@/lib/l10n/core";
import { BAZI_NAMES } from "@/lib/mingli/bazi/names";
import { ZIWEI_NAMES } from "@/lib/mingli/ziwei/names";
import { ASTRO_NAMES } from "@/lib/mingli/astro/names";
import { astroReportText } from "@/lib/mingli/astro/page-ui";
import type { HepanNames } from "./names";

/** 10-30 进度表 128 ④ — one language's names for the 合盤 (server: the astro element words come from the 星盤's translations) */
const ASC: Record<Foreign, string> = { en: "Ascendant", ja: "アセンダント", ko: "어센던트", fr: "Ascendant", de: "Aszendent", es: "Ascendente", pt: "Ascendente" };
const memo = new Map<Foreign, HepanNames>();
export function hepanNames(l: Foreign): HepanNames {
  const hit = memo.get(l);
  if (hit) return hit;
  const el = astroReportText(l).el as Record<string, string>;
  const out: HepanNames = { l, bz: BAZI_NAMES[l], zw: ZIWEI_NAMES[l], ...ASTRO_NAMES[l], asc: ASC[l], astroEl: ["火", "土", "風", "水"].map((e) => el[e] ?? e) };
  memo.set(l, out);
  return out;
}
