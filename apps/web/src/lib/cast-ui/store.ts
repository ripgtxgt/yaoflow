import type { LineValue } from "@yaoflow/engine";
import { normalizeQ, type PastCast } from "@/lib/repeat-gate";
import type { Topic } from "@/lib/topic";

/**
 * 10-22 进度表 76 (CastFlow 拆分): what the cast page keeps in this browser — the day's casts (the 一事一占 guard's
 * record), the cast that survives a sign-in or a trip to Stripe, and the matter boxes already answered. Every
 * function swallows a missing or full storage: the page works the same, the guard is simply off.
 */

/* ---------- 一事一占: repeat-cast guard (localStorage, 24h) ----------
   The decision itself lives in lib/repeat-gate.ts (09-15: same matter, not
   same sentence; a per-topic cap). This is only the browser-side record. */
const CASTS_KEY = "yaoflow:casts";
export function pastCasts(): PastCast[] {
  try {
    const list = JSON.parse(localStorage.getItem(CASTS_KEY) ?? "[]") as PastCast[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
/**
 * 09-18: once a cast has become a reading, keep the way back to it — the gate
 * then offers "go back to that reading and ask there" instead of a re-cast.
 * Matched by the question as typed, most recent first.
 */
export function attachSid(q: string, sid: string, tier: "one" | "deep") {
  try {
    const list = pastCasts();
    const nq = normalizeQ(q);
    const hit = list.find((c) => c.q === nq);
    if (hit) { hit.sid = sid; hit.tier = tier; localStorage.setItem(CASTS_KEY, JSON.stringify(list)); }
  } catch { /* storage unavailable */ }
}

/** 09-26 (review): drop a checkout session that came back unpaid from the cast record. */
export function forgetSid(sid: string) {
  try {
    const list = pastCasts();
    let changed = false;
    for (const c of list) if (c.sid === sid && !c.verdict) { delete c.sid; delete c.tier; changed = true; }
    if (changed) localStorage.setItem(CASTS_KEY, JSON.stringify(list));
  } catch { /* storage unavailable */ }
}

export function rememberCast(q: string, hex: string, topic: Topic, det: Topic, waived = false, fig?: { v: readonly number[]; t: number }) {
  try {
    const list = pastCasts();
    // 09-22: a cast made after waiving a soft block is marked, so the waivers
    // can be counted — they used to be unlimited, and with a membership there
    // was no price left to slow anyone down either.
    list.unshift({ q: normalizeQ(q), at: Date.now(), hex, topic, det, raw: q.trim().slice(0, 450), ...(waived ? { waived: true } : {}), ...(fig && fig.v.length === 6 ? { v: [...fig.v], t: fig.t } : {}) });
    localStorage.setItem(CASTS_KEY, JSON.stringify(list.slice(0, 30)));
  } catch {
    /* storage unavailable — guard simply off */
  }
}

/* ---------- the cast survives a sign-in (localStorage, 2h) ----------
   09-10: a visitor from Instagram cast six lines, went to sign in, came back
   to an empty cast page and left. The magic link opens a new tab, so the
   figure is kept in localStorage and restored on the next visit to /cast. */
export interface PendingCast { q: string; values: LineValue[]; at: number; locale: string; /** 10-23 进度表 101: the pass picked for this checkout — a retry after coming back keeps it */ pass?: number; /** 09-26: set while the reader is on Stripe — kept so a cancel brings the figure back */ sid?: string; tier?: "one" | "deep"; /** 09-26 (review): when it was saved — the 2h life counts from here, not from the cast */ savedAt?: number; /** 10-09: that checkout offered Alipay (the mainland route) */ alipay?: boolean; /** 10-22: cast on a friend's 送一卦 link — the figure waits through a sign-in with its gift */ gift?: string }
const PENDING_KEY = "yaoflow:pending";
const PENDING_TTL = 2 * 3_600_000;
export function savePending(p: PendingCast) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify({ ...p, savedAt: Date.now() })); } catch { /* storage unavailable */ }
}
export function loadPending(): PendingCast | null {
  try {
    const p = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "null") as PendingCast | null;
    if (!p || !Array.isArray(p.values) || p.values.length !== 6 || Date.now() - (p.savedAt ?? p.at) > PENDING_TTL) return null;
    return p;
  } catch {
    return null;
  }
}
export function clearPending() {
  try { localStorage.removeItem(PENDING_KEY); } catch { /* nothing to clear */ }
}

/* ---------- a friend's gift this browser opened and has not spent (localStorage, 90 days) ----------
   10-22 (客服 #1928): a gift link was lost on the way — cast on it, went to sign in, came back to an empty page,
   then asked from the account page (/cast?q=, no gift=) and met the price. The link is remembered here once its
   page has seen it open; every later visit to /cast in this browser offers it again until it is spent, expired,
   or turns out to be the reader's own. The server stays the judge of all three. */
const GIFT_KEY = "yaoflow:gift";
const GIFT_TTL = 90 * 86_400_000;
const GIFT_TOKEN = /^[0-9a-f]{36}$/;
export function keepGift(token: string, now = Date.now()) {
  if (!GIFT_TOKEN.test(token)) return;
  try { localStorage.setItem(GIFT_KEY, JSON.stringify({ t: token, at: now })); } catch { /* storage unavailable */ }
}
export function keptGift(now = Date.now()): string | null {
  try {
    const g = JSON.parse(localStorage.getItem(GIFT_KEY) ?? "null") as { t?: unknown; at?: unknown } | null;
    if (!g || typeof g.t !== "string" || !GIFT_TOKEN.test(g.t) || typeof g.at !== "number" || now - g.at > GIFT_TTL) return null;
    return g.t;
  } catch {
    return null;
  }
}
/** forget the kept gift — only that one when a token is named (a newer link opened since stays) */
export function dropGift(token?: string | null) {
  try {
    const g = JSON.parse(localStorage.getItem(GIFT_KEY) ?? "null") as { t?: unknown } | null;
    if (token && g?.t !== token) return;
    localStorage.removeItem(GIFT_KEY);
  } catch { /* nothing to drop */ }
}

/** 10-12 B②: this browser already kept this matter (by the matter's first cast) — the box is not offered again */
export function matterKeptBefore(first: string | undefined): boolean {
  try { return !!first && localStorage.getItem(`yf_ms_${first}`) === "1"; } catch { return false; }
}
