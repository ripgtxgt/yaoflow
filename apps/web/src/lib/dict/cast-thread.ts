/**
 * 10-03 起卦记录 (lib/cast-log.ts): the cast page's words for the 2nd+ cast on one matter — which cast this is, the
 * figures before it, and the label over the free line that now ties them together. The block before the price has its
 * own words, learned per variant (lib/nudge.ts). 10-22 分開: the tap that says this cast is not that matter (sepChip / sepDone).
 * Same keys, same placeholders in every language (test/cast-log.test.ts).
 */
export const CAST_THREAD_T = {
  zh: { thCount: "这件事的第 {n} 卦", thNow: "这一卦", thLabel: "连起来看", thMore: "…", sepChip: "不是同一件事？分开", sepDone: "已分开：这一卦单独算一件事，不参考之前的卦。" },
  "zh-hant": { thCount: "這件事的第 {n} 卦", thNow: "這一卦", thLabel: "連起來看", thMore: "…", sepChip: "不是同一件事？分開", sepDone: "已分開：這一卦單獨算一件事，不參考之前的卦。" },
  en: { thCount: "Cast {n} on this matter", thNow: "this cast", thLabel: "Read with your earlier casts", thMore: "…", sepChip: "Not the same matter? Separate it", sepDone: "Separated: this cast stands on its own, read without your earlier casts." },
  ja: { thCount: "この件の {n} つ目の卦", thNow: "今回", thLabel: "前の卦とつなげて", thMore: "…", sepChip: "同じ件ではない？分ける", sepDone: "分けました：この卦は単独の件として、前の卦を参照せずに読みます。" },
  ko: { thCount: "이 일의 {n}번째 괘", thNow: "이번 괘", thLabel: "앞의 괘와 이어서", thMore: "…", sepChip: "같은 일이 아닌가요? 분리하기", sepDone: "분리했습니다: 이 괘는 별개의 일로, 앞의 괘를 참고하지 않습니다." },
  fr: { thCount: "Tirage n° {n} sur cette question", thNow: "ce tirage", thLabel: "Avec vos tirages précédents", thMore: "…", sepChip: "Pas la même question ? Séparer", sepDone: "Séparé : ce tirage est lu seul, sans vos tirages précédents." },
  de: { thCount: "Wurf {n} zu dieser Sache", thNow: "dieser Wurf", thLabel: "Mit deinen früheren Würfen", thMore: "…", sepChip: "Nicht dieselbe Sache? Trennen", sepDone: "Getrennt: dieser Wurf steht für sich, ohne deine früheren Würfe." },
  es: { thCount: "Tirada {n} sobre este asunto", thNow: "esta tirada", thLabel: "Junto con tus tiradas anteriores", thMore: "…", sepChip: "¿No es el mismo asunto? Separar", sepDone: "Separado: esta tirada se lee sola, sin tus tiradas anteriores." },
  pt: { thCount: "Tiragem {n} sobre este assunto", thNow: "esta tiragem", thLabel: "Junto com as suas tiragens anteriores", thMore: "…", sepChip: "Não é o mesmo assunto? Separar", sepDone: "Separado: esta tiragem é lida sozinha, sem as suas tiragens anteriores." },
} as const;

export type CastThreadKey = keyof (typeof CAST_THREAD_T)["zh"];
export function ctt(locale: string, key: CastThreadKey, vars: Record<string, string | number> = {}): string {
  const s = ((CAST_THREAD_T as Record<string, Record<CastThreadKey, string>>)[locale] ?? CAST_THREAD_T.en)[key];
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] !== undefined ? String(vars[k]) : m));
}

/** "2026-10-01" in the reader's own short style: 10/1 (zh, en-US), 1.10. (de), 01/10 (fr) … */
export function shortDay(day: string, locale: string): string {
  const t = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(t)) return day;
  try {
    return new Intl.DateTimeFormat(locale === "zh-hant" ? "zh-TW" : locale === "zh" ? "zh-CN" : locale, { month: "numeric", day: "numeric", timeZone: "UTC" }).format(t);
  } catch {
    return day.slice(5);
  }
}
