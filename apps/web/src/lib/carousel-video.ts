import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { carouselSlide, casesFor, type CarouselLocale } from "./carousel";

/**
 * 每日卦例短视频 (推广总方案 §4.10; Neil 09-27: 「这两个也做完吧」).
 *
 * The same five carousel slides, as a 9:16 vertical clip for Reels / Shorts /
 * TikTok: each 4:5 slide centred on the paper ground, cross-faded, with a
 * silent audio track (several apps refuse a video without one; no music, so
 * nothing to license). Nothing new is written — the slides are the case exactly
 * as the 64 pages show it. Made once per (locale, case) and kept on disk.
 */
export const VIDEO_SIZE = { width: 1080, height: 1920 };
/** seconds on screen per slide: question · figure · verdict · timing · how to ask; the text-heavy two get longer */
export const SLIDE_SECONDS = [3.5, 3.5, 6, 5, 4.5] as const;
export const FADE = 0.5;
export const videoSeconds = (): number => SLIDE_SECONDS.reduce((a, b) => a + b, 0) - FADE * (SLIDE_SECONDS.length - 1);

const dir = () => join(process.env.DATA_DIR ?? join(process.cwd(), ".data"), "carousel-video");
const pending = new Map<string, Promise<string>>();

/** The ffmpeg arguments for five slide PNGs → one MP4 (exported for the test). */
export function ffmpegArgs(pngs: string[], out: string): string[] {
  const args: string[] = ["-y", "-loglevel", "error"];
  pngs.forEach((p, i) => args.push("-loop", "1", "-t", String(SLIDE_SECONDS[i]), "-i", p));
  const total = videoSeconds();
  args.push("-f", "lavfi", "-t", String(total), "-i", "anullsrc=r=44100:cl=stereo");
  const top = Math.round((VIDEO_SIZE.height - 1350) / 2);
  const parts = pngs.map((_, i) => `[${i}:v]scale=1080:1350,pad=${VIDEO_SIZE.width}:${VIDEO_SIZE.height}:0:${top}:color=0xF4F2EC,setsar=1,fps=30,format=yuv420p[v${i}]`);
  let prev = "v0";
  let offset = 0;
  for (let i = 1; i < pngs.length; i++) {
    offset += SLIDE_SECONDS[i - 1]! - FADE;
    const label = i === pngs.length - 1 ? "vout" : `x${i}`;
    parts.push(`[${prev}][v${i}]xfade=transition=fade:duration=${FADE}:offset=${offset.toFixed(2)}[${label}]`);
    prev = label;
  }
  args.push("-filter_complex", parts.join(";"), "-map", "[vout]", "-map", `${pngs.length}:a`,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-pix_fmt", "yuv420p", "-threads", "2",
    "-c:a", "aac", "-b:a", "64k", "-shortest", "-movflags", "+faststart", out);
  return args;
}

function run(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => { err += String(d); });
    const timer = setTimeout(() => p.kill("SIGKILL"), 120_000);
    p.on("error", (e) => { clearTimeout(timer); reject(e); });
    p.on("close", (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}: ${err.slice(-300)}`)); });
  });
}

/** Path of the finished MP4 for this case, making it the first time it is asked for. */
export async function carouselVideo(locale: CarouselLocale, index: number): Promise<string> {
  const list = casesFor(locale);
  const c = list[index];
  if (!c) throw new Error("not_found");
  mkdirSync(dir(), { recursive: true });
  const out = join(dir(), `${locale}-${index}-${c.code}.mp4`);
  if (existsSync(out)) return out;
  const key = out;
  const running = pending.get(key);
  if (running) return running;
  const job = (async () => {
    const work = join(tmpdir(), `yf-video-${locale}-${index}-${Date.now()}`);
    mkdirSync(work, { recursive: true });
    try {
      const pngs: string[] = [];
      for (let p = 1; p <= 5; p++) {
        const img = await carouselSlide(locale, c, p);
        const file = join(work, `${p}.png`);
        writeFileSync(file, Buffer.from(await img.arrayBuffer()));
        pngs.push(file);
      }
      const tmp = `${out}.part.mp4`; // same folder, so the rename is atomic
      await run(ffmpegArgs(pngs, tmp));
      renameSync(tmp, out);
      return out;
    } finally {
      rmSync(work, { recursive: true, force: true });
      pending.delete(key);
    }
  })();
  pending.set(key, job);
  return job;
}

export const readVideo = (path: string): Buffer => readFileSync(path);
