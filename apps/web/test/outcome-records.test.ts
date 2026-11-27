import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { LineValue } from "@yaoflow/engine";
import { db, hideCase, recordOrder, saveCast, saveReading, scheduleRevisit, setRevisitOutcome, unpublishCase, upsertCustomer } from "../src/lib/db";
import { publishCase } from "../src/lib/cases";
import { resolveServerChart } from "../src/lib/reading";
import { allRecords, outcomePreview, outcomeRecords, recordsForPage } from "../src/lib/outcome-records";
import OutcomeRecords from "../src/components/OutcomeRecords";

const V: LineValue[] = [7, 8, 9, 8, 7, 8];
const AT = Date.UTC(2026, 8, 20, 3);
const prev = process.env.SHOW_OUTCOME_RECORDS;
afterEach(() => { process.env.SHOW_OUTCOME_RECORDS = prev; });

/** a paid full reading, its revisit, and (optionally) its publication as a case — the reader's answer set by hand */
function reading(sid: string, email: string, opts: { publish?: boolean; outcome?: "hit" | "miss" | "open" | "partial"; reportedAt?: number; locale?: string; framing?: string | null } = {}) {
  const locale = opts.locale ?? "zh-hant";
  const cid = upsertCustomer(email, locale);
  const question = "這份合約這個月能簽下來嗎";
  const chart = resolveServerChart({ question, values: V, castAtMs: AT, tzOffsetMinutes: 480 }, true) as unknown as Record<string, unknown>;
  const castId = saveCast({ customerId: cid, castAtMs: AT, tzOffsetMinutes: 480, locale, question, topic: "career", values: V, chart });
  saveReading(castId, cid, "deep", locale, { verdict: { zh: "能簽，但要讓一步。" }, tendency: { zh: "先緊後鬆。" }, timing: { zh: "10月4日到8日之間會有回覆。之後就淡了。" }, basis: { zh: "x" }, strategy: { zh: "x" }, caution: { zh: "x" }, next_step: { zh: "x" }, closing: { zh: "x" } } as never);
  recordOrder({ sessionId: sid, customerId: cid, castId, tier: "deep", amountCents: 999, currency: "USD", email, status: "paid" });
  scheduleRevisit({ sessionId: sid, castId, customerId: cid, email, locale, tier: "deep", castAtMs: AT, windowDays: 14, timingQuote: "10月4日到8日之間" });
  if (opts.publish !== false) expect(publishCase(sid, opts.framing ?? null, cid).ok).toBe(true);
  const rid = (db().prepare("SELECT id FROM revisits WHERE session_id = ?").get(sid) as { id: number }).id;
  if (opts.outcome) {
    setRevisitOutcome(rid, opts.outcome);
    if (opts.reportedAt) db().prepare("UPDATE revisits SET outcome_at = ? WHERE id = ?").run(opts.reportedAt, rid);
  }
  return { cid, castId };
}

const ids = (rs: { publicId: string }[]) => rs.map((r) => r.publicId);
const pid = (sid: string) => (db().prepare("SELECT public_id FROM cases WHERE session_id = ?").get(sid) as { public_id: string }).public_id;

/** 进度表 28 (10-02): 匿名應驗紀錄 — only published cases, 應了 and 沒應 alike, nothing while the switch is off */
describe("匿名應驗紀錄", () => {
  it("lists every answer of a published case — 應了、沒應、部分 alike (10-14 进度表 45) — newest report first; never a private reading", () => {
    reading("cs_or_hit", "or-hit@example.com", { outcome: "hit", reportedAt: Date.UTC(2026, 9, 9), framing: "合約這個月簽得下來嗎" });
    reading("cs_or_miss", "or-miss@example.com", { outcome: "miss", reportedAt: Date.UTC(2026, 9, 10) });
    reading("cs_or_wait", "or-wait@example.com", { outcome: "partial" });
    reading("cs_or_private", "or-private@example.com", { publish: false, outcome: "hit", reportedAt: Date.UTC(2026, 9, 11) });
    const rs = outcomeRecords({ locale: "zh-hant", limit: 10 });
    expect(ids(rs)).toEqual([pid("cs_or_wait"), pid("cs_or_miss"), pid("cs_or_hit")]);
    expect(rs.map((r) => r.state)).toEqual(["partial", "miss", "hit"]);
    const hit = rs[2]!;
    expect(hit.framing).toBe("合約這個月簽得下來嗎");
    expect(hit.window).toBe("10月4日到8日之間會有回覆。");
    expect(hit.reportedAt).toBe(Date.UTC(2026, 9, 9));
    // 10-14: the partial one is listed too (it used to wait), as 部分
    expect(allRecords().some((r) => r.publicId === pid("cs_or_wait") && r.state === "partial")).toBe(true);
    // no address, no session, no customer, no casting time in a record
    for (const r of allRecords()) {
      const keys = Object.keys(r).join(" ");
      expect(keys).not.toMatch(/email|session|customer|cast_?at/i);
      expect(JSON.stringify(r)).not.toContain("@example.com");
    }
  });

  it("a withdrawn or hidden case, or one of ours, is gone from the records", () => {
    reading("cs_or_gone", "or-gone@example.com", { outcome: "hit", reportedAt: Date.UTC(2026, 9, 12) });
    reading("cs_or_hidden", "or-hidden@example.com", { outcome: "miss", reportedAt: Date.UTC(2026, 9, 12) });
    const { cid } = reading("cs_or_ours", "or-ours@example.com", { outcome: "hit", reportedAt: Date.UTC(2026, 9, 12) });
    const gone = pid("cs_or_gone"), hidden = pid("cs_or_hidden"), ours = pid("cs_or_ours");
    expect(ids(outcomeRecords({ locale: "zh-hant", limit: 50 }))).toEqual(expect.arrayContaining([gone, hidden, ours]));
    unpublishCase("cs_or_gone");
    hideCase(hidden);
    db().prepare("UPDATE customers SET test_flag = 1 WHERE id = ?").run(cid);
    const after = ids(outcomeRecords({ locale: "zh-hant", limit: 50 }));
    expect(after).not.toContain(gone);
    expect(after).not.toContain(hidden);
    expect(after).not.toContain(ours);
  });

  it("by hexagram (primary or changed), by language, and the admin preview counts both figures", () => {
    reading("cs_or_en", "or-en@example.com", { outcome: "hit", reportedAt: Date.UTC(2026, 9, 13), locale: "en" });
    const r = outcomeRecords({ locale: "en", limit: 5 })[0]!;
    expect(outcomeRecords({ locale: "en", hex: r.primary })).toHaveLength(1);
    if (r.changed) expect(outcomeRecords({ locale: "en", hex: r.changed })).toHaveLength(1);
    expect(outcomeRecords({ locale: "en", hex: 64 === r.primary || 64 === r.changed ? 63 : 64 })).toHaveLength(0);
    expect(outcomeRecords({ locale: "en", excludePublicId: r.publicId })).toHaveLength(0);
    const p = outcomePreview().find((h) => h.hex === r.primary)!;
    expect(p.hit).toBeGreaterThanOrEqual(1);
    expect(p.shown.length).toBeGreaterThanOrEqual(1);
  });

  it("switch off: pages get nothing and render nothing; on: they render the records", () => {
    process.env.SHOW_OUTCOME_RECORDS = "";
    expect(recordsForPage({ locale: "zh-hant", limit: 5 })).toEqual([]);
    const off = renderToStaticMarkup(createElement(OutcomeRecords, { records: recordsForPage({ locale: "zh-hant" }), l: "zh-hant", title: "這一卦的應驗紀錄" }));
    expect(off).toBe("");
    process.env.SHOW_OUTCOME_RECORDS = "1";
    const recs = recordsForPage({ locale: "zh-hant", limit: 5 });
    expect(recs.length).toBeGreaterThan(0);
    const on = renderToStaticMarkup(createElement(OutcomeRecords, { records: recs, l: "zh-hant", title: "這一卦的應驗紀錄" }));
    expect(on).toContain("這一卦的應驗紀錄");
    expect(on).toContain("應驗了");
    expect(on).toContain("沒有應驗");
    expect(on).not.toMatch(/%|準確|accura/i);
    expect(on).not.toContain("@");
  });
});

describe("10-12 部分 / 不算对错 → 10-14 全部列出", () => {
  it("are their own states, never counted as pending", async () => {
    const { toRecord } = await import("../src/lib/outcome-records");
    const base = { public_id: "p1", locale: "zh-hant", tier: "deep", topic: null, framing: null, fields_json: JSON.stringify({ timing: "十月中旬有動靜。" }), published_at: 1, primary_num: 1, changed_num: null, window_days: 3, timing_quote: null, outcome_at: 5 };
    expect(toRecord({ ...base, outcome: "partial" }).state).toBe("partial");
    expect(toRecord({ ...base, outcome: "unclear" }).state).toBe("unclear");
    expect(toRecord({ ...base, outcome: "open" }).state).toBe("open");
    expect(toRecord({ ...base, outcome: null }).state).toBe("pending");
    expect(toRecord({ ...base, outcome: "unclear" }).reportedAt).toBe(5);
  });
});

describe("10-14 進度表 45 應驗紀錄總頁", () => {
  it("counts are raw numbers that match the list, and a withdrawal takes one off both", async () => {
    const { outcomeTotals, allAnswered } = await import("../src/lib/outcome-records");
    process.env.SHOW_OUTCOME_RECORDS = "1";
    reading("cs_tot_open", "tot-open@example.com", { outcome: "open", reportedAt: Date.UTC(2026, 9, 13), locale: "zh" });
    reading("cs_tot_hit", "tot-hit@example.com", { outcome: "hit", reportedAt: Date.UTC(2026, 9, 12), locale: "zh" });
    reading("cs_tot_none", "tot-none@example.com", { locale: "zh" });
    const t = outcomeTotals("zh");
    const list = allAnswered("zh");
    expect(t.reported).toBe(list.length);
    expect(t.hit + t.partial + t.miss + t.open + t.unclear).toBe(t.reported);
    expect(t.open).toBeGreaterThanOrEqual(1);
    expect(list.some((r) => r.state === "open")).toBe(true);
    expect(list.some((r) => r.publicId === pid("cs_tot_none"))).toBe(false); // no answer, no line
    unpublishCase("cs_tot_hit");
    const after = outcomeTotals("zh");
    expect(after.reported).toBe(t.reported - 1);
    expect(allAnswered("zh")).toHaveLength(list.length - 1);
    process.env.SHOW_OUTCOME_RECORDS = "";
    expect(allAnswered("zh")).toEqual([]);
  });

  it("10-23 进度表 104 ②: a closed window whose letter still waits is 已到期待問, not 應期未到; the parts add up to the due count", async () => {
    const { outcomeTotals, toRecord } = await import("../src/lib/outcome-records");
    const base = { public_id: "q1", locale: "zh", tier: "deep", topic: null, framing: null, fields_json: JSON.stringify({ timing: "十月中旬有動靜。" }), published_at: 1, primary_num: 1, changed_num: null, window_days: 3, timing_quote: null, outcome: null, outcome_at: null };
    const NOW = Date.UTC(2026, 9, 23);
    const queued = toRecord({ ...base, revisit_status: "pending", due_at: NOW - 86_400_000 }, NOW);
    expect(queued).toMatchObject({ due: true, queued: true, state: "pending" });
    expect(toRecord({ ...base, revisit_status: "pending", due_at: NOW + 86_400_000 }, NOW)).toMatchObject({ due: false, queued: false });
    expect(toRecord({ ...base, revisit_status: "sent", due_at: NOW - 86_400_000 }, NOW)).toMatchObject({ due: true, queued: false });
    expect(toRecord({ ...base, revisit_status: "skipped", due_at: NOW - 30 * 86_400_000 }, NOW)).toMatchObject({ due: true, queued: false });
    expect(toRecord({ ...base, revisit_status: "pending", due_at: NOW - 86_400_000, outcome: "hit", outcome_at: NOW }, NOW)).toMatchObject({ due: true, queued: false, state: "hit" });
    // the page's counts, from the database: a queued one moves from 應期未到 to 已到期待問
    reading("cs_tot_queued", "tot-queued@example.com", { locale: "zh" });
    db().prepare("UPDATE revisits SET due_at = ? WHERE session_id = 'cs_tot_queued'").run(Date.now() + 86_400_000);
    const t0 = outcomeTotals("zh");
    expect(t0.hit + t0.partial + t0.miss + t0.open + t0.unclear + t0.notReported + t0.queued).toBe(t0.due);
    db().prepare("UPDATE revisits SET due_at = ? WHERE session_id = 'cs_tot_queued'").run(Date.now() - 86_400_000);
    const t1 = outcomeTotals("zh");
    expect(t1.queued - t0.queued).toBe(1);
    expect(t1.waiting - t0.waiting).toBe(-1);
    expect(t1.notReported).toBe(t0.notReported);
    expect(t1.hit + t1.partial + t1.miss + t1.open + t1.unclear + t1.notReported + t1.queued).toBe(t1.due);
  });

  it("10-23 应验记录: the back office counts with /outcomes' own function — per language, both pages added up, and per hexagram", async () => {
    const { allRecords, outcomeTotals, outcomePreview, tallyRecords } = await import("../src/lib/outcome-records");
    const { publicTotals } = await import("../src/app/admin/outcome-site");
    reading("cs_adm_open", "adm-open@example.com", { outcome: "open", reportedAt: Date.UTC(2026, 9, 20), locale: "zh-hant" });
    const records = allRecords();
    for (const l of ["zh", "zh-hant"]) expect(outcomeTotals(l, records)).toEqual(tallyRecords(records.filter((r) => r.locale === l)));
    const both = publicTotals(records);
    const [a, b] = [outcomeTotals("zh-hant", records), outcomeTotals("zh", records)];
    for (const k of Object.keys(both) as (keyof typeof both)[]) expect(both[k]).toBe(a[k] + b[k]);
    // a hexagram's line uses the same words: an answered 「還沒定」 is 还没定, never folded into an unanswered count
    const r = records.find((x) => x.publicId === pid("cs_adm_open"))!;
    const h = outcomePreview(records).find((x) => x.hex === r.primary)!;
    expect(h).toMatchObject(tallyRecords(records.filter((x) => x.primary === r.primary || x.changed === r.primary)));
    expect(h.open).toBeGreaterThanOrEqual(1);
    expect(h).not.toHaveProperty("pending");
  });
});
