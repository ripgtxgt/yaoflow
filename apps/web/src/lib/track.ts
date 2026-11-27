"use client";

import type { EventName } from "./analytics-server";
import { referrerTag } from "./campaign";
import { abTag } from "./ab";
import { gaSend } from "./ga";

/**
 * Client tracking. No cookies, no fingerprinting. 10-27: the event NAME (and its short codes) is also passed to Google
 * Analytics (lib/ga.ts) — never a path, a question or anything typed.
 * The session id lives in sessionStorage: it dies when the tab closes and is
 * never linked to a person. Failures are silent — analytics must never break UX.
 */

const KEY = "yaoflow:sid";
const VIA_KEY = "yaoflow:via";
const CAMPAIGN_KEY = "yaoflow:c";

function sessionId(): string {
  try {
    let id = sessionStorage.getItem(KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
      sessionStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "nosession";
  }
}

/**
 * First-touch referral tag. A share page's CTA links home with ?via=<code>;
 * we pin that code to the session so every later event — cast, purchase —
 * attributes back to the shared cast that brought this person in. First
 * touch wins; the tag is the six line values, never anything personal.
 */
export function viaTag(): string | undefined {
  try {
    const fromUrl = new URLSearchParams(location.search).get("via");
    const stored = sessionStorage.getItem(VIA_KEY);
    if (!stored && fromUrl && /^[6789]{6}$/.test(fromUrl)) {
      sessionStorage.setItem(VIA_KEY, fromUrl);
      return fromUrl;
    }
    return stored ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * 09-29 分享者回礼: the sharer's ref (?r=, eight letters from share_refs), pinned
 * to the session like the via code — first touch wins. Sent only with the free
 * first reading's request, so the sharer can be thanked; never in analytics.
 */
export function refTag(): string | undefined {
  try {
    const fromUrl = new URLSearchParams(location.search).get("r");
    const stored = sessionStorage.getItem("yf_ref");
    if (!stored && fromUrl && /^[a-z2-9]{8}$/.test(fromUrl)) {
      sessionStorage.setItem("yf_ref", fromUrl);
      return fromUrl;
    }
    return stored ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * First-touch campaign tag. A promotion link carries ?c=<channel> (xhs, wx,
 * reddit, hn, x-ja …); pinned to the session like the referral tag, so the
 * dashboard can say which channel's visitors actually cast and claim. Just a
 * channel name, never anything personal. First touch wins.
 */
export function campaignTag(): string | undefined {
  try {
    const fromUrl = new URLSearchParams(location.search).get("c")?.toLowerCase() ?? null;
    const stored = sessionStorage.getItem(CAMPAIGN_KEY);
    if (stored) return stored;
    if (fromUrl && /^[a-z0-9_-]{1,16}$/.test(fromUrl)) {
      sessionStorage.setItem(CAMPAIGN_KEY, fromUrl);
      return fromUrl;
    }
    // 09-24 来源兜底: no ?c= — fall back to the referring site's domain, marked
    // "~" so the channel table keeps it apart from tagged links (lib/campaign.ts)
    const inferred = referrerTag(document.referrer, location.hostname);
    if (inferred) {
      sessionStorage.setItem(CAMPAIGN_KEY, inferred);
      return inferred;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * 09-23: what a checkout carries so the ORDER knows where the buyer came from.
 * Every paid order used to land under 「—」: the channel table joined the
 * browser's session id (events) to the Stripe session id (orders), two ids
 * that never match, so `c=threads` showed 18 claims and 0 paid.
 */
export function attribution(): { c?: string; bs: string } {
  const c = campaignTag();
  return { ...(c ? { c } : {}), bs: sessionId() };
}

/**
 * 09-23 回访 (Neil: 「怎么把这个产品做得用户粘性越来越高」): we could only
 * tell a returning reader when they had left an email — the session id dies
 * with the tab. This keeps three things in the browser and nothing else: the
 * local date of the first visit, of the last visit, and how many distinct
 * days there have been. No id: two readers who first came on the same day are
 * indistinguishable, which is the point. Once a day the first page view sends
 * the dates (`visit_day`: first, previous, today), and the panel counts cohorts from them:
 *   new on D       = visit_day with fd = D and no pd
 *   back next day  = visit_day on D+1 with fd = D
 *   back within k  = the first return (pd = fd = D) on D+1 … D+k
 */
const VISIT_KEY = "yaoflow:vd";
export interface VisitDays { first: string; last: string; count: number }

function localDayStr(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** What this browser remembers about its visits, or null (first ever visit, or storage unavailable). */
export function visitDays(): VisitDays | null {
  try {
    const raw = localStorage.getItem(VISIT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { f?: string; l?: string; n?: number };
    if (!v.f || !v.l) return null;
    return { first: v.f, last: v.l, count: Math.max(1, Number(v.n) || 1) };
  } catch {
    return null;
  }
}

/** How many distinct days this browser has visited, counting today (whether or not today is recorded yet). */
export function visitDayCount(): number {
  const v = visitDays();
  if (!v) return 1;
  return v.last === localDayStr() ? v.count : v.count + 1;
}

/** Once per local day: update the record and tell the server which cohort this visit belongs to. */
export function markVisitDay(locale: string): VisitDays | null {
  try {
    const today = localDayStr();
    const prev = visitDays();
    if (prev && prev.last === today) return prev;
    const next: VisitDays = prev ? { first: prev.first, last: today, count: prev.count + 1 } : { first: today, last: today, count: 1 };
    localStorage.setItem(VISIT_KEY, JSON.stringify({ f: next.first, l: next.last, n: next.count }));
    track("visit_day", { locale, fd: next.first, td: today, ...(prev ? { pd: prev.last } : {}) });
    return next;
  } catch {
    return null;
  }
}

/**
 * 10-02 实时在线: the heartbeat behind the live board (/admin/live). "This tab is still open, on this page" —
 * every 30 s while the tab is visible, and once when it goes hidden. Goes to /api/pulse, which keeps it in memory
 * only; nothing new about the reader is sent (the same session tag, path, language and new/returning flag every
 * event already carries).
 */
export function pulse(locale: string, hidden = false): void {
  try {
    let vt: "n" | "r" = "n", vn = 1;
    try {
      const v = visitDays(), today = localDayStr();
      if (v) { vt = v.first === today ? "n" : "r"; vn = v.last === today ? v.count : v.count + 1; }
    } catch { /* counts as new */ }
    void fetch("/api/pulse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ s: sessionId(), path: location.pathname, locale, vt, vn, ...(hidden ? { hidden: 1 } : {}) }),
      keepalive: true,
    }).catch(() => {});
  } catch { /* ignore */ }
}

export function track(
  event: EventName,
  extra: { locale?: string; tier?: string; hex?: number; method?: string; cur?: string; ms?: number; depth?: number; path?: string; fd?: string; pd?: string; td?: string; mem?: 0 | 1; same?: 0 | 1; msg?: string; sf?: string } = {},
): void {
  try {
    // 09-30 (Neil: 新客的转化率和回访客的使用频率): every event says whether today is this browser's first
    // day here (vt n) or a return (vt r), and which visiting day it is (vn) — two values, still no id
    let vt: "n" | "r" = "n", vn = 1;
    try {
      const v = visitDays(), today = localDayStr();
      if (v) { vt = v.first === today ? "n" : "r"; vn = v.last === today ? v.count : v.count + 1; }
    } catch { /* storage unavailable: counts as new */ }
    const body = JSON.stringify({
      vt, vn,
      e: event,
      s: sessionId(),
      path: extra.path ?? location.pathname,
      ref: document.referrer ? new URL(document.referrer).hostname : "",
      via: viaTag(),
      c: campaignTag(),
      ab: abTag(), // 09-26 对照测试
      ...extra,
    });
    gaSend(event, extra);
    // keepalive so the beacon survives the Stripe redirect
    void fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}
