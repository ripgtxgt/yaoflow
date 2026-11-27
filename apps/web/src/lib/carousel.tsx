import { ImageResponse } from "next/og";
import { resolveCast, type LineValue } from "@yaoflow/engine";
import raw from "@/data/gua-cases.json";
import { toHans, toHant } from "./hant";
import { LOCALE_META, type Locale } from "./locales";
import { hexName } from "./names";
import { absoluteDates } from "./revisit";
import { CINNABAR, GOLD_TEXT, INK, PAPER, YaoFigure, ogFonts } from "./og";
import type { GuaCase } from "./gua-cases";

/**
 * 卦例轮播图 (09-23, 推广总方案 §14 ⑱). Five 1080×1350 slides per case —
 * 问题 → 卦 → 断 → 应期 → 怎么问得更准 — for Instagram / Facebook carousels.
 *
 * Source: the same real casts the 64 pages show (data/gua-cases.json: every
 * one a real three-coin cast read by the live pipeline; the question is an
 * example, verdict and timing word for word). The slides say so on the last page.
 *
 * Fonts: our OG cards carry tiny CJK subsets (hexagram names only), which cannot
 * set free text. Here each slide asks Google Fonts for a subset of exactly the
 * characters on it (the css2 `text=` API returns a TrueType file satori reads),
 * cached in memory. If Google is unreachable the slide still renders — Latin
 * only — and the caller sees a 503 rather than tofu.
 */

export const CAROUSEL_SIZE = { width: 1080, height: 1350 };
export const CAROUSEL_LOCALES = ["zh-hant", "zh", "en", "ja"] as const;
export type CarouselLocale = (typeof CAROUSEL_LOCALES)[number];

const CASES = raw as GuaCase[];

const T: Record<CarouselLocale, {
  tag: string; asked: string; swipe: string; figure: string; moving: (n: number) => string; still: string;
  verdict: string; timing: string; cast: (d: string) => string; tipsTitle: string; tips: string[]; cta: string; note: string;
}> = {
  "zh-hant": {
    tag: "卦例", asked: "問", swipe: "往右滑，看這一卦 →", figure: "卦", moving: (n) => `${n} 個動爻`, still: "六爻安靜，沒有動爻",
    verdict: "斷", timing: "應期", cast: (d) => `起卦於 ${d}`,
    tipsTitle: "怎麼問，卦才答得準",
    tips: ["一次只問一件事，別把兩個選擇塞進一句。", "問「什麼時候」「會不會」，比問「好不好」更能得到答案。", "寫清楚你是誰、對方是誰、在等什麼。"],
    cta: "yaoflow.com　一件事，一卦", note: "三枚銅錢真實起卦，線上同一套深斷；問題為示例，斷與應期為原文。",
  },
  zh: {
    tag: "卦例", asked: "问", swipe: "往右滑，看这一卦 →", figure: "卦", moving: (n) => `${n} 个动爻`, still: "六爻安静，没有动爻",
    verdict: "断", timing: "应期", cast: (d) => `起卦于 ${d}`,
    tipsTitle: "怎么问，卦才答得准",
    tips: ["一次只问一件事，别把两个选择塞进一句。", "问「什么时候」「会不会」，比问「好不好」更能得到答案。", "写清楚你是谁、对方是谁、在等什么。"],
    cta: "yaoflow.com　一件事，一卦", note: "三枚铜钱真实起卦，线上同一套深断；问题为示例，断与应期为原文。",
  },
  en: {
    tag: "A real cast", asked: "The question", swipe: "Swipe to see the cast →", figure: "The hexagram", moving: (n) => `${n} moving line${n === 1 ? "" : "s"}`, still: "All six lines still",
    verdict: "The reading", timing: "Timing", cast: (d) => `Cast on ${d}`,
    tipsTitle: "How to ask so the answer is clear",
    tips: ["One matter per cast — never two choices in one question.", "Ask “when” or “will it”, not “is it good”.", "Say who you are, who they are, and what you are waiting for."],
    cta: "yaoflow.com — one question, one cast", note: "A real three-coin cast, given the same full reading as any cast on the site. The question is an example; the reading and timing are word for word.",
  },
  ja: {
    tag: "卦例", asked: "問い", swipe: "スワイプして卦を見る →", figure: "卦", moving: (n) => `動爻 ${n}`, still: "六爻とも静か（動爻なし）",
    verdict: "断", timing: "応期", cast: (d) => `${d} に立卦`,
    tipsTitle: "卦がはっきり答える問い方",
    tips: ["一度に一つのことだけ。二つの選択を一文に入れない。", "「良いか」より「いつ」「そうなるか」を問う。", "自分は誰で、相手は誰で、何を待っているかを書く。"],
    cta: "yaoflow.com　一つの問い、一つの卦", note: "三枚の硬貨で実際に立てた卦を、本番と同じ本格鑑定で読んでいます。問いは例、断と応期は原文です。",
  },
};

/** Every case a reader of `locale` can read (the two Chinese scripts read each other's, converted). */
export function casesFor(locale: CarouselLocale): GuaCase[] {
  const out: GuaCase[] = [];
  for (const c of CASES) {
    if (c.locale === locale) out.push(c);
    else if ((locale === "zh" && c.locale === "zh-hant") || (locale === "zh-hant" && c.locale === "zh")) {
      const conv = locale === "zh" ? toHans : toHant;
      out.push({ ...c, locale, question: conv(c.question), verdict: conv(c.verdict), timing: conv(c.timing) });
    }
  }
  return out.sort((a, b) => a.cast_at.localeCompare(b.cast_at) || a.code.localeCompare(b.code));
}

/** The case for a calendar day: walks the list one per day, so a daily post never repeats until it wraps. */
const ROTATION_FROM = Math.floor(Date.parse("2026-09-01T00:00:00Z") / 86_400_000);
const pickMemo = new Map<string, number>(); // `${locale}|${dayN}` → index

export function caseForDay(locale: CarouselLocale, day: string): { index: number; c: GuaCase } {
  const list = casesFor(locale);
  const n = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
  // 11-01 进度表 132 ③: a case whose named days have all gone by is no advert for timing — each day takes its place in
  // the list, walked forward to the next case still ahead and never the day before's. One chain from a fixed first day,
  // so a day's case is the same whenever it is asked; the index stays the case's place in the whole list (slide URLs).
  const at = (k: number): number => {
    const key = `${locale}|${list.length}|${k}`;
    const hit = pickMemo.get(key);
    if (hit !== undefined) return hit;
    const prev = k <= ROTATION_FROM ? -1 : at(k - 1);
    const d = new Date(k * 86_400_000).toISOString().slice(0, 10);
    const base = ((k % list.length) + list.length) % list.length;
    let pick = -1;
    for (let s = 0; s < list.length; s++) {
      const j = (base + s) % list.length;
      if (j !== prev && timingAhead(list[j]!, d)) { pick = j; break; }
    }
    if (pick < 0) pick = base === prev ? (base + 1) % list.length : base; // none ahead: the plain rotation
    if (pickMemo.size > 20_000) pickMemo.clear();
    pickMemo.set(key, pick);
    return pick;
  };
  // warm the chain forward so a far day never recurses deep
  for (let k = ROTATION_FROM; k < n; k += 200) at(k);
  const index = at(n);
  return { index, c: list[index]! };
}

const aheadMemo = new Map<string, boolean>();
export function timingAhead(c: Pick<GuaCase, "timing" | "cast_at" | "tz">, day: string): boolean {
  const key = `${c.cast_at}|${c.timing.length}|${day}`;
  const hit = aheadMemo.get(key);
  if (hit !== undefined) return hit;
  if (aheadMemo.size > 50_000) aheadMemo.clear();
  const v = aheadOf(c, day);
  aheadMemo.set(key, v);
  return v;
}

function aheadOf(c: Pick<GuaCase, "timing" | "cast_at" | "tz">, day: string): boolean {
  const cast = new Date(Date.parse(c.cast_at) + (c.tz ?? 0) * 60_000);
  const from = new Date(cast.getUTCFullYear(), cast.getUTCMonth(), cast.getUTCDate());
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const today = new Date(y, m - 1, d).getTime();
  return absoluteDates(c.timing, from).some((x) => x.getTime() >= today);
}

/* ---------------- fonts ---------------- */

const FAMILY: Record<CarouselLocale, string | null> = { "zh-hant": "Noto Serif TC", zh: "Noto Serif SC", ja: "Noto Serif JP", en: null };
/** 09-28 (应验卡竖图): the same per-script families for any locale; null = the built-in Latin face */
export const BODY_FAMILY: Record<string, string | null> = { ...FAMILY, ko: "Noto Serif KR", fr: null, de: null, es: null, pt: null };
const fontCache = new Map<string, ArrayBuffer>();

/** A real TrueType/OpenType file starts with one of these four tags — anything else (an HTML error page) is not a font. */
export function isSfnt(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 12) return false;
  const b = new Uint8Array(buf, 0, 4);
  const tag = String.fromCharCode(b[0]!, b[1]!, b[2]!, b[3]!);
  return (b[0] === 0 && b[1] === 1 && b[2] === 0 && b[3] === 0) || tag === "OTTO" || tag === "true" || tag === "typ1";
}

async function fetchSubset(family: string, chars: string): Promise<ArrayBuffer> {
  const cssRes = await fetch(`https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@600&text=${encodeURIComponent(chars)}`, { signal: AbortSignal.timeout(10_000) });
  if (!cssRes.ok) throw new Error(`font css ${cssRes.status} for ${family}`);
  const url = /src: url\(([^)]+)\) format\('(?:truetype|opentype)'\)/.exec(await cssRes.text())?.[1];
  if (!url) throw new Error(`no font url for ${family}`);
  const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`font file ${r.status} for ${family}`);
  const buf = await r.arrayBuffer();
  if (!isSfnt(buf)) throw new Error(`not a font for ${family}`);
  return buf;
}

/**
 * 10-15 (Neil：「ur5f 页面报错 js:?」): at 23:42 Google answered three subset requests with an HTML page. The old code
 * neither checked the status nor the bytes, handed "<!DOCTYPE…" to the renderer as a font — the image stream died
 * mid-response (nginx 502, the share sheet's preview broke) — and CACHED it, so those cards stayed broken until the next
 * restart. Now: status and file signature are checked, one retry, and only a real font is ever cached; a failure throws
 * (callers answer 503 or fall back) instead of poisoning the cache.
 */
export async function subsetFont(family: string, text: string, fetcher: typeof fetchSubset = fetchSubset): Promise<ArrayBuffer> {
  const chars = [...new Set(text)].sort().join("");
  const key = `${family}|${chars}`;
  const hit = fontCache.get(key);
  if (hit) return hit;
  let buf: ArrayBuffer;
  try { buf = await fetcher(family, chars); } catch { buf = await fetcher(family, chars); }
  if (fontCache.size > 200) fontCache.clear();
  fontCache.set(key, buf);
  return buf;
}

/**
 * 10-22 进度表 91 (81 的尾巴): 「爻流」 beside the Latin wordmark on the Chinese cards. The cards built from the embedded
 * subsets (lib/og.tsx) have no such glyphs, so the two characters are fetched once (Noto Serif TC) and kept; without
 * them the card says YAOFLOW alone, as before.
 */
let brandHanBuf: ArrayBuffer | null = null;
export const BRAND_HAN_TEXT = "爻流";
export async function brandHanFont(locale: string): Promise<{ name: string; data: ArrayBuffer; weight: 600 } | null> {
  if (locale !== "zh" && locale !== "zh-hant") return null;
  if (!brandHanBuf) { try { brandHanBuf = await subsetFont("Noto Serif TC", BRAND_HAN_TEXT); } catch { return null; } }
  return { name: "BrandHan", data: brandHanBuf, weight: 600 };
}
/** the wordmark: 「爻流」 (in `family`) then YAOFLOW, on one baseline; `han` false = YAOFLOW alone */
export function BrandMark({ han, family = "BrandHan", style }: { han: boolean; family?: string; style?: Record<string, string | number> }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", ...style }}>
      {han && <div style={{ display: "flex", fontFamily: family, letterSpacing: 2, marginRight: 14 }}>{BRAND_HAN_TEXT}</div>}
      <div style={{ display: "flex" }}>YAOFLOW</div>
    </div>
  );
}

/* ---------------- slides ---------------- */

function dayLabel(c: GuaCase, locale: CarouselLocale): string {
  const local = new Date(Date.parse(c.cast_at) + c.tz * 60_000);
  return new Intl.DateTimeFormat(LOCALE_META[locale].htmlLang, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(local);
}

function Frame({ page, children, t, han = false }: { page: number; children: React.ReactNode; t: (typeof T)[CarouselLocale]; han?: boolean }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: PAPER, color: INK, padding: 84, fontFamily: "Body" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 26, color: GOLD_TEXT }}>
        <BrandMark han={han} family="Body" style={{ letterSpacing: 10, fontFamily: "EB Garamond" }} />
        <div style={{ display: "flex" }}>{`${t.tag}  ${page} / 5`}</div>
      </div>
      {/* satori lays a fragment's children out as a row — every slide body is wrapped in its own column */}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>{children}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: "rgba(20,21,28,0.45)" }}>
        <div style={{ display: "flex", fontFamily: "EB Garamond", letterSpacing: 2 }}>yaoflow.com</div>
      </div>
    </div>
  );
}

const label = (s: string) => <div style={{ display: "flex", fontSize: 30, color: GOLD_TEXT, marginBottom: 28 }}>{s}</div>;

export async function carouselSlide(locale: CarouselLocale, c: GuaCase, page: number): Promise<ImageResponse> {
  const t = T[locale];
  const values = c.code.split("").map(Number) as LineValue[];
  const cast = resolveCast(values);
  const primary = hexName(cast.primary, locale);
  const changed = cast.changed ? hexName(cast.changed, locale) : null;
  const cjk = locale !== "en";
  const long = (s: string) => (cjk ? (s.length > 90 ? 44 : s.length > 55 ? 50 : 58) : (s.length > 260 ? 38 : s.length > 170 ? 44 : 52));

  let body: React.ReactNode;
  if (page === 1) {
    body = (
      <div style={{ display: "flex", flexDirection: "column" }}>
        {label(t.asked)}
        <div style={{ display: "flex", fontSize: cjk ? 72 : 64, lineHeight: 1.35, fontWeight: 600 }}>{c.question}</div>
        <div style={{ display: "flex", marginTop: 64, fontSize: 30, color: "rgba(20,21,28,0.55)" }}>{t.swipe}</div>
      </div>
    );
  } else if (page === 2) {
    body = (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <YaoFigure values={values} width={420} />
        <div style={{ display: "flex", marginTop: 72, fontSize: 64, fontWeight: 600 }}>{changed ? `${primary} → ${changed}` : primary}</div>
        <div style={{ display: "flex", marginTop: 20, fontSize: 30, color: cast.changed ? CINNABAR : "rgba(20,21,28,0.55)" }}>
          {cast.changed ? t.moving(cast.changingPositions.length) : t.still}
        </div>
      </div>
    );
  } else if (page === 3) {
    body = (<div style={{ display: "flex", flexDirection: "column" }}>{label(t.verdict)}<div style={{ display: "flex", fontSize: long(c.verdict), lineHeight: 1.5 }}>{c.verdict}</div></div>);
  } else if (page === 4) {
    body = (
      <div style={{ display: "flex", flexDirection: "column" }}>
        {label(t.timing)}
        <div style={{ display: "flex", borderLeft: `6px solid ${GOLD_TEXT}`, paddingLeft: 32, fontSize: long(c.timing), lineHeight: 1.5 }}>{c.timing}</div>
        <div style={{ display: "flex", marginTop: 40, fontSize: 28, color: "rgba(20,21,28,0.55)" }}>{t.cast(dayLabel(c, locale))}</div>
      </div>
    );
  } else {
    body = (
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: 60, fontWeight: 600, marginBottom: 56 }}>{t.tipsTitle}</div>
        {t.tips.map((tip, i) => (
          <div key={i} style={{ display: "flex", fontSize: 40, lineHeight: 1.5, marginBottom: 36 }}>
            <div style={{ display: "flex", color: CINNABAR, width: 70, flexShrink: 0 }}>{`0${i + 1}`}</div>
            <div style={{ display: "flex", flex: 1, flexWrap: "wrap" }}>{tip}</div>
          </div>
        ))}
        <div style={{ display: "flex", marginTop: 40, fontSize: 40, fontWeight: 600 }}>{t.cta}</div>
        <div style={{ display: "flex", marginTop: 28, fontSize: 24, lineHeight: 1.5, color: "rgba(20,21,28,0.5)" }}>{t.note}</div>
      </div>
    );
  }

  const fonts: { name: string; data: ArrayBuffer | Buffer; weight: 400 | 600 }[] = [...ogFonts()];
  const fam = FAMILY[locale];
  if (fam) {
    const text = [c.question, c.verdict, c.timing, primary, changed ?? "", ...Object.values(t).flatMap((v) => (typeof v === "string" ? [v] : Array.isArray(v) ? v : [])),
      t.moving(cast.changingPositions.length), t.cast(dayLabel(c, locale)), "0123456789/→ ", BRAND_HAN_TEXT].join("");
    fonts.push({ name: "Body", data: await subsetFont(fam, text), weight: 600 });
  } else {
    fonts.push(...ogFonts().map((f) => ({ ...f, name: "Body" })));
  }
  return new ImageResponse(<Frame page={page} t={t} han={!!fam && (locale === "zh" || locale === "zh-hant")}>{body}</Frame>, { ...CAROUSEL_SIZE, fonts });
}
