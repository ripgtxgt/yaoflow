import { describe, expect, it } from "vitest";

/**
 * 10-23 进度表 115 (Neil: 「每个用户的界面里面，我还需要知道用户使用每个产品的记录和详情，然后要做到我能读懂，比如说那个
 * 八字档案，全是代码」): the customer page lists every use of every product in words — and nothing on it reads as code.
 */
const { db, upsertCustomer, createQianDraw } = await import("../src/lib/db");
const { saveProfiles } = await import("../src/lib/birth-profiles");
const { createReport, factsFromBirth, birthFromBody } = await import("../src/lib/mingli/bazi/report");
const { createDraw, markTarotPaid, setTarotPersonal, setTarotFollowup, setTarotRevisit } = await import("../src/lib/tarot");
const { saveQa } = await import("../src/lib/mingli/qa");
const { saveJiaobeiAsk } = await import("../src/lib/pre-cast");
const { addZeriRemind } = await import("../src/lib/mingli/calendar/zeri-remind");
const { birthText, castLinesText, customerUsage, profilesReadable, readingSections } = await import("../src/lib/admin-usage");

const place = { id: "1668341", name: "Taipei Daan", lat: 25.03, lon: 121.54, tz: "Asia/Taipei" };
const A = { calendar: "solar", y: 1990, m: 5, d: 17, leap: false, timeMode: "exact", h: 12, mi: 30, place } as const;
const EMAIL = "u115@reader115.net";
const cid = upsertCustomer(EMAIL, "zh-hant");
const T = Date.now() - 5 * 86_400_000;
saveProfiles(cid, [
  { id: "p115self", who: "self", name: "我", gender: "female", input: A as never, at: T },
  { id: "p115mom", who: "family", name: "媽媽", gender: "female", input: { calendar: "lunar", y: 1962, m: 8, d: 3, leap: false, timeMode: "branch", branch: 4, placeId: "tw-khh" } as never, at: T + 1 },
]);
const b = birthFromBody(A, "female");
if ("error" in b) throw new Error("birth");
const rep = createReport({ kind: "deep", locale: "zh-hant", register: null, customerId: cid, email: null, facts: factsFromBirth(b.n, "female", "deep"), paid: { session: "member:115", amountMinor: 0 } }).token;
db().prepare("UPDATE bazi_reports SET status = 'done', body_json = '{}' WHERE token = ?").run(rep);

const tk = createDraw({ question: "他這個月會不會主動聯絡我呢", spread: 3, locale: "zh-hant", bid: null, customerId: cid, register: null }).token;
markTarotPaid(tk, { session: "cs_test_tarot115", email: EMAIL, currency: "TWD", amountMinor: 9900, customerId: cid });
setTarotPersonal(tk, JSON.stringify({ reading: "這三張牌說的是……", cards: ["現在：……", "卡住的地方：……", "接下來：……"], watch: "留意他的語氣", next: "先把想說的寫下來" }));
setTarotFollowup(tk, "那我要先聯絡他嗎", JSON.stringify({ answer: "可以先等一週……", cast: false }));
setTarotRevisit(tk, 30, "他主動傳訊息");
createQianDraw({ token: "q115tokaaaa", setName: "liushi-jiazi", num: 23, temple: "donggang", situation: "work", question: "工作要不要換", locale: "zh-hant", device: null, customerId: cid });
db().prepare("UPDATE qian_draws SET paid_at = ?, paid_session = 'member:115', personal_json = ? WHERE token = 'q115tokaaaa'").run(T, JSON.stringify({ reading: "這支籤說……", watch: "……", next: "……" }));
saveQa({ customerId: cid, bid: null, system: "bazi", chartHash: "h115", locale: "zh-hant", question: "我適合什麼樣的工作？", answer: "你的盤……", cast: false });
saveJiaobeiAsk({ question: "要不要去面試", rule: 3, seq: ["sheng", "xiao", "sheng"] as never, locale: "zh-hant", bid: null, customerId: cid });
const ymd = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
addZeriRemind({ email: EMAIL, ymd, slug: "banjia", locale: "zh-hant", ask: false, customerId: cid });

const CODE = /[{}[\]"]|\b(?:cups|wands|swords|pentacles)-\d|member:|cs_test|liushi-jiazi|zh-hant\b|null|undefined/;

describe("进度表 115 客户页：每个产品的使用记录", () => {
  it("生辰档案 in words — date, time or 时辰, place — never the stored JSON", () => {
    const ps = profilesReadable(cid);
    expect(ps).toHaveLength(2);
    expect(ps[0]).toMatchObject({ name: "我", who: "自己" });
    expect(ps[0]!.text).toBe("女 · 国历 1990 年 5 月 17 日 · 12:30 · Taipei Daan");
    expect(ps[1]).toMatchObject({ name: "媽媽", who: "家人" });
    expect(ps[1]!.text).toContain("农历 1962 年 8 月 3 日");
    expect(ps[1]!.text).toContain("辰时（07–09 点）");
    expect(ps[1]!.text).toContain("高雄");
    for (const p of ps) expect(p.text).not.toMatch(CODE);
    expect(birthText(null)).toBe("（这份生辰读不出来）");
    expect(birthText({ calendar: "solar", y: 2001, m: 1, d: 2, timeMode: "unknown" })).toBe("国历 2001 年 1 月 2 日 · 出生时间不知道 · 出生地没填");
  });

  it("六爻: the lines in words, the reading by its parts", () => {
    expect(castLinesText({ values_str: "6,7,7,6,6,6", changing: "1,4,5,6", palace: "zhen", palace_phase: "wood", world_pos: 4, response_pos: 1 }))
      .toBe("动爻：初爻、四爻、五爻、上爻 · 震宫（木） · 世在四爻、应在初爻");
    expect(castLinesText({ values_str: "787878", changing: null })).toBe("六爻都没动（静卦）");
    expect(castLinesText({ values_str: "797878", changing: null })).toBe("动爻：二爻");
    const parts = readingSections(JSON.stringify({ verdict: { "zh-hant": "會成，但要慢" }, timing: { "zh-hant": "十月中旬" }, basis: { "zh-hant": "世爻旺" }, newfield: { "zh-hant": "新的" } }), "zh-hant");
    expect(parts.map((p) => p.label)).toEqual(["结论", "应期", "卦理依据", "newfield"]);
    expect(parts[0]!.text).toBe("會成，但要慢");
    expect(readingSections("not json", "zh-hant")).toEqual([]);
  });

  it("every product used, each time in words: what, for whom, how it was had, written yet, the reader's page", async () => {
    const { groups, unused } = await customerUsage(cid, EMAIL);
    const g = (k: string) => groups.find((x) => x.key === k)!;
    expect(groups.map((x) => x.key)).toEqual(expect.arrayContaining(["tarot", "qian", "jiaobei", "bazi", "qa", "zeri"]));
    expect(unused).toEqual(expect.arrayContaining(["六爻", "今日一籤", "合盘", "年书"]));

    const t = g("tarot").items[0]!;
    expect(t.title).toBe("他這個月會不會主動聯絡我呢");
    expect(t.lines[0]).toMatch(/^三张牌：現在：.+（(正|逆)位）；卡住的地方：.+；接下來：.+（(正|逆)位）$/);
    expect(t.lines.join(" ")).toContain("回访：30 天后");
    expect(t).toMatchObject({ state: { text: "个人解读写好了" }, href: `/zh-hant/tarot/r/${tk}` });
    expect(t.how).toMatch(/^单买 NT\$99/);
    expect(t.sections!.map((s) => s.label)).toEqual(["个人解读", "每张牌", "留意", "下一步", "追问：那我要先聯絡他嗎"]);

    const q = g("qian").items[0]!;
    expect(q.title).toMatch(/^六十甲子籤 第 23 籤「.+」/);
    expect(q.lines).toEqual(expect.arrayContaining(["问：工作要不要換", "处境：工作"]));
    expect(q.lines.some((l) => l.startsWith("在哪间庙："))).toBe(true);
    expect(q).toMatchObject({ how: "通卡／会员额度", href: "/zh-hant/jieqian/r/q115tokaaaa" });
    expect(q.sections![0]!.label).toBe("籤诗");

    expect(g("jiaobei").items[0]!.lines[0]).toBe("要连三个聖筊 · 擲出：聖筊、笑筊、聖筊");
    const r = g("bazi").items[0]!;
    expect(r).toMatchObject({ title: "八字深度報告", how: "通卡／会员额度", state: { text: "写好了" }, href: `/zh-hant/bazi/r/${rep}` });
    expect(r.lines).toContain("给：我");
    expect(g("qa").items[0]).toMatchObject({ title: "我適合什麼樣的工作？", lines: ["问的是八字盘"] });
    expect(g("qa").items[0]!.sections![0]).toEqual({ label: "回答", text: "你的盤……" });
    expect(g("zeri").items[0]!.title).toBe(`${ymd} 搬家`);

    // nothing on the page reads as code
    for (const grp of groups) {
      expect(grp.summary).not.toMatch(CODE);
      for (const it of grp.items) for (const s of [it.title, ...it.lines, it.how ?? "", it.state?.text ?? ""]) expect(s, `${grp.key}: ${s}`).not.toMatch(CODE);
    }
  });
});
