import { ImageResponse } from "next/og";
import { TRIGRAMS } from "@yaoflow/engine";
import { guaBySlug } from "@/lib/gua";
import { asLocale } from "@/lib/locales";
import { hexName, hexSubName } from "@/lib/names";
import { CJK_FAMILY, GOLD_TEXT, INK, OG_SIZE, PAPER, YaoFigure, ogFontsFor, ogScriptFor } from "@/lib/og";
import { brandHanFont } from "@/lib/carousel";

/**
 * OG card for a hexagram reference page: the drawn figure + the name.
 * CJK cards set the name in an embedded Noto Serif subset for their script
 * (zh/zh-hant → SC, ja → JP, ko → KR); Latin cards stay Garamond-only.
 */

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "YaoFlow hexagram";

export default async function OgImage(
  { params }: { params: Promise<{ locale: string; slug: string }> },
) {
  const { locale, slug } = await params;
  const l = asLocale(locale);
  const bf = await brandHanFont(l); // 10-22 进度表 91: 「爻流」 on the Chinese cards
  const cjk = ogScriptFor(l) !== "latin"; // zh, zh-hant, ja, ko
  const d = guaBySlug(slug, l);
  // values for a static figure: 7 = yang, 8 = yin (nothing moving)
  const values = d
    ? [...TRIGRAMS[d.hex.lower].lines, ...TRIGRAMS[d.hex.upper].lines].map((b) => (b === 1 ? 7 : 8))
    : [7, 8, 7, 8, 7, 8];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: PAPER,
          color: INK,
          padding: 72,
          fontFamily: "EB Garamond",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 96, width: "100%" }}>
          <YaoFigure values={values} width={300} />
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ fontSize: 30, letterSpacing: 6, color: GOLD_TEXT, display: "flex" }}>
              {d ? `HEXAGRAM ${d.hex.number}` : "THE 64 HEXAGRAMS"}
            </div>
            {cjk && d ? (
              <div style={{ fontSize: 96, fontWeight: 600, lineHeight: 1.1, marginTop: 18, display: "flex", fontFamily: CJK_FAMILY }}>
                {hexName(d.hex, l)}
              </div>
            ) : (
              <div style={{ fontSize: 84, fontWeight: 600, lineHeight: 1.1, marginTop: 18, display: "flex" }}>
                {d ? d.hex.en : "YaoFlow"}
              </div>
            )}
            <div style={{ fontSize: 40, marginTop: 14, opacity: 0.65, display: "flex", ...(cjk ? { fontFamily: CJK_FAMILY } : {}) }}>
              {d ? (cjk ? `${d.hex.pinyin} · ${hexSubName(d.hex, l)}` : d.hex.pinyin) : ""}
            </div>
            <div style={{ display: "flex", marginTop: 54, fontSize: 26, letterSpacing: 4, opacity: 0.5, alignItems: "baseline" }}>
              {bf && <div style={{ display: "flex", fontFamily: "BrandHan", letterSpacing: 2, marginRight: 12 }}>爻流</div>}
              <div style={{ display: "flex" }}>YAOFLOW · yaoflow.com</div>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: [...ogFontsFor(l), ...(bf ? [bf] : [])] },
  );
}
