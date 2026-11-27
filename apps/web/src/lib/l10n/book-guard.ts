import type { Foreign } from "./core";

/**
 * 10-30 进度表 128 ④-5 — what the three year reports of the 年書 (八字 / 紫微 / 星盤) ask and check alike on a page in
 * another language: the year's keyword (one or two words, not 2–4 Chinese characters), the month's short 宜 / 不宜 lists,
 * and the keyword as it is kept.
 */
const KW: Record<Foreign, string> = {
  en: "one keyword for the year: one or two English words (such as Grounding, New ground, Sorting out, Change of track, Gathering in), no punctuation",
  fr: "one keyword for the year: one or two French words (such as Ancrage, Ouverture, Tri, Virage, Récolte), no punctuation",
  de: "one keyword for the year: one or two German words (such as Wurzeln, Aufbruch, Ordnung, Kurswechsel, Ernte), no punctuation",
  es: "one keyword for the year: one or two Spanish words (such as Raíces, Apertura, Orden, Cambio de rumbo, Cosecha), no punctuation",
  pt: "one keyword for the year: one or two Portuguese words (such as Raízes, Abertura, Arrumação, Virada, Colheita), no punctuation",
  ja: "one keyword for the year: 2–6 Japanese characters (such as 収束、開拓、整理、転機、根を張る), no punctuation",
  ko: "one keyword for the year: one or two Korean words (such as 정리, 개척, 전환, 뿌리내리기, 마무리), no punctuation",
};
const YIJI: Record<Foreign, string> = {
  en: "2–6 words each (e.g. talk a partnership through, sort out the accounts, see an old friend)",
  fr: "2–6 words each (e.g. discuter d'un partenariat, mettre les comptes à jour, revoir un vieil ami)",
  de: "2–6 words each (e.g. eine Zusammenarbeit besprechen, die Finanzen ordnen, einen alten Freund treffen)",
  es: "2–6 words each (e.g. hablar de una colaboración, ordenar las cuentas, ver a un viejo amigo)",
  pt: "2–6 words each (e.g. conversar sobre uma parceria, organizar as contas, rever um velho amigo)",
  ja: "4–14 characters each (e.g. 協力の話をまとめる、帳簿を整理する、旧友に会う)",
  ko: "2–6 words each (e.g. 협력 이야기 나누기, 장부 정리하기, 옛 친구 만나기)",
};
/** the keyword line of a year report's first task */
export const bookKeywordTask = (l: Foreign): string => `keyword: ${KW[l]}.`;
/** how long each 宜 / 不宜 item is */
export const bookYiJiTask = (l: Foreign): string => YIJI[l];

/**
 * a foreign page's year keyword as kept — one or two words (up to three, 30 letters), or 2–8 Japanese / up to 12 Korean
 * characters; null when it is not one
 */
export function bookKeyword(v: unknown, l: Foreign): string | null {
  const k = (typeof v === "string" ? v : "").trim().replace(/^["'“”„«»「『]+|["'“”„«»」』.。!！]+$/gu, "").trim();
  if (!k || /[,，。.;；:：!?！？\n]/.test(k)) return null;
  if (l === "ja") return [...k.replace(/\s/g, "")].length >= 2 && [...k].length <= 8 ? k : null;
  if (l === "ko") return [...k.replace(/\s/g, "")].length >= 1 && [...k].length <= 12 ? k : null;
  return k.split(/\s+/).length <= 3 && k.length <= 30 ? k : null;
}
