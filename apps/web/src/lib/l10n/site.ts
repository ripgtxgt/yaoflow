import { SERVICES, GROUP_LINE } from "../services";
import { CROSS_MAP } from "../cross-map";
import { textKey } from "./core";
import { OWED_HANT, SWITCH_HANT } from "./site-words";

/**
 * 10-29 进度表 128 — the site-wide words that belong to no one product, in 繁體: each Chinese-only service's name, line
 * and price note (the three that exist everywhere carry their own nine), the doors' lines, the cross cards' sentences
 * (keyed by their own text, lib/l10n/core textKey — crossFor reorders them), the 「你有 N 件事到期」 card, and the home
 * page's 「不想起卦？也可以」 row. scripts/l10n/translate.ts site → data/l10n/site.json, read at runtime by
 * lib/services.ts serviceText, components/CrossCards and components/HomeDoors.
 */
export function siteHant() {
  const services: Record<string, { label: string; line: string; priceNote?: string }> = {};
  for (const s of SERVICES) {
    if (s.label.en) continue; // written in all nine already
    services[s.id] = { label: s.label["zh-hant"], line: s.line["zh-hant"], ...(s.priceNote ? { priceNote: s.priceNote["zh-hant"] } : {}) };
  }
  const cross: Record<string, string> = {};
  for (const row of Object.values(CROSS_MAP)) for (const p of [row.main, ...row.more]) if (p.line) cross[textKey(p.line)] = p.line;
  return {
    services,
    groupLine: { ask: GROUP_LINE.ask["zh-hant"], self: GROUP_LINE.self["zh-hant"], daily: GROUP_LINE.daily["zh-hant"] },
    cross,
    owed: OWED_HANT,
    switchRow: { ...SWITCH_HANT },
  };
}
