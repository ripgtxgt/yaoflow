import { ImageResponse } from "next/og";
import { asLocale } from "@/lib/locales";
import { OG_COPY } from "@/lib/og-copy";
import { CJK_FAMILY, GOLD_TEXT, INK, OG_SIZE, PAPER, ogFontsFor, ogScriptFor } from "@/lib/og";
import { brandHanFont, BrandMark } from "@/lib/carousel";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "YaoFlow — one question, one cast";

/** Default link card. Deliberately NO hexagram: a specific figure on the
    generic card reads as a wrong answer to whoever shared their own cast.
    Instead: six empty positions with the first line waiting — the ruler
    before a cast, which is exactly what the site is an invitation to. */
export default async function OgImage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const l = asLocale(locale);
  const bf = await brandHanFont(l); // 10-22 进度表 91: 「爻流」 on the Chinese cards
  const cjk = ogScriptFor(l) !== "latin";
  const cjkFont = cjk ? { fontFamily: CJK_FAMILY } : {};
  const COPY = OG_COPY[l];
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: PAPER,
          color: INK,
          fontFamily: "EB Garamond",
          padding: 72,
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            border: `2px solid rgba(20,21,28,0.18)`,
            borderRadius: 4,
            padding: 56,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 28, maxWidth: 600 }}>
            <BrandMark han={!!bf} style={{ fontSize: 26, letterSpacing: 10, color: GOLD_TEXT }} />
            <div style={{ display: "flex", fontSize: COPY.one.length > 14 ? 50 : 62, fontWeight: 600, lineHeight: 1.12, ...cjkFont }}>
              {COPY.one}
            </div>
            <div style={{ display: "flex", fontSize: 26, color: "rgba(20,21,28,0.5)", ...cjkFont }}>
              {COPY.tagline}
            </div>
          </div>
          {/* the empty ruler: five dashed slots, the first line glowing gold */}
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {[5, 4, 3, 2, 1, 0].map((i) => (
              <div
                key={i}
                style={{
                  width: 330,
                  height: 26,
                  borderRadius: 3,
                  border: i === 0 ? `3px solid ${GOLD_TEXT}` : "3px dashed rgba(20,21,28,0.28)",
                  background: "transparent",
                  display: "flex",
                }}
              />
            ))}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: [...ogFontsFor(l), ...(bf ? [bf] : [])] },
  );
}
