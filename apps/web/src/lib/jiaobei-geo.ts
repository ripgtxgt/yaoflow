/**
 * 10-17 擲筊 3D (Neil: 「筊子做得不太好看……能不能做3D效果」): the shape of one moon block, shared by the page's renderer
 * (components/Jiaobei3D.tsx) and the offline physics recording (scripts/jiaobei-motion.mts) so a recorded fall lands
 * exactly the way the drawn block would.
 *
 * Proportions from real temple blocks (about 9 × 3.5 × 1.8 cm; 梢楠木 / 竹根, a crescent seen from above): one flat face,
 * one rounded lacquered back. Local frame: the flat face lies in the plane y = −cy (facing −y), the dome rises toward +y;
 * x runs tip to tip; z runs from the inner (concave) edge to the outer edge. The origin is the block's centre of mass.
 *
 *   t ∈ [−1, 1]  along the length        e ∈ [0, π]  across the dome
 */
export const GEO = { L: 1.3, Wout: 1.38, Cin: 0.14, H: 0.6, nt: 56, ne: 22, ns: 6 } as const;

const pw = (t: number, p: number) => Math.pow(Math.max(0, 1 - t * t), p);
const zin = (t: number) => GEO.Cin * (1 - t * t);
const zout = (t: number) => GEO.Wout * pw(t, 0.42);
const hgt = (t: number) => GEO.H * pw(t, 0.36);

/** a point on the block before centring: s ∈ [0,1] on the flat face (y=0), or e on the dome */
function dome(t: number, e: number): [number, number, number] {
  const a = zin(t), b = zout(t);
  return [GEO.L * t, hgt(t) * Math.sin(e), a + (b - a) * (1 - Math.cos(e)) / 2];
}
function flat(t: number, s: number): [number, number, number] {
  const a = zin(t), b = zout(t);
  return [GEO.L * t, 0, a + (b - a) * s];
}

/** centre of mass of the solid (numerical, uniform density) */
function centre(): [number, number, number] {
  let m = 0, cx = 0, cy = 0, cz = 0;
  const N = 80;
  for (let i = 0; i < N; i++) {
    const t = -1 + (2 * (i + 0.5)) / N;
    for (let j = 0; j < N; j++) {
      const s = (j + 0.5) / N;
      const a = zin(t), b = zout(t), z = a + (b - a) * s;
      // dome height above this point of the flat face: invert z(e) → e, y = h·sin e
      const c = 1 - 2 * s, e = Math.acos(Math.max(-1, Math.min(1, c)));
      const y = hgt(t) * Math.sin(e);
      const dm = y * (b - a); // column of height y, width (b−a)/N, length 2/N (constants cancel)
      m += dm; cx += dm * GEO.L * t; cy += dm * (y / 2); cz += dm * z;
    }
  }
  return [cx / m, cy / m, cz / m];
}
export const CENTRE = centre();

export interface BlockMesh {
  /** xyz per vertex */ positions: number[];
  /** xyz per vertex */ normals: number[];
  /** uv per vertex: u along the length, v across */ uvs: number[];
  indices: number[];
  /** index ranges: [start, count] for the dome (material 0) and the flat face (material 1) */
  groups: [number, number][];
}

/** The renderable block, centred on its centre of mass. */
export function blockMesh(): BlockMesh {
  const [ox, oy, oz] = CENTRE;
  const P: number[] = [], Nn: number[] = [], U: number[] = [], I: number[] = [];
  const { nt, ne, ns } = GEO;
  // dome
  for (let i = 0; i <= nt; i++) {
    const t = -1 + (2 * i) / nt;
    for (let j = 0; j <= ne; j++) {
      const e = (Math.PI * j) / ne;
      const p = dome(t, e);
      // normal by finite differences
      const dt = 1e-3, de = 1e-3;
      const pt = dome(Math.max(-1, Math.min(1, t + dt)), e), pm = dome(Math.max(-1, Math.min(1, t - dt)), e);
      const pe = dome(t, Math.min(Math.PI, e + de)), pq = dome(t, Math.max(0, e - de));
      const A = [pt[0] - pm[0], pt[1] - pm[1], pt[2] - pm[2]], B = [pe[0] - pq[0], pe[1] - pq[1], pe[2] - pq[2]];
      // outward = −(∂p/∂t × ∂p/∂e): up on the dome, −z on the inner edge, +z on the outer edge
      let n = [-(A[1] * B[2] - A[2] * B[1]), -(A[2] * B[0] - A[0] * B[2]), -(A[0] * B[1] - A[1] * B[0])];
      let len = Math.hypot(n[0]!, n[1]!, n[2]!);
      if (len < 1e-9 || Math.abs(t) > 0.995) { n = [Math.sign(t) || 0, 0.6, 0]; len = Math.hypot(n[0]!, n[1]!, 0); }
      P.push(p[0] - ox, p[1] - oy, p[2] - oz);
      Nn.push(n[0]! / len, n[1]! / len, n[2]! / len);
      U.push((t + 1) / 2, j / ne);
    }
  }
  const row = ne + 1;
  for (let i = 0; i < nt; i++) for (let j = 0; j < ne; j++) {
    const a = i * row + j, b = a + row;
    I.push(a, a + 1, b, b, a + 1, b + 1); // counter-clockwise seen from outside
  }
  const domeCount = I.length;
  // flat face (facing −y)
  const base = P.length / 3;
  for (let i = 0; i <= nt; i++) {
    const t = -1 + (2 * i) / nt;
    for (let k = 0; k <= ns; k++) {
      const p = flat(t, k / ns);
      P.push(p[0] - ox, p[1] - oy, p[2] - oz);
      Nn.push(0, -1, 0);
      U.push((t + 1) / 2, k / ns);
    }
  }
  const frow = ns + 1;
  for (let i = 0; i < nt; i++) for (let k = 0; k < ns; k++) {
    const a = base + i * frow + k, b = a + frow;
    I.push(a, b, a + 1, b, b + 1, a + 1); // facing −y
  }
  return { positions: P, normals: Nn, uvs: U, indices: I, groups: [[0, domeCount], [domeCount, I.length - domeCount]] };
}

/** A coarse point cloud of the hull, for the physics body (the inner concavity is small and filled in). */
export function hullPoints(): [number, number, number][] {
  const [ox, oy, oz] = CENTRE;
  const out: [number, number, number][] = [];
  for (let i = 0; i <= 12; i++) {
    const t = -0.985 + (1.97 * i) / 12;
    for (let j = 0; j <= 6; j++) { const p = dome(t, (Math.PI * j) / 6); out.push([p[0] - ox, p[1] - oy, p[2] - oz]); }
  }
  return out;
}
