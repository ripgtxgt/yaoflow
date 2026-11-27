/**
 * Buyer country detection, used only to decide whether Stripe's Managed Payments
 * can serve this checkout. Never stored, never used for profiling.
 *
 * Three tiers, cheapest first:
 *   1. A country header from the edge (Cloudflare / Vercel / nginx GeoIP) — free, instant.
 *   2. A free IP lookup with a short timeout, memoised per IP.
 *   3. Fall back to null, and the caller keeps its configured default.
 */


/** Country codes Stripe Managed Payments cannot sell to. */
const MP_UNSUPPORTED = new Set(["CN"]);

const HEADERS = [
  "cf-ipcountry",           // Cloudflare
  "x-vercel-ip-country",    // Vercel
  "x-geo-country",          // custom / nginx GeoIP
  "x-country-code",
];

// 09-25 合规: the ipapi.co fallback is gone. The site sits behind Cloudflare, so the
// edge header is always there; the fallback sent buyer IPs to a third party the
// privacy policy never named, for a path that no longer fires.
/** Best-effort ISO country code for the buyer, or null if undetermined. */
/** The country the edge saw, from its header alone — no lookup, safe to call on every page view. */
export function edgeCountry(headers: Headers): string | null {
  for (const h of HEADERS) {
    const v = headers.get(h)?.trim().toUpperCase();
    if (v && /^[A-Z]{2}$/.test(v)) return v;
  }
  return null;
}

export async function buyerCountry(headers: Headers): Promise<string | null> {
  for (const h of HEADERS) {
    const v = headers.get(h)?.trim().toUpperCase();
    if (v && /^[A-Z]{2}$/.test(v)) return v;
  }
  return null;
}

/**
 * Whether Managed Payments should be used for this buyer.
 * Unknown country keeps the configured default: we would rather let Stripe carry
 * the tax burden than silently drop it for everyone on a lookup failure.
 */
export function managedPaymentsAllowed(country: string | null): boolean {
  if (!country) return true;
  return !MP_UNSUPPORTED.has(country);
}

export const MANAGED_PAYMENTS_UNSUPPORTED = MP_UNSUPPORTED;

/**
 * 09-26 (Neil: 「台湾、香港不走 Managed Payments」): buyers in Taiwan and Hong Kong
 * get a plain Stripe checkout — YaoFlow's own page instead of Link's green one,
 * and without Managed Payments' extra fee. Hong Kong has no sales tax; Taiwan
 * asks a foreign e-service seller to register only above NT$480,000 a year of
 * sales to individuals, far above us today. Decided by the edge country OR the
 * device clock (a proxy changes the first, not the second).
 * STRIPE_MP_OFF_REGIONS overrides the list ("" = none).
 */
export const MP_OFF_REGIONS_DEFAULT = ["TW", "HK"] as const;
const REGION_TZ: Record<string, string[]> = { TW: ["Asia/Taipei"], HK: ["Asia/Hong_Kong"] };

export function mpOffRegions(): string[] {
  const v = process.env.STRIPE_MP_OFF_REGIONS;
  if (v === undefined) return [...MP_OFF_REGIONS_DEFAULT];
  return v.split(",").map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x));
}

/** The region whose buyers skip Managed Payments, or null. Pure — the client uses the same rule with the default list. */
export function plainCheckoutRegion(country: string | null | undefined, timeZone: string | null | undefined, regions: readonly string[] = mpOffRegions()): string | null {
  const c = (country ?? "").toUpperCase();
  if (c && regions.includes(c)) return c;
  for (const r of regions) if (timeZone && (REGION_TZ[r] ?? []).includes(timeZone)) return r;
  return null;
}
