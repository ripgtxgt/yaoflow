import { deliveryAddress } from "./mail-to";
import { db, endPaySessionsOnForeign, orderBySession, recordEmail, recordOps, storedReadingForSession, upsertCustomer } from "./db";
import { buildReadingEmail, sendEmail } from "./email";
import { hexName } from "./names";
import { asLocale } from "./locales";
import { pick, resolveServerChart, type Bi } from "./reading";
import type { LineValue } from "@yaoflow/engine";

/**
 * 09-26 (Neil: 「用 Apple Pay 的用户不用填邮箱，后台显示的是苹果 ID 的邮箱，用户接受吗？」):
 * a wallet payment carries the address from the payment sheet, often an
 * iCloud one the reader never reads. Within two days of paying, the reading
 * page lets them send it to another address; the order, the cast and its
 * revisit move to that address, so signing in with it finds the reading.
 */
export const SENDTO_WINDOW_MS = 48 * 3_600_000;

export type SendToResult = { ok: true; email: string } | { ok: false; error: "not_found" | "not_allowed" | "expired" | "send_failed" };

export async function sendReadingTo(sid: string, email: string, signedInCustomerId: number | null, now = Date.now()): Promise<SendToResult> {
  if (!/^pi_[A-Za-z0-9]+$/.test(sid)) return { ok: false, error: "not_allowed" };
  const o = orderBySession(sid);
  const s = storedReadingForSession(sid);
  if (!o || !s) return { ok: false, error: "not_found" };
  if (now - o.created_at > SENDTO_WINDOW_MS) return { ok: false, error: "expired" };
  // a signed-in reader may only redirect their own order
  if (signedInCustomerId && o.customer_id && signedInCustomerId !== o.customer_id) return { ok: false, error: "not_allowed" };
  const e = email.trim().toLowerCase();
  const l = asLocale(s.locale);
  const chart = resolveServerChart({ question: s.question, values: s.values as LineValue[], castAtMs: s.castAtMs, tzOffsetMinutes: s.tzOffsetMinutes }, true);
  const body = (s.reading ?? {}) as Record<string, Bi | undefined>;
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  const mail = buildReadingEmail({
    locale: l, tier: s.tier === "deep" ? "deep" : "one", question: s.question, values: s.values,
    hexName: hexName(chart.cast.primary, l), changedName: chart.cast.changed ? hexName(chart.cast.changed, l) : null,
    headline: pick((body.verdict ?? body.summary) as Bi, l),
    url: `${site}/${l}/reading?sid=${encodeURIComponent(sid)}`,
  });
  // an anonymous wallet buyer's account was made from the sheet's address — move the order to the one they chose
  const cid = signedInCustomerId ?? upsertCustomer(e, l);
  // 10-02: filed under the typed address by a browser not signed in to it — that address's payment-made sessions end
  if (!signedInCustomerId) endPaySessionsOnForeign(cid, "send_to");
  const r = await sendEmail(e, mail.subject, mail.html, mail.text, { kind: "reading", sessionId: sid, customerId: cid });
  if (!r.ok) return { ok: false, error: "send_failed" };
  const d = db();
  if (!signedInCustomerId) {
    d.prepare("UPDATE orders SET email = ?, customer_id = ? WHERE session_id = ?").run(e, cid, sid);
    d.prepare("UPDATE casts SET customer_id = ? WHERE id = (SELECT cast_id FROM orders WHERE session_id = ?)").run(cid, sid);
    d.prepare("UPDATE revisits SET email = ?, customer_id = ? WHERE session_id = ?").run(e, cid, sid);
  }
  recordEmail(sid, "reading", e, "sent", r.id);
  recordOps("reading_sendto", `${sid.slice(-8)} ${signedInCustomerId ? "signed-in" : "moved"}`);
  return { ok: true, email: e };
}


/**
 * 10-23 进度表 107 ② 重寄交付信: the reading's letter again, to the address on its order (the admin asked, with a reason).
 * Nothing moves — unlike sendReadingTo, the order, the cast and the revisit stay where they are.
 */
export async function resendReadingEmail(sid: string): Promise<{ ok: boolean; error?: string }> {
  const o = orderBySession(sid);
  const s = storedReadingForSession(sid);
  if (!o || !s) return { ok: false, error: "not_found" };
  // 10-30: the account's address when the order has one (a typo typed into Stripe bounced — lib/mail-to.ts)
  const to = deliveryAddress({ email: o.email, customerId: o.customer_id });
  if (!to) return { ok: false, error: "no_email" };
  const l = asLocale(s.locale);
  const chart = resolveServerChart({ question: s.question, values: s.values as LineValue[], castAtMs: s.castAtMs, tzOffsetMinutes: s.tzOffsetMinutes }, true);
  const body = (s.reading ?? {}) as Record<string, Bi | undefined>;
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  const mail = buildReadingEmail({
    locale: l, tier: s.tier === "deep" ? "deep" : "one", question: s.question, values: s.values,
    hexName: hexName(chart.cast.primary, l), changedName: chart.cast.changed ? hexName(chart.cast.changed, l) : null,
    headline: pick((body.verdict ?? body.summary) as Bi, l),
    url: `${site}/${l}/reading?sid=${encodeURIComponent(sid)}`,
  });
  const r = await sendEmail(to, mail.subject, mail.html, mail.text, { kind: "reading", sessionId: sid, customerId: o.customer_id });
  recordOps("reading_resend", `${sid.slice(-8)} ${r.ok ? "sent" : "failed"}`);
  return r.ok ? { ok: true } : { ok: false, error: r.error ?? "send_failed" };
}
