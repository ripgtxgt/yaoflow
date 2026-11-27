import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { NOTO_ZH_SUBSET_B64 } from "./og-font-zh";
import { NOTO_JA_SUBSET_B64 } from "./og-font-ja";
import { NOTO_KO_SUBSET_B64 } from "./og-font-ko";
import type { Locale } from "./locales";

/**
 * Shared pieces for the Open Graph card images (next/og → satori).
 *
 * The hexagram is DRAWN as bars rather than set as a Unicode glyph: satori
 * would need a symbols font for U+4DC0…, and the drawn lines let a moving
 * line carry cinnabar — the card shows the actual cast, not a generic mark.
 * Text stays Latin (name + pinyin) so a small EB Garamond face suffices;
 * shipping a CJK subset for 64 titles isn't worth megabytes on every card.
 */

export const OG_SIZE = { width: 1200, height: 630 };

export const INK = "#14151c";
export const PAPER = "#f4f2ec";
export const CINNABAR = "#b0403c";
export const GOLD_TEXT = "#8a6c2c";

let fontsCache: { name: string; data: Buffer; weight: 400 | 600 }[] | null = null;

/**
 * Locate the font files by walking up from cwd to the workspace root.
 * Module resolution is useless here: inside the compiled route bundle,
 * import.meta.url no longer points anywhere node can resolve from, and a
 * static specifier would make webpack try to parse the .woff as a module.
 */
function fontPath(file: string): string {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const p = join(dir, "node_modules", "@fontsource", "eb-garamond", "files", file);
    if (existsSync(p)) return p;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`og font not found from ${process.cwd()}: ${file}`);
}

export function ogFonts() {
  fontsCache ??= ([400, 600] as const).map((weight) => ({
    name: "EB Garamond",
    data: readFileSync(fontPath(`eb-garamond-latin-${weight}-normal.woff`)),
    weight,
  }));
  return fontsCache;
}

let zhFontsCache: { name: string; data: Buffer; weight: 400 | 600 }[] | null = null;

/**
 * Latin faces + a Noto Serif SC subset (~39KB, base64-embedded in
 * og-font-zh.ts) — enough for every hexagram full name in both Chinese
 * scripts and the zh card copy. satori picks per glyph, so mixed runs fall
 * back to Garamond cleanly.
 */
export function ogFontsZh() {
  zhFontsCache ??= [
    ...ogFonts(),
    {
      name: "Noto Serif SC",
      data: Buffer.from(NOTO_ZH_SUBSET_B64, "base64"),
      weight: 600 as const,
    },
  ];
  return zhFontsCache;
}

/**
 * Which non-Latin face a locale's card needs. Each is a tiny subset built
 * from exactly the glyphs the card can set (hexagram names + og-copy.ts),
 * so a new line of card copy means regenerating the subset.
 */
export type OgScript = "latin" | "sc" | "jp" | "kr";
export function ogScriptFor(locale: Locale): OgScript {
  if (locale === "zh" || locale === "zh-hant") return "sc";
  if (locale === "ja") return "jp";
  if (locale === "ko") return "kr";
  return "latin";
}

/** Family name the JSX uses for any CJK run; the data behind it varies by script. */
export const CJK_FAMILY = "Noto Serif CJK";

const cjkCache: Partial<Record<OgScript, { name: string; data: Buffer; weight: 400 | 600 }[]>> = {};

export function ogFontsFor(locale: Locale) {
  const s = ogScriptFor(locale);
  if (s === "latin") return ogFonts();
  cjkCache[s] ??= [
    ...ogFonts(),
    {
      name: CJK_FAMILY,
      data: Buffer.from(
        s === "sc" ? NOTO_ZH_SUBSET_B64 : s === "jp" ? NOTO_JA_SUBSET_B64 : NOTO_KO_SUBSET_B64,
        "base64",
      ),
      weight: 600 as const,
    },
  ];
  return cjkCache[s]!;
}

/**
 * One drawn yao line. values follow the engine: 6/9 moving, 7/9 yang.
 *
 * The yin notch is an EXPLICIT spacer element, never a justify-content gap:
 * satori quietly ignored space-between and packed the two halves together,
 * so every broken line rendered as one short solid bar — a different figure
 * to anyone who can read one. Geometry must not depend on layout semantics.
 */
export function YaoBar({ value, width = 340 }: { value: number; width?: number }) {
  const yang = value === 7 || value === 9;
  const moving = value === 6 || value === 9;
  const color = moving ? CINNABAR : INK;
  const h = 26;
  const gap = Math.round(width / 6);
  const seg = Math.floor((width - gap) / 2);
  return (
    <div style={{ display: "flex", width }}>
      {yang ? (
        <div style={{ width, height: h, background: color, borderRadius: 3 }} />
      ) : (
        <>
          <div style={{ width: seg, height: h, background: color, borderRadius: 3 }} />
          <div style={{ width: width - seg * 2, height: h, display: "flex" }} />
          <div style={{ width: seg, height: h, background: color, borderRadius: 3 }} />
        </>
      )}
    </div>
  );
}

/** The full figure, bottom line first, drawn top-down as displayed. */
export function YaoFigure({ values, width = 340 }: { values: readonly number[]; width?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {[...values].reverse().map((v, i) => (
        <YaoBar key={i} value={v} width={width} />
      ))}
    </div>
  );
}
