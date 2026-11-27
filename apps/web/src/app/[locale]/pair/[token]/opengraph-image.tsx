import { ImageResponse } from "next/og";
import { resolveCast, type LineValue } from "@yaoflow/engine";
import { asLocale } from "@/lib/locales";
import { pairByToken, storedReadingForSession } from "@/lib/db";
import { TOKEN_RE } from "@/lib/grants";
import { hexName } from "@/lib/names";
import { CJK_FAMILY, GOLD_TEXT, INK, OG_SIZE, PAPER, YaoFigure, ogFontsFor, ogScriptFor } from "@/lib/og";
import { brandHanFont, BrandMark } from "@/lib/carousel";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "YaoFlow — one matter, two casts";

/** Two figures side by side; never the framing, never a word of either reading. */
export default async function OgImage({ params }: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await params;
  const l = asLocale(locale);
  const bf = await brandHanFont(l); // 10-22 进度表 91: 「爻流」 on the Chinese cards
  const cjk = ogScriptFor(l) !== "latin";
  const cjkFont = cjk ? { fontFamily: CJK_FAMILY } : {};
  const p = TOKEN_RE.test(token) ? pairByToken(token) : null;
  const vals = (sid: string | null) => {
    if (!sid) return null;
    const s = storedReadingForSession(sid);
    return s ? (s.values as LineValue[]) : null;
  };
  const a = p && !p.dissolved_at ? vals(p.a_session_id) : null;
  const b = p && !p.dissolved_at ? vals(p.b_session_id) : null;
  const name = (v: LineValue[] | null) => (v ? hexName(resolveCast(v).primary, l) : "");

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: PAPER, color: INK, fontFamily: "EB Garamond", padding: 72 }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", border: "2px solid rgba(20,21,28,0.18)", borderRadius: 4, padding: 48, position: "relative" }}>
          <BrandMark han={!!bf} style={{ fontSize: 26, letterSpacing: 10, color: GOLD_TEXT }} />
          <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "space-around" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
              <YaoFigure values={a ?? [7, 8, 8, 7, 7, 8]} width={230} />
              <div style={{ display: "flex", fontSize: 30, ...cjkFont }}>{name(a)}</div>
            </div>
            <div style={{ display: "flex", fontSize: 40, color: "rgba(20,21,28,0.35)" }}>·</div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, opacity: b ? 1 : 0.35 }}>
              <YaoFigure values={b ?? [8, 7, 7, 8, 8, 7]} width={230} />
              <div style={{ display: "flex", fontSize: 30, ...cjkFont }}>{b ? name(b) : "?"}</div>
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 24, color: "rgba(20,21,28,0.55)", letterSpacing: 1 }}>One matter, two casts.</div>
          <div style={{ position: "absolute", right: 40, bottom: 28, display: "flex", fontSize: 20, letterSpacing: 2, color: "rgba(20,21,28,0.45)" }}>yaoflow.com</div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: [...ogFontsFor(l), ...(bf ? [bf] : [])] },
  );
}
