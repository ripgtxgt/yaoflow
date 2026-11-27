import { describe, expect, it } from "vitest";
import { buildMemberWelcomeEmail, buildPassOpenEmail, buildRecapEmail } from "../src/lib/email";
import { openLetterPerks, letterDate } from "../src/lib/welcome";
import { periodUse } from "../src/lib/sub-recap";
import { LOCALES } from "../src/lib/locales";
import { db, recordEmail, upsertCustomer } from "../src/lib/db";
import { capSpend, DAY_CAPS, MEMBER_DAY_CAPS } from "../src/lib/caps";
import { RIGHTS } from "../src/lib/entitlements";
import { GIFT_POOL_PER_MONTH, MEMBER_FOLLOWUP_LIMIT } from "../src/lib/sub-plan";
import { GIFT_POOL_CAP } from "../src/lib/membership";
import { tongkaT } from "../src/lib/tongka";

/** 10-22 进度表 95 ③④: the 通卡 letter, the member letter, and the review before a renewal */
const BANNED = /準|准确|靈驗|灵验|神明說|神明说|\bAI\b/;

describe("通卡開通信與會員信 (95 ③)", () => {
  it("both letters render in all nine languages with every placeholder filled and no banned word", () => {
    for (const l of LOCALES) {
      const pass = buildPassOpenEmail({
        locale: l, name: tongkaT(l).name[7], until: "2026年10月29日", perks: openLetterPerks("pass", l),
        guarantee: null, castUrl: "https://yaoflow.com/x/cast", servicesUrl: "https://yaoflow.com/x/services", upsell: true, receiptUrl: "https://pay.stripe.com/r/1",
      });
      for (const s of [pass.subject, pass.html, pass.text]) {
        expect(s, l).not.toMatch(/\{\w+\}/);
        expect(s, l).not.toMatch(BANNED);
      }
      expect(pass.subject, l).toContain(tongkaT(l).name[7]);
      expect(pass.subject, l).toContain("2026年10月29日");
      expect(pass.html).toContain("pay.stripe.com/r/1");
      for (const plan of ["month", "year", "gift"] as const) {
        const m = buildMemberWelcomeEmail({
          locale: l, plan, paid: plan === "gift" ? "" : "NT$349", later: plan === "month" ? "NT$269" : null, date: "2026年11月22日",
          perks: openLetterPerks(plan === "gift" ? "comp" : "member", l), castUrl: "https://yaoflow.com/x/cast", manageUrl: "https://yaoflow.com/x/account#membership",
          receiptUrl: null, termsUrl: "https://yaoflow.com/x/terms",
        });
        for (const s of [m.subject, m.html, m.text]) {
          expect(s, `${l} ${plan}`).not.toMatch(/\{\w+\}/);
          expect(s, `${l} ${plan}`).not.toMatch(BANNED);
        }
        expect(m.subject).toContain("2026年11月22日");
        if (plan === "gift") expect(m.text).not.toContain("NT$");
        if (plan === "month") { expect(m.text).toContain("NT$349"); expect(m.text).toContain("NT$269"); }
      }
    }
  });

  it("a pass letter never calls the pass a membership and never lists what only a member has", () => {
    const p = buildPassOpenEmail({ locale: "zh-hant", name: tongkaT("zh-hant").name[1], until: "10月23日 21:05", perks: openLetterPerks("pass", "zh-hant"),
      guarantee: "這是你第一次付費", castUrl: "c", servicesUrl: "s", upsell: true });
    expect(p.subject).toBe(`${tongkaT("zh-hant").name[1]}已開通 · 到 10月23日 21:05`);
    expect(p.text).not.toContain("單月會員");
    expect(p.text).not.toContain("每天早上"); // the daily letter is the member's
    expect(p.text).not.toContain("8 折"); // the 8 折 is the member's
    expect(p.text).toContain("這是你第一次付費");
    expect(p.text).toContain(`每卦可追問 ${MEMBER_FOLLOWUP_LIMIT} 次`);
    expect(p.text).toContain(`每天 ${DAY_CAPS.qa} 題`);
  });

  it("the lists follow the rights table and the caps", () => {
    const pass = openLetterPerks("pass", "zh-hant").join("\n");
    const mem = openLetterPerks("member", "zh-hant").join("\n");
    const comp = openLetterPerks("comp", "zh-hant").join("\n");
    // a member: the daily letter at its hour, the month letter, 8 折, the gifts with their pool, 60 questions
    expect(mem).toContain("7:30");
    expect(mem).toContain("流月信");
    expect(mem).toContain("8 折");
    expect(mem).toContain(`每月 ${GIFT_POOL_PER_MONTH} 張`);
    expect(mem).toContain(`最多存 ${GIFT_POOL_CAP} 張`);
    expect(mem).toContain(`每天 ${MEMBER_DAY_CAPS.qa} 題`);
    // a complimentary membership: every member right but no monthly gifts (it never renews)
    expect(comp).toContain("7:30");
    expect(comp).not.toContain("送一卦");
    // the rights a pass does not have are not in its list
    for (const r of ["member_letter", "bigs_discount", "chart_rewrite"] as const) expect(RIGHTS[r].pass).toBe(false);
    expect(pass).not.toMatch(/每天早上|流月信|8 折/);
    // outside the Chinese pages: only what exists there (full readings; the gifts for a member)
    for (const l of ["en", "ja", "ko", "fr", "de", "es", "pt"] as const) {
      expect(openLetterPerks("pass", l), l).toHaveLength(1);
      expect(openLetterPerks("member", l), l).toHaveLength(2);
      expect(openLetterPerks("comp", l), l).toHaveLength(1);
    }
  });

  it("a 1-day pass ends to the minute in the reader's zone; Taipei when the zone is unknown", () => {
    const at = Date.UTC(2026, 9, 23, 13, 5); // 21:05 in Taipei
    expect(letterDate(at, "zh-hant", null, true)).toMatch(/21:05/);
    expect(letterDate(at, "zh-hant", "Not/AZone", true)).toMatch(/21:05/);
    expect(letterDate(at, "zh-hant", "Asia/Tokyo", true)).toMatch(/22:05/);
    expect(letterDate(at, "zh-hant", null)).toMatch(/2026/);
  });
});

describe("續費前回顧 (95 ④)", () => {
  it("counts what was used — one per thing a day — the active days, and the member letters", () => {
    const cid = upsertCustomer("recap-95@example.com", "zh-hant");
    const day = 86_400_000;
    const now = Date.UTC(2026, 9, 20, 4); // noon in Taipei
    const since = now - 20 * day;
    capSpend(cid, "cast", "t1", now - 10 * day);
    capSpend(cid, "cast", "t2", now - 10 * day + 60_000);
    capSpend(cid, "report", "chart-a", now - 5 * day);
    capSpend(cid, "report", "chart-a", now - 5 * day + 60_000); // the same chart reopened the same day: one
    capSpend(cid, "qa", null, now - 5 * day + 120_000);
    capSpend(cid, "qa", null, now - 5 * day + 180_000);
    capSpend(cid, "tarot", "s1", now - 2 * day);
    capSpend(cid, "cast", "old", since - day); // before the period
    recordEmail(`ml:${cid}:2026-10-15`, "member_letter", "recap-95@example.com", "sent", "x");
    db().prepare("UPDATE emails SET sent_at = ? WHERE session_id = ?").run(now - 5 * day, `ml:${cid}:2026-10-15`);
    const u = periodUse(cid, since, now);
    expect(u).toEqual({ deep: 2, tarot: 1, qian: 0, report: 1, qa: 2, letters: 1, days: 3 });
  });

  it("the letter says the days and their worth at the 1-day pass price, and nothing about worth on a quiet month", () => {
    for (const l of LOCALES) {
      const base = { locale: l, date: "2026年11月1日", paid: "NT$269", matters: [], castUrl: "c", manageUrl: "m", year: null };
      const busy = buildRecapEmail({ ...base, days: 3, value: "NT$297", deep: 2, tarot: 1, qian: 0, report: 1, qa: 2, letters: 1 });
      expect(busy.html, l).not.toMatch(/\{\w+\}/);
      expect(busy.text, l).toContain("NT$297");
      expect(busy.text, l).toContain("3");
      const quiet = buildRecapEmail({ ...base, days: 0, value: null, deep: 0, tarot: 0, qian: 0, report: 0, qa: 0, letters: 0 });
      expect(quiet.text, l).not.toContain("NT$297");
      expect(quiet.html, l).not.toMatch(/\{\w+\}/);
    }
    const zh = buildRecapEmail({ locale: "zh-hant", date: "11月1日", paid: "NT$269", matters: [], castUrl: "c", manageUrl: "m", year: null, days: 3, value: "NT$297", deep: 2, tarot: 1, qian: 0, report: 1, qa: 2, letters: 1 });
    expect(zh.text).toContain("這個月有 3 天用到，按 1 日通卡算是 NT$297。");
    expect(zh.text).toContain("深斷 2 次");
    expect(zh.text).not.toContain("解籤 0");
  });
});
