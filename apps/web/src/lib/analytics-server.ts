import { minOf } from "@/lib/minmax";
import { existsSync, mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { homeDay } from "./clock";
import { EVENTS_DIR, insertEvent, selectEvents, type EventQuery } from "./event-store";
import { isMachineVisit, machineBrowsers } from "./machine-visit";

/**
 * Minimal first-party analytics. No cookies, no third party, no personal data.
 *
 * Storage: until 10-15 one newline-delimited JSON file per UTC day under DATA_DIR/events/; since 10-15 (进度表 60) its
 * own SQLite file, DATA_DIR/events.db (lib/event-store.ts). Nothing leaves our server either way.
 */
export type { EventQuery } from "./event-store";

export type EventName =
  | "page_view"
  | "home_card_view" | "home_card_close" | "home_icon_open" // 09-29 加到主屏幕
  | "cast_start"      // first toss
  | "cast_complete"   // six lines done
  | "reading_click"   // clicked a tier button
  | "reading_click_blocked" // tapped a tier button, but 一事一占 got there first (09-17)
  | "reading_done"    // free-beta reading rendered
  | "checkout_start"  // redirected to Stripe
  | "ref_reward"      // 10-14 进度表 47: a friend's first cast through a share link (method: friend | sharer | capped | self | claimed; server-side)
  | "gua_cta"         // 10-14 进度表 48: the 「寫一句話，起一卦看應期」 block on a hexagram page (method: view | click | example; hex = the page's hexagram)
  | "case_reward"     // 09-26: a published case earned its reward (method: offered / self / gift)
  | "checkout_back"   // 09-26: Stripe's cancel brought them back, figure restored
  | "checkout_retry"  // 09-26: tapped "back to payment" on the recovery panel
  | "purchase"        // verified paid reading page rendered
  | "followup_ask"
  | "repeat_blocked"  // one-matter-one-cast gate shown
  | "repeat_capped"   // 10-02: the day's casts on a topic were spent — the cast let through without the free line (method: topic | circling)
  | "cast_saved"      // 10-02 存到信箱: the reader emailed themselves the cast (method: ok | error code)
  | "saved_open"      // 10-02 存到信箱: came back to a saved cast from the letter
  | "mine_open"       // 10-26 「我的」: opened a kept free cast from the account page
  | "nudge_shown"     // 10-03 付费话术学习: the block before the price on a 2nd+ cast of one matter rendered (method = variant id, hex = which cast)
  | "share_click"     // share sheet opened or link copied; props.method says which
  | "timeline_view"   // 10-14 进度表 44: the timing timeline came into view on a reading (method = deep / one / matter)
  | "timeline_cal"    // 10-14 进度表 44: 「加入行事曆」 tapped (method = ics / google)
  | "sub_redeem"      // a member spent an allowance unit on a reading (tier in props)
  | "gift_claim"      // painted door: the claim panel was submitted (method: email | skip)
  | "gift"            // painted door: a free reading delivered after a tap on a priced button (server-side)
  | "sub_intent"      // painted door: a subscription plan tapped on the account page (tier = plan)
  | "gift_sent"       // 送一卦: a paying reader minted a gift link (server-side)
  | "gift_claimed"    // 送一卦: a friend spent it on their own cast (server-side)
  | "invite_free_light" // 双边推荐: a newcomer through a shared cast got their first light reading free (server-side)
  | "proof_share"     // 应验卡 shared from the follow-up thank-you page (method: native | copy)
  | "pair_sent"       // 同题合参: a reader minted an invite for the other person (server-side)
  | "pair_claimed"    // 同题合参: the other person cast on the same matter (server-side)
  | "case_published"  // 公开卦例: a reader published their reading as an anonymous case (server-side)
  | "teaser_shown"    // 解读露一句: the free line rendered above the price (09-19)
  | "question_blocked"  // 问题把关: the question named no matter (method: rule | model; tier: cast | reading) (09-20)
  | "question_override"  // 问题把关: the reader said "ask this anyway" past the model's soft refusal (09-20)
  | "revisit_answer"     // a revisit mail's button was tapped (method: hit | miss | open) (09-21)
  | "revisit_state"      // 11-05 进度表 135: the two optional taps under the answer (method: state:acted)
  | "bmg_done"           // 11-05 进度表 136: a 本命卦 quiz finished (method: full|quick:kw; c: where they came from)
  | "bmg_view"           // 11-05 进度表 136: the quiz page or a shared result opened (method: quiz|result|invite)
  | "revisit_set"        // 10-22 进度表 80: a report's 「到期回來問你」 was set (tier: bazi | ziwei | astro | nianshu | zeri; method: option:set|moved)
  | "qian_draw"          // 10-12 解籤: a lot submitted on /jieqian (method: num:situation)
  | "qian_cast_click"    // 10-12 解籤: 「為這件事起一卦」 tapped on a result page
  | "qian_personal_buy"  // 10-12 解籤: the personal reading of a lot paid for (method: currency)
  | "repeat_gate"        // 10-13 同一件事反复问 (lib/repeat-test.ts): lock | email_ask | email_given (hex = the cast's place on its matter; server-side)
  | "recover_offer"      // 10-15 挽回信改版: the offer page's button (method: checkout | expired | used | none | failed) and the page itself (method: view_open | view_expired | view_used)
  | "pay_hop"            // 10-24 微信／QQ 付款中转页 /pay (method: view_wechat | view_qq — shown in there; on_browser — the same link opened in a browser, sent on to Stripe)
  | "jiaobei"            // 10-16 进度表 67 線上擲筊／求籤 (method: ask:sheng|xiao|yin · retoss · same · to_qiuqian · to_cast · qq_request:ok|no|out · qq_draw · qq_confirm:ok|fail · qq_done · qq_same; set in tier)
  | "tarot"              // 10-16 进度表 68 線上塔羅 (method: start:1|3 · draw:1|3 · again · refuse:<why> · flip · buy · paid (server) · followup · revisit_set:<days> · answered:<a> · to_cast · card_view)
  | "huangli"            // 10-17 进度表 69 黃曆 (method: view · term:<词> · from_<page> → links into other products)
  | "zeri"               // 10-17 进度表 70 擇日 (method: query:<事项>:<有无生肖>:<天数> · remind · from_<page>)
  | "yunshi"             // 10-17 进度表 73 每日運勢 (method: view:<生肖> · from_<page>)
  | "ziwei"              // 10-17 进度表 71 紫微斗數 (method: chart:<有无时间>:<地区> · buy · from_<page>)
  | "bazi"               // 10-17 进度表 72 八字 (method: chart:<有无时间>:<地区> · buy · from_<page>)
  | "astro"              // 10-17 进度表 74 星盤 (method: chart:<有无时间>:<地区> · from_<page>)
  | "nianshu"            // 10-21 三合一年書 (method: view · buy · buy:tester · pick:<year>)
  | "zhengyuan"          // 10-26 正緣畫像 product page (method: view · pick · buy:<other|same> · buy:tester)
  | "name"               // 10-29 进度表 122 姓名學 (method: view · read · zi:<字> · buy:<baby|rename>)
  | "dream"              // 10-29 进度表 124 解夢 (method: index · view:<slug> · to_cast:<slug>)
  | "taisui"             // 10-29 进度表 125 太歲 (method: view · view:<生肖>)
  | "fun"                // 10-29 进度表 126 娛樂小品 (method: view:<kind> · make:<kind>)
  | "xunwu"              // 10-29 进度表 127 尋物 (method: view · cast:<cat>:<tier> · same · limit:<day|fast> · to_cast · back_show · back:<found|not> · back_cast · back_close · from_<page> — jiaobei, qiuqian, cast, dream:<夢>)
  | "bridge"             // 10-26 love-question card under a result (method: show:<surface>:<product> · click:…)
  | "services"           // 10-22 进度表 58 全部服務頁 (method: view)
  | "hepan"              // 10-20 合盤 (method: view · pair:<紫微有无>:<星盘时间> · buy · ask_cast · from_<page>)
  | "today_qian"         // 10-14 进度表 50 今日一籤 (method: draw_new | draw_back | day_view | cal_click | cast | mail_on | mail_off | card_buy | card_again | card_click | notice_again | notice_member | notice_no)
  | "qian_photo"         // 10-13 拍照认籤: one photo read (method: one | some | none | notslip | fail; server-side, never the photo)
  | "qian_foreign_read"  // 10-30 进度表 128 ⑤: a lot reading opened in another language (method: lot number)
  | "qian_followup"      // 10-13 解籤: the follow-up included with a personal reading was answered (method: cast | plain; server-side)
  | "year_waitlist"      // 10-12 「2027 年卦」预约 (method: kind:new|again)
  | "checkpoint_answer"  // 10-12 多段应期: a check-in letter after an earlier window was tapped (method: seq:seen|none|unsure)
  | "revisit_reward"     // the answer earned its reward (method: hit → light reading link, miss → extra follow-up) (09-21)
  | "revisit_light_claimed" // the "what comes next" light reading was cast (09-21)
  | "seal_sent"           // 封卦 (09-21 A1): a sealed prediction link was minted / shared
  | "seal_watch"          // a stranger asked to be told when that prediction settles
  // 09-23 热区 (first-party, no text, no pointer trails): how far down a page people got, how long they
  // stayed, which named controls they touched, and whether the price row ever came into view
  | "page_leave"          // path + ms on the page + depth (max % scrolled)
  | "heat_click"          // method = the control's data-heat name
  | "client_error"        // 09-28 (进度表 13 ②): what failed in the browser — method = where:status or js:<message head>; never the question
  | "price_seen"          // the price buttons scrolled into view after a cast (once per cast)
  | "visit_day"           // 09-23 回访: first page of a local day — fd (first visit date), pd (previous visit date); no id
  | "progress_note"       // 09-23: a reader noted what happened on a deep reading (server-side)
  | "gift_open"           // 09-24: a 送一卦 link was opened (method: open) / cast on (method: cast)
  | "daily_pick"          // 大众一卦 (09-21 A2): one of the day's three public charts was picked (method: 1|2|3)
  | "daily_react"         // 09-26: the one-tap reaction under a pile (method: hit | miss)
  | "daily_ask"           // 09-26: wrote what the pile brought to mind and went to cast on it
  | "daily_sub";          // 09-26: asked for the daily letter (method: sent | already)

export interface TrackedEvent {
  t: number;
  e: EventName;
  /** anonymous per-browser-session id, generated client-side, not persisted across days */
  s: string;
  /** 10-03 按人看: the browser's id (yf_bid cookie, lib/browsers.ts) — joins one browser's sessions across days */
  b?: string;
  locale?: string;
  tier?: string;
  path?: string;
  ref?: string;
  /** first-touch referral tag: the share code that brought this session in */
  via?: string;
  /** first-touch campaign tag from a promotion link's ?c=<channel> */
  c?: string;
  /** 09-26 对照测试: the browser's arms ("f1o0" — lib/ab.ts) */
  ab?: string;
  /** share_click detail: "native" (share sheet) or "copy"; gift_claim: "email" or "skip" */
  method?: string;
  /** hexagram number, for content stats — never the question text. On repeat_blocked (the one-matter panel): how alike
   *  the new wording was to the earlier cast's, 0–100 (identical = 100); on repeat_capped: how many casts the cap counted. */
  hex?: number;
  /** 09-29 (repeat_blocked only): 1 = the reader is a member / 1 = the gate judged it the same matter */
  mem?: number;
  same?: number;
  /** currency the prices were shown in (ISO code) — how each market converts */
  cur?: string;
  /** 09-23 热区: milliseconds on the page (page_leave) or since the free line appeared (price_seen / page_leave on the cast page) */
  ms?: number;
  /** 09-23 热区: the deepest point reached, % of the page height (0–100) */
  depth?: number;
  /** 09-23 回访 (visit_day only): the browser's first visit date, local, YYYY-MM-DD */
  fd?: string;
  /** 09-23 回访 (visit_day only): the previous visit date; absent on a first ever visit */
  pd?: string;
  /** 09-23 回访 (visit_day only): the visitor's own local date of this visit */
  td?: string;
  /** 09-30: on every client event — n = this browser's first day here, r = a returning day */
  vt?: "n" | "r";
  /** 09-30: which visiting day this is for the browser (1 = the first) */
  vn?: number;
  /** 10-02 (client_error only): the error's message head and where it was thrown — never anything the reader typed */
  msg?: string;
  /** 10-02 (client_error only): a short browser label, e.g. "iOS 16.2 · Threads" (lib/ua-brief.ts) */
  ua?: string;
  /** 10-13 进度表 41 (share_click only): where on the site the share happened (lib/share-meta.ts) */
  sf?: string;
}

/**
 * 10-13 进度表 41 ⑥: share rate by surface. A surface's base is the sessions that reached it: the light result = sessions
 * that finished a cast; the deep reading = sessions that saw a deep reading; the lot result / lot page / matter / proof
 * page = sessions with a page view there. Older share_click events carry no surface and are left out of the split.
 */
function shareBreakdown(of: (e: EventName) => TrackedEvent[]): Pick<Sharing, "bySurface" | "shareRate"> {
  const shares = of("share_click");
  const views = of("page_view");
  const sess = (xs: TrackedEvent[]) => new Set(xs.map((e) => e.s)).size;
  const casters = new Set(of("cast_complete").map((e) => e.s));
  const bases: Record<string, number> = {
    result: casters.size,
    deep: sess(of("reading_done").filter((e) => e.tier === "deep")) || sess(views.filter((e) => e.path?.includes("/reading"))),
    qian: sess(views.filter((e) => e.path?.includes("/jieqian/r/"))),
    lot: sess(views.filter((e) => /\/qian\//.test(e.path ?? ""))),
    matter: sess(views.filter((e) => e.path?.includes("/matter/"))),
    revisit: sess(views.filter((e) => e.path?.includes("/proof/"))),
  };
  const bySurface = Object.keys(bases).map((sf) => {
    const xs = shares.filter((e) => e.sf === sf);
    const channels: Record<string, number> = {};
    for (const e of xs) if (e.method) channels[e.method] = (channels[e.method] ?? 0) + 1;
    const sharers = sess(xs), base = bases[sf]!;
    return { sf, clicks: xs.length, sharers, base, rate: base ? Math.round((sharers / base) * 1000) / 10 : 0, channels };
  });
  const sharedCasters = new Set(shares.filter((e) => casters.has(e.s)).map((e) => e.s)).size;
  return { bySurface, shareRate: { casters: casters.size, sharers: sharedCasters, rate: casters.size ? Math.round((sharedCasters / casters.size) * 1000) / 10 : 0 } };
}

function dayFile(ts: number): string {
  const d = new Date(ts);
  const name = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}.jsonl`;
  return join(EVENTS_DIR, name);
}

/**
 * 10-15 进度表 60: the day files are still written alongside the database until this date — a copy to compare against
 * and to fall back on while events.db is new. After it, events.db (and its nightly snapshot) is the only record.
 */
const JSONL_UNTIL = Date.parse("2026-11-15T00:00:00+08:00");

export function record(ev: TrackedEvent): void {
  try {
    insertEvent(ev as unknown as Parameters<typeof insertEvent>[0]);
  } catch {
    /* analytics must never break the product */
  }
  if (Date.now() >= JSONL_UNTIL) return;
  try {
    if (!existsSync(EVENTS_DIR)) mkdirSync(EVENTS_DIR, { recursive: true });
    appendFileSync(dayFile(ev.t), JSON.stringify(ev) + "\n", "utf8");
  } catch {
    /* analytics must never break the product */
  }
}

/**
 * The events of the last `days` days, oldest first. 10-15 进度表 60: read from events.db (lib/event-store.ts) — pass
 * `only` (event names) or `browsers` whenever the caller needs just those, so the read touches only those rows. Nothing
 * is kept in memory between calls; the pages that need speed keep their computed result (lib/swr.ts) instead.
 */
export function readEvents(days: number, q: EventQuery = {}): TrackedEvent[] {
  try {
    return selectEvents(Date.now() - days * 86400_000, q) as unknown as TrackedEvent[];
  } catch {
    return [];
  }
}
/** The same for an explicit window [since, until). */
export function readEventsBetween(since: number, until: number, q: EventQuery = {}): TrackedEvent[] {
  try {
    return selectEvents(since, { ...q, until }) as unknown as TrackedEvent[];
  } catch {
    return [];
  }
}

export interface Funnel {
  /**
   * 09-30 (进度表待定 21, Neil): unique visitors — browser·days, from `visit_day` (one per browser per local
   * day, since 09-23). The old number, distinct client sessions, is `sessions`: every new tab is a new session,
   * so it ran about twice the people (9/29: 970 sessions, 461 visitors) and halved every rate built on it.
   */
  visitors: number;
  /** 11-06: server-room browsers that only looked (link checkers) — left out of `visitors` */
  machineVisitors?: number;
  sessions: number;
  /** of the visitors: first visit ever / came back */
  firstVisits: number;
  returnVisits: number;
  /** sessions that saw one page and left inside 3 s with nothing else — listed, not subtracted */
  bounces: number;
  /** when unique visitors start (first visit_day in the window) — rates only count events from then on */
  visitorsSince: number | null;
  /** numerators for the visitor rates, counted from `visitorsSince` */
  castersSince: number;
  clickersSince: number;
  salesSince: number;
  castStart: number;
  castComplete: number;
  readingClick: number;
  checkoutStart: number;
  purchase: number;
  /** painted door: claim panels submitted / free readings delivered / plan taps on the account page */
  giftClaims: number;
  gifts: number;
  subIntents: number;
  followups: number;
  repeatBlocked: number;
  /** 10-02: casts the cap let through without the free line (it used to stop them) */
  repeatCapped?: number;
  /** 09-29: of those, members / judged the same matter / went on into the matter page (flags since 09-29 only) */
  repeatMember?: number;
  repeatSame?: number;
  repeatToMatter?: number;
}

export interface Sharing {
  /** taps on the share button, by method */
  clicks: { native: number; copy: number };
  /** sessions that viewed a /share/ page */
  cardViewers: number;
  /** sessions that arrived tagged via a shared cast */
  referredSessions: number;
  referredCasts: number;
  referredPurchases: number;
  /** referred sessions that claimed a gift or reached checkout (09-18: the funnel shows referred-in traffic explicitly) */
  referredClaims: number;
  /** referred sessions that tapped a priced button */
  referredTaps: number;
  /** which shared casts actually bring people in */
  topCodes: { code: string; sessions: number }[];
  /** 10-13 进度表 41: shares by surface — sessions that shared ÷ sessions that reached the surface, and by channel */
  bySurface: { sf: string; clicks: number; sharers: number; base: number; rate: number; channels: Record<string, number> }[];
  /** 10-13: sessions that finished a cast, and how many of them shared anything (the 4% → 8% target) */
  shareRate: { casters: number; sharers: number; rate: number };
  /** K = casts by sessions that came through a shared cast ÷ all casts, this window (总方案 §5.1: W6 ≥ 0.1, W13 ≥ 0.2) */
  k: number;
  /** 送一卦 links minted / spent, and newcomers' free light readings, this window */
  giftSent: number;
  giftClaimed: number;
  inviteFreeLight: number;
  /** 09-27: the first-light A/B test's free readings, kept apart from the share invite's */
  abFreeLight: number;
  proofShares: number;
  /** 同题合参 invites minted / answered, this window */
  pairSent: number;
  pairClaimed: number;
}

/** The same funnel, split by the currency the visitor saw prices in. */
export interface CurrencyFunnel {
  cur: string;
  casts: number;         // sessions that completed a cast
  clicksOne: number;     // sessions that clicked the light reading
  clicksDeep: number;    // sessions that clicked the deep reading
  checkout: number;      // sessions that reached Stripe
  subRedeems: number;    // member readings (allowance spent)
  subIntents: number;    // painted door: plan taps on the account page
}

export interface ChannelFunnel {
  c: string;             // campaign tag from the promotion link (?c=…), "—" for untagged
  visitors: number;      // 09-30: unique visitors (visit_day) whose session carried this tag
  sessions: number;
  casts: number;         // sessions that completed a cast
  clicks: number;        // sessions that tapped a priced button
  claims: number;        // sessions that went through: checkout_start or gift_claim
}

/**
 * The funnel split by the language a session read the site in (09-18: one
 * total funnel hides whether the English promotion works at all when
 * Traditional Chinese is 95% of traffic).
 */
export interface LocaleFunnel {
  locale: string;
  visitors: number;      // 09-30: unique visitors (visit_day, by the locale it was sent from)
  sessions: number;
  casts: number;         // sessions that completed a cast
  clicks: number;        // sessions that tapped a priced button
  claims: number;        // sessions that claimed a gift or reached checkout
  readings: number;      // readings delivered (server-side gift + purchase events, by their own locale)
  purchases: number;
}

export interface Stats {
  funnel: Funnel;
  byChannel: ChannelFunnel[];
  byLocaleFunnel: LocaleFunnel[];
  sharing: Sharing;
  byCurrency: CurrencyFunnel[];
  byLocale: Record<string, number>;
  byTier: Record<string, number>;
  /**
   * One row per house-clock day. `casters` is sessions that finished at least
   * one figure (the old "casts" column — 09-16 Neil read it as readings);
   * `casts` is figures cast; `taps` sessions that tapped a priced button;
   * `claims` sessions that went through the door or to checkout; `readings`
   * readings actually delivered (server-side gift + purchase events).
   */
  byDay: { day: string; visitors: number | null; sessions: number; bounces: number; casters: number; casts: number; taps: number; tapsBlocked: number; claims: number; readings: number; purchases: number }[];
  topRefs: { ref: string; n: number }[];
  topHexagrams: { hex: number; n: number }[];
  rates: {
    activation: number;   // cast_complete sessions / unique visitors (09-30; was / sessions)
    priceRate: number;    // reading_click sessions / unique visitors
    payRate: number;      // sales / unique visitors
    intent: number;       // reading_click / cast_complete
    conversion: number;   // purchase / cast_complete
    checkoutClose: number; // purchase / checkout_start
  };
}

const uniq = (evs: TrackedEvent[], name: EventName) =>
  new Set(evs.filter((e) => e.e === name).map((e) => e.s)).size;

/**
 * Events the server records under a pseudo-session (the tail of a sid), not
 * a browser session. 09-16: they were being counted as visitors — a day with
 * 41 gifts showed 41 phantom visitors, and the activation rate sank with it.
 */
const SERVER_SIDE = new Set<EventName>(["gift", "gift_sent", "gift_claimed", "invite_free_light", "pair_sent", "pair_claimed", "case_published"]);
const isClient = (e: TrackedEvent) => !SERVER_SIDE.has(e.e);
/** 10-03 每日按身份 (lib/daily-who.ts): the same test, for counting tab sessions elsewhere */
export const isClientEvent = isClient;

/**
 * 09-22 (Neil, on the readings table: 「会员还是会被当作付费？」).
 *
 * A `purchase` event means a paid reading was rendered — and a member spending
 * their monthly allowance renders exactly the same page, so the event fires
 * with no money behind it. The headline and the funnel were taught to ask the
 * orders table instead, but the per-day table, the hourly bars and the
 * per-language table were still counting events, so they kept reporting
 * members as buyers. (In the per-language table 交付 and 付费 were literally
 * the same expression.)
 *
 * `paidSessions` is the set of session tails that actually took money, from
 * `paidOrdersIn()`. Pass it and every "付费" in here means a sale. Pass nothing
 * and the old behaviour stands, which is what the painted-door window wants —
 * back then a delivery WAS the closest thing to a sale we had.
 */
/**
 * 09-25: the dashboard calls this two or three times per view over ~25k events,
 * and the event log grows by a few thousand a day. Group by event name once
 * and answer the per-name questions from the index; remember the last result
 * per input so a refresh with no new events costs nothing.
 */
const STATS_MEMO = new WeakMap<TrackedEvent[], { len: number; paid: ReadonlySet<string> | undefined; stats: Stats }>();

/**
 * 09-28 (进度表 14): sessions that arrived from a search engine and landed on a public case page,
 * and how many of them went on to cast — the number that says whether the cases work as a search door.
 */
export function caseSearchLandings(evs: TrackedEvent[]): { sessions: number; casts: number; paid: number; byEngine: Record<string, number> } {
  const SEARCH = /(^|\.)(google|bing|yahoo|duckduckgo|baidu|naver|yandex|ecosia|brave)\./i;
  const first = new Map<string, TrackedEvent>();
  for (const e of evs) if (e.e === "page_view" && !first.has(e.s)) first.set(e.s, e);
  const landed = new Set<string>();
  const byEngine: Record<string, number> = {};
  for (const [s, e] of first) {
    if (!e.path?.includes("/cases/")) continue;
    const ref = (e.ref ?? "").toLowerCase();
    if (!ref || !SEARCH.test(ref + ".")) continue;
    landed.add(s);
    const eng = ref.replace(/^www\./, "").split(".").slice(-2, -1)[0] ?? ref;
    byEngine[eng] = (byEngine[eng] ?? 0) + 1;
  }
  const casts = new Set(evs.filter((e) => e.e === "cast_complete" && landed.has(e.s)).map((e) => e.s)).size;
  const paid = new Set(evs.filter((e) => e.e === "purchase" && e.method === "paid" && landed.has(e.s)).map((e) => e.s)).size;
  return { sessions: landed.size, casts, paid, byEngine };
}

/** 09-28 (进度表 15 ⑤): the proof card, week by week — cards opened, shared, sessions that arrived through one and cast. */
export function proofFunnel(evs: TrackedEvent[]): { opened: number; shared: number; arrived: number; casts: number } {
  const opened = new Set(evs.filter((e) => e.e === "page_view" && e.path?.includes("/proof/")).map((e) => e.s)).size;
  const shared = evs.filter((e) => e.e === "proof_share").length;
  const cOf = new Map<string, string>();
  for (const e of evs) if (e.c && !cOf.has(e.s)) cOf.set(e.s, e.c);
  const arrivedSet = new Set([...cOf].filter(([, c]) => c === "proof").map(([s]) => s));
  const casts = new Set(evs.filter((e) => e.e === "cast_complete" && arrivedSet.has(e.s)).map((e) => e.s)).size;
  return { opened, shared, arrived: arrivedSet.size, casts };
}

/**
 * 09-30 (进度表待定 21 ④): a session that saw one page and left inside three seconds, doing nothing else —
 * a mis-tap, a link preview, a bot that runs scripts. Listed on its own; not subtracted from the visitors
 * (9/29: 75 such sessions, 35 of which carried the day's visit_day). A single page with no leave event
 * is not counted: we cannot tell how long it stayed.
 */
export function bounceSessions(evs: TrackedEvent[]): Set<string> {
  const views = new Map<string, number>(), quick = new Set<string>(), busy = new Set<string>();
  for (const e of evs) {
    if (!isClient(e)) continue;
    if (e.e === "page_view") views.set(e.s, (views.get(e.s) ?? 0) + 1);
    else if (e.e === "page_leave") { if (typeof e.ms === "number" && e.ms < 3000) quick.add(e.s); else busy.add(e.s); }
    else if (e.e !== "visit_day") busy.add(e.s);
  }
  const out = new Set<string>();
  for (const s of quick) if (views.get(s) === 1 && !busy.has(s)) out.add(s);
  return out;
}

export function computeStats(evs: TrackedEvent[], paidSessions?: ReadonlySet<string>, opts: { full?: boolean } = {}): Stats {
  if (opts.full) return computeStatsUncached(evs, paidSessions, true);
  const hit = STATS_MEMO.get(evs);
  if (hit && hit.len === evs.length && hit.paid === paidSessions) return hit.stats;
  const stats = computeStatsUncached(evs, paidSessions);
  STATS_MEMO.set(evs, { len: evs.length, paid: paidSessions, stats });
  return stats;
}

/**
 * 10-15 进度表 60: the overview's 「上线以来」 window grows by ~8,000 events a day (255k by mid-October); reading it whole
 * took 2 s and 250 MB and would take ten times that by spring. So the window is cut into Taipei days, each day counted
 * on its own (`computeStats(…, { full: true })`, lists not cut short) and kept, and the days are added up here.
 *
 * Every figure is a count, or a count of distinct sessions inside a bucket; sessions are browser tabs and practically
 * never cross midnight, so the sum of the days equals the count over the whole window (a tab left open across
 * midnight is counted on both days — the only difference). Rates and K are worked out again from the summed counts.
 */
export function mergeStats(parts: Stats[]): Stats {
  const sumBy = <T extends object>(rows: T[], key: keyof T): T[] => {
    const m = new Map<unknown, T>();
    for (const r of rows) {
      const k = r[key];
      const have = m.get(k) as Record<string, unknown> | undefined;
      if (!have) { m.set(k, { ...r }); continue; }
      for (const [f, v] of Object.entries(r)) if (f !== key && typeof v === "number") have[f] = ((have[f] as number | null) ?? 0) + v;
    }
    return [...m.values()];
  };
  const sumRec = (recs: Record<string, number>[]) => {
    const out: Record<string, number> = {};
    for (const r of recs) for (const [k, v] of Object.entries(r)) out[k] = (out[k] ?? 0) + v;
    return out;
  };
  const fu = parts.map((p) => p.funnel);
  const nsum = (k: keyof Funnel) => fu.reduce((a, x) => a + ((x[k] as number | undefined) ?? 0), 0);
  const since = fu.map((x) => x.visitorsSince).filter((x): x is number => x !== null);
  const funnel: Funnel = {
    visitors: nsum("visitors"), machineVisitors: nsum("machineVisitors"), sessions: nsum("sessions"), firstVisits: nsum("firstVisits"), returnVisits: nsum("returnVisits"),
    bounces: nsum("bounces"), visitorsSince: since.length ? minOf(since) : null,
    castersSince: nsum("castersSince"), clickersSince: nsum("clickersSince"), salesSince: nsum("salesSince"),
    castStart: nsum("castStart"), castComplete: nsum("castComplete"), readingClick: nsum("readingClick"), checkoutStart: nsum("checkoutStart"),
    purchase: nsum("purchase"), giftClaims: nsum("giftClaims"), gifts: nsum("gifts"), subIntents: nsum("subIntents"), followups: nsum("followups"),
    repeatBlocked: nsum("repeatBlocked"), repeatCapped: nsum("repeatCapped"), repeatMember: nsum("repeatMember"), repeatSame: nsum("repeatSame"), repeatToMatter: nsum("repeatToMatter"),
  };
  const sh = parts.map((p) => p.sharing);
  const ssum = (k: keyof Sharing) => sh.reduce((a, x) => a + ((x[k] as number | undefined) ?? 0), 0);
  const surfaces = sumBy(sh.flatMap((x) => x.bySurface.map((r) => ({ ...r, channels: { ...r.channels } }))), "sf");
  for (const r of surfaces) {
    r.channels = sumRec(sh.flatMap((x) => x.bySurface.filter((y) => y.sf === r.sf).map((y) => y.channels)));
    r.rate = r.base ? Math.round((r.sharers / r.base) * 1000) / 10 : 0;
  }
  const casters = sh.reduce((a, x) => a + x.shareRate.casters, 0), sharers = sh.reduce((a, x) => a + x.shareRate.sharers, 0);
  const referredCasts = ssum("referredCasts");
  const sharing: Sharing = {
    clicks: { native: sh.reduce((a, x) => a + x.clicks.native, 0), copy: sh.reduce((a, x) => a + x.clicks.copy, 0) },
    cardViewers: ssum("cardViewers"), referredSessions: ssum("referredSessions"), referredCasts, referredPurchases: ssum("referredPurchases"),
    referredClaims: ssum("referredClaims"), referredTaps: ssum("referredTaps"),
    topCodes: sumBy(sh.flatMap((x) => x.topCodes), "code").sort((a, b) => b.sessions - a.sessions).slice(0, 8),
    bySurface: surfaces,
    shareRate: { casters, sharers, rate: casters ? Math.round((sharers / casters) * 1000) / 10 : 0 },
    k: funnel.castComplete ? Math.round((referredCasts / funnel.castComplete) * 100) / 100 : 0,
    giftSent: ssum("giftSent"), giftClaimed: ssum("giftClaimed"), inviteFreeLight: ssum("inviteFreeLight"), abFreeLight: ssum("abFreeLight"),
    proofShares: ssum("proofShares"), pairSent: ssum("pairSent"), pairClaimed: ssum("pairClaimed"),
  };
  const g = (c: string) => (c === "—" ? 2 : c.startsWith("~") ? 1 : 0);
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
  return {
    funnel,
    byChannel: sumBy(parts.flatMap((p) => p.byChannel), "c").sort((a, b) => g(a.c) - g(b.c) || b.sessions - a.sessions),
    byLocaleFunnel: sumBy(parts.flatMap((p) => p.byLocaleFunnel), "locale").sort((a, b) => b.sessions - a.sessions),
    sharing,
    byCurrency: sumBy(parts.flatMap((p) => p.byCurrency), "cur").sort((a, b) => b.casts - a.casts),
    byLocale: sumRec(parts.map((p) => p.byLocale)),
    byTier: sumRec(parts.map((p) => p.byTier)),
    // a day cut in two (the window's first piece and the next) is one row again
    byDay: sumBy(parts.flatMap((p) => p.byDay.map((r) => ({ ...r }))), "day").sort((a, b) => a.day.localeCompare(b.day)),
    topRefs: sumBy(parts.flatMap((p) => p.topRefs), "ref").sort((a, b) => b.n - a.n).slice(0, 12),
    topHexagrams: sumBy(parts.flatMap((p) => p.topHexagrams), "hex").sort((a, b) => b.n - a.n).slice(0, 10),
    rates: {
      activation: pct(funnel.castersSince, funnel.visitors),
      priceRate: pct(funnel.clickersSince, funnel.visitors),
      payRate: pct(funnel.salesSince, funnel.visitors),
      intent: pct(funnel.readingClick, funnel.castComplete),
      conversion: pct(funnel.purchase, funnel.castComplete),
      checkoutClose: pct(funnel.purchase, funnel.checkoutStart),
    },
  };
}

/** 10-15 进度表 60: the same for the 新客 / 回访客 card */
export function mergeVisitorTypes(parts: VisitorTypes[]): VisitorTypes {
  const row = (k: "new" | "back"): VisitorTypeRow => {
    const out: VisitorTypeRow = { visitors: 0, sessions: 0, casters: 0, clickers: 0, checkout: 0, paid: 0, casts: 0 };
    for (const p of parts) for (const f of Object.keys(out) as (keyof VisitorTypeRow)[]) out[f] += p[k][f];
    return out;
  };
  const buckets = (k: "byVisitDay" | "byGap") => {
    const labels = parts[0]?.[k].map((b) => b.label) ?? [];
    return labels.map((label) => ({ label, n: parts.reduce((a, p) => a + (p[k].find((b) => b.label === label)?.n ?? 0), 0) }));
  };
  const since = parts.map((p) => p.since).filter((x): x is number => x !== null);
  const back = row("back");
  return {
    since: since.length ? minOf(since) : null, new: row("new"), back,
    byVisitDay: buckets("byVisitDay"), byGap: buckets("byGap"),
    castsPerReturnDay: back.visitors ? Math.round((back.casts / back.visitors) * 10) / 10 : 0,
  };
}

function computeStatsUncached(allEvs: TrackedEvent[], paidSessions?: ReadonlySet<string>, full = false): Stats {
  const cut = (n: number) => (full ? Infinity : n);
  // 11-09 (T-033 ③: 简体 11-06 had 389 sessions for 29 visitors): a link checker's tabs are not sessions either — their
  // events leave the window here, after their visit_days are counted apart (lib/machine-visit.ts)
  const machines = machineBrowsers(allEvs);
  const machineVisitKeys = new Set<string>();
  for (const e of allEvs) if (e.e === "visit_day" && isMachineVisit(e, machines)) machineVisitKeys.add(`${e.s}|${e.td ?? ""}`);
  const machineSessions = new Set<string>();
  for (const e of allEvs) if (e.b && machines.has(e.b)) machineSessions.add(e.s);
  const evs = machines.size ? allEvs.filter((e) => !machineSessions.has(e.s)) : allEvs;
  const byName = new Map<string, TrackedEvent[]>();
  for (const e of evs) { const a = byName.get(e.e); if (a) a.push(e); else byName.set(e.e, [e]); }
  const of = (name: string): TrackedEvent[] => byName.get(name) ?? [];
  const uniq = (_evs: TrackedEvent[], name: EventName) => new Set(of(name).map((e) => e.s)).size;
  // 09-22: new events say so themselves (method: paid | membership); events
  // written before that fall back to the orders table, which is why
  // paidSessions is still passed. Both agree; the tag is simply cheaper and
  // makes the raw log readable on its own.
  const isSale = (e: TrackedEvent) =>
    e.e === "purchase" &&
    (e.method === "membership" ? false : e.method === "paid" ? true : !paidSessions || paidSessions.has(e.s));
  const clientSessions = new Set<string>(); for (const e of evs) if (isClient(e)) clientSessions.add(e.s);
  /* ---- 09-30 独立访客: one visit_day per browser per local day; a retried send is counted once ---- */
  const seenVd = new Set<string>();
  const visitDays: TrackedEvent[] = [];
  // 11-06: a server-room browser that did nothing a person does is a link checker — listed apart (lib/machine-visit.ts)
  const machineVisits = machineVisitKeys.size;
  for (const e of of("visit_day")) {
    const k = `${e.s}|${e.td ?? ""}`;
    if (seenVd.has(k)) continue;
    seenVd.add(k);
    visitDays.push(e);
  }
  const visitorsSince = visitDays.length ? minOf(visitDays.map((e) => e.t)) : null;
  const bounceSet = bounceSessions(evs);
  const since = (name: string) => new Set(of(name).filter((e) => visitorsSince !== null && e.t >= visitorsSince).map((e) => e.s)).size;
  const funnel: Funnel = {
    visitors: visitDays.length,
    machineVisitors: machineVisits,
    sessions: clientSessions.size,
    firstVisits: visitDays.filter((e) => !e.pd).length,
    returnVisits: visitDays.filter((e) => !!e.pd).length,
    bounces: bounceSet.size,
    visitorsSince,
    castersSince: since("cast_complete"),
    clickersSince: since("reading_click"),
    salesSince: of("purchase").filter((e) => isSale(e) && visitorsSince !== null && e.t >= visitorsSince).length,
    castStart: uniq(evs, "cast_start"),
    castComplete: uniq(evs, "cast_complete"),
    readingClick: uniq(evs, "reading_click"),
    checkoutStart: uniq(evs, "checkout_start"),
    purchase: of("purchase").filter(isSale).length,
    giftClaims: of("gift_claim").length,
    gifts: of("gift").length,
    subIntents: of("sub_intent").length,
    followups: of("followup_ask").length,
    // the reply-like panel's two taps ride on this event name too — they are not blocks
    repeatBlocked: of("repeat_blocked").filter((e) => e.method !== "reply_go" && e.method !== "reply_new").length,
    repeatCapped: of("repeat_capped").length,
    repeatMember: of("repeat_blocked").filter((e) => e.mem === 1).length,
    repeatSame: of("repeat_blocked").filter((e) => e.same === 1).length,
    repeatToMatter: of("heat_click").filter((e) => e.method === "gate-matter" || e.method === "gate-matter-light").length,
  };

  /* ---- the referral loop: shared card → new session → cast → purchase ---- */
  const viaOf = new Map<string, string>(); // session → first-touch code
  // 09-27: only a real share code (six line values, 6–9) is a referral — the first-light test tags its
  // server-side grants via=ab_free, which had been counted as 100 "referred sessions" and a top-shared "cast"
  for (const e of evs) {
    if (e.via && /^[6-9]{6}$/.test(e.via) && !viaOf.has(e.s)) viaOf.set(e.s, e.via);
  }
  const referred = new Set(viaOf.keys());
  const codeMap = new Map<string, Set<string>>();
  for (const [s, code] of viaOf) {
    const set = codeMap.get(code) ?? new Set();
    set.add(s);
    codeMap.set(code, set);
  }
  const sharing: Sharing = {
    clicks: {
      native: of("share_click").filter((e) => e.method === "native").length,
      copy: of("share_click").filter((e) => e.method === "copy").length,
    },
    cardViewers: new Set(
      of("page_view").filter((e) => e.path?.includes("/share/")).map((e) => e.s),
    ).size,
    referredSessions: referred.size,
    referredCasts: new Set(
      of("cast_complete").filter((e) => referred.has(e.s)).map((e) => e.s),
    ).size,
    referredPurchases: of("purchase").filter((e) => referred.has(e.s)).length,
    referredClaims: new Set([...of("gift_claim"), ...of("checkout_start")].filter((e) => referred.has(e.s)).map((e) => e.s)).size,
    referredTaps: new Set(of("reading_click").filter((e) => referred.has(e.s)).map((e) => e.s)).size,
    k: (() => {
      const all = new Set(of("cast_complete").map((e) => e.s)).size;
      const viaCasts = new Set(of("cast_complete").filter((e) => referred.has(e.s)).map((e) => e.s)).size;
      return all ? Math.round((viaCasts / all) * 100) / 100 : 0;
    })(),
    giftSent: of("gift_sent").length,
    giftClaimed: of("gift_claimed").length,
    inviteFreeLight: of("invite_free_light").filter((e) => e.via !== "ab_free").length,
    abFreeLight: of("invite_free_light").filter((e) => e.via === "ab_free").length,
    proofShares: of("proof_share").length,
    ...shareBreakdown(of),
    pairSent: of("pair_sent").length,
    pairClaimed: of("pair_claimed").length,
    topCodes: [...codeMap.entries()]
      .map(([code, s]) => ({ code, sessions: s.size }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, cut(8)),
  };

  /* ---- per-channel funnel: a session counts under the campaign tag it arrived with ---- */
  const cOf = new Map<string, string>();
  for (const e of evs) if (e.c && !cOf.has(e.s)) cOf.set(e.s, e.c);
  const chMap = new Map<string, { sessions: Set<string>; casts: Set<string>; clicks: Set<string>; claims: Set<string> }>();
  for (const e of evs) {
    const c = cOf.get(e.s) ?? "—";
    const b = chMap.get(c) ?? { sessions: new Set<string>(), casts: new Set<string>(), clicks: new Set<string>(), claims: new Set<string>() };
    chMap.set(c, b);
    b.sessions.add(e.s);
    if (e.e === "cast_complete") b.casts.add(e.s);
    else if (e.e === "reading_click") b.clicks.add(e.s);
    else if (e.e === "checkout_start" || e.e === "gift_claim") b.claims.add(e.s);
  }
  const chVisitors = new Map<string, number>();
  for (const e of visitDays) { const c = cOf.get(e.s) ?? "—"; chVisitors.set(c, (chVisitors.get(c) ?? 0) + 1); }
  const byChannel: ChannelFunnel[] = [...chMap.entries()]
    .map(([c, b]) => ({ c, visitors: chVisitors.get(c) ?? 0, sessions: b.sessions.size, casts: b.casts.size, clicks: b.clicks.size, claims: b.claims.size }))
    // tagged links, then inferred "~" sources (09-24 来源兜底, lib/campaign.ts), then untagged "—"
    .sort((a, b) => {
      const g = (c: string) => (c === "—" ? 2 : c.startsWith("~") ? 1 : 0);
      return g(a.c) - g(b.c) || b.sessions - a.sessions;
    });

  /* ---- per-currency funnel: a session counts under the currency it saw at the cast ---- */
  const curOf = new Map<string, string>();
  for (const e of evs) if (e.cur && !curOf.has(e.s)) curOf.set(e.s, e.cur);
  const curMap = new Map<string, { casts: Set<string>; one: Set<string>; deep: Set<string>; checkout: Set<string>; redeems: number; intents: number }>();
  const bucket = (cur: string) => {
    const b = curMap.get(cur) ?? { casts: new Set<string>(), one: new Set<string>(), deep: new Set<string>(), checkout: new Set<string>(), redeems: 0, intents: 0 };
    curMap.set(cur, b);
    return b;
  };
  for (const e of evs) {
    const cur = e.cur ?? curOf.get(e.s);
    if (!cur) continue;
    if (e.e === "cast_complete") bucket(cur).casts.add(e.s);
    else if (e.e === "reading_click") (e.tier === "deep" ? bucket(cur).deep : bucket(cur).one).add(e.s);
    else if (e.e === "checkout_start") bucket(cur).checkout.add(e.s);
    else if (e.e === "sub_redeem") bucket(cur).redeems += 1;
    else if (e.e === "sub_intent") bucket(cur).intents += 1;
  }
  const byCurrency: CurrencyFunnel[] = [...curMap.entries()]
    .map(([cur, b]) => ({ cur, casts: b.casts.size, clicksOne: b.one.size, clicksDeep: b.deep.size, checkout: b.checkout.size, subRedeems: b.redeems, subIntents: b.intents }))
    .sort((a, b) => b.casts - a.casts);

  const byLocale: Record<string, number> = {};
  const locOf = new Map<string, string>(); // session → first locale seen
  for (const e of evs) if (e.locale && !locOf.has(e.s)) locOf.set(e.s, e.locale);
  for (const s of clientSessions) {
    const loc = locOf.get(s) ?? "?";
    byLocale[loc] = (byLocale[loc] ?? 0) + 1;
  }

  /* ---- per-language funnel ---- */
  const locMap = new Map<string, { sessions: Set<string>; casts: Set<string>; clicks: Set<string>; claims: Set<string>; readings: number; purchases: number }>();
  const locBucket = (loc: string) => {
    const b = locMap.get(loc) ?? { sessions: new Set<string>(), casts: new Set<string>(), clicks: new Set<string>(), claims: new Set<string>(), readings: 0, purchases: 0 };
    locMap.set(loc, b);
    return b;
  };
  for (const e of evs) {
    if (isClient(e)) {
      const b = locBucket(locOf.get(e.s) ?? "?");
      b.sessions.add(e.s);
      if (e.e === "cast_complete") b.casts.add(e.s);
      else if (e.e === "reading_click") b.clicks.add(e.s);
      else if (e.e === "checkout_start" || e.e === "gift_claim") b.claims.add(e.s);
      // 交付 counts every rendered reading; 付费 only the ones money paid for
      if (e.e === "purchase") { b.readings += 1; if (isSale(e)) b.purchases += 1; }
    } else if (e.e === "gift") {
      locBucket(e.locale ?? locOf.get(e.s) ?? "?").readings += 1;
    }
  }
  const locVisitors = new Map<string, number>();
  for (const e of visitDays) { const l = e.locale ?? locOf.get(e.s) ?? "?"; locVisitors.set(l, (locVisitors.get(l) ?? 0) + 1); }
  const byLocaleFunnel: LocaleFunnel[] = [...locMap.entries()]
    .map(([locale, b]) => ({ locale, visitors: locVisitors.get(locale) ?? 0, sessions: b.sessions.size, casts: b.casts.size, clicks: b.clicks.size, claims: b.claims.size, readings: b.readings, purchases: b.purchases }))
    .sort((a, b) => b.sessions - a.sessions);

  const byTier: Record<string, number> = {};
  for (const e of of("purchase").filter((x) => x.tier)) {
    byTier[e.tier!] = (byTier[e.tier!] ?? 0) + 1;
  }

  const dayMap = new Map<string, { v: Set<string>; c: Set<string>; n: number; t: Set<string>; tb: Set<string>; cl: Set<string>; r: number; p: number; b: Set<string> }>();
  const vdByDay = new Map<string, number>();
  for (const e of visitDays) { const d = homeDay(e.t); vdByDay.set(d, (vdByDay.get(d) ?? 0) + 1); }
  for (const e of evs) {
    const day = homeDay(e.t); // buckets follow the house clock (UTC+8), the files stay named by UTC day
    const rec = dayMap.get(day) ?? { v: new Set(), c: new Set(), n: 0, t: new Set(), tb: new Set(), cl: new Set(), r: 0, p: 0, b: new Set() };
    if (isClient(e)) rec.v.add(e.s);
    if (bounceSet.has(e.s)) rec.b.add(e.s);
    if (e.e === "cast_complete") { rec.c.add(e.s); rec.n += 1; }
    else if (e.e === "reading_click") rec.t.add(e.s);
    else if (e.e === "reading_click_blocked") rec.tb.add(e.s);
    else if (e.e === "gift_claim" || e.e === "checkout_start") rec.cl.add(e.s);
    else if (e.e === "gift" || e.e === "purchase") rec.r += 1;
    if (isSale(e)) rec.p += 1;
    dayMap.set(day, rec);
  }
  const byDay = [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    // before 09-23 there was no visit_day: those days have sessions only
    .map(([day, r]) => ({ day, visitors: visitorsSince !== null && day >= homeDay(visitorsSince) ? (vdByDay.get(day) ?? 0) : null, sessions: r.v.size, bounces: r.b.size, casters: r.c.size, casts: r.n, taps: r.t.size, tapsBlocked: r.tb.size, claims: r.cl.size, readings: r.r, purchases: r.p }));

  const refMap = new Map<string, Set<string>>();
  for (const e of evs) {
    if (e.e !== "page_view") continue;
    const ref = e.ref && e.ref.length > 0 ? e.ref : "direct";
    const set = refMap.get(ref) ?? new Set();
    set.add(e.s);
    refMap.set(ref, set);
  }
  const topRefs = [...refMap.entries()]
    .map(([ref, s]) => ({ ref, n: s.size }))
    .sort((a, b) => b.n - a.n)
    .slice(0, cut(12));

  const hexMap = new Map<number, number>();
  for (const e of evs) {
    if (e.e === "cast_complete" && typeof e.hex === "number") {
      hexMap.set(e.hex, (hexMap.get(e.hex) ?? 0) + 1);
    }
  }
  const topHexagrams = [...hexMap.entries()]
    .map(([hex, n]) => ({ hex, n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, cut(10));

  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
  return {
    funnel,
    byChannel,
    byLocaleFunnel,
    sharing,
    byCurrency,
    byLocale,
    byTier,
    byDay,
    topRefs,
    topHexagrams,
    rates: {
      activation: pct(funnel.castersSince, funnel.visitors),
      priceRate: pct(funnel.clickersSince, funnel.visitors),
      payRate: pct(funnel.salesSince, funnel.visitors),
      intent: pct(funnel.readingClick, funnel.castComplete),
      conversion: pct(funnel.purchase, funnel.castComplete),
      checkoutClose: pct(funnel.purchase, funnel.checkoutStart),
    },
  };
}

/**
 * 09-25: "how many people cast from this share code", answered from one index
 * over the last 90 days instead of a fresh scan per share card view. Rebuilt
 * at most once a minute, shared by /api/share-stats and the account page.
 */
let VIA_INDEX: { at: number; days: number; castsByCode: Map<string, number> } | null = null;
export function castsByShareCode(days = 90): ReadonlyMap<string, number> {
  if (VIA_INDEX && VIA_INDEX.days === days && Date.now() - VIA_INDEX.at < 60_000) return VIA_INDEX.castsByCode;
  const evs = readEvents(days, { only: ["cast_complete"], orVia: true }); // 10-15: just the tagged events and the casts
  const first = new Map<string, string>();          // session → first-touch code
  for (const e of evs) if (e.via && !first.has(e.s)) first.set(e.s, e.via);
  const casters = new Map<string, Set<string>>();    // code → sessions that completed a cast
  for (const e of evs) {
    if (e.e !== "cast_complete") continue;
    const code = first.get(e.s); if (!code) continue;
    let set = casters.get(code); if (!set) { set = new Set(); casters.set(code, set); }
    set.add(e.s);
  }
  const castsByCode = new Map<string, number>();
  for (const [code, set] of casters) castsByCode.set(code, set.size);
  VIA_INDEX = { at: Date.now(), days, castsByCode };
  return castsByCode;
}


/**
 * 09-30 (Neil: 「新客和回访客能精确统计出来吗？我想要看一下新客的转化率和回访客的使用频率」).
 * Every client event carries vt (n = first day here / r = returning) and vn (which visiting day), so each
 * session — every tab, not only the one that sent visit_day — falls on one side. Paid orders come back
 * through their browser session (orders.browser_sid). Only events that carry the flag are counted, so the
 * figures start on the day it shipped.
 */
export interface VisitorTypeRow { visitors: number; sessions: number; casters: number; clickers: number; checkout: number; paid: number; casts: number }
export interface VisitorTypes {
  since: number | null;
  new: VisitorTypeRow;
  back: VisitorTypeRow;
  /** returning visitors by which visiting day it was: 2nd, 3rd, 4–7th, 8th+ */
  byVisitDay: { label: string; n: number }[];
  /** returning visitors by the gap since their previous visit (days) */
  byGap: { label: string; n: number }[];
  /** returning visitors' casts per visitor-day */
  castsPerReturnDay: number;
}

export function visitorTypes(evs: TrackedEvent[], paidBrowserSids: ReadonlySet<string>): VisitorTypes {
  const typed = evs.filter((e) => isClient(e) && (e.vt === "n" || e.vt === "r"));
  const since = typed.length ? minOf(typed.map((e) => e.t)) : null;
  const typeOf = new Map<string, "n" | "r">();
  for (const e of typed) if (!typeOf.has(e.s)) typeOf.set(e.s, e.vt!);
  const row = (): VisitorTypeRow & { _s: Set<string>; _c: Set<string>; _k: Set<string>; _o: Set<string> } =>
    ({ visitors: 0, sessions: 0, casters: 0, clickers: 0, checkout: 0, paid: 0, casts: 0, _s: new Set(), _c: new Set(), _k: new Set(), _o: new Set() });
  const g = { n: row(), r: row() };
  const seenVd = new Set<string>();
  const machines = machineBrowsers(evs); // 11-06: link checkers are not visitors (lib/machine-visit.ts)
  const vnBucket = new Map<string, number>(), gapBucket = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  const day = (d: string) => Date.parse(`${d}T00:00:00Z`);
  for (const e of typed) {
    const b = g[e.vt!];
    b._s.add(e.s);
    if (e.e === "cast_complete") { b._c.add(e.s); b.casts += 1; }
    else if (e.e === "reading_click") b._k.add(e.s);
    else if (e.e === "checkout_start") b._o.add(e.s);
    else if (e.e === "visit_day") {
      const k = `${e.s}|${e.td ?? ""}`;
      if (seenVd.has(k)) continue;
      seenVd.add(k);
      if (isMachineVisit(e, machines)) continue;
      b.visitors += 1;
      if (e.vt === "r") {
        const n = e.vn ?? 0;
        bump(vnBucket, n <= 2 ? "第 2 天" : n === 3 ? "第 3 天" : n <= 7 ? "第 4–7 天" : "第 8 天以后");
        if (e.pd && e.td) {
          const gap = Math.round((day(e.td) - day(e.pd)) / 86_400_000);
          bump(gapBucket, gap <= 1 ? "隔天就回来" : gap <= 3 ? "隔 2–3 天" : gap <= 7 ? "隔 4–7 天" : "隔 8 天以上");
        }
      }
    }
  }
  const paidSessions = new Set([...typeOf.keys()].filter((s) => paidBrowserSids.has(s)));
  const fin = (b: ReturnType<typeof row>, t: "n" | "r"): VisitorTypeRow => ({
    visitors: b.visitors, sessions: b._s.size, casters: b._c.size, clickers: b._k.size, checkout: b._o.size, casts: b.casts,
    paid: [...paidSessions].filter((s) => typeOf.get(s) === t).length,
  });
  const order = (m: Map<string, number>, labels: string[]) => labels.map((label) => ({ label, n: m.get(label) ?? 0 }));
  const back = fin(g.r, "r");
  return {
    since,
    new: fin(g.n, "n"),
    back,
    byVisitDay: order(vnBucket, ["第 2 天", "第 3 天", "第 4–7 天", "第 8 天以后"]),
    byGap: order(gapBucket, ["隔天就回来", "隔 2–3 天", "隔 4–7 天", "隔 8 天以上"]),
    castsPerReturnDay: back.visitors ? Math.round((back.casts / back.visitors) * 10) / 10 : 0,
  };
}
