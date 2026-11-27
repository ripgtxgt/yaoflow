import { beforeEach, describe, expect, it } from "vitest";
import { _resetPresence, deviceFromUA, isTabEvent, ONLINE_MS, snapshot, touch } from "../src/lib/presence";
import { eventLabel, pageLabel, spanLabel } from "../src/lib/live-labels";
import { upsertCustomer, upsertSubscription } from "../src/lib/db";

const T0 = Date.UTC(2026, 9, 2, 6, 0, 0);
const DAY = 86_400_000;

/** 实时在线 (10-02): one row per tab, from tracked events and heartbeats; the board's numbers */
describe("实时在线", () => {
  beforeEach(() => _resetPresence());

  it("a tab's page, dwell, pages, last action and trail follow its signals; a heartbeat keeps it online", () => {
    touch({ s: "abcd1234", t: T0, e: "page_view", path: "/zh-hant", locale: "zh-hant", vt: "n", vn: 1, device: "phone", country: "TW" });
    touch({ s: "abcd1234", t: T0 + 20_000, e: "heat_click", path: "/zh-hant", method: "home-begin" });
    touch({ s: "abcd1234", t: T0 + 25_000, e: "page_view", path: "/zh-hant/cast", locale: "zh-hant" });
    touch({ s: "abcd1234", t: T0 + 55_000, e: "pulse", path: "/zh-hant/cast" });
    touch({ s: "abcd1234", t: T0 + 85_000, e: "pulse", path: "/zh-hant/cast" });
    const snap = snapshot(T0 + 100_000);
    expect(snap.online).toBe(1);
    expect(snap.newToday).toBe(1);
    expect(snap.returning).toBe(0);
    expect(snap.byLocale).toEqual({ "zh-hant": 1 });
    expect(snap.byDevice).toEqual({ phone: 1 });
    const r = snap.rows[0]!;
    expect(r.path).toBe("/zh-hant/cast");
    expect(r.landing).toBe("/zh-hant");
    expect(r.pages).toBe(2);
    expect(r.onPageMs).toBe(75_000);
    expect(r.sessionMs).toBe(85_000);
    expect(r.hidden).toBe(false);
    expect(r.last?.e).toBe("page_view"); // pulses are not actions
    expect(r.trail.map((x) => x.e)).toEqual(["page_view", "heat_click", "page_view"]);
    expect(r.country).toBe("TW");
    // the feed has the actions, not the pulses or leaves
    expect(snap.feed.map((f) => f.e)).toEqual(["page_view", "heat_click", "page_view"]);
  });

  it("hidden tab, late leave for an earlier page, and going offline after ONLINE_MS", () => {
    touch({ s: "tab00001", t: T0, e: "page_view", path: "/en" });
    touch({ s: "tab00001", t: T0 + 10_000, e: "page_view", path: "/en/cast" });
    // the leave for /en arrives after the view of /en/cast (two keepalive requests racing): says nothing about now
    touch({ s: "tab00001", t: T0 + 10_500, e: "page_leave", path: "/en" });
    expect(snapshot(T0 + 11_000).rows[0]!.hidden).toBe(false);
    // the tab goes to the background
    touch({ s: "tab00001", t: T0 + 30_000, e: "page_leave", path: "/en/cast" });
    let r = snapshot(T0 + 40_000).rows[0]!;
    expect(r.hidden).toBe(true);
    expect(r.online).toBe(true);
    expect(r.onPageMs).toBe(20_000); // dwell stops when they switch away
    // back
    touch({ s: "tab00001", t: T0 + 50_000, e: "pulse", path: "/en/cast" });
    expect(snapshot(T0 + 51_000).rows[0]!.hidden).toBe(false);
    // silence
    r = snapshot(T0 + 50_000 + ONLINE_MS + 1).rows[0]!;
    expect(r.online).toBe(false);
    const snap = snapshot(T0 + 50_000 + ONLINE_MS + 1);
    expect(snap.online).toBe(0);
    expect(snap.recent).toBe(1);
  });

  it("signed-in and member rows, bots kept out of the count, anonymous tags never shown as people", () => {
    const cid = upsertCustomer("live-member@example.com", "zh-hant");
    upsertSubscription({ customerId: cid, stripeCustomerId: "cus_live", stripeSubscriptionId: "sub_live", status: "active", plan: "month", periodStart: T0 - DAY, periodEnd: T0 + 29 * DAY, cancelAtPeriodEnd: false, currency: "TWD", amountMinor: 26900 });
    const guest = upsertCustomer("live-guest@example.com", "en");
    touch({ s: "member01", t: T0, e: "page_view", path: "/zh-hant/account", vt: "r", vn: 7, customer: { id: cid, email: "live-member@example.com" }, device: "desktop" });
    touch({ s: "guest001", t: T0, e: "page_view", path: "/en/cast", vt: "n", customer: { id: guest, email: "live-guest@example.com" }, device: "phone" });
    touch({ s: "anon0001", t: T0, e: "page_view", path: "/ja", vt: "n", device: "phone" });
    touch({ s: "googlebt", t: T0, e: "page_view", path: "/en/gua/1-qian", device: "bot" });
    const snap = snapshot(T0 + 1000);
    expect(snap.online).toBe(3);
    expect(snap.members).toBe(1);
    expect(snap.signedIn).toBe(2);
    expect(snap.newToday).toBe(2);
    expect(snap.returning).toBe(1);
    const m = snap.rows.find((r) => r.s === "member01")!;
    expect(m.member).toBe(true);
    expect(m.who).toBe("live-member");
    expect(m.vn).toBe(7);
    const g = snap.rows.find((r) => r.s === "guest001")!;
    expect(g.member).toBe(false);
    const a = snap.rows.find((r) => r.s === "anon0001")!;
    expect(a.who).toBeNull();
    expect(a.customerId).toBeNull();
    expect(snap.rows.find((r) => r.s === "googlebt")!.bot).toBe(true);
    expect(snap.byPage.map((p) => p.path).sort()).toEqual(["/en/cast", "/ja", "/zh-hant/account"]);
    // nothing in a snapshot carries a full address
    expect(JSON.stringify(snap)).not.toContain("@example.com");
  });

  it("device classes and labels", () => {
    expect(deviceFromUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1")).toBe("phone");
    expect(deviceFromUA("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15")).toBe("tablet");
    expect(deviceFromUA("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36")).toBe("desktop");
    expect(deviceFromUA("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe("bot");
    expect(deviceFromUA("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36")).toBe("phone");
    expect(deviceFromUA(null)).toBeNull();
    expect(pageLabel("/zh-hant/gua/1-qian")).toEqual({ locale: "zh-hant", rest: "/gua/1-qian", label: "卦页" });
    expect(pageLabel("/en")).toEqual({ locale: "en", rest: "/", label: "首页" });
    expect(pageLabel("/ja/reading?sid=x").label).toBe("解读页");
    expect(pageLabel("/zh/matter/45").label).toBe("这件事");
    expect(eventLabel("heat_click", "reading-matter")).toBe("点了「这件事（解读页卡）」");
    expect(eventLabel("heat_click", "some-new-thing")).toBe("点了「some-new-thing」");
    expect(eventLabel("reading_click", null, "deep")).toBe("点了深断");
    expect(eventLabel("cast_complete")).toBe("六爻摇完");
    expect(spanLabel(4_000)).toBe("4 秒");
    expect(spanLabel(125_000)).toBe("2 分 05 秒");
    expect(spanLabel(3_720_000)).toBe("1 小时 02 分");
  });

  it("the replay after a deploy leaves out what the server records under an order's id (no made-up visitors)", () => {
    expect(isTabEvent({ e: "purchase", s: "a1b2c3d4e5f6" })).toBe(false);
    expect(isTabEvent({ e: "gift_claimed", s: "a1b2c3d4e5f6" })).toBe(false);
    expect(isTabEvent({ e: "seal_watch", s: "seal42" })).toBe(false);
    expect(isTabEvent({ e: "seal_watch", s: "k3j4h5g6f7d8" })).toBe(true);
    expect(isTabEvent({ e: "page_view", s: "k3j4h5g6f7d8" })).toBe(true);
    expect(isTabEvent({ e: "sub_redeem", s: "k3j4h5g6f7d8" })).toBe(true);
  });
});
