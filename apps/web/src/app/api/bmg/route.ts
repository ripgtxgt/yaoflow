import { NextRequest, NextResponse } from "next/server";
import { customerFromRequest } from "@/lib/auth";
import { ensureBid } from "@/lib/browsers";
import { record } from "@/lib/analytics-server";
import { featureState } from "@/lib/features";
import { isType4, linesKey, linesType4, scoreFull, scoreQuick, type Answer } from "@/lib/bmg";
import { bmgByToken, saveBmg } from "@/lib/bmg-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 11-05 进度表 136 本命卦: score a finished quiz on the server (the page scores too, for the animation — this is the copy
 * that is kept) and file it under this browser (and the customer, when signed in). No sign-in, no birth data.
 *   POST { mode: "full", answers: "ABBA…" (12, question order) } | { mode: "quick", type4: "INTJ", a5: "A", a6: "B" }
 *   optional: c (where they came from), inv (a 合卦 invitation's token — 进度表 138)
 * → { token, kw, lines }
 */
const lastByIp = new Map<string, number[]>();
function limited(ip: string, now: number): boolean {
  const xs = (lastByIp.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  xs.push(now);
  lastByIp.set(ip, xs);
  if (lastByIp.size > 5000) lastByIp.clear();
  return xs.length > 30;
}

export async function POST(req: NextRequest) {
  if (featureState("bmg") === "off") return NextResponse.json({ error: "off" }, { status: 404 });
  const now = Date.now();
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]!.trim() || "-";
  if (limited(ip, now)) return NextResponse.json({ error: "rate" }, { status: 429 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ error: "bad" }, { status: 400 });
  let scored: ReturnType<typeof scoreFull> = null;
  let answers = "";
  let type4: string | null = null;
  const mode = b.mode === "quick" ? "quick" : "full";
  if (mode === "full") {
    const s = typeof b.answers === "string" ? b.answers.toUpperCase() : "";
    if (!/^[AB]{12}$/.test(s)) return NextResponse.json({ error: "answers" }, { status: 400 });
    const map: Record<number, Answer> = {};
    s.split("").forEach((x, i) => { map[i + 1] = x as Answer; });
    scored = scoreFull(map);
    answers = s;
  } else {
    const t = typeof b.type4 === "string" ? b.type4.toUpperCase() : "";
    if (!isType4(t)) return NextResponse.json({ error: "type4" }, { status: 400 });
    scored = scoreQuick(t, b.a5 as Answer, b.a6 as Answer);
    type4 = t;
    answers = `${t}${String(b.a5)}${String(b.a6)}`;
  }
  if (!scored) return NextResponse.json({ error: "answers" }, { status: 400 });
  const res = NextResponse.json({});
  const bid = ensureBid(req, res);
  const who = customerFromRequest(req);
  const inv = typeof b.inv === "string" && bmgByToken(b.inv) ? b.inv : null;
  const via = typeof b.c === "string" ? b.c.replace(/[^\w:.-]/g, "").slice(0, 40) : null;
  const row = saveBmg({
    bid, customerId: who?.customerId ?? null, locale: "zh-hant", mode, answers,
    type4: type4 ?? linesType4(scored.lines), lines: linesKey(scored.lines), ties: scored.ties, via, invitedBy: inv,
  }, now);
  record({ t: now, e: "bmg_done", s: `bmg:${row.token}`, locale: "zh-hant", method: `${mode}:${row.kw}`, path: "/bmg", ...(via ? { c: via } : {}) });
  const out = NextResponse.json({ token: row.token, kw: row.kw, lines: row.lines });
  for (const c of res.cookies.getAll()) out.cookies.set(c);
  return out;
}
