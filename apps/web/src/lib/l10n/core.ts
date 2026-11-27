import type { Locale } from "../locales";

/**
 * 10-29 进度表 128 — every product in all nine languages. A product's words are written once, in 繁體, as a tree
 * (strings, and arrays and plain objects of them); 简体 is converted from it (lib/l10n/server.ts), and the seven
 * foreign languages come from a generated file (data/l10n/<product>.json: `{ en: <same tree>, ja: …, _src: {path:
 * source} }`, written offline by scripts/l10n/translate.ts — never a model call at runtime). This file has no
 * server-only imports, so a client component can resolve a tree it was handed.
 */

/** The seven languages that read from generated translations. */
export const FOREIGN: readonly Locale[] = ["en", "ja", "ko", "fr", "de", "es", "pt"];
export type Foreign = "en" | "ja" | "ko" | "fr" | "de" | "es" | "pt";
export const isForeign = (l: string): l is Foreign => (FOREIGN as readonly string[]).includes(l);

/** A generated file: one tree per foreign language, and per language the 繁體 each leaf was translated from. */
export type Generated = Partial<Record<Foreign, unknown>> & { _src?: Partial<Record<Foreign, Record<string, string>>> };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** Every string leaf replaced; numbers, booleans and null pass through. Paths are "a.b.0.c". */
export function mapTexts<T>(t: T, f: (s: string, path: string) => string, path = ""): T {
  if (typeof t === "string") return f(t, path) as unknown as T;
  if (Array.isArray(t)) return t.map((v, i) => mapTexts(v, f, path ? `${path}.${i}` : String(i))) as unknown as T;
  if (isObj(t)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(t)) out[k] = mapTexts(v, f, path ? `${path}.${k}` : k);
    return out as T;
  }
  return t;
}

/** The string leaves of a tree, in order. */
export function leaves(t: unknown, path = ""): { path: string; text: string }[] {
  if (typeof t === "string") return [{ path, text: t }];
  if (Array.isArray(t)) return t.flatMap((v, i) => leaves(v, path ? `${path}.${i}` : String(i)));
  if (isObj(t)) return Object.entries(t).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
  return [];
}

export function getPath(t: unknown, path: string): unknown {
  let cur: unknown = t;
  for (const k of path.split(".")) {
    if (cur == null) return undefined;
    if (Array.isArray(cur)) cur = cur[Number(k)];
    else if (isObj(cur)) cur = cur[k];
    else return undefined;
  }
  return cur;
}

export function setPath(t: Record<string, unknown>, path: string, v: unknown, shapeFrom?: unknown): void {
  const ks = path.split(".");
  let cur: Record<string, unknown> | unknown[] = t;
  let shape: unknown = shapeFrom;
  for (let i = 0; i < ks.length - 1; i++) {
    const k = ks[i]!;
    shape = shape == null ? undefined : getPath(shape, k);
    const nextIsIndex = Array.isArray(shape) || /^\d+$/.test(ks[i + 1]!);
    const holder = cur as Record<string, unknown>;
    if (holder[k] == null) holder[k] = nextIsIndex ? [] : {};
    cur = holder[k] as Record<string, unknown> | unknown[];
  }
  (cur as Record<string, unknown>)[ks[ks.length - 1]!] = v;
}

/**
 * The tree in a foreign language: each leaf from that language's translation, else the English one, else the 繁體
 * (the tests keep that last case from ever reaching a page).
 */
export function foreignTree<T>(hant: T, gen: Generated, locale: Foreign): T {
  const own = gen[locale], en = gen.en;
  return mapTexts(hant, (s, p) => {
    const v = getPath(own, p);
    if (typeof v === "string" && v) return v;
    const e = getPath(en, p);
    return typeof e === "string" && e ? e : s;
  });
}

/** A short stable key for a sentence (FNV-1a, 32 bit) — for trees keyed by their own 繁體 text (cross-card lines). */
export function textKey(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return `k${h.toString(36)}`;
}

/** 「第 {n} 張」 → 「第 3 張」; every occurrence of a name is filled. */
export function fmt(s: string, vars: Record<string, string | number>): string {
  let out = s;
  for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  return out;
}

/**
 * 10-30 (seen on the live English chart: 「3 years 1 months 4 days」): a filled template of years, months and days
 * written for many — the languages that inflect take the singular for 1 (French also for 0).
 */
const COUNT_ONE: Partial<Record<string, [RegExp, string][]>> = {
  en: [[/(^|[^\d])1 (year|month|day)s\b/g, "$11 $2"]],
  de: [[/(^|[^\d])1 Jahre\b/g, "$11 Jahr"], [/(^|[^\d])1 Monate\b/g, "$11 Monat"], [/(^|[^\d])1 Tage\b/g, "$11 Tag"]],
  es: [[/(^|[^\d])1 años\b/g, "$11 año"], [/(^|[^\d])1 meses\b/g, "$11 mes"], [/(^|[^\d])1 días\b/g, "$11 día"]],
  pt: [[/(^|[^\d])1 anos\b/g, "$11 ano"], [/(^|[^\d])1 meses\b/g, "$11 mês"], [/(^|[^\d])1 dias\b/g, "$11 dia"]],
  fr: [[/(^|[^\d])([01]) an\(s\)/g, "$1$2 an"], [/(\d+) an\(s\)/g, "$1 ans"], [/(^|[^\d])([01]) jour\(s\)/g, "$1$2 jour"], [/(\d+) jour\(s\)/g, "$1 jours"]],
};
export function countWords(s: string, l: string): string {
  let out = s;
  for (const [re, to] of COUNT_ONE[l] ?? []) out = out.replace(re, to);
  return out;
}
