import { NextRequest, NextResponse } from "next/server";
import { customerFromRequest } from "@/lib/auth";
import { ADMIN_COOKIE } from "@/lib/admin-auth";
import { featureVisible } from "@/lib/features";
import { bridgeLook } from "@/lib/ops-actions";
import { BRIDGE_SURFACES, bridgeHref, bridgeLine, bridgeName, bridgeProductFor, isLoveQuestion, type BridgeSurface } from "@/lib/bridge";

export const runtime = "nodejs";

/**
 * 10-26 the love-question card under a result (lib/bridge.ts).
 *   POST {question, surface, locale} → {show: false} for any other topic · {show: true, product, name, href, line}
 * Chinese pages only; the question is the one the reader just asked on this page (it is not stored except as the cache
 * key's hash and the sentence written for it).
 */
export async function POST(req: NextRequest) {
  let body: { question?: unknown; surface?: unknown; locale?: unknown };
  try { body = (await req.json()) as typeof body; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const question = typeof body.question === "string" ? body.question.trim().slice(0, 300) : "";
  const surface = BRIDGE_SURFACES.includes(body.surface as BridgeSurface) ? (body.surface as BridgeSurface) : null;
  const locale = body.locale === "zh" ? "zh" : body.locale === "zh-hant" ? "zh-hant" : null;
  const no = NextResponse.json({ show: false }, { headers: { "Cache-Control": "private, no-store" } });
  if (!question || !surface || !locale || !isLoveQuestion(question)) return no;
  const product = bridgeProductFor(customerFromRequest(req)?.customerId);
  if (!(await featureVisible(product, req.cookies.get(ADMIN_COOKIE)?.value))) return no;
  const { line, how } = await bridgeLine(question, product, surface, locale);
  return NextResponse.json({ show: true, product, name: bridgeName(product, locale), href: bridgeHref(product, locale, surface), line, how, look: bridgeLook() }, { headers: { "Cache-Control": "private, no-store" } });
}
