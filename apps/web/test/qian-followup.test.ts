import { describe, expect, it } from "vitest";
import { createQianDraw, markQianPaid, qianBreakdown, qianDrawByToken, recordOrder, setQianFollowup, setQianPersonal } from "../src/lib/db";
import { answerQianFollowup, followupOffense, qianFollowupOf, qianFollowupSystem, TIMING_Q } from "../src/lib/qian-personal";
import { POST } from "../src/app/api/qian/followup/route";
import { NextRequest } from "next/server";

/** 10-13 解籤承接 (Neil: 「维持 NT$75，但含 1 次追问，并在写法上把『起一卦看日子』讲得更明确」). */
describe("解籤 · 含一次追問", () => {
  const tok = (n: number) => `f0110${String(n).padStart(19, "0")}`;
  function draw(n: number, paid = true, written = true) {
    const token = tok(n);
    createQianDraw({ token, setName: "liushi-jiazi", num: 7, temple: null, situation: "fuhe", question: "他會回來嗎", locale: "zh-hant", device: null, customerId: null });
    if (paid) markQianPaid(token, { session: `cs_test_f${n}`, email: null, currency: "TWD", amountMinor: 7500, customerId: null });
    if (written) setQianPersonal(token, { reading: "這支籤說的是先把話講開。".repeat(8), watch: "先傳一則輕鬆的訊息。", next: "他哪幾天會先開口？為這件事起一卦看看？" });
    return token;
  }
  const req = (body: unknown) => new NextRequest("https://yaoflow.com/api/qian/followup", { method: "POST", body: JSON.stringify(body), headers: { "x-forwarded-for": `10.9.${Math.floor(Math.random() * 250)}.1` } });

  it("a question about WHEN is recognised (the answer then ends at the cast)", () => {
    for (const q of ["他什麼時候會回來？", "還要等多久", "這個月有機會嗎？幾月比較好", "哪幾天適合主動"]) expect(TIMING_Q.test(q), q).toBe(true);
    for (const q of ["我要先主動嗎？", "如果他一直不回，我該放下嗎"]) expect(TIMING_Q.test(q), q).toBe(false);
  });

  it("the answer keeps the same rules as the reading: no deity, no date, no other lot", () => {
    const ok = { answer: "這支籤講的是先把自己的心安定下來，再看對方的反應。".repeat(3), cast: false };
    expect(followupOffense(ok)).toBeNull();
    expect(followupOffense({ ...ok, answer: ok.answer + "媽祖說會成。" })).toMatch(/^bad/);
    expect(followupOffense({ ...ok, answer: ok.answer + "10月20日前後。" })).toMatch(/^bad/);
    expect(followupOffense({ ...ok, answer: ok.answer + "可以再抽一支看看。" })).toMatch(/^bad/);
    expect(followupOffense({ ...ok, answer: "太短了" })).toBe("short");
    expect(followupOffense({ ...ok, answer: ok.answer + " pace 上偏慢。" })).toBe("english:pace");
    expect(followupOffense({ ...ok, answer: ok.answer + "那份 offer 先別急著回 LINE。" })).toBeNull();
    const sys = qianFollowupSystem(null);
    expect(sys).toMatch(/ONE follow-up/);
    expect(sys).toMatch(/never use 靈驗/);
  });

  it("is written once: a second answer never replaces the first", () => {
    const token = draw(1);
    expect(setQianFollowup(token, "我要先主動嗎？", { answer: "第一個", cast: false })).toBe(true);
    expect(setQianFollowup(token, "再問一次", { answer: "第二個", cast: true })).toBe(false);
    const f = qianFollowupOf(qianDrawByToken(token)!)!;
    expect(f.question).toBe("我要先主動嗎？");
    expect(f.followup.answer).toBe("第一個");
  });

  it("only a paid, written reading can be followed up — and only once", async () => {
    expect((await answerQianFollowup(draw(2, false, false), "我要先主動嗎？")).ok).toBe(false);
    const unwritten = draw(3, true, false);
    expect(await answerQianFollowup(unwritten, "我要先主動嗎？")).toEqual({ ok: false, why: "no_reading" });
    const used = draw(4);
    setQianFollowup(used, "我要先主動嗎？", { answer: "已答", cast: false });
    expect(await answerQianFollowup(used, "再一題")).toEqual({ ok: false, why: "used" });
  });

  it("the dashboard splits lots by set and by matter, and counts the money of paid readings", () => {
    const since = Date.now() - 60_000;
    const before = qianBreakdown(since);
    const n0 = before.bySet.find((r) => r.key === "liushi-jiazi")?.draws ?? 0;
    const t = draw(20);
    recordOrder({ sessionId: "cs_test_qb20", customerId: null, castId: null, tier: "qian", amountCents: 7500, currency: "TWD", email: null, status: "paid", paymentIntent: null, campaign: "jieqian" });
    setQianFollowup(t, "我要先主動嗎？", { answer: "已答", cast: false });
    const b = qianBreakdown(since);
    const row = b.bySet.find((r) => r.key === "liushi-jiazi")!;
    expect(row.draws).toBe(n0 + 1);
    expect(row.paid).toBeGreaterThanOrEqual(1);
    expect(row.followups).toBeGreaterThanOrEqual(1);
    expect(b.bySituation.find((r) => r.key === "fuhe")!.draws).toBeGreaterThanOrEqual(1);
    const twd = b.money.find((m) => m.currency === "TWD")!;
    expect(twd.minor - (before.money.find((m) => m.currency === "TWD")?.minor ?? 0)).toBe(7500);
  });

  it("the route checks the token and the length before anything is written", async () => {
    expect((await POST(req({ token: "nope", question: "我要先主動嗎？" }))).status).toBe(404);
    expect((await POST(req({ token: draw(5), question: "嗎" }))).status).toBe(400);
    expect((await POST(req({ token: draw(6), question: "長".repeat(201) }))).status).toBe(400);
    expect((await POST(req({ token: draw(7, false, false), question: "我要先主動嗎？" }))).status).toBe(402);
    const used = draw(8);
    setQianFollowup(used, "我要先主動嗎？", { answer: "已答", cast: false });
    expect((await POST(req({ token: used, question: "再問一次可以嗎" }))).status).toBe(409);
  });
});
