import type { Locale } from "./locales";
import { LOCALE_META } from "./locales";

/** "2026-10-06" → 「10月上旬」 / "early October" — the part of the month, never the day (09-26, price-panel timing hint). */
export function fuzzyWhen(iso: string, locale: Locale): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "";
  const part = d <= 10 ? 0 : d <= 20 ? 1 : 2;
  const month = new Intl.DateTimeFormat(LOCALE_META[locale].htmlLang, { month: "long", timeZone: "UTC" }).format(Date.UTC(y, m - 1, 15));
  switch (locale) {
    case "zh": case "zh-hant": case "ja": return `${m}月${["上旬", "中旬", "下旬"][part]}`;
    case "ko": return `${m}월 ${["초", "중순", "하순"][part]}`;
    case "en": return `${["early", "mid-", "late"][part]}${part === 1 ? "" : " "}${month}`;
    case "fr": return `${["début", "mi-", "fin"][part]}${part === 1 ? "" : " "}${month}`;
    case "de": return `${["Anfang", "Mitte", "Ende"][part]} ${month}`;
    case "es": return `${["principios", "mediados", "finales"][part]} de ${month}`;
    case "pt": return `${["início", "meados", "fim"][part]} de ${month}`;
    default: return month;
  }
}
