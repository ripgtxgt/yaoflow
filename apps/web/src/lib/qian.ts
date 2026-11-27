import data from "@/data/qian-liushi-jiazi.json";
import hdxData from "@/data/qian-huangdaxian.json";
import guandiData from "@/data/qian-guandi.json";
import tianhouData from "@/data/qian-tianhou.json";
import yuelaoData from "@/data/qian-yuelao.json";
import guanyinData from "@/data/qian-guanyin.json";
import baoshengData from "@/data/qian-baosheng.json";
import zhushengData from "@/data/qian-zhusheng.json";
import guanyin28Data from "@/data/qian-guanyin28.json";
import guanyin24Data from "@/data/qian-guanyin24.json";
import qianbaguaData from "@/data/qian-qianbagua.json";
import sensojiData from "@/data/qian-sensoji.json";
import hkData from "@/data/qian-hk.json";
import lechengData from "@/data/qian-lecheng-yuelao.json";
import hunglodeiData from "@/data/qian-hunglodei.json";

/**
 * 10-12 解籤第一期 (进度表 §四 36；《下一个产品选型-2026-10.md》). A reader who drew a lot at a temple types its
 * number; we show the poem, a plain reading of it and what it says for their kind of matter — free — and then the one
 * thing a lot cannot give: which days. 「想知道哪一天？為這件事起一卦」 carries the same question into a cast, with
 * the lot as background; 「這支籤放在我這件事上」 is a short personal reading of the lot at the light-reading price.
 *
 * The text is ours (内容/解籤/六十甲子.json, written from the poems alone, rules in 白話寫作規範.md): no temple's
 * 解曰, no stories, no dates, never 神明說 / 靈驗 / 改運, never "AI 解籤". `lean` is internal and never shown.
 * 繁體 only. This module is data and pure helpers (no db) — safe for client components that import types only.
 */

import templeData from "@/data/qian-temple-poems.json";
import { QIAN_SET, qianSet, TEMPLES } from "./qian-meta";
import { toHkWording } from "./register";
export * from "./qian-meta";

/**
 * 10-12 各廟用字 (Neil: 「把目前有的庙的所有签都要收录」): the same 60 lots, as each listed temple prints them. Our base
 * text follows 東港鎮海宮; 北港朝天宮, 新港奉天宮 and 臺灣省城隍廟 were transcribed lot by lot from the slips on their own
 * sites (data/qian-temple-poems.json, all 60 each) — 北港 and 新港 differ from 鎮海宮 in 23–25 lots, 城隍廟 in 31,
 * mostly one or two characters (行船/行舟, 姻緣/衣祿, 誤春期/誤君期). A reader who says where they drew sees that
 * temple's own lines; the plain reading stays one per lot, and where the words differ the page says so.
 */
const TEMPLE_POEMS = (templeData as { temples: Record<string, Record<string, string[]>> }).temples;
/** 10-13 拍照认籤: every temple wording of the 六十甲子籤 we hold (temple id → lot number → lines) */
export const templePoems = (): Readonly<Record<string, Record<string, string[]>>> => TEMPLE_POEMS;
export const TEMPLE_POEM_SOURCES = (templeData as { sources: Record<string, string> }).sources;
export const BASE_TEMPLE = "donggang";

/** A temple id, or a temple's display name (what a cast carries), → the id whose wording we hold, else null */
function templeKey(t: string | null | undefined): string | null {
  if (!t) return null;
  if (TEMPLE_POEMS[t]) return t;
  const byName = TEMPLES.find((x) => x.name === t)?.id;
  return byName && TEMPLE_POEMS[byName] ? byName : null;
}

/** The four lines as this temple prints them (the base text when we hold no separate wording for it) */
export function qianPoemAt(e: Pick<QianEntry, "num" | "poem" | "set">, temple: string | null | undefined): string[] {
  if (e.set !== QIAN_SET) return e.poem; // the temple wordings we hold are all of the 六十甲子籤
  const k = templeKey(temple);
  return (k && TEMPLE_POEMS[k]?.[String(e.num)]) || e.poem;
}

export interface QianLineDiff { line: number; base: string; theirs: string }
/** Where a temple's lines differ from the base text (line is 1-based) */
export function qianDiffAt(e: Pick<QianEntry, "num" | "poem" | "set">, temple: string | null | undefined): QianLineDiff[] {
  const theirs = qianPoemAt(e, temple);
  return e.poem.flatMap((b, i) => (theirs[i] && theirs[i] !== b ? [{ line: i + 1, base: b, theirs: theirs[i]! }] : []));
}

/** For a lot's page: each wording that differs from the base, with the temples that print it */
export function qianVariants(e: Pick<QianEntry, "num" | "poem" | "set">): { temples: string[]; diffs: QianLineDiff[] }[] {
  const groups = new Map<string, { temples: string[]; diffs: QianLineDiff[] }>();
  for (const id of Object.keys(TEMPLE_POEMS)) {
    const diffs = qianDiffAt(e, id);
    if (!diffs.length) continue;
    const key = qianPoemAt(e, id).join("，");
    const name = TEMPLES.find((t) => t.id === id)?.name ?? id;
    const g = groups.get(key);
    if (g) g.temples.push(name); else groups.set(key, { temples: [name], diffs });
  }
  return [...groups.values()];
}
export const qianTempleName = (id: string) => TEMPLES.find((t) => t.id === id)?.name ?? id;
// 10-28 进度表 117: every lot page's title, description, FAQ and same-poem links changed — lastmod moves with them
export const QIAN_DATE = new Date("2026-10-28");

export interface QianEntry {
  /** 10-12 籤系: which set this lot belongs to */
  set: string;
  num: number;
  /** 六十甲子籤: the 干支 printed on the slip */
  ganzhi?: string;
  /** 黃大仙靈籤: the 籤題 printed on the slip (a story's name — shown as a name, never told) */
  story?: string;
  poem: string[];
  title: string;
  lean: "順" | "平" | "阻";
  plain: string;
  overall: string;
  love: string;
  work: string;
  ask_next: string;
  /** 10-14 进度表 50 今日一籤「今日宜／忌」（内容/解籤/宜忌/，Neil 10-15 定稿）: one line each, shown to members and card holders only */
  yi?: string;
  ji?: string;
}

const SETS: Record<string, QianEntry[]> = {
  "liushi-jiazi": (data as { entries: Omit<QianEntry, "set">[] }).entries.map((e) => ({ ...e, set: "liushi-jiazi" })),
  // `grade` (上上…下下) is kept in the data file but never read: no 吉凶等級 on our pages (进度表 36 ⑥)
  huangdaxian: (hdxData as { entries: (Omit<QianEntry, "set"> & { grade?: string })[] }).entries.map(({ grade: _g, ...e }) => ({ ...e, set: "huangdaxian" })),
  // 10-12 关帝: the slip prints the 天干 pair (甲甲…), which is the tag; `story` (the old tale's name) is only data — never shown
  // 10-12 天后宮: the slip carries a 卦名 (震、恒…), used as the tag
  // 10-12 籤詩網的其餘各套: no printed tag is shown (籤題 / 籤等 stay in the data)
  // 10-28 樂成宮月老 (fate/marriage are the slip's two printed words) and 烘爐地 (grade): data only, never shown
  ...Object.fromEntries(([["baosheng", baoshengData], ["zhusheng", zhushengData], ["guanyin28", guanyin28Data], ["guanyin24", guanyin24Data], ["qianbagua", qianbaguaData], ["sensoji", sensojiData], ["lecheng-yuelao", lechengData], ["hunglodei", hunglodeiData]] as const).map(([id, d]) => [
    id, (d as unknown as { entries: (Omit<QianEntry, "set"> & { grade?: string; story?: string; tag?: string; fate?: string; marriage?: string })[] }).entries.map(({ grade: _g, story: _s, tag: _t, fate: _f, marriage: _m, ...e }) => ({ ...e, set: id })),
  ])),
  // 10-12 觀音: the slip's 宮位 (子宮…) is the tag
  guanyin: (guanyinData as { entries: (Omit<QianEntry, "set"> & { grade?: string })[] }).entries.map(({ grade: _g, ...e }) => ({ ...e, set: "guanyin" })),
  // 10-12 月老: lines of the classics, of any length; no printed tag
  yuelao: (yuelaoData as { entries: (Omit<QianEntry, "set"> & { grade?: string; text?: string })[] }).entries.map(({ grade: _g, text: _t, ...e }) => ({ ...e, set: "yuelao" })),
  tianhou: (tianhouData as { entries: Omit<QianEntry, "set">[] }).entries.map((e) => ({ ...e, set: "tianhou" })),
  guandi: (guandiData as { entries: (Omit<QianEntry, "set"> & { grade?: string })[] }).entries.map(({ grade: _g, ...e }) => ({ ...e, set: "guandi" })),
};

export function qianByNum(n: number, set: string | null = QIAN_SET): QianEntry | null {
  const s = qianSet(set);
  return Number.isInteger(n) && n >= 1 && n <= s.count ? (SETS[s.id]?.[n - 1] ?? null) : null;
}
export const allQian = (set: string | null = QIAN_SET): QianEntry[] => SETS[qianSet(set).id] ?? [];

/**
 * 10-28 进度表 117 ③: the same poem in other sets. 六十甲子, 雷雨師, 天后宮, 保生 and others print one shared body of poems
 * under their own numbers; a reader who searches a line lands on whichever set ranks, and should find the other temples'
 * copy one tap away. Matched on the poem's own characters (punctuation and spaces dropped): the whole poem, or three
 * of its four lines. Pure — built once on first use.
 */
const lineKey = (s: string) => s.replace(/[^\p{Script=Han}]/gu, "");
let samePoemIndex: Map<string, QianEntry[]> | null = null;
export function qianSamePoem(e: Pick<QianEntry, "set" | "num" | "poem">): QianEntry[] {
  if (!samePoemIndex) {
    samePoemIndex = new Map();
    for (const list of Object.values(SETS)) for (const x of list) for (const l of x.poem) {
      const k = lineKey(l);
      if (k.length < 4) continue;
      const a = samePoemIndex.get(k);
      if (a) a.push(x); else samePoemIndex.set(k, [x]);
    }
  }
  const hits = new Map<QianEntry, number>();
  for (const l of e.poem) for (const x of samePoemIndex.get(lineKey(l)) ?? []) if (x.set !== e.set) hits.set(x, (hits.get(x) ?? 0) + 1);
  const need = Math.min(3, e.poem.length);
  return [...hits].filter(([, n]) => n >= need).map(([x]) => x).sort((a, b) => (a.set === b.set ? a.num - b.num : a.set < b.set ? -1 : 1));
}

/** What the slip prints beside the number: the 干支, or the 籤題 */
export const qianTag = (e: Pick<QianEntry, "ganzhi" | "story">) => e.ganzhi ?? e.story ?? "";
/** 「 · 甲子」, or nothing when the slip prints no tag (月老聖籤) */
export const qianTagSuffix = (e: Pick<QianEntry, "ganzhi" | "story">, sep = " · ") => (qianTag(e) ? `${sep}${qianTag(e)}` : "");
export const qianSetName = (e: Pick<QianEntry, "set">) => qianSet(e.set).name;

/**
 * The SEO head of a lot's page (进度表 §四 36 ⑤).
 * 11-05 T-020: back to the pre-10-28 title and description. 10-28 (进度表 121) put the first line and 「姻緣」 into every
 * title and two lines plus other temples' wording into every description, on ~900 pages at once; non-brand impressions
 * fell to almost nothing from 11-01 (淺草寺／觀音 78 was at 8.8). The page body added that day (same poem at other
 * temples, the 姻緣 FAQ) stays; the 60-character cap stays as a guard.
 */
export const QIAN_TITLE_MAX = 60;
export function qianPageTitle(e: QianEntry): string {
  if (e.set === "yuelao") return `${qianSetName(e)}第 ${e.num} 籤「${e.poem[0]}」解籤｜白話、感情怎麼看`;
  // a slip with no printed tag is named by its first line
  return qianTag(e) ? `${qianSetName(e)}第 ${e.num} 籤（${qianTag(e)}）解籤｜白話、感情與工作怎麼看` : `${qianSetName(e)}第 ${e.num} 籤「${e.poem[0]}」解籤｜白話、感情與工作怎麼看`;
}
export function qianPageDescription(e: QianEntry): string {
  // 10-13: no plain-reading text in the snippet — it is part of the paid reading
  return `${qianSetName(e)}第 ${e.num} 籤：${e.title}。籤詩原文與各廟用字；輸入籤號和你想問的事，看白話、感情與工作怎麼讀。`;
}

/**
 * What the reading's model is told when a cast follows a lot (进度表 §四 36 ③): background about the reader's
 * situation, never a reason to bend the chart — the poem gives no dates and decides nothing here.
 */
export const QIAN_LEAN_EN: Record<QianEntry["lean"], string> = { 順: "favourable (things open up)", 平: "mixed (wait, hold steady)", 阻: "obstructed (a warning, slow down)" };
/** 10-12 承接 ⑨ (进度表 §四 36 ⑨⑩): the fixed words when the lot and the chart point different ways — said in the reading's language */
export const QIAN_SPLIT_LINE = "籤看的是大方向和心態，卦看的是這件事此刻的走向和日子";

export function qianPromptNote(e: QianEntry, temple: string | null): string {
  return [
    `BACKGROUND — A TEMPLE LOT: before this cast the reader drew lot no. ${e.num} (${qianTag(e)}) of the ${qianSetName(e)}${temple ? ` at ${temple}` : ""}; its poem: 「${qianPoemAt(e, temple).join("，")}」 — the gist, in our own plain words: ${e.title}; the lot's general tone: ${QIAN_LEAN_EN[e.lean]}.`,
    "Treat it as part of the reader's situation: what they have already been told, and what they are hoping or fearing. It does not change the chart, its lean or its timing — read THIS chart as you would any other.",
    `Near the opening (right after the sentence the reading must begin with, when one is set) put ONE short sentence that ties the two together — the lot gave a direction, this chart now adds where the matter stands and when (e.g. 「第 ${e.num} 籤說的是${e.title}；這一卦接著看這件事現在走到哪、日子落在哪」). Mention the lot nowhere else except where the two disagree.`,
    `If the lot's tone and this chart's lean point different ways (a favourable lot and an obstructed chart, or the other way round), say both plainly, in this sense: 「${QIAN_SPLIT_LINE}」 (rendered in the reading's language), then say what the reader can do now. Never say which of the two is more accurate, never tell the reader to draw again or cast again.`,
    ...(e.story ? [`The lot's printed title 「${e.story}」 names an old story: do not tell or explain that story.`] : []),
    "Never say a deity said or promised anything, never call the lot 靈驗 or speak of changing one's luck, never interpret the poem at length, never take a date from it.",
  ].join(" ");
}

/**
 * 10-12 读者识别: our fixed lot text in Hong Kong written Chinese — for a Hong Kong reader, and always for the 黃大仙靈籤,
 * whose readers are mostly in Hong Kong. All 160 lots were rewritten whole (data/qian-hk.json, rules in
 * 内容/解籤/港式改寫規範.md); a lot without one falls back to swapping the Taiwan-only words. The poem is never touched.
 */
type HkText = Pick<QianEntry, "title" | "plain" | "overall" | "love" | "work" | "ask_next">;
const HK_TEXT = hkData as unknown as Record<string, Record<string, HkText>>;
export function qianWording<T extends QianEntry>(e: T, hk: boolean): T {
  if (!hk) return e;
  const w = HK_TEXT[e.set]?.[String(e.num)];
  const yiji = { ...(e.yi ? { yi: toHkWording(e.yi) } : {}), ...(e.ji ? { ji: toHkWording(e.ji) } : {}) };
  if (w) return { ...e, title: w.title, plain: w.plain, overall: w.overall, love: w.love, work: w.work, ask_next: w.ask_next, ...yiji };
  return { ...e, ...yiji, title: toHkWording(e.title), plain: toHkWording(e.plain), overall: toHkWording(e.overall), love: toHkWording(e.love), work: toHkWording(e.work), ask_next: toHkWording(e.ask_next) };
}
export const HK_SETS = new Set(["huangdaxian"]);
