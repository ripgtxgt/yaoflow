import { NextRequest, NextResponse } from "next/server";
import { customerFromRequest } from "@/lib/auth";
import { can, rightsFor } from "@/lib/entitlements";
import { isForeign } from "@/lib/l10n/core";
import { isLocale } from "@/lib/locales";
import { foreignReading, setCount } from "@/lib/qian-foreign";
import { record } from "@/lib/analytics-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 10-30 进度表 128 ⑤: the reading of one lot in another language (the plain words, overall, love, work, what suits and
 * what to hold off) — for a signed-in reader whose Pass or membership covers lot readings (Neil 10-13: 解籤一律付費).
 * GET ?l=<locale>&n=<number>. 401 = not signed in, 402 = no Pass or membership.
 */
export async function GET(req: NextRequest) {
  const l = req.nextUrl.searchParams.get("l") ?? "";
  const n = Number(req.nextUrl.searchParams.get("n"));
  if (!isLocale(l) || !isForeign(l) || !Number.isInteger(n) || n < 1 || n > setCount(l)) return NextResponse.json({ error: "bad" }, { status: 400 });
  let me: ReturnType<typeof customerFromRequest> = null;
  try { me = customerFromRequest(req); } catch { /* no database */ }
  if (!me) return NextResponse.json({ error: "signin" }, { status: 401 });
  const r = await rightsFor(me.customerId);
  if (!can(r, "qian_personal")) return NextResponse.json({ error: "locked" }, { status: 402 });
  const t = foreignReading(l, n);
  if (!t) return NextResponse.json({ error: "missing" }, { status: 404 });
  record({ t: Date.now(), e: "qian_foreign_read", s: `c${me.customerId}`, locale: l, method: String(n), path: "/qian", c: "qian" });
  return NextResponse.json({ reading: t }, { headers: { "Cache-Control": "private, no-store" } });
}
