import { toHans } from "../hant";
import type { Locale } from "../locales";
import { foreignTree, isForeign, mapTexts, type Generated } from "./core";

/**
 * 10-29 进度表 128 — a product's 繁體 tree in the reader's language (server side: 简体 needs OpenCC, which never ships
 * to the browser). Client components are handed the resolved tree as props.
 */

/** 繁 → 简 for page copy. `toHans` leaves anything containing kana alone (Japanese in the reader's own question), and
 *  「・」 is kana — so the middle dot in a title would have kept the whole line in 繁體; it is held aside here. */
export function hansCopy(s: string): string {
  if (!s.includes("・")) return toHans(s);
  return s.split("・").map((p) => toHans(p)).join("・");
}

const memo = new WeakMap<object, Map<string, unknown>>();

/**
 * `hant` in `locale`: 繁體 as written; 简体 converted (`hans` — a product can pass its own, e.g. one that keeps 乾 the
 * trigram); every other language from the generated file. Memoised per tree and language.
 */
export function localize<T>(hant: T, gen: Generated, locale: Locale | string, hans: (s: string) => string = hansCopy): T {
  if (locale === "zh-hant") return hant;
  const key = locale === "zh" ? `zh:${hans === hansCopy ? "" : "own"}` : locale;
  const box = typeof hant === "object" && hant !== null ? hant as unknown as object : null;
  if (box) {
    const hit = memo.get(box)?.get(key);
    if (hit !== undefined) return hit as T;
  }
  const out = locale === "zh" ? mapTexts(hant, (s) => hans(s)) : isForeign(locale) ? foreignTree(hant, gen, locale) : hant;
  if (box) {
    if (!memo.has(box)) memo.set(box, new Map());
    memo.get(box)!.set(key, out);
  }
  return out;
}
