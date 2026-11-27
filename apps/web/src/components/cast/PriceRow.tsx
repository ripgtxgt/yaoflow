"use client";

import type { RefObject } from "react";
import { t, type Locale } from "@/lib/i18n";
import type { Tier } from "@/lib/reading";
import { INVITE_TIER } from "@/lib/claim-tier";
import { FOLLOWUP_LIMIT } from "@/lib/followup-limit";
import { tt } from "@/lib/dict/thread";
import { mg } from "@/lib/dict/member-gift";
import { cv } from "@/lib/dict/convert";
import { PAYWALL } from "@/lib/cast-ui/words";
import type { CastMe, PriceLabels } from "@/lib/cast-ui/types";
import { includedNote } from "@/lib/upgrade-panel";

/**
 * 10-22 进度表 76 (CastFlow 拆分): the price row under the free line — one button per tier on offer (the light reading,
 * the full one; a pair cast or an aftermath cast shows its one), each saying what it gives and what it costs this
 * reader (first price, member, pack, invite, gift). 09-28 (p1): a first-timer sees one price, the light reading
 * becomes a line of type under it. The tap goes back to CastFlow, which knows how to fulfil it.
 */
export default function PriceRow({ locale, me, price, tiers, onePrice, activeTier, aiLoading, qChecking, x1Copy, pairActive, afterActive, reward, gift, freeEligible, onPick, rowRef }: {
  locale: Locale;
  me: CastMe | null;
  price: PriceLabels;
  /** the tiers on offer, in order */
  tiers: readonly Tier[];
  /** 09-28 p1: the one-price arm — the light reading as a line of type under the full one */
  onePrice: boolean;
  activeTier: Tier | null;
  aiLoading: Tier | null;
  qChecking: boolean;
  /** 10-02 x1: what each gives, not whose voice */
  x1Copy: boolean;
  pairActive: boolean;
  afterActive: boolean;
  /** a 回访奖励 link / a friend's gift link opened this page */
  reward: boolean;
  gift: boolean;
  freeEligible: boolean;
  onPick: (tier: Tier) => void;
  rowRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div ref={rowRef} className={`grid gap-3 ${onePrice ? "" : "md:grid-cols-2"}`} data-ab-price={onePrice ? "one" : "two"}>
      {tiers.map((tier) => {
        const on = activeTier === tier;
        return (
          <button
            key={tier}
            data-heat={`price-${tier}`}
            onClick={() => onPick(tier)}
            disabled={aiLoading !== null || qChecking}
            className={`text-left rounded-[2px] p-[var(--s-4)] border transition-colors
                        disabled:opacity-50 min-h-[var(--s-6)] ${
                          on
                            ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"
                            : "border-[var(--ink-16)] hover:border-[var(--ink-45)]"
                        }`}
          >
            <p className="t-body !text-[15px] mb-1">
              {aiLoading === tier
                ? t(locale, "aiLoading")
                : x1Copy
                  ? cv(locale, tier === "one" ? "btnOne" : "btnDeep") /* 10-02 x1: what each gives, not whose voice */
                  : t(locale, tier === "one" ? "btnOne" : "btnDeep")}
            </p>
            <p className={`t-small ${on ? "!text-[var(--paper-66)]" : "!text-[var(--ink-45)]"}`}>
              {pairActive
                ? t(locale, "pairCastNote")
                : tier === "one" && afterActive
                ? t(locale, "afterOneNote")
                : tier === "deep" && reward
                ? t(locale, "rewardDeepNote")
                : tier === "deep" && gift
                  ? t(locale, "giftCastDeepNote")
                : tier === INVITE_TIER && PAYWALL && me?.inviteFree && !me.entitlement?.active
                  ? t(locale, "inviteOneNote")
                : tier === "one" && freeEligible
                  ? tt(locale, "freeOneNote")
                : PAYWALL && me?.entitlement?.active
                  /* 10-23 进度表 96 ④: under the 通卡 model — the pass's end or 「會員不限次」, never 「本月 N 次」;
                     10-24 (Neil: 「会员是会员，通卡是通卡」): the light reading too — a pass holder was told 「會員已含」 */
                  ? includedNote({ deepLeft: me.entitlement.deepLeft, deepTotal: me.entitlement.deepTotal, packLeft: me.entitlement.packLeft ?? 0, unlimited: me.entitlement.unlimited, pass: me.entitlement.pass, passDays: me.entitlement.passDays, periodEnd: me.entitlement.periodEnd }, locale)
                    ?? (tier === "one" ? t(locale, "subIncluded") : me.entitlement.deepLeft > 0
                      /* 09-22: this used to read 「本月还剩 N 次」 — a counter
                         ticking down on the very thing they pay for, so members
                         rationed it and spent the unlimited light readings instead
                         (会员兑换 深断 7 / 轻解读 12, while everyone else clicked
                         deep 70 to light 24). Say what is included, not what is left. */
                      ? (me.entitlement.packLeft ?? 0) > 0 && me.entitlement.deepLeft - (me.entitlement.packLeft ?? 0) <= 0
                        ? mg(locale, "packUsing", { n: me.entitlement.packLeft ?? 0 }) /* 09-29: the period's own are gone — this one comes from the bought pack */
                        : t(locale, "subIncludedDeep", { used: Math.max(0, me.entitlement.deepTotal - (me.entitlement.deepLeft - (me.entitlement.packLeft ?? 0))) })
                      : t(locale, "subExhausted", { price: price.one })) /* 09-24 M2: a member's extra deep reading costs the light price */
                  : PAYWALL && x1Copy
                    /* 10-02 x1: the light reading says what it leaves out; the full one names its three things and the follow-ups */
                    ? tier === "deep" && me?.firstDeep
                      ? cv(locale, "payDeepFirst", { price: price.one, full: price.deep, n: FOLLOWUP_LIMIT })
                      : cv(locale, tier === "one" ? "payOne" : "payDeep", { price: tier === "one" ? price.one : price.deep, n: FOLLOWUP_LIMIT })
                  : PAYWALL
                    ? tier === "deep" && me?.firstDeep
                      ? t(locale, "payDeepFirstNote", { price: price.one, full: price.deep })
                      : t(locale, tier === "one" ? "payOneNote" : "payDeepNote", { price: tier === "one" ? price.one : price.deep })
                    : t(locale, tier === "one" ? "tierOneNote" : "tierDeepNote")}
            </p>
          </button>
        );
      })}
      {onePrice && (
        <button type="button" onClick={() => onPick("one")} disabled={aiLoading !== null || qChecking} data-heat="price-one-link"
          className="text-left t-small !text-[var(--ink-66)] underline underline-offset-4 decoration-[var(--ink-16)] hover:decoration-current disabled:opacity-50 -mt-1">
          {aiLoading === "one" ? t(locale, "aiLoading") : tt(locale, "lightLink", { price: price.one })}
        </button>
      )}
    </div>
  );
}
