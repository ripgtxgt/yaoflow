import GEN from "@/data/l10n/zycopy.json";
import { toHant } from "@/lib/hant";
import { fmt, mapTexts, type Foreign, type Generated } from "@/lib/l10n/core";
import { localize } from "@/lib/l10n/server";
import { BAZI_NAMES, bzName } from "./names";
import { baziReportText } from "./page-ui";
import { ZY_COPY, zyKeys, zyTexts, type ZhengyuanInput, type ZyCopy, type ZyKeys } from "./zhengyuan";

/**
 * 10-30 进度表 128 ④ — the 正緣畫像 on a page in another language. The same rules (zhengyuan.ts zyKeys) pick the same
 * traits; the sentences come from the portrait's fixed copy translated (scripts/l10n/translate.ts zycopy →
 * data/l10n/zycopy.json); the chart reasons shown above each part are built from the keys with that language's names
 * (names.ts) and the report page's chip templates. Server only (the 繁體 source is made with OpenCC).
 */
let hant: ZyCopy | null = null;
/** the portrait's fixed sentences in 繁體 — the source the translations are made from */
export function zyCopyHant(): ZyCopy {
  return (hant ??= mapTexts(ZY_COPY, (s) => toHant(s)));
}
export const zyCopyIn = (l: Foreign): ZyCopy => localize(zyCopyHant(), GEN as unknown as Generated, l);

/** the seven trait texts (and their labels) in a language */
export function zyTextsIn(k: ZyKeys, l: Foreign) {
  const c = zyCopyIn(l), N = BAZI_NAMES[l];
  const cjk = l === "ja";
  return { texts: zyTexts(k, c, { dir: (zh) => N.directions[zh as "北"] ?? zh, stop: cjk ? "。" : ".", sep: cjk ? "" : " " }), labels: c.labels };
}
export function zhengyuanIn(input: ZhengyuanInput, l: Foreign) {
  const k = zyKeys(input);
  return { k, ...zyTextsIn(k, l) };
}

/** the chart reasons above each part of the portrait, by trait key */
export function zyChipsIn(k: ZyKeys, l: Foreign): Record<string, string[]> {
  const n = bzName(l), N = n.N, t = baziReportText(l).chip;
  const star = k.shown ? fmt(t.star, { t: n.ten(k.star.ten), e: n.elOf(k.star.element) }) : fmt(t.noStar, { b: n.branch(k.db), e: n.elOf(k.palace.element) });
  const where = [...new Set(k.star.where.map((w) => (w.visible ? fmt(t.stemAt, { p: N.stemOf[w.pillar]! }) : fmt(t.hiddenAt, { p: N.branchOf[w.pillar]! }))))];
  const flowers = k.flowers.map((f) => (f === "孤辰" ? N.guChen : f === "寡宿" ? N.guaSu : n.ss(f) ?? f));
  return {
    qiyun: [star],
    titai: [...where, fmt(t.strength, { s: N.starStrength[k.star.strength] }), ...(k.inPalace ? [t.inPalace] : [])],
    dise: [fmt(t.palace, { b: n.branch(k.db), e: n.elOf(k.palace.element) })],
    shentai: [fmt(t.palace, { b: n.branch(k.db), e: n.elOf(k.palace.element) }), ...(k.palace.relations.length ? k.palace.relations.map((r) => n.rel(r)) : [t.palaceNone])],
    xiangchu: [fmt(t.sits, { t: n.ten(k.palace.ten) })],
    yuanfen: flowers.length ? flowers : [t.noFlower],
    xiangyu: [k.first ? fmt(t.starAt, { p: N.pillars[k.first.pillar]! }) : fmt(t.noStar, { b: n.branch(k.db), e: n.elOf(k.palace.element) }), n.elOf(k.el), fmt(t.dir, { b: n.branch(k.db), d: N.directions[k.dir as "北"] ?? k.dir })],
  };
}
