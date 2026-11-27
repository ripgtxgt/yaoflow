import { NextRequest, NextResponse } from "next/server";
import { noteNet } from "@/lib/browser-net";
import { record, type EventName, type TrackedEvent } from "@/lib/analytics-server";
import { isCampaignTag } from "@/lib/campaign";
import { customerFromRequest } from "@/lib/auth";
import { edgeCountry } from "@/lib/geo";
import { deviceFromUA, fromEvent, touch } from "@/lib/presence";
import { uaBrief } from "@/lib/ua-brief";
import { knownFrom, marksFrom } from "@/lib/presence-marks";
import { deviceModel } from "@/lib/ua-brief";
import { boardDevice, HUMAN_EVENTS } from "@/lib/cloud-ip";
import { AB_RE } from "@/lib/ab";
import { bidOf, browserStats, noteBrowserEvent, noteSignedIn } from "@/lib/browsers";
import { isNoiseClientError } from "@/lib/err-capture";
import { confirmNudgeSeen } from "@/lib/cast-log";
import { isShareSurface } from "@/lib/share-meta";
import { noteGaClient } from "@/lib/ga-mp";
import { noteAdsClick } from "@/lib/ads-conversions";
import { ADS_CLICK_COOKIE } from "@/lib/ads-click";
import { clientIp, errorHoldMs, isHopping, noteHop } from "@/lib/proxy-hop";
import { recordOps } from "@/lib/db";

export const runtime = "nodejs";

const ALLOWED: EventName[] = [
  "home_card_view", "home_card_close", "home_icon_open", // 09-29 加到主屏幕 — type and allow-list in the same commit
  "page_view", "cast_start", "cast_complete", "reading_click", "reading_done",
  "checkout_start", "purchase", "followup_ask", "repeat_blocked", "repeat_capped", "share_click", "sub_redeem",
  "gift_claim", "sub_intent", // the painted door's two client-side taps; "gift" itself is recorded server-side only,
  "proof_share",
  "timeline_view", "timeline_cal", // 10-14 进度表 44 — type and allow-list in the same commit
  "gua_cta", // 10-14 进度表 48
  "today_qian", // 10-14 进度表 50 (client: cal_click | cast | card_click)
  "tarot", "huangli", "zeri", "yunshi", "ziwei", "bazi", "astro", // 10-17 进度表 69–74
  "hepan", // 10-20 合盤
  "nianshu", // 10-21 三合一年書
  "zhengyuan", // 10-26 正緣畫像 product page
  "name", "dream", "taisui", "fun", // 10-29 进度表 122–126
  "xunwu", // 10-29 进度表 127 尋物
  "bridge", // 10-26 love-question card under a result (show:/click:<surface>:<product>)
  "services", // 10-22 进度表 58 全部服務頁
  // 10-16 进度表 68 線上塔羅 (start, flip, buy, to_cast, card_view; draw/paid/revisit are server-side)
  "jiaobei", // 10-16 进度表 67 擲筊／求籤 (ask:sheng|xiao|yin, retoss, to_qiuqian, to_cast, same, qq_request:*, qq_draw, qq_confirm:*, qq_done, qq_same)
  "reading_click_blocked",   // 09-17's gate-eaten tap — added to the type then, missed here, so it never recorded (fixed 09-19)
  "teaser_shown",
  "question_blocked", "question_override", "seal_sent", "seal_watch", "daily_pick", "daily_react", "daily_ask", "daily_sub", // 09-20 问题把关 — added here in the same commit as the type, this time
  "page_leave", "heat_click", "price_seen", // 09-23 热区
  "bmg_view", // 11-05 进度表 136 本命卦 (bmg_done is written by the server)
  "client_error", // 09-28
  "gift_open", // 09-24 送一卦 funnel: opened / cast on
  "checkout_back", "checkout_retry", // 09-26 挽回: came back from Stripe unpaid / tapped "back to payment"
  "visit_day", // 09-23 回访: first page of a local day, carrying two dates and nothing else
  "mine_open", // 10-26 「我的」: a kept free cast opened from the account page
  "cast_saved", "saved_open", // 10-02 存到信箱: a reader emailed themselves the cast / came back to it from the letter
  "qian_cast_click", // 10-12 解籤: 「為這件事起一卦」 on a lot's result page
  "nudge_shown", // 10-03 付费话术学习 (lib/nudge.ts): only a block the page really showed counts for the learner
];

const DAY_RE = /^20\d\d-\d\d-\d\d$/;

const str = (v: unknown, max: number): string | undefined =>
  typeof v === "string" && v.length > 0 ? v.slice(0, max) : undefined;

export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as Record<string, unknown>;
    const e = b.e as EventName;
    if (!ALLOWED.includes(e)) return NextResponse.json({ ok: false }, { status: 400 });

    const bid = bidOf(req); // 10-03 按人看: set by the middleware on the first page; absent when cookies are blocked
    const ev: TrackedEvent = {
      t: Date.now(),
      e,
      s: str(b.s, 24) ?? "anon",
      ...(bid ? { b: bid } : {}),
      locale: str(b.locale, 8),
      tier: str(b.tier, 12),
      path: str(b.path, 80),
      ref: str(b.ref, 60),
      via: str(b.via, 16),
      c: isCampaignTag(b.c) ? b.c : undefined,
      ab: typeof b.ab === "string" && AB_RE.test(b.ab) ? b.ab : undefined,
      method: str(b.method, 24), // 09-27: heat names like case-reward-gift were cut to 12 and collided
      // a hexagram number (1–64); on the one-matter panel the same slot carries how alike the two wordings were (0–100) —
      // 10-02: everything from 65% up, identical questions included, used to be dropped here as "not a hexagram"
      hex: typeof b.hex === "number" && Number.isInteger(b.hex) && (e === "repeat_blocked" ? b.hex >= 0 && b.hex <= 100 : b.hex >= 1 && b.hex <= 64) ? b.hex : undefined,
      cur: typeof b.cur === "string" && /^[A-Z]{3}$/.test(b.cur) ? b.cur : undefined,
      ms: typeof b.ms === "number" && b.ms >= 0 && b.ms <= 6 * 3_600_000 ? Math.round(b.ms) : undefined,
      depth: typeof b.depth === "number" && b.depth >= 0 && b.depth <= 100 ? Math.round(b.depth) : undefined,
      fd: e === "visit_day" && typeof b.fd === "string" && DAY_RE.test(b.fd) ? b.fd : undefined,
      pd: e === "visit_day" && typeof b.pd === "string" && DAY_RE.test(b.pd) ? b.pd : undefined,
      td: e === "visit_day" && typeof b.td === "string" && DAY_RE.test(b.td) ? b.td : undefined,
      // 09-29: who the gate stops, and whether it was really one matter — two flags, nothing about the question
      mem: (e === "repeat_blocked" || e === "repeat_capped") && (b.mem === 0 || b.mem === 1) ? b.mem : undefined,
      same: e === "repeat_blocked" && (b.same === 0 || b.same === 1) ? b.same : undefined,
      // 09-30: new today / returning, and which visiting day — see lib/track.ts
      vt: b.vt === "n" || b.vt === "r" ? b.vt : undefined,
      vn: typeof b.vn === "number" && Number.isInteger(b.vn) && b.vn >= 1 && b.vn <= 9999 ? b.vn : undefined,
      // 10-02: an error is fixable only with its message and its browser (the iOS 16.2 Threads crash showed as 21 letters)
      msg: e === "client_error" ? str(b.msg, 160) : undefined,
      ua: e === "client_error" ? uaBrief(req.headers.get("user-agent")) : undefined,
      // 10-13 进度表 41: the share's surface — one of a fixed list (lib/share-meta.ts)
      sf: e === "share_click" && isShareSurface(b.sf) ? b.sf : undefined,
    };
    if (e === "visit_day" && (!ev.fd || !ev.td)) return NextResponse.json({ ok: false }, { status: 400 });
    // 10-02 evening: a blocked Cloudflare beacon, an opaque "Script error." or Outlook's own rejection is not the page
    // breaking (lib/err-capture.ts). The page's script no longer sends them; this covers pages opened before that deploy.
    if (e === "client_error" && isNoiseClientError(ev.method, ev.msg)) return NextResponse.json({ ok: true });
    // 10-28 (lib/proxy-hop.ts): a session whose requests hop between countries is a scraper behind rotating proxies —
    // its page errors wait for the rest of their burst and are dropped if the hop shows
    const country = edgeCountry(req.headers);
    const hopping = noteHop(ev.s, country, clientIp(req.headers), ev.t);
    if (e === "client_error") {
      const hold = errorHoldMs();
      const ua = req.headers.get("user-agent");
      const c = (() => { try { return customerFromRequest(req); } catch { return null; } })();
      const known = knownFrom(req, !!c);
      const marks = marksFrom(req, !!c);
      const commit = () => {
        // 11-03: an error our own API answered (cast:400 …) is a real reader acting — a phone on mainland data plus a VPN
        // switches country too; only the script/resource failures of a proxied scrape are dropped
        if (isHopping(ev.s) && !/^[a-z_]+:\d{3}\b/.test(ev.method ?? "")) { recordOps("client_error_proxy", `${ev.s.slice(-6)} ${ev.method ?? ""} ${ua ? uaBrief(ua) : ""}`.slice(0, 120)); return; }
        record(ev);
        if (bid) noteBrowserEvent(bid, ev);
        try { touch({ ...fromEvent(ev), customer: c ? { id: c.customerId, email: c.email } : null, known, ...boardDevice(clientIp(req.headers), deviceFromUA(ua), deviceModel(ua) ?? null, !!c || !!known || HUMAN_EVENTS.has(ev.e)), country, marks, bid, bstats: bid ? browserStats(bid) : null }); } catch { /* best-effort */ }
      };
      if (hopping) commit();
      else if (hold === 0) commit();
      else setTimeout(commit, hold).unref?.();
      return NextResponse.json({ ok: true });
    }
    record(ev);
    if (bid) noteBrowserEvent(bid, ev);
    noteNet(bid, req.headers, ev.t); // 10-31 进度表 130: address and device of this browser (lib/browser-net.ts)
    // 10-03 付费话术学习: the block was really on screen — this showing now counts (lib/cast-log.ts confirmNudgeSeen)
    if (e === "nudge_shown" && bid && ev.method) confirmNudgeSeen(bid, ev.method);
    // 10-27: which GA visitor this tab is, so the order it pays for lands on that visit in Google Analytics (lib/ga-mp.ts)
    if (e === "checkout_start") noteGaClient(ev.s, req.cookies);
    // 11-27 T-007: …and which Google Ads click it came from, so the order can be reported as that click's conversion (lib/ads-conversions.ts)
    if (e === "checkout_start") noteAdsClick(ev.s, req.cookies.get(ADS_CLICK_COOKIE)?.value, country);
    // 10-02 实时在线: the same event updates the live board — with who is signed in (login cookie), the device
    // class and the edge's country, none of which goes into the event file
    try {
      const c = customerFromRequest(req);
      // 10-03 每日按身份: a signed-in browser is filed under its customer (lib/browsers.ts noteSignedIn)
      if (c && bid) noteSignedIn(bid, c.customerId);
      const ua = req.headers.get("user-agent");
      touch({ ...fromEvent(ev), customer: c ? { id: c.customerId, email: c.email } : null, known: knownFrom(req, !!c), ...boardDevice(clientIp(req.headers), deviceFromUA(ua), deviceModel(ua) ?? null, !!c || !!knownFrom(req, !!c) || HUMAN_EVENTS.has(ev.e)), country, marks: marksFrom(req, !!c), bid, bstats: bid ? browserStats(bid) : null });
    } catch { /* the board is best-effort */ }
  } catch {
    /* swallow */
  }
  return NextResponse.json({ ok: true });
}
