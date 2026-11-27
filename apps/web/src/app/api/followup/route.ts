import { isCrisis } from "@/lib/crisis";
import { registerOpt } from "@/lib/register";
import { parseSituation } from "@/lib/situation";
import { NextRequest, NextResponse } from "next/server";
import { asLocale } from "@/lib/locales";
import { resolveReadingLocale } from "@/lib/question-lang";
import { toHans } from "@/lib/hant";
import type { LineValue } from "@yaoflow/engine";
import { chatText } from "@/lib/llm";
import { parseScaleHint, parseTopicHint } from "@/lib/hints";
import { paywallOn } from "@/lib/paywall";
import { verifyPaidSession } from "@/lib/paid-store";
import { scrubInternal } from "@/lib/internal-words";
import { castExists, castIdForSession, followupBonus, followupsForCast, matterForSession, orderBySession, readingBodyForSession, saveFollowup, castsTodayInMatter } from "@/lib/db";
import { matterSoFar, scaleOf } from "@/lib/matter-context";
import { withCastThread } from "@/lib/cast-log";
import { echoInReply } from "@/lib/echo-guard";
import { passedWindowMention } from "@/lib/followup-dates";
import { timingSegments } from "@/lib/revisit";
import { lateOpenedOn } from "@/lib/generate";
import { recordOps } from "@/lib/db";
import { followupStateBlock } from "@/lib/followup-state";
import { localDay } from "@/lib/clock";
import { publicEventFacts } from "@/lib/public-event";
import { tt } from "@/lib/dict/thread";
import { FOLLOWUP_LIMIT } from "@/lib/followup-limit";
import { customerForReadingSession } from "@/lib/db";
import { can, followupLimitFor, rightsFor, spendRight, useRight } from "@/lib/entitlements";
import {
  buildUserPayload, followupSystem, pick, resolveCastInstant, resolveServerChart, resolveTiming, type ReadingInput, type Tier,
} from "@/lib/reading";

export const runtime = "nodejs";
export const maxDuration = 90;

const BUCKET = new Map<string, { n: number; t: number }>();
function limited(ip: string): boolean {
  const now = Date.now();
  const b = BUCKET.get(ip);
  if (!b || now - b.t > 10 * 60_000) {
    BUCKET.set(ip, { n: 1, t: now });
    return false;
  }
  b.n += 1;
  return b.n > 20;
}

interface Turn {
  role: "user" | "assistant";
  content: string;
}

const VALID_VALUES = new Set([6, 7, 8, 9]);
const STATE_FIELDS = ["verdict", "timing", "signals", "caution", "next_step"] as const;

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (limited(ip)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  let body: Partial<ReadingInput> & {
    tier?: string; locale?: string; history?: Turn[]; message?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim().slice(0, 500) : "";
  if (message.length < 1) return NextResponse.json({ error: "bad_message" }, { status: 400 });
  if (isCrisis(message)) return NextResponse.json({ error: "crisis" }, { status: 422 }); // 09-26 危机词闸门

  // the conversation is part of the reading, so it speaks the reading's
  // language: the stored session decides it when there is one, and without a
  // session we read it off the question the same way the cast page did (09-17)
  let locale = resolveReadingLocale(
    typeof (body as { question?: unknown }).question === "string" ? (body as { question: string }).question : "",
    asLocale(body.locale),
    (body as { rl?: unknown }).rl,
  );
  let tier: Tier = body.tier === "deep" ? "deep" : "one";
  let castInput: ReadingInput | null = null;

  const sid = typeof (body as { sid?: unknown }).sid === "string" ? (body as { sid: string }).sid : "";
  let storedCastId: number | null = null;
  let paidRec: Awaited<ReturnType<typeof verifyPaidSession>> = null;
  if (sid) {
    // paid path: the Stripe session is the authority for cast + tier
    const rec = await verifyPaidSession(sid).catch(() => null);
    if (!rec) return NextResponse.json({ error: "payment_required" }, { status: 402 });
    paidRec = rec;
    if (orderBySession(sid)?.payment_state === "refunded") return NextResponse.json({ error: "refunded" }, { status: 403 }); // 09-21
    tier = rec.tier;
    locale = rec.locale;
    castInput = rec.input;
    storedCastId = castIdForSession(sid);
  } else {
    if (paywallOn()) return NextResponse.json({ error: "payment_required" }, { status: 402 });
    const values = Array.isArray(body.values) ? body.values : [];
    if (values.length !== 6 || !values.every((v) => VALID_VALUES.has(v as number))) {
      return NextResponse.json({ error: "bad_values" }, { status: 400 });
    }
    // free beta: /api/reading persisted the cast and handed back its id, so
    // free follow-ups join the same stored transcript, limit and history
    // machinery as paid ones — everything a customer generates is kept
    const cid = (body as { castId?: unknown }).castId;
    if (typeof cid === "number" && castExists(cid)) storedCastId = cid;
  }
  // 09-17: follow-ups are part of the master reading only (Neil: 轻解读没有追问)
  if (tier !== "deep") return NextResponse.json({ error: "deep_only" }, { status: 403 });
  // for a paid cast the server-side transcript is authoritative; the client list is a fallback
  let history: Turn[] = [];
  if (storedCastId) {
    try {
      history = followupsForCast(storedCastId)
        .slice(-10)
        .map((t) => ({ role: t.role, content: t.content.slice(0, 1000) }));
    } catch {
      /* fall through to the client-supplied list */
    }
  }
  if (history.length === 0 && Array.isArray(body.history)) {
    history = body.history
      .filter((t): t is Turn => t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string")
      .slice(-10)
      .map((t) => ({ role: t.role, content: t.content.slice(0, 1000) }));
  }

  // enforce the follow-up allowance server-side, counting what is actually stored
  let earlier: string[] = [];
  let allowance = 0;
  if (storedCastId) {
    earlier = followupsForCast(storedCastId).filter((t) => t.role === "user").map((t) => t.content);
    const asked = earlier.length;
    // 09-21 回访奖励: a "没应验" answer earns one more question on this reading
    // 09-24 M1: the reading's owner is a member → 10, not 5 (every member deep reading had hit 5)
    // 10-22 进度表 56: the rights table (lib/entitlements.ts) — the reading's owner a member / pass holder → 30, not 5
    const owner = sid ? customerForReadingSession(sid) : null;
    const rights = owner ? await rightsFor(owner) : null;
    const base = rights ? followupLimitFor(rights, FOLLOWUP_LIMIT) : FOLLOWUP_LIMIT;
    allowance = base + (sid ? followupBonus(sid) : 0);
    if (asked >= allowance) return NextResponse.json({ error: "limit_reached" }, { status: 429 });
    // 10-22 通卡 (进度表 75 ④): a member's / pass holder's follow-ups across all casts, 40 a Taipei day — the per-cast
    // allowance above stays as it was (30 for members: 41% of full readings went past 10 before 09-29)
    if (rights && can(rights, "member_followups")) {
      const v = useRight(rights, "member_followups");
      if (!v.ok) return NextResponse.json({ error: v.why === "not_allowed" ? "limit_reached" : v.why }, { status: 429 });
      spendRight(rights, "member_followups", sid);
    }
  }

  const chartInput = castInput ?? {
    question: typeof body.question === "string" ? body.question : "",
    values: (body.values ?? []) as LineValue[],
    castAtMs: Number(body.castAtMs),
    tzOffsetMinutes: Number(body.tzOffsetMinutes),
    scaleHint: parseScaleHint((body as { scaleHint?: unknown }).scaleHint),
    topicHint: parseTopicHint((body as { topicHint?: unknown }).topicHint),
    situation: parseSituation((body as { situation?: unknown }).situation),
  };
  // a stored cast keeps its original instant; fresh client input is sanitized
  const chart = resolveServerChart(chartInput, Boolean(castInput));
  const timing = resolveTiming({ ...chartInput, question: toHans(chartInput.question) }, chart, Boolean(castInput));
  const questionForContext = castInput?.question ?? (typeof body.question === "string" ? body.question : "");

  // 09-29 「一件事」: the rest of the matter this cast belongs to
  // 10-03 起卦记录: with the free casts on the same matter that came before it (lib/cast-log.ts)
  const soFar = sid ? (() => {
    try {
      const mid = matterForSession(sid);
      // 10-04 进度表 30: the same window as the reading had, dated from now (a note written since the cast is in)
      const inst = resolveCastInstant(chartInput, Boolean(castInput));
      const mo = { scale: scaleOf(chartInput, inst.castAt, inst.tz) };
      const base = mid ? matterSoFar(mid, { sessions: [sid] }, locale, mo) : undefined;
      return paidRec ? withCastThread(sid, paidRec, base, mo) : base;
    } catch { return undefined; }
  })() : undefined;

  // 09-29 追问按轮次: a paid cast with a stored thread gets the state block —
  // which question this is, the earlier ones, what the reading said, today
  let state = "";
  if (sid && castInput && storedCastId && allowance > 0) {
    try {
      const reading = (readingBodyForSession(sid) ?? null) as Record<string, Record<string, string> | undefined> | null;
      const said = STATE_FIELDS.map((f) => (reading?.[f] ? `${f}: ${pick(reading[f]!, locale)}` : null)).filter(Boolean).join("\n");
      state = followupStateBlock({
        n: earlier.length + 1,
        allowance,
        earlier,
        said,
        today: localDay(Date.now(), castInput.tzOffsetMinutes ?? 0),
        noteName: tt(locale, "noteTitle"),
        castsToday: (() => { try { const mid = matterForSession(sid); return mid ? castsTodayInMatter(mid) : 1; } catch { return 1; } })(),
      });
    } catch {
      state = ""; // never block the reply; the unstaged prompt still works
    }
  }

  // 10-22 复查: asked days after the cast — the windows already behind the reader are marked, and the prompt says how to
  // speak of them (a 10-21 answer gave 10月16日到20日 as "the next stir")
  const openedOn = (() => { try { return lateOpenedOn(chartInput, Boolean(castInput)); } catch { return null; } })();

  // 11-09 T-034: a question about a public event gets the same checked facts as the reading, as of today — the follow-up
  // had none and corrected the reading from memory (「是我記錯了」)
  const publicEvent = questionForContext
    ? await publicEventFacts(questionForContext, localDay(Date.now(), castInput?.tzOffsetMinutes ?? chartInput.tzOffsetMinutes ?? 0)).catch(() => null)
    : null;

  try {
    const convo: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: followupSystem(tier, locale, { ...registerOpt(locale, castInput?.register), staged: Boolean(state), ...(soFar ? { matter: true } : {}), ...(openedOn ? { late: true } : {}), ...(publicEvent ? { publicEvent: true } : {}) }) },
      { role: "user", content: `CAST CONTEXT (facts, do not recalculate):\n${buildUserPayload(questionForContext, chart, timing, { situation: chartInput.situation, matter: soFar, ...(openedOn ? { openedOn } : {}), ...(publicEvent ? { publicEvent } : {}) })}${state ? `\n\n${state}` : ""}` },
      { role: "assistant", content: locale === "zh" ? "（已了解此卦，请提问。）" : "(Chart understood. Ask away.)" },
      ...history,
      { role: "user", content: message },
    ];
    let reply = await chatText(convo, { maxTokens: 900, temperature: 0.7 });
    // 10-22 复查: follow-ups had no check at all — one handed a reader the note she wrote that morning. Their notes and
    // earlier questions quoted back, or "you say X but inside…", gets the answer written again once.
    const theirs = [message, questionForContext, ...history.filter((t) => t.role === "user").map((t) => t.content)].join("\n");
    const echo = echoInReply(reply, soFar, theirs);
    if (echo) {
      recordOps("echo_followup", `${locale} ${echo.slice(0, 60)}`);
      try {
        const again = await chatText([
          ...convo,
          { role: "assistant", content: reply },
          { role: "user", content: `(system check, not the reader) REWRITE REQUIRED: your answer ${echo.includes(":contrast:") ? "sets the reader's own words against what they supposedly feel inside" : "hands the reader's own earlier words back to them"} ("${echo.slice(echo.indexOf(":") + 1, echo.indexOf(":") + 41)}"). Never quote or closely paraphrase their notes or earlier questions, and never write "you say X but inside you…". Give the same answer again with the same substance, as the reply itself — no preface, no mention of this note.` },
        ], { maxTokens: 900, temperature: 0.5 });
        if (again.trim().length >= 10) reply = again;
      } catch { /* keep the first answer */ }
    }
    // 10-22 复查: and asked days after the cast, a window of this chart that has gone by named as if still to come
    // (lib/followup-dates.ts) — the chart's candidate windows and the ones the reading itself wrote
    if (openedOn) {
      const windows = [
        ...timing.candidates.flatMap((c) => c.windows.map((w) => ({ start: w.start, end: w.end }))),
        ...(() => {
          try {
            const body = sid ? (readingBodyForSession(sid) as Record<string, Record<string, string> | undefined> | null) : null;
            const t = body?.timing ? pick(body.timing, locale) : "";
            const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            return timingSegments(t, new Date(`${timing.today}T00:00:00`)).map((s) => ({ start: iso(s.start), end: iso(s.end) }));
          } catch { return []; }
        })(),
      ];
      const gone = passedWindowMention(reply, windows, openedOn);
      if (gone) {
        recordOps("followup_passed", `${locale} ${gone.slice(0, 40)} @${openedOn}`);
        try {
          const again = await chatText([
            ...convo,
            { role: "assistant", content: reply },
            { role: "user", content: `(system check, not the reader) REWRITE REQUIRED: today is ${openedOn}. 「${gone}」 has already gone by, but your answer speaks of it as still to come. Never present a passed window as ahead; if it matters, say it fell then and has passed, and answer with the first window still ahead (or say plainly that none remain). Same substance otherwise, as the reply itself — no preface, no mention of this note.` },
          ], { maxTokens: 900, temperature: 0.4 });
          if (again.trim().length >= 10) reply = again;
        } catch { /* keep the answer */ }
      }
    }
    // persist the exchange against its cast — paid or free alike
    if (storedCastId) {
      try {
        reply = scrubInternal(reply); // 11-01 进度表 132 ②: the payload's own names never reach the reader
        saveFollowup(storedCastId, null, "user", message);
        saveFollowup(storedCastId, null, "assistant", reply);
      } catch {
        /* never block the reply */
      }
    }
    return NextResponse.json({ reply: scrubInternal(reply) });
  } catch (e) {
    return NextResponse.json(
      { error: "generation_failed", detail: e instanceof Error ? e.message : "unknown" },
      { status: 502 },
    );
  }
}
