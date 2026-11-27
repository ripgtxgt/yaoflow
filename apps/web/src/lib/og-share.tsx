import { ImageResponse } from "next/og";
import { resolveCast, type LineValue } from "@yaoflow/engine";
import { asLocale } from "./locales";
import type { Locale } from "./locales";
import { hexName } from "./names";
import { OG_COPY } from "./og-copy";
import { BrandMark, brandHanFont } from "./carousel";
import { CINNABAR, CJK_FAMILY, GOLD_TEXT, INK, OG_SIZE, PAPER, YaoFigure, ogFontsFor, ogScriptFor } from "./og";

/**
 * The link-preview card for a shared cast: the actual figure, drawn. It
 * carries only what the share page carries — the hexagram, never the
 * question — plus, when the sharer chose to attach one, their one-line
 * verdict. The CJK fonts here are subsets that cover hexagram names and the
 * card copy, not free text, so a quote is drawn only for Latin-script
 * languages; CJK readers see it on the page itself.
 */
export async function shareOgImage(locale: string, values: LineValue[] | null, quote: string | null): Promise<ImageResponse> {
  const l: Locale = asLocale(locale);
  const bf = await brandHanFont(l); // 10-22 进度表 91: 「爻流」 on the Chinese cards
  const cjk = ogScriptFor(l) !== "latin";
  const cjkFont = cjk ? { fontFamily: CJK_FAMILY } : {};
  const COPY = OG_COPY[l];
  const cast = values ? resolveCast(values) : null;
  const drawQuote = quote && !cjk ? quote.slice(0, 110) : null;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: PAPER, color: INK, fontFamily: "EB Garamond", padding: 72 }}>
        <div style={{ flex: 1, display: "flex", border: "2px solid rgba(20,21,28,0.18)", borderRadius: 4, padding: 56, alignItems: "center", justifyContent: "space-between", position: "relative" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 26, maxWidth: 560 }}>
            <BrandMark han={!!bf} style={{ fontSize: 26, letterSpacing: 10, color: GOLD_TEXT }} />
            {cast ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div style={{ display: "flex", fontSize: cjk ? 72 : 62, fontWeight: 600, lineHeight: 1.12, ...cjkFont }}>{hexName(cast.primary, l)}</div>
                <div style={{ display: "flex", fontSize: 28, color: "rgba(20,21,28,0.6)", ...cjkFont }}>
                  {cast.changed ? `${cast.primary.pinyin}  ›  ${hexName(cast.changed, l)}` : cast.primary.pinyin}
                </div>
                {cast.changed && (
                  <div style={{ display: "flex", fontSize: 23, color: CINNABAR, ...cjkFont }}>{COPY.moving(cast.changingPositions.length)}</div>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", fontSize: 56, fontWeight: 600, ...cjkFont }}>{COPY.one}</div>
            )}
            {drawQuote ? (
              <div style={{ display: "flex", borderLeft: `4px solid ${GOLD_TEXT}`, paddingLeft: 18, fontSize: 26, lineHeight: 1.35, color: "rgba(20,21,28,0.8)", fontStyle: "italic" }}>
                {drawQuote}
              </div>
            ) : (
              <div style={{ display: "flex", fontSize: 24, color: "rgba(20,21,28,0.45)", ...cjkFont }}>{COPY.tagline}</div>
            )}
          </div>
          <YaoFigure values={values ?? [7, 8, 8, 7, 7, 8]} width={330} />
          {/* the brand corner: a screenshot of this card still says where it came from */}
          <div style={{ position: "absolute", right: 40, bottom: 28, display: "flex", fontSize: 20, letterSpacing: 2, color: "rgba(20,21,28,0.45)" }}>yaoflow.com</div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: [...ogFontsFor(l), ...(bf ? [bf] : [])] },
  );
}
