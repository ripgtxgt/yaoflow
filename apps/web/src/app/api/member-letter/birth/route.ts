import { NextResponse, type NextRequest } from "next/server";
import { noteBirthClick } from "@/lib/month-letter-generic";

/**
 * 11-01 进度表 133: the 「補上出生資料」 button of the shared 流月信 — count the click (once per letter), then the 八字 chart
 * page, where a member enters a birth (and signs in when needed). Nothing but the letter's random token is in the link.
 */
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get("t") ?? "";
  const l = req.nextUrl.searchParams.get("l") === "zh" ? "zh" : "zh-hant";
  if (/^[A-Za-z0-9_-]{8,40}$/.test(t)) { try { noteBirthClick(t); } catch { /* the page still opens */ } }
  // the site's own address, never req.url (behind nginx that is localhost)
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  return NextResponse.redirect(`${site}/${l}/bazi/chart?c=moletter-birth`, 302);
}
