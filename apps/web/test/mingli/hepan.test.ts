import { describe, expect, it } from "vitest";
import {
  HP_CHAPTERS, branchRels, dmRelOf, hepanDateOffense, hepanOffense, hepanStaticStrings, hpGroupKeys, overviewOf, pairFacts, stemRels,
  type HepanFacts, type Person,
} from "@/lib/mingli/hepan/facts";
import {
  createHepanReport, hepanFacts, hepanPeopleFromBody, hepanReport, hpInputHash, hpPartOffense, hpPayload, paidHepanReportFor, shapeHepan,
} from "@/lib/mingli/hepan/report";
import { HEPAN_PRICES } from "@/lib/money";
import { CURRENCIES } from "@/lib/money";
import { FEATURES } from "@/lib/features";
import { INVITE_TTL_MS, decodeInvite, encodeInvite, invitePath } from "@/lib/mingli/hepan/invite-link";
import { inviteFacts, purgeHepanInvites, storeInviteFacts } from "@/lib/mingli/hepan/invite";
import { cardParams, parseCardParams } from "@/lib/mingli/hepan/card-params";
import { SHARE_SURFACES, SHARE_TAGS } from "@/lib/share-meta";

/**
 * 10-20 合盤: facts deterministic and symmetric (swapping 你 and TA swaps the roles, nothing else), no birth data kept,
 * the banned-word and date checks, the writing calls, and 同一對只收一次錢.
 */
const OCT_20_2026 = Date.UTC(2026, 9, 20, 4);
const tpe = { id: "1668341", name: "Taipei Daan", lat: 25.03, lon: 121.54, tz: "Asia/Taipei" };
const hkg = { id: "1819729", name: "Hong Kong", lat: 22.28, lon: 114.16, tz: "Asia/Hong_Kong" };
const exact = (y: number, m: number, d: number, h: number, mi: number, gender: "male" | "female", place = tpe): Person =>
  ({ input: { calendar: "solar", y, m, d, timeMode: "exact", h, mi, place }, gender });
const noTime = (y: number, m: number, d: number, gender: "male" | "female"): Person => ({ input: { calendar: "solar", y, m, d, timeMode: "unknown", placeId: "tw-tpe" }, gender });
const branch = (y: number, m: number, d: number, b: number, gender: "male" | "female"): Person => ({ input: { calendar: "solar", y, m, d, timeMode: "branch", branch: b, placeId: "tw-tpe" }, gender });

const PAIRS: [Person, Person][] = [
  [exact(1990, 5, 17, 12, 30, "male"), exact(1992, 11, 3, 8, 15, "female", hkg)],
  [noTime(1985, 2, 10, "female"), exact(1983, 7, 7, 22, 10, "male")],
  [branch(2000, 12, 25, 6, "male"), noTime(2001, 6, 10, "female")],
  [exact(1978, 3, 3, 3, 40, "female"), exact(1978, 3, 3, 3, 40, "female")],
];

/** fact ids with A and B swapped; a synastry fact by its unordered pair of points */
const norm = (f: HepanFacts, swap: boolean) => f.facts.map((x) => {
  if (x.id.startsWith("as.syn.")) { const [, , p, q] = x.id.split("."); return `syn:${[p, q].sort().join("-")}`; }
  return swap ? x.id.replace(/\.(A|B)(\.|$)/, (_, k: string, e: string) => `.${k === "A" ? "B" : "A"}${e}`) : x.id;
}).sort();

describe("relations", () => {
  it("天干、地支 and the day-master elements", () => {
    expect(stemRels("甲", "己")).toEqual(["相合（合土）"]);
    expect(stemRels("甲", "庚")).toEqual(["相沖"]);
    expect(branchRels("子", "丑")).toEqual(["六合"]);
    expect(branchRels("子", "午")).toEqual(["相沖"]);
    expect(branchRels("申", "子")).toEqual(["半合（申子辰）"]);
    expect(branchRels("午", "午")).toEqual(["自刑"]);
    expect(branchRels("子", "子")).toEqual(["同支"]);
    expect(dmRelOf("木", "火")).toBe("aFeedsB");
    expect(dmRelOf("木", "土")).toBe("aCurbsB");
    expect(dmRelOf("木", "金")).toBe("bCurbsA");
    expect(dmRelOf("木", "水")).toBe("bFeedsA");
    expect(dmRelOf("木", "木")).toBe("same");
  });
});

describe("pair facts", () => {
  it("deterministic", () => {
    for (const [a, b] of PAIRS) expect(pairFacts(a, b, { now: OCT_20_2026, year: true })).toEqual(pairFacts(a, b, { now: OCT_20_2026, year: true }));
  });
  it("symmetric: swapping 你 and TA swaps the roles — same facts, same themes, same synastry", () => {
    for (const [a, b] of PAIRS) {
      const ab = pairFacts(a, b, { now: OCT_20_2026 }), ba = pairFacts(b, a, { now: OCT_20_2026 });
      expect(norm(ab, false)).toEqual(norm(ba, true));
      const themes = (f: HepanFacts) => f.themes.map((t) => [t.key, t.systems, t.facts.length, t.lean]).sort();
      expect(themes(ab)).toEqual(themes(ba));
      expect(ab.astro.syn.map((s) => `${s.a}|${s.b}|${s.name}|${s.orb}`).sort()).toEqual(ba.astro.syn.map((s) => `${s.b}|${s.a}|${s.name}|${s.orb}`).sort());
      expect(ab.a).toEqual(ba.b);
      expect(ab.bazi.spouseA).toBe(ba.bazi.spouseB);
      expect(ab.bazi.feedA).toBe(ba.bazi.feedB);
    }
  });
  it("紫微 only with both birth times; 星盤 houses and 上升 only with an exact time", () => {
    const [withTime, oneMissing, noneTime] = PAIRS;
    expect(pairFacts(...withTime!, { now: OCT_20_2026 }).ziwei).not.toBeNull();
    expect(pairFacts(...oneMissing!, { now: OCT_20_2026 }).ziwei).toBeNull();
    const n = pairFacts(...noneTime!, { now: OCT_20_2026 });
    expect(n.ziwei).toBeNull();
    expect(n.a.astro.asc).toBeNull();
    expect(n.astro.inA).toBeNull();
    expect(n.astro.syn.every((s) => s.a !== "上升" && s.b !== "上升" && s.a !== "月亮" && s.b !== "月亮")).toBe(true);
  });
  it("six themes, each with the number of systems behind it (never shown as a number on the page)", () => {
    const f = pairFacts(...PAIRS[0]!, { now: OCT_20_2026 });
    expect(f.themes.map((t) => t.key).sort()).toEqual(["attract", "friction", "life", "long", "rhythm", "talk"]);
    for (const t of f.themes) { expect(t.systems).toBeGreaterThanOrEqual(0); expect(t.systems).toBeLessThanOrEqual(3); }
    for (let i = 1; i < f.themes.length; i++) expect(f.themes[i - 1]!.systems).toBeGreaterThanOrEqual(f.themes[i]!.systems);
    const ov = overviewOf(f);
    expect(ov.themes).toHaveLength(2);
    for (const s of [ov.zodiac, ov.dm, ov.astro, ...ov.themes.flatMap((t) => [t.line, ...t.chips])]) expect(s).not.toMatch(/\d+\s*[%％]|分數|契合/);
  });
});

describe("no birth data is kept", () => {
  it("the stored facts carry no date, time, place, coordinates, time zone or name", () => {
    for (const [a, b] of PAIRS) {
      const j = JSON.stringify(hepanFacts(a, b, OCT_20_2026));
      for (const bad of ["1990", "1992", "1985", "1983", "2000", "2001", "1978", "12:30", "Taipei", "Daan", "Hong Kong", "Asia/", "121.5", "25.03", "114.1", "1668341", "1819729", "tw-tpe", "utcMs", "\"lon\"", "\"deg\"", "solarDate", "clock"]) expect(j).not.toContain(bad);
    }
  });
  it("a request keeps only birth fields and gender — a name or a note is dropped", () => {
    const p = hepanPeopleFromBody({ input: { ...PAIRS[0]![0].input, name: "小明", note: "x", place: { ...tpe } }, gender: "male", name: "小明" }, { input: PAIRS[0]![1].input, gender: "female" });
    expect("error" in p).toBe(false);
    const j = JSON.stringify(p);
    expect(j).not.toContain("小明");
    expect(j).not.toContain("Taipei Daan"); // the place name; its time zone is needed to compute and is not stored
    expect(hepanPeopleFromBody({ input: { calendar: "solar", y: 1990, m: 2, d: 31, timeMode: "unknown" }, gender: "male" }, { input: PAIRS[0]![1].input, gender: "female" })).toHaveProperty("error");
  });
});

describe("banned words and dates", () => {
  it("no verdict, no score, no 克／剋, only TA, no English", () => {
    for (const s of ["你們很配不配", "會不會分手", "兩人契合度很高", "速配指數 85%", "合盤分數", "木剋土", "相克", "他其實很在乎你", "她會回來", "你們是天生一對", "TA 就是你的正緣", "今年大吉", "這很準", "AI 算出來", "可以化解", "小三", "你的ASC", "離婚"]) expect(hepanOffense(s), s).not.toBeNull();
    for (const s of ["TA 容易先退一步", "其他的事慢慢來", "在他人面前", "克服這一點", "懂得克制", "準備好再談", "TA的日主制你的日主，記得說出來"]) expect(hepanOffense(s), s).toBeNull();
  });
  it("this year's dates: 國曆 and from the facts", () => {
    const f = hepanFacts(...PAIRS[0]!, OCT_20_2026);
    const t = f.year!.transits.find((x) => x.exact.length)!;
    expect(hepanDateOffense({ x: `國曆 ${t.exact[0]} 前後` }, f.year)).toBeNull();
    expect(hepanDateOffense({ x: "國曆 2/30 前後" }, f.year)).toMatch(/^date/);
    expect(hepanDateOffense({ x: "5月5日起" }, f.year)).toMatch(/^format/);
    expect(hepanDateOffense({ x: "正月要放慢" }, f.year)).toMatch(/^lunar/);
    expect(hpPartOffense({ x: "你們的分數很高" }, f)).toMatch(/^score/);
  });
  it("the fixed copy is clean", () => {
    for (const s of hepanStaticStrings()) expect(hepanOffense(s.replace("YaoFlow", "").replace(/\{\w+\}/g, "")), s).toBeNull();
  });
});

describe("writing calls", () => {
  it("five calls (+qa); ten chapters", () => {
    expect(hpGroupKeys()).toEqual(["A", "B", "C", "D", "E"]);
    expect(hpGroupKeys({ question: true })).toEqual(["A", "B", "C", "D", "E", "qa"]);
    expect(HP_CHAPTERS).toHaveLength(10);
  });
  it("thin text and a short list are sent back", () => {
    const long = "你們相處的時候，這一點會常常出現，可以先說好。".repeat(20);
    expect(shapeHepan("A", { dise: long, xiyin: "短" })).toMatchObject({ ok: false });
    expect(shapeHepan("A", { dise: long, xiyin: long })).toMatchObject({ ok: true });
    expect(shapeHepan("D", { changqi: long, jianyi: [long, long] })).toMatchObject({ ok: false });
    expect(shapeHepan("D", { changqi: long, jianyi: [long, long, long] })).toMatchObject({ ok: true });
  });
  it("only the year call and qa see this year; only qa sees the question", () => {
    const f = hepanFacts(...PAIRS[0]!, OCT_20_2026);
    expect(JSON.parse(hpPayload("A", f, "要搬家嗎")).year).toBeUndefined();
    expect(JSON.parse(hpPayload("A", f, "要搬家嗎")).question).toBeUndefined();
    expect(JSON.parse(hpPayload("E", f, null)).year).toBeDefined();
    expect(JSON.parse(hpPayload("qa", f, "要搬家嗎")).question).toBe("要搬家嗎");
  });
});

describe("the same pair is bought once", () => {
  it("next year it is the same pair; a new question is re-asked in the paid report", () => {
    const cust = 990301;
    const facts = hepanFacts(...PAIRS[0]!, OCT_20_2026);
    const nextYear = hepanFacts(...PAIRS[0]!, Date.UTC(2027, 9, 20, 4));
    expect(hpInputHash(facts, "zh-hant")).toBe(hpInputHash(nextYear, "zh-hant"));
    const t = createHepanReport({ locale: "zh-hant", register: null, customerId: cust, email: null, facts, question: "要一起搬家嗎？", paid: { session: "tester:1" } });
    expect(t.created).toBe(true);
    expect(createHepanReport({ locale: "zh-hant", register: null, customerId: cust, email: null, facts, paid: { session: "tester:1" } })).toEqual({ token: t.token, created: false });
    const again = createHepanReport({ locale: "zh-hant", register: null, customerId: cust, email: null, facts, question: "今年適合見家人嗎？", paid: { session: "tester:1" } });
    expect(again).toEqual({ token: t.token, created: false });
    expect(hepanReport(t.token)?.question).toBe("今年適合見家人嗎？");
    expect(paidHepanReportFor(cust, nextYear, "zh-hant", "另一件事")).toBe(t.token);
    expect(hepanReport(t.token)?.question).toBe("另一件事");
    // another pair, or the same pair for another reader, is a new report
    expect(paidHepanReportFor(cust, hepanFacts(...PAIRS[1]!, OCT_20_2026), "zh-hant")).toBeNull();
    expect(paidHepanReportFor(cust + 1, facts, "zh-hant")).toBeNull();
    // stored without the birth data
    expect(hepanReport(t.token)!.chart_json).not.toContain("1990");
  });
});

describe("wiring", () => {
  it("a price in every currency, and the feature switch", () => {
    for (const c of CURRENCIES) expect(HEPAN_PRICES[c]).toBeGreaterThan(0);
    expect(HEPAN_PRICES.TWD).toBe(49000);
    expect(FEATURES.find((f) => f.name === "hepan")?.def).toBe("preview");
  });

  // 10-21 邀請連結 and 兩人分享卡
  it("the invite link: the inviter's birth in the fragment only, slim, and back again; too old or broken → null", () => {
    const id = "0123456789abcdef01234567";
    const [a] = PAIRS[0]!;
    const enc = encodeInvite({ id, gender: a.gender, input: a.input, name: "阿明", now: OCT_20_2026 });
    const path = invitePath("zh-hant", enc);
    expect(path.startsWith("/zh-hant/hepan/i#")).toBe(true);
    expect(path.split("#")[0]).toBe("/zh-hant/hepan/i"); // nothing before the fragment
    const d = decodeInvite(`#${enc}`, OCT_20_2026 + 1000);
    expect(d).not.toBeNull();
    expect(d!.id).toBe(id);
    expect(d!.g).toBe("male");
    expect(d!.n).toBe("阿明");
    expect(d!.i).toEqual({ calendar: "solar", y: 1990, m: 5, d: 17, timeMode: "exact", h: 12, mi: 30, place: { id: tpe.id, name: "", lat: tpe.lat, lon: tpe.lon, tz: tpe.tz } });
    expect(JSON.stringify(d)).not.toContain("Taipei Daan"); // the place keeps no name (the time zone it needs)
    expect(decodeInvite(`#${enc}`, OCT_20_2026 + INVITE_TTL_MS + 1000)).toBeNull();
    expect(decodeInvite("#not-a-payload")).toBeNull();
    expect(decodeInvite("")).toBeNull();
    const bad = encodeInvite({ id: "short", gender: a.gender, input: a.input, now: OCT_20_2026 });
    expect(decodeInvite(`#${bad}`, OCT_20_2026)).toBeNull();
  });

  it("the invite's facts: kept under the id once, read back, never a birth; gone after 30 days", () => {
    const id = "fedcba9876543210fedcba98";
    const [a, b] = PAIRS[0]!;
    const f = hepanFacts(a, b, OCT_20_2026);
    expect(storeInviteFacts(id, "zh-hant", f, OCT_20_2026)).toBe("ok");
    expect(storeInviteFacts(id, "zh-hant", f, OCT_20_2026 + 5)).toBe("exists");
    expect(storeInviteFacts("nope", "zh-hant", f)).toBe("bad");
    const r = inviteFacts(id, OCT_20_2026 + 1000);
    expect(r?.facts.a.dayPillar).toBe(f.a.dayPillar);
    expect(JSON.stringify(r)).not.toMatch(/1990|Taipei|Asia\//);
    expect(inviteFacts(id, OCT_20_2026 + INVITE_TTL_MS + 1)).toBeNull();
    expect(purgeHepanInvites(OCT_20_2026 + INVITE_TTL_MS + 1)).toBeGreaterThanOrEqual(1);
    expect(inviteFacts(id, OCT_20_2026 + 1000)).toBeNull();
  });

  it("the share card's URL carries chart words only, and parses back", () => {
    for (const [a, b] of PAIRS) {
      const f = pairFacts(a, b, { now: OCT_20_2026 });
      const sp = cardParams(f, "zh-hant");
      const qs = sp.toString();
      expect(qs).not.toMatch(/19[789]\d|20[01]\d|Taipei|Hong|tz|lat|male/);
      const p = parseCardParams(sp);
      expect(p).not.toBeNull();
      expect(p!.a.dayPillar).toBe(f.a.dayPillar);
      expect(p!.b.sun).toBe(f.b.astro.sun);
      expect(p!.themes.length).toBe(2);
    }
    expect(parseCardParams(new URLSearchParams({ a: "巳,己丑,天秤,獅子,天蠍", b: "申,己丑,雙魚,巨蟹,雙魚", t: "rhythm,順;life,混" }))).not.toBeNull();
    expect(parseCardParams(new URLSearchParams({ a: "巳,己丑,天秤,獅子,天蠍", b: "申,己丑,雙魚,巨蟹,雙魚", t: "rhythm,好" }))).toBeNull();
    expect(parseCardParams(new URLSearchParams({ a: "巳,己丑,天秤,獅子,天蠍", b: "1990,己丑,雙魚,巨蟹,雙魚" }))).toBeNull();
    expect(SHARE_SURFACES).toContain("hepan");
    expect(SHARE_TAGS.hepan).toBe("hepan-share");
  });
});
