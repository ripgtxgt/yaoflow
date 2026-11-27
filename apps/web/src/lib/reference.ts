import type { Locale } from "./locales";
import zh from "@/data/reference.zh.json";
import hant from "@/data/reference.zh-hant.json";
import en from "@/data/reference.en.json";
import ja from "@/data/reference.ja.json";
import ko from "@/data/reference.ko.json";
import fr from "@/data/reference.fr.json";
import de from "@/data/reference.de.json";
import es from "@/data/reference.es.json";
import pt from "@/data/reference.pt.json";

/**
 * 外链资源页三件 (进度表 12, 推广 09-26: 「让 Quora / Medium / 目录条目有『值得引用』的落点」):
 *   /gua/table   六十四卦速查表
 *   /glossary    六爻術語對照
 *   /timing      應期怎麼推
 * Written in Traditional Chinese, the other eight languages rewritten offline by
 * scripts/gen-reference.ts and frozen here; never a model call at runtime.
 */
export interface Reference {
  glossary: { title: string; lead: string; groups: { name: string; terms: { zh: string; def: string }[] }[] };
  /** metaTitle / metaDesc: the <head> when it should differ from the page's own heading and lead (10-02 进度表 27, 繁體) */
  timing: { title: string; lead: string; metaTitle?: string; metaDesc?: string; sections: { h: string; p: string[]; list?: string[]; after?: string[] }[]; note: string; example: { code: string; primary: number; changed: number } };
  table: { title: string; lead: string; colNo: string; colFigure: string; colName: string; colTrigrams: string; colMeaning: string };
}

const DATA: Record<Locale, Reference> = {
  zh: zh as Reference, "zh-hant": hant as Reference, en: en as Reference, ja: ja as Reference, ko: ko as Reference,
  fr: fr as Reference, de: de as Reference, es: es as Reference, pt: pt as Reference,
};

export const referenceFor = (l: Locale): Reference => DATA[l];
export const REFERENCE_PATHS = { table: "gua/table", glossary: "glossary", timing: "timing" } as const;
export const REFERENCE_DATE = new Date("2026-09-28");
