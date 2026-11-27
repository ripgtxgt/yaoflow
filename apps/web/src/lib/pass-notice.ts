import { letterOn } from "./letter-switch";
import { createHmac, timingSafeEqual } from "node:crypto";
import { customerEmailById, customerLocaleById, db, recordEmail, recordOps, subscriptionByStripeId, threadCastsForCustomer, type SubscriptionRow } from "./db";
import { sendEmail } from "./email";
import { createPassSession, createSubscriptionSession } from "./stripe";
import { formatMoney, isCurrency, passMinor, priceMinor, stripeCurrency, type Currency } from "./money";
import { asLocale, LOCALE_META, type Locale } from "./locales";
import { PASS_NAMES } from "./pass";
import { PLANS, SUB_NAMES } from "./subscription";
import { passNoticePeriod, passNoticeWords, type PassNoticeWords } from "./dict/pass-notice";
import { tongkaT } from "./tongka";

/**
 * 10-14 进度表 §四 42 单月会员到期提醒 (Neil: 「把这几个做了吧」).
 *   - who: a one-off month (`pass_…`, active) that ends three days from today, Taipei dates; once per pass
 *     (subscriptions.pass_notice_at); not when the same customer already has a renewing monthly or yearly plan, nor a
 *     month already bought ahead (status 'scheduled');
 *   - what: a service letter, nothing else sold in it — the month in two lines, then three buttons of the same size and
 *     weight: one more month (stacked after this one, lib/pass.ts), switch to monthly (first charge the day the pass
 *     ends, nothing today), no thanks (recorded, a kind page, one optional question);
 *   - links carry a signed token, so no login is needed; GET only shows the page, POST acts (mail scanners open links).
 * Only this letter: nothing again on the day it ends.
 */
const DAY = 86_400_000;
export type PassAction = "pass" | "month" | "no";
export const PASS_ACTIONS: readonly PassAction[] = ["pass", "month", "no"];

function secret(): string {
  const s = process.env.REVISIT_SECRET ?? process.env.ADMIN_KEY;
  if (!s) throw new Error("no signing secret (REVISIT_SECRET/ADMIN_KEY)");
  return s;
}
export function passNoticeToken(passId: string, action: PassAction): string {
  return createHmac("sha256", secret()).update(`passnotice:${action}:${passId}`).digest("hex").slice(0, 24);
}
export function verifyPassNoticeToken(passId: string, action: PassAction, token: string): boolean {
  if (!/^[0-9a-f]{24}$/.test(token)) return false;
  const a = Buffer.from(passNoticeToken(passId, action)), b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

const site = () => (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
/** Taipei calendar date of a moment, 「YYYY-MM-DD」. */
const tpeDay = (ms: number) => new Date(ms + 8 * 3_600_000).toISOString().slice(0, 10);
export const fmtDate = (ms: number, locale: Locale) =>
  new Intl.DateTimeFormat(LOCALE_META[locale].htmlLang, { month: "long", day: "numeric", timeZone: "Asia/Taipei" }).format(ms);

/** Pure: does this pass get its letter today? (ends three Taipei days from now, active, not yet written to) */
export function passNoticeDue(row: Pick<SubscriptionRow, "stripe_subscription_id" | "status" | "period_end"> & { pass_notice_at?: number | null; pass_days?: number | null }, now: number): boolean {
  if (!row.stripe_subscription_id.startsWith("pass_") || row.status !== "active" || !row.period_end || row.pass_notice_at) return false;
  // 10-22 通卡: a 1 日 pass is too short for a letter; a 7 天 pass hears the day before it ends; the 30-day one three days before
  if (row.pass_days != null && row.pass_days < 7) return false;
  const ahead = row.pass_days != null && row.pass_days < 30 ? 1 : 3;
  return tpeDay(row.period_end) === tpeDay(now + ahead * DAY);
}

/** Has this customer something that carries on by itself — a renewing plan, or a month already bought ahead? */
export function carriesOn(customerId: number, exceptId: string): boolean {
  return !!db().prepare(
    `SELECT 1 FROM subscriptions WHERE customer_id = ? AND stripe_subscription_id <> ? AND (
       (status = 'scheduled' AND substr(stripe_subscription_id,1,5) = 'pass_')
       OR (status IN ('active','trialing','past_due') AND substr(stripe_subscription_id,1,4) = 'sub_' AND cancel_at_period_end = 0 AND cancel_at IS NULL)
     ) LIMIT 1`,
  ).get(customerId, exceptId);
}

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]!));
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? `{${k}}`));

export function passNoticeUrl(passId: string, action: PassAction, locale: Locale): string {
  const q = new URLSearchParams({ s: passId, a: action, t: passNoticeToken(passId, action), l: locale });
  return `${site()}/api/pass/notice?${q.toString()}`;
}

/** The letter. The three buttons are one style — same size, same weight, no first choice. */
export function buildPassNoticeEmail(i: {
  locale: Locale; passId: string; end: number; currency: Currency; asked: number; revisitDates: string[];
  /** 10-22 通卡: the pass's days — the Chinese words then say 通卡 instead of 單月會員 */
  passDays?: number | null;
}): { subject: string; html: string; text: string } {
  const t = passNoticeWords(i.locale);
  // 10-22 (Neil: 「要」): the letter names the pass it is about; an old one-off month (no pass_days) is a 30 天通卡. The
  // words come in 繁／简／English — the names follow the words' language, not the reader's when that has no letter of its own
  const wl = i.locale === "zh" || i.locale === "zh-hant" ? i.locale : "en";
  const days = i.passDays === 7 ? 7 : 30;
  const v = {
    date: fmtDate(i.end, i.locale), pass: formatMoney(i.currency, passMinor(i.currency), i.locale), month: formatMoney(i.currency, priceMinor(i.currency, "month"), i.locale),
    n: i.asked, dates: i.revisitDates.join("、"), name: tongkaT(wl).name[days], name30: tongkaT(wl).name[30], period: passNoticePeriod(wl, days),
  };
  const recap = [i.asked > 0 ? fill(t.asked, v) : fill(t.quiet, v), ...(i.revisitDates.length ? [fill(t.revisits, v)] : [])];
  const btn = "display:block;box-sizing:border-box;width:100%;text-align:center;border:1px solid #14151c;color:#14151c;background:#ffffff;text-decoration:none;padding:13px 16px;border-radius:2px;font-size:15px;margin:0 0 10px;";
  const buttons = (["pass", "month", "no"] as const).map((a) => ({ a, label: fill(t[a], v), url: passNoticeUrl(i.passId, a, i.locale) }));
  const html = `<!doctype html>
<html lang="${LOCALE_META[i.locale].htmlLang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f4f2ec;color:#14151c;font-family:Georgia,'Songti TC','Noto Serif TC',serif;">
  <div style="max-width:520px;margin:0 auto;padding:44px 24px 40px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:#7a7a7c;margin:0 0 32px;">YaoFlow</p>
    <p style="font-size:22px;line-height:1.4;margin:0 0 18px;">${esc(fill(t.title, v))}</p>
    ${recap.map((x) => `<p style="font-size:15px;line-height:1.8;color:#333439;margin:0 0 10px;">${esc(x)}</p>`).join("\n    ")}
    <p style="font-size:15px;line-height:1.8;color:#333439;margin:18px 0 14px;">${esc(t.choose)}</p>
    ${buttons.map((b) => `<a href="${esc(b.url)}" style="${btn}">${esc(b.label)}</a>`).join("\n    ")}
    <p style="font-size:13px;line-height:1.7;color:#606063;margin:18px 0 18px;">${esc(fill(t.foot, v))}</p>
    <hr style="border:none;border-top:1px solid #dcd8cc;margin:8px 0 16px;">
    <p style="font-size:11px;color:#7a7a7c;line-height:1.6;margin:0;">${esc(t.help)}</p>
  </div>
</body></html>`;
  const text = [fill(t.title, v), "", ...recap, "", t.choose, ...buttons.map((b) => `· ${b.label}: ${b.url}`), "", fill(t.foot, v), "", t.help].join("\n");
  return { subject: fill(t.subject, v), html, text };
}

/** The month in two numbers: matters with a reading since the pass began, and the check-in dates still ahead. */
export function monthRecap(customerId: number, since: number, now: number, locale: Locale): { asked: number; revisitDates: string[] } {
  const casts = threadCastsForCustomer(customerId).filter((c) => c.created_at >= since && c.tier);
  const ahead = [...new Set(casts.filter((c) => c.due_at && c.due_at > now && !c.outcome).map((c) => c.due_at!).sort((a, b) => a - b).map((d) => fmtDate(d, locale)))].slice(0, 3);
  return { asked: casts.length, revisitDates: ahead };
}

/** The cron's pass, once an hour: due passes, between 9:00 and 21:00 Taipei (the letter is for a Taipei-dated day). */
export async function runPassNotices(now = Date.now()): Promise<{ sent: number; failed: number; skipped: number }> {
  const out = { sent: 0, failed: 0, skipped: 0 };
  if (!letterOn("pass_notice")) return out; // 10-23 进度表 108
  const h = new Date(now + 8 * 3_600_000).getUTCHours();
  if (h < 9 || h >= 21) return out;
  const rows = db().prepare(
    `SELECT s.* FROM subscriptions s JOIN customers c ON c.id = s.customer_id
     WHERE s.status = 'active' AND substr(s.stripe_subscription_id,1,5) = 'pass_' AND s.pass_notice_at IS NULL AND COALESCE(c.test_flag,0) = 0`,
  ).all() as unknown as (SubscriptionRow & { pass_notice_at: number | null })[];
  for (const row of rows) {
    if (!passNoticeDue(row, now)) continue;
    const claim = Number((db().prepare("UPDATE subscriptions SET pass_notice_at = ? WHERE id = ? AND pass_notice_at IS NULL").run(now, row.id) as unknown as { changes?: number }).changes ?? 0);
    if (claim !== 1) continue;
    if (carriesOn(row.customer_id, row.stripe_subscription_id)) { out.skipped++; recordEmail(`pass-notice:${row.stripe_subscription_id}`, "pass-notice", customerEmailById(row.customer_id) ?? "-", "skipped", "carries_on"); continue; }
    const email = customerEmailById(row.customer_id);
    const cur = (row.currency ?? "").toUpperCase();
    if (!email || !isCurrency(cur) || !row.period_end) { out.skipped++; continue; }
    const locale = asLocale(customerLocaleById(row.customer_id) ?? "zh-hant");
    const recap = monthRecap(row.customer_id, row.period_start ?? row.created_at, now, locale);
    const m = buildPassNoticeEmail({ locale, passId: row.stripe_subscription_id, end: row.period_end, currency: cur, passDays: row.pass_days ?? null, ...recap });
    const r = await sendEmail(email, m.subject, m.html, m.text, { kind: "pass_notice", customerId: row.customer_id, locale });
    recordEmail(`pass-notice:${row.stripe_subscription_id}`, "pass-notice", email, r.ok ? "sent" : "failed", r.ok ? r.id : r.error);
    recordOps("pass_notice", `${row.stripe_subscription_id} ${locale} ${r.ok ? "sent" : "failed:" + (r.error ?? "?")}`);
    if (r.ok) out.sent++; else { out.failed++; db().prepare("UPDATE subscriptions SET pass_notice_at = NULL WHERE id = ?").run(row.id); }
  }
  return out;
}

export type PassNoticeResult = { ok: true; redirect: string } | { ok: true; declined: true } | { ok: false; reason: "stale" | "failed" };

/** What a button does once confirmed (POST). */
export async function performPassNotice(action: PassAction, passId: string, locale: Locale): Promise<PassNoticeResult> {
  const row = subscriptionByStripeId(passId);
  if (!row || !row.period_end) return { ok: false, reason: "stale" };
  recordOps("pass_notice_click", `${passId} ${action}`);
  if (action === "no") {
    recordEmail(`pass-notice:${passId}`, "pass-notice-no", customerEmailById(row.customer_id) ?? "-", "sent", "declined");
    return { ok: true, declined: true };
  }
  // already carried on (bought ahead, switched) — a second tap must not make a second purchase
  if (carriesOn(row.customer_id, passId)) return { ok: false, reason: "stale" };
  const email = customerEmailById(row.customer_id);
  const cur = (row.currency ?? "").toUpperCase();
  if (!email || !isCurrency(cur)) return { ok: false, reason: "stale" };
  const s = site();
  try {
    if (action === "pass") {
      const session = await createPassSession({
        amountMinor: passMinor(cur), currency: stripeCurrency(cur), productName: PASS_NAMES[locale] ?? PASS_NAMES.en!, locale, email,
        successUrl: `${s}/${locale}/account?pass={CHECKOUT_SESSION_ID}`, cancelUrl: `${s}/${locale}/account#membership`,
        metadata: { email, cust: String(row.customer_id), locale, currency: cur, c: "pass-notice", after: passId },
      });
      if (!session.url) throw new Error("no url");
      recordOps("pass_notice_checkout", `${passId} pass → ${session.id}`);
      return { ok: true, redirect: session.url };
    }
    // month: the first charge waits for the day the pass ends — nothing today, never twice
    const anchor = row.period_end > Date.now() + 3_600_000 ? Math.floor(row.period_end / 1000) : undefined;
    const make = (mp: boolean | undefined) => createSubscriptionSession({
      productName: SUB_NAMES.month[locale], amountCents: priceMinor(cur, "month"), currency: stripeCurrency(cur), interval: PLANS.month.interval,
      customerEmail: email, stripeCustomerId: row.stripe_customer_id, locale, managedPayments: mp, billingCycleAnchor: anchor,
      successUrl: `${s}/${locale}/account?sub={CHECKOUT_SESSION_ID}`, cancelUrl: `${s}/${locale}/account#membership`,
      metadata: { email, locale, plan: "month", currency: cur, c: "pass-notice", pass_from: passId },
    });
    let session;
    try { session = await make(undefined); } catch (e) {
      if (!/not currently supported|managed_payments|subscription/i.test(e instanceof Error ? e.message : "")) throw e;
      session = await make(false);
    }
    if (!session.url) throw new Error("no url");
    recordOps("pass_notice_checkout", `${passId} month → ${session.id}`);
    return { ok: true, redirect: session.url };
  } catch (e) {
    recordOps("pass_notice_fail", `${passId} ${action}: ${e instanceof Error ? e.message.slice(0, 160) : "?"}`);
    return { ok: false, reason: "failed" };
  }
}

/** For the page behind each button. */
export function pageWords(locale: Locale): PassNoticeWords { return passNoticeWords(locale); }
export function pageVars(passId: string, locale: Locale): Record<string, string> {
  const row = subscriptionByStripeId(passId);
  const cur = (row?.currency ?? "").toUpperCase();
  const wl = locale === "zh" || locale === "zh-hant" ? locale : "en";
  return {
    date: row?.period_end ? fmtDate(row.period_end, locale) : "—",
    pass: isCurrency(cur) ? formatMoney(cur, passMinor(cur), locale) : "",
    month: isCurrency(cur) ? formatMoney(cur, priceMinor(cur, "month"), locale) : "",
    // 10-22: 「再買一張 30 天通卡」 — the page names what the button buys
    name30: tongkaT(wl).name[30],
  };
}

/** 后台: letters sent, each button's taps, and who then actually paid (a pass bought ahead, or a monthly plan). */
export function passNoticeStats(): { sent: number; skipped: number; clicks: Record<PassAction, number>; boughtPass: number; switched: number; declined: number } {
  const d = db();
  const n = (sql: string, ...a: (string | number)[]) => ((d.prepare(sql).get(...a) as { v: number } | undefined)?.v ?? 0);
  const clicks = { pass: 0, month: 0, no: 0 } as Record<PassAction, number>;
  for (const r of d.prepare("SELECT detail FROM ops_events WHERE kind = 'pass_notice_click'").all() as { detail: string }[]) {
    const a = r.detail.split(" ")[1] as PassAction;
    if (a in clicks) clicks[a]++;
  }
  return {
    sent: n("SELECT COUNT(*) AS v FROM emails WHERE kind = 'pass-notice' AND status = 'sent'"),
    skipped: n("SELECT COUNT(*) AS v FROM emails WHERE kind = 'pass-notice' AND status = 'skipped'"),
    clicks,
    boughtPass: n("SELECT COUNT(*) AS v FROM ops_events WHERE kind = 'pass_started' AND detail LIKE '%scheduled after pass_%'"),
    // a monthly plan this customer started after the letter
    switched: n(`SELECT COUNT(DISTINCT p.customer_id) AS v FROM subscriptions p JOIN subscriptions m ON m.customer_id = p.customer_id
                 WHERE substr(p.stripe_subscription_id,1,5) = 'pass_' AND p.pass_notice_at IS NOT NULL
                   AND substr(m.stripe_subscription_id,1,4) = 'sub_' AND m.created_at >= p.pass_notice_at`),
    declined: n("SELECT COUNT(*) AS v FROM emails WHERE kind = 'pass-notice-no'"),
  };
}
