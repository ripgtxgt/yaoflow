import { edgeCountry } from "./geo";

/**
 * 10-12 读者识别 (Neil: 白话是台湾口吻、香港读者看得懂但不是港式写法——「你应该增加客户识别吧」).
 *
 * A 繁體 reader is written to in one of three registers:
 *   - "yue" — the question itself is in Cantonese (detectRegister, 09-18): the reading is in written Cantonese;
 *   - "hk"  — a Hong Kong / Macau reader writing standard Chinese: Hong Kong written wording (上司、人工、發訊息…);
 *   - none  — Taiwan wording, the site's default 繁體.
 * "hk" is read from the edge's country header (HK / MO) or the browser's first Chinese language tag (zh-HK, zh-MO,
 * yue). Only the resulting register is kept with a cast or a lot draw — never the country, never the IP.
 */
export type ReaderRegister = "yue" | "hk";

export const isReaderRegister = (x: unknown): x is ReaderRegister => x === "yue" || x === "hk";

/** Whether the request comes from a Hong Kong / Macau reader */
export function hkReader(headers: Headers | null | undefined): boolean {
  if (!headers) return false;
  const c = edgeCountry(headers);
  if (c === "HK" || c === "MO") return true;
  const first = (headers.get("accept-language") ?? "")
    .split(",")
    .map((x) => x.split(";")[0]!.trim().toLowerCase())
    .find((t) => t.startsWith("zh") || t.startsWith("yue"));
  return !!first && (first === "zh-hk" || first === "zh-mo" || first.startsWith("yue") || first === "zh-hant-hk" || first === "zh-hant-mo");
}

/** The prompt option for a register — only a 繁體 reading carries one */
export function registerOpt(locale: string, r: unknown): { register?: ReaderRegister } {
  return locale === "zh-hant" && isReaderRegister(r) ? { register: r } : {};
}

/**
 * Our fixed 繁體 copy (the lot readings) is written in Taiwan wording. For a Hong Kong reader the few words that read
 * as Taiwanese are swapped for the Hong Kong ones — vocabulary only; the sentences are already standard written Chinese.
 * Order matters (longer first).
 */
const HK_WORDS: [RegExp, string][] = [
  [/傳一則/g, "發一個"],
  [/一則(訊息|簡訊)/g, "一個訊息"],
  [/傳(個)?訊息/g, "發$1訊息"],
  [/傳訊/g, "發訊息"],
  [/簡訊/g, "短訊"],
  [/主管/g, "上司"],
  [/薪水/g, "人工"],
  [/薪資/g, "薪酬"],
  [/專案/g, "項目"],
  [/案子/g, "項目"],
  [/考績/g, "考核"],
  [/品質/g, "質素"],
  [/網路/g, "網絡"],
  [/軟體/g, "軟件"],
  [/計程車/g, "的士"],
  [/捷運/g, "港鐵"],
  [/國曆/g, "新曆"],
];
export function toHkWording(text: string): string {
  let s = text;
  for (const [re, to] of HK_WORDS) s = s.replace(re, to);
  return s;
}
