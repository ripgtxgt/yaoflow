import { NextRequest, NextResponse } from "next/server";
import { ipTag } from "@/lib/ip-tag";
import { asLocale } from "@/lib/locales";
import { matterKey, questionIssue, type MatterVerdict, type QuestionIssue } from "@/lib/question-check";
import { judgeMatter } from "@/lib/question-judge";
import { recordOps } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST { question, locale } → { verdict: "yes" | "no" | "unsure", rule?: issue }
 *
 * The question check (09-20). The page asks as soon as the reader stops
 * typing, so the answer is usually in hand before the coins are; the reading
 * gate asks again and waits. Fenced like the free line: a per-address bucket,
 * a daily cap (over it, everything is "unsure" — never a block), and a cache
 * keyed on the wording so retyping the same question costs nothing.
 */
const BUCKET = new Map<string, { n: number; t: number }>();
function limited(ip: string): boolean {
  const now = Date.now();
  const b = BUCKET.get(ip);
  if (!b || now - b.t > 10 * 60_000) { BUCKET.set(ip, { n: 1, t: now }); return false; }
  b.n += 1;
  return b.n > 40;
}
let dayKey = "";
let dayCount = 0;
function overCap(): boolean {
  const k = new Date().toISOString().slice(0, 10);
  if (k !== dayKey) { dayKey = k; dayCount = 0; }
  dayCount += 1;
  return dayCount > Number(process.env.QCHECK_DAILY_CAP ?? 4000);
}

const CACHE = new Map<string, { v: MatterVerdict; at: number }>();
const CACHE_MAX = 3000;
const CACHE_TTL = 24 * 3_600_000;
const PENDING = new Map<string, Promise<MatterVerdict>>();

type Out = { verdict: MatterVerdict; rule?: QuestionIssue; cached?: boolean };

export async function POST(req: NextRequest) {
  let body: { question?: unknown; locale?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const question = typeof body.question === "string" ? body.question.replace(/\s+/g, " ").trim().slice(0, 450) : "";
  const locale = asLocale(body.locale);
  // the rules first: instant, and the model never sees what they refuse
  const rule = questionIssue(question, locale);
  if (rule) return NextResponse.json({ verdict: "no", rule } satisfies Out);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (limited(ip)) return NextResponse.json({ verdict: "unsure" } satisfies Out);

  const key = matterKey(question, locale);
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return NextResponse.json({ verdict: hit.v, cached: true } satisfies Out);
  const pending = PENDING.get(key);
  if (pending) return NextResponse.json({ verdict: await pending } satisfies Out);
  if (overCap()) {
    recordOps("qcheck_cap_hit", ipTag(ip));
    return NextResponse.json({ verdict: "unsure" } satisfies Out);
  }

  const job = (async () => {
    const v = await judgeMatter(question, locale);
    if (v !== "unsure") {
      CACHE.set(key, { v, at: Date.now() });
      while (CACHE.size > CACHE_MAX) {
        const oldest = CACHE.keys().next().value;
        if (oldest === undefined) break;
        CACHE.delete(oldest);
      }
    }
    if (v === "no") recordOps("qcheck_no", `${locale} ${question.slice(0, 80)}`);
    return v;
  })();
  PENDING.set(key, job);
  try {
    return NextResponse.json({ verdict: await job } satisfies Out);
  } finally {
    PENDING.delete(key);
  }
}
