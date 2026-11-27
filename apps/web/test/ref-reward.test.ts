import { describe, expect, it } from "vitest";
import { db, linkBrowserForTest, shareRefForSession, upsertCustomer } from "./ref-reward-helpers";
import { openRefLight, refRewardOnFirstCast, refRewardStats, REF_REWARD_MONTH_CAP, taipeiMonthStart } from "../src/lib/ref-reward";
import { afterContext, redeemCaseLight } from "../src/lib/grants";

/** 10-14 进度表 47: a friend's first cast through a share link earns both sides one light reading */
const SITE = "https://yaoflow.com";
let n = 0;
function firstCast(bid: string) {
  const now = Date.now() + n++;
  db().prepare("INSERT INTO cast_log (bid, at, values_str, primary_num, created_at, updated_at) VALUES (?,?,?,?,?,?)").run(bid, now, "789878", 1, now, now);
}
const bid = () => (Math.random().toString(16).slice(2) + "0000000000000000").slice(0, 16);

describe("推荐回馈", () => {
  const sharer = upsertCustomer("ref47-sharer@example.com", "zh-hant");
  const ref = shareRefForSession("cs_ref47_1", sharer, "dev-sharer");

  it("a new browser's first cast: friend and sharer each get a light reading, once", () => {
    const b = bid(); firstCast(b);
    const o = refRewardOnFirstCast({ ref, bid: b, device: "dev-friend", customerId: null, email: null, locale: "zh-hant", site: SITE });
    expect(o.state).toBe("granted");
    if (o.state !== "granted") return;
    expect(o.sharer).toBe("granted");
    expect(o.friendUrl).toMatch(/\/zh-hant\/cast\?after=[0-9a-f]{36}$/);
    expect(refRewardOnFirstCast({ ref, bid: b, device: "dev-friend", customerId: null, email: null, locale: "zh-hant", site: SITE })).toEqual({ state: "skip", why: "done" });
    // both show up where the cast page looks
    expect(openRefLight({ bid: b, customerId: null, site: SITE, locale: "zh-hant" }).map((x) => x.side)).toEqual(["friend"]);
    expect(openRefLight({ bid: null, customerId: sharer, site: SITE, locale: "zh-hant" }).some((x) => x.side === "sharer")).toBe(true);
    // spent through the case-light door, as a light reading on a new matter
    const token = o.friendUrl.split("after=")[1]!;
    expect(afterContext(token)?.kind).toBe("ref");
    const r = redeemCaseLight(token, { question: "q" }, "ref47-friend@example.com", null, "zh-hant");
    expect(r.ok).toBe(true);
    expect(afterContext(token)?.state).toBe("used");
  });

  it("not for a second cast, the sharer's own browser, device, account or address", () => {
    const old = bid(); firstCast(old); firstCast(old);
    expect(refRewardOnFirstCast({ ref, bid: old, device: null, customerId: null, email: null, locale: "zh", site: SITE })).toEqual({ state: "skip", why: "not_new" });
    const b1 = bid(); firstCast(b1);
    expect(refRewardOnFirstCast({ ref, bid: b1, device: "dev-sharer", customerId: null, email: null, locale: "zh", site: SITE })).toEqual({ state: "skip", why: "self" });
    const b2 = bid(); firstCast(b2); linkBrowserForTest(b2, sharer);
    expect(refRewardOnFirstCast({ ref, bid: b2, device: null, customerId: null, email: null, locale: "zh", site: SITE })).toEqual({ state: "skip", why: "self" });
    const b3 = bid(); firstCast(b3);
    expect(refRewardOnFirstCast({ ref, bid: b3, device: null, customerId: sharer, email: null, locale: "zh", site: SITE })).toEqual({ state: "skip", why: "self" });
    const twin = upsertCustomer("ref47-twin@example.com", "zh");
    db().prepare("UPDATE customers SET alt_emails = ? WHERE id = ?").run("ref47-sharer@example.com", twin);
    const b4 = bid(); firstCast(b4);
    expect(refRewardOnFirstCast({ ref, bid: b4, device: null, customerId: twin, email: "ref47-twin@example.com", locale: "zh", site: SITE })).toEqual({ state: "skip", why: "self" });
    expect(refRewardOnFirstCast({ ref: "zzzzzzzz", bid: bid(), device: null, customerId: null, email: null, locale: "zh", site: SITE }).state).toBe("skip");
  });

  it("the sharer earns five a Taipei month; friends past that still get theirs", () => {
    const s2 = upsertCustomer("ref47-busy@example.com", "zh");
    const r2 = shareRefForSession("cs_ref47_busy", s2, null);
    const got: string[] = [];
    for (let i = 0; i < REF_REWARD_MONTH_CAP + 2; i++) {
      const b = bid(); firstCast(b);
      const o = refRewardOnFirstCast({ ref: r2, bid: b, device: null, customerId: null, email: null, locale: "zh", site: SITE });
      got.push(o.state === "granted" ? o.sharer : o.state);
    }
    expect(got.filter((x) => x === "granted")).toHaveLength(REF_REWARD_MONTH_CAP);
    expect(got.filter((x) => x === "capped")).toHaveLength(2);
    const s = refRewardStats(Date.now() - 86_400_000);
    expect(s.capped).toBeGreaterThanOrEqual(2);
    expect(s.friends).toBeGreaterThanOrEqual(REF_REWARD_MONTH_CAP + 2);
    // month boundary in Taipei: 10-01 00:00 +08 is 09-30 16:00 UTC
    expect(new Date(taipeiMonthStart(Date.UTC(2026, 9, 14))).toISOString()).toBe("2026-09-30T16:00:00.000Z");
  });

  it("off switch", () => {
    process.env.REF_FIRST_CAST = "off";
    const b = bid(); firstCast(b);
    expect(refRewardOnFirstCast({ ref, bid: b, device: null, customerId: null, email: null, locale: "zh", site: SITE })).toEqual({ state: "skip", why: "off" });
    delete process.env.REF_FIRST_CAST;
  });
});
