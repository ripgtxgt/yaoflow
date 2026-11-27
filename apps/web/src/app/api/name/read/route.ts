import { NextRequest, NextResponse } from "next/server";
import { readName, splitName } from "@/lib/mingli/name/analyze";
import { charText } from "@/lib/mingli/name/chars";
import { chartFromBirth } from "@/lib/mingli/bazi/today";
import type { BirthInput } from "@/lib/mingli/birth/normalize";
import { featureOn } from "@/lib/features";

export const runtime = "nodejs";

/**
 * 10-29 进度表 122 姓名學 free query: POST {name | surname+given, locale, input?, gender?} → each character (筆劃、讀音、五行、
 * 字義), the 五格 numbers and their 五行, and — with a birth — the chart's 喜用 beside the name. Nothing is stored.
 * 10-29 (Neil: 「加出生时间点击没用」): a birth alone (no name yet) answers too — {chart} only, so the page can show the
 * 日主 and 喜用 the moment a birth is picked, before the name is typed.
 */
export async function POST(req: NextRequest) {
  if (!featureOn("name")) return NextResponse.json({ error: "off" }, { status: 404 });
  const b = (await req.json().catch(() => ({}))) as { name?: unknown; surname?: unknown; given?: unknown; locale?: unknown; input?: unknown; gender?: unknown };
  const clean = (v: unknown) => (typeof v === "string" ? [...v.replace(/[^\p{Script=Han}]/gu, "")].slice(0, 6).join("") : "");
  let surname = clean(b.surname), given = clean(b.given);
  if (!surname && typeof b.name === "string") ({ surname, given } = splitName(clean(b.name)));
  const locale = b.locale === "zh" ? "zh" : "zh-hant";
  const chart = b.input && typeof b.input === "object" ? chartFromBirth(b.input as BirthInput, b.gender === "female" ? "female" : "male") : null;
  const chartOut = chart ? { dayMaster: chart.dayMaster, dmEl: chart.dmEl, favour: chart.favour, avoid: chart.avoid } : null;
  const headers = { "Cache-Control": "private, no-store" };
  if (!surname && !given) {
    if (chartOut) return NextResponse.json({ chart: chartOut }, { headers });
    return NextResponse.json({ error: b.input ? "bad_birth" : "name" }, { status: 400 });
  }
  if (!surname || !given || [...surname].length > 2 || [...given].length > 3) return NextResponse.json({ error: "name" }, { status: 400 });
  const r = readName(surname, given, chart);
  return NextResponse.json({
    surname, given, missing: r.missing, grid: r.grid, gridEl: r.gridEl, sancai: r.sancai, elements: r.elements, favour: r.favour ?? null, chart: chartOut,
    chars: r.chars.map((x) => ({ c: x.c, role: x.role, ...(x.info ? { k: x.info.k, kn: x.info.kn, py: x.info.py, zy: x.info.zy, jp: x.info.jp, wx: x.info.wx, by: x.info.by, ...charText(x.info, locale) } : {}) })),
  }, { headers });
}
