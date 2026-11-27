/**
 * 10-17 擲筊 3D: record real-physics falls of two moon blocks, offline, and keep a few per outcome.
 *
 * The page never simulates: the toss result is decided first (lib/jiaobei.ts, 50 / 25 / 25), then a recorded fall that
 * ends in exactly those faces is replayed. So every fall looks physical, and no fall can disagree with the result.
 *
 * Run (needs cannon-es and three; not app dependencies):
 *   cd /tmp/phys && cp <repo>/apps/web/src/lib/jiaobei-geo.ts . && cp <repo>/apps/web/scripts/jiaobei-motion.mts . \
 *     && npx tsx jiaobei-motion.mts > jiaobei-motion.json
 * then copy the JSON to apps/web/public/jiaobei/motion.json.
 */
import * as CANNON from "cannon-es";
import { Vector3 } from "three";
import { ConvexHull } from "three/examples/jsm/math/ConvexHull.js";
import { hullPoints } from "./jiaobei-geo";

const G = 110;          // units/s² (1 unit ≈ 3.5 cm; slower than life so the eye can follow)
const HZ = 120, KEEP = 30;
const PER = 6;          // clips kept per outcome
let seed = Number(process.argv[2] ?? 20261017);
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const R = (a: number, b: number) => a + (b - a) * rnd();

function hullShape(): CANNON.ConvexPolyhedron {
  const pts = hullPoints().map(([x, y, z]) => new Vector3(x, y, z));
  const hull = new ConvexHull().setFromPoints(pts);
  const verts: CANNON.Vec3[] = [], idx = new Map<string, number>(), faces: number[][] = [];
  const at = (v: Vector3) => { const k = `${v.x.toFixed(5)},${v.y.toFixed(5)},${v.z.toFixed(5)}`; let i = idx.get(k); if (i === undefined) { i = verts.length; verts.push(new CANNON.Vec3(v.x, v.y, v.z)); idx.set(k, i); } return i; };
  for (const f of hull.faces) {
    const loop: number[] = [];
    let e = f.edge;
    do { loop.push(at(e.head().point)); e = e.next; } while (e !== f.edge);
    faces.push(loop);
  }
  return new CANNON.ConvexPolyhedron({ vertices: verts, faces });
}

const SHAPE = hullShape();
type Frame = number[]; // 14 numbers: x y z qx qy qz qw for each block
interface Clip { d: number; f: [number, number]; fr: number[]; im: number[] }

const WHY: string[] = [];
function one(): Clip | null {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -G, 0) });
  world.allowSleep = true;
  const table = new CANNON.Material("table"), wood = new CANNON.Material("wood");
  world.addContactMaterial(new CANNON.ContactMaterial(table, wood, { friction: 0.42, restitution: 0.32 }));
  world.addContactMaterial(new CANNON.ContactMaterial(wood, wood, { friction: 0.3, restitution: 0.38 }));
  const ground = new CANNON.Body({ mass: 0, material: table, shape: new CANNON.Plane() });
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(ground);
  const shape = SHAPE;
  const bodies = [0, 1].map((k) => {
    const b = new CANNON.Body({ mass: 1, material: wood, shape, linearDamping: 0.1, angularDamping: 0.3, sleepSpeedLimit: 0.6, sleepTimeLimit: 0.2 });
    // both leave the hand together, a little apart, thrown forward and down onto the table
    b.position.set((k ? 1 : -1) * R(0.4, 0.9), R(5.5, 7.5), R(-4.2, -3.2));
    b.velocity.set((k ? 1 : -1) * R(0.1, 1.0) + R(-0.4, 0.4), R(-2, 2), R(4.5, 7.5));
    b.angularVelocity.set(R(-18, 18), R(-10, 10), R(-18, 18));
    const q = new CANNON.Quaternion(); q.setFromEuler(R(0, 6.28), R(0, 6.28), R(0, 6.28)); b.quaternion.copy(q);
    world.addBody(b);
    return b;
  });
  const frames: Frame[] = [], impacts: number[] = [];
  const last = new Map<string, number>();
  let t = 0, still = 0, settledAt = -1;
  for (let step = 0; step < HZ * 3.4; step++) {
    world.step(1 / HZ);
    t += 1 / HZ;
    for (const c of world.contacts) {
      const vi = c.bi.velocity, vj = c.bj.velocity, n = c.ni;
      const rel = Math.abs((vi.x - vj.x) * n.x + (vi.y - vj.y) * n.y + (vi.z - vj.z) * n.z);
      if (rel < 1.6) continue;
      const kind = c.bi.mass && c.bj.mass ? 1 : 0; // 1 wood on wood, 0 on the table
      const key = `${c.bi.id}-${c.bj.id}`;
      if (t - (last.get(key) ?? -1) < 0.07) continue;
      last.set(key, t);
      impacts.push(Math.round(t * 1000), Math.min(1000, Math.round(rel * 70)), kind);
    }
    if (step % (HZ / KEEP) === 0) frames.push(bodies.flatMap((b) => [b.position.x, b.position.y, b.position.z, b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w]));
    const calm = t > 0.6 && bodies.every((b) => b.velocity.length() < 0.35 && b.angularVelocity.length() < 0.6);
    still = calm ? still + 1 : 0;
    if (still >= HZ * 0.25) { settledAt = t; break; }
  }
  if (settledAt < 0) { WHY.push("moving"); return null; }
  const faces = bodies.map((b) => {
    const up = b.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
    return up.y > 0.85 ? 0 : up.y < -0.85 ? 1 : -1; // 1 = flat face up
  });
  if (faces.includes(-1)) { WHY.push("edge"); return null; } // standing on an edge
  // both on the table, in view, not stacked
  // not stacked, and close enough together to frame both: the clip is then shifted so they rest around the centre
  const [p0, p1] = bodies.map((b) => b.position);
  if (bodies.some((b) => b.position.y > 0.6) || Math.abs(p0!.x - p1!.x) > 4.0 || Math.abs(p0!.z - p1!.z) > 2.4 || Math.hypot(p0!.x - p1!.x, p0!.z - p1!.z) < 1.4) { WHY.push("out"); return null; }
  frames.push(bodies.flatMap((b) => [b.position.x, b.position.y, b.position.z, b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w]));
  const mx = (p0!.x + p1!.x) / 2, mz = (p0!.z + p1!.z) / 2;
  for (const f of frames) { f[0]! -= mx; f[2]! -= mz; f[7]! -= mx; f[9]! -= mz; }
  const fr = frames.flat().map((x, i) => Math.round(x * (i % 7 < 3 ? 1000 : 10000)));
  return { d: Math.round(t * 1000), f: [faces[0]!, faces[1]!], fr, im: impacts };
}

const buckets = new Map<string, Clip[]>();
let tries = 0;
const MAX = Number(process.argv[3] ?? 3000);
while (tries++ < MAX && [...["00", "01", "10", "11"]].some((k) => (buckets.get(k)?.length ?? 0) < PER)) {
  const c = one();
  if (!c || c.d > 3400) continue;
  const k = c.f.join("");
  const list = buckets.get(k) ?? [];
  if (list.length < PER) { list.push(c); buckets.set(k, list); }
}
const clips = ["00", "01", "10", "11"].flatMap((k) => buckets.get(k) ?? []);
process.stderr.write(`tries ${tries} · why ${JSON.stringify(WHY.reduce<Record<string, number>>((a, w) => ({ ...a, [w]: (a[w] ?? 0) + 1 }), {}))} · ${["00", "01", "10", "11"].map((k) => `${k}:${buckets.get(k)?.length ?? 0}`).join(" ")}\n`);
process.stdout.write(JSON.stringify({ v: 1, hz: KEEP, clips }));
