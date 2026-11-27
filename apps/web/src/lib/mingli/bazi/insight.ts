import { EarthBranch, HeavenStem } from "tyme4ts";
import { relationsFull, shenshaOf, type Kind } from "./shensha";

/**
 * 10-18 (Neil: 免費盤補上「看懂這張盤」那一層) — the reading layer under the chart, all by fixed rules:
 *  - 五行能量: 天干 1 each; 地支藏干 本氣 1 · 中氣 0.5 · 餘氣 0.3. Same weighting as the
 *    competitor we compared (己巳 癸酉 己丑 庚午 → 金 2.8 · 木 0 · 水 1.5 · 火 2 · 土 3.8, test/mingli/insight.test.ts).
 *  - 十神占比 from the same weights (the day stem itself left out), grouped 印 · 比劫 · 食傷 · 財 · 官殺.
 *  - 格局: 子平 月令取格 — the month branch's hidden stems, the first one (本氣, 中氣, 餘氣) that shows on the year, month
 *    or hour stem; if none shows, the 本氣. 比肩 → 建祿格, 劫財 → 月刃格. 正格 only (no 從格／化格 judgement).
 *  - 助身／耗身: 印 + 比劫 against 食傷 + 財 + 官殺, from the energy.
 *  - 神煞 sorted into a few groups readers recognise (貴人、才華、人緣、財祿、走動); the rest stay in the pro table.
 *  - 關係: the 原局 relations as edges between columns, for the diagram.
 * Pure: tyme4ts and shensha.ts only, runs in the browser. Output names are simplified (as tyme4ts / shensha print them);
 * the page turns them into the reader's script.
 */
const EL = ["木", "火", "土", "金", "水"] as const;
export type El = (typeof EL)[number];
const GROUP_OF: Record<string, string> = {
  比肩: "比劫", 劫财: "比劫", 食神: "食伤", 伤官: "食伤", 正财: "财", 偏财: "财", 正官: "官杀", 七杀: "官杀", 正印: "印", 偏印: "印",
};
export const TEN_ORDER = ["正印", "偏印", "比肩", "劫财", "食神", "伤官", "正财", "偏财", "正官", "七杀"] as const;
export const GROUP_ORDER = ["印", "比劫", "食伤", "财", "官杀"] as const;

export const SS_GROUPS: { key: string; names: string[] }[] = [
  { key: "noble", names: ["天乙贵人", "太极贵人", "天德贵人", "月德贵人", "天德合", "月德合", "福星贵人", "国印贵人", "德秀贵人"] },
  { key: "talent", names: ["文昌贵人", "学堂", "正学堂", "词馆", "正词馆", "华盖"] },
  { key: "charm", names: ["桃花", "红鸾", "天喜", "红艳煞"] },
  { key: "wealth", names: ["禄神", "金舆", "天厨贵人"] },
  { key: "move", names: ["驿马", "将星"] },
];

export interface Insight {
  energy: Record<El, number>; total: number;
  tens: Record<string, number>; groups: Record<string, number>; tenTotal: number;
  geju: { ten: string; name: string; shown: boolean; stem: string } | null;
  help: number; drain: number;
  shensha: { key: string; names: string[] }[];
  links: { a: number; b: number; c?: number; row: "stem" | "branch"; label: string }[];
}

const round = (x: number) => Math.round(x * 10) / 10;

export function insightOf(pillars: string[], gender: "male" | "female"): Insight {
  const stems = pillars.map((p) => HeavenStem.fromName(p[0]!));
  const dm = stems[2]!;
  const energy = Object.fromEntries(EL.map((e) => [e, 0])) as Record<El, number>;
  const tens: Record<string, number> = Object.fromEntries(TEN_ORDER.map((t) => [t, 0]));
  const add = (s: ReturnType<typeof HeavenStem.fromName>, w: number, self: boolean) => {
    energy[s.getElement().getName() as El] += w;
    if (!self) tens[dm.getTenStar(s).getName()]! += w;
  };
  stems.forEach((s, i) => add(s, 1, i === 2));
  pillars.forEach((p) => {
    for (const h of EarthBranch.fromName(p[1]!).getHideHeavenStems()) {
      const w = (h.getType() === 2 ? 1 : h.getType() === 1 ? 0.5 : 0.3);
      add(h.getHeavenStem(), w, false);
    }
  });
  for (const e of EL) energy[e] = round(energy[e]);
  const total = round(EL.reduce((a, e) => a + energy[e], 0));
  for (const t of TEN_ORDER) tens[t] = round(tens[t]!);
  const groups: Record<string, number> = Object.fromEntries(GROUP_ORDER.map((g) => [g, 0]));
  for (const t of TEN_ORDER) groups[GROUP_OF[t]!] = round(groups[GROUP_OF[t]!]! + tens[t]!);
  const tenTotal = round(TEN_ORDER.reduce((a, t) => a + tens[t]!, 0));
  // 日主 itself counts on the helping side
  const help = round(groups["印"]! + groups["比劫"]! + 1), drain = round(groups["食伤"]! + groups["财"]! + groups["官杀"]!);

  // 格局 (月令取格)
  let geju: Insight["geju"] = null;
  if (pillars[1]) {
    const hidden = [...EarthBranch.fromName(pillars[1][1]!).getHideHeavenStems()].sort((a, b) => b.getType() - a.getType());
    const others = stems.filter((_, i) => i !== 2).map((s) => s.getName());
    const pick = hidden.find((h) => others.includes(h.getHeavenStem().getName())) ?? hidden[0];
    if (pick) {
      const ten = dm.getTenStar(pick.getHeavenStem()).getName();
      const name = ten === "比肩" ? "建禄格" : ten === "劫财" ? "月刃格" : `${ten}格`;
      geju = { ten, name, shown: others.includes(pick.getHeavenStem().getName()), stem: pick.getHeavenStem().getName() };
    }
  }

  // 神煞 groups (natal columns)
  const natal = { year: pillars[0]!, month: pillars[1]!, day: pillars[2]!, hour: pillars[3] };
  const kinds: Kind[] = ["natal-year", "natal-month", "natal-day", "natal-hour"];
  const have = new Set(pillars.flatMap((p, i) => shenshaOf(p, natal, gender, kinds[i]!)));
  const shensha = SS_GROUPS.map((g) => ({ key: g.key, names: g.names.filter((n) => have.has(n)) })).filter((g) => g.names.length);

  // relation edges
  const rel = relationsFull(pillars);
  const links: Insight["links"] = [];
  const col = (chars: string[], row: "stem" | "branch") => {
    const src = row === "stem" ? pillars.map((p) => p[0]!) : pillars.map((p) => p[1]!);
    const used = new Set<number>();
    return chars.map((c) => { const i = src.findIndex((x, k) => x === c && !used.has(k)); if (i >= 0) used.add(i); return i; });
  };
  for (const r of rel.stems) {
    const [a, b] = col([r[0]!, r[1]!], "stem");
    if (a! >= 0 && b! >= 0) links.push({ a: a!, b: b!, row: "stem", label: r.slice(2).replace(/^合化/, "合") });
  }
  for (const r of rel.branches) {
    const tri = /^(.)(.)(.)(三合|三会)/.exec(r);
    if (tri) { const [a, b, c] = col([tri[1]!, tri[2]!, tri[3]!], "branch"); if (a! >= 0 && b! >= 0 && c! >= 0) links.push({ a: a!, b: b!, c: c!, row: "branch", label: r.slice(3) }); continue; }
    if (/拱|见.暗/.test(r)) continue; // 拱合／暗三會 involve a branch that is not on the chart
    const [a, b] = col([r[0]!, r[1]!], "branch");
    if (a! >= 0 && b! >= 0 && a !== b) links.push({ a: a!, b: b!, row: "branch", label: r.slice(2) });
  }
  return { energy, total, tens, groups, tenTotal, geju, help, drain, shensha, links };
}
