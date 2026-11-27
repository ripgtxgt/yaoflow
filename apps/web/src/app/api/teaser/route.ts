import { repeatState } from "@/lib/repeat-test";
import { record } from "@/lib/analytics-server";
import { EMAIL_RE } from "@/lib/auth";
import { customersOfBrowser, linkBrowser } from "@/lib/browsers";
import { saveCast, upsertCustomer } from "@/lib/db";
import { resolveServerChart } from "@/lib/reading";
import { fileCast } from "@/lib/matter-assign";
import { classifyTopic } from "@/lib/topic";
import { toHans } from "@/lib/hant";
import { NextRequest, NextResponse } from "next/server";
import { generateTeaserMore, generateTeaserOdds, isFallbackTeaser } from "@/lib/teaser";
const ODDS_CACHE = new Map<string, string | null>();
const MORE_CACHE = new Map<string, string | null>();
import { parseSituation } from "@/lib/situation";
import { ipTag } from "@/lib/ip-tag";
import { createHash } from "node:crypto";
import { asLocale } from "@/lib/locales";
import { questionIssue } from "@/lib/question-check";
import { resolveReadingLocale } from "@/lib/question-lang";
import { readCastExtras } from "@/lib/cast-extras";
import { paywallOn } from "@/lib/paywall";
import { parseScaleHint, parseTopicHint } from "@/lib/hints";
import { generateTeaser } from "@/lib/teaser";
import { recordOps } from "@/lib/db";
import type { ReadingInput } from "@/lib/reading";
import { timingHint } from "@/lib/timing-hint";
import { bidOf } from "@/lib/browsers";
import { browserSessionOf } from "@/lib/browser-session";
import { customerFromRequest } from "@/lib/auth";
import { classifyLean, logCast, priorsFor, setLogNudge, setLogTeaser, threadView } from "@/lib/cast-log";
import { nudgeFor, styleFor } from "@/lib/nudge";
import { refGiftFor } from "@/lib/ref-gift-route";
import { freeLineOn } from "@/lib/free-line";

export const runtime = "nodejs";

const VALID_VALUES = new Set([6, 7, 8, 9]);

/**
 * The free line (09-19): one sentence of the call, shown on the cast page
 * before the price. One short model call per cast, so it is fenced the way
 * the painted door is: a per-address bucket, a daily cap, and a cache so a
 * refresh or a re-render of the same cast never generates twice.
 */
const BUCKET = new Map<string, { n: number; t: number }>();
function limited(ip: string): boolean {
  const now = Date.now();
  const b = BUCKET.get(ip);
  if (!b || now - b.t > 10 * 60_000) { BUCKET.set(ip, { n: 1, t: now }); return false; }
  b.n += 1;
  return b.n > 12;
}
let dayKey = "";
let dayCount = 0;
function overCap(): boolean {
  const k = new Date().toISOString().slice(0, 10);
  if (k !== dayKey) { dayKey = k; dayCount = 0; }
  dayCount += 1;
  return dayCount > Number(process.env.TEASER_DAILY_CAP ?? 1500);
}

const CACHE = new Map<string, { text: string | null; at: number }>();
const CACHE_MAX = 600;
const CACHE_TTL = 6 * 3_600_000;
/** In flight: a second request for the same cast (React strict effects, a fast refresh) waits for the first. */
const PENDING = new Map<string, Promise<string | null>>();

export async function POST(req: NextRequest) {
  // in the free beta the whole reading is free: nothing to tease
  if (!paywallOn()) return NextResponse.json({ teaser: null });
  let body: Partial<ReadingInput> & { locale?: string; rl?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const values = Array.isArray(body.values) ? body.values : [];
  if (question.length < 2 || question.length > 450) return NextResponse.json({ teaser: null });
  if (questionIssue(question, asLocale(body.locale))) return NextResponse.json({ teaser: null }); // 09-20: nothing to tease on a sigh
  if (values.length !== 6 || !values.every((v) => VALID_VALUES.has(v as number))) {
    return NextResponse.json({ error: "bad_values" }, { status: 400 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (limited(ip)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const locale = asLocale(body.locale);
  const readingLocale = resolveReadingLocale(question, locale, body.rl);
  const extras = readCastExtras(body, question, readingLocale, req.headers);
  const input: ReadingInput = {
    question,
    values: values as ReadingInput["values"],
    castAtMs: Number(body.castAtMs) || Date.now(),
    tzOffsetMinutes: Number(body.tzOffsetMinutes) || 0,
    scaleHint: parseScaleHint(body.scaleHint),
    topicHint: parseTopicHint(body.topicHint),
    situation: parseSituation((body as { situation?: unknown }).situation),
    ...(extras.register ? { register: extras.register } : {}),
    // 10-22 分開 (lib/solo.ts): the reader said this cast is a new matter — filed in a thread of its own, no earlier casts in view
    ...(extras.solo ? { solo: true } : {}),
  };
  // 10-03 起卦记录 (lib/cast-log.ts): write the cast, file it under its matter, find what came before it. On the 2nd+
  // cast of a matter the line is written with the earlier casts in view (in a style the learner picks), and the block
  // before the price comes along (lib/nudge.ts) — not for a member, who sees no price.
  const bid = bidOf(req);
  // 10-04 排除会员: the page says when a membership covers the cast (no price, no block) — the log keeps that too
  const member = (body as { member?: unknown }).member === true;
  const info = bid ? await logCast({ bid, s: browserSessionOf(body), customerId: customerFromRequest(req)?.customerId ?? null, input, locale: readingLocale, ua: req.headers.get("user-agent"), member, outcomeHint: (body as { outcomeHint?: unknown }).outcomeHint as string | undefined, separate: !!extras.solo }) : null;
  // 10-26 (#3112「我的卦找不到了」): asking needs an account now, so every cast reaches 「我的」 from its free line on
  const owner = customerFromRequest(req)?.customerId ?? null;
  if (owner) {
    try {
      const topic = input.topicHint ?? classifyTopic(toHans(question));
      const castId = saveCast({ customerId: owner, castAtMs: input.castAtMs, tzOffsetMinutes: input.tzOffsetMinutes, locale: readingLocale, question, topic, values: input.values,
        chart: resolveServerChart(input) as unknown as Record<string, unknown>, tzName: typeof (body as { timeZone?: unknown }).timeZone === "string" ? (body as { timeZone: string }).timeZone : null });
      fileCast(castId, null, owner, question, topic, readingLocale, input.solo);
    } catch (e) { recordOps("free_cast_keep_fail", e instanceof Error ? e.message.slice(0, 160) : "?"); }
  }
  const style = info && info.n >= 2 ? styleFor(info) : null;
  const threadCtx = info && style && info.earlier.length ? { thread: priorsFor(info, readingLocale), style } : undefined;
  // 10-04 按人写的引导: the block may be written for this reader (lib/nudge.ts personalBlock) — alongside the free line,
  // not after it; a block that is not ready within its budget gives way to ready words
  const refOut = info ? refGiftFor(req, body as Record<string, unknown>, bid, typeof body.locale === "string" ? body.locale : locale) : {};
  // 11-06: the block written for the reader builds on this cast's free line — it gets the line as soon as it exists
  // (null wherever no line comes: a lock, a gate, the cap, a fallback line)
  let giveLine: (t: string | null) => void = () => {};
  const lineP = new Promise<string | null>((r) => { giveLine = (t) => r(t && !isFallbackTeaser(t) ? t : null); });
  const threadOutP = (async () => {
    const nudge = info && !member ? await nudgeFor(info, locale, Date.now(), { line: lineP }).catch(() => null) : null;
    if (info && nudge && info.row.nudge !== nudge.id) setLogNudge(info.logId, nudge.id);
    return { ...(info && info.n >= 2 ? { thread: threadView(info, locale) } : {}), ...(nudge ? { nudge } : {}), ...refOut };
  })().catch(() => ({ ...refOut }));
  // 10-13 同一件事反复问 (lib/repeat-test.ts ②③), half the browsers: from the 6th cast of a matter in 3 days no new line
  // (一事一占 — the block offers reading them all together); from the 3rd, the line waits for an address. Both before any
  // model call, so a locked or unanswered gate costs nothing.
  if (info && bid && !member) {
    const me = customerFromRequest(req);
    const email = typeof (body as { email?: unknown }).email === "string" ? ((body as { email: string }).email).trim().toLowerCase().slice(0, 200) : "";
    const known = !!me || customersOfBrowser(bid).length > 0;
    const rep = repeatState(info, bid, { member, known });
    if (rep.lock) {
      record({ t: Date.now(), e: "repeat_gate", s: browserSessionOf(body) ?? bid.slice(-12), locale, method: "lock", hex: Math.min(64, info.n) });
      giveLine(null);
      return NextResponse.json({ teaser: null, lock: { n: info.n, inWindow: rep.lock.inWindow, until: rep.lock.until }, ...(await threadOutP) });
    }
    // 10-31 进度表 131: with no free line there is nothing to wait for an address — the gate stands down
    if (rep.emailGate && freeLineOn(locale)) {
      if (!EMAIL_RE.test(email)) {
        record({ t: Date.now(), e: "repeat_gate", s: browserSessionOf(body) ?? bid.slice(-12), locale, method: "email_ask", hex: Math.min(64, info.n) });
        giveLine(null);
        return NextResponse.json({ teaser: null, emailGate: true, ...(await threadOutP) });
      }
      // the address files this browser (and the casts on it) under a customer — not a sign-in, not a yes to news
      const cid = upsertCustomer(email, locale);
      try { linkBrowser(bid, cid, "cast_email"); } catch { /* best-effort */ }
      record({ t: Date.now(), e: "repeat_gate", s: browserSessionOf(body) ?? bid.slice(-12), locale, method: "email_given", hex: Math.min(64, info.n) });
    }
  }
  // 10-31 进度表 131: no free line — the cast is written, filed and gets its block before the price (n1 on a first cast);
  // no model call, and the timing hint stays out too (the month of the window is part of the paid reading)
  if (!freeLineOn(locale)) { giveLine(null); return NextResponse.json({ teaser: null, noLine: true, ...(await threadOutP) }); }
  // the same cast asked twice is the same sentence: the instant is part of the chart (and, from 10-03, its place on the matter)
  const key = createHash("sha1").update(JSON.stringify([question, values, Math.floor(input.castAtMs / 60_000), input.tzOffsetMinutes, readingLocale, extras.register ?? "", input.scaleHint ?? "", input.topicHint ?? "", input.situation ?? "", info ? `${info.threadId}:${info.n}` : "", style?.id ?? ""])).digest("hex");
  // 09-26 (E): the rules' own count of timing windows, and roughly when the nearest falls — cheap, no model
  const timing = timingHint(input);
  const hit = CACHE.get(key);
  // 09-26 对照测试 (o1): the five-step lean above the line, cached with it; off with AB_TEASER_ODDS=off
  const wantOdds = (body as { odds?: unknown }).odds === true && (process.env.AB_TEASER_ODDS ?? "on") !== "off";
  const oddsFor = async (text: string | null): Promise<{ odds?: string }> => {
    if (!wantOdds || !text) return {};
    const k = `${key}:o`;
    const c = ODDS_CACHE.get(k);
    if (c !== undefined) return c ? { odds: c } : {};
    const o = await Promise.race([generateTeaserOdds(input, readingLocale, text), new Promise<null>((r) => setTimeout(() => r(null), 6_000))]).catch(() => null);
    ODDS_CACHE.set(k, o);
    if (ODDS_CACHE.size > 2000) ODDS_CACHE.clear();
    return o ? { odds: o } : {};
  };
  // 09-28 对照测试 (v1): the paragraph under the line, cached with it; off with AB_VERDICT=off
  const wantMore = (body as { more?: unknown }).more === true && (process.env.AB_VERDICT ?? "on") !== "off";
  const moreFor = async (text: string | null): Promise<{ more?: string }> => {
    if (!wantMore || !text || isFallbackTeaser(text)) return {};
    const k = `${key}:v`;
    const c = MORE_CACHE.get(k);
    if (c !== undefined) return c ? { more: c } : {};
    const m = await Promise.race([generateTeaserMore(input, readingLocale, text), new Promise<null>((r) => setTimeout(() => r(null), 12_000))]).catch(() => null);
    MORE_CACHE.set(k, m);
    if (MORE_CACHE.size > 2000) MORE_CACHE.clear();
    return m ? { more: m } : {};
  };
  if (hit && Date.now() - hit.at < CACHE_TTL) {
    giveLine(hit.text);
    if (info && hit.text && info.row.teaser !== hit.text) setLogTeaser(info.logId, hit.text, style?.id ?? null);
    if (info && hit.text && !info.row.lean && !isFallbackTeaser(hit.text)) void classifyLean(info.logId, hit.text, question); // 10-03 分组
    return NextResponse.json({ teaser: hit.text, cached: true, timing, ...(await oddsFor(hit.text)), ...(await moreFor(hit.text)), ...(await threadOutP) });
  }
  const pending = PENDING.get(key);
  if (pending) { const text = await pending; giveLine(text); return NextResponse.json({ teaser: text, timing, ...(await oddsFor(text)), ...(await moreFor(text)), ...(await threadOutP) }); }

  if (overCap()) {
    recordOps("teaser_cap_hit", ipTag(ip));
    giveLine(null);
    return NextResponse.json({ teaser: null, ...(await threadOutP) });
  }
  const job = (async () => {
    // never let the price buttons wait on a slow model: the line is a bonus, not a gate
    const text = await Promise.race<string | null>([
      generateTeaser(input, readingLocale, threadCtx),
      new Promise<string | null>((resolve) => setTimeout(() => resolve(null), 14_000)),
    ]).catch(() => null);
    giveLine(text);
    if (info) setLogTeaser(info.logId, text, threadCtx ? style!.id : null);
    // 10-03 分组: the line's lean, read by a light model after the reader already has it
    if (info && text && !isFallbackTeaser(text)) void classifyLean(info.logId, text, question);
    CACHE.set(key, { text, at: Date.now() });
    while (CACHE.size > CACHE_MAX) {
      const oldest = CACHE.keys().next().value;
      if (oldest === undefined) break;
      CACHE.delete(oldest);
    }
    return text;
  })();
  PENDING.set(key, job);
  try {
    const text = await job;
    return NextResponse.json({ teaser: text, timing, ...(await oddsFor(text)), ...(await moreFor(text)), ...(await threadOutP) });
  } finally {
    PENDING.delete(key);
  }
}
