import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

/**
 * 10-14 拍照找籤留存 (Neil: 「我们为什么不存照片呢？这个是很大的问题」→ the middle way: 「嗯呢，做吧」).
 * Only the photos we could NOT name for sure (none / some / fail — never a recognised one, never "not a slip") are kept,
 * 30 days, then deleted. A photo is tied to nothing but its own reading: no browser, no address, no customer. What was
 * read off it is kept beside it so the misses can be studied. The page and the privacy policy say so.
 *   DATA_DIR/qian-photos/<id>.jpg + <id>.json
 */
export const PHOTO_KEEP_MS = 30 * 86_400_000;
const dir = () => join(process.env.DATA_DIR ?? join(process.cwd(), ".data"), "qian-photos");
const ID = /^[a-z0-9]{8,40}$/;

export interface StoredPhotoMeta {
  id: string; at: number; kind: string; number: number | null; temple: string; text: string; top: string; model: string | null; ms: number;
}

/**
 * Drop every APP1..APP15 segment (EXIF, XMP, GPS, maker notes) from a JPEG: the browser's canvas re-encode already
 * carries none, but the endpoint can be called without our page.
 */
export function stripJpegMeta(buf: Buffer): Buffer | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  const parts: Buffer[] = [buf.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1]!;
    if (marker === 0xda) { parts.push(buf.subarray(i)); return Buffer.concat(parts); } // start of scan: the rest is image data
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) return null;
    const keep = !(marker >= 0xe1 && marker <= 0xef) && marker !== 0xfe; // APP1–APP15 and comments go
    if (keep) parts.push(buf.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  return null;
}

/** Keep one photo we could not name. Returns its id, or null when it is not a JPEG we can clean. */
export function keepPhoto(dataUrl: string, meta: Omit<StoredPhotoMeta, "id" | "at">, now = Date.now()): string | null {
  const m = dataUrl.match(/^data:image\/jpeg;base64,(.+)$/);
  if (!m) return null;
  const clean = stripJpegMeta(Buffer.from(m[1]!, "base64"));
  if (!clean) return null;
  const id = `${now.toString(36)}${randomBytes(5).toString("hex")}`;
  mkdirSync(dir(), { recursive: true });
  writeFileSync(join(dir(), `${id}.jpg`), clean);
  writeFileSync(join(dir(), `${id}.json`), JSON.stringify({ id, at: now, ...meta } satisfies StoredPhotoMeta));
  return id;
}

export function listPhotos(): StoredPhotoMeta[] {
  let files: string[] = [];
  try { files = readdirSync(dir()).filter((f) => f.endsWith(".json")); } catch { return []; }
  const out: StoredPhotoMeta[] = [];
  for (const f of files) { try { out.push(JSON.parse(readFileSync(join(dir(), f), "utf8")) as StoredPhotoMeta); } catch { /* half-written */ } }
  return out.sort((a, b) => b.at - a.at);
}

export function readPhoto(id: string): Buffer | null {
  if (!ID.test(id)) return null;
  try { return readFileSync(join(dir(), `${id}.jpg`)); } catch { return null; }
}

export function deletePhoto(id: string): boolean {
  if (!ID.test(id)) return false;
  let gone = false;
  for (const ext of ["jpg", "json"]) { try { rmSync(join(dir(), `${id}.${ext}`)); gone = true; } catch { /* already gone */ } }
  return gone;
}

/** Everything older than 30 days goes — by the file's own time, so a broken sidecar cannot keep a photo alive. */
export function purgePhotos(now = Date.now()): number {
  let n = 0;
  let files: string[] = [];
  try { files = readdirSync(dir()); } catch { return 0; }
  for (const f of files) {
    try { if (now - statSync(join(dir(), f)).mtimeMs > PHOTO_KEEP_MS) { rmSync(join(dir(), f)); if (f.endsWith(".jpg")) n++; } } catch { /* raced */ }
  }
  return n;
}
