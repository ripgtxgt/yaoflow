import { NextRequest, NextResponse } from "next/server";
import { handleZhengyuan } from "@/lib/checkout/zhengyuan";
import { customerFromRequest } from "@/lib/auth";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";

/** 10-26 正緣畫像 checkout (the work is lib/checkout/zhengyuan.ts, the same handler POST /api/checkout/v2 runs); GET → {tester}. */
export async function GET(req: NextRequest) {
  const me = customerFromRequest(req);
  const tester = !!me && (await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value).catch(() => false));
  return NextResponse.json({ tester }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  return handleZhengyuan(req, body);
}
