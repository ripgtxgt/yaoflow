import { describe, expect, it } from "vitest";
// DATA_DIR is set to a fresh temp dir by test/setup.ts before any import

import { fullChart, type LineValue } from "@yaoflow/engine";
import {
  addOrderToCustomer, castIdForSession, customerDetail, followupsForCast, listCustomers,
  recordOrder, saveCast, saveFollowup, saveReading, stats, upsertCustomer,
  storedReadingForSession,
} from "../src/lib/db";
import { classifyTopic } from "../src/lib/topic";

describe("customer store", () => {
  it("persists a full purchase: customer + cast + reading + followups + order", () => {
    const q = "我在考虑要不要从现在的公司离职去创业，时机合适吗？";
    const values: LineValue[] = [9, 7, 7, 7, 7, 7];
    const chart = fullChart({ values, utcMs: Date.UTC(2026, 7, 27, 4), tzOffsetMinutes: 480 });

    const cid = upsertCustomer("  Neil@Linedo.io ", "zh");
    const castId = saveCast({
      customerId: cid, castAtMs: Date.UTC(2026, 7, 27, 4), tzOffsetMinutes: 480,
      locale: "zh", question: q, topic: classifyTopic(q), values,
      chart: chart as unknown as Record<string, unknown>,
    });
    saveReading(castId, cid, "deep", "zh", {
      verdict: { zh: "此事可成，但成在让步之后。", en: "It can be done — after a concession." },
    });
    saveFollowup(castId, cid, "user", "如果谈到涨60%再跳呢？");
    saveFollowup(castId, cid, "assistant", "卦上能谈，但空间有限。");
    recordOrder({
      sessionId: "cs_test_demo1", customerId: cid, castId, tier: "deep",
      amountCents: 1099, currency: "usd", email: "neil@linedo.io", status: "paid",
    });
    addOrderToCustomer(cid, 1099);

    const rows = listCustomers();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.email).toBe("neil@linedo.io"); // normalized
    expect(rows[0]!.spend_cents).toBe(1099);
    expect(rows[0]!.orders_count).toBe(1);
    expect(rows[0]!.casts).toBe(1);
    expect(rows[0]!.topics).toBe("career");
    expect(rows[0]!.phases).toBe("metal"); // 乾宫属金

    const d = customerDetail(cid);
    const ct = (d.casts as unknown as Record<string, unknown>[])[0]!;
    expect(ct.primary_name).toBe("乾为天");
    expect(ct.changed_name).toBe("天风姤");
    expect(ct.question).toBe(q);
    expect(ct.day_pillar).toBeTruthy();
    expect((d.readings as unknown[]).length).toBe(1);
    expect((d.orders as unknown[]).length).toBe(1);

    expect(castIdForSession("cs_test_demo1")).toBe(castId);
  });

  it("restores the follow-up transcript in order, so a returning visitor sees the whole thread", () => {
    const values: LineValue[] = [8, 8, 6, 7, 7, 8];
    const chart = fullChart({ values, utcMs: Date.UTC(2026, 7, 27, 6), tzOffsetMinutes: 480 });
    const cid = upsertCustomer("thread@example.com", "zh");
    const castId = saveCast({
      customerId: cid, castAtMs: Date.UTC(2026, 7, 27, 6), tzOffsetMinutes: 480,
      locale: "zh", question: "和合伙人的分歧还能弥合吗？", topic: "career", values,
      chart: chart as unknown as Record<string, unknown>,
    });
    recordOrder({
      sessionId: "cs_test_thread", customerId: cid, castId, tier: "deep",
      amountCents: 1099, currency: "usd", email: "thread@example.com", status: "paid",
    });

    expect(followupsForCast(castId)).toHaveLength(0);

    saveFollowup(castId, cid, "user", "如果谈到涨60%再跳呢？");
    saveFollowup(castId, cid, "assistant", "卦上能谈，但空间有限。");
    saveFollowup(castId, cid, "user", "那我该先找谁谈？");
    saveFollowup(castId, cid, "assistant", "先找能拍板的人。");

    const thread = followupsForCast(castId);
    expect(thread).toHaveLength(4);
    expect(thread.map((t) => t.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(thread[0]!.content).toContain("涨60%");
    expect(thread[3]!.content).toBe("先找能拍板的人。");

    // the follow-up allowance is counted from stored user turns
    expect(thread.filter((t) => t.role === "user")).toHaveLength(2);

    // and the transcript is reachable from the Stripe session alone (the email link case)
    expect(castIdForSession("cs_test_thread")).toBe(castId);
  });

  it("is idempotent on repeat purchase by the same email", () => {
    const before = stats().customers;
    const a = upsertCustomer("neil@linedo.io", "zh");
    const b = upsertCustomer("NEIL@linedo.io", "en");
    const c = upsertCustomer("  neil@LINEDO.io  ", "zh");
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(stats().customers).toBe(before); // no new rows for a known email
  });

  it("classifies topics", () => {
    expect(classifyTopic("要不要跳槽去这家创业公司")).toBe("career");
    expect(classifyTopic("和男友还能复合吗")).toBe("relationship");
    expect(classifyTopic("这只股票该不该卖")).toBe("money");
    expect(classifyTopic("Should I quit my job for this startup?")).toBe("career");
    expect(classifyTopic("Will we get back together?")).toBe("relationship");
  });
});

describe("a stored reading is served from our own records", () => {
  it("returns everything the page needs, with the status turned into flags", () => {
    const values: LineValue[] = [7, 8, 9, 8, 7, 8];
    const chart = fullChart({ values, utcMs: Date.UTC(2026, 8, 7, 2), tzOffsetMinutes: 480 });
    const cid = upsertCustomer("return@example.com", "ja");
    const castId = saveCast({
      customerId: cid, castAtMs: Date.UTC(2026, 8, 7, 2), tzOffsetMinutes: 540,
      locale: "ja", question: "転職すべきか", topic: "career", values,
      chart: chart as unknown as Record<string, unknown>,
    });
    saveReading(castId, cid, "deep", "ja", { verdict: { ja: "今は動かず。" } });
    recordOrder({ sessionId: "gf_return1", customerId: cid, castId, tier: "deep", amountCents: 0, currency: "JPY", email: "return@example.com", status: "gift", firstDeep: true });
    const r = storedReadingForSession("gf_return1");
    expect(r).not.toBeNull();
    expect(r!.tier).toBe("deep");
    expect(r!.locale).toBe("ja");
    expect(r!.status).toBe("gift");
    expect(r!.values).toEqual(values);
    expect(r!.tzOffsetMinutes).toBe(540);
    expect(r!.castAtMs).toBe(Date.UTC(2026, 8, 7, 2));
    expect(r!.email).toBe("return@example.com");
    expect(r!.firstDeep).toBe(true);
    expect(r!.customerId).toBe(cid);
    expect((r!.reading as { verdict: { ja: string } }).verdict.ja).toBe("今は動かず。");
    // an order without a reading yet (generation still running) is not "stored"
    recordOrder({ sessionId: "cs_pending", customerId: cid, castId: null, tier: "one", amountCents: 299, currency: "usd", email: null, status: "paid" });
    expect(storedReadingForSession("cs_pending")).toBeNull();
    expect(storedReadingForSession("nope")).toBeNull();
  });

  // 10-22 通卡 (客服 #510): the order carries the pass's tier; the page gets the reading's
  it("serves a reading bought with a 通卡 as the deep reading it is, not as the pass", () => {
    const values: LineValue[] = [8, 8, 6, 8, 9, 8];
    const chart = fullChart({ values, utcMs: Date.UTC(2026, 9, 22, 12, 43), tzOffsetMinutes: 480 });
    const cid = upsertCustomer("pass-reader@example.com", "zh-hant");
    const castId = saveCast({
      customerId: cid, castAtMs: Date.UTC(2026, 9, 22, 12, 43), tzOffsetMinutes: 480,
      locale: "zh-hant", question: "他從下午四點後都不怎麼回訊息，是在幹嘛？", topic: "relationship", values,
      chart: chart as unknown as Record<string, unknown>,
    });
    saveReading(castId, cid, "deep", "zh-hant", { verdict: { "zh-hant": "今晚他大概不會好好回你。" } });
    recordOrder({ sessionId: "cs_pass_1d_demo", customerId: cid, castId, tier: "pass_1d", amountCents: 9900, currency: "TWD", email: "pass-reader@example.com", status: "paid" });
    const r = storedReadingForSession("cs_pass_1d_demo");
    expect(r).not.toBeNull();
    expect(r!.tier).toBe("deep");
    expect(r!.status).toBe("paid");
    expect(r!.amountCents).toBe(9900);
    expect((r!.reading as { verdict: { "zh-hant": string } }).verdict["zh-hant"]).toBe("今晚他大概不會好好回你。");
  });
});
