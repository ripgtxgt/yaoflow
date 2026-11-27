import { NextRequest, NextResponse } from "next/server";
import { matterForSession } from "@/lib/db";
import { asLocale } from "@/lib/locales";

export const runtime = "nodejs";

/**
 * 09-29 「一件事」: the way into a matter from anything that only knows a
 * reading's sid (the 一事一占 gate in the browser, old emails). The matter the
 * reading belongs to, or the reading itself when it is not filed.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const l = asLocale(locale);
  const sid = req.nextUrl.searchParams.get("sid") ?? "";
  const origin = (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  if (!/^[\w-]{6,120}$/.test(sid)) return NextResponse.redirect(new URL(`/${l}`, origin), { status: 302 });
  const mid = matterForSession(sid);
  const to = mid ? `/${l}/matter/${mid}?sid=${encodeURIComponent(sid)}` : `/${l}/reading?sid=${encodeURIComponent(sid)}`;
  return NextResponse.redirect(new URL(to, origin), { status: 302 });
}
