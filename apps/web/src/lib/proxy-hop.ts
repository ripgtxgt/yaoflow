/**
 * 10-28 (Neil: 「访客 m9d4 页面报错 res:SCRIPT error-0c33738 / global:Loading chunk 853」→「要，加吧，我们能把这种屏蔽掉吗」).
 * That "visitor" was a scraper behind rotating proxies: in 11 seconds its requests came from Thailand, Vietnam, Canada and
 * an Alibaba Cloud host in Singapore, with an old desktop Chrome (109), no page view, no click — the proxy dropped some
 * of the page's script loads, and our error script reported them. A reader's phone does not change country between two
 * requests of one page in the same second.
 *
 * So api/track notes, per tab session, where its requests come from (the edge's country, or the network part of the
 * address when the edge gives none). A session seen from two countries — or three networks — within two minutes is
 * hopping between proxies. Its page errors are held a few seconds before they reach the event file and the live
 * board, long enough for the burst of one page load to show the hop, and dropped if it does (counted in ops as
 * client_error_proxy, so the volume stays visible). Its other events are left alone.
 *
 * Not a block: the scraper still gets the page. Refusing it at the door would also refuse real readers on old Windows
 * Chrome or behind a VPN, and rotating addresses cannot be listed — the board stays clean, the site stays open.
 */

export const HOP_WINDOW_MS = 2 * 60_000;
const MAX_SESSIONS = 5_000;

interface Seen { at: number; keys: Map<string, number> }
const SEEN = new Map<string, Seen>();

/** The network part of an address: a.b of IPv4, the first two groups of IPv6. */
export function netOf(ip: string | null | undefined): string | null {
  const v = (ip ?? "").trim();
  if (!v) return null;
  if (v.includes(":")) return v.toLowerCase().split(":").slice(0, 2).join(":");
  const p = v.split(".");
  return p.length === 4 ? `${p[0]}.${p[1]}` : null;
}

/** Note where this session's request came from; returns whether the session is hopping. */
export function noteHop(s: string, country: string | null, ip: string | null, now = Date.now()): boolean {
  // ids shared by many tabs (no session storage) are not one visitor
  if (!s || s === "anon" || s === "nosession") return false;
  let r = SEEN.get(s);
  if (!r) {
    r = { at: now, keys: new Map() };
    SEEN.set(s, r);
    while (SEEN.size > MAX_SESSIONS) { const k = SEEN.keys().next().value; if (k === undefined) break; SEEN.delete(k); }
  }
  r.at = now;
  for (const [k, t] of r.keys) if (now - t > HOP_WINDOW_MS) r.keys.delete(k);
  if (country) r.keys.set(`c:${country}`, now);
  const net = netOf(ip);
  if (net) r.keys.set(`n:${net}`, now);
  return isHopping(s, now);
}

export function isHopping(s: string, now = Date.now()): boolean {
  const r = SEEN.get(s);
  if (!r) return false;
  let c = 0, n = 0;
  for (const [k, t] of r.keys) {
    if (now - t > HOP_WINDOW_MS) continue;
    if (k.startsWith("c:")) c++; else n++;
  }
  return c >= 2 || n >= 3;
}

/** How long a page error waits for the rest of its page load's burst (TRACK_ERROR_HOLD_MS, default 8 s). */
export function errorHoldMs(): number {
  const v = Number(process.env.TRACK_ERROR_HOLD_MS);
  return Number.isFinite(v) && v >= 0 ? Math.min(v, 60_000) : 8_000;
}

/** The requester's address as the edge saw it. */
export function clientIp(headers: Headers): string | null {
  return headers.get("cf-connecting-ip")?.trim() || headers.get("x-real-ip")?.trim() || headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

/** tests */
export function resetHops(): void { SEEN.clear(); }
