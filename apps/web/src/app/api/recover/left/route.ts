import { NextRequest, NextResponse } from "next/server";
import { markLeft } from "@/lib/recover-offer";

export const runtime = "nodejs";

/**
 * 10-15 挽回信改版: a checkout's 「返回」 link. We note the moment they came back unpaid (the one letter goes 5 minutes
 * later) and send them on to where they would have landed. Only our own site's paths are followed.
 */
export async function GET(req: NextRequest) {
  const co = req.nextUrl.searchParams.get("co") ?? "";
  const site = (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  let to = req.nextUrl.searchParams.get("to") ?? "";
  if (!(to.startsWith(`${site}/`) || (to.startsWith("/") && !to.startsWith("//")))) to = `${site}/`;
  if (/^[A-Za-z0-9_-]{8,24}$/.test(co)) { try { markLeft(co); } catch { /* the way back matters more */ } }
  return NextResponse.redirect(to.startsWith("/") ? `${site}${to}` : to, 303);
}
