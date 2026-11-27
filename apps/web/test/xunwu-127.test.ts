// DATA_DIR is a fresh temp dir (test/setup.ts)
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildCard, guaPath, hourBranch, meihua, placeOf, TRIGRAM_BY_NUM } from "@/lib/xunwu";
import { actionsFor, castQuestion, CATS, hans, PAGE, UI, xunwuPageUi, type XwCat, type XwPlace, type XwRegion } from "@/lib/xunwu-text";
import { castsToday, markBack, markClick, sameThing, saveCast, xunwuByToken, xunwuStats } from "@/lib/xunwu-store";
import { dueXw, type XwRec } from "@/lib/xunwu-local";
import { GUA, guaSlug } from "@/lib/gua";
import { parsePre } from "@/lib/pre-cast";
import { lostItemFacts, lostItemOf } from "@/lib/lost-item";
import { buildUserPayload, deepSystem } from "@/lib/reading";
import { fullChart } from "@yaoflow/engine";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import XunwuFlow, { XunwuCardView } from "@/components/xunwu/XunwuFlow";
import { CROSS_MAP, crossFor } from "@/lib/cross-map";
import { SERVICES } from "@/lib/services";
import { isLostThing } from "@/lib/lost-words";

const src = (p: string) => readFileSync(join(__dirname, "../src", p), "utf8");

/**
 * 进度表 127 验收①: 30 groups of (總和, 時支數) checked against the hand-worked table — 上下卦、動爻、體用、變卦、方位、卦號.
 * Worked by hand from 卷一〈周易卦數〉乾1 兌2 離3 震4 巽5 坎6 艮7 坤8, 卷一〈八宮所屬五行〉 and 卷二〈失物占〉; the first two are
 * the 进度表's own examples. Columns: sum, hour, upper, lower, moving, 用 (the trigram), 體用, 變出, 方位, 本卦, 變卦.
 */
const T: [number, number, string, string, number, string, string, string, string, number, number][] = [
  [10, 7, "dui", "qian", 5, "dui", "same", "zhen", "東", 43, 34],      // 进度表: 澤天夬 動五爻, 比和, 變震 → 東
  [3, 1, "li", "zhen", 4, "li", "tiShengYong", "gen", "東北", 21, 27],  // 进度表: 火雷噬嗑 動四爻, 體生用, 變艮 → 東北
  [3, 2, "li", "xun", 5, "li", "tiShengYong", "qian", "西北", 50, 44],
  [4, 1, "zhen", "xun", 5, "zhen", "same", "dui", "西", 32, 28],
  [5, 3, "xun", "kun", 2, "kun", "tiKeYong", "kan", "北", 20, 59],
  [6, 6, "kan", "zhen", 6, "kan", "yongShengTi", "xun", "東南", 3, 42],
  [7, 1, "gen", "kun", 2, "kun", "same", "kan", "北", 23, 4],
  [8, 1, "kun", "qian", 3, "qian", "tiShengYong", "dui", "西", 11, 19],
  [9, 3, "qian", "zhen", 6, "qian", "yongKeTi", "dui", "西", 25, 17],
  [11, 12, "li", "gen", 5, "li", "yongShengTi", "qian", "西北", 56, 33],
  [12, 4, "zhen", "kun", 4, "zhen", "yongKeTi", "kun", "西南", 16, 2],
  [13, 5, "xun", "dui", 6, "xun", "tiKeYong", "kan", "北", 61, 60],
  [14, 2, "kan", "kun", 4, "kan", "tiKeYong", "dui", "西", 8, 45],
  [15, 9, "gen", "kun", 6, "gen", "same", "kun", "西南", 23, 2],
  [16, 2, "kun", "dui", 6, "kun", "yongShengTi", "gen", "東北", 19, 41],
  [17, 4, "qian", "xun", 3, "xun", "tiKeYong", "kan", "北", 44, 6],
  [18, 6, "dui", "kun", 6, "dui", "tiShengYong", "qian", "西北", 45, 12],
  [5, 1, "xun", "kan", 6, "xun", "tiShengYong", "kan", "北", 59, 29],
  [6, 1, "kan", "gen", 1, "gen", "yongKeTi", "li", "南", 39, 63],
  [3, 4, "li", "gen", 1, "gen", "tiShengYong", "li", "南", 56, 30],
  [4, 5, "zhen", "qian", 3, "qian", "yongKeTi", "dui", "西", 34, 54],
  [7, 7, "gen", "kan", 2, "kan", "tiKeYong", "kun", "西南", 4, 23],
  [8, 11, "kun", "li", 1, "li", "yongShengTi", "gen", "東北", 36, 15],
  [9, 10, "qian", "li", 1, "li", "yongKeTi", "gen", "東北", 13, 33],
  [10, 12, "dui", "kan", 4, "dui", "yongShengTi", "kan", "北", 47, 29],
  [11, 1, "li", "zhen", 6, "li", "tiShengYong", "zhen", "東", 21, 51],
  [12, 8, "zhen", "zhen", 2, "zhen", "same", "dui", "西", 51, 54],
  [13, 3, "xun", "kun", 4, "xun", "yongKeTi", "qian", "西北", 20, 12],
  [14, 9, "kan", "gen", 5, "kan", "tiKeYong", "kun", "西南", 39, 15],
  [16, 9, "kun", "qian", 1, "qian", "tiShengYong", "xun", "東南", 11, 46],
  [17, 12, "qian", "xun", 5, "qian", "yongKeTi", "li", "南", 44, 50],
  [18, 12, "dui", "kan", 6, "dui", "yongShengTi", "qian", "西北", 47, 6],
];

describe("127 尋物 — 梅花起卦 by the table (验收① 30 組)", () => {
  it("covers every trigram above and below, every moving line, all five 體用 and every direction", () => {
    expect(T.length).toBeGreaterThanOrEqual(30);
    expect(new Set(T.map((r) => r[2])).size).toBe(8);
    expect(new Set(T.map((r) => r[3])).size).toBe(8);
    expect(new Set(T.map((r) => r[4])).size).toBe(6);
    expect(new Set(T.map((r) => r[6])).size).toBe(5);
    expect(new Set(T.map((r) => r[8])).size).toBe(8);
  });
  for (const [sum, hour, upper, lower, moving, yong, rel, toward, dir, hex, changed] of T) {
    it(`總和 ${sum}・時支 ${hour} → 上${upper} 下${lower} 動${moving} 用${yong} ${rel} 變${toward}（${dir}） ${hex}→${changed}`, () => {
      const m = meihua(sum, hour);
      expect([m.upper, m.lower, m.moving]).toEqual([upper, lower, moving]);
      expect(m.yong).toBe(yong);
      expect(m.ti).toBe(m.yongAt === "upper" ? lower : upper);
      expect(m.rel).toBe(rel);
      expect(m.toward).toBe(toward);
      expect(placeOf(m.toward).dir).toBe(dir);
      expect([m.hex, m.changed]).toEqual([hex, changed]);
    });
  }
  it("the bands follow 〈失物占〉: 用生體／比和 easy, 體克用 medium, 體生用／用克體 hard", () => {
    expect(meihua(10, 7).tier).toBe("easy");
    expect(meihua(5, 3).tier).toBe("medium");
    expect(meihua(3, 1).tier).toBe("hard");
    expect(meihua(9, 3).tier).toBe("hard");
  });
  it("the reader's clock → 時支數, 23:00 opens 子時", () => {
    expect([23, 0, 1, 2, 3, 11, 12, 13, 21, 22].map(hourBranch)).toEqual([1, 1, 2, 2, 3, 7, 7, 8, 12, 12]);
    expect(() => meihua(2, 1)).toThrow();
    expect(() => meihua(10, 13)).toThrow();
  });
  it("the hexagram links are the hexagram pages' own slugs", () => {
    for (const h of GUA) expect(guaPath(h.number)).toBe(guaSlug(h));
    expect(TRIGRAM_BY_NUM).toEqual(["qian", "dui", "li", "zhen", "xun", "kan", "gen", "kun"]);
  });
});

describe("127 尋物 — the card", () => {
  const base = { token: "a".repeat(24), same: false, at: 1, cat: "wallet" as const, place: "unsure" as const, ago: "today" as const, dice: [4, 3, 3] as [number, number, number], hour: 7, locale: "zh-hant" as const, region: "tw" as XwRegion };
  it("sum 10 at 午時: 比和, 東, both places home first, 〈澤天夬〉 動第五爻 → 〈雷天大壯〉", () => {
    const c = buildCard(base);
    expect(c.tierLabel).toBe("比較容易找到");
    expect(c.dir).toBe("東");
    expect(c.dirIdx).toBe(2);
    expect(c.places.map((p) => p.label)).toEqual(["家中", "在外"]);
    expect(c.hex.name).toBe("澤天夬");
    expect(c.move).toBe("第五爻");
    expect(c.changed.name).toBe("雷天大壯");
    expect(c.hex.href).toBe("/zh-hant/gua/43-guai");
    expect(c.why).toContain("比和");
    expect(c.urgent?.h).toBe("卡片先停用");
    expect(c.castHref).toContain("xw=" + "a".repeat(24));
    expect(decodeURIComponent(c.castHref)).toContain("我的錢包找得回來嗎？在哪裡？");
  });
  it("a hard band never says 找不回來, and says what to do first", () => {
    const c = buildCard({ ...base, dice: [1, 1, 1], hour: 1, cat: "keys", place: "home" });
    expect(c.tier).toBe("hard");
    expect(c.tierLabel).toBe("不容易自己出現");
    expect(`${c.tierLabel}${c.tierLine}${c.why}`).not.toMatch(/找不回|不可尋|一定/);
    expect(c.tierLine).toContain("先把下面的實際動作做完");
    expect(c.urgent).toBeNull();
    expect(c.actions.items.join("")).toContain("門禁卡");
  });
  it("the simplified card keeps 乾 the trigram", () => {
    const c = buildCard({ ...base, dice: [4, 4, 1], hour: 1, locale: "zh", region: "cn" }); // sum 9: upper 乾
    expect(c.why).toMatch(/乾/);
    expect(c.why).not.toMatch(/干/);
    expect(c.hex.href.startsWith("/zh/gua/")).toBe(true);
    expect(hans("乾·西北，乾兌屬金")).toBe("乾·西北，乾兑属金");
  });
  it("證件、錢包卡片、手機 put their step above the card; Taiwan and Hong Kong each get their own office", () => {
    expect(actionsFor("doc", "tw").urgent!.items.join("")).toContain("1996");
    expect(actionsFor("doc", "hk").urgent!.items.join("")).toContain("14 天內");
    expect(actionsFor("doc", "hk").urgent!.items.join("")).not.toMatch(/\d{4} ?\d{4}/); // no telephone we could not check
    expect(actionsFor("phone", "tw").urgent!.items.join("")).toContain("尋找我的裝置");
    for (const c of CATS) expect(actionsFor(c, "tw").rest.items.at(-1)).toContain("報案");
    expect(["doc", "wallet", "phone"].every((c) => actionsFor(c as never, "cn").urgent)).toBe(true);
    expect(["keys", "jewelry", "clothes", "other"].every((c) => !actionsFor(c as never, "cn").urgent)).toBe(true);
  });
  it("the question into 六爻 carries the category and ②③, never the reader's own name", () => {
    expect(castQuestion("doc", "out", "days")).toBe("我的證件找得回來嗎？在哪裡？（最後是在外面，這幾天不見的）");
  });
  it("the words keep the 口径: no 準 except the FAQ's own question, no AI, no 神明, no 一定找得到", () => {
    const words = JSON.stringify({ ...PAGE, faq: PAGE.faq.map((f) => f.a), UI, ui: xunwuPageUi("zh-hant") });
    expect(words).not.toMatch(/準|AI|人工智慧|神明|靈驗|一定找得到|找不回來|改運|化解/);
    expect(PAGE.faq[0]!.q).toBe("線上尋物準不準？");
    expect(PAGE.lead).toContain("不用登入，你填的東西只存在這台裝置");
    expect(UI.foot).toBe("這是傳統〈失物占〉的看法，實際動作先做。");
    expect(PAGE.leadHk).toContain("搵返");
    expect(PAGE.titleHk).toBe("唔見咗嘢？");
  });
});

describe("127 尋物 — kept rows: the first card stands, ten a day, the counts", () => {
  const row = (bid: string, cat: XwCat = "wallet", place: XwPlace = "home") => saveCast({ bid, customerId: null, locale: "zh-hant", region: "tw", cat, place, ago: "today", dice: [4, 3, 3], hour: 7, hex: 43, changed: 34, tier: "easy", rel: "same", toward: "zhen" });
  it("the same thing within a day comes back; another thing is a new cast", () => {
    const tk = row("b-same");
    expect(sameThing("b-same", "wallet", "home")?.token).toBe(tk);
    expect(sameThing("b-same", "wallet", "out")).toBeNull();
    expect(sameThing("b-same", "keys", "home")).toBeNull();
    expect(sameThing("b-same", "wallet", "home", Date.now() + 25 * 3_600_000)).toBeNull();
  });
  it("counts this browser's casts in the last day", () => {
    for (let i = 0; i < 3; i++) row("b-count", "other", "out");
    expect(castsToday("b-count")).toBe(3);
  });
  it("「用六爻細看」, 找到了／還沒 and the admin counts", () => {
    const tk = row("b-back", "phone", "out");
    expect(markClick(tk)).toBe(true);
    expect(markBack(tk, false)).toBe(true);
    expect(markBack(tk, true)).toBe(true);
    expect(xunwuByToken(tk)?.back).toBe("found");
    const s = xunwuStats(Date.now() - 3_600_000, Date.now() + 1000);
    expect(s.casts).toBeGreaterThanOrEqual(5);
    expect(s.byCat.phone).toBe(1);
    expect(s.clicked).toBe(1);
    expect(s.back.easy?.found).toBe(1);
  });
  it("the cast that follows can carry the token (lib/pre-cast.ts xw:)", () => {
    const tk = row("b-pre", "jewelry", "home");
    expect(parsePre(`xw:${tk}`)).toEqual({ kind: "xw", token: tk });
    expect(parsePre(`xw:${"f".repeat(24)}`)).toBeUndefined();
  });
});

describe("127 尋物 — the revisit card's day", () => {
  const rec = (at: number, done?: XwRec["done"]): XwRec => ({ tk: String(at), cat: "keys", place: "home", ago: "today", at, tier: "easy", hex: 1, ...(done ? { done } : {}) });
  it("from the next local day up to 7 days, the newest unanswered", () => {
    const now = new Date(2026, 9, 29, 10, 0).getTime();
    const lastNight = new Date(2026, 9, 28, 22, 0).getTime();
    const thisMorning = new Date(2026, 9, 29, 8, 0).getTime();
    const old = now - 8 * 86_400_000;
    expect(dueXw(now, [rec(thisMorning)])).toBeNull();
    expect(dueXw(now, [rec(lastNight)])?.at).toBe(lastNight);
    expect(dueXw(now, [rec(old)])).toBeNull();
    expect(dueXw(now, [rec(lastNight, "found")])).toBeNull();
    expect(dueXw(now, [rec(now - 3 * 86_400_000), rec(lastNight)])?.at).toBe(lastNight);
  });
});

describe("127 尋物 — 六爻「尋物」題型 (《卜筮正宗·失脫》)", () => {
  it("knows a lost thing from a person, a pet or a figure of speech, and picks its 用神", () => {
    expect(lostItemOf("我的錢包找得回來嗎？在哪裡？（最後是在外面，今天不見的）")).toEqual({ focal: "wealth" });
    expect(lostItemOf("我的證件找得回來嗎？在哪裡？（最後是在家裡，這幾天不見的）")).toEqual({ focal: "parent" });
    expect(lostItemOf("我的包包或衣物找得回來嗎？")).toEqual({ focal: "parent" });
    expect(lostItemOf("钥匙丢了，还找得到吗")).toEqual({ focal: "wealth" });
    expect(lostItemOf("媽媽送的手錶不見了")).toEqual({ focal: "wealth" });
    expect(lostItemOf("唔見咗部手機，搵唔搵到")).toEqual({ focal: "wealth" });
    expect(lostItemOf("我的車被偷了，找得回來嗎")).toEqual({ focal: "parent" });
    for (const q of ["我家的貓不見了", "找不到工作怎麼辦", "他不見了，還會回來嗎", "我們會復合嗎", "這個月的業績會好嗎", "孩子走失了", "工作丟了怎麼辦", "好機會不見了", "怎麼找回前任"]) expect(lostItemOf(q)).toBeNull();
  });
  const at = Date.UTC(2026, 9, 29, 4, 0);
  it("乾為天: 妻財寅木 on the second line — inside, 「二爻為灶」, not moving (moved only by a day clash)", () => {
    const chart = fullChart({ values: [7, 7, 7, 7, 7, 7], utcMs: at, tzOffsetMinutes: 480 });
    const f = lostItemFacts("我的錢包不見了", chart)!;
    expect(f.line).toMatchObject({ pos: 2, ganzhi: "甲寅", hidden: false });
    expect(f.home_or_outside).toBe("inner");
    expect(f.moved).toBe(chart.lines[1]!.dayClash);
    expect(f.place_hints[0]).toContain("二爻为灶");
    expect(f.signals.map((s) => s.rule_zh).join("|")).toContain("内卦本宫");
  });
  it("天風姤 has no 妻財: the 伏神 寅木 hides under 子孫 亥水 — 「若伏子孫，當在僧房道院」", () => {
    const f = lostItemFacts("錢包不見了", fullChart({ values: [8, 7, 7, 7, 7, 7], utcMs: at, tzOffsetMinutes: 480 }))!;
    expect(f.line).toMatchObject({ pos: 2, hidden: true, under: { pos: 2, relation_zh: "子孙" } });
    expect(f.signals.map((s) => s.rule_zh).join("|")).toContain("若伏子孙");
  });
  it("the deep prompt and payload carry it only for a lost thing", () => {
    expect(deepSystem("zh-hant", { lost: true })).toContain("LOST ITEM (尋物)");
    expect(deepSystem("zh-hant", {})).not.toContain("LOST ITEM (尋物)");
    const chart = fullChart({ values: [7, 7, 7, 7, 7, 7], utcMs: at, tzOffsetMinutes: 480 });
    expect(JSON.parse(buildUserPayload("我的鑰匙不見了", chart, undefined, { tellTime: true })).lost_item.focal).toBe("wealth");
    expect(JSON.parse(buildUserPayload("我的鑰匙不見了", chart, undefined, { tellTime: false })).lost_item).toBeUndefined();
    expect(JSON.parse(buildUserPayload("這份工作會順利嗎", chart, undefined, { tellTime: true })).lost_item).toBeUndefined();
  });
});

describe("127 尋物 — the page's pieces render", () => {
  it("the card shows the band, the compass, the places, the steps and the two hexagram links — no template left over", () => {
    const card = buildCard({ token: "b".repeat(24), same: true, at: 1, cat: "phone", place: "unsure", ago: "days", dice: [4, 3, 3], hour: 7, locale: "zh-hant", region: "tw" });
    const p = xunwuPageUi("zh-hant");
    const html = renderToStaticMarkup(createElement(XunwuCardView, { card, ui: p.ui, dirs: p.dirs, name: "藍色手機", locale: "zh-hant" }));
    for (const s of ["藍色手機", "比較容易找到", "以最後見到它的地方為中心，往「東」找", "家中", "在外", "先用「尋找」定位、鎖定", "用六爻細看", "/zh-hant/gua/43-guai", "/zh-hant/gua/34-da-zhuang", UI.same, UI.foot]) expect(html).toContain(s);
    expect(html).not.toMatch(/\{(dir|hex|move|changed|x)\}|undefined/);
  });
  it("the three steps render before anything is thrown", () => {
    const p = xunwuPageUi("zh");
    const html = renderToStaticMarkup(createElement(XunwuFlow, { locale: "zh", ui: p.ui, cats: p.cats, places: p.places, agos: p.agos, dirs: p.dirs }));
    for (const s of ["丢了什么？", "最后在哪里？", "多久了？", "证件文书", "手机与 3C", "不用登入，你填的东西只存在这台装置。", "掷骰子"]) expect(html).toContain(s);
  });
});

describe("127 尋物 — wiring", () => {
  it("no login on the page or its API; the dice are thrown in the browser; no model", () => {
    expect(src("app/api/xunwu/cast/route.ts")).not.toContain("need_login");
    expect(src("components/xunwu/XunwuFlow.tsx")).toContain("crypto.getRandomValues");
    expect(src("lib/xunwu.ts")).not.toMatch(/chatJson|anthropic|deepseek/i);
    expect(src("app/[locale]/xunwu/page.tsx")).not.toContain("LoginGate");
  });
  it("is behind its switch — open since Neil's 10-29 「可以的，你直接上线吧」", () => {
    expect(src("lib/features.ts")).toMatch(/name: "xunwu"[^\n]*def: "on"/);
    expect(src("app/api/xunwu/cast/route.ts")).toContain('featureVisible("xunwu"');
  });
});

describe("127 尋物 — tied into the other products (Neil: 「要做好产品线之间的相互关联和推广中的涉及」)", () => {
  it("the cross map: the 尋物 page points at the cast; a lost-thing reading points at 尋物", () => {
    expect(CROSS_MAP.xunwu.main.id).toBe("cast");
    expect(CROSS_MAP.reading_lost.main.id).toBe("xunwu");
    const ids = new Set(SERVICES.map((s) => s.id));
    for (const p of [CROSS_MAP.xunwu.main, ...CROSS_MAP.xunwu.more, CROSS_MAP.reading_lost.main, ...CROSS_MAP.reading_lost.more]) expect(ids.has(p.id)).toBe(true);
    expect(crossFor("reading_lost", ["cast"]).main?.id).toBe("xunwu");
  });
  it("the words that make a cast a lost-thing cast", () => {
    expect(isLostThing("我的錢包不見了，找得回來嗎")).toBe(true);
    expect(isLostThing("钥匙丢了")).toBe(true);
    expect(isLostThing("工作丟了怎麼辦")).toBe(false);
    expect(isLostThing("貓不見了")).toBe(false);
  });
  it("the doors in: home, 擲筊, 求籤, the dream pages, the reading page, the cast page, the services list", () => {
    expect(src("components/HomeDoors.tsx")).toContain("/xunwu?c=home-switch");
    expect(src("app/[locale]/jiaobei/page.tsx")).toContain('name="xunwu"');
    expect(src("app/[locale]/qiuqian/page.tsx")).toContain('name="xunwu"');
    expect(src("app/[locale]/dream/[slug]/page.tsx")).toMatch(/LOST_DREAMS = new Set\(\["wallet", "key", "phone"/);
    expect(src("app/[locale]/reading/page.tsx")).toContain('"reading_lost"');
    expect(src("components/CastFlow.tsx")).toContain("cast-to-xunwu");
    expect(SERVICES.find((s) => s.id === "xunwu")?.group).toBe("daily");
  });
  it("promotion and the ops assistant know it", () => {
    expect(src("lib/llms.ts")).toContain("/zh-hant/xunwu");
    expect(src("lib/daily-insight.ts")).toContain("xunwuCasts");
    expect(src("lib/ops-actions.ts")).toContain("xunwu＝尋物");
  });
});
