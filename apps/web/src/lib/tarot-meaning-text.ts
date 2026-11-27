// server-side only (lib/hant through lib/l10n/server)
import MEANINGS from "../data/tarot-meanings.json";
import GEN_M from "../data/l10n/tarot-meanings.json";
import type { Generated } from "./l10n/core";
import { localize } from "./l10n/server";

/**
 * 10-29 进度表 128 — the 78 meanings in the reader's language. The 繁體 is 推广's reviewed 牌義定稿 (data/tarot-meanings.json);
 * 简体 converted; the seven other languages generated offline (scripts/l10n/translate.ts tarot-meanings →
 * data/l10n/tarot-meanings.json). Its own module: the library is large, and only the pages and the reading need it.
 */
export interface Side { overall: string; love: string; work: string; ask_next: string }
export interface Meaning { keywords: { upright: string[]; reversed: string[] }; upright: Side; reversed: Side }
export const MEANINGS_HANT = MEANINGS as Record<string, Meaning>;
export function meaningsIn(locale: string): Record<string, Meaning> {
  return localize(MEANINGS_HANT, GEN_M as unknown as Generated, locale);
}
export const meaningIn = (id: string, locale: string): Meaning | null => meaningsIn(locale)[id] ?? null;
