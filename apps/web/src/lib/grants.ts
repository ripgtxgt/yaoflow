import { randomBytes } from "node:crypto";
import { createGrant, setGrantRef, shareRefOwner, customerEmailById, giftCastForSession, grantByToken, orderBySession, redeemGrant, revisitCastContext, revisitRewardForSession, storedReadingForSession, type GrantRow, type RevisitRow, grantByRedeemSession, caseGiftsBetween, setGrantClaimDevice } from "./db";
import { pick } from "./reading";
import type { PriorReading } from "./reading";
import { asLocale } from "./locales";
import { record } from "./analytics-server";
import type { Locale } from "./locales";

/**
 * 裂变 V1 (总方案 §5.3): two ways a reading is earned by someone else's action.
 *
 *   gift_cast    A paying deep reader (or a member's deep reading) mints ONE
 *                "ask a question for a friend" link per reading, good for
 *                14 days; the friend casts their own question and the deep
 *                reading is theirs. Costs us one model call.
 *   invite_light A newcomer who arrived through a shared cast (?via=) gets
 *                their first light reading free — once per browser or account.
 *
 * Both redeem into a synthetic session `gr_<token>` that paid-store treats as
 * a reward: no charge, no referral credit, ordinary delivery.
 */
export const GIFT_CAST_DAYS = 14;
export const INVITE_COOKIE = "yf_il";
export const TOKEN_RE = /^[0-9a-f]{36}$/;

/** The reading sessions that may mint a gift link: money or a membership paid for a deep reading. */
export function canMintGift(sid: string): boolean {
  const stored = storedReadingForSession(sid);
  if (!stored || stored.tier !== "deep") return false;
  const o = orderBySession(sid);
  const status = o?.status ?? stored.status;
  return status === "paid" || status === "subscription";
}

export function mintGiftCast(sid: string, locale: Locale, fromCustomerId: number | null, via: string | null, fromDevice: string | null = null): GrantRow {
  const existing = giftCastForSession(sid);
  if (existing) return existing;
  const token = randomBytes(18).toString("hex");
  createGrant({ token, kind: "gift_cast", tier: "deep", expiresAt: Date.now() + GIFT_CAST_DAYS * 86_400_000, fromSessionId: sid, fromCustomerId, via, locale, fromDevice });
  record({ t: Date.now(), e: "gift_sent", s: sid.slice(-12), locale, tier: "deep", path: "/reading" });
  return grantByToken(token)!;
}

/**
 * 09-24 M3: a member's monthly pool. `fromSessionId` is the member reading the
 * gift was made from (sub_…), or `pool_<subscription id>` when made from the
 * account page. Idempotent per reading, like the single-purchase gift.
 */
export function mintPoolGift(customerId: number, subId: number, locale: Locale, fromSid: string | null, fromDevice: string | null = null): GrantRow {
  if (fromSid) {
    const existing = giftCastForSession(fromSid);
    if (existing) return existing;
  }
  const token = randomBytes(18).toString("hex");
  createGrant({ token, kind: "gift_cast", tier: "deep", expiresAt: Date.now() + GIFT_CAST_DAYS * 86_400_000, fromSessionId: fromSid ?? `pool_${subId}`, fromCustomerId: customerId, via: null, locale, fromDevice });
  record({ t: Date.now(), e: "gift_sent", s: (fromSid ?? `pool_${subId}`).slice(-12), locale, tier: "deep", path: fromSid ? "/reading" : "/account", method: "pool" });
  return grantByToken(token)!;
}

export function giftLink(site: string, locale: Locale, token: string): string {
  return `${site}/${locale}/cast?gift=${token}`;
}

export type RedeemResult = { ok: true; sid: string } | { ok: false; error: "unknown_token" | "already_used" | "expired" | "self" | "returned" | "device" };

/**
 * 09-27 赠送审核 B: the browser that made a gift — or that received the reading the gift was made from —
 * cannot spend it. A second address kept for oneself arrives in the same browser; a friend opens the link
 * on their own phone. `claimDevice` null (no cookie yet) never matches.
 */
export function sameDevice(g: Pick<GrantRow, "from_device" | "from_session_id">, claimDevice: string | null): boolean {
  if (!claimDevice) return false;
  if (g.from_device && g.from_device === claimDevice) return true;
  const src = g.from_session_id?.startsWith("case_") ? g.from_session_id.slice(5) : g.from_session_id;
  const origin = src?.startsWith("gr_") ? grantByRedeemSession(src) : null;
  return !!origin?.claim_device && origin.claim_device === claimDevice;
}

export function redeemGiftCast(token: string, inputJson: string, claimedEmail: string | null, claimedCustomerId: number | null, locale: Locale, claimDevice: string | null = null): RedeemResult {
  const g = grantByToken(token);
  if (!g || g.kind !== "gift_cast") return { ok: false, error: "unknown_token" };
  if (g.used_at) return { ok: false, error: "already_used" };
  if (g.expires_at < Date.now()) return { ok: false, error: "expired" };
  // 09-24: a gift is for someone else — with five a month, spending your own would be a second allowance
  if (g.from_customer_id && (claimedCustomerId === g.from_customer_id
    || (claimedEmail && claimedEmail.toLowerCase() === (customerEmailById(g.from_customer_id) ?? "").toLowerCase()))) {
    return { ok: false, error: "self" };
  }
  // 09-27 (Neil: 「这两个邮箱在一直免费互送」): a case's gift passes the reading ON. Two people were handing it
  // back and forth — A's gift to B, B publishes and gifts back to A, and again — six free full readings a day
  // between them. A gift born of a published case may not go back to whoever gave the reading behind that case,
  // and the same two people swap a case gift at most once a month.
  if (g.from_session_id?.startsWith("case_")) {
    const isClaimant = (cid: number | null | undefined) => !!cid && (claimedCustomerId === cid
      || (!!claimedEmail && claimedEmail.toLowerCase() === (customerEmailById(cid) ?? "").toLowerCase()));
    const origin = grantByRedeemSession(g.from_session_id.slice(5));
    if (origin && origin.kind === "gift_cast" && isClaimant(origin.from_customer_id)) return { ok: false, error: "returned" };
    if (g.from_customer_id && caseGiftsBetween(g.from_customer_id, claimedCustomerId, claimedEmail, Date.now() - 30 * 86_400_000) > 0) return { ok: false, error: "returned" };
  }
  if (sameDevice(g, claimDevice)) return { ok: false, error: "device" };
  const sid = `gr_${token}`;
  if (!redeemGrant(token, sid, inputJson, claimedEmail, claimedCustomerId)) return { ok: false, error: "already_used" };
  setGrantClaimDevice(token, claimDevice);
  record({ t: Date.now(), e: "gift_claimed", s: sid.slice(-12), locale, tier: "deep", path: "/cast", via: g.via ?? undefined });
  return { ok: true, sid };
}

/** Mint and spend in one step: the newcomer's free light reading on the cast they just made. */
export function grantInviteLight(via: string, inputJson: string, claimedEmail: string | null, claimedCustomerId: number | null, locale: Locale, tier: "one" | "deep" = "one", ref: string | null = null, claimDevice: string | null = null): string {
  const token = randomBytes(18).toString("hex");
  // 09-29 裂变 P2: the share invite carries a full reading; the kind keeps its name so the books stay continuous
  createGrant({ token, kind: "invite_light", tier, expiresAt: Date.now() + 86_400_000, via, locale });
  // 09-29 分享者回礼: remember whose share it was — unless it is the sharer themselves (their account, their address, their browser)
  if (ref) {
    const owner = shareRefOwner(ref);
    const ownEmail = owner ? (customerEmailById(owner.customer_id) ?? "").toLowerCase() : "";
    const self = !owner || (claimedCustomerId !== null && claimedCustomerId === owner.customer_id)
      || (!!claimedEmail && claimedEmail.toLowerCase() === ownEmail)
      || (!!claimDevice && !!owner.device && claimDevice === owner.device);
    if (!self) setGrantRef(token, ref);
  }
  const sid = `gr_${token}`;
  redeemGrant(token, sid, inputJson, claimedEmail, claimedCustomerId);
  record({ t: Date.now(), e: "invite_free_light", s: sid.slice(-12), locale, tier, path: "/cast", via });
  return sid;
}

/* ---------------- 回访奖励 (09-21, Neil: 只给「应验了」的人轻解读，「没应验」给一次追问) ---------------- */

export const REVISIT_LIGHT_DAYS = 30;

/**
 * The reward for answering a revisit, minted once per reading, whichever
 * answer came first: "hit" → one light reading on what comes next for the
 * same matter (a link the reader casts on); "miss" → one extra follow-up on
 * the deep reading itself (never redeemed into a session; the follow-up route
 * counts it). "open" earns nothing — it is re-asked two weeks later instead.
 */
export function mintRevisitReward(r: RevisitRow, outcome: "hit" | "miss"): GrantRow | null {
  const existing = revisitRewardForSession(r.session_id);
  if (existing) return existing;
  const token = randomBytes(18).toString("hex");
  const kind = outcome === "hit" ? "revisit_light" : "revisit_followup";
  createGrant({
    token, kind, tier: outcome === "hit" ? "one" : "deep",
    expiresAt: Date.now() + REVISIT_LIGHT_DAYS * 86_400_000,
    fromSessionId: r.session_id, fromCustomerId: r.customer_id, locale: r.locale,
  });
  record({ t: Date.now(), e: "revisit_reward", s: r.session_id.slice(-12), locale: r.locale, tier: outcome === "hit" ? "one" : "deep", method: outcome, path: "/revisit" });
  return grantByToken(token);
}

export function afterLink(site: string, locale: Locale, token: string): string {
  return `${site}/${locale}/cast?after=${token}`;
}

/** What the cast page shows a reader holding an aftermath link: the matter and the call it is about. Null when the link is spent or expired. */
export function afterContext(token: string): { question: string; call: string; hex: string; locale: Locale; state: "open" | "used" | "expired"; kind: "after" | "case" | "ref" } | null {
  const g = grantByToken(token);
  // 09-26 公开卦例回礼: a light reading for any new matter — same door, no earlier call riding along
  if (g && (g.kind === "case_light" || g.kind === "ref_light")) {
    return { question: "", call: "", hex: "", locale: asLocale(g.locale), state: g.used_at ? "used" : g.expires_at < Date.now() ? "expired" : "open", kind: g.kind === "ref_light" ? "ref" : "case" };
  }
  if (!g || g.kind !== "revisit_light") return null;
  const p = priorFromSession(g.from_session_id ?? "");
  if (!p) return null;
  const state = g.used_at ? "used" : g.expires_at < Date.now() ? "expired" : "open";
  // the banner puts its own full stop after the call
  return { question: p.question, call: p.call.replace(/[。.．!！?？]+$/u, ""), hex: p.hex, locale: asLocale(g.locale), state, kind: "after" };
}

/** The earlier deep reading as a `prior`, read from the store — never from the client. */
function priorFromSession(sid: string): PriorReading | null {
  const stored = storedReadingForSession(sid);
  if (!stored) return null;
  const body = stored.reading as Record<string, Record<string, string> | undefined> | null;
  const field = body?.verdict ?? body?.summary;
  const call = field ? pick(field, asLocale(stored.locale)).replace(/\s+/g, " ").slice(0, 400) : "";
  if (call.length < 4) return null;
  const o = orderBySession(sid);
  const ctx = o?.cast_id ? revisitCastContext(o.cast_id) : null;
  const hex = ctx ? (ctx.changed_name ? `${ctx.primary_name} → ${ctx.changed_name}` : ctx.primary_name) : "";
  return { question: stored.question.slice(0, 200), at: stored.castAtMs, hex: hex.slice(0, 40), call, outcome: "hit" };
}

/** Spend the aftermath link on this new cast: the earlier reading rides along as the prior, marked as having come true. */
export function redeemRevisitLight(token: string, input: object, claimedEmail: string | null, claimedCustomerId: number | null, locale: Locale): RedeemResult {
  const g = grantByToken(token);
  if (!g || g.kind !== "revisit_light") return { ok: false, error: "unknown_token" };
  if (g.used_at) return { ok: false, error: "already_used" };
  if (g.expires_at < Date.now()) return { ok: false, error: "expired" };
  const prior = priorFromSession(g.from_session_id ?? "");
  // the reading goes to whoever held the deep reading unless they signed in or typed another address
  const earlier = storedReadingForSession(g.from_session_id ?? "");
  const sid = `gr_${token}`;
  const inputJson = JSON.stringify({ ...input, ...(prior ? { prior } : {}) });
  if (!redeemGrant(token, sid, inputJson, claimedEmail ?? earlier?.email ?? null, claimedCustomerId ?? g.from_customer_id)) return { ok: false, error: "already_used" };
  record({ t: Date.now(), e: "revisit_light_claimed", s: sid.slice(-12), locale, tier: "one", path: "/cast" });
  return { ok: true, sid };
}

/** 09-26: spend a published case's light reading on a new cast — the owner's own reading, no prior attached. */
export function redeemCaseLight(token: string, input: object, claimedEmail: string | null, claimedCustomerId: number | null, locale: Locale): RedeemResult {
  const g = grantByToken(token);
  // 10-14 进度表 47: a referral light reading (ref_light) is spent the same way — a new matter, no prior
  if (!g || (g.kind !== "case_light" && g.kind !== "ref_light")) return { ok: false, error: "unknown_token" };
  if (g.used_at) return { ok: false, error: "already_used" };
  if (g.expires_at < Date.now()) return { ok: false, error: "expired" };
  const owner = storedReadingForSession(g.from_session_id ?? "");
  const sid = `gr_${token}`;
  if (!redeemGrant(token, sid, JSON.stringify(input), claimedEmail ?? owner?.email ?? null, claimedCustomerId ?? g.from_customer_id)) return { ok: false, error: "already_used" };
  if (g.kind === "ref_light") record({ t: Date.now(), e: "ref_reward", s: sid.slice(-12), locale, tier: "one", path: "/cast", method: "claimed" });
  else record({ t: Date.now(), e: "case_reward", s: sid.slice(-12), locale, tier: "one", path: "/cast", method: "claimed" });
  return { ok: true, sid };
}
