import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * 10-22 进度表 80 看自己幾項接上「到期回來問你」: a paid 八字／紫微／星盤 report sets its own revisit from the page; the
 * 年書's key-month letter and a 擇日 reminder set theirs; 77's run sends one letter per address (single or digest);
 * the signed answer link scores the row itself; the record of the readings leaves these rows out.
 */
const sent = vi.hoisted(() => ({ list: [] as { to: string; kind: string; sessionId?: string | null }[], last: null as null | { subject: string; html: string; text: string } }));
vi.mock("../src/lib/email", async (orig) => {
  const real = await orig<typeof import("../src/lib/email")>();
  const { logMailSent } = await import("../src/lib/db");
  return {
    ...real,
    sendEmail: vi.fn(async (to: string, subject: string, html: string, text: string, opts: { kind: string; sessionId?: string | null; customerId?: number | null }) => {
      const id = `re_self_${sent.list.length + 1}_${Date.now()}`;
      logMailSent({ id, kind: opts.kind, email: to, subject, sessionId: opts.sessionId, customerId: opts.customerId });
      sent.list.push({ to: to.toLowerCase(), kind: opts.kind, sessionId: opts.sessionId });
      sent.last = { subject, html, text };
      return { ok: true, id };
    }),
  };
});

process.env.ADMIN_KEY ??= "test-admin-key";
process.env.UNSUB_SECRET ??= "test-secret";
const { db, outcomeStats, revisitById, selfRevisitOf, selfRevisitStats, selfRevisitsForCustomer, upsertCustomer } = await import("../src/lib/db");
const { createReport, factsFromBirth } = await import("../src/lib/mingli/bazi/report");
const { normalizeBirth } = await import("../src/lib/mingli/birth/normalize");
const sr = await import("../src/lib/self-revisit");
const { keyMonthEndUtc } = await import("../src/lib/milestone-letter");
const { addZeriRemind, cancelZeriRemind, cancelMyZeriRemind } = await import("../src/lib/mingli/calendar/zeri-remind");
const { outcomeUrl } = await import("../src/lib/outcome-token");
const { resetResultsCache, resultsCounts } = await import("../src/lib/results-line");
const { GET: selfGet, POST: selfPost } = await import("../src/app/api/revisit/self/route");
const { POST: revisitRun } = await import("../src/app/api/revisit/run/route");
const { GET: outcomeGet } = await import("../src/app/api/revisit/outcome/route");
const { nsOffense } = await import("../src/lib/mingli/nianshu/report");

const DAY = 86_400_000;
const tpe = (y: number, m: number, d: number, h = 12) => Date.UTC(y, m - 1, d, h - 8);
const birth = normalizeBirth({ calendar: "solar", y: 1989, m: 9, d: 26, timeMode: "exact", h: 12, mi: 0, placeId: "tw-tpe" } as never);
const deepFacts = factsFromBirth(birth, "male", "deep", tpe(2026, 10, 21));
const bookFacts = factsFromBirth(birth, "male", "year", tpe(2026, 10, 21), 2026);
const cron = (q = "") => revisitRun(new NextRequest(`http://localhost/api/revisit/run${q}`, { method: "POST", headers: { "x-cron-key": process.env.ADMIN_KEY! } }));
const post = (body: unknown, cookie?: string) => selfPost(new NextRequest("http://localhost/api/revisit/self", { method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) }));

afterEach(() => { sent.list.length = 0; sent.last = null; });

/** a paid deep 八字 report bought with `email` */
function paidReport(email: string, customerId: number | null, session: string): string {
  return createReport({ kind: "deep", locale: "zh-hant", register: null, customerId, email, facts: deepFacts, paid: { session, currency: "twd", amountMinor: 0 }, salt: session }).token;
}

describe("看自己的回訪 (80)", () => {
  it("the options and their days: a year end that is less than a week away means next year's", () => {
    expect(sr.selfOptions("bazi", "zh-hant").map((o) => o.id)).toEqual(["3m", "6m", "ye"]);
    // 进度表 85: 紫微 asks after 「流月提到的那個月」 first — the 流月 running now, or the next one with under a week left
    const z = sr.selfOptions("ziwei", "zh", tpe(2026, 10, 22));
    expect(z.map((o) => o.id)).toEqual(["ly", "1m", "3m"]);
    expect(z[0]!.label).toMatch(/^这个流月过完（农历九月，到 11\/[78]）$/);
    expect(sr.selfOptions("ziwei", "zh-hant", tpe(2026, 11, 5))[0]!.label).toMatch(/^下一個流月過完（農曆十月，到 12\/\d+）$/);
    const ly = sr.selfDueAt("ziwei", "ly", tpe(2026, 10, 22))!;
    expect(ly - tpe(2026, 10, 22)).toBeGreaterThan(17 * DAY); expect(ly - tpe(2026, 10, 22)).toBeLessThanOrEqual(21 * DAY);
    expect(sr.liuyuePick(tpe(2026, 10, 22))!.m.lunar).toBe("九月");
    expect(sr.selfOptions("astro", "zh-hant")).toHaveLength(2);
    expect(sr.selfOptions("nianshu", "zh-hant")).toEqual([]);
    // 10-22: what a page hands the client block is data only — a function there made every paid report page a 500
    for (const k of ["bazi", "ziwei", "astro"] as const) {
      const c = sr.selfChoices(k, "zh-hant", tpe(2026, 10, 22));
      expect(JSON.parse(JSON.stringify(c))).toEqual(c);
      for (const o of c) expect(Object.values(o).every((v) => typeof v === "string")).toBe(true);
    }
    const now = tpe(2026, 10, 22);
    const in3 = sr.selfDueAt("bazi", "3m", now)!;
    expect(in3 - now).toBeGreaterThan(89 * DAY); expect(in3 - now).toBeLessThan(93 * DAY);
    expect(new Date(sr.selfDueAt("bazi", "ye", now)!).getUTCFullYear()).toBe(2026);
    expect(new Date(sr.selfDueAt("bazi", "ye", tpe(2026, 12, 29))!).getUTCFullYear()).toBe(2027);
    expect(sr.selfDueAt("bazi", "nope", now)).toBeNull();
  });

  it("the page sets it for the report's owner only, moves it while pending, and takes it back", async () => {
    const cid = upsertCustomer("self-a@example.com", "zh-hant");
    const token = paidReport("self-a@example.com", cid, "cs_self_a");
    // a stranger with another address cannot
    let r = await post({ kind: "bazi", ref: token, option: "3m", email: "other@example.com", locale: "zh-hant" });
    expect(r.status).toBe(403);
    // the address it was bought with can, without an account cookie
    r = await post({ kind: "bazi", ref: token, option: "3m", hint: "  換到想去的  部門 ", email: "Self-A@example.com", locale: "zh-hant" });
    expect(r.status).toBe(200);
    const j = (await r.json()) as { ok: boolean; dueAt: number; state: string };
    expect(j.state).toBe("set");
    const row = selfRevisitOf("bazi", token)!;
    expect(row.kind).toBe("bazi"); expect(row.ref).toBe(token); expect(row.status).toBe("pending"); expect(row.ask).toBe("event");
    expect(row.hint).toBe("換到想去的 部門"); expect(row.label).toBe("八字深度報告"); expect(row.customer_id).toBe(cid); expect(row.email).toBe("self-a@example.com");
    // set again → moved, the new day and words
    r = await post({ kind: "bazi", ref: token, option: "6m", hint: "", email: "self-a@example.com", locale: "zh" });
    expect(((await r.json()) as { state: string }).state).toBe("moved");
    const moved = selfRevisitOf("bazi", token)!;
    expect(moved.due_at).toBeGreaterThan(row.due_at + 60 * DAY); expect(moved.hint).toBeNull(); expect(moved.locale).toBe("zh");
    expect(selfRevisitsForCustomer(cid)).toHaveLength(1);
    // GET shows it
    const g = await selfGet(new NextRequest(`http://localhost/api/revisit/self?kind=bazi&ref=${token}&l=zh-hant`));
    const gj = (await g.json()) as { options: { id: string }[]; current: { dueAt: number; status: string; answered: boolean } };
    expect(gj.options.map((o) => o.id)).toEqual(["3m", "6m", "ye"]); expect(gj.current.status).toBe("pending"); expect(gj.current.answered).toBe(false);
    // cancel
    r = await post({ kind: "bazi", ref: token, cancel: true, email: "self-a@example.com", locale: "zh-hant" });
    expect(r.status).toBe(200);
    expect(selfRevisitOf("bazi", token)!.status).toBe("skipped");
    // the kinds the system sets cannot be set by hand
    expect((await post({ kind: "zeri", ref: "2026-11-03:banjia:abc", option: "3m", email: "self-a@example.com", locale: "zh-hant" })).status).toBe(400);
    expect((await post({ kind: "nianshu", ref: token, option: "3m", email: "self-a@example.com", locale: "zh-hant" })).status).toBe(400);
    // an unpaid or unknown report is nobody's
    expect(sr.selfRefOwned("bazi", "00".repeat(12), { customerId: cid, email: "self-a@example.com" })).toBe(false);
  });

  it("one due row → its own letter; two for one address → one digest; the answer link scores the row; the readings' record leaves them out", async () => {
    const before = outcomeStats();
    resetResultsCache();
    const home = resultsCounts(1);
    const cid = upsertCustomer("self-b@example.com", "zh-hant");
    const t1 = paidReport("self-b@example.com", cid, "cs_self_b1");
    const now = Date.now();
    sr.setSelfRevisit({ kind: "bazi", ref: t1, email: "self-b@example.com", customerId: cid, locale: "zh-hant", dueAt: now - 2 * DAY, hint: "升上主管" });
    let res = await cron("?dry=1");
    let body = (await res.json()) as { results: { status: string; email?: string }[] };
    expect(body.results.filter((x) => x.email === "self-b@example.com").map((x) => x.status)).toEqual(["would_send"]);
    res = await cron();
    body = (await res.json()) as { results: { status: string; email?: string }[] };
    expect(body.results.filter((x) => x.email === "self-b@example.com").map((x) => x.status)).toEqual(["sent"]);
    expect(sent.list.filter((m) => m.to === "self-b@example.com")).toHaveLength(1);
    expect(sent.last!.subject).toBe("八字深度報告，後來怎麼樣了？");
    expect(sent.last!.html).toContain("升上主管"); expect(sent.last!.html).toContain(`/zh-hant/bazi/r/${t1}`);
    expect(sent.last!.html).toContain("報告頁寫著到期回來問你"); expect(sent.last!.html).not.toContain("小回禮");
    expect((sent.last!.html.match(/\/api\/revisit\/outcome\?/g) ?? []).length).toBe(4);
    expect(nsOffense({ a: sent.last!.text.replace(/https?:\S+/g, "") })).toBeNull();
    const row1 = selfRevisitOf("bazi", t1)!;
    expect(row1.status).toBe("sent");

    // the reader taps 「發生了」 → hit, no reward, back to the report
    const url = outcomeUrl("http://localhost", row1.id, "happened", "zh-hant");
    const o = await outcomeGet(new NextRequest(url));
    expect(o.status).toBe(200);
    const html = await o.text();
    expect(html).toContain(`/zh-hant/bazi/r/${t1}`); expect(html).toContain("回看這份報告");
    const after1 = revisitById(row1.id)!;
    expect(after1.outcome).toBe("hit"); expect(after1.event).toBe("happened");
    expect(sr.selfVerdict("stirred")).toBe("partial"); expect(sr.selfVerdict("nothing")).toBe("miss"); expect(sr.selfVerdict("open")).toBe("open");

    // two more due for the same address, a week later (past the day cap) → one digest letter
    const t2 = paidReport("self-b2@example.com", cid, "cs_self_b2"), t3 = paidReport("self-b3@example.com", cid, "cs_self_b3");
    sr.setSelfRevisit({ kind: "bazi", ref: t2, email: "self-b@example.com", customerId: cid, locale: "zh-hant", dueAt: now - DAY, hint: null });
    sr.setSelfRevisit({ kind: "bazi", ref: t3, email: "self-b@example.com", customerId: cid, locale: "zh-hant", dueAt: now - DAY, hint: "搬成了" });
    db().prepare("UPDATE mail_log SET created_at = created_at - ? WHERE email = ?").run(8 * DAY, "self-b@example.com");
    res = await cron();
    body = (await res.json()) as { results: { status: string; email?: string }[] };
    expect(body.results.filter((x) => x.email === "self-b@example.com").map((x) => x.status)).toEqual(["sent_in_2", "sent_in_2"]);
    expect(sent.last!.subject).toContain("2"); expect(sent.last!.html).toContain("搬成了");
    expect((sent.last!.html.match(/\/api\/revisit\/outcome\?/g) ?? []).length).toBe(8);
    expect(selfRevisitOf("bazi", t2)!.status).toBe("sent"); expect(selfRevisitOf("bazi", t3)!.status).toBe("sent");

    // the readings' record and the home page's counts do not count these rows
    expect(outcomeStats().answered).toBe(before.answered); expect(outcomeStats().hit).toBe(before.hit);
    resetResultsCache();
    expect(resultsCounts(2)).toEqual(home);
    // the weekly line does
    const st = selfRevisitStats(now - DAY);
    expect(st.bazi.set).toBeGreaterThanOrEqual(3); expect(st.bazi.sent).toBeGreaterThanOrEqual(3); expect(st.bazi.happened).toBeGreaterThanOrEqual(1);
    // the account list, nearest first, the answer kept
    const mine = selfRevisitsForCustomer(cid);
    expect(mine.map((r) => r.ref)).toContain(t1);
    expect(mine.find((r) => r.ref === t1)!.event).toBe("happened");
  });

  it("擇日: the reminder sets a revisit three days after the day; taking the reminder back takes it too", () => {
    const now = tpe(2026, 10, 22, 9);
    const r = addZeriRemind({ email: "zeri-80@example.com", ymd: "2026-11-03", slug: "banjia", locale: "zh-hant" }, now);
    expect(r.ok && r.token).toBeTruthy();
    const token = (r as { token: string }).token;
    const ref = `2026-11-03:banjia:${token}`;
    const row = selfRevisitOf("zeri", ref)!;
    expect(row.status).toBe("pending"); expect(row.kind).toBe("zeri"); expect(row.email).toBe("zeri-80@example.com");
    expect(row.due_at).toBe(Date.UTC(2026, 10, 6, 4)); // 11/6 noon Taipei
    expect(row.label).toMatch(/^擇日：.+ · 2026-11-03$/); expect(row.hint).toBe("那天的事，辦得順不順？");
    expect(sr.selfReportUrl("https://yaoflow.com", "zeri", ref, "zh")).toBe("https://yaoflow.com/zh/zeri/banjia");
    expect(cancelZeriRemind(token, now + 1000)).toBe(true);
    expect(selfRevisitOf("zeri", ref)!.status).toBe("skipped");
    // ask: false keeps the reminder alone; the page's own cancel reaches the revisit too
    const r2 = addZeriRemind({ email: "zeri-80@example.com", ymd: "2026-11-05", slug: "banjia", locale: "zh", ask: false }, now);
    expect(r2.ok && r2.token).toBeTruthy();
    expect(selfRevisitOf("zeri", `2026-11-05:banjia:${(r2 as { token: string }).token}`)).toBeNull();
    const r3 = addZeriRemind({ email: "zeri-80@example.com", ymd: "2026-11-08", slug: "banjia", locale: "zh" }, now);
    const ref3 = `2026-11-08:banjia:${(r3 as { token: string }).token}`;
    expect(selfRevisitOf("zeri", ref3)!.label).toContain("择日：");
    expect(cancelMyZeriRemind("zeri-80@example.com", "2026-11-08", "banjia", now + 1000)).toBe(true);
    expect(selfRevisitOf("zeri", ref3)!.status).toBe("skipped");
  });

  it("年書: each key month asks two days after it ends, on its own row", () => {
    const months = bookFacts.months!["2026"]!;
    const i = bookFacts.book!.key.pivot;
    const end = keyMonthEndUtc(bookFacts, 2026, i);
    const next = months[i + 1];
    if (next) { const [mm, dd] = next.start.split("/").map(Number); expect(end).toBe(Date.UTC(mm! >= 2 ? 2026 : 2027, mm! - 1, dd!)); } else expect(end).toBe(Date.UTC(2027, 1, 4));
    expect(keyMonthEndUtc(bookFacts, 2026, 11)).toBe(Date.UTC(2027, 1, 4));
    const token = "0123456789abcdef01234567";
    const st = sr.scheduleNianshuRevisit({ token, year: 2026, keyKind: "pivot", term: months[i]!.term, start: months[i]!.start, kindWord: "全年最有動靜的月份", monthEndUtc: end, customerId: null, email: "book-80@example.com", locale: "zh-hant" }, tpe(2026, 10, 22));
    expect(st).toBe("set");
    const row = selfRevisitOf("nianshu", `${token}:pivot`)!;
    expect(row.due_at).toBe(end + 2 * DAY + 4 * 3600_000);
    expect(row.label).toBe(`三合一年書 2026 · ${months[i]!.term}月`); expect(row.hint).toContain("全年最有動靜的月份");
    expect(sr.selfReportUrl("https://yaoflow.com", "nianshu", `${token}:pivot`, "zh-hant")).toBe(`https://yaoflow.com/zh-hant/nianshu/r/${token}`);
    // another key month of the same book is another row; the same one again is kept
    expect(sr.scheduleNianshuRevisit({ token, year: 2026, keyKind: "slow", term: "x", start: "3/6", kindWord: "全年最該放慢的月份", monthEndUtc: end, customerId: null, email: "book-80@example.com", locale: "zh" }, tpe(2026, 10, 22))).toBe("set");
    expect(selfRevisitOf("nianshu", `${token}:slow`)!.label).toBe("三合一年书 2026 · x月");
    expect(sr.scheduleNianshuRevisit({ token, year: 2026, keyKind: "pivot", term: "y", start: "3/6", kindWord: "z", monthEndUtc: end, customerId: null, email: "book-80@example.com", locale: "zh-hant" }, tpe(2026, 10, 23))).toBe("moved");
    // 10-30 进度表 128 ④-5: a 年書 bought on a page in another language is asked about in that language — the month by its
    // first and last day written that language's way, the Korean particle settled
    const t2 = "0123456789abcdef01234568", aprEnd = Date.UTC(2027, 3, 5);
    expect(sr.scheduleNianshuRevisit({ token: t2, year: 2027, keyKind: "slow", term: "驚蟄", start: "3/6", kindWord: "全年最該放慢的月份", monthEndUtc: aprEnd, customerId: null, email: "book-ko@example.com", locale: "ko" }, tpe(2026, 10, 30))).toBe("set");
    const ko = selfRevisitOf("nianshu", `${t2}:slow`)!;
    expect(ko.locale).toBe("ko");
    expect(ko.label).toBe("연간 운세 책 2027 · 3월 6일~4월 4일");
    expect(ko.hint).toContain("가장 속도를 늦춰야 하는 달로");
    expect(ko.hint).not.toMatch(/\(으\)로|[㐀-鿿]/);
    expect(sr.scheduleNianshuRevisit({ token: t2, year: 2027, keyKind: "pivot", term: "清明", start: "4/5", kindWord: "全年最有動靜的月份", monthEndUtc: Date.UTC(2027, 4, 6), customerId: null, email: "book-en@example.com", locale: "en" }, tpe(2026, 10, 30))).toBe("set");
    const en = selfRevisitOf("nianshu", `${t2}:pivot`)!;
    expect(en.label).toBe("Year Book 2027 · Apr 5 – May 5");
    expect(en.hint).toBe("The Year Book marked this month as the month with the most going on this year. It's over now; was it like that?");
    expect(sr.selfKindName("nianshu", "ja")).toBe("年運レポート");
  });

  it("the page block's words in both scripts carry no banned word", () => {
    for (const l of ["zh-hant", "zh"]) {
      const ui = sr.selfRevisitUi(l);
      expect(Object.values(ui).join("")).not.toMatch(/準|准|AI|靈驗|灵验|神明說|神明说/);
    }
    expect(sr.selfRevisitUi("zh").head).toBe("到期回来问你");
    expect(sr.selfKindName("astro", "zh")).toBe("星盘深度报告");
  });

  it("85: a paid deep report gets its default day at once, a rewrite does not, the backfill fills what was missed; a 年書 gets its key months", async () => {
    const now = tpe(2026, 10, 22, 10);
    const cid = upsertCustomer("self-d@example.com", "zh-hant");
    const base = { kind: "deep" as const, locale: "zh-hant", register: null, customerId: cid, email: "self-d@example.com", facts: deepFacts, paid: { session: "cs_self_d", currency: "twd", amountMinor: 0 } };
    const t = createReport(base, now).token;
    const row = selfRevisitOf("bazi", t)!;
    expect(row.status).toBe("pending"); expect(row.customer_id).toBe(cid); expect(row.hint).toBeNull();
    expect(row.due_at - now).toBeGreaterThan(89 * DAY); expect(row.due_at - now).toBeLessThan(93 * DAY);
    // a member's monthly rewrite is the same chart: no second revisit
    const t2 = createReport({ ...base, salt: "rw:2026-11" }, now + 31 * DAY).token;
    expect(t2).not.toBe(t); expect(selfRevisitOf("bazi", t2)).toBeNull();
    // a report paid before the defaults existed: the sweep gives it its day, and still leaves the rewrite alone
    db().prepare("DELETE FROM revisits WHERE session_id = ?").run(`self:bazi:${t}`);
    expect(await sr.backfillSelfRevisits(now)).toBeGreaterThanOrEqual(1);
    expect(selfRevisitOf("bazi", t)!.status).toBe("pending"); expect(selfRevisitOf("bazi", t2)).toBeNull();
    // cancelled stays cancelled
    sr.unsetSelfRevisit("bazi", t);
    await sr.backfillSelfRevisits(now);
    expect(selfRevisitOf("bazi", t)!.status).toBe("skipped");

    // 紫微: the default is the 流月 running now (a row put in by hand: the facts builder needs the chart engine)
    const { ziweiReport } = await import("../src/lib/mingli/ziwei/report");
    ziweiReport("0".repeat(24));
    const zt = "ab".repeat(12);
    db().prepare("INSERT INTO ziwei_reports (token, kind, locale, customer_id, chart_json, input_hash, years, paid_at, email, status, created_at) VALUES (?, 'deep', 'zh', ?, '{}', 'h', '', ?, 'self-d@example.com', 'done', ?)").run(zt, cid, now, now);
    expect(sr.defaultSelfRevisit("ziwei", zt, now)).toBe("set");
    const zr = selfRevisitOf("ziwei", zt)!;
    expect(zr.due_at).toBe(sr.selfDueAt("ziwei", "ly", now)); expect(zr.label).toBe("紫微深度报告");
    expect(sr.defaultSelfRevisit("ziwei", zt, now)).toBe("skip");

    // 年書: each key month not yet over gets its own row at purchase
    const { nianshuReport } = await import("../src/lib/mingli/nianshu/report");
    nianshuReport("0".repeat(24));
    const nt = "cd".repeat(12);
    db().prepare("INSERT INTO nianshu_reports (token, locale, customer_id, year, chart_json, input_hash, paid_at, email, status, created_at) VALUES (?, 'zh-hant', ?, 2026, ?, 'h', ?, 'self-d@example.com', 'done', ?)")
      .run(nt, cid, JSON.stringify({ year: 2026, bazi: bookFacts }), now, now);
    const key = bookFacts.book!.key;
    const expected = (["pivot", "slow", "smooth"] as const).filter((k) => sr.daysAfterNoon(sr.keyMonthEndUtc(bookFacts, 2026, key[k]), 2) >= now + DAY);
    expect(sr.nianshuPurchaseRevisits(nt, now)).toBe(expected.length);
    for (const k of ["pivot", "slow", "smooth"] as const) expect(!!selfRevisitOf("nianshu", `${nt}:${k}`)).toBe(expected.includes(k));
    expect(sr.nianshuPurchaseRevisits(nt, now)).toBe(0); // once
  });

  it("85／89／90: the letters say why they came, show the plan back, and a free cast's letter leads back to a new cast", async () => {
    const { buildSelfRevisitEmail } = await import("../src/lib/email");
    const urls = { hit: "https://x/h", partial: "https://x/p", miss: "https://x/m", open: "https://x/o" };
    const b = buildSelfRevisitEmail({ locale: "zh-hant", kind: "bazi", label: "八字深度報告", hint: null, plan: "先把手上的案子收尾", reportUrl: "https://x/r", castUrl: "https://x/c", outcomeUrls: urls });
    expect(b.html).toContain("你買了這份報告"); expect(b.html).toContain("你當時打算：先把手上的案子收尾"); expect(b.html).toContain("回看這份報告");
    const c = buildSelfRevisitEmail({ locale: "zh", kind: "cast", label: "「他会先联络吗」 · 泽水困", hint: "他先传讯息", plan: null, reportUrl: "https://x/cast", castUrl: "https://x/c", outcomeUrls: urls });
    expect(c.html).toContain("再起一卦"); expect(c.html).toContain("你起卦后选了"); expect(c.html).not.toContain("你当时打算");
    for (const m of [b, c]) expect(nsOffense({ a: m.text.replace(/https?:\S+/g, "") })).toBeNull();
  });
});
