import type { Foreign } from "@/lib/l10n/core";
import { foreignHardRules, foreignReportOffense, foreignVoice, languageName } from "@/lib/l10n/report-guard";
import { PLANETS, SIGNS } from "@/lib/mingli/astro/chart";
import type { CoreF, HepanFacts, YearF } from "./facts";
import { hepanT } from "./page-ui";
import { hepanNames } from "./names-data";
import { hpNameOf } from "./names";
import { factIn, hpDateIn, relIn, yearBaziIn } from "./text-in";

/**
 * 10-30 进度表 128 ④ — the 合盤報告 written for a page in another language: the same facts and tasks as the Chinese
 * report, the facts carrying that language's words (hpFactsIn — the model reads "Jia (Yang Wood)", "Hua Ji",
 * "Spouse Palace", "trine", never a Chinese word it has to look up), the rules said for that language and its own
 * checks (a verdict on the pair, a score, a third party, he / she for the other person in English).
 */

/** how the other person is named — gender-neutral, never a name */
export const HP_TA: Record<Foreign, string> = {
  en: "they / them / their (never he or she)", ja: "相手", ko: "상대", fr: "l'autre (l'autre personne)", de: "die andere Person / dein Gegenüber", es: "la otra persona", pt: "a outra pessoa",
};
const TONE: Record<string, string> = { 順: "easy", 磨: "friction", 中: "neutral", 混: "mixed" };
const EL_KEY: Record<string, string> = { 同元素: "el_same", 相容: "el_ok", 相異: "el_diff" };
const SYS_KEY: Record<string, string> = { 八字: "sys_bazi", 紫微: "sys_ziwei", 星盤: "sys_astro" };
const SOUL_KEY: Record<string, string> = { 同宮: "soul_same", 對宮: "soul_opp", 三合: "soul_tri" };
/** a fact's id without Chinese (as.syn.太陽.金星 → as.syn.sun.venus) — it only ties the facts to their themes */
const ID_WORD: Record<string, string> = { 太陽: "sun", 月亮: "moon", 水星: "mercury", 金星: "venus", 火星: "mars", 木星: "jupiter", 土星: "saturn", 上升: "asc", 祿: "lu", 權: "quan", 科: "ke", 忌: "ji" };
const idIn = (id: string) => id.split(".").map((p) => ID_WORD[p] ?? p).join(".");

/** the pair's facts with this language's words (what the model reads); `year` only when given */
export function hpFactsIn(f: HepanFacts, l: Foreign, withYear = false): Record<string, unknown> {
  const T = hepanT(l), H = hpNameOf(hepanNames(l)), B = H.B, Z = H.Z;
  const rels = (list: string[]) => list.map((r) => relIn(r, T, H));
  const zwSide = (st: { stars: string[]; borrowed: boolean }) => ({ stars: st.stars.map(Z.star), borrowed: st.borrowed });
  const core = (c: CoreF) => ({
    zodiac: H.animal(c.yearBranch), dayPillar: B.gz(c.dayPillar), dayMaster: B.dm(c.dayMaster), dayBranch: B.branch(c.dayBranch),
    strength: B.level(c.strength), favour: c.favour.map(B.elOf), avoid: c.avoid.map(B.elOf), strongEl: B.elOf(c.strongEl), weakEl: B.elOf(c.weakEl), hasHour: c.hasHour,
    spouseStar: { ten: B.ten(c.spouseStar.ten), element: B.elOf(c.spouseStar.element), strength: H.starStrength(c.spouseStar.strength) },
    ziwei: c.ziwei ? { soul: zwSide(c.ziwei.soul), spouse: zwSide(c.ziwei.spouse), fiveClass: Z.five(c.ziwei.fiveClass) } : null,
    astro: {
      timeKnown: c.astro.timeKnown, sun: H.sign(c.astro.sun), moon: c.astro.moon ? H.sign(c.astro.moon) : null, moonSplit: c.astro.moonSplit ? c.astro.moonSplit.map(H.sign) : null,
      mercury: H.sign(c.astro.mercury), venus: H.sign(c.astro.venus), mars: H.sign(c.astro.mars), saturn: H.sign(c.astro.saturn), asc: c.astro.asc ? H.sign(c.astro.asc) : null,
      strongEl: c.astro.strongEl.map(H.astroEl), weakEl: c.astro.weakEl.map(H.astroEl),
    },
  });
  const feed = (x: "喜用" | "忌" | null) => (x === "喜用" ? "favorable" : x === "忌" ? "unfavorable" : null);
  const link = (x: { link: "同星" | "同系" | null; shared: string[]; group: string | null }) => ({ link: x.link === "同星" ? "shared star" : x.link === "同系" ? "same star group" : null, shared: x.shared.map(Z.star), group: x.group ? H.group(x.group) : null });
  const mut = (m: { m: string; star: string; palace: string }) => ({ m: Z.mutFull(m.m), star: Z.star(m.star), palace: Z.palaceFull(m.palace) });
  const syn = (s: { a: string; b: string; name: string; orb: number }) => ({ a: H.planet(s.a), b: H.planet(s.b), name: H.aspect(s.name), orb: s.orb });
  const out: Record<string, unknown> = {
    a: core(f.a), b: core(f.b),
    bazi: {
      dm: f.bazi.dm, dayStem: rels(f.bazi.dayStem), dayBranch: rels(f.bazi.dayBranch), zodiac: rels(f.bazi.zodiac), tenOfB: B.ten(f.bazi.tenOfB), tenOfA: B.ten(f.bazi.tenOfA),
      spouseA: f.bazi.spouseA, spouseB: f.bazi.spouseB, feedA: feed(f.bazi.feedA), feedB: feed(f.bazi.feedB), palaceA: rels(f.bazi.palaceA), palaceB: rels(f.bazi.palaceB),
    },
    ziwei: f.ziwei ? { spouseA: link(f.ziwei.spouseA), spouseB: link(f.ziwei.spouseB), mutInA: f.ziwei.mutInA.map(mut), mutInB: f.ziwei.mutInB.map(mut), soul: f.ziwei.soul ? T[SOUL_KEY[f.ziwei.soul]!] ?? null : null } : null,
    astro: {
      syn: f.astro.syn.map(syn), satA: f.astro.satA.map(syn), satB: f.astro.satB.map(syn),
      elements: f.astro.elements.map((e) => ({ point: H.planet(e.point), a: e.a ? H.astroEl(e.a) : null, b: e.b ? H.astroEl(e.b) : null, rel: e.rel ? T[EL_KEY[e.rel]!] ?? null : null })),
      inA: f.astro.inA ? f.astro.inA.map((h) => ({ planet: H.planet(h.planet), house: h.house })) : null,
      inB: f.astro.inB ? f.astro.inB.map((h) => ({ planet: H.planet(h.planet), house: h.house })) : null,
    },
    facts: f.facts.map((x) => ({ id: idIn(x.id), sys: T[SYS_KEY[x.sys] ?? ""] ?? x.sys, text: factIn(f, x, T, H), tone: TONE[x.tone] ?? x.tone, themes: x.themes })),
    themes: f.themes.map((t) => ({ key: t.key, title: T[`theme_${t.key}`] ?? t.key, systems: t.systems, facts: t.facts.map(idIn), lean: TONE[t.lean] ?? t.lean })),
  };
  if (withYear && f.year) out.year = yearIn(f.year, l);
  return out;
}
function yearIn(y: YearF, l: Foreign): Record<string, unknown> {
  const T = hepanT(l), H = hpNameOf(hepanNames(l)), B = H.B, Z = H.Z;
  const mut = (m: { m: string; star: string; palace?: string }) => ({ m: Z.mutFull(m.m), star: Z.star(m.star), ...(m.palace ? { palace: Z.palaceFull(m.palace) } : {}) });
  return {
    year: y.year, baziYear: y.baziYear, gz: B.gz(y.gz),
    bazi: { a: y.bazi.a.map((s) => yearBaziIn(s, T, H)), b: y.bazi.b.map((s) => yearBaziIn(s, T, H)) },
    ziwei: y.ziwei ? {
      stem: B.stem(y.ziwei.stem), mut: y.ziwei.mut.map(mut),
      a: { mut: y.ziwei.a.mut.map(mut), soulPalace: y.ziwei.a.soulPalace ? Z.palaceFull(y.ziwei.a.soulPalace) : null },
      b: { mut: y.ziwei.b.mut.map(mut), soulPalace: y.ziwei.b.soulPalace ? Z.palaceFull(y.ziwei.b.soulPalace) : null },
    } : null,
    transits: y.transits.map((t) => ({
      who: t.who === "你" ? "a" : "b", planet: H.planet(t.planet), point: H.planet(t.point), aspect: H.aspect(t.aspect),
      exact: t.exact.map((d) => hpDateIn(d, y.year, l)), from: hpDateIn(t.from, y.year, l), to: hpDateIn(t.to, y.year, l),
    })),
  };
}

/** the languages whose grammar shows a person's gender: the pronouns and the endings to keep out */
const GENDERED: Partial<Record<Foreign, { pron: string; adj: string }>> = {
  fr: { pron: "il, elle, lui", adj: "concentré / concentrée, pressé / pressée, prêt / prête" },
  es: { pron: "él, ella", adj: "callado / callada, cansado / cansada, listo / lista" },
  pt: { pron: "ele, ela, dele, dela", adj: "você mesmo / mesma, cansado / cansada, pronto / pronta" },
};

/** the rules of a foreign page's 合盤報告 */
export function hpForeignRules(l: Foreign, withYear: boolean): string[] {
  const T = hepanT(l), H = hpNameOf(hepanNames(l)), N = H.N, Z = H.Z, lang = languageName(l);
  const ta = HP_TA[l];
  const pairs = (zh: readonly string[], to: (s: string) => string) => zh.map((z) => `${z} = ${to(z)}`).join(", ");
  const chapters = ["dise", "xiyin", "jiezou", "mocha", "goutong", "shenghuo", "changqi", "liunian", "jianyi", "qa"].map((k) => T[`ch_${k}`]).filter(Boolean).join(" / ");
  return [
    `You write for YaoFlow, a site about the Yijing, tarot and birth charts, for readers of ${lang}. A reader asked for a ${T.kindLabel ?? "pair report"}: how they (you, the reader) and one other person (the other person = ${ta}) tend to get along, read from three systems — ${T.sys_bazi} (BaZi), ${T.sys_ziwei} (Zi Wei Dou Shu) and ${T.sys_astro} (Western astrology). You are given ONLY the computed facts of the two charts and of the pair, as JSON, already written in ${lang}; write the parts you are asked for, from those facts.`,
    "FACTS: `a` is the reader (you), `b` the other person. Each has zodiac (the Chinese zodiac animal) and dayPillar, dayMaster (with its element), dayBranch (the day branch = the spouse palace of BaZi), strength, favour (favorable elements) and avoid (unfavorable), strongEl (the strongest element in that chart), spouseStar (that chart's own spouse star — for a man the Wealth stars, for a woman the Power stars — and how present it is), ziwei (Zi Wei: the Life Palace and Spouse Palace main stars, borrowed = read from the opposite palace) or null, astro (the signs of Sun, Moon, Mercury, Venus, Mars, Saturn and the Ascendant; timeKnown false = no Ascendant and no houses; moonSplit = the Moon is one of two signs). `bazi` = the pair in BaZi: dm (how the two day-master elements meet: same; aFeedsB = yours feeds theirs; bFeedsA = theirs feeds yours; aCurbsB = yours restrains theirs; bCurbsA = theirs restrains yours), dayStem / dayBranch / zodiac relations, tenOfB (what the other's day stem is to you, a Ten God) and tenOfA, spouseA (the other's day master is your spouse-star element) and spouseB, feedA (the other's strongest element is on your favorable or unfavorable side) and feedB, palaceA (the other's zodiac branch against your day branch) and palaceB. `ziwei` (null when a birth time is missing) = spouseA (your Spouse Palace against the other's Life Palace: shared star / same star group), spouseB, mutInA (the other's birth-year Four Transformations laid on your chart: which of your palaces each lands in), mutInB, soul (how the two Life Palaces stand). `astro` = syn (aspects between your point a and the other's point b, with the orb in degrees), satA (your Saturn to the other's Sun / Moon / Venus) and satB, elements (Sun, Moon, Venus: same element, compatible, different), inA (the other's planets in your houses) and inB. `facts` = every fact in words, with sys, tone (easy, friction, neutral) and the themes it feeds. `themes` = attract, rhythm, friction, talk, life, long, each with its title, systems (how many of the three systems point there) and its facts — lean on the themes more systems agree on, and NEVER state systems or any count as a number, a score or a rating.",
    "Never invent a pillar, a star, a palace, a sign, a house, an aspect or a degree that is not in the JSON. When you name a chart term, say in the same sentence what it means in daily life. Where ziwei is null, never discuss Zi Wei (say at most once, gently, that it needs both birth times). Where a person's astro.timeKnown is false, never mention their Ascendant or houses.",
    "Meanings, in plain words: day masters of the same element = a similar outlook, easy to understand each other, may get stuck on the same thing; one feeds the other = one tends to give, support and look after the other; one restrains the other = one tends to set the direction or press the other (never say one destroys or defeats the other). A stem combination and the Six Harmony (六合 of branches) = closeness, a pull towards each other; a half-combination = working well together; a clash = movement, push and pull, different paces; a punishment, harm or break = small frictions and misunderstandings. A spouse-star match = the other has the qualities this chart is drawn to in a partner. Favorable feed = the other brings what you need more of; unfavorable = the other's strongest side can wear on your pace and habits (practical, never harm). Zi Wei transformations laid on the chart: Hua Lu = ease, giving, good feeling in that area; Hua Quan = taking charge, strong opinions there; Hua Ke = understanding, being reasonable, keeping face; Hua Ji = care that turns into worry, attachment or friction there — say it gently. Life Palaces in a trine = easy cooperation; opposite = a mirror: attraction and contrast. Astrology: Sun = direction and vitality; Moon = feelings and what feels safe; Mercury = talking and thinking; Venus = affection, taste, what they value; Mars = drive, desire, temper; Saturn = commitment, responsibility, weight; Ascendant = first impression. Conjunction = fused, strong either way; sextile = easy help; trine = natural flow; square = friction that pushes action; opposition = a pull between two ends. Houses: 1 self and first impression, 2 money, 3 talk and learning, 4 home, 5 romance and play, 6 daily routine, 7 partnership, 8 intimacy and shared resources, 9 beliefs and travel, 10 career, 11 friends and hopes, 12 solitude and the unseen.",
    `NAMES — the facts are already written in ${lang}; the tasks still use Chinese words, which are, in ${lang}: 你 = you (the reader); TA = the other person, written ${ta}; 八字 = ${T.sys_bazi}; 紫微 / 紫微斗數 = ${T.sys_ziwei}; 星盤 = ${T.sys_astro}; 日主 = ${N.bz.dayMaster}; 日柱 = ${T.card_pillar ?? "day pillar"}; 日支 = day branch; 生肖 = ${T.card_zodiac ?? "Chinese zodiac animal"}; 喜用 = favorable elements; 忌 = unfavorable elements; 強弱 = strength; 配偶星 = spouse star; 十神 = Ten Gods; 天干相合 = stem combination; 六合 / 半合 / 相沖 / 相刑 / 相害 / 相破 (of branches) = ${["r_liuhe", "r_banhe", "r_chong", "r_xing", "r_hai", "r_po"].map((k) => (T[k] ?? "").replace("{g}", "…")).join(" / ")}; 制 = restrains; 生 = feeds; palaces: ${pairs(["命宮", "夫妻", "財帛", "田宅", "官祿", "福德"], Z.palaceFull)}; 四化 = the Four Transformations: ${pairs(["祿", "權", "科", "忌"], Z.mutFull)}; planets: ${pairs(PLANETS.slice(0, 7), H.planet)}; 上升 = ${N.asc}; aspects: ${pairs(["合", "六合", "刑", "拱", "沖"], H.aspect)} (as aspects between planets); signs: ${pairs(SIGNS, H.sign)}; 第N宮 = house N; 國曆 = the Gregorian calendar; 流年 = this year's period; 立春 = Lichun, the start of spring (about 4 February), where the BaZi year begins; 卦 / 起一卦 = a hexagram / casting a hexagram with the Yijing; the chapters: ${chapters}. Never put the Chinese word in brackets after the ${lang} term.`,
    `${foreignVoice(l)} Be fair to both people. The other person is ONLY ${ta} — never a name.`,
    // 10-30 trial: French and Spanish wrote 「chez lui」「ella」 for the other person and 「concentré」「callado」 for the reader
    ...(GENDERED[l] ? [`GENDER: neither person's gender is given, so it must never show. For the other person: no gendered pronoun (${GENDERED[l]!.pron}) — repeat ${ta} or rephrase. For the reader: no adjective or participle whose ending shows a gender (${GENDERED[l]!.adj}) — say it with a noun or a verb instead.`] : []),
    foreignHardRules(l, "No verdict on the pair or its future: never whether they suit each other, will last, break up or get back together, never soulmates, a perfect match, meant to be or made for each other. No score, number, rating or percentage of the relationship (no compatibility score, no %). Never say one element or person defeats or destroys the other. Never say what the other person secretly thinks or will do; nothing about a third person, cheating or an affair; no age or year for marriage or children; no divorce."),
    ...(withYear ? [
      "`year` = this year for the two of you: gz (this BaZi year's stem-branch, from Lichun) and bazi.a / bazi.b (how it meets your and the other's day pillar, day branch and zodiac animal, and whether its stem is favorable or unfavorable); ziwei (null without both birth times): this year's Four Transformations (mut), where they land in each chart (a.mut / b.mut) and the palace this year's annual Life Palace falls on in each chart (soulPalace); transits: Jupiter and Saturn against each person's Sun, Venus (and Moon, Ascendant with a birth time) — who (a = you, b = the other), the aspect, the exact dates (exact, may be empty) and the window within one degree (from, to). Jupiter = doors open, warmth, growth; Saturn = commitment, a test of patience, building something solid.",
      `DATES: every date is Gregorian and already written in ${lang}. Write only dates that appear in year.transits (exact, from, to), as given; a month by its ${lang} name. Never a lunar date or lunar month.`,
    ] : []),
    "Never talk about how the report, the site or the calculation works; never mention rules, data, JSON, the facts you were given, systems counts, scores or a model. Write as someone who read both charts.",
    "Inside each field: plain text, no markdown, no headings, no bullet marks, no emoji.",
  ];
}

/**
 * the task of a writing call for a foreign page: the Chinese task with its 國曆 wording and the cast line said for any
 * language, and each chapter named by its title on the page (a Japanese trial wrote 「あなたの底色から」 from 兩個人的底色)
 */
export const foreignTask = (task: string, l?: Foreign) => {
  const T = l ? hepanT(l) : null;
  return task
    .replace(/the dates as 國曆 M\/D/g, "the dates as given")
    .replace(/this year's facts with 國曆 dates/g, "this year's facts with their dates")
    .replace(/suggest casting a 卦 \(起一卦\)/g, "suggest casting a hexagram with the Yijing")
    .replace(/\b(dise|xiyin|jiezou|goutong|mocha|shenghuo|changqi|jianyi|liunian) \(([^,)]+)/g, (m, k: string) => (T?.[`ch_${k}`] ? `${k} (${T[`ch_${k}`]}` : m))
    .replace(/the chapter 答你的問題/g, T?.qaTitle ? `the chapter "${T.qaTitle}"` : "the chapter answering the reader's question")
    .replace(/底色/g, " base tones");
};

/** what a foreign 合盤 text may not hold beyond the general checks */
// whole words by letters, not \b (which is ASCII-only: 「âmes sœurs」 would slip past it); a percentage stands on its own
const words = (list: string) => new RegExp(`(?<!\\p{L})(?:${list})(?!\\p{L})|\\d+\\s?[%％]`, "iu");
const HP_BANNED_F: Record<Foreign, RegExp> = {
  en: words("soul ?mates?|perfect match|meant to be|made for each other|break(?:s|ing)? up|get(?:ting)? back together|divorce[ds]?|compatibility (?:score|rating|percentage)|per ?cent|cheat(?:s|ing|ed)?|affair|third party"),
  ja: /ソウルメイト|運命の相手|赤い糸|相性\s*\d+|\d+\s*[%％]|別れ(?:る|ます|た)|離婚|復縁|浮気|不倫|三角関係/,
  ko: /소울메이트|운명의 상대|천생연분|궁합\s*\d+\s*점|\d+\s*%|헤어지|이혼|재결합|바람을 피|불륜|삼각관계/,
  // (a bare rupture／ruptura is how the branch relation 破 was first translated — the breakup words are phrases)
  fr: words("âmes? sœurs?|faits? l'un pour l'autre|match parfait|rupture (?:amoureuse|du couple)|vous (?:allez )?vous séparer|vous séparerez|divorc\\p{L}*|score de compatibilité|pour ?cent|infidélité|tromper|liaison extraconjugale"),
  de: words("Seelenverwandte?n?|füreinander bestimmt|perfekte[rs]? Match|Trennung|Scheidung|Kompatibilitätswert|Prozent|fremdgehen|Affäre|Seitensprung"),
  es: words("almas? gemelas?|hechos el uno para el otro|pareja perfecta|ruptura (?:amorosa|de la pareja)|van a separarse|se separarán|divorci\\p{L}*|puntuación de compatibilidad|por ciento|infidelidad|amante"),
  pt: words("almas? gêmeas?|feitos um para o outro|par perfeito|término do relacionamento|vão se separar|separação do casal|divórcio|pontuação de compatibilidade|por cento|traição|amante"),
};
const PRONOUN_EN = /\b(he|she|him|her|his|hers|himself|herself)\b/i;
export function hpForeignOffense(s: string, l: Foreign): string | null {
  const o = foreignReportOffense(s, l, { bazi: true }); // (六合 here is the 四柱推命 branch harmony, as Japanese writes it)
  if (o) return o;
  if (l === "ja" || l === "ko") { const m = s.match(/[A-Za-z]{3,}/); if (m) return `latin:${m[0]}`; }
  // Chinese words a Japanese trial copied from the task (Japanese says 干支 and 基調)
  if (l === "ja") { const m = s.match(/生肖|底色/); if (m) return `script:${m[0]}`; }
  const b = s.match(HP_BANNED_F[l]);
  if (b) return `verdict:${b[0]}`;
  if (l === "en") { const m = s.match(PRONOUN_EN); if (m) return `pronoun:${m[0]}`; }
  if (l !== "ja" && l !== "ko") { const m = s.match(/\bTA\b/); if (m) return "ta:TA"; }
  return null;
}
export function hpForeignNote(bad: string, l: Foreign): string | null {
  if (bad.startsWith("verdict:")) return "Follow the HARD RULES: no verdict on the pair (no soulmates, no breaking up, no divorce), no score or percentage, nothing about a third person.";
  if (bad.startsWith("pronoun:")) return "Refer to the other person as they / them — never he or she.";
  if (bad.startsWith("ta:")) return `Write the other person as ${HP_TA[l]}, never as TA.`;
  if (bad.startsWith("latin:")) return l === "ja" ? "Write Japanese only — no English word." : "Write Korean only — no English word.";
  return null;
}
