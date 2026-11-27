import { describe, expect, it } from "vitest";

/**
 * 10-23 进度表 114「我的報告」(#838: 「合盤找不到要去信箱，深入紫微每次要再點」): every report and personal reading of an
 * account in one list — name, for whom (their own birth profile's name when the chart is theirs, else a short line of
 * the chart), when, written yet, the link; a member's rewrites shown once (the newest); a 年書's year parts not listed
 * on their own; drafts never paid left out. The chart page's 「你這張盤的深度報告 → 打開」, and the support summary no
 * longer calling a report order 「无解读」.
 */
const { db, upsertCustomer, recordOrder, createQianDraw } = await import("../src/lib/db");
const { saveProfiles } = await import("../src/lib/birth-profiles");
const { createReport, factsFromBirth, birthFromBody } = await import("../src/lib/mingli/bazi/report");
const { createZiweiReport, ziweiFacts } = await import("../src/lib/mingli/ziwei/report");
const { createAstroReport, astroFacts, astroBirthFromBody } = await import("../src/lib/mingli/astro/report");
const { hepanReport } = await import("../src/lib/mingli/hepan/report");
const { nianshuOfChild } = await import("../src/lib/mingli/nianshu/report");
const { createDraw, markTarotPaid } = await import("../src/lib/tarot");
const { myReports, reportsForChart, reportForOrder } = await import("../src/lib/my-reports");
const { tierLabel, gatherFacts, ensureAutoColumns } = await import("../src/lib/support-auto");
const { ensureInboxTable } = await import("../src/lib/inbound");

const place = { id: "1668341", name: "Taipei Daan", lat: 25.03, lon: 121.54, tz: "Asia/Taipei" };
const A = { calendar: "solar", y: 1990, m: 5, d: 17, leap: false, timeMode: "exact", h: 12, mi: 30, place } as const; // 我 (female)
const B = { calendar: "solar", y: 1988, m: 11, d: 3, leap: false, timeMode: "exact", h: 8, mi: 0, place } as const; // 阿明 (male)
const C = { calendar: "solar", y: 1975, m: 2, d: 9, leap: false, timeMode: "exact", h: 21, mi: 15, place } as const; // a friend — no profile

const cid = upsertCustomer("r114@reader114.net", "zh-hant");
const T = Date.now() - 10 * 86_400_000;
saveProfiles(cid, [
  { id: "pself01", who: "self", name: "我", gender: "female", input: A as never, at: T },
  { id: "pming02", who: "partner", name: "阿明", gender: "male", input: B as never, at: T },
]);
const n = (x: object, g: "male" | "female") => { const b = birthFromBody(x, g); if ("error" in b) throw new Error(b.error); return b.n; };
const paid = { session: "member:1", amountMinor: 0 };
const setStatus = (table: string, token: string, status: string, at?: number) =>
  db().prepare(`UPDATE ${table} SET status = ?, body_json = '{}'${at ? ", created_at = ?, paid_at = ?" : ""} WHERE token = ?`).run(...(at ? [status, at, at, token] : [status, token]));

// 八字: a deep report of 我, then a member's rewrite of the same chart (newer, still being written); a 正緣畫像 補好了
const fA = factsFromBirth(n(A, "female"), "female", "deep");
const baziA = createReport({ kind: "deep", locale: "zh-hant", register: null, customerId: cid, email: null, facts: fA, paid }).token;
setStatus("bazi_reports", baziA, "done", T + 1000);
const baziA2 = createReport({ kind: "deep", locale: "zh-hant", register: null, customerId: cid, email: null, facts: { ...fA, asOf: "國曆 2026 年 10 月" }, paid, salt: "r1" }).token;
setStatus("bazi_reports", baziA2, "writing", T + 5000);
const loveA = createReport({ kind: "love", locale: "zh-hant", register: null, customerId: cid, email: null, facts: factsFromBirth(n(A, "female"), "female", "love"), paid }).token;
setStatus("bazi_reports", loveA, "done", T + 2000);
db().prepare("INSERT INTO emails (session_id, kind, email, sent_at, status) VALUES (?, 'bazi-mended', 'r114@reader114.net', ?, 'sent')").run(`bazi:${loveA}`, T + 3000);
// a draft never paid — not listed
createReport({ kind: "deep", locale: "zh-hant", register: null, customerId: cid, email: null, facts: factsFromBirth(n(C, "male"), "male", "deep") });

// 紫微: 阿明's chart and a friend's
const zB = createZiweiReport({ kind: "deep", locale: "zh-hant", register: null, customerId: cid, email: null, facts: ziweiFacts(n(B, "male"), "male", "deep"), paid }).token;
setStatus("ziwei_reports", zB, "done", T + 4000);
const zC = createZiweiReport({ kind: "deep", locale: "zh-hant", register: null, customerId: cid, email: null, facts: ziweiFacts(n(C, "male"), "male", "deep"), paid }).token;
setStatus("ziwei_reports", zC, "done", T + 6000);

// 星盤: 我
const aA = astroBirthFromBody(A, "female");
if ("error" in aA) throw new Error("astro birth");
const sA = createAstroReport({ kind: "deep", locale: "zh-hant", register: null, customerId: cid, email: null, facts: astroFacts(aA.n, "deep", Date.now(), undefined, aA.houses), paid }).token;
setStatus("astro_reports", sA, "done", T + 7000);

// 合盤: 我 × the friend (each side keeps only year branch, day pillar and 生肖 — no name, no birth date)
hepanReport("000000000000000000000000"); // a well-formed token makes the table
const pA = fA.pillars.map((p) => p.gz), pC = factsFromBirth(n(C, "male"), "male", "deep").pillars.map((p) => p.gz);
const HP = "a114a114a114a114a114a114";
const side = (p: string[], zodiac: string) => ({ zodiac, yearBranch: p[0]!.slice(1), dayPillar: p[2]! });
db().prepare("INSERT INTO hepan_reports (token, kind, locale, customer_id, chart_json, input_hash, paid_at, paid_session, status, body_json, created_at) VALUES (?, 'pair', 'zh-hant', ?, ?, 'h', ?, 'cs_test_hepan114', 'done', '{}', ?)")
  .run(HP, cid, JSON.stringify({ a: side(pA, "馬"), b: side(pC, "兔") }), T + 8000, T + 8000);

// 年書 of 阿明 (2027): its 八字 year part is the 年書, not a row of its own
nianshuOfChild("bazi", "make-the-table");
const yB = createReport({ kind: "year", locale: "zh-hant", register: null, customerId: cid, email: null, facts: factsFromBirth(n(B, "male"), "male", "year"), paid }).token;
db().prepare("INSERT INTO nianshu_reports (token, locale, customer_id, year, chart_json, input_hash, bazi_token, paid_at, paid_session, status, created_at) VALUES ('ns114tok', 'zh-hant', ?, 2027, '{}', 'h', ?, ?, 'cs_test_ns114', 'writing', ?)")
  .run(cid, yB, T + 9000, T + 9000);

// 塔羅: paid, not written yet (it is written on first open); a free draw — not listed
const tk = createDraw({ question: "他這個月會不會主動聯絡我呢", spread: 3, locale: "zh-hant", bid: null, customerId: cid, register: null }).token;
markTarotPaid(tk, { session: "cs_test_tarot114", email: "r114@reader114.net", currency: "TWD", amountMinor: 9900, customerId: cid });
createDraw({ question: "隨便抽一張", spread: 1, locale: "zh-hant", bid: null, customerId: cid, register: null });

// 解籤: written
createQianDraw({ token: "qtok114aaaa", setName: "liushi-jiazi", num: 23, temple: null, situation: "x", question: "工作要不要換", locale: "zh-hant", device: null, customerId: cid });
db().prepare("UPDATE qian_draws SET paid_at = ?, paid_session = 'cs_test_qian114', personal_json = '{}', personal_at = ? WHERE token = 'qtok114aaaa'").run(T + 11_000, T + 11_000);

describe("我的報告：一張清單", () => {
  it("nine, newest first; a member's rewrite once (the newest), no 年書 part, no unpaid draft, no free draw", async () => {
    const list = await myReports(cid, "zh-hant");
    expect(list).toHaveLength(9);
    expect(list.map((r) => r.at)).toEqual([...list.map((r) => r.at)].sort((x, y) => y - x));
    const bazi = list.filter((r) => r.filter === "bazi");
    expect(bazi).toHaveLength(1);
    expect(bazi[0]).toMatchObject({ name: "八字深度報告", who: "我", state: "writing", href: `/zh-hant/bazi/r/${baziA2}` });
    expect(list.some((r) => r.href.endsWith(yB))).toBe(false);
  });
  it("for whom: the profile's name when the chart is one of theirs, else a short line of the chart; 合盤 both sides", async () => {
    const list = await myReports(cid, "zh-hant");
    const by = (href: string) => list.find((r) => r.href.endsWith(href))!;
    expect(by(loveA)).toMatchObject({ filter: "zhengyuan", name: "正緣畫像", who: "我", state: "mended" });
    expect(by(zB)).toMatchObject({ filter: "ziwei", name: "紫微深度報告", who: "阿明", state: "done" });
    expect(by(zC).who).toMatch(/^命宮在./);
    expect(by(sA)).toMatchObject({ filter: "astro", name: "星盤深度報告", who: "我" });
    expect(by(HP)).toMatchObject({ filter: "hepan", name: "合盤報告", href: `/zh-hant/hepan/r/${HP}` });
    expect(by(HP).who).toMatch(/^我 × 屬兔・..日$/);
    expect(by("ns114tok")).toMatchObject({ filter: "nianshu", name: "2027 年書", who: "阿明", state: "writing" });
    expect(by(tk)).toMatchObject({ filter: "tarot", name: "塔羅個人解讀", who: null, state: "writing" });
    expect(by(tk).question).toBe("他這個月會不會主動聯絡我呢");
    expect(by("qtok114aaaa")).toMatchObject({ filter: "jieqian", state: "done", href: "/zh-hant/jieqian/r/qtok114aaaa" });
    expect(by("qtok114aaaa").name).toContain("六十甲子籤 第 23 籤");
  });
  it("in 简体 and in English the frame follows the reader", async () => {
    const zh = await myReports(cid, "zh");
    expect(zh.find((r) => r.filter === "hepan")!.name).toBe("合盘报告");
    expect(zh.find((r) => r.filter === "zhengyuan")!.name).toBe("正缘画像");
    const en = await myReports(cid, "en");
    expect(en.find((r) => r.filter === "nianshu")!.name).toBe("2027 Year Book");
  });
  it("another account sees none of it", async () => {
    expect(await myReports(upsertCustomer("other114@reader114.net", "zh-hant"), "zh-hant")).toEqual([]);
  });
});

describe("排盤頁：這張盤已有報告就直接給連結", () => {
  it("八字: the newest deep version and the 正緣畫像; 紫微 and 星盤 the deep report; nothing for a chart without one", async () => {
    const bz = await reportsForChart(cid, "bazi", A, "female");
    expect(bz.map((x) => [x.kind, x.href])).toEqual([["deep", `/zh-hant/bazi/r/${baziA2}`], ["love", `/zh-hant/bazi/r/${loveA}`]]);
    expect((await reportsForChart(cid, "ziwei", C, "male")).map((x) => x.href)).toEqual([`/zh-hant/ziwei/r/${zC}`]);
    expect((await reportsForChart(cid, "astro", A, undefined)).map((x) => x.href)).toEqual([`/zh-hant/xingpan/r/${sA}`]);
    expect(await reportsForChart(cid, "bazi", B, "male")).toEqual([]); // only a 年書 part — not a deep report
    expect(await reportsForChart(upsertCustomer("other114b@reader114.net", "zh-hant"), "bazi", A, "female")).toEqual([]);
  });
});

describe("客服摘要：报告类订单不再写「无解读」", () => {
  it("an order of a report product finds its report: written or not, its page, the letter that delivered it", () => {
    expect(reportForOrder("hepan_pair", "cs_test_hepan114")).toEqual({ locale: "zh-hant", done: true, href: `/zh-hant/hepan/r/${HP}`, mailKind: "hepan" });
    expect(reportForOrder("nianshu", "cs_test_ns114")).toMatchObject({ done: false, href: "/zh-hant/nianshu/r/ns114tok" });
    expect(reportForOrder("tarot", "cs_test_tarot114")).toMatchObject({ done: false, mailKind: "tarot" });
    expect(reportForOrder("deep", "cs_whatever")).toBeNull();
    expect(tierLabel("hepan_pair", "zh")).toBe("合盘报告");
    expect(tierLabel("ziwei_deep", "zh-hant")).toBe("紫微深度報告");
  });
  it("gatherFacts: the 合盤 order reads as written, with its own page", () => {
    ensureInboxTable();
    ensureAutoColumns();
    recordOrder({ sessionId: "cs_test_hepan114", customerId: cid, castId: null, tier: "hepan_pair", amountCents: 89000, currency: "TWD", email: "r114@reader114.net", status: "paid" });
    const f = gatherFacts({ id: "in114", received_at: Date.now(), from_addr: "r114@reader114.net", from_name: null, to_addrs: null, subject: "合盤找不到", text: "", html: null, auth: null, attachments: null, customer_id: cid, forwarded_at: null, forward_error: null, handled_at: null, note: null });
    const o = f.orders.find((x) => x.session_id === "cs_test_hepan114")!;
    expect(o.reading_locale).toBe("zh-hant");
    expect(o.report_href).toBe(`/zh-hant/hepan/r/${HP}`);
  });
});
