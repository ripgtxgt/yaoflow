/**
 * Dashboard access (09-18). The key used to ride in every link (`?key=`), so
 * it sat in browser history, in referrers and in every URL Neil pasted. Now
 * the key is presented once — a login form, or the old `?key=` link, which
 * the middleware swaps for a cookie and strips — and a derived cookie carries
 * the session for a month. The cookie is a digest of the key, never the key.
 *
 * Web Crypto only, so this runs in the middleware (edge) and in Node alike.
 */
export const ADMIN_COOKIE = "yf_admin";
export const ADMIN_COOKIE_DAYS = 30;

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The cookie value a valid session carries; null when no key is configured. */
export async function adminToken(): Promise<string | null> {
  const key = process.env.ADMIN_KEY;
  if (!key) return null;
  return sha256Hex(`yaoflow-admin:${key}`);
}

/** True for a matching cookie, or for the key itself (forms and cron calls still send it). */
export async function isAdmin(cookieValue: string | undefined, key?: string | null): Promise<boolean> {
  const expected = process.env.ADMIN_KEY;
  if (!expected) return false;
  if (key && key === expected) return true;
  if (!cookieValue) return false;
  return cookieValue === (await adminToken());
}

export const ADMIN_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: ADMIN_COOKIE_DAYS * 86_400,
};
