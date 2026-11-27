import { describe, expect, it } from "vitest";
import { normalizeBirth, type BirthInput } from "@/lib/mingli/birth/normalize";
import { astrolabeOf, BRANCHES, isMajor, PALACES, viewOf, type ZiweiView, type ZStar } from "@/lib/mingli/ziwei/chart";
import { GEJU, gejuOf, type GejuHit } from "@/lib/mingli/ziwei/geju";
import { cardQuery, compareRow, flyOf, neighbourInputs, nowOf, selfMutOf, STEM_MUT, summaryOf } from "@/lib/mingli/ziwei/insight";
import { ZIWEI_UI_SOURCE } from "@/lib/mingli/ziwei/page-ui";

/**
 * 10-19 紫微「看懂這張盤」: 格局 conditions and 破格 on hand-built charts, 宮干四化／自化, 大限／流年, 前後時辰, the
 * card query, and the words.
 */
const BR = "廟旺得利平不陷";
/** a hand-built chart: soul branch, stars per branch ("太陽旺祿" = name + brightness + 四化), year stem */
function mk(soul: string, at: Record<string, string[]>, yearStem = "甲", body = soul): ZiweiView {
  const si = BRANCHES.indexOf(soul as (typeof BRANCHES)[number]);
  const palaces = BRANCHES.map((b, i) => {
    const parse = (x: string): ZStar => {
      const name = x.slice(0, 2); let rest = x.slice(2); let bright: string | undefined;
      if (rest && BR.includes(rest[0]!)) { bright = rest[0]; rest = rest.slice(1); }
      return { name, bright, mut: rest || undefined };
    };
    const stars = (at[b] ?? []).map(parse);
    return {
      name: PALACES[(si - i + 12) % 12]!, branch: b, stem: "甲乙丙丁戊己庚辛壬癸"[i % 10]!,
      major: stars.filter((s) => isMajor(s.name)), minor: stars.filter((s) => !isMajor(s.name)).map(({ name, mut }) => ({ name, mut })),
      adj: [], isBody: b === body, isSoul: b === soul, decadal: [2 + ((i - si + 12) % 12) * 10, 11 + ((i - si + 12) % 12) * 10] as [number, number],
    };
  });
  return { palaces, soulBranch: soul, bodyBranch: body, fiveClass: "水二局", chineseDate: `${yearStem}子 丙寅 丁卯 戊辰`, lunarDate: "", time: "", zodiac: "", soulStar: "貪狼", bodyStar: "天同" };
}
const hit = (v: ZiweiView, id: string): GejuHit | undefined => gejuOf(v).find((h) => h.id === id);

describe("格局 conditions", () => {
  it("the library: 25–40 格, each with a source, conditions and 破格 rules", () => {
    expect(GEJU.length).toBeGreaterThanOrEqual(25);
    expect(GEJU.length).toBeLessThanOrEqual(40);
    expect(new Set(GEJU.map((g) => g.id)).size).toBe(GEJU.length);
    for (const g of GEJU) { expect(g.source).toMatch(/《紫微斗數全書》/); expect(g.rule.length).toBeGreaterThan(5); expect(g.breakRule).toMatch(/破/); }
  });
  it("紫府同宮: 成, 化忌 in 命 breaks it, a 煞 takes it down to 半成", () => {
    expect(hit(mk("寅", { 寅: ["紫微廟", "天府廟"] }), "zifu-tonggong")?.status).toBe("成");
    expect(hit(mk("寅", { 寅: ["紫微廟", "天府廟", "文曲忌"] }), "zifu-tonggong")?.status).toBe("破");
    const h = hit(mk("寅", { 寅: ["紫微廟", "天府廟", "擎羊"] }), "zifu-tonggong")!;
    expect(h.status).toBe("半成");
    expect(h.breaks[0]).toMatchObject({ k: "sha", s: ["擎羊"], heavy: false });
    expect(hit(mk("寅", { 寅: ["紫微廟", "天府廟", "擎羊", "陀羅"] }), "zifu-tonggong")?.status).toBe("破");
    expect(hit(mk("寅", { 寅: ["紫微廟", "地空"], 申: ["天府"] }), "zifu-tonggong")).toBeUndefined();
  });
  it("府相朝垣 needs 府、相 in 財帛 and 官祿, not in 命", () => {
    expect(hit(mk("子", { 辰: ["天府廟"], 申: ["天相廟"] }), "fuxiang-chaoyuan")?.status).toBe("成");
    expect(hit(mk("子", { 子: ["天府廟"], 辰: ["天相廟"] }), "fuxiang-chaoyuan")).toBeUndefined();
    expect(hit(mk("子", { 辰: ["天府廟"], 午: ["天相廟"] }), "fuxiang-chaoyuan")).toBeUndefined(); // 午 is 遷移, not 財官
  });
  it("日月並明 needs both bright in the 三方四正", () => {
    expect(hit(mk("丑", { 巳: ["太陽旺"], 酉: ["太陰旺"] }), "riyue-bingming")?.status).toBe("成");
    expect(hit(mk("丑", { 巳: ["太陽旺"], 酉: ["太陰陷"] }), "riyue-bingming")).toBeUndefined();
    const h = hit(mk("丑", { 巳: ["太陽旺忌"], 酉: ["太陰旺"] }), "riyue-bingming")!;
    expect(h.status).toBe("破");
    expect(h.breaks.some((b) => b.k === "jiCore")).toBe(true);
  });
  it("明珠出海: 命 in 未 with no main star, 日 卯 月 亥", () => {
    expect(hit(mk("未", { 卯: ["太陽廟"], 亥: ["太陰廟"] }), "mingzhu-chuhai")?.status).toBe("成");
    expect(hit(mk("未", { 未: ["天機"], 卯: ["太陽廟"], 亥: ["太陰廟"] }), "mingzhu-chuhai")).toBeUndefined();
  });
  it("石中隱玉 is whole only with 祿／權／科 on 巨門", () => {
    const a = hit(mk("子", { 子: ["巨門旺"] }), "shizhong-yinyu")!;
    expect(a.status).toBe("半成");
    expect(a.missing[0]?.k).toBe("needMut");
    expect(hit(mk("子", { 子: ["巨門旺祿"] }), "shizhong-yinyu")?.status).toBe("成");
    expect(hit(mk("寅", { 寅: ["巨門旺祿"] }), "shizhong-yinyu")).toBeUndefined();
  });
  it("極向離明 wants a 甲、丁、己 year", () => {
    expect(hit(mk("午", { 午: ["紫微廟"] }, "甲"), "jixiang-liming")?.status).toBe("成");
    expect(hit(mk("午", { 午: ["紫微廟"] }, "乙"), "jixiang-liming")?.missing[0]).toMatchObject({ k: "stemNot", x: "乙" });
  });
  it("火貪: 火星 in 命 is whole, across is 半成, and 火星 is not counted as a 煞 here", () => {
    expect(hit(mk("辰", { 辰: ["貪狼廟", "火星"] }), "huotan")?.status).toBe("成");
    expect(hit(mk("辰", { 辰: ["貪狼廟"], 戌: ["火星"] }), "huotan")?.missing[0]?.k).toBe("notSame");
    expect(hit(mk("辰", { 辰: ["貪狼廟"] }), "huotan")).toBeUndefined();
  });
  it("夾命: 昌曲, 左右, 魁鉞, 日月; a flanking star's 化忌 breaks it", () => {
    expect(hit(mk("辰", { 卯: ["文昌"], 巳: ["文曲"] }), "changqu-jiaming")?.status).toBe("成");
    expect(hit(mk("辰", { 卯: ["文昌忌"], 巳: ["文曲"] }), "changqu-jiaming")?.status).toBe("破");
    expect(hit(mk("辰", { 卯: ["右弼"], 巳: ["左輔"] }), "zuoyou-jiaming")?.status).toBe("成");
    expect(hit(mk("辰", { 卯: ["天魁"], 巳: ["天鉞"] }), "kuiyue-jiaming")?.status).toBe("成");
    expect(hit(mk("辰", { 卯: ["太陽廟"], 巳: ["太陰陷"] }), "riyue-jiaming")?.status).toBe("半成");
    expect(hit(mk("辰", { 卯: ["文昌"], 午: ["文曲"] }), "changqu-jiaming")).toBeUndefined();
  });
  it("祿馬交馳 is judged at the palace where 祿 and 馬 meet", () => {
    expect(hit(mk("子", { 申: ["天馬", "祿存"] }), "luma-jiaochi")?.status).toBe("成");
    expect(hit(mk("子", { 申: ["天馬", "祿存", "地空"] }), "luma-jiaochi")?.status).toBe("破");
    expect(hit(mk("子", { 寅: ["天馬", "祿存"] }), "luma-jiaochi")).toBeUndefined();
  });
  it("三奇加會, 陽梁昌祿, 雙祿朝垣, 君臣慶會, 七殺朝斗", () => {
    expect(hit(mk("子", { 子: ["天機祿"], 辰: ["天梁權"], 申: ["紫微科"] }), "sanqi-jiahui")?.status).toBe("成");
    expect(hit(mk("卯", { 卯: ["太陽廟", "天梁廟"], 未: ["文昌"], 亥: ["祿存"] }), "yangliang-changlu")?.status).toBe("成");
    expect(hit(mk("子", { 辰: ["祿存"], 申: ["天同祿"] }), "shuanglu-chaoyuan")?.status).toBe("成");
    expect(hit(mk("午", { 午: ["紫微廟"], 寅: ["左輔"], 子: ["右弼"] }), "junchen-qinghui")).toBeTruthy();
    expect(hit(mk("寅", { 寅: ["七殺廟"], 申: ["紫微旺", "天府"] }), "qisha-chaodou")?.status).toBe("成");
  });
  it("four 煞 around 命 break it; three take it down", () => {
    expect(hit(mk("子", { 子: ["破軍廟"], 辰: ["擎羊"], 申: ["火星", "鈴星"] }), "yingxing-rumiao")?.status).toBe("半成");
    expect(hit(mk("子", { 子: ["破軍廟"], 辰: ["擎羊", "陀羅"], 申: ["火星", "鈴星"] }), "yingxing-rumiao")?.status).toBe("破");
  });
  it("strongest first: 成 before 半成 before 破, then the better-known 格", () => {
    const g = gejuOf(mk("午", { 午: ["紫微廟", "貪狼旺"], 辰: ["文昌"], 申: ["文曲"] }, "甲"));
    expect(g[0]!.id).toBe("jixiang-liming");
    const order = { 成: 0, 半成: 1, 破: 2 };
    for (let i = 1; i < g.length; i++) expect(order[g[i]!.status]).toBeGreaterThanOrEqual(order[g[i - 1]!.status]);
  });
  it("an empty chart has none", () => { expect(gejuOf(mk("子", {}))).toEqual([]); });
});

const tp = (y: number, m: number, d: number, h: number, mi: number, extra: Partial<BirthInput> = {}): BirthInput => ({ calendar: "solar", y, m, d, timeMode: "exact", h, mi, placeId: "tw-tpe", trueSolar: false, ...extra });

describe("a real chart (1990-05-16 00:30 臺北 男, c01 in ziwei-ref-cases)", () => {
  const i = tp(1990, 5, 16, 0, 30);
  const n = normalizeBirth(i);
  const a = astrolabeOf(n, "male");
  const v = viewOf(a);
  it("summary: 命宮 巳 武曲 破軍, 身命同宮, 金四局 from 4, 生年四化 庚", () => {
    const s = summaryOf(v);
    expect(s.soul.stars.map((x) => x.name)).toEqual(["武曲", "破軍"]);
    expect(s.sameBody).toBe(true);
    expect(s).toMatchObject({ fiveClass: "金四局", startAge: 4, soulStar: "武曲", bodyStar: "火星" });
    expect(s.natal.map((x) => `${x.m}${x.star}${x.palace}`)).toEqual(["祿太陽父母", "權武曲命宮", "科太陰田宅", "忌天同兄弟"]);
  });
  it("宮干四化: 辛巳 sends 巨門祿→交友, 太陽權→父母, 文曲科→兄弟, 文昌忌→交友; 乙酉 自化科 on 紫微", () => {
    expect(flyOf(v, "巳").map((f) => `${f.m}${f.star}${f.toName}`)).toEqual(["祿巨門交友", "權太陽父母", "科文曲兄弟", "忌文昌交友"]);
    const self = selfMutOf(v);
    expect(self["酉"]).toEqual([{ m: "科", star: "紫微" }]);
    expect(self["巳"]).toEqual([]);
    expect(Object.keys(STEM_MUT)).toHaveLength(10);
  });
  it("格局: 殺破狼 with four 煞 around (擎羊、火星、地空、地劫) → 破", () => {
    const g = gejuOf(v);
    expect(g.map((x) => x.id)).toEqual(["shapolang"]);
    expect(g[0]!.status).toBe("破");
    expect(g[0]!.breaks).toContainEqual({ k: "shaMany", x: "4", heavy: true });
  });
  it("now (2026-10-19): 虛歲 37, 大限 34–43 in 田宅 (申), 流年 丙午 in 父母", () => {
    const x = nowOf(a, v, new Date(2026, 9, 19));
    expect(x.age).toBe(37);
    expect(x.decadal).toMatchObject({ branch: "申", name: "田宅", range: [34, 43] });
    expect(x.yearly).toMatchObject({ branch: "午", name: "父母", gz: "丙午" });
  });
  it("neighbouring 時辰: exact time moves two hours across the day; 早子 steps back to the day before's 亥", () => {
    const nb = neighbourInputs(i, n);
    expect(nb[0]!.input).toMatchObject({ y: 1990, m: 5, d: 15, h: 22, mi: 30, timeMode: "exact" });
    expect(nb[1]!.input).toMatchObject({ y: 1990, m: 5, d: 16, h: 2, mi: 30 });
    expect(compareRow(nb[0]!.input, "male")).toMatchObject({ hour: 11, fiveClass: "木三局" });
    expect(compareRow(nb[1]!.input, "male")?.soul.branch).toBe("辰");
    const bi: BirthInput = { calendar: "solar", y: 1990, m: 3, d: 1, timeMode: "branch", branch: 0 };
    const bn = neighbourInputs(bi, normalizeBirth(bi));
    expect(bn[0]!.input).toMatchObject({ y: 1990, m: 2, d: 28, branch: 11 });
    expect(bn[1]!.input).toMatchObject({ y: 1990, m: 3, d: 1, branch: 1 });
    const late: BirthInput = { ...bi, branch: 12 };
    expect(neighbourInputs(late, normalizeBirth(late))[1]!.input).toMatchObject({ m: 3, d: 2, branch: 1 });
    expect(neighbourInputs({ ...bi, timeMode: "unknown" }, normalizeBirth({ ...bi, timeMode: "unknown" }))).toEqual([]);
  });
  it("the card query carries chart facts only", () => {
    const q = new URLSearchParams(cardQuery(v, gejuOf(v)[0]!, "zh-hant"));
    expect(Object.fromEntries(q)).toEqual({ b: "巳", m: "武曲,破軍", br: "平,平", e: "0", f: "金四局", l: "zh-hant", g: "shapolang", s: "c" });
  });
});

describe("words", () => {
  const ui = ZIWEI_UI_SOURCE;
  it("every 格 has a name and a plain line; every star and palace a line", () => {
    for (const g of GEJU) { expect(ui[`gjn_${g.id}`]).toBe(g.name); expect(ui[`gjp_${g.id}`]).toBeTruthy(); }
    for (const s of ["紫微", "天機", "太陽", "武曲", "天同", "廉貞", "天府", "太陰", "貪狼", "巨門", "天相", "天梁", "七殺", "破軍"]) expect(ui[`star_${s}`]).toBeTruthy();
    for (const p of PALACES) expect(ui[`topic_${p}`]).toBeTruthy();
  });
  it("no verdicts, no banned words", () => {
    const text = Object.entries(ui).filter(([k]) => !k.startsWith("gjs_")).map(([, v]) => v).join("\n").replace(/標準時間/g, ""); // 標準時間 = standard time (DST note)
    expect(text).not.toMatch(/[準准]|AI|靈驗|改運|化解|大師|吉凶|大富大貴|富貴|貧賤|凶|吉|準備|血光|破財/);
  });
});
