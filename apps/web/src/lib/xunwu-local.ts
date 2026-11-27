/**
 * 10-29 进度表 127 尋物 — what this browser keeps of its own casts (localStorage only): the token, the three choices, the
 * band and the hexagram, and the reader's own name for the thing, which is never sent anywhere. It feeds the page's
 * 「同一件事接受第一次的結果」 and the revisit card 「上次找的…，找到了沒？」 shown 1–7 days later on any page.
 * Client-safe: no server imports.
 */
export const XW_KEY = "yf_xw";
const DAY = 86_400_000;

export interface XwRec { tk: string; cat: string; place: string; ago: string; at: number; tier: string; hex: number; name?: string; done?: "found" | "not" | "skip" }

export function readXw(): XwRec[] {
  try {
    const v = JSON.parse(localStorage.getItem(XW_KEY) ?? "[]") as unknown;
    return Array.isArray(v) ? (v as XwRec[]).filter((r) => r && typeof r.tk === "string" && typeof r.at === "number") : [];
  } catch { return []; }
}
export function writeXw(list: XwRec[]): void {
  try { localStorage.setItem(XW_KEY, JSON.stringify(list.slice(-20))); } catch { /* private mode */ }
}
/** keep a cast (or refresh the one already kept under that token) */
export function keepXw(rec: XwRec): void {
  const list = readXw().filter((r) => r.tk !== rec.tk);
  const old = readXw().find((r) => r.tk === rec.tk);
  writeXw([...list, { ...old, ...rec, ...(old?.done ? { done: old.done } : {}), name: rec.name || old?.name }]);
}
export function markXw(tk: string, done: XwRec["done"]): void {
  writeXw(readXw().map((r) => (r.tk === tk ? { ...r, done } : r)));
}
/** the first cast on the same thing (category + last place) within a day, if this browser has one */
export function firstXw(cat: string, place: string, now = Date.now()): XwRec | null {
  return readXw().filter((r) => r.cat === cat && r.place === place && now - r.at < DAY).sort((a, b) => a.at - b.at)[0] ?? null;
}

const dayIdx = (t: number) => Math.floor((t - new Date(t).getTimezoneOffset() * 60_000) / DAY);
/** the revisit: the newest unanswered cast from an earlier local day, at most 7 days old */
export function dueXw(now = Date.now(), list = readXw()): XwRec | null {
  return list.filter((r) => !r.done && dayIdx(now) - dayIdx(r.at) >= 1 && now - r.at <= 7 * DAY).sort((a, b) => b.at - a.at)[0] ?? null;
}
