import { describe, expect, it } from "vitest";
import { ChildLimit, Gender, SolarTime } from "tyme4ts";
import { jiaoyun, relationsFull, shenshaOf, siling, smallFortunes, type Kind } from "@/lib/mingli/bazi/shensha";
import DATA from "./wenzhen-cases.json";

interface Case { dt: string; g: number; p: string; qi: string; jy: string; sl: string; rs: string; rb: string; rw: string; ss: string; xy: string; nl: string }
const CASES = (DATA as { cases: Case[] }).cases;
const NATAL: Kind[] = ["natal-year", "natal-month", "natal-day", "natal-hour"];
const sorted = (x: string[]) => [...x].sort().join(",");

function chart(c: Case) {
  const [d, t] = c.dt.split(" ") as [string, string];
  const [y, m, dd] = d.split("-").map(Number) as [number, number, number];
  const [h, mi] = t.split(":").map(Number) as [number, number];
  const st = SolarTime.fromYmdHms(y, m, dd, h, mi, 0);
  const ec = st.getLunarHour().getEightChar(); // default provider: 子初换日
  const p = [ec.getYear(), ec.getMonth(), ec.getDay(), ec.getHour()].map((x) => x.getName());
  const cl = ChildLimit.fromSolarTime(st, c.g ? Gender.MAN : Gender.WOMAN);
  const gender = c.g ? ("male" as const) : ("female" as const);
  const lunarYear = st.getLunarHour().getLunarDay().getLunarMonth().getLunarYear().getYear();
  return { st, p, cl, gender, lunarYear, natal: { year: p[0]!, month: p[1]!, day: p[2]!, hour: p[3]! } };
}

describe("问真八字对照 (16 盘)", () => {
  CASES.forEach((c, ci) => {
    describe(`#${ci} ${c.dt} ${c.g ? "乾" : "坤"}`, () => {
      const x = chart(c);
      it("四柱", () => expect(x.p.join(" ")).toBe(c.p));

      it("神煞: 原局四柱、各步大运、2026 流年", () => {
        const blocks = c.ss.split(";").map((b) => b.split(","));
        const decades = blocks.length - 5;
        const cols: [string, Kind][] = [
          ...x.p.map((gz, i): [string, Kind] => [gz, NATAL[i]!]),
          ...Array.from({ length: decades }, (_, i): [string, Kind] => [x.cl.getStartDecadeFortune().next(i).getSixtyCycle().getName(), "fortune"]),
          ["丙午", "fortune"],
        ];
        cols.forEach(([gz, kind], i) => {
          const exp = blocks[i]!;
          expect(gz, `block ${i}`).toBe(exp[0]);
          expect(sorted(shenshaOf(gz, x.natal, x.gender, kind)), `block ${i} ${gz}`).toBe(sorted(exp.slice(1)));
        });
      });

      it("小运", () => {
        const from = Number(c.xy.slice(0, 4));
        expect(smallFortunes(x.p[3]!, x.p[0]![0]!, x.gender, x.lunarYear, from, 11).map((s) => `${s.year}${s.gz}`).join(",")).toBe(c.xy);
      });
      it("交运", () => expect(jiaoyun(x.cl.getEndTime())).toBe(c.jy));
      it("人元司令", () => expect(siling(x.st)).toBe(c.sl));
      it("天干 / 地支 / 整柱关系", () => {
        const r = relationsFull(x.p);
        const s = (a: string[]) => a.join(" | ") || "无";
        expect(s(r.stems)).toBe(c.rs);
        expect(s(r.branches)).toBe(c.rb);
        expect(s(r.whole)).toBe(c.rw);
      });
    });
  });
});
