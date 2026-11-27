import { NextRequest, NextResponse } from "next/server";
import { runCampaigns } from "@/lib/campaigns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

/**
 * 10-23 进度表 107 ③ the group letters' batches — the server cron, every 10 minutes:
 *   yaoflow-cron.sh api/admin/campaigns/run
 * One batch of each scheduled campaign that is due (at most its per_run letters, 1.2 s apart), Taipei 09:00–21:00 only;
 * outside those hours it does nothing. ADMIN_KEY guarded (x-cron-key).
 */
export async function POST(req: NextRequest) {
  const key = req.headers.get("x-cron-key");
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const site = (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  const ran = await runCampaigns(site);
  return NextResponse.json({ ran });
}
