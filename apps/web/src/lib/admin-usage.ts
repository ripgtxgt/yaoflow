import { db } from "./db";
import { homeDay, homeMinute } from "./clock";
import { pick, type Localized } from "./reading-keys";
import { asLocale } from "./locales";
import { cardById, POSITIONS, ANSWER_ZH, type Answer } from "./tarot";
import { qianByNum, qianTempleName } from "./qian";
import { qianSet, qianSituation, qianResultPath } from "./qian-meta";
import { myReports, type MyReport } from "./my-reports";
import { placeById } from "./mingli/birth/places";
import { matterBySlug } from "./mingli/calendar/zeri";
import type { BirthInput } from "./mingli/birth/normalize";
import { formatMoney, isCurrency } from "./money";

/**
 * 10-23 进度表 115 (Neil: 「每个用户的界面里面，我还需要知道用户使用每个产品的记录和详情，然后要做到我能读懂，比如说那个
 * 八字档案，全是代码」). The customer page had one line per product (how many, the latest) and the birth profiles as raw
 * JSON. This reads, per product, every time the person used it — when, what they asked or drew, what they got, how
 * they got it (paid, 通卡／会员, free), whether it is written, its check-in — in words, with the page the reader sees.
 * Everything here is read-only; nothing is kept that the product tables do not already keep.
 */

const many = <T,>(sql: string, ...a: unknown[]): T[] => {
  try { return db().prepare(sql).all(...(a as never[])) as T[]; } catch { return []; /* that product's table is not made yet */ }
};
const parse = <T,>(s: string | null | undefined): T | null => { try { return s ? (JSON.parse(s) as T) : null; } catch { return null; } };
const clip = (s: string | null | undefined, n: number) => { const t = (s ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n)}…` : t; };
const pad = (n: number) => String(n).padStart(2, "0");

export interface UsageSection { label: string; text: string }
export interface UsageItem {
  at: number;
  /** what they asked, drew or got — one line */
  title: string;
  /** further lines, already in words */
  lines: string[];
  /** written yet, answered, cancelled… */
  state?: { text: string; tone: "ok" | "wait" | "bad" | "dim" };
  /** how they came to have it: 单买 NT$99 · 通卡／会员 · 免费 … */
  how?: string;
  /** the page the reader sees */
  href?: string;
  /** the same item's card further down this page (六爻) */
  anchor?: string;
  /** longer texts, opened on demand: the personal reading, an answer */
  sections?: UsageSection[];
}
export interface UsageGroup { key: string; name: string; summary: string; items: UsageItem[]; more?: string }

/* ------------------------------------------------------------------ 生辰档案 */

export const WHO_ZH: Record<string, string> = { self: "自己", partner: "伴侣", family: "家人", friend: "朋友", other: "其他人" };
const BRANCH_ZH = ["早子时（00–01 点）", "丑时（01–03 点）", "寅时（03–05 点）", "卯时（05–07 点）", "辰时（07–09 点）", "巳时（09–11 点）", "午时（11–13 点）", "未时（13–15 点）", "申时（15–17 点）", "酉时（17–19 点）", "戌时（19–21 点）", "亥时（21–23 点）", "晚子时（23–24 点）"];

/** a birth as the chart pages keep it, in words: 女 · 国历 1990 年 5 月 17 日 · 12:30 · 臺北市 */
export function birthText(input: Partial<BirthInput> | null, gender?: string | null): string {
  if (!input || !input.y || !input.m || !input.d) return "（这份生辰读不出来）";
  const g = gender ?? input.gender;
  const sex = g === "male" ? "男" : g === "female" ? "女" : null;
  const date = `${input.calendar === "lunar" ? `农历${input.leap ? "闰" : ""}` : "国历"} ${input.y} 年 ${input.m} 月 ${input.d} 日`;
  const time = input.timeMode === "exact" && input.h != null ? `${pad(input.h)}:${pad(input.mi ?? 0)}`
    : input.timeMode === "branch" && input.branch != null ? BRANCH_ZH[input.branch] ?? "时辰没写清"
    : "出生时间不知道";
  const place = input.place?.name || (input.placeId ? placeById(input.placeId)?.name : null) || "出生地没填";
  return [sex, date, time, place, input.trueSolar ? "按真太阳时" : null, input.houses === "whole" ? "星盘用整宫制" : null].filter(Boolean).join(" · ");
}

export interface ProfileView { name: string; who: string; text: string; at: number }
/** the saved birth profiles, each in one readable line */
export function profilesReadable(customerId: number): ProfileView[] {
  return many<{ who: string; name: string; gender: string | null; input: string; at: number }>(
    "SELECT who, name, gender, input, at FROM birth_profiles WHERE customer_id = ? ORDER BY at", customerId,
  ).map((p) => ({ name: p.name || "（没取名）", who: WHO_ZH[p.who] ?? p.who, text: birthText(parse<BirthInput>(p.input), p.gender), at: p.at }));
}

/* ------------------------------------------------------------------ 六爻 */

const POS = ["初", "二", "三", "四", "五", "上"];
const PALACE_ZH: Record<string, string> = { qian: "乾", kun: "坤", zhen: "震", xun: "巽", kan: "坎", li: "离", gen: "艮", dui: "兑" };
const PHASE_ZH: Record<string, string> = { wood: "木", fire: "火", earth: "土", metal: "金", water: "水" };

/** the six lines in words: which move, the palace, 世／应 — instead of 「6,7,7,6,6,6」 */
export function castLinesText(c: { values_str?: string | null; changing?: string | null; palace?: string | null; palace_phase?: string | null; world_pos?: number | null; response_pos?: number | null }): string {
  const vals = (c.values_str ?? "").includes(",") ? (c.values_str ?? "").split(",").map(Number) : [...(c.values_str ?? "")].map(Number);
  const moving = c.changing
    ? c.changing.split(",").map((x) => Number(x)).filter((x) => x >= 1 && x <= 6)
    : vals.map((v, i) => (v === 6 || v === 9 ? i + 1 : 0)).filter(Boolean);
  const bits = [
    moving.length ? `动爻：${moving.map((p) => `${POS[p - 1]}爻`).join("、")}` : vals.length === 6 ? "六爻都没动（静卦）" : null,
    c.palace ? `${PALACE_ZH[c.palace] ?? c.palace}宫${c.palace_phase ? `（${PHASE_ZH[c.palace_phase] ?? c.palace_phase}）` : ""}` : null,
    c.world_pos && c.response_pos ? `世在${POS[c.world_pos - 1]}爻、应在${POS[c.response_pos - 1]}爻` : null,
  ];
  return bits.filter(Boolean).join(" · ");
}

export interface CastExtra { id: number; values_str: string | null; changing: string | null; palace: string | null; palace_phase: string | null; world_pos: number | null; response_pos: number | null; matter: string | null }
/** what the customer page's 六爻 cards need besides customerDetail's columns: the lines' facts and the matter's title */
export function castExtras(customerId: number): Map<number, CastExtra> {
  return new Map(many<CastExtra>(
    `SELECT c.id, c.values_str, c.changing, c.palace, c.palace_phase, c.world_pos, c.response_pos, m.title AS matter
       FROM casts c LEFT JOIN matters m ON m.id = c.matter_id WHERE c.customer_id = ?`, customerId,
  ).map((x) => [x.id, x]));
}

/** a 六爻 reading's fields, in reading order, with names a person knows */
const READING_LABEL: [string, string][] = [
  ["verdict", "结论"], ["summary", "总结"], ["tendency", "走向"], ["odds", "机会大小"], ["timing", "应期"], ["other_side", "另一面"],
  ["inner_condition", "自己这边"], ["outer_condition", "外面的情况"], ["movement", "变化"], ["direction", "方向"],
  ["strategy", "怎么做"], ["caution", "需要提防"], ["next_step", "下一步"], ["signals", "可以留意的讯号"],
  ["reflection_question", "想一想"], ["basis", "卦理依据"], ["closing", "最后一句"],
];
export function readingSections(bodyJson: string | null | undefined, locale: string): UsageSection[] {
  const b = parse<Record<string, unknown>>(bodyJson);
  if (!b) return [];
  const loc = asLocale(locale);
  const text = (v: unknown): string => typeof v === "string" ? v : v && typeof v === "object" ? pick(v as Localized, loc) : "";
  const out: UsageSection[] = [];
  const seen = new Set<string>();
  for (const [k, label] of READING_LABEL) {
    seen.add(k);
    const t = text(b[k]).trim();
    if (t) out.push({ label, text: t });
  }
  // a field this list does not know yet still shows, under its own name
  for (const [k, v] of Object.entries(b)) {
    if (seen.has(k)) continue;
    const t = text(v).trim();
    if (t) out.push({ label: k, text: t });
  }
  return out;
}

/* ------------------------------------------------------------------ how they came to have it */

const ENT_ZH: Record<string, string> = {
  purchase: "单买", membership: "通卡／会员", painted_door: "上线前赠送", invite_free: "新人免费", gift_cast: "朋友送的",
  joint: "合参邀请", case_reward: "公开卦例回礼", revisit_reward: "应验回礼", referral_reward: "推荐奖励", goodwill: "补偿",
};
const money = (minor: number | null | undefined, cur: string | null | undefined) => {
  if (!minor || !cur) return "";
  const c = cur.toUpperCase();
  return isCurrency(c) ? formatMoney(c, minor, "zh-hant") : `${c} ${(minor / 100).toFixed(2)}`;
};
/** a report／draw's paid_session in words: 「member:…」 is an allowance (通卡 or 会员), a Stripe session is a purchase */
function paidHow(session: string | null | undefined, minor: number | null | undefined, cur: string | null | undefined, paidAt: number | null | undefined): string {
  if (!paidAt && !session) return "免费";
  if (!session) return "已付";
  if (session.startsWith("member:") || session.startsWith("pass:")) return "通卡／会员额度";
  if (session.startsWith("test")) return "测试";
  if (session.startsWith("comp") || session.startsWith("grant")) return "我们送的";
  const m = money(minor, cur);
  return m ? `单买 ${m}` : "单买";
}

/* ------------------------------------------------------------------ check-ins */

const OUTCOME_ZH: Record<string, string> = { hit: "应了", partial: "部分", miss: "没应", unclear: "不确定", open: "还没定" };
const EVENT_ZH: Record<string, string> = { happened: "发生了", stirred: "有动静没成", nothing: "没发生", open: "还在等" };
function revisitLine(r: { due_at: number; status: string; outcome: string | null; event: string | null; outcome_at: number | null } | undefined): string | null {
  if (!r) return null;
  if (r.outcome || r.event) return `回访：读者答「${EVENT_ZH[r.event ?? ""] ?? OUTCOME_ZH[r.outcome ?? ""] ?? r.outcome}」${r.outcome_at ? `（${homeDay(r.outcome_at)}）` : ""}${r.outcome ? ` · 记为${OUTCOME_ZH[r.outcome] ?? r.outcome}` : ""}`;
  if (r.status === "sent") return "回访：信寄出了，读者还没答";
  if (r.status === "skipped" || r.status === "failed") return "回访：没寄（跳过）";
  return `回访：${homeDay(r.due_at)} 到期再问`;
}

/* ------------------------------------------------------------------ the groups */

const STATE_ZH: Record<MyReport["state"], UsageItem["state"]> = {
  done: { text: "写好了", tone: "ok" }, writing: { text: "在写", tone: "wait" }, mending: { text: "没写完，系统在补写", tone: "bad" }, mended: { text: "补写好了（已寄信）", tone: "ok" },
};
const REPORT_GROUPS: { filter: MyReport["filter"]; key: string; name: string; table: string }[] = [
  { filter: "bazi", key: "bazi", name: "八字报告", table: "bazi_reports" },
  { filter: "zhengyuan", key: "love", name: "正缘画像", table: "bazi_reports" },
  { filter: "ziwei", key: "ziwei", name: "紫微报告", table: "ziwei_reports" },
  { filter: "astro", key: "astro", name: "星盘报告", table: "astro_reports" },
  { filter: "hepan", key: "hepan", name: "合盘", table: "hepan_reports" },
  { filter: "nianshu", key: "nianshu", name: "年书", table: "nianshu_reports" },
];

const SHOW = 60;
const limit = (items: UsageItem[]): { items: UsageItem[]; more?: string } =>
  items.length > SHOW ? { items: items.slice(0, SHOW), more: `还有 ${items.length - SHOW} 条更早的没列出` } : { items };

/** every product this customer used, newest first within each; the products never used are named in `unused` */
export async function customerUsage(customerId: number, email: string): Promise<{ groups: UsageGroup[]; unused: string[] }> {
  const groups: UsageGroup[] = [];
  const unused: string[] = [];
  const add = (key: string, name: string, items: UsageItem[], summary: string, extraMore?: string) => {
    if (!items.length) { unused.push(name); return; }
    const l = limit(items);
    groups.push({ key, name, summary, items: l.items, more: [l.more, extraMore].filter(Boolean).join(" · ") || undefined });
  };
  const mail = (email ?? "").trim().toLowerCase();
  const rv = many<{ cast_id: number | null; kind: string | null; ref: string | null; due_at: number; status: string; outcome: string | null; event: string | null; outcome_at: number | null }>(
    "SELECT cast_id, kind, ref, due_at, status, outcome, event, outcome_at FROM revisits WHERE customer_id = ? ORDER BY created_at DESC", customerId);

  // 六爻 — the cards further down hold the reading and the follow-up talk; each line here jumps to its card
  const casts = many<{ id: number; created_at: number; locale: string; question: string; primary_name: string; changed_name: string | null; values_str: string; changing: string | null; palace: string | null; palace_phase: string | null; world_pos: number | null; response_pos: number | null; matter: string | null; tier: string | null; ent: string | null; sid: string | null; fq: number }>(
    `SELECT c.id, c.created_at, c.locale, c.question, c.primary_name, c.changed_name, c.values_str, c.changing, c.palace, c.palace_phase, c.world_pos, c.response_pos, m.title AS matter,
            (SELECT tier FROM readings r WHERE r.cast_id = c.id ORDER BY r.created_at DESC LIMIT 1) AS tier,
            (SELECT entitlement_kind FROM orders o WHERE o.cast_id = c.id ORDER BY o.created_at DESC LIMIT 1) AS ent,
            (SELECT session_id FROM orders o WHERE o.cast_id = c.id ORDER BY o.created_at DESC LIMIT 1) AS sid,
            (SELECT COUNT(*) FROM followups f WHERE f.cast_id = c.id AND f.role = 'user') AS fq
       FROM casts c LEFT JOIN matters m ON m.id = c.matter_id WHERE c.customer_id = ? ORDER BY c.created_at DESC`, customerId);
  const rvByCast = new Map<number, (typeof rv)[number]>();
  for (const r of rv) if (r.cast_id != null && !rvByCast.has(r.cast_id)) rvByCast.set(r.cast_id, r);
  add("liuyao", "六爻", casts.map((c): UsageItem => ({
    at: c.created_at, title: c.question || "（没写问题）",
    lines: [`${c.primary_name}${c.changed_name ? ` → ${c.changed_name}` : ""} · ${castLinesText(c)}`, c.matter ? `归在「${c.matter}」这件事` : "", c.fq ? `追问 ${c.fq} 次` : "", revisitLine(rvByCast.get(c.id)) ?? ""].filter(Boolean),
    state: c.tier === "deep" ? { text: "深断", tone: "ok" } : c.tier ? { text: "轻解读", tone: "ok" } : { text: "只起了卦，没看解读", tone: "dim" },
    how: c.ent ? ENT_ZH[c.ent] ?? c.ent : undefined,
    href: c.sid ? `/${c.locale || "zh-hant"}/reading?sid=${encodeURIComponent(c.sid)}` : undefined,
    anchor: `cast-${c.id}`,
  })), `${casts.length} 卦 · 深断 ${casts.filter((c) => c.tier === "deep").length} · 轻解读 ${casts.filter((c) => c.tier && c.tier !== "deep").length} · 追问 ${casts.reduce((a, c) => a + c.fq, 0)} 次${casts[0] ? ` · 最近 ${homeDay(casts[0].created_at)}` : ""}`);

  // 塔罗
  const tarot = many<{ token: string; created_at: number; locale: string; question: string; spread: number; cards_json: string; paid_at: number | null; paid_session: string | null; amount_minor: number | null; currency: string | null; personal_json: string | null; followup_q: string | null; followup_json: string | null; revisit_days: number | null; outcome_def: string | null; revisit_due: number | null; revisit_sent_at: number | null; revisit_answer: string | null; revisit_answer_at: number | null; plan: string | null }>(
    "SELECT token, created_at, locale, question, spread, cards_json, paid_at, paid_session, amount_minor, currency, personal_json, followup_q, followup_json, revisit_days, outcome_def, revisit_due, revisit_sent_at, revisit_answer, revisit_answer_at, plan FROM tarot_draws WHERE customer_id = ? ORDER BY created_at DESC", customerId);
  add("tarot", "塔罗", tarot.map((t): UsageItem => {
    const dealt = parse<{ id: string; rev: boolean }[]>(t.cards_json) ?? [];
    const pos = POSITIONS[(t.spread === 3 ? 3 : 1) as 1 | 3];
    const cards = dealt.map((d, i) => `${pos[i] ? `${pos[i]}：` : ""}${cardById(d.id)?.zh ?? d.id}（${d.rev ? "逆位" : "正位"}）`).join("；");
    const p = parse<{ reading?: string; cards?: string[]; watch?: string; next?: string }>(t.personal_json);
    const f = parse<{ answer?: string }>(t.followup_json);
    const sections: UsageSection[] = [];
    if (p?.reading) sections.push({ label: "个人解读", text: p.reading });
    if (p?.cards?.length) sections.push({ label: "每张牌", text: p.cards.join("\n") });
    if (p?.watch) sections.push({ label: "留意", text: p.watch });
    if (p?.next) sections.push({ label: "下一步", text: p.next });
    if (t.followup_q) sections.push({ label: `追问：${t.followup_q}`, text: f?.answer ?? "（还没答）" });
    const rvLine = t.revisit_days
      ? `回访：${t.revisit_days} 天后${t.revisit_due ? `（${homeDay(t.revisit_due)}）` : ""}问${t.outcome_def ? `「${clip(t.outcome_def, 40)}」` : ""}${t.revisit_answer ? ` · 读者答「${ANSWER_ZH[t.revisit_answer as Answer] ?? t.revisit_answer}」` : t.revisit_sent_at ? " · 信寄出了，还没答" : ""}`
      : "";
    return {
      at: t.created_at, title: t.question || "（没写问题）",
      lines: [`${t.spread === 3 ? "三张牌" : "单张牌"}：${cards || "—"}`, rvLine, t.plan ? `打算：${clip(t.plan, 60)}` : ""].filter(Boolean),
      state: p ? { text: "个人解读写好了", tone: "ok" } : t.paid_at ? { text: "已付，个人解读还没写好", tone: "bad" } : { text: "免费抽牌（只看牌义）", tone: "dim" },
      how: t.paid_at ? paidHow(t.paid_session, t.amount_minor, t.currency, t.paid_at) : "免费",
      href: `/${t.locale || "zh-hant"}/tarot/r/${t.token}`, sections,
    };
  }), `抽牌 ${tarot.length} 次 · 个人解读 ${tarot.filter((t) => t.personal_json).length} · 追问 ${tarot.filter((t) => t.followup_q).length}${tarot[0] ? ` · 最近 ${homeDay(tarot[0].created_at)}` : ""}`);

  // 解籤
  const qian = many<{ token: string; created_at: number; set_name: string; num: number; temple: string | null; situation: string | null; question: string; paid_at: number | null; paid_session: string | null; amount_minor: number | null; currency: string | null; personal_json: string | null; followup_q: string | null; followup_json: string | null }>(
    "SELECT token, created_at, set_name, num, temple, situation, question, paid_at, paid_session, amount_minor, currency, personal_json, followup_q, followup_json FROM qian_draws WHERE customer_id = ? ORDER BY created_at DESC", customerId);
  add("qian", "解籤", qian.map((q): UsageItem => {
    const set = qianSet(q.set_name);
    const lot = qianByNum(q.num, set.id);
    const p = parse<{ reading?: string; watch?: string; next?: string }>(q.personal_json);
    const f = parse<{ answer?: string }>(q.followup_json);
    const sections: UsageSection[] = [];
    if (lot?.poem?.length) sections.push({ label: "籤诗", text: lot.poem.join("\n") });
    if (p?.reading) sections.push({ label: "个人解读", text: p.reading });
    if (p?.watch) sections.push({ label: "留意", text: p.watch });
    if (p?.next) sections.push({ label: "下一步", text: p.next });
    if (q.followup_q) sections.push({ label: `追问：${q.followup_q}`, text: f?.answer ?? "（还没答）" });
    return {
      at: q.created_at, title: `${set.name} 第 ${q.num} 籤${lot?.title ? `「${lot.title}」` : ""}${lot?.lean ? `（${lot.lean}）` : ""}`,
      lines: [`问：${q.question || "（没写）"}`, q.situation ? `处境：${qianSituation(q.situation).label}` : "", q.temple && q.temple !== "other" ? `在哪间庙：${qianTempleName(q.temple)}` : ""].filter(Boolean),
      state: p ? { text: "个人解读写好了", tone: "ok" } : q.paid_at ? { text: "已付，个人解读还没写好", tone: "bad" } : { text: "只看了籤诗", tone: "dim" },
      how: q.paid_at ? paidHow(q.paid_session, q.amount_minor, q.currency, q.paid_at) : "免费",
      href: qianResultPath(q.token), sections,
    };
  }), `求籤 ${qian.length} 支 · 个人解读 ${qian.filter((q) => q.personal_json).length} · 追问 ${qian.filter((q) => q.followup_q).length}${qian[0] ? ` · 最近 ${homeDay(qian[0].created_at)}` : ""}`);

  // 擲筊 — only the tosses where the reader wrote the question down are kept (the rest stay in their browser)
  const SIGN: Record<string, string> = { s: "聖筊", x: "笑筊", y: "陰筊", sheng: "聖筊", xiao: "笑筊", yin: "陰筊" };
  const jb = many<{ created_at: number; question: string | null; rule: number | null; seq: string | null; sign: string | null }>(
    "SELECT created_at, question, rule, seq, sign FROM jiaobei_asks WHERE customer_id = ? ORDER BY created_at DESC", customerId);
  add("jiaobei", "擲筊", jb.map((j): UsageItem => ({
    at: j.created_at, title: j.question || "（没写问题）",
    lines: [`${j.rule === 3 ? "要连三个聖筊" : "要一个聖筊"}${j.seq ? ` · 擲出：${[...j.seq].map((s) => SIGN[s] ?? s).join("、")}` : ""}`],
    state: j.sign === "sheng" ? { text: "聖筊（方向确认）", tone: "ok" } : j.sign ? { text: SIGN[j.sign] ?? j.sign, tone: "dim" } : undefined,
    how: "免费",
  })), `写了问题的 ${jb.length} 次${jb[0] ? ` · 最近 ${homeDay(jb[0].created_at)}` : ""}`);

  // 今日一籤
  const tq = many<{ day: string; set_id: string; num: number; at: number }>("SELECT day, set_id, num, at FROM tq_draws WHERE subject = ? ORDER BY day DESC", `c:${customerId}`);
  add("tq", "今日一籤", tq.map((d): UsageItem => {
    const set = qianSet(d.set_id);
    const lot = qianByNum(d.num, set.id);
    return { at: d.at, title: `${d.day} · ${set.name} 第 ${d.num} 籤${lot?.title ? `「${lot.title}」` : ""}${lot?.lean ? `（${lot.lean}）` : ""}`, lines: [], how: "免费" };
  }), `抽了 ${tq.length} 天${tq[0] ? ` · 最近 ${tq[0].day}` : ""}`);

  // 八字／紫微／星盘／正缘／合盘／年书 — the 「我的報告」 list (who each is for, written yet, the link), plus how it was had
  let reports: MyReport[] = [];
  try { reports = await myReports(customerId, "zh-hant"); } catch { /* a table not made yet */ }
  const SYS_TABLE: Record<string, string> = { bazi: "bazi_reports", ziwei: "ziwei_reports", astro: "astro_reports", hepan: "hepan_reports", nianshu: "nianshu_reports" };
  const paidOf = (key: string) => {
    const [sys, token] = key.split(":");
    const table = SYS_TABLE[sys ?? ""];
    if (!table || !token) return null;
    return many<{ paid_session: string | null; amount_minor: number | null; currency: string | null; paid_at: number | null; created_at: number; updated_at: number | null; question: string | null }>(
      `SELECT paid_session, amount_minor, currency, paid_at, created_at, updated_at, question FROM ${table} WHERE token = ?`, token)[0] ?? null;
  };
  for (const g of REPORT_GROUPS) {
    const mine = reports.filter((r) => r.filter === g.filter);
    const drafts = many<{ n: number }>(`SELECT COUNT(*) AS n FROM ${g.table} WHERE customer_id = ? AND paid_at IS NULL${g.key === "love" ? " AND kind = 'love'" : g.table === "bazi_reports" ? " AND kind <> 'love'" : ""}`, customerId)[0]?.n ?? 0;
    add(g.key, g.name, mine.map((r): UsageItem => {
      const p = paidOf(r.key);
      const token = r.key.split(":")[1] ?? "";
      const rvr = rv.find((x) => x.kind && x.ref && x.ref.startsWith(token));
      return {
        at: r.at, title: r.name,
        lines: [r.who ? `给：${r.who}` : "", p?.question ? `读者写的问题：${clip(p.question, 80)}` : "", revisitLine(rvr) ?? ""].filter(Boolean),
        state: STATE_ZH[r.state], how: p ? paidHow(p.paid_session, p.amount_minor, p.currency, p.paid_at) : undefined, href: r.href,
      };
    }), `${mine.length} 份 · 写好 ${mine.filter((r) => r.state === "done" || r.state === "mended").length}${mine[0] ? ` · 最近 ${homeDay(mine[0].at)}` : ""}`,
    drafts ? `另有 ${drafts} 份打开了付款、没付的草稿（不算）` : undefined);
  }

  // 命盘问答
  const SYS_ZH: Record<string, string> = { bazi: "八字", ziwei: "紫微", astro: "星盘" };
  const qa = many<{ system: string; question: string; answer: string; at: number }>("SELECT system, question, answer, at FROM mingli_qa WHERE customer_id = ? ORDER BY at DESC", customerId);
  add("qa", "命盘问答", qa.map((x): UsageItem => ({
    at: x.at, title: x.question, lines: [`问的是${x.system === "astro" ? "星盘" : `${SYS_ZH[x.system] ?? x.system}盘`}`], sections: [{ label: "回答", text: x.answer }],
  })), `${qa.length} 题（${Object.entries(qa.reduce<Record<string, number>>((a, x) => { a[x.system] = (a[x.system] ?? 0) + 1; return a; }, {})).map(([k, v]) => `${SYS_ZH[k] ?? k} ${v}`).join(" · ")}）${qa[0] ? ` · 最近 ${homeDay(qa[0].at)}` : ""}`);

  // 择日提醒, 存卦, and the lists an address can be on (kept by address, not by account)
  if (mail) {
    const zr = many<{ ymd: string; slug: string; created_at: number; sent_at: number | null; cancelled_at: number | null }>("SELECT ymd, slug, created_at, sent_at, cancelled_at FROM zeri_reminds WHERE lower(email) = ? ORDER BY created_at DESC", mail);
    add("zeri", "择日提醒", zr.map((z): UsageItem => ({
      at: z.created_at, title: `${z.ymd} ${matterBySlug(z.slug)?.tw ?? z.slug}`, lines: [],
      state: z.cancelled_at ? { text: "取消了", tone: "dim" } : z.sent_at ? { text: `已提醒（${homeDay(z.sent_at)}）`, tone: "ok" } : { text: "等到日子前提醒", tone: "wait" },
    })), `${zr.length} 个`);
    const sv = many<{ created_at: number; question: string; hex: string | null; sent_at: number | null; opened_at: number | null; stopped: number | null; origin: string | null }>("SELECT created_at, question, hex, sent_at, opened_at, stopped, origin FROM saved_casts WHERE lower(email) = ? ORDER BY created_at DESC", mail);
    add("saved", "存到信箱的卦", sv.map((s): UsageItem => ({
      at: s.created_at, title: s.question || "（没写问题）", lines: [s.hex ? `卦：${s.hex}` : "", s.origin === "recover" ? "从「没付完的结账」挽回信来的" : s.origin === "matter" ? "从事件页存的" : ""].filter(Boolean),
      state: s.stopped ? { text: "读者停掉了提醒", tone: "dim" } : s.opened_at ? { text: `打开过（${homeDay(s.opened_at)}）`, tone: "ok" } : s.sent_at ? { text: "提醒信寄出了", tone: "wait" } : { text: "还没寄提醒", tone: "wait" },
    })), `${sv.length} 个`);
    const other: UsageItem[] = [];
    for (const s of many<{ created_at: number; confirmed_at: number | null; unsub_at: number | null; sent_count: number | null }>("SELECT created_at, confirmed_at, unsub_at, sent_count FROM daily_subs WHERE lower(email) = ?", mail)) {
      other.push({ at: s.created_at, title: "订了「每日三卦」信", lines: [`寄过 ${s.sent_count ?? 0} 封`], state: s.unsub_at ? { text: `退订了（${homeDay(s.unsub_at)}）`, tone: "dim" } : s.confirmed_at ? { text: "订阅中", tone: "ok" } : { text: "没点确认信", tone: "wait" } });
    }
    for (const w of many<{ created_at: number; kind: string | null }>("SELECT created_at, kind FROM year_waitlist WHERE lower(email) = ?", mail)) {
      other.push({ at: w.created_at, title: "登记了「2027 年卦」名单", lines: w.kind ? [`想问：${{ love: "感情", work: "工作", money: "财", other: "其他" }[w.kind] ?? w.kind}`] : [] });
    }
    for (const s of many<{ created_at: number; notified_at: number | null }>("SELECT created_at, notified_at FROM seal_watchers WHERE lower(email) = ?", mail)) {
      other.push({ at: s.created_at, title: "关注了一张封卦（揭晓时通知）", lines: [], state: s.notified_at ? { text: `已通知（${homeDay(s.notified_at)}）`, tone: "ok" } : { text: "等揭晓", tone: "wait" } });
    }
    add("lists", "订阅与名单", other.sort((a, b) => b.at - a.at), `${other.length} 项`);
  }
  return { groups, unused };
}

/** for a line under a time: 10-23 18:46 */
export const usageWhen = homeMinute;
