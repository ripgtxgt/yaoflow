/**
 * 10-13 进度表 41 ②: the date window for a 9:16 card — 「10 月 14–18 日」, short enough to sit on a phone screen.
 * Pure. Taken from the reading's timing passage; a passage without a recognisable date gives its first dated sentence,
 * clipped, and a passage with none gives null (the card then shows no window rather than a paragraph).
 */
const ZH_RANGE = /(\d{1,2})\s*月\s*(\d{1,2})\s*(?:日|號|号)?\s*(?:(?:[至到~～—–-]|和)\s*(?:(\d{1,2})\s*月\s*)?(\d{1,2})\s*(?:日|號|号))?/;
const EN_MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";
const EN_RANGE = new RegExp(`(${EN_MONTHS})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*(?:–|-|to|and|through)\\s*(?:(${EN_MONTHS})\\.?\\s+)?(\\d{1,2})(?:st|nd|rd|th)?)?`, "i");

export function windowLabel(text: string | null | undefined, locale: string): string | null {
  const s = (text ?? "").replace(/\s+/g, " ").trim();
  if (!s) return null;
  if (locale === "zh" || locale === "zh-hant" || locale === "ja") {
    const m = s.match(ZH_RANGE);
    if (m) {
      const [, m1, d1, m2, d2] = m;
      if (!d2) return `${+m1!} 月 ${+d1!} 日`;
      if (m2 && +m2 !== +m1!) return `${+m1!} 月 ${+d1!} 日–${+m2} 月 ${+d2} 日`;
      return +d2 === +d1! ? `${+m1!} 月 ${+d1!} 日` : `${+m1!} 月 ${+d1!}–${+d2} 日`;
    }
  } else {
    const m = s.match(EN_RANGE);
    if (m) {
      const [, mo1, d1, mo2, d2] = m;
      const short = (x: string) => x.slice(0, 3).replace(/^./, (c) => c.toUpperCase());
      if (!d2) return `${short(mo1!)} ${+d1!}`;
      if (mo2 && short(mo2) !== short(mo1!)) return `${short(mo1!)} ${+d1!} – ${short(mo2)} ${+d2}`;
      return `${short(mo1!)} ${+d1!}–${+d2}`;
    }
  }
  // a dated sentence, clipped — some languages write dates our two patterns do not catch
  const parts = s.split(/(?<=[。！？；;])|(?<=\.)\s+/).map((x) => x.trim()).filter(Boolean);
  const dated = parts.find((x) => /\d{1,2}\s*[\/.-]\s*\d{1,2}|\d+\s*(月|日|일|월)/.test(x));
  return dated ? (dated.length > 34 ? `${dated.slice(0, 32)}…` : dated) : null;
}

/** A line the reader may put on a card: one line, no links, short */
export function cardLine(x: string | null | undefined, max = 60): string {
  const s = (x ?? "").replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
