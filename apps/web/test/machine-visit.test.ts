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

  it("11-27: a quiet browser on a home line is a machine when its user agent is a bot's or two years stale, or it blocked our stylesheet", async () => {
    const { machineUa } = await import("../src/lib/machine-visit");
    const at = Date.UTC(2026, 10, 27);
    const ua = (bid: string, ip: string, u: string) =>
      db().prepare("INSERT INTO browser_net (bid, ip, ua_key, first_at, last_at, hits, ua) VALUES (?, ?, ?, ?, ?, 1, ?)").run(bid, ip, u, NOW, NOW, u);
    const OLD_CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36";
    const OLD_FF = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0";
    const NEW_CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";
    const WIN7 = "Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36";
    const OLD_PHONE = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Mobile Safari/537.36";
    const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/150.0.0.0 Safari/537.36";
    expect(machineUa(OLD_CHROME, at)).toBe("stale");
    expect(machineUa(OLD_FF, at)).toBe("stale");
    expect(machineUa(GOOGLEBOT, at)).toBe("bot-ua");
    expect(machineUa(NEW_CHROME, at)).toBeNull();
    expect(machineUa(WIN7, at)).toBeNull();
    expect(machineUa(OLD_PHONE, at)).toBeNull();

    ua("mvstale00000001", "126.12.1.2", OLD_CHROME);
    ua("mvbotua00000001", "126.12.1.3", GOOGLEBOT);
    ua("mvwin7000000001", "126.12.1.4", WIN7);
    ua("mvmixua00000001", "126.12.1.5", OLD_CHROME); // also seen with a current browser — a person
    ua("mvmixua00000001", "126.12.1.5", NEW_CHROME);
    ua("mvstalecast0001", "126.12.1.6", OLD_CHROME); // stale, but it cast
    ua("mvsheet00000001", "126.12.1.7", NEW_CHROME); // current browser, blocked our font sheet
    ua("mvsheetold00001", "126.12.1.8", NEW_CHROME); // a font-sheet error from the hydration-ish path that is not ours
    const evs = [
      vd("t1", "mvstale00000001"), vd("t2", "mvbotua00000001"), vd("t3", "mvwin7000000001"), vd("t4", "mvmixua00000001"),
      vd("t5", "mvstalecast0001"), { t: NOW + 1, e: "cast_complete", s: "t5", b: "mvstalecast0001" },
      vd("t6", "mvsheet00000001"), { t: NOW + 1, e: "client_error", s: "t6", b: "mvsheet00000001", method: "res:LINK jp.css?v=cb97eb" },
      vd("t7", "mvsheetold00001"), { t: NOW + 1, e: "client_error", s: "t7", b: "mvsheetold00001", method: "res:SCRIPT page-1a2b.js" },
    ];
    expect([...machineBrowsers(evs, at)].sort()).toEqual(["mvbotua00000001", "mvsheet00000001", "mvstale00000001"]);
  });

  it("11-27: a self-declared bot that runs our scripts gets an address row (it used to leave none and count as a person)", async () => {
    const { netFacts } = await import("../src/lib/browser-net");
    const f = netFacts(new Headers({ "cf-connecting-ip": "66.249.66.1", "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" }));
    expect(f?.device).toBe("bot");
  });
});
