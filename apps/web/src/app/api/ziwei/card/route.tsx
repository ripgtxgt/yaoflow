import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import { subsetFont } from "@/lib/carousel";
import { CINNABAR, GOLD_TEXT, INK, PAPER, ogFonts } from "@/lib/og";
import { loc } from "@/lib/mingli/calendar/content";
import { BRANCHES, isMajor } from "@/lib/mingli/ziwei/chart";
import { gejuById } from "@/lib/mingli/ziwei/geju";
import { BRIGHTS, FIVE_CLASSES } from "@/lib/mingli/ziwei/insight";
import { ZIWEI_UI_SOURCE as UI } from "@/lib/mingli/ziwei/page-ui";
import { BRAND_HAN } from "@/lib/brand"; // 10-22 进度表 81: 「爻流」 beside the wordmark on the Chinese cards
import { isForeign, type Foreign } from "@/lib/l10n/core";
import { isLocale } from "@/lib/locales";
import { zwName } from "@/lib/mingli/ziwei/names";
import { ziweiUi } from "@/lib/mingli/ziwei/page-ui";

export const runtime = "nodejs";

/**
 * 10-19 紫微命盤卡 — 1080×1920 story card: 命宮 and its main stars (or the ones borrowed from across), 五行局, the
 * strongest 格局, and a QR to the free chart (c=ziwei-share). Only chart facts travel — never a name, a birth date or a place.
 * GET ?b=巳&m=武曲,破軍&br=平,平&e=0|1&f=金四局&g=<格局 id>&s=a|b|c&l=zh-hant|zh|<any language the 紫微 is open in>  (built by insight.ts cardQuery)
 */
const W = {
  tag: "紫微斗數", lead: "我的紫微命盤", soul: "命宮", borrowed: "命宮沒有主星，借對宮來看", five: "五行局", geju: "格局",
  ask: "你的紫微命盤長什麼樣？", scan: "掃碼免費排盤，看命宮主星與格局",
};
const STATUS: Record<string, string> = { a: "成", b: "半成", c: "破" };
/** 10-30 进度表 128 ④: the card's own lines in the other languages (star, palace and pattern names from names.ts and the chart page's words) */
const W_FOREIGN: Record<Foreign, typeof W> = {
  en: { tag: "Zi Wei Dou Shu", lead: "My Zi Wei chart", soul: "Life Palace", borrowed: "No main star in the Life Palace: read through the stars across", five: "Five Element Bureau", geju: "Pattern", ask: "What does your Zi Wei chart look like?", scan: "Scan to draw yours free: Life Palace stars and patterns" },
  ja: { tag: "紫微斗数", lead: "わたしの命盤", soul: "命宮", borrowed: "命宮に主星がないため、対宮の星で読みます", five: "五行局", geju: "格局", ask: "あなたの紫微命盤は？", scan: "読み取って無料で作成、命宮の主星と格局" },
  ko: { tag: "자미두수", lead: "나의 자미두수 명반", soul: "명궁", borrowed: "명궁에 주성이 없어 맞은편 궁의 별로 봅니다", five: "오행국", geju: "격국", ask: "당신의 자미두수 명반은 어떤 모습일까요?", scan: "스캔해서 무료로 명반을 세우고 명궁 주성과 격국을 보세요" },
  fr: { tag: "Zi Wei Dou Shu", lead: "Mon thème Zi Wei", soul: "Palais de la Vie", borrowed: "Aucune étoile principale dans le palais de la Vie : on lit les étoiles d'en face", five: "Classe des Cinq Éléments", geju: "Configuration", ask: "À quoi ressemble votre thème Zi Wei ?", scan: "Scannez pour dresser le vôtre gratuitement : étoiles du palais de la Vie et configurations" },
  de: { tag: "Zi Wei Dou Shu", lead: "Mein Zi-Wei-Chart", soul: "Lebenspalast", borrowed: "Kein Hauptstern im Lebenspalast: gelesen über die Sterne gegenüber", five: "Fünf-Elemente-Klasse", geju: "Konstellation", ask: "Wie sieht dein Zi-Wei-Chart aus?", scan: "Scannen und kostenlos berechnen: Sterne des Lebenspalasts und Konstellationen" },
  es: { tag: "Zi Wei Dou Shu", lead: "Mi carta Zi Wei", soul: "Palacio de la Vida", borrowed: "Sin estrella principal en el palacio de la Vida: se lee con las estrellas de enfrente", five: "Clase de los Cinco Elementos", geju: "Configuración", ask: "¿Cómo es tu carta Zi Wei?", scan: "Escanea y haz la tuya gratis: estrellas del palacio de la Vida y configuraciones" },
  pt: { tag: "Zi Wei Dou Shu", lead: "Meu mapa Zi Wei", soul: "Palácio da Vida", borrowed: "Sem estrela principal no palácio da Vida: lê-se pelas estrelas do lado oposto", five: "Classe dos Cinco Elementos", geju: "Configuração", ask: "Como é o seu mapa Zi Wei?", scan: "Escaneie e faça o seu grátis: estrelas do palácio da Vida e configurações" },
};

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const b = sp.get("b") ?? "";
  const stars = (sp.get("m") ?? "").split(",").filter(Boolean);
  const br = (sp.get("br") ?? "").split(",");
  const f = sp.get("f") ?? "";
  if (!(BRANCHES as readonly string[]).includes(b) || stars.length > 3 || !stars.every(isMajor) || !(FIVE_CLASSES as readonly string[]).includes(f)) return new Response("bad", { status: 400 });
  if (br.some((x) => x && !(BRIGHTS as readonly string[]).includes(x))) return new Response("bad", { status: 400 });
  const borrowed = sp.get("e") === "1";
  const g = gejuById(sp.get("g") ?? "");
  const st = STATUS[sp.get("s") ?? ""] ?? "成";
  // 10-30 进度表 128 ④: a card from a page in another language is drawn in that language (Latin pages: the stars in
  // pinyin, stacked; no 「爻流」 beside the wordmark outside Chinese)
  const lp = sp.get("l") ?? "";
  const foreign: Foreign | null = isLocale(lp) && isForeign(lp) ? lp : null;
  const l = foreign ?? (lp === "zh" ? "zh" : "zh-hant");
  const Z = foreign ? zwName(foreign) : null;
  const FU = foreign ? ziweiUi(foreign) : null;
  const latin = !!foreign && foreign !== "ja" && foreign !== "ko";
  const w = (s: string) => (foreign ? s : loc(s, l as "zh" | "zh-hant"));
  const T = foreign ? W_FOREIGN[foreign] : W;
  const gName = g ? (FU ? FU[`gjn_${g.id}`] ?? "" : w(g.name)) : "";
  const gLine = g ? (FU ? FU[`gjp_${g.id}`] ?? "" : w(UI[`gjp_${g.id}`] ?? "")) : "";
  const gStatus = g ? (FU ? FU[`gjSt_${st}`] ?? "" : w(UI[`gjSt_${st}`] ?? "")) : "";
  const starText = stars.map((s) => (Z ? Z.star(s) : w(s)));
  const brText = br.map((x) => (x ? (Z ? Z.brightWord(x) : w(x)) : ""));
  const soulB = Z ? Z.branch(b) : b;
  const fiveText = Z ? Z.five(f) : w(f);
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  const qr = await QRCode.toDataURL(`${site}/${l}/ziwei?c=ziwei-share`, { errorCorrectionLevel: "M", margin: 1, width: 300, color: { dark: "#14151c", light: "#f4f2ec" } });
  const text = (foreign ? "" : BRAND_HAN) + [...Object.values(T).map(w), soulB, ...starText, ...brText, fiveText, gName, gLine, gStatus].join("");
  const fonts: { name: string; data: ArrayBuffer | Buffer; weight: 400 | 600 }[] = [...ogFonts()];
  const family = foreign === "ja" ? "Noto Serif JP" : foreign === "ko" ? "Noto Serif KR" : l === "zh" ? "Noto Serif SC" : "Noto Serif TC";
  try { fonts.push({ name: "Body", data: await subsetFont(family, text), weight: 600 }); } catch { /* Latin face only */ }
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", background: PAPER, color: INK, padding: "110px 80px 96px", fontFamily: "Body" }}>
        <div style={{ display: "flex", width: "100%", justifyContent: "space-between", fontSize: 30, color: GOLD_TEXT }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>{foreign ? null : <div style={{ display: "flex", fontFamily: "Body" }}>{BRAND_HAN}</div>}<div style={{ display: "flex", letterSpacing: 14, fontFamily: "EB Garamond" }}>YAOFLOW</div></div>
          <div style={{ display: "flex", letterSpacing: latin ? 2 : 6 }}>{w(T.tag)}</div>
        </div>
        <div style={{ display: "flex", marginTop: 70, fontSize: 44, color: "rgba(20,21,28,0.62)", letterSpacing: latin ? 1 : 6 }}>{w(T.lead)}</div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 60, width: 820, border: `4px solid ${CINNABAR}`, padding: "48px 40px 56px", background: "rgba(255,255,255,0.35)" }}>
          <div style={{ display: "flex", fontSize: 32, color: "rgba(20,21,28,0.55)", letterSpacing: latin ? 1 : 4 }}>{`${w(T.soul)} · ${soulB}`}</div>
          <div style={{ display: "flex", flexDirection: latin ? "column" : "row", alignItems: "center", gap: latin ? 18 : 48, marginTop: 30 }}>
            {starText.map((s, i) => (
              <div key={s} style={{ display: "flex", alignItems: latin ? "baseline" : "flex-end", gap: latin ? 16 : 8 }}>
                <div style={{ display: "flex", fontSize: latin ? (stars.length > 1 ? 84 : 104) : stars.length > 1 ? 120 : 150, lineHeight: 1, fontWeight: 600 }}>{s}</div>
                {brText[i] && <div style={{ display: "flex", fontSize: latin ? 30 : 38, color: GOLD_TEXT, marginBottom: latin ? 0 : 10 }}>{brText[i]}</div>}
              </div>
            ))}
          </div>
          {borrowed && <div style={{ display: "flex", marginTop: 26, fontSize: 30, color: "rgba(20,21,28,0.55)", textAlign: "center" }}>{w(T.borrowed)}</div>}
          <div style={{ display: "flex", marginTop: 36, fontSize: 38 }}>{`${w(T.five)}${latin ? " · " : "　"}${fiveText}`}</div>
        </div>
        {g && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 64, width: 820, gap: 18 }}>
            <div style={{ display: "flex", fontSize: 28, color: "rgba(20,21,28,0.55)", letterSpacing: latin ? 1 : 4 }}>{w(T.geju)}</div>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: 22 }}>
              <div style={{ display: "flex", fontSize: latin ? 48 : 64, fontWeight: 600, textAlign: "center" }}>{gName}</div>
              <div style={{ display: "flex", fontSize: 26, color: st === "成" ? GOLD_TEXT : "rgba(20,21,28,0.55)", border: "2px solid rgba(20,21,28,0.2)", borderRadius: 30, padding: "4px 18px" }}>{gStatus}</div>
            </div>
            <div style={{ display: "flex", fontSize: 34, lineHeight: 1.5, color: "rgba(20,21,28,0.72)", textAlign: "center" }}>{gLine}</div>
          </div>
        )}
        <div style={{ display: "flex", width: "100%", marginTop: "auto", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 560 }}>
            <div style={{ display: "flex", fontSize: 44, color: CINNABAR, fontWeight: 600 }}>{w(T.ask)}</div>
            <div style={{ display: "flex", fontSize: 32, color: "rgba(20,21,28,0.62)", lineHeight: 1.4 }}>{w(T.scan)}</div>
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
