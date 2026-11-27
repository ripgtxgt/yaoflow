import { refreshAwsCost } from "@/lib/aws-cost";
import { NextRequest, NextResponse } from "next/server";
import { record } from "@/lib/analytics-server";
import { runCheckoutAudit } from "@/lib/checkout-audit";
import { warmAdmin } from "@/lib/admin-bundle";
import { warmAdminPage } from "@/lib/admin-page-reads";
import { runDataUpkeep } from "@/lib/data-upkeep";
import { featureOn } from "@/lib/features";
import { fulfilCard, runCardNotices, runTodayQianMail } from "@/lib/today-qian";
import { STRIPE_VERSION, listCheckoutSessions, receiptUrlFor, recentWalletIntents, walletEmailOf } from "@/lib/stripe";
import { runSeq } from "@/lib/recover-seq";
import { formatMoney, isCurrency } from "@/lib/money";
import { saveReceiptUrl, saveTosVersion, endPaySessionsOnForeign } from "@/lib/db";
import {
  addOrderToCustomer, castIdForSession, emailAlreadySent, recordEmail,
  recordOps, recordOrder, saveCast, saveReading, scheduleRevisit, upsertCustomer, purgeExpiredAuth, sessionTzName,
} from "@/lib/db";
import { buildReadingEmail, sendEmail } from "@/lib/email";
import { generateReadingFor } from "@/lib/generate";
import { probeProviders } from "@/lib/llm";
import { maybeGrantReferral } from "@/lib/referral";
import { cacheReading, verifyPaidSession } from "@/lib/paid-store";
import { resolveServerChart, pick } from "@/lib/reading";
import { revisitWindow } from "@/lib/revisit";
import { classifyTopic } from "@/lib/topic";
import { toHans } from "@/lib/hant";
import { hexName } from "@/lib/names";
import { asLocale } from "@/lib/locales";
import { refreshStaleSubscriptions } from "@/lib/subscription";
import { fulfilPass } from "@/lib/pass";
import { fulfilPack, notifyPackBought } from "@/lib/pack";
import { runPackOffers } from "@/lib/pack-offer";
import { runSavedFollowups, runSavedReminders } from "@/lib/saved-cast";
import { retryUnforwarded } from "@/lib/inbound";
import { supportAutoSweep } from "@/lib/support-auto";
import { runDailyMail } from "@/lib/daily-mail";
import type { CheckoutSession } from "@/lib/stripe";
import { customerIdByEmail, expireLocalSubscriptions, orphanSubUses, setSubUseVoid } from "@/lib/db";
import { fileCast, resolveSessionMatter } from "@/lib/matter-assign";
import { attachQianCast } from "@/lib/db";
import { attachPreCast } from "@/lib/pre-cast";
import { ensureQianPersonal, fulfilQianPayment, mailQianOnce } from "@/lib/qian-personal";
import { runZeriReminds } from "@/lib/mingli/calendar/zeri-remind";
import { ensureTarotPersonal, fulfilTarotPayment, mailTarotOnce, runTarotRevisits } from "@/lib/tarot-personal";
import { ensureBaziReport, fulfilBaziPayment, mailBaziOnce } from "@/lib/mingli/bazi/report";
import { ensureZiweiReport, fulfilZiweiPayment, mailZiweiOnce } from "@/lib/mingli/ziwei/report";
import { ensureAstroReport, fulfilAstroPayment, mailAstroOnce } from "@/lib/mingli/astro/report";
import { ensureHepanReport, fulfilHepanPayment, mailHepanOnce } from "@/lib/mingli/hepan/report";
import { ensureNianshu, fulfilNianshuPayment, mailNianshuOnce, mailNianshuReceivedOnce } from "@/lib/mingli/nianshu/report";
import { purgeHepanInvites } from "@/lib/mingli/hepan/invite";
import { ensureNameReport, fulfilNamePayment, mailNameOnce, pendingNameReports } from "@/lib/mingli/name/report";
import { purgeCapEvents } from "@/lib/caps";
import { runMemberLetters } from "@/lib/member-letter";
import { runMonthLetters } from "@/lib/month-letter";
import { runMilestoneLetters } from "@/lib/milestone-letter";
import { runResetMail } from "@/lib/sub-reset";
import { purgePhotos } from "@/lib/qian-photo-store";
import { runPassNotices } from "@/lib/pass-notice";
import { matterOptsFor, matterSoFar } from "@/lib/matter-context";
import { withCastThread } from "@/lib/cast-log";
import { runNudgeLearning } from "@/lib/nudge";
import { rememberCardFp, sweepCardFps } from "@/lib/card-fp";
import { maybeWeeklyReview } from "@/lib/ai-review";
import { runDailyLines } from "@/lib/daily-line";
import { refreshBooks } from "@/lib/ledger";
import { runRenewalNotices, runWinbacks } from "@/lib/retain";
import { runRecaps } from "@/lib/sub-recap";
import { runMemberRefundLetters } from "@/lib/refund-letters";
import { runRenewalReceipts } from "@/lib/sub-letters";
import { deliveryAddress } from "@/lib/mail-to";
import { refreshFx } from "@/lib/live";
import { refundSession } from "@/lib/refund";
import { fulfilFailures, orderBySession, setMarketingConsent, unfulfilledGifts } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 300;
/** 10-18: the every-minute lane leaves a checkout this young to the buyer's own page */
const FAST_LANE_GRACE_S = 120;

/**
 * Webhook-less fulfilment safety net.
 *
 * Normally the buyer's own page load generates and delivers the reading.
 * But a mainland-China buyer can pay and then fail to reach us at all
 * (cross-border route flaps — observed live on 08-31: the buyer's IPv6
 * path changed mid-flow). Money taken, nothing delivered, no email ever
 * sent. This runner closes that hole: every few minutes the server's own
 * cron lists recent paid Stripe sessions and fulfils any the page never
 * did — generate, persist, email, schedule the revisit. Idempotent: a
 * session with a cast on record is already fulfilled and is skipped.
 */
export async function POST(req: NextRequest) {
  const key = req.headers.get("x-cron-key");
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  // 10-18 (#2378, 客服：「付款到生成延迟约 9 分钟」): she paid by Stripe and never came back to our page, so the
  // reading waited for this sweep, which ran every 10 minutes. ?only=pay is the same sweep alone — no model probes,
  // no daily jobs — and cron runs it every minute. A session younger than two minutes is left to the buyer's own page
  // (normally back by then and generating), so the two do not both pay for one reading.
  const onlyPay = req.nextUrl.searchParams.get("only") === "pay";
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");

  // Probe every model host first (five tokens each): a host that is down gets
  // marked before a reader meets it, and one that has recovered is cleared (09-15).
  const probe = dry || onlyPay ? [] : await probeProviders().catch(() => []);

  // recent sessions straight from Stripe — the only trustworthy list
  const skey = process.env.STRIPE_SECRET_KEY;
  if (!skey) return NextResponse.json({ error: "no stripe key" }, { status: 500 });
  const res = await fetch(
    `https://api.stripe.com/v1/checkout/sessions?limit=20&created[gte]=${Math.floor(Date.now() / 1000) - 48 * 3600}`,
    { headers: { Authorization: `Bearer ${skey}`, "Stripe-Version": STRIPE_VERSION }, signal: AbortSignal.timeout(20_000) },
  );
  if (!res.ok) return NextResponse.json({ error: `stripe ${res.status}` }, { status: 502 });
  const sessions = ((await res.json()) as { data: { id: string; payment_status: string; mode?: string; created: number; payment_intent?: string | null; amount_total?: number | null; currency?: string | null; customer_details?: { email?: string | null } | null; metadata?: Record<string, string> }[] }).data;

  // 09-26 钱包直付: Apple Pay / Google Pay payments on our own page are PaymentIntents, not sessions — same sweep
  try {
    for (const p of await recentWalletIntents(Math.floor(Date.now() / 1000) - 48 * 3600)) {
      sessions.push({ id: p.id, payment_status: "paid", mode: "payment", created: p.created, payment_intent: p.id, amount_total: p.amount_received, currency: p.currency, customer_details: { email: walletEmailOf(p) }, metadata: p.metadata });
    }
  } catch (e) { recordOps("wallet_sweep_fail", (e instanceof Error ? e.message : "?").slice(0, 160)); }

  const results: { sid: string; status: string }[] = [];
  for (const s of sessions) {
    if (s.payment_status !== "paid") continue;
    if (onlyPay && Date.now() / 1000 - s.created < FAST_LANE_GRACE_S) continue;
    if (s.mode === "subscription") continue; // plan checkouts carry no cast; the subscription mirror owns them
    // 09-26 会员单月: a paid month, not a reading — record it if the buyer's own return did not
    if (s.metadata?.kind === "pass") {
      if (!dry) {
        const r = await fulfilPass(s as unknown as CheckoutSession).catch(() => null);
        results.push({ sid: s.id.slice(-8), status: r?.ok ? (r.created ? "pass_recorded" : "pass_known") : `pass_${r ? r.why : "error"}` });
      }
      // 10-22 通卡 bought with a cast (metadata.values): the reading below is still owed, like any paid deep reading
      if (!s.metadata?.values) continue;
    }
    // 09-29 会员增购包: bought readings, not a reading — record them if the buyer's own return did not
    if (s.metadata?.kind === "pack") {
      if (!dry) {
        let r: ReturnType<typeof fulfilPack> | null = null;
        try { r = fulfilPack(s as unknown as CheckoutSession); } catch { r = null; }
        // 09-29: the confirmation letter — once per pack, whichever path recorded it
        if (r?.ok) await notifyPackBought(r.row).catch(() => false);
        results.push({ sid: s.id.slice(-8), status: r?.ok ? (r.created ? "pack_recorded" : "pack_known") : `pack_${r ? r.why : "error"}` });
      }
      continue;
    }
    // 10-14 进度表 50 籤卡: thirty days of the full 今日一籤 — record it if the buyer's own return did not
    if (s.metadata?.kind === "qiancard") {
      if (!dry) {
        let r: ReturnType<typeof fulfilCard> | null = null;
        try { r = fulfilCard(s as unknown as CheckoutSession); } catch { r = null; }
        results.push({ sid: s.id.slice(-8), status: r?.ok ? (r.created ? "qcard_recorded" : "qcard_known") : `qcard_${r ? r.why : "error"}` });
      }
      continue;
    }
    // 10-12 解籤: a lot's personal reading, not a cast — marked paid, written, and the link mailed if the buyer did not come back
    if (s.metadata?.kind === "qian") {
      if (!dry) {
        const r = fulfilQianPayment(s as unknown as CheckoutSession);
        // 10-14: the letter once per lot, whoever recorded the payment first (lib/qian-personal.ts mailQianOnce)
        if (r.ok) {
          const body = await ensureQianPersonal(r.token).catch(() => null);
          if (body) await mailQianOnce(r.token, site).catch(() => null);
        }
        results.push({ sid: s.id.slice(-8), status: r.ok ? (r.created ? "qian_recorded" : "qian_known") : `qian_${r.why}` });
      }
      continue;
    }
    // 10-16 进度表 68 塔羅: the spread's personal reading — marked paid, written, the link mailed if the buyer did not come back
    if (s.metadata?.kind === "tarot") {
      if (!dry) {
        const r = fulfilTarotPayment(s as unknown as CheckoutSession);
        if (r.ok) {
          const body = await ensureTarotPersonal(r.token).catch(() => null);
          if (body) await mailTarotOnce(r.token, site).catch(() => null);
        }
        results.push({ sid: s.id.slice(-8), status: r.ok ? (r.created ? "tarot_recorded" : "tarot_known") : `tarot_${r.why}` });
      }
      continue;
    }
    // 10-18 八字④ 流年報告: marked paid, written, the link mailed if the buyer did not come back
    if (s.metadata?.kind === "bazi") {
      if (!dry) {
        const r = fulfilBaziPayment(s as unknown as CheckoutSession);
        if (r.ok) {
          const body = await ensureBaziReport(r.token).catch(() => null);
          if (body) await mailBaziOnce(r.token, site).catch(() => null);
        }
        results.push({ sid: s.id.slice(-8), status: r.ok ? (r.created ? "bazi_recorded" : "bazi_known") : `bazi_${r.why}` });
      }
      continue;
    }
    // 10-20 紫微年書: marked paid, written, the link mailed if the buyer did not come back
    if (s.metadata?.kind === "ziwei") {
      if (!dry) {
        const r = fulfilZiweiPayment(s as unknown as CheckoutSession);
        if (r.ok) {
          const body = await ensureZiweiReport(r.token).catch(() => null);
          if (body) await mailZiweiOnce(r.token, site).catch(() => null);
        }
        results.push({ sid: s.id.slice(-8), status: r.ok ? (r.created ? "ziwei_recorded" : "ziwei_known") : `ziwei_${r.why}` });
      }
      continue;
    }
    // 10-20 星盤年報: marked paid, written, the link mailed if the buyer did not come back
    if (s.metadata?.kind === "astro") {
      if (!dry) {
        const r = fulfilAstroPayment(s as unknown as CheckoutSession);
        if (r.ok) {
          const body = await ensureAstroReport(r.token).catch(() => null);
          if (body) await mailAstroOnce(r.token, site).catch(() => null);
        }
        results.push({ sid: s.id.slice(-8), status: r.ok ? (r.created ? "astro_recorded" : "astro_known") : `astro_${r.why}` });
      }
      continue;
    }
    // 10-20 合盤報告: marked paid, written, the link mailed if the buyer did not come back
    if (s.metadata?.kind === "hepan") {
      if (!dry) {
        const r = fulfilHepanPayment(s as unknown as CheckoutSession);
        if (r.ok) {
          const body = await ensureHepanReport(r.token).catch(() => null);
          if (body) await mailHepanOnce(r.token, site).catch(() => null);
        }
        results.push({ sid: s.id.slice(-8), status: r.ok ? (r.created ? "hepan_recorded" : "hepan_known") : `hepan_${r.why}` });
      }
      continue;
    }
    // 10-29 进度表 122 寶寶取名參考／改名參考: marked paid, written, the link mailed
    if (s.metadata?.kind === "name") {
      if (!dry) {
        const r = fulfilNamePayment(s as unknown as CheckoutSession);
        if (r.ok) {
          const body = await ensureNameReport(r.token).catch(() => null);
          if (body) await mailNameOnce(r.token, site).catch(() => null);
        }
        results.push({ sid: s.id.slice(-8), status: r.ok ? (r.created ? "name_recorded" : "name_known") : `name_${r.why}` });
      }
      continue;
    }
    // 10-21 三合一年書: marked paid; the four parts take minutes, so the writing runs on and the link is mailed when done
    if (s.metadata?.kind === "nianshu") {
      if (!dry) {
        const r = fulfilNianshuPayment(s as unknown as CheckoutSession);
        // 10-23 进度表 111 ③: 「收到了，寫好就寄給你」 first (it says nothing once the writing is done)
        if (r.ok) await mailNianshuReceivedOnce(r.token, site).catch(() => null);
        if (r.ok) void ensureNianshu(r.token).then((b) => (b ? mailNianshuOnce(r.token, site) : null)).catch(() => null);
        results.push({ sid: s.id.slice(-8), status: r.ok ? (r.created ? "nianshu_recorded" : "nianshu_known") : `nianshu_${r.why}` });
      }
      continue;
    }
    if (castIdForSession(s.id) !== null) {
      results.push({ sid: s.id.slice(-8), status: "already_fulfilled" });
      continue;
    }
    if (orderBySession(s.id)?.payment_state === "refunded") {
      results.push({ sid: s.id.slice(-8), status: "refunded" });
      continue;
    }
    if (dry) {
      results.push({ sid: s.id.slice(-8), status: "would_fulfill" });
      continue;
    }

    try {
      const rec = await verifyPaidSession(s.id);
      if (!rec) {
        results.push({ sid: s.id.slice(-8), status: "verify_failed" });
        continue;
      }
      // 09-29 「一件事」: same filing as the reading page, decided once per session
      const soFar1 = rec.reading ? undefined : await (async () => {
        const mid = await resolveSessionMatter(s.id, rec.customerId ?? (rec.email ? customerIdByEmail(rec.email) : null), rec.input.question, rec.input.topicHint, rec.locale, rec.input.solo).catch(() => null);
        const mo = matterOptsFor(rec.input, true);
        return withCastThread(s.id, rec, mid ? matterSoFar(mid, { sessions: [s.id] }, rec.locale, mo) : undefined, mo); // 10-03 起卦记录 · 10-04 时效
      })();
      const reading = rec.reading ?? (await generateReadingFor(s.id, rec.tier, soFar1 ? { ...rec.input, matterSoFar: soFar1 } : rec.input, true, rec.locale));
      cacheReading(s.id, reading);

      const chart = resolveServerChart(rec.input, true);
      // 10-30: the account signed in at checkout first, as the reading page does (it used to file by Stripe's address)
      const customerId = rec.customerId ?? (rec.email ? upsertCustomer(rec.email, rec.locale) : null);
      if (!rec.customerId) endPaySessionsOnForeign(customerId, "poller");
      const mailTo = deliveryAddress(rec); // 10-30 (lib/mail-to.ts) // 10-02, as on the reading page
      // 10-18 (#1928 10-12: one payment, six casts and six readings): every caller waiting on the one generation used to write
      // its own copy when it woke up — the page may have written this one while the sweep was waiting
      if (castIdForSession(s.id) !== null) { results.push({ sid: s.id.slice(-8), status: "already_fulfilled" }); continue; }
      const castId = saveCast({
        customerId,
        castAtMs: rec.input.castAtMs,
        tzOffsetMinutes: rec.input.tzOffsetMinutes,
        locale: rec.locale,
        question: rec.input.question,
        topic: rec.input.topicHint ?? classifyTopic(toHans(rec.input.question)),
        values: rec.input.values,
        chart: chart as unknown as Record<string, unknown>,
        tzName: sessionTzName(s.id), // 09-26 客户时区
      });
      saveReading(castId, customerId, rec.tier, rec.locale, reading);
      fileCast(castId, s.id, customerId, rec.input.question, rec.input.topicHint ?? classifyTopic(toHans(rec.input.question)), rec.locale, rec.input.solo);
      if (rec.input.qian) attachQianCast(rec.input.qian.token, castId); // 10-12 解籤: the lot and this cast, one matter
      attachPreCast(rec.input.pre, castId); // 10-17 承接: the 擲筊 / tarot spread and this cast, one matter
      recordOrder({
        sessionId: s.id, customerId, castId, tier: rec.passDays ? `pass_${rec.passDays}d` : rec.tier, // 10-22 通卡 with a cast
        amountCents: rec.amountCents ?? null, currency: rec.currency ?? null,
        email: rec.email ?? null, status: "paid", via: rec.via ?? null, firstDeep: rec.firstDeep === true,
        paymentIntent: rec.paymentIntent ?? null,
        curSrc: rec.curSrc ?? null, tzName: rec.tzName ?? null, edgeCountry: rec.edgeCountry ?? null,
        campaign: rec.campaign ?? null, browserSid: rec.browserSid ?? null, memberAddon: rec.memberAddon ?? false,
      });
      if (rec.amountCents) rememberCardFp(s.id); // 10-07 首次付费保证补洞: the payment method's identifier, in the background
      if (rec.notify && rec.email) setMarketingConsent(rec.email, true);
      if (customerId && rec.amountCents) addOrderToCustomer(customerId, rec.amountCents);
      // 推荐奖励: the cron path must grant too, or a stranded-then-swept purchase would skip the sharer
      await maybeGrantReferral({ via: rec.via, referredCustomerId: customerId, referredEmail: rec.email ?? null, referredSessionId: s.id });

      saveTosVersion(s.id, rec.tosVer); // 09-25 合规
      // 09-25 收据: Stripe's receipt page for this charge, kept on the order and put in the delivery mail
      const receiptUrl = rec.amountCents ? await receiptUrlFor(rec.paymentIntent ?? null) : null;
      if (receiptUrl) saveReceiptUrl(s.id, receiptUrl);
      const cur = (rec.currency ?? "").toUpperCase();
      const receipt = receiptUrl && rec.amountCents && isCurrency(cur) ? { amount: formatMoney(cur, rec.amountCents, rec.locale), url: receiptUrl } : null;
      if (mailTo && !emailAlreadySent(s.id, "reading")) {
        const body = reading as unknown as Record<string, Record<string, string>>;
        const head = body.verdict ?? body.summary;
        const mail = buildReadingEmail({
          receipt,
          termsUrl: `${site}/${rec.pageLocale ?? rec.locale}/terms`,
          locale: rec.locale,
          tier: rec.tier,
          question: rec.input.question,
          values: rec.input.values,
          hexName: hexName(chart.cast.primary, rec.locale),
          changedName: chart.cast.changed
            ? hexName(chart.cast.changed, rec.locale)
            : null,
          headline: head ? pick(head, rec.locale) : "",
          url: `${site}/${rec.pageLocale ?? rec.locale}/reading?sid=${encodeURIComponent(s.id)}`,
          giftUrl: null, // 09-27: offered at the revisit's "came true", not on delivery
        });
        const sent = await sendEmail(mailTo, mail.subject, mail.html, mail.text, { kind: "reading", sessionId: s.id, customerId });
        recordEmail(s.id, "reading", mailTo, sent.ok ? "sent" : "failed", sent.error ?? sent.id);
      }

      if (mailTo && rec.tier === "deep") { // the light tier tells no time — no revisit (09-17)
        const w = revisitWindow(rec.tier, reading, rec.input.question, rec.input.scaleHint, new Date(rec.input.castAtMs));
        scheduleRevisit({
          sessionId: s.id, castId, customerId, email: mailTo,
          locale: rec.locale, tier: rec.tier, castAtMs: rec.input.castAtMs,
          windowDays: w.days, timingQuote: w.quote, question: rec.input.question, checkpoints: w.checkpoints,
        });
      }

      record({ t: Date.now(), e: "purchase", s: s.id.slice(-12), locale: rec.locale, tier: rec.tier, path: "/fulfill", method: "paid", ...(rec.campaign ? { c: rec.campaign } : {}) });
      results.push({ sid: s.id.slice(-8), status: "fulfilled" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "?";
      results.push({ sid: s.id.slice(-8), status: `failed:${msg.slice(0, 80)}` });
      recordOps("fulfil_fail", `${s.id} ${msg.slice(0, 200)}`);
      // ③ The one refund the terms promise: paid, and no reading ever came.
      // Three sweeps (~30 min) of failure on a session at least 30 minutes
      // old → money back, apology sent, row marked so no sweep tries again.
      const ageMs = Date.now() - s.created * 1000;
      if (fulfilFailures(s.id) >= 3 && ageMs >= 30 * 60 * 1000 && !dry) {
        const locale = asLocale(s.metadata?.locale ?? null);
        const r = await refundSession({
          sessionId: s.id, reason: "technical_failure", by: "sweep",
          fallback: {
            tier: s.metadata?.tier === "deep" ? "deep" : "one",
            amountCents: s.amount_total ?? null, currency: s.currency ?? null,
            email: s.customer_details?.email ?? null, locale,
            paymentIntent: typeof s.payment_intent === "string" ? s.payment_intent : null,
          },
        });
        recordOps(r.ok ? "auto_refund" : "auto_refund_fail", `${s.id} ${r.ok ? r.amountLabel ?? "" : r.error ?? ""}`);
        results.push({ sid: s.id.slice(-8), status: r.ok ? "auto_refunded" : `auto_refund_failed:${(r.error ?? "").slice(0, 60)}` });
      }
    }
  }

  // Painted-door claims the page could not fulfil — a model outage, a closed
  // tab (09-15: a Taiwanese reader lost ten deep readings in a row to a
  // DeepSeek outage and had no email for us to send them to later). A few per
  // sweep, oldest first, ten minutes after the claim so the page's own attempt
  // is over, at most three tries per claim; the first failure ends the batch,
  // because it almost always means the model is still down.
  const gifts: { sid: string; status: string }[] = [];
  if (!dry) {
    for (const token of unfulfilledGifts(10 * 60_000, 48 * 3_600_000, 3)) {
      const sid = `gf_${token}`;
      if (fulfilFailures(sid) >= 3) continue;
      try {
        const rec = await verifyPaidSession(sid);
        if (!rec) { gifts.push({ sid: sid.slice(-8), status: "verify_failed" }); continue; }
        const soFar2 = rec.reading ? undefined : await (async () => {
          const mid = await resolveSessionMatter(sid, rec.customerId ?? (rec.email ? customerIdByEmail(rec.email) : null), rec.input.question, rec.input.topicHint, rec.locale, rec.input.solo).catch(() => null);
          const mo = matterOptsFor(rec.input, true);
          return withCastThread(sid, rec, mid ? matterSoFar(mid, { sessions: [sid] }, rec.locale, mo) : undefined, mo); // 10-03 起卦记录 · 10-04 时效
        })();
        const reading = rec.reading ?? (await generateReadingFor(sid, rec.tier, soFar2 ? { ...rec.input, matterSoFar: soFar2 } : rec.input, true, rec.locale));
        cacheReading(sid, reading);
        const chart = resolveServerChart(rec.input, true);
        const customerId = rec.customerId ?? (rec.email ? upsertCustomer(rec.email, rec.locale) : null);
        if (!rec.customerId) endPaySessionsOnForeign(customerId, "poller_gift"); // 10-02, as on the reading page
        if (castIdForSession(sid) !== null) { gifts.push({ sid: sid.slice(-8), status: "already_fulfilled" }); continue; } // 10-18, as above
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
        recordOrder({
          sessionId: sid, customerId, castId, tier: rec.tier,
          amountCents: rec.amountCents ?? null, currency: rec.currency ?? null,
          email: rec.email ?? null, status: "gift", via: rec.via ?? null, firstDeep: rec.firstDeep === true,
        });
        const mailTo2 = deliveryAddress(rec); // 10-30 (lib/mail-to.ts)
        if (mailTo2 && !emailAlreadySent(sid, "reading")) {
          const body = reading as unknown as Record<string, Record<string, string>>;
          const head = body.verdict ?? body.summary;
          const mail = buildReadingEmail({
            locale: rec.locale, tier: rec.tier, question: rec.input.question, values: rec.input.values,
            hexName: hexName(chart.cast.primary, rec.locale),
            changedName: chart.cast.changed ? hexName(chart.cast.changed, rec.locale) : null,
            headline: head ? pick(head, rec.locale) : "",
            url: `${site}/${rec.pageLocale ?? rec.locale}/reading?sid=${encodeURIComponent(sid)}`,
            giftUrl: null,
          });
          const sent = await sendEmail(mailTo2, mail.subject, mail.html, mail.text, { kind: "reading", sessionId: sid, customerId });
          recordEmail(sid, "reading", mailTo2, sent.ok ? "sent" : "failed", sent.error ?? sent.id);
        }
        if (mailTo2 && rec.tier === "deep") { // deep only (09-17)
          const w = revisitWindow(rec.tier, reading, rec.input.question, rec.input.scaleHint, new Date(rec.input.castAtMs));
          scheduleRevisit({
            sessionId: sid, castId, customerId, email: mailTo2,
            locale: rec.locale, tier: rec.tier, castAtMs: rec.input.castAtMs,
            windowDays: w.days, timingQuote: w.quote, question: rec.input.question, checkpoints: w.checkpoints,
          });
        }
        record({ t: Date.now(), e: "gift", s: sid.slice(-12), locale: rec.locale, tier: rec.tier, path: "/fulfill", cur: rec.currency ? rec.currency.toUpperCase() : undefined });
        gifts.push({ sid: sid.slice(-8), status: "fulfilled" });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "?";
        recordOps("fulfil_fail", `${sid} ${msg.slice(0, 200)}`);
        gifts.push({ sid: sid.slice(-8), status: `failed:${msg.slice(0, 80)}` });
        break;
      }
    }
  }

  // the same 10-minute heartbeat keeps the subscription mirror honest and sweeps dead sessions
  if (onlyPay) return NextResponse.json({ onlyPay, done: results.filter((r) => r.status !== "already_fulfilled"), gifts });

  let subsRefreshed = 0;
  if (!dry) {
    try { subsRefreshed = await refreshStaleSubscriptions(); } catch { /* reported per row */ }
    // 09-26: comp_ / pass_ rows have no Stripe object to tell us they ended
    try { const n = expireLocalSubscriptions(); if (n) recordOps("local_sub_expired", `${n}`); } catch { /* next run */ }
    // 09-26 每日三卦: the morning letter, once the subscriber's own clock passes 07:00
    try { await runDailyMail(); } catch (e) { recordOps("daily_mail", `run failed: ${e instanceof Error ? e.message : "?"}`); }
    // 09-23 挽回: the one letter, three days before a cancelled membership ends
    try { await runWinbacks(); } catch (e) { recordOps("retain_winback", `run failed: ${e instanceof Error ? e.message : "?"}`); }
    // 09-25 合规: yearly members hear about the coming charge ~30 days ahead
    try { await runRenewalNotices(); } catch (e) { recordOps("sub_renew_notice", `run failed: ${e instanceof Error ? e.message : "?"}`); }
    // 09-26: three days before a monthly renewal, the month-in-review letter
    try { await runRecaps(); } catch (e) { recordOps("sub_recap", `run failed: ${e instanceof Error ? e.message : "?"}`); }
    // 10-23 进度表 111 ②: money back on a membership — the member's letter, five minutes after Stripe said so
    try { await runMemberRefundLetters(); } catch (e) { recordOps("refund_member_letter", `run failed: ${e instanceof Error ? e.message : "?"}`); }
    // 10-24 (Neil: 「然后续费为什么没有发邮件呢」): a renewal that went through — our letter, once its bill is paid
    try { await runRenewalReceipts(); } catch (e) { recordOps("sub_renewed", `run failed: ${e instanceof Error ? e.message : "?"}`); }
    // 09-29 会员增购包邮件: members down to 2 or fewer of the period's full readings — only with PACK_OFFER_AUTO=on
    try { await runPackOffers(); } catch (e) { recordOps("pack_offer", `run failed: ${e instanceof Error ? e.message : "?"}`); }
    // 10-02 存到信箱: the one reminder a day after a reader saved their cast, and the 30-day purge
    try { await runSavedFollowups(); } catch (e) { recordOps("saved_followup", `run failed: ${e instanceof Error ? e.message : "?"}`); }
    // 10-12 挽回信序列 (lib/recover-seq.ts): once an hour (the first run past the hour) — the checkouts of the last six days
    // 10-15 挽回信改版: once the new one-letter offer is open to everyone (lib/recover-offer.ts), the old sequence stops
    if (!dry && new Date().getUTCMinutes() < 10 && (process.env.RECOVER_SEQ ?? "on") !== "off" && !featureOn("recover-offer")) {
      try { await runSeq(await listCheckoutSessions(Math.floor(Date.now() / 1000) - 6 * 86_400), site); } catch (e) { recordOps("recover_seq", `run failed: ${e instanceof Error ? e.message : "?"}`); }
    }
    // 10-14 进度表 42 单月会员到期提醒 (lib/pass-notice.ts): once an hour; the letter itself waits for 9:00–21:00 Taipei
    if (!dry && new Date().getUTCMinutes() < 10 && (process.env.PASS_NOTICE ?? "on") !== "off") {
      try { const r = await runPassNotices(); if (r.sent || r.failed || r.skipped) recordOps("pass_notice_run", JSON.stringify(r)); } catch (e) { recordOps("pass_notice", `run failed: ${e instanceof Error ? e.message : "?"}`); }
    }
    // 10-22 會員每日信 (lib/member-letter.ts): members' 07:30 letter — before the 今日一籤 letter, which then stays quiet for them
    if ((process.env.MEMBER_LETTER ?? "on") !== "off" && featureOn("tongka")) {
      try { const r = await runMemberLetters(); if (r.sent || r.failed) recordOps("member_letter_run", JSON.stringify(r)); } catch (e) { recordOps("member_letter", `run failed: ${e instanceof Error ? e.message : "?"}`); }
      // 10-22 每月流月信 (lib/month-letter.ts): the first three days of a month, a few members per sweep (one model call each)
      try { const r = await runMonthLetters(); if (r.sent || r.failed) recordOps("month_letter_run", JSON.stringify(r)); } catch (e) { recordOps("month_letter", `run failed: ${e instanceof Error ? e.message : "?"}`); }
    }
    // 10-22 进度表 75 ⑦ 回來的日子 (lib/milestone-letter.ts): 大運交接 (members) and 年書關鍵月 (year-book buyers) — once each, no model
    if ((process.env.MILESTONE_LETTER ?? "on") !== "off") {
      try { await runMilestoneLetters(); } catch (e) { recordOps("milestone_letter", `run failed: ${e instanceof Error ? e.message : "?"}`); }
    }
    // 10-14 进度表 50 今日一籤: the 07:30 letter for those who turned it on, and the one letter 3 days before a 籤卡 ends
    if ((process.env.TODAY_QIAN_MAIL ?? "on") !== "off" && featureOn("today-qian")) {
      try { const r = await runTodayQianMail(); if (r.sent || r.failed) recordOps("today_qian_mail", JSON.stringify(r)); } catch (e) { recordOps("today_qian_mail", `run failed: ${e instanceof Error ? e.message.slice(0, 120) : "?"}`); }
    }
    if (new Date().getUTCMinutes() < 10) {
      try { const r = await runCardNotices(); if (r.sent || r.skipped) recordOps("qian_card_notice", JSON.stringify(r)); } catch (e) { recordOps("qian_card_notice", `run failed: ${e instanceof Error ? e.message.slice(0, 120) : "?"}`); }
    }
    // 10-16 进度表 68 塔羅到期回訪: the letters whose day the reader chose has come (once an hour; each once)
    if (!dry && new Date().getUTCMinutes() < 10) {
      try { await runTarotRevisits(site); } catch (e) { recordOps("tarot_revisit", `run failed: ${e instanceof Error ? e.message.slice(0, 120) : "?"}`); }
    }
    // 10-17 进度表 70 擇日「提醒我這一天」: the day-before letters (from 09:00 Taipei; each once)
    if (!dry && new Date().getUTCMinutes() < 10) {
      try { await runZeriReminds(site); } catch (e) { recordOps("zeri_remind", `run failed: ${e instanceof Error ? e.message.slice(0, 120) : "?"}`); }
    }
    // 10-15 进度表 60: event log upkeep — backfill, daily roll-up, monthly archive (lib/data-upkeep.ts)
    if (!dry) { try { runDataUpkeep(); } catch { /* logged inside */ } }
    // 10-14 后台变卡: recompute the /admin overview's event readings for its three windows, so a click never waits on them
    if (!dry) { try { warmAdmin(); } catch (e) { recordOps("admin_warm", `failed: ${e instanceof Error ? e.message.slice(0, 120) : "?"}`); } }
    // 10-30: and the overview's own cached readings (客户来源、解籤、钱、交付…), so a click after a quiet half hour never computes them
    if (!dry) { try { warmAdminPage(); } catch (e) { recordOps("admin_warm", `page failed: ${e instanceof Error ? e.message.slice(0, 120) : "?"}`); } }
    // 10-14 进度表 49 结账失败原因看板 (lib/checkout-audit.ts): the last three days re-read from Stripe once an hour (read-only)
    if (!dry && new Date().getUTCMinutes() < 10 && (process.env.CHECKOUT_AUDIT ?? "on") !== "off") {
      await runCheckoutAudit();
    }
    // 10-14 拍照找籤留存: photos older than 30 days go (lib/qian-photo-store.ts), checked once an hour
    if (!dry && new Date().getUTCMinutes() < 10) {
      try { const n = purgePhotos(); if (n) recordOps("qian_photo_purge", `${n}`); } catch (e) { recordOps("qian_photo_purge", `failed ${e instanceof Error ? e.message : "?"}`); }
      // 10-29 进度表 122: a paid 取名／改名參考 whose writing stopped half way is picked up again
      try { for (const t of pendingNameReports()) void ensureNameReport(t).then((b) => (b ? mailNameOnce(t, site) : null)).catch(() => null); } catch { /* next sweep */ }
      // 10-21 合盤邀請: the facts kept for an inviter go after 30 days
      try { const n = purgeHepanInvites(); if (n) recordOps("hepan_invite_purge", `${n}`); } catch (e) { recordOps("hepan_invite_purge", `failed: ${e instanceof Error ? e.message : "?"}`); }
      // 10-22 通卡 fair-use counters: 35 days is plenty
      try { purgeCapEvents(); } catch (e) { recordOps("cap_purge", `failed: ${e instanceof Error ? e.message : "?"}`); }
    }
    // 10-14 会员额度刷新提醒 (lib/sub-reset.ts): once an hour, like the sequence above
    if (!dry && new Date().getUTCMinutes() < 10 && (process.env.SUB_RESET_MAIL ?? "on") !== "off") {
      try { await runResetMail(); } catch (e) { recordOps("sub_reset", `run failed: ${e instanceof Error ? e.message : "?"}`); }
    }
    // 10-12 B②: the date letters for matters kept on their 3rd–4th cast
    try { await runSavedReminders(); } catch (e) { recordOps("saved_remind", `run failed: ${e instanceof Error ? e.message : "?"}`); }
    // 10-03 起卦记录 / 付费话术学习: the 365-day purge, retiring clear losers, the weekly drafts (lib/nudge.ts)
    try { const n = await runNudgeLearning(); if (n) recordOps("nudge_learning", n.slice(0, 200)); } catch (e) { recordOps("nudge_learning", `run failed: ${e instanceof Error ? e.message : "?"}`); }
    // 10-07 首次付费保证补洞: payment method identifiers for the orders that lack one — new ones, and the history newest first
    if (!dry) { try { await sweepCardFps(30, 20_000); } catch (e) { recordOps("card_fp_sweep", `run failed: ${e instanceof Error ? e.message : "?"}`); } }
    // 10-03 AI 每周分析: once a week the model reads the cast log journey by journey (lib/ai-review.ts) — in the background
    try { const r = maybeWeeklyReview(); if (r) recordOps("ai_review_cron", r.slice(0, 200)); } catch (e) { recordOps("ai_review_cron", `failed: ${e instanceof Error ? e.message : "?"}`); }
    // 09-29 客服来信: a letter kept but whose forward failed gets another try
    try { await retryUnforwarded(); } catch (e) { recordOps("support_forward_fail", `retry failed: ${e instanceof Error ? e.message : "?"}`); }
    // 10-18 客服实时自动处理: letters the live run never got to (a restart mid-way) are worked through here
    try { const n = await supportAutoSweep(); if (n) recordOps("support_auto", `sweep handled ${n}`); } catch (e) { recordOps("support_auto_fail", `sweep: ${e instanceof Error ? e.message.slice(0, 160) : "?"}`); }
    // 09-29 今日一卦: members' notes for today, written ahead of their morning visit
    try { const n = await runDailyLines(); if (n) recordOps("daily_lines", `${n}`); } catch (e) { recordOps("daily_lines", `run failed: ${e instanceof Error ? e.message : "?"}`); }
    // 09-29 对账: a member unit that never produced a reading (double tap, a page never opened) goes back to the allowance
    try {
      for (const o of orphanSubUses()) {
        if (setSubUseVoid(o.id, "30 分钟内没有生成解读，额度自动退回")) recordOps("sub_use_void", `${o.customer_id} #${o.id} ${o.tier}`);
      }
    } catch { /* next tick */ }
    try { purgeExpiredAuth(); } catch { /* next tick */ }
    try { await refreshFx(); } catch { /* keeps the last rates */ }
    // the books, on a clock rather than on whoever happens to open the finance page
    try {
      const books = await refreshBooks();
      if (books.ran && (books.saved > 0 || books.failed > 0)) recordOps("books_sync", `txns=${books.saved} ledger=${books.done}/${books.done + books.failed}`);
    } catch (e) {
      recordOps("books_sync_fail", e instanceof Error ? e.message.slice(0, 160) : "unknown");
    }
    // 09-27: the AWS bill (Cost Explorer), at most every 12 hours
    try { await refreshAwsCost(); } catch { /* next tick */ }
  }
  if (!dry) recordOps("cron_fulfill", `checked=${results.length} subs=${subsRefreshed}${gifts.length ? ` gifts=${gifts.map((g) => g.status).join(",")}` : ""} probe=${probe.map((p) => `${p.name}:${p.ok ? p.ms + "ms" : "DOWN"}`).join(",") || "none"}`);
  return NextResponse.json({ dry, results, gifts, subsRefreshed, probe });
}
