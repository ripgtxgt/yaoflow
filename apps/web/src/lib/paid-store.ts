import type { LineValue } from "@yaoflow/engine";
import { isReaderRegister } from "./register";
import { parseOdds, parseSituation } from "./situation";
import { asLocale, type Locale } from "./locales";
import { getCheckoutSession, getPaymentIntent, walletEmailOf } from "./stripe";
import type { QianRef, ReadingInput, Tier } from "./reading";
import { isQianSet, QIAN_SET, QIAN_TOKEN_RE } from "./qian-meta";
import { isPreRef } from "./pre-cast";
import type { AnyReading } from "./generate";
import { parseScaleHint, parseTopicHint } from "./hints";
import { customerEmailById, giftByToken, grantByRedeemSession, referralByRedeemSession, subUseByToken, type GrantKind } from "./db";

/**
 * Per-instance cache of verified paid sessions and their generated readings.
 * Source of truth stays with Stripe (session metadata); this only avoids
 * re-verification and re-generation on refresh. Safe to lose on restart.
 */

export interface PaidRecord {
  tier: Tier;
  /** 10-22 通卡 bought together with this reading: 1 / 7 / 30 (the pass row is made from the same session) */
  passDays?: 1 | 7 | 30;
  /** the language the reading is written in — the question's, not the page's (09-17) */
  locale: Locale;
  /** the page they were browsing when they cast, for links in mail sent later */
  pageLocale?: Locale;
  input: ReadingInput;
  reading?: AnyReading;
  verifiedAt: number;
  /** buyer email from Stripe, used to build the customer record */
  email?: string | null;
  amountCents?: number | null;
  currency?: string | null;
  /** share code that referred this buyer (first touch), from checkout metadata */
  via?: string | null;
  /** true when this "session" is a referral reward being redeemed, not a Stripe payment */
  reward?: boolean;
  /** true when a subscription allowance paid for this reading */
  subscription?: boolean;
  /** the account that owns this reading, when known up front (reward / subscription) */
  customerId?: number | null;
  /** the deep reading was sold at the first-time (light) price */
  firstDeep?: boolean;
  /** 10-02: a member's extra full reading at the light price (their period's own were used up) */
  memberAddon?: boolean;
  /** 09-25: Terms date from checkout metadata */
  tosVer?: string | null;
  /** the painted door (PAYWALL=gift): delivered free after a tap on a priced button */
  gift?: boolean;
  /** a grant someone else's action earned (裂变 V1): a friend's gifted cast, or a newcomer's free light reading */
  grantKind?: GrantKind;
  /** Stripe PaymentIntent behind a real payment (refunds are issued against it) */
  paymentIntent?: string | null;
  /** 09-22: why this currency, and what we saw when we decided — so the answer
   *  to "why was a Hong Kong buyer charged CNY" lives in our own database. */
  curSrc?: string | null;
  tzName?: string | null;
  edgeCountry?: string | null;
  /** 09-23: the ?c= promotion tag and browser session the buyer arrived with */
  campaign?: string | null;
  browserSid?: string | null;
  /** 09-23: they left the launch box ticked at checkout */
  notify?: boolean;
  /** what that button said, in `currency`'s minor unit — the intent, not a charge */
  amountShown?: number | null;
  /** the light reading this deep gift upgraded in place, as a session id (09-18) */
  upgradedFrom?: string | null;
}

const STORE = new Map<string, PaidRecord>();
const TTL = 24 * 3_600_000;
// the cache is a convenience, not the record (SQLite is): cap it so a long-lived
// process never grows without bound — oldest entries go first (09-15)
const STORE_MAX = 2_000;
function remember(sid: string, rec: PaidRecord): void {
  STORE.delete(sid);
  STORE.set(sid, rec);
  while (STORE.size > STORE_MAX) {
    const oldest = STORE.keys().next().value;
    if (oldest === undefined) break;
    STORE.delete(oldest);
  }
}

/** A stored input_json, with a locale beside the reading fields. */
type StoredInput = ReadingInput & { locale?: string; pageLocale?: string; bs?: string };
/** 10-02: the claimer's browser tab, stored with the claim (lib/browser-session.ts) — the order joins its events by it */
const bsOf = (input: StoredInput): string | null => (typeof input.bs === "string" && /^[a-z0-9]{6,24}$/.test(input.bs) ? input.bs : null);

/**
 * The reading input out of a stored record. Whitelisted field by field so a
 * stray key in the JSON never reaches the prompt — which is exactly how the
 * 09-18 Cantonese register got lost: `register` (and `prior`) were written
 * into input_json at checkout and dropped here, so every gift reading came
 * back in standard written Chinese. Both ride through now.
 */
function pickInput(input: StoredInput): ReadingInput {
  const prior = input.prior;
  const priorOk = prior && typeof prior === "object"
    && typeof prior.question === "string" && typeof prior.at === "number"
    && typeof prior.hex === "string" && typeof prior.call === "string";
  return {
    question: input.question,
    values: input.values,
    castAtMs: input.castAtMs,
    tzOffsetMinutes: input.tzOffsetMinutes,
    scaleHint: input.scaleHint,
    topicHint: input.topicHint,
    situation: input.situation,
    ...(parseOdds(input.teaserOdds) ? { teaserOdds: parseOdds(input.teaserOdds) } : {}),
    ...(isReaderRegister(input.register) ? { register: input.register } : {}),
    ...(priorOk ? { prior: { question: prior.question, at: prior.at, hex: prior.hex, call: prior.call, ...(prior.outcome === "hit" || prior.outcome === "miss" ? { outcome: prior.outcome } : prior.outcome === "partial" ? { outcome: "miss" as const } : {}) } } : {}),
    // the free line the cast page showed (09-19): the reading opens with it
    ...(typeof input.teaser === "string" && input.teaser.trim() ? { teaser: input.teaser.trim().slice(0, 200) } : {}),
    // 10-12 解籤: the lot this cast follows
    ...(qianOk(input.qian) ? { qian: { token: input.qian.token, num: input.qian.num, temple: typeof input.qian.temple === "string" ? input.qian.temple.slice(0, 40) : null, ...(isQianSet(input.qian.set) && input.qian.set !== QIAN_SET ? { set: input.qian.set } : {}) } } : {}),
    // 10-17 承接: the 擲筊 / tarot spread this cast follows
    ...(isPreRef(input.pre) ? { pre: { kind: input.pre.kind, token: input.pre.token } } : {}),
    // 10-22 分開 (lib/solo.ts): the reader said this cast is a new matter
    ...(input.solo === true ? { solo: true } : {}),
  };
}

const qianOk = (q: unknown): q is QianRef => !!q && typeof q === "object" && typeof (q as QianRef).token === "string" && QIAN_TOKEN_RE.test((q as QianRef).token)
  && Number.isInteger((q as QianRef).num) && (q as QianRef).num >= 1 && (q as QianRef).num <= 100;

function parseMetadata(md: Record<string, string>): { tier: Tier; locale: Locale; pageLocale?: Locale; input: ReadingInput } | null {
  try {
    const values = md.values?.split(",").map((x) => Number(x)) ?? [];
    if (values.length !== 6 || !values.every((v) => [6, 7, 8, 9].includes(v))) return null;
    return {
      tier: md.tier === "deep" ? "deep" : "one",
      locale: asLocale(md.locale),
      pageLocale: md.pageLocale ? asLocale(md.pageLocale) : undefined,
      input: {
        question: md.question ?? "",
        values: values as LineValue[],
        castAtMs: Number(md.castAtMs) || Date.now(),
        tzOffsetMinutes: Number(md.tz) || 0,
        scaleHint: parseScaleHint(md.scale),
        topicHint: parseTopicHint(md.topic),
        situation: parseSituation(md.sit),
        ...(parseOdds(md.todds) ? { teaserOdds: parseOdds(md.todds) } : {}),
        // Stripe metadata carries the register (not `prior`: the 500-char cap)
        ...(isReaderRegister(md.register) ? { register: md.register } : {}),
        ...(md.teaser ? { teaser: md.teaser.slice(0, 200) } : {}),
        // 10-12 解籤: "token:num" (+ ":set" for a set other than 六十甲子籤)
        ...(/^[0-9a-f]{24}:\d{1,3}(:[a-z-]{2,20})?$/.test(md.qian ?? "") && qianOk({ token: md.qian!.split(":")[0], num: Number(md.qian!.split(":")[1]) })
          ? { qian: { token: md.qian!.split(":")[0]!, num: Number(md.qian!.split(":")[1]), temple: md.qtemple ?? null, ...(isQianSet(md.qian!.split(":")[2]) ? { set: md.qian!.split(":")[2] } : {}) } } : {}),
        // 10-17 承接: "jb:<token>" | "tarot:<token>"
        ...(/^(jb|tarot):[0-9a-f]{24}$/.test(md.pre ?? "") ? { pre: { kind: md.pre!.split(":")[0] as "jb" | "tarot", token: md.pre!.split(":")[1]! } } : {}),
        // 10-22 分開: "1" when the reader said this cast is a new matter
        ...(md.solo === "1" ? { solo: true } : {}),
      },
    };
  } catch {
    return null;
  }
}

/** Verify a checkout session is paid and return (cached) record. */
export async function verifyPaidSession(sid: string): Promise<PaidRecord | null> {
  const hit = STORE.get(sid);
  if (hit && Date.now() - hit.verifiedAt < TTL) return hit;

  // a subscription allowance spent on a cast: the account's email, no charge
  if (sid.startsWith("sub_")) {
    const use = subUseByToken(sid.slice(4));
    if (!use) return null;
    try {
      const input = JSON.parse(use.input_json) as StoredInput;
      const rec: PaidRecord = {
        tier: use.tier === "deep" ? "deep" : "one",
        locale: asLocale(input.locale ?? use.locale),
        pageLocale: input.pageLocale ? asLocale(input.pageLocale) : undefined,
        input: pickInput(input),
        verifiedAt: Date.now(),
        email: customerEmailById(use.customer_id),
        amountCents: 0,
        currency: null,
        subscription: true,
        customerId: use.customer_id,
        browserSid: bsOf(input),
      };
      remember(sid, rec);
      return rec;
    } catch {
      return null;
    }
  }

  // a redeemed referral reward looks like a paid session to everything downstream
  if (sid.startsWith("rw_")) {
    const ref = referralByRedeemSession(sid);
    if (!ref || !ref.input_json) return null;
    try {
      const input = JSON.parse(ref.input_json) as StoredInput;
      const rec: PaidRecord = {
        tier: "deep",
        locale: asLocale(input.locale),
        pageLocale: input.pageLocale ? asLocale(input.pageLocale) : undefined,
        input: pickInput(input),
        verifiedAt: Date.now(),
        email: customerEmailById(ref.referrer_customer_id),
        amountCents: 0,
        currency: null,
        reward: true,
        customerId: ref.referrer_customer_id,
        browserSid: bsOf(input),
      };
      remember(sid, rec);
      return rec;
    } catch {
      return null;
    }
  }

  // 送一卦 / 双边推荐: a grant redeemed on a cast. Downstream it is a reward —
  // no charge, no referral credit, the claimant's own email if they left one.
  if (sid.startsWith("gr_")) {
    const g = grantByRedeemSession(sid);
    if (!g || !g.input_json) return null;
    try {
      const input = JSON.parse(g.input_json) as StoredInput;
      const rec: PaidRecord = {
        tier: g.tier === "deep" ? "deep" : "one",
        locale: asLocale(input.locale ?? g.locale),
        pageLocale: input.pageLocale ? asLocale(input.pageLocale) : undefined,
        input: pickInput(input),
        verifiedAt: Date.now(),
        email: g.claimed_email ?? (g.claimed_customer_id ? customerEmailById(g.claimed_customer_id) : null),
        amountCents: 0,
        currency: null,
        via: g.via,
        reward: true,
        grantKind: g.kind,
        customerId: g.claimed_customer_id,
        browserSid: bsOf(input),
      };
      remember(sid, rec);
      return rec;
    } catch {
      return null;
    }
  }

  // the painted door: a priced button tapped during the promotion test — the
  // tap was the intent, the reading is the gift; nothing was charged
  if (sid.startsWith("gf_")) {
    const g = giftByToken(sid.slice(3));
    if (!g) return null;
    try {
      const input = JSON.parse(g.input_json) as StoredInput;
      const rec: PaidRecord = {
        tier: g.tier === "deep" ? "deep" : "one",
        locale: asLocale(input.locale ?? g.locale),
        pageLocale: input.pageLocale ? asLocale(input.pageLocale) : undefined,
        input: pickInput(input),
        verifiedAt: Date.now(),
        email: g.email ?? (g.customer_id ? customerEmailById(g.customer_id) : null),
        amountCents: 0,
        currency: g.currency,
        via: g.via,
        gift: true,
        amountShown: g.amount_shown,
        firstDeep: g.first_deep === 1,
        customerId: g.customer_id,
        upgradedFrom: g.upgraded_from ? `gf_${g.upgraded_from}` : null,
        browserSid: bsOf(input),
      };
      remember(sid, rec);
      return rec;
    } catch {
      return null;
    }
  }

  // 09-26 钱包直付: a PaymentIntent paid with Apple Pay / Google Pay on our own page — same metadata as a session
  if (sid.startsWith("pi_")) {
    const pi = await getPaymentIntent(sid);
    if (pi.status !== "succeeded" || pi.metadata?.kind !== "wallet") return null;
    const parsed = parseMetadata(pi.metadata ?? {});
    if (!parsed) return null;
    const md = pi.metadata;
    const rec: PaidRecord = {
      ...parsed,
      verifiedAt: Date.now(),
      // the address we chose at payment time (account / typed first), else the wallet's contact address
      email: pi.receipt_email ?? walletEmailOf(pi),
      amountCents: pi.amount_received ?? null,
      currency: pi.currency ?? null,
      via: /^[6789]{6}$/.test(md.via ?? "") ? md.via! : null,
      firstDeep: md.first_deep === "1",
      memberAddon: md.member_addon === "1",
      tosVer: md.tos ?? null,
      paymentIntent: pi.id,
      customerId: md.cust ? Number(md.cust) || null : null,
      curSrc: md.cur_src ?? null,
      tzName: md.tzname ?? null,
      edgeCountry: md.country ?? null,
      campaign: md.c ?? null,
      browserSid: md.bs ?? null,
      notify: md.notify === "1",
    };
    remember(sid, rec);
    return rec;
  }

  const session = await getCheckoutSession(sid);
  if (session.payment_status !== "paid") return null;
  const parsed = parseMetadata(session.metadata ?? {});
  if (!parsed) return null;
  const rec: PaidRecord = {
    ...parsed,
    verifiedAt: Date.now(),
    email: session.customer_details?.email ?? null,
    amountCents: (session as { amount_total?: number }).amount_total ?? null,
    currency: (session as { currency?: string }).currency ?? null,
    via: /^[6789]{6}$/.test(session.metadata?.via ?? "") ? session.metadata!.via! : null,
    firstDeep: session.metadata?.first_deep === "1",
    memberAddon: session.metadata?.member_addon === "1",
    tosVer: session.metadata?.tos ?? null,
    paymentIntent: typeof session.payment_intent === "string" ? session.payment_intent : null,
    // 09-22: the account that was signed in when they paid. Stripe's own email
    // is for the receipt and is not always the same person's address, so this
    // decides who the order belongs to — see the reading page.
    customerId: session.metadata?.cust ? Number(session.metadata.cust) || null : null,
    curSrc: session.metadata?.cur_src ?? null,
    tzName: session.metadata?.tzname ?? null,
    edgeCountry: session.metadata?.country ?? null,
    campaign: session.metadata?.c ?? null,
    browserSid: session.metadata?.bs ?? null,
    notify: session.metadata?.notify === "1",
    // 10-22 通卡 bought with this cast (lib/pass.ts): the reading page records the pass from the same session
    ...(session.metadata?.kind === "pass" && [1, 7, 30].includes(Number(session.metadata?.days)) ? { passDays: Number(session.metadata!.days) as 1 | 7 | 30 } : {}),
  };
  remember(sid, rec);
  return rec;
}

export function cacheReading(sid: string, reading: AnyReading): void {
  const rec = STORE.get(sid);
  if (rec) rec.reading = reading;
}
