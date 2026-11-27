import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../src/app/api/qian/draw/route";
import { createSession, qianDrawByToken, upsertCustomer } from "../src/lib/db";

/**
 * 10-13 (Neil: 解籤不再匿名) → 10-25 (Neil: 「把这些可以不登录使用的产品也改为需要登录才能使用」): a lot is drawn only when
 * signed in, and is filed under that account.
 */
describe("解籤 · 要登入", () => {
  const req = (body: unknown, cookie?: string) => new NextRequest("https://yaoflow.com/api/qian/draw", { method: "POST", body: JSON.stringify(body), headers: { "x-forwarded-for": `10.7.${Math.floor(Math.random() * 250)}.1`, ...(cookie ? { cookie } : {}) } });
  const base = { set: "liushi-jiazi", num: 7, situation: "work", question: "要不要換工作" };

  // 10-31 进度表 131: no sign-in to start again — a signed-out reader leaves an address (the 10-13 rule), the lot is filed under it
  it("a signed-out reader needs an address, and the lot is filed under it", async () => {
    const r0 = await POST(req(base));
    expect(r0.status).toBe(400);
    const r = await POST(req({ ...base, email: "qiandraw@example.org" }));
    expect(r.status).toBe(200);
    const { token } = (await r.json()) as { token: string };
    expect(qianDrawByToken(token)!.customer_id).toBe(upsertCustomer("qiandraw@example.org", "zh-hant"));
  });

  it("files the lot under the signed-in account", async () => {
    const cid = upsertCustomer("qiandraw-in@example.org", "zh-hant");
    const sid = "e7".repeat(32);
    createSession(sid, cid, 3_600_000);
    const r = await POST(req(base, `yf_session=${sid}`));
    expect(r.status).toBe(200);
    const { token } = (await r.json()) as { token: string };
    expect(qianDrawByToken(token)!.customer_id).toBe(cid);
  });
});
