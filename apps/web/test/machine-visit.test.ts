import { describe, expect, it } from "vitest";

/** 11-06 (Neil：「今天的独立访客是不是加了爬虫的数据呢」→「要」): link checkers on server-room networks are not visitors. */
const { db } = await import("../src/lib/db");
const { machineBrowsers } = await import("../src/lib/machine-visit");
const { computeStats } = await import("../src/lib/analytics-server");
const { ipsOf } = await import("../src/lib/browser-net");
ipsOf(["none"]); // creates the table

const NOW = Date.now();
const net = (bid: string, ip: string) =>
  db().prepare("INSERT INTO browser_net (bid, ip, ua_key, first_at, last_at, hits) VALUES (?, ?, 'k', ?, ?, 1)").run(bid, ip, NOW, NOW);
const vd = (s: string, b: string) => ({ t: NOW, e: "visit_day", s, b, fd: "2026-11-06", td: "2026-11-06", locale: "zh-hant" });

describe("机房访问不算独立访客", () => {
  it("a server-room browser that only looked is a machine; one that cast, one on a home line, one with no address are visitors", () => {
    net("mvbot0000000001", "43.163.82.87");   // 腾讯云
    net("mvbot0000000002", "159.138.96.188"); // 华为云
    net("mvcast000000001", "43.163.82.88");   // 腾讯云, but it cast — a reader on a VPN
    net("mvhome000000001", "36.229.105.145"); // Chunghwa Telecom
    net("mvmix0000000001", "43.163.82.89");   // seen on a cloud address and a home line — a person
    net("mvmix0000000001", "36.229.105.146");
    const evs = [
      vd("s1", "mvbot0000000001"), vd("s2", "mvbot0000000002"), vd("s3", "mvcast000000001"),
      { t: NOW + 1, e: "cast_complete", s: "s3", b: "mvcast000000001" },
      vd("s4", "mvhome000000001"), vd("s5", "mvmix0000000001"), vd("s6", "mvnoaddr0000001"),
    ];
    expect([...machineBrowsers(evs)].sort()).toEqual(["mvbot0000000001", "mvbot0000000002"]);
    const f = computeStats(evs as never, undefined, { full: true }).funnel;
    expect(f.visitors).toBe(4);
    expect(f.machineVisitors).toBe(2);
  });

  it("a browser linked to a customer is a person even from a server room", () => {
    net("mvlinked0000001", "43.163.82.90");
    db().prepare("INSERT INTO browser_links (bid, customer_id, first_at, last_at, how) VALUES (?, 1, ?, ?, 'signed-in')").run("mvlinked0000001", NOW, NOW);
    expect(machineBrowsers([vd("s7", "mvlinked0000001")]).size).toBe(0);
  });

  it("11-08: the browsers-table variant (按人看) — quiet, unlinked, cloud-only browsers are machines", async () => {
    const { machineBids } = await import("../src/lib/machine-visit");
    const ins = db().prepare("INSERT INTO browsers (bid, first_at, last_at, days, casts, clicks, checkouts) VALUES (?, ?, ?, 1, ?, 0, 0)");
    ins.run("mvbot0000000001", NOW, NOW, 0);
    ins.run("mvcast000000001", NOW, NOW, 1);
    ins.run("mvhome000000001", NOW, NOW, 0);
    expect([...machineBids(["mvbot0000000001", "mvcast000000001", "mvhome000000001", "mvlinked0000001"])]).toEqual(["mvbot0000000001"]);
  });
});

