import { NextRequest, NextResponse } from "next/server";
import { handleNianshu } from "@/lib/checkout/nianshu";
import { customerFromRequest } from "@/lib/auth";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { nianshuSale, nianshuYears } from "@/lib/mingli/nianshu/report";

export const runtime = "nodejs";

/**
 * 10-21 三合一年書 checkout; GET → {tester, year, early, years}.
 * 10-22 进度表 57: a thin shell — the work is lib/checkout/nianshu.ts, the same handler POST /api/checkout/v2 runs.
 */
export async function GET(req: NextRequest) {
  const me = customerFromRequest(req);
  const tester = !!me && (await isAdmin(req.cookies.get(ADMIN_COOKIE)?.value).catch(() => false));
  const sale = nianshuSale();
  return NextResponse.json({ tester, year: sale.year, early: sale.early, years: nianshuYears() }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  return handleNianshu(req, body);
}
