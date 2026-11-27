import { describe, expect, it } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { BID_COOKIE, browserRow, browsersOfCustomer, customersOfBrowser, markCustomer, noteBrowserEvent, tabsOfBrowsers } from "../src/lib/browsers";
import { personFunnel, personTrail, peopleList } from "../src/lib/people";
import { record, readEvents, type TrackedEvent } from "../src/lib/analytics-server";
import { eraseCustomer, recordOrder, upsertCustomer } from "../src/lib/db";
import { POST as trackPOST } from "../src/app/api/track/route";
import { middleware } from "../src/middleware";
import { whoFrom, WHO_COOKIE } from "../src/lib/who-mark";
import { PRIVACY } from "../src/lib/legal";
import { PRIVACY_HANT } from "../src/lib/legal-hant";
import { LOCALES } from "../src/lib/locales";
import { homeDay } from "../src/lib/clock";

/** 10-03 按人看 (Neil: 「把一个人的标识从第一次进入，到第几天回访，第几次摇卦，都能精准的识别出来」→「做吧」→「1」) */

const H = 3_600_000;
const T0 = Date.now() - 26 * H; // yesterday (house clock): the trail's first day; its second day is today, an hour ago
const ev = (b: string, s: string, e: TrackedEvent["e"], t: number, more: Partial<TrackedEvent> = {}): TrackedEvent => ({ t, e, s, b, ...more });
/** what api/track does with one event: write it, count it */
const put = (x: TrackedEvent) => { record(x); noteBrowserEvent(x.b!, x); };

describe("浏览器编号", () => {
  it("the first page hands a browser its id, once", async () => {
    const res = await middleware(new NextRequest("http://localhost/zh-hant/cast"));
    const c = res.cookies.get(BID_COOKIE);
    expect(c?.value).toMatch(/^[0-9a-f]{16}$/);
    expect(c?.httpOnly).toBe(true);
    expect(c?.maxAge).toBe(400 * 86_400);
    const again = await middleware(new NextRequest("http://localhost/zh-hant/cast", { headers: { cookie: `${BID_COOKIE}=0123456789abcdef` } }));
    expect(again.cookies.get(BID_COOKIE)).toBeUndefined();
  });

  it("every tracked event carries it, and the browser's counters follow", async () => {
    const post = (b: Record<string, unknown>) => trackPOST(new NextRequest("http://localhost/api/track", {
      method: "POST", headers: { "content-type": "application/json", cookie: `${BID_COOKIE}=aaaaaaaaaaaa0001` }, body: JSON.stringify(b),
    }));
    await post({ e: "page_view", s: "ptab00000001", path: "/zh-hant/cast", c: "threads" });
    await post({ e: "visit_day", s: "ptab00000001", fd: "2026-09-26", pd: "2026-09-30", td: "2026-10-03" });
    await post({ e: "cast_complete", s: "ptab00000001", hex: 63 });
    await post({ e: "teaser_shown", s: "ptab00000001" });
    await post({ e: "reading_click", s: "ptab00000001", tier: "deep" });
    await post({ e: "reading_click", s: "ptab00000001", tier: "deep", method: "wallet_open" }); // not a second tap
    await post({ e: "checkout_start", s: "ptab00000001", tier: "deep" });
    const r = browserRow("aaaaaaaaaaaa0001")!;
    expect(r).toMatchObject({ first_c: "threads", first_day: "2026-09-26", days: 1, casts: 1, teased: 1, clicks: 1, checkouts: 1 });
    expect(tabsOfBrowsers(["aaaaaaaaaaaa0001"]).get("ptab00000001")).toBe("aaaaaaaaaaaa0001");
    expect(readEvents(1).filter((e) => e.s === "ptab00000001").every((e) => e.b === "aaaaaaaaaaaa0001")).toBe(true);
    // no cookie: no id on the event
    await trackPOST(new NextRequest("http://localhost/api/track", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ e: "page_view", s: "ptab00000002", path: "/en" }) }));
    expect(readEvents(1).find((e) => e.s === "ptab00000002")?.b).toBeUndefined();
  });

  it("a second visiting day counts once, however many pages", () => {
    const b = "aaaaaaaaaaaa0002";
    put(ev(b, "ptab00000003", "visit_day", T0, { fd: "2026-10-03", td: "2026-10-03" }));
    put(ev(b, "ptab00000003", "visit_day", T0 + 60_000, { fd: "2026-10-03", td: "2026-10-03" }));
    put(ev(b, "ptab00000004", "visit_day", T0 + 30 * H, { fd: "2026-10-03", pd: "2026-10-03", td: "2026-10-04" }));
    expect(browserRow(b)?.days).toBe(2);
  });
});

describe("归到客户名下", () => {
  it("paying / claiming / signing in files this browser under the customer (and leaves the board's mark)", () => {
    const cid = upsertCustomer("people-a@example.com", "zh-hant");
    const req = new NextRequest("http://localhost/api/pay-login", { headers: { cookie: `${BID_COOKIE}=bbbbbbbbbbbb0001` } });
    const res = markCustomer(req, NextResponse.json({ ok: true }), cid, "pay");
    expect(whoFrom(res.cookies.get(WHO_COOKIE)?.value)).toBe(cid);
    expect(browsersOfCustomer(cid).map((x) => x.bid)).toEqual(["bbbbbbbbbbbb0001"]);
    expect(customersOfBrowser("bbbbbbbbbbbb0001")).toMatchObject([{ customer_id: cid, email: "people-a@example.com", how: "pay" }]);
    // a browser with no id yet (the email link opened in Safari): it gets one, filed under them
    const res2 = markCustomer(new NextRequest("http://localhost/api/auth/verify"), NextResponse.json({ ok: true }), cid, "login");
    const minted = res2.cookies.get(BID_COOKIE)?.value;
    expect(minted).toMatch(/^[0-9a-f]{16}$/);
    expect(browsersOfCustomer(cid).map((x) => x.bid).sort()).toEqual(["bbbbbbbbbbbb0001", minted].sort());
  });

  it("erasing the customer leaves their browsers anonymous", () => {
    const cid = upsertCustomer("people-erase@example.com", "en");
    markCustomer(new NextRequest("http://localhost/x", { headers: { cookie: `${BID_COOKIE}=bbbbbbbbbbbb0002` } }), NextResponse.json({}), cid, "login");
    expect(browsersOfCustomer(cid)).toHaveLength(1);
    eraseCustomer(cid);
    expect(customersOfBrowser("bbbbbbbbbbbb0002")).toEqual([]);
  });
});

describe("一个人的轨迹与按人漏斗", () => {
  it("joins two browsers of one customer, day by day, with the first payment placed", () => {
    const cid = upsertCustomer("people-trail@example.com", "zh-hant");
    const [b1, b2] = ["cccccccccccc0001", "cccccccccccc0002"];
    // day 1, Threads' own browser: two casts, saw the line, no purchase
    put(ev(b1, "ctab00000001", "page_view", T0, { path: "/zh-hant/cast", c: "threads" }));
    put(ev(b1, "ctab00000001", "visit_day", T0, { fd: homeDay(T0), td: homeDay(T0) }));
    put(ev(b1, "ctab00000001", "cast_complete", T0 + 60_000, { hex: 63 }));
    put(ev(b1, "ctab00000001", "teaser_shown", T0 + 70_000));
    put(ev(b1, "ctab00000001", "cast_complete", T0 + 5 * 60_000, { hex: 3 }));
    // day 2, Safari: one more cast, then pays
    const t2 = Date.now() - H;
    put(ev(b2, "ctab00000002", "page_view", t2, { path: "/zh-hant/cast" }));
    put(ev(b2, "ctab00000002", "cast_complete", t2 + 60_000, { hex: 11 }));
    put(ev(b2, "ctab00000002", "checkout_start", t2 + 120_000, { tier: "deep" }));
    recordOrder({ sessionId: "cs_people_trail_1", customerId: cid, castId: null, tier: "deep", amountCents: 7500, currency: "twd", email: "people-trail@example.com", status: "paid", firstDeep: true, browserSid: "ctab00000002" });
    for (const b of [b1, b2]) markCustomer(new NextRequest("http://localhost/x", { headers: { cookie: `${BID_COOKIE}=${b}` } }), NextResponse.json({}), cid, "pay");

    const tr = personTrail({ customerId: cid });
    expect(tr.bids.sort()).toEqual([b1, b2]);
    expect(tr.days).toHaveLength(2);
    expect(tr.summary).toMatchObject({ visitDays: 2, casts: 3, teased: 1, checkouts: 1, paid: 1, castsBeforePaid: 3, dayOfFirstPaid: 2, firstFrom: "threads" });
    const payTab = tr.days[1]!.sessions.find((s) => s.s === "ctab00000002")!;
    expect(payTab.orders).toMatchObject([{ tier: "deep", cents: 7500, paid: true, firstDeep: true }]);
    // one browser alone shows who it was filed under
    expect(personTrail({ bid: b1 }).customers).toMatchObject([{ id: cid, email: "people-trail@example.com" }]);
    // the list names them, and the payment shows on both browsers (one person); the funnel counts them once, as paid
    expect(peopleList(T0 - H).find((r) => r.bid === b2)).toMatchObject({ customerId: cid, who: "people-trail", paidOrders: 1, member: false, everPaid: true });
    expect(peopleList(T0 - H).find((r) => r.bid === b1)).toMatchObject({ paidOrders: 1, everPaid: true });
    const f = personFunnel(T0 - H);
    expect(f.paid).toBeGreaterThanOrEqual(1);
    expect(f.paidBy.reading).toBeGreaterThanOrEqual(1);
    expect(f.people).toBeGreaterThanOrEqual(1);
  });
});

describe("隐私政策那一句", () => {
  it("every language now says the browser has a random number that joins its visits, and no longer that it has none", () => {
    const text = (l: string) => (l === "zh-hant" ? JSON.stringify(PRIVACY_HANT) : JSON.stringify(PRIVACY.map((s) => (s as unknown as Record<string, unknown>)[l])));
    for (const l of LOCALES) expect(text(l), l).toContain("yf_bid");
    expect(text("zh")).not.toContain("没有任何编号");
    expect(text("zh-hant")).not.toContain("不含任何編號");
    expect(text("en")).not.toContain("no identifier");
    expect(text("ja")).not.toContain("番号のたぐいは一切なく");
  });
});
