import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fiveGrids, numElement, splitName } from "@/lib/mingli/name/analyze";
import { yearGanzhi, yearTable } from "@/lib/mingli/taisui";
import { PURPOSES, PURPOSE_SLUGS, purposeDays } from "@/lib/mingli/calendar/zeri-purpose";
import { klineOf } from "@/lib/mingli/fun/kline";
import { FUN_BANNED } from "@/lib/mingli/fun/stories";
import { NAME_UI } from "@/lib/mingli/name/ui";
import { FUN_UI } from "@/lib/mingli/fun/ui";
import { CATALOG, catalogPrice } from "@/lib/catalog";

const src = (p: string) => readFileSync(join(__dirname, "../src", p), "utf8");

describe("122 姓名學 — the counting", () => {
  it("splits compound surnames", () => {
    expect(splitName("歐陽娜娜")).toEqual({ surname: "歐陽", given: "娜娜" });
    expect(splitName("王小明")).toEqual({ surname: "王", given: "小明" });
  });
  it("五格 by the book (單姓 +1, 單名 +1, 外格 = 天 + 地 − 人, 單姓單名 2)", () => {
    // 王(4) 小(3) 明(8): 天 5, 人 7, 地 11, 總 15, 外 9
    expect(fiveGrids([4], [3, 8])).toEqual({ tian: 5, ren: 7, di: 11, wai: 9, zong: 15 });
    expect(fiveGrids([4], [8]).wai).toBe(2);
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(numElement).join("")).toBe("木木火火土土金金水水");
  });
  it("the page words carry the 口径 and no banned wording", () => {
    const all = Object.entries(NAME_UI).filter(([k]) => !["lead", "howNo"].includes(k)).map(([, v]) => v).join("");
    expect(NAME_UI.endBaby).toContain("名字是你自己要叫一輩子的");
    expect(NAME_UI.endRename).toContain("改名以三次為限");
    expect(all).not.toMatch(/改運|旺財|化解|靈驗|很準/);
  });
  it("is sold like 合盤: one-off, member 8 折", () => {
    expect(catalogPrice("name_baby", "TWD")).toBe(49000);
    expect(catalogPrice("name_rename", "HKD")).toBe(12800);
    expect(catalogPrice("name_baby", "USD", { member: true })).toBeLessThan(1599);
    expect(CATALOG.name_baby.pass).toBe(false);
  });
  it("the report never shows a model number: 筆劃/五格 come from the data", () => {
    const page = src("app/[locale]/name/r/[token]/page.tsx");
    expect(page).toContain("readName(f.surname, n.given");
    expect(src("lib/mingli/name/report.ts")).toContain("只可以從給你的「可用字」裡挑字");
  });
});

describe("123 擇日按用途", () => {
  it("three uses, three months, titles with the year", () => {
    expect(PURPOSE_SLUGS.sort()).toEqual(["move", "opening", "wedding"]);
    const m = purposeDays(PURPOSES.wedding, "2026-10-29", "zh-hant");
    expect(m.length).toBeGreaterThanOrEqual(3);
    expect(PURPOSES.wedding.tips.join("")).toContain("剖腹");
  });
});

describe("125 犯太歲 2027 丁未", () => {
  it("值 羊, 沖 牛, 害 鼠, 破 狗", () => {
    expect(yearGanzhi(2027)).toBe("丁未");
    const t = yearTable(2027);
    expect(t.值.map((z) => z.animal)).toEqual(["羊"]);
    expect(t.沖.map((z) => z.animal)).toEqual(["牛"]);
    expect(t.害.map((z) => z.animal)).toContain("鼠");
    expect(t.破.map((z) => z.animal)).toContain("狗");
  });
});

describe("126 娛樂小品", () => {
  it("K 線 is a rhythm from fixed rules, open = last close", () => {
    const v = { pillars: [{ branch: "子" }, { branch: "寅" }, { branch: "午" }] as never, favour: ["木", "火"], strength: { level: "稍弱" } as never, dmEl: "火", decades: [{ gz: "甲寅", ten: "", startAge: 5, endAge: 14, startYear: 1995 }] };
    const c = klineOf(v as never, 1990, 2020, 2030);
    expect(c).toHaveLength(11);
    for (let i = 1; i < c.length; i++) expect(c[i]!.open).toBe(c[i - 1]!.close);
    for (const k of c) { expect(k.high).toBeGreaterThanOrEqual(Math.max(k.open, k.close)); expect(k.low).toBeLessThanOrEqual(Math.min(k.open, k.close)); }
    expect(FUN_UI.klNote).toContain("這是起伏的節奏，不是分數");
  });
  it("Neil 10-29: the pair piece is called 渣男鑑定, and its page says it labels nobody", () => {
    expect(FUN_UI.tgHead).toBe("渣男鑑定");
    expect(FUN_UI.tgLead).toContain("不替 TA 貼標籤");
    expect(FUN_UI.tgLead).toContain("不判斷 TA 的人品");
  });
  it("the story pages carry the disclaimer; no labels on TA", () => {
    expect(FUN_UI.plTop).toBe("這是依命盤寫的一段故事，供娛樂參考。");
    expect(FUN_BANNED.test("他是渣男")).toBe(true);
    expect(FUN_BANNED.test("轉世")).toBe(true);
    expect(FUN_BANNED.test("你們相處的節奏")).toBe(false);
  });
});

describe("122 姓名學 — the data and the writer's pool", async () => {
  const { charInfo, NAME_CHARS } = await import("@/lib/mingli/name/chars");
  const { namePool, shapeName } = await import("@/lib/mingli/name/report");
  const { readName } = await import("@/lib/mingli/name/analyze");
  it("康熙筆劃 of common surnames and name characters", () => {
    const exp: Record<string, number> = { 陳: 16, 張: 11, 劉: 15, 黃: 12, 林: 8, 江: 7, 浩: 11, 涵: 12, 怡: 9, 華: 14, 芳: 10, 琪: 13, 郭: 15, 邱: 12, 九: 9, 十: 10 };
    for (const [c, k] of Object.entries(exp)) expect(charInfo(c)?.k, c).toBe(k);
    expect(charInfo("陈")?.h).toBe("陳");
    expect(NAME_CHARS.length).toBeGreaterThan(6500);
  });
  it("reads 陳怡婷 (all characters known, 五格 computed)", () => {
    const r = readName("陳", "怡婷", { favour: ["火", "土"], avoid: [] });
    expect(r.missing).toEqual([]);
    expect(r.grid).toEqual({ tian: 17, ren: 25, di: 21, wai: 13, zong: 37 });
  });
  it("the pool keeps to 喜用, leaves out avoided characters, and the shape check holds the writer to it", () => {
    const f = { kind: "baby" as const, surname: "林", style: "f" as const, dayMaster: "丁", dmEl: "火", favour: ["木", "火"], avoid: ["水"], due: false, avoidChars: ["婷"] };
    const pool = namePool(f);
    expect(pool.length).toBeGreaterThanOrEqual(60);
    expect(pool.every((c) => ["木", "火"].includes(c.wx))).toBe(true);
    expect(pool.some((c) => c.h === "婷")).toBe(false);
    const pick = pool.slice(0, 30).map((c) => ({ c: c.h, why: "意思溫和，寫起來不難" }));
    const names = Array.from({ length: 10 }, (_, i) => ({ given: pool[i]!.h + pool[i + 10]!.h, meaning: "整個名字有明亮、溫和的感覺，讀起來也順口", sound: "與姓連讀順口，沒有常見的不雅諧音", why: "兩個字都落在喜用的五行上，意思也好" }));
    expect(shapeName({ intro: "這份參考從字的意思、讀音、和八字喜用的五行三方面挑字，下面先列候選字，再組成名字。", chars: pick, names }, f, pool).ok).toBe(true);
    const bad = shapeName({ intro: "這份參考從字的意思、讀音、和八字喜用的五行三方面挑字，下面先列候選字，再組成名字。", chars: pick, names: names.map((n) => ({ ...n, given: "淼淼" })) }, f, pool);
    expect(bad.ok).toBe(false);
    const banned = shapeName({ intro: "這份參考保證旺財，從字的意思、讀音、和八字喜用的五行三方面挑字，下面列出來。", chars: pick, names }, f, pool);
    expect(banned.ok).toBe(false);
  });
});

describe("124 解夢 data", async () => {
  const { DREAMS, dreamBySlug } = await import("@/lib/dream");
  it("200 dreams, both scripts, no accuracy words", () => {
    expect(DREAMS.length).toBe(200);
    expect(dreamBySlug("dead-person")?.hans.title).toContain("梦");
    const all = JSON.stringify(DREAMS);
    expect(all).not.toMatch(/準確|准确|很準|靈驗|大吉|大凶|化解|改運/);
  });
});

describe("10-29 Neil: 上線、去掉娛樂小品、產品互相引導", async () => {
  const { FEATURES } = await import("@/lib/features");
  const { SERVICES } = await import("@/lib/services");
  const { CROSS_MAP, crossFor } = await import("@/lib/cross-map");
  it("姓名學付費 on, 娛樂小品 off and gone from the services", () => {
    expect(FEATURES.find((f) => f.name === "name-paid")?.def).toBe("on");
    expect(FEATURES.find((f) => f.name === "fun")?.def).toBe("off");
    expect(SERVICES.some((s) => s.id === "fun")).toBe(false);
  });
  it("every pick of the 承接地圖 is a real service; the new pages have rows; the new products are picked from the old ones", () => {
    const ids = new Set(SERVICES.map((s) => s.id));
    for (const [src, m] of Object.entries(CROSS_MAP)) for (const p of [m.main, ...m.more]) expect(ids.has(p.id), `${src} → ${p.id}`).toBe(true);
    for (const src of ["name", "name_report", "dream", "taisui", "zeri_wedding", "zeri_move", "zeri_opening"] as const) expect(CROSS_MAP[src]).toBeTruthy();
    expect(CROSS_MAP.bazi.more.map((p) => p.id)).toContain("name");
    expect(CROSS_MAP.nianshu.more[0]!.id).toBe("taisui");
    expect(CROSS_MAP.daily.more.map((p) => p.id)).toContain("taisui");
    expect(CROSS_MAP.hepan.more[0]).toMatchObject({ id: "zeri", path: "/zeri/wedding" });
    expect(crossFor("taisui", ["taisui"]).main?.id).toBe("nianshu");
  });
  it("the name page answers a birth alone (the 喜用 show before a name is typed)", async () => {
    const { POST } = await import("@/app/api/name/read/route");
    const req = (body: unknown) => new Request("http://x/api/name/read", { method: "POST", body: JSON.stringify(body) }) as never;
    const r = await POST(req({ locale: "zh-hant", input: { calendar: "solar", y: 1990, m: 6, d: 15, timeMode: "exact", h: 9, mi: 0, placeId: "tw-tpe", trueSolar: true, zi: "next" }, gender: "female" }));
    expect(r.status).toBe(200);
    const j = (await r.json()) as { chart?: { dayMaster: string; favour: string[] } };
    expect(j.chart?.dayMaster).toBeTruthy();
    expect((await POST(req({ locale: "zh-hant" }))).status).toBe(400);
  });
});
