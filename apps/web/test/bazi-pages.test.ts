import { describe, expect, it } from "vitest";
import { upsertCustomer } from "../src/lib/db";
import { normalizeBirth } from "../src/lib/mingli/birth/normalize";
import { baziOf, cell, monthsOf, short, trad } from "../src/lib/mingli/bazi/chart";
import { createReport, factsFromBirth, latestDeepToken } from "../src/lib/mingli/bazi/report";
import { baziUi } from "../src/lib/mingli/bazi/page-ui";
import { ziweiUi } from "../src/lib/mingli/ziwei/page-ui";
import { astroUi } from "../src/lib/mingli/astro/page-ui";
import { myChart } from "../src/lib/my-chart";

/**
 * 10-22 (Neil: 「八字那里还有点问题，你先看一下，修复一下」) — what the look found on the 八字 pages, pinned:
 * one script per page (简体 had 時柱、梟、国历、臺; 繁體 had 驚蛰), 「打開報告」 opening the newest version of a member's
 * report (a monthly rewrite was unreachable from the chart page), and 「你的今天」 read only from the 生辰檔案 marked 自己.
 */
const birth = normalizeBirth({ calendar: "solar", y: 1990, m: 5, d: 17, timeMode: "exact", h: 12, mi: 0, placeId: "tw-tpe" } as never);

describe("八字排盤頁：一頁一種字", () => {
  it("简体: 时柱, 枭, 惊蛰; 繁體: 時柱, 梟, 驚蟄", () => {
    const hans = baziOf(birth, "female", 2026, true);
    expect(hans.pillars.map((p) => p.label)).toEqual(["年柱", "月柱", "日柱", "时柱"]);
    const hant = baziOf(birth, "female", 2026, false);
    expect(hant.pillars.map((p) => p.label)).toEqual(["年柱", "月柱", "日柱", "時柱"]);
    expect(hant.jiaoyun ?? "").not.toMatch(/[蛰后运]/);
    expect(trad("逢甲、己年 惊蛰后1天 交大运", false)).toBe("逢甲、己年 驚蟄後1天 交大運");
    expect(short("偏印", true)).toBe("枭"); expect(short("偏印", false)).toBe("梟");
    expect(cell("庚辰", "壬", true).stemTen).toBe("枭"); expect(cell("庚辰", "壬", false).stemTen).toBe("梟");
    const m = monthsOf(2026, "壬", true);
    expect(m.map((x) => x.term)).toContain("惊蛰");
    expect(m.find((x) => x.gz === "庚寅")!.stemTen).toBe("枭");
  });

  it("a 國曆 date is 公历 on every 简体 chart page; the 基本信息 row says 國曆, not 陽曆", () => {
    for (const ui of [baziUi("zh"), ziweiUi("zh"), astroUi("zh")]) for (const v of Object.values(ui)) expect(v).not.toContain("国历");
    expect(baziUi("zh").solar).toBe("公历"); expect(baziUi("zh").i_solar).toBe("公历");
    expect(baziUi("zh-hant").i_solar).toBe("國曆");
    // the report cards say who can open them (92: 本命 for a pass, the rest for a member)
    expect(baziUi("zh-hant").repDeepTag).toBe("通卡／會員");
  });
});

describe("「打開報告」開最新的一份", () => {
  it("after a monthly rewrite, the chart page opens the rewrite, not the first report", () => {
    const cid = upsertCustomer("bp-latest@example.com", "zh-hant");
    const facts = factsFromBirth(birth, "female", "deep", Date.UTC(2026, 9, 1, 4));
    const base = createReport({ kind: "deep", locale: "zh-hant", register: null, customerId: cid, email: "bp-latest@example.com", facts, paid: { session: "member:ent", amountMinor: 0 } }, Date.UTC(2026, 9, 1, 4));
    expect(latestDeepToken(cid, "zh-hant", facts)).toBe(base.token);
    const fresh = { ...facts, asOf: "國曆 2026 年 11 月" };
    const re = createReport({ kind: "deep", locale: "zh-hant", register: null, customerId: cid, email: "bp-latest@example.com", facts: fresh, paid: { session: "member:ent", amountMinor: 0 }, salt: "rw:2026-11-02" }, Date.UTC(2026, 10, 2, 4));
    expect(re.created).toBe(true);
    expect(latestDeepToken(cid, "zh-hant", facts)).toBe(re.token);
    // another language's report of the same chart is its own
    expect(latestDeepToken(cid, "zh", facts)).toBeNull();
    // and another person's chart is never matched
    const other = factsFromBirth(normalizeBirth({ calendar: "solar", y: 1985, m: 1, d: 3, timeMode: "unknown" } as never), "male", "deep", Date.UTC(2026, 9, 1, 4));
    expect(latestDeepToken(cid, "zh-hant", other)).toBeNull();
  });

  it("「你的今天」 reads only the 生辰檔案 marked 自己 — never the latest report, which may be someone else's chart", () => {
    const cid = upsertCustomer("bp-nochart@example.com", "zh-hant");
    const facts = factsFromBirth(birth, "female", "deep", Date.UTC(2026, 9, 1, 4));
    createReport({ kind: "deep", locale: "zh-hant", register: null, customerId: cid, email: "bp-nochart@example.com", facts, paid: { session: "member:ent", amountMinor: 0 } });
    expect(myChart(cid)).toBeNull();
  });
});
