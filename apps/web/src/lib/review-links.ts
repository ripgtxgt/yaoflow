import { randomBytes } from "node:crypto";
import { createGrant, db, grantByToken } from "./db";

/**
 * 10-16 进度表 52 (推广 10-15, Neil 同意发外链邀请信，见《外链邀请信稿-1015.md》): free trial links for the five review
 * sites — three full (deep) readings each, 30 days, one use per link. They are 送一卦 grants (kind gift_cast, lib/grants.ts)
 * with nobody behind them: the reader casts their own question and the deep tier redeems the link instead of checkout.
 * Nothing about price changes and nothing public is offered; the links exist only on /admin/review-links.
 *
 * Each link carries the site's campaign tag, `rv-<site>` (the tag is capped at 16 characters — lib/track.ts — so not
 * `review-applealmond`), which puts the site's readers in the channel tables; the grant's `via` carries the same tag,
 * so a redeemed link is counted to its site even when the tag was lost on the way.
 */
export const REVIEW_SITES = [
  { id: "techritual", name: "Techritual（香港）" },
  { id: "kocpc", name: "電腦王阿達" },
  { id: "free", name: "免費資源網路社群" },
  { id: "applealmond", name: "蘋果仁" },
  { id: "mrmad", name: "瘋先生" },
] as const;
export const REVIEW_PER_SITE = 3;
export const REVIEW_DAYS = 30;
export type ReviewSite = (typeof REVIEW_SITES)[number]["id"];
export const reviewTag = (site: string) => `rv-${site}`;
export const isReviewSession = (fromSessionId: string | null | undefined) => !!fromSessionId?.startsWith("review_");

const sourceOf = (site: string, n: number) => `review_${site}_${n}`;

/** Make the links that are missing (idempotent: one grant per site and number, made once, never renewed silently). */
export function ensureReviewLinks(now = Date.now()): number {
  const d = db();
  let made = 0;
  for (const s of REVIEW_SITES) {
    for (let n = 1; n <= REVIEW_PER_SITE; n++) {
      const has = d.prepare("SELECT 1 FROM grants WHERE from_session_id = ? AND kind = 'gift_cast'").get(sourceOf(s.id, n));
      if (has) continue;
      createGrant({ token: randomBytes(18).toString("hex"), kind: "gift_cast", tier: "deep", expiresAt: now + REVIEW_DAYS * 86_400_000, fromSessionId: sourceOf(s.id, n), via: reviewTag(s.id), locale: "zh-hant" });
      made++;
    }
  }
  return made;
}

export interface ReviewLink { site: ReviewSite; name: string; n: number; token: string; url: string; state: "open" | "used" | "expired"; usedAt: number | null; expiresAt: number; readingSid: string | null }

export function reviewLinks(site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, ""), now = Date.now()): ReviewLink[] {
  const rows = db().prepare("SELECT token, from_session_id, used_at, expires_at, redeem_session_id FROM grants WHERE kind = 'gift_cast' AND from_session_id LIKE 'review\\_%' ESCAPE '\\' ORDER BY from_session_id")
    .all() as { token: string; from_session_id: string; used_at: number | null; expires_at: number; redeem_session_id: string | null }[];
  const out: ReviewLink[] = [];
  for (const r of rows) {
    const m = /^review_([a-z]+)_(\d+)$/.exec(r.from_session_id);
    const s = m && REVIEW_SITES.find((x) => x.id === m[1]);
    if (!m || !s) continue;
    out.push({
      site: s.id, name: s.name, n: Number(m[2]), token: r.token,
      url: `${site}/zh-hant/cast?gift=${r.token}&c=${reviewTag(s.id)}`,
      state: r.used_at ? "used" : r.expires_at < now ? "expired" : "open",
      usedAt: r.used_at, expiresAt: r.expires_at, readingSid: r.redeem_session_id,
    });
  }
  return out.sort((a, b) => REVIEW_SITES.findIndex((x) => x.id === a.site) - REVIEW_SITES.findIndex((x) => x.id === b.site) || a.n - b.n);
}

/** Is this grant one of the review links (for the banner on the cast page)? */
export function isReviewGrant(token: string): boolean {
  return isReviewSession(grantByToken(token)?.from_session_id);
}
