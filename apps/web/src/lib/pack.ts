import { customerEmailById, customerIdByEmail, customerLocaleById, emailAlreadySent, packBalance, recordEmail, recordOps, recordPack, type MemberPackRow } from "./db";
import { buildPackBoughtEmail, sendEmail } from "./email";
import { asLocale } from "./locales";
import { formatMoney, isCurrency } from "./money";
import { DEEP_PER_MONTH, PACK_SMALL_UNITS, PACK_UNITS, type PackQuote } from "./sub-plan";
import type { CheckoutSession } from "./stripe";

/**
 * 会员增购包 (09-29, Neil: 「15 份 699」「好，做吧」).
 *
 * A paid one-off Checkout session (metadata.kind = "pack") adds 15 full readings
 * to a member's balance: spent after the period's own allowance, never lapsing
 * while the membership lives, refunds take the unspent ones back. At most 2 packs
 * a period and at most 20 unspent held (checked before checkout; sub-plan).
 * Idempotent per session: the account page's return and the fulfil cron may both call it.
 */
export type PackResult =
  | { ok: true; row: MemberPackRow; created: boolean }
  | { ok: false; why: "not_pack" | "unpaid" | "no_customer" };

export function fulfilPack(s: CheckoutSession): PackResult {
  if (s.metadata?.kind !== "pack") return { ok: false, why: "not_pack" };
  if (s.payment_status !== "paid") return { ok: false, why: "unpaid" };
  const email = (s.metadata?.email || s.customer_details?.email || "").toLowerCase();
  const cid = Number(s.metadata?.cust) || (email ? customerIdByEmail(email) : null);
  if (!cid) return { ok: false, why: "no_customer" };
  // 10-02: the small pack (5), and a large one that took in this period's singles / small packs (its units are what it added)
  const size = s.metadata?.size === "small" ? "small" : "large";
  const r = recordPack({
    customerId: cid, sessionId: s.id, paymentIntent: s.payment_intent ?? null,
    units: Number(s.metadata?.units) || (size === "small" ? PACK_SMALL_UNITS : PACK_UNITS), currency: s.currency ? s.currency.toUpperCase() : null, amountMinor: s.amount_total ?? null,
    size, creditMinor: Number(s.metadata?.credit_minor) || 0, creditUnits: Number(s.metadata?.credit_units) || 0,
  });
  if (r.created) recordOps("pack_bought", `cust ${cid} ${size}${Number(s.metadata?.credit_units) ? ` credit ${s.metadata?.credit_units}` : ""} ${s.currency ?? "?"} ${s.amount_total ?? "?"}`);
  return { ok: true, ...r };
}

/**
 * 09-29 (Neil: 「会员增购包购买之后不会自动发邮件的吗？」): the letter that says the pack arrived. Once per pack
 * (keyed on its Checkout session); both fulfilment paths call it, the second finds it already sent.
 */
export async function notifyPackBought(row: MemberPackRow): Promise<boolean> {
  const key = `pack_bought:${row.session_id}`;
  if (emailAlreadySent(key, "pack_bought")) return false;
  const to = customerEmailById(row.customer_id);
  if (!to) return false;
  const locale = asLocale(customerLocaleById(row.customer_id) ?? "zh-hant");
  const cur = (row.currency ?? "").toUpperCase();
  const paid = isCurrency(cur) && row.amount_minor != null ? formatMoney(cur, row.amount_minor, locale) : "";
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  const m = buildPackBoughtEmail({ locale, paid, n: row.units, credit: row.credit_units ?? 0, left: packBalance(row.customer_id).left, cap: DEEP_PER_MONTH, castUrl: `${site}/${locale}/cast` });
  recordEmail(key, "pack_bought", to, "pending");
  const r = await sendEmail(to, m.subject, m.html, m.text, { kind: "pack_bought", sessionId: key, customerId: row.customer_id, locale });
  recordEmail(key, "pack_bought", to, r.ok ? "sent" : "failed", r.error ?? r.id);
  recordOps("pack_bought_mail", `cust ${row.customer_id} ${r.ok ? "sent" : "failed"}`);
  return r.ok;
}

/** Stripe line-item names — neutral "digital content" wording, like the plans. {n}: readings this purchase adds. */
export const PACK_NAMES: Record<string, string> = {
  zh: "YaoFlow 会员增购 · {n} 份深断（数字内容）", "zh-hant": "YaoFlow 會員增購 · {n} 份深斷（數位內容）", en: "YaoFlow member add-on · {n} full readings (digital content)",
  ja: "YaoFlow 会員追加 · 本格鑑定 {n} 回（デジタルコンテンツ）", ko: "YaoFlow 회원 추가 구매 · 심층 풀이 {n}회 (디지털 콘텐츠)", fr: "YaoFlow supplément membre · {n} lectures approfondies (contenu numérique)",
  de: "YaoFlow Mitglieder-Zusatz · {n} Tiefendeutungen (digitaler Inhalt)", es: "YaoFlow extra para miembros · {n} lecturas completas (contenido digital)", pt: "YaoFlow adicional de membro · {n} leituras completas (conteúdo digital)",
};
/** 10-02: a large pack that took in this period's singles — what the line says it is */
const PACK_CREDIT_NAMES: Record<string, string> = {
  zh: "YaoFlow 会员增购 · 补足 15 份深断（本期已买 {k} 份抵扣，这次加 {n} 份 · 数字内容）",
  "zh-hant": "YaoFlow 會員增購 · 補足 15 份深斷（本期已買 {k} 份抵扣，這次加 {n} 份 · 數位內容）",
  en: "YaoFlow member add-on · 15 full readings, {k} already bought this period ({n} added · digital content)",
  ja: "YaoFlow 会員追加 · 本格鑑定 15 回に充当（今期購入済み {k} 回分を差し引き、今回 {n} 回追加・デジタルコンテンツ）",
  ko: "YaoFlow 회원 추가 구매 · 심층 풀이 15회로 채우기 (이번 기간 구매한 {k}회 차감, 이번에 {n}회 추가 · 디지털 콘텐츠)",
  fr: "YaoFlow supplément membre · 15 lectures approfondies, dont {k} déjà achetées cette période ({n} ajoutées · contenu numérique)",
  de: "YaoFlow Mitglieder-Zusatz · 15 Tiefendeutungen, {k} davon in diesem Zeitraum schon gekauft ({n} neu · digitaler Inhalt)",
  es: "YaoFlow extra para miembros · 15 lecturas completas, {k} ya compradas este período ({n} añadidas · contenido digital)",
  pt: "YaoFlow adicional de membro · 15 leituras completas, {k} já compradas neste período ({n} adicionadas · conteúdo digital)",
};
export function packName(locale: string, q: Pick<PackQuote, "units" | "creditUnits">): string {
  const t = q.creditUnits > 0 ? PACK_CREDIT_NAMES[locale] ?? PACK_CREDIT_NAMES.en! : PACK_NAMES[locale] ?? PACK_NAMES.en!;
  return t.replace("{n}", String(q.units)).replace("{k}", String(q.creditUnits));
}
