import { describe, expect, it } from "vitest";
import { GUARANTEE_TIERS } from "../src/lib/db";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CATALOG, CATALOG_IDS, catalogByTier, catalogPrice, sellable, type CatalogId } from "../src/lib/catalog";
import { CURRENCIES, type Currency } from "../src/lib/money";
import { LOCALES } from "../src/lib/locales";

/**
 * 10-22 进度表 55: the catalog is the one place that says what is sold; this file locks every amount to today's
 * figures. A deliberate price change: edit the product's table in lib/money.ts, then run with CATALOG_SNAPSHOT=write.
 */
const SNAP = join(__dirname, "catalog-prices.json");
const VARIANTS: Record<string, { id: CatalogId; o?: Parameters<typeof catalogPrice>[2] }> = {
  deep: { id: "deep" }, one: { id: "one" },
  month: { id: "month" }, "month:first": { id: "month", o: { first: true } }, year: { id: "year" },
  pass_1: { id: "pass_1" }, "pass_1:first": { id: "pass_1", o: { first: true } }, pass_7: { id: "pass_7" }, pass_30: { id: "pass_30" },
  pack_l: { id: "pack_l" }, pack_s: { id: "pack_s" },
  qian_personal: { id: "qian_personal" }, qian_card: { id: "qian_card" }, tarot: { id: "tarot" },
  hepan: { id: "hepan" }, "hepan:member": { id: "hepan", o: { member: true } },
  zhengyuan: { id: "zhengyuan" }, "zhengyuan:member": { id: "zhengyuan", o: { member: true } },
  nianshu: { id: "nianshu" }, "nianshu:early": { id: "nianshu", o: { early: true } }, "nianshu:member": { id: "nianshu", o: { member: true } }, "nianshu:early+member": { id: "nianshu", o: { early: true, member: true } },
};
const snapshot = () => Object.fromEntries(Object.entries(VARIANTS).map(([k, v]) => [k, Object.fromEntries(CURRENCIES.map((c) => [c, catalogPrice(v.id, c, v.o)]))]));

describe("产品目录 (55)", () => {
  it("every price in every currency is what it was when the snapshot was taken", () => {
    const now = snapshot();
    if (process.env.CATALOG_SNAPSHOT === "write") { writeFileSync(SNAP, JSON.stringify(now, null, 1) + "\n"); return; }
    const was = JSON.parse(readFileSync(SNAP, "utf8")) as typeof now;
    for (const k of Object.keys(now)) for (const c of CURRENCIES) expect({ k, c, v: now[k]![c] }).toEqual({ k, c, v: was[k]![c] });
    expect(Object.keys(was).sort()).toEqual(Object.keys(now).sort());
  });

  it("the rows: a name in every language, a label in every language, a tier for everything that books an order", () => {
    for (const id of CATALOG_IDS) {
      const p = CATALOG[id];
      expect(p.id).toBe(id);
      for (const l of LOCALES) { expect(p.name(l).length).toBeGreaterThan(3); expect(p.label[l].length).toBeGreaterThan(1); }
      if (p.kind === "oneoff" || p.kind === "pass") expect(p.tier).toBeTruthy();
      if (p.kind === "included") { expect(p.price).toBeNull(); expect(p.member).toBe("included"); }
      if (p.price) for (const c of CURRENCIES) expect(p.price(c)).toBeGreaterThan(0);
    }
  });

  it("the rules the rest of the code relied on", () => {
    // the same figures the checkout routes charge today
    expect(catalogPrice("deep", "TWD")).toBe(26900);
    expect(catalogPrice("month", "TWD")).toBe(26900);
    expect(catalogPrice("month", "TWD", { first: true })).toBe(34900); // 首月同价
    expect(catalogPrice("pass_30", "TWD")).toBe(34900);
    expect(catalogPrice("pass_1", "TWD")).toBe(9900);
    expect(catalogPrice("pass_1", "TWD", { first: true })).toBe(7500);
    expect(catalogPrice("hepan", "TWD", { member: true })).toBe(39000);
    expect(catalogPrice("nianshu", "TWD", { early: true, member: true })).toBe(89000); // the lower of early bird and 8 折
    expect(catalogPrice("nianshu", "TWD", { member: true })).toBe(95000);
    expect(catalogPrice("bazi_deep", "USD")).toBeNull();
    // what the 通卡 model retires for new buyers
    const live = CATALOG_IDS.filter((id) => sellable(CATALOG[id], true));
    expect(live).not.toContain("deep"); expect(live).not.toContain("one"); expect(live).not.toContain("pack_l");
    expect(live).toEqual(expect.arrayContaining(["month", "year", "pass_1", "pass_7", "pass_30", "hepan", "nianshu"]));
    expect(CATALOG_IDS.filter((id) => sellable(CATALOG[id], false))).toContain("deep");
    // 10-22 进度表 92: the 籤卡 is not sold any more, under either model (今日一籤全文 is the membership's)
    expect(live).not.toContain("qian_card"); expect(CATALOG_IDS.filter((id) => sellable(CATALOG[id], false))).not.toContain("qian_card");
    // orders.tier → the row
    expect(catalogByTier("pass_7d")?.id).toBe("pass_7");
    expect(catalogByTier("qiancard")?.id).toBe("qian_card");
    expect(catalogByTier("nianshu")?.id).toBe("nianshu");
    expect(catalogByTier("nope")).toBeNull();
    // the guarantee (10-22 进度表 78 ②): the first 1-day pass — and the retired single readings for their old orders; lib/db.ts keeps the same set
    expect(CATALOG_IDS.filter((id) => CATALOG[id].guarantee)).toEqual(["deep", "one", "pass_1"]);
    expect(new Set(CATALOG_IDS.filter((id) => CATALOG[id].guarantee).map((id) => CATALOG[id].tier))).toEqual(GUARANTEE_TIERS);
    // member perks
    expect(CATALOG.hepan.member).toBe("discount");
    // 10-26 正緣畫像 sold on its own: NT$290, 會員 8 折, not in a 通卡
    expect(catalogPrice("zhengyuan", "TWD")).toBe(29000);
    expect(catalogPrice("zhengyuan", "TWD", { member: true })).toBe(23000);
    expect(CATALOG.zhengyuan.member).toBe("discount"); expect(CATALOG.zhengyuan.pass).toBe(false);
    expect(live).toContain("zhengyuan");
    expect(catalogByTier("bazi_love")?.id).toBe("zhengyuan");
    expect(CATALOG.tarot.member).toBe("included");
    expect(CATALOG.year.pass).toBe(false);
  });
});
