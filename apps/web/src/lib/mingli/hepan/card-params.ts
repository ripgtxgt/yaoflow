import { SIGNS } from "@/lib/mingli/astro/chart";
import { THEME_KEYS, type HepanFacts, type ThemeKey, type Tone } from "./facts";

/**
 * 10-21 兩人分享卡 — what the card URL carries: only chart words that are already on the free overview (生肖 branch, 日柱,
 * 太陽／月亮／金星 signs, the two theme keys and their lean). Never a birth date, time, place, name or gender. Pure and
 * client-safe; the card route parses the same shape back (parseCardParams) and recomputes the little relations itself.
 */
export interface CardSide { yearBranch: string; dayPillar: string; sun: string; moon: string; venus: string }
/** 10-30 进度表 128 ④: the card in every language the 合盤 is open in */
const CARD_LOCALES = ["zh", "zh-hant", "en", "ja", "ko", "fr", "de", "es", "pt"] as const;
export type CardLocale = (typeof CARD_LOCALES)[number];
export interface CardParams { a: CardSide; b: CardSide; themes: { key: ThemeKey; lean: Tone | "混" }[]; locale: CardLocale }

const BRANCHES = "子丑寅卯辰巳午未申酉戌亥";
const STEMS = "甲乙丙丁戊己庚辛壬癸";
const moonWord = (c: HepanFacts["a"]) => c.astro.moon ?? (c.astro.moonSplit ? c.astro.moonSplit.join("或") : "-");

export function cardParams(f: HepanFacts, locale: string): URLSearchParams {
  const side = (c: HepanFacts["a"]) => [c.yearBranch, c.dayPillar, c.astro.sun, moonWord(c), c.astro.venus].join(",");
  return new URLSearchParams({
    a: side(f.a), b: side(f.b),
    t: f.themes.slice(0, 2).map((t) => `${t.key},${t.lean}`).join(";"),
    l: (CARD_LOCALES as readonly string[]).includes(locale) ? locale : "zh-hant",
  });
}
export const cardSrc = (f: HepanFacts, locale: string) => `/api/hepan/card?${cardParams(f, locale)}`;

const isSign = (s: string) => (SIGNS as readonly string[]).includes(s);
const isMoon = (s: string) => s === "-" || isSign(s) || (s.includes("或") && s.split("或").length === 2 && s.split("或").every(isSign));
const isPillar = (s: string) => [...s].length === 2 && STEMS.includes(s[0]!) && BRANCHES.includes(s[1]!);

export function parseCardParams(sp: URLSearchParams): CardParams | null {
  const side = (v: string | null): CardSide | null => {
    const p = (v ?? "").split(",");
    if (p.length !== 5) return null;
    const [yearBranch, dayPillar, sun, moon, venus] = p as [string, string, string, string, string];
    if (!([...yearBranch].length === 1 && BRANCHES.includes(yearBranch)) || !isPillar(dayPillar) || !isSign(sun) || !isMoon(moon) || !isSign(venus)) return null;
    return { yearBranch, dayPillar, sun, moon, venus };
  };
  const a = side(sp.get("a")), b = side(sp.get("b"));
  if (!a || !b) return null;
  const themes: CardParams["themes"] = [];
  for (const part of (sp.get("t") ?? "").split(";").filter(Boolean).slice(0, 2)) {
    const [key, lean] = part.split(",");
    if (!THEME_KEYS.includes(key as ThemeKey) || !["順", "磨", "中", "混"].includes(lean ?? "")) return null;
    themes.push({ key: key as ThemeKey, lean: lean as Tone | "混" });
  }
  const l = sp.get("l") ?? "";
  return { a, b, themes, locale: (CARD_LOCALES as readonly string[]).includes(l) ? (l as CardLocale) : "zh-hant" };
}
