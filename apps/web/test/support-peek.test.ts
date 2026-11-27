import { describe, expect, it } from "vitest";
import type { LineValue } from "@yaoflow/engine";
import { NextRequest } from "next/server";
import { ensureInboxTable } from "../src/lib/inbound";
import { db, recordEmail, recordOrder, saveCast, saveReading, upsertCustomer } from "../src/lib/db";
import { resolveServerChart } from "../src/lib/reading";
import { peekLetters } from "../src/lib/support-peek";
import { GET } from "../src/app/api/admin/support/peek/route";

/**
 * 10-23 进度表 97 ④: the support desk's read-only side road when SSH is out — per letter: handled or not, and the writer's
 * last 24 hours (orders, the reading each got, the delivery letter's fate). No address, no text.
 */
const NOW = Date.now();
const V: LineValue[] = [7, 8, 7, 8, 7, 8];
const ID = "0f0e0d0c-0b0a-4909-8807-060504030201";

describe("客服只读接口 peek", () => {
  it("answers the few facts the desk needs, and nothing that identifies the reader", () => {
    ensureInboxTable();
    const cid = upsertCustomer("peek-a@example.com", "zh-hant");
    db().prepare("INSERT INTO support_inbox (id, received_at, from_addr, subject, text, customer_id, handled_at, note) VALUES (?,?,?,?,?,?,?,?)")
      .run(ID, NOW - 3_600_000, "peek-a@example.com", "已付款但是沒有取得深斷", "正文", cid, NOW - 60_000, "Neil 从后台发出回信 Resend re_1");
    const chart = resolveServerChart({ question: "他會回我嗎", values: V, castAtMs: NOW - 2 * 3_600_000, tzOffsetMinutes: -480 }, true) as unknown as Record<string, unknown>;
    const castId = saveCast({ customerId: cid, castAtMs: NOW - 2 * 3_600_000, tzOffsetMinutes: -480, locale: "zh-hant", question: "他會回我嗎", topic: "relationship", values: V, chart });
    saveReading(castId, cid, "deep", "zh-hant", { verdict: { "zh-hant": "x" } } as never);
    recordOrder({ sessionId: "cs_peek_a1", customerId: cid, castId, tier: "pass_1d", amountCents: 9900, currency: "TWD", email: "peek-a@example.com", status: "paid" });
    recordEmail("cs_peek_a1", "reading", "peek-a@example.com", "sent", "re_mail_1");
    db().prepare("INSERT INTO mail_log (id, created_at, kind, email, session_id, customer_id, delivered_at, opened_at) VALUES (?,?,?,?,?,?,?,?)").run("re_mail_1", NOW - 2 * 3_600_000, "reading", "peek-a@example.com", "cs_peek_a1", cid, NOW - 2 * 3_600_000 + 5_000, NOW - 3_600_000);
    // an old order outside the day is not listed
    recordOrder({ sessionId: "cs_peek_old", customerId: cid, castId: null, tier: "deep", amountCents: 26900, currency: "TWD", email: "peek-a@example.com", status: "paid" });
    db().prepare("UPDATE orders SET created_at = ? WHERE session_id = ?").run(NOW - 3 * 86_400_000, "cs_peek_old");

    const [p, missing] = peekLetters([ID, "ffffffff-0000-4000-8000-000000000000"]);
    expect(missing).toEqual({ id: "ffffffff-0000-4000-8000-000000000000", found: false });
    expect(p).toMatchObject({ id: ID, found: true, customerId: cid, note: "Neil 从后台发出回信 Resend re_1" });
    expect(p!.handledAt).toBe(NOW - 60_000);
    expect(p!.orders).toHaveLength(1);
    expect(p!.orders![0]).toMatchObject({ sid: "cs_peek_a1", tier: "pass_1d", status: "paid", castId, reading: { tier: "deep" }, delivery: { status: "sent", deliveredAt: NOW - 2 * 3_600_000 + 5_000, openedAt: NOW - 3_600_000 } });
    expect(JSON.stringify(p)).not.toMatch(/example\.com|正文|他會回我嗎/);
  });

  it("the route: admin only, ids checked, at most 50", async () => {
    process.env.ADMIN_KEY ??= "peek-test-admin-key";
    const bad = await GET(new NextRequest(`http://localhost/api/admin/support/peek?ids=${ID}`));
    expect(bad.status).toBe(403);
    const none = await GET(new NextRequest(`http://localhost/api/admin/support/peek?ids=not-an-id&key=${process.env.ADMIN_KEY}`));
    expect(none.status).toBe(400);
    const many = Array.from({ length: 51 }, (_, i) => `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`).join(",");
    expect((await GET(new NextRequest(`http://localhost/api/admin/support/peek?ids=${many}&key=${process.env.ADMIN_KEY}`))).status).toBe(400);
    const ok = await GET(new NextRequest(`http://localhost/api/admin/support/peek?ids=${ID},${ID}&key=${process.env.ADMIN_KEY}`));
    expect(ok.status).toBe(200);
    const j = (await ok.json()) as { letters: { id: string; found: boolean }[] };
    expect(j.letters).toHaveLength(1);
    expect(j.letters[0]).toMatchObject({ id: ID, found: true });
  });
});
