import { describe, expect, it } from "vitest";
import { db, upsertCustomer } from "../src/lib/db";
import { linkBrowser } from "../src/lib/browsers";
import { anonReturners, anonStep } from "../src/lib/people";

/** 10-24 (Neil: 「除了我们有邮箱记录的，所有的浏览器……」→「要」): returning browsers that never signed in, and where they stopped */
const NOW = Date.now(), D = 86_400_000;
const browser = (bid: string, o: Partial<{ days: number; casts: number; teased: number; clicks: number; checkouts: number }>) =>
  db().prepare("INSERT INTO browsers (bid, first_at, last_at, days, casts, teased, clicks, checkouts) VALUES (?,?,?,?,?,?,?,?)")
    .run(bid, NOW - 5 * D, NOW - 60_000, o.days ?? 2, o.casts ?? 0, o.teased ?? 0, o.clicks ?? 0, o.checkouts ?? 0);

describe("没登录的回头客", () => {
  it("the furthest step wins", () => {
    const z = { casts: 0, teased: 0, clicks: 0, checkouts: 0, tarot: 0, jiaobei: 0, qiuqian: 0, qa: 0 };
    expect(anonStep({ ...z, casts: 2, teased: 2, clicks: 1, checkouts: 1 })).toBe("checkout");
    expect(anonStep({ ...z, casts: 2, teased: 1 })).toBe("teaser");
    expect(anonStep({ ...z, jiaobei: 4 })).toBe("tools");
    expect(anonStep(z)).toBe("browse");
  });

  it("keeps two-day browsers with no account; counts what they used and their newest question", () => {
    browser("anonback1024aaaaaaaaaaaa", { days: 3, casts: 1, teased: 1 });
    browser("anonback1024bbbbbbbbbbbb", { days: 1, casts: 5 }); // one day only
    browser("anonback1024cccccccccccc", { days: 4 });
    linkBrowser("anonback1024cccccccccccc", upsertCustomer("anonback1024@example.com", "zh-hant"), "login"); // signed in once
    browser("anonback1024dddddddddddd", { days: 2 });
    db().exec("CREATE TABLE IF NOT EXISTS jiaobei_asks (token TEXT PRIMARY KEY, created_at INTEGER NOT NULL, locale TEXT, bid TEXT, customer_id INTEGER, question TEXT, rule INTEGER, seq TEXT, sign TEXT, cast_id INTEGER, matter_id INTEGER)");
    db().prepare("INSERT INTO jiaobei_asks (token, created_at, locale, bid, question) VALUES (?,?,?,?,?)").run("jb-anonback", NOW - D, "zh", "anonback1024dddddddddddd", "要不要換工作");
    const { rows, steps, total } = anonReturners(NOW - 7 * D);
    const mine = rows.filter((r) => r.bid.startsWith("anonback1024"));
    expect(mine.map((r) => r.bid.slice(12, 13)).sort()).toEqual(["a", "d"]);
    expect(mine.find((r) => r.bid.startsWith("anonback1024d"))).toMatchObject({ jiaobei: 1, step: "tools", lastQ: "要不要換工作" });
    expect(mine.find((r) => r.bid.startsWith("anonback1024a"))?.step).toBe("teaser");
    expect(Object.values(steps).reduce((a, b) => a + b, 0)).toBe(total);
  });
});
