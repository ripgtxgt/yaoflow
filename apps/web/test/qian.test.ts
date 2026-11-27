import { describe, expect, it } from "vitest";
// DATA_DIR is a fresh temp dir (test/setup.ts)
import { LISTED_TEMPLES, qianShareUrl } from "../src/lib/qian-meta";
import { allQian, qianByNum, qianCastUrl, qianOrdinal, qianPageTitle, qianPromptNote, QIAN_SITUATIONS, TEMPLES } from "../src/lib/qian";
import { readCastExtras } from "../src/lib/cast-extras";
import type { LineValue } from "@yaoflow/engine";
import { resolveServerChart } from "../src/lib/reading";
import { claimQianDraws, createMatter, upsertCustomer, saveCast, attachQianCast, createQianDraw, markQianPaid, qianDrawByToken, qianDrawsForMatter, joinYearWaitlist, yearWaitlistStats, db } from "../src/lib/db";
import { fulfilQianPayment, personalOffense } from "../src/lib/qian-personal";
import { LOVE_LANDINGS, loveCastUrl, pickLoveCases } from "../src/lib/love-landing";

/** 10-12 解籤第一期 / 感情落地頁 / 2027 年卦预约 (进度表 §四 36–38). */
describe("解籤 · 六十甲子籤的内容", () => {
  it("60 lots, four lines of seven, every field written, nothing the rules forbid", () => {
    const all = allQian();
    expect(all.length).toBe(60);
    const bad = /神明|靈驗|灵验|改運|改运|保證|保证|一定|準|AI/;
    for (const e of all) {
      expect(e.poem.length, `${e.num}`).toBe(4);
      for (const l of e.poem) expect(l.length, `${e.num}`).toBe(7);
      for (const k of ["title", "plain", "overall", "love", "work", "ask_next"] as const) {
        expect(e[k].length, `${e.num}.${k}`).toBeGreaterThan(5);
        expect(e[k], `${e.num}.${k}`).not.toMatch(bad);
      }
      expect(["順", "平", "阻"]).toContain(e.lean);
    }
    expect(qianByNum(0)).toBeNull();
    expect(qianByNum(61)).toBeNull();
    expect(qianByNum(1)!.ganzhi).toBe("甲子");
    // 10-12: the wording follows 東港鎮海宮's own site (www.8327777.org.tw), checked lot by lot — 29 lines in 24 lots
    // differed from the temples.tw copy the first draft used
    expect(qianByNum(3)!.poem[1]).toBe("天註姻緣自有餘");
    expect(qianByNum(48)!.poem[0]).toBe("陰世作事未和同");
    expect(qianByNum(57)!.poem).toEqual(["勸君把定心莫虛", "前途清吉得安居", "到底中間無大事", "又遇神仙相扶持"]);
  });

  it("numbers the way temples print them, and titles the page for search without 「AI」", () => {
    expect([1, 10, 11, 20, 21, 60].map(qianOrdinal)).toEqual(["一", "十", "十一", "二十", "二十一", "六十"]);
    expect(qianPageTitle(qianByNum(7)!)).toBe("六十甲子籤第 7 籤（乙丑）解籤｜白話、感情與工作怎麼看");
    for (const e of allQian()) expect(qianPageTitle(e)).not.toMatch(/AI/);
  });

  it("the cast it opens carries the question, the situation chip, the draw and the campaign — the question never in the result URL", () => {
    const u = new URL(`https://x${qianCastUrl({ token: "a".repeat(24), question: "他會回來嗎", situation: "fuhe" })}`);
    expect(u.pathname).toBe("/zh-hant/cast");
    expect(u.searchParams.get("q")).toBe("他會回來嗎");
    expect(u.searchParams.get("st")).toBe("apart");
    expect(u.searchParams.get("qian")).toBe("a".repeat(24));
    expect(u.searchParams.get("c")).toBe("jieqian");
    expect(new URL(`https://x${qianCastUrl({ token: "b".repeat(24), question: "換工作好嗎", situation: "work" })}`).searchParams.get("st")).toBeNull();
    const withLot = new URL(`https://x${qianCastUrl({ token: "a".repeat(24), question: "q", situation: "fuhe", num: 7, title: "雲散月明" })}`);
    expect(withLot.searchParams.get("qn")).toBe("7");
    expect(withLot.searchParams.get("qt")).toBe("雲散月明");
    expect(qianShareUrl("https://yaoflow.com", 16)).toBe("https://yaoflow.com/zh-hant/jieqian?n=16&c=qian-share");
    expect(QIAN_SITUATIONS.map((s) => s.label)).toEqual(["復合", "斷聯", "曖昧", "感情其他", "工作", "其他"]);
    expect(TEMPLES[0]!.name).toBe("東港鎮海宮");
    // 10-12 核对: 鹿港天后宮 uses the 100-lot 天后宮籤 — not offered for this set
    expect(LISTED_TEMPLES.filter((x) => x.set === "liushi-jiazi").map((x) => x.name)).not.toContain("鹿港天后宮");
    expect(LISTED_TEMPLES.find((x) => x.id === "lugang")?.set).toBe("tianhou"); // 10-12: 鹿港 is listed again, under its own set
    expect(LISTED_TEMPLES.filter((x) => x.set === "liushi-jiazi").map((x) => x.name)).toEqual(["東港鎮海宮", "北港朝天宮", "新港奉天宮", "臺灣省城隍廟", "其他（籤上寫著甲子、乙丑這類干支的）"]);
  });

  it("the reading's model gets the lot as background and the rules with it", () => {
    const note = qianPromptNote(qianByNum(7)!.lean === "平" ? qianByNum(7)! : allQian().find((e) => e.lean === "平")!, "東港鎮海宮");
    expect(note).toMatch(/lot no\. \d+ \(/);
    expect(note).toContain("It does not change the chart");
    expect(note).toMatch(/never take a date/);
    // 10-12 承接 ⑨: the lot's tone goes in, the two are tied together near the opening, and a split is said one fixed way
    expect(note).toContain("general tone: mixed");
    expect(note).toContain("籤看的是大方向和心態，卦看的是這件事此刻的走向和日子");
    expect(note).toMatch(/never tell the reader to draw again or cast again/);
  });
});

describe("解籤 · 抽籤记录、起卦、同一件事", () => {
  it("a cast request carries a lot only by a token we hold — the lot's facts come from our row", () => {
    const token = "c".repeat(24);
    createQianDraw({ token, setName: "liushi-jiazi", num: 7, temple: "donggang", situation: "fuhe", question: "他會回來嗎", locale: "zh-hant", device: null, customerId: null });
    expect(readCastExtras({ qian: token }, "他會回來嗎", "zh-hant").qian).toEqual({ token, num: 7, temple: "東港鎮海宮" });
    expect(readCastExtras({ qian: "d".repeat(24) }, "q", "zh-hant").qian).toBeUndefined();
    expect(readCastExtras({ qian: "not-a-token" }, "q", "zh-hant").qian).toBeUndefined();
  });

  it("the cast that follows is attached once, with its matter; the matter lists its lots", () => {
    const token = "e".repeat(24);
    createQianDraw({ token, setName: "liushi-jiazi", num: 12, temple: null, situation: "work", question: "要不要換工作", locale: "zh-hant", device: null, customerId: null });
    const d = db();
    const cid = upsertCustomer("qian-m@example.com", "zh-hant");
    const mid = createMatter(cid, "換工作", "rule", "career");
    const V: LineValue[] = [7, 8, 9, 8, 7, 6];
    const chart = resolveServerChart({ question: "要不要換工作", values: V, castAtMs: Date.UTC(2026, 9, 12, 4), tzOffsetMinutes: 480 }, true) as unknown as Record<string, unknown>;
    const castId = saveCast({ customerId: cid, castAtMs: Date.UTC(2026, 9, 12, 4), tzOffsetMinutes: 480, locale: "zh-hant", question: "要不要換工作", topic: "career", values: V, chart });
    d.prepare("UPDATE casts SET matter_id = ? WHERE id = ?").run(mid, castId);
    attachQianCast(token, castId);
    attachQianCast(token, castId + 999);
    const row = qianDrawByToken(token)!;
    expect(row.cast_id).toBe(castId);
    expect(row.matter_id).toBe(mid);
    expect(row.customer_id).toBe(cid);
    expect(qianDrawsForMatter(mid).map((q) => q.num)).toEqual([12]);
    markQianPaid(token, { session: "cs_test_q", email: "Buyer@Example.com", currency: "TWD", amountMinor: 7500, customerId: null });
    expect(qianDrawByToken(token)!.email).toBe("buyer@example.com");
  });

  it("the personal reading refuses deities, promises and dates", () => {
    const ok = { reading: "這支籤說的是先把話講開。".repeat(8), watch: "先傳一則輕鬆的訊息。", next: "他哪幾天會先開口？為這件事起一卦看看？" };
    expect(personalOffense(ok)).toBeNull();
    expect(personalOffense({ ...ok, reading: ok.reading + "媽祖說會成。" })).toMatch(/^forbidden/);
    expect(personalOffense({ ...ok, watch: "10月20日前後傳訊息。" })).toMatch(/^date/);
    expect(personalOffense({ ...ok, watch: "三天內會有消息。" })).toBeNull(); // 三天 in Chinese numerals is not a date the guard reads; the prompt forbids it
    expect(personalOffense({ ...ok, reading: "太短" })).toBe("short");
    expect(personalOffense({ ...ok, next: "要不要我幫你抽一支看什麼時候動比較順？" })).toMatch(/^redraw/);
    expect(personalOffense({ ...ok, next: "你最想知道的，是他哪幾天會回？" })).toBe("next:no-cast"); // 10-13: the closing line names the cast
  });
});

describe("解籤 · 收尾", () => {
  it("a browser's unowned lots join the account it turns out to be", () => {
    const token = "f".repeat(24);
    createQianDraw({ token, setName: "liushi-jiazi", num: 3, temple: null, situation: "other", question: "q", locale: "zh-hant", device: "a1b2c3d4e5f6a1b2c3d4e5f6", customerId: null });
    const cid = upsertCustomer("qian-claim@example.com", "zh-hant");
    expect(claimQianDraws("a1b2c3d4e5f6a1b2c3d4e5f6", cid)).toBe(1);
    expect(qianDrawByToken(token)!.customer_id).toBe(cid);
    expect(claimQianDraws("a1b2c3d4e5f6a1b2c3d4e5f6", cid + 1)).toBe(0); // already someone's
  });

  it("a paid lot reading becomes an order (tier qian) — once, however often the payment is seen", () => {
    const token = "9".repeat(24);
    createQianDraw({ token, setName: "liushi-jiazi", num: 5, temple: null, situation: "work", question: "q", locale: "zh-hant", device: null, customerId: null });
    const sess = { id: "cs_test_qian_order", url: null, payment_status: "paid", status: "complete", amount_total: 7500, currency: "twd", payment_intent: "pi_q", customer_details: { email: "Q-Buyer@example.com" }, metadata: { kind: "qian", qian: token, c: "jieqian" } } as never;
    expect(fulfilQianPayment(sess)).toMatchObject({ ok: true, created: true });
    expect(fulfilQianPayment(sess)).toMatchObject({ ok: true, created: false });
    const o = db().prepare("SELECT tier, amount_cents, payment_state, cast_id, campaign FROM orders WHERE session_id = 'cs_test_qian_order'").all() as { tier: string; amount_cents: number; payment_state: string; cast_id: number | null; campaign: string }[];
    expect(o).toEqual([{ tier: "qian", amount_cents: 7500, payment_state: "paid", cast_id: null, campaign: "jieqian" }]);
  });
});

describe("感情落地頁 · 2027 年卦预约", () => {
  it("four pages; the cast each opens says the situation and its own campaign tag", () => {
    expect(LOVE_LANDINGS.map((p) => p.slug)).toEqual(["fuhe", "hui-lai", "zheng-yuan", "zhu-dong"]);
    const u = new URL(`https://x${loveCastUrl(LOVE_LANDINGS[0]!, " 他年底前會主動找我嗎？ ")}`);
    expect(u.searchParams.get("q")).toBe("他年底前會主動找我嗎？");
    expect(u.searchParams.get("st")).toBe("apart");
    expect(u.searchParams.get("c")).toBe("ask-fuhe");
    expect(new URL(`https://x${loveCastUrl(LOVE_LANDINGS[2]!, "q")}`).searchParams.get("st")).toBeNull();
    for (const p of LOVE_LANDINGS) {
      expect(p.examples.length).toBe(3);
      expect(p.pairs.length).toBe(3);
      expect(`${p.title}${p.description}${p.h1}${p.sub}`).not.toMatch(/準|AI|保證/);
    }
  });

  it("cases that read like the page come first, then other love cases, five at most", () => {
    const mk = (id: string, framing: string | null) => ({ public_id: id, framing });
    const picked = pickLoveCases(LOVE_LANDINGS[0]!, [mk("a", "他會不會主動約我"), mk("b", "前任會回來嗎"), mk("c", null), mk("d", "想復合"), mk("e", "x"), mk("f", "y")]);
    expect(picked.map((c) => c.public_id)).toEqual(["b", "d", "a", "c", "e"]);
  });

  it("the waitlist keeps one row per address and counts by kind", () => {
    expect(joinYearWaitlist("Year@Example.com", "love", "zh-hant", "threads")).toBe("new");
    expect(joinYearWaitlist("year@example.com", "work", "zh-hant", null)).toBe("again");
    joinYearWaitlist("year2@example.com", "money", "zh-hant", null);
    const s = yearWaitlistStats();
    expect(s.total).toBe(2);
    expect(s.byKind).toEqual({ work: 1, money: 1 });
    expect(s.byVia.find((v) => v.via === "threads")?.n).toBe(1);
  });
  it("各廟用字: all 60 lots for each listed temple, and the right wording shown where the reader drew", async () => {
    const q = await import("../src/lib/qian");
    const data = (await import("../src/data/qian-temple-poems.json")).default as { temples: Record<string, Record<string, string[]>> };
    for (const id of ["beigang", "xingang", "chenghuang"]) {
      expect(Object.keys(data.temples[id]!)).toHaveLength(60);
      for (const lines of Object.values(data.temples[id]!)) { expect(lines).toHaveLength(4); for (const l of lines) expect([...l]).toHaveLength(7); }
    }
    const e3 = q.qianByNum(3)!;
    expect(q.qianPoemAt(e3, null)[1]).toBe("天註姻緣自有餘");
    expect(q.qianPoemAt(e3, "donggang")[1]).toBe("天註姻緣自有餘");
    expect(q.qianPoemAt(e3, "beigang")[1]).toBe("天註衣祿自有餘");
    expect(q.qianPoemAt(e3, "北港朝天宮")[1]).toBe("天註衣祿自有餘"); // a cast carries the name
    expect(q.qianPoemAt(e3, "other")).toEqual(e3.poem);
    expect(q.qianDiffAt(e3, "chenghuang")).toEqual([{ line: 2, base: "天註姻緣自有餘", theirs: "天註衣祿自有餘" }]);
    // 第 1 籤: 城隍廟 prints it as 鎮海宮 does; 北港 and 新港 share one variant
    const v1 = q.qianVariants(q.qianByNum(1)!);
    expect(v1).toEqual([{ temples: ["北港朝天宮", "新港奉天宮"], diffs: [{ line: 2, base: "光明清淨照世間", theirs: "光明清靜照世間" }] }]);
    expect(q.qianPromptNote(e3, "臺灣省城隍廟")).toContain("天註衣祿自有餘");
  });
  it("籤系: 黃大仙靈籤 100 lots, its own pages, temples and card; old URLs and draws keep meaning 六十甲子籤", async () => {
    const q = await import("../src/lib/qian");
    const all = q.allQian("huangdaxian");
    expect(all).toHaveLength(100);
    expect(all.map((e) => e.num)).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
    const bad = /神明|神說|靈驗|改運|保證|一定|\bAI\b|再抽|抽一支|上上|下下|大吉/;
    for (const e of all) {
      expect(e.poem).toHaveLength(4);
      for (const l of e.poem) expect([...l]).toHaveLength(7);
      expect(e.story && e.story.length).toBeTruthy();
      expect(["順", "平", "阻"]).toContain(e.lean);
      for (const f of [e.title, e.plain, e.overall, e.love, e.work, e.ask_next]) expect(f, `${e.num}`).not.toMatch(bad);
      expect(e.ask_next.endsWith("？"), `${e.num}`).toBe(true);
      expect((e as unknown as { grade?: string }).grade).toBeUndefined(); // 籤等 never reaches a page
    }
    expect(q.qianByNum(1, "huangdaxian")!.story).toBe("姜公封相");
    expect(q.qianByNum(101, "huangdaxian")).toBeNull();
    expect(q.qianByNum(61)).toBeNull();
    expect(q.qianByNum(1)!.ganzhi).toBe("甲子"); // default set unchanged
    expect(q.qianByNum(1, "nope")!.ganzhi).toBe("甲子");
    expect(q.qianPath(7, "huangdaxian")).toBe("/zh-hant/qian/huangdaxian/7");
    expect(q.qianPath(7)).toBe("/zh-hant/qian/liushi-jiazi/7");
    expect(q.qianOrdinal(100)).toBe("一百");
    expect(q.qianPageTitle(q.qianByNum(4, "huangdaxian")!)).toBe("黃大仙靈籤第 4 籤（燕子教飛）解籤｜白話、感情與工作怎麼看");
    expect(q.qianShareUrl("https://yaoflow.com", 4, "huangdaxian")).toBe("https://yaoflow.com/zh-hant/jieqian?n=4&s=huangdaxian&c=qian-share");
    expect(q.templesFor("huangdaxian").map((t) => t.id)).toEqual(["siksikyuen", "hdx-other"]);
    expect(q.templesFor("liushi-jiazi").map((t) => t.id)).not.toContain("siksikyuen");
    // temple wordings belong to the 六十甲子籤 only
    const h3 = q.qianByNum(3, "huangdaxian")!;
    expect(q.qianPoemAt(h3, "beigang")).toEqual(h3.poem);
    expect(q.qianVariants(h3)).toEqual([]);
    const note = q.qianPromptNote(q.qianByNum(1, "huangdaxian")!, "嗇色園黃大仙祠");
    expect(note).toContain("黃大仙靈籤");
    expect(note).toContain("do not tell or explain that story");
    const castUrl = new URL(`https://x${q.qianCastUrl({ token: "c".repeat(24), question: "q", situation: "work", num: 37, title: "t", set: "huangdaxian" })}`);
    expect(castUrl.searchParams.get("qs")).toBe("huangdaxian");
  });

  it("籤系: a 黃大仙 draw carries its set into the cast", () => {
    const token = "9d".repeat(12);
    createQianDraw({ token, setName: "huangdaxian", num: 88, temple: "siksikyuen", situation: "work", question: "要不要換工作", locale: "zh-hant", device: null, customerId: null });
    expect(readCastExtras({ qian: token }, "要不要換工作", "zh-hant").qian).toEqual({ token, num: 88, temple: "嗇色園黃大仙祠", set: "huangdaxian" });
    const t2 = "9e".repeat(12);
    createQianDraw({ token: t2, setName: "huangdaxian", num: 5, temple: "hdx-other", situation: "work", question: "q2", locale: "zh-hant", device: null, customerId: null });
    expect(readCastExtras({ qian: t2 }, "q2", "zh-hant").qian?.temple).toBeNull();
  });
  it("籤系: 關聖帝君一百籤 — 100 lots checked against 行天宮, 天干 tags, its temples, Hong Kong text", async () => {
    const q = await import("../src/lib/qian");
    const all = q.allQian("guandi");
    expect(all).toHaveLength(100);
    const bad = /神明|神說|靈驗|改運|保證|一定|\bAI\b|再抽|抽一支|上上|下下|大吉/;
    for (const e of all) {
      expect(e.poem).toHaveLength(4);
      for (const l of e.poem) expect([...l]).toHaveLength(7);
      expect(e.ganzhi).toMatch(/^[甲乙丙丁戊己庚辛壬癸]{2}$/);
      for (const f of [e.title, e.plain, e.overall, e.love, e.work, e.ask_next]) expect(f, `${e.num}`).not.toMatch(bad);
      expect(e.ask_next.endsWith("？")).toBe(true);
      const hk = q.qianWording(e, true);
      expect(hk.plain).not.toBe(e.plain);
    }
    expect(q.qianByNum(1, "guandi")!.poem[0]).toBe("巍巍獨步向雲間");
    expect(q.qianByNum(2, "guandi")!.poem[3]).toBe("須憑方寸好修為"); // 行天宮, not 「更須」
    expect(q.qianTag(q.qianByNum(100, "guandi")!)).toBe("癸癸");
    expect(q.qianPageTitle(q.qianByNum(1, "guandi")!)).toBe("關聖帝君一百籤第 1 籤（甲甲）解籤｜白話、感情與工作怎麼看");
    expect(q.templesFor("guandi").map((t) => t.id)).toEqual(["xingtian", "wenwu", "gd-other"]);
    expect(q.isVagueTemple("gd-other")).toBe(true);
    expect(q.QIAN_SET_SOURCE.guandi).toMatch(/行天宮/);
  });
  it("籤系: 天后宮一百籤 — 臺南大天后宮's text, 卦名 tags, 鹿港 back in the list", async () => {
    const q = await import("../src/lib/qian");
    const all = q.allQian("tianhou");
    expect(all).toHaveLength(100);
    for (const e of all) {
      expect(e.poem).toHaveLength(4);
      for (const l of e.poem) expect([...l]).toHaveLength(7);
      expect(e.ganzhi && e.ganzhi.length).toBeGreaterThan(0);
      expect(e.ask_next.endsWith("？")).toBe(true);
      expect(q.qianWording(e, true).plain).not.toBe(e.plain);
    }
    expect(q.qianByNum(1, "tianhou")!.poem[0]).toBe("曉日瞳瞳萬象融");
    expect(q.qianByNum(3, "tianhou")!.poem[1]).toBe("今日相逢赤線牽"); // official 「亦線」 corrected
    expect(q.qianTag(q.qianByNum(1, "tianhou")!)).toBe("震");
    expect(q.templesFor("tianhou").map((t) => t.id)).toEqual(["tainan", "lugang", "guandu", "penghu", "th-other"]);
  });
  it("籤系: 月老聖籤 — lines of the classics, love only, no tag, the hard lots read safely", async () => {
    const q = await import("../src/lib/qian");
    const all = q.allQian("yuelao");
    expect(all).toHaveLength(100);
    for (const e of all) {
      expect(e.poem.length).toBeGreaterThan(0);
      expect(q.qianTag(e)).toBe("");
      expect(e.ask_next.endsWith("？")).toBe(true);
    }
    // the Hong Kong text is a rewrite (a plain line that reads the same in both is fine now and then)
    expect(all.filter((e) => q.qianWording(e, true).love !== e.love).length).toBeGreaterThan(95);
    expect(q.qianByNum(1, "yuelao")!.poem).toEqual(["關關雎鳩", "在河之洲", "窈窕淑女", "君子好逑"]);
    expect(q.qianByNum(100, "yuelao")!.poem).toEqual(["花好", "月圓", "人壽"]);
    expect(q.qianPageTitle(q.qianByNum(1, "yuelao")!)).toBe("月老聖籤第 1 籤「關關雎鳩」解籤｜白話、感情怎麼看");
    expect(q.situationsFor("yuelao").map((s) => s.section)).toEqual(["love", "love", "love", "love"]);
    expect(q.situationsFor("guandi")).toHaveLength(6);
    // 第 5 籤 (踰東家牆而摟其處子): read as a warning against crossing lines, never as encouragement
    const e5 = q.qianByNum(5, "yuelao")!;
    expect(e5.lean).not.toBe("順");
    expect(`${e5.plain}${e5.overall}${e5.love}`).toMatch(/尊重|越界|不正當|不值得/);
  });
  it("籤系: 觀音一百籤 — 龍山寺's set, 宮位 tags, its temples", async () => {
    const q = await import("../src/lib/qian");
    const all = q.allQian("guanyin");
    expect(all).toHaveLength(100);
    for (const e of all) {
      expect(e.poem).toHaveLength(4);
      for (const l of e.poem) expect([...l]).toHaveLength(7);
      expect(e.ganzhi).toMatch(/^[子丑寅卯辰巳午未申酉戌亥]宮$/);
      expect(e.ask_next.endsWith("？")).toBe(true);
    }
    expect(q.qianByNum(1, "guanyin")!.poem[0]).toBe("天開地闢結良緣");
    expect(q.qianByNum(14, "guanyin")!.poem[0]).toBe("宛如仙鶴出樊籠"); // as the 龍山寺 series quotes it
    expect(q.templesFor("guanyin").map((t) => t.id)).toEqual(["longshan", "gy-other"]);
    expect(all.filter((e) => q.qianWording(e, true).love !== e.love).length).toBeGreaterThan(95);
  });
  it("籤系: 籤詩網的其餘六套 — counts, line lengths, temples, Hong Kong text", async () => {
    const q = await import("../src/lib/qian");
    const want: Record<string, [number, number]> = { baosheng: [60, 7], zhusheng: [30, 5], guanyin28: [28, 7], guanyin24: [24, 7], qianbagua: [32, 5], sensoji: [100, 5] };
    for (const [set, [count, len]] of Object.entries(want)) {
      const all = q.allQian(set);
      expect(all, set).toHaveLength(count);
      for (const e of all) {
        expect(e.poem.length, `${set} ${e.num}`).toBe(4);
        if (!(set === "guanyin28" && e.num === 28)) for (const l of e.poem) expect([...l].length, `${set} ${e.num} ${l}`).toBe(len); // 紫竹寺 28 is the 籤尾
        expect(e.ask_next.endsWith("？")).toBe(true);
        expect(q.qianTag(e)).toBe("");
      }
      expect(q.templesFor(set).length, set).toBeGreaterThan(0);
      expect(all.filter((e) => q.qianWording(e, true).love !== e.love).length, set).toBeGreaterThan(count * 0.9);
      expect(q.QIAN_SET_SOURCE[set]).toBeTruthy();
    }
    expect(q.qianByNum(1, "sensoji")!.poem).toEqual(["七寶浮圖塔", "高峯頂上安", "衆人皆仰望", "莫作等閑看"]);
    expect(q.qianPageTitle(q.qianByNum(1, "sensoji")!)).toBe("淺草寺觀音籤第 1 籤「七寶浮圖塔」解籤｜白話、感情與工作怎麼看");
    expect(q.isVagueTemple("jp-other")).toBe(true);
    expect(q.isVagueTemple("neimen")).toBe(false);
  });
});
