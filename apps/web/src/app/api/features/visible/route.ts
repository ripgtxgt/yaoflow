import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE } from "@/lib/admin-auth";
import { featureVisible, isFeature } from "@/lib/features";

export const dynamic = "force-dynamic";

/** 10-17: which switches this browser may see — for client pages that stay static (the cast page's small entries) */
export async function GET(req: NextRequest) {
  const names = (req.nextUrl.searchParams.get("n") ?? "").split(",").filter(isFeature).slice(0, 10);
  const cookie = req.cookies.get(ADMIN_COOKIE)?.value;
  const out: Record<string, boolean> = {};
  for (const n of names) out[n] = await featureVisible(n, cookie);
  return NextResponse.json(out, { headers: { "Cache-Control": "private, no-store" } });
}
