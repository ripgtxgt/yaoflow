import { db, recordOps } from "./db";
import { chatJsonFull, parseJsonLoose, type LlmMessage } from "./llm";
import { ensureHant, toHans } from "./hant";
import { channelOf, cohort, segmentTable, stageFunnel, type Cohort, type CohortCast, type Dim } from "./stage-funnel";
import { aiMax, aiMode, ALL_SLOTS, CLAIM_UNREAD, DRAFT_SLOTS, claimCheck, insertAiVariant, logRun, lastRun, nearCopy, nearCopyStyle, nudgeOffenses, styleOffenses, topicSegment, variants, variantStats, type NudgeText, type Slot } from "./nudge";
import type { PurchaseRec } from "./purchases";

/**
 * 10-03 AI 每周分析 (Neil: 「这个优化的功能，AI能调取所有的记录然后自学习自己优化吗？」→ ② 逐条读 →「两个都做吧」).
 *
 * Once a week (or on the dashboard's button) a model reads the cast log itself, journey by journey: for each person in
 * the last two weeks, every cast in order — the matter, its place on the matter, the kind of question, the question, the
 * free line and its lean, the block version shown — and what they bought, if anything. It looks for why people who keep
 * casting do not buy and what the buyers share, writes a report for the owner, and proposes new block versions and new
 * ways for the free line to tie casts together. The proposals do not win by being written: block versions go through the
 * same guards and the same sampler as every other version (paying readers decide), and free-line styles wait for a yes.
 *
 * What the model gets: people under codes (P1, P2 …) in a shuffled order, never an email, an account or a browser id;
 * special-category questions were never kept in words (lib/cast-log.ts); at most REVIEW_MAX journeys — every payer, every
 * repeat caster, then a sample. The code → person key is kept with the report for the dashboard's links only.
 * NUDGE_REVIEW=off stops it; NUDGE_REVIEW_MIN is how many people a fortnight needs before it runs (30).
 */

const DAY = 86_400_000;
export const REVIEW_DAYS = 14;
export const REVIEW_MAX = 150;
const BATCH = 40;
const STALE_MS = 20 * 60_000;
/**
 * 10-04: room for the answers. #3 and #4 (150 journeys, 4 batches) died in the synthesis: its report ran past the 2600
 * tokens it was allowed, the JSON stopped mid-string and read as nothing. Now the prompts cap each item's length, the
 * room is more than the capped answer needs, and an answer that is cut off all the same is read up to the last value
 * finished — or asked for once more, shorter (askJson).
 */
const BATCH_TOKENS = 3000;
const SYNTH_TOKENS = 6000;
const MAX_TOKENS = 8000;
export const reviewOn = (): boolean => (process.env.NUDGE_REVIEW ?? "on") !== "off";
const reviewMin = (): number => Number(process.env.NUDGE_REVIEW_MIN ?? 30) || 30;

const TOPIC_EN: Record<string, string> = { career: "career", relationship: "relationship", money: "money", health: "health", study: "study", decision: "decision", other: "other" };

/* ---------------- journeys ---------------- */

export interface JourneyCast {
  t: number; tz: number; matter: string; n: number | null; topic: string; question: string | null; sensitive: string | null; line: string | null; lean: string | null; capped: boolean;
  nudge: string | null; nudgeSeen: boolean; style: string | null;
  /** 10-04: the words of a block written for this reader (the *-personal versions) */
  nudgeText?: string | null;
}
export interface JourneyBuy { t: number; what: string; forCast: string | null; gapMin: number | null }
export interface Journey { code: string; person: string; bid: string | null; customerId: number | null; from: string; device: string | null; app: string | null; locale: string | null; casts: JourneyCast[]; buys: JourneyBuy[] }

const clip = (s: string, n: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};
const local = (ms: number, tz: number) => new Date(ms + tz * 60_000).toISOString().slice(5, 16).replace("T", " ");
const boughtWhat = (p: PurchaseRec) =>
  p.kind === "membership" ? `membership (${p.plan ?? "?"})` : `${p.tier === "deep" ? "full reading" : "light reading"}${p.firstDeep ? " at the first price" : ""}${p.currency ? ` (${p.currency.toUpperCase()})` : ""}${p.state === "refunded" ? ", refunded later" : ""}`;

/** Fisher–Yates with the given random source (tests pass a fixed one). */
function shuffle<T>(xs: T[], rnd: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; }
  return a;
}

/**
 * The journeys of the window's people: every payer, every repeat caster (most casts first), then a sample of the rest,
 * up to `max`; coded P1… in a shuffled order so the order says nothing.
 */
export function buildJourneys(since: number, max = REVIEW_MAX, rnd: () => number = Math.random, co: Cohort = cohort(since)): { journeys: Journey[]; people: number; payers: number; picked: { payers: number; repeat: number; sampled: number } } {
  const inWindow = co.casts.filter((c) => c.t >= since);
  const people = [...new Set(inWindow.map((c) => c.person))];
  const buysOf = new Map<string, typeof co.attributions>();
  for (const a of co.attributions) buysOf.set(a.person, [...(buysOf.get(a.person) ?? []), a]);
  const payers = people.filter((p) => buysOf.has(p));
  const maxN = (p: string) => Math.max(0, ...(co.byPerson.get(p) ?? []).filter((c) => c.t >= since).map((c) => c.n ?? 1));
  const repeat = people.filter((p) => !buysOf.has(p) && maxN(p) >= 2).sort((a, b) => maxN(b) - maxN(a));
  const rest = shuffle(people.filter((p) => !buysOf.has(p) && maxN(p) < 2), rnd);
  const chosen = [...payers, ...repeat, ...rest].slice(0, max);
  const picked = { payers: Math.min(payers.length, max), repeat: Math.max(0, Math.min(repeat.length, max - payers.length)), sampled: 0 };
  picked.sampled = chosen.length - picked.payers - picked.repeat;

  const journeys: Journey[] = shuffle(chosen, rnd).map((p, i) => {
    const own = (co.byPerson.get(p) ?? []).filter((c) => c.t >= since);
    const letters = new Map<number | string, string>();
    const letterOf = (c: CohortCast) => {
      const k = c.thread_id ?? `cast-${c.id}`;
      if (!letters.has(k)) letters.set(k, String.fromCharCode(65 + (letters.size % 26)));
      return letters.get(k)!;
    };
    const casts: JourneyCast[] = own.map((c) => ({
      t: c.t, tz: c.tz, matter: letterOf(c), n: c.n, topic: TOPIC_EN[c.topic ?? "other"] ?? "other",
      question: c.question ? clip(c.question, 120) : null, sensitive: c.sensitive,
      line: null, // filled below: the cohort row keeps only whether there was one
      lean: c.lean, capped: c.capped === 1, nudge: c.nudge, nudgeSeen: c.nudge_seen === 1, style: c.style,
    }));
    // the free lines themselves (the cohort keeps only whether there was one)
    const ids = own.map((c) => c.id);
    if (ids.length) {
      const lines = new Map((db().prepare(`SELECT id, teaser, nudge, nudge_text FROM cast_log WHERE id IN (${ids.map(() => "?").join(",")})`).all(...ids) as { id: number; teaser: string | null; nudge: string | null; nudge_text: string | null }[]).map((r) => [r.id, r]));
      own.forEach((c, k) => {
        const r = lines.get(c.id);
        casts[k]!.line = r?.teaser ? clip(r.teaser, 100) : null;
        // a block written for this reader: its words, so the review can see which angles moved people
        if (r?.nudge_text && r.nudge?.endsWith("-personal")) {
          try { const j = JSON.parse(r.nudge_text) as { title?: string; body?: string }; casts[k]!.nudgeText = clip(`${j.title ?? ""} — ${j.body ?? ""}`, 110); } catch { /* words unreadable: the id alone */ }
        }
      });
    }
    const buys: JourneyBuy[] = (buysOf.get(p) ?? []).map((a) => ({
      t: a.purchase.t, what: boughtWhat(a.purchase),
      forCast: a.cast && a.cast.t >= since ? `matter ${letterOf(a.cast)} cast ${a.cast.n ?? 1}${a.boughtThis ? "" : " (their last cast before paying; the purchase is not linked to a particular cast)"}` : a.cast ? "a cast before this fortnight" : null,
      gapMin: a.cast ? Math.max(0, Math.round((a.purchase.t - a.cast.t) / 60_000)) : null,
    }));
    const first = own[0] ?? (co.byPerson.get(p) ?? [])[0];
    return {
      code: `P${i + 1}`, person: p, bid: first?.bid ?? null, customerId: (buysOf.get(p) ?? []).find((a) => a.purchase.customerId)?.purchase.customerId ?? null,
      from: first ? channelOf(first.first_c, first.first_ref) : "?", device: first?.device ?? null, app: first?.app ?? null, locale: first?.locale ?? null, casts, buys,
    };
  });
  return { journeys, people: people.length, payers: payers.length, picked };
}

/** One journey as the model reads it — no email, no account, no browser id. */
export function journeyText(j: Journey): string {
  const head = `${j.code} | from ${j.from} | ${j.device ?? "?"}/${j.app ?? "?"} | ${j.locale ?? "?"}`;
  const tz = j.casts[0]?.tz ?? 480;
  const events: { t: number; line: string }[] = [
    ...j.casts.map((c) => ({
      t: c.t,
      line: `${local(c.t, c.tz)} · matter ${c.matter} · cast ${c.n ?? 1} · ${c.topic} · Q ${c.question ? `「${c.question}」` : `(${c.sensitive ?? "private"} question — words not kept)`}`
        + (c.capped ? " → no free line (daily limit on this kind of question)" : c.line ? ` → line「${c.line}」(${c.lean ?? "lean unknown"})` : c.sensitive ? " → free line given (its words not kept for this kind of question)" : " → no line")
        + (c.nudge ? ` · block ${c.nudge}${c.nudgeText ? ` (written for this reader:「${c.nudgeText}」)` : ""}${c.nudgeSeen ? " shown" : " not shown"}` : "")
        + (c.style ? ` · line style ${c.style}` : ""),
    })),
    ...j.buys.map((b) => ({ t: b.t, line: `${local(b.t, tz)} · PAID ${b.what}${b.forCast ? ` — for ${b.forCast}` : ""}${b.gapMin !== null ? `, ${b.gapMin} min after that cast` : ""}` })),
  ].sort((a, b) => a.t - b.t);
  return [head, ...events.map((e) => `  - ${e.line}`)].join("\n");
}

/* ---------------- prompts ---------------- */

const SITE = "How the site works: a reader asks a question and casts six lines; right after the cast they get ONE free sentence (the \"free line\") about which way it leans; then two prices — a light reading, and the full reading (深斷: the call, timing with dates, what to do and what to avoid, two signs to watch, follow-up questions; the first one at a lower first price). On the 2nd and later cast about the same matter, a short block before the price (a \"block\", with a version id) invites them to read the casts together in the full reading, and the free line is written with the earlier casts in view. Blocks whose id ends in -personal were written for that reader from their own casts (their words are given). Members see no prices and no blocks: their casts are left out of these journeys (a reader who becomes a member shows it as a PAID membership line). From the 4th cast of a day on one kind of question there is no free line, only the block.";

export const BATCH_SYSTEM = [
  "You analyse anonymised reader journeys from YaoFlow, an I Ching (Liu Yao) reading site, for its owner.",
  SITE,
  "Each journey: a code (P…), where the browser came from, device/app, language, then each cast in time order (the reader's local time): which matter (A, B …), the cast's number on that matter, the kind of question, the question, the free line and its lean (good / mixed / bad), the block version if one was shown; then PAID lines (what they bought and for which cast).",
  "Find what explains paying and not paying. Look hard at people who cast the same matter again and again without paying — what did they ask, what were they told, where did they stop? — and at what the payers share (kind of question, lean of the line, time of day, how many casts, how fast).",
  "Rules: cite the codes for every pattern; keep what the journeys show apart from your guesses; say when a pattern rests on fewer than 5 people; never guess who anyone is; quote at most a few words of any question.",
  "Keep it short: at most 8 findings, each detail at most 200 characters; at most 6 items each in why_not_paying and what_payers_share, each at most 80 characters.",
  "Write in Simplified Chinese. Output JSON only:",
  '{"findings":[{"title":"…","detail":"…","people":["P3","P8"],"strength":"strong|weak"}],"why_not_paying":["…"],"what_payers_share":["…"]}',
].join("\n");

export const SYNTH_SYSTEM = [
  "You write YaoFlow's weekly report on reader journeys for the site's owner, from several batches of findings and the numbers given, and you propose changes the site can test by itself.",
  SITE,
  "The report: a summary of 3–6 sentences in Simplified Chinese; the findings that hold across batches (merge duplicates, keep the people codes, mark weak ones); then proposals:",
  "- \"copy\": new versions of the block before the price, for stage n2 (2nd cast), n3 (3rd) or n4 (4th or later), optionally only for one kind of question (\"for_topic\": career | relationship | money | health | study | decision | other). Traditional Chinese as written in Taiwan. HARD RULES: calm and honest; no urgency or scarcity; no discount (only the price shown); no guarantee or accuracy claim; no fear, misfortune or regret; no health words; no statistics or claims about other people; no digits — use {n} (this cast's number on the matter), {span} (how long they have been asking), {price} (exactly once, at the end of the button, as \" · {price}\"); title ≤ 18 characters, body 30–80 characters, button ≤ 16 characters before \" · {price}\". Use only these facts: the full reading reads this cast together with the earlier casts on the matter and gives the call, timing windows with dates, what to do, what to avoid, two signs to watch, and follow-up questions; with it they can ask follow-ups instead of casting again. At most 2 per stage, each with \"why\" (the finding it answers).",
  "- \"styles\": new ways for the free line on a 2nd+ cast to tie this chart to the earlier ones — an English instruction, one clause, 40–200 characters, starting with a verb (\"say …\", \"name …\"). The line's own rules never change (one sentence, no timing, no advice, no chart vocabulary, never bend the chart, never count their casts). At most 2, each with \"why\".",
  "- \"owner\": changes only the owner can decide (prices, products, pages, emails) — short and concrete, each tied to a finding.",
  "Every block and style you propose must be clearly NEW next to the live versions and styles in numbers.live_versions: a different angle that answers a finding — never a live title, never mostly a live text with a phrase added or swapped. If you have nothing clearly new for a stage, propose nothing for it.",
  "Speak of the journeys as one whole (never \"this batch\"). Write the summary, findings, owner points, labels and every \"why\" in Simplified Chinese (简体中文); only the block texts are in Traditional Chinese.",
  "Keep it short: at most 10 findings, each detail at most 250 characters; at most 8 owner points of one sentence each; every \"why\" at most 60 characters.",
  "Output JSON only:",
  '{"summary":"…","findings":[{"title":"…","detail":"…","people":["P…"],"strength":"strong|weak"}],"copy":[{"slot":"n2","for_topic":null,"title":"…","body":"…","cta":"… · {price}","why":"…"}],"styles":[{"label":"…","prompt":"…","why":"…"}],"owner":["…"]}',
].join("\n");

/** The numbers the synthesis sees: the stage funnel, a few group tables, the live versions — no people. */
function numbersFor(since: number, co: Cohort, now: number): unknown {
  const fn = stageFunnel(since, now, co);
  const tables: Partial<Record<Dim, unknown>> = {};
  for (const dim of ["topic", "lean", "matterDay", "app", "hour"] as Dim[]) {
    const t = segmentTable(since, dim, co);
    tables[dim] = t.values.map((v) => ({ group: v.key, people: t.all[v.key]!.reached, paid: t.all[v.key]!.paid }));
  }
  return {
    stages: fn.stages.map((s) => ({ stage: s.k, people: s.reached, shown_block: s.saw, paid: s.paid, still_deciding: s.pending })),
    groups: tables,
    live_versions: ALL_SLOTS.flatMap((slot) => {
      const st = variantStats(slot, now);
      return variants(slot).filter((v) => v.status === "active").map((v) => {
        const s = st.get(v.id);
        return { slot, id: v.id, ...(v.segment ? { only_for: v.segment.replace(/^topic:/, "") } : {}), text: v.texts["zh-hant"] ?? v.texts["*"] ?? null, shown: s?.shown ?? 0, settled: s?.settled ?? 0, paid: s?.paid ?? 0 };
      });
    }),
  };
}

/* ---------------- running one ---------------- */

export interface ReviewFinding { title: string; detail: string; people: string[]; strength: string }
export interface ReviewCopy { slot: string; for_topic: string | null; title: string; body: string; cta: string; why: string; id?: string; status?: string; rejected?: string[]; /** why it waits for a yes (说法核对) */ note?: string }
export interface ReviewStyle { label: string; prompt: string; why: string; id?: string; status?: string; rejected?: string[] }
export interface ReviewBody {
  summary: string; findings: ReviewFinding[]; why_not_paying: string[]; what_payers_share: string[]; owner: string[];
  copy: ReviewCopy[]; styles: ReviewStyle[];
  picked: { payers: number; repeat: number; sampled: number }; batches: number;
  /** 10-04: how the answers were got when not whole — a batch read up to where it was cut off, the report asked for again shorter */
  notes?: string[];
  /** code → whose journey it was: for the dashboard's links only, never sent to the model */
  codes: Record<string, { bid: string | null; customerId: number | null }>;
}
export interface ReviewRow { id: number; at: number; by: string | null; status: string; window_from: number; window_to: number; people: number | null; payers: number | null; body: ReviewBody | null; error: string | null; finished_at: number | null }

const toRow = (r: Record<string, unknown>): ReviewRow => ({
  id: Number(r.id), at: Number(r.at), by: (r.by as string | null) ?? null, status: String(r.status), window_from: Number(r.window_from), window_to: Number(r.window_to),
  people: (r.people as number | null) ?? null, payers: (r.payers as number | null) ?? null,
  body: (() => { try { return r.body_json ? (JSON.parse(String(r.body_json)) as ReviewBody) : null; } catch { return null; } })(),
  error: (r.error as string | null) ?? null, finished_at: (r.finished_at as number | null) ?? null,
});
export const reviewById = (id: number): ReviewRow | null => { const r = db().prepare("SELECT * FROM ai_reports WHERE id = ?").get(id) as Record<string, unknown> | undefined; return r ? toRow(r) : null; };
export const recentReviews = (limit = 12): ReviewRow[] => (db().prepare("SELECT * FROM ai_reports ORDER BY at DESC LIMIT ?").all(limit) as Record<string, unknown>[]).map(toRow);

const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const str = (x: unknown, n = 600) => (typeof x === "string" ? x.trim().slice(0, n) : "");

/**
 * Start one review: the row is written at once (status running) and the reading happens in the background — the
 * dashboard's button and the cron never wait on it. Refused while another one is running.
 */
export function startAiReview(opts: { by: string; now?: number; days?: number; max?: number; rnd?: () => number; /** journeys per batch (tests) */ batch?: number } ): { started: boolean; id?: number; why?: string; done?: Promise<void> } {
  const now = opts.now ?? Date.now();
  const d = db();
  const running = d.prepare("SELECT id, at FROM ai_reports WHERE status = 'running' ORDER BY at DESC LIMIT 1").get() as { id: number; at: number } | undefined;
  if (running && now - running.at < STALE_MS) return { started: false, id: running.id, why: "running" };
  if (running) d.prepare("UPDATE ai_reports SET status = 'failed', error = 'stale', finished_at = ? WHERE id = ?").run(now, running.id);
  const since = now - (opts.days ?? REVIEW_DAYS) * DAY;
  const co = cohort(since);
  const j = buildJourneys(since, opts.max ?? REVIEW_MAX, opts.rnd ?? Math.random, co);
  if (!j.journeys.length) return { started: false, why: "no casts in the window" };
  const id = Number(d.prepare("INSERT INTO ai_reports (at, by, status, window_from, window_to, people, payers) VALUES (?,?,?,?,?,?,?)")
    .run(now, opts.by.slice(0, 20), "running", since, now, j.people, j.payers).lastInsertRowid);
  logRun("review_start", `#${id} by=${opts.by} people=${j.people} payers=${j.payers} journeys=${j.journeys.length}`, now);
  const done = finishReview(id, since, now, j, co, opts.batch ?? BATCH).catch((e) => {
    d.prepare("UPDATE ai_reports SET status = 'failed', error = ?, finished_at = ? WHERE id = ?").run((e instanceof Error ? e.message : "?").slice(0, 300), Date.now(), id);
    recordOps("ai_review_fail", `#${id} ${(e instanceof Error ? e.message : "?").slice(0, 120)}`);
  });
  return { started: true, id, done };
}

const SHORTER = "Your previous answer was cut off before the JSON ended. Answer again, SHORTER: fewer items, every item within its length limit, and make sure the JSON closes.";
const INVALID = "Your previous answer was not valid JSON. Answer again with valid JSON only, in the shape given.";

/** The model answered twice and neither answer could be read (as against the model not answering at all). */
export class UnreadableAnswer extends Error {}

/**
 * One JSON answer, whole. An answer that does not parse (cut off at max_tokens, or malformed) is read up to the last
 * value the model finished (lib/llm.ts repairJson); with `again`, a cut-off answer is instead asked for once more, with
 * more room and a word to be shorter — a report missing its proposals is worse than a minute's wait — and the repaired
 * first answer is kept only if the second fails too. An answer with nothing readable is always asked for once more;
 * UnreadableAnswer when the second has nothing readable either. A provider error is thrown as it is.
 */
export async function askJson(messages: LlmMessage[], opts: { maxTokens: number; temperature: number; timeoutMs: number }, again: boolean): Promise<{ value: Record<string, unknown>; how: "whole" | "repaired" | "retried" }> {
  const first = await chatJsonFull(messages, opts);
  let read: { value: Record<string, unknown>; how: "whole" | "repaired" } | null = null;
  try { const p = parseJsonLoose<Record<string, unknown>>(first.content); read = { value: p.value, how: p.repaired ? "repaired" : "whole" }; } catch { /* nothing readable */ }
  if (read && (read.how === "whole" || !again)) return read;
  const second = await chatJsonFull(
    [...messages, { role: "assistant", content: first.content }, { role: "user", content: first.cutOff ? SHORTER : INVALID }],
    { ...opts, maxTokens: Math.min(opts.maxTokens * 2, MAX_TOKENS) },
  );
  try { return { value: parseJsonLoose<Record<string, unknown>>(second.content).value, how: "retried" }; }
  catch (e) {
    if (read) return read;
    const why = (x: { cutOff: boolean }) => (x.cutOff ? "cut off" : "not valid JSON");
    throw new UnreadableAnswer(`the model's answer could not be read twice (first ${why(first)}, then ${why(second)}: ${e instanceof Error ? e.message : "?"})`);
  }
}

async function finishReview(id: number, since: number, now: number, j: ReturnType<typeof buildJourneys>, co: Cohort, batch = BATCH): Promise<void> {
  const d = db();
  const notes: string[] = [];
  // 1) batches of journeys → findings
  const batchFindings: unknown[] = [];
  for (let i = 0; i < j.journeys.length; i += batch) {
    const part = j.journeys.slice(i, i + batch);
    const b = Math.floor(i / batch) + 1;
    try {
      const r = await askJson([
        { role: "system", content: BATCH_SYSTEM },
        { role: "user", content: `${part.length} journeys (window: the last ${Math.round((now - since) / DAY)} days):\n\n${part.map(journeyText).join("\n\n")}` },
      ], { maxTokens: BATCH_TOKENS, temperature: 0.3, timeoutMs: 90_000 }, false);
      batchFindings.push(r.value);
      if (r.how === "repaired") notes.push(`第 ${b} 批的回答没写完，读了写完的部分`);
    } catch (e) {
      // a batch whose answers cannot be read does not stop the review: the synthesis sees what the others found
      if (!(e instanceof UnreadableAnswer)) throw e;
      batchFindings.push({ unreadable: true });
      notes.push(`第 ${b} 批的回答两次都读不出来，跳过`);
    }
  }
  if (batchFindings.every((x) => (x as { unreadable?: boolean }).unreadable)) throw new Error("no batch could be read");
  // 2) the synthesis: one report, the proposals
  const synth = await askJson([
    { role: "system", content: SYNTH_SYSTEM },
    { role: "user", content: JSON.stringify({ batches: batchFindings, numbers: numbersFor(since, co, now), journeys_read: j.journeys.length, people_in_window: j.people, payers_in_window: j.payers }) },
  ], { maxTokens: SYNTH_TOKENS, temperature: 0.4, timeoutMs: 120_000 }, true);
  if (synth.how === "retried") notes.push("汇总报告第一次没写完，缩短后重写了一次");
  if (synth.how === "repaired") notes.push("汇总报告两次都没写完，读了第一次写完的部分（后面的建议可能缺）");
  const out = synth.value;
  // the report is for the owner, in Simplified Chinese whatever the model slipped into (the block texts stay Traditional)
  const zh = (x: unknown, n = 600) => toHans(str(x, n));
  const fromBatches = (key: string) => batchFindings.flatMap((b) => arr((b as Record<string, unknown>)[key]).map((x) => zh(x, 300))).filter(Boolean);

  // 3) the proposals, through the same guards and limits as every other draft
  const perSlot = new Map<string, number>();
  const liveAi = (slot: Slot) => variants(slot).filter((v) => v.status === "active" && v.source === "ai").length;
  const copy: ReviewCopy[] = [];
  for (const x of arr(out.copy).slice(0, 6)) {
    const c = x as Record<string, unknown>;
    const slot = str(c.slot, 4);
    const forTopic = str(c.for_topic, 20) || null;
    let t: NudgeText = { title: str(c.title, 60), body: str(c.body, 300), cta: str(c.cta, 80) };
    t = ensureHant(t as unknown as Record<string, string>).fixed as unknown as NudgeText;
    if (t.cta && !/\{price\}/.test(t.cta)) t.cta = `${t.cta} · {price}`;
    const row: ReviewCopy = { slot, for_topic: topicSegment(forTopic) ? forTopic : null, title: t.title, body: t.body, cta: t.cta, why: zh(c.why, 300) };
    if (!["n2", "n3", "n4"].includes(slot)) { copy.push({ ...row, rejected: ["unknown stage"] }); continue; }
    if ((perSlot.get(slot) ?? 0) >= 2) { copy.push({ ...row, rejected: ["more than two for this stage"] }); continue; }
    const why = nudgeOffenses(t, "zh-hant");
    const copied = why.length ? null : nearCopy(slot as Exclude<Slot, "style">, "zh-hant", t);
    if (copied) why.push(copied);
    if (why.length) { copy.push({ ...row, rejected: why }); continue; }
    perSlot.set(slot, (perSlot.get(slot) ?? 0) + 1);
    const vid = `ai-${slot}-r${id}-${perSlot.get(slot)}`;
    // what the words claim, read as every reader at this stage will see them (lib/nudge.ts claimCheck)
    const claim = await claimCheck(slot as Exclude<Slot, "style">, t, row.for_topic);
    // 10-17 全自动: nothing is parked — a doubt, no free AI seat, or the fixed 4th+ block drops the proposal (kept in the report)
    if (aiMode() === "auto") {
      const no = claim ? `说法核对：${claim}` : !DRAFT_SLOTS.includes(slot as Slot) ? "第 4 卦起固定推会员，不加版本" : liveAi(slot as Slot) >= aiMax() ? "slot full" : null;
      if (no) { perSlot.set(slot, (perSlot.get(slot) ?? 0) - 1); copy.push({ ...row, rejected: [no] }); continue; }
    }
    const status = !claim && aiMode() === "auto" && liveAi(slot as Slot) < aiMax() ? "active" : "draft";
    insertAiVariant(vid, slot as Slot, status, { "zh-hant": t }, null, `${row.why} · 每周分析 #${id}`, now, topicSegment(row.for_topic),
      claim ? `weekly review #${id}: waiting for a yes — ${claim}`
        : status === "active" ? `weekly review #${id}: passed the guards, slot had room` : aiMode() === "review" ? `weekly review #${id}: waiting for a yes` : `weekly review #${id}: slot full, waiting`,
      claim !== CLAIM_UNREAD);
    copy.push({ ...row, id: vid, status, ...(claim ? { note: claim } : {}) });
  }
  let styleN = 0;
  const styles: ReviewStyle[] = arr(out.styles).slice(0, 3).map((x) => {
    const s = x as Record<string, unknown>;
    const row: ReviewStyle = { label: zh(s.label, 20) || "新连法", prompt: str(s.prompt, 300), why: zh(s.why, 300) };
    const why = styleOffenses(row.prompt);
    const copied = why.length ? null : nearCopyStyle(row.prompt);
    if (copied) why.push(copied);
    if (why.length) return { ...row, rejected: why };
    // 10-17 全自动: a style takes the free AI seat or is dropped; in review mode it waits for a yes
    if (aiMode() === "auto" && liveAi("style") >= aiMax()) return { ...row, rejected: ["slot full"] };
    styleN += 1;
    const vid = `ai-style-r${id}-${styleN}`;
    const status = aiMode() === "auto" ? "active" : "draft";
    insertAiVariant(vid, "style", status, { "*": { title: row.label, body: row.prompt, cta: "" } }, null, `${row.why} · 每周分析 #${id}`, now, null, status === "active" ? `weekly review #${id}: passed the guards, slot had a seat` : `weekly review #${id}: a style waits for a yes`);
    return { ...row, id: vid, status };
  });

  const body: ReviewBody = {
    summary: zh(out.summary, 2000),
    findings: arr(out.findings).slice(0, 20).map((x) => {
      const f = x as Record<string, unknown>;
      return { title: zh(f.title, 200), detail: zh(f.detail, 1200), people: arr(f.people).map((p) => str(p, 8)).filter((p) => /^P\d+$/.test(p)).slice(0, 30), strength: str(f.strength, 10) || "weak" };
    }),
    why_not_paying: fromBatches("why_not_paying").slice(0, 20),
    what_payers_share: fromBatches("what_payers_share").slice(0, 20),
    owner: arr(out.owner).map((x) => zh(x, 400)).filter(Boolean).slice(0, 12),
    copy, styles, picked: j.picked, batches: batchFindings.length,
    ...(notes.length ? { notes } : {}),
    codes: Object.fromEntries(j.journeys.map((x) => [x.code, { bid: x.bid, customerId: x.customerId }])),
  };
  d.prepare("UPDATE ai_reports SET status = 'done', body_json = ?, finished_at = ? WHERE id = ?").run(JSON.stringify(body), Date.now(), id);
  logRun("review", `#${id} findings=${body.findings.length} copy=${copy.filter((c) => c.id).length}/${copy.length} styles=${styles.filter((s) => s.id).length}/${styles.length}${notes.length ? ` notes=${notes.length}` : ""}`, Date.now());
  recordOps("ai_review", `#${id} ${body.findings.length} findings`);
}

/**
 * The cron's weekly turn: once a week, once a fortnight holds enough people; otherwise look again tomorrow. A review
 * started on the dashboard counts as the week's (no second set of proposals a day later); a failed one is retried the
 * next day, not on every cron run.
 */
export function maybeWeeklyReview(now = Date.now()): string {
  if (!reviewOn()) return "";
  const last = (status: string) => (db().prepare(`SELECT MAX(at) AS t FROM ai_reports WHERE ${status}`).get() as { t: number | null }).t ?? 0;
  if (last("status <> 'failed'") >= now - 7 * DAY || last("1 = 1") >= now - DAY || (lastRun("review_wait") ?? 0) >= now - DAY) return "";
  const since = now - REVIEW_DAYS * DAY;
  const people = (db().prepare("SELECT COUNT(DISTINCT bid) AS n FROM cast_log WHERE created_at >= ?").get(since) as { n: number }).n;
  if (people < reviewMin()) { logRun("review_wait", `${people} browsers cast in ${REVIEW_DAYS} days, need ${reviewMin()}`, now); return "review: waiting"; }
  const r = startAiReview({ by: "cron", now });
  if (r.started) { logRun("review_week", `#${r.id}`, now); return `review #${r.id} started`; }
  return `review: ${r.why}`;
}

