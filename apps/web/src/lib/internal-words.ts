/**
 * 11-01 进度表 132 ② (推广 W11 卦例：「guard 判「against」」「guard 判定为 cap」): the payload's own names leaked into what
 * readers read — 40 deep readings in the 30 days to 11-01, all in `basis` (「guard 判为偏不成」「static_read」). The model
 * echoes the payload's field names when it explains a cap. These words are ours, never the reader's: a clause that names
 * one is dropped from the reading (at generation, and again when an older reading is shown), and the prompt says so.
 */
const TOKENS = ["guard", "static_read", "payload", "rule_zh", "rule_en", "contact_base", "month_break", "huitou_ke", "timing_plan", "matter_so_far", "same_matter_before", "focal", "how_zh"];
// no lookbehind: ReadingArticle runs this in the browser, and old Safari cannot parse it (the deploy guard checks)
const ANY = new RegExp(`(?:^|[^A-Za-z_])(${TOKENS.join("|")})(?![A-Za-z_])`, "i");
// in Chinese / Japanese / Korean prose any bare cap / against is the guard's level leaking (「判为cap」「判「against」」)
const CJK_LEVEL = /(?:^|[^A-Za-z])(cap|against)(?![A-Za-z])/i;
const CJK = /[぀-ヿ㐀-鿿가-힯]/;

export function internalWord(text: string): string | null {
  const m = text.match(ANY) ?? (CJK.test(text) ? text.match(CJK_LEVEL) : null);
  return m ? m[1]! : null;
}

/** The text without the clauses that name an internal word; unchanged when there is none. */
export function scrubInternal(text: string): string {
  if (!internalWord(text)) return text;
  const cjk = CJK.test(text);
  // split into clauses, keeping their own end marks
  const parts = cjk ? text.match(/[^。；！？\n]+[。；！？]?|\n/g) ?? [text] : text.match(/[^.;!?\n]+[.;!?]?\s*|\n/g) ?? [text];
  const kept = parts.filter((p) => !internalWord(p));
  let out = kept.join("").replace(/[ \t]{2,}/g, " ").trim();
  if (!out) out = text.replace(new RegExp(ANY.source, "gi"), (all, w: string) => all.slice(0, all.length - w.length)).replace(new RegExp(CJK_LEVEL.source, "gi"), (all, w: string) => all.slice(0, all.length - w.length)).trim();
  return out;
}

/** Every string field of a reading, localized ({zh: "…"}) or plain, scrubbed; how many fields changed. */
export function scrubReading<T>(reading: T): { reading: T; changed: string[] } {
  const changed: string[] = [];
  const walk = (v: unknown, key: string): unknown => {
    if (typeof v === "string") { const s = scrubInternal(v); if (s !== v) changed.push(key); return s; }
    if (v && typeof v === "object" && !Array.isArray(v)) return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, walk(x, key || k)]));
    if (Array.isArray(v)) return v.map((x) => walk(x, key));
    return v;
  };
  const out = walk(reading, "") as T;
  return { reading: out, changed: [...new Set(changed)] };
}
