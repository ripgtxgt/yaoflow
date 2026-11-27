import { NextRequest, NextResponse } from "next/server";
import { payHop } from "@/lib/inapp-pay";
import { offerCheckout } from "@/lib/recover-offer";
import { record } from "@/lib/analytics-server";

export const runtime = "nodejs";

/** 10-15 挽回信改版: the offer page's button — the same checkout again at 70 %, only while the hour runs (server clock). */
export async function POST(req: NextRequest) {
  const f = await req.formData().catch(() => null);
  const token = String(f?.get("t") ?? "");
  const locale = String(f?.get("l") ?? "zh-hant").replace(/[^a-z-]/g, "") || "zh-hant";
  const site = (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  const r = await offerCheckout(token, site);
  try { record({ t: Date.now(), e: "recover_offer", s: token.slice(-12), locale, method: "url" in r ? "checkout" : r.error }); } catch { /* */ }
  if ("url" in r) return NextResponse.redirect(payHop(req, r.url, locale), 303); // 10-24: from inside WeChat / QQ, our hop page first
  return NextResponse.redirect(`${site}/${locale}/offer/${encodeURIComponent(token)}?e=${r.error}`, 303);
}
