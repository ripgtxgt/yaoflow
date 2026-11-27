import { ImageResponse } from "next/og";
import { hexagramByNumber, type LineValue } from "@yaoflow/engine";
import { asLocale } from "@/lib/locales";
import { sealData } from "@/lib/db";
import { parseSealRef, verifySealToken } from "@/lib/outcome-token";
import { hexName } from "@/lib/names";
import { sealState } from "@/lib/seal";
import { CINNABAR, CJK_FAMILY, GOLD_TEXT, INK, OG_SIZE, PAPER, YaoFigure, ogFontsFor, ogScriptFor } from "@/lib/og";
import { brandHanFont, BrandMark } from "@/lib/carousel";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "YaoFlow — a call put on the record";

/**
 * 封卦 as a link preview. Latin labels (the CJK fonts here are hexagram-name
 * subsets); the figure and the name carry the meaning, and the state decides
 * whether there is a stamp on it.
 */
export default async function OgImage({ params }: { params: Promise<{ locale: string; ref: string }> }) {
  const { locale, ref } = await params;
  const l = asLocale(locale);
  const bf = await brandHanFont(l); // 10-22 进度表 91: 「爻流」 on the Chinese cards
  const cjk = ogScriptFor(l) !== "latin";
  const cjkFont = cjk ? { fontFamily: CJK_FAMILY } : {};
  const p = parseSealRef(ref);
  const d = p && verifySealToken(p.id, p.token) ? sealData(p.id) : null;
  const values = d ? (d.values_str.split(",").map(Number) as LineValue[]) : [7, 8, 8, 7, 7, 8];
  const state = d ? sealState(d) : "open";
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const stamp = state === "hit" ? { label: "VERIFIED", color: CINNABAR } : state === "miss" ? { label: "MISSED", color: "rgba(20,21,28,0.45)" } : null;

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
                  <div style={{ display: "flex", color: state === "open" ? GOLD_TEXT : "rgba(20,21,28,0.6)" }}>
                    {state === "hit" || state === "miss"
                      ? `settled ${iso(d.outcome_at ?? d.due_at)}`
                      : `settles ${iso(d.due_at)}`}
                  </div>
                  <div style={{ display: "flex", fontSize: 22 }}>said before the fact</div>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", fontSize: 56, fontWeight: 600, alignItems: "baseline" }}>{bf && <div style={{ display: "flex", fontFamily: "BrandHan", marginRight: 16 }}>爻流</div>}<div style={{ display: "flex" }}>YaoFlow</div></div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 28 }}>
            <YaoFigure values={values} width={300} />
            {stamp && (
              <div style={{ display: "flex", border: `4px solid ${stamp.color}`, color: stamp.color, borderRadius: 6, padding: "6px 18px", fontSize: 26, letterSpacing: 8, transform: "rotate(-8deg)" }}>
                {stamp.label}
              </div>
            )}
          </div>
          <div style={{ position: "absolute", right: 40, bottom: 28, display: "flex", fontSize: 20, letterSpacing: 2, color: "rgba(20,21,28,0.45)" }}>yaoflow.com</div>
        </div>
      </div>
    ),
    { ...size, fonts: [...ogFontsFor(l), ...(bf ? [bf] : [])] },
  );
}
