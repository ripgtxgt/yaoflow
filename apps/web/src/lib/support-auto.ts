import { db, guaranteeCheck, logMailSent, recordOps, type GuaranteeCheck } from "./db";
import { refundSession } from "./refund";
import { ownerRecipients } from "./email";
import { ensureInboxTable, inboxGet, inboxMark, type InboxRow } from "./inbound";
import { formatMoney, isCurrency, type Currency } from "./money";
import { toHans } from "./hant";
import { asLocale, type Locale } from "./locales";
import { homeMinute } from "./clock";
import { LIVE_STATUSES, isLocalSubscription, isPassSubscription } from "./subscription";
import { noteLlmFailure, stripFence, supportJson, supportText } from "./support-llm";
import { reportForOrder } from "./my-reports";

/**
 * 10-18 客服实时自动处理 (Neil: 「我的意思是实时自动处理，而不是每隔2小时再来看」).
 *
 * Until now a scheduled Claude session read the inbox every two hours and worked through
 * 《客服自动处理规程-2026-10.md》. This module does the same work on the server, the moment a letter arrives
 * (lib/inbound.ts hands over right after the forward), with the cron sweep catching anything the live run missed.
 *
 * The division of labour is deliberate:
 *   - the MODEL reads the letter: which class (A–F), what the reader wants, which language, whether the tone is
 *     hostile, and — for class F — a draft answer in the house voice;
 *   - the CODE holds the money and the mail: every condition the 规程 puts on an automatic answer (one payment only,
 *     within 24 h, reading generated AND delivered, no subscription, first letter in the thread, Chinese) is checked
 *     against the database here, and a letter that fails any of them goes to Neil as a draft, never to the reader.
 *
 * SUPPORT_AUTO in .env.local: off (default) — nothing happens; dry — everything is worked out and Neil gets a letter
 * saying what WOULD have been done, the reader hears nothing and nothing is refunded; on — the real thing.
 * Hard rules carried over unchanged: one automatic answer per reader per thread; no refunds outside the guarantee;
 * no allowance, no free deep readings, no promises of dates, no bug explanations, no judgement of a reading, no
 * product-design explanations (Neil 10-16); /api/revisit/outcome links are never touched.
 */

export type AutoMode = "off" | "dry" | "on";
export function supportAutoMode(): AutoMode {
  const v = (process.env.SUPPORT_AUTO ?? "off").toLowerCase();
  return v === "on" || v === "dry" ? v : "off";
}

export type LetterClass = "A" | "B" | "C" | "D" | "E" | "F";
export type AutoAction = "ack" | "reply" | "refund_reply" | "escalate" | "dry" | "error" | "defer";

const API = "https://api.resend.com";
const key = () => process.env.RESEND_API_KEY ?? "";
const site = () => (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
const SIGN = "——Neil · YaoFlow";
/** a reader who wrote (or was answered automatically) this recently is mid-conversation: the second letter goes to Neil */
const THREAD_MS = 14 * 86_400_000;
/** class C answers only about a payment this fresh; older "I paid and got nothing" is for Neil (规程 §2 C) */
const C_WINDOW_MS = 24 * 3_600_000;
const AUTO_REFUND_MS = 30 * 60_000;

/* ---------------- storage ---------------- */

export function ensureAutoColumns(): void {
  const d = db();
  const have = new Set((d.prepare("PRAGMA table_info(support_inbox)").all() as { name: string }[]).map((c) => c.name));
  const add = (col: string, type: string) => { if (!have.has(col)) d.exec(`ALTER TABLE support_inbox ADD COLUMN ${col} ${type}`); };
  add("auto_at", "INTEGER"); add("auto_class", "TEXT"); add("auto_action", "TEXT"); add("auto_draft", "TEXT"); add("auto_note", "TEXT"); add("auto_reply_id", "TEXT"); add("auto_read", "TEXT");
}

export interface AutoRow extends InboxRow {
  auto_at?: number | null; auto_class?: string | null; auto_action?: string | null; auto_draft?: string | null; auto_note?: string | null; auto_reply_id?: string | null;
  /** the model's reading of the letter, kept so a deferred letter is not read twice */
  auto_read?: string | null;
}

/** Claim the letter (the webhook and the sweep may both arrive): true for the one caller that owns it now. */
function claim(id: string, now: number): boolean {
  ensureAutoColumns();
  const r = db().prepare("UPDATE support_inbox SET auto_at = ? WHERE id = ? AND auto_at IS NULL").run(now, id);
  return Number((r as unknown as { changes?: number | bigint }).changes ?? 0) === 1;
}
function record(id: string, i: { cls: LetterClass | null; action: AutoAction; draft?: string | null; note?: string | null; replyId?: string | null }): void {
  db().prepare("UPDATE support_inbox SET auto_class = ?, auto_action = ?, auto_draft = COALESCE(?, auto_draft), auto_note = ?, auto_reply_id = COALESCE(?, auto_reply_id) WHERE id = ?")
    .run(i.cls, i.action, i.draft ?? null, i.note?.slice(0, 500) ?? null, i.replyId ?? null, id);
}

/* ---------------- facts ---------------- */

export interface PaidOrder {
  session_id: string; created_at: number; tier: string; amount_cents: number; currency: string; payment_state: string; refund_reason: string | null;
  cast_id: number | null; reading_locale: string | null; mail_delivered_at: number | null; mail_opened_at: number | null;
  /** 10-23 进度表 114: a report product's own page (合盤、年書、報告、塔羅、解籤) — the reading page is for 六爻 only */
  report_href?: string | null;
}
export interface SubInfo { stripe_subscription_id: string; status: string; plan: string; period_end: number | null; cancel_at_period_end: number }
export interface Facts {
  email: string; customerId: number | null; locale: Locale;
  /** one-time purchases (paid / refunded / disputed) by this address or account, newest first */
  orders: PaidOrder[];
  subs: SubInfo[];
  /** other letters from this address in the last 14 days (before this one) */
  priorLetters: number;
  /** of which answered automatically */
  priorAutoReplies: number;
  /** the subject answers one of our revisit / day-of / heads-up letters */
  onRevisitMail: boolean;
}

export function gatherFacts(row: InboxRow, now = Date.now()): Facts {
  const d = db();
  const email = row.from_addr.toLowerCase();
  const cid = row.customer_id ?? ((d.prepare("SELECT id FROM customers WHERE lower(email) = ?").get(email) as { id: number } | undefined)?.id ?? null);
  const cust = cid ? (d.prepare("SELECT locale FROM customers WHERE id = ?").get(cid) as { locale: string | null } | undefined) : undefined;
  const orders = (d.prepare(
    `SELECT session_id, created_at, tier, amount_cents, currency, payment_state, refund_reason, cast_id
     FROM orders WHERE (lower(email) = ? OR (? IS NOT NULL AND customer_id = ?)) AND entitlement_kind = 'purchase'
       AND payment_state IN ('paid','refunded','disputed') AND COALESCE(amount_cents, 0) > 0 AND COALESCE(test_flag, 0) = 0
     ORDER BY created_at DESC LIMIT 30`,
  ).all(email, cid, cid) as Omit<PaidOrder, "reading_locale" | "mail_delivered_at" | "mail_opened_at">[]).map((o) => {
    // 10-23 进度表 114: 合盤、年書、八字／紫微／星盤報告、塔羅、解籤 keep what they wrote in their own tables, not in
    // `readings` — the summary used to call every one of them 「无解读」
    const rep = o.cast_id ? null : reportForOrder(o.tier, o.session_id);
    const r = o.cast_id ? (d.prepare("SELECT locale FROM readings WHERE cast_id = ? ORDER BY id DESC LIMIT 1").get(o.cast_id) as { locale: string } | undefined) : undefined;
    const m = d.prepare("SELECT delivered_at, opened_at FROM mail_log WHERE kind = ? AND session_id = ? ORDER BY created_at DESC LIMIT 1").get(rep?.mailKind ?? "reading", o.session_id) as { delivered_at: number | null; opened_at: number | null } | undefined;
    const readingLocale = rep ? (rep.done ? rep.locale : null) : r?.locale ?? null;
    return { ...o, currency: (o.currency ?? "USD").toUpperCase(), reading_locale: readingLocale, mail_delivered_at: m?.delivered_at ?? null, mail_opened_at: m?.opened_at ?? null, report_href: rep?.href ?? null };
  });
  const subs = cid ? (d.prepare("SELECT stripe_subscription_id, status, plan, period_end, cancel_at_period_end FROM subscriptions WHERE customer_id = ? ORDER BY created_at DESC").all(cid) as SubInfo[]) : [];
  const prior = d.prepare("SELECT COUNT(*) AS n, SUM(CASE WHEN auto_action IN ('reply','refund_reply') THEN 1 ELSE 0 END) AS a FROM support_inbox WHERE lower(from_addr) = ? AND id <> ? AND received_at > ? AND received_at <= ?")
    .get(email, row.id, now - THREAD_MS, row.received_at) as { n: number; a: number | null };
  const subj = row.subject ?? "";
  const onRevisitMail = /應期|应期|應了|应了|应验|應驗|該驗|该验|應期近了|应期近了|到日子|都在前面/.test(subj)
    || !!(d.prepare("SELECT 1 FROM mail_log WHERE kind IN ('revisit','dayof','headsup') AND lower(email) = ? AND subject IS NOT NULL AND instr(?, subject) > 0 LIMIT 1").get(email, subj));
  const locale: Locale = asLocale(cust?.locale ?? orders[0]?.reading_locale ?? null, "zh-hant");
  return { email, customerId: cid, locale, orders, subs, priorLetters: prior.n, priorAutoReplies: prior.a ?? 0, onRevisitMail };
}

const liveStripeSubs = (f: Facts) => f.subs.filter((s) => LIVE_STATUSES.has(s.status) && !isLocalSubscription(s.stripe_subscription_id));
const liveLocalSubs = (f: Facts) => f.subs.filter((s) => LIVE_STATUSES.has(s.status) && isLocalSubscription(s.stripe_subscription_id));

/* ---------------- the letter itself ---------------- */

/** The reader's own words: the quoted mail below their reply is cut off, HTML is flattened, length is capped. */
export function readerText(row: Pick<InboxRow, "text" | "html">): string {
  let t = row.text ?? "";
  if (!t.trim() && row.html) t = row.html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|tr)>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  const lines = t.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  for (const raw of lines) {
    const l = raw.trimEnd();
    if (/^\s*>/.test(l)) break;
    if (/^(On .+ wrote:|在 .+寫道：|在 .+写道：|.+ 於 .+ 寫道：|.+ 于 .+ 写道：|-{3,} ?(Original|原始郵件|原始邮件|Forwarded).*|From: .+|寄件者[:：].+|發件人[:：].+|发件人[:：].+|_{5,})$/i.test(l.trim())) break;
    out.push(l);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 3000);
}

export interface Read {
  cls: LetterClass; summary: string; language: "zh-hant" | "zh" | "other"; negative: boolean;
  wants_cancel: boolean; wants_refund: boolean; new_question: boolean;
}

const READ_SYSTEM = `你是 YaoFlow（yaoflow.com，六爻卜卦站）的客服分拣员。读一封读者来信和系统查到的数据，判断类别，输出 JSON。
类别：
A 纯确认/道谢：「謝謝」「了解」「收到了」「好喔」且没有新问题。
B 问有没有订阅/会员/自动扣款、怎么取消。
C 付了钱没拿到解读、找不到链接、没收到信。
D 要退款（任何措辞的退款请求）。
E 回在我们的「應期近了／應了沒有／到日子了」回访信上，说有或没有动静，不是在问新问题。
F 其他：bug、截图、产品建议、不认同解读内容、问卦理、要补额度、要免费深断、情绪明显负面（傻眼、文字游戏、骗、投诉、威胁拒付）、非中文、拿不准。
规则：拿不准一律 F。language：繁体写 zh-hant，简体写 zh，其他语言 other（中英夹杂按中文）。negative：语气明显不满、指责、威胁才算 true，普通疑问不算。wants_cancel：明确说要取消/停扣。wants_refund：明确要退钱。new_question：信里有需要回答的新问题。summary：一句话中文摘要，不超过 40 字，不写邮箱。
输出格式：{"cls":"A|B|C|D|E|F","summary":"…","language":"zh-hant|zh|other","negative":false,"wants_cancel":false,"wants_refund":false,"new_question":false}`;

export async function readLetter(row: InboxRow, f: Facts, body: string): Promise<Read> {
  const facts = [
    `客户：${f.customerId ? `#${f.customerId}` : "系统里没有这个邮箱"}`,
    `付款记录：${f.orders.length ? f.orders.slice(0, 6).map((o) => `${homeMinute(o.created_at)} ${tierLabel(o.tier, "zh")} ${o.payment_state}${o.reading_locale ? " 解读已生成" : o.report_href ? " 报告还没写完" : " 无解读"}`).join("；") : "无"}`,
    `会员／通卡：${f.subs.length ? f.subs.map(subLine).join("；") : "无"}`,
    `14 天内此前来信：${f.priorLetters} 封`,
    `主题像回访信回复：${f.onRevisitMail ? "是" : "否"}`,
  ].join("\n");
  const user = `【主题】${row.subject ?? "(无标题)"}\n【来信正文】\n${body || "(空)"}\n\n【系统数据】\n${facts}`;
  const raw = await supportJson(READ_SYSTEM, user);
  const j = JSON.parse(stripFence(raw)) as Partial<Read>;
  const cls = typeof j.cls === "string" && /^[A-F]$/.test(j.cls) ? (j.cls as LetterClass) : "F";
  const language = j.language === "zh" || j.language === "zh-hant" || j.language === "other" ? j.language : "other";
  return { cls, summary: String(j.summary ?? "").slice(0, 80), language, negative: !!j.negative, wants_cancel: !!j.wants_cancel, wants_refund: !!j.wants_refund, new_question: !!j.new_question };
}

/* ---------------- deciding ---------------- */

export type Decision =
  | { kind: "ack"; note: string }
  | { kind: "reply"; cls: "B" | "C"; text: string; note: string; tellNeil: string | null }
  | { kind: "refund_reply"; sessionId: string; amount: string; note: string }
  | { kind: "handled_notify"; cls: "E"; note: string }
  /** too early to tell (a payment minutes old, no reading yet): let go of the letter, the sweep looks again */
  | { kind: "defer"; why: string }
  | { kind: "escalate"; cls: LetterClass; why: string };

/** 10-23 进度表 114: the report products by name (the raw tier read 「hepan_pair」 in a letter) */
const TIER_ZH: Record<string, string> = {
  deep: "深斷", one: "輕解讀", qian: "解籤", tarot: "塔羅個人解讀", hepan_pair: "合盤報告", nianshu: "年書",
  bazi_deep: "八字深度報告", bazi_love: "正緣畫像", bazi_year: "八字流年報告", ziwei_deep: "紫微深度報告", ziwei_year: "紫微流年報告",
  astro_deep: "星盤深度報告", astro_year: "星盤流年報告",
  name_baby: "寶寶取名參考", name_rename: "改名參考",
  // 10-24: the C1 auto-reply printed a raw 「pass_1d」 to the reader
  pass_1d: "1 日通卡", pass_7d: "7 天通卡", pass_30d: "30 天通卡",
};
/** 10-24 (Neil: 「会员是会员，通卡是通卡」): a `pass_…` row (written with plan "month") is a 通卡, never 「会员 month」 */
const subLine = (s: SubInfo): string => (isPassSubscription(s.stripe_subscription_id) ? `通卡 ${s.status}` : `会员 ${s.plan} ${s.status}`);
export function tierLabel(tier: string, script: "zh" | "zh-hant"): string {
  const t = TIER_ZH[tier] ?? tier;
  return script === "zh" ? toHans(t) : t;
}
const money = (o: Pick<PaidOrder, "amount_cents" | "currency">, locale: Locale) => formatMoney(isCurrency(o.currency) ? (o.currency as Currency) : "USD", o.amount_cents, locale);
const dayLabel = (ms: number) => { const d = new Date(ms + 8 * 3_600_000); return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`; };
const minuteLabel = (ms: number) => `${dayLabel(ms)} ${homeMinute(ms).slice(11)}`;
const readingUrl = (o: PaidOrder) => (o.report_href ? `${site()}${o.report_href}` : `${site()}/${o.reading_locale ?? "zh-hant"}/reading?sid=${encodeURIComponent(o.session_id)}`);

/** The reply, in the reader's script (templates are written in 繁體; simplified readers get them converted). */
function script(f: Facts, r: Read): "zh" | "zh-hant" { return r.language === "zh" || (r.language !== "zh-hant" && f.locale === "zh") ? "zh" : "zh-hant"; }
function render(t: string, s: "zh" | "zh-hant"): string { return s === "zh" ? toHans(t) : t; }

export function decide(f: Facts, r: Read, now = Date.now()): Decision {
  if (r.language === "other") return { kind: "escalate", cls: "F", why: "非中文来信，模板没有对应语言" };
  if (r.negative) return { kind: "escalate", cls: "F", why: "读者情绪明显负面（规程 §0-4）" };
  const s = script(f, r);
  const loc: Locale = s;
  switch (r.cls) {
    case "A":
      if (r.new_question) return { kind: "escalate", cls: "F", why: "像道谢，但带了新问题" };
      return { kind: "ack", note: "auto: ack" };
    case "E":
      if (!f.onRevisitMail) return { kind: "escalate", cls: "F", why: "模型判为应期回复，但主题对不上回访信" };
      return { kind: "handled_notify", cls: "E", note: "auto: revisit-reply（不回；回访信本身有按钮）" };
    default: break;
  }
  if (f.priorLetters > 0 || f.priorAutoReplies > 0) return { kind: "escalate", cls: r.cls, why: `同一读者 14 天内已有 ${f.priorLetters} 封来信（自动回过 ${f.priorAutoReplies} 封）——第二封起转 Neil（规程 §0-2）` };
  switch (r.cls) {
    case "B": {
      const stripe = liveStripeSubs(f), local = liveLocalSubs(f);
      if (local.length) return { kind: "escalate", cls: "B", why: `有有效的非 Stripe 会员（${local.map((x) => x.stripe_subscription_id.slice(0, 5)).join("/")}），模板不适用` };
      if (!stripe.length) {
        const list = f.orders.filter((o) => o.payment_state !== "refunded");
        const lines = list.length ? list.map((o) => `${dayLabel(o.created_at)}　${tierLabel(o.tier, "zh-hant")} ${money(o, loc)}`).join("\n") : "（這個信箱下沒有付款記錄）";
        const text = render(`你好，\n\n查過了：你這個帳號沒有開通會員，也沒有任何每月自動扣款，不需要取消什麼。\n\n帳號裡的付款都是單次購買，各自付清、不會再扣：\n${lines}\n\n之後只要不再點付款，就不會有任何費用。有哪筆對不上，把日期和金額回給我，我幫你查。\n\n${SIGN}`, s);
        return { kind: "reply", cls: "B", text, note: "auto: B1 无订阅", tellNeil: null };
      }
      if (!r.wants_cancel) return { kind: "escalate", cls: "B", why: "有有效会员但不是要取消，规程只写了两种情形" };
      const sub = stripe[0]!;
      const end = sub.period_end ? dayLabel(sub.period_end) : "本期結束";
      const text = render(`你好，\n\n你的會員目前有效，本期到 ${end}。取消在帳號頁「會員與付款 → 管理訂閱」自己點就好，取消後用到本期結束，之後不再扣款；已開始的這一期不按比例退。\n\n如果你那邊點不了，回我一句，我替你設成到期取消。\n\n${SIGN}`, s);
      return { kind: "reply", cls: "B", text, note: "auto: B2 有订阅要取消（未改订阅）", tellNeil: `读者有有效会员（${sub.plan}，本期到 ${end}${sub.cancel_at_period_end ? "，已设到期取消" : ""}）并说要取消；已回 B2 告知自助路径，没有改订阅。若他回信说点不了，由你设到期取消。` };
    }
    case "C": {
      const o = f.orders.find((x) => x.payment_state === "paid" && now - x.created_at <= C_WINDOW_MS);
      if (!o) return { kind: "escalate", cls: "C", why: f.orders.length ? `最近一笔付款在 ${homeMinute(f.orders[0]!.created_at)}，超出 24 小时窗口` : "该邮箱/账号下没有付款记录" };
      if (o.reading_locale && o.mail_delivered_at) {
        const text = render(`你好，\n\n你 ${minuteLabel(o.created_at)} 付款的那一份${tierLabel(o.tier, "zh-hant")}已經生成好了，直接開這個連結就能看：\n${readingUrl(o)}\n\n交付信也寄到了這個信箱，找不到可以看一下垃圾郵件。有問題直接回信。\n\n${SIGN}`, s);
        return { kind: "reply", cls: "C", text, note: `auto: C1 解讀已生成（${o.session_id.slice(-8)}）`, tellNeil: null };
      }
      if (!o.reading_locale && now - o.created_at < AUTO_REFUND_MS) return { kind: "defer", why: `付款 ${Math.round((now - o.created_at) / 60_000)} 分钟，解读还没生成——等履约或 30 分钟自动退款后再看` };
      if (o.reading_locale && !o.mail_delivered_at && now - o.created_at < AUTO_REFUND_MS) return { kind: "defer", why: `解读刚生成，交付信还没送达——等一轮再看` };
      if (!o.reading_locale) return { kind: "escalate", cls: "C", why: `付款超过 30 分钟仍无解读（订单 …${o.session_id.slice(-8)}）` };
      return { kind: "escalate", cls: "C", why: `解读已生成但交付信未见送达（mail_log）——确认后再回链接` };
    }
    case "D": {
      if (!r.wants_refund) return { kind: "escalate", cls: "D", why: "模型判为退款类但信里没有明确要退" };
      const paidAny = f.orders.filter((x) => x.payment_state !== "disputed");
      if (paidAny.length !== 1) return { kind: "escalate", cls: "D", why: `该邮箱/账号下有 ${paidAny.length} 笔付款，不是唯一一笔——不符合首次付费保证` };
      const o = paidAny[0]!;
      if (o.payment_state === "refunded") return { kind: "escalate", cls: "D", why: `唯一一笔已退款（${o.refund_reason ?? "?"}）` };
      if (now - o.created_at > 24 * 3_600_000) return { kind: "escalate", cls: "D", why: `付款在 ${homeMinute(o.created_at)}，距来信超过 24 小时——按条款第 4 节处理` };
      const g: GuaranteeCheck = guaranteeCheck(o.session_id, now);
      if (!g.ok) return { kind: "escalate", cls: "D", why: `首次付费保证校验不通过：${g.why}${g.by ? `（${g.by}）` : ""}` };
      return { kind: "refund_reply", sessionId: o.session_id, amount: money(o, loc), note: `auto: D1 首次付费保证退款（${o.session_id.slice(-8)}）` };
    }
    default:
      return { kind: "escalate", cls: "F", why: r.summary || "其他" };
  }
}

export function renderD1(amount: string, s: "zh" | "zh-hant"): string {
  return render(`你好，\n\n收到。你這是在 YaoFlow 的第一筆付款，24 小時內不滿意可以全額退，不用說理由——${amount} 已退回原付款方式，通常 5–10 個工作天入帳，系統也另外寄了退款通知給你。那份解讀會隨退款關閉。\n\n謝謝你試用。\n\n${SIGN}`, s);
}

/* ---------------- the draft for Neil (class F and every escalation) ---------------- */

const DRAFT_SYSTEM = `你是 Neil，YaoFlow（yaoflow.com，六爻卜卦站）的创办人，在给读者回客服信。写一封可以直接发出的回信草稿。
口径（必须遵守）：
- 称呼「你好，」，署名「${SIGN}」，不用「親」「尊敬的」。读者用繁体就写繁体，用简体就写简体。
- 只说「怎么做能拿到他要的」：某个功能在哪里、怎么问、下一步点哪里。不解释产品为什么这样设计、内部怎么分档、规则/闸门/提示词怎么运作。
- 不承诺修复时间、不解释 bug 原因（最多说「这个我们查到了，会修」）、不评价或改动解读内容、不替卦辩解。
- 不承诺退款、不补额度、不送免费深断——这些只有 Neil 能定，草稿里不要写。
- 语气平实、短，三到六句，像人写的。不用列表、不用表情。
- 绝不出现「应验链接」「/api/revisit/outcome」这类内部路径。`;

export async function draftForNeil(row: InboxRow, f: Facts, r: Read, body: string, why: string): Promise<string> {
  const facts = [
    `客户 ${f.customerId ? `#${f.customerId}` : "未知"}，界面语言 ${f.locale}`,
    `付款：${f.orders.length ? f.orders.slice(0, 5).map((o) => `${homeMinute(o.created_at)} ${tierLabel(o.tier, "zh")} ${money(o, "zh")} ${o.payment_state}${o.reading_locale ? "，解读已生成" : o.report_href ? "，报告还没写完" : "，无解读"}${o.mail_delivered_at ? "，交付信已送达" : ""}${o.mail_opened_at ? "，已打开" : ""}`).join("；") : "无"}`,
    `会员／通卡：${f.subs.length ? f.subs.map((s) => `${subLine(s)}${s.period_end ? ` 到 ${homeMinute(s.period_end).slice(0, 10)}` : ""}`).join("；") : "无"}`,
    `为什么没有自动回：${why}`,
  ].join("\n");
  const user = `【读者来信】主题：${row.subject ?? "(无标题)"}\n${body || "(空)"}\n\n【系统数据】\n${facts}\n\n请写回信草稿正文。`;
  return (await supportText(DRAFT_SYSTEM, user)).trim();
}

/* ---------------- mail ---------------- */

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
export const asHtml = (text: string) => `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;"><div style="max-width:620px;margin:0 auto;padding:20px;font-family:-apple-system,'Segoe UI','PingFang TC','Microsoft JhengHei',sans-serif;font-size:15px;line-height:1.8;color:#2b2b2e;white-space:pre-wrap;">${esc(text)}</div></body></html>`;

async function originalMessageId(id: string): Promise<string | null> {
  try {
    const r = await fetch(`${API}/emails/receiving/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${key()}` }, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { message_id?: string | null; headers?: Record<string, string> };
    const mid = j.message_id ?? j.headers?.["message-id"] ?? j.headers?.["Message-ID"] ?? null;
    return mid && /^<.+>$/.test(mid.trim()) ? mid.trim() : mid ? `<${mid.trim().replace(/^<|>$/g, "")}>` : null;
  } catch { return null; }
}

/** The reader's answer, from support@, threaded onto their letter. One Resend call, one mail_log row. */
export async function sendReaderReply(row: InboxRow, text: string, kind: "support_auto" | "support_manual" | "support_ack" = "support_auto"): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!key()) return { ok: false, error: "RESEND_API_KEY not configured" };
  const from = process.env.SUPPORT_REPLY_FROM ?? "YaoFlow <support@yaoflow.com>";
  const mid = await originalMessageId(row.id);
  const subject = /^(re|回覆|回复|回信)[:：﹕]/i.test(row.subject ?? "") ? row.subject! : `Re: ${row.subject ?? ""}`.trim();
  try {
    const r = await fetch(`${API}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to: [row.from_addr], reply_to: ["support@yaoflow.com"], subject, html: asHtml(text), text,
        ...(mid ? { headers: { "In-Reply-To": mid, References: mid } } : {}),
        tags: [{ name: "kind", value: kind }],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) return { ok: false, error: `http ${r.status}: ${(await r.text()).slice(0, 200)}` };
    const j = (await r.json()) as { id?: string };
    if (j.id) logMailSent({ id: j.id, kind, email: row.from_addr, subject, customerId: row.customer_id });
    return { ok: true, id: j.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

/** What Neil gets: the one-line verdict, the data, the draft when there is one, and the ledger row ready to paste. */
async function tellNeil(row: InboxRow, i: { label: string; lines: string[]; draft?: string | null }): Promise<void> {
  if (!key()) return;
  const who = redact(row.from_addr);
  const head = `${who}${row.customer_id ? `（#${row.customer_id}）` : ""} · ${i.label}`;
  const body = [
    head, "",
    ...i.lines, "",
    `后台：${site()}/admin/inbox?open=${row.id}${i.draft ? "（草稿可在那里改了直接发）" : ""}`,
    ...(i.draft ? ["", "——— 草稿 ———", i.draft, "———", "回『发』我就发；要改就改完贴回来，或在后台改了直接发。"] : []),
    "", `台账：| ${homeMinute(Date.now()).slice(5, 10)} | ${who} | ${row.customer_id ? `#${row.customer_id} ` : ""}${(row.subject ?? "").slice(0, 40)} | **[自动]** ${i.label} | — |`,
  ].join("\n");
  try {
    const r = await fetch(`${API}/emails`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.SUPPORT_FROM ?? "YaoFlow 客服 <support@yaoflow.com>", to: ownerRecipients(), reply_to: ["support@yaoflow.com"],
        subject: `[客服自动] ${head}`, html: asHtml(body), text: body, tags: [{ name: "kind", value: "support_auto_notice" }],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) recordOps("support_auto_notice_fail", `${row.id}: ${r.status}`);
  } catch (e) { recordOps("support_auto_notice_fail", `${row.id}: ${e instanceof Error ? e.message.slice(0, 120) : "?"}`); }
}

/** "someone@example.com" → "som…@example.com" — the only form a reader's address takes in anything we write about them. */
export function redact(addr: string): string { return addr.replace(/^(.{1,3}).*(@.*)$/, "$1…$2"); }

/* ---------------- the run ---------------- */

/**
 * One letter, start to finish. Called by the webhook right after the forward (not awaited there — Svix wants its
 * 2xx) and by the sweep for anything that slipped. Safe to call twice: only the first caller gets the claim.
 */
export async function supportAutoHandle(id: string, now = Date.now()): Promise<AutoAction | "skipped"> {
  const mode = supportAutoMode();
  if (mode === "off") return "skipped";
  const row = inboxGet(id) as AutoRow | null;
  if (!row || row.handled_at || !row.forwarded_at) return "skipped";
  // 10-23 进度表 100: a directory's / newsletter's letter is not read, not drafted, not answered (it is kept and forwarded as 「[非读者]」)
  if (row.kind === "vendor") return "skipped";
  if (!claim(id, now)) return "skipped";
  const body = readerText(row);
  let f: Facts, r: Read;
  try {
    f = gatherFacts(row, now);
    const cached = row.auto_read ? (JSON.parse(row.auto_read) as Read) : null;
    r = cached ?? await readLetter(row, f, body);
    if (!cached) db().prepare("UPDATE support_inbox SET auto_read = ? WHERE id = ?").run(JSON.stringify(r), id);
  } catch (e) {
    noteLlmFailure("read", e);
    record(id, { cls: null, action: "error", note: `读信失败：${e instanceof Error ? e.message.slice(0, 120) : "?"}` });
    await tellNeil(row, { label: "F · 自动处理卡住（读信失败），请人工处理", lines: [`卡在：${e instanceof Error ? e.message.slice(0, 160) : "?"}`, "", "来信：", body.slice(0, 1200)] });
    await ack(row); // 10-23 进度表 111 ②: a person will answer — the reader hears it arrived
    return "error";
  }
  const d = decide(f, r, now);
  const summary = `来信：${r.summary || "(无摘要)"}`;
  const dataLines = [
    `付款：${f.orders.length ? f.orders.slice(0, 5).map((o) => `${homeMinute(o.created_at)} ${tierLabel(o.tier, "zh")} ${money(o, "zh")} ${o.payment_state}${o.reading_locale ? "·解读已生成" : o.report_href ? "·报告还没写完" : "·无解读"}${o.mail_delivered_at ? "·交付信已送达" : ""}`).join("；") : "无"}`,
    `会员／通卡：${f.subs.length ? f.subs.map(subLine).join("；") : "无"}`,
    `14 天内此前来信 ${f.priorLetters} 封`,
  ];

  if (d.kind === "defer") {
    // the letter goes back to the pool: auto_at cleared, the reading kept, so the next sweep decides without another model call
    db().prepare("UPDATE support_inbox SET auto_at = NULL, auto_class = ?, auto_action = 'defer', auto_note = ? WHERE id = ?").run(r.cls, `等待：${d.why}`.slice(0, 500), id);
    recordOps("support_auto", `${id.slice(0, 8)} ${r.cls} deferred: ${d.why.slice(0, 100)}`);
    return "defer";
  }

  if (mode === "dry") {
    const would = d.kind === "ack" ? "标 handled，不回" : d.kind === "handled_notify" ? "标 handled，不回，备注你一句" : d.kind === "reply" ? `自动回 ${d.note}` : d.kind === "refund_reply" ? `退款（…${d.sessionId.slice(-8)}，${d.amount}）后回 D1` : `转 Neil：${d.why}`;
    let draft: string | null = d.kind === "reply" ? d.text : d.kind === "refund_reply" ? renderD1(d.amount, script(f, r)) : null;
    if (d.kind === "escalate") { try { draft = await draftForNeil(row, f, r, body, d.why); } catch (e) { noteLlmFailure("draft", e); } }
    record(id, { cls: r.cls, action: "dry", draft, note: `dry: ${would}` });
    // 10-23 进度表 111 ②: nothing goes to the reader in dry mode — a letter that wants an answer gets the receipt (not a thank-you, not a revisit reply)
    if (d.kind !== "ack" && d.kind !== "handled_notify") await ack(row);
    await tellNeil(row, { label: `干跑 · 判 ${r.cls} · 会：${would}`, lines: [summary, ...dataLines, "", "（干跑模式：读者没有收到任何信，没有退款，没有标 handled——请照常人工处理）"], draft });
    return "dry";
  }

  switch (d.kind) {
    case "ack":
      inboxMark(id, true, d.note);
      record(id, { cls: "A", action: "ack", note: d.note });
      recordOps("support_auto", `${id.slice(0, 8)} A ack`);
      return "ack";
    case "handled_notify":
      inboxMark(id, true, d.note);
      record(id, { cls: "E", action: "ack", note: d.note });
      recordOps("support_auto", `${id.slice(0, 8)} E handled`);
      await tellNeil(row, { label: "E · 应期回访类回复，已标处理，未回", lines: [summary, ...dataLines] });
      return "ack";
    case "reply": {
      const sent = await sendReaderReply(row, d.text);
      if (!sent.ok) {
        record(id, { cls: d.cls, action: "error", draft: d.text, note: `发信失败：${sent.error}` });
        recordOps("support_auto_fail", `${id.slice(0, 8)} ${d.cls} send: ${sent.error}`);
        await tellNeil(row, { label: `${d.cls} · 想自动回但发信失败，请人工发`, lines: [summary, ...dataLines, `错误：${sent.error}`], draft: d.text });
        return "error";
      }
      inboxMark(id, true, `${d.note}，回信 Resend ${sent.id}`);
      record(id, { cls: d.cls, action: "reply", draft: d.text, note: d.note, replyId: sent.id });
      recordOps("support_auto", `${id.slice(0, 8)} ${d.cls} replied ${sent.id}`);
      if (d.tellNeil) await tellNeil(row, { label: `${d.cls} · 已自动回（${d.note.replace(/^auto: /, "")}），有一件事要你知道`, lines: [summary, ...dataLines, "", d.tellNeil], draft: d.text });
      return "reply";
    }
    case "refund_reply": {
      const rr = await refundSession({ sessionId: d.sessionId, reason: "guarantee", by: "support_auto", fallback: { tier: "deep", amountCents: null, currency: null, email: row.from_addr, locale: f.locale, paymentIntent: null, customerId: f.customerId } });
      const state = (db().prepare("SELECT payment_state FROM orders WHERE session_id = ?").get(d.sessionId) as { payment_state: string | null } | undefined)?.payment_state;
      if (!rr.ok || state !== "refunded") {
        record(id, { cls: "D", action: "error", note: `退款未确认：${rr.error ?? state ?? "?"}` });
        recordOps("support_auto_fail", `${id.slice(0, 8)} D refund: ${rr.error ?? state}`);
        await tellNeil(row, { label: "D · 首次付费保证退款没走通，请人工处理", lines: [summary, ...dataLines, `订单 …${d.sessionId.slice(-8)}：${rr.error ?? `payment_state=${state}`}`] });
        return "error";
      }
      const text = renderD1(d.amount, script(f, r));
      const sent = await sendReaderReply(row, text);
      if (!sent.ok) {
        record(id, { cls: "D", action: "error", draft: text, note: `已退款（${rr.refundId ?? ""}），但回信失败：${sent.error}` });
        await tellNeil(row, { label: "D · 已退款，但 D1 回信发送失败，请人工发", lines: [summary, ...dataLines, `退款 ${rr.refundId ?? ""} 已成功；错误：${sent.error}`], draft: text });
        return "error";
      }
      inboxMark(id, true, `${d.note}，退款 ${rr.refundId ?? ""}，回信 Resend ${sent.id}`);
      record(id, { cls: "D", action: "refund_reply", draft: text, note: d.note, replyId: sent.id });
      recordOps("support_auto", `${id.slice(0, 8)} D refunded ${d.sessionId.slice(-8)} replied ${sent.id}`);
      await tellNeil(row, { label: `D · 首次付费保证已退 ${d.amount} 并回 D1`, lines: [summary, ...dataLines, `订单 …${d.sessionId.slice(-8)}，退款 ${rr.refundId ?? ""}，系统退款通知已另发`] });
      return "refund_reply";
    }
    case "escalate": {
      let draft: string | null = null;
      try { draft = await draftForNeil(row, f, r, body, d.why); } catch (e) { noteLlmFailure("draft", e); }
      record(id, { cls: d.cls, action: "escalate", draft, note: `转 Neil：${d.why}` });
      recordOps("support_auto", `${id.slice(0, 8)} ${d.cls} escalated: ${d.why.slice(0, 100)}`);
      await ack(row); // 10-23 进度表 111 ②: a person will answer — the reader hears it arrived
      await tellNeil(row, { label: `${d.cls} · 转 Neil（${d.why}）`, lines: [summary, ...dataLines, "", "来信：", body.slice(0, 1500)], draft: draft ?? "（草稿生成失败，请自己写）" });
      return "escalate";
    }
  }
}

/** 10-23 进度表 111 ②: the receipt (lib/support-ack.ts) — never fatal to the run */
async function ack(row: InboxRow): Promise<void> {
  try {
    const { sendSupportAck } = await import("./support-ack");
    await sendSupportAck(row, sendReaderReply);
  } catch (e) { recordOps("support_ack", `${row.id.slice(0, 8)} failed: ${e instanceof Error ? e.message.slice(0, 120) : "?"}`); }
}

/** The cron's safety net: letters forwarded but never looked at (a webhook that died mid-way, a restart). */
export async function supportAutoSweep(now = Date.now()): Promise<number> {
  if (supportAutoMode() === "off") return 0;
  ensureInboxTable();
  ensureAutoColumns();
  const rows = db().prepare("SELECT id FROM support_inbox WHERE auto_at IS NULL AND handled_at IS NULL AND forwarded_at IS NOT NULL AND kind IS NOT 'vendor' AND received_at > ? ORDER BY received_at ASC LIMIT 10").all(now - 3 * 86_400_000) as { id: string }[];
  let n = 0;
  for (const r of rows) if ((await supportAutoHandle(r.id, now)) !== "skipped") n += 1;
  return n;
}
