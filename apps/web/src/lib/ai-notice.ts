import type { Locale } from "./locales";

/**
 * 10-29 进度表 128 (Neil: 法、德、西、葡的追问和命盘问答输入框旁加一行小字): the EU AI Act, art. 50 (in force since
 * 2026-08-02), asks that a person talking with an AI system be told so. Our two conversations — the follow-up questions
 * under a reading and the questions about a chart — say it in one small line beside the box, in the four EU languages
 * only; the home page and the reading itself still do not name it.
 */
const NOTICE: Partial<Record<Locale, { cast: string; chart: string }>> = {
  fr: { cast: "Réponses rédigées par une IA à partir de votre tirage.", chart: "Réponses rédigées par une IA à partir de votre thème." },
  de: { cast: "Die Antworten schreibt eine KI auf Grundlage deines Wurfs.", chart: "Die Antworten schreibt eine KI auf Grundlage deines Horoskops." },
  es: { cast: "Las respuestas las redacta una IA a partir de tu tirada.", chart: "Las respuestas las redacta una IA a partir de tu carta." },
  pt: { cast: "As respostas são escritas por uma IA a partir da sua tiragem.", chart: "As respostas são escritas por uma IA a partir do seu mapa." },
};

export function aiNotice(locale: string, where: "cast" | "chart"): string | null {
  return NOTICE[locale as Locale]?.[where] ?? null;
}
