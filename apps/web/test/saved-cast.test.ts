import { describe, expect, it, vi } from "vitest";
import type { LineValue } from "@yaoflow/engine";
import { NextRequest } from "next/server";

/**
 * 10-02 存到邮箱 (对照测试 y): a reader who is not ready may email themselves the cast. One letter now (asked for), one
 * reminder the next day in their own clock (commercial: unsubscribe link), nothing for a crisis question, an address
 * that unsubscribed or one that has since paid; deleted after 30 days. Resend is stubbed: what matters is what we send.
 */
const sent: { to: string; subject: string; text: string; html: string; kind: string; unsub?: string }[] = [];
vi.mock("../src/lib/email", async (orig) => {
  const real = await orig<typeof import("../src/lib/email")>();
  return {
    ...real,
    sendEmail: vi.fn(async (to: string, subject: string, html: string, text: string, opts: { kind: string; unsubUrl?: string }) => {
      sent.push({ to, subject, text, html, kind: opts.kind, unsub: opts.unsubUrl });
      return { ok: true, id: `re_saved_${sent.length}` };
    }),
  };
});

const { saveCastForLater, runSavedFollowups, followupDue, SAVED_KEEP_MS, SAVES_PER_ADDRESS_PER_DAY } = await import("../src/lib/saved-cast");
const db = await import("../src/lib/db");
const { buildSavedCastEmail, buildSavedFollowupEmail, COMMERCIAL_KINDS } = await import("../src/lib/email");
const { SAVED_T } = await import("../src/lib/dict/saved-cast");
const { LOCALES } = await import("../src/lib/locales");
const { GET: savedGet } = await import("../src/app/api/cast/saved/route");
const { POST: savePost } = await import("../src/app/api/cast/save/route");

const VALUES: LineValue[] = [7, 8, 9, 8, 7, 8];
const H = 3_600_000;
const tokenOf = (text: string) => /[?&]saved=([0-9a-f]{48})/.exec(text)?.[1] ?? null;
/** the first moment the reminder for this row is due (scanning hour by hour) */
function dueAt(row: { created_at: number; tz_offset: number }): number {
  for (let t = row.created_at; t < row.created_at + 80 * H; t += H / 2) if (followupDue(row, t)) return t;
  throw new Error("never due");
}

describe("存到邮箱：存下这一卦", () => {
  it("keeps the cast, sends the letter with the question, the figure, the free line and the way back", async () => {
    const r = await saveCastForLater({
      email: "Saved-A@Example.com", question: "這份工作我該不該換", values: VALUES, castAtMs: Date.now() - 60_000, tzOffsetMinutes: 480,
      locale: "zh-hant", teaser: "<b>眼下</b>  這份工作還撐得住，\n但心已經不在了。", currency: "twd",
    });
    expect(r.ok).toBe(true);
    const token = (r as { token: string }).token;
    expect(token).toMatch(/^[0-9a-f]{48}$/);
    const row = db.savedCastByToken(token)!;
    expect(row.email).toBe("saved-a@example.com");
    expect(row.teaser).toBe("眼下 這份工作還撐得住， 但心已經不在了。"); // tags and line breaks gone
    expect(row.currency).toBe("TWD");
    expect(row.sent_at).not.toBeNull();
    const m = sent.at(-1)!;
    expect(m.kind).toBe("saved_cast");
    expect(m.to).toBe("saved-a@example.com");
    expect(m.subject).toBe(`你存下的卦：${row.hex}`);
    expect(m.text).toContain("這份工作我該不該換");
    expect(m.text).toContain("但心已經不在了");
    expect(tokenOf(m.text)).toBe(token);
    expect(m.text).toContain("c=saved");
    expect(m.text).not.toMatch(/\{\w+\}/);
  });

  it("the page gets the same figure back — and the same free line, with today's timing hint", async () => {
    const r = await saveCastForLater({ email: "saved-back@example.com", question: "我們還會復合嗎", values: VALUES, castAtMs: Date.now() - 120_000, tzOffsetMinutes: -300, locale: "zh-hant", teaser: "緣分未盡。" });
    const token = (r as { token: string }).token;
    const res = await savedGet(new NextRequest(`http://localhost/api/cast/saved?t=${token}`));
    expect(res.status).toBe(200);
    const d = (await res.json()) as { question: string; values: number[]; tzOffsetMinutes: number; teaser: string; timing: unknown };
    expect(d.question).toBe("我們還會復合嗎");
    expect(d.values).toEqual(VALUES);
    expect(d.tzOffsetMinutes).toBe(-300);
    expect(d.teaser).toBe("緣分未盡。");
    expect(db.savedCastByToken(token)!.opened_at).not.toBeNull();
    expect((await savedGet(new NextRequest("http://localhost/api/cast/saved?t=nope"))).status).toBe(400);
    expect((await savedGet(new NextRequest(`http://localhost/api/cast/saved?t=${"0".repeat(48)}`))).status).toBe(404);
  });

  it("never keeps a crisis question, a figure that is not six lines, or one from days ago", async () => {
    const n = sent.length;
    const base = { email: "saved-no@example.com", values: VALUES, castAtMs: Date.now(), tzOffsetMinutes: 480, locale: "zh" };
    expect(await saveCastForLater({ ...base, question: "我不想活了" })).toEqual({ ok: false, error: "crisis" });
    expect(await saveCastForLater({ ...base, question: "工作怎么样", values: [7, 8, 9] })).toEqual({ ok: false, error: "bad_values" });
    expect(await saveCastForLater({ ...base, question: "工作怎么样", values: [7, 8, 9, 8, 7, 5] })).toEqual({ ok: false, error: "bad_values" });
    expect(await saveCastForLater({ ...base, question: "工作怎么样", castAtMs: Date.now() - 4 * 86_400_000 })).toEqual({ ok: false, error: "bad_values" });
    expect(await saveCastForLater({ ...base, question: "啊" })).toEqual({ ok: false, error: "bad_question" });
    expect(sent.length).toBe(n);
  });

  it(`at most ${SAVES_PER_ADDRESS_PER_DAY} a day per address`, async () => {
    const one = () => saveCastForLater({ email: "saved-many@example.com", question: "这次面试能过吗", values: VALUES, castAtMs: Date.now(), tzOffsetMinutes: 480, locale: "zh" });
    for (let i = 0; i < SAVES_PER_ADDRESS_PER_DAY; i++) expect((await one()).ok).toBe(true);
    expect(await one()).toEqual({ ok: false, error: "too_many" });
  });

  it("the route checks the address and says why", async () => {
    const prev = process.env.PAYWALL;
    process.env.PAYWALL = "on";
    try {
      const post = (body: Record<string, unknown>, ip: string) => savePost(new NextRequest("http://localhost/api/cast/save", {
        method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify(body),
      }));
      const bad = await post({ email: "not-an-address", question: "这次面试能过吗", values: VALUES, castAtMs: Date.now(), tzOffsetMinutes: 480, locale: "zh" }, "203.0.113.7");
      expect(bad.status).toBe(400);
      expect(((await bad.json()) as { error: string }).error).toBe("bad_email");
      const crisis = await post({ email: "saved-route@example.com", question: "I want to die", values: VALUES, castAtMs: Date.now(), tzOffsetMinutes: 0, locale: "en" }, "203.0.113.8");
      expect(crisis.status).toBe(400);
    } finally {
      process.env.PAYWALL = prev;
    }
  });
});

describe("存到邮箱：第二天的那一封提醒", () => {
  it("is due on the reader's next calendar day, 9:00–21:00 their time, at least 8 h on, given up after 72 h", () => {
    const created = Date.UTC(2026, 9, 1, 6, 0); // 14:00 in Taipei (+480)
    const row = { created_at: created, tz_offset: 480 };
    expect(followupDue(row, Date.UTC(2026, 9, 1, 15, 0))).toBe(false); // 23:00 the same day
    expect(followupDue(row, Date.UTC(2026, 9, 1, 23, 0))).toBe(false); // 07:00 next day — too early
    expect(followupDue(row, Date.UTC(2026, 9, 2, 2, 0))).toBe(true); // 10:00 next day
    expect(followupDue(row, Date.UTC(2026, 9, 2, 14, 0))).toBe(false); // 22:00 next day — too late
    expect(followupDue(row, Date.UTC(2026, 9, 4, 2, 0))).toBe(true); // 68 h — still
    expect(followupDue(row, Date.UTC(2026, 9, 5, 2, 0))).toBe(false); // 92 h — given up
    // saved at 23:30 local: past midnight is "tomorrow", but not before 9:00
    const late = { created_at: Date.UTC(2026, 9, 1, 15, 30), tz_offset: 480 };
    expect(followupDue(late, Date.UTC(2026, 9, 1, 23, 30))).toBe(false); // 07:30, 8 h on — too early
    expect(followupDue(late, Date.UTC(2026, 9, 2, 1, 0))).toBe(true); // 09:00
    // New York (-240): 9:00 local is 13:00 UTC
    const ny = { created_at: Date.UTC(2026, 9, 1, 20, 0), tz_offset: -240 }; // 16:00 local
    expect(followupDue(ny, Date.UTC(2026, 9, 2, 12, 0))).toBe(false); // 08:00 local
    expect(followupDue(ny, Date.UTC(2026, 9, 2, 13, 0))).toBe(true);
  });

  it("sends once — what the full reading gives, the first-time price, the way back, an unsubscribe link", async () => {
    const t0 = Date.now() - 30 * H;
    const r = await saveCastForLater({ email: "saved-follow@example.com", question: "這份工作我該不該換，下個月會有新的機會嗎", values: VALUES, castAtMs: t0 - 60_000, tzOffsetMinutes: 480, locale: "zh-hant", currency: "TWD" }, t0);
    const token = (r as { token: string }).token;
    const row = db.savedCastByToken(token)!;
    const at = dueAt(row);
    const before = sent.length;
    const out = await runSavedFollowups(at);
    expect(out.sent).toBeGreaterThanOrEqual(1);
    const m = sent.slice(before).find((x) => x.to === "saved-follow@example.com")!;
    expect(m.kind).toBe("saved_followup");
    expect(COMMERCIAL_KINDS.has("saved_followup")).toBe(true);
    expect(m.unsub).toMatch(/\/api\/unsub\?|unsub/);
    expect(m.subject).toContain(row.hex!);
    expect(m.subject).toContain("這份工作我該不該換，下個月會有新的"); // 18 characters, then an ellipsis
    expect(m.text).toContain("NT$75"); // the first full reading at the light price
    expect(m.text).toContain("NT$269");
    expect(m.text).toContain("5 次");
    expect(tokenOf(m.text)).toBe(token);
    expect(db.savedCastByToken(token)!.followup_note).toBe("sent");
    // once
    const again = sent.length;
    await runSavedFollowups(at + H);
    expect(sent.slice(again).some((x) => x.to === "saved-follow@example.com")).toBe(false);
  });

  it("10-23 进度表 101: with the 通卡 open to everyone the price line is the 1-day pass (first one, then the regular price)", async () => {
    const prev = process.env.TONGKA_MODEL;
    process.env.TONGKA_MODEL = "on";
    try {
      const t0 = Date.now() - 30 * H;
      const r = await saveCastForLater({ email: "saved-pass@example.com", question: "這次面試能過嗎", values: VALUES, castAtMs: t0 - 60_000, tzOffsetMinutes: 480, locale: "zh-hant", currency: "TWD" }, t0);
      const row = db.savedCastByToken((r as { token: string }).token)!;
      const before = sent.length;
      await runSavedFollowups(dueAt(row));
      const m = sent.slice(before).find((x) => x.to === "saved-pass@example.com")!;
      expect(m.text).toContain("1 日通卡");
      expect(m.text).toContain("首張 NT$75（之後 NT$99）");
      expect(m.text).not.toContain("NT$269");
      expect(m.text).not.toContain("第一次看深斷");
    } finally {
      if (prev === undefined) delete process.env.TONGKA_MODEL; else process.env.TONGKA_MODEL = prev;
    }
  });

  it("not to an address that unsubscribed (either way), and not about what they have since bought", async () => {
    const t0 = Date.now() - 30 * H;
    const mk = async (email: string) => {
      const r = await saveCastForLater({ email, question: "這次搬家順利嗎", values: VALUES, castAtMs: t0 - 60_000, tzOffsetMinutes: 480, locale: "zh-hant" }, t0);
      return db.savedCastByToken((r as { token: string }).token)!;
    };
    const stopped = await mk("saved-stop@example.com");
    db.stopSavedCasts("SAVED-STOP@example.com"); // the letter's own unsubscribe link
    const unsub = await mk("saved-unsub@unsub-saved.example.org");
    db.recordUnsub("saved-unsub@unsub-saved.example.org"); // 10-23: how /api/unsub records it (the exact address)
    const paid = await mk("saved-paid@example.com");
    db.recordOrder({ sessionId: "cs_saved_paid", customerId: null, castId: null, tier: "one", amountCents: 7500, currency: "TWD", email: "saved-paid@example.com", status: "paid" });
    const before = sent.length;
    await runSavedFollowups(Math.max(dueAt(stopped), dueAt(unsub), dueAt(paid)));
    const to = sent.slice(before).map((x) => x.to);
    expect(to).not.toContain("saved-stop@example.com");
    expect(to).not.toContain("saved-unsub@unsub-saved.example.org");
    expect(to).not.toContain("saved-paid@example.com");
    expect(db.savedCastByToken(stopped.token)!.followup_at).toBeNull(); // stopped: never considered
    expect(db.savedCastByToken(unsub.token)!.followup_note).toBe("skip:optout");
    expect(db.savedCastByToken(paid.token)!.followup_note).toBe("skip:paid");
  });

  it("a saved cast is deleted after 30 days", async () => {
    const r = await saveCastForLater({ email: "saved-old@example.com", question: "這次考試能過嗎", values: VALUES, castAtMs: Date.now(), tzOffsetMinutes: 480, locale: "zh-hant" });
    const token = (r as { token: string }).token;
    await runSavedFollowups(Date.now() + SAVED_KEEP_MS + H);
    expect(db.savedCastByToken(token)).toBeNull();
  });

  it("erasing an account erases what that address saved", async () => {
    const r = await saveCastForLater({ email: "saved-erase@example.com", question: "這次考試能過嗎", values: VALUES, castAtMs: Date.now(), tzOffsetMinutes: 480, locale: "zh-hant" });
    const token = (r as { token: string }).token;
    const cid = db.upsertCustomer("saved-erase@example.com", "zh-hant");
    db.eraseCustomer(cid);
    expect(db.savedCastByToken(token)).toBeNull();
  });
});

describe("存到邮箱：两封信九种语言", () => {
  it("every language has every line, and both letters fill in", () => {
    for (const l of LOCALES) {
      const t = (SAVED_T as Record<string, Record<string, string>>)[l]!;
      expect(Object.keys(t).sort(), l).toEqual(Object.keys(SAVED_T.zh).sort());
      const a = buildSavedCastEmail({ locale: l as never, hex: "HEX", question: "Q?", teaser: "LINE", url: "https://yaoflow.com/x/cast?saved=abc", unsubUrl: "https://yaoflow.com/api/unsub?x" });
      expect(a.subject + a.text, l).not.toMatch(/\{\w+\}/);
      expect(a.text, l).toContain("LINE");
      expect(a.text, l).toContain("cast?saved=abc");
      expect(a.html, l).toContain("/api/unsub?x");
      const f = buildSavedFollowupEmail({ locale: l as never, hex: "HEX", question: "Q?", price: "$2.99", full: "$5.99", first: true, followups: 5, url: "https://yaoflow.com/x/cast?saved=abc", unsubUrl: "https://yaoflow.com/api/unsub?x" });
      expect(f.subject + f.text, l).not.toMatch(/\{\w+\}/);
      expect(f.text, l).toContain("$2.99");
      expect(f.text, l).toContain("$5.99");
      expect(f.text, l).toContain("5");
      expect(f.html, l).toContain("/api/unsub?x");
      const g = buildSavedFollowupEmail({ locale: l as never, hex: "HEX", question: "Q?", price: "$5.99", full: "$5.99", first: false, followups: 5, url: "u", unsubUrl: "v" });
      expect(g.text, l).toContain("$5.99");
      // 10-23 进度表 101: the 1-day pass wording, first one and regular
      const p1 = buildSavedFollowupEmail({ locale: l as never, hex: "HEX", question: "Q?", price: "$2.99", full: "$3.99", first: true, followups: 5, url: "u", unsubUrl: "v", pass: true });
      expect(p1.subject + p1.text, l).not.toMatch(/\{\w+\}/);
      expect(p1.text, l).toContain("$2.99");
      expect(p1.text, l).toContain("$3.99");
      expect(p1.text, l).not.toBe(f.text);
      const p2 = buildSavedFollowupEmail({ locale: l as never, hex: "HEX", question: "Q?", price: "$3.99", full: "$3.99", first: false, followups: 5, url: "u", unsubUrl: "v", pass: true });
      expect(p2.text, l).toContain("$3.99");
      expect(p2.subject + p2.text, l).not.toMatch(/\{\w+\}/);
    }
    // the subject quotes the question — cut at a word in a spaced language, at 18 characters in Chinese
    const en = buildSavedFollowupEmail({ locale: "en", hex: "After Completion", question: "Should I change jobs this year or wait until next spring?", price: "$2.99", full: "$5.99", first: true, followups: 5, url: "u", unsubUrl: "v" });
    expect(en.subject).toBe("“Should I change jobs this year or wait…” — the full reading of After Completion is still here");
    const zh = buildSavedFollowupEmail({ locale: "zh-hant", hex: "水火既濟", question: "這份工作我該不該換", price: "NT$75", full: "NT$269", first: true, followups: 5, url: "u", unsubUrl: "v" });
    expect(zh.subject).toBe("「這份工作我該不該換」——水火既濟的深斷還在等你");
  });
});
