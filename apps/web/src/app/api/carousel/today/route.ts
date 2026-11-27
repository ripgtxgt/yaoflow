import { NextRequest, NextResponse } from "next/server";
import { CAROUSEL_LOCALES, caseForDay, type CarouselLocale } from "@/lib/carousel";
import { homeDay } from "@/lib/clock";

export const runtime = "nodejs";

/**
 * Today's carousel (09-23): the five slide URLs and a ready caption, one case
 * per day walking the list, so the daily IG/FB run just fetches this.
 *   GET /api/carousel/today?l=zh-hant[&day=2026-09-24]
 */
const CAPTION: Record<CarouselLocale, (q: string, url: string) => string> = {
  "zh-hant": (q, url) => `「${q}」\n\n一件事，一卦。這一卦怎麼斷、應期落在哪幾天，往右滑。\n\n問題是示例，卦是真的三枚銅錢起的，斷語與應期是原文。\n想問你自己的事：${url}`,
  zh: (q, url) => `「${q}」\n\n一件事，一卦。这一卦怎么断、应期落在哪几天，往右滑。\n\n问题是示例，卦是真的三枚铜钱起的，断语与应期是原文。\n想问你自己的事：${url}`,
  en: (q, url) => `“${q}”\n\nOne question, one cast. Swipe for the reading and the days it named.\n\nThe question is an example; the cast is a real three-coin cast and the reading is word for word.\nAsk your own: ${url}`,
  ja: (q, url) => `「${q}」\n\n一つの問いに、一つの卦。断と応期はスワイプで。\n\n問いは例ですが、卦は実際に三枚の硬貨で立てたもので、断と応期は原文です。\nあなたの問いはこちら：${url}`,
};

export async function GET(req: NextRequest) {
  const l = req.nextUrl.searchParams.get("l") ?? "zh-hant";
  if (!(CAROUSEL_LOCALES as readonly string[]).includes(l)) return NextResponse.json({ error: "locale" }, { status: 404 });
  const locale = l as CarouselLocale;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(req.nextUrl.searchParams.get("day") ?? "") ? req.nextUrl.searchParams.get("day")! : homeDay(Date.now());
  const { index, c } = caseForDay(locale, day);
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  const channel = req.nextUrl.searchParams.get("c") ?? "ig";
  const castUrl = `${site}/${locale}?c=${encodeURIComponent(channel.slice(0, 16))}`;
  return NextResponse.json({
    day, locale, index, code: c.code,
    slides: [1, 2, 3, 4, 5].map((p) => `${site}/api/carousel/${locale}/${index}/${p}.png`),
    // 09-27: the same five slides as one 9:16 clip for Reels / Shorts (made on first request, ~15 s)
    video: `${site}/api/carousel/${locale}/${index}/video.mp4`,
    caption: CAPTION[locale](c.question, castUrl),
  }, { headers: { "Cache-Control": "no-store" } });
}
