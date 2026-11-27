import type { Foreign } from "@/lib/l10n/core";
import { foreignHardRules, foreignReportOffense, foreignVoice, languageName } from "@/lib/l10n/report-guard";
import { BAZI_NAMES, ELEMENTS_ZH, JIE_KEYS, LEVEL_KEYS, NAYIN_ZH, SS_KEPT, STAGE_KEYS, TEN_KEYS, bzName, cycleIndex, simp } from "./names";
import { zhengyuanIn } from "./zhengyuan-in";
import type { ChartFacts } from "./report-facts";

/**
 * 10-30 进度表 128 ④ — the 八字 deep report, the 正緣畫像 and 命盤問答 written for a page in another language: the same
 * facts and tasks as the Chinese report, the rules said for that language (lib/l10n/report-guard.ts), the facts
 * themselves carrying that language's chart words (bzFactsIn — the model reads "Seven Killings", "Jia Zi", "strong",
 * never a Chinese word it has to look up) and a names line for the Chinese words the tasks still use.
 */

/** the words a fact list needs beyond the names (an element's role, a month tag) */
const WORDS: Record<Foreign, { fav: string; avoid: string; neutral: string; drain: string; steady: string; spaceTrait: string; structure: string }> = {
  en: { structure: "structure", fav: "favorable", avoid: "unfavorable", neutral: "neutral", drain: "draining", steady: "steady", spaceTrait: "needs their own space" },
  ja: { structure: "格局", fav: "喜用", avoid: "忌", neutral: "中立", drain: "消耗", steady: "穏やか", spaceTrait: "自分の時間が必要" },
  ko: { structure: "격국", fav: "희용", avoid: "기신", neutral: "중립", drain: "소모", steady: "평온", spaceTrait: "자기만의 공간이 필요" },
  fr: { structure: "structure", fav: "favorable", avoid: "défavorable", neutral: "neutre", drain: "épuisant", steady: "stable", spaceTrait: "a besoin de son propre espace" },
  de: { structure: "Struktur", fav: "günstig", avoid: "ungünstig", neutral: "neutral", drain: "zehrend", steady: "ruhig", spaceTrait: "braucht eigenen Raum" },
  es: { structure: "estructura", fav: "favorable", avoid: "desfavorable", neutral: "neutral", drain: "desgastante", steady: "estable", spaceTrait: "necesita su propio espacio" },
  pt: { structure: "estrutura", fav: "favorável", avoid: "desfavorável", neutral: "neutro", drain: "desgastante", steady: "estável", spaceTrait: "precisa do próprio espaço" },
};
/** 10-30 进度表 128 ④-5: the words for an element's role and a month's reason (the 年書's 八字篇 shows them too) */
export const bzRoleWords = (l: Foreign) => WORDS[l];
/** how the partner of the portrait is named in each language (gender-neutral) */
const TA: Record<Foreign, string> = {
  en: "they / this person (never he or she)", ja: "その人", ko: "그 사람", fr: "cette personne", de: "diese Person", es: "esa persona", pt: "essa pessoa",
};

const HAN = /[㐀-鿿]/;
/**
 * The chart facts with this language's words: every stem, branch, pillar, ten god, element, level, life stage, 納音,
 * star, structure, relation and month tag — values and object keys alike. What it does not know stays as it is.
 */
export function bzFactsIn<T>(chart: T, l: Foreign): T {
  const F = bzName(l), N = F.N, W = WORDS[l];
  const dict = new Map<string, string>();
  TEN_KEYS.forEach((k) => dict.set(k, N.ten[k]));
  dict.set("日主", N.dayMaster); dict.set("日元", N.dayMaster);
  for (const [k, v] of Object.entries(N.groups)) dict.set(k, v);
  [...ELEMENTS_ZH].forEach((e, i) => dict.set(e, N.elements[i]!));
  LEVEL_KEYS.forEach((k) => dict.set(k, N.levels[k]));
  STAGE_KEYS.forEach((k, i) => dict.set(k, N.stages[i]!));
  NAYIN_ZH.forEach((k, i) => dict.set(k, N.nayin[i]!));
  SS_KEPT.forEach((k) => dict.set(k, N.shensha[k]));
  dict.set("孤辰", N.guChen); dict.set("寡宿", N.guaSu);
  JIE_KEYS.forEach((k, i) => dict.set(k, N.jie[i]!));
  ["年柱", "月柱", "日柱", "时柱"].forEach((k, i) => dict.set(k, N.pillars[i]!));
  for (const [k, v] of Object.entries(N.starStrength)) dict.set(k, v);
  dict.set("喜用", W.fav); dict.set("忌", W.avoid); dict.set("中性", W.neutral); dict.set("平稳", W.steady);
  const word = (s: string): string => {
    if (!HAN.test(s)) return s;
    const hit = dict.get(s) ?? dict.get(simp(s));
    if (hit) return hit;
    if (s.length === 1) return F.ch(s) !== s ? F.ch(s) : s;
    if (s.length === 2 && cycleIndex(s) >= 0) return F.gz(s);
    // 「國曆 2026 年 10 月」 (a monthly rewrite's date)
    const ym = /^國曆\s*(\d{4})\s*年\s*(\d{1,2})\s*月$/.exec(s);
    if (ym) return `${ym[1]}-${ym[2]!.padStart(2, "0")}`;
    // a month tag: 「甲木·喜用」「午火·偏耗」
    const tag = /^(.)([木火土金水])·(喜用|偏耗)$/.exec(s);
    if (tag) return `${F.ch(tag[1]!)} (${F.elOf(tag[2]!)}): ${tag[3] === "喜用" ? W.fav : W.drain}`;
    if (/格$/.test(s)) return F.geju(s);
    const r = F.rel(s);
    return r;
  };
  const walk = (v: unknown): unknown => (typeof v === "string" ? word(v) : Array.isArray(v) ? v.map(walk)
    : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [word(k), walk(x)])) : v);
  return walk(chart) as T;
}

/** the 正緣畫像's facts on a page in another language: the traits written in it, the rest named in it */
export function zyFactsIn(f: ChartFacts, l: Foreign): Record<string, unknown> | null {
  const z = f.zhengyuan;
  if (!z) return null;
  const zy = zhengyuanIn({ pillars: f.pillars.map((p) => p.gz), gender: f.gender, partner: z.partner }, l);
  return {
    partner: z.partner, star: z.star, palace: z.palace,
    flowers: z.flowers.map((x) => (x === "孤辰" ? `${BAZI_NAMES[l].guChen} (${WORDS[l].spaceTrait})` : x === "寡宿" ? `${BAZI_NAMES[l].guaSu} (${WORDS[l].spaceTrait})` : x)),
    traits: z.traits.map((t) => ({ key: t.key, label: zy.labels[t.key as keyof typeof zy.labels] ?? t.key, text: zy.texts[t.key as keyof typeof zy.texts] ?? "" })),
  };
}

/** the rules of a foreign page's 八字 report (deep, love) and of 命盤問答 */
export function bzForeignRules(l: Foreign, kind: "deep" | "love" | "qa" = "deep"): string[] {
  const N = BAZI_NAMES[l], F = bzName(l), lang = languageName(l);
  const pairs = (zh: readonly string[], to: readonly string[]) => zh.map((z, i) => `${z} = ${to[i] ?? z}`).join(", ");
  const TEN_HANT = ["比肩", "劫財", "食神", "傷官", "偏財", "正財", "七殺", "正官", "偏印", "正印"];
  const latin = !(l === "ja" || l === "ko");
  return [
    `You write for YaoFlow, a site about the Yijing, tarot and Chinese birth charts, for readers of ${lang}. A reader asked for a written report on their own BaZi (Four Pillars) chart. You are given ONLY the chart's computed facts as JSON; write the parts you are asked for, from those facts.`,
    "FACTS: use only what the JSON says — pillars, the Ten Gods, strength.level, favour (favorable) and avoid (unfavorable) elements, geju (the structure), shensha (symbolic stars), relations, decades (luck pillars), years. Never invent a pillar, a star, a relation, an age or a year that is not there. When you name a chart term, say in the same sentence what it means in daily life. If hasHour is false the hour pillar is unknown: never guess it and never mention it.",
    `NAMES — the chart facts are already written with the ${lang} words; the tasks and these rules still use the Chinese ones, which are, in ${lang}: 日主 = ${N.dayMaster}; 格局 = ${WORDS[l].structure} (the chart's structure, e.g. ${F.geju("正官格")}); 十神 = the Ten Gods: ${pairs(TEN_HANT, TEN_KEYS.map((k) => N.ten[k]))}; their groups: 印 = ${N.groups["印"]}, 比劫 = ${N.groups["比劫"]}, 食傷 = ${N.groups["食伤"]}, 財 = ${N.groups["财"]}, 官殺 = ${N.groups["官杀"]}; elements: ${pairs([..."木火土金水"], N.elements)}; 喜用 = favorable elements; 忌 = unfavorable elements; 大運 = a luck pillar (ten years); 流年 = the annual pillar; 干支 = a stem-branch pair; 神煞 = symbolic stars — 文昌 = ${N.shensha["文昌贵人"]}, 華蓋 = ${N.shensha["华盖"]}, 驛馬 = ${N.shensha["驿马"]}, 將星 = ${N.shensha["将星"]}, 桃花 = ${N.shensha["桃花"]}, 紅鸞 = ${N.shensha["红鸾"]}, 天喜 = ${N.shensha["天喜"]}; 日支 = the day branch (the spouse palace); 時柱 = the hour pillar; 配偶星 = the spouse star; 夫妻宮 = the spouse palace; strength levels: ${pairs(LEVEL_KEYS, LEVEL_KEYS.map((k) => N.levels[k]))}. ${latin ? "Stems and branches are written in pinyin, as the facts give them (Jia, Zi, Jia Zi) — never as Chinese characters." : l === "ja" ? "Stems and branches stay in kanji (甲、子、甲子), as Japanese 四柱推命 writes them." : "Stems and branches are written in hangul, as the facts give them (갑, 자, 갑자) — never as Chinese characters."} Never put the Chinese word in brackets after the ${lang} term.`,
    foreignVoice(l),
    foreignHardRules(l, "Never call a star or a relation bad luck, a curse or a danger: a clash is movement, a penalty or a harm is friction to handle. No verdict on a marriage (no divorce, no failed marriage), nothing about harming a partner, nothing about the year of one's own zodiac animal (Tai Sui).", "Japanese 四柱推命 words, never the Chinese ones (日干 for the day master, 通変星, 偏官 not 七殺, 印綬 not 正印, 大運, 年運, 蔵干), no simplified Chinese forms (財 not 财, 運 not 运)"),
    "Never talk about how the report, the site or the calculation works; never mention rules, data, JSON, the facts you were given, a system or a model. Write as someone who read the chart.",
    "Inside each field: plain text, no markdown, no headings, no bullet marks, no emoji.",
    ...(kind === "love" ? [
      "THIS REPORT is a Partner portrait: a portrait of the TYPE of person this chart is drawn to and does well with — a temperament, not a specific person, and not a prediction of marriage or of when.",
      `You are given zhengyuan.traits: each has a key, a label and a text (what it means, already in ${lang}). Weave them into the portrait; add no chart facts of your own and never contradict a trait.`,
      `TA (the person of the portrait) is written in a gender-neutral way: ${TA[l]}. No ages, years or dates. Never judge whether the reader's love life is good or bad; nothing about a third party.`,
    ] : []),
  ];
}

/** what a foreign 八字 text may not hold beyond the general checks (lib/l10n/report-guard.ts) */
const JA_NOT = /[财杀伤运岁节气时从对关发实经长门东车马鸟见贝页这们说么吗还让]|[歲氣從對關發實經驛祿將帶絕爐劍蠟燈溪學國點與會來體]|七殺|七杀/;
const LOVE_PRONOUN_EN = /\b(he|she|him|her|his|hers|himself|herself)\b/i;
const LOVE_TIMING_F: Record<Foreign, RegExp> = {
  en: /\b(19|20)\d{2}\b|\b\d{1,2}\s*years?\s*old\b|\bat (the )?age (of )?\d+|\bnext year\b/i,
  ja: /(19|20)\d{2}年|\d+歳|来年|再来年/,
  ko: /(19|20)\d{2}년|\d+\s*(세|살)|내년|내후년/,
  fr: /\b(19|20)\d{2}\b|\b\d{1,2}\s*ans\b|l'an prochain|l'année prochaine/i,
  de: /\b(19|20)\d{2}\b|\b\d{1,2}\s*Jahre(n)?\b|nächstes Jahr|im nächsten Jahr/i,
  es: /\b(19|20)\d{2}\b|\b\d{1,2}\s*años\b|el próximo año|el año que viene/i,
  pt: /\b(19|20)\d{2}\b|\b\d{1,2}\s*anos\b|no próximo ano|ano que vem/i,
};
export function bzForeignOffense(s: string, l: Foreign, kind: "deep" | "love" | "year" | "qa" = "deep"): string | null {
  const o = foreignReportOffense(s, l);
  if (o) return o;
  if (l === "ja") { const m = s.match(JA_NOT); if (m) return `script:${m[0]}`; }
  // 10-30 (seen in a Japanese answer: 「身強の chart」): no English word inside a Japanese or Korean text
  if (l === "ja" || l === "ko") { const m = s.match(/[A-Za-z]{3,}/); if (m) return `latin:${m[0]}`; }
  if (kind === "love") {
    if (l === "en") { const m = s.match(LOVE_PRONOUN_EN); if (m) return `pronoun:${m[0]}`; }
    const t = s.match(LOVE_TIMING_F[l]);
    if (t) return `timing:${t[0]}`;
  }
  // 10-30 进度表 128 ④-5: the year book never names 太歲 outside Chinese (no such custom there; the Japanese and Korean
  // books carry their own customs in fixed text)
  if (kind === "year") { const m = s.match(TAI_SUI); if (m) return `banned:${m[0]}`; }
  return null;
}
/** (Korean 태세 is also the everyday 態勢 — 「준비 태세」 — so it is left to the rules, not the check) */
export const TAI_SUI = /\bTai[ -]?Sui\b|太歳|太歲|犯太/i;
/** a REWRITE REQUIRED message's own line for the 八字 checks above */
export function bzForeignNote(bad: string, l: Foreign): string | null {
  if (bad.startsWith("pronoun:")) return "Refer to the person of the portrait as they / this person — never he or she.";
  if (bad.startsWith("timing:")) return "No ages, years or dates in the portrait: say where and how, never when.";
  if (bad.startsWith("latin:")) return l === "ja" ? "Write Japanese only — no English word (命式, not chart)." : "Write Korean only — no English word (명식, not chart).";
  if (bad.startsWith("script:") && l === "ja") return "Write Japanese only: 日干, 通変星, 偏官 (never 七殺), 印綬 (never 正印), Japanese forms of every kanji (財, 運, 歳, 気, 駅馬, 禄, 将) — no Chinese-only or traditional forms.";
  return null;
}
