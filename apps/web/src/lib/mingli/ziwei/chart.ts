import { astro } from "iztro";
import { checkGender, type Gender, type Normalized } from "@/lib/mingli/birth/normalize";

/**
 * 10-18 进度表 71 紫微斗數排盤: iztro (SylarLong, MIT) → our ZiweiView. Runs in the browser, one chart per reader, and
 * never calls astro.config (B5/B7: iztro's default brightness and 全書 four transformations; the year turns at 正月初一).
 * The birth layer has already settled true solar time and 子時: under "next" the date has moved on and timeIndex is 0;
 * under "same" timeIndex is 12 (晚子時 on the same day). 10-19 (對照 Windada／LifeDNA): iztro's index 12 still adds a day
 * (dayDivide "forward"), so the 「晚子時不換日」 switch did nothing — "same" is sent as 子時 (0) of the same date. fixLeap = true: a leap month's first half counts as the month
 * before, the second half as the month after.
 */
export const PALACES = ["命宮", "兄弟", "夫妻", "子女", "財帛", "疾厄", "遷移", "交友", "官祿", "田宅", "福德", "父母"] as const;
export const BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"] as const;
export const MAJOR = ["紫微", "天機", "太陽", "武曲", "天同", "廉貞", "天府", "太陰", "貪狼", "巨門", "天相", "天梁", "七殺", "破軍"] as const;
const MUT = ["祿", "權", "科", "忌"] as const;
// iztro zh-TW → our names (and simplified for zh pages)
const NAME_FIX: Record<string, string> = { 僕役: "交友", 仆役: "交友" };

export interface ZStar { name: string; bright?: string; mut?: string }
export interface ZPalace { name: string; branch: string; stem: string; major: ZStar[]; minor: ZStar[]; adj: string[]; isBody: boolean; isSoul: boolean; decadal: [number, number] }
export interface ZLayer { kind: "decadal" | "yearly" | "monthly"; label: string; palaceBranch: string; stem: string; mutagen: Record<string, string>; names: string[] }
export interface ZiweiView {
  palaces: ZPalace[]; // in iztro order (寅 first)
  soulBranch: string; bodyBranch: string; fiveClass: string; chineseDate: string; lunarDate: string; time: string; zodiac: string; soulStar: string; bodyStar: string;
}

const mutOf = (s: { mutagen?: string }) => (s.mutagen ? s.mutagen : undefined);

export function ziweiInput(n: Normalized, gender: Gender) {
  if (!n.timeKnown || n.timeIndex === null) throw new Error("time");
  const d = n.chartDate;
  return { date: `${d.y}-${d.m}-${d.d}`, timeIndex: n.timeIndex === 12 ? 0 : n.timeIndex, gender: checkGender(gender) === "male" ? "男" : "女" };
}

type Astrolabe = ReturnType<typeof astro.bySolar>;
export function astrolabeOf(n: Normalized, gender: Gender, lang: "zh-TW" | "zh-CN" = "zh-TW"): Astrolabe {
  const x = ziweiInput(n, gender);
  return astro.bySolar(x.date, x.timeIndex, x.gender as Parameters<typeof astro.bySolar>[2], true, lang);
}

export function viewOf(a: Astrolabe): ZiweiView {
  const palaces: ZPalace[] = a.palaces.map((p) => ({
    name: NAME_FIX[p.name] ?? p.name,
    branch: p.earthlyBranch, stem: p.heavenlyStem,
    major: p.majorStars.map((s) => ({ name: s.name, bright: s.brightness || undefined, mut: mutOf(s) })),
    minor: p.minorStars.map((s) => ({ name: s.name, mut: mutOf(s) })),
    adj: p.adjectiveStars.map((s) => s.name),
    isBody: p.isBodyPalace, isSoul: /^命[宮宫]$/.test(p.name),
    decadal: [p.decadal.range[0], p.decadal.range[1]],
  }));
  return {
    palaces, soulBranch: a.earthlyBranchOfSoulPalace, bodyBranch: a.earthlyBranchOfBodyPalace, fiveClass: a.fiveElementsClass,
    // iztro's zh-TW still prints 腊月／闰 — Traditional on Traditional pages
    chineseDate: a.chineseDate, lunarDate: a.palaces.some((p) => p.name.includes("宮")) ? a.lunarDate.replace(/腊/g, "臘").replace(/闰/g, "閏") : a.lunarDate, time: a.time, zodiac: a.zodiac, soulStar: a.soul, bodyStar: a.body,
  };
}

/** a 運限 layer for a moment: 大限, 流年 or 流月 — which palace it sits in, its 四化 and the layer's palace names */
export function layerOf(a: Astrolabe, when: Date, kind: ZLayer["kind"]): ZLayer {
  const h = a.horoscope(when);
  const item = kind === "decadal" ? h.decadal : kind === "yearly" ? h.yearly : h.monthly;
  const mutagen: Record<string, string> = {};
  (item.mutagen ?? []).forEach((star: string, i: number) => { mutagen[star] = MUT[i]!; });
  return {
    kind, label: kind === "decadal" ? "大限" : kind === "yearly" ? "流年" : "流月",
    palaceBranch: a.palaces[item.index]!.earthlyBranch, stem: item.heavenlyStem, mutagen,
    names: (item.palaceNames ?? []).map((x: string) => NAME_FIX[x] ?? x),
  };
}

/** board position of a branch on the 4×4 grid (巳 top-left, 亥 bottom-right) */
export const GRID: Record<string, [number, number]> = { 巳: [0, 0], 午: [0, 1], 未: [0, 2], 申: [0, 3], 酉: [1, 3], 戌: [2, 3], 亥: [3, 3], 子: [3, 2], 丑: [3, 1], 寅: [3, 0], 卯: [2, 0], 辰: [1, 0] };
/** 三方四正: the palace, its 三合 pair and the one opposite */
export function sanFang(branch: string): string[] {
  const i = BRANCHES.indexOf(branch as (typeof BRANCHES)[number]);
  return [0, 4, 8, 6].map((k) => BRANCHES[(i + k) % 12]!);
}
/** the palace opposite (for an empty palace, read the stars across) */
export const opposite = (branch: string) => sanFang(branch)[3]!;
export const palaceLabel = (name: string, hans = false) => (/[宮宫]$/.test(name) ? name : `${name}${hans ? "宫" : "宮"}`);
export const isMajor = (s: string) => (MAJOR as readonly string[]).includes(s);
