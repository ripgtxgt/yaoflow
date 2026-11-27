import { db, guaranteeCheck, latestPassOrderSid, type SubscriptionRow } from "./db";
import { inPause } from "./subscription";
import { homeDay, homeMinute } from "./clock";
import { passDaysOfRow, passName, GUARANTEE_WHY } from "./admin-members";
import { readEventsBetween } from "./analytics-server";

/**
 * 10-22 进度表 94 第一批 — the customer page's top line (who this person is to us now: 免费／通卡／会员, and the
 * first-payment guarantee) and the record of every product, not only 六爻: tarot, lots, 擲筊, today's lot, the chart
 * reports (which charts, the last monthly rewrite), 年書, 合盤, 正緣畫像, chart questions, each product's revisits, the
 * letters they get, and their saved birth profiles (count and names; the details behind a click). Server only.
 */

const DAY = 86_400_000;
const day = (ms: number | null | undefined) => (ms ? homeDay(ms) : "—");
const minute = (ms: number | null | undefined) => (ms ? homeMinute(ms) : "—");

export interface Identity {
  kind: "free" | "pass" | "member" | "gift";
  /** one line: 「会员 · 月付 · 续订中，下次 2026-11-22」 */
  line: string;
  /** earlier standings worth knowing (a membership that ended, passes used) */
  past: string[];
  guarantee: { state: "可用" | "已用" | "不适用"; note: string };
}

const live = (s: SubscriptionRow, now: number) => (s.status === "active" || s.status === "trialing" || s.status === "past_due") && (!s.period_end || s.period_end >= now - DAY);

export function customerIdentity(customerId: number, now = Date.now()): Identity {
  const d = db();
  const subs = d.prepare("SELECT * FROM subscriptions WHERE customer_id = ? ORDER BY created_at DESC").all(customerId) as unknown as SubscriptionRow[];
  const isPass = (s: SubscriptionRow) => s.stripe_subscription_id.startsWith("pass_");
  const isComp = (s: SubscriptionRow) => s.stripe_subscription_id.startsWith("comp_");
  const member = subs.find((s) => !isPass(s) && !isComp(s) && live(s, now));
  const gift = subs.find((s) => isComp(s) && live(s, now));
  const pass = subs.find((s) => isPass(s) && s.status === "active" && (s.period_end ?? 0) > now);
  const queued = subs.filter((s) => isPass(s) && s.status === "scheduled");
  const parts: string[] = [];
  let kind: Identity["kind"] = "free";
  if (member) {
    kind = "member";
    const plan = member.plan === "year" ? "年付" : "月付";
    const end = member.cancel_at ?? member.period_end;
    const state = member.status === "past_due" || member.status === "unpaid" ? "扣款失败（Stripe 自动重试中）"
      : inPause(member, now) ? `暂停中，到 ${day(member.paused_until)}`
      : member.cancel_at_period_end === 1 || member.cancel_at != null ? `已关续订，${day(end)} 到期`
      : `续订中，下次 ${day(member.period_end)}`;
    // 10-23: a lost chargeback leaves Stripe's subscription running to its end — say the money came back, and where to end it
    parts.push(`会员 · ${plan} · ${state}${member.refunded_at ? `；⚠ ${day(member.refunded_at)} 起有退款或争议，钱可能已退回——要停掉会员，用下面「运营动作 → 立即结束会员／通卡」` : ""}`);
  }
  if (gift) {
    if (kind === "free") kind = "gift";
    parts.push(`会员 · 我们赠送 · 到 ${day(gift.period_end)}`);
  }
  if (pass) {
    if (kind === "free") kind = "pass";
    const days = passDaysOfRow(pass);
    parts.push(`${passName(days)} · 到 ${days === 1 ? minute(pass.period_end) : day(pass.period_end)}`);
  }
  if (queued.length) parts.push(`另有 ${queued.length} 张通卡排队（${queued.map((q) => `${passName(passDaysOfRow(q))} ${day(q.period_start)} 起`).join("、")}）`);
  const past: string[] = [];
  const endedMember = subs.find((s) => !isPass(s) && !isComp(s) && !live(s, now));
  if (endedMember && !member) past.push(`曾是会员（${endedMember.plan === "year" ? "年付" : "月付"}），${day(endedMember.cancel_at ?? endedMember.period_end)} 结束`);
  const usedPasses = subs.filter((s) => isPass(s) && s !== pass && s.status !== "scheduled");
  if (usedPasses.length) past.push(`用过通卡 ${usedPasses.length} 张（${usedPasses.slice(0, 4).map((s) => passName(passDaysOfRow(s))).join("、")}${usedPasses.length > 4 ? "…" : ""}）`);

  // the first-payment guarantee (78): used once already, open now on the account's first 1-day pass, or not for them
  let guarantee: Identity["guarantee"];
  const refunded = d.prepare("SELECT created_at FROM orders WHERE customer_id = ? AND refund_reason = 'guarantee' ORDER BY created_at DESC LIMIT 1").get(customerId) as { created_at: number } | undefined;
  if (refunded) guarantee = { state: "已用", note: `${day(refunded.created_at)} 那单退过` };
  else {
    const sid = latestPassOrderSid(customerId, "pass_1d");
    const g = sid ? guaranteeCheck(sid, now) : null;
    const why = g && !g.ok ? g.why : null;
    guarantee = g?.ok ? { state: "可用", note: `到 ${minute(g.until)}` }
      : { state: "不适用", note: !sid ? "没买过 1 日通卡" : (why && GUARANTEE_WHY[why]) || why || "" };
  }
  return { kind, line: parts.join("；") || "免费（没有会员，也没有在用的通卡）", past, guarantee };
}

/** a second line under the value: which charts, for the reports (进度表 94「哪几张盘」) */
export interface ProductLine { name: string; value: string; detail?: string; extra?: string }

/** a chart, in a few words an operator can tell apart: the 八字 four pillars, the 紫微 命宮, the 星盤 Sun／Moon／rising */
export function chartLabel(system: "bazi" | "ziwei" | "astro", chartJson: string): string | null {
  try {
    const f = JSON.parse(chartJson) as Record<string, unknown>;
    const g = f.gender === "male" ? "男" : f.gender === "female" ? "女" : "";
    if (system === "bazi") {
      const p = (f.pillars as { gz?: string }[] | undefined)?.map((x) => x.gz).filter(Boolean) ?? [];
      return p.length ? `${p.join(" ")}${g ? `（${g}）` : ""}` : null;
    }
    if (system === "ziwei") {
      const soul = typeof f.soulBranch === "string" ? f.soulBranch : null;
      if (!soul) return null;
      // soulStar is the 命主 (the chart's ruling star), not a star sitting in 命宮 — say so
      return `命宮在${soul}${typeof f.soulStar === "string" && f.soulStar ? ` · 命主${f.soulStar}` : ""}${typeof f.fiveClass === "string" ? ` · ${f.fiveClass}` : ""}${g ? `（${g}）` : ""}`;
    }
    const pl = (f.planets as { name?: string; sign?: string }[] | undefined) ?? [];
    const sign = (names: string[]) => pl.find((x) => names.includes(String(x.name ?? "").toLowerCase()))?.sign ?? null;
    const sun = sign(["太陽", "太阳", "sun", "日"]), moon = sign(["月亮", "moon", "月"]);
    const asc = (f.asc as { sign?: string } | null | undefined)?.sign ?? null;
    const bits = [sun ? `日${sun}` : null, moon ? `月${moon}` : null, asc ? `升${asc}` : null].filter(Boolean);
    return bits.length ? bits.join(" ") : null;
  } catch { return null; }
}

const n = (sql: string, ...a: unknown[]): number => {
  try { return Number((db().prepare(sql).get(...(a as never[])) as { v: number } | undefined)?.v ?? 0); } catch { return 0; }
};
const rows = <T,>(sql: string, ...a: unknown[]): T[] => {
  try { return db().prepare(sql).all(...(a as never[])) as T[]; } catch { return []; }
};
const last = (sql: string, ...a: unknown[]): number | null => {
  try { return ((db().prepare(sql).get(...(a as never[])) as { v: number | null } | undefined)?.v ?? null); } catch { return null; }
};

/** each product, one line: how many, how many paid or written, the latest; 「—」 when never used */
export function customerProducts(customerId: number): ProductLine[] {
  const c = customerId;
  const out: ProductLine[] = [];
  const add = (name: string, count: number, value: string, detail?: string) => out.push({ name, value: count ? value : "—", detail: count ? detail : undefined });

  const tarot = n("SELECT COUNT(*) AS v FROM tarot_draws WHERE customer_id = ?", c);
  add("塔罗", tarot, `抽牌 ${tarot} 次 · 个人解读 ${n("SELECT COUNT(*) AS v FROM tarot_draws WHERE customer_id = ? AND personal_json IS NOT NULL", c)} · 追问 ${n("SELECT COUNT(*) AS v FROM tarot_draws WHERE customer_id = ? AND followup_at IS NOT NULL", c)}`,
    `最近 ${day(last("SELECT MAX(created_at) AS v FROM tarot_draws WHERE customer_id = ?", c))}`);
  const qian = n("SELECT COUNT(*) AS v FROM qian_draws WHERE customer_id = ?", c);
  add("解籤", qian, `求籤 ${qian} 支 · 个人解读 ${n("SELECT COUNT(*) AS v FROM qian_draws WHERE customer_id = ? AND personal_json IS NOT NULL", c)} · 追问 ${n("SELECT COUNT(*) AS v FROM qian_draws WHERE customer_id = ? AND followup_at IS NOT NULL", c)}`,
    `最近 ${day(last("SELECT MAX(created_at) AS v FROM qian_draws WHERE customer_id = ?", c))}`);
  // 擲筊 and the online 求籤 live mostly in the page events (a toss is not stored unless the reader wrote the question
  // down, a lot drawn online stays in the browser) — counted over the browsers filed under this person, 90 days
  const jb = n("SELECT COUNT(*) AS v FROM jiaobei_asks WHERE customer_id = ?", c);
  const bids = rows<{ bid: string }>("SELECT bid FROM browser_links WHERE customer_id = ? LIMIT 40", c).map((r) => r.bid);
  let asks = 0, lots = 0;
  if (bids.length) {
    try {
      const ev = readEventsBetween(Date.now() - 90 * DAY, Date.now(), { only: ["jiaobei"], browsers: bids });
      asks = ev.filter((e) => (e.method ?? "").startsWith("ask")).length;
      lots = ev.filter((e) => e.method === "qq_done").length;
    } catch { /* no events store */ }
  }
  add("擲筊／线上求籤", Math.max(jb, asks) + lots, `擲筊 ${Math.max(jb, asks)} 次 · 线上求籤 ${lots} 支`,
    `按 TA 用过的 ${bids.length} 个浏览器，近 90 天${jb ? ` · 写了问题的 ${jb} 次，最近 ${day(last("SELECT MAX(created_at) AS v FROM jiaobei_asks WHERE customer_id = ?", c))}` : ""}`);
  const tq = n("SELECT COUNT(*) AS v FROM tq_draws WHERE subject = ?", `c:${c}`);
  add("今日一籤", tq, `抽了 ${tq} 天`, `最近 ${day(last("SELECT MAX(at) AS v FROM tq_draws WHERE subject = ?", `c:${c}`))}`);

  // the chart reports: which charts (by their input), what kind, written or not, and the last monthly rewrite
  for (const [system, table, label] of [["bazi", "bazi_reports", "八字报告"], ["ziwei", "ziwei_reports", "紫微报告"], ["astro", "astro_reports", "星盘报告"]] as const) {
    const rs = rows<{ kind: string; input_hash: string; body: number; paid_at: number | null; created_at: number; chart_json: string }>(
      `SELECT kind, input_hash, body_json IS NOT NULL AS body, paid_at, created_at, chart_json FROM ${table} WHERE customer_id = ? AND kind <> 'love' ORDER BY created_at`, c);
    // 进度表 94「哪几张盘」: one short label per chart (the latest row of each input)
    const latest = new Map<string, string>();
    for (const r of rs) latest.set(r.input_hash, r.chart_json);
    const labels = [...latest.values()].map((j) => chartLabel(system, j) ?? "（这张盘读不出）");
    const charts = new Set(rs.map((r) => r.input_hash)).size;
    const kinds = Object.entries(rs.reduce<Record<string, number>>((a, r) => { a[r.kind] = (a[r.kind] ?? 0) + 1; return a; }, {}))
      .map(([k, v]) => `${k === "deep" ? "深度" : k === "year" ? "年度" : k} ${v}`).join(" · ");
    const rewrite = last("SELECT MAX(at) AS v FROM report_rewrites WHERE customer_id = ? AND system = ?", c, system);
    add(label, rs.length, `${charts} 张盘 · ${kinds} · 写好 ${rs.filter((r) => r.body).length}`, `最近 ${day(rs[rs.length - 1]?.created_at)}${rewrite ? ` · 最后月更 ${day(rewrite)}` : ""}`);
    if (rs.length) out[out.length - 1]!.extra = `盘：${labels.join("；")}`;
  }
  const love = n("SELECT COUNT(*) AS v FROM bazi_reports WHERE customer_id = ? AND kind = 'love'", c);
  add("正缘画像", love, `${love} 份 · 写好 ${n("SELECT COUNT(*) AS v FROM bazi_reports WHERE customer_id = ? AND kind = 'love' AND body_json IS NOT NULL", c)}`,
    `最近 ${day(last("SELECT MAX(created_at) AS v FROM bazi_reports WHERE customer_id = ? AND kind = 'love'", c))}`);
  const ns = rows<{ year: number; paid_at: number | null }>("SELECT year, paid_at FROM nianshu_reports WHERE customer_id = ? AND paid_at IS NOT NULL ORDER BY paid_at", c);
  add("年书", ns.length, `${ns.length} 本（${[...new Set(ns.map((r) => r.year))].join("、")} 年）`, `最近 ${day(ns[ns.length - 1]?.paid_at)}`);
  const hp = rows<{ kind: string; paid_at: number }>("SELECT kind, paid_at FROM hepan_reports WHERE customer_id = ? AND paid_at IS NOT NULL ORDER BY paid_at", c);
  add("合盘", hp.length, `${hp.length} 份`, `最近 ${day(hp[hp.length - 1]?.paid_at)}`);
  const qa = rows<{ system: string; v: number }>("SELECT system, COUNT(*) AS v FROM mingli_qa WHERE customer_id = ? GROUP BY system", c);
  const qaN = qa.reduce((a, r) => a + r.v, 0);
  add("命盘问答", qaN, `${qaN} 题（${qa.map((r) => `${{ bazi: "八字", ziwei: "紫微", astro: "星盘" }[r.system] ?? r.system} ${r.v}`).join(" · ")}）`,
    `最近 ${day(last("SELECT MAX(at) AS v FROM mingli_qa WHERE customer_id = ?", c))}`);
  return out;
}

export interface RevisitLine { product: string; pending: number; sent: number; answered: number }
const RV_NAME: Record<string, string> = { liuyao: "六爻", cast: "六爻（免费层）", bazi: "八字", ziwei: "紫微", astro: "星盘", nianshu: "年书", zeri: "择日", tarot: "塔罗" };

/** each product's revisits: waiting to be sent, sent and not answered, answered */
export function customerRevisits(customerId: number): RevisitLine[] {
  const out = rows<{ k: string; pending: number; sent: number; answered: number }>(
    `SELECT COALESCE(kind, 'liuyao') AS k,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
            SUM(CASE WHEN status <> 'pending' AND outcome IS NULL THEN 1 ELSE 0 END) AS sent,
            SUM(CASE WHEN outcome IS NOT NULL THEN 1 ELSE 0 END) AS answered
       FROM revisits WHERE customer_id = ? GROUP BY k`, customerId,
  ).map((r) => ({ product: RV_NAME[r.k] ?? r.k, pending: Number(r.pending), sent: Number(r.sent), answered: Number(r.answered) }));
  const t = rows<{ pending: number; sent: number; answered: number }>(
    `SELECT SUM(CASE WHEN revisit_due IS NOT NULL AND revisit_sent_at IS NULL THEN 1 ELSE 0 END) AS pending,
            SUM(CASE WHEN revisit_sent_at IS NOT NULL AND revisit_answer_at IS NULL THEN 1 ELSE 0 END) AS sent,
            SUM(CASE WHEN revisit_answer_at IS NOT NULL THEN 1 ELSE 0 END) AS answered
       FROM tarot_draws WHERE customer_id = ?`, customerId)[0];
  if (t && (Number(t.pending) || Number(t.sent) || Number(t.answered))) out.push({ product: "塔罗", pending: Number(t.pending), sent: Number(t.sent), answered: Number(t.answered) });
  return out;
}

/** the letters that come by themselves, and whether this person gets them */
export function customerLetters(customerId: number): { name: string; state: string }[] {
  const off = last("SELECT at AS v FROM member_letter_off WHERE customer_id = ?", customerId);
  const lastOf = (prefix: string, kind: string) => last("SELECT MAX(sent_at) AS v FROM emails WHERE session_id >= ? AND session_id < ? AND kind = ? AND status = 'sent'", `${prefix}:${customerId}:`, `${prefix}:${customerId};`, kind);
  const ml = lastOf("ml", "member_letter"), mo = lastOf("mo", "month_letter");
  const tq = rows<{ mail: number; mail_on_at: number | null }>("SELECT mail, mail_on_at FROM tq_prefs WHERE subject = ?", `c:${customerId}`)[0];
  return [
    { name: "会员每日信", state: off ? `停了（${day(off)} 一键停）` : ml ? `收 · 最近 ${day(ml)}` : "没收过（会员才有，只寄中文）" },
    { name: "流月信", state: off ? "停了（和每日信一起停）" : mo ? `收 · 最近 ${day(mo)}` : "没收过（会员才有，只寄中文）" },
    { name: "今日一籤信", state: tq?.mail ? `订了${tq.mail_on_at ? `（${day(tq.mail_on_at)} 起）` : ""}` : "没订" },
  ];
}

export interface ProfileLine { who: string; name: string; at: number; input: string }
/** saved birth profiles: how many and what they are called; the details only when opened */
export function customerProfiles(customerId: number): ProfileLine[] {
  return rows<ProfileLine>("SELECT who, name, at, input FROM birth_profiles WHERE customer_id = ? ORDER BY at", customerId);
}
