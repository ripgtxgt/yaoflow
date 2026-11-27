import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE } from "@/lib/admin-auth";
import { featureVisible } from "@/lib/features";
import { CATALOG, isCatalogId } from "@/lib/catalog";
import { recordOps } from "@/lib/db";
import type { CheckoutBody } from "@/lib/checkout-core";
import { handlePass } from "@/lib/checkout/pass";
import { handleTarot } from "@/lib/checkout/tarot";
import { handleQianPersonal } from "@/lib/checkout/qian";
import { handleQianCard } from "@/lib/checkout/card";
import { handleHepan } from "@/lib/checkout/hepan";
import { handleNianshu } from "@/lib/checkout/nianshu";
import { handleZhengyuan } from "@/lib/checkout/zhengyuan";
import { handleName } from "@/lib/checkout/name";
import { handleSubscription } from "@/lib/checkout/sub";
import { handlePack } from "@/lib/checkout/pack";

export const runtime = "nodejs";

/**
 * 10-22 进度表 57 — one checkout entrance: POST {product: <catalog id>, …the product's own fields…}. The price comes from
 * the catalog (lib/catalog.ts), the right to a free copy from the rights table (lib/entitlements.ts), the routing and the
 * common metadata from lib/checkout-core.ts; each product's handler (lib/checkout/*.ts) is the same one its old route
 * runs, so a page may switch to this entrance product by product with nothing else changing.
 *   pass_1 / pass_7 / pass_30 → {returnTo?, c?, bs?, remind?}          tarot → {token}        qian_personal → {token}
 *   qian_card → {}                                                      hepan → {a, b | invite, question?}
 *   zhengyuan → {input, gender, partner?}                               (10-26)
 *   nianshu → {input, gender, year, question?}                          month / year → {noMp?, c?, bs?, remind?}
 *   pack_l / pack_s → {expect?}
 *   plus, for every product: locale, currency, timeZone, tzOffsetMinutes
 *   → whatever the product's handler answers · 400 {error: "bad_product"} · 400 {error: "not_sold_here"} for the
 *     single readings (the cast page's own /api/checkout carries the cast) and for what only a membership includes
 * Behind the `checkout-v2` switch while the pages are moved over (404 {error: "off"} otherwise).
 */
export async function POST(req: NextRequest) {
  if (!(await featureVisible("checkout-v2", req.cookies.get(ADMIN_COOKIE)?.value))) return NextResponse.json({ error: "off" }, { status: 404 });
  let body: CheckoutBody & Record<string, unknown>;
  try { body = (await req.json()) as typeof body; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const product = isCatalogId(body.product) ? body.product : null;
  if (!product) return NextResponse.json({ error: "bad_product" }, { status: 400 });
  recordOps("checkout_v2", product);
  switch (product) {
    case "pass_1": return handlePass(req, body, 1);
    case "pass_7": return handlePass(req, body, 7);
    case "pass_30": return handlePass(req, body, 30);
    case "tarot": return handleTarot(req, body);
    case "qian_personal": return handleQianPersonal(req, body);
    case "qian_card": return handleQianCard(req, body);
    case "hepan": return handleHepan(req, body);
    case "nianshu": return handleNianshu(req, body);
    case "zhengyuan": return handleZhengyuan(req, body);
    case "name_baby": return handleName(req, { ...body, kind: "baby" });
    case "name_rename": return handleName(req, { ...body, kind: "rename" });
    case "month": return handleSubscription(req, body, "month");
    case "year": return handleSubscription(req, body, "year");
    case "pack_l": return handlePack(req, body, "large");
    case "pack_s": return handlePack(req, body, "small");
    default: return NextResponse.json({ error: "not_sold_here", kind: CATALOG[product].kind }, { status: 400 });
  }
}
