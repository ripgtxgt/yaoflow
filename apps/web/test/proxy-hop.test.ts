import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { isHopping, netOf, noteHop, resetHops, HOP_WINDOW_MS } from "../src/lib/proxy-hop";
import { POST as trackPOST } from "../src/app/api/track/route";
import { readEvents } from "../src/lib/analytics-server";

/** 10-28 (Neil: 「访客 m9d4 页面报错 …」→「要，加吧，我们能把这种屏蔽掉吗」): page errors of a session hopping between proxies stay off the board. */
describe("a session hopping between countries", () => {
  afterEach(() => { resetHops(); vi.useRealTimers(); delete process.env.TRACK_ERROR_HOLD_MS; });

  it("the rule: two countries, or three networks, within two minutes", () => {
    const t = 1_000_000;
    expect(noteHop("s1", "TW", "1.2.3.4", t)).toBe(false);
    expect(noteHop("s1", "TW", "1.2.9.9", t + 1000)).toBe(false);   // same country, same network: a reader
    expect(noteHop("s1", "TW", "5.6.7.8", t + 2000)).toBe(false);   // wifi → cellular, still one country
    expect(noteHop("s2", "TH", "27.130.113.43", t)).toBe(false);
    expect(noteHop("s2", "VN", "2402:800:614a::1", t + 500)).toBe(true);
    expect(noteHop("s3", null, "27.130.1.1", t)).toBe(false);
    expect(noteHop("s3", null, "173.183.1.1", t + 100)).toBe(false);
    expect(noteHop("s3", null, "47.237.1.1", t + 200)).toBe(true);  // no country from the edge: three networks
    // a reader who travels: the old country has aged out of the window
    expect(noteHop("s4", "TW", "1.2.3.4", t)).toBe(false);
    expect(noteHop("s4", "JP", "9.9.9.9", t + HOP_WINDOW_MS + 1)).toBe(false);
    expect(noteHop("anon", "TW", null, t) || noteHop("anon", "JP", null, t)).toBe(false);
    expect(noteHop("nosession", "TW", null, t) || noteHop("nosession", "JP", null, t)).toBe(false);
    expect(netOf("2001:fb1:55:9de8::1")).toBe("2001:fb1");
    expect(netOf("27.130.113.43")).toBe("27.130");
    expect(isHopping("nobody")).toBe(false);
  });

  it("through the route: m9d4's two errors (Thailand, then Vietnam, the same second) never reach the events; a reader's does", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const post = (body: Record<string, unknown>, country: string, ip: string) => trackPOST(new NextRequest("http://localhost/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json", "cf-ipcountry": country, "cf-connecting-ip": ip, "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36" },
      body: JSON.stringify(body),
    }));
    const bot = "hopbot" + Date.now().toString(36).slice(-6);
    const reader = "hoprdr" + Date.now().toString(36).slice(-6);
    await post({ e: "client_error", s: bot, path: "/zh/gua/19-lin", locale: "zh", method: "global:Loading chunk 853", msg: "ChunkLoadError: Loading chunk 8530 failed." }, "TH", "2001:fb1:55:9de8::1");
    await post({ e: "client_error", s: bot, path: "/zh/gua/19-lin", locale: "zh", method: "res:SCRIPT error-0c33738", msg: "SCRIPT error-0c3373877881dd2a.js →reload" }, "VN", "2402:800:614a:2d9c::1");
    await post({ e: "client_error", s: reader, path: "/zh-hant/cast", locale: "zh-hant", method: "res:SCRIPT 3122-8d7f83bb", msg: "SCRIPT 3122-8d7f83bb442f8856.js" }, "TW", "1.2.3.4");
    // held: nothing yet
    expect(readEvents(1).filter((e) => e.s === bot || e.s === reader)).toEqual([]);
    vi.advanceTimersByTime(9_000);
    const got = readEvents(1).filter((e) => e.s === bot || e.s === reader);
    expect(got.map((e) => [e.s, e.method])).toEqual([[reader, "res:SCRIPT 3122-8d7f83bb"]]);
  });
});
