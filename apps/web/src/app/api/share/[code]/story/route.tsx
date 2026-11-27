import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { resolveCast } from "@yaoflow/engine";
import { asLocale } from "@/lib/locales";
import { decodeCast } from "@/lib/share";
import { hexName } from "@/lib/names";
import { sst } from "@/lib/dict/share-story";
import { CINNABAR, GOLD_TEXT, INK, PAPER, YaoFigure, ogFonts } from "@/lib/og";
import { BODY_FAMILY, subsetFont, BRAND_HAN_TEXT, BrandMark } from "@/lib/carousel";
import { cardLine } from "@/lib/share-card";

export const runtime = "nodejs";

/**
 * 09-29 裂变 Q1 (裂变复盘与放宽方案-0929): the share card as a 1080×1920 story
 * image. A link in an IG / Threads story cannot be tapped and LINE shows only
 * a picture, so the way in is a QR code — and the picture says the thing the
 * old card never did: the first full reading is free from here. The figure,
 * the sharer's one optional line (?q=, the same line the share link carries),
 * never the question. GET /api/share/<code>/story?l=zh-hant&q=…
 */
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const u = new URL(req.url);
  const l = asLocale(u.searchParams.get("l"));
  const values = decodeCast(code);
  if (!values) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const cast = resolveCast(values);
  const rawQ = (u.searchParams.get("q") ?? "").replace(/\s+/g, " ").trim();
  const quote = rawQ ? (rawQ.length > 70 ? `${rawQ.slice(0, 68)}…` : rawQ) : "";
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  const r = u.searchParams.get("r");
  // 10-13 进度表 41 ①: the picture's way in is tagged gua-share like every shared gua link
  const link = `${site}/${l}?via=${code}&c=gua-share${r && /^[a-z2-9]{8}$/.test(r) ? `&r=${r}` : ""}`;
  // 10-13 进度表 41 ②: the window the reading named (「10 月 14–18 日」) — never the question
  const win = cardLine(u.searchParams.get("w"), 36);
  const qr = await QRCode.toDataURL(link, { errorCorrectionLevel: "M", margin: 1, width: 300, color: { dark: "#14151c", light: "#f4f2ec" } });
  const primary = hexName(cast.primary, l);
  const changed = cast.changed ? hexName(cast.changed, l) : null;
  const refOk = !!r && /^[a-z2-9]{8}$/.test(r);
  // 10-14 进度表 47: a card carrying the sharer's ref says what the first cast earns both of them
  const words = { lead: sst(l, "lead"), scan: sst(l, "scan"), free: sst(l, "free"), when: sst(l, "when"), both: refOk ? sst(l, "both") : "" };
  const fonts: { name: string; data: ArrayBuffer | Buffer; weight: 400 | 600 }[] = [...ogFonts()];
  const fam = BODY_FAMILY[l];
  try {
    if (fam) fonts.push({ name: "Body", data: await subsetFont(fam, [BRAND_HAN_TEXT, primary, changed ?? "", quote, win, ...Object.values(words), "“”→ ·–0123456789"].join("")), weight: 600 });
    else fonts.push(...ogFonts().map((f) => ({ ...f, name: "Body" })));
  } catch {
    return NextResponse.json({ error: "font_unavailable" }, { status: 503 });
  }
  const img = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: PAPER, color: INK, fontFamily: "Body", padding: "120px 88px 100px" }}>
        {/* 10-22 进度表 91: 「爻流」 beside the wordmark on the Chinese cards */}
        <BrandMark han={!!fam && (l === "zh" || l === "zh-hant")} family="Body" style={{ fontSize: 30, letterSpacing: 14, color: GOLD_TEXT, fontFamily: "EB Garamond" }} />
        <div style={{ display: "flex", marginTop: 36, fontSize: 44, color: "rgba(20,21,28,0.66)" }}>{words.lead}</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 56, marginTop: 96 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <YaoFigure values={values} width={300} />
            <div style={{ display: "flex", fontSize: 58, fontWeight: 600 }}>{primary}</div>
          </div>
          {changed ? (
            <>
              <div style={{ display: "flex", fontSize: 54, color: "rgba(20,21,28,0.35)", alignSelf: "center", marginBottom: 120 }}>→</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 28, opacity: 0.55 }}>
                <YaoFigure values={values.map((v) => (v === 6 ? 7 : v === 9 ? 8 : v))} width={300} />
                <div style={{ display: "flex", fontSize: 58, fontWeight: 600 }}>{changed}</div>
              </div>
            </>
          ) : null}
        </div>
        {quote ? (
          <div style={{ display: "flex", marginTop: 88, borderLeft: `6px solid ${GOLD_TEXT}`, paddingLeft: 28, fontSize: 40, lineHeight: 1.5, color: "rgba(20,21,28,0.86)" }}>{`“${quote}”`}</div>
        ) : null}
        {win ? (
          <div style={{ display: "flex", alignItems: "center", gap: 28, marginTop: quote ? 56 : 96 }}>
            <div style={{ display: "flex", border: `4px solid ${CINNABAR}`, color: CINNABAR, borderRadius: 6, padding: "8px 18px", fontSize: 34, fontWeight: 600, letterSpacing: 8 }}>{words.when}</div>
            <div style={{ display: "flex", fontSize: 56, fontWeight: 600, color: INK, letterSpacing: 2 }}>{win}</div>
          </div>
        ) : null}
        <div style={{ display: "flex", marginTop: "auto", alignItems: "flex-end", justifyContent: "space-between", gap: 40 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 560 }}>
            <div style={{ display: "flex", fontSize: 42, color: CINNABAR, fontWeight: 600, lineHeight: 1.35 }}>{words.free}</div>
            <div style={{ display: "flex", fontSize: 34, color: "rgba(20,21,28,0.6)", lineHeight: 1.35 }}>{words.scan}</div>
            {words.both ? <div style={{ display: "flex", fontSize: 30, color: GOLD_TEXT, lineHeight: 1.35 }}>{words.both}</div> : null}
            <div style={{ display: "flex", fontSize: 36, letterSpacing: 3, fontFamily: "EB Garamond", marginTop: 8 }}>yaoflow.com</div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} width={300} height={300} alt="" style={{ borderRadius: 6 }} />
        </div>
      </div>
    ),
    { width: 1080, height: 1920, fonts },
  );
  img.headers.set("Cache-Control", "public, max-age=86400");
  img.headers.set("Content-Disposition", `inline; filename="yaoflow-${code}.png"`);
  return img;
}
