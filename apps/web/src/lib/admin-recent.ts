import { db } from "./db";
import { toHans } from "./hant";
import { cardById, POSITIONS } from "./tarot";
import { qianByNum } from "./qian";
import { qianPath, qianResultPath, qianSet } from "./qian-meta";
import { chartLine } from "./my-reports";
import { formatMoney, isCurrency } from "./money";

/**
 * 10-24 (Neil 圈着看板「最近的解读」：「应该把用户所有的解读都放进去吧，包括各类产品的使用」): the dashboard's list used to be
 * the I Ching orders only. This reads the other products' own tables into rows of the same shape, newest first:
 *   塔罗 — every spread drawn (the free ones show the cards' meanings; a personal reading is the paid layer)
 *   解籤 — every lot looked up (the poem is free; the personal reading is paid)
 *   求籤 — lots drawn on the site's own 求籤 (free); one row per person per day
 *   擲筊 — tosses where the reader wrote the question down (free); one row per person per day, with how many tosses
 *   八字／紫微／星盘 deep reports, 正缘画像, 合盘, 年书 — paid for (or a pass's／membership's), written or being written
 *   命盘问答 — every question asked on a chart page
 * The I Ching rows stay lib/db recentReadings (they carry the hexagram, follow-ups, views, gifts). 今日一籤 has no question,
 * so it is not listed. Read-only; questions are the readers' private words — admin only.
 */
export type OtherKind = "tarot" | "qian" | "qiuqian" | "jiaobei" | "bazi" | "zhengyuan" | "ziwei" | "astro" | "hepan" | "nianshu" | "qa";
export type RecentKind = "liuyao" | OtherKind;
export const RECENT_KINDS: readonly RecentKind[] = ["liuyao", "tarot", "qian", "qiuqian", "jiaobei", "bazi", "zhengyuan", "ziwei", "astro", "hepan", "nianshu", "qa"];
export const RECENT_ZH: Record<RecentKind, string> = {
  liuyao: "六爻", tarot: "塔罗", qian: "解籤", qiuqian: "求籤", jiaobei: "擲筊", bazi: "八字报告", zhengyuan: "正缘画像",
  ziwei: "紫微报告", astro: "星盘报告", hepan: "合盘", nianshu: "年书", qa: "命盘问答",
};
export const isRecentKind = (x: unknown): x is RecentKind => typeof x === "string" && (RECENT_KINDS as readonly string[]).includes(x);

export interface OtherRow {
  kind: OtherKind;
  at: number;
  key: string;
  /** 档: 个人解读 / 免费抽牌 / 籤诗 / 深度报告 / 2027 年 … */
  tier: string;
  /** 来源: 付费 NT$… / 通卡 / 会员 / 免费 / 测试 */
  how: string;
  customerId: number | null;
  email: string | null;
  /** 10-24: not signed in this time, but the browser it was done in belongs to this account (browser_links) */
  viaBrowser: boolean;
  /** no account at all: the first 4 characters of the browser id, so the same browser reads the same */
  browser: string | null;
  locale: string | null;
  currency: string | null;
  /** the reader's question, or what the report is of */
  text: string;
  /** the cards, the lot, the chart, the toss — a few words */
  detail: string;
  href: string | null;
  followups: number;
  /** a row of ours: a tester session or a test account */
  test: boolean;
}

const many = <T,>(sql: string, ...a: unknown[]): T[] => {
  try { return db().prepare(sql).all(...(a as never[])) as T[]; } catch { return []; /* a product's table not made yet */ }
};
const parse = <T,>(s: string | null | undefined): T | null => { try { return s ? (JSON.parse(s) as T) : null; } catch { return null; } };
const hans = (s: string) => toHans(s);

/** subscription row id → 通卡 or 会员 (comp_ is a membership we gave) */
function subKinds(): Map<number, "通卡" | "会员"> {
  return new Map(many<{ id: number; sid: string }>("SELECT id, stripe_subscription_id AS sid FROM subscriptions").map((r) => [r.id, r.sid.startsWith("pass_") ? "通卡" : "会员"]));
}
/** how a draw or a report was had: an allowance (member:<id> → 通卡／会员), money, a tester, or nothing */
function howOf(session: string | null, minor: number | null, currency: string | null, paidAt: number | null, kinds: Map<number, "通卡" | "会员">): string {
  const s = session ?? "";
  if (s.startsWith("tester:") || s.startsWith("test")) return "测试";
  if (s.startsWith("member:")) return kinds.get(Number(s.slice(7))) ?? "通卡／会员";
  if (s.startsWith("comp") || s.startsWith("grant")) return "我们送的";
  if (!paidAt && !s) return "免费";
  const c = (currency ?? "").toUpperCase();
  return minor && minor > 0 ? `付费 ${isCurrency(c) ? formatMoney(c, minor, "zh-hant") : `${c} ${(minor / 100).toFixed(2)}`}` : "免费";
}
/** 10-24 (Neil: 「为什么会有匿名呢」): the free tools need no account — a row without one gets the account its browser was
 *  signed in to (before or after), when there is one; the rest stay without a name, known only by their browser */
const RCID = (a: string) => `COALESCE(${a}.customer_id, (SELECT l.customer_id FROM browser_links l WHERE l.bid = ${a}.bid ORDER BY l.last_at DESC LIMIT 1))`;
const WHO_COLS = (a: string) => `${RCID(a)} AS cid, ${a}.customer_id IS NULL AS anon, ${a}.bid AS bid`;
const who = (r: { cid: number | null; email: string | null; anon?: number; bid?: string | null }) => ({
  customerId: r.cid, email: r.email, viaBrowser: !!r.anon && r.cid != null, browser: r.cid == null && r.bid ? r.bid.slice(0, 4) : null,
});
const TEST_SQL = (alias: string) => `(COALESCE(${alias}.paid_session, '') LIKE 'tester:%' OR COALESCE(cu.test_flag, 0) = 1)`;
const SIGN_ZH: Record<string, string> = { s: "聖筊", x: "笑筊", y: "陰筊", sheng: "聖筊", xiao: "笑筊", yin: "陰筊" };
const SYS_ZH: Record<string, string> = { bazi: "八字盘", ziwei: "紫微盘", astro: "星盘" };

/** the other products' rows since `since`, newest first, at most `limit` (all kinds, or only `only`) */
export function recentOtherProducts(since: number, limit: number, only?: readonly OtherKind[]): OtherRow[] {
  const want = new Set<OtherKind>(only ?? ["tarot", "qian", "qiuqian", "jiaobei", "bazi", "zhengyuan", "ziwei", "astro", "hepan", "nianshu", "qa"]);
  const kinds = subKinds();
  const out: OtherRow[] = [];

  if (want.has("tarot")) {
    for (const t of many<{ token: string; at: number; locale: string; question: string; spread: number; cards_json: string; paid_at: number | null; paid_session: string | null; amount_minor: number | null; currency: string | null; personal: number; fu: number; cid: number | null; anon: number; bid: string | null; email: string | null; test: number }>(
      `SELECT t.token, COALESCE(t.paid_at, t.created_at) AS at, t.locale, t.question, t.spread, t.cards_json, t.paid_at, t.paid_session, t.amount_minor, t.currency,
              t.personal_json IS NOT NULL AS personal, t.followup_q IS NOT NULL AS fu, ${WHO_COLS("t")}, cu.email, ${TEST_SQL("t")} AS test
         FROM tarot_draws t LEFT JOIN customers cu ON cu.id = ${RCID("t")}
        WHERE COALESCE(t.paid_at, t.created_at) >= ? ORDER BY at DESC LIMIT ?`, since, limit)) {
      const dealt = parse<{ id: string; rev: boolean }[]>(t.cards_json) ?? [];
      const pos = POSITIONS[(t.spread === 3 ? 3 : 1) as 1 | 3];
      const cards = dealt.map((d, i) => `${t.spread === 3 && pos[i] ? `${pos[i]}：` : ""}${cardById(d.id)?.zh ?? d.id}${d.rev ? "（逆）" : ""}`).join(" · ");
      out.push({
        kind: "tarot", at: t.at, key: `tarot:${t.token}`,
        tier: t.personal ? "个人解读" : t.paid_at ? "已付·还在写" : `免费抽牌（${t.spread === 3 ? "三张" : "单张"}）`,
        how: t.paid_at ? howOf(t.paid_session, t.amount_minor, t.currency, t.paid_at, kinds) : "免费",
        ...who(t), locale: t.locale, currency: t.paid_at ? t.currency : null,
        text: t.question || "（没写问题）", detail: hans(cards), href: `/${t.locale || "zh-hant"}/tarot/r/${t.token}`, followups: t.fu ? 1 : 0, test: !!t.test,
      });
    }
  }

  if (want.has("qian")) {
    for (const q of many<{ token: string; at: number; locale: string; set_name: string; num: number; question: string; situation: string | null; paid_at: number | null; paid_session: string | null; amount_minor: number | null; currency: string | null; personal: number; fu: number; cid: number | null; email: string | null; test: number }>(
      `SELECT q.token, COALESCE(q.personal_at, q.paid_at, q.created_at) AS at, q.locale, q.set_name, q.num, q.question, q.situation, q.paid_at, q.paid_session, q.amount_minor, q.currency,
              q.personal_json IS NOT NULL AS personal, q.followup_q IS NOT NULL AS fu, q.customer_id AS cid, cu.email, ${TEST_SQL("q")} AS test
         FROM qian_draws q LEFT JOIN customers cu ON cu.id = q.customer_id
        WHERE COALESCE(q.personal_at, q.paid_at, q.created_at) >= ? ORDER BY at DESC LIMIT ?`, since, limit)) {
      const set = qianSet(q.set_name);
      const lot = qianByNum(q.num, set.id);
      out.push({
        kind: "qian", at: q.at, key: `qian:${q.token}`,
        tier: q.personal ? "个人解读" : q.paid_at ? "已付·还在写" : "只看籤诗（免费）",
        how: q.paid_at ? howOf(q.paid_session, q.amount_minor, q.currency, q.paid_at, kinds) : "免费",
        ...who(q), locale: q.locale, currency: q.paid_at ? q.currency : null,
        text: q.question || "（没写问题）", detail: hans(`${set.short} 第 ${q.num} 籤${lot?.title ? `「${lot.title}」` : ""}${lot?.lean ? `（${lot.lean}）` : ""}`),
        href: qianResultPath(q.token), followups: q.fu ? 1 : 0, test: !!q.test,
      });
    }
  }

  // 求籤 and 擲筊 are many quick goes (10-24: 206 tosses by 35 people in a day, nearly every toss a new question) — one row
  // per person per day (Taipei), showing the newest question and result and how many goes it stands for
  const byPersonDay = <T extends { token: string; at: number; bid: string | null; cid: number | null; question: string | null }>(rows: T[]) => {
    const groups = new Map<string, { last: T; n: number; questions: Set<string> }>();
    for (const r of rows) {
      const k = `${r.cid ?? r.bid ?? r.token}|${new Date(r.at + 8 * 3_600_000).toISOString().slice(0, 10)}`;
      const g = groups.get(k) ?? { last: r, n: 0, questions: new Set<string>() };
      g.n += 1;
      if (r.question?.trim()) g.questions.add(r.question.trim());
      groups.set(k, g);
    }
    return [...groups.values()].slice(0, limit);
  };

  if (want.has("qiuqian")) {
    const rows = many<{ token: string; at: number; locale: string; bid: string | null; set_id: string; num: number; asks: number | null; redraws: number | null; question: string | null; cid: number | null; anon: number; email: string | null; test: number }>(
      `SELECT d.token, d.created_at AS at, d.locale, d.set_id, d.num, d.asks, d.redraws, d.question, ${WHO_COLS("d")}, cu.email, COALESCE(cu.test_flag, 0) AS test
         FROM qiuqian_draws d LEFT JOIN customers cu ON cu.id = ${RCID("d")}
        WHERE d.created_at >= ? ORDER BY d.created_at DESC LIMIT ?`, since, Math.max(limit * 8, 400));
    for (const { last: d, n } of byPersonDay(rows)) {
      const set = qianSet(d.set_id);
      const lot = qianByNum(d.num, set.id);
      out.push({
        kind: "qiuqian", at: d.at, key: `qiuqian:${d.token}`, tier: n > 1 ? `当天抽了 ${n} 支` : "抽籤（免费）", how: "免费",
        ...who(d), locale: d.locale, currency: null,
        text: d.question || "（没写问题）",
        detail: hans(`${n > 1 ? "最近一支：" : ""}${set.short} 第 ${d.num} 籤${lot?.title ? `「${lot.title}」` : ""}${d.asks && d.asks > 1 ? ` · 擲筊 ${d.asks} 次` : ""}${d.redraws ? ` · 重抽 ${d.redraws} 次` : ""}`),
        href: qianPath(d.num, set.id), followups: 0, test: !!d.test,
      });
    }
  }

  if (want.has("jiaobei")) {
    const rows = many<{ token: string; at: number; locale: string; bid: string | null; cid: number | null; anon: number; question: string | null; rule: number | null; seq: string | null; sign: string | null; email: string | null; test: number }>(
      `SELECT j.token, j.created_at AS at, j.locale, ${WHO_COLS("j")}, j.question, j.rule, j.seq, j.sign, cu.email, COALESCE(cu.test_flag, 0) AS test
         FROM jiaobei_asks j LEFT JOIN customers cu ON cu.id = ${RCID("j")}
        WHERE j.created_at >= ? ORDER BY j.created_at DESC LIMIT ?`, since, Math.max(limit * 8, 400));
    for (const { last: r, n, questions } of byPersonDay(rows)) {
      const tosses = r.seq ? [...r.seq].map((s) => SIGN_ZH[s] ?? s).join("、") : "";
      out.push({
        kind: "jiaobei", at: r.at, key: `jiaobei:${r.token}`,
        tier: n > 1 ? `当天擲了 ${n} 回${questions.size > 1 ? ` · ${questions.size} 个问题` : ""}` : "擲一回", how: "免费",
        ...who(r), locale: r.locale, currency: null,
        text: r.question || "（没写问题）",
        detail: `${n > 1 ? "最近一回：" : ""}${r.rule === 3 ? "要连三个聖筊" : "要一个聖筊"}${tosses ? ` · ${tosses}` : ""}${r.sign ? ` → ${SIGN_ZH[r.sign] ?? r.sign}` : ""}`,
        href: null, followups: 0, test: !!r.test,
      });
    }
  }

  // reports: paid for or had through a pass／membership; the year parts of a 年書 are the 年書
  const reports = (kind: OtherKind, table: string, sys: "bazi" | "ziwei" | "astro" | "hepan", path: string, where: string, tierOf: (k: string) => string) => {
    if (!want.has(kind)) return;
    for (const r of many<{ token: string; kind: string; at: number; locale: string; chart_json: string | null; question: string | null; written: number; status: string | null; paid_at: number | null; paid_session: string | null; amount_minor: number | null; currency: string | null; cid: number | null; email: string | null; test: number }>(
      `SELECT r.token, r.kind, COALESCE(r.paid_at, r.created_at) AS at, r.locale, r.chart_json, r.question, r.body_json IS NOT NULL AS written, r.status, r.paid_at, r.paid_session, r.amount_minor, r.currency,
              r.customer_id AS cid, cu.email, ${TEST_SQL("r")} AS test
         FROM ${table} r LEFT JOIN customers cu ON cu.id = r.customer_id
        WHERE r.paid_at IS NOT NULL AND ${where} AND r.paid_at >= ? ORDER BY r.paid_at DESC LIMIT ?`, since, limit)) {
      const chart = chartLine(sys, r.chart_json);
      out.push({
        kind, at: r.at, key: `${kind}:${r.token}`,
        tier: `${tierOf(r.kind)}${r.written ? "" : " · 还在写"}`,
        how: howOf(r.paid_session, r.amount_minor, r.currency, r.paid_at, kinds),
        ...who(r), locale: r.locale, currency: r.currency,
        text: r.question ? `问：${r.question}` : "（没写问题）", detail: chart ? hans(chart) : "", href: `/${r.locale || "zh-hant"}/${path}/r/${r.token}`, followups: 0, test: !!r.test,
      });
    }
  };
  const notInNianshu = (col: string) => `r.token NOT IN (SELECT ${col} FROM nianshu_reports WHERE ${col} IS NOT NULL)`;
  reports("bazi", "bazi_reports", "bazi", "bazi", `r.kind = 'deep' AND ${notInNianshu("bazi_token")}`, () => "深度报告");
  reports("zhengyuan", "bazi_reports", "bazi", "bazi", "r.kind = 'love'", () => "正缘画像");
  reports("ziwei", "ziwei_reports", "ziwei", "ziwei", `r.kind = 'deep' AND ${notInNianshu("ziwei_token")}`, () => "深度报告");
  reports("astro", "astro_reports", "astro", "xingpan", `r.kind = 'deep' AND ${notInNianshu("astro_token")}`, () => "深度报告");
  reports("hepan", "hepan_reports", "hepan", "hepan", "1 = 1", () => "合盘报告");

  if (want.has("nianshu")) {
    for (const r of many<{ token: string; at: number; locale: string; year: number; question: string | null; written: number; paid_at: number | null; paid_session: string | null; amount_minor: number | null; currency: string | null; chart: string | null; cid: number | null; email: string | null; test: number }>(
      `SELECT r.token, COALESCE(r.paid_at, r.created_at) AS at, r.locale, r.year, r.question, r.body_json IS NOT NULL AS written, r.paid_at, r.paid_session, r.amount_minor, r.currency,
              (SELECT b.chart_json FROM bazi_reports b WHERE b.token = r.bazi_token) AS chart, r.customer_id AS cid, cu.email, ${TEST_SQL("r")} AS test
         FROM nianshu_reports r LEFT JOIN customers cu ON cu.id = r.customer_id
        WHERE r.paid_at IS NOT NULL AND r.paid_at >= ? ORDER BY r.paid_at DESC LIMIT ?`, since, limit)) {
      const chart = chartLine("bazi", r.chart);
      out.push({
        kind: "nianshu", at: r.at, key: `nianshu:${r.token}`, tier: `${r.year} 年书${r.written ? "" : " · 还在写"}`,
        how: howOf(r.paid_session, r.amount_minor, r.currency, r.paid_at, kinds),
        ...who(r), locale: r.locale, currency: r.currency,
        text: r.question ? `问：${r.question}` : "（没写问题）", detail: chart ? hans(chart) : "", href: `/${r.locale || "zh-hant"}/nianshu/r/${r.token}`, followups: 0, test: !!r.test,
      });
    }
  }

  if (want.has("qa")) {
    for (const x of many<{ id: number; at: number; locale: string; system: string; question: string; cid: number | null; anon: number; bid: string | null; email: string | null; test: number; sub: string | null }>(
      `SELECT x.id, x.at, x.locale, x.system, x.question, ${WHO_COLS("x")}, cu.email, COALESCE(cu.test_flag, 0) AS test,
              (SELECT s.stripe_subscription_id FROM subscriptions s WHERE s.customer_id = x.customer_id AND COALESCE(s.period_start, s.created_at) <= x.at
                  AND COALESCE(s.period_end, 0) >= x.at AND s.status NOT IN ('incomplete', 'incomplete_expired') ORDER BY s.created_at DESC LIMIT 1) AS sub
         FROM mingli_qa x LEFT JOIN customers cu ON cu.id = ${RCID("x")}
        WHERE x.at >= ? ORDER BY x.at DESC LIMIT ?`, since, limit)) {
      out.push({
        kind: "qa", at: x.at, key: `qa:${x.id}`, tier: `问${SYS_ZH[x.system] ?? x.system}`,
        how: x.sub ? (x.sub.startsWith("pass_") ? "通卡" : "会员") : "免费",
        ...who(x), locale: x.locale, currency: null,
        text: x.question || "（空）", detail: "", href: x.cid ? `/admin/customers/${x.cid}#u-qa` : null, followups: 0, test: !!x.test,
      });
    }
  }

  return out.sort((a, b) => b.at - a.at).slice(0, limit);
}

/** how many of each since `since` — the filter row above the list (求籤 draws and 擲筊 tosses one by one; the list folds them per person per day) */
export function recentCounts(since: number): Record<RecentKind, number> {
  const n = (sql: string, ...a: unknown[]) => many<{ n: number }>(sql, ...a)[0]?.n ?? 0;
  const notIn = (col: string) => `token NOT IN (SELECT ${col} FROM nianshu_reports WHERE ${col} IS NOT NULL)`;
  return {
    liuyao: n("SELECT COUNT(*) AS n FROM orders WHERE created_at >= ?", since),
    tarot: n("SELECT COUNT(*) AS n FROM tarot_draws WHERE COALESCE(paid_at, created_at) >= ?", since),
    qian: n("SELECT COUNT(*) AS n FROM qian_draws WHERE COALESCE(personal_at, paid_at, created_at) >= ?", since),
    qiuqian: n("SELECT COUNT(*) AS n FROM qiuqian_draws WHERE created_at >= ?", since),
    jiaobei: n("SELECT COUNT(*) AS n FROM jiaobei_asks WHERE created_at >= ?", since),
    bazi: n(`SELECT COUNT(*) AS n FROM bazi_reports WHERE paid_at >= ? AND kind = 'deep' AND ${notIn("bazi_token")}`, since),
    zhengyuan: n("SELECT COUNT(*) AS n FROM bazi_reports WHERE paid_at >= ? AND kind = 'love'", since),
    ziwei: n(`SELECT COUNT(*) AS n FROM ziwei_reports WHERE paid_at >= ? AND kind = 'deep' AND ${notIn("ziwei_token")}`, since),
    astro: n(`SELECT COUNT(*) AS n FROM astro_reports WHERE paid_at >= ? AND kind = 'deep' AND ${notIn("astro_token")}`, since),
    hepan: n("SELECT COUNT(*) AS n FROM hepan_reports WHERE paid_at >= ?", since),
    nianshu: n("SELECT COUNT(*) AS n FROM nianshu_reports WHERE paid_at >= ?", since),
    qa: n("SELECT COUNT(*) AS n FROM mingli_qa WHERE at >= ?", since),
  };
}
