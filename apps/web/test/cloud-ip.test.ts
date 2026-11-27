import { describe, expect, it } from "vitest";
import { boardDevice, cloudOf } from "../src/lib/cloud-ip";

/** 11-04: a page opened from a server room is filed under 爬虫 on the live board. */
describe("机房地址", () => {
  it("knows the 11-04 scanners' networks and leaves home / mobile networks alone", () => {
    expect(cloudOf("43.163.82.87")).toBe("腾讯云");
    expect(cloudOf("170.106.199.215")).toBe("腾讯云");
    expect(cloudOf("159.138.96.188")).toBe("华为云");
    expect(cloudOf("3.5.140.2")).toBe("AWS");
    expect(cloudOf("27.187.57.91")).toBeNull();   // a home line in Hebei
    expect(cloudOf("36.229.105.145")).toBeNull(); // Chunghwa Telecom
    expect(cloudOf("2001:b400:e75d:60cb:2876:473b:a95b:3f8d")).toBeNull();
    expect(cloudOf("")).toBeNull();
    expect(cloudOf("not-an-ip")).toBeNull();
  });
  it("the board's device line", () => {
    expect(boardDevice("43.163.82.87", "phone", "iPhone")).toEqual({ device: "bot", model: "机房 · 腾讯云 · iPhone", human: false });
    expect(boardDevice("27.187.57.91", "desktop", "Windows · Chrome")).toEqual({ device: "desktop", model: "Windows · Chrome", human: false });
    // a reader on a VPN in a data centre who casts or signs in stays a person
    expect(boardDevice("43.163.82.87", "phone", "iPhone", true)).toEqual({ device: "phone", model: "iPhone · 机房网络 腾讯云（多半是 VPN）", human: true });
  });
  it("11-06: our own patrol (Anthropic 160.79.104.0/21) is named, not filed under Google Cloud", () => {
    for (const ip of ["160.79.104.0", "160.79.106.35", "160.79.111.255"]) expect(cloudOf(ip)).toBe("自家 AI 巡检（Anthropic）");
    expect(cloudOf("160.79.112.0")).not.toBe("自家 AI 巡检（Anthropic）");
    expect(boardDevice("160.79.106.35", "desktop", "Linux · Chrome").model).toBe("机房 · 自家 AI 巡检（Anthropic） · Linux · Chrome");
  });
  it("11-27: on a home line, a two-year-old desktop browser or a blocked stylesheet is a 爬虫 until it does what a person does", () => {
    const OLD = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36";
    const NEW = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";
    expect(boardDevice("27.187.57.91", "desktop", "Windows · Chrome", false, { ua: OLD })).toEqual({ device: "bot", model: "自动化浏览器 · 旧版本 · Windows · Chrome", human: false });
    expect(boardDevice("27.187.57.91", "desktop", "Windows · Chrome", false, { ua: NEW }).device).toBe("desktop");
    expect(boardDevice("27.187.57.91", "desktop", "Windows · Chrome", false, { ua: NEW, sheetBlocked: true }).device).toBe("bot");
    expect(boardDevice("27.187.57.91", "desktop", "Windows · Chrome", true, { ua: OLD, sheetBlocked: true })).toEqual({ device: "desktop", model: "Windows · Chrome", human: true });
  });
  it("11-27: Lightpanda and automation drivers are bots by user agent", async () => {
    const { deviceFromUA } = await import("../src/lib/presence");
    for (const ua of ["Lightpanda/1.0", "Mozilla/5.0 (X11; Linux x86_64) PhantomJS/2.1.1", "Mozilla/5.0 jsdom/22.1.0"]) expect(deviceFromUA(ua)).toBe("bot");
    expect(deviceFromUA("Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148")).toBe("phone");
  });
});
