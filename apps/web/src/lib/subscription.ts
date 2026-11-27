import { packQuotes } from "./pack-quote";
import { randomBytes } from "node:crypto";
import {
  createSubUse, recentSubUseForCast, latestSubscription, markSubscriptionGone, recordOps, staleSubscriptions, subUsesInPeriod, subscriptionByStripeId,
  upsertCustomer, upsertSubscription, saveCancelDetails, setPause, type SubscriptionRow, memberCaseBonus, memberReferralBonus, memberBonusBetween, packBalance, allowanceGrantsSince,
} from "./db";
import { getSubscription, type StripeSubscription } from "./stripe";
import type { Locale } from "./locales";
import { DEEP_PER_MONTH as DEEP_CAP, OWN_CARRY_MAX, PASS_PERKS_UNTIL, PASS_SPLIT_AT, type Entitlement } from "./sub-plan";
import type { ReadingInput, Tier } from "./reading";
import { featureState } from "./features";
import { capCheck, capSpend } from "./caps";
import { isTongkaDays } from "./tongka";

/** 10-22 通卡: the model is live (preview or on) — allowances give way to the fair-use caps (lib/caps.ts). TONGKA_MODEL=on|off overrides (tests). */
export const tongkaLive = (): boolean => process.env.TONGKA_MODEL === "off" ? false : process.env.TONGKA_MODEL === "on" ? true : featureState("tongka") !== "off";
/** 10-23 进度表 101: 通卡 open to everyone — no one can buy a single reading any more, so letters and crons stop quoting one. */
export const tongkaForAll = (): boolean => process.env.TONGKA_MODEL === "off" ? false : process.env.TONGKA_MODEL === "on" ? true : featureState("tongka") === "on";
/** 10-22: everything a 通卡 model member or pass holder may read, as a count the old UI understands */
const UNLIMITED = 999;

/**
 * The subscription: unlimited light readings and a monthly allowance of deep
 * ones, for one flat price. Stripe Billing owns the money; the local mirror
 * (subscriptions table) owns entitlement decisions so a reading never waits
 * on a Stripe round-trip. The mirror is refreshed by the webhook when Stripe
 * calls, by the cron when it doesn't, and on return from checkout.
 */

export type Plan = "month" | "year";

export const PLANS: Record<Plan, { cents: number; interval: Plan }> = {
  month: { cents: Number(process.env.PRICE_SUB_MONTH_CENTS ?? 999), interval: "month" },
  year: { cents: Number(process.env.PRICE_SUB_YEAR_CENTS ?? 7900), interval: "year" },
};

/** deep readings per billing month (client-safe copy in sub-plan.ts); light readings have a fair-use ceiling no human reaches */
export { DEEP_PER_MONTH } from "./sub-plan";
export type { Entitlement } from "./sub-plan";
// 09-30 (进度表 24 ③): the default follows what production has run on since 09-29 (300); 60 stopped a member who reads light readings to compare
export const LIGHT_FAIR_USE = Number(process.env.SUB_LIGHT_FAIR_USE ?? 300);

/** Stripe line-item names — neutral "digital content" wording in every language. */
export const SUB_NAMES: Record<Plan, Record<Locale, string>> = {
  month: {
    zh: "YaoFlow 月度会员（数字内容）", "zh-hant": "YaoFlow 月度會員（數位內容）", en: "YaoFlow Monthly (digital content)",
    ja: "YaoFlow 月額メンバーシップ（デジタルコンテンツ）", ko: "YaoFlow 월간 멤버십 (디지털 콘텐츠)", fr: "Abonnement mensuel YaoFlow (contenu numérique)",
    de: "YaoFlow-Mitgliedschaft monatlich (digitaler Inhalt)", es: "YaoFlow mensual (contenido digital)", pt: "YaoFlow mensal (conteúdo digital)",
  },
  year: {
    zh: "YaoFlow 年度会员（数字内容）", "zh-hant": "YaoFlow 年度會員（數位內容）", en: "YaoFlow Yearly (digital content)",
    ja: "YaoFlow 年額メンバーシップ（デジタルコンテンツ）", ko: "YaoFlow 연간 멤버십 (디지털 콘텐츠)", fr: "Abonnement annuel YaoFlow (contenu numérique)",
    de: "YaoFlow-Mitgliedschaft jährlich (digitaler Inhalt)", es: "YaoFlow anual (contenido digital)", pt: "YaoFlow anual (conteúdo digital)",
  },
};

export const LIVE_STATUSES = new Set(["active", "trialing"]);

/**
 * Allowance months run from the period start: a yearly plan gets a fresh
 * deep-reading allowance every 30 days counted from the day it began, a
 * monthly plan simply every billing period.
 */
/** 09-27 (Neil: 「把年费会员给去掉」): no new yearly plans are offered or sold; SUB_YEARLY=on brings them back. Existing yearly rows keep working. */
export const yearlyOn = (): boolean => process.env.SUB_YEARLY === "on";

export function allowanceWindow(sub: SubscriptionRow, now = Date.now()): { since: number; until: number } {
  const start = sub.period_start ?? sub.created_at;
  if (sub.plan === "month" && sub.period_end) return { since: start, until: sub.period_end };
  const day = 86_400_000;
  const elapsed = Math.max(0, now - start);
  const k = Math.floor(elapsed / (30 * day));
  return { since: start + k * 30 * day, until: start + (k + 1) * 30 * day };
}

/**
 * 09-29 (Neil: 确认会员拿到的回礼改成可以顺延到下一期): a friend's thank-you earned in the
 * previous period and not used there carries into this one — once; after that it
 * lapses like the rest. Spent last: the period's own 10 and case bonuses go first,
 * so what is left over (up to what friends brought) is what carries.
 */
export function friendCarry(sub: SubscriptionRow, customerId: number, w: { since: number; until: number }): number {
  return periodCarry(sub, customerId, w).total;
}

/**
 * 09-30 续订专属: what the previous period left unused, carried once into this one. Friends' thank-yous are spent
 * last, so the leftover is theirs first (as before); beyond that, up to OWN_CARRY_MAX of the period's own readings.
 * Carried readings are not counted as the previous period's allowance, so they never carry twice. Nothing of one's
 * own carries into the first period, or out of a paused month (it had no allowance to leave over).
 */
export function periodCarry(sub: SubscriptionRow, customerId: number, w: { since: number; until: number }): { friends: number; own: number; total: number } {
  const len = Math.max(1, w.until - w.since);
  const prevSince = w.since - len;
  const prev = memberBonusBetween(customerId, prevSince, w.since);
  const firstPeriod = w.since - sub.created_at < 86_400_000;
  const pausedPrev = !!(sub.paused_from && sub.paused_until && sub.paused_from < w.since && sub.paused_until > prevSince);
  const ownOk = !firstPeriod && !pausedPrev && !isLocalSubscription(sub.stripe_subscription_id);
  if (!prev.friends && !ownOk) return { friends: 0, own: 0, total: 0 };
  const usedPrev = subUsesInPeriod(sub.id, "deep", prevSince) - subUsesInPeriod(sub.id, "deep", w.since);
  const leftPrev = Math.max(0, DEEP_CAP + prev.cases + prev.friends - usedPrev);
  const friends = Math.min(prev.friends, leftPrev);
  const own = ownOk ? Math.min(OWN_CARRY_MAX, leftPrev - friends) : 0;
  return { friends, own, total: friends + own };
}

/**
 * 09-30 续订专属: are the renew-only perks (gift pool, top-up packs; carry-over follows from renewing itself) live?
 * A renewing subscription: yes. Renewal off: no — unless it was already off before the rule (renew_off_at = 1).
 * A one-off month: only if bought before PASS_PERKS_UNTIL. A complimentary membership: as before, yes.
 */
export function renewPerks(sub: Pick<SubscriptionRow, "stripe_subscription_id" | "cancel_at_period_end" | "cancel_at" | "created_at" | "renew_off_at">): boolean {
  if (isCompSubscription(sub.stripe_subscription_id)) return true;
  if (isPassSubscription(sub.stripe_subscription_id)) return sub.created_at < PASS_PERKS_UNTIL;
  const off = sub.cancel_at_period_end === 1 || sub.cancel_at != null;
  return !off || sub.renew_off_at === 1;
}

const NONE: Entitlement = {
  active: false, status: null, plan: null, periodEnd: null, cancelAtPeriodEnd: false,
  deepLeft: 0, deepTotal: DEEP_CAP, lightLeft: 0, resetsAt: null, stripeCustomerId: null,
};

export async function entitlementFor(customerId: number): Promise<Entitlement> {
  let sub = latestSubscription(customerId);
  if (!sub) return NONE;
  // a mirror older than a day, or past its own period end, is re-read from Stripe before it decides anything —
  // 09-23: except one that has ended for good. A canceled subscription never comes back to life (a new one is a
  // new row), and re-reading it on every account-page view put a 404 in Stripe's error log each time.
  const ended = sub.status === "canceled" || sub.status === "incomplete_expired";
  if (!ended && (sub.synced_at < Date.now() - 86_400_000 || (sub.period_end && sub.period_end < Date.now() && LIVE_STATUSES.has(sub.status)))) {
    try { sub = await syncSubscription(sub.stripe_subscription_id, customerId); } catch { /* keep the mirror */ }
  }
  if (!sub) return NONE;
  const active = LIVE_STATUSES.has(sub.status) && (!sub.period_end || sub.period_end > Date.now() - 3 * 86_400_000)
    // 09-23 暂停一个月: Stripe keeps the subscription "active" while it voids the bill, so the pause is ours to honour
    && !inPause(sub);
  const w = allowanceWindow(sub);
  const deepUsed = subUsesInPeriod(sub.id, "deep", w.since);
  const pc = isCompSubscription(sub.stripe_subscription_id) ? { friends: 0, own: 0, total: 0 } : periodCarry(sub, customerId, w);
  const carry = pc.total;
  const perks = renewPerks(sub);
  // 09-29 会员增购包: bought units are spent after the period's own, and never lapse while the membership lives
  const pack = isCompSubscription(sub.stripe_subscription_id) ? { left: 0 } : packBalance(customerId);
  const lightUsed = subUsesInPeriod(sub.id, "one", w.since);
  // 10-02 小包与单买抵扣: both pack sizes, priced for this member now (lib/pack-quote.ts)
  const quotes = isCompSubscription(sub.stripe_subscription_id)
    ? { small: null, large: null, singles: 0 }
    : packQuotes({ customerId, since: w.since, currency: sub.currency, packLeft: pack.left, buyable: active && perks });
  return {
    active,
    status: sub.status,
    plan: sub.plan as Plan,
    periodEnd: sub.period_end,
    // 09-23: the account page must say "ends on …" for either mechanism
    cancelAtPeriodEnd: sub.cancel_at_period_end === 1 || sub.cancel_at != null || isCompSubscription(sub.stripe_subscription_id),
    comp: isCompSubscription(sub.stripe_subscription_id),
    pass: isPassSubscription(sub.stripe_subscription_id),
    // 10-22 通卡: only a renewing (or complimentary) membership is 會員; a pass_ row is a 通卡
    member: !isPassSubscription(sub.stripe_subscription_id),
    ...(isPassSubscription(sub.stripe_subscription_id) ? { passDays: isTongkaDays(sub.pass_days) ? sub.pass_days : 30 as const } : {}),
    ...(tongkaLive() ? { unlimited: true } : {}),
    ...(isCompSubscription(sub.stripe_subscription_id)
      ? { deepLeft: active ? COMP_UNLIMITED : 0, deepTotal: COMP_UNLIMITED + deepUsed, lightLeft: active ? COMP_UNLIMITED : 0 }
      : {
        // 09-26 公开卦例回礼: a member who kept a published case's reading for themselves gets one more this month
        // 09-30 补额度 (进度表 24): units the owner added by hand count in this period like a case bonus
        // 10-22 通卡: no monthly allowance any more — the fair-use caps (lib/caps.ts) are the only limit
        deepLeft: !active ? 0 : tongkaLive() ? UNLIMITED : Math.max(0, DEEP_CAP + memberCaseBonus(customerId, w.since) + allowanceGrantsSince(customerId, "deep", w.since) + carry - deepUsed) + pack.left,
        deepTotal: tongkaLive() ? UNLIMITED + deepUsed : DEEP_CAP + memberCaseBonus(customerId, w.since) + allowanceGrantsSince(customerId, "deep", w.since) + carry,
        lightLeft: !active ? 0 : tongkaLive() ? UNLIMITED : Math.max(0, LIGHT_FAIR_USE + allowanceGrantsSince(customerId, "one", w.since) - lightUsed),
        friendBonus: memberReferralBonus(customerId, w.since) + pc.friends,
        carried: pc.own,
        renewing: perks,
        packLeft: active ? pack.left : 0,
        packBuyable: !tongkaLive() && !!(quotes.small || quotes.large),
        packQuotes: { small: quotes.small, large: quotes.large },
        singlesThisPeriod: quotes.singles,
        subCurrency: sub.currency,
      }),
    resetsAt: active ? w.until : null,
    stripeCustomerId: sub.stripe_customer_id,
  };
}

/** Inside the month they chose to pause: no charge, and no allowance either. */
export function inPause(sub: Pick<SubscriptionRow, "paused_from" | "paused_until">, now = Date.now()): boolean {
  return sub.paused_from != null && sub.paused_until != null && now >= sub.paused_from && now < sub.paused_until;
}

function planOf(s: StripeSubscription): Plan {
  return s.items?.data?.[0]?.price?.recurring?.interval === "year" ? "year" : "month";
}

function periodOf(s: StripeSubscription): { start: number | null; end: number | null } {
  const item = s.items?.data?.[0];
  const start = item?.current_period_start ?? s.current_period_start;
  const end = item?.current_period_end ?? s.current_period_end;
  return { start: start ? start * 1000 : null, end: end ? end * 1000 : null };
}

/** Write one Stripe subscription object into the mirror; the customer is resolved from metadata/email when unknown. */
export function mirrorSubscription(s: StripeSubscription, customerId?: number | null, email?: string | null): SubscriptionRow | null {
  let cid = customerId ?? null;
  if (!cid) {
    const known = subscriptionByStripeId(s.id);
    if (known) cid = known.customer_id;
  }
  if (!cid) {
    const e = s.metadata?.email ?? email ?? null;
    if (!e) return null;
    cid = upsertCustomer(e, s.metadata?.locale);
  }
  const p = periodOf(s);
  const price = s.items?.data?.[0]?.price;
  const row = upsertSubscription({
    customerId: cid,
    stripeCustomerId: typeof s.customer === "string" ? s.customer : null,
    stripeSubscriptionId: s.id,
    status: s.status,
    plan: planOf(s),
    periodStart: p.start,
    periodEnd: p.end,
    cancelAtPeriodEnd: Boolean(s.cancel_at_period_end),
    cancelAt: typeof s.cancel_at === "number" ? s.cancel_at * 1000 : null,
    currency: price?.currency ? price.currency.toUpperCase() : null,
    amountMinor: typeof price?.unit_amount === "number" ? price.unit_amount : null,
  });
  // 09-23: the reason they gave in the portal, kept once given
  const cd = s.cancellation_details;
  if (cd && (cd.feedback || cd.comment)) saveCancelDetails(s.id, cd.feedback ?? null, cd.comment ? cd.comment.slice(0, 500) : null);
  // a pause undone before it began (in the dashboard, say) no longer blocks the allowance
  if (!s.pause_collection && row.paused_from != null && row.paused_from > Date.now()) setPause(row.id, null, null);
  return subscriptionByStripeId(s.id) ?? row;
}

/**
 * 09-24 (Neil): a complimentary membership granted by hand — no Stripe object
 * behind it (id `comp_…`), never re-read from Stripe (a lookup would 404 and
 * mark it gone), and no monthly caps: unlimited full and light readings until
 * its period end. Only created by Claude on Neil's say-so; see 开发日志 09-24.
 */
export const isCompSubscription = (stripeSubscriptionId: string | null | undefined): boolean =>
  !!stripeSubscriptionId && stripeSubscriptionId.startsWith("comp_");
export const COMP_UNLIMITED = 9999;
/** 09-26 会员单月: a paid one-off month (id `pass_…`) — kept in our mirror only, like comp_, but with the normal caps */
export const isPassSubscription = (id: string | null | undefined): boolean => !!id && id.startsWith("pass_");
/** Rows with no Stripe subscription behind them: never re-read from Stripe. */
export const isLocalSubscription = (id: string | null | undefined): boolean => isCompSubscription(id) || isPassSubscription(id);
/**
 * 10-22 进度表 92: does this live row carry the 會員 side (今日一籤全文、運勢章)? A membership or a complimentary one: yes.
 * A 通卡: only one bought before PASS_SPLIT_AT — it keeps what it came with until it ends.
 */
export const flowRightsOf = (sub: Pick<SubscriptionRow, "stripe_subscription_id" | "created_at"> | null | undefined): boolean =>
  !!sub && (!isPassSubscription(sub.stripe_subscription_id) || sub.created_at < PASS_SPLIT_AT);

export async function syncSubscription(stripeSubscriptionId: string, customerId?: number | null): Promise<SubscriptionRow | null> {
  if (isLocalSubscription(stripeSubscriptionId)) return subscriptionByStripeId(stripeSubscriptionId);
  let s: StripeSubscription;
  try {
    s = await getSubscription(stripeSubscriptionId);
  } catch (e) {
    // 09-23: settle a vanished subscription wherever it is found, not only in the cron — the account page's
    // own re-read hit the same 404 on every view (Neil: 「stripe api 时不时的会有报错」)
    if (e instanceof Error && /resource_missing|No such subscription/i.test(e.message)) {
      markSubscriptionGone(stripeSubscriptionId);
      recordOps("sub_gone", `${stripeSubscriptionId} 不在 Stripe 了，标记为已取消`);
      return subscriptionByStripeId(stripeSubscriptionId);
    }
    throw e;
  }
  return mirrorSubscription(s, customerId);
}

/** Cron: re-read every live subscription that has not been synced today or whose period rolled over. */
export async function refreshStaleSubscriptions(): Promise<number> {
  const rows = staleSubscriptions(24 * 3_600_000);
  let n = 0;
  for (const r of rows) {
    try {
      await syncSubscription(r.stripe_subscription_id, r.customer_id);
      n += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      // 09-22: a subscription Stripe no longer has (a sandbox leftover from
      // before we went live) came back 404 on every heartbeat, for ever.
      if (/resource_missing|No such subscription/i.test(msg)) {
        markSubscriptionGone(r.stripe_subscription_id);
        recordOps("sub_gone", `${r.stripe_subscription_id} 不在 Stripe 了，标记为已取消`);
        continue;
      }
      recordOps("sub_sync_fail", `${r.stripe_subscription_id}: ${msg}`);
    }
  }
  return n;
}

/**
 * Spend one allowance unit on a cast. Returns the pseudo-session id the
 * reading page understands (sub_<token>), or the reason it cannot.
 */
export async function redeemSubscription(customerId: number, tier: Tier, input: ReadingInput & { locale: Locale; bs?: string }):
  Promise<{ ok: true; sid: string } | { ok: false; reason: "no_subscription" | "deep_exhausted" | "light_exhausted" | "cap_day" | "cap_rate" }> {
  // 09-29 (before the exhausted checks — a retry on the last unit must still land): the same cast asked again (double tap / retry) gets the unit it already has, not a second one
  const again = recentSubUseForCast(customerId, tier, Number(input.castAtMs), (input.values ?? []) as number[]);
  if (again) return { ok: true, sid: `sub_${again.token}` };
  const ent = await entitlementFor(customerId);
  if (!ent.active) return { ok: false, reason: "no_subscription" };
  if (ent.unlimited && !ent.comp) {
    // 10-22 通卡: no allowance — the fair-use fuse (one line per Taipei day per kind, a rate per minute); a complimentary
    // membership (our own test accounts, gifts) keeps no fuse
    const ref = `${Number(input.castAtMs)}:${(input.values ?? []).join("")}`;
    const v = capCheck(customerId, "cast", { member: !!ent.member, ref });
    if (!v.ok) return { ok: false, reason: v.why === "rate" ? "cap_rate" : "cap_day" };
    capSpend(customerId, "cast", ref);
  } else if (!ent.unlimited) {
    if (tier === "deep" && ent.deepLeft <= 0) return { ok: false, reason: "deep_exhausted" };
    if (tier === "one" && ent.lightLeft <= 0) return { ok: false, reason: "light_exhausted" };
  }
  const sub = latestSubscription(customerId)!;
  const token = randomBytes(18).toString("hex");
  // 09-29 会员增购包: the period's own allowance first; once it is gone, the unit comes out of a bought pack
  const fromPack = !ent.unlimited && tier === "deep" && !ent.comp && (ent.packLeft ?? 0) > 0 && ent.deepLeft - (ent.packLeft ?? 0) <= 0;
  createSubUse({ subscriptionId: sub.id, customerId, tier, locale: input.locale, token, inputJson: JSON.stringify(input), fromPack });
  return { ok: true, sid: `sub_${token}` };
}
