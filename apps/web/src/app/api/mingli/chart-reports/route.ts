import { NextRequest, NextResponse } from "next/server";
import { customerFromRequest } from "@/lib/auth";
import { reportsForChart, type MySys } from "@/lib/my-reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 10-23 进度表 114 ②: the chart page asks whether this chart already has its report — so 「你這張盤的深度報告 → 打開」
 * sits at the top instead of the reader pressing the button again (#838: 「深入紫微每次要再點」).
 *   POST {sys: "bazi" | "ziwei" | "astro", input: BirthInput, gender}  →  {links: [{kind, href, state}]}
 * Read-only: nothing is written, no allowance is used. Not signed in → no links. The birth is used to draw the chart and
 * dropped; it is never stored or logged here.
 */
const SYS = new Set<MySys>(["bazi", "ziwei", "astro"]);

export async function POST(req: NextRequest) {
  const me = customerFromRequest(req);
  if (!me) return NextResponse.json({ links: [] }, { headers: { "Cache-Control": "private, no-store" } });
  let body: { sys?: unknown; input?: unknown; gender?: unknown };
  try { body = (await req.json()) as typeof body; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const sys = typeof body.sys === "string" && SYS.has(body.sys as MySys) ? (body.sys as MySys) : null;
  if (!sys) return NextResponse.json({ error: "bad_sys" }, { status: 400 });
  const links = await reportsForChart(me.customerId, sys, body.input, body.gender).catch(() => []);
  return NextResponse.json({ links }, { headers: { "Cache-Control": "private, no-store" } });
}
