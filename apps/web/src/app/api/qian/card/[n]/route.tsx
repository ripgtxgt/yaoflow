import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import { qianShareUrl } from "@/lib/qian-meta";
import { HK_SETS, isTemple, qianByNum, qianWording, qianOrdinal, qianPoemAt, qianSet, qianTag } from "@/lib/qian";
import { subsetFont } from "@/lib/carousel";
import { CINNABAR, GOLD_TEXT, INK, PAPER, ogFonts } from "@/lib/og";
import { BRAND_HAN } from "@/lib/brand"; // 10-22 进度表 81: 「爻流」 beside the wordmark on the Chinese cards

export const runtime = "nodejs";

/**
 * 10-12 解籤 (进度表 §四 36 ④): the lot as a 1080×1350 card for 「下載圖片」 and link previews — the four lines set
 * vertically, right to left, as the printed slip reads. Never the reader's question. Cached a day.
 */
export async function GET(req: Request, { params }: { params: Promise<{ n: string }> }) {
  const { n } = await params;
  const sp = new URL(req.url).searchParams;
  const set = qianSet(sp.get("s")); // 10-12 籤系: ?s=huangdaxian
  const e0 = /^\d{1,3}$/.test(n) ? qianByNum(Number(n), set.id) : null;
  const e = e0 ? qianWording(e0, HK_SETS.has(e0.set)) : null;
  if (!e) return new Response("not found", { status: 404 });
  // 10-12 各廟用字: ?t=<temple id> sets the lines as that temple prints them
  const t = sp.get("t");
  const poem = qianPoemAt(e, isTemple(t) ? t : null);
  const head = `${set.name}　第${qianOrdinal(e.num)}籤${qianTag(e) ? `　${qianTag(e)}` : ""}`;
  // 10-13 进度表 41 ②: ?f=story is the 9:16 card for IG / Threads stories — the same slip, bigger, and the way in
  const story = sp.get("f") === "story";
  const lead = "我抽到這支籤", ask = "你也抽到籤了嗎？", scan = "掃碼輸入籤號，看白話怎麼說";
  const text = BRAND_HAN + [head, ...poem, e.title, "解籤", ...(story ? [lead, ask, scan] : [])].join("");
  // 10-12 承接 ⑨ 分享回流: the card carries a QR to the entry with this lot filled in, tagged c=qian-share
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  const qr = await QRCode.toDataURL(qianShareUrl(site, e.num, set.id), { errorCorrectionLevel: "M", margin: 1, width: 180, color: { dark: "#14151c", light: "#f4f2ec" } });
  const fonts: { name: string; data: ArrayBuffer | Buffer; weight: 400 | 600 }[] = [...ogFonts()];
  try { fonts.push({ name: "Body", data: await subsetFont("Noto Serif TC", text), weight: 600 }); } catch { /* falls back to the Latin face; the card still renders */ }
  const col = (s: string, size: number, color: string, gap: number) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap }}>
      {[...s].map((ch, i) => <div key={i} style={{ display: "flex", fontSize: size, color, lineHeight: 1 }}>{ch === "　" ? "" : ch}</div>)}
    </div>
  );
  if (story) {
    const qrBig = await QRCode.toDataURL(qianShareUrl(site, e.num, set.id), { errorCorrectionLevel: "M", margin: 1, width: 300, color: { dark: "#14151c", light: "#f4f2ec" } });
    const long = Math.max(...poem.map((l) => [...l].length));
    const size = long > 7 || poem.length > 5 ? 54 : long > 5 ? 76 : 88;
    const gap = long > 7 || poem.length > 5 ? 14 : 26;
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", background: PAPER, color: INK, padding: "110px 80px 96px", fontFamily: "Body" }}>
          <div style={{ display: "flex", width: "100%", justifyContent: "space-between", fontSize: 30, color: GOLD_TEXT }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}><div style={{ display: "flex", fontFamily: "Body" }}>{BRAND_HAN}</div><div style={{ display: "flex", letterSpacing: 14, fontFamily: "EB Garamond" }}>YAOFLOW</div></div>
            <div style={{ display: "flex", letterSpacing: 6 }}>解籤</div>
          </div>
          <div style={{ display: "flex", marginTop: 56, fontSize: 42, color: "rgba(20,21,28,0.62)", letterSpacing: 4 }}>{lead}</div>
          <div style={{ display: "flex", marginTop: 64, border: `4px solid ${CINNABAR}`, padding: 14, background: "rgba(255,255,255,0.35)" }}>
            <div style={{ display: "flex", flexDirection: "row-reverse", gap: long > 7 ? 40 : 60, border: "1px solid rgba(20,21,28,0.2)", padding: "76px 80px" }}>
              {head.length > 14 ? col(head, 30, CINNABAR, 8) : col(head, 38, CINNABAR, 12)}
              {poem.map((line, i) => <div key={i} style={{ display: "flex" }}>{col(line, size, INK, gap)}</div>)}
            </div>
          </div>
          <div style={{ display: "flex", marginTop: 64, fontSize: 48, fontWeight: 600, color: INK, textAlign: "center", maxWidth: 880, lineHeight: 1.35 }}>{e.title}</div>
          <div style={{ display: "flex", width: "100%", marginTop: "auto", alignItems: "flex-end", justifyContent: "space-between" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 560 }}>
              <div style={{ display: "flex", fontSize: 44, color: CINNABAR, fontWeight: 600 }}>{ask}</div>
              <div style={{ display: "flex", fontSize: 34, color: "rgba(20,21,28,0.62)", lineHeight: 1.4 }}>{scan}</div>
              <div style={{ display: "flex", fontSize: 36, letterSpacing: 3, fontFamily: "EB Garamond", marginTop: 6 }}>yaoflow.com</div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrBig} width={280} height={280} alt="" style={{ borderRadius: 6 }} />
          </div>
        </div>
      ),
      { width: 1080, height: 1920, fonts, headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" } },
    );
  }
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: PAPER, color: INK, padding: 70, fontFamily: "Body" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26, color: GOLD_TEXT }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}><div style={{ display: "flex", fontFamily: "Body" }}>{BRAND_HAN}</div><div style={{ display: "flex", letterSpacing: 10, fontFamily: "EB Garamond" }}>YAOFLOW</div></div>
          <div style={{ display: "flex" }}>解籤</div>
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ display: "flex", border: `3px solid ${CINNABAR}`, padding: 10 }}>
            <div style={{ display: "flex", flexDirection: "row-reverse", gap: 46, border: "1px solid rgba(20,21,28,0.18)", padding: "56px 64px" }}>
              {head.length > 14 ? col(head, 24, CINNABAR, 6) : col(head, 30, CINNABAR, 10)}
              {poem.map((line, i) => <div key={i} style={{ display: "flex" }}>{(() => { const long = Math.max(...poem.map((l) => [...l].length)); return long > 7 || poem.length > 5 ? col(line, 44, INK, 12) : col(line, 64, INK, 22); })()}</div>)}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", fontSize: 34, color: INK }}>{e.title}</div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
            <img src={qr} width={150} height={150} alt="" />
            <div style={{ display: "flex", fontSize: 22, fontFamily: "EB Garamond", color: "rgba(20,21,28,0.45)" }}>yaoflow.com</div>
          </div>
        </div>
      </div>
    ),
    { width: 1080, height: 1350, fonts, headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" } },
  );
}
