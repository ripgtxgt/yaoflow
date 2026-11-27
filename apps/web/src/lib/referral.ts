import { randomBytes } from "node:crypto";
import { LOCALE_META, asLocale } from "./locales";
import {
  createReferral, customerEmailById, customerForReadingSession, shareRefOwner, emailAlreadySent, grantByRedeemSession, recordEmail, customerLocaleById, customerOrdersCount, giftRedeemedBy, paidTimesForCustomer, recordOps, referralsSince, referrerForVia,
} from "./db";
import { buildGiftUsedEmail, sendEmail } from "./email";
import { activeMembership } from "./membership";
import { contentFor } from "./content";
import { GIFT_REWARD_EMAIL_T, REWARD_EMAIL_T } from "./dict/email";
import type { Locale } from "./locales";

/**
 * 推荐奖励 — a friend's first paid reading earns the sharer one free 深断.
 *
 * The reward is a signed gift link, not a Stripe coupon: it works the same in
 * every buyer region (Managed Payments or not), costs us nothing but a model
 * call, and the redemption is a normal reading with a synthetic session id
 * (rw_<token>) so delivery, email, revisit and the customer record all reuse
 * the paid path unchanged.
 *
 * Rules: first paid order of the referred customer only; sharer ≠ buyer; one
 * reward per referred customer; 30 days to use it.
 */

export const REWARD_DAYS = 30;

export interface GrantInput {
  via: string | null | undefined;
  referredCustomerId: number | null;
  referredEmail: string | null;
  referredSessionId: string;
}

/**
 * 09-24 (Neil chose: 合并成「送一卦」一个机制，奖励一次免费深断): the sharer's
 * reward no longer follows the share card — in the paid era it brought nobody
 * who paid — but the gift. Whoever redeemed a 送一卦 and later pays for the
 * first time (a purchase or a membership) earns the giver one free deep reading.
 * The share card keeps its other job: a newcomer's first light reading is free.
 */
/** Off since 09-24; SHARE_CARD_REWARD=1 in .env.local switches the share-card thread back on (read per call). */
export const shareCardReward = (): boolean => process.env.SHARE_CARD_REWARD === "1";

export async function maybeGrantGiftReward(i: { customerId: number | null; email: string | null; sessionId: string }): Promise<"granted" | "skipped"> {
  try {
    if (!i.customerId) return "skipped";
    if (paidTimesForCustomer(i.customerId) !== 1) return "skipped"; // only the friend's first payment
    const g = giftRedeemedBy(i.customerId, i.email);
    if (!g || !g.from_customer_id) return "skipped";
    const giverEmail = customerEmailById(g.from_customer_id);
    if (!giverEmail) return "skipped";
    const token = randomBytes(18).toString("hex");
    const locale = asLocale(customerLocaleById(g.from_customer_id) ?? g.locale);
    const ok = createReferral({
      via: `gift:${g.token.slice(0, 10)}`, referrerCustomerId: g.from_customer_id, referredCustomerId: i.customerId,
      referredSessionId: i.sessionId, token, expiresAt: Date.now() + REWARD_DAYS * 86_400_000, locale,
    });
    if (!ok) return "skipped"; // this friend already earned someone a reward
    const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
    const mail = buildRewardEmail(locale, `${site}/${locale}/cast?reward=${token}`, GIFT_REWARD_EMAIL_T);
    const sent = await sendEmail(giverEmail, mail.subject, mail.html, mail.text, { kind: "reward", sessionId: i.sessionId, customerId: g.from_customer_id });
    recordOps("gift_reward_granted", `${g.from_customer_id} ← ${i.customerId} ${sent.ok ? "mailed" : "mail_failed"}`);
    return "granted";
  } catch (e) {
    recordOps("referral_error", e instanceof Error ? e.message : "unknown");
    return "skipped";
  }
}

export async function maybeGrantReferral(i: GrantInput): Promise<"granted" | "skipped"> {
  // 09-24: the gift thread first; the share-card thread only if switched back on
  const viaGift = await maybeGrantGiftReward({ customerId: i.referredCustomerId, email: i.referredEmail, sessionId: i.referredSessionId });
  if (viaGift === "granted" || !shareCardReward()) return viaGift;
  try {
    if (!i.via || !i.referredCustomerId || !i.referredEmail) return "skipped";
    if (customerOrdersCount(i.referredCustomerId) !== 1) return "skipped"; // only the first purchase counts
    const referrer = referrerForVia(i.via, i.referredEmail);
    if (!referrer) { recordOps("referral_unmatched", i.via); return "skipped"; }
    if (referrer.customerId === i.referredCustomerId) return "skipped";

    const token = randomBytes(18).toString("hex");
    const expiresAt = Date.now() + REWARD_DAYS * 86_400_000;
    const ok = createReferral({
      via: i.via, referrerCustomerId: referrer.customerId, referredCustomerId: i.referredCustomerId,
      referredSessionId: i.referredSessionId, token, expiresAt, locale: referrer.locale,
    });
    if (!ok) return "skipped"; // already credited for this friend

    const locale = asLocale(referrer.locale);
    const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
    const link = `${site}/${locale}/cast?reward=${token}`;
    const mail = buildRewardEmail(locale, link);
    const sent = await sendEmail(referrer.email, mail.subject, mail.html, mail.text, { kind: "reward", sessionId: i.referredSessionId, customerId: referrer.customerId });
    recordOps("referral_granted", `${i.via} → ${referrer.customerId} ${sent.ok ? "mailed" : "mail_failed"}`);
    return "granted";
  } catch (e) {
    recordOps("referral_error", e instanceof Error ? e.message : "unknown");
    return "skipped";
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export function buildRewardEmail(locale: Locale, link: string, copy: typeof REWARD_EMAIL_T = REWARD_EMAIL_T): { subject: string; html: string; text: string } {
  const raw = contentFor(copy, locale);
  const t = { ...raw, note: raw.note.replace("{n}", String(REWARD_DAYS)) };
  // paper ground like every other email (09-07 调研); solid colours, no opacity
  const html = `<!doctype html><html lang="${LOCALE_META[locale].htmlLang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#f4f2ec;color:#14151c;font-family:Georgia,'Songti SC','Noto Serif SC',serif;">
  <div style="max-width:560px;margin:0 auto;padding:44px 24px 40px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:#7a7a7c;margin:0 0 36px;">YaoFlow</p>
    <p style="font-size:15px;line-height:1.9;margin:0 0 12px;color:#14151c;">${t.lead}</p>
    <p style="font-size:15px;line-height:1.9;margin:0 0 28px;color:#333439;">${t.body}</p>
    <p style="margin:0 0 16px;"><a href="${esc(link)}" style="display:inline-block;background:#14151c;color:#f4f2ec;text-decoration:none;padding:12px 26px;border-radius:2px;font-size:14px;">${t.cta}</a></p>
    <p style="font-size:12px;color:#606063;line-height:1.7;margin:0 0 32px;">${t.note}</p>
    <hr style="border:none;border-top:1px solid #d0cfcb;margin:0 0 16px;">
    <p style="font-size:11px;color:#7a7a7c;line-height:1.6;margin:0;">${t.foot}</p>
  </div></body></html>`;
  const text = [t.lead, t.body, "", `${t.cta}: ${link}`, t.note, "", t.foot].join("\n");
  return { subject: t.subject, html, text };
}

/**
 * 09-26 (裂变 ①): when a friend's 送一卦 reading is delivered, the giver hears
 * that it was used — and what comes back to them if the friend ever pays. The
 * friend's question is never in it. Once per redeemed gift.
 */
export async function notifyGiftUsed(sid: string): Promise<void> {
  try {
    if (emailAlreadySent(sid, "gift_used")) return;
    const g = grantByRedeemSession(sid);
    if (!g || g.kind !== "gift_cast" || !g.from_customer_id) return;
    const to = customerEmailById(g.from_customer_id);
    if (!to) return;
    const locale = asLocale(customerLocaleById(g.from_customer_id) ?? g.locale);
    const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
    // the giver's own reading holds the next gift link, when there is one
    const own = g.from_session_id && !/^(case_|pool_)/.test(g.from_session_id) ? g.from_session_id : null;
    const giftUrl = own ? `${site}/${locale}/reading?sid=${encodeURIComponent(own)}#gift` : `${site}/${locale}/account`;
    // 09-29 裂变 P1 (裂变复盘与放宽方案-0929): the giver is thanked the moment the gift is used — up to 3 a month
    const ty = mintThankYou(g, sid, site, locale);
    const m = buildGiftUsedEmail({ locale, giftUrl, rewardUrl: ty?.url, allowance: ty?.allowance, rewardDays: REWARD_DAYS });
    recordEmail(sid, "gift_used", to, "pending");
    const r = await sendEmail(to, m.subject, m.html, m.text, { kind: "gift_used", sessionId: sid, customerId: g.from_customer_id, locale });
    recordEmail(sid, "gift_used", to, r.ok ? "sent" : "failed", r.error ?? r.id);
  } catch (e) {
    recordOps("gift_used_error", e instanceof Error ? e.message : "unknown");
  }
}

/**
 * 09-29 (Neil: 「去除3次上限吧，让用户无限用起来」): no ceiling on thank-you readings.
 * What bounds them is where gifts come from — one per paid deep reading, a member's
 * 5 a month, a published case's gift — and a thank-you reading can itself never
 * mint a gift (grants.canMintGift). Past this many in 30 days the giver is flagged
 * on the dashboard for a human look (sending to one's own second address), never stopped.
 */
export const CLAIM_REWARD_WATCH = 5;

/**
 * The giver's thank-you for a claimed gift: a free full reading (the same
 * rw_ link as the old pay-time reward). One per friend (the referrals table's
 * UNIQUE friend column also stops the pay-time reward doubling it), no monthly
 * ceiling (see CLAIM_REWARD_WATCH). The redeem checks on the gift itself
 * (same device, same address, returned gifts) already ran before this.
 */
export function mintClaimReward(g: { token: string; from_customer_id: number | null; claimed_customer_id?: number | null }, friendSid: string, site: string, locale: Locale, thread: "claim" | "share" = "claim"): string | null {
  return mintThankYou(g, friendSid, site, locale, thread)?.url ?? null;
}

/**
 * 09-29 会员裂变 (Neil: 怎么让会员有动力去做裂变): a member's thank-you is not a link
 * to redeem — it goes straight into this period's deep allowance ("10 + 1"), and
 * the letter says so. Everyone else gets the rw_ link as before. Either way it is
 * one referrals row, so "once per friend" and the dashboard counts hold.
 */
export function mintThankYou(g: { token: string; from_customer_id: number | null; claimed_customer_id?: number | null }, friendSid: string, site: string, locale: Locale, thread: "claim" | "share" = "claim"): { url: string; allowance: boolean } | null {
  try {
    if (!g.from_customer_id) return null;
    const friend = g.claimed_customer_id ?? customerForReadingSession(friendSid);
    if (!friend || friend === g.from_customer_id) return null;
    if (referralsSince(g.from_customer_id, Date.now() - 30 * 86_400_000) >= CLAIM_REWARD_WATCH) recordOps("claim_reward_watch", `${g.from_customer_id}`);
    const member = !!activeMembership(g.from_customer_id);
    const token = randomBytes(18).toString("hex");
    const ok = createReferral({
      via: `${thread}:${g.token.slice(0, 10)}`, referrerCustomerId: g.from_customer_id, referredCustomerId: friend,
      referredSessionId: friendSid, token, expiresAt: Date.now() + REWARD_DAYS * 86_400_000, locale, toAllowance: member,
    });
    if (!ok) return null;
    recordOps(`${thread}_reward_granted`, `${g.from_customer_id} ← ${friend}${member ? " (allowance)" : ""}`);
    return member ? { url: `${site}/${locale}/cast`, allowance: true } : { url: `${site}/${locale}/cast?reward=${token}`, allowance: false };
  } catch (e) {
    recordOps("referral_error", e instanceof Error ? e.message : "unknown");
    return null;
  }
}

/**
 * 09-29 分享者回礼 (Neil: 「这是很大的一个bug啊……没有回礼人家怎么愿意分享呢」).
 * A share link now carries the sharer's own ref (?r=, share_refs), so a
 * newcomer's free first reading can be traced to one person, like a gift. When
 * that reading is delivered the sharer gets the same thank-you as a giver: a
 * full reading, no monthly ceiling, once per newcomer. The self checks ran when
 * the reading was granted (grants.grantInviteLight): not their account, not
 * their address, not their browser.
 */
export async function notifyShareUsed(sid: string): Promise<void> {
  try {
    if (emailAlreadySent(sid, "share_used")) return;
    const g = grantByRedeemSession(sid);
    if (!g || g.kind !== "invite_light" || !g.ref) return;
    const owner = shareRefOwner(g.ref);
    if (!owner) return;
    const to = customerEmailById(owner.customer_id);
    if (!to) return;
    const locale = asLocale(customerLocaleById(owner.customer_id) ?? g.locale);
    const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
    const ty = mintThankYou({ token: g.token, from_customer_id: owner.customer_id, claimed_customer_id: g.claimed_customer_id }, sid, site, locale, "share");
    if (!ty) return;
    const m = buildGiftUsedEmail({ locale, giftUrl: `${site}/${locale}/reading?sid=${encodeURIComponent(owner.session_id)}#share`, rewardUrl: ty.url, allowance: ty.allowance, rewardDays: REWARD_DAYS, via: "share" });
    recordEmail(sid, "share_used", to, "pending");
    const r = await sendEmail(to, m.subject, m.html, m.text, { kind: "reward", sessionId: sid, customerId: owner.customer_id, locale });
    recordEmail(sid, "share_used", to, r.ok ? "sent" : "failed", r.error ?? r.id);
  } catch (e) {
    recordOps("share_used_error", e instanceof Error ? e.message : "unknown");
  }
}
