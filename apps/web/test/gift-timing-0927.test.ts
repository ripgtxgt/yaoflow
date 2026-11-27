import { describe, expect, it } from "vitest";
import type { LineValue } from "@yaoflow/engine";
import { NextRequest } from "next/server";
import { recordOrder, revisitBySession, saveCast, saveReading, scheduleRevisit, upsertCustomer, giftCastForSession } from "../src/lib/db";
import { outcomeToken } from "../src/lib/outcome-token";
import { resolveServerChart } from "../src/lib/reading";
import { buildReadingEmail } from "../src/lib/email";

const V: LineValue[] = [7, 8, 9, 8, 7, 8];
const AT = Date.UTC(2026, 8, 1, 3);

describe("送一卦的时机与朋友承接（09-27）", () => {
  it("answering 「说中了」 hands over a ready gift link to send; other answers do not", async () => {
    process.env.REVISIT_SECRET ??= "test-secret-0927";
    const { GET } = await import("../src/app/api/revisit/outcome/route");
    const cid = upsertCustomer("gt-hit@example.com", "zh-hant");
    const chart = resolveServerChart({ question: "q", values: V, castAtMs: AT, tzOffsetMinutes: 480 }, true) as unknown as Record<string, unknown>;
    const castId = saveCast({ customerId: cid, castAtMs: AT, tzOffsetMinutes: 480, locale: "zh-hant", question: "他會回來嗎", topic: "relationship", values: V, chart });
    saveReading(castId, cid, "deep", "zh-hant", { verdict: { "zh-hant": "會" } } as never);
    recordOrder({ sessionId: "cs_gt_hit", customerId: cid, castId, tier: "deep", amountCents: 7500, currency: "TWD", email: "gt-hit@example.com", status: "paid" });
    scheduleRevisit({ sessionId: "cs_gt_hit", castId, customerId: cid, email: "gt-hit@example.com", locale: "zh-hant", tier: "deep", castAtMs: AT, windowDays: 3, timingQuote: "九月" });
    const id = revisitBySession("cs_gt_hit")!.id;
    const url = (v: string) => `https://yaoflow.com/api/revisit/outcome?id=${id}&v=${v}&t=${outcomeToken(id)}&l=zh-hant`;

    const open = await (await GET(new NextRequest(url("open")))).text();
    expect(open).not.toContain("line.me");
    expect(giftCastForSession("cs_gt_hit")).toBeNull();

    const res = await GET(new NextRequest(url("hit")));
    const html = await res.text();
    const g = giftCastForSession("cs_gt_hit")!;
    expect(g).not.toBeNull();
    expect(html).toContain(`/zh-hant/cast?gift=${g.token}`);
    expect(html).toContain("line.me/R/share");
    expect(html).toContain("wa.me");
    expect(g.from_device).toMatch(/^[0-9a-f]{24}$/); // the browser that made it cannot spend it
    expect(res.headers.get("set-cookie") ?? "").toContain("yf_dv=");
  });

  it("the delivery mail carries no gift line any more, and a friend's gifted reading points them to their own", () => {
    const base = { locale: "zh-hant" as const, tier: "deep" as const, question: "q", values: V, hexName: "乾", changedName: null, headline: "h", url: "https://yaoflow.com/r" };
    expect(buildReadingEmail({ ...base, friendCastUrl: "https://yaoflow.com/zh-hant/cast?c=giftmail" }).html).toContain("cast?c=giftmail");
    expect(buildReadingEmail(base).html).not.toContain("giftmail");
  });
});
