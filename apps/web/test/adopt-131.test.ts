import { describe, expect, it } from "vitest";
import { db, upsertCustomer } from "../src/lib/db";
import { adoptBrowserCasts } from "../src/lib/adopt-casts";
import { freeLineOn } from "../src/lib/free-line";

/** 10-31 进度表 131: casting needs no account; what a browser cast before reaches 「我的」 once it is filed under someone. */
describe("131 免登录的卦并进「我的」", () => {
  it("adopts the browser's casts once, filed by its own grouping; never on a shared browser", () => {
    const d = db();
    const now = Date.UTC(2026, 9, 31, 8);
    const bid = "abcabcabcabc0131";
    const ins = d.prepare(`INSERT INTO cast_log (bid, at, tz, locale, question, values_str, primary_num, topic, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`);
    ins.run(bid, now - 3_600_000, 480, "zh-hant", "這份工作要不要換", "789678", 1, "career", now - 3_600_000, now - 3_600_000);
    ins.run(bid, now - 1_800_000 - 60_000, 480, "zh-hant", "換工作會順利嗎", "777888", 2, "career", now - 1_800_000, now - 1_800_000);
    const cid = upsertCustomer("adopt131@example.org", "zh-hant");
    d.prepare("INSERT INTO browser_links (bid, customer_id, first_at, last_at, how) VALUES (?,?,?,?,?)").run(bid, cid, now, now, "signed-in");
    expect(adoptBrowserCasts(bid, cid, now)).toBe(2);
    const kept = d.prepare("SELECT question, matter_id FROM casts WHERE customer_id = ? ORDER BY cast_at").all(cid) as { question: string; matter_id: number | null }[];
    expect(kept.map((k) => k.question)).toEqual(["這份工作要不要換", "換工作會順利嗎"]);
    expect(kept.every((k) => k.matter_id)).toBe(true);
    expect(adoptBrowserCasts(bid, cid, now)).toBe(0); // idempotent
    // a second account on the same browser: whose casts they are cannot be told
    const other = upsertCustomer("adopt131-b@example.org", "zh-hant");
    d.prepare("INSERT INTO browser_links (bid, customer_id, first_at, last_at, how) VALUES (?,?,?,?,?)").run(bid, other, now, now, "signed-in");
    expect(adoptBrowserCasts(bid, other, now)).toBe(0);
  });

  it("11-05 进度表 141: the free line is on unless FREE_LINE=off", () => {
    delete process.env.FREE_LINE;
    expect(freeLineOn()).toBe(true);
    process.env.FREE_LINE = "off";
    expect(freeLineOn()).toBe(false);
    delete process.env.FREE_LINE;
  });
});
