import { NextRequest, NextResponse } from "next/server";
import { REPLY_WINDOW_MS } from "@/lib/reply-like";
import { customerFromRequest } from "@/lib/auth";
import { entitlementFor } from "@/lib/subscription";
import { edgeCountry } from "@/lib/geo";
import { latestReadingWithin, paidInLastDay, customerHadInviteLight, customerHasPaidDeep, customerOrdersCount, latestSubscription, noteCustomerTimeZone, singlePurchasesSince, startsAtMonthlyFee } from "@/lib/db";
import { paywallMode } from "@/lib/paywall";
import { INVITE_COOKIE } from "@/lib/grants";
import { FIRST_DEEP_COOKIE } from "@/lib/money";
import { bidOf } from "@/lib/browsers";
import { asLocale } from "@/lib/locales";
import { openRefLight } from "@/lib/ref-reward";
import { ADMIN_COOKIE } from "@/lib/admin-auth";
import { featureVisible } from "@/lib/features";
import { firstPassEligible } from "@/lib/pass";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Who is signed in and what their subscription currently covers. The cast
 * page is static; it asks this once on mount to decide whether a reading
 * button says "$2.99" or "included".
 */
export async function GET(req: NextRequest) {
  const country = edgeCountry(req.headers); // for the currency guess — never stored
  const c = customerFromRequest(req);
  // 双边推荐: ?via=<code> is the share code the session arrived with; a newcomer's first light reading is free
  const via = req.nextUrl.searchParams.get("via") ?? "";
  const viaOk = /^[6789]{6}$/.test(via) && paywallMode() === "on";
  // 09-26 对照测试: which experiments are running (the arms themselves are drawn in the browser — lib/ab.ts)
  // 09-27: a browser that already took a free first reading (either program) is not offered another
  const freeTaken = !!req.cookies.get(INVITE_COOKIE)?.value || !!req.cookies.get("yf_ff")?.value;
  const ab = { free: (process.env.AB_FREE_LIGHT ?? "on") !== "off" && !freeTaken, odds: (process.env.AB_TEASER_ODDS ?? "on") !== "off",
    onePrice: (process.env.AB_ONE_PRICE ?? "on") !== "off", verdict: (process.env.AB_VERDICT ?? "on") !== "off",
    // 10-02: x (what the full reading holds, under the free line) and y (save the cast to email)
    preview: (process.env.AB_PREVIEW ?? "on") !== "off", save: (process.env.AB_SAVE ?? "on") !== "off" };
  // 09-26 会员单月: this browser session (or account) already paid in the last day — the second-question moment
  const bsRaw = req.nextUrl.searchParams.get("bs") ?? "";
  const bs = /^[a-z0-9]{6,24}$/.test(bsRaw) ? bsRaw : null;
  // first deep reading at the light price: an account that never paid for one, or a browser that never did
  // 10-14 进度表 47: a light reading earned through a share (friend's or sharer's), unspent — the cast page says so
  const refLight = (() => {
    try {
      const l = asLocale(req.nextUrl.searchParams.get("l"));
      return openRefLight({ bid: bidOf(req), customerId: c?.customerId ?? null, site: (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, ""), locale: l });
    } catch { return []; }
  })();
  // 10-22 通卡 (lib/tongka.ts): whether this browser sees the pass panel instead of the single prices, and whether its
  // first 1 日通卡 is at the first-time price
  const tongka = await featureVisible("tongka", req.cookies.get(ADMIN_COOKIE)?.value);
  if (!c) {
    const firstDeep = !req.cookies.get(FIRST_DEEP_COOKIE)?.value;
    const inviteFree = viaOk && !freeTaken;
    return NextResponse.json({ signedIn: false, country, firstDeep, inviteFree, neverPaid: firstDeep, firstMonth: true, paidToday: paidInLastDay(null, bs), ab, tongka, firstTongka: firstDeep, ...(refLight.length ? { refLight } : {}) }, { headers: { "Cache-Control": "no-store" } });
  }
  // 09-26 客户时区: the page sends the device's IANA zone; kept on the customer for the personal page
  const tz = req.nextUrl.searchParams.get("tz");
  if (tz) noteCustomerTimeZone(c.customerId, tz);
  const ent = await entitlementFor(c.customerId);
  const firstDeep = !customerHasPaidDeep(c.customerId);
  const inviteFree = viaOk && customerOrdersCount(c.customerId) === 0 && !customerHadInviteLight(c.customerId);
  return NextResponse.json(
    // 09-26 (review): the first-purchase guarantee is about ANY first payment, not only the first full reading
    { signedIn: true, email: c.email, entitlement: ent, country, firstDeep, inviteFree, neverPaid: singlePurchasesSince(c.customerId, 0).length === 0 && !latestSubscription(c.customerId), firstMonth: !startsAtMonthlyFee(c.customerId), paidToday: paidInLastDay(c.customerId, bs), recent: latestReadingWithin(c.customerId, REPLY_WINDOW_MS), ab, tongka, firstTongka: firstPassEligible(c.customerId, c.email), ...(refLight.length ? { refLight } : {}) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
