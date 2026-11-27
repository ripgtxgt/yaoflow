import { NextRequest, NextResponse } from "next/server";
import { castsByShareCode } from "@/lib/analytics-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "N people have cast from your share": sessions that arrived with this
 * share code as first touch and completed a cast, over the last 90 days.
 * Public (the code is public by design); cached a minute per code.
 */
const cache = new Map<string, { at: number; casts: number }>();

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code") ?? "";
  if (!/^[6789]{6}$/.test(code)) return NextResponse.json({ error: "bad_code" }, { status: 400 });
  const hit = cache.get(code);
  if (hit && Date.now() - hit.at < 60_000) return NextResponse.json({ casts: hit.casts }, { headers: { "Cache-Control": "no-store" } });
  const casts = castsByShareCode(90).get(code) ?? 0;
  cache.set(code, { at: Date.now(), casts });
  return NextResponse.json({ casts }, { headers: { "Cache-Control": "no-store" } });
}
