import { db } from "./db";
import { readEventsBetween, type TrackedEvent } from "./analytics-server";
import { deliveries, deliveryCounts, type DeliveryProduct, type Source } from "./deliveries";
import { chargesIn, firstDayPassFollowups } from "./admin-money";
import { qianPath, qianResultPath, QIAN_SETS, TEMPLES } from "./qian-meta";
import { cardById, dealtOf } from "./tarot";
import { qiuqianDraws } from "./qiuqian-log";
import { sourceLineFor } from "./promos";
import { recentXunwu, xunwuStats } from "./xunwu-store";
import { bmgPeople, bmgRecent } from "./bmg-store";
import { hexByKw } from "./bmg";

/**
 * 10-23 进度表 106 (Neil: 「我看不到每个产品的详细使用情况和内容」): each product's own page in the admin, after /admin/qian
 * (the one that already showed everything) — four blocks for every product:
 *   ① the trend (lib/admin-products.ts productDetail: people, deliveries by why, money — the same counting as 105);
 *   ② its funnel over the same 14 days;
 *   ③ the latest 50: when, who, why it was handed over, the reader's question or what it was about, the reader's own
 *      page, the follow-up, the revisit — rows of ours marked, never hidden;
 *   ④ its revisits and what came of them.
 * The reader's own words appear only here (admin, behind the key). Server only; read-only; every product's table may be
 * missing on a fresh database, so every read falls back to nothing.
 */

export interface DetailRow {
  at: number;
  customerId: number | null;
  test: boolean;
  /** why it was handed over (付费／通卡／会员／免费); null for what is not a reading (a toss, a lot drawn, a page) */
  source: Source | null;
  /** in a few words: 深断 / 3 张 / 第 23 籤 / 八字 深度报告 … */
  what: string;
  /** the reader's own question, or what the row was about (admin only) */
  summary: string | null;
  /** the reader's page (or the public page of the lot) */
  href: string | null;
  followup: string | null;
  revisit: string | null;
  extra: string | null;
}
export interface FunnelStep { label: string; n: number; note?: string }
export interface RevisitBlock { set: number; sent: number; answered: number; answers: { label: string; n: number }[]; note?: string }
export interface ProductBlocks { funnel: FunnelStep[]; rows: DetailRow[]; revisits: RevisitBlock | null; stats: { label: string; value: string }[]; rowsNote?: string }

const many = <T,>(sql: string, ...a: unknown[]): T[] => {
  try { return db().prepare(sql).all(...(a as never[])) as T[]; } catch { return []; }
};
const one = (sql: string, ...a: unknown[]): number => {
  try { return Number((db().prepare(sql).get(...(a as never[])) as { v: number | null } | undefined)?.v ?? 0); } catch { return 0; }
};
const TEST = (alias = "") => `(${alias}customer_id IN (SELECT id FROM customers WHERE test_flag = 1))`;
const notTest = (test: boolean, alias = "") => (test ? "1 = 1" : `NOT COALESCE(${TEST(alias)}, 0)`);
const clip = (s: string | null | undefined, n = 80) => { const t = (s ?? "").replace(/\s+/g, " ").trim(); return t ? (t.length > n ? `${t.slice(0, n - 1)}…` : t) : null; };
const ppl = (ev: TrackedEvent[], name: string, m: (x: string) => boolean) => new Set(ev.filter((e) => e.e === name && m(e.method ?? "")).map((e) => e.b ?? e.s)).size;
const day = (ms: number) => new Date(ms + 8 * 3_600_000).toISOString().slice(5, 10);

const REVISIT_WORD: Record<string, string> = { hit: "應了", partial: "部分", miss: "沒應", unclear: "不確定", open: "還沒定" };
const TAROT_ANSWER: Record<string, string> = { happened: "發生了", moving: "有動靜", nothing: "沒動靜", undecided: "還沒定" };
/** a revisit row in words: 「10-30 要问」/「已寄 10-30，没答」/「答：應了」/「到期没寄成」 */
function revisitLine(status: string | null, outcome: string | null, due: number | null, now: number): string | null {
  if (!status && !outcome) return null;
  if (outcome) return `答：${REVISIT_WORD[outcome] ?? outcome}`;
  if (status === "sent") return `已问 ${due ? day(due) : ""}，没答`;
  if (status === "pending") return due && due > now ? `${day(due)} 要问` : "已到期，信在排队";
  return status === "skipped" ? "到期没寄（过时）" : status;
}
/** the 14-day revisits of a product (the revisits table, by kind; 六爻 is kind NULL) */
function revisitBlock(kinds: (string | null)[], since: number, until: number, test: boolean): RevisitBlock {
  const k = `(${kinds.map((x) => (x === null ? "kind IS NULL" : `kind = '${x}'`)).join(" OR ")})`;
  const nt = notTest(test);
  const answers = many<{ o: string; n: number }>(`SELECT outcome AS o, COUNT(*) AS n FROM revisits WHERE ${k} AND outcome IS NOT NULL AND outcome_at >= ? AND outcome_at < ? AND ${nt} GROUP BY 1`, since, until);
  return {
    set: one(`SELECT COUNT(*) AS v FROM revisits WHERE ${k} AND created_at >= ? AND created_at < ? AND ${nt}`, since, until),
    sent: one(`SELECT COUNT(*) AS v FROM revisits WHERE ${k} AND status = 'sent' AND sent_at >= ? AND sent_at < ? AND ${nt}`, since, until),
    answered: answers.reduce((a, r) => a + r.n, 0),
    answers: ["hit", "partial", "miss", "unclear", "open"].map((o) => ({ label: REVISIT_WORD[o]!, n: answers.find((r) => r.o === o)?.n ?? 0 })).filter((x) => x.n > 0),
  };
}
const SOURCE_OF = (kind: string | null, tier: string, via: string | null): Source =>
  kind === "purchase" ? (tier.startsWith("pass_") ? "pass" : "paid") : kind === "membership" ? (via === "pass_" ? "pass" : "member") : "free";
const subKinds = () => new Map(many<{ id: number; sid: string }>("SELECT id, stripe_subscription_id AS sid FROM subscriptions").map((r) => [r.id, r.sid.startsWith("pass_") ? "pass" as const : "member" as const]));
const sessionSource = (ps: string | null, amount: number | null, kinds: Map<number, "pass" | "member">): Source => {
  const s = ps ?? "";
  if (s.startsWith("member:")) { const id = Number(/^member:(\d+)$/.exec(s)?.[1]); return (id && kinds.get(id)) || "member"; }
  return (amount ?? 0) > 0 ? "paid" : "free";
};
const setName = (id: string) => QIAN_SETS.find((x) => x.id === id)?.short ?? id;
const templeName = (id: string) => TEMPLES.find((x) => x.id === id)?.name ?? id;

type Ctx = { since: number; until: number; now: number; test: boolean; limit: number; ev: () => TrackedEvent[] };

function deliveredFunnel(product: DeliveryProduct, c: Ctx): number {
  return deliveryCounts(c.since, c.until, { products: [product], test: c.test }).byProduct[product].total;
}

/* ---------------- the seventeen ---------------- */

function liuyao(c: Ctx): ProductBlocks {
  const rows = many<{ sid: string; at: number; cid: number | null; tier: string; kind: string | null; locale: string | null; q: string | null; hex: string | null; fu: number; rs: string | null; ro: string | null; rd: number | null; via: string | null; test: number }>(
    `SELECT o.session_id AS sid, o.created_at AS at, o.customer_id AS cid, o.tier, o.entitlement_kind AS kind, c.locale, c.question AS q,
            c.primary_name || COALESCE(' → ' || c.changed_name, '') AS hex,
            (SELECT COUNT(*) FROM followups f WHERE f.cast_id = o.cast_id AND f.role = 'user') AS fu,
            r.status AS rs, r.outcome AS ro, r.due_at AS rd, substr(s.stripe_subscription_id, 1, 5) AS via,
            (COALESCE(o.test_flag, 0) = 1 OR COALESCE(${TEST("o.")}, 0)) AS test
       FROM orders o LEFT JOIN casts c ON c.id = o.cast_id LEFT JOIN revisits r ON r.session_id = o.session_id
       LEFT JOIN sub_uses u ON substr(o.session_id, 1, 4) = 'sub_' AND u.token = substr(o.session_id, 5)
       LEFT JOIN subscriptions s ON s.id = u.subscription_id
      WHERE (o.tier IN ('deep', 'one', 'light') OR (substr(o.tier, 1, 5) = 'pass_' AND o.cast_id IS NOT NULL))
        AND (? OR (COALESCE(o.test_flag, 0) = 0 AND NOT COALESCE(${TEST("o.")}, 0)))
      ORDER BY o.created_at DESC LIMIT ?`, c.test ? 1 : 0, c.limit);
  const casts = one("SELECT COUNT(*) AS v FROM cast_log WHERE at >= ? AND at < ?", c.since, c.until);
  const ch = chargesIn(c.since, c.until);
  const rv = revisitBlock([null], c.since, c.until, c.test);
  return {
    funnel: [
      { label: "起卦", n: casts, note: "起卦日志，每一卦" },
      { label: "拿到解读", n: deliveredFunnel("liuyao", c), note: "付费、通卡、会员、免费层都算" },
      { label: "付费", n: ch.liuyao, note: "起卦页买的单＋带卦买的通卡" },
      { label: "回访寄出", n: rv.sent },
      { label: "回答", n: rv.answered },
    ],
    rows: rows.map((r) => ({
      at: r.at, customerId: r.cid, test: !!r.test, source: SOURCE_OF(r.kind, r.tier, r.via),
      what: r.tier.startsWith("pass_") ? "深断（随通卡）" : r.tier === "deep" ? "深断" : "轻解读",
      summary: clip(r.q), href: `/${r.locale ?? "zh-hant"}/reading?sid=${encodeURIComponent(r.sid)}`,
      followup: r.fu ? `追问 ${r.fu}` : null, revisit: revisitLine(r.rs, r.ro, r.rd, c.now), extra: r.hex,
    })),
    revisits: rv, stats: [],
  };
}

function jiaobei(c: Ctx): ProductBlocks {
  const SIGN: Record<string, string> = { sheng: "聖筊", xiao: "笑筊", yin: "陰筊" };
  const rows = many<{ at: number; cid: number | null; q: string; rule: number; seq: string; sign: string; cast_id: number | null; test: number }>(
    `SELECT created_at AS at, customer_id AS cid, question AS q, rule, seq, sign, cast_id, COALESCE(${TEST()}, 0) AS test FROM jiaobei_asks
      WHERE ${notTest(c.test)} ORDER BY created_at DESC LIMIT ?`, c.limit);
  const ev = c.ev();
  const signs = many<{ s: string; n: number }>(`SELECT sign AS s, COUNT(*) AS n FROM jiaobei_asks WHERE created_at >= ? AND created_at < ? AND ${notTest(c.test)} GROUP BY 1`, c.since, c.until);
  return {
    funnel: [
      { label: "擲筊的人", n: ppl(ev, "jiaobei", (m) => m.startsWith("ask")) },
      { label: "写下那件事的", n: one(`SELECT COUNT(*) AS v FROM jiaobei_asks WHERE created_at >= ? AND created_at < ? AND ${notTest(c.test)}`, c.since, c.until), note: "次数；没写事的不留记录" },
      { label: "转去求籤", n: ppl(ev, "jiaobei", (m) => m === "to_qiuqian") },
      { label: "转去起卦", n: ppl(ev, "jiaobei", (m) => m.startsWith("to_cast")) },
    ],
    rows: rows.map((r) => ({
      at: r.at, customerId: r.cid, test: !!r.test, source: null,
      what: `${r.rule === 3 ? "连三次" : "一次"} · ${SIGN[r.sign] ?? r.sign}`, summary: clip(r.q), href: null,
      followup: null, revisit: null, extra: `擲了 ${r.seq.length} 次（${[...r.seq].map((x) => ({ s: "聖", x: "笑", y: "陰" }[x] ?? x)).join("")}）${r.cast_id ? " · 之后起了卦" : ""}`,
    })),
    revisits: null,
    stats: [{ label: "怎么收的尾", value: signs.map((x) => `${SIGN[x.s] ?? x.s} ${x.n}`).join(" · ") || "—" }],
  };
}

function qiuqian(c: Ctx): ProductBlocks {
  const ev = c.ev();
  const all = qiuqianDraws(0, c.now + 1, 2000);
  const rows = all.filter((r) => c.test || !r.customer_id || !testIds().has(r.customer_id)).slice(0, c.limit);
  const inWin = all.filter((r) => r.created_at >= c.since && r.created_at < c.until);
  const top = [...inWin.reduce((m, r) => m.set(`${setName(r.set_id)} 第 ${r.num} 籤`, (m.get(`${setName(r.set_id)} 第 ${r.num} 籤`) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]).slice(0, 5);
  return {
    funnel: [
      { label: "开始请示", n: ppl(ev, "jiaobei", (m) => m.startsWith("qq_request")) },
      { label: "请示到", n: ppl(ev, "jiaobei", (m) => m === "qq_request:ok") },
      { label: "抽到籤", n: ppl(ev, "jiaobei", (m) => m === "qq_draw") },
      { label: "确认籤号", n: ppl(ev, "jiaobei", (m) => m === "qq_done") },
    ],
    rows: rows.map((r) => ({
      at: r.created_at, customerId: r.customer_id, test: !!r.customer_id && testIds().has(r.customer_id), source: null,
      what: `${setName(r.set_id)} 第 ${r.num} 籤`, summary: r.question, href: qianPath(r.num, r.set_id),
      followup: null, revisit: null, extra: `${templeName(r.temple)} · 请示 ${r.asks} 次${r.redraws ? ` · 放回 ${r.redraws} 支` : ""}`,
    })),
    rowsNote: "10-23 起才记进库（以前只有「抽到并确认」的事件）",
    revisits: null,
    stats: [{ label: "14 天里抽得最多的", value: top.map(([k, n]) => `${k} ×${n}`).join(" · ") || "—" }],
  };
}

function jieqian(c: Ctx): ProductBlocks {
  const kinds = subKinds();
  const rows = many<{ token: string; at: number; cid: number | null; set_name: string; num: number; situation: string; q: string; ps: string | null; amount: number | null; personal: number; fq: string | null; cast_id: number | null; temple: string | null; test: number }>(
    `SELECT token, created_at AS at, customer_id AS cid, set_name, num, situation, question AS q, paid_session AS ps, amount_minor AS amount,
            personal_json IS NOT NULL AS personal, followup_q AS fq, cast_id, temple, COALESCE(${TEST()}, 0) AS test
       FROM qian_draws WHERE ${notTest(c.test)} ORDER BY created_at DESC LIMIT ?`, c.limit);
  const nt = notTest(c.test);
  return {
    funnel: [
      { label: "解籤", n: one(`SELECT COUNT(*) AS v FROM qian_draws WHERE created_at >= ? AND created_at < ? AND ${nt}`, c.since, c.until) },
      { label: "拿到个人解读", n: deliveredFunnel("jieqian", c) },
      { label: "付费", n: one(`SELECT COUNT(*) AS v FROM qian_draws WHERE paid_at >= ? AND paid_at < ? AND COALESCE(amount_minor, 0) > 0 AND ${nt}`, c.since, c.until) },
      { label: "用了追问", n: one(`SELECT COUNT(*) AS v FROM qian_draws WHERE followup_at >= ? AND followup_at < ? AND ${nt}`, c.since, c.until) },
      { label: "之后起卦", n: one(`SELECT COUNT(*) AS v FROM qian_draws WHERE created_at >= ? AND created_at < ? AND cast_id IS NOT NULL AND ${nt}`, c.since, c.until) },
    ],
    rows: rows.map((r) => ({
      at: r.at, customerId: r.cid, test: !!r.test, source: r.personal ? sessionSource(r.ps, r.amount, kinds) : null,
      what: `${r.set_name} 第 ${r.num} 籤`, summary: clip(r.q), href: qianResultPath(r.token),
      followup: r.fq ? `追问：${clip(r.fq, 40)}` : null, revisit: null,
      extra: [r.situation, r.temple ? templeName(r.temple) : null, r.personal ? "有个人解读" : null, r.cast_id ? "之后起了卦" : null].filter(Boolean).join(" · ") || null,
    })),
    revisits: null, stats: [{ label: "更多", value: "籤系、处境、拍照认籤、同一件事：/admin/qian" }],
  };
}

function tarot(c: Ctx): ProductBlocks {
  const kinds = subKinds();
  const rows = many<{ token: string; at: number; cid: number | null; q: string; spread: number; cards_json: string; locale: string; ps: string | null; amount: number | null; personal: number; fq: string | null; due: number | null; sent: number | null; ans: string | null; test: number }>(
    `SELECT token, created_at AS at, customer_id AS cid, question AS q, spread, cards_json, locale, paid_session AS ps, amount_minor AS amount,
            personal_json IS NOT NULL AS personal, followup_q AS fq, revisit_due AS due, revisit_sent_at AS sent, revisit_answer AS ans,
            (COALESCE(paid_session, '') LIKE 'tester:%' OR COALESCE(${TEST()}, 0)) AS test
       FROM tarot_draws WHERE ${c.test ? "1 = 1" : `COALESCE(paid_session, '') NOT LIKE 'tester:%' AND NOT COALESCE(${TEST()}, 0)`} ORDER BY created_at DESC LIMIT ?`, c.limit);
  const nt = c.test ? "1 = 1" : `NOT COALESCE(${TEST()}, 0)`;
  const answers = many<{ a: string; n: number }>(`SELECT revisit_answer AS a, COUNT(*) AS n FROM tarot_draws WHERE revisit_answer_at >= ? AND revisit_answer_at < ? AND ${nt} GROUP BY 1`, c.since, c.until);
  const rv: RevisitBlock = {
    set: one(`SELECT COUNT(*) AS v FROM tarot_draws WHERE revisit_due IS NOT NULL AND created_at >= ? AND created_at < ? AND ${nt}`, c.since, c.until),
    sent: one(`SELECT COUNT(*) AS v FROM tarot_draws WHERE revisit_sent_at >= ? AND revisit_sent_at < ? AND ${nt}`, c.since, c.until),
    answered: answers.reduce((a, r) => a + r.n, 0),
    answers: answers.map((r) => ({ label: TAROT_ANSWER[r.a] ?? r.a, n: r.n })),
    note: "读者自己说的事实，不对照牌面判对错",
  };
  return {
    funnel: [
      { label: "抽牌", n: one(`SELECT COUNT(*) AS v FROM tarot_draws WHERE created_at >= ? AND created_at < ? AND ${nt}`, c.since, c.until) },
      { label: "拿到个人解读", n: deliveredFunnel("tarot", c) },
      { label: "付费", n: one(`SELECT COUNT(*) AS v FROM tarot_draws WHERE paid_at >= ? AND paid_at < ? AND COALESCE(amount_minor, 0) > 0 AND ${nt}`, c.since, c.until) },
      { label: "设了回访", n: rv.set },
      { label: "回访寄出", n: rv.sent },
      { label: "回答", n: rv.answered },
    ],
    rows: rows.map((r) => ({
      at: r.at, customerId: r.cid, test: !!r.test, source: r.personal ? sessionSource(r.ps, r.amount, kinds) : null,
      what: `${r.spread} 张`, summary: clip(r.q), href: `/${r.locale || "zh-hant"}/tarot/r/${r.token}`,
      followup: r.fq ? `追问：${clip(r.fq, 40)}` : null,
      revisit: r.ans ? `答：${TAROT_ANSWER[r.ans] ?? r.ans}` : r.sent ? "已问，没答" : r.due ? `${day(r.due)} 要问` : null,
      extra: dealtOf({ cards_json: r.cards_json }).map((x) => `${cardById(x.id)?.zh ?? x.id}${x.rev ? "（逆）" : ""}`).join("、") || null,
    })),
    revisits: rv, stats: [],
  };
}

function todayQian(c: Ctx): ProductBlocks {
  const rows = many<{ subject: string; d: string; set_id: string; num: number; at: number }>(
    "SELECT subject, day AS d, set_id, num, at FROM tq_draws ORDER BY at DESC LIMIT ?", c.limit);
  const perDay = many<{ d: string; n: number; top: string | null }>(
    `SELECT day AS d, COUNT(*) AS n, (SELECT t.set_id || ':' || t.num FROM tq_draws t WHERE t.day = q.day GROUP BY t.set_id, t.num ORDER BY COUNT(*) DESC LIMIT 1) AS top
       FROM tq_draws q WHERE at >= ? AND at < ? GROUP BY day ORDER BY day DESC LIMIT 14`, c.since, c.until);
  const cid = (subject: string) => (subject.startsWith("c:") ? Number(subject.slice(2)) || null : null);
  return {
    funnel: [
      { label: "抽籤的人", n: one("SELECT COUNT(DISTINCT subject) AS v FROM tq_draws WHERE at >= ? AND at < ?", c.since, c.until) },
      { label: "隔天又来", n: one("SELECT COUNT(*) AS v FROM (SELECT subject FROM tq_draws WHERE at >= ? AND at < ? GROUP BY subject HAVING COUNT(DISTINCT day) >= 2)", c.since, c.until) },
      { label: "收今日一籤信", n: one("SELECT COUNT(*) AS v FROM tq_prefs WHERE mail = 1 AND subject LIKE 'c:%'"), note: "现在的人数" },
    ],
    rows: rows.map((r) => ({
      at: r.at, customerId: cid(r.subject), test: false, source: null, what: `${setName(r.set_id)} 第 ${r.num} 籤`, summary: null,
      href: qianPath(r.num, r.set_id), followup: null, revisit: null, extra: `${r.d}${cid(r.subject) ? "" : " · 没登录"}`,
    })),
    revisits: null,
    stats: [{ label: "每天抽得最多的一支", value: perDay.map((x) => { const [s, n] = (x.top ?? ":").split(":"); return `${x.d.slice(5)} ${setName(s ?? "")} 第 ${n} 籤（${x.n} 人抽）`; }).join(" · ") || "—" }],
  };
}

function huangli(c: Ctx): ProductBlocks {
  const ev = c.ev().filter((e) => e.e === "huangli");
  const terms = [...ev.filter((e) => (e.method ?? "").startsWith("term:")).reduce((m, e) => m.set((e.method ?? "").slice(5), (m.get((e.method ?? "").slice(5)) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const outs = [...ev.filter((e) => (e.method ?? "").startsWith("to_")).reduce((m, e) => m.set(e.method!, (m.get(e.method!) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]).slice(0, 6);
  return {
    funnel: [
      { label: "来看的人", n: ppl(ev, "huangli", (m) => m.startsWith("view")) },
      { label: "点了宜忌的词", n: ppl(ev, "huangli", (m) => m.startsWith("term:")) },
      { label: "转去别的产品", n: ppl(ev, "huangli", (m) => m.startsWith("to_")) },
    ],
    rows: [], rowsNote: "黄历不留逐人记录，只有页面事件",
    revisits: null,
    stats: [{ label: "点得最多的词", value: terms.map(([k, n]) => `${k} ${n}`).join(" · ") || "—" }, { label: "转去哪里", value: outs.map(([k, n]) => `${k.slice(3)} ${n}`).join(" · ") || "—" }],
  };
}

function zeri(c: Ctx): ProductBlocks {
  const ev = c.ev().filter((e) => e.e === "zeri");
  const q = ev.filter((e) => (e.method ?? "").startsWith("query:")).map((e) => (e.method ?? "").split(":"));
  const things = [...q.reduce((m, p) => m.set(p[1] ?? "?", (m.get(p[1] ?? "?") ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const spans = [...q.reduce((m, p) => m.set(`${p[3] ?? "?"} 天`, (m.get(`${p[3] ?? "?"} 天`) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const rows = many<{ at: number; ymd: string; slug: string; sent: number | null; cancelled: number | null; email: string | null }>(
    "SELECT created_at AS at, ymd, slug, sent_at AS sent, cancelled_at AS cancelled, email FROM zeri_reminds ORDER BY created_at DESC LIMIT ?", c.limit);
  const rv = revisitBlock(["zeri"], c.since, c.until, c.test);
  return {
    funnel: [
      { label: "来看的人", n: ppl(ev, "zeri", (m) => m.startsWith("view") || m.startsWith("query")) },
      { label: "查了日子", n: ppl(ev, "zeri", (m) => m.startsWith("query")) },
      { label: "设了提醒", n: one("SELECT COUNT(*) AS v FROM zeri_reminds WHERE created_at >= ? AND created_at < ?", c.since, c.until), note: "次数" },
      { label: "设了回访", n: rv.set },
    ],
    rows: rows.map((r) => ({
      at: r.at, customerId: null, test: false, source: null, what: `提醒 ${r.ymd}`, summary: r.slug, href: null, followup: null,
      revisit: null, extra: r.cancelled ? "已取消" : r.sent ? "已寄提醒" : "等着寄",
    })),
    rowsNote: "下面是设了提醒的（查日子本身只有页面事件）",
    revisits: rv,
    stats: [{ label: "查的事项", value: things.map(([k, n]) => `${k} ${n}`).join(" · ") || "—" }, { label: "看几天", value: spans.map(([k, n]) => `${k} ${n}`).join(" · ") || "—" }],
  };
}

function yunshi(c: Ctx): ProductBlocks {
  const ev = c.ev().filter((e) => e.e === "yunshi");
  const signs = [...ev.filter((e) => (e.method ?? "").startsWith("view:") && e.method !== "view:all").reduce((m, e) => m.set((e.method ?? "").slice(5), (m.get((e.method ?? "").slice(5)) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const mine = (m: string) => ev.filter((e) => e.method === m).length;
  return {
    funnel: [
      { label: "来看的人", n: ppl(ev, "yunshi", (m) => m.startsWith("view")) },
      { label: "看了某个生肖", n: ppl(ev, "yunshi", (m) => m.startsWith("view:") && m !== "view:all") },
      { label: "转去起卦", n: ppl(ev, "yunshi", (m) => m === "to_cast") },
    ],
    rows: [], rowsNote: "运势不留逐人记录，只有页面事件",
    revisits: null,
    stats: [
      { label: "生肖分布（次）", value: signs.map(([k, n]) => `${k} ${n}`).join(" · ") || "—" },
      { label: "会员「你的今天」", value: `显示 ${mine("mine:shown")} 次 · 缺生辰 ${mine("mine:need")} · 非会员看到介绍 ${mine("mine:teaser")}（10-23 起记）` },
    ],
  };
}

function reports(product: "bazi" | "ziwei" | "astro" | "zhengyuan", c: Ctx): ProductBlocks {
  const table = product === "ziwei" ? "ziwei_reports" : product === "astro" ? "astro_reports" : "bazi_reports";
  const where = product === "zhengyuan" ? "kind = 'love'" : product === "bazi" ? "kind <> 'love'" : "1 = 1";
  const path = product === "ziwei" ? "ziwei" : product === "astro" ? "xingpan" : "bazi";
  const system = product === "ziwei" ? "ziwei" : product === "astro" ? "astro" : "bazi";
  const kinds = subKinds();
  const KIND: Record<string, string> = { deep: "深度报告", love: "正缘画像", year: "流年（年书的一部分）" };
  const rows = many<{ token: string; at: number; cid: number | null; kind: string; locale: string; ps: string | null; amount: number | null; written: number; q: string | null; rw: number | null; rv: string | null; ro: string | null; rd: number | null; test: number }>(
    `SELECT t.token, t.created_at AS at, t.customer_id AS cid, t.kind, t.locale, t.paid_session AS ps, t.amount_minor AS amount, t.body_json IS NOT NULL AS written, t.question AS q,
            (SELECT MAX(w.at) FROM report_rewrites w WHERE w.customer_id = t.customer_id AND w.system = '${system}') AS rw,
            r.status AS rv, r.outcome AS ro, r.due_at AS rd,
            (COALESCE(t.paid_session, '') LIKE 'tester:%' OR COALESCE(${TEST("t.")}, 0)) AS test
       FROM ${table} t LEFT JOIN revisits r ON r.session_id = 'self:${system === "astro" ? "astro" : system}:' || t.token
      WHERE ${where.replace(/kind/g, "t.kind")} AND (t.paid_at IS NOT NULL OR t.body_json IS NOT NULL)
        AND ${c.test ? "1 = 1" : `COALESCE(t.paid_session, '') NOT LIKE 'tester:%' AND NOT COALESCE(${TEST("t.")}, 0)`}
      ORDER BY t.created_at DESC LIMIT ?`, c.limit);
  const ev = c.ev();
  const rv = product === "zhengyuan" ? null : revisitBlock([system], c.since, c.until, c.test);
  const written = deliveredFunnel(product, c);
  const eventName = product === "zhengyuan" ? "bazi" : product;
  return {
    funnel: [
      ...(product === "zhengyuan" ? [] : [{ label: "排盘的人", n: ppl(ev, eventName, (m) => m.startsWith("chart")) }]),
      { label: "写好的报告", n: written, note: "通卡、会员、单买" },
      ...(rv ? [{ label: "设了回访", n: rv.set }, { label: "回访寄出", n: rv.sent }, { label: "回答", n: rv.answered }] : []),
    ],
    rows: rows.map((r) => ({
      at: r.at, customerId: r.cid, test: !!r.test, source: sessionSource(r.ps, r.amount, kinds), what: KIND[r.kind] ?? r.kind, summary: clip(r.q),
      href: `/${r.locale || "zh-hant"}/${path}/r/${r.token}`, followup: null, revisit: revisitLine(r.rv, r.ro, r.rd, c.now),
      extra: [r.written ? null : "还没写完", r.rw ? `月更 ${day(r.rw)}` : null].filter(Boolean).join(" · ") || null,
    })),
    revisits: rv, stats: [],
  };
}

function qa(c: Ctx): ProductBlocks {
  const SYS: Record<string, string> = { bazi: "八字", ziwei: "紫微", astro: "星盘" };
  const rows = many<{ at: number; cid: number | null; bid: string | null; system: string; q: string; a: string; test: number }>(
    `SELECT at, customer_id AS cid, bid, system, question AS q, answer AS a, COALESCE(${TEST()}, 0) AS test FROM mingli_qa WHERE ${notTest(c.test)} ORDER BY at DESC LIMIT ?`, c.limit);
  const per = many<{ s: string; n: number; p: number }>(`SELECT system AS s, COUNT(*) AS n, COUNT(DISTINCT COALESCE(CAST(customer_id AS TEXT), bid)) AS p FROM mingli_qa WHERE at >= ? AND at < ? AND ${notTest(c.test)} GROUP BY 1`, c.since, c.until);
  return {
    funnel: [
      { label: "问的人", n: one(`SELECT COUNT(DISTINCT COALESCE(CAST(customer_id AS TEXT), bid)) AS v FROM mingli_qa WHERE at >= ? AND at < ? AND ${notTest(c.test)}`, c.since, c.until) },
      { label: "问题", n: one(`SELECT COUNT(*) AS v FROM mingli_qa WHERE at >= ? AND at < ? AND ${notTest(c.test)}`, c.since, c.until) },
    ],
    rows: rows.map((r) => ({
      at: r.at, customerId: r.cid, test: !!r.test, source: null, what: SYS[r.system] ?? r.system, summary: clip(r.q, 120), href: null,
      followup: null, revisit: null, extra: clip(r.a, 120),
    })),
    revisits: null,
    stats: [{ label: "按盘", value: per.map((x) => `${SYS[x.s] ?? x.s} ${x.n} 问（${x.p} 人）`).join(" · ") || "—" }],
  };
}

function bought(product: "hepan" | "nianshu", c: Ctx): ProductBlocks {
  const table = `${product}_reports`;
  const kinds = subKinds();
  const rows = many<{ token: string; at: number; cid: number | null; locale: string; ps: string | null; amount: number | null; currency: string | null; written: number; paid: number | null; q: string | null; year?: number; test: number }>(
    `SELECT token, created_at AS at, customer_id AS cid, locale, paid_session AS ps, amount_minor AS amount, currency, body_json IS NOT NULL AS written, paid_at AS paid, question AS q${product === "nianshu" ? ", year" : ""},
            (COALESCE(paid_session, '') LIKE 'tester:%' OR COALESCE(${TEST()}, 0)) AS test
       FROM ${table} WHERE ${c.test ? "1 = 1" : `COALESCE(paid_session, '') NOT LIKE 'tester:%' AND NOT COALESCE(${TEST()}, 0)`} ORDER BY created_at DESC LIMIT ?`, c.limit);
  const ev = c.ev();
  const nt = c.test ? "1 = 1" : `NOT COALESCE(${TEST()}, 0)`;
  return {
    funnel: [
      { label: "来看的人", n: ppl(ev, product, (m) => m === "view" || m.startsWith("view")) },
      ...(product === "hepan" ? [{ label: "配了两人的盘", n: ppl(ev, "hepan", (m) => m.startsWith("pair")) }] : [{ label: "选了年份", n: ppl(ev, "nianshu", (m) => m.startsWith("pick")) }]),
      { label: "付费", n: one(`SELECT COUNT(*) AS v FROM ${table} WHERE paid_at >= ? AND paid_at < ? AND COALESCE(amount_minor, 0) > 0 AND ${nt}`, c.since, c.until) },
      { label: "写好", n: deliveredFunnel(product, c) },
    ],
    rows: rows.map((r) => ({
      at: r.at, customerId: r.cid, test: !!r.test, source: r.paid ? sessionSource(r.ps, r.amount, kinds) : null,
      what: product === "nianshu" ? `${r.year ?? ""} 年书` : "合盘", summary: clip(r.q), href: `/${r.locale || "zh-hant"}/${product}/r/${r.token}`,
      followup: null, revisit: null, extra: !r.paid ? "没付" : r.written ? "已付·写好" : "已付·没写完",
    })),
    revisits: product === "nianshu" ? revisitBlock(["nianshu"], c.since, c.until, c.test) : null, stats: [],
  };
}

function tongka(c: Ctx): ProductBlocks {
  const rows = many<{ at: number; cid: number; sid: string; status: string; plan: string; days: number | null; amount: number | null; currency: string | null; pe: number | null; test: number }>(
    `SELECT created_at AS at, customer_id AS cid, stripe_subscription_id AS sid, status, plan, pass_days AS days, amount_minor AS amount, currency, period_end AS pe, COALESCE(${TEST()}, 0) AS test
       FROM subscriptions WHERE (substr(stripe_subscription_id, 1, 5) = 'pass_' OR substr(stripe_subscription_id, 1, 4) = 'sub_' OR substr(stripe_subscription_id, 1, 5) = 'comp_') AND ${notTest(c.test)}
      ORDER BY created_at DESC LIMIT ?`, c.limit);
  const f = firstDayPassFollowups();
  const ch = chargesIn(c.since, c.until);
  const money = (a: number | null, cur: string | null) => (a && cur ? `${cur.toUpperCase()} ${(a / (["JPY", "KRW"].includes(cur.toUpperCase()) ? 1 : 100)).toFixed(["JPY", "KRW"].includes(cur.toUpperCase()) ? 0 : 2)}` : "—");
  return {
    funnel: [
      { label: "买通卡", n: ch.passes.n, note: `1 日 ${ch.passes.d1} · 7 天 ${ch.passes.d7} · 30 天 ${ch.passes.d30}` },
      { label: "开会员", n: ch.members },
      { label: "首张 1 日卡（全部）", n: f.first },
      { label: "→ 再买通卡", n: f.repass },
      { label: "→ 开会员", n: f.member },
    ],
    rows: rows.map((r) => {
      const pass = r.sid.startsWith("pass_");
      const comp = r.sid.startsWith("comp_");
      const what = comp ? "会员 · 赠送" : pass ? (r.days === 1 ? "1 日通卡" : r.days === 7 ? "7 天通卡" : "30 天通卡") : r.plan === "year" ? "会员 · 年付" : "会员 · 月付";
      return {
        at: r.at, customerId: r.cid, test: !!r.test, source: null, what, summary: null, href: null, followup: null, revisit: null,
        extra: `${comp ? "" : `${money(r.amount, r.currency)} · `}${r.status}${r.pe ? ` · 到 ${day(r.pe)}` : ""}`,
      };
    }),
    revisits: null,
    stats: [{ label: "更多", value: "在用的通卡与会员、关续订、首次保证：/admin/members" }],
  };
}

/* 10-29 进度表 122–125 (Neil: 这几个产品上线，推广也要带上): 姓名學（免費查詢＋取名／改名參考）、解夢、犯太歲 */
function name(c: Ctx): ProductBlocks {
  const ev = c.ev().filter((e) => e.e === "name");
  const rows = many<{ token: string; at: number; cid: number | null; locale: string; kind: string; ps: string | null; amount: number | null; currency: string | null; written: number; paid: number | null; status: string; test: number }>(
    `SELECT token, created_at AS at, customer_id AS cid, locale, kind, paid_session AS ps, amount_minor AS amount, currency, body_json IS NOT NULL AS written, paid_at AS paid, status,
            (COALESCE(paid_session, '') LIKE 'tester:%' OR COALESCE(${TEST()}, 0)) AS test
       FROM name_reports WHERE ${c.test ? "1 = 1" : `COALESCE(paid_session, '') NOT LIKE 'tester:%' AND NOT COALESCE(${TEST()}, 0)`} ORDER BY created_at DESC LIMIT ?`, c.limit);
  const nt = c.test ? "1 = 1" : `COALESCE(paid_session, '') NOT LIKE 'tester:%' AND NOT COALESCE(${TEST()}, 0)`;
  const kinds = subKinds();
  return {
    funnel: [
      { label: "来看查询页的人", n: ppl(ev, "name", (m) => m === "view") },
      { label: "查了名字", n: ppl(ev, "name", (m) => m.startsWith("read")) },
      { label: "加了生辰对照喜用", n: ppl(ev, "name", (m) => m === "read:birth" || m === "birth") },
      { label: "看了字页", n: ppl(ev, "name", (m) => m === "zi") },
      { label: "点了购买", n: ppl(ev, "name", (m) => m.startsWith("buy:") && m !== "buy:tester") },
      { label: "付费（取名＋改名）", n: one(`SELECT COUNT(*) AS v FROM name_reports WHERE paid_at >= ? AND paid_at < ? AND COALESCE(amount_minor, 0) > 0 AND ${nt}`, c.since, c.until) },
    ],
    rows: rows.map((r) => ({
      at: r.at, customerId: r.cid, test: !!r.test, source: r.paid ? sessionSource(r.ps, r.amount, kinds) : null,
      what: r.kind === "rename" ? "改名参考" : "宝宝取名参考", summary: null, href: `/${r.locale || "zh-hant"}/name/r/${r.token}`,
      followup: null, revisit: null, extra: !r.paid ? "没付" : r.written ? "已付·写好" : r.status === "incomplete" ? "已付·没写成（等补写）" : "已付·没写完",
    })),
    revisits: null, stats: [],
  };
}
function dream(c: Ctx): ProductBlocks {
  const ev = c.ev().filter((e) => e.e === "dream");
  const top = [...ev.filter((e) => (e.method ?? "").startsWith("view:")).reduce((m, e) => m.set((e.method ?? "").slice(5), (m.get((e.method ?? "").slice(5)) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]).slice(0, 10);
  return {
    funnel: [
      { label: "来看的人", n: ppl(ev, "dream", (m) => m === "index" || m.startsWith("view:")) },
      { label: "看了某个梦", n: ppl(ev, "dream", (m) => m.startsWith("view:")) },
      { label: "转去起卦", n: ppl(ev, "dream", (m) => m.startsWith("to_cast")) },
    ],
    rows: [], rowsNote: "解梦不留逐人记录，只有页面事件",
    revisits: null,
    stats: [{ label: "看得最多的梦（次）", value: top.map(([k, n]) => `${k} ${n}`).join(" · ") || "—" }],
  };
}
function taisui(c: Ctx): ProductBlocks {
  const ev = c.ev().filter((e) => e.e === "taisui");
  const signs = [...ev.filter((e) => (e.method ?? "").startsWith("view:")).reduce((m, e) => m.set((e.method ?? "").slice(5), (m.get((e.method ?? "").slice(5)) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  return {
    funnel: [
      { label: "来看的人", n: ppl(ev, "taisui", (m) => m === "view" || m.startsWith("view:")) },
      { label: "看了某个生肖", n: ppl(ev, "taisui", (m) => m.startsWith("view:")) },
    ],
    rows: [], rowsNote: "犯太岁不留逐人记录，只有页面事件（转去年书的人看年书产品页的来源 ?c=）",
    revisits: null,
    stats: [{ label: "生肖分布（次）", value: signs.map(([k, n]) => `${k} ${n}`).join(" · ") || "—" }],
  };
}

/** 10-29 进度表 127 尋物: casts by category and band; 六爻細看 → 登入起卦 → 解讀 → 深斷; revisits by band — counts only */
const XW_CAT: Record<string, string> = { doc: "证件文书", wallet: "钱包卡片", keys: "钥匙", phone: "手机3C", jewelry: "首饰", clothes: "衣物包包", other: "其他" };
const XW_TIER: Record<string, string> = { easy: "比较容易", medium: "要花点时间", hard: "不容易自己出现" };
const XW_PLACE: Record<string, string> = { home: "在家", out: "在外", unsure: "不确定" };
function xunwu(c: Ctx): ProductBlocks {
  const s = xunwuStats(c.since, c.until, c.test);
  const ev = c.ev().filter((e) => e.e === "xunwu");
  const line = (m: Record<string, number>, names: Record<string, string>) => Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${names[k] ?? k} ${n}`).join(" · ") || "—";
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
  return {
    funnel: [
      { label: "来看的人", n: ppl(ev, "xunwu", (m) => m === "view") },
      { label: "擲了骰子（人）", n: s.people, note: `共 ${s.casts} 次；同一件事再擲 ${ev.filter((e) => e.method === "same").length} 次（看第一次）` },
      { label: "点「用六爻細看」", n: s.clicked, note: pct(s.clicked, s.casts) },
      { label: "登入后起了卦", n: s.castAfter },
      { label: "看了解读", n: s.reading },
      { label: "看了深断（付费／通卡／会员）", n: s.deep, note: `对照调研站内寻物题约 46%：${pct(s.deep, s.castAfter)}` },
    ],
    rows: recentXunwu(c.limit, c.test).map((r) => ({
      at: r.created_at, customerId: r.customer_id, test: false, source: null,
      what: `${XW_CAT[r.cat] ?? r.cat} · ${XW_PLACE[r.place] ?? r.place}`, summary: `${XW_TIER[r.tier] ?? r.tier} · 卦 ${r.hex}→${r.changed}`,
      href: null, followup: r.click_at ? "点了六爻细看" : null, revisit: r.back === "found" ? "答：找到了" : r.back === "not" ? "答：还没" : null, extra: r.cast_id ? `起卦 #${r.cast_id}` : null,
    })),
    rowsNote: "免登录：只记类别、最后在哪、多久、点数和结果；东西的名字只存在读者的浏览器",
    revisits: null,
    stats: [
      { label: "类别", value: line(s.byCat, XW_CAT) },
      { label: "档位", value: line(s.byTier, XW_TIER) },
      { label: "最后在哪", value: line(s.byPlace, XW_PLACE) },
      { label: "回访：找到了／还没（按档位，只计数，不公开）", value: Object.entries(s.back).map(([k, v]) => `${XW_TIER[k] ?? k} ${v.found}／${v.not}`).join(" · ") || "—" },
      { label: "被限制", value: `每天 10 次 ${ev.filter((e) => e.method === "limit:day").length} · 太快 ${ev.filter((e) => e.method === "limit:fast").length}` },
    ],
  };
}

/** 11-05 进度表 136–139 本命卦: opened → started → finished (by mode) → asked with it; invitations (合卦); counts only */
function bmg(c: Ctx): ProductBlocks {
  const ev = c.ev().filter((e) => e.e === "bmg_view" || e.e === "bmg_done");
  const people = (f: (e: TrackedEvent) => boolean) => new Set(ev.filter(f).map((e) => e.b ?? e.s)).size;
  const done = ev.filter((e) => e.e === "bmg_done");
  const kw = [...done.reduce((m, e) => { const k = (e.method ?? "").split(":")[1] ?? "?"; return m.set(k, (m.get(k) ?? 0) + 1); }, new Map<string, number>())].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const toCast = c.ev().filter((e) => e.e === "heat_click" && (e.method ?? "").startsWith("bmg-to-cast")).length;
  return {
    funnel: [
      { label: "打开小测页", n: people((e) => e.e === "bmg_view" && (e.method === "quiz" || e.method === "invite")) },
      { label: "开始作答", n: people((e) => e.e === "bmg_view" && (e.method ?? "").startsWith("start:")) },
      { label: "做完（人）", n: bmgPeople(c.since, c.until), note: `完整版 ${done.filter((e) => (e.method ?? "").startsWith("full")).length} · 快速版 ${done.filter((e) => (e.method ?? "").startsWith("quick")).length}` },
      { label: "看别人分享的结果", n: people((e) => e.e === "bmg_view" && e.method === "result:shared") },
      { label: "从结果页点「问一件事」（次）", n: toCast },
    ],
    rows: bmgRecent(c.limit).map((r) => ({ at: r.at, customerId: r.customer_id, test: false, source: null, what: `${hexByKw(r.kw)?.name ?? r.kw}`, summary: `${r.mode === "quick" ? "快速版" : "完整版"}${r.via ? ` · 来源 ${r.via}` : ""}`, href: null, followup: r.invited ? "合卦邀请来的" : null, revisit: null, extra: null })),
    rowsNote: "免登录：只记答案（A/B）、得到的卦和来源 ?c=；结果链接只显示卦，不显示人",
    revisits: null,
    stats: [
      { label: "最常见的本命卦（次）", value: kw.map(([k, n]) => `${hexByKw(Number(k))?.short ?? k} ${n}`).join(" · ") || "—" },
      { label: "合卦邀请", value: `发出 ${people((e) => e.e === "bmg_view" && e.method === "pair:invite")} 人 · 打开 ${people((e) => e.e === "bmg_view" && e.method === "invite")} 人` },
    ],
  };
}

let TEST_IDS: { at: number; ids: Set<number> } | null = null;
function testIds(): Set<number> {
  if (TEST_IDS && Date.now() - TEST_IDS.at < 60_000) return TEST_IDS.ids;
  TEST_IDS = { at: Date.now(), ids: new Set(many<{ id: number }>("SELECT id FROM customers WHERE test_flag = 1").map((r) => r.id)) };
  return TEST_IDS.ids;
}

const BLOCKS: Record<string, (c: Ctx) => ProductBlocks> = {
  liuyao, jiaobei, qiuqian, jieqian, tarot, "today-qian": todayQian, huangli, zeri, yunshi,
  bazi: (c) => reports("bazi", c), ziwei: (c) => reports("ziwei", c), astro: (c) => reports("astro", c), zhengyuan: (c) => reports("zhengyuan", c),
  qa, hepan: (c) => bought("hepan", c), nianshu: (c) => bought("nianshu", c), tongka,
  name, dream, taisui, xunwu, bmg,
};
export const DETAIL_IDS = Object.keys(BLOCKS);

/** ②③④ of one product over [since, until): the funnel, the latest rows (any time), its revisits, its own extra lines */
export function productBlocks(id: string, since: number, until = Date.now(), opts: { test?: boolean; limit?: number } = {}): ProductBlocks | null {
  const fn = BLOCKS[id];
  if (!fn) return null;
  let evs: TrackedEvent[] | null = null;
  const c: Ctx = {
    since, until, now: Date.now(), test: !!opts.test, limit: opts.limit ?? 50,
    ev: () => (evs ??= readEventsBetween(since, until, { only: ["jiaobei", "huangli", "zeri", "yunshi", "bazi", "ziwei", "astro", "hepan", "nianshu", "name", "dream", "taisui", "xunwu", "bmg_view", "bmg_done", "heat_click"] })),
  };
  let out: ProductBlocks;
  try { out = fn(c); } catch { return { funnel: [], rows: [], revisits: null, stats: [] }; }
  // 10-23 进度表 109 ①: where its paid orders came from (the ?c= tag the buyer arrived with) — the products sold one by one
  const tiers = SOURCE_TIERS[id];
  if (tiers) out.stats.push({ label: "付费的单按来源（?c=）", value: sourceLineFor(tiers, since, until) });
  return out;
}
const SOURCE_TIERS: Record<string, readonly string[]> = {
  liuyao: ["deep", "one", "light"], tarot: ["tarot"], jieqian: ["qian"], "today-qian": ["qiancard"],
  hepan: ["hepan"], nianshu: ["nianshu"], tongka: ["pass_1d", "pass_7d", "pass_30d"], name: ["name_baby", "name_rename"],
};

/** for the tests: every product's rows carry a reader page where the product has one */
export const READER_PAGE_PRODUCTS = ["liuyao", "jieqian", "tarot", "bazi", "ziwei", "astro", "zhengyuan", "hepan", "nianshu"] as const;
export { deliveries };
