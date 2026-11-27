import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { sessionRefunded } from "@/lib/db";
import { subsetFont } from "@/lib/carousel";
import { ogFontsZh } from "@/lib/og";
import { BAZI_TOKEN_RE, baziReport } from "@/lib/mingli/bazi/report";
import { ensurePortrait, portraitFile, readPortrait } from "@/lib/mingli/bazi/portrait";

export const runtime = "nodejs";

/**
 * 10-19 正緣畫像的配圖: the stored picture of a paid (or member) 正緣畫像 — 404 for anything else, and for a refunded one.
 * Not there yet → 202 and the drawing starts (the report page shows a placeholder and refreshes).
 * 10-21 (Neil: 「AI生成」水印 要): the picture is served with a small 「AI生成」 label burnt into its lower right corner, so
 * the mark stays on a saved or shared copy. Made once from the drawn picture and kept beside it (<token>.v2.wm.png).
 */
const MARK = "AI生成";

async function marked(token: string, img: Buffer): Promise<Buffer | null> {
  const file = portraitFile(token).replace(/\.img$/, ".wm.png");
  if (existsSync(file)) return readFileSync(file);
  const mime = img[0] === 0x89 ? "image/png" : img[0] === 0x52 ? "image/webp" : "image/jpeg";
  const fonts: { name: string; data: ArrayBuffer | Buffer; weight: 400 | 600 }[] = [...ogFontsZh()];
  try { fonts.push({ name: "Mark", data: await subsetFont("Noto Sans TC", MARK), weight: 600 }); } catch { return null; }
  try {
    const res = new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", position: "relative" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`data:${mime};base64,${img.toString("base64")}`} width={768} height={1024} alt="" style={{ width: 768, height: 1024, objectFit: "cover" }} />
          <div style={{ position: "absolute", right: 20, bottom: 20, display: "flex", padding: "6px 14px", borderRadius: 6, background: "rgba(20,21,28,0.55)", color: "#f4f2ec", fontSize: 24, fontFamily: "Mark", letterSpacing: 2 }}>{MARK}</div>
        </div>
      ),
      { width: 768, height: 1024, fonts },
    );
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 5_000) return null;
    writeFileSync(file, buf);
    return buf;
  } catch { return null; }
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!BAZI_TOKEN_RE.test(token)) return new NextResponse("not found", { status: 404 });
  const r = baziReport(token);
  if (!r || r.kind !== "love" || !r.paid_at || sessionRefunded(r.paid_session)) return new NextResponse("not found", { status: 404 });
  const img = readPortrait(token);
  if (!img) {
    void ensurePortrait(token).catch(() => false);
    return new NextResponse("drawing", { status: 202, headers: { "Cache-Control": "no-store" } });
  }
  const out = await marked(token, img);
  // the mark could not be made this time (font fetch) → the page keeps waiting rather than showing an unmarked picture
  if (!out) return new NextResponse("drawing", { status: 202, headers: { "Cache-Control": "no-store" } });
  return new NextResponse(new Uint8Array(out), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=86400" } });
}
