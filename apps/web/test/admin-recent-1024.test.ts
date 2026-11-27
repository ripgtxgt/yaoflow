import { describe, expect, it } from "vitest";

/**
 * 10-24 (Neil 圈着看板「最近的解读」：「应该把用户所有的解读都放进去吧，包括各类产品的使用」): the list reads every product,
 * not only the I Ching orders — tarot (free draws too), 解籤, 求籤, 擲筊 (one row per question), the reports (a 年書's
 * own parts stay the 年書), 命盘问答 — with how each was had (付费／通卡／会员／免费) and what was drawn.
 */
const { db, upsertCustomer, upsertSubscription } = await import("../src/lib/db");
const { recentOtherProducts, recentCounts, isRecentKind } = await import("../src/lib/admin-recent");
const { linkBrowser } = await import("../src/lib/browsers");

const NOW = Date.now();
const MIN = 60_000;
const DAY = 86_400_000;

function tables() {
  const d = db();
  d.exec(`
    CREATE TABLE IF NOT EXISTS tarot_draws (token TEXT PRIMARY KEY, created_at INTEGER NOT NULL, locale TEXT NOT NULL, bid TEXT, customer_id INTEGER, question TEXT NOT NULL, qkey TEXT, spread INTEGER NOT NULL,
      cards_json TEXT NOT NULL, register TEXT, paid_at INTEGER, paid_session TEXT, email TEXT, currency TEXT, amount_minor INTEGER, personal_json TEXT, followup_q TEXT, followup_json TEXT, followup_at INTEGER,
      revisit_days INTEGER, outcome_def TEXT, revisit_due INTEGER, revisit_sent_at INTEGER, revisit_answer TEXT, revisit_answer_at INTEGER, public_ok INTEGER, cast_id INTEGER, matter_id INTEGER, plan TEXT);
    CREATE TABLE IF NOT EXISTS qiuqian_draws (token TEXT PRIMARY KEY, created_at INTEGER NOT NULL, locale TEXT NOT NULL, bid TEXT, customer_id INTEGER, temple TEXT, set_id TEXT, num INTEGER, asks INTEGER, redraws INTEGER, question TEXT);
    CREATE TABLE IF NOT EXISTS jiaobei_asks (token TEXT PRIMARY KEY, created_at INTEGER NOT NULL, locale TEXT, bid TEXT, customer_id INTEGER, question TEXT, rule INTEGER, seq TEXT, sign TEXT, cast_id INTEGER, matter_id INTEGER);
    CREATE TABLE IF NOT EXISTS bazi_reports (token TEXT PRIMARY KEY, kind TEXT NOT NULL, locale TEXT NOT NULL, register TEXT, customer_id INTEGER, chart_json TEXT, input_hash TEXT, years TEXT, paid_at INTEGER, paid_session TEXT,
      email TEXT, currency TEXT, amount_minor INTEGER, body_json TEXT, status TEXT, lease_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER, question TEXT);
    CREATE TABLE IF NOT EXISTS nianshu_reports (token TEXT PRIMARY KEY, locale TEXT NOT NULL, register TEXT, customer_id INTEGER, year INTEGER NOT NULL, chart_json TEXT, input_hash TEXT, bazi_token TEXT, ziwei_token TEXT,
      astro_token TEXT, paid_at INTEGER, paid_session TEXT, email TEXT, currency TEXT, amount_minor INTEGER, body_json TEXT, status TEXT, lease_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER, question TEXT);
    CREATE TABLE IF NOT EXISTS mingli_qa (id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER, bid TEXT, system TEXT NOT NULL, chart_hash TEXT, locale TEXT, question TEXT NOT NULL, answer TEXT, cast INTEGER, at INTEGER NOT NULL);
  `);
}

describe("看板「最近的解读」：全部产品", () => {
  it("every product is read, newest first, with how it was had and what was drawn", () => {
    tables();
    const d = db();
    const cid = upsertCustomer("recent1024@reader1024.net", "zh-hant");
    upsertSubscription({ customerId: cid, stripeCustomerId: null, stripeSubscriptionId: "pass_recent1024", status: "active", plan: "month", periodStart: NOW - DAY, periodEnd: NOW + DAY, cancelAtPeriodEnd: true, passDays: 1 });
    const passRow = (d.prepare("SELECT id FROM subscriptions WHERE stripe_subscription_id = 'pass_recent1024'").get() as { id: number }).id;

    d.prepare("INSERT INTO tarot_draws (token, created_at, locale, customer_id, question, spread, cards_json) VALUES (?,?,?,?,?,?,?)")
      .run("t-free", NOW - 50 * MIN, "zh-hant", cid, "他會回來嗎", 1, JSON.stringify([{ id: "major-00", rev: false }]));
    d.prepare("INSERT INTO tarot_draws (token, created_at, locale, customer_id, question, spread, cards_json, paid_at, paid_session, personal_json, followup_q) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .run("t-pass", NOW - 40 * MIN, "zh-hant", cid, "工作要換嗎", 3, JSON.stringify([{ id: "major-00", rev: false }, { id: "major-07", rev: true }, { id: "major-21", rev: false }]), NOW - 39 * MIN, `member:${passRow}`, "{}", "那下個月呢");
    d.prepare("INSERT INTO qian_draws (token, set_name, num, situation, question, locale, created_at, customer_id, paid_at, paid_session, amount_minor, currency, personal_json, personal_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .run("q-paid", "liushi-jiazi", 23, "love", "這段感情", "zh-hant", NOW - 30 * MIN, cid, NOW - 29 * MIN, "cs_test_q", 9900, "twd", "{}", NOW - 28 * MIN);
    d.prepare("INSERT INTO qiuqian_draws (token, created_at, locale, customer_id, temple, set_id, num, asks, redraws, question) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run("qq-1", NOW - 20 * MIN, "zh-hant", cid, "other", "guandi", 12, 3, 1, "考試會過嗎");
    for (const [i, seq] of ["y", "x", "s"].entries()) {
      d.prepare("INSERT INTO jiaobei_asks (token, created_at, locale, customer_id, question, rule, seq, sign) VALUES (?,?,?,?,?,?,?,?)")
        .run(`jb-${i}`, NOW - (15 - i) * MIN, "zh-hant", cid, "要不要搬家", 1, seq, i === 2 ? "sheng" : null);
    }
    d.prepare("INSERT INTO bazi_reports (token, kind, locale, customer_id, chart_json, paid_at, paid_session, body_json, status, created_at, question) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .run("b-deep", "deep", "zh-hant", cid, JSON.stringify({ gender: "f", dayMaster: "庚", dmEl: "金", pillars: [] }), NOW - 10 * MIN, `member:${passRow}`, "{}", "done", NOW - 10 * MIN, "明年事業");
    d.prepare("INSERT INTO bazi_reports (token, kind, locale, customer_id, chart_json, paid_at, paid_session, body_json, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run("b-child", "deep", "zh-hant", cid, JSON.stringify({ dayMaster: "甲", dmEl: "木" }), NOW - 8 * MIN, "nianshu:n-1", "{}", "done", NOW - 8 * MIN);
    d.prepare("INSERT INTO nianshu_reports (token, locale, customer_id, year, bazi_token, paid_at, paid_session, amount_minor, currency, body_json, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
      .run("n-1", "zh-hant", cid, 2027, "b-child", NOW - 8 * MIN, "cs_test_n", 89000, "twd", null, "writing", NOW - 8 * MIN);
    d.prepare("INSERT INTO mingli_qa (customer_id, system, locale, question, answer, at) VALUES (?,?,?,?,?,?)").run(cid, "ziwei", "zh-hant", "我適合什麼工作", "…", NOW - 5 * MIN);

    const rows = recentOtherProducts(NOW - DAY, 50);
    const by = (k: string) => rows.find((r) => r.key === k)!;
    expect(rows.map((r) => r.kind)).toEqual(["qa", "nianshu", "bazi", "jiaobei", "qiuqian", "qian", "tarot", "tarot"]);
    expect(by("tarot:t-free")).toMatchObject({ tier: "免费抽牌（单张）", how: "免费", followups: 0 });
    expect(by("tarot:t-pass")).toMatchObject({ tier: "个人解读", how: "通卡", followups: 1 });
    expect(by("tarot:t-pass").detail).toContain("逆");
    expect(by("qian:q-paid")).toMatchObject({ tier: "个人解读", how: "付费 NT$99" });
    expect(by("qian:q-paid").detail).toContain("第 23 ");
    expect(by("qiuqian:qq-1").detail).toContain("重抽 1 次");
    expect(by("jiaobei:jb-2")).toMatchObject({ tier: "当天擲了 3 回", text: "要不要搬家" });
    expect(by("jiaobei:jb-2").detail).toContain("聖筊");
    expect(by("bazi:b-deep")).toMatchObject({ tier: "深度报告", how: "通卡", text: "问：明年事業", detail: "庚金日主" });
    expect(rows.some((r) => r.key === "bazi:b-child")).toBe(false); // the 年書's own part is the 年書
    expect(by("nianshu:n-1")).toMatchObject({ tier: "2027 年书 · 还在写", how: "付费 NT$890", detail: "甲木日主" });
    expect(by("qa:1")).toMatchObject({ tier: "问紫微盘", text: "我適合什麼工作" });
    expect(rows.every((r) => r.email === "recent1024@reader1024.net")).toBe(true);

    expect(recentOtherProducts(NOW - DAY, 50, ["tarot"]).map((r) => r.key)).toEqual(["tarot:t-pass", "tarot:t-free"]);
    expect(recentOtherProducts(NOW - DAY, 2).length).toBe(2);
    const c = recentCounts(NOW - DAY);
    expect(c).toMatchObject({ tarot: 2, qian: 1, qiuqian: 1, jiaobei: 3, bazi: 1, nianshu: 1, qa: 1, zhengyuan: 0, hepan: 0 });
    expect(isRecentKind("tarot")).toBe(true);
    expect(isRecentKind("nope")).toBe(false);
  });

  // 10-24 (Neil: 「为什么会有匿名呢」): the free tools need no account — a browser that signed in reads as that person,
  // one that never did reads as its browser; 命盘问答 says what it was had through
  it("a row without an account is its browser's account, else 没登录 with the browser", () => {
    tables();
    const d = db();
    const since = NOW + 10 * MIN; // after the rows above
    const cid = upsertCustomer("anon1024@reader1024.net", "zh");
    linkBrowser("b1024known", cid, "login", NOW + 30 * MIN);
    d.prepare("INSERT INTO jiaobei_asks (token, created_at, locale, bid, question, rule, seq, sign) VALUES (?,?,?,?,?,?,?,?)")
      .run("jb-anon-known", NOW + 20 * MIN, "zh", "b1024known", "要不要换工作", 1, "s", "sheng");
    d.prepare("INSERT INTO jiaobei_asks (token, created_at, locale, bid, question, rule, seq, sign) VALUES (?,?,?,?,?,?,?,?)")
      .run("jb-anon-none", NOW + 21 * MIN, "zh", "zz99never", "他喜欢我吗", 1, "y", null);
    d.prepare("INSERT INTO tarot_draws (token, created_at, locale, bid, question, spread, cards_json) VALUES (?,?,?,?,?,?,?)")
      .run("t-anon", NOW + 22 * MIN, "zh", "zz99never", "下个月", 1, JSON.stringify([{ id: "major-01", rev: false }]));
    d.prepare("INSERT INTO mingli_qa (customer_id, bid, system, locale, question, answer, at) VALUES (?,?,?,?,?,?,?)").run(null, "b1024known", "bazi", "zh", "我适合创业吗", "…", NOW + 23 * MIN);
    d.prepare("INSERT INTO mingli_qa (customer_id, bid, system, locale, question, answer, at) VALUES (?,?,?,?,?,?,?)").run(cid, "b1024known", "bazi", "zh", "那明年呢", "…", NOW + 24 * MIN);

    const rows = recentOtherProducts(since, 50);
    const by = (k: string) => rows.find((r) => r.key === k)!;
    expect(by("jiaobei:jb-anon-known")).toMatchObject({ customerId: cid, email: "anon1024@reader1024.net", viaBrowser: true, browser: null });
    expect(by("jiaobei:jb-anon-none")).toMatchObject({ customerId: null, email: null, viaBrowser: false, browser: "zz99" });
    expect(by("tarot:t-anon")).toMatchObject({ customerId: null, viaBrowser: false, browser: "zz99" });
    const qa = rows.filter((r) => r.kind === "qa");
    expect(qa.map((r) => [r.text, r.customerId, r.viaBrowser, r.how])).toEqual([
      ["那明年呢", cid, false, "免费"],
      ["我适合创业吗", cid, true, "免费"],
    ]);
  });

  it("命盘问答 asked under a running 通卡 reads 通卡", () => {
    tables();
    const d = db();
    const cid = upsertCustomer("qa-pass1024@reader1024.net", "zh");
    upsertSubscription({ customerId: cid, stripeCustomerId: null, stripeSubscriptionId: "pass_qa1024", status: "active", plan: "month", periodStart: NOW + 40 * MIN, periodEnd: NOW + DAY, cancelAtPeriodEnd: true, passDays: 1 });
    d.prepare("INSERT INTO mingli_qa (customer_id, system, locale, question, answer, at) VALUES (?,?,?,?,?,?)").run(cid, "ziwei", "zh", "通卡里问的", "…", NOW + 45 * MIN);
    d.prepare("INSERT INTO mingli_qa (customer_id, system, locale, question, answer, at) VALUES (?,?,?,?,?,?)").run(cid, "ziwei", "zh", "通卡之前问的", "…", NOW + 35 * MIN);
    d.prepare("INSERT INTO mingli_qa (customer_id, system, locale, question, answer, at) VALUES (?,?,?,?,?,?)").run(cid, "astro", "zh", "星盘问的", "…", NOW + 36 * MIN);
    const qa = recentOtherProducts(NOW + 30 * MIN, 50, ["qa"]).filter((r) => r.customerId === cid);
    expect(qa.map((r) => [r.text, r.how, r.tier])).toEqual([
      ["通卡里问的", "通卡", "问紫微盘"], ["星盘问的", "免费", "问星盘"], ["通卡之前问的", "免费", "问紫微盘"],
    ]);
  });
});
