import type { BirthInput, Gender } from "@/lib/mingli/birth/normalize";

/**
 * 10-21 合盤邀請連結 (Neil: 合盤的邀請連結和兩人分享卡，做好) — one person (the inviter) sends a link, the other (TA) fills
 * in their own birth on their own device.
 *
 * The link carries the inviter's birth in the URL FRAGMENT (`/hepan/i#…`): a fragment never reaches a server, a log, a
 * referrer or a link preview, so the inviter's birth goes only to whoever the link is sent to — the same thing the
 * inviter does by typing it into TA's phone. Nothing is created on our side when a link is made. `id` is a random key
 * the inviter's browser makes: when TA has filled in, TA's browser sends both births to the server once, the server
 * computes the pair's facts and keeps ONLY those under the id (lib/mingli/hepan/invite.ts, 30 days), and the inviter's
 * browser, which remembers the id, shows them. Pure and client-safe.
 */
export interface InvitePayload { v: 1; id: string; t: number; g: Gender; n?: string; i: BirthInput }
export const INVITE_ID_RE = /^[0-9a-f]{24}$/;
export const INVITE_TTL_MS = 30 * 86_400_000;
export const INVITES_KEY = "yf_hepan_invites";
/** what the inviter's browser keeps about each link it made (never the result; that comes from the server by id) */
export interface InviteMemo { id: string; at: number; aId: string; seen?: boolean }

export function newInviteId(): string {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

const b64url = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => {
  const t = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(t + "=".repeat((4 - (t.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

/** the inviter's birth, compact (only the fields the chart needs; the place keeps no name) */
function slimInput(i: BirthInput): BirthInput {
  const out: BirthInput = { calendar: i.calendar === "lunar" ? "lunar" : "solar", y: i.y, m: i.m, d: i.d, timeMode: i.timeMode };
  if (i.leap) out.leap = true;
  if (i.timeMode === "exact") { out.h = i.h; out.mi = i.mi; }
  if (i.timeMode === "branch") out.branch = i.branch;
  if (i.placeId) out.placeId = i.placeId;
  if (i.place && typeof i.place.tz === "string") out.place = { id: i.place.id, name: "", lat: i.place.lat, lon: i.place.lon, tz: i.place.tz };
  if (i.trueSolar === false) out.trueSolar = false;
  if (i.zi === "same") out.zi = "same";
  if (i.dstAlreadyRemoved) out.dstAlreadyRemoved = true;
  if (i.houses === "whole") out.houses = "whole";
  return out;
}

export function encodeInvite(p: { id: string; gender: Gender; input: BirthInput; name?: string; now?: number }): string {
  const payload: InvitePayload = { v: 1, id: p.id, t: p.now ?? Date.now(), g: p.gender, i: slimInput(p.input) };
  const n = (p.name ?? "").trim().slice(0, 12);
  if (n) payload.n = n;
  return b64url(JSON.stringify(payload));
}
export const invitePath = (locale: string, encoded: string) => `/${locale}/hepan/i#${encoded}`;

/** the fragment back into a payload — null for anything malformed, too old, or not a birth */
export function decodeInvite(fragment: string, now = Date.now()): InvitePayload | null {
  try {
    const raw = fragment.replace(/^#/, "");
    if (!raw || raw.length > 2000) return null;
    const p = JSON.parse(unb64url(raw)) as Partial<InvitePayload>;
    if (p.v !== 1 || typeof p.id !== "string" || !INVITE_ID_RE.test(p.id)) return null;
    if (typeof p.t !== "number" || now - p.t > INVITE_TTL_MS || p.t - now > 86_400_000) return null;
    if (p.g !== "male" && p.g !== "female") return null;
    const i = p.i;
    if (!i || typeof i !== "object") return null;
    if (![i.y, i.m, i.d].every((x) => typeof x === "number" && Number.isInteger(x))) return null;
    if (i.y < 1900 || i.y > 2100 || i.m < 1 || i.m > 12 || i.d < 1 || i.d > 31) return null;
    if (i.timeMode !== "exact" && i.timeMode !== "branch" && i.timeMode !== "unknown") return null;
    const n = typeof p.n === "string" ? p.n.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 12) : undefined;
    return { v: 1, id: p.id, t: p.t, g: p.g, i: slimInput(i as BirthInput), ...(n ? { n } : {}) };
  } catch { return null; }
}

/* ------------------------------------------------------------------ the inviter's memos (localStorage) */

export function loadInvites(): InviteMemo[] {
  try { const v = JSON.parse(localStorage.getItem(INVITES_KEY) ?? "[]"); return Array.isArray(v) ? (v as InviteMemo[]).filter((x) => x && INVITE_ID_RE.test(String(x.id))) : []; } catch { return []; }
}
export function saveInvites(list: InviteMemo[]) { try { localStorage.setItem(INVITES_KEY, JSON.stringify(list.slice(0, 10))); } catch { /* */ } }
export function rememberInvite(m: InviteMemo) { saveInvites([m, ...loadInvites().filter((x) => x.id !== m.id)]); }
export function forgetInvite(id: string) { saveInvites(loadInvites().filter((x) => x.id !== id)); }
