import QIANUI from "../src/data/l10n/qianui.json";
import { QIAN_UI_HANT, foreignLot, foreignReading, marketSet } from "../src/lib/qian-foreign";
import * as NMF from "../src/lib/mingli/name/foreign";
import ALMANAC from "../src/data/l10n/almanac.json";
import { ALMANAC_HANT, almanacText } from "../src/lib/mingli/calendar/almanac-west";
import { huangliDay } from "../src/lib/mingli/calendar/day";
import * as KY from "../src/lib/mingli/calendar/koyomi";
import * as TSL from "../src/lib/mingli/taisui-local";
import * as S from "../src/lib/services";
import { describe, expect, it } from "vitest";
import { FOREIGN, getPath, leaves, type Foreign, type Generated } from "../src/lib/l10n/core";
import { leafProblem } from "../src/lib/l10n/check";
import { siteHant } from "../src/lib/l10n/site";
import SITE from "../src/data/l10n/site.json";
import XUNWU from "../src/data/l10n/xunwu.json";
import { XW_HANT, xwText, actionsIn, firstStepsIn, CATS, PLACES, AGOS, xunwuPageUi } from "../src/lib/xunwu-text";
import { buildCard, castQuestionIn } from "../src/lib/xunwu";
import { MARKETS } from "../src/lib/xunwu-markets";
import { SERVICES, serviceLocales, serviceOpenIn, serviceText, crossLine } from "../src/lib/services";
import { CROSS_MAP } from "../src/lib/cross-map";
import { isLostThing } from "../src/lib/lost-words";
import { lostItemOf } from "../src/lib/lost-item";
import { aiNotice } from "../src/lib/ai-notice";
import { LOCALES } from "../src/lib/locales";
import TAROT from "../src/data/l10n/tarot.json";
import TAROT_M from "../src/data/l10n/tarot-meanings.json";
import { TAROT_HANT, tarotText, cardName, cardsLineIn, positionsIn } from "../src/lib/tarot-text";
import { MEANINGS_HANT, meaningIn } from "../src/lib/tarot-meaning-text";
import { tarotUi } from "../src/lib/tarot-ui";
import * as T from "../src/lib/tarot";
import { followupOffense, offTopic, tarotOffense, tarotSystem, tarotUser } from "../src/lib/tarot-personal";
import { buildTarotEmail, buildTarotRevisitEmail } from "../src/lib/email";
import DREAM_UI from "../src/data/l10n/dream.json";
import D_SRC from "../src/data/l10n/dreams/_src.json";
import D_EN from "../src/data/l10n/dreams/en.json";
import D_JA from "../src/data/l10n/dreams/ja.json";
import D_KO from "../src/data/l10n/dreams/ko.json";
import D_FR from "../src/data/l10n/dreams/fr.json";
import D_DE from "../src/data/l10n/dreams/de.json";
import D_ES from "../src/data/l10n/dreams/es.json";
import D_PT from "../src/data/l10n/dreams/pt.json";
import { DREAM_UI_HANT, DREAMS_HANT, dreamIn, dreamNameIn, dreamUi } from "../src/lib/dream-text";
import { DREAMS, dreamBySlug } from "../src/lib/dream";
import ASTRO from "../src/data/l10n/astro.json";
import BIRTH from "../src/data/l10n/birth.json";
import QA from "../src/data/l10n/qa.json";
import SELFREV from "../src/data/l10n/selfrev.json";
import X_SRC from "../src/data/l10n/xingpan/_src.json";
import X_EN from "../src/data/l10n/xingpan/en.json";
import X_JA from "../src/data/l10n/xingpan/ja.json";
import X_KO from "../src/data/l10n/xingpan/ko.json";
import X_FR from "../src/data/l10n/xingpan/fr.json";
import X_DE from "../src/data/l10n/xingpan/de.json";
import X_ES from "../src/data/l10n/xingpan/es.json";
import X_PT from "../src/data/l10n/xingpan/pt.json";
import { ASTRO_HANT, astroPage, astroReportText, astroUi, planetName, signName } from "../src/lib/mingli/astro/page-ui";
import { XINGPAN_HANT, xIn, astroText } from "../src/lib/mingli/astro/content";
import { BIRTH_UI_HANT, birthUi } from "../src/lib/mingli/birth/ui";
import { QA_HANT, qaUi } from "../src/lib/mingli/qa-text";
import { SELF_REV_HANT } from "../src/lib/self-revisit-text";
import { selfChoices, selfKindName, selfReviewLabel, selfRevisitUi } from "../src/lib/self-revisit";
import { asksOutcome, suggestedQuestions } from "../src/lib/mingli/qa";
import { AS_DEEP_TASKS, asFactsIn, asForeignRules, asPartOffense, shapeAstroDeep } from "../src/lib/mingli/astro/report";
import { monthSkyLinesIn } from "../src/lib/mingli/astro/month-sky";
import { foreignReportOffense, lengthAsChinese, retargetLengths } from "../src/lib/l10n/report-guard";
import { buildAstroReportEmail, buildSelfRevisitEmail } from "../src/lib/email";

/**
 * 10-29 进度表 128 — every product in all nine languages. A generated file must cover every leaf of its 繁體 tree in all
 * seven foreign languages, each leaf in the right writing system with its {placeholders} intact (src/lib/l10n/check.ts);
 * a leaf whose 繁體 changed since it was translated is listed (rerun scripts/l10n/translate.ts <product>).
 */
const HAN = /[㐀-鿿]/;
/** every word of a text tree, without its keys (some trees are keyed by the Chinese term they translate) */
const wordsOf = (o: unknown): string[] => (typeof o === "string" ? [o] : o && typeof o === "object" ? Object.values(o).flatMap(wordsOf) : []);
const LATIN: Foreign[] = ["en", "fr", "de", "es", "pt"];

function coverage(name: string, hant: unknown, gen: Generated, keepHan: (p: string) => boolean = () => false, skip: (p: string) => boolean = () => false) {
  const problems: string[] = [];
  const stale: string[] = [];
  for (const l of FOREIGN as Foreign[]) {
    for (const leaf of leaves(hant)) {
      if (!/[　-〿㐀-鿿＀-￯·]|——/.test(leaf.text) || skip(leaf.path)) continue;
      const why = leafProblem(l, leaf.text, getPath(gen[l], leaf.path), keepHan(leaf.path));
      if (why) problems.push(`${name} ${l} ${leaf.path}: ${why}`);
      else if (gen._src?.[l]?.[leaf.path] !== leaf.text) stale.push(`${name} ${l} ${leaf.path}`);
    }
  }
  if (stale.length) console.warn(`[l10n] ${stale.length} translations older than their 繁體 — rerun scripts/l10n/translate.ts:\n${stale.slice(0, 20).join("\n")}`);
  return problems;
}

describe("128 — the generated translations cover every leaf, in the right script", () => {
  it("site (service names, cross cards, the home row)", () => {
    expect(coverage("site", siteHant(), SITE as unknown as Generated)).toEqual([]);
  });
  it("尋物", () => {
    expect(coverage("xunwu", XW_HANT, XUNWU as unknown as Generated)).toEqual([]);
  });
  it("解夢 (the page words, and the 200 dreams kept one file per language)", () => {
    expect(coverage("dream", DREAM_UI_HANT, DREAM_UI as unknown as Generated)).toEqual([]);
    const gen = { _src: D_SRC, en: D_EN, ja: D_JA, ko: D_KO, fr: D_FR, de: D_DE, es: D_ES, pt: D_PT } as unknown as Generated;
    expect(coverage("dreams", DREAMS_HANT, gen)).toEqual([]);
  });
    it("塔羅 (the pages, the letters) and the 78 meanings", () => {
    expect(coverage("tarot", TAROT_HANT, TAROT as unknown as Generated)).toEqual([]);
    expect(coverage("tarot-meanings", MEANINGS_HANT, TAROT_M as unknown as Generated)).toEqual([]);
  });
  it("the birth form, the 星盤 pages and report, its library, 問這張盤 and 到期回來問你", () => {
    expect(coverage("birth", BIRTH_UI_HANT, BIRTH as unknown as Generated)).toEqual([]);
    // 座 after a sign name is Chinese only: every other language leaves it out (astroUi sets it empty)
    expect(coverage("astro", ASTRO_HANT, ASTRO as unknown as Generated, () => false, (p) => p === "ui.zuo")).toEqual([]);
    const gen = { _src: X_SRC, en: X_EN, ja: X_JA, ko: X_KO, fr: X_FR, de: X_DE, es: X_ES, pt: X_PT } as unknown as Generated;
    expect(coverage("xingpan", XINGPAN_HANT, gen)).toEqual([]);
    expect(coverage("qa", QA_HANT, QA as unknown as Generated)).toEqual([]);
    expect(coverage("selfrev", SELF_REV_HANT, SELFREV as unknown as Generated)).toEqual([]);
  });
});

describe("128 ③ — 解夢 in all nine languages", () => {
  it("is open everywhere; every dream reads in the language, the Chinese pages keep their own text", () => {
    expect(serviceLocales("dream")).toEqual(LOCALES);
    for (const l of LATIN) {
      expect(JSON.stringify(leaves(dreamUi(l)).map((x) => x.text)), l).not.toMatch(HAN); // (the kinds are keyed by their 繁體 name)
      for (const d of DREAMS) {
        const t = dreamIn(d.slug, l)!;
        expect(JSON.stringify(t), `${l} ${d.slug}`).not.toMatch(HAN);
        expect(t.variants).toHaveLength(d.variants.length);
        expect(t.faq).toHaveLength(d.faq.length);
      }
    }
    for (const d of DREAMS) {
      expect(JSON.stringify(dreamIn(d.slug, "ko")), d.slug).not.toMatch(HAN);
      expect(dreamIn(d.slug, "ja")!.title, d.slug).toMatch(/[ぁ-んァ-ン]/);
    }
    // the traditional sayings stay the Chinese dream books' — named, not swapped for another tradition
    expect(dreamIn("snake", "en")!.trad).toMatch(/Duke of Zhou|Zhou Gong/);
    expect(dreamIn("snake", "zh")!.title).toBe(dreamBySlug("snake")!.hans.title);
    expect(dreamIn("snake", "zh-hant")!.chip).toBe("夢到蛇");
    expect(dreamIn("snake", "zh")!.chip).toBe("梦到蛇");
    expect(dreamNameIn("snake", "en")).toMatch(/^[A-Z]/);
    expect(dreamUi("zh").index.title).toBe("解梦");
  });
});

describe("128 ② — 塔羅 in all nine languages", () => {
  const ALL = TAROT_CARDS_IDS();
  function TAROT_CARDS_IDS() { return T.TAROT_CARDS.map((c) => c.id); }
  it("is open everywhere; every card has its standard name and its meanings in every language", () => {
    expect(serviceLocales("tarot")).toEqual(LOCALES);
    expect(cardName("06-lovers", "en")).toBe("The Lovers");
    expect(cardName("00-fool", "fr")).toBe("Le Fou");
    expect(cardName("00-fool", "de")).toBe("Der Narr");
    expect(cardName("00-fool", "es")).toBe("El Loco");
    expect(cardName("00-fool", "pt")).toBe("O Louco");
    expect(cardName("00-fool", "ja")).toBe("愚者");
    expect(cardName("00-fool", "ko")).toBe("바보");
    expect(cardName("cups-13", "ko")).toBe("컵 퀸");
    expect(cardName("06-lovers", "zh")).toBe("恋人");
    for (const l of LOCALES) {
      const names = new Set(ALL.map((id) => cardName(id, l)));
      expect(names.size, l).toBe(78); // no two cards share a name
      for (const id of ALL) {
        const m = meaningIn(id, l)!;
        expect(m.keywords.upright.length, `${l} ${id}`).toBe(MEANINGS_HANT[id]!.keywords.upright.length);
        expect(m.upright.love.length + m.reversed.work.length, `${l} ${id}`).toBeGreaterThan(40);
        if (LATIN.includes(l as Foreign)) expect(JSON.stringify(m) + cardName(id, l), `${l} ${id}`).not.toMatch(HAN);
      }
    }
    for (const l of LATIN) {
      expect(JSON.stringify(tarotText(l)), l).not.toMatch(HAN);
      expect(positionsIn(l, 3)).toHaveLength(3);
    }
    expect(cardsLineIn([{ id: "06-lovers", rev: true }, { id: "wands-03", rev: false }], "en")).toBe("The Lovers (reversed), Three of Wands");
    expect(cardsLineIn([{ id: "06-lovers", rev: true }, { id: "wands-03", rev: false }], "zh-hant")).toBe("戀人（逆位）、權杖三");
    expect(tarotUi("de").quote).toContain("{q}");
  });

  it("the questions it does not take are recognised in every language", () => {
    expect(T.refusalOf("I want to die, will it get better?")).toBe("crisis");
    expect(T.refusalOf("Will my bitcoin go up this year?")).toBe("money");
    expect(T.refusalOf("Is my husband having an affair?")).toBe("affair");
    expect(T.refusalOf("Est-ce que je suis enceinte ?")).toBe("health");
    expect(T.refusalOf("Gewinne ich im Lotto?")).toBe("money");
    expect(T.refusalOf("¿Mi pareja me es infiel?")).toBe("affair");
    expect(T.refusalOf("宝くじは当たりますか")).toBe("money");
    expect(T.refusalOf("남편이 바람을 피우고 있나요?")).toBe("affair");
    // the ordinary ones are drawn: the sign Cancer, がんばる, "se tromper", "actions"
    for (const q of ["I'm a Cancer — will my relationship with him get better?", "仕事をがんばれば昇進できますか", "Est-ce que je me trompe sur lui ?", "¿Sus acciones muestran que le importo?", "Wird unser Projekt ein Erfolg?", "Ele ainda pensa em mim?"]) expect(T.refusalOf(q), q).toBeNull();
  });

  it("a spread drawn in another language is read in it: names, positions, meanings and the checks in that language", () => {
    const { token } = T.createDraw({ question: "Will my bakery project work out?", spread: 3, locale: "en", bid: "l10n-tarot-en", customerId: null, register: null });
    const d = T.tarotDraw(token)!;
    const u = JSON.parse(tarotUser(d)) as { cards: { position: string; card: string; orientation: string; meaning: Record<string, string> }[]; reader: { kind_of_matter: string } };
    expect(u.cards.map((c) => c.position)).toEqual(["Now", "What's in the way", "What comes next"]);
    expect(JSON.stringify(u)).not.toMatch(HAN);
    expect(u.reader.kind_of_matter).not.toMatch(HAN);
    const sys = tarotSystem(null, 3, false, "en");
    expect(sys).toMatch(/OUTPUT LANGUAGE: English/);
    expect(sys).toMatch(/hexagram/);
    expect(tarotSystem(null, 3, false, "fr")).toMatch(/hexagramme/);
    // the Chinese pages keep their prompt
    expect(tarotSystem(null, 3)).toMatch(/Write in Traditional Chinese as people in Taiwan write it/);
    expect(tarotSystem(null, 3, false, "zh")).toBe(tarotSystem(null, 3));

    const ok = { reading: "Read together, these three cards say the bakery project has real energy behind it. ".repeat(3), cards: ["one", "two", "three"], watch: "Test one recipe with real customers first.", next: "When will the bakery start to move? Cast a hexagram for it." };
    expect(tarotOffense(ok, 3, "en")).toBeNull();
    expect(tarotOffense({ ...ok, watch: "Expect news next week." }, 3, "en")).toMatch(/^date/);
    expect(tarotOffense({ ...ok, watch: "Success is guaranteed." }, 3, "en")).toMatch(/^forbidden/);
    expect(tarotOffense({ ...ok, watch: "Draw another card to see more." }, 3, "en")).toMatch(/^redraw/);
    expect(tarotOffense({ ...ok, watch: "The 戀人 card says yes." }, 3, "en")).toMatch(/^script/);
    expect(tarotOffense({ ...ok, next: "What will happen with the bakery?" }, 3, "en")).toBe("next:no-cast");
    expect(tarotOffense({ ...ok, watch: "Il faut attendre la semaine prochaine." }, 3, "fr")).toMatch(/^date/);
    expect(tarotOffense({ ...ok, next: "Wann geht es los? Wirf ein Hexagramm dafür." }, 3, "de")).toBeNull();
    expect(tarotOffense({ ...ok, reading: "このカードは今の状態を示しています。".repeat(8), cards: ["一", "二", "三"], watch: "来週まで待ちましょう。", next: "いつ動くか、卦を立てて見ましょう。" }, 3, "ja")).toMatch(/^date/);
    expect(followupOffense("Je vous garantis que tout ira bien.", "fr")).toBeTruthy();
    expect(followupOffense("Les cartes montrent un blocage ; faites d'abord un pas concret.", "fr")).toBeNull();
    // the matter's own words are found in English
    const base = { cards: ["a", "b", "c"], watch: "Do one thing first.", next: "Cast a hexagram." };
    expect(offTopic({ ...base, reading: "The quarrel between you two needs a softer tone before you talk again." }, "Will my bakery project work out?", "en")).toBe(true);
    expect(offTopic({ ...base, reading: "The bakery project has momentum, but the plan is not finished." }, "Will my bakery project work out?", "en")).toBe(false);
  });

  it("the letters are in the spread's language", () => {
    for (const l of ["en", "fr", "de", "es", "pt", "ja", "ko"] as const) {
      const t = tarotText(l);
      const m = buildTarotEmail({ t: t.mail, locale: l, cards: cardsLineIn([{ id: "06-lovers", rev: true }], l), url: "https://yaoflow.com/x", receipt: { amount: "$5", url: "https://pay.stripe.com/r" } });
      const rv = buildTarotRevisitEmail({ t: t.mail, locale: l, question: "q", outcome: "o", plan: "p", links: T.ANSWERS.map((a) => ({ label: t.answers[a], url: "https://x" })), pageUrl: "https://x" });
      expect(m.html).toContain(`lang="${l}"`);
      if (l !== "ja") {
        expect(m.subject + m.text + rv.subject + rv.text, l).not.toMatch(HAN);
        expect(m.text, l).not.toMatch(/已付|收據/);
      }
      expect(rv.text).toContain(t.mail.rvOutcome.replace("{o}", "o"));
    }
  });
});

describe("128 — 尋物 in all nine languages", () => {
  it("is open everywhere, listed with its own name, and the cross cards speak the language", () => {
    expect(serviceLocales("xunwu")).toEqual(LOCALES);
    for (const l of LOCALES) expect(serviceOpenIn("xunwu", l)).toBe(true);
    const s = SERVICES.find((x) => x.id === "xunwu")!;
    for (const l of LATIN) expect(serviceText(s, l).label).not.toMatch(HAN);
    expect(serviceText(s, "ja").label).not.toBe(serviceText(s, "zh-hant").label);
    for (const l of LATIN) expect(crossLine(CROSS_MAP.xunwu.main.line, l)).not.toMatch(HAN);
  });

  it("the card in a foreign language has no Chinese left, and keeps the same reading as the 繁體 one", () => {
    const base = { token: "a".repeat(24), same: false, at: 1, cat: "wallet" as const, place: "unsure" as const, ago: "today" as const, dice: [4, 3, 3] as [number, number, number], hour: 7, region: "tw" as const };
    const hant = buildCard({ ...base, locale: "zh-hant" });
    for (const l of LATIN) {
      const c = buildCard({ ...base, locale: l });
      const text = JSON.stringify({ ...c, hex: c.hex.name, changed: c.changed.name, castHref: "" });
      expect(text, l).not.toMatch(HAN);
      expect(c.tier).toBe(hant.tier);
      expect(c.dirIdx).toBe(hant.dirIdx);
      expect(c.hex.href).toBe(`/${l}/gua/43-guai`);
      expect(decodeURIComponent(c.castHref)).not.toMatch(HAN);
    }
    const ja = buildCard({ ...base, locale: "ja" });
    expect(ja.dir).toBe("東");
    expect(ja.why).toMatch(/[ぁ-ん]/);
    const ko = buildCard({ ...base, locale: "ko" });
    expect(JSON.stringify({ t: ko.tierLabel, w: ko.why, d: ko.dir })).not.toMatch(HAN);
  });

  it("the steps are the reader's country's: Japan's My Number line, Korea's 정부24, Germany's 116 116, Brazil's Celular Seguro", () => {
    expect(actionsIn("doc", "ja", "tw").urgent!.items.join("")).toContain("0120-95-0178");
    expect(actionsIn("doc", "ko", "tw").urgent!.items.join("")).toContain("정부24");
    expect(actionsIn("doc", "de", "tw").urgent!.items.join("")).toContain("116 116");
    expect(actionsIn("phone", "pt", "tw").urgent!.items.join("")).toContain("Celular Seguro");
    expect(actionsIn("phone", "en", "tw").urgent!.items.join("")).toContain("Find Hub");
    for (const l of FOREIGN as Foreign[]) {
      const m = MARKETS[l];
      if (l !== "ja") expect(JSON.stringify(m), l).not.toMatch(HAN);
      expect(m.dirShort).toHaveLength(8);
      for (const c of CATS) expect(actionsIn(c, l, "tw").rest.items.length).toBeGreaterThanOrEqual(4);
      expect(firstStepsIn(l, "tw").length).toBe(7);
      expect(xunwuPageUi(l).dirShort).toEqual(m.dirShort);
    }
    // Chinese pages keep their own offices
    expect(actionsIn("doc", "zh-hant", "tw").urgent!.items.join("")).toContain("1996");
  });

  it("the question carried into 六爻 is the reader's own language, and the cast recognises it as a lost thing", () => {
    for (const l of LOCALES) {
      const t = xwText(l);
      for (const cat of CATS) for (const place of PLACES) for (const ago of AGOS) {
        const q = castQuestionIn(t, cat, place, ago);
        expect(isLostThing(q), `${l} ${q}`).toBe(true);
        const focal = lostItemOf(q)!.focal;
        if (cat === "doc" || cat === "clothes") expect(focal, `${l} ${q}`).toBe("parent");
        if (cat === "wallet" || cat === "keys" || cat === "phone" || cat === "jewelry") expect(focal, `${l} ${q}`).toBe("wealth");
      }
    }
    expect(isLostThing("Will my ex come back to me?")).toBe(false);
    expect(isLostThing("I lost my job, will I find a new one?")).toBe(false);
    expect(isLostThing("Mon chien a disparu, va-t-il revenir ?")).toBe(false);
  });
});

describe("128 — the EU AI notice", () => {
  it("is shown in French, German, Spanish and Portuguese only, beside the two conversations", () => {
    for (const l of ["fr", "de", "es", "pt"]) {
      expect(aiNotice(l, "cast")).toMatch(/\b(IA|KI)\b/);
      expect(aiNotice(l, "chart")).toMatch(/\b(IA|KI)\b/);
    }
    for (const l of ["zh", "zh-hant", "en", "ja", "ko"]) expect(aiNotice(l, "cast")).toBeNull();
  });
});

describe("128 ④ — 星盤 in all nine languages", () => {
  it("is open everywhere; the names are the standard ones and the joins are this language's", () => {
    expect(serviceLocales("xingpan")).toEqual(LOCALES);
    expect(signName("巨蟹", "en")).toBe("Cancer");
    expect(signName("金牛", "ja")).toBe("牡牛座");
    expect(planetName("月亮", "de")).toBe("Mond");
    const ui = astroUi("en");
    expect(ui.planetNames!.split(",")[0]).toBe("Sun");
    expect(ui.zuo).toBe("");
    expect(ui.fPS).toBe("{p} in {s}");
    expect(astroUi("fr").colon).toBe(" : ");
    expect(astroUi("ja").listSep).toBe("、");
    // a Japanese / Korean sign name carries its own 座 / 자리: no template adds it again
    for (const l of ["ja", "ko"] as const) expect(JSON.stringify(astroUi(l)), l).not.toMatch(/\}(座|자리)/);
    for (const l of LATIN) {
      expect(JSON.stringify(astroPage(l)), l).not.toMatch(HAN);
      expect(wordsOf(astroReportText(l)).join("\n"), l).not.toMatch(HAN);
      expect(JSON.stringify(Object.values(birthUi(l))), l).not.toMatch(HAN); // (the wheel heads are keyed col_年…)
    }
    // the lists the form and the chart page split on commas keep their number of items in every language
    for (const l of FOREIGN as Foreign[]) {
      const b = birthUi(l), u = astroUi(l);
      expect([b.branches, b.whoOpts, b.cols_tw, b.cols_hkmo, b.cols_cn, b.cols_intl].map((x) => x.split(",").length), l).toEqual([13, 5, 2, 2, 3, 3]);
      expect([u.planetNames, u.aspectNames, u.topics, u.topicQ].map((x) => x!.split(",").length), l).toEqual([10, 5, 3, 3]);
      expect(u.asks!.split("|").map((x) => x.split("~").length), l).toEqual([3, 3, 3, 3, 3, 3]);
    }
    expect(astroPage("zh").title).toBe("星盘");
    expect(astroPage("zh-hant").metaTitle).toMatch(/^星盤查詢/);
  });

  it("the library reads in every language, keyed as the 繁體 one", () => {
    for (const l of LATIN) {
      const X = xIn(l);
      expect(Object.keys(X.ps)).toHaveLength(120);
      expect(X.ps["月亮|巨蟹"]!.planet).toBe("月亮");
      expect(JSON.stringify({ ps: Object.values(X.ps).map((v) => [v.title, v.plain, v.love, v.work, v.watch]), ph: Object.values(X.ph), rising: Object.values(X.rising), aspects: Object.values(X.aspects), node: Object.values(X.node), planets: Object.values(X.planets), faq: X.faq, intro: X.intro }), l).not.toMatch(HAN);
      const t = astroText({ ps: [["太陽", "牡羊"]], ph: [["太陽", 1]], rising: "獅子", aspects: [], node: "牡羊" }, l);
      expect(JSON.stringify([(Object.values(t.ps) as { title: string; plain: string; love: string; work: string; watch: string }[]).map((v) => [v.title, v.plain, v.love, v.work, v.watch]), Object.values(t.ph), t.rising, t.node]), l).not.toMatch(HAN);
    }
    expect(xIn("zh-hant").ps["月亮|巨蟹"]!.title).toBe(XINGPAN_HANT.ps["月亮|巨蟹"]!.title);
  });

  it("the deep report is asked and checked in the page's language", () => {
    for (const l of FOREIGN as Foreign[]) {
      const rules = asForeignRules(l).join("\n");
      expect(rules).not.toContain("Traditional Chinese");
      expect(rules).toContain(`太陽 = ${planetName("太陽", l)}`);
      expect(rules).toContain(`巨蟹 = ${signName("巨蟹", l)}`);
      expect(retargetLengths(AS_DEEP_TASKS.A!, l)).not.toMatch(/650–900 characters|\(太陽, 650–900\)/);
    }
    expect(retargetLengths(AS_DEEP_TASKS.A!, "en")).toContain("390–540 words");
    expect(retargetLengths(AS_DEEP_TASKS.A!, "ja")).toContain("910–1260 characters");
    // the checks: the script, the banned claims; the lengths in words (Latin) or characters
    expect(foreignReportOffense("Votre Soleil en Bélier vous pousse à agir.", "fr")).toBeNull();
    expect(foreignReportOffense("Votre Soleil 太陽 en Bélier.", "fr")).toMatch(/^script/);
    expect(foreignReportOffense("C'est garanti, vous réussirez.", "fr")).toMatch(/^banned/);
    expect(foreignReportOffense("太陽が牡羊座にあるあなたは、行動から始める人です。", "ja")).toBeNull();
    expect(foreignReportOffense("你的太陽在牡羊座。", "ja")).toMatch(/^script/);
    expect(foreignReportOffense("태양이 양자리에 있습니다.", "ko")).toBeNull();
    expect(foreignReportOffense("태양이 牡羊座에 있습니다.", "ko")).toMatch(/^script/);
    const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");
    expect(lengthAsChinese(words(300), "en")).toBe(500);
    const f = { timeKnown: true };
    expect(shapeAstroDeep("A", { zhongxin: words(300), taiyang: words(300) }, f, "en").ok).toBe(true);
    expect(shapeAstroDeep("A", { zhongxin: words(80), taiyang: words(300) }, f, "en")).toEqual({ ok: false, why: "short:zhongxin" });
    expect(asPartOffense("deep", { zhongxin: "Your chart leans on fire." }, {}, "en")).toBeNull();
    expect(asPartOffense("deep", { zhongxin: "This is your karma." }, {}, "en")).toMatch(/^banned/);
    // the facts carry the page's words (a German trial once wrote 旺 as „Exil")
    const fx = asFactsIn({ planets: [{ name: "太陽", sign: "牡羊", dignity: "旺", element: "火", mode: "基本" }], asc: { sign: "雙子" }, dominant: [{ planet: "土星", why: ["角宮1", "近軸點", "相位4", "命主星"] }], balance: { elements: { 火: 4, 水: 1 }, strongEl: ["風"] }, aspects: [{ a: "太陽", b: "月亮", name: "拱", group: "和諧" }] }, "de");
    expect(JSON.stringify(fx)).not.toMatch(HAN);
    expect(fx.planets[0]!.dignity).toBe("Erhöhung");
    expect(asFactsIn({ d: "旺", e: "火" }, "en")).toEqual({ d: "exaltation", e: "fire" });
    expect(JSON.stringify(asFactsIn({ why: ["角宮10", "相位3"], p: "冥王星" }, "ja"))).toMatch(/冥王星/);
    const m = buildAstroReportEmail({ kind: "deep", url: "https://yaoflow.com/en/xingpan/r/x", foreign: { t: astroReportText("en").mail, lang: "en" } });
    expect(m.subject + m.text).not.toMatch(HAN);
    expect(m.html).toContain('lang="en"');
  });

  it("this month's transits read in the language, with dates written its way", () => {
    const sky = { year: 2026, month: 11, hits: [{ planet: "木星" as const, point: "太陽", aspect: "拱", peak: "11/5", orb: 0.4 }, { planet: "土星" as const, point: "上升", aspect: "刑", peak: "11/20", orb: 1.1 }], retro: [{ planet: "水星", from: "11/9", to: "11/29" }], points: ["太陽", "月亮", "金星", "上升"] };
    for (const l of FOREIGN as Foreign[]) {
      const r = monthSkyLinesIn(sky, l);
      expect(r.lines).toHaveLength(3);
      if (l !== "ja") expect(JSON.stringify(r), l).not.toMatch(HAN);
      expect(r.lines.join(" "), l).not.toMatch(/\{\w+\}/);
    }
    expect(monthSkyLinesIn(sky, "en").lines[0]).toMatch(/^Jupiter trine natal Sun \(strongest around Nov 5\):/);
    expect(monthSkyLinesIn(sky, "en").label).toMatch(/November 2026/);
    const quiet = monthSkyLinesIn({ ...sky, hits: [], retro: [] }, "fr");
    expect(quiet.lines[0]).toContain("Soleil, Lune, Vénus, Ascendant");
  });

  it("問這張盤 speaks the language: its words, the suggested questions, the cast link on a when-question", () => {
    for (const l of LATIN) {
      expect(JSON.stringify(qaUi(l, "astro")), l).not.toMatch(HAN);
      expect(suggestedQuestions("astro", "abcdef123456", l).join(""), l).not.toMatch(HAN);
    }
    expect(qaUi("ja", "astro").head).toContain("ホロスコープ");
    expect(qaUi("ja", "ziwei").head).toContain("命盤");
    expect(qaUi("zh", "astro").head).toBe("问这张盘");
    expect(asksOutcome("When will I meet someone?")).toBe(true);
    expect(asksOutcome("Quand vais-je trouver un travail ?")).toBe(true);
    expect(asksOutcome("Wann werde ich heiraten?")).toBe(true);
    expect(asksOutcome("いつ転職するのがいいですか？")).toBe(true);
    expect(asksOutcome("언제 연애를 시작할까요?")).toBe(true);
    expect(asksOutcome("What kind of work suits me?")).toBe(false);
    expect(asksOutcome("私に向いている仕事は何ですか？")).toBe(false);
  });

  it("到期回來問你 speaks the language: the block, the choices, the names and the letter", () => {
    for (const l of LATIN) {
      expect(JSON.stringify(selfRevisitUi(l)), l).not.toMatch(HAN);
      expect(selfChoices("astro", l).map((o) => o.label).join(""), l).not.toMatch(HAN);
      expect(selfKindName("astro", l), l).not.toMatch(HAN);
      expect(selfReviewLabel("astro", l), l).not.toMatch(HAN);
      const m = buildSelfRevisitEmail({ locale: l, kind: "astro", label: selfKindName("astro", l), hint: null, plan: "wait", reportUrl: "https://x", castUrl: "https://y", outcomeUrls: { hit: "h", partial: "p", miss: "m", open: "o" } });
      expect(m.subject + m.text, l).not.toMatch(HAN);
    }
    expect(selfChoices("astro", "zh-hant").map((o) => o.label)).toEqual(["3 個月後", "半年後"]);
    expect(selfChoices("astro", "zh").map((o) => o.label)).toEqual(["3 个月后", "半年后"]);
    expect(selfKindName("astro", "zh")).toBe("星盘深度报告");
    const zh = buildSelfRevisitEmail({ locale: "zh-hant", kind: "astro", label: "星盤深度報告", hint: null, plan: null, reportUrl: "https://x", castUrl: "https://y", outcomeUrls: { hit: "h", partial: "p", miss: "m", open: "o" } });
    expect(zh.subject).toBe("星盤深度報告，後來怎麼樣了？");
  });
});

/* ------------------------------------------------------------------ 10-30 进度表 128 ④ 八字（含正緣畫像） */
import BAZI_GEN from "../src/data/l10n/bazi.json";
import ZYCOPY_GEN from "../src/data/l10n/zycopy.json";
import BL_SRC from "../src/data/l10n/bazilib/_src.json";
import BL_EN from "../src/data/l10n/bazilib/en.json";
import BL_JA from "../src/data/l10n/bazilib/ja.json";
import BL_KO from "../src/data/l10n/bazilib/ko.json";
import BL_FR from "../src/data/l10n/bazilib/fr.json";
import BL_DE from "../src/data/l10n/bazilib/de.json";
import BL_ES from "../src/data/l10n/bazilib/es.json";
import BL_PT from "../src/data/l10n/bazilib/pt.json";
import { BAZI_HANT, baziPage, baziReportText, baziUi, zyText } from "../src/lib/mingli/bazi/page-ui";
import { BAZI_LIB_HANT, bIn, baziText, PILLARS as BZ_PILLARS } from "../src/lib/mingli/bazi/content";
import { BAZI_NAMES, SS_KEPT, TEN_KEYS, bzName, josa } from "../src/lib/mingli/bazi/names";
import { countWords } from "../src/lib/l10n/core";
import { zyCopyHant, zhengyuanIn, zyChipsIn } from "../src/lib/mingli/bazi/zhengyuan-in";
import { zhengyuanOf, zyKeys } from "../src/lib/mingli/bazi/zhengyuan";
import { relationsFull } from "../src/lib/mingli/bazi/shensha";
import { bzFactsIn, bzForeignOffense, bzForeignRules, zyFactsIn } from "../src/lib/mingli/bazi/report-foreign";
import { DEEP_TASKS_FOR_TEST, factsFromBirth, partOffense, shapeGroup } from "../src/lib/mingli/bazi/report";
import { normalizeBirth } from "../src/lib/mingli/birth/normalize";
import { buildBaziReportEmail } from "../src/lib/email";

/** every string value of a tree (the keys left out) */
const valuesOf = (x: unknown): string[] => (typeof x === "string" ? [x] : Array.isArray(x) ? x.flatMap(valuesOf) : x && typeof x === "object" ? Object.values(x).flatMap(valuesOf) : []);

describe("128 ④ — 八字 and 正緣畫像 in all nine languages", () => {
  const n = normalizeBirth({ calendar: "solar", y: 1989, m: 1, d: 5, timeMode: "exact", h: 11, mi: 30, place: { id: "1668341", name: "Taipei", lat: 25.03, lon: 121.54, tz: "Asia/Taipei" } });
  const NOW = Date.UTC(2026, 9, 30);

  it("the generated words cover every leaf: the pages, the 正緣畫像's copy and the library", () => {
    expect(coverage("bazi", BAZI_HANT, BAZI_GEN as unknown as Generated)).toEqual([]);
    expect(coverage("zycopy", zyCopyHant(), ZYCOPY_GEN as unknown as Generated)).toEqual([]);
    const gen = { _src: BL_SRC, en: BL_EN, ja: BL_JA, ko: BL_KO, fr: BL_FR, de: BL_DE, es: BL_ES, pt: BL_PT } as unknown as Generated;
    expect(coverage("bazilib", BAZI_LIB_HANT, gen)).toEqual([]);
  });

  it("is open everywhere, and the 正緣畫像 with it", () => {
    expect(serviceLocales("bazi")).toEqual(LOCALES);
    expect(serviceLocales("zhengyuan")).toEqual(LOCALES);
  });

  it("the names are complete in every language, and Latin / Korean ones carry no Chinese", () => {
    for (const l of FOREIGN as Foreign[]) {
      const N = BAZI_NAMES[l];
      expect([N.stems.length, N.branches.length, N.animals.length, N.elements.length, N.stages.length, N.nayin.length, N.jie.length, N.pillars.length], l).toEqual([10, 12, 12, 5, 12, 30, 12, 4]);
      for (const k of TEN_KEYS) { expect(N.ten[k], `${l} ${k}`).toBeTruthy(); expect(N.tenShort[k], `${l} ${k}`).toBeTruthy(); }
      for (const k of SS_KEPT) expect(N.shensha[k], `${l} ${k}`).toBeTruthy();
      expect(new Set(Object.values(N.tenShort)).size, l).toBe(10);
      if (l !== "ja") expect(JSON.stringify(valuesOf(N)), l).not.toMatch(HAN); // (the keys are the Chinese names)
    }
    const F = bzName("en");
    expect(F.gz("甲子")).toBe("Jia Zi");
    expect(F.dm("甲")).toBe("Jia (Yang Wood)");
    expect(F.ten("七殺")).toBe("Seven Killings");
    expect(F.ten("劫財")).toBe("Rob Wealth");
    expect(F.stage("臨官")).toBe("Coming of Age");
    expect(F.nayinOf("甲子")).toBe("Metal in the Sea");
    expect(F.nayinOf("壬戌")).toBe("Water of the Great Sea");
    expect(F.geju("正官格")).toBe("Direct Officer structure");
    expect(F.geju("建禄格")).toMatch(/Jian Lu/);
    expect(F.ss("天乙贵人")).toBe("Heavenly Noble");
    expect(F.ss("丧门")).toBeNull(); // the omen stars stay on the Chinese chart only
    expect(F.rel("子丑合化土")).toBe("Zi–Chou combine into Earth");
    expect(F.rel("申子辰三合水局")).toBe("Shen–Zi–Chen Water frame");
    expect(F.rel("午冲日支子")).toBe("Wu and the day branch Zi: clash");
    expect(F.rel("天干甲己相合")).toBe("Jia–Ji combine into Earth");
    expect(F.relShort("半合水局")).toBe("half Water");
    expect(bzName("ja").gz("甲子")).toBe("甲子");
    expect(bzName("ko").dm("甲")).toBe("갑목");
    expect(bzName("de").dm("庚")).toBe("Geng (Yang-Metall)");
  });

  it("every relation the chart can print is said without Chinese outside Japanese", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const pick = (k: number) => BZ_PILLARS[(i * 7 + k * 13 + Math.floor(i / 5)) % 60]!;
      const r = relationsFull([pick(0), pick(1), pick(2), pick(3)]);
      for (const x of [...r.stems, ...r.branches, ...r.whole]) seen.add(x);
    }
    expect(seen.size).toBeGreaterThan(40);
    for (const l of ["en", "ko", "fr", "de", "es", "pt"] as Foreign[]) {
      const F = bzName(l);
      for (const x of seen) expect(F.rel(x), `${l} ${x}`).not.toMatch(HAN);
    }
  });

  it("the page words: no Chinese outside Japanese, the lists keep their items, the templates their placeholders", () => {
    for (const l of FOREIGN as Foreign[]) {
      const u = baziUi(l);
      expect(u.asks!.split("|").map((x) => x.split("~").length), l).toEqual([3, 3, 3, 3, 3, 3]);
      expect(u.asks!.match(/~jump~(geju|xiji|decade)/g)?.length, l).toBe(3);
      expect([u.branchNames, u.topics, u.topicQ].map((x) => x!.split(",").length), l).toEqual([12, 4, 4]);
      expect(u.jiaoyunF, l).toMatch(/\{a\}.*\{b\}|\{b\}.*\{a\}/);
      if (l === "ja") continue;
      // the keys of the 格局 / 喜用 / 強弱 lines are Chinese; their values are not
      expect(JSON.stringify(Object.values(u)), l).not.toMatch(HAN);
      expect(JSON.stringify(baziPage(l)), l).not.toMatch(HAN);
      expect(wordsOf(baziReportText(l)).join("\n"), l).not.toMatch(HAN); // (the 年書's marks, colours and directions are keyed in Chinese)
      expect(JSON.stringify(zyText(l)), l).not.toMatch(HAN);
    }
    expect(baziPage("zh").title).toBe("八字排盘");
    expect(baziUi("zh").solar).toBe("公历");
    expect(baziPage("en").paid.length).toBe(5);
  });

  it("the library reads in the language: the plain reading of a chart comes back translated", () => {
    for (const l of LATIN) {
      const t = baziText({ day: "甲子", stem: "甲", level: "偏強", favour: ["火"], decade: "正官", years: ["七殺"], nayin: ["海中金"], gods: ["正官"] }, l);
      expect(t.rizhu?.title, l).toBeTruthy();
      expect(JSON.stringify(valuesOf({ ...t, rizhu: { ...t.rizhu, pillar: "" } })), l).not.toMatch(HAN); // (keys and the 日柱 key stay Chinese)
      expect(bIn(l).rizhu["癸亥"]!.pillar).toBe("癸亥");
    }
    expect(bIn("de").stems["甲"]!.plain).toMatch(/Jia-Holz/);
    expect(bIn("de").stems["甲"]!.plain).not.toMatch(/(?<=[^.!?:] )Du\b/);
  });

  it("the 正緣畫像: the Chinese traits are as before; another language builds the same traits from its own copy", () => {
    const z = zhengyuanOf({ pillars: ["戊辰", "甲子", "丙寅", "甲午"], gender: "male" });
    const titai = z.traits.find((t) => t.key === "titai")!.text;
    expect(titai).toMatch(/^[^。]+。/);
    expect(titai).not.toMatch(/。。/);
    for (const l of FOREIGN as Foreign[]) {
      const zy = zhengyuanIn({ pillars: ["戊辰", "甲子", "丙寅", "甲午"], gender: "male" }, l);
      expect(Object.keys(zy.texts).sort(), l).toEqual(["dise", "qiyun", "shentai", "titai", "xiangchu", "xiangyu", "yuanfen"]);
      const chips = zyChipsIn(zyKeys({ pillars: ["戊辰", "甲子", "丙寅", "甲午"], gender: "male" }), l);
      if (l !== "ja") { expect(JSON.stringify(zy.texts), l).not.toMatch(HAN); expect(JSON.stringify(chips), l).not.toMatch(HAN); }
      expect(zy.texts.xiangyu, l).not.toMatch(/\{(pillar|scene|dir)\}/);
    }
  });

  it("a report for another language: the facts in its words, the rules for it, its lengths and checks", () => {
    const deep = factsFromBirth(n, "male", "deep", NOW);
    const love = factsFromBirth(n, "female", "love", NOW);
    for (const l of ["en", "ko", "fr", "de", "es", "pt"] as Foreign[]) {
      expect(JSON.stringify(bzFactsIn(deep, l)), l).not.toMatch(HAN);
      const { imagePrompt: _ip, ...loveFacts } = love; // (the picture's prompt is never sent with the facts)
      expect(JSON.stringify(bzFactsIn({ ...loveFacts, zhengyuan: zyFactsIn(love, l) }, l)), l).not.toMatch(HAN);
    }
    const rules = bzForeignRules("en", "love").join("\n");
    expect(rules).toMatch(/七殺 = Seven Killings/);
    expect(rules).toMatch(/never he or she/);
    expect(rules).not.toMatch(/台灣|繁體中文/);
    expect(DEEP_TASKS_FOR_TEST.A).toMatch(/480–720 characters/);
    expect(retargetLengths(DEEP_TASKS_FOR_TEST.A!, "en")).toMatch(/288–432 words/);
    // a chapter in English is measured in words
    const words = (k: number) => Array.from({ length: k }, () => "steady").join(" ");
    expect(shapeGroup("deep", "A", { geju: words(300), xingge: words(300), tianfu: words(300) }, deep, "en").ok).toBe(true);
    expect(shapeGroup("deep", "A", { geju: words(100), xingge: words(300), tianfu: words(300) }, deep, "en")).toEqual({ ok: false, why: "short:geju" });
    expect(partOffense("deep", { geju: "Your chart is accurate." }, "en")).toBe("banned:accurate");
    expect(partOffense("deep", { geju: "Your Day Master 甲 is strong." }, "en")).toBe("script:甲");
    expect(partOffense("love", { intro: "She tends to be calm." }, "en")).toBe("pronoun:She");
    expect(partOffense("love", { intro: "You may meet them at 28 years old." }, "en")).toMatch(/^timing:/);
    expect(bzForeignOffense("日主は甲です。", "ja")).toBeNull();
    expect(bzForeignOffense("偏官と七殺", "ja")).toBe("script:七殺");
    expect(partOffense("deep", { geju: "日主偏強，喜用火。" }, "zh-hant")).toBeNull(); // the Chinese check is unchanged
  });

  it("the letter of a report written in another language is in that language", () => {
    const t = baziReportText("fr");
    const m = buildBaziReportEmail({ kind: "love", url: "https://yaoflow.com/fr/bazi/r/x", foreign: { t: { subject: t.mail.subject.love, title: t.kindLabel.love, body: t.mail.body.love, button: t.mail.button, foot: t.mail.foot }, lang: "fr" } });
    expect(m.subject).toBe(t.mail.subject.love);
    expect(m.html).toMatch(/<html lang="fr">/);
    expect(m.text).not.toMatch(HAN);
  });

  it("the live check's small things: counts of one, the Korean particle, the punctuation around the words", () => {
    // 「Luck pillars begin 3 years 1 months 4 days」 on the live English chart
    const q = (l: string, y: number, m: number, d: number) => countWords(baziUi(l as Foreign).qiyun!.replace("{y}", String(y)).replace("{m}", String(m)).replace("{d}", String(d)), l);
    expect(q("en", 3, 1, 4)).toContain("3 years 1 month 4 days");
    expect(q("en", 1, 11, 1)).toContain("1 year 11 months 1 day");
    expect(q("de", 1, 1, 21)).toContain("1 Jahr 1 Monat 21 Tage");
    expect(q("es", 1, 1, 1)).toMatch(/1 año, 1 mes y 1 día/);
    expect(q("pt", 2, 1, 1)).toMatch(/2 anos, 1 mês e 1 dia/);
    expect(q("fr", 0, 1, 12)).toMatch(/0 an 1 mois 12 jours/);
    // 「경이(가)」: the particle follows the last syllable
    expect(josa("경이(가) 천간에")).toBe("경이 천간에");
    expect(josa("무이(가) 천간에")).toBe("무가 천간에");
    expect(josa("Geng appears")).toBe("Geng appears");
    // full-width marks stay with Japanese only
    expect(bzName("en").paren("65%")).toBe(" (65%)");
    expect(bzName("ko").colon).toBe(": ");
    expect(bzName("ja").paren("65%")).toBe("（65%）");
    expect(bzName("ja").list).toBe("、");
    // the day stem's cell in English no longer reads as the code F (= Friend)
    expect(baziUi("en").dmFemale).not.toMatch(/\(F\)/);
  });
});

/* ------------------------------------------------------------------ 10-30 进度表 128 ④ 紫微 */
import ZW_GEN from "../src/data/l10n/ziwei.json";
import ZL_SRC from "../src/data/l10n/ziweilib/_src.json";
import ZL_EN from "../src/data/l10n/ziweilib/en.json";
import ZL_JA from "../src/data/l10n/ziweilib/ja.json";
import ZL_KO from "../src/data/l10n/ziweilib/ko.json";
import ZL_FR from "../src/data/l10n/ziweilib/fr.json";
import ZL_DE from "../src/data/l10n/ziweilib/de.json";
import ZL_ES from "../src/data/l10n/ziweilib/es.json";
import ZL_PT from "../src/data/l10n/ziweilib/pt.json";
import { ZIWEI_HANT, ziweiPage, ziweiReportText, ziweiUi } from "../src/lib/mingli/ziwei/page-ui";
import { ZIWEI_LIB_HANT, zIn, ziweiText } from "../src/lib/mingli/ziwei/content";
import { ZIWEI_NAMES, zwName } from "../src/lib/mingli/ziwei/names";
import { GEJU } from "../src/lib/mingli/ziwei/geju";
import { zwCrossIn, zwFactsIn, zwForeignNote, zwForeignOffense, zwForeignRules, zwGejuIn, zwStarsIn } from "../src/lib/mingli/ziwei/report-foreign";
import { ZW_DEEP_TASKS, shapeZiweiDeep, ziweiFacts, zwPartOffense } from "../src/lib/mingli/ziwei/report";
import { buildZiweiReportEmail } from "../src/lib/email";

describe("128 ④ — 紫微 in all nine languages", () => {
  const n = normalizeBirth({ calendar: "solar", y: 1988, m: 11, d: 2, timeMode: "exact", h: 14, mi: 20, place: { id: "2950159", name: "Berlin", lat: 52.52, lon: 13.405, tz: "Europe/Berlin" } });
  const NOW = Date.UTC(2026, 9, 30);
  const facts = ziweiFacts(n, "male", "deep", NOW);

  it("the generated words cover every leaf: the pages and the library of the fourteen stars", () => {
    expect(coverage("ziwei", ZIWEI_HANT, ZW_GEN as unknown as Generated)).toEqual([]);
    const gen = { _src: ZL_SRC, en: ZL_EN, ja: ZL_JA, ko: ZL_KO, fr: ZL_FR, de: ZL_DE, es: ZL_ES, pt: ZL_PT } as unknown as Generated;
    expect(coverage("ziweilib", ZIWEI_LIB_HANT, gen)).toEqual([]);
  });

  it("is open everywhere", () => {
    expect(serviceLocales("ziwei")).toEqual(LOCALES);
  });

  it("the names: complete everywhere — pinyin in Latin languages, hangul in Korean, 新字体 kanji in Japanese", () => {
    for (const l of FOREIGN as Foreign[]) {
      const N = ZIWEI_NAMES[l];
      expect([N.major.length, N.minor.length, N.palace.length, N.palaceFull.length, N.bright.length, N.brightWord.length, N.mut.length, N.mutFull.length, N.mutGloss.length, N.five.length], l).toEqual([14, 14, 12, 12, 7, 7, 4, 4, 4, 5]);
      expect(new Set(N.palaceFull).size, l).toBe(12);
      if (l === "ja") expect(JSON.stringify(N)).not.toMatch(/[祿權陷德]/);
      else expect(JSON.stringify(N), l).not.toMatch(HAN);
      if (LATIN.includes(l)) expect(N.gloss, l).toHaveLength(14);
    }
    const Z = zwName("en");
    expect(Z.star("紫微")).toBe("Zi Wei");
    expect(Z.star("七杀")).toBe("Qi Sha"); // (iztro's 简体 key)
    expect(Z.star("天鉞")).toBe("Tian Yue");
    expect(Z.palaceFull("命宮")).toBe("Life Palace");
    expect(Z.palaceFull("官祿宮")).toBe("Career Palace");
    expect(Z.palace("僕役")).toBe("Friends");
    expect(Z.mutFull("化忌")).toBe("Hua Ji");
    expect(Z.five("金四局")).toBe("Metal 4");
    expect(Z.starBright("太陰", "廟")).toBe("Tai Yin (at its peak)");
    expect(Z.named("天姚")).toBe(false); // the 雜曜 stay on the Chinese board
    expect(zwName("ja").starBright("太陰", "陷")).toBe("太陰（陥）");
    expect(zwName("ja").mutFull("祿")).toBe("化禄");
    expect(zwName("ja").palaceFull("福德")).toBe("福徳宮");
    expect(zwName("ko").star("紫微")).toBe("자미");
    expect(zwName("ko").palaceFull("命宮")).toBe("명궁");
    expect(zwName("de").palaceFull("夫妻")).toBe("Partnerpalast");
    expect(zwName("fr").palaceFull("命宮")).toBe("palais de la Vie");
  });

  it("the page words: no Chinese outside Japanese, the lists keep their items, the templates their placeholders", () => {
    for (const l of FOREIGN as Foreign[]) {
      const u = ziweiUi(l);
      expect(u.branchNames!.split(","), l).toHaveLength(12);
      expect(u.topics!.split(","), l).toHaveLength(4);
      expect(u.borrowFrom, l).toContain("{s}");
      expect(ziweiReportText(l).ages, l).toMatch(/\{a\}.*\{b\}/);
      expect(ziweiPage(l).pairTitle, l).toMatch(/\{s\}.*\{p\}|\{p\}.*\{s\}/);
      if (l === "ja") continue;
      expect(JSON.stringify(Object.values(u)), l).not.toMatch(HAN);
      expect(JSON.stringify(ziweiPage(l)), l).not.toMatch(HAN);
      expect(JSON.stringify(valuesOf(ziweiReportText(l))), l).not.toMatch(HAN); // (the 同／異／平 and area keys stay Chinese)
    }
    expect(ziweiPage("zh").title).toBe("紫微斗数排盘");
    expect(ziweiUi("zh").solar).toBe("公历");
    expect(ziweiPage("en").paid).toHaveLength(4);
  });

  it("the 格局 names say what the pattern is, naming its stars in pinyin", () => {
    for (const l of LATIN) {
      const u = ziweiUi(l);
      for (const g of GEJU) expect(u[`gjn_${g.id}`], `${l} ${g.id}`).toMatch(/^[^㐀-鿿]+$/);
      expect(u["gjn_qisha-chaodou"], l).toContain("Qi Sha");
      expect(u["gjn_yingxing-rumiao"], l).toContain("Po Jun");
      expect(u["gjn_xiongsu-chaoyuan"], l).toContain("Lian Zhen");
      expect(u["gjn_shizhong-yinyu"], l).toContain("Ju Men");
      expect(JSON.stringify(u), l).not.toMatch(/Seven Kill|Sept Tueurs|Sieben Tötung|Siete Asesinos|Sete Assassinos|Greedy Wolf|Purple Star|Büro|Oficina|Escritório/);
    }
    expect(ziweiUi("ja")["gjn_shuanglu-chaoyuan"]).toBe("双禄朝垣格");
    expect(ziweiUi("de").s_five).toBe("Fünf-Elemente-Klasse");
  });

  it("the library reads in the language, keyed as the 繁體 one", () => {
    for (const l of LATIN) {
      const D = zIn(l);
      expect(Object.keys(D.pairs)).toHaveLength(168);
      expect(D.pairs["紫微|命宮"]!.star).toBe("紫微");
      const t = ziweiText({ pairs: [["紫微", "命宮"]], empty: ["夫妻"], mutagen: [["祿", "官祿"]], minor: ["左輔"], yearly: "財帛", monthly: "命宮" }, l);
      expect(Object.keys(t.pairs)).toEqual(["紫微|命宮"]);
      expect(JSON.stringify(valuesOf({ ...t, pairs: (Object.values(t.pairs) as Record<string, string>[]).map((p) => ({ ...p, star: "", palace: "" })) })), l).not.toMatch(HAN);
      expect(JSON.stringify([D.intro, D.faq]), l).not.toMatch(/Seven Kill|Sept Tueurs|Sieben Tötung|Siete Asesinos|Sete Assassinos/);
    }
    expect(zIn("zh-hant").pairs["紫微|命宮"]!.title).toBe(ZIWEI_LIB_HANT.pairs["紫微|命宮"]!.title);
  });

  it("a report for another language: the facts in its words, the 格局 and the 八字 rows, its rules and checks", () => {
    for (const l of ["en", "ko", "fr", "de", "es", "pt"] as Foreign[]) {
      expect(JSON.stringify(zwFactsIn(facts, l)), l).not.toMatch(HAN);
      for (const g of zwGejuIn(facts, l)) expect(JSON.stringify(g), `${l} ${g.id}`).not.toMatch(HAN);
      for (const c of zwCrossIn(facts, l)) expect(JSON.stringify([c.area, c.agree, c.ziwei, c.bazi, c.ziweiLevel, c.baziLevel]), l).not.toMatch(HAN);
      for (const p of facts.palaces) expect(zwStarsIn(p, facts, l), `${l} ${p.name}`).not.toMatch(HAN);
      const rules = zwForeignRules(l).join("\n");
      expect(rules, l).toContain(`官祿／官祿宮 = ${ZIWEI_NAMES[l].palaceFull[8]}`);
      expect(rules, l).toContain(`化忌 = ${ZIWEI_NAMES[l].mutFull[3]}`);
      expect(rules, l).not.toMatch(/台灣|繁體中文/);
    }
    expect(zwFactsIn(facts, "en").fiveClass).toBe(zwName("en").five(facts.fiveClass));
    // the concept words are the page's own, said inside a sentence (a Spanish trial wrote "Body Palace")
    expect(zwForeignRules("es").join("\n")).toContain("身宮 = palacio del Cuerpo");
    expect(zwForeignRules("de").join("\n")).toContain("四化 = die Vier Transformationen");
    expect(zwForeignRules("fr").join("\n")).toContain("五行局 = classe des Cinq Éléments");
    expect(zwForeignRules("ja", "qa").join("\n")).toMatch(/新字体/);
    // lengths in words for Latin languages
    expect(retargetLengths(ZW_DEEP_TASKS.A!, "en")).toContain("366–498 words");
    const words = (k: number) => Array.from({ length: k }, () => "steady").join(" ");
    expect(shapeZiweiDeep("A", { zonglan: words(400), minggong: words(400), shengong: words(300) }, facts, "en").ok).toBe(true);
    expect(shapeZiweiDeep("A", { zonglan: words(100), minggong: words(400), shengong: words(300) }, facts, "en")).toEqual({ ok: false, why: "short:zonglan" });
    // the checks
    expect(zwPartOffense("deep", { zonglan: "Your chart is accurate." }, facts, "en")).toMatch(/^banned/);
    expect(zwPartOffense("deep", { zonglan: "Zi Wei 紫微 sits here." }, facts, "en")).toMatch(/^script/);
    expect(zwPartOffense("deep", { guoqu: { intro: "Two decades lie behind you.", list: [{ ages: "2–11", text: "A calm start." }] } }, facts, "en")).toBeNull();
    expect(zwForeignOffense("Tu Body Palace está en el palacio del Bienestar.", "es")).toBe("english:Body Palace");
    expect(zwForeignOffense("Ambas em brightness atenuado.", "pt")).toBe("english:brightness");
    expect(zwForeignNote("english:Body Palace", "es")).toContain("Palacio del Cuerpo");
    expect(zwForeignOffense("太陰（陥）が福徳宮にあり、化禄と化権が巡ります。", "ja")).toBeNull(); // 紫微斗数 brightness in brackets is Japanese
    expect(zwForeignOffense("化祿が命宮に入ります。", "ja")).toBe("script:祿");
    expect(zwForeignOffense("七杀が疾厄宮にあります。", "ja")).toMatch(/^script:/);
    expect(zwForeignOffense("자미 Zi Wei가 명궁에 있습니다.", "ko")).toBe("latin:Wei");
    expect(zwForeignOffense("자미가 명궁에 있습니다.", "ko")).toBeNull();
    expect(foreignReportOffense("太陽（旺）", "ja")).toMatch(/^script/); // (the 星盤 check is as before)
  });

  it("the letter of a report written in another language is in that language", () => {
    for (const l of LATIN) {
      const t = ziweiReportText(l);
      const m = buildZiweiReportEmail({ kind: "deep", url: `https://yaoflow.com/${l}/ziwei/r/x`, foreign: { t: { subject: t.mail.subject, title: t.kindLabel, body: t.mail.body, button: t.mail.button, foot: t.mail.foot }, lang: l } });
      expect(m.subject).toBe(t.mail.subject);
      expect(m.html).toContain(`lang="${l}"`);
      expect(m.subject + m.text, l).not.toMatch(HAN);
    }
  });

  it("問這張盤 and 到期回來問你 speak the language for a 紫微 chart", () => {
    for (const l of LATIN) {
      expect(JSON.stringify(qaUi(l, "ziwei")), l).not.toMatch(HAN);
      expect(suggestedQuestions("ziwei", "abcdef123456", l).join(""), l).not.toMatch(HAN);
      expect(selfKindName("ziwei", l), l).not.toMatch(HAN);
      expect(selfChoices("ziwei", l).map((o) => o.label).join(""), l).not.toMatch(HAN);
    }
    // the suggested questions name the palaces as the chart does (the German ones said "Wealth-Palast")
    expect(suggestedQuestions("ziwei", "abcdef123456", "de", 8).join(" ")).not.toMatch(/Life|Wealth|Spouse|Travel|Fortune/);
    expect(suggestedQuestions("ziwei", "abcdef123456", "es", 8).join(" ")).toContain("palacio de la Pareja");
    expect(suggestedQuestions("ziwei", "abcdef123456", "ko", 8).join(" ")).toContain("부처궁");
    expect(suggestedQuestions("ziwei", "abcdef123456", "ja", 8).join(" ")).not.toMatch(/福德/);
  });

  it("the live check's small things: articles, particles, French spacing, the 五行局 and the English left in French", () => {
    expect(ziweiUi("en").mutIn).toBe("{m} in the {p}");
    expect(ziweiUi("fr").mutIn).toBe("{m} dans le {p}");
    expect(ziweiUi("es").f_empty).toMatch(/^El \{p\}/);
    expect(ziweiUi("de").f_trine).not.toMatch(/Wealth|Career/);
    expect(zwName("ko").josa(ziweiUi("ko").mutIn!.replace("{m}", "화기").replace("{p}", "관록궁"))).toBe("화기가 관록궁에");
    expect(zwName("ko").josa(ziweiUi("ko").mutIn!.replace("{m}", "화권").replace("{p}", "교우궁"))).toBe("화권이 교우궁에");
    expect(zwName("fr").colon).toBe(" : ");
    expect(bzName("fr").colon).toBe(" : ");
    expect(zwName("de").colon).toBe(": ");
    for (const l of ["fr", "de", "es", "pt"] as Foreign[]) {
      expect(ziweiUi(l).s_five, l).not.toMatch(/Bureau|Büro|Oficina|Escritório/);
      expect(ziweiReportText(l).headFive, l).not.toMatch(/Bureau|Büro|Oficina|Escritório/);
    }
    expect(JSON.stringify(ziweiPage("fr"))).not.toMatch(/\bpalaces\b/);
    expect(JSON.stringify(zIn("fr").minor)).not.toMatch(/\(an? [a-z]+ star|helper star/);
    expect(new Set(GEJU.map((g) => ziweiUi("pt")[`gjs_${g.id}`]!.replace(/, .*$/, ""))).size).toBe(1); // one name for the book
  });
});

/* ------------------------------------------------------------------ 10-30 进度表 128 ④ 合盤 */
import HP_GEN from "../src/data/l10n/hepan.json";
import { HEPAN_HANT, hepanT, hepanUiFor } from "../src/lib/mingli/hepan/page-ui";
import { hepanNames } from "../src/lib/mingli/hepan/names-data";
import { hpNameOf } from "../src/lib/mingli/hepan/names";
import { chipIn, coreRowsIn, factIn, koJosa, overviewIn, yearBaziIn, yearChipsIn } from "../src/lib/mingli/hepan/text-in";
import { HP_TA, foreignTask, hpFactsIn, hpForeignNote, hpForeignOffense, hpForeignRules } from "../src/lib/mingli/hepan/report-foreign";
import { HP_TASKS, hpPartOffense, hpPayload, shapeHepan } from "../src/lib/mingli/hepan/report";
import { pairFacts } from "../src/lib/mingli/hepan/facts";
import { cardParams, parseCardParams } from "../src/lib/mingli/hepan/card-params";
import { buildHepanReportEmail } from "../src/lib/email";
import type { BirthInput } from "../src/lib/mingli/birth/normalize";

describe("128 ④ — 合盤 in all nine languages", () => {
  const NOW = Date.UTC(2026, 9, 30);
  const TAIPEI = { id: "1668341", name: "Taipei", lat: 25.03, lon: 121.54, tz: "Asia/Taipei" };
  const birth = (y: number, m: number, d: number, h: number | null): BirthInput =>
    (h === null ? { calendar: "solar", y, m, d, timeMode: "unknown", place: TAIPEI } : { calendar: "solar", y, m, d, timeMode: "exact", h, mi: 15, place: TAIPEI }) as BirthInput;
  const pair = (a: BirthInput, b: BirthInput) => pairFacts({ input: a, gender: "male" }, { input: b, gender: "female" }, { now: NOW, year: true });
  const f = pair(birth(1990, 3, 14, 9), birth(1992, 8, 27, 21));
  const noTime = pair(birth(1985, 12, 2, 6), birth(1996, 5, 30, null));
  const NOT_JA = ["en", "ko", "fr", "de", "es", "pt"] as Foreign[];
  const H = (l: Foreign) => hpNameOf(hepanNames(l));
  const LEFT_PARTICLE = /[가-힣)）](이\(가\)|을\(를\)|은\(는\)|과\(와\)|와\(과\))/;

  it("the generated words cover every leaf", () => {
    expect(coverage("hepan", HEPAN_HANT, HP_GEN as unknown as Generated)).toEqual([]);
  });

  it("is open everywhere", () => {
    expect(serviceLocales("hepan")).toEqual(LOCALES);
    expect(serviceOpenIn("hepan", "ko")).toBe(true);
  });

  it("the page words: no Chinese outside Japanese, four suggested questions, the other person never 「TA」", () => {
    for (const l of FOREIGN as Foreign[]) {
      const T = hepanT(l);
      expect(T.asks!.split(",").filter(Boolean), l).toHaveLength(4);
      expect(T.ta, l).toBe(T.taName);
      expect(T.card_lead, l).toBeTruthy();
      if (l === "ja") { expect(JSON.stringify(T), l).not.toMatch(/你|們|對方|TA\b/); continue; }
      expect(JSON.stringify(Object.values(T)), l).not.toMatch(HAN);
      expect(JSON.stringify(Object.values(T)), l).not.toMatch(/\bTA\b/);
    }
    // the Chinese pages keep their own words, 简体 converted
    expect(hepanUiFor("zh-hant").head).toBe("合盤");
    expect(hepanUiFor("zh").head).toBe("合盘");
    // the card is the sharer's: first person
    expect(hepanT("en").card_lead).toBe("Me × Them");
    expect(hepanT("en").card_dm_aFeedsB).toMatch(/^My /);
  });

  it("every fact of a pair is said in the language, with nothing left in Chinese", () => {
    for (const x of [f, noTime]) {
      for (const l of NOT_JA) {
        const T = hepanT(l), N = H(l);
        for (const fact of x.facts) {
          const s = factIn(x, fact, T, N);
          expect(s, `${l} ${fact.id}: ${fact.text}`).not.toMatch(HAN);
          expect(s, `${l} ${fact.id}`).not.toMatch(/\{\w+\}/);
          expect(chipIn(x, fact, T, N), `${l} ${fact.id}`).not.toMatch(HAN);
          if (l === "ko") expect(s, fact.id).not.toMatch(LEFT_PARTICLE);
        }
        const ov = overviewIn(x, T, N);
        expect(JSON.stringify(ov), l).not.toMatch(HAN);
        expect(ov.themes.length, l).toBe(Math.min(2, x.themes.length));
        for (const [label, get] of coreRowsIn(T, N)) { expect(label, l).toBeTruthy(); expect(get(x.a) + get(x.b), `${l} ${label}`).not.toMatch(HAN); }
        if (x.year) for (const c of yearChipsIn(x.year, T, N, l)) { expect(c, `${l} ${c}`).not.toMatch(HAN); if (l === "ko") expect(c).not.toMatch(LEFT_PARTICLE); }
      }
      // Japanese keeps its own kanji words — but no Chinese pronoun or 「TA」
      for (const fact of x.facts) expect(factIn(x, fact, hepanT("ja"), H("ja")), fact.id).not.toMatch(/你|TA|對方|們/);
    }
    expect(noTime.ziwei).toBeNull();
  });

  it("this year's 八字 lines: every one the facts can write is said in the language", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 16; i++) {
      const x = pair(birth(1960 + i * 2, 1 + (i % 12), 1 + ((i * 7) % 28), 10), birth(1975 + ((i * 3) % 30), 1 + ((i * 5) % 12), 1 + ((i * 11) % 28), 16));
      for (const s of [...(x.year?.bazi.a ?? []), ...(x.year?.bazi.b ?? [])]) seen.add(s);
    }
    expect(seen.size).toBeGreaterThan(8);
    for (const l of NOT_JA) {
      const T = hepanT(l), N = H(l);
      for (const s of seen) expect(yearBaziIn(s, T, N), `${l} ${s}`).not.toMatch(HAN);
    }
  });

  it("the report for another language: its facts, tasks, rules and checks", () => {
    for (const l of NOT_JA) {
      expect(JSON.stringify(hpFactsIn(f, l, true)), l).not.toMatch(HAN);
      const rules = hpForeignRules(l, true).join("\n");
      expect(rules, l).toContain(HP_TA[l]);
      expect(rules, l).not.toMatch(/台灣|繁體中文/);
      const p = JSON.parse(hpPayload("E", f, null, l)) as { task: string; year?: unknown; facts: unknown };
      expect(p.task, l).not.toMatch(/國曆/);
      expect(p.year, l).toBeTruthy();
      expect(JSON.stringify(p.facts), l).not.toMatch(HAN);
    }
    expect(JSON.parse(hpPayload("A", f, null, "en")).year).toBeUndefined();
    expect(foreignTask(HP_TASKS.qa!)).toContain("casting a hexagram with the Yijing");
    // each chapter by its title on the page (a Japanese trial wrote 「底色」 from the task), the 生肖 by the page's word
    expect(foreignTask(HP_TASKS.A!, "ja")).toContain(`dise (${hepanT("ja").ch_dise}`);
    expect(foreignTask(HP_TASKS.A!, "ja")).not.toMatch(/底色/);
    expect(foreignTask(HP_TASKS.qa!, "en")).toContain(`"${hepanT("en").qaTitle}"`);
    expect(hpForeignRules("ja", false).join("\n")).toContain(`生肖 = ${hepanT("ja").card_zodiac}`);
    expect(hpForeignOffense("あなたの生肖はうまです。", "ja")).toBe("script:生肖");
    expect(hpForeignRules("fr", false).join("\n")).toMatch(/GENDER: .*il, elle, lui/);
    expect(hpForeignRules("en", false).join("\n")).not.toMatch(/GENDER:/);
    expect(hpForeignRules("en", false).join("\n")).toContain(`忌 = ${zwName("en").mutFull("忌")}`);
    expect(retargetLengths(HP_TASKS.A!, "en")).toMatch(/words/);
    // lengths in words for Latin languages
    const words = (k: number) => Array.from({ length: k }, () => "steady").join(" ");
    expect(shapeHepan("A", { dise: words(420), xiyin: words(380) }, "en").ok).toBe(true);
    expect(shapeHepan("A", { dise: words(60), xiyin: words(380) }, "en")).toEqual({ ok: false, why: "short:dise" });
    // the checks: a verdict, a score, he / she, 「TA」, English in Japanese or Korean
    expect(hpForeignOffense("You two are soulmates.", "en")).toBe("verdict:soulmates");
    expect(hpForeignOffense("Your compatibility is 85%.", "en")).toMatch(/^verdict:/);
    expect(hpForeignOffense("She tends to wait before she speaks.", "en")).toBe("pronoun:She");
    expect(hpForeignOffense("TA aime les soirées calmes.", "fr")).toBe("ta:TA");
    expect(hpForeignOffense("Ihr seid füreinander bestimmt.", "de")).toMatch(/^verdict:/);
    expect(hpForeignOffense("相手とはソウルメイトです。", "ja")).toMatch(/^verdict:/);
    expect(hpForeignOffense("相手のSunは獅子座です。", "ja")).toBe("latin:Sun");
    expect(hpForeignOffense("두 사람은 천생연분입니다.", "ko")).toMatch(/^verdict:/);
    expect(hpForeignOffense("They tend to plan ahead, and you tend to improvise.", "en")).toBeNull();
    // the trial's two: the Japanese 四柱推命 六合 is kept (the 星盤 check still names it); 破 is no longer said as a breakup
    expect(hpForeignOffense("あなたの日支の寅と相手の日支の亥は六合です。", "ja")).toBeNull();
    expect(foreignReportOffense("あなたの日支の寅と相手の日支の亥は六合です。", "ja")).toBe("script:六合");
    expect(hepanT("fr").r_po).toBe("brisure");
    expect(hepanT("es").r_po).toBe("quiebre");
    expect(hpForeignOffense("Entre vos branches du jour, il y a une rupture légère et une harmonie.", "fr")).toBeNull();
    expect(hpForeignOffense("Cela annonce une rupture amoureuse.", "fr")).toMatch(/^verdict:/);
    expect(hpForeignOffense("Hay una ruptura de la pareja en el horizonte.", "es")).toMatch(/^verdict:/);
    expect(hpForeignNote("pronoun:She", "en")).toMatch(/they \/ them/);
    expect(hpPartOffense({ dise: "Their Day Master 甲 is strong." }, f, "en")).toMatch(/^script/);
    expect(hpPartOffense({ dise: "They tend to plan ahead, and you tend to improvise." }, f, "en")).toBeNull();
  });

  it("the letter, the card and the Korean particles", () => {
    for (const l of LATIN) {
      const T = hepanT(l);
      const m = buildHepanReportEmail({ url: `https://yaoflow.com/${l}/hepan/r/x`, foreign: { t: { subject: T.mail_subject!, title: T.mail_title!, body: T.mail_body!, button: T.mail_button!, foot: T.mail_foot! }, lang: l, locale: l } });
      expect(m.subject, l).toBe(T.mail_subject);
      expect(m.html, l).toContain(`lang="${l}"`);
      expect(m.subject + m.text, l).not.toMatch(HAN);
    }
    // the card keeps the page's language; anything else is drawn in 繁體
    expect(cardParams(f, "ja").get("l")).toBe("ja");
    expect(parseCardParams(cardParams(f, "de"))?.locale).toBe("de");
    const q = cardParams(f, "de"); q.set("l", "xx");
    expect(parseCardParams(q)?.locale).toBe("zh-hant");
    // 이(가) after a bracket follows the word before it
    expect(koJosa("화록(태양)이(가) 명궁에", H("ko"))).toBe("화록(태양)이 명궁에");
    expect(koJosa("상대의 띠 말과(와) 나의 일지 자", H("ko"))).toBe("상대의 띠 말과 나의 일지 자");
    expect(koJosa("상대의 띠 소과(와) 나의 일지 자", H("ko"))).toBe("상대의 띠 소와 나의 일지 자");
    expect(koJosa("Rat(子)이(가)", H("en"))).toBe("Rat(子)이(가)"); // other languages pass through
  });
});

import NS_GEN from "../src/data/l10n/nianshu.json";
import { NS_FOREIGN_HANT, nsForeignText } from "../src/lib/mingli/nianshu/foreign-text";
import { localCustom, localCustomLine, nextSamjae, samjae, yakudoshi } from "../src/lib/mingli/nianshu/local-custom";
import { NS_TASKS, nsForeignOffense, nsForeignRules, nsForeignTasks, nsPayload, shapeNianshu } from "../src/lib/mingli/nianshu/report";
import { bzBookWords, bzForeignBookRules } from "../src/lib/mingli/bazi/book-foreign";
import { zwForeignBookRules } from "../src/lib/mingli/ziwei/book-foreign";
import { asBookWords, asForeignBookRules } from "../src/lib/mingli/astro/book-foreign";
import { bookPayloadIn, shapeBook } from "../src/lib/mingli/bazi/report";
import { zwBookPayloadIn } from "../src/lib/mingli/ziwei/report";
import { asBookPayloadIn, astroFacts } from "../src/lib/mingli/astro/report";
import { TAI_SUI } from "../src/lib/mingli/bazi/report-foreign";
import { bookKeyword } from "../src/lib/l10n/book-guard";
import { dayDateRe, dayIn, dropDays, mdIn, monthIn } from "../src/lib/l10n/dates";
import { buildKeyMonthLetter, type KeyMonth } from "../src/lib/milestone-letter";
import { keyMonthSpanIn } from "../src/lib/self-revisit";
import { buildNianshuEmail } from "../src/lib/email";

describe("128 ④-5 — the 年書 in all nine languages", () => {
  const n = normalizeBirth({ calendar: "solar", y: 1987, m: 6, d: 18, timeMode: "exact", h: 7, mi: 45, place: { id: "1850147", name: "Tokyo", lat: 35.6895, lon: 139.6917, tz: "Asia/Tokyo" } });
  const NOW = Date.UTC(2026, 9, 30);
  const bz = factsFromBirth(n, "female", "year", NOW, 2027);
  const zw = ziweiFacts(n, "female", "year", NOW, 2027);
  const as = astroFacts(n, "year", NOW, 2027);
  const NOT_JA = ["en", "ko", "fr", "de", "es", "pt"] as Foreign[];
  const words = (k: number) => Array.from({ length: k }, () => "steady").join(" ");

  it("the generated words cover every leaf", () => {
    expect(coverage("nianshu", NS_FOREIGN_HANT, NS_GEN as unknown as Generated)).toEqual([]);
  });

  it("is open everywhere, by one name per language", () => {
    expect(serviceLocales("nianshu")).toEqual(LOCALES);
    const svc = SERVICES.find((s) => s.id === "nianshu")!;
    for (const l of FOREIGN as Foreign[]) {
      const T = nsForeignText(l);
      expect(serviceText(svc, l).label, l).toBe(T.ui.head);
      expect(T.ui.kindLabel, l).toBe(T.ui.head);
      expect(selfKindName("nianshu", l), l).toBe(T.ui.head);
    }
    expect(serviceText(svc, "zh").label).toBe("三合一年书");
    expect(nsForeignText("ja").ui.head).toBe("年運レポート");
    expect(nsForeignText("ko").ui.head).toBe("연간 운세 책");
  });

  it("the page words: no Chinese outside Japanese, no 太歲 anywhere, the placeholders kept", () => {
    // the words only (the marks are keyed by their 八字 names)
    for (const l of FOREIGN as Foreign[]) {
      const T = nsForeignText(l), all = wordsOf(T).join("\n");
      expect(all, l).not.toMatch(TAI_SUI);
      if (l !== "ja") expect(all, l).not.toMatch(HAN);
      else expect(all, l).not.toMatch(/年書|你|們/);
      expect(T.ui.earlyUntil, l).toContain("{d}");
      expect(T.km.p1, l).toContain("{m}");
      expect(T.rev.label, l).toContain("{y}");
    }
    // the 八字 flags are said, never named in 干支
    for (const l of NOT_JA) for (const v of Object.values(nsForeignText(l).km.flag)) expect(v, l).not.toMatch(HAN);
  });

  it("the year's custom by market: 厄年 for Japanese readers, 삼재 for Korean ones, none elsewhere", () => {
    expect(yakudoshi(42, "male")).toEqual({ kind: "honyaku", honAge: 42, big: true });
    expect(yakudoshi(41, "male")).toEqual({ kind: "maeyaku", honAge: 42, big: true });
    expect(yakudoshi(26, "male")).toEqual({ kind: "atoyaku", honAge: 25, big: false });
    expect(yakudoshi(33, "female")).toEqual({ kind: "honyaku", honAge: 33, big: true });
    expect(yakudoshi(37, "female")!.big).toBe(false);
    expect(yakudoshi(30, "male")).toBeNull();
    expect(yakudoshi(61, "female")!.kind).toBe("honyaku");
    const ja = localCustom("ja", { year: 2027, kazoe: 42, gender: "male", birthBranch: "卯", yearBranch: "未" })!;
    expect(ja.title).toBe("厄年");
    expect(ja.paras[0]).toContain("数え年42歳");
    expect(ja.paras[0]).toContain("大厄");
    expect(localCustom("ja", { year: 2027, kazoe: 30, gender: "male", birthBranch: "卯", yearBranch: "未" })!.paras[0]).toContain("あたりません");
    // 2027 丁未: the 亥卯未 group is in its third 삼재 year (날삼재); 2026 丙午 its second
    expect(samjae("卯", "未")).toEqual({ step: 2, years: "巳午未" });
    expect(samjae("亥", "午")!.step).toBe(1);
    expect(samjae("子", "未")).toBeNull();
    expect(nextSamjae("子", 2027)).toBe(2034);
    const ko = localCustom("ko", { year: 2027, kazoe: 41, gender: "female", birthBranch: "卯", yearBranch: "未" })!;
    expect(ko.title).toBe("삼재");
    expect(ko.paras[0]).toContain("날삼재");
    expect(ko.paras[0]).not.toMatch(HAN);
    expect(localCustom("ko", { year: 2027, kazoe: 41, gender: "female", birthBranch: "子", yearBranch: "未" })!.paras[0]).toContain("2034년부터 2036년까지");
    for (const l of ["en", "fr", "de", "es", "pt"]) { expect(localCustom(l, { year: 2027, kazoe: 41, gender: "female", birthBranch: "卯", yearBranch: "未" }), l).toBeNull(); expect(localCustomLine(l), l).toBeNull(); }
    expect(localCustomLine("ja")).toContain("厄年");
    expect(localCustomLine("ko")).toContain("삼재");
    // a custom and a reference: no ritual to buy, no forecast
    for (const c of [ja, ko]) expect(JSON.stringify(c)).not.toMatch(/化解|改運|開運|お守り|부적|굿/);
    // and no claim that some part of the book is accurate (the first notes said 「確かです」／「정확합니다」)
    for (const c of [ja, ko]) expect(foreignReportOffense(c.note, c === ja ? "ja" : "ko")).toBeNull();
    expect(JSON.stringify([ja, ko])).not.toMatch(/確か|正確|정확/);
  });

  it("dates are written each language's way, and a day of the month is caught where only months may be named", () => {
    expect(dayIn("en", 2027, 1, 31)).toBe("Jan 31");
    expect(dayIn("ja", 2027, 1, 31)).toBe("1月31日");
    expect(dayIn("ko", 2027, 1, 31)).toBe("1월 31일");
    expect(dayIn("de", 2027, 1, 31)).toBe("31. Jan.");
    expect(monthIn("fr", 3)).toBe("mars");
    expect(monthIn("es", 3)).toBe("marzo");
    expect(mdIn("en", "1/5", 2027, true)).toBe("Jan 5");
    expect(mdIn("en", "2026/12/7", 2027)).toBe("Dec 7, 2026");
    expect(keyMonthSpanIn("en", 2027, "3/6", Date.UTC(2027, 3, 5))).toBe("Mar 6 – Apr 4");
    expect(keyMonthSpanIn("ja", 2027, "3/6", Date.UTC(2027, 3, 5))).toBe("3月6日〜4月4日");
    expect(keyMonthSpanIn("en", 2027, "1/5", Date.UTC(2028, 1, 4))).toBe("Jan 5 – Feb 3");
    const hit = (l: Foreign, s: string) => dayDateRe(l).test(s);
    expect(hit("en", "On March 5 you sign.")).toBe(true);
    expect(hit("en", "the 5th of March")).toBe(true);
    expect(hit("en", "In March, things settle.")).toBe(false);
    expect(hit("en", "May 2027 is busy.")).toBe(false);
    expect(hit("fr", "Le 1er mars, signez.")).toBe(true);
    expect(hit("fr", "En mars, ralentissez.")).toBe(false);
    expect(hit("de", "Am 5. März unterschreibst du.")).toBe(true);
    expect(hit("es", "El 5 de marzo firmas.")).toBe(true);
    expect(hit("pt", "Em 5 de março você assina.")).toBe(true);
    expect(hit("ja", "3月5日に署名します。")).toBe(true);
    expect(hit("ja", "3月は落ち着きます。")).toBe(false);
    expect(hit("ko", "3월 5일에 서명합니다.")).toBe(true);
    expect(hit("ko", "3월에는 차분합니다.")).toBe(false);
    // what the writer of the 年書's chapters reads keeps the month and loses the day
    expect(dropDays("es", "el eclipse del 6 de agosto y el 10 de agosto")).toBe("el eclipse del agosto y el agosto");
    expect(dropDays("en", "On March 5 and the 6th of May; May 2027 stays")).toBe("On March and the May; May 2027 stays");
    expect(dropDays("de", "Am 5. März")).toBe("Am März");
    expect(dropDays("fr", "le 1er mars")).toBe("le mars");
    expect(dropDays("ja", "1月6日からの月")).toBe("1月からの月");
    expect(dropDays("ko", "3월 5일에")).toBe("3월에");
  });

  it("the three year reports' payloads carry no Chinese outside Japanese and no 太歲", () => {
    const groups = ["ov", "m1", "m2", "m3", "m4", "ar", "ar2", "gx", "qa"];
    for (const l of FOREIGN as Foreign[]) {
      const ps = [
        ...groups.map((g) => [`bazi ${g}`, bookPayloadIn(g, bz, bz.book!, "Is this a good year to move?", l)]),
        ...groups.map((g) => [`ziwei ${g}`, zwBookPayloadIn(g, zw, zw.book!, null, l)]),
        ...["ov", "m1", "m4", "js", "ecl", "ar", "ar2", "qa"].map((g) => [`astro ${g}`, asBookPayloadIn(g, as, as.book!, null, l)]),
      ] as [string, string][];
      for (const [what, p] of ps) {
        const { task, question: _q, ...facts } = JSON.parse(p) as Record<string, unknown>;
        expect(task, `${l} ${what}`).toBeTruthy();
        expect(JSON.stringify(facts), `${l} ${what}`).not.toMatch(/taisui|Tai ?Sui|太歲|太歳/i);
        if (l === "ja") continue;
        expect(JSON.stringify(facts), `${l} ${what}`).not.toMatch(HAN);
        expect(String(task), `${l} ${what}`).not.toMatch(HAN);
      }
    }
    // an eclipse on a natal point is said as one (the facts write 「合本命上升」, 「沖本命太陽」)
    const W = asBookWords("en", 2027);
    expect(W.touch("合本命上升")).toBe("natal Ascendant");
    expect(W.touch("沖本命太陽")).toBe("natal Sun (opposition)");
    expect(asBookWords("fr", 2027).touch("合本命月亮")).toBe("Lune natale");
    // the months are labelled by their first day in the language's writing
    expect(bzBookWords("en").label({ start: "3/6", term: "惊蛰" }, 2027)).toMatch(/Mar 6/);
    for (const l of NOT_JA) {
      for (const r of [bzForeignBookRules(l), zwForeignBookRules(l), asForeignBookRules(l)]) {
        expect(r.join("\n"), l).toContain("Never quote a level number");
        expect(r.join("\n"), l).not.toMatch(/台灣|繁體中文/);
      }
    }
  });

  it("a year report's chapter in another language is measured in its own units", () => {
    const ov = { keyword: "Steady ground", verdict: words(420), keyMonths: { smooth: words(110), slow: words(110), pivot: words(110) } };
    expect(shapeBook("ov", ov, bz.book!, "en").ok).toBe(true);
    expect(shapeBook("ov", { ...ov, keyword: "A very long keyword for a year" }, bz.book!, "en").ok).toBe(false);
    expect(shapeBook("ov", { ...ov, verdict: words(60) }, bz.book!, "en")).toEqual({ ok: false, why: "short:verdict" });
    expect(bookKeyword("“Grounding.”", "en")).toBe("Grounding");
    expect(bookKeyword("Change of track", "en")).toBe("Change of track");
    expect(bookKeyword("Ordnung, Ruhe", "de")).toBeNull();
    expect(bookKeyword("根を張る", "ja")).toBe("根を張る");
    expect(bookKeyword("뿌리내리기", "ko")).toBe("뿌리내리기");
  });

  it("the 年書's own chapters: the rules, the tasks, the payload and the checks in the page's language", () => {
    for (const l of NOT_JA) {
      const rules = nsForeignRules(l).join("\n"), tasks = nsForeignTasks(l);
      expect(rules + JSON.stringify(tasks), l).not.toMatch(HAN);
      expect(rules, l).not.toMatch(/台灣|繁體中文/);
      expect(tasks.J, l).toContain(monthIn(l, 1));
      expect(Object.keys(tasks).sort()).toEqual(["J", "X", "Z", "qa"]);
    }
    expect(nsForeignTasks("en").J).toContain("q1 = January – March");
    expect(nsForeignTasks("ja").J).toContain("q1 = 1月〜3月");
    expect(nsForeignRules("en").join("\n")).toContain("Nothing about the year of one's own zodiac animal (Tai Sui)");
    const readings = { bazi: { keyword: "Steady ground", verdict: "A year to build." }, ziwei: { keyword: "Roots", verdict: "The career palace lights up." }, astro: { keyword: "Patience", verdict: "Saturn asks for structure." } } as Parameters<typeof nsPayload>[2];
    const nf = { year: 2027, bazi: bz };
    const p = JSON.parse(nsPayload("Z", nf, readings, null, "en")) as { task: string; yearGz: string; year: number };
    expect(p.task).toBe(nsForeignTasks("en").Z);
    expect(p.year).toBe(2027);
    expect(p.yearGz).not.toMatch(HAN);
    expect(p.yearGz).toBe(bzName("en").gz(bz.years[0]!.gz));
    expect(JSON.parse(nsPayload("Z", nf, readings, null, "zh-hant")).task).toBe(NS_TASKS.Z);
    expect(JSON.parse(nsPayload("qa", nf, readings, "Should I move?", "fr")).question).toBe("Should I move?");
    const dated = { ...readings, astro: { keyword: "Patience", verdict: "The eclipse on August 2 marks a turn." } };
    expect(JSON.parse(nsPayload("Z", nf, dated, null, "en")).astro.verdict).toBe("The eclipse on August marks a turn.");
    // lengths in words for Latin languages
    const z = { keyword: "Steady ground", zong: words(450), tong: words(320), yi: words(260) };
    expect(shapeNianshu("Z", z, "en").ok).toBe(true);
    expect(shapeNianshu("Z", { ...z, zong: words(100) }, "en")).toEqual({ ok: false, why: "short:zong" });
    expect(shapeNianshu("Z", { ...z, keyword: "Grounding, roots" }, "en")).toEqual({ ok: false, why: "keyword" });
    expect(shapeNianshu("X", { areas: { career: words(260), money: words(220), love: words(220), rhythm: words(180), people: words(180) }, jianyi: [words(80), words(80), words(80)] }, "en").ok).toBe(true);
    // the checks: a claim of accuracy, 太歲, a day of the month, English inside Japanese or Korean
    expect(nsForeignOffense({ zong: "This reading is accurate." }, "en")).toMatch(/^banned:/);
    expect(nsForeignOffense({ zong: "It is your Tai Sui year." }, "en")).toBe("banned:Tai Sui");
    expect(nsForeignOffense({ seasons: { q1: "On March 5 you sign the lease." } }, "en")).toBe("date:March 5");
    expect(nsForeignOffense({ zong: "In March, things settle; by May they move." }, "en")).toBeNull();
    expect(nsForeignOffense({ zong: "Le 1er mars, tout bouge." }, "fr")).toBe("date:1er mars");
    expect(nsForeignOffense({ zong: "3月5日に動きがあります。" }, "ja")).toBe("date:3月5日");
    expect(nsForeignOffense({ zong: "今年のkeywordは整理です。" }, "ja")).toBe("latin:keyword");
    expect(nsForeignOffense({ zong: "3월에는 차분하게 지내세요." }, "ko")).toBeNull();
    expect(nsForeignOffense({ zong: "올해는 태세를 갖추는 해입니다." }, "ko")).toBeNull(); // 태세 is also 態勢
    // Japanese 「〜に当たります」 is "falls on / corresponds to" (a trial's 星盤 chapter was sent back for it); a claim of
    // accuracy is still caught
    expect(foreignReportOffense("天干は正官に当たります。", "ja")).toBeNull();
    expect(foreignReportOffense("この読みはよく当たります。", "ja")).toMatch(/^banned:/);
    expect(foreignReportOffense("占いが当たる年です。", "ja")).toMatch(/^banned:/);
  });

  it("the letters: ready, and a key month beginning — in the book's language", () => {
    for (const l of LATIN) {
      const T = nsForeignText(l).mail;
      const m = buildNianshuEmail({ url: `https://yaoflow.com/${l}/nianshu/r/x`, foreign: { t: { subject: T.readySubject, title: T.readyTitle, body: T.readyBody, button: T.readyButton, foot: T.readyFoot }, lang: l, locale: l } });
      expect(m.subject, l).toBe(T.readySubject);
      expect(m.html, l).toContain(`lang="${l}"`);
      expect(m.subject + m.text, l).not.toMatch(HAN);
    }
    const km: KeyMonth = { kind: "slow", i: 1, flags: ["冲日支", "天乙贵人"], month: { i: 1, term: "惊蛰", start: "3/6", gz: "癸卯", stemEl: "水", branchEl: "木", stemTen: "正财", branchTen: "伤官", score: 1.5, level: 2, tags: [] } as unknown as KeyMonth["month"] };
    const site = "https://yaoflow.com", end = Date.UTC(2027, 3, 5);
    const en = buildKeyMonthLetter({ year: 2027, km, token: "abc", monthEndUtc: end }, "en", site, "a@example.com");
    expect(en.subject).toBe(`Year Book 2027: a key month has arrived – ${nsForeignText("en").km.kind.slow}`);
    expect(en.html).toContain('lang="en"');
    expect(en.html).toContain(`${site}/en/nianshu/r/abc?c=km-letter`);
    expect(en.text).toContain("(Mar 6 – Apr 4)");
    expect(en.text).toContain(`- ${nsForeignText("en").km.flag["冲日支"]}`);
    expect(en.subject + en.text).not.toMatch(HAN);
    const de = buildKeyMonthLetter({ year: 2027, km, token: "abc", monthEndUtc: end }, "de", site, "a@example.com");
    expect(de.text.split("\n")[1]).toMatch(/^Der Monat/); // the title starts with a capital; inside a sentence it does not
    expect(de.text).toContain("„der Monat");
    const ko = buildKeyMonthLetter({ year: 2027, km, token: "abc", monthEndUtc: end }, "ko", site, "a@example.com");
    expect(ko.text).not.toMatch(/\(으\)로|[㐀-鿿]/);
    expect(ko.text).toContain("3월 6일~4월 4일");
    // the Chinese letter is as before
    expect(buildKeyMonthLetter({ year: 2027, km, token: "abc" }, "zh-hant", site, "a@example.com").subject).toBe("年書 2027：惊蛰月到了——全年最該放慢的月份");
  });
});

import JB_GEN from "../src/data/l10n/jiaobei.json";
import YSP_GEN from "../src/data/l10n/yunshipage.json";
import YS_GEN from "../src/data/l10n/yunshi.json";
import HS_GEN from "../src/data/l10n/horoscope.json";
import { JB_HANT, jbText, jiaobeiUiIn } from "../src/lib/jiaobei-text";
import { YS_PAGE_HANT, animalsOnly, ysPage, ysStar, ysZodiac } from "../src/lib/mingli/yunshi/foreign-text";
import { H as HOROSCOPE, HOUSE_TIER, horoscopeFor, moonOn, starDatesIn, starNameIn, starOfBirth } from "../src/lib/mingli/yunshi/horoscope";
import { C as ZODIAC_C, SIGNS as Z_SIGNS, yunshiFor } from "../src/lib/mingli/yunshi/zodiac";

describe("128 ⑤ — 擲筊 and 每日運勢 in all nine languages", () => {
  it("the generated words cover every leaf", () => {
    expect(coverage("jiaobei", JB_HANT, JB_GEN as unknown as Generated)).toEqual([]);
    expect(coverage("yunshipage", YS_PAGE_HANT, YSP_GEN as unknown as Generated)).toEqual([]);
    expect(coverage("yunshi", ZODIAC_C, YS_GEN as unknown as Generated, (p) => /\.branch$/.test(p))).toEqual([]);
    expect(coverage("horoscope", HOROSCOPE, HS_GEN as unknown as Generated)).toEqual([]);
  });

  it("both are open everywhere", () => {
    expect(serviceLocales("jiaobei")).toEqual(LOCALES);
    expect(serviceLocales("yunshi")).toEqual(LOCALES);
  });

  it("擲筊: one name per result in each language, no Chinese outside Japanese", () => {
    for (const l of FOREIGN as Foreign[]) {
      const T = jbText(l), ui = jiaobeiUiIn(l);
      expect(ui.signs.sheng.name, l).toBe(T.signs.sheng.name);
      expect(ui.examples.length, l).toBe(3);
      if (l === "ja") continue;
      expect(wordsOf(T).join("\n"), l).not.toMatch(HAN);
      if (l !== "en") expect(wordsOf(T).join("\n"), l).not.toMatch(/Laughing/); // (a first run left the English name in Spanish and Portuguese)
    }
  });

  it("每日運勢: the Moon's house counted from each sign, the sun signs by birthday, the words in the language", () => {
    const ymd = "2026-10-30", m = moonOn(ymd)!;
    expect(m.sign).toBeGreaterThanOrEqual(0);
    const houses = Array.from({ length: 12 }, (_, i) => horoscopeFor(i, ymd)!.house).sort((a, b) => a - b);
    expect(houses).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(horoscopeFor(m.sign, ymd)!.house).toBe(1);
    expect(horoscopeFor(m.sign, ymd)!.tier).toBe(HOUSE_TIER[1]);
    expect(starOfBirth(3, 21)).toBe(0);
    expect(starOfBirth(3, 20)).toBe(11);
    expect(starOfBirth(1, 19)).toBe(9);
    expect(starOfBirth(12, 25)).toBe(9);
    expect(starOfBirth(8, 23)).toBe(5);
    expect(starNameIn("en", 0)).toBe("Aries");
    expect(starDatesIn("en", 0)).toBe("Mar 21 – Apr 19");
    expect(starDatesIn("ja", 9)).toBe("12月22日〜1月19日");
    expect(animalsOnly("ko")).toBe(true);
    expect(animalsOnly("ja")).toBe(false);
    for (const l of ["en", "ko", "fr", "de", "es", "pt"] as Foreign[]) {
      const S = ysStar(l), Z = ysZodiac(l), P = ysPage(l);
      for (let i = 0; i < 12; i++) {
        const h = horoscopeFor(i, ymd, S)!, y = yunshiFor(i, ymd, Z)!;
        expect(h.line + h.yi + h.ji + h.plain + h.phaseLine, `${l} star ${i}`).not.toMatch(HAN);
        expect(y.line + y.yi + y.ji + y.plain + y.rhythm + y.tierName, `${l} animal ${i}`).not.toMatch(HAN);
      }
      expect(wordsOf(P).join("\n"), l).not.toMatch(HAN);
      expect(Object.keys(Z.zodiac)).toEqual([...Z_SIGNS]);
    }
  });
});

describe("128 ⑤ — 犯太歲 as 厄年 (ja) and 삼재 (ko)", () => {
  it("2027 厄年: men 25/42/61, women 19/33/37/61 本厄 with the right birth years", () => {
    const t = TSL.yakuTable(2027);
    const hon = (g: "male" | "female") => t[g].filter((r) => r.kind === "本厄").map((r) => [r.age, r.born]);
    expect(hon("male")).toEqual([[25, 2003], [42, 1986], [61, 1967]]);
    expect(hon("female").map((x) => x[0])).toEqual([19, 33, 37, 61]);
    expect(t.male.find((r) => r.age === 42)!.big).toBe(true);
    expect(t.female.find((r) => r.age === 33)!.big).toBe(true);
    expect(TSL.yakuLookup(2027)[1986]!.male).toContain("本厄");
  });
  it("2027 삼재: 돼지·토끼·양 in 날삼재", () => {
    const row = TSL.samjaeTable(2027).find((r) => r.animals.includes("돼지"))!;
    expect(row.animals.sort()).toEqual(["돼지", "양", "토끼"].sort());
    expect(row.now).toBe("날삼재");
    expect(row.from).toBe(2025);
    expect(TSL.samjaeLookup(2027)[1995]).toContain("날삼재");
  });
  it("opens in zh-hant, zh, ja, ko only", () => {
    for (const l of ["zh-hant", "zh", "ja", "ko"] as const) expect(S.serviceOpenIn("taisui", l), l).toBe(true);
    for (const l of ["en", "es", "pt", "fr", "de"] as const) expect(S.serviceOpenIn("taisui", l), l).toBe(false);
  });
});

describe("128 ⑤ — 今日の暦 (ja) and 음력·손 없는 날 (ko)", () => {
  it("the lunar date counts from the new moon in UTC+9 (2027 설날 is Feb 7 in Korea, Feb 6 in China)", () => {
    expect(KY.eastLunar(2027, 2, 7)).toMatchObject({ month: 1, day: 1 });
    expect(KY.eastLunar(2027, 2, 6)).toMatchObject({ month: 12, day: 30 });
    expect(KY.eastLunar(2026, 2, 17)).toMatchObject({ month: 1, day: 1 });
  });
  it("六曜 from the lunar date; 旧暦1月1日 is 先勝", () => {
    expect(KY.rokuyo(1, 1)).toBe("先勝");
    expect(KY.jaDay(2026, 2, 17).rokuyo).toBe("先勝");
    expect(KY.rokuyo(9, 20)).toBe("仏滅");
  });
  it("every day of two years has a 六曜, sane marks, and 손 없는 날 on lunar 9·10·19·20·29·30", () => {
    for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2028, 0, 1); t += 86_400_000) {
      const d = new Date(t), y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, dd = d.getUTCDate();
      const j = KY.jaDay(y, m, dd), k = KY.koDay(y, m, dd);
      expect(KY.ROKUYO).toContain(j.rokuyo);
      expect(j.lunar.day).toBeGreaterThanOrEqual(1);
      expect(j.lunar.day).toBeLessThanOrEqual(30);
      expect(k.sonEomneun).toBe([9, 0].includes(k.lunar.day % 10));
    }
    // 天赦日 comes five to seven times a year
    let n = 0;
    for (let t = Date.UTC(2027, 0, 1); t < Date.UTC(2028, 0, 1); t += 86_400_000) { const d = new Date(t); if (KY.jaDay(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()).marks.includes("天赦日")) n++; }
    expect(n).toBeGreaterThanOrEqual(5);
    expect(n).toBeLessThanOrEqual(7);
  });
  it("吉日 lists leave out 仏滅・赤口・不成就日", () => {
    for (const p of KY.JA_PURPOSES) {
      const c = KY.jaCandidates(p, "2026-11-01");
      expect(c.length).toBeGreaterThan(5);
      for (const x of c) { expect(["仏滅", "赤口"]).not.toContain(x.day.rokuyo); expect(x.day.marks).not.toContain("不成就日"); }
    }
    expect(KY.koSonDays("2026-11-01").length).toBeGreaterThanOrEqual(15);
  });
  it("huangli and zeri open in ja and ko", () => {
    for (const id of ["huangli", "zeri"]) for (const l of ["ja", "ko"] as const) expect(S.serviceOpenIn(id, l)).toBe(true);
  });
});

describe("128 ⑤ — the Chinese almanac in the Western languages", () => {
  it("the almanac's words cover every leaf in en, fr, de, es, pt", () => {
    const probs: string[] = [];
    for (const l of LATIN) for (const leaf of leaves(ALMANAC_HANT)) {
      if (!/[㐀-鿿]/.test(leaf.text)) continue;
      const why = leafProblem(l, leaf.text, getPath((ALMANAC as unknown as Generated)[l], leaf.path), false);
      if (why) probs.push(`${l} ${leaf.path}: ${why}`);
    }
    expect(probs).toEqual([]);
  });
  it("every 宜／忌 word of two years has a name in each language", () => {
    for (const l of LATIN) {
      const T = almanacText(l);
      for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2028, 0, 1); t += 86_400_000 * 3) {
        const d = new Date(t); const h = huangliDay(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
        const known = [...h.yi, ...h.ji].filter((k) => T.yiji[k]).length;
        expect(known, `${l} ${h.ymd}`).toBeGreaterThanOrEqual(Math.min(1, h.yi.length + h.ji.length));
      }
      expect(T.terms).toHaveLength(24);
      expect(wordsOf(T).join("\n"), l).not.toMatch(HAN);
    }
  });
  it("huangli and zeri open in every language", () => {
    for (const id of ["huangli", "zeri"]) expect(S.serviceLocales(id)).toHaveLength(9);
  });
});

describe("128 ⑥ — 姓名判断 (ja) and 성명학 (ko)", () => {
  it("五格 for 山田花子 by 旧字体 (花 = 艸 6 + 4)", () => {
    const r = NMF.jaName("山田", "花子");
    expect(r.missing).toEqual([]);
    expect(r.grid).toEqual({ tian: 8, ren: 15, di: 13, wai: 6, zong: 21 });
  });
  it("新字体 counts as 旧字体, kana by the table, 々 as the character before", () => {
    expect(NMF.jaChar("沢")).toMatchObject({ kyu: "澤", strokes: 17 });
    expect(NMF.kanaStrokes("あ")).toBe(3);
    expect(NMF.kanaStrokes("が")).toBe(5);
    expect(NMF.kanaStrokes("ぱ")).toBe(5);
    expect(NMF.kanaStrokes("ア")).toBe(2);
    const r = NMF.jaName("佐々木", "さくら");
    expect(r.missing).toEqual([]);
    expect(r.sur[1]!.strokes).toBe(r.sur[0]!.strokes);
  });
  it("수리 4격 and 발음오행 for 김민준 金敏俊", () => {
    const r = NMF.koName("김", "민준", "金", "敏俊");
    expect(r.grid).toEqual({ won: 20, hyeong: 19, i: 17, jeong: 28 });
    expect(r.hangul.map((x) => x.el)).toEqual(["木", "水", "金"]);
    expect(r.yinyang).toEqual(["음", "양", "양"]);
    expect(NMF.koName("이", "서연", "", "").grid).toBeNull();
  });
  it("opens in ja and ko only among the foreign languages", () => {
    expect([...S.serviceLocales("name")].sort()).toEqual(["ja", "ko", "zh", "zh-hant"]);
  });
});

describe("128 ⑤ — 籤 in the other languages (ja 淺草寺, others 觀音)", () => {
  it("page words cover every leaf", () => {
    expect(coverage("qianui", QIAN_UI_HANT, QIANUI as unknown as Generated)).toEqual([]);
  });
  it("every lot of the market set has a title and a reading in every language, no Chinese outside Japanese", () => {
    for (const l of FOREIGN as Foreign[]) {
      expect(marketSet(l)).toBe(l === "ja" ? "sensoji" : "guanyin");
      for (let n = 1; n <= 100; n++) {
        const e = foreignLot(l, n), r = foreignReading(l, n);
        expect(e?.title, `${l} ${n}`).toBeTruthy();
        expect(r?.plain, `${l} ${n}`).toBeTruthy();
        if (l !== "ja") expect([e!.title, ...Object.values(r!)].join("\n"), `${l} ${n}`).not.toMatch(HAN);
      }
    }
  });
  it("jieqian and today-qian open in every language", () => {
    expect(S.serviceLocales("jieqian")).toHaveLength(9);
    expect(S.serviceLocales("today-qian")).toHaveLength(9);
  });
});
