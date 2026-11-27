import { describe, expect, it } from "vitest";
import { setFeature } from "../src/lib/features";
import { GROUP_LABEL, SERVICES, priceTable, serviceText, servicesFor } from "../src/lib/services";
import { PROMO_MAX, promoFor, promoPick, setPromoPick } from "../src/lib/promo";
import { LOCALES } from "../src/lib/locales";
import { navItemsFor } from "../src/lib/site-nav";
import { CURRENCIES } from "../src/lib/money";

/** 10-22 进度表 58 — the services list, the 全部服務 page's words and prices, the 「也可以試試」 picks */
describe("全部服务与主推 (58)", () => {
  it("every service has words in 繁體; the three for every language have all nine; 简体 is converted", () => {
    for (const s of SERVICES) {
      expect(s.label["zh-hant"].length).toBeGreaterThan(0); expect(s.line["zh-hant"].length).toBeGreaterThan(5);
      // 10-29 进度表 128: a service open everywhere has words in all nine — its own, or the generated ones (data/l10n/site.json)
      if (s.locales === "all") for (const l of LOCALES) {
        const w = serviceText(s, l);
        expect(w.label).toBeTruthy(); expect(w.line).toBeTruthy();
        if (!["zh", "zh-hant", "ja"].includes(l)) expect(w.label + w.line, `${s.id} ${l}`).not.toMatch(/[\u4e00-\u9fff]/);
      }
      const hans = serviceText(s, "zh");
      expect(hans.label).not.toMatch(/[問線籤運盤書員]/);
      expect(serviceText(s, "zh-hant").line).not.toMatch(/準|AI|靈驗|神明說/);
      expect(serviceText(s, "zh").line).not.toMatch(/准确|AI|灵验/);
    }
    for (const g of Object.keys(GROUP_LABEL) as (keyof typeof GROUP_LABEL)[]) for (const l of LOCALES) expect(GROUP_LABEL[g][l]).toBeTruthy();
  });

  it("what a visitor sees: Chinese-only services only on Chinese pages; a switch in preview only for the admin browser", async () => {
    setFeature("tarot", "on"); setFeature("huangli", "preview"); setFeature("zeri", "off");
    const hant = (await servicesFor("zh-hant", undefined)).map((s) => s.id);
    expect(hant).toContain("cast"); expect(hant).toContain("tarot"); expect(hant).toContain("jieqian"); expect(hant).toContain("member");
    expect(hant).not.toContain("huangli"); expect(hant).not.toContain("zeri");
    const en = (await servicesFor("en", undefined)).map((s) => s.id);
    expect(en).toEqual(expect.arrayContaining(["cast", "member"]));
    expect(en).not.toContain("name"); // 10-30 进度表 128 ⑥: 姓名學 is Chinese, Japanese and Korean only (籤 opened everywhere in ⑤)
    expect(en).toContain("jieqian");
    expect(en).toContain("tarot"); // 10-30 进度表 128 ②: 塔羅 is open in every language
  });

  it("the price table: every priced key in every currency, the first 1 日 pass cheaper than the full one, the member nianshu never above the early bird", () => {
    const t = priceTable(Date.UTC(2026, 10, 15)); // 11-15: early bird on
    for (const k of ["pass_1", "pass_1:full", "pass_7", "pass_30", "tarot", "qian_personal", "qian_card", "hepan", "hepan:member", "nianshu", "nianshu:member", "nianshu:regular", "month", "year"]) {
      expect(t[k]).toBeTruthy();
      for (const c of CURRENCIES) expect(t[k]![c]).toBeGreaterThan(0);
    }
    expect(t.pass_1!.TWD).toBe(7500); expect(t["pass_1:full"]!.TWD).toBe(9900);
    expect(t.nianshu!.TWD).toBe(89000); expect(t["nianshu:regular"]!.TWD).toBe(119000); expect(t["nianshu:member"]!.TWD).toBe(89000);
    expect(priceTable(Date.UTC(2026, 9, 22)).nianshu!.TWD).toBe(119000); // October: no early bird
  });

  it("the picks: a default until set, at most two, unknown ids dropped, hidden services left out, the page's own service excluded", async () => {
    const d = promoPick("home");
    expect(d.set).toBe(false); expect(d.ids.length).toBeGreaterThan(0);
    setPromoPick("jieqian", ["tarot", "nope", "today-qian", "bazi", "tarot"]);
    const p = promoPick("jieqian");
    expect(p.set).toBe(true); expect(p.ids).toEqual(["tarot", "today-qian"]); expect(p.ids.length).toBeLessThanOrEqual(PROMO_MAX);
    setFeature("tarot", "on"); setFeature("today-qian", "preview");
    expect((await promoFor("jieqian", "zh-hant", undefined)).map((s) => s.id)).toEqual(["tarot"]);
    setPromoPick("reading", ["cast", "member"]);
    expect((await promoFor("reading", "en", undefined, ["cast"])).map((s) => s.id)).toEqual(["member"]);
    setPromoPick("home", []);
    expect(promoPick("home")).toEqual({ ids: [], set: true });
  });

  it("the four doors (76 C): all four on a Chinese page with the hub open, two outside Chinese or with the hub shut", async () => {
    setFeature("services", "on"); setFeature("bazi", "on"); setFeature("huangli", "on");
    const hant = await navItemsFor("zh-hant", undefined);
    expect(hant.map((x) => x.key)).toEqual(["ask", "self", "daily", "mine"]);
    // 10-23 (Neil: 「看自己和每天這兩欄是一樣的啊，你怎麼不定位呢」): each door its own page, not two anchors on one
    expect(hant[1]!.href).toBe("/zh-hant/services/self"); expect(hant[2]!.href).toBe("/zh-hant/services/daily"); expect(hant[3]!.href).toBe("/zh-hant/account");
    expect(new Set(hant.map((x) => x.href)).size).toBe(hant.length);
    // 10-29 进度表 128: 尋物 is open in every language, so 每天 has a door outside Chinese too;
    // 10-30 进度表 128 ④: and so is 八字, so 看自己 has one too
    expect((await navItemsFor("en", undefined)).map((x) => x.key)).toEqual(["ask", "self", "daily", "mine"]);
    setFeature("services", "off");
    expect((await navItemsFor("zh-hant", undefined)).map((x) => x.key)).toEqual(["ask", "mine"]);
    for (const it of hant) expect(it.label.length).toBeGreaterThan(0);
  });

  it("the tab that lights up: each door on its own page and on its products; 全部服務 lights none", async () => {
    const { activeKey } = await import("../src/lib/nav-active");
    setFeature("services", "on"); setFeature("bazi", "on"); setFeature("huangli", "on");
    const items = await navItemsFor("zh-hant", undefined);
    expect(activeKey("/zh-hant/services/self", "zh-hant", items)).toBe("self");
    expect(activeKey("/zh-hant/services/daily", "zh-hant", items)).toBe("daily");
    expect(activeKey("/zh-hant/ziwei/chart", "zh-hant", items)).toBe("self");
    expect(activeKey("/zh-hant/huangli", "zh-hant", items)).toBe("daily");
    expect(activeKey("/zh-hant", "zh-hant", items)).toBe("ask");
    expect(activeKey("/zh-hant/account", "zh-hant", items)).toBe("mine");
    expect(activeKey("/zh-hant/services", "zh-hant", items)).toBeNull();
  });
});
