import { customerEmailById, customerLocaleById, db, recordEmail, recordOps, type SubscriptionRow } from "./db";
import { buildNoticeEmail, sendEmail, type MailKind } from "./email";
import { asLocale, type Locale } from "./locales";
import { formatMoney, isCurrency } from "./money";
import { customerBalance, nextBillPreview, openBillFor, renewalBillFor, type RenewalBill, type StripeSubscription } from "./stripe";
import { letterDate, openLetterPerks } from "./welcome";
import { letterOn, type LetterSwitchId } from "./letter-switch";
import { subNoticeT } from "./dict/sub-notice";
import { isCompSubscription, isPassSubscription } from "./subscription";

/**
 * 10-23 进度表 111 ① ② / 110 (Neil: 「你全部再审查一遍，还有哪些节点我们需要发邮件……」; 「有人恢复续订会员了，我们不发个
 * 邮件吗？」): what happened to a membership's money or state, told to the member — until now only Neil heard (sub_alert).
 *
 *   payfail     a renewal could not be charged (active → past_due): what failed, when Stripe tries again, a page to pay
 *               with another card (Stripe's own page for that bill), that the membership waits until it is paid.
 *   paid        that bill was paid after all (past_due → active): it is all back.
 *   unpaid_end  the retries ran out and Stripe ended it (deleted after past_due, or reason payment_failed; or marked
 *               unpaid): it has ended, nothing more is charged, what stays, how to come back.
 *   resume      renewal turned back on — from the letter's one-tap link (lib/retain) or in Stripe's page / the account
 *               page (the webhook sees cancel_at_period_end / cancel_at cleared): next charge, date and amount after the
 *               account balance (Stripe's preview of that bill), what the membership includes.
 *   pause       the month's pause chosen in the letter (lib/retain): no charge from … to …, picks up again on ….
 *   renewed     10-24 (Neil: 「然后续费为什么没有发邮件呢」) a renewal that went through: what was charged and when, the
 *               receipt (Stripe's page for that bill), the next renewal, how to turn it off. Polled from the 10-minute
 *               sweep (runRenewalReceipts) — the webhook sees the period turn over about an hour before Stripe charges.
 *
 * 10-24 correction: the note here used to say Stripe's own receipt goes out for every renewal. It does not — the seven
 * renewal charges of 10-03…10-24 have no receipt number and no receipt e-mail on them (the account does not mail
 * receipts), so members heard nothing at all when they were charged.
 *
 * Each letter once per event — an atomic claim in `emails` keyed on the subscription and the period, so the webhook and
 * the letter's own link (which both see a resume) send one letter between them, and a webhook Stripe delivers twice
 * sends nothing the second time. Every letter has a switch on /admin/letters (108).
 */

export type SubLetter = "payfail" | "paid" | "unpaid_end" | "resume" | "pause" | "renewed";

export const SUB_LETTER_KIND: Record<SubLetter, MailKind> = {
  payfail: "sub_payfail", paid: "sub_payfail", unpaid_end: "sub_unpaid_end", resume: "sub_resume", pause: "sub_pause", renewed: "sub_renewed",
};
const SWITCH: Record<SubLetter, LetterSwitchId> = {
  payfail: "sub_payfail", paid: "sub_payfail", unpaid_end: "sub_unpaid_end", resume: "sub_resume", pause: "sub_pause", renewed: "sub_renewed",
};

const LIVE = new Set(["active", "trialing"]);
const OWING = new Set(["past_due", "unpaid"]);

/** exported for the tests: which letter this change of a Stripe subscription calls for, if any (pause is ours, not Stripe's;
 *  renewed waits for the bill to be paid — runRenewalReceipts) */
export function subLetterFor(before: SubscriptionRow | null, s: StripeSubscription, deleted: boolean): Exclude<SubLetter, "pause" | "renewed"> | null {
  if (!before) return null; // a new subscription is the welcome letter's
  if (deleted || s.status === "canceled") {
    return OWING.has(before.status) || s.cancellation_details?.reason === "payment_failed" ? "unpaid_end" : null;
  }
  if (LIVE.has(before.status) && OWING.has(s.status)) return "payfail";
  if (before.status === "past_due" && s.status === "unpaid") return "unpaid_end";
  if (OWING.has(before.status) && LIVE.has(s.status)) return "paid";
  const wasEnding = before.cancel_at_period_end === 1 || before.cancel_at != null;
  const nowEnding = Boolean(s.cancel_at_period_end) || s.cancel_at != null;
  // the month's pause also clears the ending — that one gets the pause letter (lib/retain), not this one
  if (wasEnding && !nowEnding && LIVE.has(s.status) && !s.pause_collection) return "resume";
  return null;
}

/* ---------------- small helpers ---------------- */

const site = () => (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
const fill = (x: string, v: Record<string, string>) => x.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? v[k]! : m));

function tzOf(customerId: number): string | null {
  try { return (db().prepare("SELECT tz FROM customers WHERE id = ?").get(customerId) as { tz: string | null } | undefined)?.tz ?? null; } catch { return null; }
}

function money(currency: string | null | undefined, minor: number | null | undefined, locale: Locale): string | null {
  if (minor == null || !currency) return null;
  const c = currency.toUpperCase();
  return isCurrency(c) ? formatMoney(c, minor, locale) : `${c} ${(minor / 100).toFixed(2)}`;
}

/** one letter per key: true when this call may send it (a failed send can be claimed again by the next event) */
function claim(key: string, kind: MailKind, email: string): boolean {
  const r = db().prepare("INSERT INTO emails (session_id, kind, email, sent_at, status, detail) VALUES (?,?,?,?, 'sending', NULL) ON CONFLICT(session_id, kind) DO UPDATE SET status = 'sending', sent_at = excluded.sent_at WHERE emails.status = 'failed'")
    .run(key, kind, email, Date.now()) as unknown as { changes?: number };
  return Number(r.changes ?? 0) > 0;
}

/** the key a letter is claimed under — exported for the tests */
export function letterKey(letter: SubLetter, row: Pick<SubscriptionRow, "stripe_subscription_id" | "period_end" | "cancel_at" | "paused_from"> & Partial<Pick<SubscriptionRow, "period_start">>, before?: Pick<SubscriptionRow, "cancel_at" | "period_end"> | null): string {
  const id = row.stripe_subscription_id;
  switch (letter) {
    // one per period: the period that began when Stripe renewed it
    case "renewed": return `sub-renewed:${id}:${row.period_start ?? 0}`;
    case "payfail": return `sub-payfail:${id}:${row.period_end ?? 0}`;
    case "paid": return `sub-paid:${id}:${row.period_end ?? 0}`;
    case "unpaid_end": return `sub-unpaid-end:${id}`;
    // the ending that was undone: the same value whether the link or the webhook gets there first
    case "resume": return `sub-resume:${id}:${before?.cancel_at ?? before?.period_end ?? row.period_end ?? 0}`;
    case "pause": return `sub-pause:${id}:${row.paused_from ?? 0}`;
  }
}

export interface SubLetterFacts {
  /** payfail: the bill that failed */
  bill?: { created: number; amountDue: number; currency: string; hosted: string | null; nextAttempt: number | null } | null;
  /** resume: the next charge after the account balance */
  next?: { amount: number; credit: number; currency: string } | null;
  /** pause: the month without a charge */
  pause?: { from: number; until: number } | null;
  /** renewed: the paid renewal bill (lib/stripe renewalBillFor) */
  renewal?: RenewalBill | null;
}

/** The letter itself (exported for the samples on /admin/letters and the tests). */
export function buildSubLetter(letter: SubLetter, row: SubscriptionRow, locale: Locale, facts: SubLetterFacts = {}, tz: string | null = null): { subject: string; html: string; text: string } {
  const t = subNoticeT(locale);
  const s = site();
  const day = (ms: number | null | undefined) => (ms ? letterDate(ms, locale, tz) : "—");
  const account = `${s}/${locale}/account#membership`;
  const plan = money(row.currency, row.amount_minor, locale) ?? "—";
  if (letter === "payfail") {
    const b = facts.bill ?? null;
    const amount = (b && money(b.currency, b.amountDue, locale)) ?? plan;
    return buildNoticeEmail({
      locale, subject: t.failSubject, title: t.failTitle,
      paras: [fill(t.failLead, { date: day(b?.created ?? row.period_start), amount }), b?.nextAttempt ? fill(t.failNext, { next: day(b.nextAttempt) }) : t.failSoon, t.failPaused],
      cta: { label: t.failPay, url: b?.hosted ?? account }, notes: [t.failEnd], links: b?.hosted ? [{ label: t.manage, url: account }] : [], reply: t.reply,
    });
  }
  if (letter === "paid") {
    return buildNoticeEmail({ locale, subject: t.paidSubject, title: t.paidTitle, paras: [fill(t.paidLead, { date: day(row.period_end) })], cta: { label: t.paidCta, url: `${s}/${locale}/cast` }, links: [{ label: t.manage, url: account }], reply: t.reply });
  }
  if (letter === "unpaid_end") {
    return buildNoticeEmail({ locale, subject: t.endSubject, title: t.endTitle, paras: [t.endLead, t.endKeep, t.endBack], cta: { label: t.endCta, url: account }, reply: t.reply });
  }
  if (letter === "resume") {
    const n = facts.next ?? null;
    const amount = (n && money(n.currency, n.amount, locale)) ?? plan;
    const credit = n && n.credit > 0 ? money(n.currency, n.credit, locale) : null;
    return buildNoticeEmail({
      locale, subject: t.resumeSubject, title: t.resumeTitle, paras: [t.resumeLead, row.plan === "year" ? t.everyYear : t.everyMonth],
      card: [{ k: t.cardNext, v: day(row.period_end) }, { k: t.cardAmount, v: amount, ...(credit ? { sub: fill(t.credit, { credit }) } : {}) }],
      perksTitle: t.perksTitle, perks: openLetterPerks("member", locale), notes: [t.resumeOff],
      cta: { label: t.paidCta, url: `${s}/${locale}/cast` }, links: [{ label: t.manage, url: account }], reply: t.reply,
    });
  }
  if (letter === "renewed") {
    // what the card was charged (the bill's amount_paid); when the account balance paid all of it, the bill's total
    const r = facts.renewal ?? null;
    const total = (r && money(r.currency, r.total, locale)) ?? plan;
    const paid = (r && money(r.currency, r.paid, locale)) ?? plan;
    const byCredit = !!r && r.paid <= 0 && r.total > 0;
    const credit = r && r.total > r.paid ? money(r.currency, r.total - r.paid, locale) : null;
    const ending = row.cancel_at_period_end === 1 || row.cancel_at != null;
    const v = { date: day(r?.at ?? row.period_start), amount: paid, total, until: day(row.period_end) };
    return buildNoticeEmail({
      locale, subject: fill(byCredit ? t.renewSubjectCredit : t.renewSubject, v), title: t.renewTitle,
      paras: [fill(byCredit ? t.renewLeadCredit : t.renewLead, v), ...(ending ? [] : [row.plan === "year" ? t.everyYear : t.everyMonth])],
      card: [{ k: t.cardPaid, v: paid, ...(credit ? { sub: fill(t.credit, { credit }) } : {}) }, ...(ending ? [] : [{ k: t.cardNext, v: day(row.period_end) }])],
      perksTitle: t.perksTitle, perks: openLetterPerks("member", locale), notes: ending ? [] : [fill(t.renewOff, v)],
      cta: { label: t.paidCta, url: `${s}/${locale}/cast` },
      links: [...(r?.hosted ? [{ label: t.renewReceipt, url: r.hosted }] : []), { label: t.manage, url: account }], reply: t.reply,
    });
  }
  const p = facts.pause ?? { from: row.paused_from ?? row.period_end ?? Date.now(), until: row.paused_until ?? row.period_end ?? Date.now() };
  const v = { from: day(p.from), until: day(p.until), amount: plan };
  return buildNoticeEmail({ locale, subject: fill(t.pauseSubject, v), title: t.pauseTitle, paras: [fill(t.pauseLead, v), fill(t.pauseBack, v), t.pauseKeep], notes: [fill(t.pauseOff, v)], links: [{ label: t.manage, url: account }], reply: t.reply });
}

/* ---------------- the facts from Stripe ---------------- */

/** the next charge after the account balance — Stripe's preview of that bill, else the plan's price less the balance */
async function nextCharge(row: SubscriptionRow): Promise<SubLetterFacts["next"]> {
  const p = await nextBillPreview(row.stripe_subscription_id);
  if (p) return { amount: p.due, credit: Math.max(0, p.total - p.due), currency: p.currency };
  if (row.amount_minor == null || !row.currency) return null;
  let credit = 0;
  if (row.stripe_customer_id) {
    try {
      const b = await customerBalance(row.stripe_customer_id);
      if (b.balance < 0 && (b.currency ?? "").toLowerCase() === row.currency.toLowerCase()) credit = Math.min(row.amount_minor, -b.balance);
    } catch { /* the full price, then */ }
  }
  return { amount: row.amount_minor - credit, credit, currency: row.currency };
}

/* ---------------- sending ---------------- */

export type SendState = "sent" | "already" | "off" | "no_email" | "skipped" | "failed";

/** Send one membership letter, once. `extraKey` lets the caller pass the before-picture for the resume key. */
export async function sendSubLetter(letter: SubLetter, row: SubscriptionRow, i: { before?: SubscriptionRow | null; facts?: SubLetterFacts; via?: string } = {}): Promise<SendState> {
  // a pass or a complimentary membership is not billed — nothing here applies to them
  if (isPassSubscription(row.stripe_subscription_id) || isCompSubscription(row.stripe_subscription_id)) return "skipped";
  if (!letterOn(SWITCH[letter])) { recordOps("sub_letter", `${letter} ${row.stripe_subscription_id} off`); return "off"; }
  const email = customerEmailById(row.customer_id);
  if (!email) return "no_email";
  const kind = SUB_LETTER_KIND[letter];
  const key = letterKey(letter, row, i.before);
  if (!claim(key, kind, email)) return "already";
  const locale = asLocale(customerLocaleById(row.customer_id) ?? "en");
  let facts = i.facts ?? {};
  try {
    if (letter === "payfail" && facts.bill === undefined) facts = { ...facts, bill: await openBillFor(row.stripe_subscription_id) };
    if (letter === "resume" && facts.next === undefined) facts = { ...facts, next: await nextCharge(row) };
  } catch { /* the letter falls back to the plan's price and the account page */ }
  let r: { ok: boolean; id?: string; error?: string };
  try {
    const m = buildSubLetter(letter, row, locale, facts, tzOf(row.customer_id));
    r = await sendEmail(email, m.subject, m.html, m.text, { kind, customerId: row.customer_id, locale });
  } catch (e) {
    r = { ok: false, error: e instanceof Error ? e.message : "build" };
  }
  recordEmail(key, kind, email, r.ok ? "sent" : "failed", r.ok ? r.id : r.error);
  recordOps("sub_letter", `${letter} ${row.stripe_subscription_id} ${locale}${i.via ? ` via ${i.via}` : ""} ${r.ok ? "sent" : "failed:" + (r.error ?? "?").slice(0, 80)}`);
  return r.ok ? "sent" : "failed";
}

const STATE_ZH: Record<SendState, string> = {
  sent: "已寄给读者", already: "之前已寄过（这次不重复）", off: "没寄：这种信在后台关着（/admin/letters）", no_email: "没寄：没有信箱", skipped: "不适用", failed: "寄送失败（看 ops）",
};
const LETTER_ZH: Record<SubLetter, string> = { payfail: "扣款失败通知", paid: "补缴成功通知", unpaid_end: "欠费结束通知", resume: "恢复续订确认", pause: "暂停确认", renewed: "续费成功" };

/**
 * The webhook's part: after the mirror is written, the letter this change calls for. Returns lines for Neil's alert
 * (lib/sub-alert) so he sees the reader was told — or why not.
 */
export async function onSubscriptionChange(before: SubscriptionRow | null, s: StripeSubscription, row: SubscriptionRow | null, deleted: boolean): Promise<string[]> {
  if (!row) return [];
  const letter = subLetterFor(before, s, deleted);
  if (!letter) return [];
  const state = await sendSubLetter(letter, row, { before, via: "webhook" }).catch(() => "failed" as const);
  return [`读者信　${LETTER_ZH[letter]}：${STATE_ZH[state]}`];
}

/* ---------------- 10-24 续费成功 (Neil: 「然后续费为什么没有发邮件呢」) ---------------- */

const DAY = 86_400_000;

/**
 * The renewals that went through, each told once. A renewing membership (`sub_…`, active) whose current period began in
 * the last three days — and more than a day after it was made, so not its first period — is looked up on Stripe until its
 * bill is paid (Stripe charges about an hour after the period turns over). Not when this period already had the
 * 「扣款失败／补缴成功」 letters (that pair tells the story), nor when the bill was voided. 20 a run, from the 10-minute sweep.
 */
export async function runRenewalReceipts(now = Date.now()): Promise<{ sent: number; waiting: number; skipped: number; failed: number }> {
  const out = { sent: 0, waiting: 0, skipped: 0, failed: 0 };
  if (!letterOn("sub_renewed")) return out;
  const rows = db().prepare(
    `SELECT s.* FROM subscriptions s
      WHERE substr(s.stripe_subscription_id, 1, 4) = 'sub_' AND s.status = 'active' AND s.refunded_at IS NULL
        AND s.period_start IS NOT NULL AND s.period_start > ? AND s.period_start <= ? AND s.period_start > s.created_at + ?
        AND NOT EXISTS (SELECT 1 FROM emails e WHERE e.kind = 'sub_renewed' AND e.session_id = 'sub-renewed:' || s.stripe_subscription_id || ':' || CAST(s.period_start AS INTEGER) AND e.status <> 'failed')
        AND NOT EXISTS (SELECT 1 FROM emails e WHERE e.kind = 'sub_payfail' AND e.session_id IN ('sub-payfail:' || s.stripe_subscription_id || ':' || CAST(COALESCE(s.period_end, 0) AS INTEGER), 'sub-paid:' || s.stripe_subscription_id || ':' || CAST(COALESCE(s.period_end, 0) AS INTEGER)))
      ORDER BY s.period_start LIMIT 20`,
  ).all(now - 3 * DAY, now - 20 * 60_000, DAY) as unknown as SubscriptionRow[];
  for (const row of rows) {
    let found: Awaited<ReturnType<typeof renewalBillFor>>;
    try { found = await renewalBillFor(row.stripe_subscription_id, row.period_start!); } catch { out.waiting++; continue; }
    if (found.state === "pending") { out.waiting++; continue; }
    if (found.state === "none") {
      // nothing to tell (voided, or no renewal bill after all) — written down so the run stops asking Stripe
      const email = customerEmailById(row.customer_id) ?? "";
      recordEmail(letterKey("renewed", row), "sub_renewed", email, "skipped", "no paid renewal bill");
      out.skipped++;
      continue;
    }
    const state = await sendSubLetter("renewed", row, { facts: { renewal: found.bill }, via: "renewal" }).catch(() => "failed" as const);
    if (state === "sent") out.sent++; else if (state === "failed") out.failed++; else out.skipped++;
  }
  if (out.sent || out.failed || out.skipped) recordOps("sub_renewed_run", JSON.stringify(out));
  return out;
}
