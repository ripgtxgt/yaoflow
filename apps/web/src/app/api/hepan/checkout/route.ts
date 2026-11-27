import { NextRequest, NextResponse } from "next/server";
import { handleHepan } from "@/lib/checkout/hepan";
import { customerFromRequest } from "@/lib/auth";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";

/**
 * 10-20 合盤報告 checkout; GET → {tester}.
 * 10-22 进度表 57: a thin shell — the work is lib/checkout/hepan.ts, the same handler POST /api/checkout/v2 runs.
 */
export async function GET(req: NextRequest) {
  const me = customerFromRequest(req);
  const tester = !!me && (await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value).catch(() => false));
  return NextResponse.json({ tester }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  return handleHepan(req, body);
}
