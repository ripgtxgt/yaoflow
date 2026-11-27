import DATA from "@/data/dreams.json";

/**
 * 10-29 进度表 124 解夢: 200 common dreams, each a free page (/zh-hant/dream/<slug>) — the traditional sayings marked as
 * such, a plain reading, a few variants, and the way in to a cast about the matter behind the dream. The text was written
 * by the ops model under fixed rules (scripts/dream/gen-dreams.ts: no 吉凶 verdict, no prophecy of death or illness),
 * checked there, and kept here as data; 简体 alongside.
 */
export interface DreamText { name: string; title: string; lead: string; trad: string; plain: string; variants: { q: string; a: string }[]; ask: string; askQ: string; faq: { q: string; a: string }[] }
export interface Dream extends DreamText { slug: string; cat: string; hans: DreamText }
const store = DATA as unknown as { topics: { slug: string; name: string; cat: string }[]; dreams: Record<string, Dream> };

export const DREAM_CATS = ["動物", "人物", "身體", "行為", "自然", "物品", "場所", "情境"] as const;
/** the dreams that have a page, in the topic list's order (the most searched first) */
export const DREAMS: Dream[] = store.topics.map((t) => store.dreams[t.slug]).filter((d): d is Dream => !!d);
export const dreamBySlug = (slug: string) => store.dreams[slug] ?? null;
export const dreamText = (d: Dream, locale: string): DreamText => (locale === "zh" ? d.hans : d);
/** a few other dreams of the same kind, for the page's foot */
export const dreamsLike = (d: Dream, n = 8) => DREAMS.filter((x) => x.cat === d.cat && x.slug !== d.slug).slice(0, n);
