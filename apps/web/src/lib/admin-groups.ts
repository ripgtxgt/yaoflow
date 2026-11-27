import { db } from "./db";
import { readEventsBetween } from "./analytics-server";
import { toUsdCents } from "./live";

/**
 * 10-22 进度表 94 第二批 — the dashboard's first screen: one short funnel per group of the site (問事／看自己／每天, the
 * three tabs of the nav since 76C) and one line of money (passes, memberships, the one-off products). The 六爻 funnel
 * further down stays as it was; this is the view across all seventeen products. Our own test accounts are left out.
 * Server only; read-only.
 */

const NOT_TEST = "(customer_id IS NULL OR customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1))";
const one = (sql: string, ...a: unknown[]): number => {
  try { return Number((db().prepare(sql).get(...(a as never[])) as { v: number | null } | undefined)?.v ?? 0); } catch { return 0; }
};
const many = <T,>(sql: string, ...a: unknown[]): T[] => {
  try { return db().prepare(sql).all(...(a as never[])) as T[]; } catch { return []; }
};

export interface Step { label: string; n: number; parts?: string }
export interface Group { id: "ask" | "self" | "daily"; name: string; steps: Step[]; legend: string }

/**
 * `lookbackDays` (11-09, T-033 ②): 「隔天又来」 counts people who came on two different days. Over one day that is 0 by
 * definition (the daily promo files showed 0 six days running) — with a lookback, a person seen in the window who also
 * came on an earlier day within it counts.
 */
export function groupFunnels(since: number, until = Date.now(), opts: { lookbackDays?: number } = {}): Group[] {
  const backFrom = since - (opts.lookbackDays ?? 0) * 86_400_000;
  // 問事: asked → a personal reading delivered → someone paid
  // 10-23 进度表 105 ⑥: the casts themselves (cast_log, one row per cast a browser made) — the casts table only holds the ones
  // that got a reading (10-22 on: 127 there, 439 cast by 208 browsers); our own browsers stay out
  const NOT_OUR_BID = "bid NOT IN (SELECT bid FROM browser_links WHERE customer_id IN (SELECT id FROM customers WHERE test_flag = 1))";
  const casts = one(`SELECT COUNT(*) AS v FROM cast_log WHERE at >= ? AND at < ? AND ${NOT_OUR_BID}`, since, until);
  const casters = one(`SELECT COUNT(DISTINCT bid) AS v FROM cast_log WHERE at >= ? AND at < ? AND ${NOT_OUR_BID}`, since, until);
  const tarot = one(`SELECT COUNT(*) AS v FROM tarot_draws WHERE created_at >= ? AND created_at < ? AND ${NOT_TEST}`, since, until);
  const qian = one(`SELECT COUNT(*) AS v FROM qian_draws WHERE created_at >= ? AND created_at < ? AND ${NOT_TEST}`, since, until);
  const jb = one(`SELECT COUNT(*) AS v FROM jiaobei_asks WHERE created_at >= ? AND created_at < ? AND ${NOT_TEST}`, since, until);
  const readings = one(`SELECT COUNT(DISTINCT cast_id) AS v FROM readings WHERE created_at >= ? AND created_at < ? AND ${NOT_TEST}`, since, until);
  const tarotP = one(`SELECT COUNT(*) AS v FROM tarot_draws WHERE personal_json IS NOT NULL AND COALESCE(paid_at, created_at) >= ? AND COALESCE(paid_at, created_at) < ? AND ${NOT_TEST}`, since, until);
  const qianP = one(`SELECT COUNT(*) AS v FROM qian_draws WHERE personal_json IS NOT NULL AND COALESCE(personal_at, created_at) >= ? AND COALESCE(personal_at, created_at) < ? AND ${NOT_TEST}`, since, until);
  const askPayers = one(
    `SELECT COUNT(DISTINCT COALESCE(CAST(customer_id AS TEXT), lower(email))) AS v FROM orders
      WHERE created_at >= ? AND created_at < ? AND payment_state IN ('paid','refunded','disputed') AND COALESCE(amount_cents,0) > 0
        AND tier IN ('deep','one','light','tarot','qian','pass_1d','pass_7d','pass_30d') AND ${NOT_TEST}`, since, until);

  // 看自己: charts drawn (events) → reports written → paid for the one-offs of this group
  const evAll = readEventsBetween(backFrom, until, { only: ["bazi", "ziwei", "astro", "huangli", "yunshi", "zeri", "jiaobei"] });
  const ev = backFrom < since ? evAll.filter((e) => e.t >= since) : evAll;
  // 线上求籤 is not kept in a table yet (进度表 106 stores it): the page's 「qq_done」 events, by browser
  const qiuqian = ev.filter((e) => e.e === "jiaobei" && e.method === "qq_done").length;
  const qa = one(`SELECT COUNT(*) AS v FROM mingli_qa WHERE at >= ? AND at < ? AND ${NOT_TEST}`, since, until);
  const qaPeople = one(`SELECT COUNT(DISTINCT COALESCE(CAST(customer_id AS TEXT), bid)) AS v FROM mingli_qa WHERE at >= ? AND at < ? AND ${NOT_TEST}`, since, until);
  const ppl = (name: string, m: (x: string) => boolean) => new Set(ev.filter((e) => e.e === name && m(e.method ?? "")).map((e) => e.b ?? e.s)).size;
  const charts = { bazi: ppl("bazi", (m) => m.startsWith("chart")), ziwei: ppl("ziwei", (m) => m.startsWith("chart")), astro: ppl("astro", (m) => m.startsWith("chart")) };
  const rep = (t: string) => one(`SELECT COUNT(*) AS v FROM ${t} WHERE body_json IS NOT NULL AND created_at >= ? AND created_at < ? AND ${NOT_TEST}`, since, until);
  const reports = { bazi: rep("bazi_reports"), ziwei: rep("ziwei_reports"), astro: rep("astro_reports") };
  const paidIn = (t: string) => one(`SELECT COUNT(*) AS v FROM ${t} WHERE paid_at >= ? AND paid_at < ? AND COALESCE(amount_minor,0) > 0 AND ${NOT_TEST}`, since, until);
  const nianshu = paidIn("nianshu_reports"), hepan = paidIn("hepan_reports");

  // 每天: came to look → came back on another day → letters they asked for
  const tqPeople = one("SELECT COUNT(DISTINCT subject) AS v FROM tq_draws WHERE at >= ? AND at < ?", since, until);
  const tqBack = one("SELECT COUNT(*) AS v FROM (SELECT subject FROM tq_draws WHERE at >= ? AND at < ? AND subject IN (SELECT subject FROM tq_draws WHERE at >= ? AND at < ?) GROUP BY subject HAVING COUNT(DISTINCT day) >= 2)", backFrom, until, since, until);
  const daysOf = (name: string, m: (x: string) => boolean) => {
    const byWho = new Map<string, Set<string>>();
    const inWindow = new Set<string>();
    for (const e of evAll) {
      if (e.e !== name || !m(e.method ?? "")) continue;
      const who = e.b ?? e.s;
      if (!who) continue;
      const d = new Date(e.t + 8 * 3_600_000).toISOString().slice(0, 10);
      (byWho.get(who) ?? byWho.set(who, new Set()).get(who)!).add(d);
      if (e.t >= since) inWindow.add(who);
    }
    return { people: inWindow.size, back: [...inWindow].filter((w) => byWho.get(w)!.size >= 2).length };
  };
  const hl = daysOf("huangli", (m) => m.startsWith("view")), ys = daysOf("yunshi", (m) => m.startsWith("view")), zr = daysOf("zeri", (m) => m.startsWith("query"));
  const tqMail = one("SELECT COUNT(*) AS v FROM tq_prefs WHERE mail = 1 AND subject LIKE 'c:%'");
  const memberLetters = one(
    `SELECT COUNT(DISTINCT c.id) AS v FROM subscriptions s JOIN customers c ON c.id = s.customer_id
      WHERE s.status IN ('active','trialing','past_due') AND substr(s.stripe_subscription_id,1,5) <> 'pass_' AND c.locale IN ('zh','zh-hant')
        AND COALESCE(c.test_flag,0) = 0 AND c.id NOT IN (SELECT customer_id FROM member_letter_off)`);

  return [
    {
      id: "ask", name: "问事",
      steps: [
        { label: "问了", n: casts + tarot + qian + jb + qiuqian, parts: `六爻起卦 ${casts}（${casters} 个浏览器）· 塔罗抽牌 ${tarot} · 解籤 ${qian} · 线上求籤 ${qiuqian} · 擲筊 ${jb}` },
        { label: "拿到个人解读", n: readings + tarotP + qianP, parts: `六爻 ${readings} · 塔罗 ${tarotP} · 解籤 ${qianP}` },
        { label: "付钱的人", n: askPayers, parts: "单买或通卡（会员另计）" },
      ],
      legend: "问了 = 次数（六爻按起卦日志算每一卦，10-23 以前只算了拿到解读的卦；线上求籤按页面事件）；个人解读 = 份数（付费、通卡、会员、免费层都算）；付钱的人 = 这段时间在问事这边付过钱的人（六爻、塔罗、解籤单买，或买通卡）。",
    },
    {
      id: "self", name: "看自己",
      steps: [
        { label: "排盘的人", n: charts.bazi + charts.ziwei + charts.astro, parts: `八字 ${charts.bazi} · 紫微 ${charts.ziwei} · 星盘 ${charts.astro}` },
        { label: "写好的报告", n: reports.bazi + reports.ziwei + reports.astro, parts: `八字 ${reports.bazi} · 紫微 ${reports.ziwei} · 星盘 ${reports.astro}（含正缘画像）· 另有命盘问答 ${qa} 问（${qaPeople} 人）` },
        { label: "单买", n: nianshu + hepan, parts: `年书 ${nianshu} · 合盘 ${hepan}` },
      ],
      legend: "排盘的人按浏览器算、三个盘各算一次；写好的报告 = 通卡、会员与单买写出来的深度报告（本命篇／运势篇）份数；单买 = 年书、合盘付了钱的份数。",
    },
    {
      id: "daily", name: "每天",
      steps: [
        { label: "来看的人", n: tqPeople + hl.people + ys.people + zr.people, parts: `今日一籤 ${tqPeople} · 黄历 ${hl.people} · 运势 ${ys.people} · 择日 ${zr.people}` },
        { label: "隔天又来", n: tqBack + hl.back + ys.back + zr.back, parts: `今日一籤 ${tqBack} · 黄历 ${hl.back} · 运势 ${ys.back} · 择日 ${zr.back}` },
        { label: "收信的人", n: tqMail + memberLetters, parts: `今日一籤信 ${tqMail} · 会员每日信 ${memberLetters}（现在）` },
      ],
      legend: "来看的人按产品各算（同一个人看了两样算两次）；隔天又来 = 这段时间里来过至少两个不同日子的人；收信的人是现在的人数，不随时间段变。",
    },
  ];
}

export interface MoneyLine {
  passes: { d1: number; d7: number; d30: number; usd: number };
  members: { started: number; month: number; year: number; closed: number; usd: number };
  singles: { name: string; n: number; usd: number }[];
}

/** the money of the window, by what was bought (USD at today's rates; refunds left in, as the rest of this page does) */
export function moneyLine(since: number, until = Date.now()): MoneyLine {
  const pass = many<{ tier: string; amount_cents: number | null; currency: string | null }>(
    `SELECT tier, amount_cents, currency FROM orders WHERE tier IN ('pass_1d','pass_7d','pass_30d') AND created_at >= ? AND created_at < ?
       AND payment_state IN ('paid','refunded','disputed') AND ${NOT_TEST}`, since, until);
  const usd = (rows: { amount: number | null; currency: string | null }[]) => rows.reduce((a, r) => a + (r.amount && r.currency ? toUsdCents(r.amount, r.currency) : 0), 0);
  const subs = many<{ plan: string; amount_minor: number | null; currency: string | null }>(
    `SELECT plan, amount_minor, currency FROM subscriptions WHERE created_at >= ? AND created_at < ? AND substr(stripe_subscription_id,1,4) = 'sub_' AND ${NOT_TEST}`, since, until);
  const closed = one(`SELECT COUNT(*) AS v FROM subscriptions WHERE retain_confirm_at >= ? AND retain_confirm_at < ? AND ${NOT_TEST}`, since, until);
  const single = (name: string, table: string) => {
    const rs = many<{ amount: number | null; currency: string | null }>(
      `SELECT amount_minor AS amount, currency FROM ${table} WHERE paid_at >= ? AND paid_at < ? AND COALESCE(amount_minor,0) > 0 AND ${NOT_TEST}`, since, until);
    return { name, n: rs.length, usd: usd(rs) };
  };
  return {
    passes: {
      d1: pass.filter((r) => r.tier === "pass_1d").length, d7: pass.filter((r) => r.tier === "pass_7d").length, d30: pass.filter((r) => r.tier === "pass_30d").length,
      usd: usd(pass.map((r) => ({ amount: r.amount_cents, currency: r.currency }))),
    },
    members: {
      started: subs.length, month: subs.filter((s) => s.plan === "month").length, year: subs.filter((s) => s.plan === "year").length, closed,
      usd: usd(subs.map((s) => ({ amount: s.amount_minor, currency: s.currency }))),
    },
    singles: [single("年书", "nianshu_reports"), single("合盘", "hepan_reports"), single("塔罗", "tarot_draws"), single("解籤", "qian_draws")],
  };
}
