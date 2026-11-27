import { serverCheckEmail } from "@/lib/email-mx";
import { markCustomer } from "@/lib/browsers";
import { AB_RE } from "@/lib/ab";
import { browserSessionOf } from "@/lib/browser-session";
import { deviceOf } from "@/lib/device";
import { threadPrior } from "@/lib/matter-thread";
import { createWalletIntent, publishableKey } from "@/lib/stripe";
import { parseOdds, parseSituation } from "@/lib/situation";
import { normalizeEmail } from "@/lib/email-check";
import { uaSegment } from "@/lib/ua-brief";
import { leftUrl, newCo, notePending } from "@/lib/recover-offer";
import { NextRequest, NextResponse } from "next/server";
import { ipTag } from "@/lib/ip-tag";
import { LEGAL_UPDATED } from "@/lib/legal";
import { isFallbackTeaser } from "@/lib/teaser";
import { asLocale, type Locale } from "@/lib/locales";
import { questionIssue } from "@/lib/question-check";
import { resolveReadingLocale } from "@/lib/question-lang";
import { readCastExtras } from "@/lib/cast-extras";
import { verifyPaidSession } from "@/lib/paid-store";
import { alipayPossible, createCheckoutSession, MAINLAND_METHODS } from "@/lib/stripe";
import { giftEmailRequired, giftMode, paywallOn, priceFor } from "@/lib/paywall";
import { buyerCountry, edgeCountry, managedPaymentsAllowed, plainCheckoutRegion } from "@/lib/geo";
import type { ReadingInput, Tier } from "@/lib/reading";
import { parseScaleHint, parseTopicHint } from "@/lib/hints";
import { CURRENCY_COOKIE, DEFAULT_CURRENCY, detectCurrencyWithSource, FIRST_DEEP_COOKIE, isCurrency, isCurrencySource, isMainlandTimeZone, priceMinor, stripeCurrency, tongkaMinor, type Currency, type CurrencySource } from "@/lib/money";
import { ADMIN_COOKIE } from "@/lib/admin-auth";
import { featureVisible } from "@/lib/features";
import { firstPassEligible } from "@/lib/pass";
import { CATALOG, sellable } from "@/lib/catalog";
import { isTongkaDays, tongkaT, type TongkaDays } from "@/lib/tongka";
import { customerFromRequest, EMAIL_RE } from "@/lib/auth";
import { entitlementFor, redeemSubscription } from "@/lib/subscription";
import type { LineValue } from "@yaoflow/engine";
import { customerIdByEmail, createGift, customerHadInviteLight, emailHadInviteLight, customerHasPaidDeep, customerOrdersCount, giftTrace, giftUpgradeOf, giftsByEmailSince, recordOps, setMarketingConsent, upsertCustomer, orderTrace, emailHasPaidDeep, endPaySessionsOnForeign } from "@/lib/db";
import { grantInviteLight, INVITE_COOKIE } from "@/lib/grants";
import { armPayLogin } from "@/lib/pay-login";
import { randomBytes } from "node:crypto";
import { isCampaignTag } from "@/lib/campaign";
import { isPromoCode, notePromoUse, promoFor, PROMO_COOKIE } from "@/lib/promos";
import { payHop } from "@/lib/inapp-pay";

export const runtime = "nodejs";

/** 09-26 对照测试: the free first light reading — one per browser (cookie), a few per network a day */
const FREE_FIRST_COOKIE = "yf_ff";
const FREE_HITS = new Map<string, number[]>();
function freeLimited(ip: string): boolean {
  const now = Date.now();
  const list = (FREE_HITS.get(ip) ?? []).filter((t) => now - t < 86_400_000);
  if (list.length >= 3) return true;
  list.push(now);
  FREE_HITS.set(ip, list);
  if (FREE_HITS.size > 5000) FREE_HITS.clear();
  return false;
}

function attributionMeta(b: { c?: unknown; bs?: unknown }): Record<string, string> {
  const out: Record<string, string> = {};
  if (isCampaignTag(b.c)) out.c = b.c;
  if (typeof b.bs === "string" && /^[a-z0-9]{6,24}$/.test(b.bs)) out.bs = b.bs;
  return out;
}

const VALID_VALUES = new Set([6, 7, 8, 9]);

/**
 * Brakes on the painted door (PAYWALL=gift). A gift costs a model call, and a
 * free deep reading is worth scripting for: per-address bucket (6 / 10 min),
 * a per-instance daily cap (GIFT_DAILY_CAP, default 300) that bounds the
 * worst case to a known bill, and at most 5 claims a day per email.
 */
const GIFT_BUCKET = new Map<string, { n: number; t: number }>();
function giftLimited(ip: string): boolean {
  const now = Date.now();
  const b = GIFT_BUCKET.get(ip);
  if (!b || now - b.t > 10 * 60_000) {
    GIFT_BUCKET.set(ip, { n: 1, t: now });
    return false;
  }
  b.n += 1;
  return b.n > 6;
}
let giftDayKey = "";
let giftDayCount = 0;
function overGiftCap(): boolean {
  const k = new Date().toISOString().slice(0, 10);
  if (k !== giftDayKey) { giftDayKey = k; giftDayCount = 0; }
  giftDayCount += 1;
  return giftDayCount > Number(process.env.GIFT_DAILY_CAP ?? 300);
}

export async function POST(req: NextRequest) {
  if (!paywallOn()) {
    return NextResponse.json({ error: "paywall_off" }, { status: 503 });
  }

  let body: Partial<ReadingInput> & { tier?: string; locale?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const tier: Tier = body.tier === "deep" ? "deep" : "one";
  const locale = asLocale(body.locale);
  /**
   * 10-22 通卡 (lib/tongka.ts): `pass` = 1 | 7 | 30 buys a pass and this reading together — the full reading comes right
   * after payment exactly as a single deep purchase did (same metadata, same reading page), and the pass row is made
   * from the same session (lib/pass.ts fulfilPass; the reading page calls fulfilPassBySid). Only with the switch.
   */
  const tongkaOpen = await featureVisible("tongka", req.cookies.get(ADMIN_COOKIE)?.value);
  const passDays: TongkaDays | null = tier === "deep" && isTongkaDays(Number((body as { pass?: unknown }).pass)) && tongkaOpen
    ? (Number((body as { pass: number }).pass) as TongkaDays) : null;
  /**
   * 09-17, Neil: after a light reading, taking the deep one sent you back to
   * the cast page to re-type the question and the address you had just given.
   * `from` is the light reading's own session: the cast, the language and the
   * address all come from it, so the upgrade is one tap on the reading page.
   */
  const fromSid = typeof (body as { from?: unknown }).from === "string" && /^[A-Za-z0-9_-]{8,120}$/.test((body as { from: string }).from)
    ? (body as { from: string }).from : null;
  const priorRec = fromSid ? await verifyPaidSession(fromSid).catch(() => null) : null;
  // only ever an upgrade: a light reading becoming the deep one on the same cast
  const prior = priorRec && priorRec.tier === "one" && tier === "deep" ? priorRec : null;
  const scaleHint = prior?.input.scaleHint ?? parseScaleHint((body as { scaleHint?: unknown }).scaleHint);
  const topicHint = prior?.input.topicHint ?? parseTopicHint((body as { topicHint?: unknown }).topicHint);
  const situation = prior?.input.situation ?? parseSituation((body as { situation?: unknown }).situation);
  // 09-26 对照测试: the lean shown with the free line travels with the purchase (an upgrade keeps the light reading's)
  const teaserOdds = prior?.input.teaserOdds ?? parseOdds((body as { teaserOdds?: unknown }).teaserOdds);
  const viaRaw = (body as { via?: unknown }).via;
  // an upgrade keeps the referral the light reading arrived with (09-18): the panel sends no via
  const via = typeof viaRaw === "string" && /^[6789]{6}$/.test(viaRaw) ? viaRaw
    : prior?.via && /^[6789]{6}$/.test(prior.via) ? prior.via : null;
  const hintMeta = { ...(scaleHint ? { scale: scaleHint } : {}), ...(topicHint ? { topic: topicHint } : {}), ...(situation ? { sit: situation } : {}), ...(teaserOdds ? { todds: teaserOdds } : {}), ...(via ? { via } : {}) };
  const question = prior?.input.question ?? (typeof body.question === "string" ? body.question.trim() : "");
  /**
   * 09-17: `locale` is the page — the delivery URL, the Stripe page, the chrome.
   * `readingLocale` is what the reading itself gets written in, taken from the
   * language the question was typed in (see lib/question-lang).
   */
  const readingLocale = prior?.locale ?? resolveReadingLocale(question, locale, (body as { rl?: unknown }).rl);
  // 09-18: Cantonese register (decided here) and, on a re-cast the gate
  // recognised, what the reader was told last time; an upgrade keeps its own
  const extras = prior ? { register: prior.input.register, prior: prior.input.prior, ...(prior.input.qian ? { qian: prior.input.qian } : {}), ...(prior.input.pre ? { pre: prior.input.pre } : {}), ...(prior.input.solo ? { solo: true as const } : {}) } : readCastExtras(body, question, readingLocale, req.headers);
  const values = prior?.input.values ?? (Array.isArray(body.values) ? body.values : []);
  // 09-19: the free line the cast page showed — the reading must open with it; an upgrade keeps the light reading's
  const teaserRaw = prior ? prior.input.teaser : (body as { teaser?: unknown }).teaser;
  const teaserClean = typeof teaserRaw === "string" && teaserRaw.trim().length >= 6 ? teaserRaw.replace(/\s+/g, " ").trim().slice(0, 200) : null;
  // 09-22: a fallback line says what the chart's shape is, not what the call is.
  // The teaser is BINDING on the paid reading's opening sentence, and binding a
  // reading to 「这一卦没有动爻」 would make it worse — so it travels no further.
  const teaser = isFallbackTeaser(teaserClean) ? null : teaserClean;
  // the cast is the same cast — its instant travels with it, not with this request
  const castAtMs = prior?.input.castAtMs ?? (Number(body.castAtMs) || Date.now());
  const tzOffsetMinutes = prior ? prior.input.tzOffsetMinutes : Number(body.tzOffsetMinutes) || 0;
  if (question.length < 2 || question.length > 450) {
    return NextResponse.json({ error: "bad_question" }, { status: 400 });
  }
  // 09-20: the page refuses a question that names no matter; an upgrade carries a question that already passed
  if (!prior && questionIssue(question, locale)) {
    return NextResponse.json({ error: "bad_question" }, { status: 400 });
  }
  if (values.length !== 6 || !values.every((v) => VALID_VALUES.has(v as number))) {
    return NextResponse.json({ error: "bad_values" }, { status: 400 });
  }

  // 站点地址必须固定：Stripe 的回跳地址不能取决于请求来源
  // （否则从 localhost 或内网 IP 发起的支付会跳回一个用户打不开的地址）
  const origin = (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  const price = priceFor(tier);
  const productName = (l: Locale) => (passDays ? tongkaT(l).product[passDays] : price.name(l));
  // charge exactly what the page showed: the currency the client resolved, at the table price.
  // 09-18 (Neil: 「結算幣種從台幣換到了美元」): an upgrade is settled in the light
  // reading's own currency — the panel sends none, and USD was quietly filling in.
  const priorCur = prior?.currency ? String(prior.currency).toUpperCase() : null;
  // 10-02 (转化率): a FREE light reading (the newcomer's free one, a friend's invite) has no currency of its own, and its
  // upgrade panel sent none — 106 upgrades in a week fell to USD and showed US$2.99 to readers in Taipei and Hong Kong
  // (17% paid them, against ~40% of checkouts in their own money). The panel now sends what it shows; failing that,
  // the same guess the cast page makes (cookie → device clock → edge → language).
  const upgradeGuess = prior && !(priorCur && isCurrency(priorCur)) && !isCurrency((body as { currency?: unknown }).currency)
    ? detectCurrencyWithSource({
        chosen: req.cookies.get(CURRENCY_COOKIE)?.value ?? null,
        timeZone: typeof (body as { timeZone?: unknown }).timeZone === "string" ? (body as { timeZone: string }).timeZone : null,
        language: req.headers.get("accept-language"),
        edgeCountry: edgeCountry(req.headers),
      })
    : null;
  const currency: Currency = priorCur && isCurrency(priorCur) ? priorCur
    : isCurrency((body as { currency?: unknown }).currency) ? (body as { currency: Currency }).currency
    : upgradeGuess ? upgradeGuess.currency : DEFAULT_CURRENCY;
  // the first deep reading costs what a light one does — once per account, or once per browser when nobody is signed in
  const me = customerFromRequest(req);
  // 09-26 同一件事的连续性: a signed-in reader's new cast on a matter they read about in the last day continues from it
  // 10-22 分開: not when the reader said this cast is a new matter (lib/solo.ts)
  if (me && !prior && !extras.prior && !extras.solo) {
    const tp = threadPrior(me.customerId, question, topicHint);
    if (tp) { (extras as { prior?: typeof tp }).prior = tp; recordOps("thread_prior", "checkout"); }
  }
  // 09-26 邮箱校对: an address typed on the page must be deliverable (the typo question was asked on the page)
  {
    const raw = (body as { email?: unknown }).email;
    if (!me && typeof raw === "string" && raw.trim()) {
      const checked = await serverCheckEmail(raw);
      if (!checked.ok) return NextResponse.json({ error: checked.error, suggestion: checked.suggestion }, { status: 400 });
    }
  }
  /**
   * Has this person already had the first-time deep price? (09-22, Neil.)
   *
   * This used to be: signed in → look at their orders; otherwise → a browser
   * cookie. Both halves leaked.
   *
   * The live case: a member signed in as niceeva741220@yahoo.com.tw paid at
   * Stripe as marimar741220@gmail.com — same person, two addresses. The order
   * was filed under the PAYING address's customer, so the signed-in account
   * never learnt it had bought a deep reading, and she was given the first
   * price twice (14:15 and 14:32, $3.14 each; the second should have been
   * $9.99). Carrying the signed-in customer through to the order (see the
   * `cust` metadata below) closes that, and this now asks about every identity
   * we can see rather than only the session.
   */
  const emailRaw = (body as { email?: unknown }).email;
  const typedEmail = typeof emailRaw === "string" ? normalizeEmail(emailRaw) : "";
  const knownEmail = me?.email ?? (EMAIL_RE.test(typedEmail) && typedEmail.length <= 254 ? typedEmail : null) ?? prior?.email ?? null;
  // 10-02 付款后自动登录: an address typed by a browser not signed in to it — whatever this files there, sessions on
  // that address that only a payment made end (db.ts endPaySessionsOnForeign)
  if (!me && knownEmail) endPaySessionsOnForeign(customerIdByEmail(knownEmail), "checkout");
  const hadDeep =
    (me ? customerHasPaidDeep(me.customerId) : false) ||
    (knownEmail ? emailHasPaidDeep(knownEmail) : false) ||
    (!me && !knownEmail && !!req.cookies.get(FIRST_DEEP_COOKIE)?.value);
  const firstDeep = tier === "deep" && !hadDeep;
  /**
   * 09-24 M2 会员加购价: a member whose ten deep readings for the month are spent
   * pays the light price for another, not the full one — which is what the
   * whole month costs. The heaviest member used nine in two days.
   */
  const memberAddon = tier === "deep" && !firstDeep && !!me && await (async () => {
    try { const e = await entitlementFor(me.customerId); return e.active && e.deepLeft <= 0; } catch { return false; }
  })();
  // 10-22 通卡: the first 1 日通卡 of an account (or of a browser that never paid) costs the old light price
  const firstPass = passDays === 1 && (me ? firstPassEligible(me.customerId, me.email) : knownEmail ? firstPassEligible(null, knownEmail) : !req.cookies.get(FIRST_DEEP_COOKIE)?.value);
  const amount = passDays ? tongkaMinor(currency, passDays, firstPass) : priceMinor(currency, tier === "deep" && !firstDeep && !memberAddon ? "deep" : "one");
  // 10-23 进度表 109 ①: a campaign's promo (lib/promos.ts) on a pass bought with this cast — never on a first 1-day pass
  const promo = (() => {
    if (!passDays) return null;
    const v = req.cookies.get(PROMO_COOKIE)?.value?.toUpperCase();
    const pr = promoFor(isPromoCode(v) ? v : null, `pass_${passDays}`, currency, { first: firstPass });
    return pr.ok ? pr.promo : null;
  })();
  const timeZone = typeof (body as { timeZone?: unknown }).timeZone === "string" ? (body as { timeZone: string }).timeZone : null;
  // 09-18: how the page arrived at that currency, and the clock it read — kept
  // on the record so the dashboard can say "GBP ← 时区 Europe/London" instead of
  // leaving Neil to guess. An upgrade inherits the light reading's answer.
  // 09-22: an upgrade off a REAL paid reading used to find no trace here — giftTrace
  // only covers painted-door sessions — so the deep reading was recorded with no
  // reason for its currency and, worse, decided Managed Payments as if the buyer's
  // clock were unknown (orders #541/#542: same person, one minute apart, routed
  // both ways). Orders now keep their own trace, so the upgrade can inherit it.
  const priorTrace = prior
    ? (fromSid?.startsWith("gf_") ? giftTrace(fromSid.slice(3)) : fromSid ? orderTrace(fromSid) : null)
    : null;
  const curSrcRaw = priorTrace?.curSrc ?? (body as { curSrc?: unknown }).curSrc ?? upgradeGuess?.source;
  const curSrc: CurrencySource | null = isCurrencySource(curSrcRaw) ? curSrcRaw : null;
  const tzName = priorTrace?.tzName ?? (timeZone && /^[A-Za-z0-9_+\-\/]{1,40}$/.test(timeZone) ? timeZone : null);
  const edgeSeen = priorTrace?.edgeCountry ?? null;

  // The painted door: the tap on the priced button was the intent (tracked
  // client-side as reading_click); here the reading is simply granted. The
  // gift record keeps the price the button showed, so the intent can later
  // be read per market and per first-time / full price.
  if (giftMode()) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    if (giftLimited(ip)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    if (overGiftCap()) {
      recordOps("gift_cap_hit", ipTag(ip));
      return NextResponse.json({ error: "busy" }, { status: 503 });
    }
    const emailRaw = (body as { email?: unknown }).email;
    const typed = typeof emailRaw === "string" ? normalizeEmail(emailRaw) : "";
    const email = me?.email ?? (typed && EMAIL_RE.test(typed) && typed.length <= 254 ? typed : null) ?? prior?.email ?? null;
    // 09-15: the deep reading's timing revisit needs somewhere to go — the panel insists, and so does this
    if (!email && giftEmailRequired(tier)) return NextResponse.json({ error: "email_required" }, { status: 400 });
    // the launch box on the claim panel: a real opt-in, recorded on the customer row (privacy §4)
    if (email && (body as { notify?: unknown }).notify === true) {
      upsertCustomer(email, locale);
      setMarketingConsent(email, true);
    }
    // the per-address brake: five a day is a whole evening of matters, not a bill (the cast page caps each topic at three)
    if (email && giftsByEmailSince(email, Date.now() - 86_400_000) >= 5) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }
    // an upgrade happens once: a second tap (or a reload of the light page)
    // lands on the deep reading that already exists instead of minting another
    const lightToken = prior && fromSid?.startsWith("gf_") ? fromSid.slice(3) : null;
    if (lightToken) {
      const existing = giftUpgradeOf(lightToken);
      if (existing) return NextResponse.json({ url: `${origin}/${locale}/reading?sid=gf_${existing}`, gift: true, existing: true });
    }
    const token = randomBytes(18).toString("hex");
    createGift({
      token,
      tier,
      locale: readingLocale,
      currency,
      amountShown: amount,
      firstDeep,
      email,
      customerId: me?.customerId ?? null,
      via,
      upgradedFrom: lightToken,
      inputJson: JSON.stringify({
        question,
        values,
        castAtMs,
        tzOffsetMinutes,
        ...(scaleHint ? { scaleHint } : {}),
        ...(topicHint ? { topicHint } : {}),
        ...(situation ? { situation } : {}),
        ...(teaserOdds ? { teaserOdds } : {}),
        locale: readingLocale,
        ...(extras.register ? { register: extras.register } : {}),
        ...(extras.prior ? { prior: extras.prior } : {}),
        ...(extras.qian ? { qian: extras.qian } : {}),
        ...(extras.pre ? { pre: extras.pre } : {}),
        ...(extras.solo ? { solo: true } : {}),
        ...(teaser ? { teaser } : {}),
        // the page they were browsing, so the delivery and revisit mails that
        // the cron sends later land them back on the site they came from
        ...(locale !== readingLocale ? { pageLocale: locale } : {}),
        ...(curSrc ? { curSrc } : {}),
        ...(tzName ? { tzName } : {}),
        ...(browserSessionOf(body) ? { bs: browserSessionOf(body) } : {}),
      }),
    });
    return NextResponse.json({ url: `${origin}/${locale}/reading?sid=gf_${token}&fresh=1`, gift: true });
  }

  // 双边推荐 (裂变 V1 ①): a newcomer who arrived through a shared cast gets
  // the first LIGHT reading free — once per browser (cookie) or per account.
  // Real payments only: in gift mode everything is free already.
  // 09-29 裂变 P2: the invite is the first FULL reading now (was light) — the one with a date, which brings them back
  if (tier === "deep" && via && (body as { inviteFree?: unknown }).inviteFree === true) {
    // 09-27: one free first reading per person across BOTH free programs (share invite / first-light test) —
    // checked on the browser (either cookie) and on the address, signed in or not
    const inviteCid = me?.customerId ?? (knownEmail ? customerIdByEmail(knownEmail) : null);
    const eligible0 = !req.cookies.get(INVITE_COOKIE)?.value && !req.cookies.get(FREE_FIRST_COOKIE)?.value
      && (inviteCid === null || (customerOrdersCount(inviteCid) === 0 && !customerHadInviteLight(inviteCid)))
      && !(knownEmail && emailHadInviteLight(knownEmail)); // 10-18: the address, even before it has a customer row
    // 09-27 赠送审核 (Neil: 「好，你先做吧」): the same three-a-day-per-network ceiling as the first-light test,
    // shared with it — a private window and a fresh address no longer mint another. Held in memory only, never stored.
    // 09-26 (Neil: 「所有客户看解读都必须要填邮箱」): the free light reading goes to an address too
    const inviteAddr = me?.email ?? knownEmail;
    // counted only once there is an address, so the "email please" round trip does not use up a slot
    const eligible = eligible0 && (!inviteAddr || !freeLimited(req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local"));
    if (eligible && !inviteAddr) return NextResponse.json({ error: "email_required" }, { status: 400 });
    if (eligible && inviteAddr) {
      const bs = browserSessionOf(body);
      const input = JSON.stringify({ question, values, castAtMs, tzOffsetMinutes, scaleHint, topicHint, situation, teaserOdds, locale, ...extras, ...(bs ? { bs } : {}) });
      const shareRef = typeof (body as { r?: unknown }).r === "string" ? String((body as { r: string }).r) : null;
      const sid = grantInviteLight(via, input, inviteAddr, me?.customerId ?? customerIdByEmail(inviteAddr) ?? upsertCustomer(inviteAddr, locale), locale, "deep", shareRef, deviceOf(req)); // 10-18: under the person
      const res = NextResponse.json({ url: `${origin}/${locale}/reading?sid=${sid}&fresh=1`, invite: true });
      markCustomer(req, res, me?.customerId ?? upsertCustomer(inviteAddr, locale), "invite"); // 10-02/03: whose browser this is
      res.cookies.set(INVITE_COOKIE, "1", { path: "/", maxAge: 365 * 86_400, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
      return res;
    }
  }

  // 09-26 对照测试 (f1 arm): a new visitor's first light reading is free for an address. One per browser and
  // per address, never for anyone who has bought or been given one before; the email carries the reading.
  if (tier === "one" && (body as { freeFirst?: unknown }).freeFirst === true && (process.env.AB_FREE_LIGHT ?? "on") !== "off") {
    const addr = me?.email ?? knownEmail;
    if (!addr) return NextResponse.json({ error: "email_required" }, { status: 400 });
    const cid0 = me?.customerId ?? customerIdByEmail(addr);
    const used = !!req.cookies.get(FREE_FIRST_COOKIE)?.value || !!req.cookies.get(INVITE_COOKIE)?.value || emailHadInviteLight(addr) || (cid0 !== null && (customerOrdersCount(cid0) > 0 || customerHadInviteLight(cid0)));
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    if (used || freeLimited(ip)) return NextResponse.json({ error: "free_used" }, { status: 409 });
    const bs = browserSessionOf(body);
    const input = JSON.stringify({ question, values, castAtMs, tzOffsetMinutes, scaleHint, topicHint, situation, locale, ...extras, ...(bs ? { bs } : {}) });
    // 10-18: file it under the person, not just the address — the customer row exists before the grant now
    const sid = grantInviteLight("ab_free", input, addr, me?.customerId ?? cid0 ?? upsertCustomer(addr, locale), locale);
    recordOps("ab_free_light", `${locale} ${me ? "signed-in" : "guest"}`);
    const res = NextResponse.json({ url: `${origin}/${locale}/reading?sid=${sid}&fresh=1`, free: true });
    markCustomer(req, res, me?.customerId ?? cid0 ?? upsertCustomer(addr, locale), "free_first"); // 10-02/03: whose browser this is
    res.cookies.set(FREE_FIRST_COOKIE, "1", { path: "/", maxAge: 365 * 86_400, sameSite: "lax", secure: process.env.NODE_ENV === "production" });
    return res;
  }

  /**
   * A member's allowance comes before their card (09-22).
   *
   * The cast page checks entitlement itself and calls /api/sub/redeem, so the
   * ordinary path was fine. The in-place upgrade does not — `UpgradePanel`
   * posts straight here — so a member who took a light reading on her
   * membership and then tapped 「看這一卦的深斷」 was sent to Stripe and asked
   * to pay for something she already pays for every month. Two members did
   * that four times this afternoon (16:58, 17:05, 17:27, 17:42); all four
   * sessions were created, and all four were abandoned. Quite right too.
   *
   * The check belongs here rather than in the panel: this is the one door
   * every purchase goes through, so no future caller can miss it, and a
   * client-side entitlement read can be stale. A member with nothing left
   * falls through to the paid path exactly as before.
   */
  if (me) {   // paywallOn() was checked at the top of this handler
    const ent = await entitlementFor(me.customerId).catch(() => null);
    const covered = ent?.active && (tier === "deep" ? ent.deepLeft > 0 : ent.lightLeft > 0);
    if (covered) {
      const r = await redeemSubscription(me.customerId, tier, {
        question, values: values as LineValue[], castAtMs, tzOffsetMinutes,
        scaleHint, topicHint, situation, teaserOdds, locale: readingLocale, ...extras,
        ...(browserSessionOf(body) ? { bs: browserSessionOf(body) } : {}),
      });
      if (r.ok) {
        recordOps("sub_redeem_checkout", `${tier} ${fromSid ? "upgrade" : "direct"}`);
        return markCustomer(req, NextResponse.json({ url: `${origin}/${locale}/reading?sid=${r.sid}&fresh=1${ent?.pass ? "&via=pass" : ""}`, membership: true }), me.customerId, "member");
      }
      // 10-23 进度表 101: a pass holder or member at today's fair-use fuse is told so — never sent on to a price
      if (r.reason === "cap_day" || r.reason === "cap_rate") return NextResponse.json({ error: r.reason }, { status: 429 });
      // allowance ran out between the page loading and this call: pay as usual
    }
    // 09-27 (Neil: 三档要数据支撑): a member whose allowance for this tier is used up, now at the paid door — the members
    // page counts these per person, next to whether they then bought, waited for the reset, or stopped coming
    if (ent?.active && !covered) recordOps("allowance_out", `${me.customerId} ${tier}`);
  }

  /**
   * 10-23 进度表 101 (Neil: 「目前是不是还有一次深断的价格在啊」): under the 通卡 model a single light or full reading is not
   * sold any more (lib/catalog.ts retiredBy "tongka"). Four were, on 10-22 — through the address ask and the mainland note
   * on the cast page, which re-sent the tap without the pass that had been picked. Everything free above (the painted door,
   * an invite, the free first light, a member's or pass holder's own reading) has already answered; from here on only a
   * pass is paid for. A page that still asks for a single reading is told to show the pass panel.
   */
  if (!passDays && tongkaOpen && !sellable(CATALOG[tier], true)) {
    recordOps("single_retired", `${tier} ${prior ? "upgrade" : "direct"} ${me ? "signed-in" : "guest"}`);
    return NextResponse.json({ error: "retired", pass: true }, { status: 410 });
  }

  // Geo routing: Managed Payments carries the tax burden for us, but cannot sell
  // to some countries. Buyers there get a plain session instead of a hard error.
  let country: string | null = null;
  let managedPayments: boolean | undefined;
  if ((process.env.STRIPE_GEO_ROUTING ?? "on") !== "off") {
    try {
      country = await buyerCountry(req.headers);
      managedPayments = managedPaymentsAllowed(country);
    } catch {
      /* undetermined — keep the env default */
    }
  }

  let mpReason = managedPayments === false ? "cn-edge" : "default";

  // IP routing sees the network, not the buyer. Mainland users habitually sit
  // behind proxies whose exit says HK/JP/US — our edge then enables Managed
  // Payments, while Stripe's own page sees the real CN address and refuses
  // ("China is not currently supported"), with no way back but the browser's
  // back button. Observed live repeatedly. Two browser-reported signals that
  // no proxy rewrites — zh interface + UTC+8 clock — mark a likely mainland
  // buyer; HK/TW/SG Chinese ride along, and at our scale those jurisdictions
  // carry no tax burden worth the failed sales.
  const tz = tzOffsetMinutes;
  if (managedPayments !== false && isMainlandTimeZone(timeZone, locale, req.headers.get("accept-language"))) {
    managedPayments = false;
    mpReason = "cn-tz"; // the device clock says Asia/Shanghai — sharper than the offset, still proxy-proof
  } else if (managedPayments !== false && locale === "zh" && tz === 480 && !timeZone) {
    managedPayments = false;
    mpReason = "zh-utc8";
  }
  // 10-05 (Stripe Workbench review): a mainland reader behind a Polish exit, Simplified page, paying in yuan — the edge
  // saw PL, Managed Payments went on, Stripe's page refused "China is not currently supported", and they only got through
  // on the second try via the escape hatch. Yuan is never sold through Managed Payments (lib/money.ts); the currency alone
  // is reason enough to take the mainland route, whatever the clock or the exit says.
  if (managedPayments !== false && currency === "CNY") {
    managedPayments = false;
    mpReason = "cny";
  }

  // 09-26 (Neil: 「台湾、香港不走 Managed Payments」): YaoFlow's own checkout page, not Link's
  let plainRegion: string | null = null;
  if (managedPayments !== false) {
    plainRegion = plainCheckoutRegion(country ?? edgeSeen, timeZone);
    if (plainRegion) { managedPayments = false; mpReason = `plain-${plainRegion.toLowerCase()}`; }
  }

  // The buyer's own escape hatch after a failed attempt (cancel_url → pf=1).
  if ((body as { noMp?: unknown }).noMp === true) {
    managedPayments = false;
    mpReason = "optout";
  }

  // 10-04 支付宝: a mainland buyer (Managed Payments off for a mainland reason, not TW/HK) paying in CNY or USD is
  // offered Alipay by name — left to itself Stripe hid it behind the proxy it saw (Neil's own test, 10-04 21:23)
  const mainlandRoute = managedPayments === false && !plainRegion && mpReason !== "default";
  const methods = mainlandRoute && alipayPossible(stripeCurrency(currency)) ? MAINLAND_METHODS : undefined;

  // 09-21: one metadata object for both attempts — the Managed-Payments
  // fallback below used to rebuild a shorter copy and lost first_deep /
  // currency / cur_src / teaser / upgrade on the way (order #526, a DE buyer
  // paying GBP off a London clock, came back with first_deep=0 and no trace).
  const metadata = {
    tier,
    locale: readingLocale,
    ...(methods ? { methods: methods.join("+") } : {}),
    ...(prior ? { upgrade: "1" } : {}),
    ...(locale !== readingLocale ? { pageLocale: locale } : {}),
    ...(extras.register ? { register: extras.register } : {}),
    // 10-12 解籤: the lot this cast follows, as "token:num" (+ where it was drawn)
    ...(extras.qian ? { qian: `${extras.qian.token}:${extras.qian.num}${extras.qian.set ? `:${extras.qian.set}` : ""}`, ...(extras.qian.temple ? { qtemple: extras.qian.temple } : {}) } : {}),
    // 10-17 承接: the 擲筊 / tarot spread this cast follows, as "jb:<token>" | "tarot:<token>"
    ...(extras.pre ? { pre: `${extras.pre.kind}:${extras.pre.token}` } : {}),
    // 10-22 分開 (lib/solo.ts): the reader said this cast is a new matter
    ...(extras.solo ? { solo: "1" } : {}),
    question,
    values: values.join(","),
    castAtMs: String(castAtMs),
    tz: String(tzOffsetMinutes),
    ...(country ?? edgeSeen ? { country: (country ?? edgeSeen)! } : {}),
    ...(timeZone ? { tzname: timeZone.slice(0, 40) } : {}),
    currency,
    ...(curSrc ? { cur_src: curSrc } : {}),
    ...(teaser ? { teaser: teaser.slice(0, 120) } : {}),
    // 09-22: who was signed in when they paid. Stripe collects its own email
    // for the receipt, and it is not always the same person's address — the
    // order must still land on the account that bought it.
    ...(me ? { cust: String(me.customerId) } : {}),
    ...(firstDeep ? { first_deep: "1" } : {}),
    ...(memberAddon ? { member_addon: "1" } : {}),
    // 10-22 通卡 bought with this cast: the fulfil sweep and the reading page make the pass from the same session
    ...(passDays ? { kind: "pass", days: String(passDays), ...(firstPass ? { first_pass: "1" } : {}) } : {}),
    tos: LEGAL_UPDATED, // 09-25 合规: which Terms they agreed to (the consent line sits under the pay button)
    ...hintMeta,
    mp_reason: mpReason,
    ...(typeof (body as { ab?: unknown }).ab === "string" && AB_RE.test((body as { ab: string }).ab) ? { ab: (body as { ab: string }).ab } : {}),
    // 09-23: the channel and the browser session, so the order can be traced to where they came from
    ...attributionMeta(body as { c?: unknown; bs?: unknown }),
    // 10-14 进度表 49: phone or computer, in-app browser or not — the checkout board splits failures by it (no model, no version)
    dv: (() => { const g = uaSegment(req.headers.get("user-agent")); return `${g.device}:${g.app}`; })(),
    // 09-23: the launch box now sits on the paid path too; the buyer's address is only known after Stripe
    ...((body as { notify?: unknown }).notify === true ? { notify: "1" } : {}),
    // 10-12 挽回信序列: the reader ticked 「沒付完時寄信提醒我」 (lib/recover-seq.ts reads it off the session)
    ...((body as { remind?: unknown }).remind === true ? { remind: "1" } : {}),
    ...((body as { noMp?: unknown }).noMp === true ? { mp_optout: "1" } : {}),
  };
  const successUrl = `${origin}/${locale}/reading?sid={CHECKOUT_SESSION_ID}&fresh=1`;
  // backing out of an upgrade lands on the light reading, not on an empty cast page
  const cancelTo = prior ? `${origin}/${locale}/reading?sid=${encodeURIComponent(fromSid!)}` : `${origin}/${locale}/cast?q=${encodeURIComponent(question)}&pf=1`;
  // 10-15 挽回信改版 (lib/recover-offer.ts): 「返回」 passes through us so the one letter can go 5 minutes after it
  const co = newCo();
  const cancelUrl = tier === "deep" ? leftUrl(origin, co, cancelTo) : cancelTo;
  const remember = (sid: string, managedNow: boolean, methodsNow: readonly string[] | undefined, meta: Record<string, string>) => {
    if (tier !== "deep") return;
    // 10-23 进度表 101: a pass bought on this cast is remembered as a pass — the one letter and its page name the pass
    notePending({ co, sessionId: sid, kind: passDays ? "pass" : prior ? "upgrade" : "deep", email: knownEmail, remind: meta.remind === "1", locale, currency: stripeCurrency(currency), amount,
      product: productName(locale), managed: managedNow, methods: methodsNow ?? null, cardHint: !plainRegion, metadata: meta, cancelUrl: cancelTo, successUrl });
  };

  // 09-26 钱包直付 (Neil: 「第一个吧」): Apple Pay / Google Pay on our own page, for buyers already off
  // Managed Payments (TW / HK). The sheet showed an amount; if ours differs (the first price was already
  // used, say) nothing is charged and the page falls back to the ordinary checkout.
  if ((body as { wallet?: unknown }).wallet === true) {
    if (!plainRegion || !publishableKey()) return NextResponse.json({ error: "wallet_unavailable" }, { status: 409 });
    // 10-23 进度表 109 ①: the wallet sheet cannot carry a coupon — a promo sends the reader on to Stripe's page instead
    if (promo) return NextResponse.json({ error: "amount_changed", firstDeep }, { status: 409 });
    if (Number((body as { amountSeen?: unknown }).amountSeen) !== amount) return NextResponse.json({ error: "amount_changed", firstDeep }, { status: 409 });
    const we = typeof (body as { walletEmail?: unknown }).walletEmail === "string" ? String((body as { walletEmail: string }).walletEmail).trim().toLowerCase() : "";
    // 09-26 (Neil: 「後台的賬號直接顯示蘋果 ID 的郵箱」): the address they are signed in with, or typed on our page,
    // comes first — the wallet's contact address only when we have nothing from them
    const fromWallet = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(we) ? we.slice(0, 200) : null;
    const walletEmail = knownEmail ?? fromWallet;
    try {
      const pi = await createWalletIntent({ amountMinor: amount, currency: stripeCurrency(currency), email: walletEmail, description: productName(locale), metadata: { ...metadata, pay: "wallet" } });
      recordOps("wallet_intent", `${plainRegion} ${currency} ${tier}`);
      const wres = NextResponse.json({ clientSecret: pi.client_secret, sid: pi.id, firstDeep });
      // 10-02 付款后自动登录: this browser started the payment (lib/pay-login.ts)
      if (!me) armPayLogin(req, wres, pi.id);
      return wres;
    } catch (e) {
      recordOps("wallet_intent_fail", (e instanceof Error ? e.message : "?").slice(0, 200));
      return NextResponse.json({ error: "wallet_unavailable" }, { status: 409 });
    }
  }

  try {
    const open = (couponId: string | null) => createCheckoutSession({
      productName: productName(locale),
      amountCents: amount,
      currency: stripeCurrency(currency),
      successUrl,
      cancelUrl,
      locale,
      managedPayments,
      cardHint: !plainRegion,
      paymentMethodTypes: methods,
      metadata: couponId && promo ? { ...metadata, promo: promo.code } : metadata,
      // 09-25: the address asked for before a first-price deep reading (the same person, twice at the
      // first price from a fresh browser — minqiwu665, 09-22 and 09-25) rides along to Stripe's receipt
      customerEmail: !me && knownEmail ? knownEmail : null,
      couponId,
    });
    // 10-23 进度表 109 ①: with the promo's coupon when there is one; a coupon Stripe will not take never blocks the sale
    let session = await (promo ? open(promo.stripe_coupon_id).catch((e: unknown) => {
      const m = e instanceof Error ? e.message : "";
      if (!/coupon|discount/i.test(m)) throw e;
      recordOps("promo_coupon_refused", `${promo.code} pass_${passDays}: ${m.slice(0, 160)}`);
      return null;
    }) : open(null));
    const promoOn = !!(promo && session);
    if (!session) session = await open(null);
    if (!session.url) throw new Error("no checkout url");
    if (promoOn) notePromoUse({ sessionId: session.id, code: promo!.code, product: `pass_${passDays}`, currency, customerId: me?.customerId ?? null });
    remember(session.id, managedPayments !== false, methods, promoOn ? { ...metadata, promo: promo!.code } : metadata);
    // the page assumed the first price; if this address has already bought one, say so instead of redirecting
    // 10-09 (Neil: 「做第1个吧」): the page is told the session offers Alipay, so a reader it sends back unpaid hears
    // what to do when Alipay itself refused (one reader on 10-09: three tries, three declines, no reason given)
    const res = NextResponse.json({ url: payHop(req, session.url, locale), firstDeep, ...(memberAddon ? { memberAddon: true } : {}), ...(methods?.includes("alipay") ? { alipay: true } : {}), ...(passDays ? { pass: passDays, firstPass } : {}) });
    // 10-02 付款后自动登录: this browser started the payment (lib/pay-login.ts)
    if (!me) armPayLogin(req, res, session.id);
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";

    // Safety net: if Managed Payments refused this buyer's country anyway
    // (geo detection missed), retry once without it rather than lose the sale.
    if (managedPayments !== false && /not currently supported|managed_payments/i.test(msg)) {
      // 09-21: say why, so the dashboard's ops line explains the odd sessions
      recordOps("mp_fallback", `${country ?? "?"} ${currency} ${msg.slice(0, 160)}`);
      try {
        const retry = await createCheckoutSession({
          productName: productName(locale),
          amountCents: amount,
          currency: stripeCurrency(currency),
          successUrl,
          cancelUrl,
          locale,
          managedPayments: false,
          // Managed Payments refused the buyer's country (China): the same methods the mainland route names
          paymentMethodTypes: alipayPossible(stripeCurrency(currency)) ? MAINLAND_METHODS : undefined,
          metadata: { ...metadata, mp_fallback: "1" },
        });
        if (retry.url) remember(retry.id, false, alipayPossible(stripeCurrency(currency)) ? MAINLAND_METHODS : undefined, { ...metadata, mp_fallback: "1" });
        if (retry.url) { const rres = NextResponse.json({ url: payHop(req, retry.url, locale), ...(alipayPossible(stripeCurrency(currency)) ? { alipay: true } : {}) }); if (!me) armPayLogin(req, rres, retry.id); return rres; }
      } catch {
        /* fall through to the error below */
      }
    }

    return NextResponse.json({ error: "checkout_failed", detail: msg }, { status: 502 });
  }
}
