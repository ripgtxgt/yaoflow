import type { Locale } from "./locales";
import { LOCALES } from "./locales";
import {
  HEPAN_PRICES, NAME_PRICES, ZHENGYUAN_PRICES, NIANSHU_EARLY_PRICES, NIANSHU_PRICES, PACK_PRICES, PACK_SMALL_PRICES, PASS_PRICES, PRICES, TONGKA_PRICES,
  firstMonthMinor, memberDiscountMinor, type Currency,
} from "./money";
import { CARD_NAMES, CARD_PRICES } from "./qian-card-price";
import { priceFor } from "./paywall";
import { SUB_NAMES } from "./subscription";
import { tongkaT } from "./tongka";
import { PACK_NAMES } from "./pack";
import { HP_UI } from "./mingli/hepan/facts";
import { NS_UI } from "./mingli/nianshu/ui";
import { ZY_UI } from "./mingli/zhengyuan-ui";

/**
 * 10-22 进度表 55 — the product catalog: every product the site sells or includes, one row each, with everything the
 * rest of the code used to spell out in its own corner: the Stripe line-item name in nine languages, the price in every
 * currency (with its first-time / early-bird / member variants), what kind of thing it is (a one-off, a subscription, a
 * pass with a number of days, or something only a membership includes), the feature switch it lives behind, the
 * `orders.tier` it is booked under, whether a membership includes it, whether the first-purchase guarantee (24 h one-tap
 * refund) and the 挽回 7 折 apply, and the label the dashboard and the weekly report use.
 *
 * The price NUMBERS stay in lib/money.ts, where their history is written next to them (tax-inclusive v3, each market's
 * price points); this file is the one place that says what they are prices OF. test/catalog.test.ts locks every
 * (product, currency) amount to today's figures — a price change is a deliberate edit of that snapshot.
 *
 * Server only (it reaches lib/subscription → the database); client components get what they need through a page or an
 * API, never by importing this file.
 */
export type { CatalogId } from "./catalog-ids";
import type { CatalogId } from "./catalog-ids";

export type CatalogKind = "oneoff" | "subscription" | "pass" | "included";
export interface PriceOpts { first?: boolean; early?: boolean; member?: boolean; size?: "small" | "large" }

export interface CatalogItem {
  id: CatalogId;
  kind: CatalogKind;
  /** the switch it lives behind (lib/features.ts); none = always on */
  feature?: string;
  /** `orders.tier` / the finance page's bucket; the subscription plans book no orders row */
  tier: string | null;
  /** where a reader buys or uses it (locale-less path) */
  path: string;
  /** a pass: how many days it runs; a card: how many days of access */
  days?: number;
  /** the Stripe line-item name — neutral "digital content" wording in every language */
  name: (locale: Locale) => string;
  /** the short name pages and the dashboard use */
  label: Record<Locale, string>;
  /** the amount in minor units; null = not sold on its own (a membership or pass includes it) */
  price: ((currency: Currency, o?: PriceOpts) => number) | null;
  /** 會員 gets it: included / 8 折 / pays the same as everyone */
  member: "included" | "discount" | "full";
  /** a 通卡 covers it inside its window */
  pass: boolean;
  /** 首次付費保證: the 24-hour one-tap refund of a first purchase (lib/db.ts guaranteeCheck) */
  guarantee: boolean;
  /** 挽回 7 折 (lib/recover-offer.ts) can be offered on it */
  recover: boolean;
  /** not sold to new buyers once the 通卡 model is open (进度表 75 ⑤), or since 进度表 92 split the rights ("split");
   *  existing holders keep what they bought */
  retiredBy?: "tongka" | "split";
  /** the weekly report's / admin's group */
  group: "reading" | "membership" | "pass" | "qian" | "tarot" | "mingli";
}

const L = (zh: string, hant: string, en: string, ja: string, ko: string, fr: string, de: string, es: string, pt: string): Record<Locale, string> =>
  ({ zh, "zh-hant": hant, en, ja, ko, fr, de, es, pt });
const hansOrHant = (hans: string, hant: string, en?: string) => (l: Locale) => (l === "zh" ? hans : l === "zh-hant" ? hant : en ?? hant);
const tongkaLabels = (days: 1 | 7 | 30): Record<Locale, string> => Object.fromEntries(LOCALES.map((l) => [l, tongkaT(l).name[days]])) as Record<Locale, string>;

export const CATALOG: Record<CatalogId, CatalogItem> = {
  deep: {
    id: "deep", kind: "oneoff", tier: "deep", path: "/cast", group: "reading",
    name: (l) => priceFor("deep").name(l),
    label: L("深度解读", "深度解讀", "Full reading", "本格鑑定", "심층 풀이", "Lecture approfondie", "Tiefendeutung", "Lectura profunda", "Leitura completa"),
    price: (c) => PRICES[c].deep, member: "included", pass: true, guarantee: true, recover: true, retiredBy: "tongka",
  },
  one: {
    id: "one", kind: "oneoff", tier: "one", path: "/cast", group: "reading",
    name: (l) => priceFor("one").name(l),
    label: L("轻解读", "輕解讀", "Light reading", "ライト鑑定", "간단 풀이", "Lecture express", "Kurzdeutung", "Lectura breve", "Leitura breve"),
    price: (c) => PRICES[c].one, member: "included", pass: true, guarantee: true, recover: false, retiredBy: "tongka",
  },
  month: {
    id: "month", kind: "subscription", tier: null, path: "/account", group: "membership",
    name: (l) => SUB_NAMES.month[l],
    label: L("月度会员", "月度會員", "Monthly membership", "月額メンバーシップ", "월간 멤버십", "Abonnement mensuel", "Monatsmitgliedschaft", "Membresía mensual", "Assinatura mensal"),
    // 10-10 首月同价: a first-time member's first month costs the one-off month; then the monthly fee
    price: (c, o) => (o?.first ? firstMonthMinor(c) : PRICES[c].month), member: "included", pass: false, guarantee: false, recover: false,
  },
  year: {
    id: "year", kind: "subscription", tier: null, path: "/account", group: "membership",
    name: (l) => SUB_NAMES.year[l],
    label: L("年度会员", "年度會員", "Yearly membership", "年額メンバーシップ", "연간 멤버십", "Abonnement annuel", "Jahresmitgliedschaft", "Membresía anual", "Assinatura anual"),
    price: (c) => PRICES[c].year, member: "included", pass: false, guarantee: false, recover: false,
  },
  pass_1: {
    id: "pass_1", kind: "pass", feature: "tongka", tier: "pass_1d", path: "/cast", days: 1, group: "pass",
    name: (l) => tongkaT(l).product[1], label: tongkaLabels(1),
    // the account's first 1-day pass costs what the single light reading used to, so the entry price does not move
    // 10-22 进度表 78 ② (Neil: 「按照你的来」): the one product under the first-purchase guarantee (lib/db.ts GUARANTEE_TIERS)
    price: (c, o) => (o?.first ? PRICES[c].one : TONGKA_PRICES[1][c]), member: "included", pass: true, guarantee: true, recover: false,
  },
  pass_7: {
    id: "pass_7", kind: "pass", feature: "tongka", tier: "pass_7d", path: "/cast", days: 7, group: "pass",
    name: (l) => tongkaT(l).product[7], label: tongkaLabels(7),
    price: (c) => TONGKA_PRICES[7][c], member: "included", pass: true, guarantee: false, recover: false,
  },
  pass_30: {
    id: "pass_30", kind: "pass", tier: "pass_30d", path: "/cast", days: 30, group: "pass",
    // before the 通卡 switch this is the 單月會員 (09-26) — same row, same price, the old name
    name: (l) => tongkaT(l).product[30], label: tongkaLabels(30),
    price: (c) => PASS_PRICES[c], member: "included", pass: true, guarantee: false, recover: false,
  },
  pack_l: {
    id: "pack_l", kind: "oneoff", tier: "pack", path: "/account", group: "membership",
    name: (l) => (PACK_NAMES[l] ?? PACK_NAMES.en!).replace("{n}", "15"),
    label: L("会员增购 15 份", "會員增購 15 份", "Member add-on, 15 readings", "会員追加 15 回", "회원 추가 15회", "Supplément membre, 15 lectures", "Mitglieder-Zusatz, 15 Deutungen", "Extra para miembros, 15 lecturas", "Adicional de membro, 15 leituras"),
    price: (c) => PACK_PRICES[c], member: "full", pass: false, guarantee: false, recover: false, retiredBy: "tongka",
  },
  pack_s: {
    id: "pack_s", kind: "oneoff", tier: "pack", path: "/account", group: "membership",
    name: (l) => (PACK_NAMES[l] ?? PACK_NAMES.en!).replace("{n}", "5"),
    label: L("会员增购 5 份", "會員增購 5 份", "Member add-on, 5 readings", "会員追加 5 回", "회원 추가 5회", "Supplément membre, 5 lectures", "Mitglieder-Zusatz, 5 Deutungen", "Extra para miembros, 5 lecturas", "Adicional de membro, 5 leituras"),
    price: (c) => PACK_SMALL_PRICES[c], member: "full", pass: false, guarantee: false, recover: false, retiredBy: "tongka",
  },
  qian_personal: {
    id: "qian_personal", kind: "oneoff", tier: "qian", path: "/jieqian", group: "qian",
    name: hansOrHant("YaoFlow 解签：这支签放在你这件事上，含一次追问（数字内容）", "YaoFlow 解籤：這支籤放在你這件事上，含一次追問（數位內容）"),
    label: L("解签个人解读", "解籤個人解讀", "Lot reading", "おみくじ個人鑑定", "제비 개인 풀이", "Lecture de la baguette", "Losdeutung", "Lectura del lote", "Leitura do bilhete"),
    price: (c) => PRICES[c].one, member: "included", pass: true, guarantee: false, recover: false,
  },
  qian_card: {
    id: "qian_card", kind: "oneoff", feature: "today-qian", tier: "qiancard", path: "/today-qian", days: 30, group: "qian",
    name: (l) => CARD_NAMES[l] ?? CARD_NAMES.en!,
    label: L("今日一签 · 签卡 30 天", "今日一籤 · 籤卡 30 天", "Daily lot card, 30 days", "今日のおみくじ・30日カード", "오늘의 제비 · 30일 카드", "Carte du tirage quotidien, 30 jours", "Tageslos-Karte, 30 Tage", "Tarjeta del lote diario, 30 días", "Cartão do bilhete diário, 30 dias"),
    price: (c) => CARD_PRICES[c], member: "included", pass: false, guarantee: false, recover: false, retiredBy: "split",
  },
  tarot: {
    id: "tarot", kind: "oneoff", feature: "tarot", tier: "tarot", path: "/tarot", group: "tarot",
    name: hansOrHant("YaoFlow 塔罗：这几张牌放在你这件事上，含一次追问（数字内容）", "YaoFlow 塔羅：這幾張牌放在你這件事上，含一次追問（數位內容）"),
    label: L("塔罗解读", "塔羅解讀", "Tarot reading", "タロット鑑定", "타로 풀이", "Lecture de tarot", "Tarot-Deutung", "Lectura de tarot", "Leitura de tarô"),
    price: (c) => PRICES[c].one, member: "included", pass: true, guarantee: false, recover: false,
  },
  bazi_deep: {
    id: "bazi_deep", kind: "included", feature: "bazi-paid", tier: null, path: "/bazi", group: "mingli",
    name: hansOrHant("YaoFlow 八字深度报告（数字内容）", "YaoFlow 八字深度報告（數位內容）"),
    label: L("八字深度报告", "八字深度報告", "Bazi deep report", "四柱推命レポート", "사주 심층 리포트", "Rapport Bazi", "Bazi-Bericht", "Informe Bazi", "Relatório Bazi"),
    price: null, member: "included", pass: true, guarantee: false, recover: false,
  },
  ziwei_deep: {
    id: "ziwei_deep", kind: "included", feature: "ziwei-paid", tier: null, path: "/ziwei", group: "mingli",
    name: hansOrHant("YaoFlow 紫微深度报告（数字内容）", "YaoFlow 紫微深度報告（數位內容）"),
    label: L("紫微深度报告", "紫微深度報告", "Zi Wei deep report", "紫微斗数レポート", "자미두수 심층 리포트", "Rapport Zi Wei", "Zi-Wei-Bericht", "Informe Zi Wei", "Relatório Zi Wei"),
    price: null, member: "included", pass: true, guarantee: false, recover: false,
  },
  astro_deep: {
    id: "astro_deep", kind: "included", feature: "astro-paid", tier: null, path: "/xingpan", group: "mingli",
    name: hansOrHant("YaoFlow 星盘深度报告（数字内容）", "YaoFlow 星盤深度報告（數位內容）"),
    label: L("星盘深度报告", "星盤深度報告", "Natal chart deep report", "ホロスコープレポート", "출생 차트 심층 리포트", "Rapport de thème natal", "Geburtshoroskop-Bericht", "Informe de carta natal", "Relatório do mapa natal"),
    price: null, member: "included", pass: true, guarantee: false, recover: false,
  },
  hepan: {
    id: "hepan", kind: "oneoff", feature: "hepan", tier: "hepan", path: "/hepan", group: "mingli",
    name: hansOrHant(HP_UI.productNameHans, HP_UI.productName),
    // 10-30 进度表 128 ④: the names the 合盤 pages use in each language (data/l10n/hepan.json ui.kindLabel)
    label: L("合盘报告", "合盤報告", "Compatibility report", "相性鑑定レポート", "궁합 리포트", "Rapport de compatibilité", "Bericht zum Partnerschaftsvergleich", "Informe de compatibilidad", "Relatório de compatibilidade"),
    // 10-22 會員 8 折 (Neil: 只給會員)
    price: (c, o) => (o?.member ? memberDiscountMinor(c, HEPAN_PRICES[c]) : HEPAN_PRICES[c]), member: "discount", pass: false, guarantee: false, recover: false,
  },
  zhengyuan: {
    id: "zhengyuan", kind: "oneoff", feature: "zhengyuan", tier: "bazi_love", path: "/zhengyuan", group: "mingli",
    name: (l) => (l === "zh" ? ZY_UI.productNameHans : ZY_UI.productName),
    label: L("正缘画像", "正緣畫像", "Partner portrait", "運命の相手の肖像", "인연 초상", "Portrait de l'âme sœur", "Partnerporträt", "Retrato de pareja", "Retrato do par"),
    // 10-26 (Neil: 跟合盤和年書一樣的模式): one-off, 會員 8 折, a 通卡 does not cover it
    price: (c, o) => (o?.member ? memberDiscountMinor(c, ZHENGYUAN_PRICES[c]) : ZHENGYUAN_PRICES[c]), member: "discount", pass: false, guarantee: false, recover: false,
  },
  // 10-29 进度表 122 姓名學: one-off for everyone, 會員 8 折, a 通卡 does not cover it
  name_baby: {
    id: "name_baby", kind: "oneoff", feature: "name-paid", tier: "name_baby", path: "/name", group: "mingli",
    name: hansOrHant("YaoFlow 宝宝取名参考（数字内容）", "YaoFlow 寶寶取名參考（數位內容）"),
    label: L("宝宝取名参考", "寶寶取名參考", "Baby name ideas", "赤ちゃんの名付け参考", "아기 이름 참고", "Idées de prénom", "Namensideen fürs Baby", "Ideas de nombre", "Ideias de nome"),
    price: (c, o) => (o?.member ? memberDiscountMinor(c, NAME_PRICES[c]) : NAME_PRICES[c]), member: "discount", pass: false, guarantee: false, recover: false,
  },
  name_rename: {
    id: "name_rename", kind: "oneoff", feature: "name-paid", tier: "name_rename", path: "/name", group: "mingli",
    name: hansOrHant("YaoFlow 改名参考（数字内容）", "YaoFlow 改名參考（數位內容）"),
    label: L("改名参考", "改名參考", "Rename ideas", "改名の参考", "개명 참고", "Idées de nouveau nom", "Ideen zur Namensänderung", "Ideas para cambiar de nombre", "Ideias para mudar de nome"),
    price: (c, o) => (o?.member ? memberDiscountMinor(c, NAME_PRICES[c]) : NAME_PRICES[c]), member: "discount", pass: false, guarantee: false, recover: false,
  },
  nianshu: {
    id: "nianshu", kind: "oneoff", feature: "nianshu", tier: "nianshu", path: "/nianshu", group: "mingli",
    name: (l) => (l === "zh" ? NS_UI.productNameHans : NS_UI.productName),
    label: L("三合一年书", "三合一年書", "Year Book", "年運レポート", "연간 운세 책", "Livre de l'année", "Jahresbuch", "Libro del año", "Livro do ano"),
    // early bird 11/1–1/31 (lib/mingli/nianshu/sale.ts); a member pays the lower of the two
    price: (c, o) => { const base = o?.early ? NIANSHU_EARLY_PRICES[c] : NIANSHU_PRICES[c]; return o?.member ? Math.min(base, memberDiscountMinor(c, NIANSHU_PRICES[c])) : base; },
    member: "discount", pass: false, guarantee: false, recover: false,
  },
};

export const CATALOG_IDS = Object.keys(CATALOG) as CatalogId[];
export const isCatalogId = (x: unknown): x is CatalogId => typeof x === "string" && x in CATALOG;
export const catalogItem = (id: CatalogId): CatalogItem => CATALOG[id];

/** the amount in minor units, or null when the product is not sold on its own */
export function catalogPrice(id: CatalogId, currency: Currency, o?: PriceOpts): number | null {
  const p = CATALOG[id].price;
  return p ? p(currency, o) : null;
}

/** the catalog row an `orders.tier` belongs to (the finance page, the weekly report) */
export function catalogByTier(tier: string): CatalogItem | null {
  return CATALOG_IDS.map((id) => CATALOG[id]).find((p) => p.tier === tier) ?? null;
}

/** the dashboard's short label for an `orders.tier` (简体, the admin's language); an unknown tier is shown as it is */
const TIER_ZH: Record<string, string> = { hepan_pair: "合盘（两人）", bazi_love: "正缘画像", bazi_year: "八字流年", ziwei_year: "紫微年书", astro_year: "星盘年报", bazi_deep: "八字报告", ziwei_deep: "紫微报告", astro_deep: "星盘报告", name_baby: "宝宝取名参考", name_rename: "改名参考", member: "会员" };
export const tierLabelZh = (tier: string | null | undefined): string => (tier ? catalogByTier(tier)?.label.zh ?? TIER_ZH[tier] ?? tier : "—");

/** products a new buyer can still be sold under the 通卡 model (进度表 75 ⑤); the 籤卡 no longer at all (进度表 92) */
export const sellable = (p: CatalogItem, tongkaLive: boolean): boolean => !!p.price && p.retiredBy !== "split" && !(tongkaLive && p.retiredBy === "tongka");
