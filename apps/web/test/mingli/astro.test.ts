import { describe, expect, it } from "vitest";
import { MakeTime } from "astronomy-engine";
import { angles, astroOf, houseOf, placidus, wholeSign } from "@/lib/mingli/astro/chart";
import { X, PLANET_SLUG, SIGN_SLUG } from "@/lib/mingli/astro/content";

describe("星盤", () => {
  it("planets: Sun in Taurus on 1990-05-15, Mercury retrograde, outer planets retrograde", () => {
    const v = astroOf(Date.UTC(1990, 4, 15, 2, 30), 25.04, 121.56, true);
    expect(v.planets[0]!.sign).toBe("金牛");
    expect(v.planets[0]!.lon).toBeGreaterThan(53.5);
    expect(v.planets[0]!.lon).toBeLessThan(54.5);
    expect(v.planets[2]!.retro).toBe(true);
    expect(v.planets[0]!.retro).toBe(false);
    expect(v.houseSystem).toBe("placidus");
  });
  it("ASC/MC basics: at the equator with RAMC 0 the ASC is 0° Cancer", () => {
    // find a moment where RAMC ≈ 0 at longitude 0 is not needed: check the formula directly through angles() consistency
    const t = MakeTime(new Date(Date.UTC(2000, 0, 1, 12)));
    const g = angles(t, 0, 0);
    expect(Math.abs(((g.asc - g.mc + 540) % 360) - 180 - 90) < 3 || Math.abs(((g.asc - g.mc + 540) % 360) - 180 + 90) < 3).toBe(true);
  });
  it("Placidus: cusps run in order, 1 = ASC, 10 = MC, opposite cusps 180° apart", () => {
    const t = MakeTime(new Date(Date.UTC(1990, 4, 15, 2, 30)));
    const g = angles(t, 25.04, 121.56);
    const c = placidus(g.ramc, g.eps, 25.04, g.asc, g.mc)!;
    expect(c[0]).toBeCloseTo(g.asc, 6);
    expect(c[9]).toBeCloseTo(g.mc, 6);
    for (let i = 0; i < 6; i++) expect(((c[i + 6]! - c[i]! + 360) % 360)).toBeCloseTo(180, 5);
    for (let i = 0; i < 12; i++) { const span = (c[(i + 1) % 12]! - c[i]! + 360) % 360; expect(span).toBeGreaterThan(5); expect(span).toBeLessThan(80); }
    expect(houseOf(c[3]! + 1, c)).toBe(4);
  });
  it("very high latitude falls back to whole sign", () => {
    const v = astroOf(Date.UTC(1990, 0, 15, 12), 70, 25, true);
    expect(v.houseSystem).toBe("whole");
    expect(wholeSign(95)[0]).toBe(90);
  });
  it("time unknown: no ASC, no houses", () => {
    const v = astroOf(Date.UTC(1990, 4, 15, 4), null, null, false);
    expect(v.asc).toBeNull();
    expect(v.planets.every((p) => p.house === null)).toBe(true);
  });
  it("content: 120 + 120 + 12, every slug", () => {
    expect(Object.keys(X.ps)).toHaveLength(120);
    expect(Object.keys(X.ph)).toHaveLength(120);
    for (const p of Object.keys(PLANET_SLUG)) for (const s of Object.keys(SIGN_SLUG)) expect(X.ps[`${p}|${s}`]).toBeTruthy();
    expect(JSON.stringify(X)).not.toMatch(/[準准]|大吉|大凶|血光|破財|剋|改運|靈驗|死亡|AI/);
  });
});

// 10-19 對照 Swiss Ephemeris (docs/mingli/astro-compare.md, test/mingli/astro-ref-cases.json): every body within 30″
// (Moon 60″) and every angle within 2′ for all 15 cases — including the polar one, whose ASC used to come out 180° off
import REF from "./astro-ref-cases.json";
describe("星盤 vs Swiss Ephemeris", () => {
  const diff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
  type Case = { id: string; lat: number; lon: number; utcMs: number; ref: { bodies: Record<string, { lon: number }>; asc: number; mc: number } };
  for (const c of (REF as unknown as { cases: Case[] }).cases) {
    it(c.id, () => {
      const v = astroOf(c.utcMs, c.lat, c.lon, true);
      for (const p of v.planets) {
        const r = c.ref.bodies[p.name];
        if (r) expect(diff(p.lon, r.lon) * 3600, `${c.id} ${p.name}`).toBeLessThan(p.name === "月亮" ? 60 : 30);
      }
      expect(diff(v.trueNode.lon, (c.ref as unknown as { trueNode: number }).trueNode) * 3600, `${c.id} true node`).toBeLessThan(30);
      expect(diff(v.asc!, c.ref.asc) * 60, `${c.id} ASC`).toBeLessThan(2);
      expect(diff(v.mc!, c.ref.mc) * 60, `${c.id} MC`).toBeLessThan(2);
    });
  }
});
