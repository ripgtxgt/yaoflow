import { describe, expect, it } from "vitest";

/** 11-27 (Sakura：「现在所有的访客都在后台看不到设备和访客足迹了吗？」): after a restart the board fills device, country and who from the database. */
const { record } = await import("../src/lib/analytics-server");
const { db } = await import("../src/lib/db");
const { ipsOf } = await import("../src/lib/browser-net");
const { snapshot, touch } = await import("../src/lib/presence");
ipsOf(["none"]); // creates browser_net

describe("实时在线：重启后补回设备", () => {
  it("a replayed tab gets its browser's device, country, model and customer back; a stale desktop browser is a 爬虫", () => {
    const now = Date.now();
    const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";
    const OLD = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36";
    const net = db().prepare("INSERT INTO browser_net (bid, ip, ua_key, first_at, last_at, hits, country, device, ua) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)");
    net.run("prphone000000001", "36.229.105.145", "a", now - 60_000, now - 60_000, "TW", "phone", IPHONE);
    net.run("prold00000000001", "186.96.1.2", "b", now - 60_000, now - 60_000, "VE", "desktop", OLD);
    db().prepare("INSERT INTO browser_links (bid, customer_id, first_at, last_at, how) VALUES (?, 4242, ?, ?, 'signed-in')").run("prphone000000001", now, now);
    record({ t: now - 50_000, e: "page_view", s: "prtabphone001", b: "prphone000000001", path: "/zh-hant/cast", locale: "zh-hant" } as never);
    record({ t: now - 40_000, e: "page_view", s: "prtabold00001", b: "prold00000000001", path: "/ja/huangli/2026-08-21", locale: "ja" } as never);
    (globalThis as unknown as { __yfPresence?: unknown }).__yfPresence = undefined; // a restart
    touch({ s: "prtabother001", t: now, e: "pulse", path: "/en" });
    const rows = snapshot(now).rows as unknown as { s: string; device: string | null; country: string | null; knownId: number | null; bot: boolean }[];
    const phone = rows.find((r) => r.s === "prtabphone001")!;
    expect(phone).toMatchObject({ device: "phone", country: "TW", knownId: 4242 });
    const old = rows.find((r) => r.s === "prtabold00001")!;
    expect(old).toMatchObject({ device: "bot", country: "VE" });
  });
});
