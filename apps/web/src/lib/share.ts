import type { LineValue } from "@yaoflow/engine";

/**
 * Share-card encoding.
 *
 * A share link carries ONLY the six line values — never the question, never the
 * reading. It is deliberately short and guessable-by-design: there is nothing
 * private in it. Private readings live at /reading?sid=… and are never shareable.
 */

const VALID = new Set([6, 7, 8, 9]);

/** Six values → "678967" style code. */
export function encodeCast(values: readonly LineValue[]): string {
  return values.join("");
}

export function decodeCast(code: string): LineValue[] | null {
  if (!/^[6789]{6}$/.test(code)) return null;
  const values = [...code].map(Number) as LineValue[];
  return values.every((v) => VALID.has(v)) ? values : null;
}

/** One-line takeaway shown on the card — from the classical judgment, never the AI reading. */
export function shareUrl(origin: string, locale: string, values: readonly LineValue[], ref?: string): string {
  const base = `${origin}/${locale}/share/${encodeCast(values)}`;
  return ref ? `${base}?r=${encodeURIComponent(ref)}` : base;
}

/**
 * The optional one-line verdict a sharer chooses to attach (09-10, 裂变 V1 ③).
 * Off by default; when on, the link points at /share/<code>/s/<quote>, where
 * the quote rides as a base64url path segment — short, visible, and nothing
 * the sharer did not pick themselves. Capped so a card stays a card.
 */
export const SHARE_QUOTE_MAX = 160;

export function encodeQuote(text: string): string {
  const clean = text.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, SHARE_QUOTE_MAX);
  const bytes = typeof TextEncoder !== "undefined" ? new TextEncoder().encode(clean) : new Uint8Array(Buffer.from(clean, "utf8"));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = typeof btoa === "function" ? btoa(bin) : Buffer.from(bin, "binary").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeQuote(seg: string): string | null {
  if (!/^[A-Za-z0-9_-]{1,1000}$/.test(seg)) return null; // 160 CJK chars ≈ 640 base64url chars
  try {
    const b64 = seg.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (seg.length % 4)) % 4);
    const text = Buffer.from(b64, "base64").toString("utf8").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
    // random letters decode to byte salad: no replacement characters, and at least one real letter
    if (/\uFFFD/.test(text) || !/[\p{L}\p{N}]/u.test(text)) return null;
    return text.length >= 2 && text.length <= SHARE_QUOTE_MAX ? text : null;
  } catch {
    return null;
  }
}

export function shareUrlWithQuote(origin: string, locale: string, values: readonly LineValue[], quote: string | null): string {
  const base = `${origin}/${locale}/share/${encodeCast(values)}`;
  return quote ? `${base}/s/${encodeQuote(quote)}` : base;
}

