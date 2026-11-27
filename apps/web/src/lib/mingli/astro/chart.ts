import { Body, e_tilt, Ecliptic, EclipticGeoMoon, GeoVector, MakeTime, SiderealTime } from "astronomy-engine";

/**
 * 10-18 进度表 74 星盤（本命盤）: astronomy-engine (MIT) for the planets — geocentric, apparent, ecliptic of date
 * (tropical) — and our own ASC/MC, Placidus houses (whole-sign above 66° latitude), mean nodes, retrograde and the five
 * major aspects. Input is UTC and the birthplace coordinates (no true solar time, no 子時 rule — those are Chinese
 * conventions). Runs in the browser.
 */
export const SIGNS = ["牡羊", "金牛", "雙子", "巨蟹", "獅子", "處女", "天秤", "天蠍", "射手", "摩羯", "水瓶", "雙魚"] as const;
export const PLANETS = ["太陽", "月亮", "水星", "金星", "火星", "木星", "土星", "天王星", "海王星", "冥王星"] as const;
const BODIES = [Body.Sun, Body.Moon, Body.Mercury, Body.Venus, Body.Mars, Body.Jupiter, Body.Saturn, Body.Uranus, Body.Neptune, Body.Pluto];
export const ASPECTS = [{ name: "合", angle: 0 }, { name: "六合", angle: 60 }, { name: "刑", angle: 90 }, { name: "拱", angle: 120 }, { name: "沖", angle: 180 }] as const;

const D = Math.PI / 180;
const norm = (x: number) => ((x % 360) + 360) % 360;
const atan2d = (y: number, x: number) => norm(Math.atan2(y, x) / D);

export interface PlanetPos { name: string; lon: number; sign: string; deg: number; min: number; retro: boolean; house: number | null; nearCusp: boolean }
export interface Aspect { a: string; b: string; name: string; orb: number }
export interface AstroView {
  planets: PlanetPos[]; node: { lon: number; sign: string; house: number | null };
  /** 10-19 (Neil: 兩個都顯示): the true (osculating) node, as astro.com shows by default; `node` stays the mean node */
  trueNode: { lon: number; sign: string; house: number | null };
  asc: number | null; mc: number | null; cusps: number[] | null; houseSystem: "placidus" | "whole" | null; aspects: Aspect[]; timeKnown: boolean;
}

export const signOf = (lon: number) => SIGNS[Math.floor(norm(lon) / 30)]!;
const degMin = (lon: number) => { const x = norm(lon) % 30; const d = Math.floor(x); return { deg: d, min: Math.floor((x - d) * 60) }; };

function lonOf(i: number, t: ReturnType<typeof MakeTime>): number {
  if (BODIES[i] === Body.Moon) return EclipticGeoMoon(t).lon;
  return Ecliptic(GeoVector(BODIES[i]!, t, true)).elon;
}

/** ASC and MC from local sidereal time (RAMC), obliquity and latitude */
export function angles(t: ReturnType<typeof MakeTime>, lat: number, lon: number) {
  const ramc = norm(SiderealTime(t) * 15 + lon);
  const eps = e_tilt(t).tobl;
  const mc = atan2d(Math.sin(ramc * D), Math.cos(ramc * D) * Math.cos(eps * D));
  let asc = atan2d(Math.cos(ramc * D), -(Math.sin(ramc * D) * Math.cos(eps * D) + Math.tan(lat * D) * Math.sin(eps * D)));
  // 10-19 (對照 Swiss Ephemeris, Tromsø 69.6°N): inside the polar circle the formula can land on the descendant —
  // Swiss Ephemeris' rule: there the ASC must lie in the half after the MC (4000 random polar charts: 174 → 0 off)
  if (Math.abs(lat) >= 90 - eps && ((asc - mc + 540) % 360) - 180 < 0) asc = norm(asc + 180);
  return { ramc, eps, mc, asc };
}

/** Placidus cusps 1–12 (index 0 = 1st house); null when the latitude is too high */
export function placidus(ramc: number, eps: number, lat: number, asc: number, mc: number): number[] | null {
  if (Math.abs(lat) > 66) return null;
  const lonOfRa = (ra: number) => atan2d(Math.sin(ra * D), Math.cos(ra * D) * Math.cos(eps * D));
  const cusp = (f: number, above: boolean): number | null => {
    let lam = lonOfRa(ramc + (above ? f * 90 : 180 - f * 90));
    for (let k = 0; k < 30; k++) {
      const dec = Math.asin(Math.sin(eps * D) * Math.sin(lam * D));
      const x = Math.tan(lat * D) * Math.tan(dec);
      if (Math.abs(x) >= 1) return null;
      const ad = Math.asin(x) / D;
      const ra = above ? ramc + f * (90 + ad) : ramc + 180 - f * (90 - ad);
      const next = lonOfRa(ra);
      if (Math.abs(next - lam) < 1e-7) { lam = next; break; }
      lam = next;
    }
    return lam;
  };
  const c11 = cusp(1 / 3, true), c12 = cusp(2 / 3, true), c2 = cusp(2 / 3, false), c3 = cusp(1 / 3, false);
  if ([c11, c12, c2, c3].some((x) => x === null || Number.isNaN(x))) return null;
  const c = [asc, c2!, c3!, norm(mc + 180), 0, 0, norm(asc + 180), 0, 0, mc, c11!, c12!];
  c[4] = norm(c11! + 180); c[5] = norm(c12! + 180); c[7] = norm(c2! + 180); c[8] = norm(c3! + 180);
  return c;
}

export const wholeSign = (asc: number) => Array.from({ length: 12 }, (_, i) => norm(Math.floor(asc / 30) * 30 + i * 30));

/** which house (1–12) a longitude falls in */
export function houseOf(lon: number, cusps: number[]): number {
  for (let i = 0; i < 12; i++) {
    const a = cusps[i]!, b = cusps[(i + 1) % 12]!;
    const span = norm(b - a), off = norm(lon - a);
    if (off < span) return i + 1;
  }
  return 1;
}

/** mean lunar node (Meeus) */
export function meanNode(t: ReturnType<typeof MakeTime>): number {
  const T = t.tt / 36525;
  return norm(125.0445479 - 1934.1362891 * T + 0.0020754 * T * T + (T * T * T) / 467441 - (T * T * T * T) / 60616000);
}

/**
 * 10-19 true (osculating) lunar node: the ascending node of the Moon's instantaneous orbit — h = r × v from its
 * geocentric ecliptic-of-date position ±10 minutes; node direction = ẑ × h. Within 18″ of Swiss Ephemeris on all 15
 * reference charts (test/mingli/astro-ref-cases.json).
 */
export function trueNode(utcMs: number): number {
  const xyz = (m: number) => { const e = EclipticGeoMoon(MakeTime(new Date(m))); const la = e.lat * D, lo = e.lon * D; return [e.dist * Math.cos(la) * Math.cos(lo), e.dist * Math.cos(la) * Math.sin(lo), e.dist * Math.sin(la)] as const; };
  const dt = 600_000, r = xyz(utcMs), a = xyz(utcMs - dt), b = xyz(utcMs + dt);
  const v = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const;
  const hx = r[1] * v[2] - r[2] * v[1], hy = r[2] * v[0] - r[0] * v[2];
  return atan2d(hx, -hy);
}

/** 10-19 the five major aspects between the ten planets (orb 8° with 太陽／月亮, else 6°), tightest first */
export function aspectsOf(lons: number[]): Aspect[] {
  const aspects: Aspect[] = [];
  for (let i = 0; i < 10; i++) for (let j = i + 1; j < 10; j++) {
    const sep = Math.abs(((lons[i]! - lons[j]! + 540) % 360) - 180);
    const lum = i < 2 || j < 2;
    for (const a of ASPECTS) {
      const orb = Math.abs(sep - a.angle);
      if (orb <= (lum ? 8 : 6)) { aspects.push({ a: PLANETS[i]!, b: PLANETS[j]!, name: a.name, orb }); break; }
    }
  }
  return aspects.sort((x, y) => x.orb - y.orb);
}

export function astroOf(utcMs: number, lat: number | null, lon: number | null, timeKnown: boolean, system: "placidus" | "whole" = "placidus"): AstroView {
  const t = MakeTime(new Date(utcMs));
  const tb = MakeTime(new Date(utcMs - 3_600_000)), ta = MakeTime(new Date(utcMs + 3_600_000));
  const lons = PLANETS.map((_, i) => lonOf(i, t));
  let asc: number | null = null, mc: number | null = null, cusps: number[] | null = null, used: AstroView["houseSystem"] = null;
  if (timeKnown && lat !== null && lon !== null) {
    const g = angles(t, lat, lon);
    asc = g.asc; mc = g.mc;
    cusps = system === "placidus" ? placidus(g.ramc, g.eps, lat, g.asc, g.mc) : null;
    used = cusps ? "placidus" : "whole";
    if (!cusps) cusps = wholeSign(g.asc);
  }
  const planets: PlanetPos[] = PLANETS.map((name, i) => {
    const l = lons[i]!;
    const d = norm(lonOf(i, ta) - lonOf(i, tb));
    const retro = i > 1 && d > 180; // moved backwards
    const { deg, min } = degMin(l);
    const nearCusp = deg === 29 && min >= 59 || deg === 0 && min < 1 || (cusps ? cusps.some((c) => Math.abs(((l - c + 540) % 360) - 180) < 1 / 60) : false);
    return { name, lon: l, sign: signOf(l), deg, min, retro, house: cusps ? houseOf(l, cusps) : null, nearCusp };
  });
  const nodeLon = meanNode(t);
  const aspects = aspectsOf(lons);
  const tn = trueNode(utcMs);
  return { planets, node: { lon: nodeLon, sign: signOf(nodeLon), house: cusps ? houseOf(nodeLon, cusps) : null }, trueNode: { lon: tn, sign: signOf(tn), house: cusps ? houseOf(tn, cusps) : null }, asc, mc, cusps, houseSystem: used, aspects, timeKnown: timeKnown && asc !== null };
}
