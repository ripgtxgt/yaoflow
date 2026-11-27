import type { Foreign } from "@/lib/l10n/core";
import { foreignHardRules, foreignReportOffense, foreignVoice, languageName } from "@/lib/l10n/report-guard";
import { BAZI_NAMES, bzName } from "@/lib/mingli/bazi/names";
import type { ZiweiView } from "./chart";
import { gejuOf, type GFact, type GejuHit } from "./geju";
import { ZIWEI_NAMES, ZW_PALACES, zwName, type ZwName } from "./names";
import { ziweiReportText, ziweiUi } from "./page-ui";
import type { CrossF, PalaceF, ZiweiFacts } from "./report-facts";

/**
 * 10-30 进度表 128 ④ — the 紫微 deep report and 命盤問答 written for a page in another language: the same facts and
 * tasks as the Chinese report, the rules said for that language (lib/l10n/report-guard.ts), and the facts themselves
 * carrying that language's chart words (zwFactsIn — the model reads "Tai Yin (at its peak)", "Hua Ji", "Spouse Palace",
 * never a Chinese word it has to look up). The report page builds its fact lines with the same helpers.
 */

const SHA = ["擎羊", "陀羅", "火星", "鈴星", "地空", "地劫"];
/** how loud a palace is, in words (report-facts.ts palaceWeight, said in the page's language) */
const LEVEL: Record<Foreign, Record<"顯" | "平" | "弱", string>> = {
  en: { 顯: "pronounced", 平: "even", 弱: "quiet" },
  ja: { 顯: "強く出る", 平: "平穏", 弱: "控えめ" },
  ko: { 顯: "뚜렷함", 平: "평온함", 弱: "조용함" },
  fr: { 顯: "marqué", 平: "égal", 弱: "discret" },
  de: { 顯: "ausgeprägt", 平: "ausgeglichen", 弱: "leise" },
  es: { 顯: "marcado", 平: "parejo", 弱: "discreto" },
  pt: { 顯: "marcado", 平: "equilibrado", 弱: "discreto" },
};

/** the stored facts back into the chart shape geju.ts reads (same palaces, stars, brightness, 四化 and year stem) */
export function viewFromFacts(f: ZiweiFacts): ZiweiView {
  return {
    palaces: f.palaces.map((p) => ({ name: p.name, branch: p.branch, stem: p.stem, major: p.major, minor: p.minor, adj: [], isBody: p.isBody, isSoul: p.isSoul, decadal: p.decadal })),
    soulBranch: f.soulBranch, bodyBranch: f.bodyBranch, fiveClass: f.fiveClass, chineseDate: `${f.yearStem}`, lunarDate: "", time: "", zodiac: "", soulStar: f.soulStar, bodyStar: f.bodyStar,
  };
}

/** a 格局 fact in the page's words (the chart page's own templates, translated) */
export function zwFactIn(x: GFact, Z: ZwName, ui: Record<string, string>): string {
  const t = ui[`f_${x.k}`];
  if (!t) return "";
  const v = x.k === "bright" || x.k === "dim" ? Z.brightWord(x.x ?? "") : x.k === "mut" ? Z.mutFull(x.x ?? "") : x.k === "branchNot" ? Z.branch(x.x ?? "") : x.k === "stem" || x.k === "stemNot" ? Z.stem(x.x ?? "") : x.x ?? "";
  return Z.josa(t.replace(/\{(\w+)\}/g, (_m, k: string) => (k === "s" ? (x.s ?? []).map(Z.star).join(Z.list) : k === "p" ? (x.p ? Z.palaceFull(x.p) : "") : k === "b" ? (x.b ? Z.branch(x.b) : "") : k === "x" ? v : "")));
}
export interface GejuIn { id: string; name: string; status: string; tone: "full" | "part" | "weak"; plain: string; source: string; facts: string[]; missing: string[]; breaks: string[] }
/** the chart's 格局 in the page's words (recomputed from the stored chart — the same rules, the same order) */
export function zwGejuIn(f: ZiweiFacts, l: Foreign): GejuIn[] {
  const Z = zwName(l), ui = ziweiUi(l);
  return gejuOf(viewFromFacts(f)).map((h: GejuHit) => ({
    id: h.id, name: ui[`gjn_${h.id}`] ?? h.name, status: ui[`gjSt_${h.status}`] ?? h.status, tone: h.status === "成" ? "full" : h.status === "半成" ? "part" : "weak",
    plain: ui[`gjp_${h.id}`] ?? "", source: ui[`gjs_${h.id}`] ?? "",
    facts: h.facts.map((x) => zwFactIn(x, Z, ui)).filter(Boolean), missing: h.missing.map((x) => zwFactIn(x, Z, ui)).filter(Boolean), breaks: h.breaks.map((x) => zwFactIn(x, Z, ui)).filter(Boolean),
  }));
}

/** a palace's main stars in words, or the stars across for an empty one */
export function zwStarsIn(p: PalaceF, f: ZiweiFacts, l: Foreign): string {
  const Z = zwName(l), R = ziweiReportText(l);
  const line = (q: PalaceF) => q.major.map((s) => `${Z.starBright(s.name, s.bright)}${s.mut ? ` ${Z.mutFull(s.mut)}` : ""}`).join(Z.list);
  if (p.major.length) return line(p);
  const across = f.palaces.find((q) => q.name !== p.name && q.major.length && q.branch === OPP[p.branch]);
  return Z.josa(R.borrowed.replace("{s}", across ? line(across) : ""));
}
const BR = "子丑寅卯辰巳午未申酉戌亥";
const OPP: Record<string, string> = Object.fromEntries([...BR].map((b, i) => [b, BR[(i + 6) % 12]!]));

/** why a palace is loud or quiet (report-facts.ts palaceWeight), in words */
function weightWhyIn(p: PalaceF, Z: ZwName, l: Foreign): string[] {
  const R = ziweiReportText(l);
  const why: string[] = [];
  for (const x of [...p.major, ...p.minor]) if (x.mut) why.push(`${Z.star(x.name)} ${Z.mutFull(x.mut)}`);
  for (const x of p.major) if (x.bright === "廟" || x.bright === "旺" || x.bright === "陷" || x.bright === "不") why.push(Z.starBright(x.name, x.bright));
  const sha = p.minor.filter((x) => SHA.includes(x.name));
  if (sha.length) why.push(sha.map((x) => Z.star(x.name)).join(Z.list));
  if (!p.major.length) why.push(R.crossNoMain);
  return why;
}
const AREA_PALACE: Record<string, string> = { 自我: "命宮", 事業: "官祿", 財: "財帛", 感情: "夫妻", 才華表達: "子女", 人際: "交友" };
const AREA_GROUP: Record<string, string> = { 事業: "官杀", 財: "财", 才華表達: "食伤", 人際: "比劫" };
export interface CrossIn { area: string; agree: string; agreeKey: CrossF["agree"]; ziwei: string; bazi: string; ziweiLevel: string; baziLevel: string }
/** the 紫微 × 八字 rows in words */
export function zwCrossIn(f: ZiweiFacts, l: Foreign): CrossIn[] {
  const Z = zwName(l), R = ziweiReportText(l), F = bzName(l), BN = BAZI_NAMES[l];
  const b = f.bazi;
  const total = b ? Object.values(b.groups).reduce((a, x) => a + x, 0) || 1 : 1;
  const pct = (g: string) => Math.round(((b?.groups[g] ?? 0) / total) * 100);
  const group = (g: string) => (BN.groups as Record<string, string>)[g] ?? g;
  return f.cross.map((c) => {
    const pal = f.palaces.find((p) => p.name === AREA_PALACE[c.area]);
    const why = pal ? weightWhyIn(pal, Z, l) : [];
    const ziwei = `${pal ? Z.palaceFull(pal.name) : ""}${Z.colon}${why.join(Z.list) || R.crossEven}`;
    let bazi = "";
    if (b) {
      if (c.area === "自我") bazi = R.crossDm.replace("{dm}", F.dm(b.dayMaster)).replace("{s}", F.level(b.strength));
      else if (c.area === "感情") { const g = f.gender === "male" ? "财" : "官杀"; bazi = R.crossSpouse.replace("{g}", group(g)).replace("{n}", String(pct(g))); }
      else { const g = AREA_GROUP[c.area] ?? ""; bazi = R.crossShare.replace("{g}", group(g)).replace("{n}", String(pct(g))); }
    }
    return { area: (R.crossArea as Record<string, string>)[c.area] ?? c.area, agree: (R.crossAgree as Record<string, string>)[c.agree] ?? c.agree, agreeKey: c.agree, ziwei: Z.josa(ziwei), bazi: Z.josa(bazi), ziweiLevel: LEVEL[l][c.ziwei], baziLevel: LEVEL[l][c.bazi] };
  });
}

/** the chart facts with this language's words (what the model reads) */
export function zwFactsIn(f: ZiweiFacts, l: Foreign): Record<string, unknown> {
  const Z = zwName(l), F = bzName(l);
  const pal = (p: string | null) => (p ? Z.palaceFull(p) : null);
  const star = (s: { name: string; bright?: string; mut?: string }) => ({ name: Z.star(s.name), ...(s.bright ? { bright: Z.brightWord(s.bright) } : {}), ...(s.mut ? { mut: Z.mutFull(s.mut) } : {}) });
  const geju = zwGejuIn(f, l).map((g) => ({ name: g.name, status: g.status, meaning: g.plain, source: g.source, facts: g.facts, missing: g.missing, breaks: g.breaks }));
  return {
    gender: f.gender,
    fiveClass: Z.five(f.fiveClass), soulBranch: Z.branch(f.soulBranch), bodyBranch: Z.branch(f.bodyBranch), bodyPalace: Z.palaceFull(f.bodyPalace),
    soulStar: Z.star(f.soulStar), bodyStar: Z.star(f.bodyStar), yearStem: Z.stem(f.yearStem),
    palaces: f.palaces.map((p) => ({
      name: Z.palaceFull(p.name), branch: Z.branch(p.branch), stem: Z.stem(p.stem), major: p.major.map(star), minor: p.minor.map(star), isBody: p.isBody, isSoul: p.isSoul, decadal: p.decadal,
      borrowed: p.borrowed ? p.borrowed.map(Z.star) : null,
      fly: p.fly.map((x) => ({ m: Z.mutFull(x.m), star: Z.star(x.star), to: pal(x.to), self: x.self })),
    })),
    natalMut: f.natalMut.map((x) => ({ m: Z.mutFull(x.m), star: Z.star(x.star), palace: Z.palaceFull(x.palace) })),
    flyKey: f.flyKey.map((x) => ({ from: Z.palaceFull(x.from), m: Z.mutFull(x.m), star: Z.star(x.star), to: Z.palaceFull(x.to), self: x.self })),
    geju,
    decades: f.decades.map((d) => {
      const p = f.palaces.find((q) => q.name === d.palace);
      return {
        palace: Z.palaceFull(d.palace), branch: Z.branch(d.branch), stem: Z.stem(d.stem), startAge: d.startAge, endAge: d.endAge, startYear: d.startYear, endYear: d.endYear,
        stars: p ? zwStarsIn(p, f, l) : "", mut: d.mut.map((x) => ({ m: Z.mutFull(x.m), star: Z.star(x.star), palace: pal(x.palace) })), when: d.when,
      };
    }),
    age: f.age,
    bazi: f.bazi ? {
      dayMaster: F.dm(f.bazi.dayMaster), strength: F.level(f.bazi.strength), favour: f.bazi.favour.map(F.elOf), avoid: f.bazi.avoid.map(F.elOf),
      groups: Object.fromEntries(Object.entries(f.bazi.groups).map(([k, v]) => [(BAZI_NAMES[l].groups as Record<string, string>)[k] ?? k, v])), hasHour: f.bazi.hasHour,
    } : null,
    cross: zwCrossIn(f, l).map((c) => ({ area: c.area, ziwei: c.ziweiLevel, ziweiWhy: c.ziwei, bazi: c.baziLevel, baziWhy: c.bazi, agree: c.agree })),
    years: f.years,
  };
}

/** the rules of a foreign page's 紫微 report (deep) and of 命盤問答 */
export function zwForeignRules(l: Foreign, kind: "deep" | "qa" = "deep"): string[] {
  const N = ZIWEI_NAMES[l], Z = zwName(l), lang = languageName(l);
  // 10-30 (trial: Spanish and Portuguese reports wrote "Body Palace" in English): the concept words are the chart page's own
  const U = ziweiUi(l), R = ziweiReportText(l);
  /** a heading word inside a sentence: "palacio del Cuerpo", "die Vier Transformationen" (the page prints them as headings) */
  const mid = (s: string) => (l === "de" ? s.replace(/^(Die|Der|Das) /, (m) => m.toLowerCase()) : l === "fr" || l === "es" || l === "pt" ? s.replace(/^(Palais|Palacio|Palácio|Classe|Clase|Étoile|Estrella|Estrela|Configuration|Configuración|Configuração|Décennie|Década|Les|Las|Los|As|Os|Auto-transformation|Autotransformación|Autotransformação|Luminosité|Brillo|Brilho)\b/u, (m) => m.toLowerCase()) : s);
  const latin = !(l === "ja" || l === "ko");
  const palaces = ZW_PALACES.map((p, i) => `${p === "命宮" ? "命宮" : `${p}／${p}宮`} = ${N.palaceFull[i]}`).join(", ");
  return [
    `You write for YaoFlow, a site about the Yijing, tarot and Chinese birth charts, for readers of ${lang}. A reader asked for a written report on their own Zi Wei Dou Shu chart. You are given ONLY the chart's computed facts as JSON; write the parts you are asked for, from those facts.`,
    "FACTS: use only what the JSON says — palaces with their main stars (major) and brightness (bright), minor stars, the Four Transformations (mut), a palace's own stem transformations (fly: where each lands; self = a self-transformation), natalMut (the birth-year Four Transformations), flyKey, geju (the classical star patterns, with their status and what supports, lacks or spoils them), decades (ages, years, the palace and its transformations), bazi and cross (the BaZi side). Never invent a star, a transformation, a palace, an age or a year that is not there. When you name a chart term, say in the same sentence what it means in daily life. An empty palace (borrowed) is read through the stars across, and you say so.",
    `NAMES — the chart facts are already written with the ${lang} words; the tasks and these rules still use the Chinese ones, which are, in ${lang}: the palaces: ${palaces}; 身宮 = ${mid(R.headBody)}; 三方四正 = the palace with its trine and opposite palaces; 亮度 = ${mid(U.legendBright)} — 廟 = ${N.brightWord[0]}, 旺 = ${N.brightWord[1]}, 得 = ${N.brightWord[2]}, 利 = ${N.brightWord[3]}, 平 = ${N.brightWord[4]}, 不 = ${N.brightWord[5]}, 陷 = ${N.brightWord[6]}; 四化 = ${mid(U.legendMut)}: 化祿 = ${N.mutFull[0]}, 化權 = ${N.mutFull[1]}, 化科 = ${N.mutFull[2]}, 化忌 = ${N.mutFull[3]}; 生年四化 = ${mid(U.mutHead)}; 宮干 = a palace's stem; 飛化 = where a palace's stem sends a transformation; 自化 = ${mid(U.flySelf)}; 大限 = ${mid(U.decadal)} (a ten-year period); 流年 = the annual period; 五行局 = ${mid(R.headFive)} (e.g. ${Z.five("金四局")}); 命主／身主 = ${mid(R.headLords)}; 格局 = ${mid(U.gjHead)} (a classical star pattern); 擎羊／陀羅／火星／鈴星／地空／地劫 = ${["擎羊", "陀羅", "火星", "鈴星", "地空", "地劫"].map(Z.star).join(", ")}; 天魁／天鉞／左輔／右弼 = ${["天魁", "天鉞", "左輔", "右弼"].map(Z.star).join(", ")}; in the BaZi part: 日主 = ${BAZI_NAMES[l].dayMaster}, 喜用 = favorable elements, 忌 = unfavorable elements, 十神 groups as given. ${latin ? "Stars are written in pinyin, as the facts give them (Zi Wei, Tian Ji) — never as Chinese characters." : l === "ja" ? "Stars stay in kanji (紫微、天機), as Japanese 紫微斗数 writes them; use 新字体 (禄、権、徳)." : "Stars are written in hangul, as the facts give them (자미, 천기) — never as Chinese characters."} Write every one of these terms in ${lang} as given here${l === "en" ? "" : " — never the English one"}. Never put the Chinese word in brackets after the ${lang} term.`,
    `Meanings, in plain words — ${mid(U.legendBright)}: ${N.brightWord[0]} / ${N.brightWord[1]} = the star's nature comes out fully; ${N.brightWord[2]} / ${N.brightWord[3]} = moderately; ${N.brightWord[4]} = steadily; ${N.brightWord[5]} / ${N.brightWord[6]} = held in, it comes out with practice and time (never weak or bad). ${N.mutFull[0]} = where things flow and come easily; ${N.mutFull[1]} = where they take charge and push; ${N.mutFull[2]} = where they are seen, orderly, well-regarded; ${N.mutFull[3]} = what they hold onto and turn over most, where to slow down and review (never misfortune). A self-transformation = the theme comes and goes. ${["擎羊", "陀羅", "火星", "鈴星", "地空", "地劫"].map(Z.star).join(", ")} are friction or sudden turns, said calmly as a pace to keep.`,
    foreignVoice(l),
    foreignHardRules(l, "Never call a star, a palace or a transformation bad luck, a curse or a danger. No verdict on a marriage (no divorce, no failed marriage), nothing about a third party, no fear words about other people, nothing about the year of one's own zodiac animal (Tai Sui).", "Japanese 紫微斗数 words in 新字体 (化禄、化権、禄存、官禄宮、福徳宮、陥), never simplified Chinese forms (财、运、杀) and never the 繁體 forms 祿 and 權"),
    "Never talk about how the report, the site or the calculation works; never mention rules, data, JSON, the facts you were given, a system or a model. Write as someone who read the chart.",
    "Inside each field: plain text, no markdown, no headings, no bullet marks, no emoji.",
    ...(kind === "qa" ? ["THIS IS AN ANSWER to the reader's own question about this chart (not a full report)."] : []),
  ];
}

/** Japanese pages: Chinese-only and simplified forms that should not appear (祿 and 權 are the 繁體 forms: Japanese writes 禄 権) */
const JA_NOT = /[财杀运岁对关发实经长门车马见这们说么吗还让权贞贪阴阳军]|[祿權歲氣從對關發實經]|七杀/;
/** 10-30: chart words left in English on a French, German, Spanish or Portuguese page (a trial wrote "Body Palace" in Spanish) */
const EN_TERMS = /\b(?:(?:Life|Body|Siblings|Spouse|Children|Wealth|Health|Travel|Friends|Career|Property|Well-being|Parents) Palace|Four Transformations|Five Element Bureau|Life Lord|Body Lord|Self-transformation|brightness)\b/i;
/** the first reason a written part cannot be kept on a foreign page */
export function zwForeignOffense(s: string, l: Foreign): string | null {
  const o = foreignReportOffense(s, l, { zwds: true });
  if (o) return o;
  if (l === "ja") { const m = s.match(JA_NOT); if (m) return `script:${m[0]}`; }
  if (l === "ja" || l === "ko") { const m = s.match(/[A-Za-z]{3,}/); if (m) return `latin:${m[0]}`; }
  if (l === "fr" || l === "de" || l === "es" || l === "pt") { const m = s.match(EN_TERMS); if (m) return `english:${m[0]}`; }
  return null;
}
/** what a REWRITE REQUIRED message adds for these checks */
export function zwForeignNote(bad: string, l: Foreign): string | null {
  if (bad.startsWith("latin:")) return l === "ja" ? "No English words inside the Japanese text — say it in Japanese." : "No English words inside the Korean text — say it in Korean.";
  if (bad.startsWith("script:") && l === "ja") return "Use Japanese 新字体 forms only (禄、権、陰、陽、貞、機、軍 are written the Japanese way; no simplified Chinese).";
  if (bad.startsWith("english:")) return `Write the chart terms in ${languageName(l)} as the NAMES line gives them (${ziweiReportText(l).headBody}, ${ziweiUi(l).legendMut}, ${ZIWEI_NAMES[l].palaceFull[0]}), never in English.`;
  return null;
}
