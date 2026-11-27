import { sst } from "@/lib/dict/share-story";
import type { Metadata } from "next";
import { grantByRedeemSession, orderBySession } from "@/lib/db";
import { isReviewSession } from "@/lib/review-links";
import SentTo from "@/components/SentTo";
import { SENDTO_WINDOW_MS } from "@/lib/reading-mail";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveServerChart, pick } from "@/lib/reading";
import { generateReadingFor } from "@/lib/generate";
import { maybeGrantReferral, notifyGiftUsed, notifyShareUsed } from "@/lib/referral";
import { paywallOn, giftEmailRequired } from "@/lib/paywall";
import { cacheReading, verifyPaidSession } from "@/lib/paid-store";
import { fulfilPassBySid } from "@/lib/pass";
import { record } from "@/lib/analytics-server";
import {
  addOrderToCustomer, setMarketingConsent, castIdForSession, emailAlreadySent, followupBonus, followupsForCast, giftByToken, giftUpgradeOf, revisitBySession,
  readingBodyForSession, recordEmail, recordOrder, saveCast, saveReading,
  scheduleRevisit, storedReadingForSession, upsertCustomer, noteAlternateEmail, customerHasPaidDeep, recordOps, endPaySessionsOnForeign, emailHasPaidDeep } from "@/lib/db";
import { asLocale } from "@/lib/locales";
import { localDay } from "@/lib/clock";
import type { PaidRecord } from "@/lib/paid-store";
import type { LineValue } from "@yaoflow/engine";
import { buildReadingEmail, sendEmail } from "@/lib/email";
import { revisitWindow } from "@/lib/revisit";
import { classifyTopic, TOPIC_NAMES, type Topic } from "@/lib/topic";
import { toHans } from "@/lib/hant";
import { isLocale, t, type Locale } from "@/lib/i18n";
import { chineseLabels, hexName } from "@/lib/names";
import { guaSlug } from "@/lib/gua";
import ReadingArticle from "@/components/ReadingArticle";
import GenRetry from "@/components/GenRetry";
import TimingTimeline from "@/components/TimingTimeline";
import { buildTimeline } from "@/lib/timeline";
import UpgradePanel from "@/components/UpgradePanel";
import ThreadMark from "@/components/ThreadMark";
import FollowupChat from "@/components/FollowupChat";
import { FOLLOWUP_LIMIT } from "@/lib/followup-limit";
import ShareCard from "@/components/ShareCard";
import ShareMoment from "@/components/ShareMoment";
import ShareCardMoment from "@/components/ShareCardMoment";
import { ssh } from "@/lib/dict/share-sheet";
import { windowLabel } from "@/lib/share-card";
import GiftCastPanel from "@/components/GiftCastPanel";
import PairPanel, { type PairState } from "@/components/PairPanel";
import CasePanel, { type CaseState } from "@/components/CasePanel";
import SealPanel from "@/components/SealPanel";
import { outcomeUrl, proofUrl, sealUrl } from "@/lib/outcome-token";
import { casePath, CASE_FIELD_LABELS, publicFields } from "@/lib/cases";
import { caseRewardable, caseRewardView } from "@/lib/case-reward";
import { caseImpact } from "@/lib/case-impact";
import { canInvite, isTwoParty, pairLink, pairPagePath, pairStatus } from "@/lib/pairs";
import { caseBySession, pairBySession, sessionTzName } from "@/lib/db";
import { castOfSession, readingHadContext, rereadState, unsplitOffer } from "@/lib/reread";
import { RereadForm, RereadWait, SplitForm, UnsplitForm } from "@/components/Reread";
import MoreActions, { MoreItem } from "@/components/MoreActions";
import GuaranteePanel from "@/components/GuaranteePanel";
import { guaranteeCheck } from "@/lib/db";
import { rememberCardFp } from "@/lib/card-fp";
import { formatMoney, priceMinor, tongkaMinor, type Currency } from "@/lib/money";
import { creditCurrency, upgradeCredit } from "@/lib/upgrade-credit";
import { firstT } from "@/lib/dict/first-month";
import { tt } from "@/lib/dict/thread";
import FigureMark, { changedYangs, primaryYangs } from "@/components/FigureMark";
import FirstDeepMark from "@/components/FirstDeepMark";
import PayLogin from "@/components/PayLogin";
import PackBuy from "@/components/PackBuy";
import { PACK_NUDGE_SINGLES } from "@/lib/sub-plan";
import { currentCustomer } from "@/lib/auth";
import { entitlementFor, tongkaForAll } from "@/lib/subscription";
import { CURRENCY_COOKIE, DEFAULT_CURRENCY, detectCurrency, FIRST_DEEP_COOKIE, isCurrency, priceLabels } from "@/lib/money";
import { cookies as reqCookies, headers as reqHeaders } from "next/headers";
import { ADMIN_COOKIE, isAdmin } from "@/lib/admin-auth";
import { featureVisible } from "@/lib/features";
import { firstPassEligible } from "@/lib/pass";
import { countReadingView } from "@/lib/db";
import { edgeCountry as edgeCountryOf } from "@/lib/geo";
import ProgressLog from "@/components/ProgressLog";
import ThreadPanel, { SubReturnPanel } from "@/components/ThreadPanel";
import { activeDaysForCustomer, myReferralStats, shareRefForSession, castsInMatter, castsTodayInMatter, PAUSE_AT, customerForReadingSession, customerIdByEmail, matterById, matterForSession, latestSubscription, progressNotesForCast, threadCastsForCustomer } from "@/lib/db";
import { collapseUpgrades, matterOf } from "@/lib/matters";
import { MEMBER_NOTE_LIMIT, NOTE_LIMIT, noteGate } from "@/lib/progress";
import PromoStrip from "@/components/PromoStrip";
import RevisitPlan from "@/components/RevisitPlan";
import CrossCards from "@/components/CrossCards";
import { isLostThing } from "@/lib/lost-words";
import LoveBridge from "@/components/LoveBridge";
import ResultPage from "@/components/product/ResultPage";
import { activeMembership, giftPoolFor, MEMBER_FOLLOWUP_LIMIT } from "@/lib/membership";
import HomeScreenCard from "@/components/HomeScreenCard";
import { fileCast, resolveSessionMatter } from "@/lib/matter-assign";
import { attachQianCast, subUseIsPass } from "@/lib/db";
import { attachPreCast } from "@/lib/pre-cast";
import { matterOptsFor, matterSoFar } from "@/lib/matter-context";
import { withCastThread } from "@/lib/cast-log";
import { mt } from "@/lib/dict/matter";
import { deliveryAddress } from "@/lib/mail-to";
import { cachedQuestionInfo } from "@/lib/matter-questions";
import PauseNote from "@/components/PauseNote";
import InviteCard from "@/components/InviteCard";
import { it } from "@/lib/dict/invite";
import { mg } from "@/lib/dict/member-gift";
import { DEEP_PER_MONTH } from "@/lib/sub-plan";

export const dynamic = "force-dynamic";

/** Never index a page that contains someone's private question. */
export const metadata: Metadata = {
  title: "YaoFlow",
  robots: { index: false, follow: false, nocache: true, noarchive: true, nosnippet: true },
  referrer: "no-referrer",
};

export default async function PaidReadingPage(
  { params, searchParams }: {
    params: Promise<{ locale: string }>;
    searchParams: Promise<{ sid?: string; ask?: string; split?: string; reread?: string; merged?: string }>;
  },
) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const l = locale as Locale;
  const { sid, ask, split, reread, merged } = await searchParams;
  // 09-26: a reply-like question sent over from the cast page waits in the follow-up box
  const askInit = typeof ask === "string" ? ask.slice(0, 300) : undefined;

  if (!paywallOn() || !sid) {
    return (
      <div className="max-w-xl mx-auto px-6 pt-24 text-center">
        <p className="opacity-60 mb-6">{t(l, "paidUnavailable")}</p>
        <Link href={`/${l}`} className="underline underline-offset-4">{t(l, "backHome")}</Link>
      </div>
    );
  }

  // A reading that already exists is served from our own records: no Stripe
  // round-trip, no "verifying payment" stage on a return visit (the account
  // page, the email link, a refresh). Only a first visit verifies the session.
  let rec: PaidRecord | null = null;
  const stored = storedReadingForSession(sid);
  // 09-27 (Neil: 「统计每个卦象页面被打开的次数，除了我从 admin 里面打开的」): one count per page render of a delivered
  // reading — not for the admin's browser, not for link scanners and crawlers (mail gateways open every link)
  if (stored) {
    const ua = (await reqHeaders()).get("user-agent") ?? "";
    const bot = !ua || /bot|crawl|spider|slurp|preview|scanner|facebookexternalhit|headless|safelinks|google-safety|microsoft office|outlook|proofpoint|mimecast|barracuda/i.test(ua);
    const admin = await isAdmin((await reqCookies()).get(ADMIN_COOKIE)?.value).catch(() => false);
    if (!bot && !admin) countReadingView(sid);
  }
  // 09-21 (Neil: 「退款之后，还可以再看到链接，还可以进行追问」): money back means the reading goes back too
  if (stored?.status === "refunded") {
    return (
      <div className="max-w-xl mx-auto px-6 pt-24 text-center">
        <p className="opacity-60 mb-6">{t(l, "paidRefunded")}</p>
        <Link href={`/${l}`} className="underline underline-offset-4">{t(l, "backHome")}</Link>
      </div>
    );
  }
  if (stored) {
    rec = {
      tier: stored.tier === "deep" ? "deep" : "one",
      locale: isLocale(stored.locale) ? stored.locale : l,
      input: { question: stored.question, values: stored.values as LineValue[], castAtMs: stored.castAtMs, tzOffsetMinutes: stored.tzOffsetMinutes },
      reading: stored.reading as PaidRecord["reading"],
      verifiedAt: Date.now(),
      email: stored.email,
      amountCents: stored.amountCents,
      currency: stored.currency,
      via: stored.via,
      reward: stored.status === "reward",
      subscription: stored.status === "subscription",
      gift: stored.status === "gift",
      customerId: stored.customerId,
      firstDeep: stored.firstDeep,
      // a deep gift that upgraded a light one in place remembers which (09-18): the browser's cast record follows it
      upgradedFrom: stored.status === "gift" && sid.startsWith("gf_") ? (() => { const g = giftByToken(sid.slice(3)); return g?.upgraded_from ? `gf_${g.upgraded_from}` : null; })() : null,
    };
  } else {
    try {
      rec = await verifyPaidSession(sid);
    } catch {
      rec = null;
    }
  }
  if (!rec) {
    return (
      <div className="max-w-xl mx-auto px-6 pt-24 text-center">
        <p className="opacity-60 mb-6">{t(l, "paidUnpaid")}</p>
        <Link href={`/${l}`} className="underline underline-offset-4">{t(l, "backHome")}</Link>
      </div>
    );
  }

  // Fulfilment may already have run — by an earlier visit before a server
  // restart, or by the background poller. The stored reading is the record;
  // never regenerate over it (a paid reading must never change).
  if (!rec.reading) {
    const stored = readingBodyForSession(sid) as typeof rec.reading | null;
    if (stored) {
      cacheReading(sid, stored);
      rec = { ...rec, reading: stored };
    }
  }

  if (!rec.reading) {
    try {
      // 09-29 「一件事」: file this reading under the reader's matter before it is written, so it can see the matter so far
      const ownerGuess = rec.customerId ?? (rec.email ? customerIdByEmail(rec.email) : null);
      const matterId = await resolveSessionMatter(sid, ownerGuess, rec.input.question, rec.input.topicHint, rec.locale, rec.input.solo).catch(() => null); // 10-22 分開: a solo cast opens its own matter
      // 10-03 起卦记录: and the free casts on the same matter before this one, read together with it (lib/cast-log.ts)
      // 10-04 进度表 30: a "today" question sees only the last 72 hours of the matter; every entry is dated
      const mo = matterOptsFor(rec.input, true);
      const soFar = withCastThread(sid, rec, matterId ? matterSoFar(matterId, { sessions: [sid] }, rec.locale, mo) : undefined, mo);
      const reading = await generateReadingFor(sid, rec.tier, soFar ? { ...rec.input, matterSoFar: soFar } : rec.input, true, rec.locale);
      cacheReading(sid, reading);
      rec = { ...rec, reading };

      // persist: customer + full cast + full reading + order
      try {
        const chart = resolveServerChart(rec.input, true);
        // 09-22: prefer the account that was signed in at checkout. A member
        // signed in as one address paid at Stripe as another (same person, two
        // addresses); the order landed on the paying address, so her account
        // never learnt she had bought a deep reading and she was handed the
        // first-time price twice. The paying address is still recorded on the
        // order and still gets the receipt — it just no longer decides whose
        // account this is.
        const customerId = rec.customerId ?? (rec.email ? upsertCustomer(rec.email, rec.locale) : null);
        // 10-02 付款后自动登录: paid without being signed in, so filed by the address alone — sessions on this address
        // that only a payment made end before anything is written (db.ts endPaySessionsOnForeign)
        if (!rec.customerId) endPaySessionsOnForeign(customerId, "reading");
        if (rec.customerId && rec.email) {
          // both known and different: keep the second address on the account so
          // a later lookup by either one finds the same person
          noteAlternateEmail(rec.customerId, rec.email);
        }
        // 10-18 (#1928 10-12: one payment, six casts and six readings): every caller waiting on the one generation used to write
        // its own copy when it woke up; the first writer links the order to its cast, everyone after it stops here
        if (castIdForSession(sid) !== null) throw new Error("already_persisted");
        const castId = saveCast({
          customerId,
          castAtMs: rec.input.castAtMs,
          tzOffsetMinutes: rec.input.tzOffsetMinutes,
          locale: rec.locale,
          question: rec.input.question,
          topic: rec.input.topicHint ?? classifyTopic(toHans(rec.input.question)),
          values: rec.input.values,
          chart: chart as unknown as Record<string, unknown>,
          tzName: sessionTzName(sid), // 09-26 客户时区
        });
        saveReading(castId, customerId, rec.tier, rec.locale, reading);
        fileCast(castId, sid, customerId, rec.input.question, rec.input.topicHint ?? classifyTopic(toHans(rec.input.question)), rec.locale, rec.input.solo);
        if (rec.input.qian) attachQianCast(rec.input.qian.token, castId); // 10-12 解籤: the lot and this cast, one matter
      attachPreCast(rec.input.pre, castId); // 10-17 承接: the 擲筊 / tarot spread and this cast, one matter
        // 09-22: the first-time price is meant to be once per person. If it was
        // handed out again, say so — we cannot re-bill, but a silent leak is
        // how it ran for two days before anyone noticed.
        if (rec.firstDeep === true && rec.tier === "deep" && customerId && customerHasPaidDeep(customerId)) {
          recordOps("first_price_leak", `cust ${customerId} ${rec.email ?? "?"} ${rec.currency ?? "?"} ${rec.amountCents ?? 0}`);
        }
        // 10-22 通卡 bought with this cast: the pass row first (idempotent), the order under the pass's own tier
        if (rec.passDays) await fulfilPassBySid(sid).catch(() => null);
        recordOrder({
          sessionId: sid,
          customerId,
          castId,
          tier: rec.passDays ? `pass_${rec.passDays}d` : rec.tier,
          amountCents: rec.amountCents ?? null,
          currency: rec.currency ?? null,
          email: rec.email ?? null,
          status: rec.subscription ? "subscription" : rec.grantKind ?? (rec.reward ? "reward" : rec.gift ? "gift" : "paid"),
          via: rec.via ?? null,
          firstDeep: rec.firstDeep === true,
          paymentIntent: rec.paymentIntent ?? null,
          curSrc: rec.curSrc ?? null,
          tzName: rec.tzName ?? null,
          edgeCountry: rec.edgeCountry ?? null,
          campaign: rec.campaign ?? null,
          browserSid: rec.browserSid ?? null,
          memberAddon: rec.memberAddon ?? false,
        });
        // 10-07 首次付费保证补洞: the payment method's identifier (lib/card-fp.ts), looked up in the background
        if (rec.amountCents && !rec.subscription && !rec.reward && !rec.gift && !rec.grantKind) rememberCardFp(sid);
        // 09-23: the launch box on the paid path — recorded against the address Stripe collected
        if (rec.notify && rec.email) setMarketingConsent(rec.email, true);
        if (customerId && rec.amountCents) addOrderToCustomer(customerId, rec.amountCents);
        // 推荐奖励: a friend's first paid reading earns the sharer a free 深断 (never for reward redemptions or painted-door gifts)
        if (!rec.reward && !rec.subscription && !rec.gift) await maybeGrantReferral({ via: rec.via, referredCustomerId: customerId, referredEmail: rec.email ?? null, referredSessionId: sid });

        // deliver by email so the link is never lost (once per session)
        // 10-30: signed in when buying → the account's address, not the one typed into Stripe (lib/mail-to.ts)
        const mailTo = deliveryAddress(rec);
        if (mailTo && !emailAlreadySent(sid, "reading")) {
          const body = reading as unknown as Record<string, Record<string, string>>;
          const head = body.verdict ?? body.summary;
          const mail = buildReadingEmail({
            locale: rec.locale,
            tier: rec.tier,
            question: rec.input.question,
            values: rec.input.values,
            hexName: hexName(chart.cast.primary, rec.locale),
            changedName: chart.cast.changed
              ? hexName(chart.cast.changed, rec.locale)
              : null,
            headline: head ? pick(head, rec.locale) : "",
            url: `${process.env.SITE_URL ?? "https://yaoflow.com"}/${l}/reading?sid=${encodeURIComponent(sid)}`,
            // 09-27 (Neil: 「改改送一卦的时机」): no gift line the minute a reading lands — before anyone knows whether it
            // was right. The offer now comes when the reader answers the revisit with "it came true".
            giftUrl: null,
            friendCastUrl: rec.grantKind === "gift_cast" ? `${process.env.SITE_URL ?? "https://yaoflow.com"}/${l}/cast?c=giftmail` : null,
            friendPass: tongkaForAll(),
          });
          const sent = await sendEmail(mailTo, mail.subject, mail.html, mail.text, { kind: "reading", sessionId: sid, customerId });
          recordEmail(sid, "reading", mailTo, sent.ok ? "sent" : "failed", sent.error ?? sent.id);
        }

        // 09-26: a friend used a 送一卦 — the giver hears it (never what was asked)
        if (rec.grantKind === "gift_cast") await notifyGiftUsed(sid);
        // 09-29: a newcomer's free first reading through someone's share — the sharer is thanked the same way
        if (rec.grantKind === "invite_light") await notifyShareUsed(sid);

        // 应期回访: schedule the timing-window follow-up (idempotent per session).
        // 09-17: the light tier tells no time, so there is nothing to come back for — deep only.
        if (mailTo && rec.tier === "deep") {
          const w = revisitWindow(rec.tier, reading, rec.input.question, rec.input.scaleHint, new Date(rec.input.castAtMs));
          scheduleRevisit({
            sessionId: sid,
            castId,
            customerId,
            email: mailTo,
            locale: rec.locale,
            tier: rec.tier,
            castAtMs: rec.input.castAtMs,
            windowDays: w.days,
            timingQuote: w.quote,
            question: rec.input.question,
            checkpoints: w.checkpoints, // 10-12 多段应期
          });
        }
      } catch {
        /* persistence must never block delivery of a paid reading */
      }

      // server-side: the only trustworthy record of a completed purchase —
      // or, behind the painted door, of a gift delivered (never a purchase).
      // A friend's gift or an invited newcomer's free light reading was already
      // counted at redemption (gift_claimed / invite_free_light) — not a purchase.
      if (!rec.grantKind) {
        record({
          t: Date.now(),
          e: rec.gift ? "gift" : "purchase",
          s: sid.slice(-12),
          locale: rec.locale,
          tier: rec.tier,
          path: `/${l}/reading`,
          cur: rec.currency ? rec.currency.toUpperCase() : undefined,
          // 09-22: a membership allowance renders this very page and fired the
          // same event, so every raw count of `purchase` read members as buyers
          // (24 sales reported as 31). The panel was taught to ask the orders
          // table, but the log should not need a second table to be read
          // correctly — so the event now says whether money moved.
          method: rec.subscription ? "membership" : "paid",
          // 09-23: the channel rides on the purchase itself, so the log can be read without a join
          ...(rec.campaign ? { c: rec.campaign } : {}),
        });
      }
    } catch (e) {
      // 10-14 进度表 30 ②: say it is retrying and retry — never a bare 「生成失敗」 after a payment
      recordOps("gen_fail_page", `${rec.tier} ${rec.locale} ${sid.slice(-8)} ${e instanceof Error ? e.message.slice(0, 60) : ""}`);
      return (
        <div className="mx-auto w-full max-w-[34rem] px-[var(--s-4)] pt-24">
          <GenRetry locale={l} href={`/${l}/reading?sid=${encodeURIComponent(sid)}`} />
          {/* the cast is not lost: the sweep retries and the link stays valid (09-15) */}
          <p className="t-small mt-[var(--s-5)] text-[var(--ink-66)]">{t(l, "aiKeep")}</p>
        </div>
      );
    }
  }

  const chart = resolveServerChart(rec.input, true);
  /**
   * 09-17: the page is in the language they were browsing in; the reading is in
   * the language they asked the question in, and those can differ. `rl` carries
   * the reading — its prose, its section headings, the hexagram names above it
   * and the conversation that follows. Everything around it (masthead, share
   * and case panels, footer) stays in the page's language, `l`.
   */
  const rl = rec.locale;
  const zh = chineseLabels(rl);      // the quotation marks around the question follow the reading
  const zhPage = chineseLabels(l);   // the dateline in the masthead follows the page

  // restore the follow-up thread so returning visitors (e.g. from the email) see it all
  let priorTurns: { role: "user" | "assistant"; content: string }[] = [];
  try {
    const castId = castIdForSession(sid);
    if (castId) {
      priorTurns = followupsForCast(castId).map((t) => ({ role: t.role, content: t.content }));
    }
  } catch {
    /* a missing transcript must not break the reading */
  }

  // 09-23 粘性 (用户粘性数据分析-0923.md): the matter this reading belongs to, its notes, and the member offer on a return day
  const stick = (() => {
    try {
      const castId = castIdForSession(sid);
      const owner = rec.customerId ?? customerForReadingSession(sid);
      const notes = castId ? progressNotesForCast(castId) : [];
      const ownerMember = !!activeMembership(owner);
      // 09-24 M4: a member's notes are not paced to one a day
      const gate = noteGate(notes.map((n) => n.created_at), Date.now(), ownerMember ? 0 : undefined, ownerMember ? MEMBER_NOTE_LIMIT : NOTE_LIMIT);
      // 09-29 「一件事」: the stored matter; the old word grouping only for a cast not filed yet
      const matterId = matterForSession(sid);
      const thread = matterId ? collapseUpgrades(castsInMatter(matterId)) : owner && castId ? matterOf(threadCastsForCustomer(owner), castId) : [];
      const sub = owner ? latestSubscription(owner) : null;
      const member = !!sub && ["active", "trialing", "past_due"].includes(sub.status);
      const days = owner && !member && !rec.subscription ? activeDaysForCustomer(owner) : 0;
      return {
        castId, thread, matterId, noteLimit: ownerMember ? MEMBER_NOTE_LIMIT : NOTE_LIMIT,
        notes: notes.map((n) => ({ at: n.created_at, note: n.note, reply: n.reply })),
        nextAt: gate.kind === "wait" ? gate.nextAt : null,
        full: gate.kind === "limit",
        returnDays: days >= 2 ? days : 0,
        followupBase: ownerMember ? MEMBER_FOLLOWUP_LIMIT : FOLLOWUP_LIMIT,
        poolLeft: rec.subscription && owner ? (giftPoolFor(owner)?.available ?? null) : null,
      };
    } catch {
      return { castId: null, thread: [], matterId: null as number | null, noteLimit: NOTE_LIMIT, notes: [], nextAt: null, full: false, returnDays: 0, followupBase: FOLLOWUP_LIMIT, poolLeft: null as number | null };
    }
  })();

  // 送一卦: only a reading that was paid for (money or membership) can give one away
  // 10-24 (Neil: 「会员是会员，通卡是通卡」): the monthly 送一卦 is a membership's — a reading drawn on a 通卡 has none, and
  // its panel read 「會員每月有 5 張「送一卦」… 現在還可以送 0 張」 to a pass holder
  const passReading = !!rec.subscription && sid.startsWith("sub_") && subUseIsPass(sid.slice(4));
  const giftable = rec.tier === "deep" && !rec.reward && !rec.gift && !!(rec.subscription || rec.amountCents) && !passReading;

  // 封卦 (09-21, A1): a deep reading that named a timing window has a revisit
  // scheduled — that row is the sealed prediction, and its page is public.
  const seal = (() => {
    const r = revisitBySession(sid);
    if (!r || !r.cast_id || !r.timing_quote) return null;
    return sealUrl((process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, ""), r.id, l);
  })();

  // 09-28 (进度表 15 ①): the revisit can be answered here too, not only from the mail — and "it came true" gets its card
  const revisitHere = (() => {
    const r = revisitBySession(sid);
    if (!r || !r.cast_id || !r.due_at) return null;
    const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
    if (r.outcome === "hit" && r.outcome_at) return { kind: "hit" as const, proof: proofUrl(site, r.id, l) };
    // 10-07 回访改问法: the buttons name a fact (lib/revisit-judge.ts); a question with nothing to verify asks about the signals
    // 10-22 进度表 89 (设计稿 R7): the window still ahead — the day we will ask, and the reader's own plan (Chinese pages)
    if (!r.outcome && r.due_at > Date.now() && (l === "zh" || l === "zh-hant")) return { kind: "plan" as const, dueAt: r.due_at, plan: r.plan ?? null };
    if (!r.outcome && r.due_at <= Date.now()) return { kind: "ask" as const, signals: r.ask === "signals", urls: { hit: outcomeUrl(site, r.id, "happened", l), partial: outcomeUrl(site, r.id, "stirred", l), open: outcomeUrl(site, r.id, "open", l), miss: outcomeUrl(site, r.id, "nothing", l) } };
    return null;
  })();

  // 09-18: the call, in the reading's own language, for the browser's cast record (see ThreadMark)
  const threadCall = (() => {
    const body = rec.reading as unknown as Record<string, Record<string, string> | undefined>;
    const field = body?.verdict ?? body?.summary;
    return field ? pick(field, rl).replace(/\s+/g, " ").slice(0, 160) : "";
  })();
  // the one line a sharer may choose to attach to the card (off by default)
  const shareVerdict = (() => {
    const body = rec.reading as unknown as Record<string, Record<string, string> | undefined>;
    const field = body?.verdict ?? body?.summary;
    const line = field ? pick(field, l) : "";
    return line ? line.replace(/\s+/g, " ").slice(0, 160) : null;
  })();
  // 10-13 进度表 41 ②③: the date window for the 9:16 card (「10 月 14–18 日」) — deep readings only, they name the days
  const shareWindow = (() => {
    if (rec.tier !== "deep") return null;
    const body = rec.reading as unknown as Record<string, Record<string, string> | undefined>;
    const field = body?.timing;
    return field ? windowLabel(pick(field, l), l) : null;
  })();

  // 同题合参: a reading about a matter between two people may invite the other side;
  // an invitee's reading opens the joint page. The inviter's own question stays here.
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  const fmtDate = (ms: number) => new Date(ms).toLocaleDateString(l === "zh" ? "zh-CN" : l === "zh-hant" ? "zh-TW" : l, { year: "numeric", month: "short", day: "numeric" });
  const pairRow = pairBySession(sid);
  let pairInitial: PairState | null = null;
  let pairMode: "none" | "invite" | "invitee" = "none";
  // an invitee's door closes once either side has ended the pairing; the inviter's panel says so itself
  if (pairRow && pairRow.b_session_id === sid) pairMode = pairRow.dissolved_at ? "none" : "invitee";
  else if (pairRow && pairRow.a_session_id === sid) {
    pairMode = "invite";
    const pl = asLocale(pairRow.a_locale);
    pairInitial = { status: pairStatus(pairRow), framing: pairRow.framing, url: pairLink(site, pl, pairRow), expiresAt: pairRow.expires_at, page: pairPagePath(pl, pairRow.token, sid) };
  } else {
    const topic = rec.input.topicHint ?? classifyTopic(toHans(rec.input.question));
    if (canInvite(sid) && isTwoParty(rec.input.question, topic)) pairMode = "invite";
  }

  // 公开卦例: any stored reading may be published by its owner (never refunded/disputed ones)
  const caseRow = caseBySession(sid);
  const caseInitial: CaseState | null = caseRow && !caseRow.unpublished_at
    ? { publicId: caseRow.public_id, framing: caseRow.framing, url: `${site}${casePath(asLocale(caseRow.locale), caseRow.public_id)}` }
    : null;
  // 09-26: what a published case would show, taken from this very reading
  const casePreview = {
    hex: chart.cast.changed ? `${hexName(chart.cast.primary, rl)} → ${hexName(chart.cast.changed, rl)}` : hexName(chart.cast.primary, rl),
    fields: Object.entries(publicFields(rec.tier, rec.reading, rl)).map(([k, v]) => ({
      label: t(rl, CASE_FIELD_LABELS[k] as Parameters<typeof t>[1]),
      text: v.replace(/\s+/g, " ").slice(0, 90) + (v.length > 90 ? "…" : ""),
    })),
  };
  const ownerId = rec.customerId ?? customerForReadingSession(sid);
  // 09-29 分享者回礼: this reader's own ref rides on their share link, so the newcomer it brings can thank them
  const shareRef = await (async () => {
    if (!ownerId) return null;
    try { return shareRefForSession(sid, ownerId, (await reqCookies()).get("yf_dv")?.value ?? null); } catch { return null; }
  })();
  const ownerIsMember = !!(ownerId && activeMembership(ownerId));
  // 09-29 会员裂变 ①: 42 members held 210 monthly gifts and had made 3 — the pool lived on the account page only.
  // A member's reading now puts it right under the reading. A member reading (sub_) draws on the pool here;
  // any other reading of a member's links to the account page, where the pool is spent while signed in.
  const memberPool = paywallOn() && ownerIsMember && ownerId ? (giftPoolFor(ownerId)?.available ?? 0) : 0;
  const memberGiftHere = memberPool > 0 && !!rec.subscription && rec.tier === "deep";
  // 10-02 (转化率): the upgrade button now says its price — the first deep reading's when it is still this reader's (the same
  // rule /api/checkout applies), in their money (the server's first guess; the panel refines it with the device clock)
  const upgradeOffer = await (async () => {
    let firstDeep = false;
    let currency: Currency = DEFAULT_CURRENCY;
    try {
      const jar = await reqCookies();
      const h = await reqHeaders();
      const viewer = await currentCustomer();
      const known = viewer?.email ?? rec.email ?? null;
      const had = (viewer ? customerHasPaidDeep(viewer.customerId) : false) || (known ? emailHasPaidDeep(known) : false)
        || (!viewer && !known && !!jar.get(FIRST_DEEP_COOKIE)?.value);
      firstDeep = !had;
      const cur = detectCurrency({ chosen: jar.get(CURRENCY_COOKIE)?.value, language: h.get("accept-language"), edgeCountry: edgeCountryOf(h) });
      if (isCurrency(cur)) currency = cur;
    } catch { /* the panel still works without a price hint */ }
    return { firstDeep, currency };
  })();
  // 10-23 进度表 101: under the 通卡 model the upgrade is a 1-day pass on this cast; the first pass costs the old light price
  // (the same rule /api/checkout applies: the signed-in account, else the reading's address, else this browser)
  const upgradeTongka = await (async () => {
    try {
      const jar = await reqCookies();
      if (!(await featureVisible("tongka", jar.get(ADMIN_COOKIE)?.value))) return null;
      const viewer = await currentCustomer();
      const firstPass = viewer ? firstPassEligible(viewer.customerId, viewer.email ?? null)
        : rec.email ? firstPassEligible(null, rec.email)
        : !jar.get(FIRST_DEEP_COOKIE)?.value;
      return { firstPass };
    } catch { return null; }
  })();
  // 10-05 (进度表 §四 28, 真 bug · 客服 #838): a member viewing THEIR OWN light reading saw the deep price + pay-consent
  // on the upgrade panel (the 10-02 转化率 change rendered it without membership). Pass the viewer's own entitlement so
  // the panel shows the allowance copy instead — only when the viewer IS the owner, so a forwarded link never reveals
  // the member panel to a stranger.
  const upgradeMember = paywallOn() && ownerId ? await (async () => {
    try {
      const viewer = await currentCustomer();
      if (!viewer || viewer.customerId !== ownerId) return null;
      const e = await entitlementFor(ownerId);
      if (!e.active) return null;
      // 10-23 进度表 96 ④: under the 通卡 model the panel prints the pass's end or 「會員不限次」, not a monthly count
      return { deepLeft: e.deepLeft, deepTotal: e.deepTotal, packLeft: e.packLeft ?? 0, unlimited: !!e.unlimited, pass: !!e.pass, passDays: e.passDays, periodEnd: e.periodEnd };
    } catch { return null; }
  })() : null;
  // 10-02 单买抵扣 (Neil: 「2，3 都做吧」): on the owner's own third (or later) single extra this period, the offer to
  // turn them into the 15-pack — only to the signed-in owner (a forwarded link shows nothing of their account)
  const packNudgeHere = paywallOn() && rec.memberAddon && rec.customerId ? await (async () => {
    try {
      const owner = rec.customerId!;
      const viewer = await currentCustomer();
      if (viewer?.customerId !== owner) return null;
      const e = await entitlementFor(owner);
      const lq = e.packQuotes?.large;
      return e.active && e.packQuotes && (e.singlesThisPeriod ?? 0) >= PACK_NUDGE_SINGLES && lq && lq.creditUnits > 0 ? { quotes: e.packQuotes, singles: e.singlesThisPeriod ?? 0 } : null;
    } catch { return null; }
  })() : null;
  const credit = (() => {
    if (!paywallOn() || !ownerId || ownerIsMember || !/^(cs|pi)_/.test(sid)) return null;
    const cur = creditCurrency(ownerId);
    return cur ? upgradeCredit(ownerId, cur) : null;
  })();
  // 09-27: a friend's gifted reading carries no currency of its own — guess theirs from the request (as the account page does),
  // so a reader in Taipei is not quoted US$ for their first reading
  const giftRecvCur: Currency = await (async () => {
    if (isCurrency(rec.currency)) return rec.currency;
    try {
      const h = await reqHeaders();
      const cur = detectCurrency({ chosen: (await reqCookies()).get(CURRENCY_COOKIE)?.value, language: h.get("accept-language"), edgeCountry: edgeCountryOf(h) });
      return isCurrency(cur) ? cur : DEFAULT_CURRENCY;
    } catch { return DEFAULT_CURRENCY; }
  })();
  // 10-23 进度表 101: under the 通卡 a friend's own next matter is a 1-day pass (first one, or the regular price), not a single reading
  const giftRecvPrice = upgradeTongka
    ? upgradeTongka.firstPass
      ? tt(l, "passFirstFrag", { p: formatMoney(giftRecvCur, tongkaMinor(giftRecvCur, 1, true), l), full: formatMoney(giftRecvCur, tongkaMinor(giftRecvCur, 1, false), l) })
      : formatMoney(giftRecvCur, tongkaMinor(giftRecvCur, 1, false), l)
    : priceLabels(giftRecvCur, l).one;
  // 09-27 (Neil: 「改改…朋友那一侧的承接」): 5 of the 7 friends used every follow-up, then met a plain "ask another" line
  const friendDone = rec.grantKind === "gift_cast" && paywallOn() && !ownerIsMember
    ? { title: tt(l, "fdDoneTitle"), body: tt(l, upgradeTongka ? "fdDoneBodyPass" : "fdDoneBody", { price: giftRecvPrice, n: MEMBER_FOLLOWUP_LIMIT }), castHref: `/${l}/cast`, castLabel: tt(l, "giftRecvCast"), memberHref: `/${l}/account#membership`, memberLabel: tt(l, "giftRecvMember") }
    : undefined;
  const canPublish = !!storedReadingForSession(sid) && !["refunded", "disputed"].includes(storedReadingForSession(sid)?.status ?? "");

  const guarantee = /^(cs|pi)_/.test(sid) && paywallOn() ? guaranteeCheck(sid) : null;
  const deepHas = (k: string) => {
    const f = (rec.reading as unknown as Record<string, Record<string, string> | undefined>)?.[k];
    return !!f && pick(f, rl).trim() !== "";
  };
  const dateline = `${chart.calendar.month.stem}${chart.calendar.month.branch}${zhPage ? "月" : ""}  ${chart.calendar.day.stem}${chart.calendar.day.branch}${zhPage ? "日" : ""}`;
  // the date the reader cast on, in the reader's own clock — a 07:00 cast in Shanghai is not "yesterday" (09-14)
  const castedOn = localDay(rec.input.castAtMs ?? Date.now(), rec.input.tzOffsetMinutes ?? 0);
  // a light gift that has already been upgraded in place links to its deep reading (09-18)
  const upgradedTo = rec.gift && rec.tier === "one" && sid.startsWith("gf_") ? (() => { const d = giftUpgradeOf(sid.slice(3)); return d ? `gf_${d}` : null; })() : null;
  // the painted door says so on the page: this one was a gift, and what it will cost
  const giftPrice = rec.gift
    ? priceLabels(isCurrency(rec.currency) ? rec.currency : DEFAULT_CURRENCY, l)[rec.tier === "deep" ? "deep" : "one"]
    : null;

  // 10-22 进度表 76 ⑤: the result template — head (the matter asked) · answer (the figure and the reading) · ask (the
  // conversation, or the door to the full reading) · revisit · share (and the offers around it) · cross · foot · sticky
  const askBlock = (
    <>
      {rec.tier === "deep" ? (
        <FollowupChat locale={rl} homeLocale={l} tier={rec.tier} extraBody={{ sid }} initialTurns={priorTurns} limit={stick.followupBase + followupBonus(sid)} giftHref={giftable ? "#gift" : undefined} topic={rec.input.topicHint ?? classifyTopic(toHans(rec.input.question))} initialInput={askInit} doneOffer={friendDone}
          memberNudge={paywallOn() && !ownerIsMember && !rec.subscription && !friendDone
            ? { title: t(rl, "subPromise"), body: mt(rl, "nudgeBody", { f: MEMBER_FOLLOWUP_LIMIT, n: DEEP_PER_MONTH }), href: `/${l}/account#membership`, cta: mt(rl, "nudgeCta") }
            : undefined} />
      ) : upgradedTo ? (
        // 09-18: once the deep reading exists, the light page points at it instead of minting another
        <section className="mt-[var(--s-6)] border border-[var(--gold)] rounded-[2px] px-[var(--s-4)] py-[var(--s-5)]">
          <p className="t-label mb-2">{t(rl, "oneUpsellTitle")}</p>
          <p className="t-body !text-[15px] text-[var(--ink-86)]">{t(rl, "upgradeDone")}</p>
          <Link href={`/${l}/reading?sid=${encodeURIComponent(upgradedTo)}`} className="inline-block mt-[var(--s-3)] min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.16em]">
            {t(rl, "upgradeDoneCta")}
          </Link>
        </section>
      ) : (
        <UpgradePanel locale={rl} pageLocale={l} sid={sid} hasEmail={Boolean(rec.email)} needsEmail={!rec.email && giftEmailRequired("deep")}
          firstDeep={upgradeOffer.firstDeep} priorCurrency={isCurrency(String(rec.currency ?? "").toUpperCase()) ? String(rec.currency).toUpperCase() : null} initialCurrency={upgradeOffer.currency} member={upgradeMember} tongka={upgradeTongka} />
      )}
    </>
  );
  return (
    <ResultPage
      locale={l}
      head={{
        label: `${giftPrice ? t(l, "giftUnlocked", { price: giftPrice }) : t(l, "paidUnlocked")} · ${castedOn}`,
        question: `${zh ? "「" : "“"}${rec.input.question}${zh ? "」" : "”"}`,
        meta: dateline,
      }}
      answer={
        <>
          {/* 10-02 付款后自动登录: right after paying, the browser that paid may be signed in to the new account (lib/pay-login.ts) */}
          {paywallOn() && /^(cs|pi)_/.test(sid) && !rec.customerId && !rec.subscription && !rec.reward && !rec.gift && <PayLogin sid={sid} locale={l} />}
          {/* 09-29 「一件事」: this reading is one point on a matter — the way back to the whole of it */}
          {stick.matterId && stick.thread.length > 1 && (() => {
            const mm = matterById(stick.matterId);
            if (!mm) return null;
            // 10-01 (Neil: 「入口明显一点」): a card, not a gold line — what the matter holds, and how often this very question came up
            const qi = cachedQuestionInfo(stick.matterId, stick.castId);
            const nextDue = stick.thread.filter((c) => c.revisit_id && c.due_at && !c.outcome && c.due_at > Date.now()).sort((a, b) => (a.due_at ?? 0) - (b.due_at ?? 0))[0];
            const fmtD = (ms: number) => new Date(ms).toLocaleDateString(l === "zh" ? "zh-CN" : l === "zh-hant" ? "zh-TW" : l, { month: "short", day: "numeric" });
            const meta = [
              qi && qi.questions < stick.thread.length ? mt(l, "readingCardMeta", { n: stick.thread.length, k: qi.questions }) : tt(l, "castsN", { n: stick.thread.length }),
              nextDue ? mt(l, "readingCardNext", { date: fmtD(nextDue.due_at!) }) : null,
            ].filter(Boolean).join(" · ");
            return (
              <Link href={`/${l}/matter/${stick.matterId}?sid=${encodeURIComponent(sid)}${qi && qi.questions < stick.thread.length ? "#questions" : ""}`} data-heat="reading-matter"
                className="group mt-[var(--s-4)] block border border-[var(--gold)]/60 rounded-[2px] px-[var(--s-4)] py-[var(--s-3)] hover:border-[var(--gold)] hover:bg-[var(--gold)]/[0.05] transition-colors">
                <p className="t-small !text-[var(--gold-text)] break-words">{mt(l, "readingCard", { title: mm.title || mt(l, "open") })}</p>
                <p className="t-label !text-[var(--ink-45)] mt-1">{meta}</p>
                {qi && qi.thisAsked > 2 && <p className="t-small mt-1 !text-[var(--cinnabar)]">{mt(l, "readingRepeat", { n: qi.thisAsked })}</p>}
                <p className="t-small mt-1 underline underline-offset-4 group-hover:text-[var(--ink)]">{mt(l, "cardOpen")} →</p>
              </Link>
            );
          })()}
          {/* 10-22 分開 (lib/reread.ts): 「不是同一件事」 — the cast leaves the matter it was filed under; when the reading had
              looked at the earlier casts, one re-read from this cast alone is free */}
          {(() => {
            try {
              const sc = castOfSession(sid);
              if (!sc) return null;
              const state = rereadState(sid);
              const grouped = (!!stick.matterId && stick.thread.length > 1) || readingHadContext(sid, sc);
              const back = `/${l}/reading?sid=${sid}`;
              // 10-23 进度表 98: the way back from a split tapped by mistake — open for a day, as long as that matter exists
              const unsplit = unsplitOffer(sid);
              // the offer stays on the page until it is taken; a claim that never finished reads as failed
              const notice: "splitDone" | "splitReread" | "rereadWait" | "rereadDone" | "rereadFail" | "unsplitDone" | "unsplitGone" | null =
                merged === "1" ? "unsplitDone"
                : merged === "gone" || merged === "none" ? "unsplitGone"
                : state === "pending" ? "rereadWait"
                : state === "done" && reread ? "rereadDone"
                : state === "offer" ? (reread ? "rereadFail" : "splitReread")
                : split ? "splitDone"
                : null;
              const offer = state === "offer";
              if (!grouped && !notice && !offer && !unsplit) return null;
              return (
                <div id="matter" className="mt-[var(--s-3)] border-l-2 border-[var(--ink-16)] pl-[var(--s-3)]" data-heat="reading-split-block">
                  {notice && <p className={`t-small ${notice === "rereadFail" ? "!text-[var(--cinnabar)]" : "!text-[var(--ink-66)]"}`}>{mt(l, notice)}</p>}
                  {notice === "rereadWait" && <RereadWait />}
                  {offer && <RereadForm sid={sid} back={back} btn={mt(l, "rereadBtn")} />}
                  {unsplit && notice !== "rereadWait" && <UnsplitForm sid={sid} back={back} btn={mt(l, "unsplitBtn")} />}
                  {grouped && !split && !notice && !unsplit && <SplitForm sid={sid} back={back} ask={mt(l, "splitAsk")} btn={mt(l, "splitBtn")} />}
                </div>
              );
            } catch {
              return null;
            }
          })()}
          {/* 09-29: the fifth cast today on this matter — the site says once, kindly, that today is already clear */}
          {stick.matterId && (() => {
            const n = castsTodayInMatter(stick.matterId);
            if (n < PAUSE_AT) return null;
            const next = stick.thread.filter((c) => c.revisit_id && c.due_at && !c.outcome && c.due_at > Date.now()).sort((a, b) => (a.due_at ?? 0) - (b.due_at ?? 0))[0];
            const fmtD = (ms: number) => new Date(ms).toLocaleDateString(l === "zh" ? "zh-CN" : l === "zh-hant" ? "zh-TW" : l, { month: "short", day: "numeric" });
            return <PauseNote locale={l} n={n} nextDate={next ? fmtD(next.due_at!) : null} />;
          })()}
          {/* ---- the figure — drawn, never a glyph ---- */}
          <div className="flex items-center gap-6 pb-[var(--s-5)] border-b border-[var(--ink-16)]">
            <div>
              <FigureMark yangs={primaryYangs(rec.input.values)} width={52} className="mb-2.5" />
              <p className="t-body !text-[15px]"><Link href={`/${rl}/gua/${guaSlug(chart.cast.primary)}`} className="underline decoration-[var(--ink-16)] underline-offset-4 hover:decoration-[var(--ink)]">{hexName(chart.cast.primary, rl)}</Link></p>
            </div>
            {chart.cast.changed && (
              <>
                <span className="t-label !text-[16px] self-center pt-2">→</span>
                <div className="text-[var(--ink-66)]">
                  <FigureMark yangs={changedYangs(rec.input.values)} width={52} className="mb-2.5" />
                  <p className="t-body !text-[15px] text-[var(--ink)]">
                    <Link href={`/${rl}/gua/${guaSlug(chart.cast.changed)}`} className="underline decoration-[var(--ink-16)] underline-offset-4 hover:decoration-[var(--ink)]">{hexName(chart.cast.changed, rl)}</Link>
                  </p>
                </div>
              </>
            )}
          </div>

          {/* a gift never spends the first-time price: whoever tried the painted door still gets it when the till opens */}
          {rec.tier === "deep" && !rec.subscription && !rec.reward && !rec.gift && <FirstDeepMark />}
          {rec.tier === "deep" ? (
            /* 09-26 (Neil: 「解读页面太乱了」): two grey paragraphs about what a deep reading contains became a row of
               jumps to the parts people come back for — the call, the dates, what to do, the conversation, the rest */
            <nav className="mt-[var(--s-4)] flex flex-wrap gap-2" aria-label="contents">
              {([
                ["verdict", t(rl, "dVerdict")],
                ...(deepHas("timing") ? [["timing", t(rl, "dTiming")]] : []),
                ...(deepHas("next_step") ? [["next", t(rl, "dNext")]] : []),
                ["followup", t(rl, "askTitle")],
                // 09-29 推荐入口: in the jump row, in cinnabar — the one chip that says what it earns
                ...(paywallOn() && ownerId && (giftable || shareRef || memberPool > 0) ? [["invite", it(l, "chip")]] : []),
                ["more", tt(l, "rdMore")],
              ] as [string, string][]).map(([id, label]) => (
                <a key={id} href={`#${id}`} className={`t-label rounded-full border px-3 py-1.5 transition-colors ${id === "invite" ? "border-[var(--cinnabar)]/60 !text-[var(--cinnabar)] hover:border-[var(--cinnabar)]" : "border-[var(--ink-16)] hover:border-[var(--ink-45)] hover:text-[var(--ink)]"}`}>
                  {label}
                </a>
              ))}
            </nav>
          ) : (
            /* what this tier carries (09-17: the two tiers read alike until they were told apart) */
            <p className="t-small mt-[var(--s-4)] text-[var(--ink-45)]">{t(rl, "includesOne")}</p>
          )}
          {/* 09-18: keep the way back — the call goes into the browser's cast record, for the gate */}
          <ThreadMark sid={sid} tier={rec.tier} call={threadCall} from={rec.upgradedFrom} />
          {/* 09-26 钱包直付: no address was typed on our page — show where the reading went, and let them send it elsewhere */}
          {(() => {
            if (!sid.startsWith("pi_")) return null;
            const o = orderBySession(sid);
            if (!o?.email || Date.now() - o.created_at > SENDTO_WINDOW_MS) return null;
            const masked = o.email.replace(/^(.{2}).*(@.*)$/, "$1***$2");
            return <SentTo locale={rl} sid={sid} masked={masked} />;
          })()}
          {/* 10-14 进度表 44: the timing as a line, with the day we come back — and 「加入行事曆」 (no question in the event) */}
          {rec.tier === "deep" && (() => {
            const tz = rec.input.tzOffsetMinutes ?? 0;
            const tl = buildTimeline({ timing: pick((rec.reading as unknown as { timing?: Record<string, string> }).timing ?? {}, rl), castAtMs: rec.input.castAtMs ?? Date.now(), tzOffsetMinutes: tz, revisitDueAt: revisitBySession(sid)?.due_at ?? null });
            if (!tl) return null;
            const topic = (rec.input.topicHint ?? classifyTopic(toHans(rec.input.question))) as Topic;
            const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
            const today = new Date(Date.now() + tz * 60_000).toISOString().slice(0, 10);
            return <TimingTimeline data={tl} locale={rl} kind={TOPIC_NAMES[topic in TOPIC_NAMES ? topic : "other"][rl]} link={stick.matterId ? `${site}/${l}/matter/${stick.matterId}` : `${site}/${l}/account`} today={today} surface="deep" />;
          })()}
          <ReadingArticle locale={rl} tier={rec.tier} reading={rec.reading!} topic={rec.input.topicHint ?? classifyTopic(toHans(rec.input.question))} />
          {/* 10-12 承接 ⑨ 卦→籤: a full reading on a love (or uncategorised) matter, in 繁體, with no lot yet — one quiet line */}
          {rec.tier === "deep" && rl === "zh-hant" && !rec.input.qian && ["relationship", "other"].includes(rec.input.topicHint ?? classifyTopic(toHans(rec.input.question))) && (
            <p className="t-small mt-[var(--s-4)] !text-[var(--ink-45)]">
              <a href={`/zh-hant/jieqian?from=${encodeURIComponent(sid)}`} data-heat="reading-to-jieqian" className="underline underline-offset-4 hover:text-[var(--ink)]">這件事也在廟裡求過籤？輸入籤號，放在同一件事上看 →</a>
            </p>
          )}
          {/* the conversation belongs to the master reading; the light tier opens the door to it — same figure, no second cast */}
          {/* 10-13 进度表 41 ③: right after the day is named — the one time we ask, inline, and only once for this reading */}
          {rec.tier === "deep" && shareWindow && (
            <ShareMoment id={`deep:${sid.slice(-12)}`} locale={l} title={ssh(l, "dayAsk")} body={ssh(l, "dayBody")}>
              <ShareCardMoment locale={l} values={rec.input.values} verdict={shareVerdict} shareRef={shareRef} windowText={shareWindow} />
            </ShareMoment>
          )}
        </>
      }
      ask={rec.tier === "deep" ? askBlock : <div id="upgrade" className="scroll-mt-20">{askBlock}</div>}
      revisit={revisitHere ? (
        <>
          {/* 09-23 粘性: what happened since — answered inside this cast (deep only, the tier that names a window) */}
          {/* 09-28 (进度表 15 ①): answer the revisit on the page itself; a hit shows the proof card right here */}
          {revisitHere?.kind === "ask" && (
            <section id="revisit" className="mt-[var(--s-6)] scroll-mt-20 border border-[var(--gold)] rounded-[2px] px-[var(--s-4)] py-[var(--s-4)]" data-heat="revisit-here">
              <p className="t-body !text-[15px]">{tt(l, revisitHere.signals ? "rvAnswerLeadSig" : "rvAnswerLead")}</p>
              <p className="mt-[var(--s-3)] flex flex-wrap gap-x-4 gap-y-2">
                {(["hit", "partial", "open", "miss"] as const).map((v) => (
                  <a key={v} href={revisitHere.urls[v]} className="t-small px-3 py-1.5 rounded-[2px] border border-[var(--ink-16)] hover:border-[var(--ink)] hover:text-[var(--ink)] transition-colors">
                    {tt(l, revisitHere.signals
                      ? (v === "hit" ? "ansSigSeen" : v === "partial" ? "ansSigSome" : v === "miss" ? "ansSigNone" : "ansOpen")
                      : (v === "hit" ? "ansHit" : v === "partial" ? "ansPartial" : v === "miss" ? "ansMiss" : "ansOpen"))}
                  </a>
                ))}
              </p>
            </section>
          )}
          {revisitHere?.kind === "plan" && <RevisitPlan sid={sid} locale={l} dueDay={localDay(revisitHere.dueAt, rec.input.tzOffsetMinutes ?? 480)} plan={revisitHere.plan} suggest={pick((rec.reading as unknown as { one_step?: Parameters<typeof pick>[0] } | null)?.one_step, rl) || null} />}
          {revisitHere?.kind === "hit" && (
            <section className="mt-[var(--s-6)] border border-[var(--cinnabar)]/60 rounded-[2px] px-[var(--s-4)] py-[var(--s-4)]" data-heat="proof-here">
              <p className="t-body !text-[15px]">{tt(l, "proofMakeLead")}</p>
              <Link href={revisitHere.proof} className="inline-block mt-[var(--s-3)] min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.14em]">{tt(l, "proofMake")}</Link>
            </section>
          )}
        </>
      ) : undefined}
      share={
        <>
          {/* 10-01 (进度表 25 ③, #838: 「深斷頁面手機也有點混亂，他好長」): the conversation comes straight after the reading;
              the invite card follows it instead of standing between the two */}
          {/* 10-02 单买抵扣 (Neil: 「2，3 都做吧」): a member's third (or later) single extra this period — the 15-pack can take them in */}
          {packNudgeHere && (
            <section className="mt-[var(--s-6)] border border-[var(--gold)] rounded-[2px] px-[var(--s-4)] py-[var(--s-4)]" data-heat="pack-nudge-reading">
              <PackBuy locale={l} quotes={packNudgeHere.quotes} singles={packNudgeHere.singles} />
            </section>
          )}
          {/* 09-29 推荐入口 (Neil: 「要让所有用户都能看到并愿意用起来」): right under the reading, where "this is exactly my friend's situation" happens */}
          {memberPool > 0 ? (
            <section id="invite" className="mt-[var(--s-6)] scroll-mt-20 border border-[var(--cinnabar)]/50 rounded-[2px] px-[var(--s-4)] py-[var(--s-4)]" data-heat="member-gift-card">
              <p className="t-body !text-[17px]">{mg(l, "cardTitle", { n: memberPool })}</p>
              <p className="t-small mt-1 !text-[var(--ink-66)]">{mg(l, "cardBody")}</p>
              {memberGiftHere ? (
                <div className="mt-[var(--s-3)]"><GiftCastPanel locale={l} sid={sid} poolLeft={stick.poolLeft} compact bare /></div>
              ) : (
                <Link href={`/${l}/account#gift`} className="inline-block mt-[var(--s-3)] min-h-[var(--s-6)] px-5 py-2.5 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.14em]">{it(l, "gift")}</Link>
              )}
              <p className="mt-[var(--s-3)] flex flex-wrap gap-x-5 gap-y-2">
                {memberGiftHere && <Link href={`/${l}/account#gift`} className="t-small underline underline-offset-4 !text-[var(--ink-45)]">{mg(l, "cardMore")} →</Link>}
                {shareRef && <Link href="#share" className="t-small underline underline-offset-4 !text-[var(--ink-45)]">{it(l, "share")} →</Link>}
              </p>
            </section>
          ) : paywallOn() && ownerId && (giftable || shareRef) && (
            <InviteCard locale={l} giftHref={giftable ? "#gift" : null} shareHref={shareRef ? "#share" : null} stats={myReferralStats(ownerId)} mineHref={`/${l}/account#referrals`} />
          )}
          {/* 09-26 收礼人: a friend's gift — their own next matter at the first price, membership, and the chain onward */}
          {rec.grantKind === "gift_cast" && paywallOn() && (
            <section className="mt-[var(--s-6)] border border-[var(--ink-16)] rounded-[2px] px-[var(--s-4)] py-[var(--s-5)]" data-heat="gift-recv">
              <p className="t-label mb-2">{isReviewSession(grantByRedeemSession(sid)?.from_session_id)
                ? (l === "zh" ? "这一份是 YaoFlow 提供的评测试用" : l === "zh-hant" ? "這一份是 YaoFlow 提供的評測試用" : "This reading was a YaoFlow review trial") // 10-16 进度表 52
                : tt(l, "giftRecvTitle")}</p>
              <p className="t-body !text-[15px] text-[var(--ink-86)]">{tt(l, upgradeTongka ? "giftRecvBodyPass" : "giftRecvBody", { price: giftRecvPrice })}</p>
              <div className="mt-[var(--s-3)] flex flex-wrap items-center gap-x-6 gap-y-3">
                <Link href={`/${l}/cast`} className="inline-block min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.14em]">{tt(l, "giftRecvCast")}</Link>
                <Link href={`/${l}/account#membership`} className="t-small underline underline-offset-4">{tt(l, "giftRecvMember")} →</Link>
              </div>
              {canPublish && !caseInitial && caseRewardable(orderBySession(sid)?.status, sid) && <p className="t-small mt-[var(--s-3)] !text-[var(--gold-text)]"><a href="#case" className="underline underline-offset-4">{tt(l, "giftRecvPublish")}</a></p>}
            </section>
          )}
          {/* 09-26 单买抵首月: the second single purchase in 30 days — this one counts toward a first membership month */}
          {credit && (
            <section className="mt-[var(--s-6)] border border-[var(--gold)] bg-[var(--gold)]/[0.06] rounded-[2px] px-[var(--s-4)] py-[var(--s-5)]" data-heat="upgrade-credit">
              <p className="t-label mb-2 !text-[var(--gold-text)]">{tt(l, "crTitle")}</p>
              <p className="t-body !text-[15px]">{tt(l, "crBody", { n: credit.count, spent: formatMoney(credit.currency, credit.spentMinor, l), credit: formatMoney(credit.currency, credit.amountMinor, l), net: formatMoney(credit.currency, Math.max(0, credit.firstInvoiceMinor - credit.amountMinor), l) })}{firstT(l, "renewNote", { month: formatMoney(credit.currency, priceMinor(credit.currency, "month"), l) })}</p>
              <Link href={`/${l}/account#membership`} className="inline-block mt-[var(--s-3)] min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.14em]">{tt(l, "crGo")}</Link>
            </section>
          )}
          <ThreadPanel locale={l} pageLocale={l} casts={stick.thread} currentCastId={stick.castId} matterHref={stick.matterId ? `/${l}/matter/${stick.matterId}?sid=${encodeURIComponent(sid)}` : null} />
          {paywallOn() && stick.returnDays >= 2 && <SubReturnPanel locale={l} pageLocale={l} days={stick.returnDays} deep={DEEP_PER_MONTH} pass={!!upgradeTongka} />}
          {pairMode === "invitee" && pairRow && (
            <section className="mt-[var(--s-6)] border border-[var(--gold)] rounded-[2px] px-[var(--s-4)] py-[var(--s-5)]">
              <p className="t-label mb-2">{t(l, "pairPageTitle")}</p>
              <p className="t-body !text-[15px] text-[var(--ink-86)]">{pairRow.framing}</p>
              <Link href={pairPagePath(l, pairRow.token, sid)} className="inline-block mt-[var(--s-3)] min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.16em]">
                {t(l, "pairView")}
              </Link>
            </section>
          )}
          {/* 09-26: gift · seal · share · publish · invite — one list of folded rows instead of five stacked panels */}
          <MoreActions title={tt(l, "rdMore")}>
            {/* 10-01: 記一筆進展 and 公開卦例 were two open panels (≈1,000px on a phone) — now folded rows, open when they already hold something */}
            {rec.tier === "deep" && stick.castId && (
              <MoreItem id="progress" title={tt(l, "noteTitle")} hint={stick.notes.length ? tt(l, "threadNotes", { n: stick.notes.length }) : null} open={stick.notes.length > 0}>
                <ProgressLog locale={rl} sid={sid} initial={stick.notes} nextAt={stick.nextAt} full={stick.full} limit={stick.noteLimit} />
              </MoreItem>
            )}
            {canPublish && (
              <MoreItem id="case" title={tt(l, caseInitial ? "acctCasesTitle" : "pubInviteTitle")} hint={caseInitial ? null : caseRewardable(orderBySession(sid)?.status, sid) ? tt(l, ownerIsMember ? "pubRewardMember" : "pubRewardGuest") : null} open={!!caseInitial}>
                <CasePanel locale={l} sid={sid} initial={caseInitial} initialReward={caseInitial ? caseRewardView(sid, site, l) : null}
                  preview={casePreview} member={ownerIsMember} impact={caseInitial ? caseImpact(caseInitial.publicId) : null}
                  rewardable={caseRewardable(orderBySession(sid)?.status, sid)} />
              </MoreItem>
            )}
            {giftable && !memberGiftHere ? (
              <MoreItem id="gift" title={t(l, "giftCastTitle")} hint={stick.poolLeft != null && stick.poolLeft > 0 ? tt(l, "poolLeft", { n: stick.poolLeft }) : null}>
                <GiftCastPanel locale={l} sid={sid} poolLeft={stick.poolLeft} />
              </MoreItem>
            ) : null}
            {/* 封卦 (A1): only a reading that actually named a date has a claim to put on the record */}
            {seal && (
              <MoreItem id="seal" title={t(l, "sealMake")}>
                <SealPanel locale={l} url={seal} />
              </MoreItem>
            )}
            <MoreItem id="share" title={t(l, "shareTitle")} hint={sst(l, shareRef ? "shareOne" : "shareOnly")}>
              <ShareCard locale={l} values={rec.input.values} verdict={shareVerdict} shareRef={shareRef} surface={rec.tier === "deep" ? "deep" : "result"} windowText={shareWindow} />
            </MoreItem>
            {pairMode === "invite" && (
              <MoreItem id="pair" title={t(l, "pairTitle")} open={!!pairInitial}>
                <PairPanel locale={l} sid={sid} question={rec.input.question} initial={pairInitial} expiresLabel={pairInitial ? fmtDate(pairInitial.expiresAt) : null} />
              </MoreItem>
            )}
          </MoreActions>
          {/* 09-26 首次付费保证: one tap, 24 hours, first money ever paid, once per person (lib/db guaranteeCheck) */}
          {guarantee && guarantee.ok && (
            <GuaranteePanel locale={l} sid={sid} until={guarantee.until}
              amount={formatMoney(isCurrency((guarantee.currency ?? "").toUpperCase()) ? ((guarantee.currency ?? "").toUpperCase() as Currency) : DEFAULT_CURRENCY, guarantee.amountCents, l)} />
          )}
          {/* 09-29 加到主屏幕: members only, phones only, until dismissed */}
          {rec.tier === "deep" && ownerIsMember && <HomeScreenCard locale={l} />}
        </>
      }
      cross={(l === "zh" || l === "zh-hant")
        // 10-22 进度表 86 承接地圖: 擇日 first, then 八字 (with a birth profile) and 每日運勢 — never another 問事 tool
        // 10-26: a love question gets the 正緣畫像 card with a sentence written for it (LoveBridge), then the usual cards
        // 10-29 进度表 127: a lost thing → the free 尋物 card (where to look, what to report or block), unless it came from there
        ? <><LoveBridge locale={l} question={rec.input.question} surface="reading" /><CrossCards source={isLostThing(rec.input.question) && rec.input.pre?.kind !== "xw" ? "reading_lost" : "reading"} locale={l} exclude={["cast"]} /></>
        : <PromoStrip surface="reading" locale={l} exclude={["cast"]} />}
      foot={
        <>
          <div className="mt-[var(--s-5)] px-1">
            {rec.email && <p className="t-small mb-2">{t(l, rec.subscription || rec.reward ? "emailSentAccount" : rec.gift ? "emailSentGift" : "emailSent")}</p>}
            <p className="t-small">{t(l, "privateNotice")}</p>
            <p className="t-small mt-2 !text-[var(--ink-45)]">{t(l, "paidKeep")}</p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 mt-[var(--s-5)]">
            <Link href={`/${l}/account`} className="t-label hover:text-[var(--ink)] transition-colors">
              {t(l, "accountAllCasts")} →
            </Link>
            <Link href={`/${l}`} className="t-label hover:text-[var(--ink)] transition-colors">
              {t(l, "backHome")}
            </Link>
          </div>
        </>
      }
      sticky={revisitHere?.kind === "plan" && !revisitHere.plan
        // 10-22 进度表 87 (设计稿 R10): paid, the window ahead and no plan written yet — the bottom button sets the revisit
        ? <a href="#revisit" data-heat="reading-sticky-revisit" className="block text-center min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] !text-[var(--paper)] text-[13px] tracking-[0.16em] no-underline">{l === "zh" ? "设定回访" : "設定回訪"}</a>
        : rec.tier === "deep"
        ? <a href="#followup" data-heat="reading-sticky-ask" className="block text-center min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] !text-[var(--paper)] text-[13px] tracking-[0.16em] no-underline">{t(rl, "askTitle")}</a>
        : upgradedTo
          ? <Link href={`/${l}/reading?sid=${encodeURIComponent(upgradedTo)}`} data-heat="reading-sticky-upgraded" className="block text-center min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] !text-[var(--paper)] text-[13px] tracking-[0.16em] no-underline">{t(rl, "upgradeDoneCta")}</Link>
          : <a href="#upgrade" data-heat="reading-sticky-upgrade" className="block text-center min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] !text-[var(--paper)] text-[13px] tracking-[0.16em] no-underline">{t(rl, "btnDeep")}</a>}
    />
  );
}
