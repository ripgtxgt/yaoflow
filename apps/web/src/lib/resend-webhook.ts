import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Resend → us (09-11). Resend signs webhooks the Svix way: the secret is
 * `whsec_<base64>`, the signed string is `<id>.<timestamp>.<raw body>`, and
 * the `svix-signature` header carries one or more `v1,<base64 hmac>` entries.
 * No SDK — the check is twenty lines and the raw body must be used as-is.
 */

export const SVIX_TOLERANCE_S = 5 * 60;

export interface SvixHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

export function verifySvix(payload: string, h: SvixHeaders, secret: string, nowMs = Date.now()): boolean {
  if (!h.id || !h.timestamp || !h.signature) return false;
  const ts = Number(h.timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > SVIX_TOLERANCE_S) return false;
  const raw = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    return false;
  }
  if (key.length === 0) return false;
  const expected = createHmac("sha256", key).update(`${h.id}.${h.timestamp}.${payload}`).digest();
  for (const part of h.signature.split(" ")) {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) continue;
    const given = Buffer.from(sig, "base64");
    if (given.length === expected.length && timingSafeEqual(given, expected)) return true;
  }
  return false;
}

export interface MailEvent {
  type: string;
  at: number;
  emailId: string;
  to: string | null;
  subject: string | null;
  /** the `kind` tag attached at send time, if any */
  kind: string | null;
  /** bounce / failure text, kept short */
  note: string | null;
}

/** The parts of a Resend email event we keep. Anything else (domain, contact events…) → null. */
export function parseMailEvent(json: unknown): MailEvent | null {
  if (!json || typeof json !== "object") return null;
  const e = json as { type?: unknown; created_at?: unknown; data?: Record<string, unknown> };
  if (typeof e.type !== "string" || !e.type.startsWith("email.") || !e.data || typeof e.data !== "object") return null;
  const d = e.data;
  const emailId = typeof d.email_id === "string" ? d.email_id : null;
  if (!emailId) return null;
  const at = typeof e.created_at === "string" ? Date.parse(e.created_at) : NaN;
  const to = Array.isArray(d.to) && typeof d.to[0] === "string" ? d.to[0] : null;
  const subject = typeof d.subject === "string" ? d.subject : null;
  let kind: string | null = null;
  const tags = d.tags;
  if (tags && typeof tags === "object" && !Array.isArray(tags)) {
    const v = (tags as Record<string, unknown>).kind;
    if (typeof v === "string") kind = v;
  } else if (Array.isArray(tags)) {
    const t = tags.find((x) => x && typeof x === "object" && (x as { name?: unknown }).name === "kind") as { value?: unknown } | undefined;
    if (t && typeof t.value === "string") kind = t.value;
  }
  let note: string | null = null;
  const b = d.bounce as { type?: unknown; subType?: unknown; message?: unknown } | undefined;
  if (b && typeof b === "object") {
    note = [b.type, b.subType, b.message].filter((x): x is string => typeof x === "string").join(" · ").slice(0, 300) || null;
  }
  const f = d.failed as { reason?: unknown } | undefined;
  if (!note && f && typeof f === "object" && typeof f.reason === "string") note = f.reason.slice(0, 300);
  return { type: e.type, at: Number.isFinite(at) ? at : Date.now(), emailId, to, subject, kind, note };
}
