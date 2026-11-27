// server-side only: the words are built on the server and handed to the client parts as a prop
import { tarotText, type TarotText } from "./tarot-text";
import { CRISIS_T } from "./crisis";
import { isLocale } from "./locales";

/**
 * 10-16 进度表 68: every word the 塔羅 pages' client parts show. 10-29 进度表 128: in all nine languages — the 繁體 source
 * and the generated translations live in lib/tarot-text.ts; `quote` is how this language quotes the reader's question.
 * Outside Chinese the crisis line names the helplines of that language (lib/crisis.ts), as the cast page does.
 */
export type TarotUi = TarotText["ui"] & { quote: string };

export function tarotUi(locale: string | boolean): TarotUi {
  // (true / false: the old 简体 / 繁體 switch)
  const l = typeof locale === "boolean" ? (locale ? "zh" : "zh-hant") : locale;
  const t = tarotText(l);
  const lines = l !== "zh" && l !== "zh-hant" && isLocale(l) ? CRISIS_T[l].lines : [];
  const crisis = lines.length ? `${t.ui.refuse_crisis} ${lines.map((x) => `${x.name}: ${x.tel}`).join(" · ")}` : t.ui.refuse_crisis;
  return { ...t.ui, refuse_crisis: crisis, quote: t.result.quote };
}
