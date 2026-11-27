import { describe, expect, it, vi, beforeAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** 11-01 进度表 133: a member with no chart gets the shared 流月信 and the 「補上出生資料」 button; one per month. */
beforeAll(() => { process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "yf-133-")); });

const sent: { to: string; subject: string; html: string }[] = [];
vi.mock("../src/lib/email", async (orig) => {
  const real = await orig<typeof import("../src/lib/email")>();
  return { ...real, sendEmail: vi.fn(async (to: string, subject: string, html: string) => { sent.push({ to, subject, html }); return { ok: true, id: `re_133_${sent.length}` }; }) };
});
let calls = 0;
vi.mock("../src/lib/llm", async (orig) => {
  const real = await orig<typeof import("../src/lib/llm")>();
  return {
    ...real,
    chatJson: vi.fn(async () => {
      calls++;
      return JSON.stringify({
        keyword: "收心",
        season: "國曆 11 月走過立冬與小雪，天氣轉涼，日照變短。月初還帶著戊戌的土氣，立冬之後換成己亥，土上帶水，腳步更沉一點。這個月適合整理、歸位、把今年還沒做完的事一件件收好，不急著開新局。月底可以挑一個晚上，把待辦清單劃掉三項。",
        sky: "水星與金星都在逆行，一路到月中。這段時間容易舊事重提、訊息也容易傳錯。先別急著回覆，月中之後再把話重新說清楚一次。",
      });
    }),
  };
});

// 2026-11-02 12:00 台北
const NOW = Date.UTC(2026, 10, 2, 4);

describe("133 沒有命盤的會員也收到流月信", () => {
  it("the month as everyone shares it: 節氣, 節氣月, the sky — and no day of the month", async () => {
    const { genericBits } = await import("../src/lib/month-letter-generic");
    const b = genericBits(NOW);
    expect(b.ym).toBe("2026-11");
    expect(b.yearGz).toBe("丙午");
    expect(b.terms.map((t) => t.name)).toEqual(["立冬", "小雪"]);
    expect(b.monthGz.map((m) => m.gz)).toEqual(["戊戌", "己亥"]);
    expect(b.sky.join("")).toMatch(/水星逆行/);
    expect(JSON.stringify(b)).not.toMatch(/\d{1,2}\/\d{1,2}|\d+\s*日/);
    // 繁體 names even where tyme writes 简体
    expect(genericBits(Date.UTC(2026, 7, 2, 4)).terms.map((t) => t.name)).toContain("處暑");
  });

  it("a member with no chart gets the shared letter once (one model call for everyone), with the button's token", async () => {
    const { db, upsertCustomer, upsertSubscription } = await import("../src/lib/db");
    const { setFeature } = await import("../src/lib/features");
    setFeature("tongka", "on");
    const ids: number[] = [];
    for (const [i, loc] of (["zh-hant", "zh-hant", "zh"] as const).entries()) {
      const cid = upsertCustomer(`mo133-${i}@example.org`, loc);
      ids.push(cid);
      upsertSubscription({ customerId: cid, stripeCustomerId: `cus_133_${i}`, stripeSubscriptionId: `sub_133_${i}`, status: "active", plan: "month", periodStart: NOW - 86_400_000, periodEnd: NOW + 29 * 86_400_000, cancelAtPeriodEnd: false });
    }
    const { runMonthLetters } = await import("../src/lib/month-letter");
    const r = await runMonthLetters(NOW, "https://yaoflow.com");
    expect(r.sent).toBe(3);
    expect(r.generic).toBe(3);
    expect(calls).toBe(2); // 繁 and 简, once each
    expect(sent[0]!.subject).toBe("流月信｜國曆 11 月：大家的這個月");
    expect(sent.find((s) => s.to === "mo133-2@example.org")!.subject).toBe("流月信｜公历 11 月：大家的这个月");
    expect(sent[0]!.html).toMatch(/\/api\/member-letter\/birth\?t=[A-Za-z0-9_-]+&amp;l=zh-hant/);
    expect(sent[0]!.html).toContain("補上出生資料");
    expect(sent.map((s) => s.html).join("")).not.toMatch(/免費|免费/);
    // once a month
    const again = await runMonthLetters(NOW + 3_600_000, "https://yaoflow.com");
    expect(again.sent).toBe(0);
    // the click is counted once; the split reads 3 shared, 0 personal
    const { noteBirthClick, monthLetterSplit } = await import("../src/lib/month-letter-generic");
    const tok = sent[0]!.html.match(/t=([A-Za-z0-9_-]+)/)![1]!;
    expect(noteBirthClick(tok, NOW + 60_000)).toBe(true);
    expect(noteBirthClick("nosuchtoken0000", NOW)).toBe(false);
    const split = monthLetterSplit("2026-11");
    expect(split).toMatchObject({ personal: 0, generic: 3, skipped: 0, clicked: 1 });
    expect(db().prepare("SELECT COUNT(*) AS n FROM month_letter_generic WHERE ym = '2026-11'").get()).toEqual({ n: 2 });
  });

  it("the button opens the chart page after counting", async () => {
    const { GET } = await import("../src/app/api/member-letter/birth/route");
    const { NextRequest } = await import("next/server");
    const res = GET(new NextRequest("https://yaoflow.com/api/member-letter/birth?t=abcdefgh1234&l=zh"));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://yaoflow.com/zh/bazi/chart?c=moletter-birth");
  });
});
