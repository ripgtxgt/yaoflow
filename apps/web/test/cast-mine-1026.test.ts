import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { createSession, db, saveCast, upsertCustomer } from "../src/lib/db";
import { SESSION_COOKIE } from "../src/lib/auth";
import { resolveServerChart, type ReadingInput } from "../src/lib/reading";
import { GET } from "../src/app/api/cast/mine/route";

/** 10-26 (Neil: 「用户是不能从我的里面去打开之前的卦吗？」): a kept free cast opens back from 「我的」 — only for its owner */
const call = async (id: number, cookie?: string) => {
  const r = await GET(new NextRequest(`http://localhost/api/cast/mine?id=${id}`, { headers: cookie ? { cookie } : {} }));
  return { status: r.status, j: (await r.json()) as Record<string, unknown> };
};

describe("「我的」打开免费卦", () => {
  it("the owner gets the figure and the free line it was given; anyone else gets nothing", async () => {
    const owner = upsertCustomer("mine-owner1026@example.com", "zh-hant");
    const other = upsertCustomer("mine-other1026@example.com", "zh-hant");
    const castAtMs = Date.UTC(2026, 9, 3, 5, 0);
    const input = { question: "這份工作會順利嗎", values: [7, 8, 9, 6, 7, 8], castAtMs, tzOffsetMinutes: 480 } as ReadingInput;
    const id = saveCast({ customerId: owner, castAtMs, tzOffsetMinutes: 480, locale: "zh-hant", question: input.question, values: input.values, chart: resolveServerChart(input, true) as unknown as Record<string, unknown> });
    const bid = "a1b2c3d4e5f60718";
    db().prepare("INSERT INTO browser_links (bid, customer_id, first_at, last_at) VALUES (?,?,?,?)").run(bid, owner, castAtMs - 1000, castAtMs);
    db().prepare("INSERT INTO cast_log (bid, at, tz, locale, question, values_str, primary_num, teaser, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run(bid, castAtMs, 480, "zh-hant", input.question, "789678", 1, "那一句免費的話", castAtMs, castAtMs);

    expect((await call(id)).status).toBe(401);
    const so = "5".repeat(64); createSession(so, owner, 3_600_000);
    const mine = await call(id, `${SESSION_COOKIE}=${so}`);
    expect(mine.status).toBe(200);
    expect(mine.j).toMatchObject({ question: input.question, values: [7, 8, 9, 6, 7, 8], castAtMs, tzOffsetMinutes: 480, teaser: "那一句免費的話" });
    const sx = "6".repeat(64); createSession(sx, other, 3_600_000);
    expect((await call(id, `${SESSION_COOKIE}=${sx}`)).status).toBe(404);
  });
});
