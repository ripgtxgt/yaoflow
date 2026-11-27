import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * One-click unsubscribe for the launch mails: a link that carries the
 * address and an HMAC of it, so nobody can unsubscribe someone else by
 * guessing, and no login is needed to stop the mail.
 */
function secret(): string {
  return process.env.UNSUB_SECRET ?? process.env.ADMIN_KEY ?? "";
}

export function unsubToken(email: string): string {
  return createHmac("sha256", secret()).update(email.trim().toLowerCase()).digest("hex").slice(0, 32);
}

export function unsubValid(email: string, token: string): boolean {
  if (!secret() || !/^[0-9a-f]{32}$/.test(token)) return false;
  const expect = Buffer.from(unsubToken(email));
  const got = Buffer.from(token);
  return expect.length === got.length && timingSafeEqual(expect, got);
}

export function unsubUrl(site: string, email: string, locale: string): string {
  return `${site}/api/unsub?e=${encodeURIComponent(email.trim().toLowerCase())}&t=${unsubToken(email)}&l=${encodeURIComponent(locale)}`;
}
