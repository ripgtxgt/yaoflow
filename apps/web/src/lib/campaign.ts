/**
 * Campaign tags: where a session came from. Pure — used in the browser
 * (lib/track.ts) and by the API routes that accept a tag.
 *
 *   xhs, threads, pin …       from a promotion link's ?c=<channel>
 *   ~pinterest, ~threads …    09-24 fallback: no ?c=, but document.referrer
 *                             is a known platform (Pinterest strips ?c= from
 *                             profile links; in-app browsers often drop it)
 *   ~ref:news.ycombinator.com any other external referrer, by domain
 *
 * The leading "~" keeps inferred sources apart from tagged links in the
 * /admin channel table. A domain only — never the referring page's path.
 */

export const CAMPAIGN_RE = /^(?:[a-z0-9_-]{1,16}|~[a-z0-9_-]{1,16}|~ref:[a-z0-9.-]{1,60})$/;

export const isCampaignTag = (v: unknown): v is string => typeof v === "string" && CAMPAIGN_RE.test(v);

/** Platforms named by Neil (进度表 待定 11); matched on the registrable domain. */
const PLATFORMS: [RegExp, string][] = [
  [/(^|\.)pinterest\.[a-z.]+$|(^|\.)pin\.it$/, "pinterest"],
  [/(^|\.)threads\.(net|com)$/, "threads"],
  [/(^|\.)instagram\.com$/, "ig"],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, "fbpage"],
  [/(^|\.)dcard\.tw$/, "dcard"],
  [/(^|\.)quora\.com$/, "quora"],
  [/(^|\.)pixnet\.net$/, "pixnet"],
];

/** Hosts that are us or our own flow (checkout return, mail links) — not a source. */
const SELF = /(^|\.)(yaoflow\.com|stripe\.com|localhost)$/;

/**
 * The fallback tag for a referrer URL, or null when there is nothing to say
 * (no referrer, our own site, Stripe coming back from checkout, junk).
 */
export function referrerTag(referrer: string | null | undefined, ownHost?: string): string | null {
  if (!referrer) return null;
  let host: string;
  try {
    const u = new URL(referrer);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    host = u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  if (!host || SELF.test(host) || (ownHost && host === ownHost.toLowerCase().replace(/^www\./, ""))) return null;
  for (const [re, tag] of PLATFORMS) if (re.test(host)) return `~${tag}`;
  const tag = `~ref:${host}`;
  return CAMPAIGN_RE.test(tag) ? tag : null;
}
