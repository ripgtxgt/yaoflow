/**
 * The membership's shape, client-safe (no db, no Stripe): what the cast page
 * needs to label its buttons. Server-side rules live in subscription.ts and
 * read the same numbers.
 */
/** follow-up questions a member gets per full reading, and gift readings minted per month (09-26: moved here so the page can show them) */
/** 09-29 「一件事」: 10 → 30. 41% of full readings ran into the old cap; the pacing is the prompt's job now (lib/followup-state.ts), the number is only a fair-use ceiling. */
export const MEMBER_FOLLOWUP_LIMIT = 30;
export const GIFT_POOL_PER_MONTH = 5;
export const DEEP_PER_MONTH = Number(process.env.NEXT_PUBLIC_SUB_DEEP_PER_MONTH ?? 10);

export interface Entitlement {
  active: boolean;
  status: string | null;
  plan: "month" | "year" | null;
  periodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  deepLeft: number;
  deepTotal: number;
  lightLeft: number;
  resetsAt: number | null;
  stripeCustomerId: string | null;
  /** 09-24: a complimentary membership (comp_…): no caps, no renewal, nothing to manage in Stripe */
  comp?: boolean;
  /** 09-26 会员单月: a one-off 30-day membership (pass_…) — same allowance, never renews */
  pass?: boolean;
  /** 09-29 会员裂变: of deepTotal, how many friends' claims / shares added this period */
  friendBonus?: number;
  /** 09-29 会员增购包: bought units still unspent (already inside deepLeft), and whether another pack may be bought now */
  packLeft?: number;
  packBuyable?: boolean;
  /** the currency the membership is paid in — a pack is charged in it too */
  subCurrency?: string | null;
  /** 10-02: what each pack costs this member right now (null = cannot be bought now), and their single extras this period */
  packQuotes?: { small: PackQuote | null; large: PackQuote | null };
  singlesThisPeriod?: number;
  /** 09-30 续订专属: renewal is on (or grandfathered) — carry-over, the gift pool and top-up packs are live */
  renewing?: boolean;
  /** of deepTotal, how many unused readings carried over from the previous period (own, not friends') */
  carried?: number;
  /** 10-22 通卡: a renewing (or complimentary) membership — the 會員 perks; false for a 通卡 */
  member?: boolean;
  /** 10-22 通卡: the pass's length when `pass` is true (an old one-off month counts as 30) */
  passDays?: 1 | 7 | 30;
  /** 10-22 通卡: the 通卡 model is live — readings are not counted against a monthly allowance, only the fair-use caps */
  unlimited?: boolean;
}

/** 09-29 会员增购包: 15 per pack, at most 2 bought per allowance period, at most 20 unspent held. */
export const PACK_UNITS = 15;
export const PACK_MAX_PER_PERIOD = 2;
export const PACK_BANK_MAX = 20;
/** 10-02 小包: 5 per small pack; the two limits above count packs of either size */
export const PACK_SMALL_UNITS = 5;
/** 10-02 单买抵扣: from this many single extras in a period, the cast page and the reading say the large pack can take them in */
export const PACK_NUDGE_SINGLES = 3;

/**
 * 10-02: one pack as this member would buy it now. A large pack bought before any other large pack this period takes in
 * the period's single extras and small packs (same currency): it costs the difference and adds the readings still
 * missing from 15 — the singles already were readings.
 */
export interface PackQuote {
  size: "small" | "large";
  /** readings this purchase adds */
  units: number;
  /** what it costs now, in `currency`'s minor unit */
  minor: number;
  currency: string;
  /** the pack's own price and size */
  fullMinor: number;
  fullUnits: number;
  /** what this period's singles and small packs take off, and how many readings they already were (large only) */
  creditMinor: number;
  creditUnits: number;
  /** of those, single extras (the rest came from small packs) */
  creditSingles: number;
}

/**
 * 09-30 续订专属 (Neil: 「如果都这样操作的话，那349的一次性会员都卖不出去了」→「好，都做吧」).
 * A month bought at 269 and cancelled at once was the 349 one-off month for less. Three things now belong to a
 * membership that renews, and stop the moment renewal is turned off (the period's own allowance stays to the end):
 *   - up to OWN_CARRY_MAX unused full readings carry into the next period (friends' thank-yous carry as before)
 *   - the monthly gift pool (送朋友一卦)
 *   - buying a top-up pack
 * The one-off month (pass_) has none of them, from PASS_PERKS_UNTIL on; passes bought before keep what they bought.
 * Subscriptions whose renewal was already off before the rule keep them too (renew_off_at = 1, see db.ts).
 */
export const OWN_CARRY_MAX = 5;

/**
 * 10-02 (Neil: 「2，3 都做吧」): a member keeps at most this many published-case rewards for themselves per allowance
 * period (one more full reading each); beyond it, a case's reward can still go to a friend. Rewards already kept stay.
 */
export const CASE_SELF_DEEP_PER_PERIOD = 5;
export const PASS_PERKS_UNTIL = Date.UTC(2026, 8, 30, 8, 0); // 2026-09-30 16:00 UTC+8

/**
 * 10-22 进度表 92 通卡／會員分開 (Neil: 「每天的这些产品只给到会员，然后八字，紫微斗数，星盘也要区分」→「好的，确认」):
 * 通卡 covers 這件事 and 這張盤 — the 問事 tools and a chart's natal chapters; 會員 covers 每天 and 跟著時間走 — 今日一籤
 * in full, 你的今天, 擇日／黃曆 read against your own chart, the 運勢 chapters (大運、大限、本月行運) and their monthly
 * rewrite. A pass bought before this moment keeps what it came with until it ends; a report written before it stays whole.
 */
export const PASS_SPLIT_AT = Date.UTC(2026, 9, 22, 16, 0); // 2026-10-23 00:00 UTC+8 — every pass bought on 10-22 or earlier keeps the old rights
