"use client";

import type { BirthInput, Gender } from "./normalize";

/**
 * 10-18 进度表 71–74 生辰档案: the working copy on this device (localStorage), at most 10. The chart pages read the
 * current one; nothing about the birth goes into a URL or an event.
 * 10-22 进度表 76 ⑤: signed in, the same list is kept with the account (/api/profiles, lib/birth-profiles.ts) — a save
 * or a delete here also goes there, and `syncProfiles` pulls the account's list onto a new device, so the three chart
 * pages need nothing typed again. Signed out, nothing leaves the browser.
 */
export type Who = "self" | "partner" | "family" | "friend" | "other";
export interface Profile { id: string; who: Who; name: string; gender?: Gender; input: BirthInput; at: number }

const KEY = "yf_birth_profiles", CUR = "yf_birth_current";
/** what the last /api/profiles answer said: null = not asked yet this page */
let signedIn: boolean | null = null;

export function loadProfiles(): Profile[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(v) ? (v as Profile[]) : []; } catch { return []; }
}
function store(list: Profile[]) { try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 10))); } catch { /* */ } }
const push = (list: Profile[]) => { if (!signedIn || !list.length) return; void fetch("/api/profiles", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profiles: list }) }).catch(() => null); };
/** 10-20 合盤: `current: false` keeps the chart pages on the profile they had (TA's birth is saved, not switched to) */
export function saveProfile(p: Omit<Profile, "id" | "at"> & { id?: string }, opt: { current?: boolean } = {}): Profile {
  const list = loadProfiles();
  const id = p.id ?? Math.random().toString(36).slice(2, 10);
  const full: Profile = { ...p, id, at: Date.now() } as Profile;
  store([full, ...list.filter((x) => x.id !== id)]);
  if (opt.current !== false) setCurrent(id);
  push([full]);
  return full;
}
export function deleteProfile(id: string) {
  store(loadProfiles().filter((x) => x.id !== id));
  try { if (localStorage.getItem(CUR) === id) localStorage.removeItem(CUR); } catch { /* */ }
  if (signedIn) void fetch(`/api/profiles?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
}
export function setCurrent(id: string) { try { localStorage.setItem(CUR, id); } catch { /* */ } }
export function currentProfile(): Profile | null {
  const list = loadProfiles();
  let id: string | null = null;
  try { id = localStorage.getItem(CUR); } catch { /* */ }
  return list.find((x) => x.id === id) ?? list[0] ?? null;
}
export function updateInput(id: string, patch: Partial<BirthInput>) {
  const list = loadProfiles();
  const next = list.map((x) => (x.id === id ? { ...x, input: { ...x.input, ...patch } } : x));
  store(next);
  const hit = next.find((x) => x.id === id);
  if (hit) push([hit]);
}

/**
 * Signed in: merge the account's profiles into this device (the newer copy of a profile wins; the device's own go up
 * to the account) and return the merged list; signed out or offline: null, and the device's list stands as it was.
 */
export async function syncProfiles(): Promise<Profile[] | null> {
  try {
    const r = await fetch("/api/profiles", { cache: "no-store" });
    if (!r.ok) return null;
    const j = (await r.json()) as { signedIn: boolean; profiles: Profile[] };
    signedIn = !!j.signedIn;
    if (!j.signedIn) return null;
    const local = loadProfiles();
    const byId = new Map<string, Profile>();
    for (const p of [...local, ...(Array.isArray(j.profiles) ? j.profiles : [])]) {
      const have = byId.get(p.id);
      if (!have || (p.at ?? 0) > (have.at ?? 0)) byId.set(p.id, p);
    }
    const merged = [...byId.values()].sort((a, b) => (b.at ?? 0) - (a.at ?? 0)).slice(0, 10);
    store(merged);
    // what this device had and the account did not (or had older) goes up
    const remoteAt = new Map((j.profiles ?? []).map((p) => [p.id, p.at ?? 0]));
    const up = merged.filter((p) => (remoteAt.get(p.id) ?? -1) < (p.at ?? 0));
    push(up);
    return merged;
  } catch { return null; }
}
