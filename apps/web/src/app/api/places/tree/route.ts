import { NextRequest, NextResponse } from "next/server";
import { isTreeRegion, placeTree, type TreeLocale } from "@/lib/mingli/birth/place-tree";

export const runtime = "nodejs";

/**
 * 出生地點滾輪選擇器: GET ?r=tw|hkmo|cn|intl&locale=zh-hant|zh → { region, tree: [{ name, children? , id?, lat?, lon?, tz? }] }.
 * "tw" and "hkmo" are two levels deep, "cn" and "intl" three (see lib/mingli/birth/place-tree.ts). An unknown r is a
 * 400. The data only changes with a deploy, so answers are cached for a day.
 */
export function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const r = sp.get("r");
  if (!isTreeRegion(r)) return NextResponse.json({ error: "r must be tw, hkmo, cn or intl" }, { status: 400 });
  // 10-30 进度表 128 ④: any of the nine (outside Chinese the "intl" tree is the one the form shows)
  const l = sp.get("locale") ?? "";
  const locale: TreeLocale = (["zh", "zh-hant", "en", "ja", "ko", "fr", "de", "es", "pt"] as const).find((x) => x === l) ?? "zh-hant";
  return NextResponse.json({ region: r, tree: placeTree(r, locale) }, { headers: { "Cache-Control": "public, max-age=86400" } });
}
