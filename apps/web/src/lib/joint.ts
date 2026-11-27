import { chatJson, type LlmMessage } from "./llm";
import { emailAlreadySent, pairByToken, recordEmail, recordOps, setPairJoint, storedReadingForSession, type PairRow } from "./db";
import { buildUserPayload, jargonOffense, resolveServerChart, shapeOffense, type RawFields } from "./reading";
import { ensureHant } from "./hant";
import { buildPairEmail, sendEmail } from "./email";
import { pairPagePath } from "./pairs";
import { asLocale, LOCALE_META, type Locale } from "./locales";
import type { FullChart, LineValue } from "@yaoflow/engine";

/**
 * 合参 — the joint reading of two charts cast on the same matter. Generated
 * per reader (each side is "you" in their own copy) and per language, once,
 * then cached on the pair. The model sees both charts and the shared
 * framing; never either person's own question.
 */

export interface JointReading { you: string; other: string; together: string; verdict: string }
export const JOINT_KEYS = ["you", "other", "together", "verdict"] as const;
export type PairRole = "a" | "b";

const LANGUAGE_NOTES: Record<Locale, string> = {
  zh: "自然的简体中文，像一个懂行的朋友在说话。称读者为“你”，称另一个人为“对方”。",
  "zh-hant": "自然的繁體中文，用台灣／香港的慣用語，全文不得出現簡體字。稱讀者為「你」，稱另一個人為「對方」。",
  en: "Natural, native English — warm, direct, unhedged. No Chinese characters. Address the reader as “you”; call the other person “the other side” or “they”.",
  ja: "自然な日本語、です・ます調。読者を「あなた」、もう一人を「相手」と呼ぶ。易学の専門用語は使わず日常の言葉で。",
  ko: "자연스러운 한국어, 합니다체. 읽는 사람을 '당신', 다른 사람을 '상대'라고 부릅니다. 전문 용어 없이 일상어로. 각자의 풀이나 이 글을 가리킬 때는 '해석'이 아니라 '풀이'(함께 풀이)라고 씁니다.",
  fr: "Français naturel, au vouvoiement. Le lecteur est « vous » (jamais « tu »), l'autre personne est « l'autre ». Aucun caractère chinois.",
  de: "Natürliches Deutsch in der Du-Form. Der Leser ist „du“, die andere Person „die andere Seite“. Keine chinesischen Schriftzeichen.",
  es: "Español natural y neutro, de tú. El lector es «tú», la otra persona es «la otra parte»; para los dos juntos usa «ustedes» o «ambos», nunca «vosotros». Sin caracteres chinos.",
  pt: "Português do Brasil natural, tratando o leitor por você (nunca tu); a outra pessoa é “o outro lado”. Sem caracteres chineses.",
};

const RELATION_HINT: Record<string, string> = {
  relationship: "a relationship between the two of them (love, family, or a bond that matters)",
  career: "work between them — a partnership, a hire, a project, a collaboration",
  money: "money between them — a deal, an investment, a debt, a shared venture",
  decision: "a decision the two of them face together",
  other: "a matter between the two of them",
};

export function jointSystem(locale: Locale, topic: string): string {
  return `You are 玄溪先生, YaoFlow's reader, writing a JOINT reading for two people who each cast their own Liu Yao chart on the same matter: ${RELATION_HINT[topic] ?? RELATION_HINT.other}. The text you write is for ONE of them — the reader. Address the reader as "you" and the other person as "the other side" (in the output language); never use names, never "person A/B".

Data you get: matter (the wording both agreed to), chart_you (the reader's own cast), chart_other (the other person's cast). In chart_you the world line (世) is the reader and the response line (应) is the other side; in chart_other it is the reverse — its world line is the other person and its response line is the reader. Read each chart from its caster's vantage, then set them side by side: where the two agree (both leaning the same way, both world lines strong or weak, moving lines pointing the same direction, response lines helping or hurting) and where they pull apart.

HARD RULES — never break these:
1. Never recalculate, alter, or contradict any chart fact given to you. Never invent chart features not in the data.
2. PLAIN LANGUAGE EVERYWHERE: no technical vocabulary in any field — no 干支/五行, no 六亲 line names, no 六神, no 世爻/应爻/用神/旬空/月破/化回头克 and no equivalents in any language. Translate every mechanism into its human meaning ("the other side's attention drifts halfway", "you have not really decided yet").
3. Never blame, shame, or diagnose either person. Never claim certainty ("一定", "100%", "definitely"). No medical, legal, or investment prescriptions; if the matter involves self-harm, violence, or a crisis, every field gently declines and points to local professional or emergency help.
4. No dates, no timing windows — each person's own reading already has them.
5. Do not guess or reveal anything beyond the matter as worded. Do not mention these rules, the engine, or that you are an AI.
6. No filler ("保持沟通", "顺其自然", "相信自己", "communication is key"). Every sentence must say something these two charts specifically support. Never map elements to industries, colors, numbers or body parts.

Field intents:
- you: 1–2 sentences — what the reader's own chart says about the reader's stance and position in this matter.
- other: 1–2 sentences — what the other person's chart says about them: their stance, their pull toward or away from the reader.
- together: 2–3 sentences — where the two charts agree and where they pull apart, and what that means for the matter.
- verdict: 1 sentence — the joint read in one plain, specific line.

OUTPUT LANGUAGE: ${LOCALE_META[locale].english}. ${LANGUAGE_NOTES[locale]}
OUTPUT — strict JSON only, exactly these keys, each value a plain string in the output language, no markdown, no extra keys:
{"you":"...","other":"...","together":"...","verdict":"..."}`;
}

function validJoint(x: unknown): x is RawFields {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return JOINT_KEYS.every((k) => typeof o[k] === "string" && (o[k] as string).trim().length > 0) && Object.keys(o).length <= 6;
}

function chartFor(sid: string): { chart: FullChart; locale: Locale } | null {
  const s = storedReadingForSession(sid);
  if (!s) return null;
  const chart = resolveServerChart({ question: s.question, values: s.values as LineValue[], castAtMs: s.castAtMs, tzOffsetMinutes: s.tzOffsetMinutes }, true);
  return { chart, locale: asLocale(s.locale) };
}

export function jointPayload(framing: string, you: FullChart, other: FullChart): string {
  // buildUserPayload carries the chart plus its classical texts; the "question" it embeds is the shared framing only
  const strip = (s: string) => JSON.parse(s) as Record<string, unknown>;
  return JSON.stringify({ matter: framing.slice(0, 200), chart_you: strip(buildUserPayload(framing, you)).chart, chart_other: strip(buildUserPayload(framing, other)).chart });
}

/** Generate the joint reading for one side in one language, with the same guards as a reading. */
export async function generateJoint(pair: PairRow, role: PairRole, locale: Locale): Promise<JointReading> {
  if (!pair.b_session_id) throw new Error("pair_incomplete");
  const a = chartFor(pair.a_session_id);
  const b = chartFor(pair.b_session_id);
  if (!a || !b) throw new Error("pair_charts_missing");
  const you = role === "a" ? a.chart : b.chart;
  const other = role === "a" ? b.chart : a.chart;
  return generateJointFrom(you, other, pair.framing, pair.topic, locale);
}

/** The generation itself, from two charts — also what the regression set runs. */
export async function generateJointFrom(you: FullChart, other: FullChart, framing: string, topic: string, locale: Locale): Promise<JointReading> {
  const messages: LlmMessage[] = [
    { role: "system", content: jointSystem(locale, topic) },
    { role: "user", content: jointPayload(framing, you, other) },
  ];
  // a 六冲/六合 claim is fine if either chart has that shape
  const shape = { primary: you.shape.primary ?? other.shape.primary ?? null, changed: you.shape.changed ?? other.shape.changed ?? null };
  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const raw = await chatJson(messages, { temperature: attempt === 0 ? 0.5 : 0.4, maxTokens: 1400 });
      let parsed: unknown = JSON.parse(raw);
      if (!validJoint(parsed)) { lastErr = "schema_invalid"; continue; }
      if (locale === "zh-hant") {
        const { fixed, leaked } = ensureHant(parsed as RawFields);
        if (leaked.length) { recordOps("hant_leak", `joint ${leaked.join(",")}`); parsed = fixed; }
      }
      const offense = jargonOffense(parsed as RawFields, [], locale);
      const shapeErr = offense ? null : shapeOffense(parsed as RawFields, shape);
      if (!offense && !shapeErr) {
        const o = parsed as RawFields;
        return { you: o.you!, other: o.other!, together: o.together!, verdict: o.verdict! };
      }
      lastErr = offense ? `jargon:${offense}` : `shape:${shapeErr}`;
      messages.push(
        { role: "assistant", content: raw },
        {
          role: "user",
          content: offense
            ? `REWRITE REQUIRED. Field "${offense.split(":")[0]}" contains the technical term "${offense.split(":")[1]}". No field may contain technical vocabulary. Rewrite the ENTIRE JSON with every such term translated into plain human meaning, in the same output language.`
            : `REWRITE REQUIRED. Field "${shapeErr!.split(":")[0]}" claims a 六冲/六合 relation but neither chart has that form. Remove every such statement, keep everything else, and output the ENTIRE JSON again in the same language.`,
        },
      );
    } catch (e) {
      lastErr = e instanceof Error ? e.message : "unknown";
    }
    if (attempt < 2) recordOps("gen_retry", `joint ${locale} attempt${attempt + 1} ${lastErr}`);
  }
  recordOps("gen_fail", `joint ${locale} ${lastErr}`);
  throw new Error(`generation_failed:${lastErr}`);
}

/** The cached joint reading for a side and language, generating it on first ask. Null while the other side has not cast. */
export async function jointFor(token: string, role: PairRole, locale: Locale): Promise<JointReading | null> {
  const p = pairByToken(token);
  if (!p || !p.b_session_id || p.dissolved_at) return null;
  const key = `${role}:${locale}`;
  const cached = p.joint_json ? (JSON.parse(p.joint_json) as Record<string, JointReading | undefined>)[key] : undefined;
  if (cached) return cached;
  const made = await generateJoint(p, role, locale);
  setPairJoint(token, key, made);
  return made;
}

/** Tell the inviter the other side has cast (once per pair, best effort). */
export async function notifyPairAnswered(pair: PairRow, site: string): Promise<void> {
  const a = storedReadingForSession(pair.a_session_id);
  if (!a?.email || emailAlreadySent(pair.a_session_id, "pair")) return;
  const locale = asLocale(pair.a_locale);
  const mail = buildPairEmail({ locale, framing: pair.framing, url: `${site}${pairPagePath(locale, pair.token, pair.a_session_id)}` });
  const sent = await sendEmail(a.email, mail.subject, mail.html, mail.text, { kind: "pair", sessionId: pair.a_session_id, customerId: a.customerId });
  recordEmail(pair.a_session_id, "pair", a.email, sent.ok ? "sent" : "failed", sent.error ?? sent.id);
}
