import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import { SixtyCycle } from "tyme4ts";
import { subsetFont } from "@/lib/carousel";
import { trad } from "@/lib/mingli/bazi/chart";
import { insightOf } from "@/lib/mingli/bazi/insight";
import { CINNABAR, GOLD_TEXT, INK, PAPER, ogFonts } from "@/lib/og";
import { BRAND_HAN } from "@/lib/brand"; // 10-22 进度表 81: 「爻流」 beside the wordmark on the Chinese cards
import { isForeign, type Foreign } from "@/lib/l10n/core";
import { isLocale } from "@/lib/locales";
import { bzName } from "@/lib/mingli/bazi/names";
import { baziUi } from "@/lib/mingli/bazi/page-ui";

export const runtime = "nodejs";

/**
 * 10-18 (Neil: 加一張能分享的命盤卡) — the four pillars as a 1080×1920 story card: 年 月 日 時 in their element colours,
 * 日主, 格局, 五行能量, and a QR to the free chart (c=bazi-share). Only the eight characters travel — never a name, a
 * birth date or a place. GET ?p=己巳,癸酉,己丑,庚午&g=m|f&l=zh-hant|zh
 */
const EL_COLOR: Record<string, string> = { 木: "#4f7d43", 火: "#b5452f", 土: "#9a7240", 金: "#a3832b", 水: "#3a6ea5" };
const W = {
  "zh-hant": { tag: "八字", lead: "我的八字", labels: ["年柱", "月柱", "日柱", "時柱"], dm: "日主", energy: "五行能量", ask: "你的八字長什麼樣？", scan: "掃碼免費排盤，看格局與五行" },
  zh: { tag: "八字", lead: "我的八字", labels: ["年柱", "月柱", "日柱", "时柱"], dm: "日主", energy: "五行能量", ask: "你的八字长什么样？", scan: "扫码免费排盘，看格局与五行" },
};
/** 10-30 进度表 128 ④: the card's own lines in the other languages (the pillar labels, names and elements from names.ts and the chart page's words) */
const W_FOREIGN: Record<Foreign, { tag: string; lead: string; energy: string; ask: string; scan: string }> = {
  en: { tag: "BaZi", lead: "My BaZi chart", energy: "Five elements", ask: "What does your BaZi chart look like?", scan: "Scan to draw yours free: structure and five elements" },
  ja: { tag: "四柱推命", lead: "わたしの命式", energy: "五行のバランス", ask: "あなたの命式は？", scan: "読み取って無料で作成、格局と五行のバランス" },
  ko: { tag: "사주", lead: "나의 사주", energy: "오행 비율", ask: "당신의 사주는 어떤 모습일까요?", scan: "스캔해서 무료로 사주를 세우고 격국과 오행을 보세요" },
  fr: { tag: "BaZi", lead: "Mon thème BaZi", energy: "Cinq éléments", ask: "À quoi ressemble votre BaZi ?", scan: "Scannez pour dresser le vôtre gratuitement : structure et cinq éléments" },
  de: { tag: "BaZi", lead: "Mein BaZi", energy: "Fünf Elemente", ask: "Wie sieht dein BaZi aus?", scan: "Scannen und kostenlos berechnen: Struktur und fünf Elemente" },
  es: { tag: "BaZi", lead: "Mi carta BaZi", energy: "Cinco elementos", ask: "¿Cómo es tu carta BaZi?", scan: "Escanea y haz la tuya gratis: estructura y cinco elementos" },
  pt: { tag: "BaZi", lead: "Meu mapa BaZi", energy: "Cinco elementos", ask: "Como é o seu mapa BaZi?", scan: "Escaneie e faça o seu grátis: estrutura e cinco elementos" },
};

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const pillars = (sp.get("p") ?? "").split(",").filter(Boolean);
  if (pillars.length < 3 || pillars.length > 4) return new Response("bad", { status: 400 });
  try { for (const p of pillars) if (SixtyCycle.fromName(p).getName() !== p) throw new Error(); } catch { return new Response("bad", { status: 400 }); }
  const gender = sp.get("g") === "f" ? "female" : "male";
  const lp = sp.get("l") ?? "";
  // 10-30 进度表 128 ④: a card from a page in another language is drawn in that language — the eight characters stay
  // (they are the chart), each pillar with its reading under it; no 「爻流」 beside the wordmark outside Chinese
  const foreign: Foreign | null = isLocale(lp) && isForeign(lp) ? lp : null;
  const l = foreign ?? (lp === "zh" ? "zh" : "zh-hant");
  const hans = l === "zh";
  const F = foreign ? bzName(foreign) : null;
  const fu = foreign ? baziUi(foreign) : null;
  const w = foreign && F && fu ? { ...W_FOREIGN[foreign], labels: [fu.p_year!, fu.p_month!, fu.p_day!, fu.p_hour!], dm: F.N.dayMaster } : W[l as "zh" | "zh-hant"];
  const ins = insightOf(pillars, gender);
  const stems = pillars.map((p) => SixtyCycle.fromName(p).getHeavenStem()), branches = pillars.map((p) => SixtyCycle.fromName(p).getEarthBranch());
  const dm = stems[2]!;
  const geju = ins.geju ? (F ? F.geju(ins.geju.name) : trad(ins.geju.name, hans)) : "";
  const dmLine = F ? `${w.dm} ${F.dm(dm.getName())}${geju ? ` · ${geju}` : ""}` : `${w.dm} ${dm.getName()}${dm.getElement().getName()}${geju ? `　·　${geju}` : ""}`;
  const elName = (e: string) => (F ? F.elOf(e) : e);
  const EL = ["木", "火", "土", "金", "水"];
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  const qr = await QRCode.toDataURL(`${site}/${l}/bazi?c=bazi-share`, { errorCorrectionLevel: "M", margin: 1, width: 300, color: { dark: "#14151c", light: "#f4f2ec" } });
  const text = (foreign ? "" : BRAND_HAN) + [w.tag, w.lead, ...w.labels, w.dm, w.energy, w.ask, w.scan, pillars.join(""), dmLine, ...EL, ...EL.map(elName), ...(F ? pillars.map((p) => F.gz(p)) : []), "0123456789%"].join("");
  const fonts: { name: string; data: ArrayBuffer | Buffer; weight: 400 | 600 }[] = [...ogFonts()];
  const family = foreign === "ja" ? "Noto Serif JP" : foreign === "ko" ? "Noto Serif KR" : hans ? "Noto Serif SC" : "Noto Serif TC";
  try { fonts.push({ name: "Body", data: await subsetFont(family, text), weight: 600 }); } catch { /* Latin face only */ }
  const max = Math.max(...EL.map((e) => ins.energy[e as keyof typeof ins.energy]), 0.1);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", background: PAPER, color: INK, padding: "110px 80px 96px", fontFamily: "Body" }}>
        <div style={{ display: "flex", width: "100%", justifyContent: "space-between", fontSize: 30, color: GOLD_TEXT }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>{foreign ? null : <div style={{ display: "flex", fontFamily: "Body" }}>{BRAND_HAN}</div>}<div style={{ display: "flex", letterSpacing: 14, fontFamily: "EB Garamond" }}>YAOFLOW</div></div>
          <div style={{ display: "flex", letterSpacing: foreign ? 2 : 6 }}>{w.tag}</div>
        </div>
        <div style={{ display: "flex", marginTop: 70, fontSize: 44, color: "rgba(20,21,28,0.62)", letterSpacing: foreign ? 1 : 6 }}>{w.lead}</div>
        <div style={{ display: "flex", marginTop: 60, gap: 34, border: `4px solid ${CINNABAR}`, padding: "50px 56px", background: "rgba(255,255,255,0.35)" }}>
          {pillars.map((_, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
              <div style={{ display: "flex", fontSize: foreign ? 24 : 28, color: "rgba(20,21,28,0.5)" }}>{w.labels[i]}</div>
              <div style={{ display: "flex", fontSize: 120, lineHeight: 1, color: EL_COLOR[stems[i]!.getElement().getName()] }}>{stems[i]!.getName()}</div>
              <div style={{ display: "flex", fontSize: 120, lineHeight: 1, color: EL_COLOR[branches[i]!.getElement().getName()] }}>{branches[i]!.getName()}</div>
              {F && foreign !== "ja" ? <div style={{ display: "flex", fontSize: 28, color: "rgba(20,21,28,0.62)" }}>{F.gz(pillars[i]!)}</div> : null}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", marginTop: 56, fontSize: foreign && dmLine.length > 34 ? 38 : 46, fontWeight: 600, textAlign: "center", maxWidth: 900 }}>{dmLine}</div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 50, width: 760, gap: 16 }}>
          <div style={{ display: "flex", fontSize: 28, color: "rgba(20,21,28,0.55)" }}>{w.energy}</div>
          {EL.map((e) => {
            const v = ins.energy[e as keyof typeof ins.energy];
            return (
              <div key={e} style={{ display: "flex", alignItems: "center", gap: 20 }}>
                <div style={{ display: "flex", width: F && foreign !== "ja" && foreign !== "ko" ? 170 : 44, fontSize: F ? 30 : 34, color: EL_COLOR[e] }}>{elName(e)}</div>
                <div style={{ display: "flex", flex: 1, height: 18, background: "rgba(20,21,28,0.07)", borderRadius: 4 }}>
                  <div style={{ display: "flex", width: `${(v / max) * 100}%`, height: 18, background: EL_COLOR[e], borderRadius: 4 }} />
                </div>
                <div style={{ display: "flex", width: 110, justifyContent: "flex-end", fontSize: 28, color: "rgba(20,21,28,0.6)" }}>{`${Math.round((v / ins.total) * 100)}%`}</div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", width: "100%", marginTop: "auto", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 560 }}>
            <div style={{ display: "flex", fontSize: 44, color: CINNABAR, fontWeight: 600 }}>{w.ask}</div>
            <div style={{ display: "flex", fontSize: 32, color: "rgba(20,21,28,0.62)", lineHeight: 1.4 }}>{w.scan}</div>
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
