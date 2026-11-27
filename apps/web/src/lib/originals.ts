import ja from "@/data/originals.ja.json";
import ko from "@/data/originals.ko.json";
import fr from "@/data/originals.fr.json";
import de from "@/data/originals.de.json";
import es from "@/data/originals.es.json";
import pt from "@/data/originals.pt.json";
import type { Locale } from "./locales";
import type { LocalTexts, LocalTextsTable } from "./local-texts";

/** Server-side access to the per-language renderings of the received text (see local-texts.ts). */
const TABLES: Partial<Record<Locale, LocalTextsTable>> = {
  ja: ja as LocalTextsTable, ko: ko as LocalTextsTable, fr: fr as LocalTextsTable,
  de: de as LocalTextsTable, es: es as LocalTextsTable, pt: pt as LocalTextsTable,
};

export function localTextsFor(n: number, locale: Locale): LocalTexts | null {
  return TABLES[locale]?.[String(n)] ?? null;
}
