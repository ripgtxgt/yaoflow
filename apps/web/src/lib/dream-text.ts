// server-side only (lib/hant through lib/l10n/server): the words are built on the server
import UI_GEN from "../data/l10n/dream.json";
import EN from "../data/l10n/dreams/en.json";
import JA from "../data/l10n/dreams/ja.json";
import KO from "../data/l10n/dreams/ko.json";
import FR from "../data/l10n/dreams/fr.json";
import DE from "../data/l10n/dreams/de.json";
import ES from "../data/l10n/dreams/es.json";
import PT from "../data/l10n/dreams/pt.json";
import { fmt, isForeign, type Generated } from "./l10n/core";
import { localize } from "./l10n/server";
import { toHans } from "./hant";
import { DREAMS, DREAM_CATS, dreamBySlug, dreamText, type Dream, type DreamText } from "./dream";

/**
 * 10-30 进度表 128 ③ — 解夢 in all nine languages. The 200 dreams were written in 繁體 (with their own 简体, lib/dream.ts);
 * the seven other languages are translated offline (scripts/l10n/translate.ts dreams → data/l10n/dreams/<lang>.json, one
 * file per language; the page words → data/l10n/dream.json). The traditional sayings stay the Chinese folk dream books'
 * (周公解夢) — named as such in every language, not swapped for another tradition.
 */
const UI = {
  index: {
    metaTitle: "解夢｜{n} 個常見的夢是什麼意思：傳統說法與白話",
    metaDesc: "掉牙、蛇、前任、考試、懷孕、被追……常見的夢，傳統解夢書怎麼說、白話又是什麼意思。放不下夢裡那件事，可以為它起一卦。",
    title: "解夢",
    lead: "夢到什麼？找到那個夢，看傳統解夢書怎麼說、白話是什麼意思。夢裡出現的人、放不下的事，可以為那件事起一卦，看接下來哪幾天有動靜。",
    note: "傳統說法整理自民間流傳的解夢書，各版本不同；夢是參考，不代表現實裡一定會發生。",
  },
  page: {
    /** 「{title}｜傳統說法與白話」 */
    metaTitle: "{title}｜傳統說法與白話",
    back: "解夢",
    trad: "傳統說法",
    plain: "白話：這個夢常和什麼有關",
    variants: "常見的幾種情形",
    castBtn: "為這件事起一卦 →",
    lost: "現實裡真的有東西不見了？擲三顆骰子，看先往哪個方向、哪一類地方找（不用登入）→",
    faq: "常見問題",
    like: "也常有人夢到：",
    likeSep: "、",
    note: "傳統說法整理自民間流傳的解夢書，各版本不同；夢是參考，不代表現實裡一定會發生。反覆做惡夢、睡不好，可以和醫師聊聊。",
  },
  cats: Object.fromEntries(DREAM_CATS.map((c) => [c, c])) as Record<(typeof DREAM_CATS)[number], string>,
};
export const DREAM_UI_HANT = UI;
type Widen<T> = T extends string ? string : T extends readonly (infer U)[] ? Widen<U>[] : { [K in keyof T]: Widen<T[K]> };
export type DreamUi = Widen<typeof UI>;
export function dreamUi(locale: string): DreamUi {
  return localize(UI as unknown as DreamUi, UI_GEN as unknown as Generated, locale, toHans);
}

/** the dream library in 繁體 as the translator reads it: per dream its texts, and the 「夢到…」 chip of the index */
export interface DreamDoc extends DreamText { chip: string }
const pick = (d: Dream): DreamDoc => ({ name: d.name, chip: `夢到${d.name}`, title: d.title, lead: d.lead, trad: d.trad, plain: d.plain, variants: d.variants, ask: d.ask, askQ: d.askQ, faq: d.faq });
export const DREAMS_HANT: Record<string, DreamDoc> = Object.fromEntries(DREAMS.map((d) => [d.slug, pick(d)]));
const GEN: Generated = { en: EN, ja: JA, ko: KO, fr: FR, de: DE, es: ES, pt: PT };

/** one dream in the reader's language (简体 keeps its own hand-checked text) */
export function dreamIn(slug: string, locale: string): DreamDoc | null {
  const d = dreamBySlug(slug);
  if (!d) return null;
  if (!isForeign(locale)) { const t = dreamText(d, locale); return { ...t, chip: locale === "zh" ? toHans(`夢到${d.name}`) : `夢到${d.name}` }; }
  return localize(DREAMS_HANT, GEN, locale)[slug] ?? null;
}

/** a dream's name as a link in a list — capitalised in the Latin-script languages */
export const dreamNameIn = (slug: string, locale: string): string => {
  const n = dreamIn(slug, locale)?.name ?? slug;
  return /^(en|fr|de|es|pt)$/.test(locale) ? n.charAt(0).toUpperCase() + n.slice(1) : n;
};

export const dreamIndexTitle = (locale: string) => fmt(dreamUi(locale).index.metaTitle, { n: DREAMS.length });
