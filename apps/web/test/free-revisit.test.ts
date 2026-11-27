import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * 10-22 进度表 89／90 (设计稿 R7「付不付費都給回訪」, Neil 10-22「可以」): a free 六爻 reading and a free tarot spread get a
 * revisit of the reader's own day; 「你打算怎麼做」 is kept for the reader and shown back; the free answers count on the
 * home page. sendEmail and the address check are stubbed.
 */
const sent = vi.hoisted(() => ({ list: [] as { to: string; kind: string }[], last: null as null | { subject: string; html: string; text: string } }));
vi.mock("../src/lib/email", async (orig) => {
  const real = await orig<typeof import("../src/lib/email")>();
  const { logMailSent } = await import("../src/lib/db");
  return {
    ...real,
    sendEmail: vi.fn(async (to: string, subject: string, html: string, text: string, opts: { kind: string; sessionId?: string | null; customerId?: number | null }) => {
      const id = `re_free_${sent.list.length + 1}_${Date.now()}`;
      logMailSent({ id, kind: opts.kind, email: to, subject, sessionId: opts.sessionId, customerId: opts.customerId });
      sent.list.push({ to: to.toLowerCase(), kind: opts.kind });
      sent.last = { subject, html, text };
      return { ok: true, id };
    }),
  };
});
vi.mock("../src/lib/email-mx", async (orig) => {
  const real = await orig<typeof import("../src/lib/email-mx")>();
  return { ...real, serverCheckEmail: vi.fn(async (raw: string) => (/^[^@\s]+@[^@\s]+\.[a-z]+$/i.test(raw.trim()) ? { ok: true as const, email: raw.trim().toLowerCase() } : { ok: false as const, error: "bad_email" as const })) };
});

process.env.ADMIN_KEY ??= "test-admin-key";
const { db, revisitById, revisitBySession, scheduleRevisit, selfRevisitOf, setRevisitOutcome, upsertCustomer } = await import("../src/lib/db");
const { POST: freePost } = await import("../src/app/api/revisit/free/route");
const { POST: planPost } = await import("../src/app/api/revisit/plan/route");
const { POST: revisitRun } = await import("../src/app/api/revisit/run/route");
const { GET: outcomeGet } = await import("../src/app/api/revisit/outcome/route");
const { outcomeUrl } = await import("../src/lib/outcome-token");
const { resetResultsCache, resultsCounts } = await import("../src/lib/results-line");
const tarot = await import("../src/lib/tarot");
const { POST: tarotRevisitPost } = await import("../src/app/api/tarot/revisit/route");
const { POST: tarotAnswerPost } = await import("../src/app/api/tarot/answer/route");

const DAY = 86_400_000;
let ip = 0;
const post = (route: (r: NextRequest) => Promise<Response>, body: unknown) =>
  route(new NextRequest("http://localhost/api/x", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": `10.9.0.${++ip}` }, body: JSON.stringify(body) }));
const cron = () => revisitRun(new NextRequest("http://localhost/api/revisit/run", { method: "POST", headers: { "x-cron-key": process.env.ADMIN_KEY! } }));
const V = [7, 8, 9, 8, 7, 8];

afterEach(() => { sent.list.length = 0; sent.last = null; });

describe("免費讀者也給回訪 (90) ＋ 你打算怎麼做 (89)", () => {
  it("a free cast: the reader's own day, what counts, the plan; Chinese pages only; a crisis question is not kept; cancellable", async () => {
    const r = await post(freePost, { question: "他這個月會先傳訊息嗎", values: V, days: 30, hint: "他先傳訊息", plan: "先不主動", email: "Free-A@example.com", locale: "zh-hant" });
    expect(r.status).toBe(200);
    const j = (await r.json()) as { ok: boolean; ref: string; dueAt: number };
    const row = selfRevisitOf("cast", j.ref)!;
    expect(row.kind).toBe("cast"); expect(row.status).toBe("pending"); expect(row.email).toBe("free-a@example.com"); expect(row.customer_id).toBeNull();
    expect(row.label).toMatch(/^「他這個月會先傳訊息嗎」 · .+/); expect(row.hint).toBe("他先傳訊息"); expect(row.plan).toBe("先不主動");
    expect(row.due_at - Date.now()).toBeGreaterThan(29 * DAY); expect(row.due_at - Date.now()).toBeLessThan(31.5 * DAY);
    expect((await post(freePost, { question: "他會回來嗎", values: V, days: 30, email: "x@example.com", locale: "en" })).status).toBe(400);
    expect((await post(freePost, { question: "我不想活了", values: V, days: 30, email: "x@example.com", locale: "zh-hant" })).status).toBe(400);
    expect((await post(freePost, { question: "他會回來嗎", values: V, days: 45, email: "x@example.com", locale: "zh-hant" })).status).toBe(400);
    expect((await post(freePost, { question: "他會回來嗎", values: [1, 2, 3], days: 30, email: "x@example.com", locale: "zh-hant" })).status).toBe(400);
    expect((await post(freePost, { question: "他會回來嗎", values: V, days: 30, email: "nope", locale: "zh-hant" })).status).toBe(400);
    expect((await post(freePost, { cancel: true, ref: j.ref })).status).toBe(200);
    expect(selfRevisitOf("cast", j.ref)!.status).toBe("skipped");
  });

  it("the day comes: one letter that leads to a new cast and shows the plan back; the answer scores itself and counts on the home page", async () => {
    resetResultsCache();
    const before = resultsCounts(1);
    const r = await post(freePost, { question: "这份 offer 该不该接", values: V, days: 14, plan: "先問清楚加班", email: "free-b@example.com", locale: "zh" });
    const { ref } = (await r.json()) as { ref: string };
    const row = selfRevisitOf("cast", ref)!;
    db().prepare("UPDATE revisits SET due_at = ? WHERE id = ?").run(Date.now() - DAY, row.id);
    const res = (await (await cron()).json()) as { results: { id: number; status: string }[] };
    expect(res.results.find((x) => x.id === row.id)!.status).toBe("sent");
    expect(sent.last!.subject).toContain("这份 offer 该不该接");
    expect(sent.last!.html).toContain("再起一卦"); expect(sent.last!.html).toContain("你当时打算：先问清楚加班"); expect(sent.last!.html).toContain("你起卦后选了");
    const o = await outcomeGet(new NextRequest(outcomeUrl("http://localhost", row.id, "happened", "zh")));
    expect(o.status).toBe(200);
    expect(await o.text()).toContain("再起一卦");
    expect(revisitById(row.id)!.outcome).toBe("hit");
    resetResultsCache();
    const after = resultsCounts(2);
    // 10-23 进度表 104 ②: a free cast's answer is the reader's fact, on its own line — never a score
    expect(after.asked - before.asked).toBe(1); expect(after.answered - before.answered).toBe(1); expect(after.facts.happened - before.facts.happened).toBe(1);
    expect(after.judged).toEqual(before.judged);
  });

  it("a free tarot spread: asked at a typed address (or not at all without one), answered on its page; the plan rides with it", async () => {
    const cid = upsertCustomer("free-c@example.com", "zh-hant");
    const tk = tarot.createDraw({ question: "他是不是還在意我", spread: 1, locale: "zh-hant", bid: null, customerId: null, register: null }).token;
    expect((await post(tarotAnswerPost, { token: tk, answer: "happened" })).status).toBe(402);
    expect((await post(tarotRevisitPost, { token: tk, days: 30, outcome: "" })).status).toBe(409);
    const ok = await post(tarotRevisitPost, { token: tk, days: 30, outcome: "他主動約我", plan: "先照常過日子", email: "free-c@example.com" });
    expect(ok.status).toBe(200);
    const d = tarot.tarotDraw(tk)!;
    expect(d.email).toBe("free-c@example.com"); expect(d.plan).toBe("先照常過日子"); expect(d.revisit_days).toBe(30); expect(d.paid_at).toBeNull();
    expect((await post(tarotAnswerPost, { token: tk, answer: "happened" })).status).toBe(200);
    expect(tarot.tarotDraw(tk)!.revisit_answer).toBe("happened");
    expect(cid).toBeGreaterThan(0);
  });

  it("the paid reading's plan: written by the reading's own session, closed once answered, and in the letter", async () => {
    const sid = "cs_free_plan_1";
    scheduleRevisit({ sessionId: sid, castId: null, customerId: null, email: "free-d@example.com", locale: "zh-hant", tier: "deep", castAtMs: Date.now() - 2 * DAY, windowDays: 20, timingQuote: "十一月初" });
    expect((await post(planPost, { sid, plan: "  先把履歷   寄出去 " })).status).toBe(200);
    expect(revisitBySession(sid)!.plan).toBe("先把履歷 寄出去");
    expect((await post(planPost, { sid: "cs_nobody", plan: "x" })).status).toBe(404);
    setRevisitOutcome(revisitBySession(sid)!.id, "hit", { event: "happened" });
    expect((await post(planPost, { sid, plan: "改了" })).status).toBe(409);
    const { buildRevisitEmail } = await import("../src/lib/email");
    const m = buildRevisitEmail({ locale: "zh-hant", question: "要不要換工作", values: V, hexName: "澤水困", changedName: null, timingQuote: null, windowDays: 20, readingUrl: "https://x/r", castUrl: "https://x/c", plan: "先把履歷寄出去" });
    expect(m.html).toContain("你當時打算：先把履歷寄出去");
    const en = buildRevisitEmail({ locale: "en", question: "Should I move?", values: V, hexName: "Oppression", changedName: null, timingQuote: null, windowDays: 20, readingUrl: "https://x/r", castUrl: "https://x/c", plan: "Ask first" });
    expect(en.text).toContain("What you said you'd do: Ask first");
  });
});
