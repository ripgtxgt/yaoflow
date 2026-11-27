import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { blockMesh, CENTRE, hullPoints } from "../src/lib/jiaobei-geo";

/** 10-17 擲筊 3D: the recorded falls must end in the faces they are filed under, for every outcome */
type Clip = { d: number; f: [number, number]; fr: number[]; im: number[] };
const motion = JSON.parse(readFileSync(join(__dirname, "../public/jiaobei/motion.json"), "utf8")) as { hz: number; clips: Clip[] };

const upY = (qx: number, qy: number, qz: number, qw: number) => 1 - 2 * (qx * qx + qz * qz); // y of the rotated local +y (dome)

describe("擲筊 3D", () => {
  it("the block mesh is well formed and centred", () => {
    const m = blockMesh();
    expect(m.positions.length % 3).toBe(0);
    expect(m.uvs.length / 2).toBe(m.positions.length / 3);
    expect(Math.max(...m.indices)).toBeLessThan(m.positions.length / 3);
    expect(m.groups.reduce((a, [, c]) => a + c, 0)).toBe(m.indices.length);
    expect(CENTRE[1]).toBeGreaterThan(0);
    expect(hullPoints().length).toBeGreaterThan(50);
  });

  it("every outcome has recorded falls, and each ends in its faces", () => {
    const keys = new Set<string>();
    for (const c of motion.clips) {
      const n = c.fr.length / 14;
      expect(Number.isInteger(n)).toBe(true);
      const o = (n - 1) * 14;
      for (let k = 0; k < 2; k++) {
        const q = c.fr.slice(o + k * 7 + 3, o + k * 7 + 7).map((x) => x / 10000) as [number, number, number, number];
        const y = upY(...q);
        // f = 1: flat face up → the dome points down
        expect(c.f[k] ? y < -0.8 : y > 0.8, `clip faces ${c.f.join("")} block ${k} up.y=${y.toFixed(2)}`).toBe(true);
      }
      expect(c.im.length % 3).toBe(0);
      keys.add(c.f[0] === c.f[1] ? c.f.join("") : "mix");
    }
    // 陰 (both domes up), 笑 (both flat faces up), 聖 (one of each; either block, the page can swap them)
    expect([...keys].sort()).toEqual(["00", "11", "mix"]);
  });
});
