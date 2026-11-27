import en from "@/data/scenes.en.json";
import zh from "@/data/scenes.zh.json";
import ja from "@/data/scenes.ja.json";
import hant from "@/data/scenes.zh-hant.json";
import ko from "@/data/scenes.ko.json";
import fr from "@/data/scenes.fr.json";
import de from "@/data/scenes.de.json";
import es from "@/data/scenes.es.json";
import pt from "@/data/scenes.pt.json";
import type { Locale } from "./locales";

/**
 * 场景页 (总方案 §6 复利 / §14 ⑭): one page per kind of matter people bring
 * to a cast — how that matter is read, its common tendencies, a worked
 * example with an engine-computed chart, three questions, and a door to a
 * cast with the question pre-filled. Written offline by scripts/gen-scenes.ts
 * from a brief and reviewed; never a model call at runtime.
 */
export interface Scene {
  slug: string; topic: string;
  title: string; h1: string; meta: string;
  intro: string[];
  how: { lead: string; points: string[] };
  patterns: { name: string; text: string }[];
  example: { values: string; question: string; text: string };
  faq: { q: string; a: string }[];
  ask: string;
  hexagrams: number[];
}

const DATA: Partial<Record<Locale, Record<string, Scene>>> = {
  zh: zh as unknown as Record<string, Scene>,
  en: en as unknown as Record<string, Scene>,
  ja: ja as unknown as Record<string, Scene>,
  "zh-hant": hant as unknown as Record<string, Scene>,
  ko: ko as unknown as Record<string, Scene>,
  fr: fr as unknown as Record<string, Scene>,
  de: de as unknown as Record<string, Scene>,
  es: es as unknown as Record<string, Scene>,
  pt: pt as unknown as Record<string, Scene>,
};

/** Locales that have scene pages at all. */
export function sceneLocales(): Locale[] {
  return (Object.keys(DATA) as Locale[]).filter((l) => Object.keys(DATA[l] ?? {}).length > 0);
}

export function scenesFor(locale: Locale): Scene[] {
  return Object.values(DATA[locale] ?? {});
}

export function sceneBySlug(locale: Locale, slug: string): Scene | null {
  return DATA[locale]?.[slug] ?? null;
}

/** The same scene in other languages, for hreflang. */
export function sceneAlternates(slug: string): Locale[] {
  return sceneLocales().filter((l) => !!DATA[l]?.[slug]);
}

export const scenePath = (locale: Locale, slug: string) => `/${locale}/for/${slug}`;
