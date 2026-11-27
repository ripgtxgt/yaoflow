import { randomBytes } from "node:crypto";
import { createSavedCast, db, emailSentKind, mailOptedOut, recordEmail, recordOps } from "./db";
import { buildRecoverEmail, ownerRecipients, sendEmail } from "./email";
import { hexName } from "./names";
import { resolveServerChart } from "./reading";
import { isLocale, type Locale } from "./locales";
import { PASS_PRICES, PRICES, countryFromTimeZone, detectCurrencyWithSource, formatMoney, isCurrency, type Currency } from "./money";
import { unsubUrl } from "./unsub";
import { FOLLOWUP_LIMIT } from "./followup-limit";
import { DEEP_PER_MONTH, MEMBER_FOLLOWUP_LIMIT } from "./sub-plan";
import { marketingBoxStartsTicked } from "./consent";
import { sensitiveKind } from "./cast-log";
import { classifyTopic } from "./topic";
import type { ListedSession } from "./stripe";
import type { LineValue } from "@yaoflow/engine";

/**
 * 10-04 挽回信 (Neil: 「91人你现在全部补发一封」): one letter, once, to everyone who left an address, reached Stripe's
 * page and has never paid for anything — counted the way the 10-04 analysis counted them (Checkout Sessions since 09-21,
 * our own orders / subscriptions / packs for "paid"). What their last try was decides the letter:
 *   - upgrade — a light reading (most of them free) and its full reading; most saw US$2.99 (fixed 10-02): the link goes
 *     back to that light reading, where the upgrade now shows their own money;
 *   - deep — a full reading on a cast: the figure comes back through a saved-cast row (origin 'recover', 30 days);
 *   - member — a membership or the one month: the account page's membership tab.
 * Not written to: anyone who paid since, an address that said no to our mail, a place where marketing mail needs a yes
 * first (EU / UK / CH / Canada / Korea — lib/consent.ts) unless they gave it, a checkout still open, a test or owner
 * address, a cast they had saved to their mailbox (that letter promised one reminder only), and anyone already written to.
 */
export const RECOVER_ONCE_KIND = "recover-1";
export const RECOVER_SINCE = Date.parse("2026-09-21T00:00:00+08:00");
const DAY = 86_400_000;

export type RecoverGroup = "upgrade" | "deep" | "member";
export interface RecoverItem {
  email: string;
  customerId: number | null;
  sessionId: string;
  group: RecoverGroup;
  locale: Locale;
  currency: Currency;
  usdSorry: boolean;
  alipay: boolean;
  /** readings: the cast */
  cast?: { question: string; values: LineValue[]; castAt: number; tz: number; teaser: string | null };
  /** upgrade: the light reading the link returns to */
  lightSid?: string;
  /** quoted in the letter, or null (sensitive, or none) */
  q: string | null;
}
export interface RecoverPlan { candidates: number; items: RecoverItem[]; skipped: Record<string, number> }

const INTL_DATE: Record<Locale, string> = { zh: "zh-CN", "zh-hant": "zh-TW", en: "en-US", ja: "ja-JP", ko: "ko-KR", fr: "fr-FR", de: "de-DE", es: "es-ES", pt: "pt-BR" };

/** The cast's calendar date in the caster's own clock: 「9月27日」, "September 27", "27 septembre" … */
export function castDateLabel(castAt: number, tz: number, locale: Locale): string {
  return new Intl.DateTimeFormat(INTL_DATE[locale], { month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(castAt + tz * 60_000));
}

/** Page languages as Stripe or a browser may have written them — zh-TW is Traditional, zh-CN Simplified. */
export function normLocale(x: unknown): Locale | null {
  if (typeof x !== "string" || !x) return null;
  if (isLocale(x)) return x;
  const s = x.toLowerCase();
  if (/^zh-(tw|hk|mo|hant)/.test(s)) return "zh-hant";
  if (s.startsWith("zh")) return "zh";
  const base = s.slice(0, 2);
  return isLocale(base) ? base : null;
}

/** The question as the letter quotes it — trimmed to a line, never for health, sex life or a criminal record. */
export function quoteOf(question: string, locale: Locale): string | null {
  const q = question.replace(/\s+/g, " ").trim();
  if (!q || sensitiveKind(q, classifyTopic(q))) return null;
  const cjk = /^(zh|ja|ko)/.test(locale);
  const max = cjk ? 30 : 70;
  if (q.length <= max) return q;
  return `${cjk ? q.slice(0, max) : q.slice(0, max).replace(/\s+\S*$/, "")}…`;
}

const MAINLAND = new Set(["cn-tz", "cn-edge", "zh-utc8"]);

/** `singlesGone`: the 通卡 is open to everyone (10-23 进度表 101) — a light or full reading is no longer sold, so no letter offers one. */
export function planRecover(sessions: ListedSession[], now = Date.now(), singlesGone = false): RecoverPlan {
  const d = db();
  const custRows = d.prepare("SELECT id, lower(email) AS e, test_flag AS t, marketing_ok AS m, locale FROM customers").all() as { id: number; e: string; t: number | null; m: number | null; locale: string | null }[];
  const custById = new Map(custRows.map((r) => [r.id, r]));
  const custByEmail = new Map(custRows.map((r) => [r.e, r]));
  const owners = new Set(ownerRecipients());
  const paid = new Set<string>();
  for (const r of d.prepare("SELECT lower(COALESCE(o.email, c.email)) AS e FROM orders o LEFT JOIN customers c ON c.id = o.customer_id WHERE o.payment_state IN ('paid','refunded','disputed') AND COALESCE(o.amount_cents,0) > 0").all() as { e: string | null }[]) if (r.e) paid.add(r.e);
  for (const r of d.prepare("SELECT lower(c.email) AS e FROM subscriptions s JOIN customers c ON c.id = s.customer_id WHERE (s.stripe_subscription_id LIKE 'sub_%' OR s.stripe_subscription_id LIKE 'pass_%') AND s.status NOT IN ('incomplete','incomplete_expired')").all() as { e: string | null }[]) if (r.e) paid.add(r.e);
  for (const r of d.prepare("SELECT lower(c.email) AS e FROM member_packs p JOIN customers c ON c.id = p.customer_id").all() as { e: string | null }[]) if (r.e) paid.add(r.e);

  const emailOf = (s: ListedSession): string | null => {
    const m = s.metadata ?? {};
    const e = s.customer_email ?? s.customer_details?.email ?? (m.cust ? custById.get(Number(m.cust))?.e : null) ?? m.email ?? null;
    return e ? e.trim().toLowerCase() : null;
  };
  const byPerson = new Map<string, ListedSession[]>();
  for (const s of sessions) {
    const m = s.metadata ?? {};
    if (m.kind === "alipay_probe" || m.test === "1") continue;
    if (s.payment_status === "paid" || s.payment_status === "no_payment_required") continue;
    const e = emailOf(s);
    if (!e) continue;
    byPerson.set(e, [...(byPerson.get(e) ?? []), s]);
  }

  const skipped: Record<string, number> = {};
  const skip = (why: string) => { skipped[why] = (skipped[why] ?? 0) + 1; };
  const items: RecoverItem[] = [];
  const grantStmt = d.prepare("SELECT redeem_session_id AS sid FROM grants WHERE (lower(claimed_email) = ? OR (? IS NOT NULL AND claimed_customer_id = ?)) AND redeem_session_id IS NOT NULL AND input_json LIKE ? ORDER BY used_at DESC LIMIT 1");
  const orderStmt = d.prepare("SELECT o.session_id AS sid FROM orders o JOIN casts c ON c.id = o.cast_id LEFT JOIN customers cu ON cu.id = o.customer_id WHERE (lower(o.email) = ? OR lower(cu.email) = ?) AND c.cast_at = ? AND o.tier = 'one' ORDER BY o.created_at DESC LIMIT 1");
  const savedStmt = d.prepare("SELECT 1 FROM saved_casts WHERE lower(email) = ? AND cast_at = ? AND origin IS NULL LIMIT 1");
  const teaserStmt = d.prepare("SELECT teaser FROM cast_log WHERE at = ? AND values_str = ? AND teaser IS NOT NULL ORDER BY id DESC LIMIT 1");

  for (const [email, list] of byPerson) {
    const c = custByEmail.get(email);
    if ((c?.t ?? 0) === 1 || owners.has(email)) { skip("test_or_owner"); continue; }
    if (paid.has(email)) { skip("paid"); continue; }
    list.sort((a, b) => b.created - a.created);
    if (list.some((s) => s.status === "open" && now - s.created * 1000 < DAY)) { skip("still_open"); continue; }
    if (emailSentKind(email, RECOVER_ONCE_KIND)) { skip("already_sent"); continue; }
    if (mailOptedOut(email)) { skip("opted_out"); continue; }
    const last = list[0]!;
    const m = last.metadata ?? {};
    const countries = [m.country, countryFromTimeZone(m.tzname)];
    if (!marketingBoxStartsTicked(...countries) && c?.m !== 1) { skip("consent_region"); continue; }

    const locale = normLocale(m.pageLocale) ?? normLocale(m.locale) ?? normLocale(last.locale) ?? normLocale(c?.locale)
      ?? (countries.some((x) => x === "TW" || x === "HK" || x === "MO") ? "zh-hant" : countries.includes("CN") ? "zh" : "en");
    const sessionCur = (last.currency ?? "").toUpperCase();
    let currency: Currency = isCurrency(sessionCur) ? sessionCur : "USD";
    const alipay = currency === "CNY" || MAINLAND.has(m.mp_reason ?? "") || m.tzname === "Asia/Shanghai";

    // 10-24 (Neil: 「会员是会员，通卡是通卡」): a pass checkout gets the hour offer named for the pass (lib/recover-offer.ts),
    // never this batch's membership letter
    if (m.kind === "pass") { skip("pass_offer"); continue; }
    const isMember = last.mode === "subscription" || m.kind === "pack";
    if (isMember) {
      if (m.kind === "qiancard") { skip("qiancard"); continue; } // 10-14 进度表 50: a 籤卡 is not a reading
      if (m.kind === "pack") { skip("pack"); continue; } // a top-up pack is for members — not a newcomer's letter
      items.push({ email, customerId: c?.id ?? null, sessionId: last.id, group: "member", locale, currency, usdSorry: false, alipay, q: null });
      continue;
    }
    if (singlesGone) { skip("single_retired"); continue; }
    const values = (m.values ?? "").split(",").map(Number);
    const castAt = Number(m.castAtMs);
    const tz = Number(m.tz);
    if (values.length !== 6 || !values.every((v) => v >= 6 && v <= 9) || !Number.isFinite(castAt) || !Number.isFinite(tz) || !m.question) { skip("no_cast"); continue; }
    if (savedStmt.get(email, castAt)) { skip("saved_promise"); continue; }
    const question = m.question;
    const cast = { question, values: values as LineValue[], castAt, tz, teaser: (m.teaser ?? null) || ((teaserStmt.get(castAt, values.join("")) as { teaser: string } | undefined)?.teaser ?? null) };

    let group: RecoverGroup = "deep";
    let lightSid: string | undefined;
    let usdSorry = false;
    if (m.upgrade === "1") {
      const g = grantStmt.get(email, c?.id ?? null, c?.id ?? null, `%"castAtMs":${castAt}%`) as { sid: string } | undefined;
      const o = g ? undefined : (orderStmt.get(email, email, castAt) as { sid: string } | undefined);
      lightSid = g?.sid ?? o?.sid;
      if (lightSid) {
        group = "upgrade";
        // 10-02 bug: a free light reading's upgrade fell to USD — show the money the upgrade panel now picks
        if (currency === "USD" && m.cur_src !== "chosen") {
          const guess = detectCurrencyWithSource({ timeZone: m.tzname ?? null, edgeCountry: m.country ?? null, language: locale }).currency;
          if (guess !== "USD") { currency = guess; usdSorry = true; }
        }
      }
    }
    items.push({ email, customerId: c?.id ?? null, sessionId: last.id, group, locale, currency, usdSorry, alipay: alipay || currency === "CNY", cast, lightSid, q: quoteOf(question, locale) });
  }
  return { candidates: byPerson.size, items, skipped };
}

export interface RecoverMail { subject: string; html: string; text: string; url: string }

/** The letter for one person — and, for a cast, the saved-cast row its link opens (made only when `persist`). */
export function recoverMailFor(it: RecoverItem, site: string, persist: boolean, now = Date.now()): RecoverMail {
  const unsub = unsubUrl(site, it.email, it.locale);
  const fmt = (minor: number) => formatMoney(it.currency, minor, it.locale);
  if (it.group === "member") {
    const url = `${site}/${it.locale}/account?tab=member&c=recover1`;
    const mail = buildRecoverEmail({
      locale: it.locale, kind: "member", date: "", q: null, hex: "", url, unsubUrl: unsub,
      month: fmt(PRICES[it.currency].month), pass: fmt(PASS_PRICES[it.currency]), deep: DEEP_PER_MONTH, fu: MEMBER_FOLLOWUP_LIMIT, alipay: it.alipay,
    });
    return { ...mail, url };
  }
  const cast = it.cast!;
  const chart = resolveServerChart({ question: cast.question, values: cast.values, castAtMs: cast.castAt, tzOffsetMinutes: cast.tz } as never, true);
  const hex = hexName(chart.cast.primary, it.locale);
  let url: string;
  if (it.group === "upgrade") {
    url = `${site}/${it.locale}/reading?sid=${encodeURIComponent(it.lightSid!)}&c=recover1`;
  } else {
    const token = persist ? randomBytes(24).toString("hex") : "0".repeat(48);
    if (persist) createSavedCast({ token, email: it.email, locale: it.locale, question: cast.question, values: cast.values, castAt: cast.castAt, tzOffset: cast.tz, hex, teaser: cast.teaser, currency: it.currency, origin: "recover" }, now);
    url = `${site}/${it.locale}/cast?saved=${token}&c=recover1`;
  }
  const mail = buildRecoverEmail({
    locale: it.locale, kind: it.group, date: castDateLabel(cast.castAt, cast.tz, it.locale), q: it.q, hex, url, unsubUrl: unsub,
    price: fmt(PRICES[it.currency].one), full: fmt(PRICES[it.currency].deep), usdSorry: it.usdSorry, alipay: it.alipay, n: FOLLOWUP_LIMIT,
  });
  return { ...mail, url };
}

/** Send the plan's letters, at Resend's polite pace; each address once (emails table, kind recover-1). */
export async function sendRecover(plan: RecoverPlan, site: string, limit = 500, pace = 600): Promise<{ sent: number; failed: number; byGroup: Record<string, number> }> {
  let sent = 0, failed = 0;
  const byGroup: Record<string, number> = {};
  for (const it of plan.items.slice(0, limit)) {
    if (emailSentKind(it.email, RECOVER_ONCE_KIND)) continue;
    let mail: RecoverMail;
    try { mail = recoverMailFor(it, site, true); } catch (e) { failed++; recordOps("recover_once_err", String(e instanceof Error ? e.message : e).slice(0, 120)); continue; }
    const r = await sendEmail(it.email, mail.subject, mail.html, mail.text, { kind: "recover", sessionId: `recover:${it.sessionId}`, customerId: it.customerId, unsubUrl: unsubUrl(site, it.email, it.locale), locale: it.locale });
    recordEmail(`recover:${it.sessionId}`, RECOVER_ONCE_KIND, it.email, r.ok ? "sent" : "failed", r.error ?? r.id);
    if (r.ok) { sent++; byGroup[it.group] = (byGroup[it.group] ?? 0) + 1; } else failed++;
    if (pace > 0) await new Promise((res) => setTimeout(res, pace));
  }
  recordOps("recover_once", `sent ${sent} failed ${failed} ${JSON.stringify(byGroup)}`);
  return { sent, failed, byGroup };
}
