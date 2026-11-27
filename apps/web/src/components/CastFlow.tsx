"use client";

import PublicEventNote from "@/components/cast/PublicEventNote";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { fullChart, textsFor, type FullChart, type LineValue } from "@yaoflow/engine";
import { t, type Locale } from "@/lib/i18n";
import { chineseLabels, hexName } from "@/lib/names";
import { useLocalTexts } from "@/lib/use-local-texts";
import { currencyName, firstMonthExtraMinor, firstMonthMinor, formatMoney, passMinor, priceLabels, priceMinor, tongkaMinor } from "@/lib/money";
import { fill, tongkaT, type TongkaDays } from "@/lib/tongka";
import TongkaPanel, { TongkaSkeleton } from "@/components/TongkaPanel";
import { deviceTimeZone, useCurrency } from "@/lib/use-currency";
import { countryFromTimeZone, isMainlandTimeZone } from "@/lib/money";
import CurrencyMenu from "@/components/CurrencyMenu";
import ConsentLine from "@/components/ConsentLine";
import { isCrisis } from "@/lib/crisis";
import { fuzzyWhen } from "@/lib/fuzzy-when";
import EmailField from "@/components/EmailField";
import { emailNeedsAttention, normalizeEmail } from "@/lib/email-check";
import { marketingBoxStartsTicked } from "@/lib/consent";
import type { DeepReading, Reading, Tier } from "@/lib/reading";
import { INVITE_TIER, claimPanelTier } from "@/lib/claim-tier";
import ReadingArticle from "@/components/ReadingArticle";
import FollowupChat from "@/components/FollowupChat";
import ShareCard from "@/components/ShareCard";
import WorkingPanel from "@/components/WorkingPanel";
import { attribution, track, viaTag, refTag, visitDayCount } from "@/lib/track";
import { cleanCastUrl } from "@/lib/cast-nav";
import { classifyTopic, type Topic } from "@/lib/topic";
import { SCALE_HINTS, TOPIC_HINTS, type ScaleHint } from "@/lib/hints";
import { askWindow } from "@/lib/ask-window";
import { questionScale } from "@/lib/scale-words";
import { isLostThing } from "@/lib/lost-words";
import { gateVerdict, normalizeQ, similarity, type GateVerdict, type PastCast } from "@/lib/repeat-gate";
import { tt } from "@/lib/dict/thread";
import { mg } from "@/lib/dict/member-gift";
import { mt } from "@/lib/dict/matter";
import { entryT } from "@/lib/dict/entry";
import { howToAskFor } from "@/lib/how-to-ask";
import { abArms } from "@/lib/ab";
import { cv } from "@/lib/dict/convert";
import { msT } from "@/lib/dict/matter-save";
import { rcT } from "@/lib/dict/recover";
import { ctt, shortDay } from "@/lib/dict/cast-thread";
import { parseOdds, parseSituation, type Odds } from "@/lib/situation";
import WalletPay from "@/components/WalletPay";
import { looksLikeReply, REPLY_WINDOW_MS } from "@/lib/reply-like";
import type { Situation } from "@/lib/situation";
import { MP_OFF_REGIONS_DEFAULT, plainCheckoutRegion } from "@/lib/geo";
import { passT } from "@/lib/dict/pass";
import { firstT } from "@/lib/dict/first-month";
import { looksMidTyping, matterKey, questionIssue, type MatterVerdict, type QuestionIssue } from "@/lib/question-check";
import { giftEmailRequired } from "@/lib/paywall";
import { detectQuestionLocale } from "@/lib/question-lang";
import { LOCALE_META } from "@/lib/locales";
import { primeAudio } from "@/lib/cast-ui/sfx";
import { useRite, type RiteHandlers } from "@/lib/cast-ui/use-rite";
import { pastCasts, attachSid, forgetSid, rememberCast, savePending, loadPending, clearPending, matterKeptBefore, keepGift, keptGift, dropGift } from "@/lib/cast-ui/store";
import { rpT, ohT, rfT, restLine, GIFT_DEAD, REVIEW_BANNER, PAYWALL, GIFT, emailShapeBad, type NudgeView, type CapVerdict } from "@/lib/cast-ui/words";
import type { CastMe } from "@/lib/cast-ui/types";
import { QuestionIssueNote, previewWhen } from "@/components/cast/atoms";
import Rite from "@/components/cast/Rite";
import Dossier from "@/components/cast/Dossier";
import HintsRow from "@/components/cast/HintsRow";
import RepeatGate from "@/components/cast/RepeatGate";
import EmailAsk from "@/components/cast/EmailAsk";
import SaveBox from "@/components/cast/SaveBox";
import FreeRevisit from "@/components/cast/FreeRevisit";
import GiftClaimPanel from "@/components/cast/GiftClaimPanel";
import PriceRow from "@/components/cast/PriceRow";
import { MemberCard, SecondAsk, CnPayNote, MemberOutGift, SecondCastNote, PayBackPanel } from "@/components/cast/offers";

/* 10-22 进度表 76 (CastFlow 拆分): this file keeps the cast's state and the order of the page; the drawing lives in
   components/cast/* (the rite, the dossier, the hints, the 一事一占 panel, the address boxes, the offers) and the
   browser-side helpers in lib/cast-ui/* (sound and touch, localStorage records, the page's own words). */

export default function CastFlow({ locale, children }: { locale: Locale; /** 10-22 进度表 76 ⑤: the product page's blocks — shown under the question until a figure is up */ children?: ReactNode }) {
  const sp = useSearchParams();
  const [question, setQuestion] = useState(sp.get("q") ?? "");
  /* pf=1 means Stripe's cancel_url brought them back: the payment did not
     complete. IP geo saw their network (proxy) but not their card — a mainland
     card behind an HK/US exit gets the MoR lane and is refused inside Stripe's
     page. From here on, this visit checks out through the plain lane. */
  const payFailed = sp.get("pf") === "1";
  /* reward=<token>: a referral gift link. The deep tier then redeems the
     token instead of going to checkout; the reading page treats the result
     like a paid session. */
  const rewardToken = /^[0-9a-f]{36}$/.test(sp.get("reward") ?? "") ? sp.get("reward")! : null;
  /* gift=<token>: a friend's 送一卦 link (裂变 V1). Same shape as a reward:
     the deep tier redeems it instead of checking out. */
  const giftUrl = /^[0-9a-f]{36}$/.test(sp.get("gift") ?? "") ? sp.get("gift")! : null;
  // 10-22 (客服 #1928): or the gift this browser opened before and has not spent (lib/cast-ui/store keptGift) — set
  // once the server says it is still open and not the reader's own; see the effect after /api/me below
  const [giftKept, setGiftKept] = useState<string | null>(null);
  const giftRaw = giftUrl ?? giftKept;
  // 10-16: a spent or expired gift link is no gift — the page behaves as an ordinary cast and says why once
  const [giftDead, setGiftDead] = useState<null | { why: "used" | "expired"; sid?: string }>(null);
  const giftCastToken = giftDead ? null : giftRaw;
  /* pair=<token>: 同题合参 — someone asked the visitor to cast on the same
     matter. The question is the shared framing (not editable) and the
     reading, at the inviter's tier, redeems the pair instead of paying. */
  const pairToken = /^[0-9a-f]{36}$/.test(sp.get("pair") ?? "") ? sp.get("pair")! : null;
  const [pair, setPair] = useState<{ status: string; framing: string; topic: string; tier: Tier } | null>(null);
  /* after=<token>: 回访奖励 (09-21) — the reader said a deep reading came true
     and earned one light reading on what comes next for the same matter. The
     light tier redeems it (no charge); the earlier call rides along server-side. */
  const afterToken = /^[0-9a-f]{36}$/.test(sp.get("after") ?? "") ? sp.get("after")! : null;
  // 10-12 解籤 (/zh-hant/jieqian): a cast that follows a temple lot carries the draw's token
  const qianToken = /^[0-9a-f]{24}$/.test(sp.get("qian") ?? "") ? sp.get("qian")! : null;
  const qianNum = qianToken && /^\d{1,3}$/.test(sp.get("qn") ?? "") ? Number(sp.get("qn")) : null;
  const qianSetLabel = ({ huangdaxian: "黃大仙靈籤", guandi: "關聖帝君一百籤", tianhou: "天后宮一百籤", yuelao: "月老聖籤", guanyin: "觀音一百籤", baosheng: "保生大帝六十籤", zhusheng: "註生娘娘三十籤", guanyin28: "觀音二十八籤", guanyin24: "觀音二十四籤", qianbagua: "金錢卦三十二籤", sensoji: "淺草寺觀音籤", "lecheng-yuelao": "樂成宮月老靈籤", hunglodei: "烘爐地籤" } as Record<string, string>)[sp.get("qs") ?? ""] ?? ""; // 10-12 籤系
  const qianTitle = qianToken ? (sp.get("qt") ?? "").slice(0, 24) : "";
  // 10-17 承接: a cast that follows a 擲筊 (jb + jbs) or a tarot spread (tarot + tc) — the request carries the token, the page
  // shows one line from the link's words; the server only believes its own row
  const jbToken = !qianToken && /^[0-9a-f]{24}$/.test(sp.get("jb") ?? "") ? sp.get("jb")! : null;
  const jbSign = jbToken ? (({ s3: "s3", s: "s", y: "y", x: "x" } as Record<string, string>)[sp.get("jbs") ?? ""] ?? null) : null;
  const tarotToken = !qianToken && !jbToken && /^[0-9a-f]{24}$/.test(sp.get("tarot") ?? "") ? sp.get("tarot")! : null;
  const tarotCards = tarotToken ? (sp.get("tc") ?? "").replace(/[<>]/g, "").slice(0, 60) : "";
  // 10-29 进度表 127: a cast that follows the 尋物 dice page (xw) — the same carrying-over, its own line
  const xwToken = !qianToken && !jbToken && !tarotToken && /^[0-9a-f]{24}$/.test(sp.get("xw") ?? "") ? sp.get("xw")! : null;
  const preRef = jbToken ? `jb:${jbToken}` : tarotToken ? `tarot:${tarotToken}` : xwToken ? `xw:${xwToken}` : null;
  const [jbEntry, setJbEntry] = useState(false);
  // 10-29 进度表 127: a lost-thing cast gets one quiet line to the free 尋物 card once the figure is up (direction, places, what to report)
  const [xwEntry, setXwEntry] = useState(false);
  useEffect(() => {
    if ((locale !== "zh-hant" && locale !== "zh") || qianToken || preRef) return;
    fetch("/api/features/visible?n=jiaobei,xunwu").then((r) => r.json()).then((j: { jiaobei?: boolean; xunwu?: boolean }) => { setJbEntry(!!j.jiaobei); setXwEntry(!!j.xunwu); }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [after, setAfter] = useState<{ question: string; call: string; state: "open" | "used" | "expired"; sid: string | null; kind?: "after" | "case" | "ref" } | null>(null);
  // 10-14 进度表 47: the light reading this browser just earned through a friend's share (from api/teaser or api/cast/log)
  const [refGift, setRefGift] = useState<{ url: string; until: number } | null>(null);
  // 10-14 进度表 48: arrived from a hexagram page (?ex=<n>) — that hexagram's three example questions under the empty box
  const exHex = (() => { const n = Number(sp.get("ex")); return Number.isInteger(n) && n >= 1 && n <= 64 ? n : null; })();
  const [guaEx, setGuaEx] = useState<readonly string[]>([]);
  useEffect(() => {
    if (!exHex) return;
    let alive = true;
    import("@/lib/dict/gua-examples").then((m) => { if (alive) setGuaEx(m.guaExamples(locale, exHex)); }).catch(() => {});
    return () => { alive = false; };
  }, [exHex, locale]);
  const afterActive = !!afterToken && after?.state === "open";
  /** 09-26: an aftermath link is the SAME matter on purpose (no gate); a case reward is any new matter — the gate applies */
  const afterSame = afterActive && after?.kind !== "case" && after?.kind !== "ref";
  const [pairSelf, setPairSelf] = useState(false);
  const [giftSelf, setGiftSelf] = useState<false | "self" | "returned" | "device">(false);
  /* 09-24 (Neil: 「为什么送一卦可以匿名呢？」): the friend's deep reading asked for no address,
     so it arrived with no email copy, no 应期 check-in, no account to find it again —
     and the giver could never be credited when that friend later paid. Now it asks first. */
  const [giftAskEmail, setGiftAskEmail] = useState(false);
  const [giftFriendEmail, setGiftFriendEmail] = useState("");
  /* 09-25 首次价只给一次: before a first-price deep checkout, a signed-out reader leaves an address.
     The server checks it against every deep reading ever paid for — the browser cookie alone let the
     same person take the first price twice from a fresh device. */
  const [firstAskEmail, setFirstAskEmail] = useState(false);
  const [firstEmail, setFirstEmail] = useState("");
  /** 09-26: what the server said about the typed address (bad shape / domain takes no mail) */
  const [emailErr, setEmailErr] = useState<null | "bad" | "domain">(null);
  const [firstEmailInvalid, setFirstEmailInvalid] = useState(false);
  const [firstPriceGone, setFirstPriceGone] = useState(false);
  const [giftFriendInvalid, setGiftFriendInvalid] = useState(false);
  // 09-24 R3: a 送一卦 link was opened — and, below, cast on. The gift's funnel had only its two ends (made, claimed), which is how the iPhone bug hid for three days
  const giftOpenSent = useRef(false);
  // 09-29 会员裂变 ④: the line the giver wrote, if any
  const [giftNote, setGiftNote] = useState<string | null>(null);
  const [giftReview, setGiftReview] = useState(false); // 10-16 进度表 52: a review site's trial link
  useEffect(() => {
    if (!giftUrl) return;
    let alive = true;
    fetch(`/api/grant/gift?token=${giftUrl}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { note?: string | null; review?: boolean; state?: string; sid?: string; own?: boolean } | null) => {
        if (!alive || !d) return;
        if (d.state === "used" || d.state === "expired") { dropGift(giftUrl); setGiftDead({ why: d.state, ...(d.sid ? { sid: d.sid } : {}) }); return; }
        // 10-22: remembered for this browser's later casts (a sign-in, the account page's box) — never the giver's own
        if (d.state === "open") { if (d.own) dropGift(giftUrl); else keepGift(giftUrl); }
        if (d.note) setGiftNote(d.note);
        if (d.review) setGiftReview(true);
      })
      .catch(() => { /* offline: the banner alone */ });
    return () => { alive = false; };
  }, [giftUrl]);
  useEffect(() => {
    if (giftCastToken && !giftOpenSent.current) { giftOpenSent.current = true; track("gift_open", { locale, method: giftUrl ? "open" : "kept" }); }
  }, [giftCastToken, giftUrl, locale]);
  const pairActive = !!pairToken && pair?.status === "open";
  const [chart, setChart] = useState<FullChart | null>(null);
  const [castAt, setCastAt] = useState(0);
  // the rite's motion (coins, charge, reveal, timers) lives in lib/cast-ui/use-rite; what the cast means is handed in below
  const riteHandlers = useRef<RiteHandlers>({ beginRite: () => true, onComplete: () => undefined, onReveal: () => undefined });
  const { values, setValues, coins, spinning, charge, revealed, tooSoon, phase, sweep, formed, holdBeat, castMode, setCastMode, canShake, shakeIntensity, holdStart, holdEnd, askMotion, skipReveal, clearRite } = useRite({ hasChart: !!chart, handlers: riteHandlers });

  const [readings, setReadings] = useState<{ one?: Reading; deep?: DeepReading }>({});
  /** free-beta cast row id, returned by /api/reading — ties follow-ups to it */
  const [freeCastId, setFreeCastId] = useState<number | null>(null);
  const [activeTier, setActiveTier] = useState<Tier | null>(null);
  const [aiLoading, setAiLoading] = useState<Tier | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [aiError, setAiError] = useState(false);
  /** the painted door: which priced button was tapped, and the optional address typed into its claim panel */
  const [giftTier, setGiftTier] = useState<Tier | null>(null);
  const [giftEmail, setGiftEmail] = useState("");
  // 10-12 挽回信序列 (Neil: 「做 1–4」): 「沒付完時寄信提醒我」 — ticked by default where the law allows, like the launch box
  const [payRemind, setPayRemind] = useState(false);
  const [giftNotify, setGiftNotify] = useState(false); // the launch box — 09-23: ticked by default where the law allows (lib/consent), set after mount
  const [giftInvalid, setGiftInvalid] = useState(false);
  const [giftLimited, setGiftLimited] = useState(false); // the server's five-a-day brake answered 429

  /**
   * 09-17: the reading follows the language the question was written in, not
   * the page it was typed on. `langPick` is null while the reader lets that
   * stand, or holds whichever of the two languages they chose instead.
   */
  const [langPick, setLangPick] = useState<Locale | null>(null);
  const detectedLang = useMemo(() => detectQuestionLocale(question, locale), [question, locale]);
  const readingLocale: Locale = langPick ?? detectedLang ?? locale;
  // Editing the question must not quietly undo their choice: while they are
  // typing, detection drops to null the moment the sentence is too short, and
  // comes back a keystroke later. Only a genuinely different language is a new
  // decision.
  useEffect(() => { if (detectedLang) setLangPick(null); }, [detectedLang]);

  /* the gate's verdict when it blocks: "same" may be waived, "cap" may not */
  const [repeat, setRepeat] = useState<GateVerdict>(null);
  /**
   * 10-02 (Neil: 「直接做 1 吧」): the day's casts on one topic (or circling one matter) are spent — the cast is no longer
   * stopped. It goes ahead and can be read as ever; only the free line is not given, and a word about 一事一占 stands
   * in its place. Kept for the cast it let through; a fresh cast starts clear.
   */
  const [capped, setCapped] = useState<CapVerdict | null>(null);
  const cappedRef = useRef<CapVerdict | null>(null);
  const [repeatWaived, setRepeatWaived] = useState(false);
  /** 09-18: the earlier cast the gate matched, kept past unblock() so the re-cast can carry what it was told */
  const waivedPastRef = useRef<PastCast | null>(null);

  /**
   * 09-19 (Neil: 「解读露一句」): after the cast, one free sentence of the
   * call above the price — enough to feel the chart is about their matter.
   * Fetched once per cast + question (the server caches too); the reading
   * they then take opens with the same sentence. Never blocks anything: no
   * line, no block.
   */
  const [teaser, setTeaser] = useState<string | null>(null);
  /** 09-26 (E): the chart's own count of timing windows and the nearest one's rough place in the calendar */
  const [tHint, setTHint] = useState<{ n: number; first: string; kind: string; inAsk: boolean } | null>(null);
  // 10-31 进度表 131: the server gave no free line on purpose — the figure goes straight to the block before the price
  const [noLine, setNoLine] = useState(false);
  // 09-23 热区: did the price row ever come into view after the free line? (the step 70% leave at)
  const priceRowRef = useRef<HTMLDivElement | null>(null);
  const teaserAt = useRef<number | null>(null);
  const priceSeenFor = useRef<string | null>(null);
  useEffect(() => {
    const el = priceRowRef.current;
    // 10-31 进度表 131: with no free line, the price row after the figure counts the same (keyed by the cast)
    const key = teaser ?? (noLine && castAt ? `cast:${castAt}` : null);
    if (!key || !el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((en) => en.isIntersecting) && priceSeenFor.current !== key) {
        priceSeenFor.current = key;
        track("price_seen", { locale, cur: currency, ms: teaserAt.current ? Date.now() - teaserAt.current : undefined });
        io.disconnect();
      }
    }, { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teaser, noLine, castAt]);
  const [teaserLoading, setTeaserLoading] = useState(false);
  const teaserKeyRef = useRef<string>("");
  /**
   * 10-03 起卦记录 (lib/cast-log.ts, lib/nudge.ts): the server files every cast under its matter. On the 2nd+ cast of one
   * matter it says which cast this is and which figures came before (`thread`), writes the free line with those casts in
   * view, and hands the block shown before the price (`nudge` — words the learner picked; {price} filled here).
   */
  const [thread, setThread] = useState<{ n: number; first: string; chain: { day: string; hex: string }[] } | null>(null);
  const [nudge, setNudge] = useState<NudgeView | null>(null);
  /**
   * 10-22 分開 (lib/solo.ts): the reader said this cast is not the matter it was filed under. Travels with the cast
   * (`solo`) into the free line, the checkout and the reading — all written without the earlier casts.
   */
  const [solo, setSolo] = useState(false);
  // 10-13 同一件事反复问: the server says this cast is locked (②) or that its line waits for an address (③)
  const [rpLock, setRpLock] = useState<{ n: number; inWindow: number; until?: number } | null>(null);
  // 10-14 进度表 46 「怎樣算有結果？」(optional) — kept with the cast, never shown publicly
  const [outcomeHint, setOutcomeHint] = useState("");
  const hintSentRef = useRef("");
  useEffect(() => {
    // typed after the coins were thrown: put it on the cast already filed (api/cast/hint); before that, the cast's own
    // log call carries it (basePayload)
    if (!chart || !castAt) return;
    const v = outcomeHint.trim();
    if (v === hintSentRef.current) return;
    const timer = setTimeout(() => {
      hintSentRef.current = v;
      fetch("/api/cast/hint", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ castAtMs: castAt, outcomeHint: v }) }).catch(() => { /* optional */ });
    }, 1200);
    return () => clearTimeout(timer);
  }, [outcomeHint, chart, castAt]);
  const [rpGate, setRpGate] = useState(false);
  const [rpEmail, setRpEmail] = useState("");
  const [rpBad, setRpBad] = useState(false);
  const [rpTry, setRpTry] = useState(0);
  const rpEmailRef = useRef("");
  const nudgeSeenRef = useRef<string>("");
  const castLogKeyRef = useRef<string>("");
  // one repeat_blocked per block — the shake handler runs beginRite on every motion sample
  const blockedRef = useRef(false);
  // the question is remembered once per figure: at the cast if it was asked first, else when the reading is requested
  const rememberedRef = useRef(false);
  // the tier tapped when the reading gate blocked, to continue with after a waiver
  const [heldTier, setHeldTier] = useState<Tier | null>(null);

  const riteBegun = useRef(false);

  /* iOS Shake-to-Undo lives on the document's undo stack, survives element
     removal AND SPA navigation, and cannot be disabled from the web. The only
     cure is a clean document. So: any typing on THIS page, on a shake-capable
     device, schedules a self-replace (same URL, question carried in ?q=) at
     the natural pause — keyboard dismiss — before the rite begins. */
  const typedHere = useRef(false);
  const cleanseForShake = () => {
    if (!typedHere.current) return;
    if (castMode !== "shake" && castMode !== "ask") return;
    if (values.length > 0 || chart || spinning) return; // never mid-rite
    window.location.replace(cleanCastUrl(locale, question));
  };

  /* The entry question is skippable; the reading gate is not. */
  const [needQuestion, setNeedQuestion] = useState(false);
  /* Optional hints (borrowed from HUI's form, made optional): a declared
     time frame beats keyword detection for the timing granularity, and the
     detected topic is shown so a wrong guess can be corrected in one tap. */
  const [scaleHint, setScaleHint] = useState<ScaleHint | null>(null);
  const [topicHint, setTopicHint] = useState<Topic | null>(null);
  // 09-26: where a love matter stands (optional chips) — rides into the reading as a stated fact
  // 10-12: a landing page (/zh-hant/ask/…) arrives with the situation already said (?st=apart)
  const [situation, setSituation] = useState<Situation | null>(() => parseSituation(sp.get("st")) ?? null);
  const [hintOpen, setHintOpen] = useState<"scale" | "topic" | null>(null);
  const detectedTopic = useMemo(() => classifyTopic(question), [question]);
  /* 09-24: the time frame is read from the question too, like the topic — and shown as real dates,
     so "这个星期" reads back as "9月24日–27日" and a wrong guess is one tap away. The server reads
     the same words the same way (lib/scale-words.ts); nothing is sent unless the reader picks. */
  // dates depend on the reader's clock — computed after mount only, so the server render never disagrees
  const [clockReady, setClockReady] = useState(false);
  useEffect(() => setClockReady(true), []);
  const detectedScale = useMemo(() => {
    if (!clockReady || question.trim().length < 2) return null;
    const now = Date.now(), tz = -new Date().getTimezoneOffset();
    return { scale: questionScale(question, now, tz), window: askWindow(question, now, tz) };
  }, [question, clockReady]);
  const autoScaleKey: "auto" | ScaleHint = detectedScale && (SCALE_HINTS as readonly string[]).includes(detectedScale.scale) ? (detectedScale.scale as ScaleHint) : "auto";
  const topicShown = topicHint ?? detectedTopic;
  /* Locked = shown as static text. A question-first cast locks at completion;
     an empty-question cast stays editable until a reading actually exists —
     NEVER lock mid-typing (locking at "≥2 chars" unmounted the input under
     the user's fingers after the second character). */
  const [questionLocked, setQuestionLocked] = useState(false);
  const questionRef = useRef<HTMLInputElement>(null);

  /* from=<sid>: the same figure again, for the master reading (09-17). The
     light reading is the mirror; when the reader wants the when and the what,
     the cast page opens with their six lines, question and instant restored
     from the delivered session — no second cast, no gate — and only the deep
     tier on offer. */
  const fromSid = /^[A-Za-z0-9_\-]{8,120}$/.test(sp.get("from") ?? "") ? sp.get("from")! : null;
  const [upgrading, setUpgrading] = useState(false);
  useEffect(() => {
    if (!fromSid) return;
    let alive = true;
    fetch(`/api/reading/input?sid=${encodeURIComponent(fromSid)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { question: string; values: LineValue[]; castAtMs: number; tzOffsetMinutes: number; scaleHint?: ScaleHint; topicHint?: Topic; situation?: Situation } | null) => {
        if (!alive || !d || !Array.isArray(d.values) || d.values.length !== 6) return;
        setQuestion(d.question);
        setValues(d.values);
        setCastAt(d.castAtMs);
        setChart(fullChart({ values: d.values, utcMs: d.castAtMs, tzOffsetMinutes: d.tzOffsetMinutes }));
        setQuestionLocked(true);
        rememberedRef.current = true; // the matter was recorded when it was first cast
        if (d.scaleHint) setScaleHint(d.scaleHint);
        if (d.situation) setSituation(d.situation);
        if (d.topicHint) setTopicHint(d.topicHint);
        setUpgrading(true);
        setRestored(true);
      })
      .catch(() => { /* a dead link just leaves an ordinary cast page */ });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromSid]);

  /* 10-02 存到信箱 (对照测试 y): ?saved=<token> — the letter brings the saved figure back: question, six lines, instant (in
     the clock it was cast by), and the free line the letter quoted. The same figure; no second cast, no gate. */
  /* 10-26 「我的」: ?mine=<castId> — the reader's own kept cast (free line only) comes back the same way, from their account */
  const mineId = /^[1-9][0-9]{0,9}$/.test(sp.get("mine") ?? "") ? sp.get("mine")! : null;
  const savedToken = /^[0-9a-f]{48}$/.test(sp.get("saved") ?? "") ? sp.get("saved")! : mineId ? `mine:${mineId}` : null;
  const savedRef = useRef<{ castAt: number; q: string; teaser: string | null; timing: { n: number; first: string; kind: string; inAsk: boolean } | null } | null>(null);
  /** the cast's own UTC offset when it came back from a letter — the chart was drawn in that clock */
  const castTzRef = useRef<number | null>(null);
  const [savedBack, setSavedBack] = useState<null | "ok" | "gone">(null);
  /** 10-04 挽回信: the same link, from a reminder letter rather than the reader's own save — the banner says so */
  const [savedOrigin, setSavedOrigin] = useState<"saved" | "recover">("saved");
  useEffect(() => {
    if (!savedToken) return;
    let alive = true;
    fetch(mineId ? `/api/cast/mine?id=${mineId}` : `/api/cast/saved?t=${savedToken}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : r.status === 404 ? { gone: true } : null))
      .then((d: { gone?: boolean; question?: string; values?: LineValue[]; castAtMs?: number; tzOffsetMinutes?: number; teaser?: string | null; timing?: { n: number; first: string; kind: string; inAsk: boolean } | null; origin?: string } | null) => {
        if (!alive || !d) return;
        if (d.gone) { setSavedBack("gone"); return; }
        if (d.origin === "recover") setSavedOrigin("recover");
        if (typeof d.question !== "string" || !Array.isArray(d.values) || d.values.length !== 6 || typeof d.castAtMs !== "number") return;
        const tz = typeof d.tzOffsetMinutes === "number" ? d.tzOffsetMinutes : -new Date().getTimezoneOffset();
        savedRef.current = { castAt: d.castAtMs, q: d.question.trim(), teaser: d.teaser ?? null, timing: d.timing ?? null };
        castTzRef.current = tz;
        setQuestion(d.question);
        setValues(d.values);
        setCastAt(d.castAtMs);
        setChart(fullChart({ values: d.values, utcMs: d.castAtMs, tzOffsetMinutes: tz }));
        setQuestionLocked(true);
        rememberedRef.current = true; // recorded (if at all) when it was cast — the gate must not meet the reader's own figure
        setRestored(true);
        setSavedBack("ok");
        track(mineId ? "mine_open" : "saved_open", { locale });
      })
      .catch(() => { /* offline: an ordinary cast page */ });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedToken]);

  /**
   * 09-20 (Neil: 「用户输入的根本不是问题」): is what they typed a matter at
   * all? The rules (lib/question-check) answer on the spot — a sigh, "test",
   * one character repeated. The model answers a moment later: the page asks
   * as soon as typing stops, so the verdict is usually in hand before the
   * coins are. Either way the rite does not begin, and the reading is not
   * requested, on a question that names nothing. A rule refusal is final; the
   * model's is soft — "ask this anyway" — because a model can be wrong and a
   * reader must never be stuck.
   */
  const [qIssue, setQIssue] = useState<{ kind: "rule" | "model"; issue?: QuestionIssue } | null>(null);
  const verdictsRef = useRef<Map<string, MatterVerdict>>(new Map());
  const overridesRef = useRef<Set<string>>(new Set());
  const qBlockedRef = useRef(false); // one question_blocked per block — the shake handler asks on every motion sample
  const [qChecking, setQChecking] = useState(false);
  const askModel = async (q: string): Promise<MatterVerdict> => {
    const key = matterKey(q, locale);
    const known = verdictsRef.current.get(key);
    if (known) return known;
    try {
      const r = await fetch("/api/question-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, locale }),
      });
      const d = r.ok ? ((await r.json()) as { verdict?: MatterVerdict }) : null;
      const v: MatterVerdict = d?.verdict === "yes" || d?.verdict === "no" ? d.verdict : "unsure";
      if (v !== "unsure") verdictsRef.current.set(key, v);
      return v;
    } catch {
      return "unsure"; // offline or busy: never a block
    }
  };
  /** What stands against this question right now, without waiting on anything. */
  const questionProblem = (q: string): { kind: "rule" | "model"; issue?: QuestionIssue } | null => {
    const s = q.trim();
    if (s.length === 0) return null; // no question is allowed at the rite; the reading gate has its own message
    const issue = questionIssue(s, locale);
    if (issue) return { kind: "rule", issue };
    const key = matterKey(s, locale);
    if (verdictsRef.current.get(key) === "no" && !overridesRef.current.has(key)) return { kind: "model" };
    return null;
  };
  // ask the model as soon as they stop typing; the panel follows the question as it changes
  useEffect(() => {
    const s = question.trim();
    setQIssue((cur) => (cur && !questionProblem(s) ? null : cur));
    // 09-26: a crisis question gets the helpline note at once, not after the coins
    if (!pairActive && !upgrading && s.length >= 2 && !looksMidTyping(s) && isCrisis(s)) {
      setQIssue((cur) => (cur?.issue === "crisis" ? cur : { kind: "rule", issue: "crisis" }));
      return;
    }
    if (s.length < 2 || questionIssue(s, locale) || pairActive || upgrading) return;
    // 09-22: not while the IME is still assembling a character, and not on a
    // half-typed token — four of one day's refusals were people mid-keystroke
    if (looksMidTyping(s)) return;
    const key = matterKey(s, locale);
    if (verdictsRef.current.has(key) || overridesRef.current.has(key)) return;
    const timer = setTimeout(() => {
      askModel(s).then((v) => {
        // still the same text on screen, and it was refused: say so now, before the coins
        if (v === "no" && matterKey(question.trim(), locale) === key) setQIssue({ kind: "model" });
      });
      // 09-22: 700ms fires while someone is thinking mid-sentence. 「如果我打了
      // 一段嚴肅一點 來結束」 was refused, then refused again thirty seconds
      // later with four more characters on the end. Two seconds is still well
      // inside the time it takes to shake the coins, so nothing waits on this.
    }, 2_000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question, pairActive, upgrading]);
  const refuseQuestion = (p: NonNullable<ReturnType<typeof questionProblem>>, stage: "cast" | "reading") => {
    setQIssue(p);
    if (stage === "reading") {
      // reopen the box under a locked question — and keep it open until the reading exists,
      // or the first keystroke would swap the input for static text under their fingers
      setQuestionLocked(false);
      setNeedQuestion(true);
      questionRef.current?.focus(); // at the rite a shake handler would fight the keyboard: scroll only
    }
    questionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (qBlockedRef.current) return;
    qBlockedRef.current = true;
    track("question_blocked", { locale, method: p.kind, tier: stage });
  };
  const keepQuestion = () => {
    overridesRef.current.add(matterKey(question.trim(), locale));
    qBlockedRef.current = false;
    setQIssue(null);
    setNeedQuestion(false); // the reading-stage refusal raised it to reopen the box; the question stands now
    track("question_override", { locale });
    if (heldTier && chart) { const tier = heldTier; setHeldTier(null); void requestReading(tier); }
  };

  // a figure cast before a sign-in (or a closed tab) comes back as it was
  const [restored, setRestored] = useState(false);
  /** 09-26: the tier they had gone to pay for, when Stripe's cancel brought them back */
  const [payBackTier, setPayBackTier] = useState<"one" | "deep" | null>(null);
  /** 10-22 通卡: the fair-use line after a 429 from the member path */
  const [capMsg, setCapMsg] = useState<string | null>(null);
  /** 10-22 通卡: which pass is on its way to Stripe with this cast (the panel's pick) */
  const [passGoing, setPassGoing] = useState<TongkaDays | null>(null);
  /** 10-23 进度表 101: the pass last picked on this page — a resumed tap keeps it */
  const lastPassRef = useRef<TongkaDays | null>(null);
  /** 10-09: the checkout they came back from offered Alipay — the panel then says what to do when Alipay refused */
  const [payBackAli, setPayBackAli] = useState(false);
  useEffect(() => {
    if (pairToken || rewardToken || afterToken || fromSid || savedToken) return;
    const p = loadPending();
    if (!p) return;
    const urlQ = sp.get("q");
    if (giftUrl) {
      // 10-22 (客服 #1928): signing in from a gift link came back to an empty page — the figure cast on that same
      // link now waits like any other (a figure from elsewhere is not dressed up as the gift's)
      if (p.gift !== giftUrl || (urlQ && normalizeQ(urlQ) !== normalizeQ(p.q))) return;
    } else if (urlQ && !payFailed) return;
    // back from Stripe (pf=1): only the figure that went to checkout, for this question
    if (payFailed && (!p.sid || normalizeQ(p.q) !== normalizeQ(sp.get("q") ?? p.q))) return;
    if (payFailed && p.tier) { setPayBackTier(p.tier); setPayBackAli(!!p.alipay); track("checkout_back", { locale, tier: p.tier }); }
    // 10-23 进度表 101: the pass that went to checkout comes back with the figure — the retry buys the same one
    if (payFailed && p.pass && (p.pass === 1 || p.pass === 7 || p.pass === 30)) lastPassRef.current = p.pass;
    // 09-26 (review): that checkout was never paid — its session must not pose as "your reading" in the cast record
    if (payFailed && p.sid) forgetSid(p.sid);
    setQuestion(p.q);
    setValues(p.values);
    setCastAt(p.at);
    setChart(fullChart({ values: p.values, utcMs: p.at, tzOffsetMinutes: -new Date().getTimezoneOffset() }));
    if (p.q.trim().length >= 2) {
      setQuestionLocked(true);
      rememberedRef.current = true; // recorded when it was cast — the gate must not meet the reader's own figure
    }
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the invite's framing becomes the question; an invalid invite just falls back to an ordinary cast
  useEffect(() => {
    if (!pairToken) return;
    let alive = true;
    fetch(`/api/pair?token=${pairToken}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { status: string; framing: string; topic: string; tier: Tier } | null) => {
        if (!alive) return;
        if (!d) { setPair({ status: "unknown", framing: "", topic: "other", tier: "one" }); return; }
        setPair(d);
        if (d.status === "open") {
          setQuestion(d.framing);
          if ((TOPIC_HINTS as readonly string[]).includes(d.topic)) setTopicHint(d.topic as Topic);
        }
      })
      .catch(() => { /* offline: ordinary cast */ });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairToken]);

  // the aftermath link's context: the matter and the call it follows (state decides what the page offers)
  useEffect(() => {
    if (!afterToken) return;
    let alive = true;
    fetch(`/api/grant/after?token=${afterToken}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { question: string; call: string; state: "open" | "used" | "expired"; sid: string | null } | null) => {
        if (!alive) return;
        setAfter(d ?? { question: "", call: "", state: "expired", sid: null });
      })
      .catch(() => { /* offline: ordinary cast */ });
    return () => { alive = false; };
  }, [afterToken]);

  const zh = chineseLabels(locale); // Chinese-style chart labels (zh, zh-hant, ja)

  /* ---------- hold / shake, then throw ---------- */

  /** Show the gate's panel; count the block once, however often the motion handler asks. */
  const block = (v: NonNullable<GateVerdict>) => {
    if (blockedRef.current) return;
    blockedRef.current = true;
    setRepeat(v);
    // 09-22: method alone could not answer 「拦的是不是真的同一件事」. The event
    // carries no question — only the shape of the decision: which limit fired,
    // and how close the wordings were. (10-03: the casts themselves, questions
    // included, are kept server-side in the cast log — lib/cast-log.ts.)
    track("repeat_blocked", {
      locale,
      method: v.kind,
      tier: v.kind === "cap" ? v.by : v.waivable ? "waivable" : "spent",
      // `hex` is the numeric slot on a tracked event; here it carries either the
      // cap's count or the similarity percentage — named for its slot, not its meaning
      hex: v.kind === "cap" ? v.count : Math.round(similarity(normalizeQ(question), v.past.q, locale) * 100),
      mem: me?.entitlement?.active ? 1 : 0,
      same: v.kind === "same" || (v.kind === "cap" && v.by === "circling") ? 1 : 0,
    });
  };
  const unblock = () => {
    blockedRef.current = false;
    setRepeat(null);
  };
  /** The cap let this cast through (once per cast, however often the motion handler asks). */
  const passCap = (v: CapVerdict) => {
    if (cappedRef.current) return;
    cappedRef.current = v;
    setCapped(v);
    setTeaser(null); setTeaserLoading(false);
    track("repeat_capped", { locale, method: v.by, hex: v.count, mem: me?.entitlement?.active ? 1 : 0 });
  };

  // a blocked reader who changes the question (or its topic) gets a fresh verdict: a different matter reopens the rite
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!repeat || repeatWaived) return;
    const v = pairActive || afterSame || qianToken ? null : gateVerdict(pastCasts(), question, topicShown, locale, Date.now(), detectedTopic);
    if (!v || v.kind === "cap") unblock(); // 10-02: the cap no longer stops anything — the rite will let it through
    else if (v.kind !== repeat.kind) setRepeat(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question, topicShown]);
  // the reading gate fires from a button below the figure: bring the panel to the reader
  useEffect(() => {
    if (repeat && chart) panelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [repeat, chart]);

  /** One-matter-one-cast guard + first-toss bookkeeping, shared by both modes. */
  const beginRite = (): boolean => {
    // iOS binds a global Shake-to-Undo to any focused text field — shaking
    // the phone over our own rite pops "撤销键入". Nothing may hold focus
    // once the coins are in hand.
    try {
      (document.activeElement as HTMLElement | null)?.blur?.();
    } catch {
      /* no DOM, no problem */
    }
    // 09-20: a question that names no matter does not start the rite (an empty box still may)
    if (values.length === 0 && !pairActive && !upgrading) {
      const p = questionProblem(question);
      if (p) {
        refuseQuestion(p, "cast");
        return false;
      }
    }
    // 同题合参: the framing is the inviter's and the invite is spent once — not this reader's repeat
    // 回访奖励: the aftermath cast is the same matter on purpose — no gate either
    // 10-12 承接 ⑨: the first cast after a temple lot is the matter's first cast here — no gate either
    if (values.length === 0 && !repeatWaived && !pairActive && !afterSame && !qianToken) {
      const v = gateVerdict(pastCasts(), question, topicShown, locale, Date.now(), detectedTopic);
      // 10-02: the cap lets the cast through without the free line; the same matter is still asked about
      if (v && v.kind === "cap") passCap(v);
      else if (v) {
        block(v);
        return false;
      }
    }
    if (values.length === 0 && !riteBegun.current) {
      riteBegun.current = true;
      track("cast_start", { locale });
    }
    primeAudio();
    return true;
  };

  // what the cast means, handed to the rite (lib/cast-ui/use-rite reads it at the moment of use, so the newest closures answer)
  riteHandlers.current = {
    beginRite,
    onComplete: (next, now, c) => {
      setCastAt(now);
      // A question the cast was made WITH is fixed by it; one written after
      // stays editable until the reading exists.
      if (question.trim().length >= 2) {
        setQuestionLocked(true);
        rememberCast(question, hexName(c.cast.primary, locale), topicShown, detectedTopic, repeatWaived, { v: next, t: now });
        rememberedRef.current = true;
      }
      // 10-22: a figure cast on a friend's gift is kept too, with its gift (it used to vanish on the way to sign in)
      if (!pairToken && !rewardToken && !afterToken) savePending({ q: question, values: next, at: now, locale, ...(giftCastToken ? { gift: giftCastToken } : {}) });
      track("cast_complete", { locale, hex: c.cast.primary.number, cur: currency });
      castsHere.current += 1;
      setSecondCast(castsHere.current >= 2 && !pairToken && !giftCastToken && !rewardToken && !afterToken);
      if (giftCastToken) track("gift_open", { locale, method: "cast" });
    },
    onReveal: setChart,
  };

  const reset = () => {
    clearPending();
    setRestored(false);
    // Starting a fresh rite in a document that has been typed in would
    // re-expose iOS Shake-to-Undo — take the clean document instead.
    if (typedHere.current && (castMode === "shake" || castMode === "ask")) {
      window.location.replace(cleanCastUrl(locale, question));
      return;
    }
    clearRite(); setChart(null);
    setReadings({}); setActiveTier(null); setAiError(false);
    setNeedQuestion(false); setQuestionLocked(false); setFreeCastId(null);
    setQIssue(null); qBlockedRef.current = false;
    cappedRef.current = null; setCapped(null); setRpLock(null); setRpGate(false); setOutcomeHint(""); hintSentRef.current = "";
    setThread(null); setNudge(null); setNoLine(false); castLogKeyRef.current = ""; // 10-03 起卦记录
    setSolo(false); // 10-22 分開
    savedRef.current = null; castTzRef.current = null; setSavedBack(null);
    setSaveOpen(false); setSaveState(null); setSaveFromWallet(false);
  };

  // the rite ends mid-page; the document starts at its head
  useEffect(() => {
    if (chart) window.scrollTo({ top: 0, behavior: "smooth" });
  }, [chart]);


  /* ---------- account: does a membership cover this reading? ---------- */
  const [me, setMe] = useState<CastMe | null>(null);
  /** 10-23 进度表 101: /api/me did not answer — the cast page shows the pass panel instead of waiting for it */
  const [meFailed, setMeFailed] = useState(false);
  // 09-23 粘性: which day of visiting this is (dates only, kept in this browser) — the membership line speaks up from the second
  const [visitDay, setVisitDay] = useState(1);
  useEffect(() => setVisitDay(visitDayCount()), []);
  useEffect(() => {
    if (!PAYWALL) return;
    let alive = true;
    // the share code this session arrived with decides whether the first light reading is free (双边推荐)
    const via = viaTag();
    // 09-26 客户时区: the device's IANA zone rides along; a signed-in customer's is kept for the personal page
    const qs = new URLSearchParams({ ...(via ? { via } : {}), tz: deviceTimeZone() ?? "", bs: attribution().bs, l: locale });
    fetch(`/api/me?${qs}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: CastMe | null) => { if (!alive) return; if (d) setMe(d); else setMeFailed(true); })
      // 10-23 进度表 101: offline or failed — the pass panel (the one way to pay) rather than an endless frame
      .catch(() => { if (alive) setMeFailed(true); });
    return () => { alive = false; };
  }, []);
  // 10-22 (客服 #1928): a friend's gift this browser opened before and has not spent comes back on any later cast —
  // after a sign-in, from the account page's box, from the 問事 tab — unless this visit carries its own link or token,
  // or a membership / pass already covers the deep reading. Checked once, after /api/me.
  const keptCheckedRef = useRef(false);
  useEffect(() => {
    if (keptCheckedRef.current || giftUrl || pairToken || rewardToken || afterToken || fromSid) return;
    if (PAYWALL && !me) return;
    keptCheckedRef.current = true;
    if (me?.entitlement?.active) return;
    const k = keptGift();
    if (!k) return;
    fetch(`/api/grant/gift?token=${k}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { note?: string | null; review?: boolean; state?: string; own?: boolean } | null) => {
        if (!d) return;
        if (d.state !== "open" || d.own) { dropGift(k); return; }
        if (d.note) setGiftNote(d.note);
        if (d.review) setGiftReview(true);
        setGiftKept(k);
      })
      .catch(() => { /* offline: an ordinary cast */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);
  // prices in the buyer's own currency: preference cookie → device clock → device language → edge country → USD
  const [currency, chooseCurrency, currencySource] = useCurrency(undefined, me?.country ?? null);
  // 09-23 (Neil: 「愿意收推广邮件，这个改成默认勾选吧」): the clock and the edge both get a veto — see lib/consent
  useEffect(() => { const on = marketingBoxStartsTicked(countryFromTimeZone(deviceTimeZone()), me?.country ?? null); setGiftNotify(on); setPayRemind(on); }, [me?.country]);
  const price = priceLabels(currency, locale);
  // 10-10 首月同价: a reader never a member before pays the one-off month's price for the first month — every offer
  // of the subscription here says both numbers (signed out counts as first; the checkout decides for real)
  const firstMonth = (me?.firstMonth ?? true) && firstMonthExtraMinor(currency) > 0;
  const firstLabel = formatMoney(currency, firstMonthMinor(currency), locale);
  // a monthly fee named in a sentence gets "(first month …)" after it
  const monthSaid = firstMonth ? `${price.month}${firstT(locale, "paren", { first: firstLabel })}` : price.month;
  // a mainland clock: Stripe's own page is often unreachable there without a proxy — say so before they hit the wall
  const [mainland, setMainland] = useState(false);
  /** 09-26 (D): the mainland notice is showing for this tier / they said they hold an international card */
  const [cnAsk, setCnAsk] = useState<Tier | null>(null);
  const [replyAck, setReplyAck] = useState(false);
  // 09-26 对照测试 (lib/ab.ts): this browser's arms, drawn after mount
  const [arms, setArms] = useState<ReturnType<typeof abArms>>(null);
  useEffect(() => { setArms(abArms()); }, []);
  // 10-02 对照测试 x: what the full reading of THIS figure holds, under the free line, and price buttons that say what each gives
  const previewArm = PAYWALL && !!arms?.preview && !!me?.ab?.preview;
  /** x1's button words: only where the plain prices show (not a member's, a pair's, an aftermath's, a gift's or a reward's) */
  const x1Copy = previewArm && !pairActive && !afterActive && !rewardToken && !giftCastToken && !me?.entitlement?.active;
  const previewOn = x1Copy && !upgrading && !me?.inviteFree;
  // 10-02 对照测试 y: 「还没想好？把这一卦存到信箱」
  const [saveOpen, setSaveOpen] = useState(false);
  // 10-12 B①: the Apple / Google Pay sheet was closed unpaid and the reader chose to keep the cast in their inbox
  const [saveFromWallet, setSaveFromWallet] = useState(false);
  // 10-12 B② 第 3–4 卦存这件事: the address box on the 3rd–4th cast of a matter
  const [matterEmail, setMatterEmail] = useState("");
  const [matterState, setMatterState] = useState<null | "busy" | "done" | "bad" | "domain" | "many" | "err">(null);
  const [saveEmail, setSaveEmail] = useState("");
  const [saveState, setSaveState] = useState<null | "busy" | "done" | "err" | "many" | "bad" | "domain">(null);
  const [savedTo, setSavedTo] = useState("");
  const [teaserOdds, setTeaserOdds] = useState<Odds | null>(null);
  // 09-28 对照测试 (v1): the paragraph under the line
  const [teaserMore, setTeaserMore] = useState<string | null>(null);
  // 09-28: casts made in this page visit — the second one gets a word (376 non-payers cast again instead of reading)
  const castsHere = useRef(0);
  const [secondCast, setSecondCast] = useState(false);
  // 09-26 (Neil: 「所有客户看解读都必须要填邮箱，包括被赠送的和免费的」): which free path is asking for an address
  const [emailFor, setEmailFor] = useState<null | "free" | "invite" | "pair">(null);
  const setFreeAsk = (on: boolean) => setEmailFor(on ? "free" : null);
  const [freeGone, setFreeGone] = useState(false);
  const [freeEmail, setFreeEmail] = useState("");
  const freeEligible = PAYWALL && !!arms?.free && !!me?.ab?.free && !!me?.neverPaid && !me?.entitlement?.active && !me?.inviteFree
    && !freeGone && !pairActive && !giftCastToken && !rewardToken && !upgrading;
  /**
   * 10-22 通卡 (lib/tongka.ts, 进度表 75): the pass panel stands where the two single prices stood — for a reader the
   * switch shows it to, with nothing covering the reading already (a membership / pass redeems; a gift, a reward, a
   * pair cast, an upgrade of an old light reading and the share's free line keep their own paths).
   */
  /*
   * 10-23 进度表 101 (Neil: 「把 101 的 ①②③都做完吧」): under the 通卡 model nothing is sold as a single reading. The pass
   * panel is the one paid door — an upgrade of an old light reading included; the two-tier price row stays only for what
   * is free to claim (a pair cast, an aftermath link, a gift or a reward, the share's invite, the free first light), and
   * then only with those free tiers. The free first light keeps its button AND gets the panel under it.
   */
  const tongkaOn = PAYWALL && (!!me?.tongka || (!me && meFailed)) && !me?.entitlement?.active;
  const freeTiers: readonly Tier[] | null = !tongkaOn ? null
    : pairActive ? [pair!.tier] : afterActive ? ["one"] : giftCastToken || rewardToken ? ["deep"] : me?.inviteFree ? [INVITE_TIER] : freeEligible ? ["one"] : null;
  const tongkaPanelOn = tongkaOn && (!freeTiers || (freeEligible && !pairActive && !afterActive && !giftCastToken && !rewardToken && !me?.inviteFree));
  const tongkaFirstPrice = formatMoney(currency, tongkaMinor(currency, 1, !!me?.firstTongka), locale);
  // 09-26 会员单月: the second paid question of the day — offer the membership, the one-off month, or just this one
  const [secondAsk, setSecondAsk] = useState<Tier | null>(null);
  const secondAckRef = useRef(false);
  const cnAckRef = useRef(false);
  useEffect(() => { setMainland(isMainlandTimeZone(deviceTimeZone(), locale, navigator.language)); }, []);
  // 09-26: Taiwan / Hong Kong buyers now pay on YaoFlow's own Stripe page — no Link page to announce
  const [plainPay, setPlainPay] = useState(false);
  useEffect(() => { setPlainPay(!!plainCheckoutRegion(me?.country ?? null, deviceTimeZone(), MP_OFF_REGIONS_DEFAULT)); }, [me?.country]);
  // 09-26 钱包直付: for those buyers, Apple Pay / Google Pay on this page (the key is public; absent = keep the redirect)
  const [walletPk, setWalletPk] = useState<string | null>(null);
  const [walletTier, setWalletTier] = useState<Tier | null>(null);
  // 09-26 (Neil: 「跳转还是有点慢」): whether this device has Apple Pay / Google Pay, learned before the tap — null = still finding out
  const [walletAvail, setWalletAvail] = useState<boolean | null>(null);
  const walletSkipRef = useRef(false);
  useEffect(() => {
    if (!plainPay || !PAYWALL) return;
    let alive = true;
    fetch("/api/pay/config", { cache: "no-store" }).then((r) => r.json()).then((d: { pk?: string | null }) => { if (alive && d.pk) setWalletPk(d.pk); }).catch(() => undefined);
    return () => { alive = false; };
  }, [plainPay]);
  const covered = (tier: Tier): boolean => {
    const e = me?.entitlement;
    if (!e?.active) return false;
    return tier === "deep" ? e.deepLeft > 0 : e.lightLeft > 0;
  };

  /* ---------- AI / checkout ---------- */
  const basePayload = () => ({
    question, values, castAtMs: castAt,
    tzOffsetMinutes: castTzRef.current ?? -new Date().getTimezoneOffset(),
    timeZone: deviceTimeZone(),
    ...(scaleHint ? { scaleHint } : {}),
    ...(topicHint ? { topicHint } : {}),
    ...(situation && topicShown === "relationship" ? { situation } : {}),
    ...(teaserOdds ? { teaserOdds } : {}),
    ...(outcomeHint.trim().length >= 2 ? { outcomeHint: outcomeHint.trim().slice(0, 60) } : {}),
    // 10-14 进度表 47: the sharer's ref this visit came through — the first cast here earns both sides a light reading
    ...(refTag() ? { r: refTag() } : {}),
    ...(abArms()?.tag ? { ab: abArms()!.tag } : {}),
    // the language the reading itself should be written in; `locale` stays the
    // page's, because that is what the delivery URL and the chrome are in
    ...(readingLocale !== locale ? { rl: readingLocale } : {}),
    // 09-18: they went ahead on a matter the gate recognised — carry what they
    // were told last time so the new reading continues rather than contradicts
    ...(repeatWaived && !solo && waivedPastRef.current?.verdict
      ? { prior: { q: waivedPastRef.current.raw ?? waivedPastRef.current.q, at: waivedPastRef.current.at, hex: waivedPastRef.current.hex, call: waivedPastRef.current.verdict } }
      : {}),
    // 10-22 分開: this cast is a new matter — filed on its own, the line and the reading see no earlier casts
    ...(solo ? { solo: true } : {}),
    // 09-19: the free line they were shown — the reading opens with it
    ...(teaser ? { teaser } : {}),
    // 10-12 解籤: the lot this cast follows (the server reads it from its own row)
    ...(qianToken ? { qian: qianToken } : {}),
    // 10-17 承接: the 擲筊 / tarot spread this cast follows (the server reads it from its own row)
    ...(preRef ? { pre: preRef } : {}),
  });

  useEffect(() => {
    if (!PAYWALL || !chart || !castAt || pairActive || upgrading) return;
    const q = question.trim();
    if (q.length < 2 || questionProblem(q)) return;
    const key = `${castAt}|${q}|${readingLocale}|${solo ? "solo" : ""}`;
    if (teaserKeyRef.current === key) return;
    // 10-02 一事一占: a cast the cap let through gets no free line (a question written after the cast is checked here)
    if (cappedRef.current) return;
    // 10-02 存到信箱: a saved cast comes back with the line the letter quoted — the same words, no second model call
    const sv = savedRef.current;
    if (sv && sv.castAt === castAt && sv.q === q && sv.teaser) {
      teaserKeyRef.current = key;
      setTeaser(sv.teaser); setTHint(sv.timing); setTeaserOdds(null); setTeaserMore(null); setTeaserLoading(false);
      teaserAt.current = Date.now();
      return;
    }
    // 10-22 分開: a cast the reader marked as a new matter is not counted against the one it was taken for
    if (!rememberedRef.current && !repeatWaived && !afterSame && !qianToken && !solo) {
      const v = gateVerdict(pastCasts(), q, topicShown, locale, Date.now(), detectedTopic);
      if (v && v.kind === "cap") { passCap(v); return; }
    }
    // a keystroke in the question box must not fire a call per letter
    const timer = setTimeout(() => {
      teaserKeyRef.current = key;
      setTeaser(null); setNoLine(false); setTHint(null); setTeaserOdds(null); setTeaserMore(null); setThread(null); setNudge(null);
      setRpLock(null); setRpGate(false);
      setTeaserLoading(true);
      fetch("/api/teaser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // 10-03: the tab's id (joins the cast to its events) and whether a membership covers the reading (no price, no block)
        body: JSON.stringify({ ...basePayload(), locale, bs: attribution().bs, ...(me?.entitlement?.active ? { member: true } : {}), ...(abArms()?.odds ? { odds: true } : {}), ...(abArms()?.verdict ? { more: true } : {}), ...(rpEmailRef.current ? { email: rpEmailRef.current } : {}) }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { teaser?: string | null; odds?: string; more?: string; timing?: { n: number; first: string; kind: string; inAsk: boolean } | null; thread?: { n: number; first: string; chain: { day: string; hex: string }[] }; nudge?: NudgeView } | null) => {
          if (teaserKeyRef.current !== key) return;
          setTeaserOdds(parseOdds(d?.odds) ?? null);
          setTeaserMore(typeof d?.more === "string" && d.more ? d.more : null);
          setTHint(d?.timing && typeof d.timing.first === "string" ? d.timing : null);
          const th = d?.thread && typeof d.thread.n === "number" && Array.isArray(d.thread.chain) ? d.thread : null;
          setThread(th);
          setNudge(d?.nudge && typeof d.nudge.id === "string" && typeof d.nudge.cta === "string" ? d.nudge : null);
          const rp = d as { lock?: { n: number; inWindow: number; until?: number }; emailGate?: boolean } | null;
          setRpLock(rp?.lock && typeof rp.lock.n === "number" ? rp.lock : null);
          setRpGate(rp?.emailGate === true);
          const rg = (d as { refGift?: { url?: unknown; until?: unknown } } | null)?.refGift;
          if (rg && typeof rg.url === "string" && typeof rg.until === "number") setRefGift({ url: rg.url, until: rg.until });
          const nl = (d as { noLine?: unknown } | null)?.noLine === true;
          setNoLine(nl);
          if (nl) teaserAt.current = Date.now();
          const line = d?.teaser && typeof d.teaser === "string" ? d.teaser : null;
          setTeaser(line);
          if (line) { track("teaser_shown", { locale, cur: currency, ...(th && th.n >= 2 ? { hex: Math.min(64, th.n) } : {}) }); teaserAt.current = Date.now(); }
        })
        .catch(() => { if (teaserKeyRef.current === key) setTeaser(null); })
        .finally(() => { if (teaserKeyRef.current === key) setTeaserLoading(false); });
    }, 900);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, castAt, question, readingLocale, pairActive, upgrading, rpTry, solo]);

  // 10-03 起卦记录: a cast the cap let through asks for no free line — it is still written down and filed under its matter
  // (api/cast/log), and on the 2nd+ cast of a matter it still gets the figures before it and the block before the price
  useEffect(() => {
    if (!PAYWALL || !chart || !castAt || !capped || pairActive || upgrading) return;
    const q = question.trim();
    if (q.length < 2 || questionProblem(q)) return;
    const key = `${castAt}|${q}|${solo ? "solo" : ""}`;
    if (castLogKeyRef.current === key) return;
    const timer = setTimeout(() => {
      castLogKeyRef.current = key;
      fetch("/api/cast/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...basePayload(), locale, capped: true, bs: attribution().bs, ...(me?.entitlement?.active ? { member: true } : {}) }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { thread?: { n: number; first: string; chain: { day: string; hex: string }[] }; nudge?: NudgeView } | null) => {
          if (castLogKeyRef.current !== key || !d) return;
          setThread(d.thread && typeof d.thread.n === "number" && Array.isArray(d.thread.chain) ? d.thread : null);
          setNudge(d.nudge && typeof d.nudge.id === "string" && typeof d.nudge.cta === "string" ? d.nudge : null);
          const rp = d as { lock?: { n: number; inWindow: number; until?: number }; refGift?: { url?: unknown; until?: unknown } };
          setRpLock(rp.lock && typeof rp.lock.n === "number" ? rp.lock : null);
          if (rp.refGift && typeof rp.refGift.url === "string" && typeof rp.refGift.until === "number") setRefGift({ url: rp.refGift.url, until: rp.refGift.until });
        })
        .catch(() => { /* the cast stands without it */ });
    }, 900);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, castAt, capped, question, pairActive, upgrading, solo]);

  /** 10-03 付费话术学习: the block before the price is on the page (the learner counts only what was shown) */
  const nudgeOn = !!nudge && PAYWALL && !me?.entitlement?.active && !pairActive && !afterActive && !upgrading && !giftCastToken && !rewardToken
    && !activeTier && (!!capped || !!teaser || !!rpLock || noLine);
  const nudgePrice = tongkaPanelOn ? tongkaFirstPrice : me?.firstDeep && !firstPriceGone ? price.one : price.deep; // 10-22 通卡: the 1 日通卡
  useEffect(() => {
    if (!nudgeOn || !nudge) return;
    const k = `${castAt}|${nudge.id}`;
    if (nudgeSeenRef.current === k) return;
    nudgeSeenRef.current = k;
    track("nudge_shown", { locale, method: nudge.id, hex: Math.min(64, Math.max(2, thread?.n ?? 2)), cur: currency });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nudgeOn, nudge?.id, castAt]);
  /**
   * 10-22 分開 (Neil, after a reader's Threads message: her casts about different people were read as one matter): one tap
   * says this cast is not the matter it was filed under. The cast leaves that matter for one of its own (lib/cast-log.ts),
   * the free line is written again without the earlier casts, the cap and the repeat lock let go, and `solo` rides with
   * the cast into the checkout and the reading.
   */
  const separate = () => {
    if (solo) return;
    setSolo(true);
    cappedRef.current = null; setCapped(null); setRpLock(null); setRpGate(false); setThread(null); setNudge(null);
    teaserKeyRef.current = ""; castLogKeyRef.current = "";
  };
  const sepChip = () => (PAYWALL && chart ? (
    solo ? (
      <p className="t-small mt-0.5 !text-[var(--ink-45)]" data-heat="sep-done">{ctt(locale, "sepDone")}</p>
    ) : (
      <button type="button" data-heat="sep-chip" onClick={separate} className="t-small mt-0.5 underline underline-offset-4 !text-[var(--ink-45)] hover:!text-[var(--ink)]">
        {ctt(locale, "sepChip")}
      </button>
    )
  ) : null);
  /** 「這件事的第 3 卦」 and the figures before this one (the newest five) — or, once separated, the one line saying so */
  const threadChain = () => (thread && thread.n >= 2 && chart ? (
    <div className="mb-2" data-heat="thread-chain">
      <p className="t-label !text-[var(--gold-text)]">{ctt(locale, "thCount", { n: thread.n })}</p>
      <p className="t-small mt-0.5 !text-[var(--ink-66)]">
        {thread.n - 1 > thread.chain.length ? `${ctt(locale, "thMore")} ` : ""}
        {thread.chain.map((c, i) => (
          <span key={`${c.day}-${i}`} className="whitespace-nowrap">{shortDay(c.day, locale)} {c.hex}<span aria-hidden> · </span></span>
        ))}
        <span className="whitespace-nowrap !text-[var(--ink)]">{ctt(locale, "thNow")} {hexName(chart.cast.primary, locale)}</span>
      </p>
      {sepChip()}
    </div>
  ) : solo && chart ? <div className="mb-2">{sepChip()}</div> : null);
  /** 10-06: the membership's prices in the buyer's currency, for a block that sells it ({month} / {pass}; {price} is the reading's) */
  const nudgePass = formatMoney(currency, passMinor(currency), locale);
  const nudgeFill = (s: string) => s.replace(/\{price\}/g, nudgePrice).replace(/\{month\}/g, monthSaid).replace(/\{pass\}/g, nudgePass);
  // 10-10: a button that sells the membership at "{month}/month" says the first month instead, for whom it applies
  const nudgeCta = (cta: string) => (firstMonth && /\{month\}/.test(cta) ? firstT(locale, "cta", { first: firstLabel }) : nudgeFill(cta));
  /**
   * The block before the price — the learner's words for this cast of the matter, and one button: straight to the full
   * reading, or (10-06, the 4th+ cast's fixed block) to the membership page, with the one-off month under it.
   */
  const nudgeBlock = () => (nudgeOn && nudge ? (
    <div className="mt-[var(--s-3)] pt-[var(--s-3)] border-t border-[var(--ink-16)] fade-in" data-nudge={nudge.id}>
      <p className="t-body !text-[15px]">{nudgeFill(nudge.title)}</p>
      <p className="t-small mt-1 !text-[var(--ink-66)]">{nudgeFill(nudge.body)}</p>
      {nudge.goal === "member" ? (
        <>
          <a
            href={`/${locale}/account#membership`}
            data-heat="nudge-member"
            onClick={() => track("reading_click", { locale, tier: "deep", method: "nudge_member" })}
            className="inline-block mt-[var(--s-3)] min-h-[var(--s-6)] px-5 py-2.5 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.1em]"
          >
            {nudgeCta(nudge.cta)}
          </a>
          <a
            href={`/${locale}/account?want=pass#membership`}
            data-heat="nudge-pass"
            onClick={() => track("reading_click", { locale, tier: "deep", method: "nudge_pass" })}
            className="block t-small mt-[var(--s-2)] underline underline-offset-4 !text-[var(--ink-66)] hover:!text-[var(--ink)]"
          >
            {passT(locale, "link", { pass: nudgePass })}
          </a>
        </>
      ) : (
        <button
          type="button"
          data-heat="nudge-cta"
          disabled={aiLoading !== null || qChecking}
          onClick={() => {
            if (tongkaPanelOn) { setPassGoing(1); void requestReading("deep", false, 1); } else void requestReading("deep"); // 10-22 通卡
            // the address box (first price) or Apple Pay opens under the price buttons — bring them into view
            setTimeout(() => priceRowRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
          }}
          className="mt-[var(--s-3)] min-h-[var(--s-6)] px-5 py-2.5 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.1em] disabled:opacity-50"
        >
          {aiLoading === "deep" ? t(locale, "aiLoading") : nudgeCta(nudge.cta)}
        </button>
      )}
    </div>
  ) : null);

  /** 10-02 对照测试 y1: email this cast to the reader (lib/saved-cast.ts) */
  const saveCast = async () => {
    const e = normalizeEmail(saveEmail);
    if (!e || emailShapeBad(e)) { setSaveState("bad"); return; }
    if (emailNeedsAttention(e)) return; // the typo hint is showing
    setSaveState("busy");
    try {
      const r = await fetch("/api/cast/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: e, question: question.trim(), values, castAtMs: castAt, tzOffsetMinutes: castTzRef.current ?? -new Date().getTimezoneOffset(), locale, teaser, currency }),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      if (r.ok) { setSavedTo(e); setSaveState("done"); track("cast_saved", { locale, method: "ok", cur: currency }); return; }
      setSaveState(d.error === "too_many" ? "many" : d.error === "email_domain" ? "domain" : d.error === "bad_email" ? "bad" : "err");
      track("cast_saved", { locale, method: String(d.error ?? r.status).slice(0, 20) });
    } catch {
      setSaveState("err");
      track("cast_saved", { locale, method: "network" });
    }
  };

  /** 10-12 B②: keep this matter (the cast, the free line) and write once when the first time the chart names is near */
  const saveMatter = async () => {
    const e = normalizeEmail(matterEmail);
    if (!e || emailShapeBad(e)) { setMatterState("bad"); return; }
    if (emailNeedsAttention(e)) return;
    setMatterState("busy");
    try {
      const r = await fetch("/api/cast/save", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: e, question: question.trim(), values, castAtMs: castAt, tzOffsetMinutes: castTzRef.current ?? -new Date().getTimezoneOffset(), locale, teaser, currency, matter: { first: tHint?.first ?? null } }),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      if (r.ok) {
        setMatterState("done");
        try { localStorage.setItem(`yf_ms_${thread?.first ?? ""}`, "1"); } catch { /* private window */ }
        track("cast_saved", { locale, method: `matter${thread?.n ?? ""}`, cur: currency });
        return;
      }
      setMatterState(d.error === "too_many" ? "many" : d.error === "email_domain" ? "domain" : d.error === "bad_email" ? "bad" : "err");
    } catch { setMatterState("err"); }
  };

  const requestReading = async (tier: Tier, waived = false, passArg?: TongkaDays | null) => {
    if (!chart || aiLoading || qChecking) return;
    // 10-23 进度表 101: a tap resumed later — after the question gate, the address ask, the mainland note, a retry — keeps
    // the pass that was picked. On 10-22 four went through as single full readings because these re-sent the tap without it.
    const pass: TongkaDays | null = passArg !== undefined ? passArg : tier === "deep" && tongkaPanelOn ? (lastPassRef.current ?? passGoing ?? 1) : null;
    if (pass) lastPassRef.current = pass;
    // The cast may begin without a question, but the reading cannot: the
    // figure is fixed, and what it answers depends on what was asked. This
    // is the moment the question becomes mandatory — same place HUI collects
    // it, without giving up our question-first front door.
    if (question.trim().length < 2) {
      setNeedQuestion(true);
      questionRef.current?.focus();
      questionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    // 09-20: and it must name a matter. The rules answer at once; if the model
    // has not answered yet (they typed and tapped inside a second), wait for it
    // here — briefly — rather than read on a question nobody has looked at.
    if (!pairActive && !upgrading) {
      let p = questionProblem(question);
      if (!p && !verdictsRef.current.has(matterKey(question.trim(), locale)) && !overridesRef.current.has(matterKey(question.trim(), locale))) {
        setQChecking(true);
        await Promise.race([askModel(question.trim()), new Promise<void>((r) => setTimeout(r, 4_000))]).catch(() => undefined);
        setQChecking(false);
        p = questionProblem(question);
      }
      if (p) {
        setHeldTier(tier);
        refuseQuestion(p, "reading");
        return;
      }
    }
    // A question written after the cast met no gate at the rite — it meets it
    // here, and is remembered here (09-15: this path used to see neither).
    if (!rememberedRef.current && !pairActive && !afterSame) {
      if (!repeatWaived && !waived && !qianToken) {
        const v = gateVerdict(pastCasts(), question, topicShown, locale, Date.now(), detectedTopic);
        if (v && v.kind === "cap") passCap(v); // 10-02: not stopped — the reading may be had as ever
        else if (v) {
          setHeldTier(tier);
          // 09-17: they DID tap a priced button — the gate just got there first.
          // `reading_click` stays what it always was so the funnel keeps its
          // shape; this one records the intent the gate ate.
          track("reading_click_blocked", { locale, tier, cur: currency, method: v.kind });
          block(v);
          return;
        }
      }
      rememberCast(question, hexName(chart.cast.primary, locale), topicShown, detectedTopic, repeatWaived, { v: values, t: castAt });
      rememberedRef.current = true;
    }
    if (tier === "one" && readings.one) { setActiveTier("one"); return; }
    if (tier === "deep" && readings.deep) { setActiveTier("deep"); return; }
    setAiLoading(tier);
    setAiError(false);
    track("reading_click", { locale, tier, cur: currency });

    // 同题合参: the invitee's reading is the inviter's to give — redeem the pair instead of paying
    if (pairActive && tier === pair!.tier) {
      const pe = normalizeEmail(freeEmail);
      if (!me?.signedIn && (!pe || emailShapeBad(pe))) { setEmailFor("pair"); setAiLoading(null); return; }
      if (!me?.signedIn && emailNeedsAttention(pe)) { setAiLoading(null); return; }
      setCheckingOut(true);
      try {
        const res = await fetch("/api/pair/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...basePayload(), ...attribution(), token: pairToken, locale, ...(!me?.signedIn ? { email: pe } : {}) }),
        });
        if (res.status === 400) { const e = (await res.json().catch(() => ({}))) as { error?: string }; setEmailErr(e.error === "email_domain" ? "domain" : "bad"); setEmailFor("pair"); setAiLoading(null); setCheckingOut(false); return; }
        if (res.status === 403) setPairSelf(true);
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { url: string };
        track("checkout_start", { locale, tier, cur: currency });
        clearPending();
        window.location.href = data.url;
        return;
      } catch (err) {
        track("client_error", { locale, method: `cast:${String(err instanceof Error ? err.message : err).replace(/\s+/g, " ").slice(0, 18)}` });
        setAiError(true);
        setAiLoading(null);
        setCheckingOut(false);
        setPassGoing(null);
        return;
      }
    }

    // a membership covers it: spend one allowance unit, reading is delivered on /reading?sid=sub_…
    if (PAYWALL && covered(tier)) {
      setCheckingOut(true);
      try {
        const res = await fetch("/api/sub/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...basePayload(), ...attribution(), tier, locale }),
        });
        if (res.status === 429) {
          // 10-22 通卡: the fair-use fuse — one line, no fallback to a price (they already paid for the window)
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          if (j.error === "cap_day" || j.error === "cap_rate") { setCapMsg(tongkaT(locale).capHit); setCheckingOut(false); setAiLoading(null); return; }
        }
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { url: string };
        track("sub_redeem", { locale, tier, cur: currency });
        clearPending();
        window.location.href = data.url;
        return;
      } catch {
        // allowance may have run out under us — fall back to the ordinary paid path
        setCheckingOut(false);
        setMe((m) => (m ? { ...m, entitlement: m.entitlement ? { ...m.entitlement, active: false } : undefined } : m));
      }
    }

    // a referral reward or a friend's gift pays for the deep tier — and the aftermath link (09-21) for the light one: redeem instead of checkout
    if ((tier === "deep" && (rewardToken || giftCastToken)) || (tier === "one" && afterActive)) {
      const friendEmail = normalizeEmail(giftFriendEmail);
      if (tier === "deep" && giftCastToken && !rewardToken && !me?.signedIn && (!friendEmail || emailShapeBad(friendEmail))) {
        setGiftFriendInvalid(giftAskEmail); // second tap without an address: say why
        setGiftAskEmail(true);
        setAiLoading(null);
        return;
      }
      // 09-26: a suspected typo waits for "use that" / "it's correct" under the box
      if (tier === "deep" && giftCastToken && !rewardToken && !me?.signedIn && emailNeedsAttention(friendEmail)) { setAiLoading(null); return; }
      setCheckingOut(true);
      try {
        const res = await fetch(giftCastToken || afterActive ? "/api/grant/redeem" : "/api/reward/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...basePayload(), ...attribution(), token: afterActive ? afterToken : giftCastToken ?? rewardToken, locale, ...((giftCastToken || afterActive) && !me?.signedIn && giftFriendEmail.trim() ? { email: friendEmail } : {}) }),
        });
        if (res.status === 400 && (giftCastToken || afterActive)) {
          const e = (await res.json().catch(() => ({}))) as { error?: string };
          if (e.error === "bad_email" || e.error === "email_domain") { setEmailErr(e.error === "bad_email" ? "bad" : "domain"); setAiLoading(null); setCheckingOut(false); return; }
          // 11-03 (Neil 看板「client_error_proxy 11」): a shared light reading (ref / case) from someone with no address on file
          // needs the reader's own — the server said so with 400 email_required and the page only showed 「出錯了」, eleven taps
          if (e.error === "email_required" && afterActive) { setGiftFriendInvalid(giftAskEmail); setGiftAskEmail(true); setAiLoading(null); setCheckingOut(false); return; }
        }
        // 09-24: the giver opening their own gift — say so, instead of a generic failure
        // 10-16: spent (409) or past its date (410) while the page was open — say so; the next tap is an ordinary purchase
        if ((res.status === 409 || res.status === 410) && giftCastToken) { dropGift(giftCastToken); setGiftDead({ why: res.status === 409 ? "used" : "expired" }); setAiLoading(null); setCheckingOut(false); return; }
        if (res.status === 403 && giftCastToken) { dropGift(giftCastToken); const e = (await res.json().catch(() => ({}))) as { error?: string }; setGiftSelf(e.error === "returned" ? "returned" : e.error === "device" ? "device" : "self"); setAiLoading(null); setCheckingOut(false); return; }
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { url: string };
        track("checkout_start", { locale, tier, cur: currency });
        clearPending();
        if (giftCastToken) dropGift(giftCastToken); // spent: no longer offered on this browser's later casts
        window.location.href = data.url;
        return;
      } catch (err) {
        track("client_error", { locale, method: `cast:${String(err instanceof Error ? err.message : err).replace(/\s+/g, " ").slice(0, 18)}` });
        setAiError(true);
        setAiLoading(null);
        setCheckingOut(false);
        return;
      }
    }

    // the painted door: the tap was the intent (reading_click, above). Open
    // the claim panel instead of a checkout; claimGift() takes it from there.
    if (GIFT) {
      setAiLoading(null);
      setGiftTier(tier);
      // 09-17: the tiers ask for different things, so the other tier's complaint
      // must not follow you across ("email is not valid" under an empty box)
      setGiftInvalid(false);
      setGiftLimited(false);
      return;
    }

    // paywall on → Stripe Checkout; reading is delivered on /reading?sid=…
    if (PAYWALL) {
      // 09-26 对照测试 (f1): a new visitor's first light reading, free for an address
      if (tier === "one" && freeEligible) {
        const typed = normalizeEmail(freeEmail);
        if (!me?.signedIn && (!typed || emailShapeBad(typed))) { setFreeAsk(true); setAiLoading(null); return; }
        if (!me?.signedIn && emailNeedsAttention(typed)) { setAiLoading(null); return; }
        setCheckingOut(true);
        try {
          const res = await fetch("/api/checkout", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...basePayload(), ...attribution(), tier, locale, currency, curSrc: currencySource, via: viaTag(), freeFirst: true, ...(giftNotify ? { notify: true } : {}), ...(!me?.signedIn ? { email: typed } : {}) }),
          });
          if (res.status === 409) { setFreeGone(true); setFreeAsk(false); setAiLoading(null); setCheckingOut(false); track("reading_click", { locale, tier, method: "free_used" }); return; }
          if (res.status === 400) { const e = (await res.json().catch(() => ({}))) as { error?: string }; setEmailErr(e.error === "email_domain" ? "domain" : "bad"); setAiLoading(null); setCheckingOut(false); return; }
          if (!res.ok) throw new Error(String(res.status));
          const data = (await res.json()) as { url: string };
          track("reading_click", { locale, tier, method: "free_ok" });
          clearPending();
          { const sid = new URL(data.url, window.location.origin).searchParams.get("sid"); if (sid) attachSid(question, sid, tier); }
          window.location.href = data.url;
          return;
        } catch (err) {
          track("client_error", { locale, method: `cast:${String(err instanceof Error ? err.message : err).replace(/\s+/g, " ").slice(0, 18)}` });
          setAiError(true); setAiLoading(null); setCheckingOut(false); return;
        }
      }
      // 09-26 (D): a mainland clock — Stripe's page needs an international card and often won't even open. Say so
      // before sending them there (13 CNY checkouts, 1 paid); one tap past it for those who do hold such a card.
      if (mainland && !cnAckRef.current) { setCnAsk(tier); setAiLoading(null); track("reading_click_blocked", { locale, tier, method: "cn_pay" }); return; }
      // 10-22: the second-of-the-day offer counts the old monthly allowance (「每月 10 次深斷」) — not under the 通卡 model
      if (me?.paidToday && !me.tongka && !me.entitlement?.active && !secondAckRef.current && !upgrading && !pairActive && !giftCastToken && !rewardToken) {
        setSecondAsk(tier); setAiLoading(null); track("reading_click_blocked", { locale, tier, method: "second_today" }); return;
      }
      // 09-26: the share's free light reading asks for an address too
      const inviteMail = normalizeEmail(freeEmail);
      if (tier === INVITE_TIER && me?.inviteFree && !me.signedIn && !me.entitlement?.active) {
        if (!inviteMail || emailShapeBad(inviteMail)) { setEmailFor("invite"); setAiLoading(null); return; }
        if (emailNeedsAttention(inviteMail)) { setAiLoading(null); return; }
      }
      // 09-25: a first-price deep reading from a signed-out reader needs an address first
      const typedFirst = tier === INVITE_TIER && me?.inviteFree && !me?.signedIn ? inviteMail : normalizeEmail(firstEmail);
      if (tier === "deep" && !me?.signedIn && me?.firstDeep && !firstPriceGone && !me?.inviteFree && (!pass || pass === 1)) {
        if (!typedFirst) { setFirstAskEmail(true); setAiLoading(null); return; }
        if (emailShapeBad(typedFirst)) { setFirstEmailInvalid(true); setAiLoading(null); return; }
        if (emailNeedsAttention(typedFirst)) { setAiLoading(null); return; } // 09-26: the typo hint is showing
      }
      if (!pass && walletPk && plainPay && walletAvail !== false && !walletSkipRef.current && !upgrading && !payFailed && !pairActive && !(tier === INVITE_TIER && me?.inviteFree)) {
        setWalletTier(tier); setAiLoading(null); track("reading_click", { locale, tier, method: "wallet_open" }); return;
      }
      walletSkipRef.current = false;
      setCheckingOut(true);
      try {
        const res = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...basePayload(), ...attribution(), tier, locale, currency, curSrc: currencySource, via: viaTag(), ...(pass ? { pass } : {}), ...(pass && upgrading && fromSid ? { from: fromSid } : {}), ...(payFailed ? { noMp: true } : {}), ...(tier === INVITE_TIER && me?.inviteFree ? { inviteFree: true, r: refTag() } : {}), ...(giftNotify ? { notify: true } : {}), ...(payRemind ? { remind: true } : {}), ...(!me?.signedIn && typedFirst ? { email: typedFirst } : {}) }),
        });
        if (res.status === 400) { const e = (await res.json().catch(() => ({}))) as { error?: string }; if (e.error === "bad_email" || e.error === "email_domain") { setEmailErr(e.error === "bad_email" ? "bad" : "domain"); setAiLoading(null); setCheckingOut(false); return; } }
        // 10-23 进度表 101: a single reading is no longer sold — the pass panel is the way (a page from before, say)
        if (res.status === 410) {
          setMe((m) => (m ? { ...m, tongka: true } : m)); setAiLoading(null); setCheckingOut(false); setPassGoing(null);
          priceRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
          return;
        }
        // a pass holder or member at today's fair-use fuse: one line, never a price
        if (res.status === 429) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          if (j.error === "cap_day" || j.error === "cap_rate") { setCapMsg(tongkaT(locale).capHit); setAiLoading(null); setCheckingOut(false); setPassGoing(null); return; }
        }
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { url: string; firstDeep?: boolean; alipay?: boolean; pass?: number; firstPass?: boolean };
        // the address has bought a deep reading before: the button showed the first price, Stripe would show the full one — say so and let them decide
        // 10-22 通卡: the same for the first 1 日通卡 (the server judged by the address)
        if (pass === 1 && me?.firstTongka && data.firstPass === false) {
          setMe((m) => (m ? { ...m, firstTongka: false } : m)); setFirstAskEmail(false);
          setAiLoading(null); setCheckingOut(false); setPassGoing(null); return;
        }
        if (tier === "deep" && !pass && me?.firstDeep && data.firstDeep === false) {
          setFirstPriceGone(true); setFirstAskEmail(false); setMe((m) => (m ? { ...m, firstDeep: false } : m));
          setAiLoading(null); setCheckingOut(false); return;
        }
        track("checkout_start", { locale, tier, cur: currency, ...(pass ? { method: `tongka_${pass}` } : {}) });
        {
          const sid = new URL(data.url, window.location.origin).searchParams.get("sid");
          if (sid) attachSid(question, sid, tier);
          // 09-26 热区: 65 people came back from Stripe unpaid to an EMPTY cast page (and a note telling them to
          // cast again — which the repeat gate then refused). The figure now waits for them; the paid reading
          // page clears it (ThreadMark).
          savePending({ q: question, values, at: castAt, locale, ...(sid ? { sid } : {}), tier, ...(pass ? { pass } : {}), ...(data.alipay ? { alipay: true } : {}), ...(giftCastToken ? { gift: giftCastToken } : {}) });
        }
        window.location.href = data.url;
        return; // keep the redirect notice up until the page unloads
      } catch (err) {
        track("client_error", { locale, method: `cast:${String(err instanceof Error ? err.message : err).replace(/\s+/g, " ").slice(0, 18)}` });
        setAiError(true);
        setAiLoading(null);
        setCheckingOut(false);
        return;
      }
    }

    try {
      const res = await fetch("/api/reading", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...basePayload(), tier, locale, castId: freeCastId ?? undefined }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { tier: Tier; reading: Reading | DeepReading; castId?: number | null };
      if (typeof data.castId === "number") setFreeCastId(data.castId);
      clearPending();
      setReadings((r) => ({ ...r, [tier]: data.reading }));
      setActiveTier(tier);
      track("reading_done", { locale, tier });
    } catch (err) {
      track("client_error", { locale, method: `cast:${String(err instanceof Error ? err.message : err).replace(/\s+/g, " ").slice(0, 18)}` });
      setAiError(true);
    } finally {
      setAiLoading(null);
    }
  };

  /**
   * The painted door's second step: the same /api/checkout call as a real
   * purchase, which in gift mode mints a gf_ session instead of a Stripe one.
   * An address is optional — it is what lets the email, the timing reminder
   * and the archive work exactly as they would for a paying customer.
   */
  const claimGift = async (tier: Tier, email: string | null) => {
    if (checkingOut) return;
    const typed = email ? normalizeEmail(email) : "";
    // 09-15: the deep reading insists on an address (NEXT_PUBLIC_GIFT_EMAIL) — its timing revisit has to go somewhere
    if (!typed && !me?.signedIn && giftEmailRequired(tier)) { setGiftInvalid(true); return; }
    if (typed && emailShapeBad(typed)) { setGiftInvalid(true); return; }
    if (typed && emailNeedsAttention(typed)) return; // 09-26: the typo hint under the box is asking
    setGiftInvalid(false);
    setGiftLimited(false);
    setAiError(false);
    setAiLoading(tier);
    setCheckingOut(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...basePayload(), ...attribution(), tier, locale, currency, curSrc: currencySource, via: viaTag(), ...(typed ? { email: typed } : {}), ...(giftNotify && (typed || me?.signedIn) ? { notify: true } : {}) }),
      });
      if (res.status === 400) { const e = (await res.json().catch(() => ({}))) as { error?: string }; if (e.error === "bad_email" || e.error === "email_domain") { setEmailErr(e.error === "bad_email" ? "bad" : "domain"); setAiLoading(null); setCheckingOut(false); return; } }
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { url: string };
      track("gift_claim", { locale, tier, cur: currency, method: typed || me?.signedIn ? "email" : "skip" });
      clearPending();
      { const sid = new URL(data.url, window.location.origin).searchParams.get("sid"); if (sid) attachSid(question, sid, tier); }
      window.location.href = data.url;
    } catch (e) {
      // the per-address brake (five a day): say so, instead of the generic failure line
      if (e instanceof Error && e.message === "429") setGiftLimited(true);
      else setAiError(true);
      setAiLoading(null);
      setCheckingOut(false);
    }
  };

  const texts = useMemo(() => (chart ? textsFor(chart.cast.primary.number) : null), [chart]);
  // the classical text in the reader's own language (ja 書き下し, ko 한글 풀이, fr/de/es/pt translations),
  // loaded lazily per language so the bundle carries none of it
  const localAll = useLocalTexts(locale);
  const localTexts = chart ? localAll?.[String(chart.cast.primary.number)] : undefined;
  const nextPos = Math.min(values.length + 1, 6);

  const casting = !chart && !(repeat && !repeatWaived);

  // the 一事一占 panel's three doors (components/cast/RepeatGate) — they touch the cast's own state, so they live here
  const gatePrior = () => {
    if (!repeat) return;
    const past = repeat.past;
    const vals = past.v as LineValue[];
    setValues(vals);
    setCastAt(past.t!);
    setChart(fullChart({ values: vals, utcMs: past.t!, tzOffsetMinutes: -new Date().getTimezoneOffset() }));
    if (past.raw) setQuestion(past.raw);
    setQuestionLocked(true);
    rememberedRef.current = true; // it is the earlier cast — nothing new to record
    unblock();
    setTimeout(() => document.querySelector('[data-heat="price-deep"]')?.scrollIntoView({ behavior: "smooth", block: "center" }), 400);
  };
  const gateOther = () => {
    setTopicHint(null);
    setQuestion("");
    typedHere.current = true;
    setTimeout(() => { questionRef.current?.focus(); questionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }, 50);
  };
  const gateWaive = () => {
    if (!repeat) return;
    waivedPastRef.current = repeat.past;
    setRepeatWaived(true);
    unblock();
    if (heldTier) {
      const tier = heldTier;
      setHeldTier(null);
      void requestReading(tier, true);
    }
  };

  // 10-22 进度表 76 ⑤: the page frame (width, padding) is the product template's; this draws only the flow
  return (
    <div>
      <div className="w-full">
        {rewardToken && (
          <p className="t-small mt-[var(--s-4)] p-[var(--s-3)] border border-[var(--gold)] rounded-[2px] !text-[var(--ink)]">
            {t(locale, "rewardBanner")}
          </p>
        )}
        {giftRaw && giftDead && !rewardToken && (
          <p className="t-small mt-[var(--s-4)] p-[var(--s-3)] border border-[var(--ink-16)] rounded-[2px] !text-[var(--ink)]" data-heat="gift-dead">
            {GIFT_DEAD[locale === "zh" ? "zh" : locale === "zh-hant" ? "zh-hant" : locale === "ja" ? "ja" : "en"][giftDead.why]}
            {giftDead.sid && <> <a className="underline underline-offset-4" href={`/${locale}/reading?sid=${encodeURIComponent(giftDead.sid)}`}>{GIFT_DEAD[locale === "zh" ? "zh" : locale === "zh-hant" ? "zh-hant" : locale === "ja" ? "ja" : "en"].open} →</a></>}
          </p>
        )}
        {giftCastToken && !rewardToken && (
          <p className="t-small mt-[var(--s-4)] p-[var(--s-3)] border border-[var(--gold)] rounded-[2px] !text-[var(--ink)]">
            {giftSelf ? tt(locale, giftSelf === "returned" ? "giftReturned" : giftSelf === "device" ? "giftDevice" : "giftSelf") : giftReview ? REVIEW_BANNER[locale === "zh" ? "zh" : locale === "zh-hant" ? "zh-hant" : "en"] : t(locale, "giftCastBanner")}
            {!giftSelf && giftNote && (
              <span className="block mt-2 !text-[var(--ink-86)]">{mg(locale, "noteFrom")} <span>{["zh", "zh-hant", "ja"].includes(locale) ? `「${giftNote}」` : `“${giftNote}”`}</span></span>
            )}
          </p>
        )}
        {afterToken && after && (
          <p className={`t-small mt-[var(--s-4)] p-[var(--s-3)] border rounded-[2px] !text-[var(--ink)] ${after.state === "open" ? "border-[var(--gold)]" : "border-[var(--ink-16)]"}`}>
            {after.state === "open"
              ? after.kind === "ref" ? rfT(locale).banner : after.kind === "case" ? tt(locale, "caseLightBanner") : t(locale, "afterBanner", { q: after.question, call: after.call })
              : after.state === "used"
                ? <>{t(locale, "afterUsed")}{after.sid && <> <a className="underline underline-offset-4" href={`/${locale}/reading?sid=${after.sid}`}>{t(locale, "afterUsedLink")} →</a></>}</>
                : t(locale, "afterExpired")}
          </p>
        )}
        {!afterToken && (() => {
          // 10-14 进度表 47: just earned (this cast) or still held (api/me) — one quiet line with its own link
          const held = refGift ? null : me?.refLight?.[0] ?? null;
          if (!refGift && !held) return null;
          const until = new Date(refGift?.until ?? held!.until);
          const date = ["zh", "zh-hant", "ja"].includes(locale) ? `${until.getMonth() + 1}月${until.getDate()}日` : until.toLocaleDateString(locale, { month: "long", day: "numeric" });
          const line = refGift ? rfT(locale).got : (held!.side === "sharer" ? rfT(locale).heldSharer : rfT(locale).held).replace("{date}", date);
          const href = (() => { try { const u = new URL(refGift?.url ?? held!.url); return `${u.pathname}${u.search}`; } catch { return refGift?.url ?? held!.url; } })();
          return (
            <p className="t-small mt-[var(--s-4)] p-[var(--s-3)] border border-[var(--gold)] rounded-[2px] !text-[var(--ink)]" data-heat="ref-light-notice">
              {line} <a className="underline underline-offset-4" href={href}>{rfT(locale).use} →</a>
            </p>
          );
        })()}
        {restored && chart && !activeTier && !payBackTier && (
          <p className={`t-small mt-[var(--s-4)] p-[var(--s-3)] border rounded-[2px] !text-[var(--ink)] ${upgrading || savedBack === "ok" ? "border-[var(--gold)]" : "border-[var(--ink-16)]"}`}>
            {savedBack === "ok" ? (savedOrigin === "recover" ? rcT(locale, "rcBack") : cv(locale, "svBack")) : t(locale, upgrading ? "upgradeBanner" : "castRestored")}
          </p>
        )}
        {savedBack === "gone" && !chart && (
          <p className="t-small mt-[var(--s-4)] p-[var(--s-3)] border border-[var(--ink-16)] rounded-[2px] !text-[var(--ink)]">{cv(locale, "svGone")}</p>
        )}
        {pairToken && pair && (
          <p className={`t-small mt-[var(--s-4)] p-[var(--s-3)] border rounded-[2px] !text-[var(--ink)] ${pair.status === "open" ? "border-[var(--gold)]" : "border-[var(--ink-16)]"}`}>
            {pairSelf ? t(locale, "pairSelf") : pair.status === "open" ? t(locale, "pairCastBanner", { framing: pair.framing }) : t(locale, "pairInvalid")}
          </p>
        )}
        {PAYWALL && me?.inviteFree && !giftCastToken && !rewardToken && !pairActive && (
          <p className="t-small mt-[var(--s-4)] p-[var(--s-3)] border border-[var(--gold)] rounded-[2px] !text-[var(--ink)]">
            {t(locale, "inviteBanner")}
          </p>
        )}
        {payFailed && PAYWALL && payBackTier && chart ? (
          /* 09-26 挽回: the figure is back; say what usually stops people on Stripe's page, and one tap returns there */
          <PayBackPanel locale={locale} tier={payBackTier} firstPrice={tongkaOn ? null : me?.firstDeep ? price.one : null}
            firstNote={tongkaOn && me?.firstTongka ? fill(tongkaT(locale).upgradeFirst, { p: tongkaFirstPrice, full: formatMoney(currency, tongkaMinor(currency, 1, false), locale) }) : null}
            alipay={payBackAli} mainland={mainland} plainPay={plainPay} busy={checkingOut}
            onRetry={() => { track("checkout_retry", { locale, tier: payBackTier }); void requestReading(payBackTier); }} />
        ) : payFailed && PAYWALL ? (
          <p className="t-small mt-[var(--s-4)] p-[var(--s-3)] border border-[var(--cinnabar)] rounded-[2px] !text-[var(--ink)]">
            {t(locale, "payRetryNotice")}
          </p>
        ) : null}
        {/* ---- question ----
             Editable until a reading exists: the cast may run on an empty
             question, so the figure page must still be able to collect it. */}
        <div className="pt-2">
          {/* 10-12 承接 ⑨: the lot this cast follows, one line at the top — the same matter, one more layer */}
          {qianToken && qianNum && (
            <p className="t-small mb-[var(--s-3)] !text-[var(--gold-text)]" data-heat="cast-qian-line">
              你抽到的是{qianSetLabel}第 {qianNum} 籤{qianTitle ? `〈${qianTitle}〉` : ""}——籤給方向，這一卦看日子。
            </p>
          )}
          {/* 10-17 承接: the 擲筊 / tarot spread this cast follows, one line at the top */}
          {jbSign && (
            <p className="t-small mb-[var(--s-3)] !text-[var(--gold-text)]" data-heat="cast-jb-line">
              {cv(locale, ({ s3: "jbLineS3", s: "jbLineS", y: "jbLineY", x: "jbLineX" } as const)[jbSign as "s3" | "s" | "y" | "x"])}
            </p>
          )}
          {tarotToken && tarotCards && (
            <p className="t-small mb-[var(--s-3)] !text-[var(--gold-text)]" data-heat="cast-tarot-line">
              {cv(locale, "tarotLine").replace("{cards}", tarotCards)}
            </p>
          )}
          {xwToken && (
            <p className="t-small mb-[var(--s-3)] !text-[var(--gold-text)]" data-heat="cast-xw-line">{cv(locale, "xwLine")}</p>
          )}
          {/* 10-29 进度表 127 (Neil: 产品线之间的相互关联): after the cast, a lost thing — the dice card adds where to look and what to report */}
          {!xwToken && xwEntry && chart && isLostThing(question) && (
            <p className="t-small mb-[var(--s-3)] !text-[var(--ink-66)]">
              <a href={`/${locale}/xunwu?c=cast`} data-heat="cast-to-xunwu" onClick={() => track("xunwu", { locale, method: "from_cast" })}
                className="underline underline-offset-4 hover:text-[var(--ink)]">{cv(locale, "xwEntry")}</a>
            </p>
          )}
          {/* 10-12 承接 ⑨ 卦→籤: the question speaks of a temple lot — offer to read it alongside */}
          {!qianToken && locale === "zh-hant" && /籤|求籤|抽到|廟|签|求签|庙/.test(question) && (
            <p className="t-small mb-[var(--s-3)] !text-[var(--ink-66)]">
              <a href="/zh-hant/jieqian" data-heat="cast-to-jieqian" className="underline underline-offset-4 hover:text-[var(--ink)]">已經在廟裡求過籤？輸入籤號，一起看 →</a>
            </p>
          )}
          <p className={`t-label mb-[var(--s-2)] ${needQuestion || qIssue ? "!text-[var(--cinnabar)]" : ""}`}>
            {t(locale, "yourQuestion")}
          </p>
          {(chart && (questionLocked || activeTier) && !needQuestion) || (pairActive && chart) ? (
            <p className="t-d3">{question || "—"}</p>
          ) : chart ? (
            <>
              <input
                ref={questionRef}
                value={question}
                onChange={(e) => {
                  typedHere.current = true;
                  setQuestion(e.target.value);
                  if (e.target.value.trim().length >= 2) setNeedQuestion(false);
                }}
                placeholder={t(locale, "questionPlaceholder")}
                className={`t-body w-full bg-transparent border-b pb-2 outline-none transition-colors
                            placeholder:opacity-35 ${
                              needQuestion || qIssue
                                ? "border-[var(--cinnabar)]"
                                : "border-current/25 focus:border-current/60"
                            }`}
              />
              {qIssue ? (
                <QuestionIssueNote locale={locale} kind={qIssue.kind} issue={qIssue.issue} onKeep={keepQuestion} />
              ) : needQuestion ? (
                <p className="t-small mt-[var(--s-2)] !text-[var(--cinnabar)]">
                  {t(locale, "questionNeeded")}
                </p>
              ) : null}
              {/* 11-05 进度表 140: a public event — already decided, or the day it is settled */}
              {!qIssue && !pairActive && <PublicEventNote question={question} locale={locale} />}
            </>
          ) : (
            <>
              <input
                ref={questionRef}
                value={question}
                readOnly={pairActive}
                onChange={(e) => { if (pairActive) return; typedHere.current = true; setQuestion(e.target.value); }}
                onBlur={cleanseForShake}
                placeholder={t(locale, "questionPlaceholder")}
                className={`t-body w-full bg-transparent border-b pb-2 outline-none transition-colors
                            placeholder:opacity-35 ${
                              qIssue ? "border-[var(--cinnabar)]" : "border-current/25 focus:border-current/60"
                            }`}
              />
              {qIssue && <QuestionIssueNote locale={locale} kind={qIssue.kind} issue={qIssue.issue} onKeep={keepQuestion} />}
              {!qIssue && !pairActive && <PublicEventNote question={question} locale={locale} />}
              {/* 10-17 承接: not sure yet? ask with moon blocks first (the question rides along) */}
              {jbEntry && !pairActive && !upgrading && (
                <p className="t-small mt-[var(--s-2)] !text-[var(--ink-45)]">
                  <a href={`/${locale}/jiaobei${question.trim() ? `?q=${encodeURIComponent(question.trim().slice(0, 80))}` : ""}`} data-heat="cast-to-jiaobei"
                    onClick={() => track("jiaobei", { locale, method: "from_cast" })} className="underline underline-offset-4 hover:text-[var(--ink)]">{cv(locale, "jbEntry")}</a>
                </p>
              )}
              {!pairActive && exHex && guaEx.length > 0 && question.trim().length < 2 && (
                <ul className="mt-[var(--s-2)] flex flex-wrap gap-2" data-heat="gua-ex">
                  {guaEx.map((q, k) => (
                    <li key={k}>
                      <button type="button" onClick={() => { typedHere.current = true; setQuestion(q); track("gua_cta", { locale, method: "example", hex: exHex }); }}
                        className="t-small px-3 py-1.5 border border-[var(--ink-16)] rounded-[2px] hover:border-[var(--ink)] transition-colors text-left">{q}</button>
                    </li>
                  ))}
                </ul>
              )}
              {/* 09-30 (进度表 23): before the coins are in hand, one line to the page on how to phrase a question */}
              {!pairActive && question.trim().length < 2 && (
                <p className="t-small mt-[var(--s-2)]"><Link href={`/${locale}/how-to-ask`} data-heat="hta-cast" className="underline underline-offset-4 !text-[var(--ink-45)] hover:!text-[var(--ink)]">{howToAskFor(locale).entry.cast} →</Link></p>
              )}
            </>
          )}

          {/* 10-14 进度表 46: what would count as an answer, in the reader's own words — optional; the check-in asks with it */}
          {question.trim().length >= 2 && !activeTier && !pairActive && (
            <div className="mt-[var(--s-3)] fade-in" data-heat="outcome-hint">
              <label className="t-label block mb-1" htmlFor="yf-outcome-hint">{ohT(locale).label}</label>
              <input
                id="yf-outcome-hint"
                value={outcomeHint}
                maxLength={60}
                onChange={(e) => setOutcomeHint(e.target.value)}
                placeholder={ohT(locale)[topicShown === "relationship" ? "exLove" : topicShown === "career" ? "exWork" : "exOther"]}
                className="t-small w-full bg-transparent border-b border-current/20 pb-1.5 outline-none focus:border-current/50 placeholder:opacity-40"
              />
              <p className="t-small mt-1 !text-[var(--ink-45)]">{ohT(locale).note}</p>
            </div>
          )}

          {/* ---- optional hints: time frame + topic ----
               One typeset line under the question, like a marginal note on a
               printed form: "时间范围 让卦来定 ▾ · 问的是 事业 ▾". Tapping a value
               unfolds a single row of plain-text options; nothing is boxed,
               nothing is required — the default is the cast's own call. */}
          {question.trim().length >= 2 && !activeTier && (
            <HintsRow locale={locale} scaleHint={scaleHint} setScaleHint={setScaleHint} askWin={detectedScale?.window} autoScaleKey={autoScaleKey}
              hintOpen={hintOpen} setHintOpen={setHintOpen} topicShown={topicShown} setTopicHint={setTopicHint} situation={situation} setSituation={setSituation} />
          )}
        </div>

        {/* 09-26 (Neil: 「她把算卦当成了 AI」): a question that answers the last reading goes back under it, not into a new figure */}
        {(() => {
          if (replyAck || activeTier || pairActive || giftCastToken || rewardToken || upgrading || !looksLikeReply(question)) return null;
          const local = pastCasts().filter((c) => c.sid && Date.now() - c.at < REPLY_WINDOW_MS).sort((a, b) => b.at - a.at)[0];
          const server = me?.recent && Date.now() - me.recent.at < REPLY_WINDOW_MS ? me.recent : null;
          const target = server && (!local || server.at >= local.at) ? { sid: server.sid, q: server.q } : local ? { sid: local.sid!, q: local.raw ?? local.q } : null;
          if (!target) return null;
          return (
            <div className="mt-8 border border-[var(--gold)] bg-[var(--gold)]/[0.06] rounded-[2px] p-5 fade-in" data-heat="reply-like">
              <p className="t-body !text-[16px]">{tt(locale, "replyTitle")}</p>
              <p className="t-small mt-1 !text-[var(--ink-66)]">{tt(locale, "replyBody")}</p>
              <p className="t-small mt-2 !text-[var(--ink-45)] truncate">{tt(locale, "replyPrev", { q: target.q.slice(0, 40) })}</p>
              <div className="mt-[var(--s-3)] flex flex-wrap items-center gap-x-5 gap-y-2">
                <a href={`/${locale}/reading?sid=${encodeURIComponent(target.sid)}&ask=${encodeURIComponent(question.trim().slice(0, 300))}#followup`} data-heat="reply-go"
                  onClick={() => track("repeat_blocked", { locale, method: "reply_go" })}
                  className="inline-block min-h-[var(--s-6)] px-5 py-2.5 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.12em]">
                  {tt(locale, "replyGo")}
                </a>
                <button type="button" data-heat="reply-new" onClick={() => { setReplyAck(true); track("repeat_blocked", { locale, method: "reply_new" }); }}
                  className="t-small underline underline-offset-4 !text-[var(--ink-66)]">{tt(locale, "replyNew")}</button>
              </div>
            </div>
          );
        })()}

        {/* ---- 一事一占 guard ----
             Before the rite, or — for a question written after the cast — when
             the reading is asked for. "same" may be waived; "cap" (the topic's
             casts for the day are spent) may not. */}
        {repeat && !repeatWaived && (
          <RepeatGate locale={locale} repeat={repeat} topicShown={topicShown} hasChart={!!chart} panelRef={panelRef}
            onPrior={gatePrior} onOther={gateOther} onWaive={gateWaive} />
        )}

        {/* ---- casting stage: the rite, on ink ---- */}
        {casting && (
          <Rite locale={locale} zh={zh} values={values} nextPos={nextPos} phase={phase} sweep={sweep} formed={formed} revealed={revealed} coins={coins}
            charge={charge} shakeIntensity={shakeIntensity} spinning={spinning} tooSoon={tooSoon} holdBeat={holdBeat} canShake={canShake}
            castMode={castMode} setCastMode={setCastMode} skipReveal={skipReveal} askMotion={askMotion} holdStart={holdStart} holdEnd={holdEnd} />
        )}

        {/* ---------- result: the dossier ---------- */}
        {chart && texts && (
          <div className="mt-[var(--s-5)] fade-in">
            {/* 11-05 (Neil: 读者先看到一句和价格，不是一整屏卦辞): the line, the block before the price and the reading sit right
                under the figure; the judgment, the line texts and the chart fold away below them (components/cast/Dossier.tsx) */}
            <Dossier locale={locale} zh={zh} readingLocale={readingLocale} chart={chart} texts={texts} values={values} localTexts={localTexts}>

            {/* ---------- AI readings ---------- */}
            <section className="mt-[var(--s-6)]">
              {/* The question was written in another language than the page.
                  Say so plainly and let them put it back in one tap — this is a
                  line of type, not a dialog: the default already does the right
                  thing for almost everyone. */}
              {detectedLang && (
                <p className="t-small mb-[var(--s-3)] !text-[var(--ink-66)]">
                  {readingLocale === detectedLang
                    ? t(locale, "langFollowNote", { lang: LOCALE_META[readingLocale].native })
                    : t(locale, "langSwitchedNote", { lang: LOCALE_META[readingLocale].native })}{" "}
                  <button
                    type="button"
                    onClick={() => setLangPick(readingLocale === locale ? detectedLang : locale)}
                    className="underline underline-offset-2 hover:text-[var(--ink)] transition-colors"
                  >
                    {t(locale, "langUseInstead", { lang: LOCALE_META[readingLocale === locale ? detectedLang : locale].native })}
                  </button>
                </p>
              )}
              {/* 10-02 一事一占 (Neil: 「直接做 1 吧」): past the day's casts on this — the cast stands, the free line does not */}
              {PAYWALL && !pairActive && !upgrading && capped && (
                <div className="mb-[var(--s-4)] border-l-2 border-[var(--gold)] pl-[var(--s-3)] fade-in" data-heat="cap-note">
                  {/* 10-03 起卦记录: which cast of the matter this is, and the figures before it */}
                  {threadChain()}
                  {rpLock ? (
                    <>
                      <p className="t-label mb-1 !text-[var(--gold-text)]" data-heat="repeat-lock">{rpT(locale).lockTitle.replace("{n}", String(rpLock.inWindow))}</p>
                      <p className="t-small !text-[var(--ink-66)]">{rpT(locale).lockBody}</p>
                      <p className="t-small mt-1 !text-[var(--ink)]" data-heat="repeat-rest">{restLine(locale, rpLock.until)}</p>
                    </>
                  ) : (
                    <>
                      <p className="t-label mb-1 !text-[var(--gold-text)]">{t(locale, "repeatQuote")}</p>
                      <p className="t-small !text-[var(--ink-66)]">
                        {entryT(locale)[capped.by === "circling" ? "capNoteCircling" : "capNoteTopic"].replace("{n}", String(capped.count)).replace("{hex}", capped.past.hex)}
                      </p>
                      {/* 10-14 (Neil: a reader hit this 136 times and kept casting): say plainly to put it down until tomorrow */}
                      <p className="t-small mt-1 !text-[var(--ink)]" data-heat="cap-rest">{rpT(locale).restCap}</p>
                    </>
                  )}
                  {/* 10-22 分開: the cap counted this cast against a matter it is not about */}
                  {!thread && sepChip()}
                  {/* 10-03 付费话术学习: no free line here — the block before the price still comes */}
                  {nudgeBlock()}
                </div>
              )}
              {/* 10-13 同一件事反复问 ②: the 6th cast of a matter in 3 days — no new line, the casts read together instead */}
              {PAYWALL && !pairActive && !upgrading && !capped && rpLock && !teaser && (
                <div className="mb-[var(--s-4)] border-l-2 border-[var(--gold)] pl-[var(--s-3)] fade-in" data-heat="repeat-lock">
                  {threadChain()}
                  <p className="t-label mb-1 !text-[var(--gold-text)]">{rpT(locale).lockTitle.replace("{n}", String(rpLock.inWindow))}</p>
                  <p className="t-small !text-[var(--ink-66)]">{rpT(locale).lockBody}</p>
                      <p className="t-small mt-1 !text-[var(--ink)]" data-heat="repeat-rest">{restLine(locale, rpLock.until)}</p>
                  {nudgeBlock()}
                </div>
              )}
              {/* 10-13 同一件事反复问 ③: from the 3rd cast of a matter, the line waits for an address */}
              {PAYWALL && !pairActive && !upgrading && !capped && rpGate && !teaser && !teaserLoading && (
                <form className="mb-[var(--s-4)] border-l-2 border-[var(--cinnabar)] pl-[var(--s-3)] fade-in" data-heat="repeat-email"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const v = rpEmail.trim();
                    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { setRpBad(true); return; }
                    rpEmailRef.current = v; setRpBad(false); teaserKeyRef.current = ""; setRpTry((x) => x + 1);
                  }}>
                  <p className="t-label mb-1">{rpT(locale).gateTitle}</p>
                  <p className="t-small !text-[var(--ink-66)]">{rpT(locale).gateBody.replace("{n}", String(thread?.n ?? 3))}</p>
                  {sepChip()}
                  <div className="mt-[var(--s-3)] flex flex-wrap gap-2">
                    <EmailField locale={locale} variant="field" hint={false} value={rpEmail} onChange={(v) => { setRpEmail(v); setRpBad(false); }} />
                    <button type="submit" className="min-h-[var(--s-6)] px-5 py-2 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.1em]">{rpT(locale).gateBtn}</button>
                  </div>
                  {rpBad && <p className="t-small mt-2 !text-[var(--cinnabar)]">{rpT(locale).gateBad}</p>}
                </form>
              )}
              {/* 10-31 进度表 131: no free line — the figure, the casts before it on this matter, and the block before the price */}
              {PAYWALL && !pairActive && !upgrading && !capped && noLine && !teaser && !rpLock && !teaserLoading && nudgeOn && (
                <div className="mb-[var(--s-4)] border-l-2 border-[var(--cinnabar)] pl-[var(--s-3)] fade-in" data-heat="no-line">
                  {threadChain()}
                  {nudgeBlock()}
                </div>
              )}
              {/* 09-19: one free line of the call, the rest behind the price */}
              {PAYWALL && !pairActive && !upgrading && !capped && (teaser || teaserLoading) && (
                <div className="mb-[var(--s-4)] border-l-2 border-[var(--cinnabar)] pl-[var(--s-3)] fade-in">
                  {/* 10-03 起卦记录: the 2nd+ cast of one matter — the figures before it, and the line now reads them together */}
                  {teaser && threadChain()}
                  {teaser && <p className="t-label mb-1">{thread && thread.n >= 2 ? ctt(locale, "thLabel") : t(locale, "teaserLabel")}</p>}
                  {teaser ? (
                    <>
                      {/* 09-26 对照测试 (o1): the lean, free — the why, the when and the how stay in the reading */}
                      {teaserOdds && (
                        <p className="t-label mb-1" data-heat="teaser-odds">
                          {tt(readingLocale, "oddsLead")} · <span className={teaserOdds === "strong" || teaserOdds === "good" ? "!text-[var(--gold-text)]" : teaserOdds === "even" ? "" : "!text-[var(--cinnabar)]"}>{tt(readingLocale, `odds_${teaserOdds}` as "odds_good")}</span>
                        </p>
                      )}
                      <p className="t-body">{teaser}{teaserMore ? <span data-heat="teaser-more"> {teaserMore}</span> : null}</p>
                      {previewOn ? (
                        /* 10-02 对照测试 x1 (Neil: 「做 3 和 4 吧」): not a blurred paragraph but what the full reading of THIS figure
                           holds — its nearest timing window (month shown, day hidden), the step, what to avoid, the follow-ups —
                           and a button straight to it. 76% of those who saw the free line tapped no price. */
                        <div className="mt-[var(--s-3)] pt-[var(--s-3)] border-t border-[var(--ink-16)]" data-ab-preview="1" data-card="v43">
                          {/* 10-14 进度表 43 付费卡重写: the reader's own question as the title, the three things it holds, and what it is not */}
                          <p className="t-small mb-1 !text-[var(--ink-66)]">{cv(readingLocale, "cdLead")}</p>
                          <p className="t-body !text-[15px] mb-2 !text-[var(--ink)]">{cv(readingLocale, "cdTitle")}</p>
                          <ul className="space-y-1.5">
                            <li className="t-small !text-[var(--ink)]" data-heat="preview-timing">
                              {cv(readingLocale, "cdWin")}
                              {tHint ? <span className="block !text-[var(--gold-text)]">{previewWhen(tHint.first, tHint.kind, readingLocale)}{tHint.n > 1 ? cv(readingLocale, "pvCount", { n: tHint.n }) : ""}</span> : null}
                              {tHint?.inAsk && <span className="block !text-[var(--ink-66)]">{tt(readingLocale, "teaserTimingIn")}</span>}
                            </li>
                            <li className="t-small !text-[var(--ink)]">{cv(readingLocale, "cdBasis")}</li>
                            <li className="t-small !text-[var(--ink)]">{cv(readingLocale, "cdRevisit")}</li>
                          </ul>
                          {/* 10-03: on a 2nd+ cast of one matter the block below carries the button (one button, not two) */}
                          {!nudgeOn && (
                          <button
                            type="button"
                            data-heat="preview-deep"
                            disabled={aiLoading !== null || qChecking}
                            onClick={() => {
                              // 10-22 通卡: the card's button buys the 1 日通卡 (the panel below has the longer ones)
                              if (tongkaPanelOn) { setPassGoing(1); void requestReading("deep", false, 1); }
                              else void requestReading("deep");
                              // the address box (first price) or Apple Pay opens under the price buttons — bring them into view
                              setTimeout(() => priceRowRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
                            }}
                            className="mt-[var(--s-3)] min-h-[var(--s-6)] px-5 py-2.5 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] text-[13px] tracking-[0.1em] disabled:opacity-50"
                          >
                            {aiLoading === "deep"
                              ? t(locale, "aiLoading")
                              : tongkaPanelOn
                                ? (me?.firstTongka ? cv(readingLocale, "pvCtaFirst", { price: tongkaFirstPrice }) : cv(readingLocale, "pvCta", { price: tongkaFirstPrice }))
                              : me?.firstDeep && !firstPriceGone
                                ? cv(readingLocale, "pvCtaFirst", { price: price.one })
                                : cv(readingLocale, "pvCta", { price: price.deep })}
                          </button>
                          )}
                          <p className="t-small mt-[var(--s-3)] !text-[var(--ink-66)]" data-heat="card-trust">{cv(readingLocale, "cdTrust")}</p>
                          <p className="t-label mt-1 !normal-case !tracking-[0.04em]">{cv(readingLocale, "cdNot")}</p>
                        </div>
                      ) : (<>
                      {/* 09-26 热区: 121 people tapped the blurred lines and nothing happened — now it takes them to the full reading's button */}
                      {!nudgeOn && <p
                        data-heat="teaser-blur"
                        role="button"
                        tabIndex={-1}
                        onClick={() => {
                          const b = document.querySelector<HTMLElement>('[data-heat="price-deep"]');
                          if (!b) return;
                          b.scrollIntoView({ behavior: "smooth", block: "center" });
                          b.classList.add("ring-2", "ring-[var(--gold)]", "ring-offset-2");
                          setTimeout(() => b.classList.remove("ring-2", "ring-[var(--gold)]", "ring-offset-2"), 1800);
                        }}
                        className="t-body select-none blur-[5px] opacity-40 mt-1 cursor-pointer"
                        aria-hidden
                      >{t(readingLocale, "teaserBlur")}</p>}
                      {tHint ? (
                        <p className="t-small mt-2 !text-[var(--ink)]" data-heat="timing-hint">
                          {tt(readingLocale, "teaserTiming", { n: tHint.n, when: fuzzyWhen(tHint.first, readingLocale) })}
                          {tHint.inAsk ? ` ${tt(readingLocale, "teaserTimingIn")}` : ""}
                        </p>
                      ) : !nudgeOn ? (
                        <p className="t-small mt-2 !text-[var(--ink-66)]">{t(locale, "teaserMore")}</p>
                      ) : null}
                      </>)}
                      {/* 10-03 付费话术学习 (lib/nudge.ts): the 2nd+ cast of one matter — the learner's words and one button */}
                      {nudgeBlock()}
                    </>
                  ) : (
                    <p className="t-small !text-[var(--ink-45)]">{t(locale, "teaserLoading")}</p>
                  )}
                </div>
              )}
              {/*
                09-22 (Neil: 「这个客户明明是香港的，为什么收人民币呢」). We guess the
                buyer's currency from their device clock, then their IP. A Hong Kong
                cardholder whose laptop clock says Asia/Shanghai was charged CNY, and
                nothing on the page told him which currency he was about to pay in —
                the switcher sat below the buttons, next to a membership line, where
                nobody reads it. No signal we can see before payment names his country,
                so instead of guessing harder we say the guess out loud, above the
                price, and make changing it one tap.
              */}
              {PAYWALL && !me?.entitlement?.active && !pairActive && (
                <div className="mb-[var(--s-3)] flex items-baseline justify-between gap-3">
                  <p className="t-small !text-[var(--ink-45)]">{t(locale, "payCurrencyNote", { cur: currencyName(currency, locale) })}</p>
                  <span data-heat="currency"><CurrencyMenu locale={locale} value={currency} onChange={chooseCurrency} /></span>
                </div>
              )}
              {/* 09-28 对照测试 (p1): a first-timer sees one price — the first-time deep reading; the light reading (same price)
                  becomes a line of type under it. 65 light checkouts, 16 paid; 30% of light buyers bought the deep one within the hour. */}
              {capMsg && <p className="mb-[var(--s-3)] t-body !text-[var(--cinnabar)]" data-heat="cap-hit">{capMsg}</p>}
              {/* 10-23 进度表 101: until the page knows the reader, the pass panel's frame (no prices) — a slow connection
                  never flashes the old two prices first */}
              {PAYWALL && !me && !meFailed ? (
                <div ref={priceRowRef} data-ab-price="loading"><TongkaSkeleton locale={locale} /></div>
              ) : (<>
                {(!tongkaOn || freeTiers) && (() => { const onePrice = !tongkaOn && PAYWALL && !!arms?.onePrice && !!me?.ab?.onePrice && !!me?.firstDeep && !me?.signedIn && !me?.entitlement?.active
                  && !pairActive && !afterActive && !upgrading && !giftCastToken && !rewardToken && !freeEligible && !me?.inviteFree && !firstPriceGone;
                  return (
                    <PriceRow locale={locale} me={me} price={price} rowRef={priceRowRef} onePrice={onePrice}
                      tiers={tongkaOn && freeTiers ? freeTiers : pairActive ? [pair!.tier] : afterActive ? (["one"] as const) : upgrading || onePrice ? (["deep"] as const) : (["one", "deep"] as const)}
                      activeTier={activeTier} aiLoading={aiLoading} qChecking={qChecking} x1Copy={x1Copy} pairActive={pairActive} afterActive={afterActive}
                      reward={!!rewardToken} gift={!!giftCastToken} freeEligible={freeEligible} onPick={(tier) => void requestReading(tier, false, null)} />
                  ); })()}
                {tongkaPanelOn && (
                  <div ref={freeTiers ? undefined : priceRowRef} data-ab-price="tongka" className={freeTiers ? "mt-[var(--s-4)]" : ""}>
                    <TongkaPanel locale={locale} currency={currency} first={!!me?.firstTongka} busy={passGoing}
                      onPick={(d) => { setPassGoing(d); void requestReading("deep", false, d); }} />
                  </div>
                )}
              </>)}

              {/* 09-29 会员裂变 ②: the allowance ran out — the cheapest way to more is a friend, said before the price */}
              {PAYWALL && me?.entitlement?.active && !me.entitlement.comp && me.entitlement.deepLeft === 0 && !pairActive && !afterActive && !giftCastToken && !rewardToken && !checkingOut && (
                <MemberOutGift locale={locale} entitlement={me.entitlement} />
              )}

              {/* 09-28: the second cast of the visit — a word instead of a third throw */}
              {secondCast && PAYWALL && !me?.entitlement?.active && !checkingOut && !aiLoading && !nudgeOn && !tongkaOn && (
                <SecondCastNote locale={locale} price={me?.firstDeep ? price.one : price.deep} />
              )}

              {/* 09-25: the first-price deep reading asks for an address before Stripe — the price is checked against it */}
              {firstAskEmail && !me?.signedIn && !checkingOut && !firstPriceGone && (
                <EmailAsk locale={locale} why={t(locale, "firstEmailWhy")} value={firstEmail} invalid={firstEmailInvalid}
                  onChange={(v) => { setFirstEmail(v); setFirstEmailInvalid(false); setEmailErr(null); }} go={() => void requestReading("deep")} goLabel={t(locale, "firstEmailGo")}
                  error={firstEmailInvalid ? t(locale, "giftEmailNeeded") : emailErr ? t(locale, emailErr === "domain" ? "emailNoDomain" : "emailBad") : null} />
              )}
              {/* 09-26 对照测试 (f1): the address the free light reading is sent to */}
              {emailFor && (emailFor !== "free" || freeEligible) && !me?.signedIn && !checkingOut && (
                <EmailAsk locale={locale} heat={`${emailFor}-ask`} goHeat={`${emailFor}-go`} why={tt(locale, emailFor === "pair" ? "pairWhy" : emailFor === "invite" ? "inviteWhy" : "freeWhy")}
                  value={freeEmail} onChange={(v) => { setFreeEmail(v); setEmailErr(null); }} go={() => void requestReading(claimPanelTier(emailFor, pair?.tier))}
                  goLabel={tt(locale, emailFor === "free" ? "freeGo" : "claimGo")} error={emailErr ? t(locale, emailErr === "domain" ? "emailNoDomain" : "emailBad") : null} />
              )}
              {freeGone && !checkingOut && <p className="t-small mt-[var(--s-3)] !text-[var(--gold-text)] fade-in">{tt(locale, "freeUsed")}</p>}
              {/* 10-12 B② (10-12 复查: 92 heavy askers who never paid, 18.5% had left an address): on the 3rd and 4th cast of
                  one matter, a signed-out reader we have no address for may keep the matter — one letter now, one when the
                  first time the chart names is near (lib/saved-cast.ts matterReminder) */}
              {PAYWALL && !!me && !me.signedIn && !me.entitlement?.active && !!chart && castAt > 0 && !!thread && (thread.n === 3 || thread.n === 4)
                && !normalizeEmail(firstEmail) && (matterState === "done" || !matterKeptBefore(thread.first)) && question.trim().length >= 2 && !qIssue && !isCrisis(question.trim())
                && !pairActive && !afterActive && !upgrading && !giftCastToken && !rewardToken && !savedToken && !teaserLoading && !checkingOut
                && !activeTier && !aiLoading && !firstAskEmail && !emailFor && !walletTier && saveState !== "done" && (
                <div className="mt-[var(--s-4)] p-[var(--s-4)] border border-[var(--ink-16)] rounded-[2px] fade-in" data-heat="matter-save">
                  {matterState === "done" ? (
                    <p className="t-small !text-[var(--gold-text)]">{msT(locale, "done", { email: normalizeEmail(matterEmail) ?? "" })}</p>
                  ) : (
                    <SaveBox locale={locale} title={msT(locale, "title", { n: thread.n })}
                      body={tHint?.first ? msT(locale, "body", { when: fuzzyWhen(tHint.first, locale) }) : msT(locale, "bodyNoWhen")}
                      value={matterEmail} onChange={(v) => { setMatterEmail(v); setMatterState(null); }} state={matterState}
                      go={() => void saveMatter()} goLabel={msT(locale, "go")} goHeat="matter-save-go" note={msT(locale, "note")} tracking="0.12em" />
                  )}
                </div>
              )}
              {/* 10-02 对照测试 y1 (Neil: 「做 3 和 4 吧」): not ready — the reader may email themselves this cast; one reminder
                  follows the next day. The only unpaid, signed-out cast the server keeps, because they asked (privacy policy). */}
              {PAYWALL && ((!!arms?.save && !!me?.ab?.save) || saveFromWallet) && !!me && !me.signedIn && !me.entitlement?.active && !!chart && castAt > 0
                && question.trim().length >= 2 && !qIssue && !isCrisis(question.trim()) && !pairActive && !afterActive && !upgrading && !giftCastToken && !rewardToken
                && !savedToken && !capped && !teaserLoading && !checkingOut && !activeTier && !aiLoading && !firstAskEmail && !emailFor && !walletTier && (
                <div className="mt-[var(--s-4)] fade-in">
                  {saveState === "done" ? (
                    <p className="t-small !text-[var(--gold-text)]">{cv(locale, "svDone", { email: savedTo })}</p>
                  ) : !saveOpen ? (
                    <button type="button" data-heat="save-cast-open" onClick={() => setSaveOpen(true)}
                      className="text-left t-small !text-[var(--ink-66)] underline underline-offset-4 decoration-[var(--ink-16)] hover:decoration-current">
                      {cv(locale, "svOpen")}
                    </button>
                  ) : (
                    <div className="p-[var(--s-4)] border border-[var(--ink-16)] rounded-[2px]">
                      <SaveBox locale={locale} body={cv(locale, "svBody")} value={saveEmail} onChange={(v) => { setSaveEmail(v); setSaveState(null); }}
                        state={saveState} go={() => void saveCast()} goLabel={cv(locale, "svGo")} goHeat="save-cast-go" required />
                    </div>
                  )}
                </div>
              )}
              {/* 10-22 进度表 90 免費讀者也給回訪 (设计稿 R7「付不付費都給回訪」): under the free reading, the reader's own day */}
              {PAYWALL && (locale === "zh" || locale === "zh-hant") && !!chart && castAt > 0 && !!teaser && question.trim().length >= 2 && !qIssue && !isCrisis(question.trim())
                && !pairActive && !afterActive && !upgrading && !giftCastToken && !rewardToken && !checkingOut && !activeTier && !aiLoading && !walletTier && (
                <FreeRevisit key={`free-rv-${castAt}`} locale={locale} question={question.trim()} values={values} signedIn={!!me?.signedIn}
                  prefillEmail={normalizeEmail(firstEmail) ?? (saveState === "done" ? savedTo : null)} />
              )}
              {walletPk && plainPay && walletAvail === null && chart && !activeTier && (
                <WalletPay probe locale={locale} pk={walletPk} amountMinor={priceMinor(currency, "one")} currency={currency.toLowerCase()} priceLabel=""
                  createIntent={async () => null} onFallback={() => undefined} onPaid={() => undefined}
                  onAvailable={(ok) => setWalletAvail(ok)} />
              )}
              {walletTier && walletPk && (() => {
                const tier = walletTier;
                const amountSeen = tier === "deep" && !(me?.firstDeep && !firstPriceGone) ? priceMinor(currency, "deep") : priceMinor(currency, "one");
                const fallback = (why: string) => { track("reading_click", { locale, tier, method: `wallet_${why}` }); setWalletTier(null); walletSkipRef.current = true; void requestReading(tier); };
                return (
                  <WalletPay key={`${tier}-${currency}-${amountSeen}`} locale={locale} pk={walletPk} amountMinor={amountSeen} currency={currency.toLowerCase()}
                    priceLabel={formatMoney(currency, amountSeen, locale)}
                    mailNote={!me?.signedIn && !normalizeEmail(firstEmail)}
                    onFallback={fallback}
                    onSaveInstead={!me?.signedIn ? () => { setWalletTier(null); setSaveFromWallet(true); setSaveOpen(true); const f = normalizeEmail(firstEmail); if (f && !saveEmail) setSaveEmail(f); } : undefined}
                    onPaid={(sid) => { track("checkout_start", { locale, tier, cur: currency, method: "wallet" }); window.location.href = `/${locale}/reading?sid=${encodeURIComponent(sid)}&fresh=1`; }}
                    createIntent={async (email) => {
                      const typedFirst = normalizeEmail(firstEmail);
                      const res = await fetch("/api/checkout", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ ...basePayload(), ...attribution(), tier, locale, currency, curSrc: currencySource, via: viaTag(), wallet: true, amountSeen, ...(email ? { walletEmail: email } : {}), ...(giftNotify ? { notify: true } : {}), ...(!me?.signedIn && typedFirst ? { email: typedFirst } : {}) }),
                      });
                      if (!res.ok) return null;
                      const d = (await res.json()) as { clientSecret?: string; sid?: string };
                      if (!d.clientSecret || !d.sid) return null;
                      attachSid(question, d.sid, tier);
                      savePending({ q: question, values, at: castAt, locale, sid: d.sid, tier, ...(giftCastToken ? { gift: giftCastToken } : {}) });
                      return { clientSecret: d.clientSecret, sid: d.sid };
                    }}
                  />
                );
              })()}
              {secondAsk && !checkingOut && (
                <SecondAsk locale={locale} currency={currency} price={price} firstMonth={firstMonth} firstLabel={firstLabel} tier={secondAsk}
                  onSingle={() => { const tr = secondAsk; secondAckRef.current = true; setSecondAsk(null); track("reading_click", { locale, tier: tr, method: "second_single" }); void requestReading(tr); }} />
              )}
              {/* 10-04 支付宝: Alipay is on for CNY / USD, so the mainland note stops saying "you cannot pay" — it says Alipay
                  is there (and keeps the proxy hint, since Stripe's page itself is what fails to open on mainland networks) */}
              {cnAsk && !checkingOut && (
                <CnPayNote locale={locale} currency={currency}
                  onContinue={() => { const tr = cnAsk; cnAckRef.current = true; setCnAsk(null); track("reading_click", { locale, tier: tr, method: "cn_pay_continue" }); void requestReading(tr); }}
                  onCancel={() => setCnAsk(null)} />
              )}
              {firstPriceGone && !checkingOut && (
                <p className="t-small mt-[var(--s-3)] !text-[var(--gold-text)] fade-in">{t(locale, "firstPriceGone")}</p>
              )}

              {/* 09-24: a friend's gift asks for an address before it is spent */}
              {giftCastToken && giftAskEmail && !me?.signedIn && !checkingOut && (
                <EmailAsk locale={locale} why={t(locale, "giftEmailWhy")} value={giftFriendEmail} invalid={giftFriendInvalid}
                  onChange={(v) => { setGiftFriendEmail(v); setGiftFriendInvalid(false); setEmailErr(null); }} go={() => void requestReading("deep")} goLabel={t(locale, "giftClaim")}
                  error={giftFriendInvalid ? t(locale, "giftEmailNeeded") : emailErr ? t(locale, emailErr === "domain" ? "emailNoDomain" : "emailBad") : null} />
              )}
              {/* 11-03: the shared light reading asks for an address when the server needs one (no owner address on file) */}
              {!giftCastToken && afterActive && giftAskEmail && !me?.signedIn && !checkingOut && (
                <EmailAsk locale={locale} why={tt(locale, "afterWhy")} value={giftFriendEmail} invalid={giftFriendInvalid}
                  onChange={(v) => { setGiftFriendEmail(v); setGiftFriendInvalid(false); setEmailErr(null); }} go={() => void requestReading("one")} goLabel={tt(locale, "claimGo")}
                  error={giftFriendInvalid ? t(locale, "giftEmailNeeded") : emailErr ? t(locale, emailErr === "domain" ? "emailNoDomain" : "emailBad") : null} />
              )}

              {/* The painted door's claim panel: the price stood, the tap was
                  counted; now the truth — this one is a gift — and an optional
                  address so delivery works as it would for a buyer. */}
              {GIFT && giftTier && !checkingOut && (
                <GiftClaimPanel locale={locale} tier={giftTier} signedIn={!!me?.signedIn} email={giftEmail}
                  setEmail={(v) => { setGiftEmail(v); setGiftInvalid(false); setEmailErr(null); }} invalid={giftInvalid} emailErr={emailErr}
                  limited={giftLimited} notify={giftNotify} setNotify={setGiftNotify} claim={(tier, email) => void claimGift(tier, email)} />
              )}

              {/* The reading takes real time. Say what is happening instead of
                  leaving a dead button — and show the work, which is the whole
                  argument of the product. Going to payment is a different truth
                  and gets its own line. */}
              {/* 09-26 (Neil: 非会员看到价格时突出会员优惠): a member never sees this; anyone else — anonymous or
                  signed in without a live membership — gets the arithmetic, not a slogan. Waits for /api/me so a
                  member is never flashed an offer for what they already have. */}
              {/* 10-22 (Neil: 「要」): under the 通卡 model the pass panel carries the member line (「首月 {f}，之後 {p}」); this card's
                  arithmetic is the old allowance's (「含 10 次深斷」, a single deep reading's price) and its link the 單月會員 — so it
                  stays with the old model only */}
              {PAYWALL && me && !me.tongka && !me.entitlement?.active && !checkingOut && !aiLoading && !pairActive && (
                <MemberCard locale={locale} currency={currency} price={price} firstMonth={firstMonth} firstLabel={firstLabel} visitDay={visitDay} signedIn={me.signedIn} />
              )}
              {PAYWALL && !me?.entitlement?.active && !checkingOut && !aiLoading && mainland && (
                <p className="t-small mt-[var(--s-2)] !text-[var(--ink-45)]">{t(locale, "payNetworkHint")}</p>
              )}
              {/* 09-25 合规: immediate-delivery consent, next to the buttons that ask for it (CRD Art.16(m)) */}
              {/* 09-26 首次付费保证: the risk of a first purchase, taken off the table (only for someone who has never paid) */}
              {PAYWALL && me && !me.signedIn && me.neverPaid && !pairActive && !checkingOut && !giftCastToken && !rewardToken && (
                <p className="t-small mt-[var(--s-3)] !text-[var(--gold-text)]" data-heat="guarantee-line">✓ {tt(locale, "guarLine")}</p>
              )}
              {PAYWALL && me?.signedIn && !me.entitlement?.active && me.neverPaid && !pairActive && !checkingOut && (
                <p className="t-small mt-[var(--s-3)] !text-[var(--gold-text)]" data-heat="guarantee-line">✓ {tt(locale, "guarLine")}</p>
              )}
              {PAYWALL && !me?.entitlement?.active && !pairActive && !checkingOut && (
                <div className="mt-[var(--s-2)]"><ConsentLine locale={locale} k="payConsent" /></div>
              )}
              {/* 09-26 (Neil: 「好，做吧」): Stripe's page is Link's — green, "sold through Link". 99% of those who left it never typed a card; say what they will see before they see it */}
              {PAYWALL && !me?.entitlement?.active && !pairActive && !checkingOut && !mainland && !plainPay && !giftCastToken && !rewardToken && (
                <p className="t-small mt-[var(--s-2)] !text-[var(--ink-45)]" data-heat="link-note">{tt(locale, "payLinkNote")}</p>
              )}

              {/* 10-12 挽回信序列: the reader's own yes to the reminder letters if this payment is not finished */}
              {PAYWALL && !me?.entitlement?.active && !checkingOut && !aiLoading && !pairActive && !giftCastToken && !rewardToken && (
                <label className="mt-[var(--s-3)] flex items-start gap-2 cursor-pointer" data-heat="pay-remind">
                  <input type="checkbox" checked={payRemind} onChange={(e) => setPayRemind(e.target.checked)} className="mt-[3px] accent-[var(--ink)]" />
                  <span className="t-small !text-[var(--ink-66)]">{tt(locale, "payRemind")}</span>
                </label>
              )}
              {/* 09-23: the paid path had no launch box at all — only the (now rare) gift panel and the login form did, which is why 33 of 135 customers had said yes */}
              {PAYWALL && !me?.entitlement?.active && !checkingOut && !aiLoading && (
                <label className="mt-[var(--s-3)] flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" checked={giftNotify} onChange={(e) => setGiftNotify(e.target.checked)} className="mt-[3px] accent-[var(--ink)]" />
                  <span className="t-small !text-[var(--ink-66)]">{t(locale, "notifyOptIn")}</span>
                </label>
              )}

              {checkingOut ? (
                <p className="t-small mt-[var(--s-4)] !text-[var(--ink-66)]">
                  {t(locale, GIFT ? "giftRedirect" : "payRedirect")}
                </p>
              ) : (
                aiLoading && <WorkingPanel locale={locale} />
              )}

              {aiError && <p className="t-small mt-3 !text-[var(--cinnabar)]">{t(locale, "aiError")}</p>}

              {activeTier && readings[activeTier] && (
                <>
                  <ReadingArticle locale={readingLocale} tier={activeTier} reading={readings[activeTier]!} topic={topicShown} />
                  {/* the conversation belongs to the master reading (09-17); the light tier points up instead */}
                  {activeTier === "deep" ? (
                    <FollowupChat
                      locale={locale}
                      tier={activeTier}
                      extraBody={{ ...basePayload(), castId: freeCastId ?? undefined }}
                      topic={topicShown}
                    />
                  ) : (
                    <p className="t-small mt-[var(--s-5)] pt-[var(--s-4)] border-t border-[var(--ink-16)] !text-[var(--ink-66)]">{t(locale, "oneUpsellInline")}</p>
                  )}
                </>
              )}
            </section>
            </Dossier>

            <ShareCard locale={locale} values={values} />

            <div className="flex flex-wrap gap-6 mt-[var(--s-6)] pt-[var(--s-5)] border-t border-[var(--ink-16)]">
              <button onClick={reset} className="t-label hover:text-[var(--ink)] transition-colors">
                {t(locale, "again")}
              </button>
              <Link href={`/${locale}`} className="t-label hover:text-[var(--ink)] transition-colors">
                {t(locale, "editQuestion")}
              </Link>
            </div>
          </div>
        )}
        {/* the product page's blocks (適合問／怎麼做／免費與付費／界線…) — gone once a figure is on the page */}
        {!chart && children}
      </div>
    </div>
  );
}
