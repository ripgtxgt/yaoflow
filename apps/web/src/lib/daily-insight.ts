import { db, recordOps } from "./db";
import { opsText } from "./support-llm";
import { readEventsBetween } from "./analytics-server";
import { toUsdCents } from "./live";

/**
 * 10-26 (Neil: 「我們的產品上面不會大量地使用 AI 去做輔助性的自動化運營嗎？…三條路都做」) — the daily 運營摘要: yesterday's
 * numbers (Taipei day) beside the seven days before, and the model's reading of them: what moved, what did not catch,
 * one to three things to try. Mailed to the owner at 08:05 Taipei and shown on the admin home; kept in daily_insights.
 * Only counts go to the model — never a reader's question, address or name.
 */
const DAY = 86_400_000, TPE = 8 * 3_600_000;
const NOT_TEST = "(customer_id IS NULL OR customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1))";

export function tpeDayStart(ms: number): number { return Math.floor((ms + TPE) / DAY) * DAY - TPE; }
export const tpeYmd = (ms: number) => new Date(ms + TPE).toISOString().slice(0, 10);

let ready = false;
function ensure(): void {
  if (ready) return;
  db().exec(`CREATE TABLE IF NOT EXISTS daily_insights (
    day TEXT PRIMARY KEY, numbers_json TEXT NOT NULL, text TEXT, how TEXT, created_at INTEGER NOT NULL, mailed_at INTEGER
  )`);
  ready = true;
}

const one = (sql: string, ...a: (number | string)[]): number => {
  try { return Number((db().prepare(sql).get(...a) as { v: number | null } | undefined)?.v ?? 0); } catch { return 0; }
};

export type DayNumbers = Record<string, number | Record<string, number>>;
/** the numbers of one Taipei day [since, since + 1 day) */
export function dayNumbers(since: number): DayNumbers {
  const until = since + DAY;
  const topics: Record<string, number> = {};
  try {
    for (const r of db().prepare("SELECT COALESCE(topic, 'other') AS t, COUNT(*) AS n FROM cast_log WHERE at >= ? AND at < ? GROUP BY 1").all(since, until) as { t: string; n: number }[]) topics[r.t] = r.n;
  } catch { /* no casts table yet */ }
  const tiers: Record<string, number> = {};
  let usd = 0;
  try {
    for (const r of db().prepare(`SELECT tier, amount_cents, currency FROM orders WHERE created_at >= ? AND created_at < ? AND status = 'paid' AND ${NOT_TEST}`).all(since, until) as { tier: string; amount_cents: number | null; currency: string | null }[]) {
      tiers[r.tier] = (tiers[r.tier] ?? 0) + 1;
      if (r.amount_cents && r.currency) usd += toUsdCents(r.amount_cents, r.currency);
    }
  } catch { /* none */ }
  const ev = readEventsBetween(since, until, { only: ["bridge", "zhengyuan", "hepan", "nianshu", "tarot", "jiaobei", "bazi", "heat_click", "name", "dream", "taisui", "zeri", "xunwu"] });
  // 10-28 进度表 119: taps on the 「也可以試試」 strip, by page (its data-heat is promo-<surface>) — what a promo_pick action moves
  const promoClicks: Record<string, number> = {};
  for (const x of ev) if (x.e === "heat_click" && x.method?.startsWith("promo-")) { const s = x.method.slice(6); promoClicks[s] = (promoClicks[s] ?? 0) + 1; }
  const count = (e: string, m: (x: string) => boolean) => ev.filter((x) => x.e === e && m(x.method ?? "")).length;
  const bridgeShow: Record<string, number> = {}, bridgeClick: Record<string, number> = {};
  for (const x of ev) if (x.e === "bridge" && x.method) {
    const [kind, surface] = x.method.split(":");
    const o = kind === "show" ? bridgeShow : kind === "click" ? bridgeClick : null;
    if (o && surface) o[surface] = (o[surface] ?? 0) + 1;
  }
  return {
    casts: Object.values(topics).reduce((a, b) => a + b, 0),
    castTopics: topics,
    tarotDraws: one("SELECT COUNT(*) AS v FROM tarot_draws WHERE created_at >= ? AND created_at < ?", since, until),
    jiaobeiAsks: one("SELECT COUNT(*) AS v FROM jiaobei_asks WHERE created_at >= ? AND created_at < ?", since, until),
    chartQa: one("SELECT COUNT(*) AS v FROM mingli_qa WHERE at >= ? AND at < ?", since, until),
    newAccounts: one("SELECT COUNT(DISTINCT customer_id) AS v FROM browser_links WHERE first_at >= ? AND first_at < ?", since, until),
    paidOrders: Object.values(tiers).reduce((a, b) => a + b, 0),
    paidByTier: tiers,
    revenueUsd: Math.round(usd) / 100,
    bridgeShown: bridgeShow,
    bridgeClicked: bridgeClick,
    zhengyuanViews: count("zhengyuan", (m) => m === "view"),
    zhengyuanBuyClicks: count("zhengyuan", (m) => m.startsWith("buy")),
    // 10-29 (Neil: 这几个产品上线，推广也要带上): 姓名學、解夢、犯太歲、擇日按用途
    namePageViews: count("name", (m) => m === "view"),
    nameQueries: count("name", (m) => m.startsWith("read")),
    nameCharPageViews: count("name", (m) => m === "zi"),
    nameBuyClicks: count("name", (m) => m.startsWith("buy:") && m !== "buy:tester"),
    dreamViews: count("dream", (m) => m === "index" || m.startsWith("view:")),
    dreamToCast: count("dream", (m) => m.startsWith("to_cast")),
    taisuiViews: count("taisui", (m) => m === "view" || m.startsWith("view:")),
    zeriUseViews: count("zeri", (m) => m.startsWith("purpose:")),
    // 10-29 进度表 127 (Neil: 「直接上线吧……推广中的涉及」): 尋物 — page views, dice cast, 「用六爻細看」 taps, revisit answers
    xunwuViews: count("xunwu", (m) => m === "view"),
    xunwuCasts: one("SELECT COUNT(*) AS v FROM xunwu_casts WHERE created_at >= ? AND created_at < ?", since, until),
    xunwuToCast: count("xunwu", (m) => m === "to_cast" || m === "back_cast"),
    xunwuFound: count("xunwu", (m) => m === "back:found"),
    xunwuNotYet: count("xunwu", (m) => m === "back:not"),
    promoClicks,
  };
}

const PROMPT = [
  "你是一個問事網站（六爻、塔羅、擲筊、求籤、八字紫微星盤、合盤、年書、正緣畫像、姓名學與寶寶取名／改名參考、解夢、犯太歲查詢、擇日（結婚／搬家／開市）、尋物「東西不見了？」（免登入擲骰子看方向，接六爻細看）；收費是通卡、會員和單買）的運營助理。",
  "下面是昨天的數字和前七天的日平均（ga 開頭的是 Google Analytics 看到的訪客、工作階段與渠道，可和站內的起卦、付款對照看轉化）。請用简体中文寫一份給老闆的晨間摘要：",
  "一、三到五條「昨天發生了什麼」：只挑和平均比明顯變化的（說出數字和變化幅度），以及沒有接住的地方（例如推薦卡出現很多但點的少、產品頁看的人多但點購買的少）；",
  "二、一到三條「今天可以試什麼」：具體、能在一天內做的小調整，說明依據哪個數字。",
  "不要寫空話、不要重複所有數字、不要猜數字以外的原因當成事實（可以說「可能」）。每條一行，前面加「·」。總共不超過 300 字。",
].join("\n");

/** build (or rebuild) the summary for the Taipei day that ended before `now` */
export async function buildInsight(now = Date.now(), opts: { model?: boolean } = {}): Promise<{ day: string; numbers: DayNumbers; prev: DayNumbers; text: string | null; how: string }> {
  ensure();
  const since = tpeDayStart(now) - DAY;
  const numbers = dayNumbers(since);
  // the seven days before: plain averages of the flat counts
  const week = Array.from({ length: 7 }, (_, i) => dayNumbers(since - (i + 1) * DAY));
  const prev: DayNumbers = {};
  for (const k of Object.keys(numbers)) if (typeof numbers[k] === "number") prev[k] = Math.round((week.reduce((a, d) => a + (d[k] as number), 0) / 7) * 10) / 10;
  // 10-27: what Google Analytics saw yesterday (visitors, sessions, channels) — empty until GA is connected (lib/ga-data.ts)
  if (opts.model !== false) {
    try { Object.assign(numbers, await (await import("./ga-data")).gaYesterday()); } catch { /* GA is optional */ }
  }
  let text: string | null = null, how = "none";
  if (opts.model !== false) {
    try {
      // 10-28: Claude (Opus) when the key is set, the DeepSeek chain otherwise (lib/support-llm.ts opsText)
      const r = await opsText(PROMPT, JSON.stringify({ yesterday: numbers, avg7: prev }), { maxTokens: 700, temperature: 0.4, timeoutMs: 60_000 });
      text = r.text.trim();
      how = `model:${r.how}`;
    } catch (e) { recordOps("insight_fail", (e instanceof Error ? e.message : "?").slice(0, 100)); }
  }
  const day = tpeYmd(since);
  db().prepare("INSERT INTO daily_insights (day, numbers_json, text, how, created_at) VALUES (?,?,?,?,?) ON CONFLICT(day) DO UPDATE SET numbers_json = excluded.numbers_json, text = excluded.text, how = excluded.how, created_at = excluded.created_at")
    .run(day, JSON.stringify({ numbers, prev }), text, how, Date.now());
  return { day, numbers, prev, text, how };
}

export function latestInsight(): { day: string; text: string | null; numbers: DayNumbers; prev: DayNumbers } | null {
  try {
    ensure();
    const r = db().prepare("SELECT day, numbers_json, text FROM daily_insights ORDER BY day DESC LIMIT 1").get() as { day: string; numbers_json: string; text: string | null } | undefined;
    if (!r) return null;
    const j = JSON.parse(r.numbers_json) as { numbers: DayNumbers; prev: DayNumbers };
    return { day: r.day, text: r.text, numbers: j.numbers, prev: j.prev };
  } catch { return null; }
}

/** the morning run: build yesterday's, mail it to the owner once */
export async function runInsight(now = Date.now(), opts: { dry?: boolean } = {}): Promise<{ day: string; mailed: boolean; how: string }> {
  const r = await buildInsight(now);
  // 10-28 进度表 119: last week's trials are measured and switched back, then the model may propose today's (待批, nothing moves)
  let pending = 0, settled = 0;
  if (r.how.startsWith("model") && !opts.dry) {
    try {
      const oa = await import("./ops-actions");
      settled = oa.settleActions(now);
      await oa.proposeActions(r.day, r.numbers, r.prev, now);
      pending = oa.pendingCount();
    } catch (e) { recordOps("ops_action_fail", (e instanceof Error ? e.message : "?").slice(0, 100)); }
  }
  if (opts.dry) return { day: r.day, mailed: false, how: r.how };
  const done = db().prepare("SELECT mailed_at FROM daily_insights WHERE day = ?").get(r.day) as { mailed_at: number | null } | undefined;
  if (done?.mailed_at) return { day: r.day, mailed: false, how: r.how };
  const { ownerRecipients, sendEmail } = await import("./email");
  const n = r.numbers as Record<string, number>;
  const lines = [
    `昨天（${r.day}）：起卦 ${n.casts}、塔罗 ${n.tarotDraws}、掷筊 ${n.jiaobeiAsks}、命盘问答 ${n.chartQa}；付款 ${n.paidOrders} 笔，约 US$${n.revenueUsd}。`,
    "",
    r.text ?? "（模型这次没写成，只附数字。）",
    "",
    ...(pending || settled ? [`运营动作：${pending ? `${pending} 条待你批准` : ""}${pending && settled ? "、" : ""}${settled ? `${settled} 条试了一周有结果了` : ""}，在后台首页「运营动作」。`, ""] : []),
    "数字明细在后台首页「运营摘要」。",
  ];
  const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
  const html = `<div style="font-family:'PingFang SC','Noto Sans SC',sans-serif;font-size:15px;line-height:1.8;color:#14151c;max-width:560px">${lines.map((l) => (l ? `<p style="margin:0 0 6px">${esc(l)}</p>` : "<br>")).join("")}</div>`;
  const res = await sendEmail(ownerRecipients(), `运营摘要 · ${r.day}`, html, lines.join("\n"), { kind: "ops_check" }).catch(() => ({ ok: false }));
  if (res.ok) db().prepare("UPDATE daily_insights SET mailed_at = ? WHERE day = ?").run(Date.now(), r.day);
  recordOps("insight", `${r.day} ${r.how} ${res.ok ? "mailed" : "mail_failed"}`);
  return { day: r.day, mailed: !!res.ok, how: r.how };
}
