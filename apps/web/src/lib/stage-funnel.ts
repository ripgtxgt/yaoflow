import { db } from "./db";
import { memberAt, memberSpans, personResolver, purchaseRecords, SETTLE_MS, type PurchaseRec } from "./purchases";

/**
 * 10-03 按阶段的转化 (Neil, on /admin/nudges: 「这个面板上面能把每个阶段的所有付费客户都写上去吗？我要看具体的转化率」).
 *
 * A stage is the place of a cast on its matter (lib/cast-log.ts threads): the 1st cast, the 2nd, the 3rd, the 4th and
 * later. Per stage, counted per PERSON (a browser, or every browser of one customer — lib/nudge.ts personResolver):
 *   - reached:  people who made a cast at that stage in the window;
 *   - saw:      of those, people the page really showed the block before the price at that stage (nudge_seen);
 *   - paid:     people whose purchase is placed at that stage — the cast the reading was bought for (paid_sid) when there
 *               is one, else their last cast before paying (any matter, no time limit: the row says how long it was);
 *   - pending:  reached in the last 24 hours (10-06, was 72) and not paid at that stage yet — they may still, so a fresh rate is a floor;
 *   - cumulative: people who paid at this stage or an earlier one, out of everyone who cast in the window.
 * The window is a cohort: casts made since `since`; their purchases count whenever they came (up to now).
 * Every paying customer is listed under the stage they paid at; payments with no cast logged before them have a list of
 * their own (paid before the cast log, on a browser we never saw cast, …), so nobody who paid is missing.
 */

export const STAGES = ["1", "2", "3", "4+"] as const;
export type StageKey = (typeof STAGES)[number];
export const stageOf = (n: number | null | undefined): StageKey => (!n || n <= 1 ? "1" : n === 2 ? "2" : n === 3 ? "3" : "4+");

const DAY = 86_400_000;

/** One cast of the cohort, with what the group tables need (lib/stage-funnel.ts segmentTable). */
export interface CohortCast {
  /** t = when it was logged (the free line / the note); at = the cast's own instant, which its saved cast keeps */
  id: number; bid: string; t: number; at: number; tz: number; thread_id: number | null; n: number | null; question: string | null; sensitive: string | null;
  nudge: string | null; nudge_seen: number | null; style: string | null; paid_sid: string | null;
  topic: string | null; locale: string | null; device: string | null; app: string | null; lean: string | null; capped: number; has_line: number;
  thread_first: number | null; first_c: string | null; first_ref: string | null; first_day: string | null;
  person: string;
}
type CastRow = CohortCast;

export interface PayerRow {
  purchase: PurchaseRec;
  person: string;
  /** the browser and customer behind the person, for the label and the link */
  bid: string | null;
  customerId: number | null;
  stage: StageKey | null;
  n: number | null;
  cast: { id: number; t: number; question: string | null; sensitive: string | null; nudge: string | null; nudgeSeen: boolean; style: string | null } | null;
  matter: { id: number; title: string | null; sensitive: string | null; casts: number; firstAt: number } | null;
  /** the reading bought was for this very cast */
  forThisCast: boolean;
  /** how long after that cast the payment came */
  gapMs: number | null;
}

export interface StageRow { k: StageKey; reached: number; saw: number; paid: number; sawPaid: number; pending: number; cumulative: number; payers: PayerRow[] }
export interface StageFunnel { since: number; casters: number; stages: StageRow[]; noCast: PayerRow[]; payments: number; payersInCohort: number }

interface Attribution { purchase: PurchaseRec; person: string; cast: CastRow | null; boughtThis: boolean }
export interface Cohort {
  since: number;
  /** the window's casts (and a month before it, for attribution), oldest first */
  casts: CastRow[];
  byPerson: Map<string, CastRow[]>;
  threads: Map<number, { id: number; title: string | null; sensitive: string | null; n: number; first_at: number }>;
  /** every purchase since the window opened, placed at the cast it was for (or the last cast before it) */
  attributions: Attribution[];
  person: ReturnType<typeof personResolver>;
  /** 10-04 排除会员: casts in the window a membership covered (left out of everything here), and the people who made them */
  memberCasts: number;
  memberPeople: number;
}

/** The window's casts and every purchase placed at a cast — the one reading both the funnel and the group tables use. */
export function cohort(since: number): Cohort {
  const d = db();
  const person = personResolver();
  // a month further back than the window, so "the last cast before paying" is found even for a cast just before it
  const rows = d.prepare(
    `SELECT c.id, c.bid, c.created_at AS t, c.at, c.tz, c.thread_id, c.thread_n AS n, c.question, c.sensitive, c.nudge, c.nudge_seen, c.style, c.paid_sid,
            c.topic, c.locale, c.device, c.app, c.lean, c.capped, (c.teaser IS NOT NULL) AS has_line, c.member,
            th.first_at AS thread_first, b.first_c, b.first_ref, b.first_day
     FROM cast_log c LEFT JOIN cast_threads th ON th.id = c.thread_id LEFT JOIN browsers b ON b.bid = c.bid
     WHERE c.created_at >= ? ORDER BY c.created_at`,
  ).all(since - 30 * DAY) as unknown as (Omit<CastRow, "person"> & { member: number | null })[];
  // 10-04 排除会员 (Neil: 「这页应该要标明和排除会员的吧？」): a member sees no price and no block — their casts are not a
  // funnel to convert. Left out: a cast the page marked as covered by a membership, or made while the person was a member.
  const spans = memberSpans(person);
  let memberCasts = 0;
  const memberPeople = new Set<string>();
  const casts: CastRow[] = [];
  for (const { member, ...r } of rows) {
    const p = person(r.bid, null)!;
    if (member === 1 || memberAt(spans, p, r.t)) {
      if (r.t >= since) { memberCasts += 1; memberPeople.add(p); }
      continue;
    }
    casts.push({ ...r, person: p });
  }
  const byPerson = new Map<string, CastRow[]>();
  const bySid = new Map<string, CastRow>();
  for (const c of casts) {
    byPerson.set(c.person, [...(byPerson.get(c.person) ?? []), c]);
    if (c.paid_sid) bySid.set(c.paid_sid, c);
  }
  const threadIds = [...new Set(casts.map((c) => c.thread_id).filter((x): x is number => !!x))];
  const threads: Cohort["threads"] = new Map();
  for (let i = 0; i < threadIds.length; i += 500) {
    const part = threadIds.slice(i, i + 500);
    for (const t of d.prepare(`SELECT id, title, sensitive, n, first_at FROM cast_threads WHERE id IN (${part.map(() => "?").join(",")})`).all(...part) as { id: number; title: string | null; sensitive: string | null; n: number; first_at: number }[]) threads.set(t.id, t);
  }
  const attributions: Attribution[] = [];
  for (const [p, list] of purchaseRecords(since, person)) {
    const own = byPerson.get(p) ?? [];
    for (const pur of list) {
      // a member's extra (a reading at the member's price, a second plan) is not a conversion
      if (memberAt(spans, p, pur.t - 1)) continue;
      // the cast the reading was bought for: its saved cast keeps the instant (a free light reading may have come first,
      // so the log's own paid_sid can name that one instead) — then paid_sid — then the last cast before paying
      const byInstant = pur.castAt ? own.find((c) => c.at === pur.castAt) : undefined;
      const bySession = pur.sessionId ? bySid.get(pur.sessionId) : undefined;
      const bought = byInstant ?? (bySession && bySession.person === p ? bySession : undefined);
      let last: CastRow | undefined;
      for (const c of own) { if (c.t <= pur.t) last = c; else break; }
      attributions.push({ purchase: pur, person: p, cast: bought ?? last ?? null, boughtThis: !!bought });
    }
  }
  return { since, casts, byPerson, threads, attributions, person, memberCasts, memberPeople: memberPeople.size };
}

export function stageFunnel(since: number, now = Date.now(), co: Cohort = cohort(since)): StageFunnel {

  // who reached which stage in the window, and who was shown the block there
  const reached = new Map<StageKey, Set<string>>(STAGES.map((k) => [k, new Set()]));
  const saw = new Map<StageKey, Set<string>>(STAGES.map((k) => [k, new Set()]));
  const casters = new Set<string>();
  for (const c of co.casts) {
    if (c.t < since) continue;
    const k = stageOf(c.n);
    casters.add(c.person);
    reached.get(k)!.add(c.person);
    if (c.nudge_seen === 1) saw.get(k)!.add(c.person);
  }

  const paidBy = new Map<StageKey, Set<string>>(STAGES.map((k) => [k, new Set()]));
  const payers = new Map<StageKey, PayerRow[]>(STAGES.map((k) => [k, []]));
  const noCast: PayerRow[] = [];
  for (const a of co.attributions) {
    const cast = a.cast;
    const base = { purchase: a.purchase, person: a.person, bid: a.purchase.bid ?? cast?.bid ?? null, customerId: a.purchase.customerId };
    if (!cast) { noCast.push({ ...base, stage: null, n: null, cast: null, matter: null, forThisCast: false, gapMs: null }); continue; }
    if (cast.t < since) continue; // the cast belongs to an earlier cohort
    const k = stageOf(cast.n);
    const th = cast.thread_id ? co.threads.get(cast.thread_id) : undefined;
    paidBy.get(k)!.add(a.person);
    payers.get(k)!.push({
      ...base, stage: k, n: cast.n,
      cast: { id: cast.id, t: cast.t, question: cast.question, sensitive: cast.sensitive, nudge: cast.nudge, nudgeSeen: cast.nudge_seen === 1, style: cast.style },
      matter: th ? { id: th.id, title: th.title, sensitive: th.sensitive, casts: th.n, firstAt: th.first_at } : null,
      forThisCast: a.boughtThis,
      gapMs: Math.max(0, a.purchase.t - cast.t),
    });
  }

  // still deciding: their latest cast (any matter) is at this stage, under 24 hours old (10-06, was 72), and nothing bought since it
  const pendingAt = new Map<StageKey, number>(STAGES.map((k) => [k, 0]));
  const bought = purchaseRecords(since - 30 * DAY, co.person);
  for (const p of casters) {
    const own = co.byPerson.get(p) ?? [];
    const latest = own[own.length - 1];
    if (!latest || now - latest.t >= SETTLE_MS) continue;
    if ((bought.get(p) ?? []).some((x) => x.t >= latest.t)) continue;
    const k = stageOf(latest.n);
    pendingAt.set(k, pendingAt.get(k)! + 1);
  }

  const cum = new Set<string>();
  const stages: StageRow[] = STAGES.map((k) => {
    for (const p of paidBy.get(k)!) cum.add(p);
    return {
      k, reached: reached.get(k)!.size, saw: saw.get(k)!.size,
      // paid ⊆ reached: a person counts as converted at a stage they reached in the window
      paid: [...paidBy.get(k)!].filter((p) => reached.get(k)!.has(p)).length,
      // of those shown the block at this stage, how many paid at this stage
      sawPaid: [...paidBy.get(k)!].filter((p) => saw.get(k)!.has(p)).length,
      pending: pendingAt.get(k)!, cumulative: [...cum].filter((p) => casters.has(p)).length,
      payers: payers.get(k)!.sort((a, b) => b.purchase.t - a.purchase.t),
    };
  });
  return { since, casters: casters.size, stages, noCast: noCast.sort((a, b) => b.purchase.t - a.purchase.t), payments: co.attributions.length, payersInCohort: cum.size };
}

/* ---------------- 10-03 分组看转化 (Neil: 「AI能调取所有的记录然后自学习自己优化吗」→「两个都做吧」) ---------------- */

export type Dim = "topic" | "lean" | "matterDay" | "visitor" | "channel" | "app" | "device" | "locale" | "hour"
  | "pCasts" | "pMatterMax" | "pNight" | "pLeanSeen" | "pPrice" | "pRevisit";
export const DIMS: { id: Dim; zh: string }[] = [
  { id: "topic", zh: "问题类别" }, { id: "lean", zh: "免费一句吉凶" }, { id: "matterDay", zh: "当天还是隔天" }, { id: "visitor", zh: "新来还是回访" },
  { id: "channel", zh: "从哪来" }, { id: "app", zh: "在哪个 App 打开" }, { id: "device", zh: "手机还是电脑" }, { id: "locale", zh: "语言" }, { id: "hour", zh: "时段（读者当地）" },
  // 10-14 按人的行为分组 (Neil: 「是否能对所有用户进行心理画像……根据这个心理画像去做付费引导」→ behaviour only, no psychology: 「好，做吧」)
  { id: "pCasts", zh: "这个人摇了几卦" }, { id: "pMatterMax", zh: "一件事最多问几卦" }, { id: "pNight", zh: "深夜摇卦的人" },
  { id: "pLeanSeen", zh: "免费一句多半说什么" }, { id: "pPrice", zh: "看价格的行为" }, { id: "pRevisit", zh: "回访答过什么" },
];
export const PERSON_DIMS: ReadonlySet<Dim> = new Set<Dim>(["pCasts", "pMatterMax", "pNight", "pLeanSeen", "pPrice", "pRevisit"]);

/**
 * 10-14: a person's behaviour in the window, read off their own casts (and events / revisits for the last two) — a group
 * is a fact about what they did, never a guess about what they are. Members are already out of the cohort.
 */
export interface PersonFeatures {
  casts: number; matterMax: number; nightShare: number;
  /** of the free lines they saw: the lean they saw most, or "none" when the cap took every one */
  leanSeen: "good" | "mixed" | "bad" | "none" | "mixed-bag";
  price: "never" | "seen" | "clicked" | "checkout" | "paid";
  revisit: "none" | "sent" | "hit" | "partial" | "miss" | "nothing";
}
export function personFeatures(co: Cohort, since: number, evs: { e: string; b?: string | null; t: number }[] = []): Map<string, PersonFeatures> {
  const d = db();
  const out = new Map<string, PersonFeatures>();
  const bidOf = new Map<string, Set<string>>();
  for (const [person, list] of co.byPerson) {
    const own = list.filter((c) => c.t >= since);
    if (!own.length) continue;
    for (const c of own) { const s = bidOf.get(c.bid) ?? new Set<string>(); s.add(person); bidOf.set(c.bid, s); }
    const perThread = new Map<number, number>();
    for (const c of own) if (c.thread_id) perThread.set(c.thread_id, (perThread.get(c.thread_id) ?? 0) + 1);
    const night = own.filter((c) => new Date(c.at + c.tz * 60_000).getUTCHours() < 6).length;
    const leans: Record<string, number> = {};
    for (const c of own) if (c.has_line && c.lean) leans[c.lean] = (leans[c.lean] ?? 0) + 1;
    const seen = Object.entries(leans).sort((x, y) => y[1] - x[1]);
    const total = seen.reduce((a, [, n]) => a + n, 0);
    const leanSeen: PersonFeatures["leanSeen"] = !total ? "none" : seen[0]![1] / total >= 0.6 ? (seen[0]![0] as "good" | "mixed" | "bad") : "mixed-bag";
    out.set(person, { casts: own.length, matterMax: Math.max(1, ...perThread.values()), nightShare: night / own.length, leanSeen, price: "never", revisit: "none" });
  }
  // price behaviour from the events of these browsers; paid from the cohort's own attribution
  const rank: Record<PersonFeatures["price"], number> = { never: 0, seen: 1, clicked: 2, checkout: 3, paid: 4 };
  const bump = (person: string, v: PersonFeatures["price"]) => { const f = out.get(person); if (f && rank[v] > rank[f.price]) f.price = v; };
  for (const e of evs) {
    if (!e.b || e.t < since) continue;
    const v: PersonFeatures["price"] | null = e.e === "price_seen" ? "seen" : e.e === "reading_click" ? "clicked" : e.e === "checkout_start" ? "checkout" : null;
    if (!v) continue;
    for (const person of bidOf.get(e.b) ?? []) bump(person, v);
  }
  for (const a of co.attributions) if (a.cast && a.cast.t >= since) bump(a.person, "paid");
  // the last revisit answer of each person (by their browsers' customers)
  const custOf = new Map<number, string>();
  for (const l of d.prepare("SELECT bid, customer_id FROM browser_links").all() as { bid: string; customer_id: number }[]) for (const person of bidOf.get(l.bid) ?? []) custOf.set(l.customer_id, person);
  if (custOf.size) {
    const ph = [...custOf.keys()].map(() => "?").join(",");
    for (const r of d.prepare(`SELECT customer_id, status, outcome, event FROM revisits WHERE customer_id IN (${ph}) ORDER BY id`).all(...custOf.keys()) as { customer_id: number; status: string; outcome: string | null; event: string | null }[]) {
      const f = out.get(custOf.get(r.customer_id)!);
      if (!f) continue;
      if (r.outcome === "hit" || r.outcome === "partial" || r.outcome === "miss") f.revisit = r.outcome;
      else if (r.event === "nothing") f.revisit = "nothing";
      else if (r.status === "sent" && f.revisit === "none") f.revisit = "sent";
    }
  }
  return out;
}

const P_LEAN_ZH: Record<PersonFeatures["leanSeen"], string> = { good: "多半偏吉", mixed: "多半看条件", bad: "多半偏凶", "mixed-bag": "吉凶都有", none: "没看到过免费一句" };
const P_PRICE_ZH: Record<PersonFeatures["price"], string> = { never: "从没看到价格", seen: "看到价格，没点", clicked: "点了价格，没去付款", checkout: "到了付款页，没付", paid: "付了" };
const P_REVISIT_ZH: Record<PersonFeatures["revisit"], string> = { none: "没收过回访", sent: "收了回访，没答", hit: "答过「说中了」", partial: "答过「有一点」", miss: "答过「没说中」", nothing: "答过「没发生」（不计分）" };
export function personSegValue(f: PersonFeatures | undefined, dim: Dim): { key: string; label: string } {
  if (!f) return { key: "unknown", label: "（没有记录）" };
  switch (dim) {
    case "pCasts": return f.casts === 1 ? { key: "1", label: "1 卦" } : f.casts <= 3 ? { key: "2-3", label: "2–3 卦" } : f.casts <= 9 ? { key: "4-9", label: "4–9 卦" } : f.casts <= 29 ? { key: "10-29", label: "10–29 卦" } : { key: "30+", label: "30 卦以上" };
    case "pMatterMax": return f.matterMax === 1 ? { key: "1", label: "每件事只问 1 卦" } : f.matterMax <= 3 ? { key: "2-3", label: "最多问到 2–3 卦" } : f.matterMax <= 5 ? { key: "4-5", label: "最多问到 4–5 卦" } : f.matterMax <= 9 ? { key: "6-9", label: "最多问到 6–9 卦" } : { key: "10+", label: "一件事问了 10 卦以上" };
    case "pNight": return f.nightShare === 0 ? { key: "0", label: "没在深夜摇过" } : f.nightShare < 0.5 ? { key: "some", label: "偶尔深夜（不到一半）" } : { key: "most", label: "多半在深夜 0–5 点" };
    case "pLeanSeen": return { key: f.leanSeen, label: P_LEAN_ZH[f.leanSeen] };
    case "pPrice": return { key: f.price, label: P_PRICE_ZH[f.price] };
    case "pRevisit": return { key: f.revisit, label: P_REVISIT_ZH[f.revisit] };
  }
  return { key: "unknown", label: "?" };
}
export const TOPIC_ZH: Record<string, string> = { career: "事业", relationship: "感情", money: "财运", health: "健康", study: "学业", decision: "抉择", other: "其他" };
const LEAN_ZH: Record<string, string> = { good: "偏吉", mixed: "看条件", bad: "偏凶" };
const APP_ZH: Record<string, string> = { threads: "Threads", instagram: "Instagram", facebook: "Facebook", line: "LINE", wechat: "微信", xiaohongshu: "小红书", browser: "浏览器" };
const DEVICE_ZH: Record<string, string> = { ios: "iPhone / iPad", android: "安卓", desktop: "电脑", other: "其他" };
const LOCALE_ZH: Record<string, string> = { "zh-hant": "繁中", zh: "简中", en: "英文", ja: "日文", ko: "韩文", fr: "法文", de: "德文", es: "西文", pt: "葡文" };

const localDay = (ms: number, tz: number) => new Date(ms + tz * 60_000).toISOString().slice(0, 10);

/** Where a browser first came from: a campaign tag or a referring platform, else "direct". */
export function channelOf(firstC: string | null, firstRef: string | null): string {
  const raw = (firstC ?? firstRef ?? "").replace(/^~/, "");
  if (!raw) return "direct";
  if (raw.startsWith("ref:")) {
    const h = raw.slice(4);
    return /(^|\.)google\./.test(h) ? "google" : /(^|\.)(bing|duckduckgo|yahoo|baidu)\./.test(h) ? "search" : "other-site";
  }
  return raw === "ig" ? "instagram" : raw === "fbpage" ? "facebook" : raw;
}

/** One cast's value on one dimension: a stable key and the label the dashboard shows. */
export function segValue(c: CohortCast, dim: Dim): { key: string; label: string } {
  switch (dim) {
    case "topic": { const k = c.topic ?? "other"; return { key: k, label: TOPIC_ZH[k] ?? k }; }
    case "lean":
      if (c.sensitive) return { key: "private", label: "特种个资（不判）" };
      if (!c.has_line) return { key: "none", label: c.capped ? "问满了，没给免费一句" : "没有免费一句" };
      return c.lean ? { key: c.lean, label: LEAN_ZH[c.lean] ?? c.lean } : { key: "unknown", label: "还没判断" };
    case "matterDay": {
      if (!c.thread_first) return { key: "same", label: "这件事的第一天" };
      const gap = Math.round((Date.parse(localDay(c.at, c.tz)) - Date.parse(localDay(c.thread_first, c.tz))) / DAY);
      return gap <= 0 ? { key: "same", label: "这件事的第一天" } : gap === 1 ? { key: "next", label: "隔天回来" } : gap < 7 ? { key: "days", label: "2–6 天后回来" } : { key: "week", label: "一周以上才回来" };
    }
    case "visitor":
      if (!c.first_day) return { key: "unknown", label: "不知道" };
      return c.first_day >= localDay(c.at, c.tz) ? { key: "new", label: "第一天来" } : { key: "back", label: "以前来过" };
    case "channel": { const k = channelOf(c.first_c, c.first_ref); return { key: k, label: k === "direct" ? "直接打开" : k === "other-site" ? "其他网站" : k === "search" ? "其他搜索" : k }; }
    case "app": { const k = c.app ?? "unknown"; return { key: k, label: APP_ZH[k] ?? "（之前没记）" }; }
    case "device": { const k = c.device ?? "unknown"; return { key: k, label: DEVICE_ZH[k] ?? "（之前没记）" }; }
    case "locale": { const k = c.locale ?? "unknown"; return { key: k, label: LOCALE_ZH[k] ?? k }; }
    case "hour": {
      const h = new Date(c.at + c.tz * 60_000).getUTCHours();
      return h < 6 ? { key: "night", label: "深夜 0–5 点" } : h < 12 ? { key: "morning", label: "上午 6–11 点" } : h < 18 ? { key: "afternoon", label: "下午 12–17 点" } : { key: "evening", label: "晚上 18–23 点" };
    }
  }
  // a person dimension asked of a single cast: segmentTable routes those to personSegValue
  return { key: "unknown", label: "?" };
}

export interface SegCell { reached: number; paid: number }
export interface SegmentTable { dim: Dim; values: { key: string; label: string }[]; all: Record<string, SegCell>; byStage: Record<StageKey, Record<string, SegCell>> }

/**
 * Conversion by group, per person, the same way as the stage funnel: a person counts under a group value if one of their
 * casts in the window had it; paid under a value if the cast their purchase was placed at had it. `all` = any stage.
 */
export function segmentTable(since: number, dim: Dim, co: Cohort = cohort(since), feats?: Map<string, PersonFeatures>): SegmentTable {
  const labels = new Map<string, string>();
  const value = (c: CohortCast) => (PERSON_DIMS.has(dim) ? personSegValue(feats?.get(c.person), dim) : segValue(c, dim));
  const reachedAll = new Map<string, Set<string>>();
  const paidAll = new Map<string, Set<string>>();
  const reachedBy = new Map<StageKey, Map<string, Set<string>>>(STAGES.map((k) => [k, new Map()]));
  const paidByStage = new Map<StageKey, Map<string, Set<string>>>(STAGES.map((k) => [k, new Map()]));
  const add = (m: Map<string, Set<string>>, key: string, p: string) => { const s = m.get(key) ?? new Set<string>(); s.add(p); m.set(key, s); };
  for (const c of co.casts) {
    if (c.t < since) continue;
    const v = value(c);
    labels.set(v.key, v.label);
    add(reachedAll, v.key, c.person);
    add(reachedBy.get(stageOf(c.n))!, v.key, c.person);
  }
  for (const a of co.attributions) {
    if (!a.cast || a.cast.t < since) continue;
    const v = value(a.cast);
    labels.set(v.key, v.label);
    add(paidAll, v.key, a.person);
    add(paidByStage.get(stageOf(a.cast.n))!, v.key, a.person);
  }
  const values = [...labels.entries()].map(([key, label]) => ({ key, label })).sort((x, y) => (reachedAll.get(y.key)?.size ?? 0) - (reachedAll.get(x.key)?.size ?? 0));
  const cell = (r?: Set<string>, p?: Set<string>): SegCell => ({ reached: r?.size ?? 0, paid: p ? [...p].filter((x) => r?.has(x)).length : 0 });
  const all: Record<string, SegCell> = {};
  for (const v of values) all[v.key] = cell(reachedAll.get(v.key), paidAll.get(v.key));
  const byStage = Object.fromEntries(STAGES.map((k) => [k, Object.fromEntries(values.map((v) => [v.key, cell(reachedBy.get(k)!.get(v.key), paidByStage.get(k)!.get(v.key))]))])) as Record<StageKey, Record<string, SegCell>>;
  return { dim, values, all, byStage };
}

/** Names for the dashboard: a customer's address before the @ (linking to all their browsers), else 访客 + the browser's first six. */
export function personLabels(rows: { bid: string | null; customerId: number | null }[]): (bid: string | null, customerId: number | null) => { who: string; href: string; known: boolean } {
  const d = db();
  const bids = [...new Set(rows.map((r) => r.bid).filter((x): x is string => !!x))];
  const linked = new Map<string, number>();
  for (let i = 0; i < bids.length; i += 500) {
    const part = bids.slice(i, i + 500);
    for (const l of d.prepare(`SELECT bid, customer_id FROM browser_links WHERE bid IN (${part.map(() => "?").join(",")}) ORDER BY last_at`).all(...part) as { bid: string; customer_id: number }[]) linked.set(l.bid, l.customer_id);
  }
  const ids = [...new Set([...rows.map((r) => r.customerId), ...linked.values()].filter((x): x is number => !!x))];
  const emails = new Map<number, string>();
  for (let i = 0; i < ids.length; i += 500) {
    const part = ids.slice(i, i + 500);
    for (const c of d.prepare(`SELECT id, email FROM customers WHERE id IN (${part.map(() => "?").join(",")})`).all(...part) as { id: number; email: string }[]) emails.set(c.id, c.email);
  }
  return (bid, customerId) => {
    const cid = customerId ?? (bid ? linked.get(bid) ?? null : null);
    if (cid) return { who: emails.get(cid)?.split("@")[0] ?? `#${cid}`, href: `/admin/people/c${cid}`, known: true };
    if (bid) return { who: `访客 ${bid.slice(0, 6)}`, href: `/admin/people/${bid}`, known: false };
    return { who: "（未知）", href: "/admin/people", known: false };
  };
}
