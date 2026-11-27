import { generates, hexagramByNumber, KINGWEN, overcomes, TRIGRAMS, trigramFromBits, type Bit, type Phase, type TrigramKey } from "@yaoflow/engine";
import TRIGRAM_PLACES from "@/data/xunwu-places.json";
import { hexName } from "./names";
import {
  actionsIn, DIRS, TIER_OF, TRIGRAM_ZH, xwText,
  type XwAgo, type XwBlock, type XwCat, type XwPlace, type XwRegion, type XwRel, type XwText, type XwTier,
} from "./xunwu-text";
import { fmt } from "./l10n/core";
import type { Locale } from "./locales";

/**
 * 10-29 进度表 127 尋物 (Neil: 「掷骰子找东西，就是大概方向，大概的地方」): one method only, 梅花易數 — three dice in the
 * browser, their total the 「數」; the server works the rest out of the tables below, never a model.
 *
 *   上卦 = 總和 ÷ 8 的餘數（整除取 8）     卷一〈聲音占例〉「數得幾數，起作上卦，加時數配作下卦」
 *   下卦 = (總和 + 時支數) ÷ 8 的餘數        卷一〈物數占例〉「以卦數並時數總除六取動爻」
 *   動爻 = (總和 + 時支數) ÷ 6 的餘數（整除取 6）
 *   卦數 乾1 兌2 離3 震4 巽5 坎6 艮7 坤8（卷一〈周易卦數〉）；時支數 子1 … 亥12, the reader's own clock, 23:00 opens 子時.
 *   動爻 in the upper trigram → the upper is 用 (the thing), the lower 體 (you); in the lower, the other way round.
 *   找回 by 卷二〈失物占第十五〉: 用生體「物易尋」、比和「物不失」→ easy · 體克用「可尋，遲得」→ medium ·
 *   體生用「物難見」、用克體「不可尋」→ hard (said as 「不容易自己出現」, never 「找不回來」).
 *   「又以變卦為失物所在」: the 用 trigram with its moving line flipped gives the direction and the kind of place
 *   (data/xunwu-places.json); 卦氣旺衰 are not counted in this first version.
 */
export type { XwAgo, XwCat, XwPlace, XwRegion, XwRel, XwTier, XwBlock } from "./xunwu-text";

/** index n − 1 → the trigram of 卦數 n */
export const TRIGRAM_BY_NUM: readonly TrigramKey[] = ["qian", "dui", "li", "zhen", "xun", "kan", "gen", "kun"];
/** 卷一〈八宮所屬五行〉 */
export const TRIGRAM_EL: Readonly<Record<TrigramKey, Phase>> = { qian: "metal", dui: "metal", li: "fire", zhen: "wood", xun: "wood", kan: "water", gen: "earth", kun: "earth" };

/** the reader's clock hour (0–23) → 時支數: 子 1 (23:00–00:59) … 亥 12 */
export function hourBranch(h: number): number {
  return Math.floor((((Math.trunc(h) % 24) + 25) % 24) / 2) + 1;
}

const rem = (n: number, m: number) => { const r = n % m; return r === 0 ? m : r; };

export interface Meihua {
  sum: number; hour: number;
  upper: TrigramKey; lower: TrigramKey; moving: number;
  yongAt: "upper" | "lower"; yong: TrigramKey; ti: TrigramKey;
  rel: XwRel; tier: XwTier;
  /** the 用 trigram after its moving line turns — where the thing is (「又以變卦為失物所在」) */
  toward: TrigramKey;
  hex: number; changed: number;
}

/** 體用 by the elements: the 體 is you, the 用 the thing */
export function relOf(ti: Phase, yong: Phase): XwRel {
  if (ti === yong) return "same";
  if (generates(yong, ti)) return "yongShengTi";
  if (overcomes(ti, yong)) return "tiKeYong";
  if (generates(ti, yong)) return "tiShengYong";
  return "yongKeTi";
}

export function meihua(sum: number, hour: number): Meihua {
  if (!Number.isInteger(sum) || sum < 3 || sum > 18) throw new RangeError(`sum ${sum}`);
  if (!Number.isInteger(hour) || hour < 1 || hour > 12) throw new RangeError(`hour ${hour}`);
  const upper = TRIGRAM_BY_NUM[rem(sum, 8) - 1]!;
  const lower = TRIGRAM_BY_NUM[rem(sum + hour, 8) - 1]!;
  const moving = rem(sum + hour, 6);
  const yongAt = moving >= 4 ? "upper" : "lower";
  const yong = yongAt === "upper" ? upper : lower;
  const ti = yongAt === "upper" ? lower : upper;
  const rel = relOf(TRIGRAM_EL[ti], TRIGRAM_EL[yong]);
  const bits = [...TRIGRAMS[yong].lines] as [Bit, Bit, Bit];
  const i = (moving - 1) % 3;
  bits[i] = bits[i] === 1 ? 0 : 1;
  const toward = trigramFromBits(bits).key;
  const cu = yongAt === "upper" ? toward : upper, cl = yongAt === "lower" ? toward : lower;
  return { sum, hour, upper, lower, moving, yongAt, yong, ti, rel, tier: TIER_OF[rel], toward, hex: KINGWEN[lower][upper], changed: KINGWEN[cl][cu] };
}

/** the hexagram page's slug (lib/gua.ts guaSlug — the same rule, without loading the 64 commentaries) */
export function guaPath(n: number): string {
  const h = hexagramByNumber(n);
  return `${n}-${h.pinyin.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, "-")}`;
}

type Place = { dir: string; orig: string; home: string; out: string };
export const placeOf = (t: TrigramKey): Place => (TRIGRAM_PLACES as unknown as Record<TrigramKey, Place>)[t];

/** the 「為什麼」 line under the band: which half is which, their elements, and the 體用 it makes (in the words `t` gives) */
export function whyLine(m: Meihua, t: XwText = xwText("zh-hant")): string {
  const tr = t.trigram as Record<TrigramKey, string>, el = t.element as Record<Phase, string>;
  const v = {
    U: tr[m.upper], L: tr[m.lower], Y: tr[m.yong], T: tr[m.ti],
    ey: el[TRIGRAM_EL[m.yong]], et: el[TRIGRAM_EL[m.ti]], name: t.rel[m.rel].name, move: t.move[m.moving] ?? "",
  };
  const head = fmt(m.upper === m.lower ? t.why.headSame : t.why.head, v);
  // a space between the two sentences outside Chinese and Japanese
  const sep = /[。！？]$/.test(head) ? "" : " ";
  return head + sep + fmt(t.why[m.rel], v);
}

export interface XwCard {
  token: string; same: boolean; at: number;
  cat: XwCat; place: XwPlace; ago: XwAgo;
  /** the category's name — the page shows the reader's own name for it instead, when they gave one */
  title: string;
  dice: [number, number, number]; sum: number; hourName: string;
  tier: XwTier; tierLabel: string; tierLine: string; relName: string; why: string;
  dir: string; dirIdx: number; toward: string;
  orig: string; places: { label: string; text: string }[];
  urgent: XwBlock | null; actions: XwBlock;
  hex: { n: number; name: string; href: string }; changed: { n: number; name: string; href: string }; move: string;
  question: string; castHref: string;
}

export interface CardInput { token: string; same: boolean; at: number; cat: XwCat; place: XwPlace; ago: XwAgo; dice: [number, number, number]; hour: number; locale: Locale; region: XwRegion }

/** the question carried into 六爻, in the reader's language (「我的{類別}找得回來嗎？在哪裡？（②，③）」) — never the reader's own name for it */
export function castQuestionIn(t: XwText, cat: XwCat, place: XwPlace, ago: XwAgo): string {
  return fmt(t.castQ, { thing: t.catInQ[cat], place: t.placeInQ[place], ago: t.agoInQ[ago] });
}

/** everything the result card shows, in the reader's language — built from the tables, the same way every time */
export function buildCard(i: CardInput): XwCard {
  const t = xwText(i.locale);
  const sum = i.dice[0] + i.dice[1] + i.dice[2];
  const m = meihua(sum, i.hour);
  const p = placeOf(m.toward);
  const lp = t.places[m.toward]!;
  const places = i.place === "home" ? [{ label: t.ui.homeLabel, text: lp.home }]
    : i.place === "out" ? [{ label: t.ui.outLabel, text: lp.out }]
    : [{ label: t.ui.homeLabel, text: lp.home }, { label: t.ui.outLabel, text: lp.out }];
  const a = actionsIn(i.cat, i.locale, i.region);
  const hx = hexagramByNumber(m.hex), ch = hexagramByNumber(m.changed);
  const question = castQuestionIn(t, i.cat, i.place, i.ago);
  const dirIdx = DIRS.indexOf(p.dir as (typeof DIRS)[number]);
  const q = new URLSearchParams({ q: question, xw: i.token, c: "xunwu" }).toString();
  return {
    token: i.token, same: i.same, at: i.at, cat: i.cat, place: i.place, ago: i.ago,
    title: t.cat[i.cat], hourName: t.hour[i.hour - 1]!, tierLabel: t.tier[m.tier], tierLine: t.rel[m.rel].line, relName: t.rel[m.rel].name,
    why: whyLine(m, t), dir: t.dirs[dirIdx] ?? lp.dir, toward: (t.trigram as Record<TrigramKey, string>)[m.toward] ?? TRIGRAM_ZH[m.toward], orig: lp.orig, places,
    urgent: a.urgent, actions: a.rest, move: t.move[m.moving] ?? "", question,
    dice: i.dice, sum, tier: m.tier, dirIdx,
    hex: { n: m.hex, name: hexName(hx, i.locale), href: `/${i.locale}/gua/${guaPath(m.hex)}` },
    changed: { n: m.changed, name: hexName(ch, i.locale), href: `/${i.locale}/gua/${guaPath(m.changed)}` },
    castHref: `/${i.locale}/cast?${q}`,
  };
}

/** 「還沒」 on the revisit card: the steps again and the way into 六爻 (no 梅花 card) */
export function backHelp(i: { token: string; cat: XwCat; place: XwPlace; ago: XwAgo; locale: Locale; region: XwRegion }) {
  const t = xwText(i.locale);
  const a = actionsIn(i.cat, i.locale, i.region);
  const question = castQuestionIn(t, i.cat, i.place, i.ago);
  return { blocks: [...(a.urgent ? [a.urgent] : []), a.rest], castHref: `/${i.locale}/cast?${new URLSearchParams({ q: question, xw: i.token, c: "xunwu" }).toString()}` };
}
