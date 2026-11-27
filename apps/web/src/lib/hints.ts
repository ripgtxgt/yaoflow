import type { QuestionScale } from "./timing";
import type { Topic } from "./topic";

/**
 * Optional, user-declared hints from the cast page chips. Absent = the
 * question is read automatically (keyword detection). Present = a hard
 * signal that overrides the guess — for the focal line, the timing
 * granularity, and the revisit schedule.
 */

/** Scales a person can pick; "choose"/"open" stay inferred. */
export const SCALE_HINTS = ["now", "day", "weeks", "long"] as const;
export type ScaleHint = (typeof SCALE_HINTS)[number];

export const TOPIC_HINTS = ["career", "relationship", "money", "health", "study", "decision", "other"] as const;

export function parseScaleHint(x: unknown): ScaleHint | undefined {
  return typeof x === "string" && (SCALE_HINTS as readonly string[]).includes(x) ? (x as ScaleHint) : undefined;
}

export function parseTopicHint(x: unknown): Topic | undefined {
  return typeof x === "string" && (TOPIC_HINTS as readonly string[]).includes(x) ? (x as Topic) : undefined;
}

/** Type guard used where a QuestionScale is expected. */
export const asScale = (h: ScaleHint | undefined): QuestionScale | undefined => h;
