import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { snapshot } from "@/lib/presence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 10-02 实时在线: the live board's data, polled by /admin/live every few seconds. Admin cookie (or key) only. */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!(await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value, key))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json(snapshot(), { headers: { "Cache-Control": "no-store" } });
}
