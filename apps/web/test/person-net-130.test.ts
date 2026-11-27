import { describe, expect, it, beforeAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** 10-31 进度表 130: address/device per browser, similar traces, the profile, the audience. */
beforeAll(() => { process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "yf-net-")); });

const h = (o: Record<string, string>) => new Headers(o);
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Barcelona 389.0.0.0 iPhone16,2";
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

describe("130 网络与设备", () => {
  it("records address, place and device; files bots as bots (11-27); throttles; finds twins; scrubs after 180 days", async () => {
    const { noteNet, netOf, twinsOf, scrubNet, resetNetThrottle, netFacts } = await import("../src/lib/browser-net");
    const t0 = Date.UTC(2026, 9, 31, 4);
    expect(netFacts(h({ "cf-connecting-ip": "1.2.3.4", "user-agent": "Googlebot/2.1" }))?.device).toBe("bot");
    noteNet("botbotbotbotbotb", h({ "cf-connecting-ip": "1.2.3.4", "user-agent": "Googlebot/2.1" }), t0); // a bot on the same address is no twin
    const a = h({ "cf-connecting-ip": "1.2.3.4", "cf-ipcountry": "TW", "cf-ipcity": "Taipei", "cf-region": "Taipei City", "cf-timezone": "Asia/Taipei", "user-agent": IPHONE, "accept-language": "zh-TW,zh;q=0.9" });
    noteNet("aaaaaaaaaaaaaaaa", a, t0);
    noteNet("aaaaaaaaaaaaaaaa", a, t0 + 60_000); // throttled
    noteNet("bbbbbbbbbbbbbbbb", h({ "cf-connecting-ip": "1.2.3.4", "cf-ipcountry": "TW", "user-agent": CHROME }), t0 + 120_000);
    const rows = netOf(["aaaaaaaaaaaaaaaa"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ip: "1.2.3.4", country: "TW", city: "Taipei", region: "Taipei City", tz: "Asia/Taipei", device: "phone", hits: 1, lang: "zh-TW" });
    expect(rows[0]!.app).toContain("Threads");
    const tw = twinsOf(["aaaaaaaaaaaaaaaa"], t0 + 200_000);
    expect(tw.map((x) => x.bid)).toEqual(["bbbbbbbbbbbbbbbb"]);
    expect(tw[0]!.why).toContain("1.2.3.4");
    resetNetThrottle();
    expect(scrubNet(t0 + 181 * 86_400_000)).toBe(3); // the bot row too
    expect(netOf(["aaaaaaaaaaaaaaaa"])[0]).toMatchObject({ ip: "", city: "Taipei", ua: null });
  });

  it("profile and audience read without data", async () => {
    const { personProfile, profileTags } = await import("../src/lib/person-profile");
    const p = personProfile(["aaaaaaaaaaaaaaaa"], null);
    expect(p.asks.casts).toBe(0);
    expect(p.device.models[0]?.[0]).toMatch(/iPhone/);
    expect(profileTags({ ...p, asks: { ...p.asks, casts: 12, topics: [["感情", 12]], contactShare: 0.5 }, money: { ...p.money, clicks: 3 } })).toEqual(expect.arrayContaining(["高频起卦（≥10 卦）", "专问感情", "等对方联络/想复合", "看价没买（价格敏感）"]));
    const { audience } = await import("../src/lib/admin-audience");
    const a = audience(60);
    expect(a.groups.map((g) => g.name)).toEqual(["付费读者", "高频没付（≥5 卦）", "全部起卦的人"]);
  });

  it("the privacy policy says it, in every language", async () => {
    const { PRIVACY } = await import("../src/lib/legal");
    const text = JSON.stringify(PRIVACY);
    for (const s of ["来访网络信息", "Server logs and visit network details", "ネットワーク情報", "방문 네트워크 정보", "données réseau de visite", "Netzwerkdaten des Besuchs", "datos de red de la visita", "dados de rede da visita", "來訪網路資訊", "180"]) expect(text).toContain(s);
    expect(text).not.toContain("inside Threads), in memory only");
  });
});
