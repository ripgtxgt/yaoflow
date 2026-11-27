import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { hexagramByNumber, type LineValue } from "@yaoflow/engine";
import { asLocale, LOCALE_META } from "@/lib/locales";
import { proofData } from "@/lib/db";
import { parseProofRef, verifyProofToken } from "@/lib/outcome-token";
import { hexName } from "@/lib/names";
import { t } from "@/lib/i18n";
import { CINNABAR, GOLD_TEXT, INK, PAPER, YaoFigure, ogFonts } from "@/lib/og";
import { BODY_FAMILY, subsetFont, BRAND_HAN_TEXT, BrandMark } from "@/lib/carousel";
import { cardLine } from "@/lib/share-card";

export const runtime = "nodejs";

/**
 * 应验卡竖图 (进度表 15 ②, 推广 09-28): the proof card as a 1080×1920 story image
 * for IG / Threads — figure, cast day, the window the reading named, "came true",
 * yaoflow.com and a QR code carrying ?c=proof&r=<the author's share code>.
 * Never the question, never an accuracy figure. GET /api/proof/<ref>/story?l=zh-hant
 */
export async function GET(req: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const u = new URL(req.url);
  const l = asLocale(u.searchParams.get("l"));
  // 10-13 进度表 41 ③: the reader's own line for the 「應了」 card — optional, theirs to write, never the question
  const mine = cardLine(u.searchParams.get("m"), 50);
  const p = parseProofRef(ref);
  const d = p && verifyProofToken(p.id, p.token) ? proofData(p.id) : null;
  if (!d) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const values = d.values_str.split(",").map(Number) as LineValue[];
  const code = values.join("");
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  const link = `${site}/${l}?via=${code}&c=ying-share`; // 10-13 进度表 41 ①
  const qr = await QRCode.toDataURL(link, { errorCorrectionLevel: "M", margin: 1, width: 260, color: { dark: "#14151c", light: "#f4f2ec" } });
  const fmt = (ms: number) => new Intl.DateTimeFormat(LOCALE_META[l].htmlLang, { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Taipei" }).format(ms);
  const primary = hexName(hexagramByNumber(d.primary_num), l);
  const changed = d.changed_num ? hexName(hexagramByNumber(d.changed_num), l) : null;
  const labels = { lead: t(l, "proofLead"), cast: t(l, "proofCast"), window: t(l, "proofWindow"), hit: t(l, "proofHit"), seal: t(l, "proofSeal") };
  // the window as one or two sentences — the timing passage can run long, and the card is not the reading
  // the timing passage often opens with a preamble; the card wants the sentence that names the days
  const clip = (q: string) => {
    const parts = q.replace(/\s+/g, " ").split(/(?<=[。！？；;])|(?<=\.)\s+/).map((x) => x.trim()).filter(Boolean);
    const dated = parts.find((x) => /\d+\s*(月|日|\/|-)|(January|February|March|April|May|June|July|August|September|October|November|December)|\d{1,2}(st|nd|rd|th)\b/i.test(x));
    const one = dated ?? parts[0] ?? q;
    return one.length > 64 ? one.slice(0, 62) + "…" : one;
  };
  const window = d.timing_quote ? clip(d.timing_quote) : `${d.window_days}d`;
  const fonts: { name: string; data: ArrayBuffer | Buffer; weight: 400 | 600 }[] = [...ogFonts()];
  const fam = BODY_FAMILY[l];
  try {
    if (fam) fonts.push({ name: "Body", data: await subsetFont(fam, [BRAND_HAN_TEXT, primary, changed ?? "", window, fmt(d.cast_at), fmt(d.outcome_at), ...Object.values(labels), mine, "0123456789/→ ·“”"].join("")), weight: 600 });
    else fonts.push(...ogFonts().map((f) => ({ ...f, name: "Body" })));
  } catch {
    return NextResponse.json({ error: "font_unavailable" }, { status: 503 });
  }
  const img = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: PAPER, color: INK, fontFamily: "Body", padding: "120px 88px 100px" }}>
        {/* 10-22 进度表 91: 「爻流」 beside the wordmark on the Chinese cards */}
        <BrandMark han={!!fam && (l === "zh" || l === "zh-hant")} family="Body" style={{ fontSize: 30, letterSpacing: 14, color: GOLD_TEXT, fontFamily: "EB Garamond" }} />
        <div style={{ display: "flex", marginTop: 36, fontSize: 40, color: "rgba(20,21,28,0.6)" }}>{labels.lead}</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 56, marginTop: 96 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <YaoFigure values={values} width={300} />
            <div style={{ display: "flex", fontSize: 54, fontWeight: 600 }}>{primary}</div>
          </div>
          {changed ? (
            <>
              <div style={{ display: "flex", fontSize: 54, color: "rgba(20,21,28,0.35)", alignSelf: "center", marginBottom: 120 }}>→</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 28, opacity: 0.55 }}>
                <YaoFigure values={values.map((v) => (v === 6 ? 7 : v === 9 ? 8 : v))} width={300} />
                <div style={{ display: "flex", fontSize: 54, fontWeight: 600 }}>{changed}</div>
              </div>
            </>
          ) : null}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 30, marginTop: 110, paddingTop: 60, borderTop: "2px solid rgba(20,21,28,0.16)", fontSize: 36 }}>
          <div style={{ display: "flex", gap: 32 }}><span style={{ color: "rgba(20,21,28,0.45)", width: 300 }}>{labels.cast}</span><span>{fmt(d.cast_at)}</span></div>
          <div style={{ display: "flex", gap: 32 }}><span style={{ color: "rgba(20,21,28,0.45)", width: 300, flexShrink: 0 }}>{labels.window}</span><span style={{ display: "flex", lineHeight: 1.45, width: 572, flexWrap: "wrap" }}>{window}</span></div>
          <div style={{ display: "flex", gap: 32 }}><span style={{ color: GOLD_TEXT, width: 300 }}>{labels.hit}</span><span style={{ color: CINNABAR }}>{fmt(d.outcome_at)}</span></div>
        </div>
        {mine ? (
          <div style={{ display: "flex", marginTop: 64, borderLeft: `6px solid ${GOLD_TEXT}`, paddingLeft: 28, fontSize: 40, lineHeight: 1.5, color: "rgba(20,21,28,0.86)" }}>{`“${mine}”`}</div>
        ) : null}
        <div style={{ display: "flex", marginTop: mine ? 60 : 90, alignSelf: "flex-start", border: `7px solid ${CINNABAR}`, color: CINNABAR, borderRadius: 10, padding: "14px 40px", fontSize: 72, fontWeight: 600, letterSpacing: 18, transform: "rotate(-8deg)" }}>{labels.seal}</div>
        <div style={{ display: "flex", marginTop: "auto", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontFamily: "EB Garamond" }}>
            <div style={{ display: "flex", fontSize: 40, letterSpacing: 3 }}>yaoflow.com</div>
            <div style={{ display: "flex", fontSize: 24, color: "rgba(20,21,28,0.45)" }}>{`?via=${code}`}</div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} width={260} height={260} alt="" style={{ borderRadius: 6 }} />
        </div>
      </div>
    ),
    { width: 1080, height: 1920, fonts },
  );
  img.headers.set("Cache-Control", "public, max-age=86400");
  img.headers.set("Content-Disposition", `inline; filename="yaoflow-proof-${p!.id}.png"`);
  return img;
}
