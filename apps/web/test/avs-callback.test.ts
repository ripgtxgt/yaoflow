// DATA_DIR is a fresh temp dir (test/setup.ts)
import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { avsSignature, avsVideo, avsVideos, parseAvsCallback, saveAvsCallback, verifyAvsSignature } from "@/lib/avs";
import { POST } from "@/app/api/avs/callback/route";

const TOKEN = "test-token-0123456789abcdef";
const body = (over: Record<string, unknown> = {}) => JSON.stringify({
  id: "xv_test000001", external_id: "yf-test-1", status: "rendering", lang: "zh", title: "试片", note: null, error: null, result: null,
  caption: { title: "t" }, event: "status", ...over,
});
const call = (raw: string, sig: string | null) =>
  POST(new NextRequest("http://127.0.0.1:3200/api/avs/callback", { method: "POST", body: raw, headers: sig ? { "x-avs-signature": sig } : {} }));

afterEach(() => { delete process.env.AVS_EXT_TOKEN; });

describe("avs 回调验签", () => {
  it("matches HMAC-SHA256 over the raw body, and only that", () => {
    const raw = body();
    const sig = avsSignature(raw, TOKEN);
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(verifyAvsSignature(raw, sig, TOKEN)).toBe(true);
    expect(verifyAvsSignature(raw, sig.toUpperCase().replace("SHA256", "sha256"), TOKEN)).toBe(true);
    expect(verifyAvsSignature(raw + " ", sig, TOKEN)).toBe(false);          // one byte off
    expect(verifyAvsSignature(raw, sig, TOKEN + "x")).toBe(false);          // another key
    expect(verifyAvsSignature(raw, sig.slice(7), TOKEN)).toBe(false);       // no sha256= prefix
    expect(verifyAvsSignature(raw, "sha256=abcd", TOKEN)).toBe(false);
    expect(verifyAvsSignature(raw, null, TOKEN)).toBe(false);
    expect(verifyAvsSignature(raw, sig, undefined)).toBe(false);
    expect(verifyAvsSignature(raw, sig, "")).toBe(false);
  });
});

describe("POST /api/avs/callback", () => {
  it("refuses everything without the token", async () => {
    const raw = body();
    expect((await call(raw, avsSignature(raw, TOKEN))).status).toBe(503);
  });

  it("401 on a missing or wrong signature and keeps nothing", async () => {
    process.env.AVS_EXT_TOKEN = TOKEN;
    const raw = body({ id: "xv_unsigned0001" });
    expect((await call(raw, null)).status).toBe(401);
    expect((await call(raw, avsSignature(raw, "other"))).status).toBe(401);
    expect((await call(raw + "\n", avsSignature(raw, TOKEN))).status).toBe(401);
    expect(avsVideo("xv_unsigned0001")).toBeNull();
  });

  it("keeps the latest status and the result once ready", async () => {
    process.env.AVS_EXT_TOKEN = TOKEN;
    const a = body();
    const r1 = await call(a, avsSignature(a, TOKEN));
    expect(r1.status).toBe(200);
    expect(await r1.json()).toMatchObject({ received: true, id: "xv_test000001", status: "rendering" });
    expect(avsVideo("xv_test000001")).toMatchObject({ status: "rendering", external_id: "yf-test-1", lang: "zh", calls: 1, ready_at: null });

    const b = body({ status: "ready", result: { video_url: "/api/ext/v1/videos/xv_test000001/file", cover_url: "/c", duration_s: 31.5, local_path: "/opt/avs/out/x.mp4", ai_generated: true } });
    expect((await call(b, avsSignature(b, TOKEN))).status).toBe(200);
    const row = avsVideo("xv_test000001")!;
    expect(row).toMatchObject({ status: "ready", video_url: "/api/ext/v1/videos/xv_test000001/file", duration_s: 31.5, local_path: "/opt/avs/out/x.mp4", calls: 2 });
    expect(row.ready_at).toBeGreaterThan(0);
    expect(JSON.parse(row.body).event).toBe("status");
    expect(avsVideos().some((v) => v.id === "xv_test000001")).toBe(true);
  });

  it("a repeat of the same status is kept but not a change; a signed body that is no order is ignored", async () => {
    expect(saveAvsCallback(JSON.parse(body({ id: "xv_repeat00001" })), body({ id: "xv_repeat00001" }))).toMatchObject({ changed: true });
    expect(saveAvsCallback(JSON.parse(body({ id: "xv_repeat00001" })), body({ id: "xv_repeat00001" }))).toMatchObject({ changed: false });
    expect(saveAvsCallback(JSON.parse(body({ id: "xv_repeat00001", status: "rejected", note: "口型不对" })), "{}")).toMatchObject({ changed: true, status: "rejected" });
    expect(avsVideo("xv_repeat00001")).toMatchObject({ note: "口型不对", calls: 3 });
    expect(parseAvsCallback({ status: "ready" })).toBeNull();
    expect(parseAvsCallback({ id: "../etc", status: "ready" })).toBeNull();
    process.env.AVS_EXT_TOKEN = TOKEN;
    const raw = JSON.stringify({ hello: 1 });
    const res = await call(raw, avsSignature(raw, TOKEN));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ignored: true });
    const bad = "not json";
    expect((await call(bad, avsSignature(bad, TOKEN))).status).toBe(400);
  });
});
