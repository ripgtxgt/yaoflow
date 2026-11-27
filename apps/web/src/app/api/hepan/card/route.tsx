import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import { HeavenStem } from "tyme4ts";
import { subsetFont } from "@/lib/carousel";
import { toHans } from "@/lib/hant";
import { SIGNS } from "@/lib/mingli/astro/chart";
import { THEME_LINE, THEME_TITLE, ZODIAC_T, branchRels, dmRelOf, type DmRel } from "@/lib/mingli/hepan/facts";
import { parseCardParams, type CardParams, type CardSide } from "@/lib/mingli/hepan/card-params";
import { CINNABAR, GOLD_TEXT, INK, PAPER, ogFonts } from "@/lib/og";
import { BRAND_HAN } from "@/lib/brand"; // 10-22 进度表 81: 「爻流」 beside the wordmark on the Chinese cards
import { isForeign, type Foreign } from "@/lib/l10n/core";
import { hepanT } from "@/lib/mingli/hepan/page-ui";
import { hepanNames } from "@/lib/mingli/hepan/names-data";
import { hpNameOf } from "@/lib/mingli/hepan/names";
import { koJosa, relIn } from "@/lib/mingli/hepan/text-in";

export const runtime = "nodejs";

/**
 * 10-21 (Neil: 兩人分享卡) — the pair as a 1080×1920 story card: 我 and TA side by side (生肖, 日柱, 太陽／月亮／金星), the
 * relations between them (日主, 生肖, the signs' elements), the two strongest themes with their one line, and a QR to the
 * free 合盤 (c=hepan-share). The URL carries only those chart words (lib/mingli/hepan/card-params.ts) — never a birth
 * date, time, place, name or gender. GET ?a=巳,己丑,天秤,獅子,天蠍&b=…&t=rhythm,順;life,混&l=zh-hant|zh|<any language the 合盤 is open in>
 * 10-30 进度表 128 ④: a card from a page in another language is drawn in that language (its words: hepanT; the names:
 * hepanNames) — no 「爻流」 beside the wordmark outside Chinese; on Latin pages each label sits above its value.
 */
const EL_COLOR: Record<string, string> = { 木: "#4f7d43", 火: "#b5452f", 土: "#9a7240", 金: "#a3832b", 水: "#3a6ea5" };
const SIGN_EL = ["火", "土", "風", "水"];
const signEl = (s: string) => { const i = (SIGNS as readonly string[]).indexOf(s); return i < 0 ? null : SIGN_EL[i % 4]!; };
/** 同元素 / 相容 (火風, 土水) / 相異 — as the overview's elements line */
function signRel(a: string, b: string): "同元素" | "相容" | "相異" | null {
  const ea = signEl(a), eb = signEl(b);
  if (!ea || !eb) return null;
  if (ea === eb) return "同元素";
  const pair = [ea, eb].sort().join("");
  return pair === "火風" || pair === "土水" ? "相容" : "相異";
}
const EL_KEY = { 同元素: "el_same", 相容: "el_ok", 相異: "el_diff" } as const;
const W = {
  "zh-hant": { tag: "合盤", lead: "我 × TA", sub: "八字・紫微・星盤 三套合看", me: "我", ta: "TA", zodiac: "生肖", pillar: "日柱", sun: "太陽", moon: "月亮", venus: "金星", dm: "日主", ask: "兩個人怎麼相處？", scan: "掃碼免費合盤，八字、紫微、星盤三套一起看" },
};
/** everything the card says, in the card's language */
interface CardWords { tag: string; lead: string; sub: string; me: string; ta: string; ask: string; scan: string; chips: string[]; themes: { title: string; line: string }[]; rowsA: [string, string][]; rowsB: [string, string][] }
const fill = (t: string | undefined, v: Record<string, string>) => (t ?? "").replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m);

function chineseWords(p: CardParams, elA: string, elB: string, dmRel: DmRel, zRels: string[]): CardWords {
  const w = W["zh-hant"];
  const dmWord = dmRel === "same" ? `同屬${elA}` : dmRel === "aFeedsB" ? `我的${elA}生 TA 的${elB}` : dmRel === "bFeedsA" ? `TA 的${elB}生我的${elA}` : dmRel === "aCurbsB" ? `我的${elA}制 TA 的${elB}` : `TA 的${elB}制我的${elA}`;
  const chips: string[] = [`${w.dm}・${dmWord}`];
  const zr = zRels.map((r) => r.replace(/（.*?）/, ""));
  if (zr.length) chips.push(`${w.zodiac}・${zr.join("、")}`);
  for (const [label, sa, sb] of [[w.sun, p.a.sun, p.b.sun], [w.moon, p.a.moon, p.b.moon], [w.venus, p.a.venus, p.b.venus]] as const) {
    const r = signRel(sa, sb);
    if (r) chips.push(`${label}・${r}`);
  }
  const themes = p.themes.map((t) => ({ title: THEME_TITLE[t.key], line: THEME_LINE[t.key][t.lean] }));
  const rows = (s: CardSide) => [[w.zodiac, `屬${ZODIAC_T[s.yearBranch]}`], [w.pillar, s.dayPillar], [w.sun, `${s.sun}座`], [w.moon, s.moon === "-" ? "—" : s.moon.includes("或") ? `${s.moon.replace("或", "座或")}座` : `${s.moon}座`], [w.venus, `${s.venus}座`]] as [string, string][];
  return { tag: w.tag, lead: w.lead, sub: w.sub, me: w.me, ta: w.ta, ask: w.ask, scan: w.scan, chips, themes, rowsA: rows(p.a), rowsB: rows(p.b) };
}

function foreignWords(p: CardParams, l: Foreign, elA: string, elB: string, dmRel: DmRel, zRels: string[]): CardWords {
  const t = hepanT(l), H = hpNameOf(hepanNames(l)), B = H.B;
  const sep = l === "ja" ? "・" : " · ";
  const chips: string[] = [`${t.card_dmLabel}${sep}${fill(t[`card_dm_${dmRel}`], { a: B.elOf(elA), b: B.elOf(elB) })}`];
  const zr = zRels.map((r) => relIn(r, t, H).replace(/\s*[（(].*?[)）]/, ""));
  if (zr.length) chips.push(`${t.card_zodiac}${sep}${zr.join(H.Z.list)}`);
  for (const [k, sa, sb] of [["太陽", p.a.sun, p.b.sun], ["月亮", p.a.moon, p.b.moon], ["金星", p.a.venus, p.b.venus]] as const) {
    const r = signRel(sa, sb);
    if (r) chips.push(`${H.planet(k)}${sep}${t[EL_KEY[r]]}`);
  }
  const themes = p.themes.map((x) => ({ title: t[`theme_${x.key}`] ?? "", line: t[`line_${x.key}_${x.lean}`] ?? "" }));
  const moon = (m: string) => (m === "-" ? "—" : m.includes("或") ? fill(t.ov_or, { a: H.sign(m.split("或")[0]!), b: H.sign(m.split("或")[1]!) }) : H.sign(m));
  // (a label's reading in brackets — 干支（えと） — would wrap the narrow Japanese / Korean label column)
  const label = (x: string | undefined) => (x ?? "").replace(/\s*[（(][^）)]*[）)]/, "");
  const rows = (s: CardSide): [string, string][] => [
    [label(t.card_zodiac), H.animal(s.yearBranch)], [label(t.card_pillar), B.gz(s.dayPillar)],
    [H.planet("太陽"), H.sign(s.sun)], [H.planet("月亮"), moon(s.moon)], [H.planet("金星"), H.sign(s.venus)],
  ];
  return { tag: t.head ?? "", lead: t.card_lead ?? "", sub: t.card_sub ?? "", me: t.me ?? "", ta: t.taName ?? "", ask: t.card_ask ?? "", scan: t.card_scan ?? "", chips: chips.map((c) => koJosa(c, H)), themes, rowsA: rows(p.a), rowsB: rows(p.b) };
}

export async function GET(req: Request) {
  const p = parseCardParams(new URL(req.url).searchParams);
  if (!p) return new Response("bad", { status: 400 });
  const foreign: Foreign | null = isForeign(p.locale) ? p.locale : null;
  const latin = !!foreign && foreign !== "ja" && foreign !== "ko";
  const hans = p.locale === "zh";
  const T = (s: string) => (hans ? toHans(s) : s);
  const el = (side: CardSide) => HeavenStem.fromName(side.dayPillar[0]!).getElement().getName();
  const elA = el(p.a), elB = el(p.b);
  const dmRel = dmRelOf(elA, elB);
  const zRels = branchRels(p.a.yearBranch, p.b.yearBranch).slice(0, 2);
  const w = foreign ? foreignWords(p, foreign, elA, elB, dmRel, zRels) : chineseWords(p, elA, elB, dmRel, zRels);
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  const qr = await QRCode.toDataURL(`${site}/${p.locale}/hepan?c=hepan-share`, { errorCorrectionLevel: "M", margin: 1, width: 300, color: { dark: INK, light: PAPER } });
  const text = (foreign ? "" : BRAND_HAN) + T([w.tag, w.lead, w.sub, w.me, w.ta, w.ask, w.scan, ...w.chips, ...w.themes.flatMap((t) => [t.title, t.line]), ...w.rowsA.flat(), ...w.rowsB.flat(), elA, elB].join(""));
  const fonts: { name: string; data: ArrayBuffer | Buffer; weight: 400 | 600 }[] = [...ogFonts()];
  const family = foreign === "ja" ? "Noto Serif JP" : foreign === "ko" ? "Noto Serif KR" : hans ? "Noto Serif SC" : "Noto Serif TC";
  try { fonts.push({ name: "Body", data: await subsetFont(family, text), weight: 600 }); } catch { /* Latin face only */ }
  const col = (label: string, rows: [string, string][], elc: string) => (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: latin ? 10 : 18 }}>
      <div style={{ display: "flex", fontSize: latin ? 26 : 30, letterSpacing: latin ? 1 : 6, color: GOLD_TEXT }}>{T(label)}</div>
      {rows.map(([k, v], i) => latin ? (
        <div key={k} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ display: "flex", fontSize: 18, color: "rgba(20,21,28,0.5)" }}>{k}</div>
          <div style={{ display: "flex", flexWrap: "wrap", fontSize: i < 2 ? 40 : 28, lineHeight: 1.1, color: i === 1 ? elc : INK }}>{v}</div>
        </div>
      ) : (
        <div key={k} style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
          <div style={{ display: "flex", width: foreign ? 96 : 76, fontSize: 24, color: "rgba(20,21,28,0.5)" }}>{T(k)}</div>
          <div style={{ display: "flex", fontSize: i < 2 ? 56 : 36, lineHeight: 1.15, color: i === 1 ? elc : INK }}>{T(v)}</div>
        </div>
      ))}
    </div>
  );
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: PAPER, color: INK, padding: "100px 80px 96px", fontFamily: "Body" }}>
        <div style={{ display: "flex", width: "100%", justifyContent: "space-between", fontSize: 30, color: GOLD_TEXT }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>{foreign ? null : <div style={{ display: "flex", fontFamily: "Body" }}>{BRAND_HAN}</div>}<div style={{ display: "flex", letterSpacing: 14, fontFamily: "EB Garamond" }}>YAOFLOW</div></div>
          <div style={{ display: "flex", letterSpacing: latin ? 2 : 6 }}>{T(w.tag)}</div>
        </div>
        {/* (flexShrink 0: a long language must not squeeze one block onto the next — the German lead ran into its subtitle) */}
        <div style={{ display: "flex", flexShrink: 0, flexWrap: "wrap", marginTop: 56, fontSize: latin ? 64 : 84, lineHeight: 1.05, letterSpacing: latin ? 0 : 4 }}>{T(w.lead)}</div>
        <div style={{ display: "flex", flexShrink: 0, marginTop: 18, fontSize: 30, color: "rgba(20,21,28,0.6)", letterSpacing: latin ? 0 : 3 }}>{T(w.sub)}</div>
        <div style={{ display: "flex", flexShrink: 0, marginTop: latin ? 40 : 54, gap: 40, border: `4px solid ${CINNABAR}`, padding: latin ? "28px 40px" : "44px 48px", background: "rgba(255,255,255,0.35)" }}>
          {col(w.me, w.rowsA, EL_COLOR[elA] ?? INK)}
          <div style={{ display: "flex", width: 2, background: "rgba(20,21,28,0.12)" }} />
          {col(w.ta, w.rowsB, EL_COLOR[elB] ?? INK)}
        </div>
        <div style={{ display: "flex", flexShrink: 0, flexWrap: "wrap", gap: latin ? 10 : 14, marginTop: latin ? 30 : 36 }}>
          {w.chips.map((c) => <div key={c} style={{ display: "flex", padding: latin ? "7px 16px" : "10px 20px", border: "2px solid rgba(20,21,28,0.18)", borderRadius: 6, fontSize: latin ? 23 : 28, color: "rgba(20,21,28,0.78)" }}>{T(c)}</div>)}
        </div>
        <div style={{ display: "flex", flexShrink: 0, flexDirection: "column", marginTop: latin ? 30 : 46, gap: latin ? 18 : 30 }}>
          {w.themes.map((t) => (
            <div key={t.title} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", fontSize: latin ? 31 : 36, color: GOLD_TEXT, letterSpacing: latin ? 0 : 2 }}>{T(t.title)}</div>
              <div style={{ display: "flex", fontSize: latin ? 25 : 31, lineHeight: latin ? 1.45 : 1.5, color: "rgba(20,21,28,0.8)" }}>{T(t.line)}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexShrink: 0, width: "100%", marginTop: "auto", paddingTop: 24, alignItems: "flex-end", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 600 }}>
            <div style={{ display: "flex", fontSize: latin ? 38 : 44, color: CINNABAR, fontWeight: 600 }}>{T(w.ask)}</div>
            <div style={{ display: "flex", fontSize: latin ? 25 : 30, color: "rgba(20,21,28,0.62)", lineHeight: 1.4 }}>{T(w.scan)}</div>
            <div style={{ display: "flex", fontSize: 36, letterSpacing: 3, fontFamily: "EB Garamond", marginTop: 6 }}>yaoflow.com</div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} width={240} height={240} alt="" style={{ borderRadius: 6 }} />
        </div>
      </div>
    ),
    { width: 1080, height: 1920, fonts, headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" } },
  );
}
