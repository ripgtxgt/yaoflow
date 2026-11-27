/**
 * Modern English renderings of the Zhouyi judgment and line texts.
 * Original editorial content authored for YaoFlow (informed by the
 * public-domain Legge 1882 translation; no Wilhelm/Baynes text used).
 * Register: plain modern English, terse, decision-oriented, faithful.
 */
export interface HexTextEn {
  judgment: string;
  /** Lines 1–6, bottom-up. */
  lines: readonly [string, string, string, string, string, string];
  /** 用九 (hex 1) / 用六 (hex 2) only. */
  extra?: string;
}
