import { castsByShareCode } from "./analytics-server";
import { castsForCustomer, giftableReadingsForCustomer, giftsFromCustomer, inviteLightCountForCodes, rewardsForCustomer } from "./db";
import { giftLink } from "./grants";
import { asLocale, type Locale } from "./locales";

/**
 * 我的推荐 (总方案 §5.3 ⑧ / §14 ⑩): what one account's sharing has done —
 * people who cast through its share links, gifts it sent and whether they were
 * claimed, rewards it earned, and the deep readings that still have a gift to
 * give. Everything here is the account's own doing; nothing identifies the
 * friends on the other end.
 */
export interface MyReferrals {
  /** sessions that arrived through one of this account's share codes and completed a cast (last 90 days) */
  broughtCasts: number;
  /** newcomers who took the free first light reading through those codes (all time) */
  inviteLights: number;
  gifts: { token: string; createdAt: number; expiresAt: number; usedAt: number | null; url: string }[];
  rewards: { id: number; createdAt: number; expiresAt: number; usedAt: number | null; href: string | null }[];
  giftable: { sid: string; castAt: number; question: string; values: string; primaryNum: number; changedNum: number | null }[];
}

const BROUGHT_CACHE = new Map<number, { at: number; codes: string; casts: number }>();
const BROUGHT_TTL = 60_000;

/**
 * "N people cast from your shares": first-touch `via` equal to one of the codes,
 * then a completed cast, over the last 90 days. A share code is the six line
 * values, so two people who threw the same figure share a code — at our scale
 * that is the same approximation the referral reward already makes.
 */
export function castsBroughtBy(codes: ReadonlySet<string>): number {
  if (codes.size === 0) return 0;
  const idx = castsByShareCode(90);
  let n = 0;
  for (const c of codes) n += idx.get(c) ?? 0;
  return n;
}

export function myReferrals(customerId: number, locale: Locale, site: string): MyReferrals {
  const codes = [...new Set(castsForCustomer(customerId).map((c) => c.values_str.split(",").join("")))];
  const key = codes.join("|");
  const hit = BROUGHT_CACHE.get(customerId);
  let broughtCasts: number;
  if (hit && hit.codes === key && Date.now() - hit.at < BROUGHT_TTL) broughtCasts = hit.casts;
  else {
    broughtCasts = castsBroughtBy(new Set(codes));
    BROUGHT_CACHE.set(customerId, { at: Date.now(), codes: key, casts: broughtCasts });
  }
  const now = Date.now();
  return {
    broughtCasts,
    inviteLights: inviteLightCountForCodes(codes),
    gifts: giftsFromCustomer(customerId).map((g) => ({
      token: g.token, createdAt: g.created_at, expiresAt: g.expires_at, usedAt: g.used_at,
      url: giftLink(site, asLocale(g.locale ?? locale), g.token),
    })),
    rewards: rewardsForCustomer(customerId).map((r) => ({
      id: r.id, createdAt: r.created_at, expiresAt: r.expires_at, usedAt: r.used_at,
      // the link is only handed out while it can still be spent
      href: !r.used_at && r.expires_at > now ? `/${locale}/cast?reward=${r.token}` : null,
    })),
    giftable: giftableReadingsForCustomer(customerId).map((g) => ({
      sid: g.session_id, castAt: g.cast_at, question: g.question, values: g.values_str.split(",").join(""), primaryNum: g.primary_num, changedNum: g.changed_num,
    })),
  };
}
