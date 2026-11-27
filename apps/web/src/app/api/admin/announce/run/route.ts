import { NextRequest, NextResponse } from "next/server";
import { ANNOUNCE_KIND, planAnnounce, sendAnnounce, sendAnnounceTests, summarize } from "@/lib/announce-1023";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

/**
 * 10-23 进度表 103 公告信 — run by hand from the server:
 *   yaoflow-cron.sh api/admin/announce/run                                   # dry: who would get it (counts only), why the rest not
 *   yaoflow-cron.sh "api/admin/announce/run?test=1"                          # the two test letters, to the owner addresses only
 *   yaoflow-cron.sh "api/admin/announce/run?send=1&confirm=announce_1023&limit=300"   # the real send, one batch (after Neil's yes)
 * The send refuses outside 09:00–21:00 Taipei; each address once (emails, kind announce_1023). ADMIN_KEY guarded.
 */
export async function POST(req: NextRequest) {
  const key = req.headers.get("x-cron-key");
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  if (sp.get("test") === "1") return NextResponse.json(await sendAnnounceTests(site));
  if (sp.get("send") === "1") {
    if (sp.get("confirm") !== ANNOUNCE_KIND) return NextResponse.json({ error: "confirm=announce_1023 required" }, { status: 400 });
    const limit = Math.min(Math.max(Number(sp.get("limit") ?? 40) || 40, 1), 400);
    return NextResponse.json(await sendAnnounce(site, { limit }));
  }
  return NextResponse.json({ dry: true, ...summarize(planAnnounce()) });
}
