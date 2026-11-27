import { randomBytes } from "node:crypto";
import { createGrant, customerEmailById, customerLocaleById, db, emailAlreadySent, guaranteeIdentity, recordEmail, recordOps, shareRefOwner } from "./db";
import { afterLink } from "./grants";
import { buildRefRewardEmail, sendEmail } from "./email";
import { record } from "./analytics-server";
import { asLocale, type Locale } from "./locales";

/**
 * 10-14 进度表 47 推荐回馈 (Neil: 「把这几个都做了」). A newcomer who came through a sharer's link (?r=, share_refs)
 * and makes their FIRST cast in this browser earns both sides one light reading, good for 30 days — a `ref_light`
 * grant each, spent through the same door as a case's light reading (/cast?after=<token>).
 *
 *   · new visitor: the first cast this browser ever made, and (signed in) an account with no earlier cast or order;
 *   · not the sharer themselves: not their account, an address of theirs, a browser of theirs (the yf_dv device or
 *     any browser linked to them) or a payment method of theirs — the same "one person" as the first-purchase
 *     guarantee (进度表 35, db.guaranteeIdentity);
 *   · the sharer earns at most five a calendar month (Taipei); the friend still gets theirs past the ceiling;
 *   · once per newcomer browser. Credits only — no cash, no second level, no ranking.
 * Leaves every older rule (送一卦, 回礼, 合参, the share invite's free first reading) exactly as it was.
 */
export const REF_REWARD_DAYS = 30;
export const REF_REWARD_MONTH_CAP = 5;
const on = () => (process.env.REF_FIRST_CAST ?? "on") !== "off";

/** First moment of the current calendar month in Taipei (UTC+8). */
export function taipeiMonthStart(now = Date.now()): number {
  const t = new Date(now + 8 * 3_600_000);
  return Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1) - 8 * 3_600_000;
}

export function sharerRewardsThisMonth(customerId: number, now = Date.now()): number {
  return (db().prepare("SELECT COUNT(*) AS n FROM grants WHERE kind = 'ref_light' AND via LIKE 'ref:%' AND from_customer_id = ? AND created_at >= ?")
    .get(customerId, taipeiMonthStart(now)) as { n: number }).n;
}

function cardsOf(cids: number[]): string[] {
  if (!cids.length) return [];
  return (db().prepare(`SELECT DISTINCT card_fp FROM orders WHERE card_fp IS NOT NULL AND card_fp <> '' AND customer_id IN (${cids.map(() => "?").join(",")})`)
    .all(...cids) as { card_fp: string }[]).map((r) => r.card_fp);
}

/** Is the newcomer the sharer under another name? Account, address, browser, payment method — any one is enough. */
export function sameAsSharer(owner: { customer_id: number; device: string | null }, friend: { bid: string; device: string | null; customerId: number | null; email: string | null }): string | null {
  if (friend.customerId && friend.customerId === owner.customer_id) return "account";
  if (owner.device && friend.device && owner.device === friend.device) return "device";
  const me = guaranteeIdentity({ customer_id: owner.customer_id, email: customerEmailById(owner.customer_id) });
  if (me.bids.includes(friend.bid)) return "browser";
  if (friend.customerId && me.cids.includes(friend.customerId)) return "account";
  const them = guaranteeIdentity({ customer_id: friend.customerId, email: friend.email });
  if (them.emails.some((e) => me.emails.includes(e))) return "email";
  if (them.bids.some((b) => me.bids.includes(b))) return "browser";
  const mine = new Set(cardsOf(me.cids));
  if (mine.size && cardsOf(them.cids).some((f) => mine.has(f))) return "card";
  return null;
}

function isNewVisitor(bid: string, customerId: number | null): boolean {
  const d = db();
  const casts = (d.prepare("SELECT COUNT(*) AS n FROM cast_log WHERE bid = ?").get(bid) as { n: number }).n;
  if (casts > 1) return false;
  if (customerId) {
    const before = (d.prepare("SELECT (SELECT COUNT(*) FROM orders WHERE customer_id = ?) + (SELECT COUNT(*) FROM cast_log WHERE bid <> ? AND bid IN (SELECT bid FROM browser_links WHERE customer_id = ?)) AS n")
      .get(customerId, bid, customerId) as { n: number }).n;
    if (before > 0) return false;
  }
  return true;
}

export type RefOutcome =
  | { state: "granted"; friendUrl: string; until: number; sharer: "granted" | "capped" }
  | { state: "skip"; why: "off" | "no_ref" | "unknown_ref" | "not_new" | "self" | "done" };

/**
 * Called after a cast is filed (api/teaser, api/cast/log). Returns the friend's link for the page to show; the
 * sharer's letter goes out in the background.
 */
export function refRewardOnFirstCast(i: { ref: string | null | undefined; bid: string; device: string | null; customerId: number | null; email: string | null; locale: Locale; site: string; now?: number }): RefOutcome {
  const now = i.now ?? Date.now();
  if (!on()) return { state: "skip", why: "off" };
  if (!i.ref || !/^[a-z2-9]{8}$/.test(i.ref)) return { state: "skip", why: "no_ref" };
  const d = db();
  const key = `rf_${i.bid}`;
  if (d.prepare("SELECT 1 FROM grants WHERE kind = 'ref_light' AND from_session_id = ? LIMIT 1").get(key)) return { state: "skip", why: "done" };
  const owner = shareRefOwner(i.ref);
  if (!owner) return { state: "skip", why: "unknown_ref" };
  // a browser with casts behind it is no newcomer — and the ref stays in the tab, so this runs on every later cast: cheap first
  if ((d.prepare("SELECT COUNT(*) AS n FROM cast_log WHERE bid = ?").get(i.bid) as { n: number }).n > 1) return { state: "skip", why: "not_new" };
  const fresh = isNewVisitor(i.bid, i.customerId);
  const self = sameAsSharer(owner, { bid: i.bid, device: i.device, customerId: i.customerId, email: i.email });
  if (self) {
    if (fresh) {
      recordOps("ref_reward_self", `${owner.customer_id} ${self}`);
      record({ t: now, e: "ref_reward", s: i.bid.slice(-12), locale: i.locale, method: "self" });
    }
    return { state: "skip", why: "self" };
  }
  if (!fresh) return { state: "skip", why: "not_new" };
  const until = now + REF_REWARD_DAYS * 86_400_000;
  const friendToken = randomBytes(18).toString("hex");
  createGrant({ token: friendToken, kind: "ref_light", tier: "one", expiresAt: until, fromCustomerId: i.customerId, fromSessionId: key, via: `rff:${i.ref}`, locale: i.locale, fromDevice: i.device });
  record({ t: now, e: "ref_reward", s: i.bid.slice(-12), locale: i.locale, method: "friend" });
  let sharer: "granted" | "capped" = "capped";
  if (sharerRewardsThisMonth(owner.customer_id, now) < REF_REWARD_MONTH_CAP) {
    const token = randomBytes(18).toString("hex");
    const sl = asLocale(customerLocaleById(owner.customer_id) ?? i.locale);
    createGrant({ token, kind: "ref_light", tier: "one", expiresAt: until, fromCustomerId: owner.customer_id, fromSessionId: key, via: `ref:${i.ref}`, locale: sl });
    sharer = "granted";
    record({ t: now, e: "ref_reward", s: i.bid.slice(-12), locale: sl, method: "sharer" });
    void mailSharer(owner.customer_id, key, afterLink(i.site, sl, token), until, sl);
  } else {
    recordOps("ref_reward_capped", `${owner.customer_id}`);
    record({ t: now, e: "ref_reward", s: i.bid.slice(-12), locale: i.locale, method: "capped" });
  }
  return { state: "granted", friendUrl: afterLink(i.site, i.locale, friendToken), until, sharer };
}

const ymd = (ms: number) => new Date(ms + 8 * 3_600_000).toISOString().slice(0, 10);

async function mailSharer(customerId: number, key: string, url: string, until: number, locale: Locale): Promise<void> {
  try {
    if (emailAlreadySent(key, "ref_reward")) return;
    const to = customerEmailById(customerId);
    if (!to) return;
    const m = buildRefRewardEmail({ locale, url, until: ymd(until) });
    recordEmail(key, "ref_reward", to, "pending");
    const r = await sendEmail(to, m.subject, m.html, m.text, { kind: "reward", sessionId: key, customerId, locale });
    recordEmail(key, "ref_reward", to, r.ok ? "sent" : "failed", r.error ?? r.id);
  } catch (e) {
    recordOps("ref_reward_mail_error", e instanceof Error ? e.message : "unknown");
  }
}

/** Unspent referral light readings this browser / account holds — for the in-site notice (api/me). */
export function openRefLight(i: { bid: string | null; customerId: number | null; site: string; locale: Locale; now?: number }): { url: string; until: number; side: "friend" | "sharer" }[] {
  const now = i.now ?? Date.now();
  const rows = db().prepare(
    `SELECT token, expires_at, via FROM grants WHERE kind = 'ref_light' AND used_at IS NULL AND expires_at > ?
       AND ((via LIKE 'rff:%' AND (from_session_id = ? OR (? IS NOT NULL AND from_customer_id = ?)))
         OR (via LIKE 'ref:%' AND ? IS NOT NULL AND from_customer_id = ?))
     ORDER BY expires_at ASC LIMIT 5`,
  ).all(now, `rf_${i.bid ?? "-"}`, i.customerId, i.customerId, i.customerId, i.customerId) as { token: string; expires_at: number; via: string }[];
  return rows.map((r) => ({ url: afterLink(i.site, i.locale, r.token), until: r.expires_at, side: r.via.startsWith("rff:") ? "friend" : "sharer" }));
}

export interface RefStats { friends: number; sharers: number; capped: number; claimed: number; paidAfter: number }
/** For the weekly digest: grants made since `since`, how many were spent, and friends who paid within 30 days of theirs. */
export function refRewardStats(since: number): RefStats {
  const d = db();
  const one = (sql: string, ...a: (number | string)[]) => (d.prepare(sql).get(...a) as { v: number }).v;
  return {
    friends: one("SELECT COUNT(*) AS v FROM grants WHERE kind = 'ref_light' AND via LIKE 'rff:%' AND created_at >= ?", since),
    sharers: one("SELECT COUNT(*) AS v FROM grants WHERE kind = 'ref_light' AND via LIKE 'ref:%' AND created_at >= ?", since),
    capped: one("SELECT COUNT(*) AS v FROM grants f WHERE f.kind = 'ref_light' AND f.via LIKE 'rff:%' AND f.created_at >= ? AND NOT EXISTS (SELECT 1 FROM grants s WHERE s.kind = 'ref_light' AND s.via LIKE 'ref:%' AND s.from_session_id = f.from_session_id)", since),
    claimed: one("SELECT COUNT(*) AS v FROM grants WHERE kind = 'ref_light' AND used_at >= ?", since),
    paidAfter: one(
      `SELECT COUNT(DISTINCT g.id) AS v FROM grants g JOIN orders o ON o.customer_id = COALESCE(g.claimed_customer_id, g.from_customer_id)
       WHERE g.kind = 'ref_light' AND g.via LIKE 'rff:%' AND g.created_at >= ? AND o.payment_state = 'paid' AND o.amount_cents > 0
         AND o.created_at BETWEEN g.created_at AND g.created_at + 30 * 86400000`, since),
  };
}
