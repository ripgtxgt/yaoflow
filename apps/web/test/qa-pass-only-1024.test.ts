import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { createSession, db, upsertCustomer, upsertSubscription } from "../src/lib/db";
import { SESSION_COOKIE } from "../src/lib/auth";
import { setFeature } from "../src/lib/features";
import { QA_UI } from "../src/lib/mingli/qa";
import { POST } from "../src/app/api/mingli/qa/route";

process.env.TONGKA_MODEL = "on";

/**
 * 10-24 (Neil: 「命盘，塔罗这两个产品，不是收费的吗？」→ 命盘问答取消免费、要登录): the 3 free questions a day are gone.
 * Not signed in, or signed in without a 通卡／membership → 402 need_pass before any model call and nothing is saved;
 * the page opens on what could be asked and the pass panel (plus a sign-in link when not signed in). A pass holder opens
 * covered.
 */
const D = 86_400_000;
const input = { calendar: "solar", y: 1989, m: 9, d: 26, timeMode: "exact", h: 12, mi: 0, placeId: "tw-tpe" };
const call = async (extra: Record<string, unknown>, cookie?: string) => {
  const r = await POST(new NextRequest("http://localhost/api/mingli/qa", {
    method: "POST", body: JSON.stringify({ system: "bazi", input, gender: "female", locale: "zh-hant", ...extra }),
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
  }));
  return { status: r.status, j: (await r.json()) as Record<string, unknown> };
};
const qaRows = () => (db().prepare("SELECT COUNT(*) AS n FROM mingli_qa").get() as { n: number }).n;

describe("命盤問答：只給通卡／會員", () => {
  it("not signed in: opens locked with a sign-in link, and a question is turned away without being kept", async () => {
    setFeature("bazi", "on");
    const open = await call({ mode: "open" }, `yf_dv=${"q".repeat(24)}`);
    expect(open.status).toBe(200);
    expect(open.j).toMatchObject({ covered: false, signedIn: false });
    expect(open.j).not.toHaveProperty("left");
    expect((open.j.suggested as string[]).length).toBe(3);
    const before = qaRows();
    const ask = await call({ question: "我適合什麼樣的工作？" }, `yf_dv=${"q".repeat(24)}`);
    expect(ask).toMatchObject({ status: 402, j: { error: "need_pass", signedIn: false } });
    expect(qaRows()).toBe(before);
  });

  it("signed in without a pass: locked, no sign-in link; a pass holder opens covered", async () => {
    setFeature("bazi", "on");
    const plain = upsertCustomer("qa-plain1024@example.com", "zh-hant");
    const sp = "3".repeat(64);
    createSession(sp, plain, 3_600_000);
    expect((await call({ mode: "open" }, `${SESSION_COOKIE}=${sp}`)).j).toMatchObject({ covered: false, signedIn: true });
    expect(await call({ question: "我適合什麼樣的工作？" }, `${SESSION_COOKIE}=${sp}`)).toMatchObject({ status: 402, j: { error: "need_pass", signedIn: true } });

    const holder = upsertCustomer("qa-pass1024@example.com", "zh-hant");
    upsertSubscription({ customerId: holder, stripeCustomerId: null, stripeSubscriptionId: "pass_qa_only1024", status: "active", plan: "month", periodStart: Date.now() - D, periodEnd: Date.now() + D, cancelAtPeriodEnd: true, passDays: 1 });
    const sh = "4".repeat(64);
    createSession(sh, holder, 3_600_000);
    expect((await call({ mode: "open" }, `${SESSION_COOKIE}=${sh}`)).j).toMatchObject({ covered: true, signedIn: true });
  });

  it("the page words carry no free count", () => {
    expect(Object.keys(QA_UI)).not.toEqual(expect.arrayContaining(["free"]));
    expect(Object.values(QA_UI).join("")).not.toMatch(/免費/);
    expect(QA_UI).toHaveProperty("locked");
    expect(QA_UI).toHaveProperty("signIn");
  });
});
