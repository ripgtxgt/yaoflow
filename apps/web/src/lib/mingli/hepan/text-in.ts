import type { CoreF, FactF, HepanFacts, ThemeKey, YearF } from "./facts";
import type { HpName } from "./names";

/**
 * 10-30 进度表 128 ④ — the 合盤's words on a page in another language (client-safe): every fact of the pair, the free
 * overview, the two people side by side and this year's facts, built from the page's own templates (hepanT, flat) and
 * that language's names (hpNameOf). The facts themselves stay as facts.ts computed them — Chinese keys and all; only
 * what is shown or sent to the model is said in the language. The Chinese pages keep facts.ts's own text.
 */
export type HpT = Record<string, string>;
const fill = (t: string | undefined, v: Record<string, string | number>): string => (t ?? "").replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));
/**
 * Korean: the templates write both forms of a particle (이(가), 을(를), 과(와)…) and the word decides — a particle after
 * a bracket follows the word before it (화록(태양)이(가) → 화록(태양)이). Other languages pass through.
 */
const KO_P = "이\\(가\\)|을\\(를\\)|은\\(는\\)|과\\(와\\)|\\(으\\)로";
export function koJosa(s: string, H: HpName): string {
  if (H.l !== "ko") return s;
  const t = s.replace(new RegExp(`([가-힣])(\\s?[(（][^)）]*[)）])(${KO_P})`, "g"), (_m, ch: string, br: string, p: string) => {
    const r = H.B.josa(ch + p);
    return `${r.slice(0, 1)}${br}${r.slice(1)}`;
  });
  return H.B.josa(t);
}

const REL_KEY: Record<string, string> = { 相沖: "r_chong", 六合: "r_liuhe", 相刑: "r_xing", 相害: "r_hai", 相破: "r_po", 同支: "r_same", 自刑: "r_self" };
/** a relation of two stems or branches (「相合（合土）」「半合（申子辰）」「相沖」…) in the page's words */
export function relIn(r: string, T: HpT, H: HpName): string {
  const he = /^相合（合(.)）$/.exec(r);
  if (he) return fill(T.r_he, { e: H.B.elOf(he[1]!) });
  const ban = /^半合（(.+)）$/.exec(r);
  if (ban) return fill(T.r_banhe, { g: [...ban[1]!].map(H.B.branch).join("–") });
  return T[REL_KEY[r] ?? ""] ?? r;
}
const relsIn = (list: string[], T: HpT, H: HpName) => list.map((r) => relIn(r, T, H)).join(H.Z.list);
const EL_KEY: Record<string, string> = { 同元素: "el_same", 相容: "el_ok", 相異: "el_diff" };
const SYS_KEY: Record<string, string> = { 八字: "sys_bazi", 紫微: "sys_ziwei", 星盤: "sys_astro" };
const SOUL_KEY: Record<string, string> = { 同宮: "soul_same", 對宮: "soul_opp", 三合: "soul_tri" };

/** a 紫微 palace's main stars for a fact: the stars, or 「no main star」, and 「read from across」 when borrowed */
function zwStars(st: { stars: string[]; borrowed: boolean }, T: HpT, H: HpName): string {
  return `${st.stars.length ? st.stars.map(H.Z.star).join(H.Z.list) : T.f_zwEmpty}${st.borrowed ? H.Z.paren(T.f_zwBorrowed ?? "") : ""}`;
}

/** one fact of the pair (facts.ts FactF) in the page's words; what it does not know stays as facts.ts wrote it */
export function factIn(f: HepanFacts, x: FactF, T: HpT, H: HpName): string {
  return koJosa(factRaw(f, x, T, H), H);
}
function factRaw(f: HepanFacts, x: FactF, T: HpT, H: HpName): string {
  const B = H.B, Z = H.Z, a = f.a, b = f.b;
  const P = x.id.split(".");
  const side = (k: string | undefined) => (k === "A" ? { s: a, o: b, k: "A" as const } : { s: b, o: a, k: "B" as const });
  if (x.id === "bz.dm") return fill(T[`f_dm_${f.bazi.dm}`], { a: B.dm(a.dayMaster), b: B.dm(b.dayMaster), e: B.elOf(a.dmEl) });
  if (x.id === "bz.dayStem") return fill(T.f_dayStem, { a: B.stem(a.dayMaster), b: B.stem(b.dayMaster), r: relsIn(f.bazi.dayStem, T, H) });
  if (x.id === "bz.dayBranch") return fill(T.f_dayBranch, { a: B.branch(a.dayBranch), b: B.branch(b.dayBranch), r: relsIn(f.bazi.dayBranch, T, H) });
  if (x.id === "bz.zodiac") return fill(T.f_zodiac, { a: H.animal(a.yearBranch), b: H.animal(b.yearBranch), r: relsIn(f.bazi.zodiac, T, H) });
  if (P[0] === "bz" && P[1] === "spouse") {
    const { s, o, k } = side(P[2]);
    return fill(T[`f_spouse${k}`], { e: B.elOf(s.spouseStar.element), t: B.ten(s.spouseStar.ten), dm: B.dm(o.dayMaster), t2: B.ten(k === "A" ? f.bazi.tenOfB : f.bazi.tenOfA) });
  }
  if (P[0] === "bz" && P[1] === "feed") {
    const { s, o, k } = side(P[2]);
    const fd = k === "A" ? f.bazi.feedA : f.bazi.feedB;
    return fill(T[`f_feed${k}_${fd === "喜用" ? "fav" : "avoid"}`], { e: B.elOf(o.strongEl), fav: s.favour.map(B.elOf).join(Z.list) });
  }
  if (P[0] === "bz" && P[1] === "palace") {
    const { s, o, k } = side(P[2]);
    const rels = (k === "A" ? f.bazi.palaceA : f.bazi.palaceB).filter((r) => r === "六合" || r === "相沖");
    return fill(T[`f_palace${k}`], { z: `${H.animal(o.yearBranch)}${Z.paren(B.branch(o.yearBranch))}`, d: B.branch(s.dayBranch), r: relsIn(rels, T, H) });
  }
  if (P[0] === "zw" && f.ziwei) {
    if (P[1] === "spouse") {
      const { s, o, k } = side(P[2]);
      const l = k === "A" ? f.ziwei.spouseA : f.ziwei.spouseB;
      if (!s.ziwei || !o.ziwei) return x.text;
      const link = l.link === "同星" ? fill(T.f_zwShared, { s: l.shared.map(Z.star).join(Z.list) }) : fill(T.f_zwGroup, { g: H.group(l.group ?? "") });
      return fill(T[`f_zwSpouse${k}`], { s1: zwStars(s.ziwei.spouse, T, H), s2: zwStars(o.ziwei.soul, T, H), link });
    }
    if (P[1] === "mut") {
      const { k } = side(P[2]);
      const hit = (k === "A" ? f.ziwei.mutInA : f.ziwei.mutInB).find((y) => y.m === P[3]);
      return hit ? fill(T[`f_zwMut${k}`], { m: Z.mutFull(hit.m), s: Z.star(hit.star), p: Z.palaceFull(hit.palace) }) : x.text;
    }
    if (P[1] === "soul" && f.ziwei.soul) {
      // the two 命宮 branches live only in the Chinese line
      const br = /命宮在(.)、\s?TA\s?的命宮在(.)/.exec(x.text);
      return br ? fill(T.f_zwSoul, { a: B.branch(br[1]!), b: B.branch(br[2]!), r: T[SOUL_KEY[f.ziwei.soul]!] ?? "" }) : x.text;
    }
  }
  if (P[0] === "as") {
    if (P[1] === "syn") {
      const s = f.astro.syn.find((y) => y.a === P[2] && y.b === P[3]);
      return s ? fill(T.f_syn, { p: H.planet(s.a), q: H.planet(s.b), asp: H.aspect(s.name), o: s.orb }) : x.text;
    }
    if (P[1] === "sat") {
      const { k } = side(P[2]);
      const s = (k === "A" ? f.astro.satA : f.astro.satB).find((y) => y.b === P[3]);
      return s ? fill(T[`f_sat${k}`], { q: H.planet(s.b), asp: H.aspect(s.name), o: s.orb }) : x.text;
    }
    if (P[1] === "el") {
      const e = f.astro.elements.find((y) => y.point === P[2]);
      return e?.rel && e.a && e.b ? fill(T.f_el, { p: H.planet(e.point), a: H.astroEl(e.a), b: H.astroEl(e.b), r: T[EL_KEY[e.rel]!] ?? "" }) : x.text;
    }
    if (P[1] === "house") {
      const { k } = side(P[2]);
      const h = (k === "A" ? f.astro.inA : f.astro.inB)?.find((y) => y.planet === P[3]);
      return h ? fill(T[`f_house${k}`], { p: H.planet(h.planet), n: h.house, w: T[`house_${h.house}`] ?? "" }) : x.text;
    }
  }
  return x.text;
}

/** a fact as a chip: its system, then the fact (the orb dropped; long ones cut) */
export function chipIn(f: HepanFacts, x: FactF, T: HpT, H: HpName, max = 96): string {
  const t = factIn(f, x, T, H).replace(/\s*[（(]\d+(?:[.,]\d)?\s*°[)）]/, "");
  const cut = [...t].length > max ? `${[...t].slice(0, max - 1).join("")}…` : t;
  return `${T[SYS_KEY[x.sys] ?? ""] ?? x.sys}${H.l === "ja" ? "・" : " · "}${cut}`;
}

const punct = (H: HpName) => (H.l === "ja" ? { sp: "", semi: "；", stop: "。", dot: "・" } : { sp: " ", semi: "; ", stop: ".", dot: " · " });

export interface OverviewIn { zodiac: string; dm: string; astro: string; themes: { key: ThemeKey; title: string; line: string; chips: string[] }[] }
/** the free page's cards (facts.ts overviewOf) in the page's words */
export function overviewIn(f: HepanFacts, T: HpT, H: HpName): OverviewIn {
  const B = H.B, Z = H.Z, { sp, semi, stop } = punct(H);
  const rel = [
    f.bazi.zodiac.length ? fill(T.ov_relZodiac, { r: relsIn(f.bazi.zodiac, T, H) }) : "",
    f.bazi.dayStem.length ? fill(T.ov_relStem, { r: relsIn(f.bazi.dayStem, T, H) }) : "",
    f.bazi.dayBranch.length ? fill(T.ov_relBranch, { r: relsIn(f.bazi.dayBranch, T, H) }) : "",
  ].filter(Boolean);
  const zodiac = `${fill(T.ov_zodiac, { za: H.animal(f.a.yearBranch), pa: B.gz(f.a.dayPillar), zb: H.animal(f.b.yearBranch), pb: B.gz(f.b.dayPillar) })}${sp}${rel.length ? `${rel.join(semi)}${stop}` : T.ov_relNone}`;
  const dm = fill(T[`dm_${f.bazi.dm}`], { ea: B.elOf(f.a.dmEl), eb: B.elOf(f.b.dmEl) });
  const moon = (c: CoreF) => (c.astro.moon ? H.sign(c.astro.moon) : c.astro.moonSplit ? fill(T.ov_or, { a: H.sign(c.astro.moonSplit[0]), b: H.sign(c.astro.moonSplit[1]) }) : "—");
  const el = (p: string) => { const r = f.astro.elements.find((e) => e.point === p)?.rel; return r ? Z.paren(T[EL_KEY[r]!] ?? "") : ""; };
  const top = f.astro.syn.find((s) => ["太陽", "月亮", "金星", "火星"].includes(s.a) && ["太陽", "月亮", "金星", "火星"].includes(s.b));
  const astro = [
    `${fill(T.ov_sun, { a: H.sign(f.a.astro.sun), b: H.sign(f.b.astro.sun) })}${el("太陽")}`,
    `${fill(T.ov_moon, { a: moon(f.a), b: moon(f.b) })}${el("月亮")}`,
    `${fill(T.ov_venus, { a: H.sign(f.a.astro.venus), b: H.sign(f.b.astro.venus) })}${el("金星")}`,
  ].join(semi) + stop + (top ? `${sp}${fill(T.ov_top, { p: H.planet(top.a), q: H.planet(top.b), asp: H.aspect(top.name) })}` : "");
  const byId = new Map(f.facts.map((x) => [x.id, x]));
  const themes = f.themes.slice(0, 2).map((t) => ({
    key: t.key, title: T[`theme_${t.key}`] ?? t.title, line: T[`line_${t.key}_${t.lean}`] ?? "",
    chips: t.facts.map((id) => byId.get(id)).filter((x): x is FactF => !!x).slice(0, 5).map((x) => chipIn(f, x, T, H)),
  }));
  return { zodiac: koJosa(zodiac, H), dm: koJosa(dm, H), astro: koJosa(astro, H), themes };
}

/** the report page's table of the two people (生肖・日柱, 日主・強弱, 喜用, 紫微命宮, 太陽・月亮・上升, 金星・火星) */
export function coreRowsIn(T: HpT, H: HpName): [string, (c: CoreF) => string][] {
  const { dot } = punct(H);
  const moon = (c: CoreF) => (c.astro.moon ? H.sign(c.astro.moon) : c.astro.moonSplit ? `${H.sign(c.astro.moonSplit[0])}／${H.sign(c.astro.moonSplit[1])}`.replace("／", H.l === "ja" ? "／" : " / ") : "—");
  return [
    [T.rowZodiac ?? "", (c) => fill(T.row_zodiacV, { z: H.animal(c.yearBranch), p: H.B.gz(c.dayPillar) })],
    [T.rowDm ?? "", (c) => `${H.B.dm(c.dayMaster)}${dot}${H.B.level(c.strength)}`],
    [T.rowFavour ?? "", (c) => (c.favour.length ? c.favour.map(H.B.elOf).join(H.Z.list) : "—")],
    [T.rowZiwei ?? "", (c) => (c.ziwei ? `${c.ziwei.soul.stars.map(H.Z.star).join(H.Z.list) || "—"}${c.ziwei.soul.borrowed ? H.Z.paren(T.f_zwBorrowed ?? "") : ""}` : "—")],
    [T.rowAstro ?? "", (c) => `${H.sign(c.astro.sun)}${dot}${moon(c)}${dot}${c.astro.asc ? H.sign(c.astro.asc) : "—"}`],
    [T.rowVenus ?? "", (c) => `${H.sign(c.astro.venus)}${dot}${H.sign(c.astro.mars)}`],
  ];
}

/** one of this year's 八字 lines (facts.ts yearFacts writes them in Chinese) in the page's words */
export function yearBaziIn(s: string, T: HpT, H: HpName): string {
  const B = H.B;
  let m: RegExpExecArray | null;
  if ((m = /^流年天干(.)與日干(.)(.+)$/.exec(s))) return fill(T.y_stem, { s: B.stem(m[1]!), d: B.stem(m[2]!), r: relIn(m[3]!, T, H) });
  if ((m = /^流年地支(.)與日支(.)相同（同一個主題被放大）$/.exec(s))) return fill(T.y_branchSame, { b: B.branch(m[1]!), d: B.branch(m[2]!) });
  if ((m = /^流年地支(.)與日支(.)（夫妻宮）(.+)$/.exec(s))) return fill(T.y_branch, { b: B.branch(m[1]!), d: B.branch(m[2]!), r: relIn(m[3]!, T, H) });
  if ((m = /^今年是(.)年，正逢本命年$/.exec(s))) return fill(T.y_benming, { z: H.animal(m[1]!) });
  if ((m = /^流年地支(.)與生肖(.)（(.)）(.+)$/.exec(s))) return fill(T.y_zodiac, { b: B.branch(m[1]!), z: `${H.animal(m[3]!)}${H.Z.paren(B.branch(m[3]!))}`, r: relIn(m[4]!, T, H) });
  if ((m = /^流年天干(.)屬(.)，是喜用五行$/.exec(s))) return fill(T.y_fav, { s: B.stem(m[1]!), e: B.elOf(m[2]!) });
  if ((m = /^流年天干(.)屬(.)，偏忌的一邊$/.exec(s))) return fill(T.y_avoid, { s: B.stem(m[1]!), e: B.elOf(m[2]!) });
  return s;
}

/** a transit date of facts.ts ("11/5", or "2027/1/3" in another year) as the language writes it */
export function hpDateIn(key: string, year: number, locale: string): string {
  const p = key.split("/").map(Number);
  const [y, m, d] = p.length === 3 ? p : [year, p[0]!, p[1]!];
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString(locale, { month: "short", day: "numeric", timeZone: "UTC", ...(y === year ? {} : { year: "numeric" }) });
}

/** this year's chips on the report page (facts.ts YearF), each led by who it is about */
export function yearChipsIn(y: YearF, T: HpT, H: HpName, locale: string): string[] {
  const { dot } = punct(H);
  const you = T.you ?? "", ta = T.taName ?? "";
  const zw = y.ziwei;
  const zwLine = (m: { m: string; star: string; palace: string }) => fill(T.y_zwMut, { m: H.Z.mutFull(m.m), s: H.Z.star(m.star), p: H.Z.palaceFull(m.palace) });
  return [
    ...y.bazi.a.map((x) => `${you}${dot}${yearBaziIn(x, T, H)}`), ...y.bazi.b.map((x) => `${ta}${dot}${yearBaziIn(x, T, H)}`),
    ...(zw ? [...zw.a.mut.filter((m) => ["命宮", "夫妻"].includes(m.palace)).map((m) => `${you}${dot}${zwLine(m)}`), ...zw.b.mut.filter((m) => ["命宮", "夫妻"].includes(m.palace)).map((m) => `${ta}${dot}${zwLine(m)}`)] : []),
    ...y.transits.map((t) => `${t.who === "你" ? you : ta}${dot}${fill(T.y_transit, { p: H.planet(t.planet), q: H.planet(t.point), asp: H.aspect(t.aspect) })}${dot}${t.exact.length ? t.exact.map((d) => hpDateIn(d, y.year, locale)).join(H.Z.list) : `${hpDateIn(t.from, y.year, locale)}–${hpDateIn(t.to, y.year, locale)}`}`),
  ].map((s) => koJosa(s, H));
}
