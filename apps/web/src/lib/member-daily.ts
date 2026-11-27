import { BRANCHES, BRANCH_PHASE, STEMS, clashes, combines, dayIndexAt, generates, overcomes, type LineValue } from "@yaoflow/engine";
import { resolveServerChart, resolveTiming, type ReadingInput } from "./reading";
import type { ThreadCast } from "./db";

/**
 * 会员今日一卦 (Neil 09-26: 「做吧」— instead of a daily lottery).
 *
 * Each day a member sees one line about the matter they are carrying: how
 * today's day (日辰) meets the line that stands for that matter (用神) in
 * the figure they cast. Rules, not dice — the same chart and the same day
 * always say the same thing, and it changes as the days turn:
 *
 *   值 same branch        — the matter's own day: things tend to move
 *   冲 clash              — stirred up: news or friction; watch, don't push
 *   合 combine            — held / bound: a day for waiting and smoothing over
 *   生 day feeds it       — backed: a small step forward is well placed
 *   克 day presses it     — pressed: not a day to force it
 *   泄 it feeds the day   — drained: rest, spend less on it
 *   耗 it presses the day — effortful: you can act, but it costs
 *   比 same phase         — even: an ordinary day for it
 *
 * Plus: whether today falls inside a timing window the reading named.
 * No model call; costs nothing per view.
 */
export type DailyKind = "zhi" | "chong" | "he" | "sheng" | "ke" | "xie" | "hao" | "bi";
export interface MemberDaily { kind: DailyKind; dayGanzhi: string; inWindow: boolean; castId: number; sessionId: string | null; question: string }

const DAY = 86_400_000;

/** The matter a member is carrying: a deep cast still waiting on its window, else the latest deep cast of the last 60 days. */
export function focusCast(casts: ThreadCast[], now = Date.now()): ThreadCast | null {
  const deep = casts.filter((c) => c.tier === "deep" && c.values_str).sort((a, b) => b.created_at - a.created_at);
  return deep.find((c) => c.revisit_id && !c.outcome && now - c.created_at < 120 * DAY)
    ?? deep.find((c) => now - c.created_at < 60 * DAY)
    ?? null;
}

export function memberDaily(c: ThreadCast, now = Date.now(), tzOffsetMinutes = c.tz_offset): MemberDaily | null {
  try {
    const values = c.values_str.split(",").map(Number) as LineValue[];
    if (values.length !== 6) return null;
    const input: ReadingInput = { question: c.question, values, castAtMs: c.cast_at, tzOffsetMinutes: c.tz_offset, ...(c.topic ? { topicHint: c.topic as ReadingInput["topicHint"] } : {}) };
    const chart = resolveServerChart(input, true);
    const plan = resolveTiming(input, chart, true);
    const focal = plan.focal.branch;
    const idx = dayIndexAt(now, tzOffsetMinutes);
    const day = BRANCHES[idx % 12]!;
    const dp = BRANCH_PHASE[day], fp = BRANCH_PHASE[focal];
    const kind: DailyKind =
      day === focal ? "zhi"
      : clashes(day, focal) ? "chong"
      : combines(day, focal) ? "he"
      : generates(dp, fp) ? "sheng"
      : overcomes(dp, fp) ? "ke"
      : generates(fp, dp) ? "xie"
      : overcomes(fp, dp) ? "hao"
      : "bi";
    const t = new Date(now + tzOffsetMinutes * 60_000).toISOString().slice(0, 10);
    const inWindow = plan.candidates.some((k) => k.kind !== "hour" && k.windows.some((w) => w.start.slice(0, 10) <= t && t <= w.end.slice(0, 10)));
    return { kind, dayGanzhi: STEMS[idx % 10]! + day, inWindow, castId: c.id, sessionId: c.session_id, question: c.question };
  } catch {
    return null;
  }
}
