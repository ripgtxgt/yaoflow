import { GA_CONSENT_REGIONS } from "./ga";

/** 11-27 T-007: 广告点击编号的 Cookie —— 纯函数，middleware（edge）与服务端共用。说明见 lib/ads-conversions.ts */
export const ADS_CLICK_COOKIE = "yf_gc";
export const ADS_CLICK_DAYS = 90;

export type ClickKind = "gclid" | "gbraid" | "wbraid";
const KINDS: ClickKind[] = ["gclid", "gbraid", "wbraid"];
const CLICK_RE = /^[A-Za-z0-9_-]{10,200}$/;

const consentRegions = new Set(GA_CONSENT_REGIONS);
/** 欧洲经济区 / 英国 / 瑞士：没有同意横幅，不记广告点击 */
export function adsClickAllowed(country: string | null | undefined): boolean {
  return !(country && consentRegions.has(country.toUpperCase()));
}

/** 落地 URL 里的广告点击编号（优先 gclid）→ Cookie 值 "gclid.<id>.<秒>"；没有则 null */
export function clickFromSearch(sp: URLSearchParams, nowMs = Date.now()): string | null {
  for (const k of KINDS) {
    const v = sp.get(k);
    if (v && CLICK_RE.test(v)) return `${k}.${v}.${Math.floor(nowMs / 1000)}`;
  }
  return null;
}

export function parseClickCookie(v: string | null | undefined): { kind: ClickKind; id: string; at: number } | null {
  const m = v ? /^(gclid|gbraid|wbraid)\.([A-Za-z0-9_-]{10,200})\.(\d{9,11})$/.exec(v) : null;
  return m ? { kind: m[1] as ClickKind, id: m[2]!, at: Number(m[3]) * 1000 } : null;
}
