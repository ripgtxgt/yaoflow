import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { blockMesh, CENTRE } from "./jiaobei-geo";

/**
 * 10-17 擲筊 3D: the scene behind components/Jiaobei3D.tsx (loaded on demand — three.js never ships with other pages).
 * Lacquer and the cut face are painted on canvases here, so there are no image files to fetch. The table is the page's own
 * paper: the canvas is transparent and only the soft shadows are drawn.
 */
type Clip = { d: number; f: [number, number]; fr: number[]; im: number[] };
type Motion = { v: number; hz: number; clips: Clip[] };

function grain(w: number, h: number, base: [number, number, number], lines: [number, number, number], seed: number, lacquer: boolean): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d")!;
  let s = seed;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  g.fillStyle = `rgb(${base.join(",")})`;
  g.fillRect(0, 0, w, h);
  // long fibres along the block (u = length)
  for (let i = 0; i < 140; i++) {
    const y0 = r() * h, a = 0.05 + r() * (lacquer ? 0.08 : 0.16), amp = 2 + r() * 6, ph = r() * 6.28, fr = 1 + r() * 3;
    g.strokeStyle = `rgba(${lines.join(",")},${a})`;
    g.lineWidth = 0.6 + r() * (lacquer ? 1.4 : 2.2);
    g.beginPath();
    for (let x = 0; x <= w; x += 8) { const y = y0 + Math.sin((x / w) * Math.PI * fr + ph) * amp; if (x) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
  }
  // lacquer: a darker pool toward the edges where it gathers
  if (lacquer) {
    const v = g.createLinearGradient(0, 0, 0, h);
    v.addColorStop(0, "rgba(40,6,4,.35)"); v.addColorStop(0.18, "rgba(40,6,4,0)"); v.addColorStop(0.82, "rgba(40,6,4,0)"); v.addColorStop(1, "rgba(40,6,4,.35)");
    g.fillStyle = v; g.fillRect(0, 0, w, h);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function blockGeometry(): THREE.BufferGeometry {
  const m = blockMesh();
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(m.positions, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(m.normals, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(m.uvs, 2));
  g.setIndex(m.indices);
  m.groups.forEach(([start, count], i) => g.addGroup(start, count, i));
  return g;
}

/** a short wooden knock, made on the spot (no audio files) */
function knock(ctx: AudioContext, strength: number, wood: boolean) {
  const len = wood ? 0.09 : 0.14;
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, wood ? 6 : 4);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = (wood ? 2300 : 950) * (0.9 + Math.random() * 0.2); bp.Q.value = wood ? 6 : 3;
  const gain = ctx.createGain(); gain.gain.value = Math.min(0.55, 0.08 + strength * 0.5);
  src.connect(bp).connect(gain).connect(ctx.destination);
  src.start();
}

export function createJiaobeiScene(host: HTMLElement, motion: Motion, soundOn: () => boolean) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  renderer.domElement.style.display = "block";

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(30, 1.6, 0.1, 100);
  camera.position.set(0, 6.9, 5.6);
  camera.lookAt(0, 0, 0.25);

  const sun = new THREE.DirectionalLight(0xfff4e6, 2.1);
  sun.position.set(-3.5, 9, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -6; sun.shadow.camera.right = 6; sun.shadow.camera.top = 6; sun.shadow.camera.bottom = -6;
  sun.shadow.radius = 6; sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xfff8ee, 0x5a4a3a, 0.35));

  const table = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.22 }));
  table.rotation.x = -Math.PI / 2;
  table.receiveShadow = true;
  scene.add(table);

  const geo = blockGeometry();
  const lacquer = new THREE.MeshPhysicalMaterial({
    map: grain(512, 256, [128, 20, 14], [60, 6, 3], 7, true), roughness: 0.4, metalness: 0, clearcoat: 0.85, clearcoatRoughness: 0.18
  });
  const face = new THREE.MeshStandardMaterial({ map: grain(512, 256, [160, 80, 50], [92, 40, 22], 11, false), roughness: 0.82, metalness: 0 });
  const blocks = [0, 1].map(() => {
    const m = new THREE.Mesh(geo, [lacquer, face]);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    return m;
  });

  // resting together before the first toss: the pair as one oval, lacquer up
  const rest = () => {
    const [, cy, cz] = CENTRE;
    blocks[0]!.position.set(0, cy, cz + 0.03); blocks[0]!.quaternion.identity();
    blocks[1]!.position.set(0, cy, -cz - 0.03); blocks[1]!.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  };
  rest();

  const size = () => {
    const w = host.clientWidth || 320, h = host.clientHeight || 200;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // keep the same table width in view on a narrow screen
    camera.fov = w / h < 1.4 ? 36 : 30;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  };
  const ro = new ResizeObserver(size);
  ro.observe(host);
  size();

  let audio: AudioContext | null = null;
  let raf = 0;

  /** the frames of a clip as poses for block 0 and 1; `swap` trades the blocks, `mirror` reflects left ↔ right */
  const pose = (c: Clip, i: number, k: number, swap: boolean, mirror: boolean) => {
    const o = i * 14 + (swap ? 1 - k : k) * 7, f = c.fr;
    const p = new THREE.Vector3(f[o]! / 1000, f[o + 1]! / 1000, f[o + 2]! / 1000);
    const q = new THREE.Quaternion(f[o + 3]! / 10000, f[o + 4]! / 10000, f[o + 5]! / 10000, f[o + 6]! / 10000).normalize();
    if (mirror) { p.x = -p.x; q.set(q.x, -q.y, -q.z, q.w); }
    return { p, q };
  };

  const play = (want: [boolean, boolean], instant: boolean): Promise<void> => {
    cancelAnimationFrame(raf);
    const a = want[0] ? 1 : 0, b = want[1] ? 1 : 0;
    const options: { c: Clip; swap: boolean }[] = [];
    for (const c of motion.clips) {
      if (c.f[0] === a && c.f[1] === b) options.push({ c, swap: false });
      if (c.f[1] === a && c.f[0] === b) options.push({ c, swap: true });
    }
    if (!options.length) return Promise.resolve();
    const { c, swap } = options[Math.floor(Math.random() * options.length)]!;
    const mirror = Math.random() < 0.5;
    const n = c.fr.length / 14;
    const place = (time: number) => {
      const x = Math.min(n - 1, time * motion.hz), i = Math.floor(x), u = x - i, j = Math.min(n - 1, i + 1);
      for (let k = 0; k < 2; k++) {
        const A = pose(c, i, k, swap, mirror), B = pose(c, j, k, swap, mirror);
        blocks[k]!.position.lerpVectors(A.p, B.p, u);
        blocks[k]!.quaternion.slerpQuaternions(A.q, B.q, u);
      }
    };
    if (instant) { place(n); renderer.render(scene, camera); return Promise.resolve(); }
    if (soundOn()) {
      try { audio ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); void audio.resume(); } catch { audio = null; }
    }
    const impacts: { t: number; s: number; wood: boolean }[] = [];
    for (let i = 0; i < c.im.length; i += 3) impacts.push({ t: c.im[i]! / 1000, s: c.im[i + 1]! / 1000, wood: c.im[i + 2] === 1 });
    const end = (n - 1) / motion.hz;
    return new Promise((done) => {
      const t0 = performance.now();
      let next = 0;
      const frame = (now: number) => {
        const t = (now - t0) / 1000;
        place(t);
        while (next < impacts.length && impacts[next]!.t <= t) {
          const im = impacts[next++]!;
          if (audio && soundOn() && im.s > 0.12) knock(audio, im.s, im.wood);
        }
        renderer.render(scene, camera);
        if (t < end) raf = requestAnimationFrame(frame);
        else done();
      };
      raf = requestAnimationFrame(frame);
    });
  };

  /** one still of one recorded fall (for checking the clips; not used by the page) */
  const still = (index: number, time: number) => {
    const c = motion.clips[index];
    if (!c) return;
    const n = c.fr.length / 14, i = Math.min(n - 1, Math.round(time * motion.hz));
    for (let k = 0; k < 2; k++) { const A = pose(c, i, k, false, false); blocks[k]!.position.copy(A.p); blocks[k]!.quaternion.copy(A.q); }
    renderer.render(scene, camera);
  };

  const dispose = () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    geo.dispose(); lacquer.map?.dispose(); face.map?.dispose(); lacquer.dispose(); face.dispose(); env.dispose(); pmrem.dispose();
    renderer.dispose();
    renderer.domElement.remove();
    void audio?.close();
  };
  return { play, dispose, still };
}
