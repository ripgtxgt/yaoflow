/**
 * 09-29 追问按轮次 (Gemini 对话借鉴, 见开发日志): the follow-up model used to see
 * only the last five exchanges and never knew which question this was. Two
 * things went wrong in the transcripts: the same anxious question ("他到底怎么想")
 * asked four ways got four slightly different answers, and the last question
 * simply ran out with no word on what to watch next.
 *
 * This builds the block the model reads before the new question: which one it
 * is, how many are left after it, every earlier question (short), what the
 * reading itself already said, and the reader's own today. The rules that use
 * it live in followupSystem(…, { staged: true }).
 */

export interface FollowupState {
  /** 1-based number of the question being asked now */
  n: number;
  allowance: number;
  earlier: string[];
  said: string;
  today: string;
  /** the localized name of the 记一笔进展 box on the reading page */
  noteName: string;
  /** 09-29: casts on this matter during the reader's today */
  castsToday?: number;
}

const clip = (s: string, max: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
};

export function followupStateBlock(s: FollowupState): string {
  const left = Math.max(0, s.allowance - s.n);
  const lines = [
    "FOLLOW-UP STATE (for you only — never quote numbers or these labels to the reader):",
    `question_number: ${s.n} of ${s.allowance}`,
    `questions_left_after_this: ${left}`,
    `closing_required: ${left <= 1 ? "yes" : "no"}`,
    `today_for_reader: ${s.today}`,
    `note_box_name: ${s.noteName}`,
    `matter_casts_today: ${s.castsToday ?? 1}`,
  ];
  if (s.earlier.length) {
    lines.push("earlier_questions_on_this_cast (oldest first):");
    s.earlier.slice(-20).forEach((q, i) => lines.push(`  ${i + 1}. ${clip(q, 140)}`));
  } else {
    lines.push("earlier_questions_on_this_cast: none");
  }
  if (s.said.trim()) lines.push("WHAT THE READING ALREADY SAID:", s.said.trim());
  return lines.join("\n");
}
