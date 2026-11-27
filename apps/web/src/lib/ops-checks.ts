import { db, recordOps } from "./db";
import { ownerRecipients, sendEmail } from "./email";
import { customerBalance, subscriptionInvoicesSince } from "./stripe";
import { formatMoney, isCurrency } from "./money";
import { homeMinute } from "./clock";
import { readEventsBetween } from "./analytics-server";

/**
 * 10-23 定时核对 (Neil: 「要，你看看怎么建在线的 cron」): checks that have to happen on a given day, run by the server —
 * not by a session on someone's computer. Each check is code with a due time (台北); the hourly cron
 * (`api/admin/checks/run`) runs the ones that are due and not yet done, keeps the result (table ops_checks, plus one
 * ops_events line `ops_check`) and mails it to the owner — once per check. A check that finds nothing to look at yet
 * (the invoice is not out) says `retry` and is tried again the next hour, until a day after it was due.
 * A new check = a new entry in OPS_CHECKS. `?dry=1` runs everything now, keeps nothing, sends nothing.
 */

/** `retry`: nothing to judge yet (the invoice is not out, or not paid yet) — try again next hour; `lines` are what was seen */
export type CheckResult = { ok: boolean; lines: string[] } | { retry: string; lines?: string[] };
/** `dry`: a `?dry=1` look — a check that would send something (112's test letters) says what it would send instead */
export interface OpsCheck { id: string; title: string; due: number; run: (o: { dry: boolean }) => Promise<CheckResult> }

const H = 3_600_000;
/** 台北 wall time → epoch ms */
const tpe = (isoMinute: string) => Date.parse(`${isoMinute}:00+08:00`);
const money = (cur: string, minor: number) => {
  const c = cur.toUpperCase();
  return isCurrency(c) ? formatMoney(c, minor, "zh") : `${c} ${minor}`;
};

/**
 * 进度表 102: a member whose unused pack went onto their Stripe balance — their first renewal after that must be billed
 * the fee less the credit. Looks at the first `subscription_cycle` invoice made since the conversion.
 */
export async function packCreditInvoice(customerId: number, expectDue: number): Promise<CheckResult> {
  const d = db();
  const pack = d.prepare("SELECT converted_at AS at, converted_minor AS minor, currency FROM member_packs WHERE customer_id = ? AND converted_how = 'balance' ORDER BY converted_at DESC LIMIT 1")
    .get(customerId) as { at: number; minor: number; currency: string } | undefined;
  if (!pack) return { ok: false, lines: [`客户 ${customerId} 没有折算记录（member_packs.converted_how = balance）`] };
  const sub = d.prepare("SELECT stripe_customer_id AS cus, stripe_subscription_id AS sid, status, cancel_at_period_end AS capd FROM subscriptions WHERE customer_id = ? AND stripe_subscription_id LIKE 'sub_%' ORDER BY id DESC LIMIT 1")
    .get(customerId) as { cus: string | null; sid: string; status: string; capd: number } | undefined;
  if (!sub) return { ok: false, lines: [`客户 ${customerId} 找不到会员订阅`] };
  const invs = (await subscriptionInvoicesSince(sub.sid, pack.at / 1000)).filter((i) => i.billingReason === "subscription_cycle").sort((a, b) => a.created - b.created);
  const inv = invs[0];
  if (!inv) return { retry: "续费帐单还没出来" };
  if (inv.status === "draft") return { retry: "续费帐单还是草稿（Stripe 约一小时后定稿扣款）" };
  const lines = [
    `续费帐单 ${homeMinute(inv.created)}：月费 ${money(inv.currency, inv.total)}，余额抵 ${money(inv.currency, -inv.startingBalance)}，应付 ${money(inv.currency, inv.amountDue)}，已付 ${money(inv.currency, inv.amountPaid)}（${inv.status}）`,
    `预期应付 ${money(inv.currency, expectDue)}（折算 ${money(pack.currency, pack.minor)}，${homeMinute(pack.at)}）`,
  ];
  if (sub.cus) {
    try {
      const b = await customerBalance(sub.cus);
      lines.push(b.balance < 0 ? `Stripe 余额还剩 ${money(b.currency ?? inv.currency, -b.balance)}，抵之后的帐单` : "Stripe 余额已抵完");
    } catch { /* the invoice line is what matters */ }
  }
  if (sub.status !== "active" || sub.capd) lines.push(`注意：订阅现在是 ${sub.status}${sub.capd ? "、已关续订" : ""}——没抵完的余额要原路退回`);
  // finalized but not paid yet: Stripe retries the card — look again next hour (the amounts are already final)
  if (inv.status === "open" && inv.amountDue > 0) return { retry: "帐单已定稿、还没付成（Stripe 会再扣几次）", lines };
  return { ok: inv.amountDue === expectDue && (inv.status === "paid" || inv.amountDue === 0), lines };
}

/**
 * 进度表 101 ⑤: with the 通卡 open, a light or full reading is not sold on its own — so from the 101 release on, paid
 * orders of tier one/deep through Stripe should be none. Also counts the 410s (stale pages that still asked for one).
 */
export async function singleSalesSince(since: number, now = Date.now()): Promise<CheckResult> {
  const d = db();
  const rows = d.prepare(
    `SELECT o.id, o.customer_id AS cid, o.tier, o.amount_cents AS minor, UPPER(COALESCE(o.currency,'USD')) AS cur, o.created_at AS at
       FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
      WHERE o.created_at >= ? AND o.created_at < ? AND o.tier IN ('deep','one') AND COALESCE(o.amount_cents,0) > 0
        AND (o.session_id LIKE 'cs_%' OR o.session_id LIKE 'pi_%')
        AND (o.payment_state IN ('paid','refunded','disputed') OR (o.payment_state IS NULL AND o.status = 'paid'))
        AND COALESCE(c.test_flag,0) = 0
      ORDER BY o.created_at`,
  ).all(since, now) as { id: number; cid: number | null; tier: string; minor: number; cur: string; at: number }[];
  const retired = (d.prepare("SELECT COUNT(*) AS n FROM ops_events WHERE kind = 'single_retired' AND at >= ? AND at < ?").get(since, now) as { n: number }).n;
  const lines = [
    `${homeMinute(since)} → ${homeMinute(now)}：不带通卡的轻解读／深断单买 ${rows.length} 单`,
    ...rows.map((r) => `· 订单 #${r.id} 客户 ${r.cid ?? "—"} ${r.tier === "deep" ? "深断" : "轻解读"} ${money(r.cur, r.minor)} ${homeMinute(r.at)}`),
    `同期被挡下（410，旧页面或旧链接还想单买）${retired} 次`,
  ];
  return { ok: rows.length === 0, lines };
}


/**
 * 进度表 131 (10-31): casting needs no account and the free line is gone — two weeks on, the four ratios against 10-26→31
 * (visitors → cast 30% / → price seen 23% / payments per visitor 2.4%; before the login wall 3.4%). Pass = payments per
 * visitor back to 3.4% or more; under 2.4% the numbers go to Neil to decide whether some free content comes back.
 */
export function funnel131(since: number, until: number): { visitors: number; cast: number; price: number; paid: number } {
  const ev = readEventsBetween(since, until);
  const by = (pred: (e: { e: string }) => boolean) => new Set(ev.filter((e) => e.b && pred(e)).map((e) => e.b!)).size;
  const visitors = by((e) => e.e === "page_view");
  const cast = by((e) => e.e === "cast_complete");
  const price = by((e) => e.e === "price_seen");
  const paid = (db().prepare(
    `SELECT COUNT(*) AS n FROM orders o LEFT JOIN customers c ON c.id = o.customer_id
      WHERE o.created_at >= ? AND o.created_at < ? AND COALESCE(o.amount_cents,0) > 0
        AND (o.payment_state IN ('paid','refunded','disputed') OR (o.payment_state IS NULL AND o.status = 'paid')) AND COALESCE(c.test_flag,0) = 0`,
  ).get(since, until) as { n: number }).n;
  return { visitors, cast, price, paid };
}
const SINCE_131 = tpe("2026-11-01T00:00");
/** 11-05 进度表 141: the free line back for everyone, the 4th+ block and the 1st cast's block rewritten from the numbers */
const SINCE_141 = tpe("2026-11-05T18:00");
export async function check131(now = Date.now()): Promise<CheckResult> {
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "—");
  const f = funnel131(SINCE_131, Math.min(now, SINCE_141));
  const g = now > SINCE_141 ? funnel131(SINCE_141, now) : null;
  const base = funnel131(tpe("2026-10-26T00:00"), tpe("2026-11-01T00:00"));
  const cur = g && g.visitors ? g : f; // the verdict reads the latest period
  const rate = cur.visitors ? cur.paid / cur.visitors : 0;
  return {
    ok: rate >= 0.034,
    lines: [
      ...(g ? [`免费一句恢复＋话术升级后（11-05 晚 → 现在，进度表 141）：访客 ${g.visitors} · 起卦 ${pct(g.cast, g.visitors)} · 看到价格 ${pct(g.price, g.visitors)} · 付款 ${g.paid} 笔 = ${pct(g.paid, g.visitors)}／访客`] : []),
      `没有免费一句（11-01 → 11-05）：访客 ${f.visitors} · 起卦 ${pct(f.cast, f.visitors)} · 看到价格 ${pct(f.price, f.visitors)} · 付款 ${f.paid} 笔 = ${pct(f.paid, f.visitors)}／访客`,
      `对照 10-26→31（登录墙＋免费一句）：访客 ${base.visitors} · 起卦 ${pct(base.cast, base.visitors)} · 看到价格 ${pct(base.price, base.visitors)} · 付款 ${base.paid} 笔 = ${pct(base.paid, base.visitors)}／访客`,
      rate >= 0.034 ? "付款／访客回到 3.4% 以上：算成。" : rate < 0.024 ? "付款／访客低于 2.4%（11-05 起免费一句已恢复，FREE_LINE=off 可再关掉）。" : "付款／访客在 2.4%–3.4% 之间：没有变差，但还没回到登录墙之前。",
    ],
  };
}

/** 101 上线（build xPTWcH3YTXPLg_vXa0MMy）: 10-23 03:07 台北 */
const SINCE_101 = tpe("2026-10-23T03:07");

/**
 * 进度表 84: the deep reading's 「下一步」「訊號」 began alike — 10-23 before the prompt change, of 1,564 readings in 30 days,
 * 36.3% / 39.6% opened with ten characters shared by at least five readings (85% of 「下一步」 opened 「這七天內」; 16% of
 * 「訊號」 opened 「如果他先開口…」). A week of readings after the change, the same count: both under 15% passes.
 */
const OPENER_TIME = /^(这七天|這七天|接下来|接下來|这几天|這幾天|这两天|這兩天|这一周|這一週|这周|這週|七天内|七天內)/;
const OPENER_STOCK = /^(如果他先|如果对方先|如果对方主动|如果他主动|如果她先|第一[，,：:])/;
export async function openingShares(since: number, now = Date.now()): Promise<CheckResult> {
  const { toHans } = await import("./hant");
  const rows = db().prepare(`SELECT r.body_json AS b FROM readings r
    WHERE r.tier = 'deep' AND r.created_at >= ? AND r.created_at < ? AND r.locale IN ('zh','zh-hant')
      AND r.id = (SELECT MAX(r2.id) FROM readings r2 WHERE r2.cast_id = r.cast_id AND r2.tier = 'deep')`).all(since, now) as { b: string }[];
  const field = (b: string, k: string): string | null => {
    try { const v = (JSON.parse(b) as Record<string, unknown>)[k]; return v ? (typeof v === "string" ? v : String(Object.values(v as object)[0] ?? "")) : null; } catch { return null; }
  };
  const lines = [`${homeMinute(since)} → ${homeMinute(now)}：深断 ${rows.length} 份（每卦取最新一份）`];
  const shares: number[] = [];
  for (const [k, name] of [["next_step", "下一步"], ["signals", "訊號"]] as const) {
    const ts = rows.map((r) => field(r.b, k)).filter((t): t is string => !!t).map((t) => toHans(t).replace(/\s+/g, ""));
    const heads = ts.map((t) => t.slice(0, 10));
    const count = new Map<string, number>();
    for (const h of heads) count.set(h, (count.get(h) ?? 0) + 1);
    const shared = heads.length ? heads.filter((h) => (count.get(h) ?? 0) >= 5).length / heads.length : 0;
    shares.push(shared);
    const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;
    lines.push(`「${name}」${ts.length} 份：开头 10 字至少 5 份相同 ${pct(shared)}（改前 ${k === "next_step" ? "36.3%" : "39.6%"}）；时间词起头 ${pct(ts.filter((t) => OPENER_TIME.test(t)).length / (ts.length || 1))}；套话起头 ${pct(ts.filter((t) => OPENER_STOCK.test(t)).length / (ts.length || 1))}`);
  }
  if (rows.length < 50) return { retry: `样本还不够（${rows.length} 份）`, lines };
  lines.push(shares.every((x) => x < 0.15) ? "两栏都低于 15%：验收通过" : "还有一栏不低于 15%：要再看提示");
  return { ok: shares.every((x) => x < 0.15), lines };
}
/** 84 的提示改动上线之后（10-23 傍晚部署，取 17:30 台北起算，部署前后的几份不算） */
const SINCE_84 = tpe("2026-10-23T17:30");

/**
 * 进度表 112: the 年書 early-bird letter's tests to the owner the day before — the four variants (繁體台幣／港幣／美元、
 * 简体人民币) and the head count it would go to now. The real send stays a hand run after Neil's yes (11/1 10:00 on).
 */
export async function nianshuEarlyTests(o: { dry: boolean } = { dry: false }): Promise<CheckResult> {
  const { sendNianshuEarlyTests, planNianshuEarly, summarizeEarly } = await import("./nianshu-early-1101");
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  const plan = summarizeEarly(planNianshuEarly());
  if (o.dry) return { ok: true, lines: [`（试跑：没寄）到期时会寄 4 封测试信给你；现在算收件人 ${plan.recipients} 人（候选 ${plan.candidates}）。`] };
  const t = await sendNianshuEarlyTests(site);
  return {
    ok: t.sent === 4,
    lines: [
      `已寄 ${t.sent} 封测试信到你的信箱（繁体台币／港币／美元、简体人民币，主旨前面标了 [测试]）。请看排版、币别和连结。`,
      `现在算收件人 ${plan.recipients} 人（候选 ${plan.candidates}；繁体 ${plan.byLocale["zh-hant"] ?? 0}、简体 ${plan.byLocale.zh ?? 0}；没寄的：${Object.entries(plan.skipped).map(([k, v]) => `${k} ${v}`).join("、") || "无"}）。`,
      "没问题的话回我「可以」，11/1（周日）10:00 起分批寄（每批 300，台北 09:00–21:00 内，每个信箱一封）。不回就不寄。",
    ],
  };
}

/**
 * 进度表第 16 行「一件事」记忆 (10-22 补三个口子, 3e77e14 19:08): 「10-25 后用 scripts/memory-recheck.ts 再抽 20 + 10」.
 * The sample is read by a person (a reader's words quoted back, an old record taken for how they are now — the program
 * cannot judge it), so on the day this only gives what the program can count — readings filed under a matter since, and
 * how often each guard sent a draft back — and reminds Neil to ask a session for the read. Counts only, never text.
 */
const MEMORY_GUARDS: [string, string][] = [
  ["echo_light", "轻解读引原话"], ["contrast_light", "轻解读「你嘴上說」"], ["echo_deep", "深断引原话（只记数）"],
  ["contrast_deep", "深断「你嘴上說」"], ["stale_deep", "深断把旧记录当现在"], ["echo_followup", "追问引原话"],
];
export async function memoryRecheckDue(since: number, now = Date.now()): Promise<CheckResult> {
  const d = db();
  const n = (d.prepare("SELECT COUNT(*) AS n FROM readings r JOIN casts c ON c.id = r.cast_id WHERE c.matter_id IS NOT NULL AND r.created_at >= ? AND r.created_at < ?").get(since, now) as { n: number }).n;
  const fu = (d.prepare("SELECT COUNT(*) AS n FROM followups f JOIN casts c ON c.id = f.cast_id WHERE f.role = 'assistant' AND c.matter_id IS NOT NULL AND f.created_at >= ? AND f.created_at < ?").get(since, now) as { n: number }).n;
  const kinds = MEMORY_GUARDS.map(([k]) => k);
  const rows = d.prepare(`SELECT kind, COUNT(*) AS n FROM ops_events WHERE at >= ? AND at < ? AND kind IN (${kinds.map(() => "?").join(",")}) GROUP BY kind`).all(since, now, ...kinds) as { kind: string; n: number }[];
  const by = new Map(rows.map((r) => [r.kind, r.n]));
  return {
    ok: false,
    lines: [
      "该做「一件事」记忆的人工复查了：抽 20 份解读＋10 份追问、加 #651 这段时间的全部，逐份看有没有引用读者原话、有没有拿超过 3 天的旧记录断读者现在（目标都是 0）。要人读，程序判不了——在开发会话说一声「做记忆复查」就行（脚本 scripts/memory-recheck.ts，在库的副本上跑）。过了，#651 的信就可以交客服发。",
      `${homeMinute(since)} → ${homeMinute(now)}：挂在「一件事」下的解读 ${n} 份、追问回答 ${fu} 条。`,
      `守卫拦下重写（或记数）：${MEMORY_GUARDS.map(([k, name]) => `${name} ${by.get(k) ?? 0}`).join("、")}。`,
    ],
  };
}
/** 3e77e14 上线是 10-22 19:08；从 10-23 00:00 台北起算，整三天 */
const SINCE_MEMORY = tpe("2026-10-23T00:00");

export const OPS_CHECKS: OpsCheck[] = [
  { id: "102-pack-593", title: "593 号续费帐单抵成 NT$83 了吗（10-25 11:21 续费）", due: tpe("2026-10-25T12:30"), run: () => packCreditInvoice(593, 8300) },
  { id: "memory-recheck-1026", title: "「一件事」记忆复查到期了（10-22 补口子后三天）", due: tpe("2026-10-26T10:00"), run: () => memoryRecheckDue(SINCE_MEMORY) },
  { id: "101-single-week", title: "通卡开着的一周里还有没有不带通卡的单买", due: tpe("2026-10-30T10:00"), run: () => singleSalesSince(SINCE_101) },
  // 10-23 进度表 112 / 84
  { id: "112-test-letters", title: "年书早鸟信：寄测试信给你看（11/1 正式寄之前）", due: tpe("2026-10-31T10:00"), run: (o) => nianshuEarlyTests(o) },
  { id: "84-openings-week", title: "深断「下一步」「訊號」开头还雷同吗（改提示一周后）", due: tpe("2026-10-31T10:30"), run: () => openingShares(SINCE_84) },
  // the other three credited members' renewals — the same check, so each promised discount is seen to happen
  { id: "102-pack-1488", title: "1488 号续费帐单抵成 NT$149 了吗（11-08 02:41 续费）", due: tpe("2026-11-08T03:45"), run: () => packCreditInvoice(1488, 14900) },
  { id: "102-pack-347", title: "347 号续费帐单抵成 NT$109 了吗（11-22 14:09 续费）", due: tpe("2026-11-22T15:15"), run: () => packCreditInvoice(347, 10900) },
  // 10-31 进度表 131: two weeks after casting opened up and the free line went
  { id: "131-funnel", title: "起卦免登录（11-05 起免费一句恢复）：付款／访客回到 3.4% 了吗", due: tpe("2026-11-15T10:00"), run: () => check131() },
  { id: "102-pack-343", title: "343 号续费帐单抵成 US$0 了吗（11-22 21:34 续费）", due: tpe("2026-11-22T22:45"), run: () => packCreditInvoice(343, 0) },
];

function ensure(): void {
  db().exec(`CREATE TABLE IF NOT EXISTS ops_checks (
    id TEXT PRIMARY KEY, done_at INTEGER, ok INTEGER, result TEXT, tries INTEGER NOT NULL DEFAULT 0, last_try INTEGER, last_note TEXT
  )`);
}

export interface CheckRun { id: string; title: string; state: "done" | "retry"; ok?: boolean; lines: string[] }

/** Run what is due (or, with `only`, that one check now); `dry` keeps nothing and sends nothing. */
export async function runDueChecks(now = Date.now(), opts: { dry?: boolean; only?: string | null; checks?: OpsCheck[] } = {}): Promise<CheckRun[]> {
  ensure();
  const d = db();
  const out: CheckRun[] = [];
  for (const c of opts.checks ?? OPS_CHECKS) {
    if (opts.only ? c.id !== opts.only : !opts.dry && now < c.due) continue;
    const row = d.prepare("SELECT done_at FROM ops_checks WHERE id = ?").get(c.id) as { done_at: number | null } | undefined;
    if (row?.done_at && !opts.dry && !opts.only) continue;
    let r: CheckResult;
    try { r = await c.run({ dry: !!opts.dry }); } catch (e) { r = { ok: false, lines: [`出错：${String(e instanceof Error ? e.message : e).slice(0, 200)}`] }; }
    if ("retry" in r) {
      // not ready yet: try again next hour — until a day past the due time, then say so
      if (opts.dry || now < c.due + 24 * H) {
        if (!opts.dry) d.prepare("INSERT INTO ops_checks (id, tries, last_try, last_note) VALUES (?,1,?,?) ON CONFLICT(id) DO UPDATE SET tries = tries + 1, last_try = excluded.last_try, last_note = excluded.last_note").run(c.id, now, r.retry);
        out.push({ id: c.id, title: c.title, state: "retry", lines: [r.retry, ...(r.lines ?? [])] });
        continue;
      }
      r = { ok: false, lines: [`到期一天了还是：${r.retry}`, ...(r.lines ?? [])] };
    }
    out.push({ id: c.id, title: c.title, state: "done", ok: r.ok, lines: r.lines });
    if (opts.dry) continue;
    d.prepare("INSERT INTO ops_checks (id, done_at, ok, result, tries, last_try) VALUES (?,?,?,?,1,?) ON CONFLICT(id) DO UPDATE SET done_at = excluded.done_at, ok = excluded.ok, result = excluded.result, tries = tries + 1, last_try = excluded.last_try")
      .run(c.id, now, r.ok ? 1 : 0, JSON.stringify(r.lines), now);
    recordOps("ops_check", `${c.id} ${r.ok ? "通过" : "要看"}：${r.lines[0] ?? ""}`.slice(0, 480));
    const subject = `[YaoFlow 定时核对] ${r.ok ? "通过" : "要看一下"} · ${c.title}`;
    const text = [c.title, "", ...r.lines, "", `核对时间 ${homeMinute(now)}（台北）。这封由服务器定时核对发出（lib/ops-checks.ts，${c.id}），每项只寄一次。`].join("\n");
    const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.7;max-width:600px;">${text.split("\n").map((l) => (l ? `<p style="margin:0 0 4px;">${l.replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[ch]!)}</p>` : "<br>")).join("")}</div>`;
    await sendEmail(ownerRecipients(), subject, html, text, { kind: "ops_check" }).catch(() => null);
  }
  return out;
}

/** For the admin page: every check, when it is due, and what came of it. */
export function checkStates(): { id: string; title: string; due: number; doneAt: number | null; ok: boolean | null; lines: string[]; tries: number; note: string | null }[] {
  ensure();
  const d = db();
  return OPS_CHECKS.map((c) => {
    const r = d.prepare("SELECT done_at, ok, result, tries, last_note FROM ops_checks WHERE id = ?").get(c.id) as { done_at: number | null; ok: number | null; result: string | null; tries: number; last_note: string | null } | undefined;
    let lines: string[] = [];
    try { lines = r?.result ? (JSON.parse(r.result) as string[]) : []; } catch { /* */ }
    return { id: c.id, title: c.title, due: c.due, doneAt: r?.done_at ?? null, ok: r?.ok == null ? null : r.ok === 1, lines, tries: r?.tries ?? 0, note: r?.last_note ?? null };
  });
}
