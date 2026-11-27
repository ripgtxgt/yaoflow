import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import type { LineValue } from "@yaoflow/engine";

/**
 * 10-23 进度表 106 (Neil: 「我看不到每个产品的详细使用情况和内容」): every product has its page — trend, funnel, the
 * latest 50 with the reader's question and their page, revisits — and 线上求籤 is kept in a table at last.
 */
const { db, upsertCustomer, recordOrder, saveCast, scheduleRevisit, setRevisitOutcome, markRevisit, saveFollowup } = await import("../src/lib/db");
const { resolveServerChart } = await import("../src/lib/reading");
const { createDraw } = await import("../src/lib/tarot");
const { PRODUCTS, productDetail } = await import("../src/lib/admin-products");
const { productBlocks, DETAIL_IDS } = await import("../src/lib/product-detail");
const { saveQiuqianDraw, qiuqianDraws } = await import("../src/lib/qiuqian-log");
const { POST: qqPost } = await import("../src/app/api/qiuqian/log/route");
const { setFeature } = await import("../src/lib/features");

const H = 3_600_000, D = 86_400_000;
const NOW = Date.now();
const V: LineValue[] = [7, 8, 9, 8, 7, 8];
const cid = upsertCustomer("d106@example.com", "zh-hant");
const me = upsertCustomer("d106-test@example.com", "zh-hant");
db().prepare("UPDATE customers SET test_flag = 1 WHERE id = ?").run(me);

function reading(sid: string, who: number, q: string, at: number, status = "paid") {
  const chart = resolveServerChart({ question: q, values: V, castAtMs: at, tzOffsetMinutes: 480 }, true) as unknown as Record<string, unknown>;
  const castId = saveCast({ customerId: who, castAtMs: at, tzOffsetMinutes: 480, locale: "zh-hant", question: q, topic: "career", values: V, chart });
  recordOrder({ sessionId: sid, customerId: who, castId, tier: "deep", amountCents: status === "paid" ? 7500 : null, currency: "TWD", email: null, status });
  db().prepare("UPDATE orders SET created_at = ? WHERE session_id = ?").run(at, sid);
  return castId;
}
const castId = reading("cs_d106_1", cid, "這次升遷有沒有機會", NOW - 2 * H);
saveFollowup(castId, cid, "user", "那下個月呢");
scheduleRevisit({ sessionId: "cs_d106_1", castId, customerId: cid, email: "d106@example.com", locale: "zh-hant", tier: "deep", castAtMs: NOW - 20 * D, windowDays: 10, timingQuote: "x" });
const rid = (db().prepare("SELECT id FROM revisits WHERE session_id = 'cs_d106_1'").get() as { id: number }).id;
markRevisit(rid, "sent");
setRevisitOutcome(rid, "hit", { event: "happened" });
reading("cs_d106_ours", me, "自己測一下", NOW - H);
const tk = createDraw({ question: "我們還有沒有可能", spread: 3, locale: "zh-hant", bid: "d106bid000000001", customerId: cid, register: null }, NOW - 3 * H).token;
db().prepare("UPDATE tarot_draws SET paid_at = ?, amount_minor = 7500, currency = 'TWD', personal_json = '{}', followup_q = '那他呢' WHERE token = ?").run(NOW - 3 * H, tk);

describe("每个产品都有自己的页", () => {
  it("all the products of the 「产品」 table (seventeen + 10-29 姓名學、解夢、犯太歲) have the four blocks, and their 14 days", () => {
    expect(PRODUCTS.map((p) => p.id).sort()).toEqual([...DETAIL_IDS].sort());
    for (const p of PRODUCTS) {
      const b = productBlocks(p.id, NOW - 14 * D);
      expect(b, p.id).not.toBeNull();
      expect(Array.isArray(b!.funnel) && Array.isArray(b!.rows) && Array.isArray(b!.stats)).toBe(true);
      expect(productDetail(p.id, NOW)!.days).toHaveLength(14);
    }
    expect(productBlocks("nope", 0)).toBeNull();
  });

  it("六爻: the question (admin only), the reader's page, why, the follow-up and the revisit; ours left out unless asked", () => {
    const b = productBlocks("liuyao", NOW - 14 * D)!;
    const r = b.rows.find((x) => x.summary === "這次升遷有沒有機會")!;
    expect(r).toMatchObject({ customerId: cid, source: "paid", what: "深断", followup: "追问 1", revisit: "答：應了", href: "/zh-hant/reading?sid=cs_d106_1" });
    expect(b.rows.some((x) => x.summary === "自己測一下")).toBe(false);
    expect(productBlocks("liuyao", NOW - 14 * D, NOW, { test: true })!.rows.find((x) => x.summary === "自己測一下")?.test).toBe(true);
    expect(b.funnel.map((s) => s.label)).toEqual(["起卦", "拿到解读", "付费", "回访寄出", "回答"]);
  });

  it("塔罗: the spread's cards, the follow-up, the page", () => {
    const r = productBlocks("tarot", NOW - 14 * D)!.rows.find((x) => x.href === `/zh-hant/tarot/r/${tk}`)!;
    expect(r).toMatchObject({ source: "paid", what: "3 张", summary: "我們還有沒有可能", followup: "追问：那他呢" });
    expect((r.extra ?? "").split("、")).toHaveLength(3);
  });
});

describe("线上求籤记进库", () => {
  it("the page files the confirmed lot (only a temple and a lot it offers); the admin lists it", async () => {
    setFeature("jiaobei", "on");
    // 10-25: asking needs an account
    const dbm = await import("../src/lib/db");
    const sess = "d6".repeat(32);
    dbm.createSession(sess, dbm.upsertCustomer("qq-log106@example.com", "zh-hant"), 3_600_000);
    // 10-31 进度表 131: no account needed again
    expect((await qqPost(new NextRequest("http://localhost/api/qiuqian/log", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ temple: "beigang", num: 3, asks: 1 }) }))).status).toBe(200);
    const post = (body: unknown) => qqPost(new NextRequest("http://localhost/api/qiuqian/log", { method: "POST", headers: { "content-type": "application/json", cookie: `yf_session=${sess}` }, body: JSON.stringify(body) }));
    expect((await post({ temple: "beigang", num: 23, asks: 2, redraws: 1, question: "這份工作要不要換", locale: "zh-hant" })).status).toBe(200);
    expect((await post({ temple: "beigang", num: 61, asks: 1 })).status).toBe(400);   // 六十甲子籤 has 60
    expect((await post({ temple: "nowhere", num: 3, asks: 1 })).status).toBe(400);
    expect((await post({ temple: "beigang", num: 7, asks: 1, question: "" })).status).toBe(200); // no matter written: kept without one
    const rows = qiuqianDraws(0, Date.now() + 1000);
    expect(rows.find((r) => r.num === 23)).toMatchObject({ temple: "beigang", set_id: "liushi-jiazi", asks: 2, redraws: 1, question: "這份工作要不要換" });
    expect(rows.find((r) => r.num === 7)).toMatchObject({ question: null });
    expect(rows).toHaveLength(3); // 10-31 进度表 131: the signed-out lot (no. 3) is kept too
    const b = productBlocks("qiuqian", NOW - 14 * D)!;
    expect(b.rows.find((r) => r.what.endsWith("第 23 籤"))).toMatchObject({ summary: "這份工作要不要換", extra: "北港朝天宮 · 请示 2 次 · 放回 1 支" });
    saveQiuqianDraw({ temple: "beigang", setId: "liushi-jiazi", num: 5, asks: 1, redraws: 0, question: null, locale: "zh-hant", bid: null, customerId: me });
    expect(productBlocks("qiuqian", NOW - 14 * D)!.rows.some((r) => r.customerId === me)).toBe(false);
  });
});
