import { ImageResponse } from "next/og";
import { hexagramByNumber, type LineValue } from "@yaoflow/engine";
import { asLocale } from "@/lib/locales";
import { proofData } from "@/lib/db";
import { parseProofRef, verifyProofToken } from "@/lib/outcome-token";
import { hexName } from "@/lib/names";
import { CINNABAR, CJK_FAMILY, GOLD_TEXT, INK, OG_SIZE, PAPER, YaoFigure, ogFontsFor, ogScriptFor } from "@/lib/og";
import { brandHanFont, BrandMark } from "@/lib/carousel";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "YaoFlow — a cast that came true";

/**
 * The proof card as a link preview. Labels stay in Latin script (the CJK
 * fonts here are hexagram-name subsets); the hexagram name itself is drawn
 * in the reader's language.
 */
export default async function OgImage({ params }: { params: Promise<{ locale: string; ref: string }> }) {
  const { locale, ref } = await params;
  const l = asLocale(locale);
  const bf = await brandHanFont(l); // 10-22 进度表 91: 「爻流」 on the Chinese cards
  const cjk = ogScriptFor(l) !== "latin";
  const cjkFont = cjk ? { fontFamily: CJK_FAMILY } : {};
  const p = parseProofRef(ref);
  const d = p && verifyProofToken(p.id, p.token) ? proofData(p.id) : null;
  const values = d ? (d.values_str.split(",").map(Number) as LineValue[]) : [7, 8, 8, 7, 7, 8];
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: PAPER, color: INK, fontFamily: "EB Garamond", padding: 72 }}>
        <div style={{ flex: 1, display: "flex", border: "2px solid rgba(20,21,28,0.18)", borderRadius: 4, padding: 56, alignItems: "center", justifyContent: "space-between", position: "relative" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 600 }}>
            <BrandMark han={!!bf} style={{ fontSize: 26, letterSpacing: 10, color: GOLD_TEXT }} />
            {d ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "flex", fontSize: cjk ? 68 : 60, fontWeight: 600, lineHeight: 1.12, ...cjkFont }}>{hexName(hexagramByNumber(d.primary_num), l)}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 24, color: "rgba(20,21,28,0.6)" }}>
                  <div style={{ display: "flex" }}>{`cast ${iso(d.cast_at)}`}</div>
                  <div style={{ display: "flex" }}>{`window ${d.window_days} days`}</div>
                  <div style={{ display: "flex", color: CINNABAR }}>{`came true ${iso(d.outcome_at)}`}</div>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", fontSize: 56, fontWeight: 600, alignItems: "baseline" }}>{bf && <div style={{ display: "flex", fontFamily: "BrandHan", marginRight: 16 }}>爻流</div>}<div style={{ display: "flex" }}>YaoFlow</div></div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 28 }}>
            <YaoFigure values={values} width={300} />
            <div style={{ display: "flex", border: `4px solid ${CINNABAR}`, color: CINNABAR, borderRadius: 6, padding: "6px 18px", fontSize: 26, letterSpacing: 8, transform: "rotate(-8deg)" }}>VERIFIED</div>
          </div>
          <div style={{ position: "absolute", right: 40, bottom: 28, display: "flex", fontSize: 20, letterSpacing: 2, color: "rgba(20,21,28,0.45)" }}>yaoflow.com</div>
        </div>
      </div>
    ),
    { ...size, fonts: [...ogFontsFor(l), ...(bf ? [bf] : [])] },
  );
}
