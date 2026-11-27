import { describe, expect, it } from "vitest";
import { deletePhoto, keepPhoto, listPhotos, PHOTO_KEEP_MS, purgePhotos, readPhoto, stripJpegMeta } from "../src/lib/qian-photo-store";
import { utimesSync } from "node:fs";
import { join } from "node:path";

/** 10-14 (Neil: 「嗯呢，做吧」): only the photos we could not name, 30 days, no location data, tied to nothing. */
// a tiny JPEG: SOI, APP1 "Exif" with a fake GPS payload, APP0 JFIF, a COM, then SOS + data + EOI
const seg = (marker: number, body: Buffer) => { const h = Buffer.alloc(4); h[0] = 0xff; h[1] = marker; h.writeUInt16BE(body.length + 2, 2); return Buffer.concat([h, body]); };
const jpeg = Buffer.concat([
  Buffer.from([0xff, 0xd8]),
  seg(0xe1, Buffer.from("Exif\0\0GPS-25.03N-121.56E")),
  seg(0xe0, Buffer.from("JFIF\0")),
  seg(0xfe, Buffer.from("taken at home")),
  seg(0xda, Buffer.from([0, 1, 2])), Buffer.from([0x11, 0x22, 0xff, 0xd9]),
]);
const dataUrl = `data:image/jpeg;base64,${jpeg.toString("base64")}`;

describe("拍照找籤留存", () => {
  it("strips EXIF / GPS and comments, keeps the image", () => {
    const clean = stripJpegMeta(jpeg)!;
    expect(clean.includes(Buffer.from("GPS"))).toBe(false);
    expect(clean.includes(Buffer.from("taken at home"))).toBe(false);
    expect(clean.includes(Buffer.from("JFIF"))).toBe(true);
    expect(clean.subarray(-4)).toEqual(Buffer.from([0x11, 0x22, 0xff, 0xd9]));
    expect(stripJpegMeta(Buffer.from("not a jpeg"))).toBeNull();
  });
  it("keeps one, lists it, serves it clean, deletes it — and refuses what is not a JPEG", () => {
    const id = keepPhoto(dataUrl, { kind: "none", number: 23, temple: "城隍廟", text: "欲去長江", top: "", model: "m", ms: 3000 })!;
    expect(id).toMatch(/^[a-z0-9]+$/);
    expect(listPhotos().some((p) => p.id === id && p.kind === "none" && p.number === 23)).toBe(true);
    expect(readPhoto(id)!.includes(Buffer.from("GPS"))).toBe(false);
    expect(readPhoto("../etc/passwd")).toBeNull();
    expect(keepPhoto("data:image/png;base64,iVBORw0KGgo=", { kind: "none", number: null, temple: "", text: "", top: "", model: null, ms: 1 })).toBeNull();
    expect(deletePhoto(id)).toBe(true);
    expect(readPhoto(id)).toBeNull();
  });
  it("is gone after 30 days", () => {
    const id = keepPhoto(dataUrl, { kind: "fail", number: null, temple: "", text: "", top: "", model: null, ms: 45000 })!;
    const dir = join(process.env.DATA_DIR!, "qian-photos");
    const old = (Date.now() - PHOTO_KEEP_MS - 60_000) / 1000;
    for (const ext of ["jpg", "json"]) utimesSync(join(dir, `${id}.${ext}`), old, old);
    expect(purgePhotos()).toBeGreaterThanOrEqual(1);
    expect(readPhoto(id)).toBeNull();
  });
});
