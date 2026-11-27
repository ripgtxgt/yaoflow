import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import { subsetFont } from "@/lib/carousel";
import { CINNABAR, GOLD_TEXT, INK, PAPER, ogFonts } from "@/lib/og";
import { BRAND_HAN } from "@/lib/brand";
import { hexByKw, RESULT_COPY } from "@/lib/bmg";

export const runtime = "nodejs";

/**
 * 11-05 进度表 136 本命卦分享卡 (01-题库与六维文案.md 第六节): the figure, the full name, the title and the one line, and
 * 「我的本命卦 · yaoflow.com」 at the foot, with a QR to the quiz (c=bmg-share). 1080×1920. The URL carries only the
 * hexagram's number — never who took the quiz. GET ?k=<1-64>
 */
export async function GET(req: Request) {
  const k = Number(new URL(req.url).searchParams.get("k"));
  const h = Number.isInteger(k) ? hexByKw(k) : null;
  if (!h) return new Response("bad", { status: 400 });
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  const qr = await QRCode.toDataURL(`${site}/zh-hant/bmg?c=bmg-share`, { errorCorrectionLevel: "M", margin: 1, width: 300, color: { dark: INK, light: PAPER } });
  const ask = "你的本命卦是哪一卦？";
  const scan = "掃碼做 12 題，約 2 分鐘";
  const text = BRAND_HAN + [h.name, h.title, h.oneLine, RESULT_COPY.shareFoot, ask, scan, "本命卦"].join("");
  const fonts: { name: string; data: ArrayBuffer | Buffer; weight: 400 | 600 }[] = [...ogFonts()];
  try { fonts.push({ name: "Body", data: await subsetFont("Noto Serif TC", text), weight: 600 }); } catch { /* Latin face only */ }
  const W = 420, H = 46, GAP = 34, NOTCH = 70;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", background: PAPER, color: INK, padding: "100px 80px 96px", fontFamily: "Body" }}>
        <div style={{ display: "flex", width: "100%", justifyContent: "space-between", fontSize: 30, color: GOLD_TEXT }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}><div style={{ display: "flex" }}>{BRAND_HAN}</div><div style={{ display: "flex", letterSpacing: 14, fontFamily: "EB Garamond" }}>YAOFLOW</div></div>
          <div style={{ display: "flex", letterSpacing: 6 }}>本命卦</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column-reverse", gap: GAP, marginTop: 120 }}>
          {h.lines.map((y, i) => y ? (
            <div key={i} style={{ display: "flex", width: W, height: H, background: INK, borderRadius: 3 }} />
          ) : (
            <div key={i} style={{ display: "flex", width: W, height: H, justifyContent: "space-between" }}>
              <div style={{ display: "flex", width: (W - NOTCH) / 2, height: H, background: INK, borderRadius: 3 }} />
              <div style={{ display: "flex", width: (W - NOTCH) / 2, height: H, background: INK, borderRadius: 3 }} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", marginTop: 96, fontSize: 92, letterSpacing: 10 }}>{h.name}</div>
        <div style={{ display: "flex", marginTop: 26, fontSize: 48, color: CINNABAR, letterSpacing: 6 }}>{h.title}</div>
        <div style={{ display: "flex", marginTop: 34, fontSize: 38, lineHeight: 1.5, color: "rgba(20,21,28,0.78)", textAlign: "center", maxWidth: 840 }}>{h.oneLine}</div>
        <div style={{ display: "flex", width: "100%", marginTop: "auto", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", fontSize: 42, color: CINNABAR }}>{ask}</div>
            <div style={{ display: "flex", fontSize: 30, color: "rgba(20,21,28,0.62)" }}>{scan}</div>
            <div style={{ display: "flex", fontSize: 32, marginTop: 6, color: GOLD_TEXT }}>{RESULT_COPY.shareFoot}</div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} width={220} height={220} alt="" style={{ borderRadius: 6 }} />
        </div>
      </div>
    ),
    { width: 1080, height: 1920, fonts, headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" } },
  );
}
