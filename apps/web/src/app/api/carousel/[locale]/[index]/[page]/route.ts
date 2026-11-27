import { NextResponse } from "next/server";
import { CAROUSEL_LOCALES, carouselSlide, casesFor, type CarouselLocale } from "@/lib/carousel";
import { carouselVideo, readVideo } from "@/lib/carousel-video";

export const runtime = "nodejs";

/** One slide: /api/carousel/<locale>/<case index>/<1–5>.png — see lib/carousel. Public: the content is already on the 64 pages. */
export async function GET(_req: Request, { params }: { params: Promise<{ locale: string; index: string; page: string }> }) {
  const { locale, index, page } = await params;
  if (!(CAROUSEL_LOCALES as readonly string[]).includes(locale)) return NextResponse.json({ error: "locale" }, { status: 404 });
  const list = casesFor(locale as CarouselLocale);
  const i = Number(index);
  // 09-27 每日卦例短视频: /api/carousel/<locale>/<index>/video.mp4 — the five slides as one 9:16 clip
  if (page === "video.mp4") {
    if (!Number.isInteger(i) || i < 0 || i >= list.length) return NextResponse.json({ error: "not_found" }, { status: 404 });
    try {
      const body = readVideo(await carouselVideo(locale as CarouselLocale, i));
      return new NextResponse(new Uint8Array(body), { headers: { "Content-Type": "video/mp4", "Content-Length": String(body.length), "Cache-Control": "public, max-age=86400, immutable", "Content-Disposition": `inline; filename="yaoflow-${locale}-${i}.mp4"` } });
    } catch (e) {
      return NextResponse.json({ error: "video_failed", detail: e instanceof Error ? e.message.slice(0, 200) : "?" }, { status: 503 });
    }
  }
  const p = Number(page.replace(/\.png$/, ""));
  if (!Number.isInteger(i) || i < 0 || i >= list.length || !Number.isInteger(p) || p < 1 || p > 5) return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    const img = await carouselSlide(locale as CarouselLocale, list[i]!, p);
    img.headers.set("Cache-Control", "public, max-age=86400, immutable");
    return img;
  } catch (e) {
    return NextResponse.json({ error: "font_unavailable", detail: e instanceof Error ? e.message : "?" }, { status: 503 });
  }
}
