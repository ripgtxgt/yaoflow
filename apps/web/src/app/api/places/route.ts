import { NextRequest, NextResponse } from "next/server";
import { searchPlaces, type GazLocale } from "@/lib/mingli/birth/gazetteer";

export const runtime = "nodejs";

/**
 * 10-18 出生地點搜尋: GET ?q=&locale=zh-hant|zh → { places: [{ id, name, label, lat, lon, tz }] } (20 at most).
 * An empty q gives the most-populous places of Taiwan, then Hong Kong, then the mainland. The data only changes with a
 * deploy, so answers are cached for a day.
 */
export function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim().slice(0, 40);
  // 10-30 进度表 128 ④: any of the nine — outside Chinese, English names, the country in the reader's language
  const l = sp.get("locale") ?? "";
  const locale: GazLocale = (["zh", "zh-hant", "en", "ja", "ko", "fr", "de", "es", "pt"] as const).find((x) => x === l) ?? "zh-hant";
  const places = searchPlaces(q, locale, 20);
  return NextResponse.json({ places }, { headers: { "Cache-Control": "public, max-age=86400" } });
}
