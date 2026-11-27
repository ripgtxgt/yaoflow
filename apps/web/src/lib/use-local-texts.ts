"use client";

import { useEffect, useState } from "react";
import type { Locale } from "./locales";
import { hasLocalTexts, type LocalTextsTable } from "./local-texts";

/**
 * The classical text (卦辞 + 六爻辞) rendered in the reader's language, for the
 * languages that have it. Fetched as its own chunk only when needed, so a
 * Chinese or English visitor downloads nothing extra.
 */
export function useLocalTexts(locale: Locale): LocalTextsTable | null {
  const [table, setTable] = useState<LocalTextsTable | null>(null);
  useEffect(() => {
    let alive = true;
    if (!hasLocalTexts(locale)) {
      setTable(null);
      return;
    }
    import(`@/data/originals.${locale}.json`)
      .then((m: { default: LocalTextsTable }) => { if (alive) setTable(m.default); })
      .catch(() => { if (alive) setTable(null); });
    return () => { alive = false; };
  }, [locale]);
  return table;
}
