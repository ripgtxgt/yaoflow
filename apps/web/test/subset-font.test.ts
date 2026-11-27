import { describe, expect, it } from "vitest";
import { isSfnt, subsetFont } from "../src/lib/carousel";

const ttf = () => { const b = new Uint8Array(64); b.set([0, 1, 0, 0]); return b.buffer; };
const html = () => new TextEncoder().encode("<!DOCTYPE html><html>Error 404</html>").buffer as ArrayBuffer;

// 10-15 23:42 (ur5f js:?): Google answered with an HTML page, it went to the renderer as a font and was cached
describe("字体子集：只认真字体、失败重试一次、坏结果不进缓存", () => {
  it("签名判断：TrueType / OTTO 是字体，HTML 不是", () => {
    expect(isSfnt(ttf())).toBe(true);
    const o = new Uint8Array(64); o.set([79, 84, 84, 79]);
    expect(isSfnt(o.buffer)).toBe(true);
    expect(isSfnt(html())).toBe(false);
  });
  it("第一次失败、第二次成功：拿到字体", async () => {
    let n = 0;
    const buf = await subsetFont("Test A", "卦一", async () => { n++; if (n === 1) throw new Error("not a font"); return ttf(); });
    expect(n).toBe(2);
    expect(isSfnt(buf)).toBe(true);
  });
  it("两次都失败：抛错，而且不缓存——下一次请求重新去取，取到就好了", async () => {
    let calls = 0;
    const bad = async () => { calls++; throw new Error("not a font"); };
    await expect(subsetFont("Test B", "籤二", bad)).rejects.toThrow();
    expect(calls).toBe(2);
    const good = await subsetFont("Test B", "籤二", async () => ttf());
    expect(isSfnt(good)).toBe(true);
  });
});
