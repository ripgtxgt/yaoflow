import { hexagramByNumber } from "@yaoflow/engine";
import { hexName } from "./names";
import { asLocale, LOCALE_META, type Locale } from "./locales";
import type { CaseView } from "./db";
import { tt } from "./dict/thread";
import { caseTitleHead } from "./seo-head";

/**
 * 公开卦例做成搜索入口 (进度表 14, 推广 09-28; Neil: 「好，写给开发吧」).
 *
 * The page's <title> used to be 「{卦名} · {类型} · 公開卦例」 — nobody searches for
 * that. The title is now a question: the author's own public wording when they
 * wrote one (never the private question), otherwise a question for the kind of
 * matter; then "a real Liu Yao case" and the figures. The description is the
 * call's first sentence plus the timing's. Thin cases stay out of the index.
 */
export const CASE_THIN_CHARS = 60;

/** a public wording tidied for a title: no emoji, no trailing chatter, one line */
export function tidyFraming(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.replace(/[\p{Extended_Pictographic}️‍]/gu, "").replace(/\s+/g, " ").trim();
  s = s.replace(/^[「『"“'‘《«]+/, "").replace(/[」』"”'’》»]+$/, "").trim();
  s = s.replace(/[~～…\.。!！,，;；:：\-—–]+$/u, "").trim();
  if (s.length < 4 || s.length > 80) return null;
  return s;
}

/** The question the title asks: the author's wording, or one for the kind of matter. */
export function caseQuestion(c: Pick<CaseView, "framing" | "topic">, l: Locale): string {
  const own = tidyFraming(c.framing);
  if (own) {
    const cjk = LOCALE_META[l].cjk;
    const q = cjk ? "？" : "?";
    return /[?？]$/.test(own) ? own : own + q;
  }
  const topic = c.topic && ["career", "relationship", "money", "health", "study", "decision"].includes(c.topic) ? c.topic : "other";
  return tt(l, `caseQ_${topic}` as "caseQ_other");
}

export function caseFigures(c: Pick<CaseView, "primary_num" | "changed_num">, l: Locale): string {
  const p = hexagramByNumber(c.primary_num);
  const ch = c.changed_num ? hexagramByNumber(c.changed_num) : null;
  return `${hexName(p, l)}${ch ? ` → ${hexName(ch, l)}` : ""}`;
}

export function caseTitle(c: Pick<CaseView, "framing" | "topic" | "primary_num" | "changed_num">, l: Locale): string {
  return caseTitleHead(caseQuestion(c, l), tt(l, "caseTitleTail", { hex: caseFigures(c, l) }), l);
}

const firstSentence = (s: string | undefined): string => {
  if (!s) return "";
  const t = s.replace(/\s+/g, " ").trim();
  // CJK stops need no space after them; a Latin period must be followed by a space or the end (3.5, e.g.)
  const m = t.match(/^(.+?(?:[。！？]|[!?](?=\s|$)|\.(?=\s|$)))/);
  return (m ? m[1]! : t).trim();
};

/** call's first sentence + timing's first sentence, ≤ 160 characters */
export function caseDescription(fields: Record<string, string>): string {
  const a = firstSentence(fields.verdict ?? fields.summary);
  const b = firstSentence(fields.timing);
  const s = [a, b].filter(Boolean).join(" ");
  return s.length > 160 ? s.slice(0, 157) + "…" : s;
}

/** thin content stays out of the index: too few characters, or nothing but symbols */
export function caseIndexable(c: Pick<CaseView, "fields_json" | "locale">, pageLocale: string): boolean {
  if (pageLocale !== c.locale) return false;
  let fields: Record<string, string>;
  try { fields = JSON.parse(c.fields_json) as Record<string, string>; } catch { return false; }
  const text = Object.values(fields).join("").replace(/[\s\p{P}\p{S}]/gu, "");
  return text.length >= CASE_THIN_CHARS;
}

/** Structured data: a question page when the author gave a public wording; otherwise an article. */
export function caseJsonLd(c: CaseView, site: string, path: string): Record<string, unknown> {
  const l = asLocale(c.locale);
  const fields = JSON.parse(c.fields_json) as Record<string, string>;
  const answer = [fields.verdict ?? fields.summary, fields.tendency ?? fields.movement, fields.timing].filter(Boolean).join("\n\n");
  const question = caseQuestion(c, l);
  const cast = new Date(c.cast_at).toISOString();
  const own = !!tidyFraming(c.framing);
  if (own) {
    return {
      "@context": "https://schema.org",
      "@type": "QAPage",
      inLanguage: LOCALE_META[l].htmlLang,
      mainEntity: {
        "@type": "Question", name: question, text: question, dateCreated: cast, answerCount: 1,
        author: { "@type": "Person", name: tt(l, "caseAnonAuthor") },
        acceptedAnswer: { "@type": "Answer", text: answer, dateCreated: cast, url: `${site}${path}`, author: { "@type": "Organization", name: "YaoFlow" } },
      },
    };
  }
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: caseTitle(c, l),
    inLanguage: LOCALE_META[l].htmlLang,
    datePublished: cast,
    dateModified: new Date(c.published_at).toISOString(),
    articleBody: answer,
    author: { "@type": "Organization", name: "YaoFlow" },
    mainEntityOfPage: `${site}${path}`,
  };
}
