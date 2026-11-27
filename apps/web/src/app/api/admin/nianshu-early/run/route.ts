import { NextRequest, NextResponse } from "next/server";
import { NIANSHU_EARLY_KIND, planNianshuEarly, sendNianshuEarly, sendNianshuEarlyTests, summarizeEarly } from "@/lib/nianshu-early-1101";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

/**
 * 10-23 进度表 112 年书早鸟信 — run by hand from the server (the same way as the 10-23 announcement):
 *   yaoflow-cron.sh api/admin/nianshu-early/run                                          # dry: counts only, why the rest not
 *   yaoflow-cron.sh "api/admin/nianshu-early/run?test=1"                                 # 10-31: the test letters, owner addresses only
 *   yaoflow-cron.sh "api/admin/nianshu-early/run?send=1&confirm=nianshu_early_1101&limit=300"   # from 11/1 10:00, after Neil's yes
 * The send refuses before 11/1 10:00 Taipei and outside 09:00–21:00; each address once. ADMIN_KEY guarded.
 */
export async function POST(req: NextRequest) {
  const key = req.headers.get("x-cron-key");
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  if (sp.get("test") === "1") return NextResponse.json(await sendNianshuEarlyTests(site));
  if (sp.get("send") === "1") {
    if (sp.get("confirm") !== NIANSHU_EARLY_KIND) return NextResponse.json({ error: `confirm=${NIANSHU_EARLY_KIND} required` }, { status: 400 });
    const limit = Math.min(Math.max(Number(sp.get("limit") ?? 40) || 40, 1), 400);
    return NextResponse.json(await sendNianshuEarly(site, { limit }));
  }
  return NextResponse.json({ dry: true, ...summarizeEarly(planNianshuEarly()) });
}
