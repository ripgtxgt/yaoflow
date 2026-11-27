import { claimWelcome, customerEmailById, customerLocaleById, db, guaranteeCheck, GUARANTEE_PIECES, latestPassOrderSid, recordOps, unclaimWelcome, type SubscriptionRow } from "./db";
import { buildMemberWelcomeEmail, buildPassOpenEmail, sendEmail } from "./email";
import { GIFT_POOL_CAP } from "./membership";
import { GIFT_POOL_PER_MONTH, MEMBER_FOLLOWUP_LIMIT } from "./sub-plan";
import { formatMoney, isCurrency, MEMBER_DISCOUNT, type Currency } from "./money";
import { asLocale, LOCALE_META, type Locale } from "./locales";
import { invoicesFor, receiptUrlFor } from "./stripe";
import { RIGHTS } from "./entitlements";
import { dayCapFor } from "./caps";
import { tongkaT, isTongkaDays, type TongkaDays } from "./tongka";
import { openLetterT } from "./dict/open-letters";
import { LETTER_HOUR, LETTER_MIN } from "./member-letter";
import { isCompSubscription, isPassSubscription } from "./subscription";

/**
 * 会员欢迎信 (09-25, Neil: 「购买会员后应该要有一封邮件吧，写明会员权益和欢迎」) — 10-22 进度表 95 ③ (Neil: 「我们的通卡开通
 * 的邮件和会员邮件很有问题啊」): two letters now. A 通卡 holder gets 「{1 日／7 天／30 天}通卡已開通 · 到 {到期}」, a member
 * 「歡迎成為會員 · 下次續訂 {日期}」; the old single letter called every pass a 「單月會員」 and listed the monthly allowance
 * of September. What each letter lists comes from the rights table and the caps (openLetterPerks), so it follows them.
 *
 * Sent once per subscription the first time either path sees it live — the page's sync call after checkout, or
 * Stripe's webhook, whichever lands first (claimWelcome is the lock). Never for renewals: only a subscription that was
 * not live in our mirror before and is live now.
 */
const LIVE = new Set(["active", "trialing"]);

export function isNewlyLive(before: SubscriptionRow | null, after: SubscriptionRow): boolean {
  return LIVE.has(after.status) && !(before && LIVE.has(before.status));
}

/** a day (and, for a 1-day pass, the minute) in the reader's own zone — Taipei when we do not know it */
export function letterDate(ms: number, locale: Locale, tz: string | null, withTime = false): string {
  const zone = (() => { try { if (tz) { new Intl.DateTimeFormat("en", { timeZone: tz }); return tz; } } catch { /* unknown zone */ } return "Asia/Taipei"; })();
  return new Intl.DateTimeFormat(LOCALE_META[locale].htmlLang, {
    month: "long", day: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const } : { year: "numeric" }), timeZone: zone,
  }).format(ms);
}

const zhPage = (l: Locale) => l === "zh" || l === "zh-hant";
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));

/**
 * What the letter lists, written out — from RIGHTS (what the standing may use) and the caps (the numbers), never by
 * hand. Products that live only on the Chinese pages (塔羅, 解籤, the chart reports, 年書／合盤, the daily and monthly
 * letters, questions about a chart) are named only to a reader of those pages.
 */
export function openLetterPerks(standing: "pass" | "member" | "comp", locale: Locale): string[] {
  const t = openLetterT(locale);
  const zh = zhPage(locale);
  const has = (r: keyof typeof RIGHTS) => RIGHTS[r][standing];
  const out: string[] = [];
  if (standing === "pass") {
    if (has("deep_reading")) out.push(fill(t.passDeep, { follow: has("member_followups") ? MEMBER_FOLLOWUP_LIMIT : 5 }));
    if (zh && (has("tarot_reading") || has("qian_personal"))) out.push(t.passTarotQian);
    if (zh && has("chart_report")) out.push(t.passReports);
    if (zh && has("chart_qa")) out.push(fill(t.passQa, { qa: dayCapFor("qa", false) }));
    return out;
  }
  if (has("deep_reading")) out.push(fill(t.memAll, { follow: MEMBER_FOLLOWUP_LIMIT }));
  if (zh && has("member_letter") && has("daily_personal")) out.push(fill(t.memDaily, { time: `${LETTER_HOUR}:${String(LETTER_MIN).padStart(2, "0")}` }));
  if (zh && has("member_letter") && has("chart_rewrite")) out.push(t.memMonth);
  if (zh && has("bigs_discount")) out.push(fill(t.memDiscount, { zhe: Math.round(MEMBER_DISCOUNT * 10), off: Math.round((1 - MEMBER_DISCOUNT) * 100) }));
  // the monthly 「送一卦」 belongs to a membership that renews — not to a complimentary one
  if (standing === "member") out.push(fill(t.memGifts, { gifts: GIFT_POOL_PER_MONTH, cap: GIFT_POOL_CAP }));
  if (zh && has("chart_qa")) out.push(fill(t.memQa, { qa: dayCapFor("qa", true) }));
  return out;
}

function customerTz(customerId: number): string | null {
  try { return (db().prepare("SELECT tz FROM customers WHERE id = ?").get(customerId) as { tz: string | null } | undefined)?.tz ?? null; } catch { return null; }
}

/** the 通卡 letter's data: its name, its end, the first-payment line, the receipt */
async function passLetter(row: SubscriptionRow, locale: Locale, site: string) {
  const days: TongkaDays = isTongkaDays(row.pass_days) ? row.pass_days : 30;
  const tz = customerTz(row.customer_id);
  const until = row.period_end ? letterDate(row.period_end, locale, tz, days === 1) : "—";
  const sid = latestPassOrderSid(row.customer_id, `pass_${days}d`);
  // 78: the first paid 1-day pass of an account, while the guarantee still holds for it
  const n = zhPage(locale) && GUARANTEE_PIECES === 2 ? (locale === "zh" ? "两" : "兩") : GUARANTEE_PIECES;
  const guarantee = days === 1 && sid && guaranteeCheck(sid).ok ? fill(openLetterT(locale).passGuarantee, { n }) : null;
  let receiptUrl: string | null = null;
  if (sid) {
    try {
      const o = db().prepare("SELECT payment_intent, receipt_url FROM orders WHERE session_id = ?").get(sid) as { payment_intent: string | null; receipt_url: string | null } | undefined;
      receiptUrl = o?.receipt_url ?? (await receiptUrlFor(o?.payment_intent));
    } catch { receiptUrl = null; }
  }
  // 10-23 进度表 111 ③: bought while another pass runs — it starts when that one ends; say from when
  const queuedFrom = row.status === "scheduled" && row.period_start ? letterDate(row.period_start, locale, tz, days === 1) : null;
  return buildPassOpenEmail({
    locale, name: tongkaT(locale).name[days], until, perks: openLetterPerks("pass", locale), guarantee,
    castUrl: `${site}/${locale}/cast`, servicesUrl: `${site}/${locale}/services`, upsell: true, receiptUrl, queuedFrom,
  });
}

/** the member letter's data: what this period cost (the first month at its own price), what follows, the renewal */
async function memberLetter(row: SubscriptionRow, locale: Locale, site: string, credit?: PassCreditNote | null) {
  const comp = isCompSubscription(row.stripe_subscription_id);
  const cur = (row.currency ?? "USD").toUpperCase();
  const date = row.period_end ? letterDate(row.period_end, locale, customerTz(row.customer_id)) : "—";
  const inv = comp ? null : (await invoicesFor(row.stripe_customer_id, 1))[0] ?? null;
  const paidMinor = inv && inv.total > 0 && inv.currency.toUpperCase() === cur ? inv.total : row.amount_minor;
  let paid = "", later: string | null = null;
  if (!comp && isCurrency(cur) && paidMinor != null) {
    paid = formatMoney(cur, paidMinor, locale);
    // 10-10: a first month bought at its own price renews at the plan's — say both
    if (row.amount_minor != null && row.amount_minor !== paidMinor) later = formatMoney(cur, row.amount_minor, locale);
  }
  return buildMemberWelcomeEmail({
    locale, plan: comp ? "gift" : row.plan === "year" ? "year" : "month", paid, later, date,
    perks: openLetterPerks(comp ? "comp" : "member", locale),
    castUrl: `${site}/${locale}/cast`, manageUrl: `${site}/${locale}/account#membership`,
    receiptUrl: inv?.hosted ?? null, termsUrl: `${site}/${locale}/terms`,
    // 10-23 进度表 111 ③: a 通卡's unused days taken off this first payment (the checkout wrote how much)
    passCredit: credit && credit.minor > 0 && isCurrency(credit.currency.toUpperCase()) ? formatMoney(credit.currency.toUpperCase() as Currency, credit.minor, locale) : null,
  });
}

/** 10-23 进度表 111 ③: what a running 通卡 took off a new membership's first payment — from the checkout's metadata */
export interface PassCreditNote { minor: number; currency: string }
export function passCreditNote(meta: Record<string, string> | null | undefined): PassCreditNote | null {
  const minor = Number(meta?.pass_credit_minor);
  return meta?.pass_credit && Number.isFinite(minor) && minor > 0 && meta.pass_credit_cur ? { minor, currency: meta.pass_credit_cur } : null;
}

/**
 * 10-23 进度表 107 ② 重寄开通信: the same letter again, now, whatever was sent before (the admin asked, with a reason) — the
 * first-letter claim is not touched, so nothing else changes.
 */
export async function resendWelcome(row: SubscriptionRow): Promise<{ ok: boolean; error?: string }> {
  const email = customerEmailById(row.customer_id);
  if (!email) return { ok: false, error: "no_email" };
  const locale = asLocale(customerLocaleById(row.customer_id) ?? "en");
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  const pass = isPassSubscription(row.stripe_subscription_id);
  const mail = pass ? await passLetter(row, locale, site) : await memberLetter(row, locale, site);
  const r = await sendEmail(email, mail.subject, mail.html, mail.text, { kind: "sub_welcome", customerId: row.customer_id, locale });
  recordOps("sub_welcome", `${row.stripe_subscription_id} ${pass ? "pass" : "member"} ${locale} resend ${r.ok ? "sent" : "failed:" + (r.error ?? "?")}`);
  return r.ok ? { ok: true } : { ok: false, error: r.error ?? "send_failed" };
}

export async function sendWelcomeIfNew(before: SubscriptionRow | null, row: SubscriptionRow, opts: { passCredit?: PassCreditNote | null } = {}): Promise<"sent" | "skipped" | "failed"> {
  // a 通卡 bought while another is running is recorded as `scheduled` (it starts when that one ends) — the buyer is
  // covered without a gap until its end, so it gets its letter now too; before 10-22 it got none
  const queuedPass = !before && row.status === "scheduled" && isPassSubscription(row.stripe_subscription_id);
  if (!isNewlyLive(before, row) && !queuedPass) return "skipped";
  if (!claimWelcome(row.id)) return "skipped"; // the other path got here first
  const email = customerEmailById(row.customer_id);
  if (!email) { unclaimWelcome(row.id); return "skipped"; }
  const locale = asLocale(customerLocaleById(row.customer_id) ?? "en");
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  const pass = isPassSubscription(row.stripe_subscription_id);
  let mail: { subject: string; html: string; text: string };
  try {
    mail = pass ? await passLetter(row, locale, site) : await memberLetter(row, locale, site, opts.passCredit ?? null);
  } catch (e) {
    unclaimWelcome(row.id);
    recordOps("sub_welcome", `${row.stripe_subscription_id} ${locale} build failed: ${(e instanceof Error ? e.message : "?").slice(0, 80)}`);
    return "failed";
  }
  const r = await sendEmail(email, mail.subject, mail.html, mail.text, { kind: "sub_welcome", customerId: row.customer_id, locale });
  recordOps("sub_welcome", `${row.stripe_subscription_id} ${pass ? "pass" : "member"} ${locale} ${r.ok ? "sent" : "failed:" + (r.error ?? "?")}`);
  if (!r.ok) { unclaimWelcome(row.id); return "failed"; } // let the next path retry
  return "sent";
}
