import { NextRequest, NextResponse } from "next/server";
import { registerOpt } from "@/lib/register";
import { toHans } from "@/lib/hant";
import { chatText } from "@/lib/llm";
import { verifyPaidSession } from "@/lib/paid-store";
import { castIdForSession, customerForReadingSession, orderBySession, progressNotesForCast, readingBodyForSession, saveProgressNote } from "@/lib/db";
import { activeMembership } from "@/lib/membership";
import { buildUserPayload, pick, progressSystem, resolveServerChart, resolveTiming } from "@/lib/reading";
import { localDay } from "@/lib/clock";
import { record } from "@/lib/analytics-server";
import { MEMBER_NOTE_LIMIT, NOTE_GAP_MS, NOTE_LIMIT, noteGate } from "@/lib/progress";

export const runtime = "nodejs";
export const maxDuration = 90;

/**
 * 记一笔进展 (09-23, 用户粘性数据分析-0923.md §四): what has happened since,
 * answered inside the same cast. The reader who came back the next day used to
 * have two doors — re-cast (blocked by 一事一占) or spend a follow-up. This is
 * the third, and the one the gate now points to first.
 *
 * One note per cast every NOTE_GAP_MS, NOTE_LIMIT per cast: it is a log of a
 * matter unfolding, not a second chat.
 */

const BUCKET = new Map<string, { n: number; t: number }>();
function limited(ip: string): boolean {
  const now = Date.now();
  const b = BUCKET.get(ip);
  if (!b || now - b.t > 10 * 60_000) { BUCKET.set(ip, { n: 1, t: now }); return false; }
  b.n += 1;
  return b.n > 10;
}

const FIELDS = ["verdict", "timing", "signals", "caution", "next_step"] as const;

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (limited(ip)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  let body: { sid?: unknown; note?: unknown };
  try { body = (await req.json()) as typeof body; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const sid = typeof body.sid === "string" ? body.sid : "";
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
  if (!sid || note.length < 2) return NextResponse.json({ error: "bad_note" }, { status: 400 });

  const rec = await verifyPaidSession(sid).catch(() => null);
  if (!rec) return NextResponse.json({ error: "payment_required" }, { status: 402 });
  if (orderBySession(sid)?.payment_state === "refunded") return NextResponse.json({ error: "refunded" }, { status: 403 });
  if (rec.tier !== "deep") return NextResponse.json({ error: "deep_only" }, { status: 403 });
  const castId = castIdForSession(sid);
  if (!castId) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const prior = progressNotesForCast(castId);
  const member = !!activeMembership(customerForReadingSession(sid));
  const limit = member ? MEMBER_NOTE_LIMIT : NOTE_LIMIT; // 09-29 「一件事」: members 30 a cast
  const gate = noteGate(prior.map((n) => n.created_at), Date.now(), member ? 0 : NOTE_GAP_MS, limit); // 09-24 M4
  if (gate.kind === "limit") return NextResponse.json({ error: "limit_reached", limit }, { status: 429 });
  if (gate.kind === "wait") return NextResponse.json({ error: "too_soon", nextAt: gate.nextAt }, { status: 429 });

  const locale = rec.locale;
  const chart = resolveServerChart(rec.input, true);
  const timing = resolveTiming({ ...rec.input, question: toHans(rec.input.question) }, chart, true);
  const reading = (readingBodyForSession(sid) ?? rec.reading) as Record<string, Record<string, string> | undefined> | null;
  const said = FIELDS.map((f) => (reading?.[f] ? `${f}: ${pick(reading[f]!, locale)}` : null)).filter(Boolean).join("\n");
  const today = localDay(Date.now(), rec.input.tzOffsetMinutes ?? 0);
  const history = prior.slice(-4).flatMap((n) => [
    { role: "user" as const, content: `PROGRESS NOTE (${localDay(n.created_at, rec.input.tzOffsetMinutes ?? 0)}): ${n.note.slice(0, 500)}` },
    { role: "assistant" as const, content: n.reply.slice(0, 1000) },
  ]);

  try {
    const reply = await chatText(
      [
        { role: "system", content: progressSystem(locale, registerOpt(locale, rec.input.register)) },
        {
          role: "user",
          content: `CAST CONTEXT (facts, do not recalculate):\n${buildUserPayload(rec.input.question, chart, timing)}\n\nWHAT THE READING ALREADY SAID:\n${said}\n\nTODAY (the reader's own calendar): ${today}`,
        },
        { role: "assistant", content: locale === "zh" ? "（已了解此卦与解读，请说说事情的进展。）" : "(Chart and reading understood. Tell me what has happened.)" },
        ...history,
        { role: "user", content: `PROGRESS NOTE (${today}): ${note}` },
      ],
      { maxTokens: 900, temperature: 0.6 },
    );
    saveProgressNote(castId, note, reply);
    record({ t: Date.now(), e: "progress_note", s: sid.slice(-12), locale, tier: "deep", path: "/reading" });
    return NextResponse.json({ reply, at: Date.now(), nextAt: member ? null : Date.now() + NOTE_GAP_MS, left: limit - prior.length - 1 });
  } catch (e) {
    return NextResponse.json({ error: "generation_failed", detail: e instanceof Error ? e.message : "unknown" }, { status: 502 });
  }
}
