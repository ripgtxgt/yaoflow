import { resolveMx, resolve4, resolve6 } from "node:dns/promises";
import { checkEmail, emailSyntaxOk, normalizeEmail } from "./email-check";

/**
 * Server half of the 邮箱校对 (09-26): does the domain receive mail at all?
 * MX first, then A/AAAA (RFC 5321 fallback). Only a definite "no such
 * domain / no records" refuses; a slow or failing resolver lets it through —
 * a DNS hiccup must never stop someone paying.
 */
const CACHE = new Map<string, { ok: boolean; at: number }>();
const TTL = 6 * 3_600_000;

const NONE = new Set(["ENOTFOUND", "ENODATA", "ENONAME", "NXDOMAIN"]);

async function has(fn: () => Promise<unknown[]>): Promise<boolean | null> {
  try {
    const r = await Promise.race([fn(), new Promise<never>((_, rej) => setTimeout(() => rej(Object.assign(new Error("timeout"), { code: "TIMEOUT" })), 2500))]);
    return r.length > 0;
  } catch (e) {
    return NONE.has((e as { code?: string }).code ?? "") ? false : null;
  }
}

export async function domainTakesMail(domain: string): Promise<boolean> {
  const d = domain.toLowerCase();
  const hit = CACHE.get(d);
  if (hit && Date.now() - hit.at < TTL) return hit.ok;
  const mx = await has(() => resolveMx(d));
  let ok: boolean;
  if (mx === true || mx === null) ok = true;
  else {
    const a = await has(() => resolve4(d));
    const aaaa = a ? a : await has(() => resolve6(d));
    ok = a !== false || aaaa !== false;
  }
  CACHE.set(d, { ok, at: Date.now() });
  return ok;
}

export type ServerEmailCheck = { ok: true; email: string } | { ok: false; error: "bad_email" | "email_domain"; suggestion?: string };

/**
 * For API routes: normalised address, or why not. A suspected typo is NOT
 * refused here — the page already asked and the reader confirmed — but a
 * shape that cannot be delivered, or a domain with no mail server, is.
 */
export async function serverCheckEmail(raw: string): Promise<ServerEmailCheck> {
  const email = normalizeEmail(raw);
  if (!emailSyntaxOk(email)) {
    const v = checkEmail(email);
    return { ok: false, error: "bad_email", ...(v.ok === false && v.kind === "typo" ? { suggestion: v.suggestion } : {}) };
  }
  if (!(await domainTakesMail(email.split("@")[1]))) {
    const v = checkEmail(email);
    return { ok: false, error: "email_domain", ...(v.ok === false && v.kind === "typo" ? { suggestion: v.suggestion } : {}) };
  }
  return { ok: true, email };
}
