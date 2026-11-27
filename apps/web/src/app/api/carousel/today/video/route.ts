import { NextRequest, NextResponse } from "next/server";
import { CAROUSEL_LOCALES, caseForDay, type CarouselLocale } from "@/lib/carousel";
import { homeDay } from "@/lib/clock";

export const runtime = "nodejs";

/**
 * 每日卦例短视频 (09-27): today's case as a 9:16 MP4.
 *   GET /api/carousel/today/video?l=zh-hant[&day=2026-09-28]
 * Redirects to the case's own file (/api/carousel/<locale>/<index>/video.mp4), so the clip is cached per case.
 */
export async function GET(req: NextRequest) {
  const l = req.nextUrl.searchParams.get("l") ?? "zh-hant";
  if (!(CAROUSEL_LOCALES as readonly string[]).includes(l)) return NextResponse.json({ error: "locale" }, { status: 404 });
  const q = req.nextUrl.searchParams.get("day") ?? "";
  const day = /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : homeDay(Date.now());
  const { index } = caseForDay(l as CarouselLocale, day);
  const site = (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  return NextResponse.redirect(`${site}/api/carousel/${l}/${index}/video.mp4`, { status: 302, headers: { "Cache-Control": "no-store" } });
}
