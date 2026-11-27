import { BOT_UA_RE } from "./bot-ua";

/**
 * 11-27: a user agent that is a machine's — a self-declared bot, or a desktop browser about a year and a half out of
 * date (browsers update themselves). Used by the visitor counts (lib/machine-visit.ts) and the live board
 * (lib/cloud-ip.ts boardDevice). Only ever applied to a visitor who has done nothing a person does.
 */
const DAY = 86_400_000;
/** a release every four weeks: Chrome 131 on 2024-11-12, Firefox 133 on 2024-11-26 */
const expected = (base: number, at: number, now: number) => base + Math.floor((now - at) / (28 * DAY));
const STALE_BEHIND = 20; // about a year and a half of updates missed
const LAST_ON_OLD_SYSTEMS = new Set([109, 116, 128]);
const LAST_FIREFOX_ESR = new Set([115]);

/** why this user agent is a machine's, or null */
export function machineUa(ua: string | null | undefined, now = Date.now()): "bot-ua" | "stale" | null {
  if (!ua) return null;
  if (BOT_UA_RE.test(ua)) return "bot-ua";
  if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) return null; // old phones and in-app browsers are real readers
  const ch = /(?:Chrome|Edg)\/(\d+)\./.exec(ua);
  if (ch && !/OPR\/|YaBrowser|SamsungBrowser/.test(ua)) {
    const v = Number(ch[1]);
    if (!LAST_ON_OLD_SYSTEMS.has(v) && v < expected(131, Date.UTC(2024, 10, 12), now) - STALE_BEHIND) return "stale";
    return null;
  }
  const ff = /Firefox\/(\d+)\./.exec(ua);
  if (ff) {
    const v = Number(ff[1]);
    if (!LAST_FIREFOX_ESR.has(v) && v < expected(133, Date.UTC(2024, 10, 26), now) - STALE_BEHIND) return "stale";
  }
  return null;
}

