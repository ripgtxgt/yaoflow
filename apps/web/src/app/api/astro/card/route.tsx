import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import { subsetFont } from "@/lib/carousel";
import { PLANETS, SIGNS } from "@/lib/mingli/astro/chart";
import { loc } from "@/lib/mingli/calendar/content";
import { CINNABAR, GOLD_TEXT, INK, PAPER, ogFonts } from "@/lib/og";
import { BRAND_HAN } from "@/lib/brand"; // 10-22 进度表 81: 「爻流」 beside the wordmark on the Chinese cards
import { isForeign, type Foreign } from "@/lib/l10n/core";
import { isLocale } from "@/lib/locales";
import { ASTRO_NAMES } from "@/lib/mingli/astro/names";
import { astroReportText, astroUi } from "@/lib/mingli/astro/page-ui";

export const runtime = "nodejs";

/**
 * 10-19 (Neil: 星盤也要一張能分享的卡) — 太陽／月亮／上升, the element and modality shares and the leading planet as a
 * 1080×1920 story card, with a QR to the free chart (c=astro-share). Only sign names and the ratios travel — never a
 * name, a birth date or a place. GET ?s=牡羊&m=巨蟹[,獅子]&a=天秤&e=3,2,4,3&q=4,5,3&d=金星&l=zh-hant|zh
 * (e = 火土風水 weights, q = 基本固定變動 weights, from lib/mingli/astro/insight.ts)
 */
const EL = ["火", "土", "風", "水"] as const;
const MD = ["基本", "固定", "變動"] as const;
const EL_COLOR: Record<string, string> = { 火: "#b5523b", 土: "#9a7b45", 風: "#5b7f9e", 水: "#3f6386" };
const MD_COLOR = ["#3d3e45", "#6e6f75", "#9d9ea3"];
const W = {
  tag: "星盤", lead: "我的星盤", sun: "太陽", moon: "月亮", rising: "上升", zuo: "座", or: "或", noRising: "—",
  el: "元素比例", md: "模式比例", elN: ["火象", "土象", "風象", "水象"], mdN: ["基本", "固定", "變動"], dom: "主導行星",
  ask: "你的星盤長什麼樣？", scan: "掃碼免費排星盤，看元素與主導行星",
};

/** 10-30 进度表 128 ④: the card's own lines in the other languages (the names come from names.ts and the report words) */
const W_FOREIGN: Record<Foreign, { tag: string; lead: string; ask: string; scan: string; el: string; md: string; dom: string }> = {
  en: { tag: "Natal chart", lead: "My birth chart", ask: "What does your birth chart look like?", scan: "Scan to draw yours free: elements and leading planet", el: "Elements", md: "Modes", dom: "Leading planet" },
  ja: { tag: "ホロスコープ", lead: "わたしのホロスコープ", ask: "あなたのホロスコープは？", scan: "読み取って無料で作成、元素のバランスと主導する天体", el: "元素のバランス", md: "区分のバランス", dom: "主導する天体" },
  ko: { tag: "출생 차트", lead: "나의 출생 차트", ask: "당신의 출생 차트는 어떤 모습일까요?", scan: "스캔해서 무료로 만들고 원소와 주도 행성을 보세요", el: "원소 비율", md: "모드 비율", dom: "주도 행성" },
  fr: { tag: "Thème astral", lead: "Mon thème astral", ask: "À quoi ressemble votre thème ?", scan: "Scannez pour dresser le vôtre gratuitement : éléments et planète dominante", el: "Éléments", md: "Modes", dom: "Planète dominante" },
  de: { tag: "Horoskop", lead: "Mein Geburtshoroskop", ask: "Wie sieht dein Horoskop aus?", scan: "Scannen und kostenlos berechnen: Elemente und dominanter Planet", el: "Elemente", md: "Qualitäten", dom: "Dominanter Planet" },
  es: { tag: "Carta astral", lead: "Mi carta astral", ask: "¿Cómo es tu carta astral?", scan: "Escanea y haz la tuya gratis: elementos y planeta dominante", el: "Elementos", md: "Modalidades", dom: "Planeta dominante" },
  pt: { tag: "Mapa astral", lead: "Meu mapa astral", ask: "Como é o seu mapa astral?", scan: "Escaneie e faça o seu grátis: elementos e planeta dominante", el: "Elementos", md: "Modalidades", dom: "Planeta dominante" },
};

const isSign = (x: string) => (SIGNS as readonly string[]).includes(x);
function nums(raw: string | null, n: number): number[] | null {
  const a = (raw ?? "").split(",").map(Number);
  return a.length === n && a.every((x) => Number.isFinite(x) && x >= 0 && x <= 20) ? a : null;
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const sun = sp.get("s") ?? "", moons = (sp.get("m") ?? "").split(",").filter(Boolean), asc = sp.get("a");
  const e = nums(sp.get("e"), 4), q = nums(sp.get("q"), 3), dom = sp.get("d");
  if (!isSign(sun) || moons.length < 1 || moons.length > 2 || !moons.every(isSign) || (asc !== null && !isSign(asc)) || !e || !q) return new Response("bad", { status: 400 });
  if (dom !== null && !(PLANETS as readonly string[]).includes(dom)) return new Response("bad", { status: 400 });
  const lp = sp.get("l") ?? "";
  // 10-30 进度表 128 ④: a card from a page in another language is drawn in that language (no 「爻流」: Latin pages
  // carry the wordmark alone, as every other card outside Chinese)
  const foreign: Foreign | null = isLocale(lp) && isForeign(lp) ? lp : null;
  const l = foreign ?? (lp === "zh" ? "zh" : "zh-hant");
  const hans = l === "zh";
  const w = (s: string) => (foreign ? s : loc(s, l as "zh" | "zh-hant"));
  const eT = e.reduce((a, b) => a + b, 0) || 1, qT = q.reduce((a, b) => a + b, 0) || 1;
  const N = foreign ? ASTRO_NAMES[foreign] : null;
  const rt = foreign ? astroReportText(foreign) : null, au = foreign ? astroUi(foreign) : null;
  const sign = (x: string) => (N ? N.signs[(SIGNS as readonly string[]).indexOf(x)] ?? x : `${w(x)}${w(W.zuo)}`);
  const T = foreign && N && rt && au
    ? { ...W_FOREIGN[foreign], sun: au.sun!, moon: au.moon!, rising: au.rising!, or: ` ${rt.chip.moonOr.replace(/\{a\}|\{b\}/g, "").trim()} `, noRising: W.noRising, elN: ["火", "土", "風", "水"].map((k) => (rt.el as Record<string, string>)[k]!), mdN: ["基本", "固定", "變動"].map((k) => (rt.md as Record<string, string>)[k]!), brand: "" }
    : { ...Object.fromEntries(Object.entries(W).map(([k, v]) => [k, Array.isArray(v) ? v.map(w) : w(v)])) as unknown as typeof W, brand: BRAND_HAN };
  const domName = dom ? (N ? N.planets[(PLANETS as readonly string[]).indexOf(dom)] ?? dom : w(dom)) : null;
  const rows: [string, string][] = [
    [T.sun, sign(sun)],
    [T.moon, foreign ? moons.map(sign).join(T.or) : moons.map((m) => w(m)).join(w(W.or)) + w(W.zuo)],
    [T.rising, asc ? sign(asc) : W.noRising],
  ];
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  const qr = await QRCode.toDataURL(`${site}/${l}/xingpan?c=astro-share`, { errorCorrectionLevel: "M", margin: 1, width: 300, color: { dark: "#14151c", light: "#f4f2ec" } });
  const text = T.brand + [T.tag, T.lead, T.sun, T.moon, T.rising, T.el, T.md, T.dom, T.ask, T.scan, ...T.elN, ...T.mdN, ...rows.map((r) => r[1]), domName ?? "", "0123456789%"].join("");
  const fonts: { name: string; data: ArrayBuffer | Buffer; weight: 400 | 600 }[] = [...ogFonts()];
  const family = foreign === "ja" ? "Noto Serif JP" : foreign === "ko" ? "Noto Serif KR" : foreign ? null : hans ? "Noto Serif SC" : "Noto Serif TC";
  if (family) { try { fonts.push({ name: "Body", data: await subsetFont(family, text), weight: 600 }); } catch { /* Latin face only */ } }
  /** names run longer than two characters outside Chinese: a wider label column, a smaller size for a long value (the
   *  width counted in ems: a kanji, kana or hangul is one, a Latin letter about half) */
  const cjk = foreign === "ja" || foreign === "ko";
  const labelW = !foreign ? 120 : foreign === "ja" ? 215 : cjk ? 170 : 200; // 「アセンダント」 is six kana
  const ems = (v: string) => [...v].reduce((n, c) => n + (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(c) ? 1 : 0.5), 0);
  const valSize = (v: string) => (cjk ? (ems(v) > 9 ? 44 : ems(v) > 7 ? 52 : ems(v) > 5 ? 64 : 76) : v.length > 21 ? 40 : v.length > 16 ? 48 : v.length > 11 ? 60 : 76);
  const bar = (label: string, color: string, v: number, of: number, max: number) => (
    <div key={label} style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <div style={{ display: "flex", width: foreign && !cjk ? 170 : 110, fontSize: foreign ? 28 : 32, color }}>{label}</div>
      <div style={{ display: "flex", flex: 1, height: 18, background: "rgba(20,21,28,0.07)", borderRadius: 4 }}>
        <div style={{ display: "flex", width: `${(v / max) * 100}%`, height: 18, background: color, borderRadius: 4 }} />
      </div>
      <div style={{ display: "flex", width: 100, justifyContent: "flex-end", fontSize: 28, color: "rgba(20,21,28,0.6)" }}>{`${Math.round((v / of) * 100)}%`}</div>
    </div>
  );
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", background: PAPER, color: INK, padding: "110px 80px 96px", fontFamily: "Body" }}>
        <div style={{ display: "flex", width: "100%", justifyContent: "space-between", fontSize: 30, color: GOLD_TEXT }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>{T.brand ? <div style={{ display: "flex", fontFamily: "Body" }}>{T.brand}</div> : null}<div style={{ display: "flex", letterSpacing: 14, fontFamily: "EB Garamond" }}>YAOFLOW</div></div>
          <div style={{ display: "flex", letterSpacing: foreign ? 2 : 6 }}>{T.tag}</div>
        </div>
        <div style={{ display: "flex", marginTop: 70, fontSize: 44, color: "rgba(20,21,28,0.62)", letterSpacing: foreign ? 1 : 6 }}>{T.lead}</div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 56, gap: 26, border: `4px solid ${CINNABAR}`, padding: "46px 64px", background: "rgba(255,255,255,0.35)", width: 820 }}>
          {rows.map(([k, val]) => (
            <div key={k} style={{ display: "flex", alignItems: "baseline", gap: 40 }}>
              <div style={{ display: "flex", width: labelW, fontSize: 34, color: "rgba(20,21,28,0.5)" }}>{k}</div>
              <div style={{ display: "flex", fontSize: foreign ? valSize(val) : 76, lineHeight: 1.1 }}>{val}</div>
            </div>
          ))}
        </div>
        {domName && <div style={{ display: "flex", marginTop: 50, fontSize: 42, fontWeight: 600 }}>{`${T.dom}${foreign ? ": " : "　"}${domName}`}</div>}
        <div style={{ display: "flex", flexDirection: "column", marginTop: 44, width: 820, gap: 14 }}>
          <div style={{ display: "flex", fontSize: 28, color: "rgba(20,21,28,0.55)" }}>{T.el}</div>
          {EL.map((k, i) => bar(T.elN[i]!, EL_COLOR[k]!, e[i]!, eT, Math.max(...e, 0.1)))}
          <div style={{ display: "flex", fontSize: 28, marginTop: 18, color: "rgba(20,21,28,0.55)" }}>{T.md}</div>
          {MD.map((_, i) => bar(T.mdN[i]!, MD_COLOR[i]!, q[i]!, qT, Math.max(...q, 0.1)))}
        </div>
        <div style={{ display: "flex", width: "100%", marginTop: "auto", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 560 }}>
            <div style={{ display: "flex", fontSize: 44, color: CINNABAR, fontWeight: 600 }}>{T.ask}</div>
            <div style={{ display: "flex", fontSize: 32, color: "rgba(20,21,28,0.62)", lineHeight: 1.4 }}>{T.scan}</div>
            <div style={{ display: "flex", fontSize: 36, letterSpacing: 3, fontFamily: "EB Garamond", marginTop: 6 }}>yaoflow.com</div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} width={260} height={260} alt="" style={{ borderRadius: 6 }} />
        </div>
      </div>
    ),
    { width: 1080, height: 1920, fonts, headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" } },
  );
}
