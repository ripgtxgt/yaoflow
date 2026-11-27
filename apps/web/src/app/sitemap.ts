import { featureOn } from "@/lib/features";
import { SERVICES, serviceLocales, serviceOpenIn } from "@/lib/services";
import { TAROT_CARDS, tarotSlug } from "@/lib/tarot";
import { marketSet, setCount } from "@/lib/qian-foreign";
import { FOREIGN, type Foreign } from "@/lib/l10n/core";
import { huangliSitemap } from "@/lib/mingli/calendar/page-bits";
import { termPageNames } from "@/lib/mingli/calendar/content";
import { MATTER_LIST } from "@/lib/mingli/calendar/zeri";
import { PURPOSE_SLUGS } from "@/lib/mingli/calendar/zeri-purpose";
import { ZODIACS } from "@/lib/mingli/taisui";
import { DREAMS } from "@/lib/dream";
import { SIGNS as YUNSHI_SIGNS } from "@/lib/mingli/yunshi/zodiac";
import { STAR_SIGNS } from "@/lib/mingli/yunshi/horoscope";
import { PILLARS as BAZI_PILLARS, pillarSlug } from "@/lib/mingli/bazi/content";
import { PALACE_SLUG, STAR_SLUG } from "@/lib/mingli/ziwei/content";
import { PLANET_SLUG, SIGN_SLUG } from "@/lib/mingli/astro/content";
import type { MetadataRoute } from "next";
import { GUA, guaLocales, guaSlug } from "@/lib/gua";
import { transitionPath } from "@/lib/transitions";
import { allLiveCases, caseLatestByHex, countCases } from "@/lib/db";
import { sceneLocales, scenePath, scenesFor } from "@/lib/scenes";
import { casePath } from "@/lib/cases";
import { caseIndexable } from "@/lib/case-seo";
import { REFERENCE_DATE, REFERENCE_PATHS } from "@/lib/reference";
import { HOW_TO_ASK_DATE, HOW_TO_ASK_LOCALES } from "@/lib/how-to-ask";
import { asLocale } from "@/lib/locales";
import { LOVE_LANDING_DATE, LOVE_LANDINGS, loveLandingPath } from "@/lib/love-landing";
import { allQian, JIEQIAN_PATH, QIAN_DATE, qianIndexPath, qianPath, QIAN_SETS } from "@/lib/qian";

/** Public cases come and go at runtime: rebuild the map hourly rather than at deploy time. */
export const revalidate = 3600;
import { LOCALES } from "@/lib/locales";
import { isEnglishFallback } from "@/lib/content";
import { LEGAL_UPDATED, PRIVACY, TERMS } from "@/lib/legal";
import { BMG_TYPES } from "@/lib/bmg";

/**
 * lastmod must mean something: Google says a date that changes on every
 * fetch gets ignored. Pages whose text ships with the code carry the build
 * time; the 64 reference pages carry the day their content was generated
 * (they are frozen data files — bump this when they are regenerated); the
 * legal pages carry LEGAL_UPDATED.
 */
// 11-05 T-020 (推广: Google 曝光 11-01 起几乎归零): this used to be the build's own time, so every deploy (several a day)
// told Google that ~10,000 pages had just changed. It is now the day those pages' content last changed — the 128 nine-
// language wave (10-30). Bump it, or give a section its own date, only when that content really changes.
const BUILT = new Date("2026-10-30");
/** 11-05 进度表 136/139: 本命卦 pages */
const BMG_DATE = new Date("2026-11-05");
// 09-23: every 64 page gained a real cast (卦例) — the date must move, or Google has no reason to come back
const GUA_CONTENT_DATE = new Date("2026-09-23");
/** 10-28 进度表 117 ④: the Chinese 卦 pages got one heading, love and work line per 爻 */
const GUA_ZH_DATE = new Date("2026-10-28");
const TRANSITIONS_DATE = new Date("2026-09-10");

/**
 * 09-19 (Neil, from the Search Console check): a new domain with next to no
 * links got a 4,819-entry sitemap, 4,096 of them the English 本卦→之卦 pages —
 * Google read the whole file and crawled none of it, the 640 core pages
 * queued behind them. The transition layer stays built, linked and served;
 * it just waits its turn in the sitemap until the core pages are indexed.
 * SITEMAP_TRANSITIONS=1 puts the 64 + 4,096 entries back.
 */
const includeTransitions = () => process.env.SITEMAP_TRANSITIONS === "1";

/**
 * 09-23 (推广总方案 §14 ⑯): 9 homes, /today and /accuracy, the 64 pages and
 * their index in the four languages we actually market in, and the scene
 * pages — about 300. SITEMAP_FULL=1 lists everything again once those are in.
 */
const fullSitemap = () => process.env.SITEMAP_FULL === "1";

/**
 * 11-06 (Neil：「好，可以」, T-020): in these six languages the translated libraries (200 dreams, 紫微 star × palace,
 * 星盤 planet × sign/house, rising signs) drew no search visitors in 14 days while taking a share of Google's crawl.
 * Their index pages stay listed; the pages themselves stay open and indexable, reached through links. Look again ~12-04.
 */
const THIN_LIBRARY: ReadonlySet<string> = new Set(["ja", "ko", "pt", "fr", "es", "de"]);

export default function sitemap(): MetadataRoute.Sitemap {
  const site = process.env.SITE_URL ?? "https://yaoflow.com";
  // 大众一卦 (09-21, A2): the day's three public charts — real content that
  // changes daily, and the one page a stranger who has not cast can read
  const paths = ["", "/cast", "/about", "/today"]; // /accuracy 09-26 撤下
  const core = LOCALES.flatMap((l) =>
    paths.map((p) => ({
      url: `${site}/${l}${p}`,
      lastModified: BUILT,
      changeFrequency: p === "/today" ? ("daily" as const) : ("weekly" as const),
      priority: p === "" ? 1 : p === "/today" ? 0.7 : 0.6,
    })),
  );
  // Legal pages: only the languages that have their own text. A locale that
  // reads the English page canonicalises to /en/…, and a sitemap should list
  // canonical URLs only — listing the fallbacks is what produced the
  // "duplicate, no user-selected canonical" report.
  const legal = LOCALES.flatMap((l) =>
    ([["/terms", TERMS], ["/privacy", PRIVACY]] as const)
      .filter(([, doc]) => !isEnglishFallback(doc[0]!, l))
      .map(([p]) => ({ url: `${site}/${l}${p}`, lastModified: new Date(LEGAL_UPDATED), changeFrequency: "monthly" as const, priority: 0.3 })),
  );
  // The 64 reference pages: stable content, the long-tail entry doors.
  // 10-09 (Neil, Search Console: all 256 of them 「已发现 - 尚未编入索引」, never fetched): a page whose list of
  // reader cases grew did change — lastmod is the newest case on it, so Google has a true reason to come.
  const gua = guaLocales().flatMap((l) => {
    let latest = new Map<number, number>();
    try { latest = caseLatestByHex(l); } catch { /* no database at build time: the content date stands */ }
    return GUA.map((h) => ({
      url: `${site}/${l}/gua/${guaSlug(h)}`,
      lastModified: new Date(Math.max((l === "zh" || l === "zh-hant" ? GUA_ZH_DATE : GUA_CONTENT_DATE).getTime(), latest.get(h.number) ?? 0)),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    }));
  });
  const guaIndex = guaLocales().map((l) => ({
    url: `${site}/${l}/gua`, lastModified: BUILT, changeFrequency: "weekly" as const, priority: 0.8,
  }));
  // 本卦→之卦: 64 index pages + 4,096 change pages, English first (§14 ⑨).
  const toIndex = GUA.map((a) => ({
    url: `${site}/en/gua/${guaSlug(a)}/to`, lastModified: TRANSITIONS_DATE, changeFrequency: "monthly" as const, priority: 0.5,
  }));
  const transitions = GUA.flatMap((a) => GUA.map((b) => ({
    url: `${site}${transitionPath("en", a, b)}`, lastModified: TRANSITIONS_DATE, changeFrequency: "yearly" as const, priority: 0.4,
  })));
  // 公开卦例 (§14 ⑬): the index in every language, and each live case under the language it was read in.
  // 10-16 进度表 61: only the languages with at least 5 cases (the thin ones say noindex — app/[locale]/cases)
  const casesIndex = LOCALES.filter((l) => { try { return countCases(l) >= 5; } catch { return false; } })
    .map((l) => ({ url: `${site}/${l}/cases`, lastModified: BUILT, changeFrequency: "daily" as const, priority: 0.6 }));
  let cases: MetadataRoute.Sitemap = [];
  try {
    // 09-28 (进度表 14): only cases worth indexing (the page itself says noindex on thin ones); a withdrawn case is
    // gone from here on the next hourly rebuild and its page already 404s
    cases = allLiveCases().filter((c) => caseIndexable({ fields_json: c.fields_json, locale: c.locale }, c.locale)).map((c) => ({
      url: `${site}${casePath(asLocale(c.locale), c.public_id)}`, lastModified: new Date(c.published_at), changeFrequency: "monthly" as const, priority: 0.6,
    }));
  } catch { /* no database at build time is fine: the hourly refresh picks them up */ }
  // 场景页 (§14 ⑭): the index and each page, in the languages that have them.
  const SCENES_DATE = new Date("2026-09-10");
  const scenes = sceneLocales().flatMap((l) => [
    { url: `${site}/${l}/for`, lastModified: SCENES_DATE, changeFrequency: "weekly" as const, priority: 0.7 },
    ...scenesFor(l).map((sc) => ({ url: `${site}${scenePath(l, sc.slug)}`, lastModified: SCENES_DATE, changeFrequency: "monthly" as const, priority: 0.7 })),
  ]);
  // 09-28 (进度表 12): the three reference pages, every language — the pages other people's articles can point at
  const reference = [
    ...LOCALES.flatMap((l) => Object.values(REFERENCE_PATHS).map((p) => ({ url: `${site}/${l}/${p}`, lastModified: REFERENCE_DATE, changeFrequency: "monthly" as const, priority: 0.7 }))),
    // 09-30 (进度表 23): 「怎麼問、怎麼看」 — only the languages it is actually written in (the others read English)
    ...HOW_TO_ASK_LOCALES.map((l) => ({ url: `${site}/${l}/how-to-ask`, lastModified: HOW_TO_ASK_DATE, changeFrequency: "monthly" as const, priority: 0.7 })),
    // 10-12 (进度表 §四 37): the four 繁體 love landing pages
    ...LOVE_LANDINGS.map((x) => ({ url: `${site}${loveLandingPath(x.slug)}`, lastModified: LOVE_LANDING_DATE, changeFrequency: "weekly" as const, priority: 0.8 })),
    // 10-12 (进度表 §四 36): 解籤 — the entry and the 60 lot pages
    { url: `${site}${JIEQIAN_PATH}`, lastModified: QIAN_DATE, changeFrequency: "weekly" as const, priority: 0.8 },
    ...allQian().map((e) => ({ url: `${site}${qianPath(e.num)}`, lastModified: QIAN_DATE, changeFrequency: "monthly" as const, priority: 0.7 })),
    // 10-12 籤系: each set's index page, and the 100 黃大仙靈籤 lot pages
    ...QIAN_SETS.map((s) => ({ url: `${site}${qianIndexPath(s.id)}`, lastModified: QIAN_DATE, changeFrequency: "monthly" as const, priority: 0.7 })),
    ...QIAN_SETS.filter((s) => s.id !== "liushi-jiazi").flatMap((s) => allQian(s.id)).map((e) => ({ url: `${site}${qianPath(e.num, e.set)}`, lastModified: QIAN_DATE, changeFrequency: "monthly" as const, priority: 0.7 })),
    // 10-14 (进度表 §四 45): 應驗紀錄 — 繁體 and 简体, only while the records are on
    ...(process.env.SHOW_OUTCOME_RECORDS === "1" ? (["zh-hant", "zh"] as const).map((l) => ({ url: `${site}/${l}/outcomes`, lastModified: new Date(), changeFrequency: "weekly" as const, priority: 0.7 })) : []),
    // 10-16 (进度表 67): 線上擲筊、線上求籤 — once open
    // 10-17 进度表 69: 黃曆 — today, the days and months around it, the term pages, once open to everyone
    ...(featureOn("huangli") ? huangliSitemap(site, termPageNames(), BUILT) : []),
    // 10-30 进度表 128 ⑤: 今日の暦 (ja) and 음력·손 없는 날 (ko) — today, the days of the coming months, ±12 months
    ...(featureOn("huangli") ? (["ja", "ko", "en", "fr", "de", "es", "pt"] as const).flatMap((l) => [
      { url: `${site}/${l}/huangli`, lastModified: BUILT, changeFrequency: "daily" as const, priority: 0.8 },
      // 11-06 (Neil：「好，可以」): the foreign day and month pages are noindex now — not listed
      ...(featureOn("zeri") ? [{ url: `${site}/${l}/zeri`, lastModified: BUILT, changeFrequency: "weekly" as const, priority: 0.7 }] : []),
      ...(l !== "ko" && featureOn("zeri") ? (["wedding", "move", "opening"] as const).map((s) => ({ url: `${site}/${l}/zeri/${s}`, lastModified: BUILT, changeFrequency: "weekly" as const, priority: 0.7 })) : []),
    ]) : []),
    // 10-17 进度表 70: 擇日 and its matter pages
    ...(featureOn("zeri") ? (["zh-hant", "zh"] as const).flatMap((l) => [{ url: `${site}/${l}/zeri`, lastModified: BUILT, changeFrequency: "monthly" as const, priority: 0.7 }, ...MATTER_LIST.map((m) => ({ url: `${site}/${l}/zeri/${m.slug}`, lastModified: BUILT, changeFrequency: "monthly" as const, priority: 0.6 })),
      // 10-29 进度表 123: 結婚／搬家／開市 by use, the next three months (the list changes every day)
      ...PURPOSE_SLUGS.map((s) => ({ url: `${site}/${l}/zeri/${s}`, lastModified: BUILT, changeFrequency: "weekly" as const, priority: 0.7 }))]) : []),
    // 10-29 进度表 122 姓名學: the query page here; the ~2,500 character pages per script are in /name-sitemap.xml
    ...(featureOn("name") ? serviceLocales("name").map((l) => ({ url: `${site}/${l}/name`, lastModified: BUILT, changeFrequency: "monthly" as const, priority: 0.7 })) : []),
    // 10-29 进度表 125: 犯太歲 and the twelve zodiac pages
    ...(featureOn("taisui") ? [...(["zh-hant", "zh"] as const).flatMap((l) => [`/${l}/taisui`, ...ZODIACS.map((z) => `/${l}/taisui/${z.slug}`)]), "/ja/taisui", "/ko/taisui"].map((u) => ({ url: `${site}${u}`, lastModified: BUILT, changeFrequency: "monthly" as const, priority: 0.6 })) : []), // 10-30 进度表 128 ⑤: 厄年／삼재
    // 10-29 进度表 124: 解夢 and the 200 dream pages; 10-30 进度表 128 ③: every language it is open in
    ...(featureOn("dream") ? serviceLocales("dream").flatMap((l) => [`/${l}/dream`, ...(THIN_LIBRARY.has(l) ? [] : DREAMS).map((d) => `/${l}/dream/${d.slug}`)]).map((u) => ({ url: `${site}${u}`, lastModified: BUILT, changeFrequency: "yearly" as const, priority: 0.5 })) : []),
    // 10-18 进度表 73: 每日運勢 and the twelve sign pages
    // 10-30 进度表 128 ⑤: every language; the sun signs too where they are shown (not Korean, not Chinese)
    ...(featureOn("yunshi") ? serviceLocales("yunshi").flatMap((l) => [{ url: `${site}/${l}/yunshi`, lastModified: new Date(), changeFrequency: "daily" as const, priority: 0.7 },
      ...[...YUNSHI_SIGNS, ...(l !== "zh" && l !== "zh-hant" && l !== "ko" ? STAR_SIGNS : [])].map((s) => ({ url: `${site}/${l}/yunshi/${s}`, lastModified: new Date(), changeFrequency: "daily" as const, priority: 0.6 }))]) : []),
    // 10-18 进度表 71/72/74: 紫微、八字、星盤 product pages and their libraries (chart pages are not indexed)
    // 10-22 进度表 82 ②: the services hub (every language) and the 合盤／年書 pages, once their switches are on
    ...(featureOn("services") ? LOCALES.map((l) => ({ url: `${site}/${l}/services`, lastModified: BUILT, changeFrequency: "weekly" as const, priority: 0.6 })) : []),
    // 10-23: the doors 看自己／每天 have their own pages — 10-29 进度表 128: in every language that has something open behind them
    ...(featureOn("services") ? LOCALES.flatMap((l) => (["self", "daily"] as const)
      .filter((g) => SERVICES.some((s) => s.group === g && (!s.feature || featureOn(s.feature)) && serviceOpenIn(s.id, l)))
      .map((g) => ({ url: `${site}/${l}/services/${g}`, lastModified: BUILT, changeFrequency: "weekly" as const, priority: 0.6 }))) : []),
    // 10-30 进度表 128 ④: each in the languages it is open in
    ...(["hepan", "nianshu"] as const).flatMap((f) => (featureOn(f) ? serviceLocales(f).map((l) => ({ url: `${site}/${l}/${f}`, lastModified: BUILT, changeFrequency: "monthly" as const, priority: 0.6 })) : [])),
    // 10-30 进度表 128 ④: 八字 and 正緣畫像 in every language they are open in
    ...(featureOn("zhengyuan") ? serviceLocales("zhengyuan").map((l) => ({ url: `${site}/${l}/zhengyuan`, lastModified: BUILT, changeFrequency: "monthly" as const, priority: 0.6 })) : []),
    ...(featureOn("bazi") ? serviceLocales("bazi").flatMap((l) => [`/${l}/bazi`, `/${l}/bazi/rizhu`, ...BAZI_PILLARS.map((p) => `/${l}/bazi/rizhu/${pillarSlug(p)}`)]).map((u) => ({ url: `${site}${u}`, lastModified: BUILT, changeFrequency: "monthly" as const, priority: 0.5 })) : []),
    // 10-30 进度表 128 ④: 紫微 in every language it is open in
    ...(featureOn("ziwei") ? serviceLocales("ziwei").flatMap((l) => [`/${l}/ziwei`, `/${l}/ziwei/stars`, ...(THIN_LIBRARY.has(l) ? [] : Object.values(STAR_SLUG)).flatMap((s) => [`/${l}/ziwei/stars/${s}`, ...Object.values(PALACE_SLUG).map((p) => `/${l}/ziwei/stars/${s}/${p}`)])]).map((u) => ({ url: `${site}${u}`, lastModified: BUILT, changeFrequency: "monthly" as const, priority: 0.5 })) : []),
    // 10-30 进度表 128 ④: the 星盤 pages in every language it is open in
    ...(featureOn("astro") ? serviceLocales("xingpan").flatMap((l) => [`/${l}/xingpan`, `/${l}/xingpan/planets`, ...(THIN_LIBRARY.has(l) ? [] : Object.values(PLANET_SLUG)).flatMap((p) => [...Object.values(SIGN_SLUG).map((s) => `/${l}/xingpan/${p}-${s}`), ...Array.from({ length: 12 }, (_, i) => `/${l}/xingpan/${p}-house-${i + 1}`)]), ...(THIN_LIBRARY.has(l) ? [] : Object.values(SIGN_SLUG)).map((s) => `/${l}/xingpan/rising/${s}`)]).map((u) => ({ url: `${site}${u}`, lastModified: BUILT, changeFrequency: "monthly" as const, priority: 0.5 })) : []),
    // 10-16 进度表 68: 線上塔羅 + the 78 card pages, once open to everyone; 10-30 进度表 128 ②: every language it is open in
    ...(featureOn("tarot") ? serviceLocales("tarot").flatMap((l) => [{ url: `${site}/${l}/tarot`, lastModified: BUILT, changeFrequency: "monthly" as const, priority: 0.7 }, { url: `${site}/${l}/tarot/cards`, lastModified: BUILT, changeFrequency: "yearly" as const, priority: 0.6 }, ...TAROT_CARDS.map((c) => ({ url: `${site}/${l}/tarot/${tarotSlug(c)}`, lastModified: BUILT, changeFrequency: "yearly" as const, priority: 0.5 }))]) : []),
    ...(featureOn("jiaobei") ? serviceLocales("jiaobei").flatMap((l) => ["jiaobei", ...(serviceOpenIn("jieqian", l) ? ["qiuqian"] : [])].map((p) => ({ url: `${site}/${l}/${p}`, lastModified: BUILT, changeFrequency: "monthly" as const, priority: 0.7 }))) : []),
    // 10-29 进度表 127: 尋物「東西不見了？」, once open to everyone
    // 10-29 进度表 128: every language it is open in
    ...(featureOn("xunwu") ? serviceLocales("xunwu").map((l) => ({ url: `${site}/${l}/xunwu`, lastModified: BUILT, changeFrequency: "monthly" as const, priority: 0.7 })) : []),
    // 11-05 进度表 136 本命卦 (result pages are not indexed); 139: the 16 four-letter pages and the 64 hexagram pages
    ...(featureOn("bmg") ? serviceLocales("bmg").map((l) => ({ url: `${site}/${l}/bmg`, lastModified: BMG_DATE, changeFrequency: "monthly" as const, priority: 0.7 })) : []),
    ...(featureOn("bmg") && featureOn("bmg-pages") ? serviceLocales("bmg").flatMap((l) => [
      ...BMG_TYPES.map((t) => ({ url: `${site}/${l}/bmg/type/${t.toLowerCase()}`, lastModified: BMG_DATE, changeFrequency: "monthly" as const, priority: 0.5 })),
      ...Array.from({ length: 64 }, (_, i) => ({ url: `${site}/${l}/bmg/gua/${i + 1}`, lastModified: BMG_DATE, changeFrequency: "monthly" as const, priority: 0.5 })),
    ]) : []),
    // 10-14 (进度表 §四 50): 今日一籤
    ...(featureOn("today-qian") ? serviceLocales("today-qian") : []).map((l) => ({ url: `${site}/${l}/today-qian`, lastModified: new Date(), changeFrequency: "daily" as const, priority: 0.7 })),
    // 10-30 进度表 128 ⑤: the lot pages in the seven other languages (ja 淺草寺, others 觀音): 解籤, the index, every lot
    ...(FOREIGN as Foreign[]).filter((l) => serviceOpenIn("jieqian", l)).flatMap((l) => [`/${l}/jieqian`, `/${l}/qian/${marketSet(l)}`, ...Array.from({ length: setCount(l) }, (_, i) => `/${l}/qian/${marketSet(l)}/${i + 1}`)].map((u) => ({ url: `${site}${u}`, lastModified: QIAN_DATE, changeFrequency: "monthly" as const, priority: 0.6 }))),
    // 10-12 (进度表 §四 38): 「2027，這件事的年卦」预约页
    { url: `${site}/zh-hant/nian-gua-2027`, lastModified: LOVE_LANDING_DATE, changeFrequency: "weekly" as const, priority: 0.6 },
  ];
  if (!fullSitemap() && !includeTransitions()) {
    // 09-23 (§14 ⑯): ~300 pages Google should take first. Everything else is
    // still served and linked — it just is not asked for yet.
    // 10-16 进度表 66: + pt — Brazil searches 「hexagrama N」 about 11,700 times a month and the results are app-store
    // pages and small old sites (07_真实搜索量)
    const FOCUS = new Set(["zh", "zh-hant", "en", "ja", "pt"]);
    const focusCore = core.filter((e) => /^\/[a-z-]+(\/today)?$/.test(e.url.replace(site, "")));
    const inFocus = (e: { url: string }) => FOCUS.has(e.url.replace(site, "").split("/")[1] ?? "");
    // 09-28 (进度表 14): the readers' published cases are the site's real long-tail content — in the focused map too,
    // the index only for languages that have cases
    const caseLocales = new Set(cases.map((e) => e.url.replace(site, "").split("/")[1]));
    return [...focusCore, ...guaIndex.filter(inFocus), ...gua.filter(inFocus), ...scenes, ...reference, ...casesIndex.filter((e) => caseLocales.has(e.url.replace(site, "").split("/")[1] ?? "")), ...cases];
  }
  return [...core, ...legal, ...guaIndex, ...gua, ...(includeTransitions() ? [...toIndex, ...transitions] : []), ...reference, ...casesIndex, ...cases, ...scenes];
}
