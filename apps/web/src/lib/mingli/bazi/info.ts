import { EarthBranch, HeavenStem, SixtyCycle, SolarTerm, SolarTime } from "tyme4ts";
import type { Normalized } from "@/lib/mingli/birth/normalize";
import { trad, yearCycle, type BaziView } from "./chart";

/**
 * 10-18 (Neil: 盤面要跟問真一樣) 基本信息 — the facts 问真 lists above the chart: 生肖、虛歲、陰陽乾坤、陽曆、真太陽時、
 * 出生地區、人元司令分野、出生節氣（前後兩個節的時刻）、星座、星宿、胎元／胎息／命宮／身宮（納音）、年空日空、命卦.
 * Checked against 问真 for 1990-01-01 00:00 男 (test/mingli/bazi.test.ts). 命卦 by the 立春 year.
 */
export interface BaziInfo {
  zodiac: string; age: number; yin: boolean;
  term: { prev: string; prevAt: string; next: string; nextAt: string; afterD: number; afterH: number; beforeD: number; beforeH: number } | null;
  constellation: string; xiu: string;
  /** 10-30: the Western sign's place, Aries = 0 (a page in another language names it itself) */
  conIdx: number;
  /** 10-30: the two 節 as tyme4ts names them (simplified), for a page in another language */
  termKeys?: { prev: string; next: string };
  palaces: { fetal: string; breath: string; own: string; body: string } | null;
  kong: string; gua: { name: string; east: boolean } | null; silingEl: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const at = (t: SolarTime) => `${t.getYear()}-${pad(t.getMonth())}-${pad(t.getDay())} ${pad(t.getHour())}:${pad(t.getMinute())}:${pad(t.getSecond())}`;
const ms = (t: SolarTime) => Date.UTC(t.getYear(), t.getMonth() - 1, t.getDay(), t.getHour(), t.getMinute(), t.getSecond());
const BEAST: Record<string, string> = { 东: "东方苍龙", 南: "南方朱雀", 西: "西方白虎", 北: "北方玄武" };
const GUA = ["", "坎", "坤", "震", "巽", "", "乾", "兑", "艮", "离"];
const withNayin = (gz: string, hans: boolean) => `${gz}（${trad(SixtyCycle.fromName(gz).getSound().getName(), hans)}）`;

export function baziInfo(n: Normalized, v: BaziView, thisYear: number, hans: boolean): BaziInfo {
  const t = n.chartTime ?? { ...n.solarDate, h: 12, mi: 0 };
  const st = SolarTime.fromYmdHms(t.y, t.m, t.d, t.h, t.mi, 0);
  const T = (s: string) => trad(s, hans);

  // the 節 before and after the birth moment
  let term: BaziInfo["term"] = null;
  let termKeys: BaziInfo["termKeys"];
  if (n.timeKnown) {
    const jie: SolarTime[] = [], names: string[] = [];
    for (const y of [t.y - 1, t.y, t.y + 1]) for (let i = 0; i < 24; i++) {
      const s = SolarTerm.fromIndex(y, i);
      if (s.isJie()) { jie.push(s.getJulianDay().getSolarTime()); names.push(s.getName()); }
    }
    const order = jie.map((x, i) => ({ x, i })).sort((a, b) => ms(a.x) - ms(b.x));
    const k = order.findIndex((o) => ms(o.x) > ms(st));
    if (k > 0) {
      const p = order[k - 1]!, q = order[k]!;
      const a = ms(st) - ms(p.x), b = ms(q.x) - ms(st), H = 3_600_000;
      term = { prev: T(names[p.i]!), prevAt: at(p.x), next: T(names[q.i]!), nextAt: at(q.x), afterD: Math.floor(a / 86_400_000), afterH: Math.floor((a % 86_400_000) / H), beforeD: Math.floor(b / 86_400_000), beforeH: Math.floor((b % 86_400_000) / H) };
      termKeys = { prev: names[p.i]!, next: names[q.i]! };
    }
  }

  const ld = st.getSolarDay().getLunarDay();
  const star = ld.getTwentyEightStar();
  const xiu = T(`${star.getName()}宿${BEAST[star.getZone().getName()] ?? ""}`);

  let palaces: BaziInfo["palaces"] = null;
  if (v.hasHour) {
    try {
      const ec = st.getLunarHour().getEightChar();
      palaces = { fetal: withNayin(ec.getFetalOrigin().getName(), hans), breath: withNayin(ec.getFetalBreath().getName(), hans), own: withNayin(ec.getOwnSign().getName(), hans), body: withNayin(ec.getBodySign().getName(), hans) };
    } catch { /* */ }
  }

  // 命卦 by the 立春 year
  let Y = n.chartDate.y;
  if (yearCycle(Y).getName() !== v.pillars[0]!.gz) Y -= 1;
  let gua: BaziInfo["gua"] = null;
  if (Y >= 1900 && Y < 2100) {
    const d = [...String(Y % 100)].reduce((a, c) => a + +c, 0);
    const s = d === 0 ? 0 : ((d - 1) % 9) + 1;
    const m = (x: number) => (((x - 1) % 9) + 9) % 9 + 1;
    let g = v.gender === "male" ? m((Y < 2000 ? 10 : 9) - s) : m((Y < 2000 ? 5 : 6) + s);
    if (g === 5) g = v.gender === "male" ? 2 : 8;
    gua = { name: T(GUA[g]!), east: [1, 3, 4, 9].includes(g) };
  }

  const sl = v.siling;
  const silingEl = sl ? [...sl].map((c) => c + HeavenStem.fromName(c).getElement().getName()).join("") : null;

  return {
    zodiac: T(EarthBranch.fromName(v.pillars[0]!.branch).getZodiac().getName()),
    age: thisYear - v.lunarYear + 1,
    yin: HeavenStem.fromName(v.pillars[0]!.stem).getYinYang() === 0,
    term, termKeys, constellation: `${T(st.getSolarDay().getConstellation().getName())}座`, conIdx: st.getSolarDay().getConstellation().getIndex(), xiu, palaces,
    kong: [v.pillars[0]!.kong, v.pillars[2]!.kong].join(" "), gua, silingEl,
  };
}
