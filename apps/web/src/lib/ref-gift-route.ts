import type { NextRequest } from "next/server";
import { customerFromRequest } from "./auth";
import { deviceOf } from "./device";
import { asLocale } from "./locales";
import { recordOps } from "./db";
import { refRewardOnFirstCast } from "./ref-reward";

/** 10-14 进度表 47: a friend's first cast through a share link — both sides earn a light reading (lib/ref-reward.ts) */
export function refGiftFor(req: NextRequest, body: Record<string, unknown>, bid: string | null, locale: string): { refGift?: { url: string; until: number } } {
  if (!bid || typeof body.r !== "string") return {};
  try {
    const me = customerFromRequest(req);
    const site = (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
    const o = refRewardOnFirstCast({ ref: body.r, bid, device: deviceOf(req), customerId: me?.customerId ?? null, email: me?.email ?? null, locale: asLocale(locale), site });
    return o.state === "granted" ? { refGift: { url: o.friendUrl, until: o.until } } : {};
  } catch (e) {
    recordOps("ref_reward_error", e instanceof Error ? e.message : "unknown");
    return {};
  }
}
