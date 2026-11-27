import { passT } from "./dict/pass";
import { svT } from "./dict/saved-cast";
import { rcT } from "./dict/recover";
import { lc } from "./dict/login-code";
import { dpT } from "./dict/daily-plus";
import { tt } from "./dict/thread";
import { po } from "./dict/pack-offer";
import { RESET_T } from "./dict/sub-reset";
import { withOperatorFooter } from "./operator";
import { selfRevText } from "./self-revisit-text";
import { toHans } from "./hant";
import { BRAND_HAN, isHan, senderName } from "./brand";
/**
 * Transactional email via Resend REST (no SDK dependency).
 * Only used to deliver something the customer paid for — never marketing
 * without explicit consent (see Privacy Policy §1).
 */

export interface SendResult {
  ok: boolean;
  id?: string;
  error?: string;
}

/** What kind of mail this is — travels to Resend as a tag and names the row in mail_log. */
export type MailKind = "reading" | "revisit" | "login" | "refund" | "pair" | "reward" | "launch" | "digest" | "seal" | "test" | "sub_alert" | "sub_confirm" | "sub_winback" | "headsup" | "dayof" | "sub_welcome" | "sub_renew" | "sub_recap" | "sub_perks" | "gift_used" | "daily" | "daily_confirm" | "pack_offer" | "pack_bought" | "saved_cast" | "saved_followup" | "recover" | "qian" | "sub_reset" | "pass_notice" | "tarot" | "tarot_revisit" | "zeri" | "bazi" | "ziwei" | "astro" | "hepan" | "nianshu" | "report_mended" | "ops_check" | "announce_1023" | "campaign"
  // 10-23 进度表 111 / 110: the membership notices (lib/sub-letters.ts)
  | "sub_payfail" | "sub_unpaid_end" | "sub_resume" | "sub_pause" | "support_ack" | "nianshu_received" | "erase"
  // 10-23 进度表 112: the 年書 early-bird letter of 11/1 (lib/nianshu-early-1101.ts)
  | "nianshu_early_1101"
  // 10-24: a membership renewal that went through (lib/sub-letters.ts runRenewalReceipts)
  | "sub_renewed"
  // 10-29 进度表 122: the 取名／改名參考 is written
  | "name";

/** 09-25 合规: the kinds that are commercial mail — they carry one-click unsubscribe headers and, in Korean, the (광고) subject prefix the 정보통신망법 requires */
export const COMMERCIAL_KINDS: ReadonlySet<MailKind> = new Set<MailKind>(["launch", "sub_winback", "pack_offer", "saved_followup", "recover", "announce_1023", "campaign", "nianshu_early_1101"]);

export interface SendOptions {
  kind: MailKind;
  /** 09-25: the one-click unsubscribe link for commercial mail (List-Unsubscribe / RFC 8058) */
  unsubUrl?: string | null;
  locale?: Locale;
  /** the reading / order this mail belongs to, when there is one */
  sessionId?: string | null;
  customerId?: number | null;
  replyTo?: string;
}

/**
 * Where owner mail goes (09-22). Weekly digest and the membership alerts used
 * to fall back to one hard-coded address, so changing it meant a deploy — and
 * a single inbox means one full mailbox or one spam rule loses every alert.
 * `DIGEST_TO` may now list several addresses, comma separated.
 */
export function ownerRecipients(): string[] {
  const raw = process.env.DIGEST_TO ?? process.env.REVISIT_REPLY_TO ?? "ripgtxgt@gmail.com";
  const out = raw.split(/[,;]/).map((x) => x.trim().toLowerCase()).filter((x) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
  return out.length ? [...new Set(out)] : ["ripgtxgt@gmail.com"];
}

/**
 * 10-13 解籤上线 (Neil chose: the group letter only to readers who said yes to news; everyone else hears it as ONE line at
 * the foot of the letters they get anyway — a reading, a revisit, the day-of and heads-up notes — for two weeks).
 */
export const QIAN_MENTION_UNTIL = Date.parse("2026-10-27T16:00:00Z"); // 10-28 00:00 Taipei
const QIAN_MENTION_KINDS: ReadonlySet<MailKind> = new Set<MailKind>(["reading", "revisit", "dayof", "headsup"]);
export function withQianMention(html: string, text: string, opts: Pick<SendOptions, "kind" | "locale">, now = Date.now()): { html: string; text: string } {
  if (opts.locale !== "zh-hant" || !QIAN_MENTION_KINDS.has(opts.kind) || now >= QIAN_MENTION_UNTIL || html.includes("/jieqian")) return { html, text };
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  const url = `${site}/zh-hant/jieqian?c=mail-qian`;
  const line = "在廟裡求了籤，看不懂籤詩？現在也能在 YaoFlow 解籤：輸入籤號看白話，或拍一張籤詩找出是哪一首；會員的解籤包含在權益裡。";
  const block = `<div style="max-width:560px;margin:0 auto;padding:0 24px 12px;"><p style="font-size:12px;line-height:1.7;color:${INK_66};margin:0;">${esc(line)} <a href="${esc(url)}" style="color:${INK_66};">看我的籤 →</a></p></div>`;
  const i = html.lastIndexOf("</body>");
  return { html: i >= 0 ? html.slice(0, i) + block + "\n" + html.slice(i) : html + block, text: `${text}\n\n${line} ${url}` };
}

/** "Name <addr>" or a bare address → the same address under the Chinese reader's sender name */
export function senderFor(raw: string, han: boolean): string {
  if (!han) return raw;
  const m = raw.match(/<([^>]+)>\s*$/);
  return `${senderName("zh")} <${(m ? m[1]! : raw).trim()}>`;
}

export async function sendEmail(
  to: string | string[],
  subject: string,
  html: string,
  text: string,
  opts: SendOptions,
): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  // 10-22 进度表 81 「爻流」上站: a Chinese reader sees 「爻流 YaoFlow」 as the sender and at the top of the letter; the
  // address is EMAIL_FROM's. The reader's language is opts.locale, else the subject's script (ideographs with no kana or hangul).
  const han = opts.locale ? isHan(opts.locale) : /[\u4e00-\u9fff]/.test(subject) && !/[\u3040-\u30ff\uac00-\ud7af]/.test(subject);
  const from = senderFor(process.env.EMAIL_FROM ?? "YaoFlow <noreply@yaoflow.com>", han);
  if (han) html = html.replace(/(<p style="letter-spacing:\.35em;[^"]*">)(?:YAOFLOW|YaoFlow)(<\/p>)/, `$1${BRAND_HAN} · YaoFlow$2`);
  // a reply to any mail from us reaches a person: the support address (09-07)
  const reply = opts.replyTo ?? process.env.REPLY_TO ?? CONTACT_EMAIL;
  if (!key) return { ok: false, error: "RESEND_API_KEY not configured" };
  ({ html, text } = withQianMention(html, text, opts)); // 10-13 解籤上线: one line, two weeks, in letters 繁體 readers already get
  ({ html, text } = withOperatorFooter(html, text)); // 09-26: Linedo LLC + postal address on every mail

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from, to: Array.isArray(to) ? to : [to],
        subject: COMMERCIAL_KINDS.has(opts.kind) && opts.locale === "ko" && !subject.startsWith("(광고)") ? `(광고) ${subject}` : subject,
        html, text,
        reply_to: [reply],
        ...(opts.unsubUrl && (COMMERCIAL_KINDS.has(opts.kind) || opts.kind === "daily")
          ? { headers: { "List-Unsubscribe": `<${opts.unsubUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }
          : {}),
        // the tag comes back on every webhook event, so a row can be
        // reconstructed even if the local log missed the send
        tags: [{ name: "kind", value: opts.kind }],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `http ${res.status}: ${body.slice(0, 200)}` };
    }
    const data = (await res.json()) as { id?: string };
    // one Resend call, one log row — the recipients ride together on the same
    // message, so the row records all of them rather than pretending it was one
    if (data.id) logMailSent({ id: data.id, kind: opts.kind, email: Array.isArray(to) ? to.join(", ") : to, subject, sessionId: opts.sessionId, customerId: opts.customerId });
    return { ok: true, id: data.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

import { contentFor } from "./content";
import { logMailSent } from "./db";
import { LAUNCH_EMAIL_T, LOGIN_EMAIL_T, PAIR_EMAIL_T, READING_EMAIL_T, REFUND_EMAIL_T, REVISIT_EMAIL_T, SEAL_EMAIL_T, WELCOME_EMAIL_T, type WelcomeEmailCopy } from "./dict/email";
import { LOCALE_META, type Locale } from "./locales";
import { CONTACT_EMAIL } from "./trust";
import { RETAIN_T } from "./dict/retain";
import { RENEW_T } from "./dict/renew";
import { RECAP_T } from "./dict/recap";
import { openLetterT } from "./dict/open-letters";
import { PERKS_T } from "./dict/perks";
import { HEADSUP_T } from "./dict/headsup";
import { cpT, type CheckpointCopy } from "./dict/checkpoint";
import { rsT } from "./dict/recover-seq";
import { msT } from "./dict/matter-save";
import { ANNOUNCE_T } from "./dict/announce-1023";
import { NIANSHU_EARLY_T } from "./dict/nianshu-early";

/* ---------------- reading delivery ---------------- */

export interface ReadingEmailInput {
  locale: Locale;
  tier: "one" | "deep";
  question: string;
  /** the six cast values, bottom-up — the figure is drawn, never a glyph */
  values: readonly number[];
  hexName: string;
  changedName: string | null;
  /** verdict (deep) or summary (one) — the one line worth putting in the email */
  headline: string;
  url: string;
  /** 送一卦: the gift panel's anchor, only for a deep reading that was paid for */
  giftUrl?: string | null;
  /** 09-27: a friend's gifted reading — where to ask their own question (the first-time price waits there) */
  friendCastUrl?: string | null;
  /** 10-23 进度表 101: under the 通卡 the friend's first-time price is the first 1-day pass */
  friendPass?: boolean;
  /** 09-25 收据: what they paid (formatted) and Stripe's receipt page — omitted for gifts and memberships */
  receipt?: { amount: string; url: string } | null;
  /** 09-25 合规: the Terms page, for the consent confirmation line (paid readings only) */
  termsUrl?: string | null;
}

/**
 * One paper palette for every email (09-07 调研: a full-ink email is a
 * black hole in the two biggest light-mode inboxes, gets force-inverted
 * by Gmail iOS and Outlook in dark mode, and never matched the login
 * email). Solid colours only — Outlook's Word engine ignores opacity.
 */
const PAPER = "#f4f2ec";
const INK = "#14151c";
const INK_86 = "#333439";   // lead lines
const INK_66 = "#606063";   // notes            5.6:1
const INK_50 = "#7a7a7c";   // labels, footer   4.0:1
const INK_30 = "#b1b0ad";   // quiet borders
const RULE = "#d0cfcb";
const CINNABAR = "#b0403c"; // moving lines     5.2:1 on paper
const GOLD = "#a9863c";     // the quote bar (time)
const GOLD_TEXT = "#8a6c2c"; // gold at text contrast 4.4:1
const FONT = "Georgia,'Songti SC','Noto Serif SC',serif";
const BODY = `margin:0;padding:0;background:${PAPER};color:${INK};font-family:${FONT};`;
const BTN = `display:inline-block;background:${INK};color:${PAPER};text-decoration:none;`;
const BTN_LINE = `display:inline-block;border:1px solid ${INK};color:${INK};text-decoration:none;`;
const BTN_QUIET = `display:inline-block;border:1px solid ${INK_30};color:${INK_66};text-decoration:none;`;

/**
 * The figure as email-safe HTML. inline-block only — no flex, no grid:
 * this has to survive Gmail, Outlook and every mobile client, and the
 * Unicode hexagram glyphs are tofu or wrong in too many of them.
 * Lines are ink on the paper ground; moving lines stay cinnabar, which
 * reads at 5.2:1 on paper (it was 3.2:1 on ink).
 */
export function figureHtml(values: readonly number[], lineColor = INK): string {
  const W = 132, H = 10, GAP = 22, SEG = (W - GAP) / 2;
  const bar = (w: number, color: string) =>
    `<span style="display:inline-block;width:${w}px;height:${H}px;background:${color};border-radius:2px;"></span>`;
  const rows = [...values].reverse().map((v) => {
    const yang = v === 7 || v === 9;
    const color = v === 6 || v === 9 ? CINNABAR : lineColor;
    const inner = yang
      ? bar(W, color)
      : bar(SEG, color) + `<span style="display:inline-block;width:${GAP}px;"></span>` + bar(SEG, color);
    return `<div style="font-size:0;line-height:0;margin:0 0 8px;">${inner}</div>`;
  });
  return `<div style="display:inline-block;">${rows.join("")}</div>`;
}


const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Email copy per language. zh and en are authored; Traditional Chinese is
 * derived; other languages fall back to English until their table is added
 * (lib/dict is for the site — email strings live here, next to their use).
 */

export function buildReadingEmail(i: ReadingEmailInput): { subject: string; html: string; text: string } {
  const t = contentFor(READING_EMAIL_T, i.locale);
  const tierName = i.tier === "deep" ? t.tierDeep : t.tierOne;
  const subject = t.subject.replace("{hex}", i.hexName);
  const figureLine = i.changedName ? `${i.hexName} ${t.to} ${i.changedName}` : i.hexName;

  const html = `<!doctype html>
<html lang="${htmlLang(i.locale)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BODY}">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:${INK_50};margin:0 0 32px;">YaoFlow</p>

    <div style="text-align:center;margin:0 0 32px;">
      <div style="margin-bottom:14px;">${figureHtml(i.values)}</div>
      <div style="font-size:18px;color:${INK};">${esc(figureLine)}</div>
      <div style="font-size:12px;color:${INK_50};margin-top:6px;">${esc(tierName)}</div>
    </div>

    <p style="font-size:12px;color:${INK_50};margin:0 0 6px;">${t.lead}</p>
    <p style="font-size:15px;color:${INK};margin:0 0 28px;line-height:1.7;">${esc(i.question)}</p>

    <div style="border-left:2px solid ${GOLD};padding-left:16px;margin:0 0 32px;">
      <p style="font-size:16px;line-height:1.8;margin:0;color:${INK};">${esc(i.headline)}</p>
    </div>

    <a href="${esc(i.url)}" style="${BTN}padding:13px 28px;border-radius:999px;font-size:15px;">${t.open}</a>

    <p style="font-size:13px;color:${INK_66};line-height:1.7;margin:28px 0 0;">${t.askMore}</p>
    <p style="font-size:13px;color:${INK_66};line-height:1.7;margin:10px 0 0;">${t.keep}</p>${i.giftUrl ? `
    <p style="font-size:13px;line-height:1.7;margin:10px 0 0;"><a href="${esc(i.giftUrl)}" style="color:${INK};">${t.giftLine}</a></p>` : ""}${i.friendCastUrl ? `
    <p style="font-size:13px;line-height:1.7;margin:10px 0 0;"><a href="${esc(i.friendCastUrl)}" style="color:${INK};">${esc(tt(i.locale, i.friendPass ? "mailFriendLinePass" : "mailFriendLine"))}</a></p>` : ""}${i.receipt ? `
    <p style="font-size:13px;color:${INK_66};line-height:1.7;margin:10px 0 0;">${esc(t.paid.replace("{amount}", i.receipt.amount))} · <a href="${esc(i.receipt.url)}" style="color:${INK};">${esc(t.receipt)} →</a></p>` : ""}${i.termsUrl && i.receipt ? `
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:10px 0 0;">${esc(t.consent.replace("{url}", i.termsUrl))}</p>` : ""}

    <hr style="border:none;border-top:1px solid ${RULE};margin:32px 0 16px;">
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0 0 6px;">${t.why}</p>
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${t.foot}</p>
  </div>
</body>
</html>`;

  const text = [
    `${figureLine} · ${tierName}`,
    "",
    `${t.lead}: ${i.question}`,
    "",
    i.headline,
    "",
    `${t.open}: ${i.url}`,
    "",
    t.keep,
    ...(i.giftUrl ? [`${t.giftLine} ${i.giftUrl}`] : []),
    ...(i.friendCastUrl ? [`${tt(i.locale, i.friendPass ? "mailFriendLinePass" : "mailFriendLine")} ${i.friendCastUrl}`] : []),
    ...(i.receipt ? [`${t.paid.replace("{amount}", i.receipt.amount)} · ${t.receipt}: ${i.receipt.url}`] : []),
    ...(i.termsUrl && i.receipt ? [t.consent.replace("{url}", i.termsUrl)] : []),
    "",
    t.foot,
  ].join("\n");

  return { subject, html, text };
}

function htmlLang(l: Locale): string {
  return LOCALE_META[l].htmlLang;
}

/* ---------------- 应期回访 (timing-window follow-up) ---------------- */

export interface RevisitEmailInput {
  locale: Locale;
  question: string;
  values: readonly number[];
  hexName: string;
  changedName: string | null;
  /** the timing line the reading committed to, if it named one */
  timingQuote: string | null;
  windowDays: number;
  readingUrl: string;
  castUrl: string;
  /** one-tap verdict links (signed); absent = plain reply-only email */
  outcomeUrls?: { hit: string; partial: string; miss: string; open: string };
  /** 送一卦 anchor on the reading page, when this was a paid deep reading */
  giftUrl?: string | null;
  /** 09-21: the one reminder, five days after an unanswered revisit mail */
  reminder?: boolean;
  /** 10-07: a question with nothing to verify asks about the signals the reading named instead of an event (lib/revisit-ask.ts) */
  ask?: "event" | "signals";
  /** 10-12 承接 ⑨: the matter began with a temple lot — 「當初抽到的是第 N 籤〈title〉」 */
  qianLine?: string | null;
  /** 10-14 进度表 46: what the reader said would count — the letter asks about exactly that */
  hint?: string | null;
  /** 10-22 进度表 89: what the reader said they would do — shown back to them, nothing more */
  plan?: string | null;
}


/**
 * Sent when the reading's own window has closed. Tone: keeping our word,
 * not campaigning. One question ("how did it go"), one door ("a new cast
 * for the new situation") — 一事一占 applies to the old matter, so the
 * invitation is explicitly for what has CHANGED, never "ask again".
 */
/** 10-14 进度表 46: the reader's own 「怎樣算有結果？」, asked back in the check-in letters */
const HINT_T: Record<string, { ask: string; seen: string; day: string }> = {
  "zh-hant": { ask: "你寫的「{hint}」，發生了嗎？", seen: "你寫的「{hint}」，這段時間有動靜了嗎？", day: "你寫下的結果是「{hint}」——今天留意一下。" },
  zh: { ask: "你写的「{hint}」，发生了吗？", seen: "你写的「{hint}」，这段时间有动静了吗？", day: "你写下的结果是「{hint}」——今天留意一下。" },
  en: { ask: "You wrote: “{hint}”. Did it happen?", seen: "You wrote: “{hint}”. Any sign of it in these days?", day: "What you said would count: “{hint}” — keep an eye out today." },
};
export const hintLine = (locale: string, k: "ask" | "seen" | "day", hint: string) => (HINT_T[locale] ?? HINT_T.en!)[k].replace("{hint}", hint);

export function buildRevisitEmail(i: RevisitEmailInput): { subject: string; html: string; text: string } {
  const base = contentFor(REVISIT_EMAIL_T, i.locale);
  // 10-07 回访改问法: the buttons name a FACT (happened / stirred / nothing / open), never a verdict — the score is
  // derived server-side from the reading's own lean; a question about how someone feels asks about the signals instead
  const t0 = i.ask === "signals" ? { ...base, how: base.howSig, hit: base.sigSeen, partial: base.sigSome, miss: base.sigNone } : base;
  // 10-14 进度表 46: their own words replace the general question; the four answers stay
  const t = i.hint && i.ask !== "signals" ? { ...t0, how: esc(hintLine(i.locale, "ask", i.hint)) } : t0;
  // 09-21: the subject leads with the reading's own timing line when it fits — "当时说「十月中旬前有回音」——后来怎么样了？"
  const quote = (i.timingQuote ?? "").replace(/\s+/g, " ").trim();
  const subject = i.reminder
    ? t.remindSubject.replace("{hex}", i.hexName)
    : quote && quote.length <= 28 ? t.subjectQuote.replace("{quote}", quote) : t.subject.replace("{hex}", i.hexName);
  const lead = i.reminder ? t.remindLead : t.lead;
  const windowLine = t.window.replace("{days}", String(i.windowDays));
  const figureLine = i.changedName ? `${i.hexName} → ${i.changedName}` : i.hexName;

  // with one-tap verdicts the verdict row is the primary action and the
  // reread link steps back to an outline; without them it is the only door
  const reviewStyle = i.outcomeUrls ? BTN_LINE : BTN;
  const html = `<!doctype html>
<html lang="${htmlLang(i.locale)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BODY}">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:${INK_50};margin:0 0 32px;">YaoFlow</p>

    <p style="font-size:12px;color:${INK_50};margin:0 0 16px;">${esc(lead)}</p>
    <div style="text-align:center;margin:0 0 28px;">
      <div style="margin-bottom:14px;">${figureHtml(i.values)}</div>
      <div style="font-size:17px;color:${INK};">${esc(figureLine)}</div>
    </div>

    <p style="font-size:12px;color:${INK_50};margin:0 0 6px;">${t.asked}</p>
    <p style="font-size:15px;color:${INK};margin:0 0 24px;line-height:1.7;">${esc(i.question)}</p>
    ${i.qianLine ? `<p style="font-size:13px;color:${INK_66};margin:-14px 0 24px;line-height:1.7;">${esc(i.qianLine)}</p>` : ""}
    ${i.plan ? `<p style="font-size:13px;color:${INK_66};margin:-14px 0 24px;line-height:1.7;">${esc(base.planned.replace("{p}", i.plan))}</p>` : ""}

    <p style="font-size:14px;color:${INK_86};line-height:1.8;margin:0 0 10px;">${windowLine}</p>
    ${i.timingQuote ? `
    <div style="border-left:2px solid ${GOLD};padding-left:16px;margin:0 0 24px;">
      <p style="font-size:12px;color:${GOLD_TEXT};margin:0 0 4px;">${t.quoteLabel}</p>
      <p style="font-size:15px;line-height:1.8;margin:0;color:${INK};">${esc(i.timingQuote)}</p>
    </div>` : ""}

    <p style="font-size:15px;line-height:1.9;margin:0 0 ${i.outcomeUrls ? 6 : 18}px;color:${INK};">${t.how}</p>
    ${i.outcomeUrls ? `<p style="font-size:13px;line-height:1.8;margin:0 0 18px;color:${INK_66};">${esc(t.thanks)}</p>` : ""}
    ${i.outcomeUrls ? `
    <!-- 09-26 四选一: stacked, one per row, so four answers read as a choice on a phone -->
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 28px;">
      <tr><td style="padding:0 0 10px 0;"><a href="${esc(i.outcomeUrls.hit)}" style="${BTN}padding:11px 20px;border-radius:2px;font-size:14px;">${t.hit}</a></td></tr>
      <tr><td style="padding:0 0 10px 0;"><a href="${esc(i.outcomeUrls.partial)}" style="${BTN_LINE}padding:10px 20px;border-radius:2px;font-size:14px;">${t.partial}</a></td></tr>
      <tr><td style="padding:0 0 10px 0;"><a href="${esc(i.outcomeUrls.open)}" style="${BTN_QUIET}padding:10px 20px;border-radius:2px;font-size:14px;">${t.open}</a></td></tr>
      <tr><td style="padding:0 0 10px 0;"><a href="${esc(i.outcomeUrls.miss)}" style="${BTN_QUIET}padding:10px 20px;border-radius:2px;font-size:14px;">${t.miss}</a></td></tr>
    </table>` : ""}

    <p style="margin:0 0 12px;">
      <a href="${esc(i.readingUrl)}" style="${reviewStyle}padding:${i.outcomeUrls ? "10px 24px" : "12px 26px"};border-radius:2px;font-size:14px;">${t.review}</a>
    </p>

    <p style="font-size:13px;color:${INK_66};line-height:1.8;margin:24px 0 8px;">${t.newDoor}</p>
    <p style="margin:0;">
      <a href="${esc(i.castUrl)}" style="font-size:14px;color:${INK};">${t.newCast} →</a>
    </p>${i.giftUrl ? `
    <p style="font-size:13px;line-height:1.8;margin:14px 0 0;"><a href="${esc(i.giftUrl)}" style="color:${INK_66};">${t.giftLine}</a></p>` : ""}

    <hr style="border:none;border-top:1px solid ${RULE};margin:32px 0 16px;">
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0 0 6px;">${t.why}</p>
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${t.foot}</p>
  </div>
</body>
</html>`;

  const text = [
    `${lead}: ${figureLine}`,
    "",
    `${t.asked}: ${i.question}`,
    ...(i.qianLine ? [i.qianLine] : []),
    ...(i.plan ? [base.planned.replace("{p}", i.plan)] : []),
    "",
    windowLine,
    ...(i.timingQuote ? [`${t.quoteLabel}: ${i.timingQuote}`, ""] : [""]),
    i.hint && i.ask !== "signals" ? hintLine(i.locale, "ask", i.hint) : t.how,
    ...(i.outcomeUrls ? [t.thanks, `${t.hit}: ${i.outcomeUrls.hit}`, `${t.partial}: ${i.outcomeUrls.partial}`, `${t.open}: ${i.outcomeUrls.open}`, `${t.miss}: ${i.outcomeUrls.miss}`] : []),
    "",
    `${t.review}: ${i.readingUrl}`,
    `${t.newCast}: ${i.castUrl}`,
    ...(i.giftUrl ? [`${t.giftLine} ${i.giftUrl}`] : []),
    "",
    t.why,
  ].join("\n");

  return { subject, html, text };
}

/**
 * 10-22 进度表 77 回访积压: one address, several readings whose windows have closed — ONE letter, every reading its own
 * block (the date it was asked, the question, the figure, the timing line, its own four one-tap answers and a reread
 * link), so it counts as one letter under the family cap instead of holding the queue for days. Two or more items;
 * a single one still goes through buildRevisitEmail.
 */
export interface RevisitDigestItem {
  question: string; values: readonly number[]; hexName: string; changedName: string | null;
  timingQuote: string | null; windowDays: number; readingUrl: string;
  outcomeUrls: { hit: string; partial: string; miss: string; open: string };
  ask?: "event" | "signals"; qianLine?: string | null; hint?: string | null;
  /** the day the cast was made, already in the reader's own words (「10月3日」, "Oct 3") */
  askedOn: string;
  /** 10-22 进度表 89: the reader's own plan, shown back; 进度表 80／90: the reread link's own words for a report or a free cast */
  plan?: string | null; reviewLabel?: string | null;
}
export function buildRevisitDigestEmail(i: { locale: Locale; items: RevisitDigestItem[]; castUrl: string; giftUrl?: string | null }): { subject: string; html: string; text: string } {
  const base = contentFor(REVISIT_EMAIL_T, i.locale);
  const subject = base.multiSubject.replace("{n}", String(i.items.length));
  const blocks = i.items.map((it) => {
    const t0 = it.ask === "signals" ? { ...base, how: base.howSig, hit: base.sigSeen, partial: base.sigSome, miss: base.sigNone } : base;
    const t = it.hint && it.ask !== "signals" ? { ...t0, how: esc(hintLine(i.locale, "ask", it.hint)) } : t0;
    const figureLine = it.changedName ? `${it.hexName} → ${it.changedName}` : it.hexName;
    const html = `
    <div style="border-top:1px solid ${RULE};padding:24px 0 8px;">
      <p style="font-size:12px;color:${INK_50};margin:0 0 6px;">${esc(base.askedOn.replace("{date}", it.askedOn))} · ${esc(figureLine)}</p>
      <p style="font-size:15px;color:${INK};margin:0 0 ${it.qianLine ? 6 : 14}px;line-height:1.7;">${esc(it.question)}</p>
      ${it.qianLine ? `<p style="font-size:13px;color:${INK_66};margin:0 0 14px;line-height:1.7;">${esc(it.qianLine)}</p>` : ""}
      ${it.plan ? `<p style="font-size:13px;color:${INK_66};margin:0 0 14px;line-height:1.7;">${esc(base.planned.replace("{p}", it.plan))}</p>` : ""}
      ${it.timingQuote ? `
      <div style="border-left:2px solid ${GOLD};padding-left:16px;margin:0 0 16px;">
        <p style="font-size:12px;color:${GOLD_TEXT};margin:0 0 4px;">${base.quoteLabel}</p>
        <p style="font-size:15px;line-height:1.8;margin:0;color:${INK};">${esc(it.timingQuote)}</p>
      </div>` : ""}
      <p style="font-size:14px;line-height:1.8;margin:0 0 10px;color:${INK};">${t.how}</p>
      <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 14px;">
        <tr><td style="padding:0 0 8px 0;"><a href="${esc(it.outcomeUrls.hit)}" style="${BTN}padding:10px 18px;border-radius:2px;font-size:14px;">${t.hit}</a></td></tr>
        <tr><td style="padding:0 0 8px 0;"><a href="${esc(it.outcomeUrls.partial)}" style="${BTN_LINE}padding:9px 18px;border-radius:2px;font-size:14px;">${t.partial}</a></td></tr>
        <tr><td style="padding:0 0 8px 0;"><a href="${esc(it.outcomeUrls.open)}" style="${BTN_QUIET}padding:9px 18px;border-radius:2px;font-size:14px;">${t.open}</a></td></tr>
        <tr><td style="padding:0 0 8px 0;"><a href="${esc(it.outcomeUrls.miss)}" style="${BTN_QUIET}padding:9px 18px;border-radius:2px;font-size:14px;">${t.miss}</a></td></tr>
      </table>
      <p style="margin:0 0 16px;"><a href="${esc(it.readingUrl)}" style="font-size:13px;color:${INK_66};">${esc(it.reviewLabel ?? base.review)} →</a></p>
    </div>`;
    const text = [
      `${base.askedOn.replace("{date}", it.askedOn)} · ${figureLine}`,
      it.question,
      ...(it.qianLine ? [it.qianLine] : []),
      ...(it.plan ? [base.planned.replace("{p}", it.plan)] : []),
      ...(it.timingQuote ? [`${base.quoteLabel}: ${it.timingQuote}`] : []),
      it.hint && it.ask !== "signals" ? hintLine(i.locale, "ask", it.hint) : t0.how,
      `${t.hit}: ${it.outcomeUrls.hit}`, `${t.partial}: ${it.outcomeUrls.partial}`, `${t.open}: ${it.outcomeUrls.open}`, `${t.miss}: ${it.outcomeUrls.miss}`,
      `${it.reviewLabel ?? base.review}: ${it.readingUrl}`,
      "",
    ];
    return { html, text };
  });
  const html = `<!doctype html>
<html lang="${htmlLang(i.locale)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BODY}">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:${INK_50};margin:0 0 28px;">YaoFlow</p>
    <p style="font-size:20px;line-height:1.5;margin:0 0 10px;color:${INK};">${esc(subject)}</p>
    <p style="font-size:14px;color:${INK_86};line-height:1.8;margin:0 0 8px;">${esc(base.multiLead)}</p>
    <p style="font-size:13px;line-height:1.8;margin:0 0 20px;color:${INK_66};">${esc(base.thanks)}</p>
    ${blocks.map((b) => b.html).join("\n")}
    <p style="font-size:13px;color:${INK_66};line-height:1.8;margin:24px 0 8px;">${base.newDoor}</p>
    <p style="margin:0;"><a href="${esc(i.castUrl)}" style="font-size:14px;color:${INK};">${base.newCast} →</a></p>${i.giftUrl ? `
    <p style="font-size:13px;line-height:1.8;margin:14px 0 0;"><a href="${esc(i.giftUrl)}" style="color:${INK_66};">${base.giftLine}</a></p>` : ""}
    <hr style="border:none;border-top:1px solid ${RULE};margin:32px 0 16px;">
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0 0 6px;">${base.why}</p>
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${base.foot}</p>
  </div>
</body>
</html>`;
  const text = [subject, "", base.multiLead, base.thanks, "", ...blocks.flatMap((b) => b.text), `${base.newCast}: ${i.castUrl}`, ...(i.giftUrl ? [`${base.giftLine} ${i.giftUrl}`] : []), "", base.why].join("\n");
  return { subject, html, text };
}

/**
 * 10-22 进度表 80 看自己的回訪: the day a report's (or a picked day's) revisit comes — what the reader set as the result,
 * the same four one-tap answers, and the way back to the report. Chinese products; the buttons' words come from the
 * revisit letter's dictionary so the reader sees the same four everywhere.
 */
export function buildSelfRevisitEmail(i: { locale: Locale; kind?: "bazi" | "ziwei" | "astro" | "nianshu" | "zeri" | "cast"; label: string; hint: string | null; plan?: string | null; reportUrl: string; castUrl: string; outcomeUrls: { hit: string; partial: string; miss: string; open: string } }): { subject: string; html: string; text: string } {
  const t = contentFor(REVISIT_EMAIL_T, i.locale);
  // 10-30 进度表 128 ④: the letter's own lines in every language (lib/self-revisit-text.ts; 简体 converted there) — the
  // label and the hint arrive in the reader's own words already
  const m = selfRevText(i.locale).mail, rv = selfRevText(i.locale).review;
  // the reader's own words (the label's question, the plan) follow the 简体 page's script, as before
  const z = (s: string) => (i.locale === "zh" ? toHans(s) : s);
  const subject = m.subject.replace("{label}", z(i.label));
  // 10-22 进度表 80: who asked for this letter — the reader on the report page, the 年書's key month, or the day they picked
  const kind = i.kind ?? "bazi";
  const lead = kind === "nianshu" ? m.leadNianshu : kind === "zeri" ? m.leadZeri : kind === "cast" ? m.leadCast : m.leadReport;
  // 10-22 进度表 85: a paid report asks by default — the letter says so, and where to change or stop it
  const why = kind === "nianshu" ? m.whyNianshu : kind === "zeri" ? m.whyZeri : kind === "cast" ? m.whyCast : m.whyReport;
  const thanks = m.thanks;
  const back = kind === "nianshu" ? rv.nianshu : kind === "zeri" ? rv.zeri : kind === "cast" ? rv.cast : rv.report;
  const planLine = i.plan ? m.plan.replace("{p}", z(i.plan)) : null;
  const how = i.hint ? hintLine(i.locale, "ask", i.hint) : t.how;
  const html = `<!doctype html>
<html lang="${htmlLang(i.locale)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BODY}">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:${INK_50};margin:0 0 32px;">YaoFlow</p>
    <p style="font-size:12px;color:${INK_50};margin:0 0 10px;">${esc(lead)}</p>
    <p style="font-size:20px;line-height:1.5;color:${INK};margin:0 0 ${planLine ? 8 : 24}px;">${esc(z(i.label))}</p>
    ${planLine ? `<p style="font-size:13px;line-height:1.7;color:${INK_66};margin:0 0 24px;">${esc(planLine)}</p>` : ""}
    <p style="font-size:15px;line-height:1.9;margin:0 0 6px;color:${INK};">${esc(how)}</p>
    <p style="font-size:13px;line-height:1.8;margin:0 0 18px;color:${INK_66};">${esc(thanks)}</p>
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 28px;">
      <tr><td style="padding:0 0 10px 0;"><a href="${esc(i.outcomeUrls.hit)}" style="${BTN}padding:11px 20px;border-radius:2px;font-size:14px;">${t.hit}</a></td></tr>
      <tr><td style="padding:0 0 10px 0;"><a href="${esc(i.outcomeUrls.partial)}" style="${BTN_LINE}padding:10px 20px;border-radius:2px;font-size:14px;">${t.partial}</a></td></tr>
      <tr><td style="padding:0 0 10px 0;"><a href="${esc(i.outcomeUrls.open)}" style="${BTN_QUIET}padding:10px 20px;border-radius:2px;font-size:14px;">${t.open}</a></td></tr>
      <tr><td style="padding:0 0 10px 0;"><a href="${esc(i.outcomeUrls.miss)}" style="${BTN_QUIET}padding:10px 20px;border-radius:2px;font-size:14px;">${t.miss}</a></td></tr>
    </table>
    <p style="margin:0 0 12px;"><a href="${esc(i.reportUrl)}" style="${BTN_LINE}padding:10px 24px;border-radius:2px;font-size:14px;">${esc(back)}</a></p>
    ${kind === "cast" ? "" : `<p style="font-size:13px;color:${INK_66};line-height:1.8;margin:24px 0 8px;">${t.newDoor}</p>
    <p style="margin:0;"><a href="${esc(i.castUrl)}" style="font-size:14px;color:${INK};">${t.newCast} →</a></p>`}
    <hr style="border:none;border-top:1px solid ${RULE};margin:32px 0 16px;">
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0 0 6px;">${esc(why)}</p>
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${t.foot}</p>
  </div>
</body>
</html>`;
  const text = [lead, i.label, ...(planLine ? [planLine] : []), "", how, thanks, `${t.hit}: ${i.outcomeUrls.hit}`, `${t.partial}: ${i.outcomeUrls.partial}`, `${t.open}: ${i.outcomeUrls.open}`, `${t.miss}: ${i.outcomeUrls.miss}`, "", `${back}: ${i.reportUrl}`, `${t.newCast}: ${i.castUrl}`, "", why].join("\n");
  return { subject, html, text };
}

/**
 * The magic-link email. Paper ground like every other email. One button; the same URL again as a styled
 * link under a "copy this" line, so it can be carried to another device and
 * so Gmail cannot auto-link it in its own dark blue; and a footer that says
 * which address it was sent to and why — the line that lets someone who
 * never asked for it understand what happened.
 */
export function buildLoginEmail(locale: Locale, link: string, email: string, stamp?: string, code?: string): { subject: string; html: string; text: string } {
  // 09-26 (dispute review): a member asked for ten links and kept opening an old, expired one — mail apps thread
  // identical subjects and show the first. A time in the subject makes every link its own, newest on top.
  // 10-02 登录码: the code leads the subject too, so it can be read off the notification without leaving the app
  const base = contentFor(LOGIN_EMAIL_T, locale);
  const subject0 = stamp ? `${base.subject} · ${stamp}` : base.subject;
  const t = { ...base, subject: code ? `${code} · ${subject0}` : subject0 };
  const codeBlock = code
    ? `<p style="font-size:13px;color:${INK_66};margin:0 0 6px;">${esc(lc(locale, "mailLabel"))}</p>
    <p style="font-size:30px;letter-spacing:.32em;font-family:ui-monospace,Menlo,Consolas,monospace;margin:0 0 10px;">${esc(code)}</p>
    <p style="font-size:13px;line-height:1.7;color:${INK_66};margin:0 0 28px;">${esc(lc(locale, "mailHow"))}</p>`
    : "";
  const sentTo = t.sentTo.replace("{email}", email);
  const html = `<!doctype html>
<html lang="${htmlLang(locale)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BODY}">
  <div style="max-width:560px;margin:0 auto;padding:44px 24px 40px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:${INK_50};margin:0 0 36px;">YaoFlow</p>
    <p style="font-size:22px;line-height:1.4;margin:0 0 12px;">${t.title}</p>
    <p style="font-size:15px;line-height:1.8;color:${INK_86};margin:0 0 28px;">${t.lead}</p>
    ${codeBlock}
    <a href="${esc(link)}" style="${BTN}padding:13px 30px;border-radius:999px;font-size:15px;">${t.cta}</a>
    <p style="font-size:13px;line-height:1.8;color:${INK_66};margin:28px 0 0;">${t.expires}<br>${t.ignore}</p>
    <hr style="border:none;border-top:1px solid ${RULE};margin:36px 0 18px;">
    <p style="font-size:12px;line-height:1.7;color:${INK_50};margin:0 0 10px;">${t.fallback}<br><a href="${esc(link)}" style="color:${INK_50};word-break:break-all;">${esc(link)}</a></p>
    <p style="font-size:12px;line-height:1.7;color:${INK_50};margin:0;">${esc(sentTo)}</p>
  </div>
</body>
</html>`;
  const text = [t.title, "", t.lead, ...(code ? ["", `${lc(locale, "mailLabel")}: ${code}`, lc(locale, "mailHow")] : []), "", `${t.cta}: ${link}`, "", t.expires, t.ignore, "", sentTo].join("\n");
  return { subject: t.subject, html, text };
}

/* ---------------- refund notice (09-10) ---------------- */

export type RefundReason = "technical_failure" | "duplicate" | "requested" | "other" | "guarantee";

/**
 * Sent the moment a refund is issued — by the admin button, by the
 * fulfilment sweep giving up, or when Stripe/Link refunds on our behalf.
 * Paper ground like every email; one plain paragraph, no button: there is
 * nothing to do.
 *
 * 10-23 进度表 111 ②: a part of a payment says so (it used to say 「全額退回」 for any amount); the line after the
 * money says what became of what was paid for — a reading (「這一卦不必重新起」), something else bought once (no line),
 * a 通卡 (ended with a full refund; carries on after a part), a membership (ended / until a day / renews as before).
 */
export type RefundWhat = "reading" | "other" | "pass_ended" | "pass_keeps" | "member_ended" | "member_until" | "member_renews";

export function buildRefundEmail(i: { locale: Locale; amountLabel: string; reason: RefundReason; partial?: boolean; what?: RefundWhat; until?: string | null }): { subject: string; html: string; text: string } {
  const t = contentFor(REFUND_EMAIL_T, i.locale);
  const title = t.title.replace("{amount}", i.amountLabel);
  const lead = (i.partial ? t.leadPartial.replace("{amount}", i.amountLabel) : t.lead).replace("{reason}", t.reasons[i.reason] ?? "");
  const what: RefundWhat = i.what ?? (i.partial ? "other" : "reading");
  const u = (x: string) => x.replace("{until}", i.until ?? "");
  const after = what === "reading" ? t.again
    : what === "pass_ended" ? t.passEnded
    : what === "pass_keeps" && i.until ? u(t.passKeeps)
    : what === "member_ended" ? t.memberEnded
    : what === "member_until" && i.until ? u(t.memberUntil)
    : what === "member_renews" && i.until ? u(t.memberRenews)
    : "";
  const html = `<!doctype html>
<html lang="${htmlLang(i.locale)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BODY}">
  <div style="max-width:560px;margin:0 auto;padding:44px 24px 40px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:${INK_50};margin:0 0 36px;">YaoFlow</p>
    <p style="font-size:22px;line-height:1.4;margin:0 0 12px;">${esc(title)}</p>
    <p style="font-size:15px;line-height:1.8;color:${INK_86};margin:0 0 18px;">${esc(lead)}</p>
    <p style="font-size:14px;line-height:1.8;color:${INK_66};margin:0 0 18px;">${esc(t.when)}</p>${after ? `
    <p style="font-size:14px;line-height:1.8;color:${INK_66};margin:0 0 6px;">${esc(after)}</p>` : ""}
    <p style="font-size:14px;line-height:1.8;color:${INK_66};margin:0;">${esc(t.help)}</p>
    <hr style="border:none;border-top:1px solid ${RULE};margin:36px 0 18px;">
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(t.foot)}</p>
  </div>
</body>
</html>`;
  const text = [title, "", lead, t.when, "", ...(after ? [after] : []), t.help, "", t.foot].join("\n");
  return { subject: t.subject, html, text };
}

/* ---------------- 同题合参: the other side has cast (09-10) ---------------- */

export function buildPairEmail(i: { locale: Locale; framing: string; url: string }): { subject: string; html: string; text: string } {
  const t = contentFor(PAIR_EMAIL_T, i.locale);
  const lead = t.lead.replace("{framing}", i.framing);
  const html = `<!doctype html>
<html lang="${htmlLang(i.locale)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BODY}">
  <div style="max-width:560px;margin:0 auto;padding:44px 24px 40px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:${INK_50};margin:0 0 36px;">YaoFlow</p>
    <p style="font-size:15px;line-height:1.9;margin:0 0 12px;color:${INK};">${esc(lead)}</p>
    <p style="font-size:15px;line-height:1.9;margin:0 0 28px;color:${INK_86};">${esc(t.body)}</p>
    <p style="margin:0 0 16px;"><a href="${esc(i.url)}" style="${BTN}padding:12px 26px;border-radius:2px;font-size:14px;">${esc(t.cta)}</a></p>
    <p style="font-size:12px;color:${INK_66};line-height:1.7;margin:0 0 32px;">${esc(t.note)}</p>
    <hr style="border:none;border-top:1px solid ${RULE};margin:0 0 16px;">
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(t.foot)}</p>
  </div>
</body>
</html>`;
  const text = [lead, t.body, "", `${t.cta}: ${i.url}`, t.note, "", t.foot].join("\n");
  return { subject: t.subject, html, text };
}

/* ---------------- launch mail #1 (09-10, sent once per opted-in customer) ---------------- */

export function buildLaunchEmail(i: { locale: Locale; priceLabel: string; accountUrl: string; castUrl: string; unsubUrl: string; hadDeep?: boolean }): { subject: string; html: string; text: string } {
  const t = contentFor(LAUNCH_EMAIL_T, i.locale);
  // 09-21: "you already claimed a deep reading" is only said to people who did; the rest hear they haven't tried one yet
  const firstPrice = (i.hadDeep === false ? t.firstPriceNew : t.firstPrice).replace("{price}", i.priceLabel);
  const html = `<!doctype html>
<html lang="${htmlLang(i.locale)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BODY}">
  <div style="max-width:560px;margin:0 auto;padding:44px 24px 40px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:${INK_50};margin:0 0 36px;">YaoFlow</p>
    <p style="font-size:22px;line-height:1.4;margin:0 0 16px;">${esc(t.title)}</p>
    <p style="font-size:15px;line-height:1.8;color:${INK_86};margin:0 0 14px;">${esc(t.thanks)}</p>
    <p style="font-size:15px;line-height:1.8;color:${INK_86};margin:0 0 14px;">${esc(t.open)}</p>
    <div style="border-left:2px solid ${GOLD};padding-left:16px;margin:0 0 22px;">
      <p style="font-size:15px;line-height:1.8;margin:0;color:${INK};">${esc(firstPrice)}</p>
    </div>
    <p style="font-size:15px;line-height:1.8;color:${INK_86};margin:0 0 20px;">${esc(t.revisit)}</p>
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 28px;"><tr>
      <td style="padding:0 10px 10px 0;"><a href="${esc(i.accountUrl)}" style="${BTN}padding:12px 24px;border-radius:2px;font-size:14px;">${esc(t.account)}</a></td>
      <td style="padding:0 0 10px 0;"><a href="${esc(i.castUrl)}" style="${BTN_LINE}padding:11px 24px;border-radius:2px;font-size:14px;">${esc(t.cast)}</a></td>
    </tr></table>
    <p style="font-size:13px;line-height:1.8;color:${INK_66};margin:0 0 6px;">${esc(t.last)}</p>
    <p style="font-size:13px;line-height:1.8;margin:0;"><a href="${esc(i.unsubUrl)}" style="color:${INK_66};">${esc(t.unsub)}</a></p>
    <hr style="border:none;border-top:1px solid ${RULE};margin:36px 0 18px;">
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(t.foot)}</p>
  </div>
</body>
</html>`;
  const text = [t.title, "", t.thanks, "", t.open, "", firstPrice, "", t.revisit, "", `${t.account}: ${i.accountUrl}`, `${t.cast}: ${i.castUrl}`, "", t.last, `${t.unsub}: ${i.unsubUrl}`, "", t.foot].join("\n");
  return { subject: t.subject, html, text };
}

/* ---------------- 10-13 解籤上线信 (Neil: 「草稿就可以了，你设置去发吧」) ---------------- */

/** 繁體 only — the lots are a 繁體 feature. Sent once, only to readers who kept 「告訴我新功能和動態」 ticked. */
export function buildQianLaunchEmail(i: { url: string; unsubUrl: string }): { subject: string; html: string; text: string } {
  const subject = "在廟裡求了籤，看不懂籤詩？";
  const lead = "之前你在 YaoFlow 問過一件事。現在也能解籤了：";
  const items = [
    "輸入籤號和你想問的事，就能看這支籤的白話、放在感情或工作上怎麼讀，和放在你這件事上的專屬解讀：六十甲子籤、關帝、觀音、媽祖、月老、黃大仙等 14 套都有。",
    "不知道是哪一套籤？拍一張籤詩，我們幫你找出是哪一首。",
    "想知道事情落在哪幾天，帶著同一個問題起一卦。籤給方向，卦給日子，到那幾天我們會回來問你。",
    // 10-13 (Neil: 「在发的邮件上面也写明这个包含在会员权益里面吧」)
    "已經是會員的話，解籤包含在會員權益裡，不另收費。不是會員，一次輕解讀的價格，含一次追問。",
  ];
  const cta = "看我的籤";
  const unsub = "不想再收到這類信，點這裡退訂。";
  const foot = "你收到這封信，是因為留下信箱時勾選了「告訴我新功能和動態」。";
  const html = `<!doctype html>
<html lang="zh-Hant">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BODY}">
  <div style="max-width:560px;margin:0 auto;padding:44px 24px 40px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:${INK_50};margin:0 0 36px;">YaoFlow</p>
    <p style="font-size:22px;line-height:1.4;margin:0 0 16px;">${esc(subject)}</p>
    <p style="font-size:15px;line-height:1.8;color:${INK_86};margin:0 0 14px;">${esc(lead)}</p>
    ${items.map((x) => `<div style="border-left:2px solid ${GOLD};padding-left:16px;margin:0 0 12px;"><p style="font-size:15px;line-height:1.8;margin:0;color:${INK};">${esc(x)}</p></div>`).join("\n    ")}
    <p style="margin:24px 0 28px;"><a href="${esc(i.url)}" style="${BTN}padding:12px 26px;border-radius:2px;font-size:14px;">${esc(cta)}</a></p>
    <p style="font-size:13px;line-height:1.8;margin:0;"><a href="${esc(i.unsubUrl)}" style="color:${INK_66};">${esc(unsub)}</a></p>
    <hr style="border:none;border-top:1px solid ${RULE};margin:36px 0 18px;">
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(foot)}</p>
  </div>
</body>
</html>`;
  const text = [subject, "", lead, "", ...items.map((x) => `· ${x}`), "", `${cta}: ${i.url}`, "", `${unsub} ${i.unsubUrl}`, "", foot].join("\n");
  return { subject, html, text };
}

/* ---------------- 封卦揭晓 (09-21, A1: the one letter a watcher asked for) ---------------- */

export function buildSealEmail(i: { locale: Locale; hexName: string; timingQuote: string | null; hit: boolean; sealUrl: string; castUrl: string }): { subject: string; html: string; text: string } {
  const t = contentFor(SEAL_EMAIL_T, i.locale);
  const subject = t.subject.replace("{hex}", i.hexName);
  const verdict = i.hit ? t.hit : t.miss;
  const html = `<!doctype html>
<html lang="${htmlLang(i.locale)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BODY}">
  <div style="max-width:560px;margin:0 auto;padding:44px 24px 40px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:${INK_50};margin:0 0 32px;">YaoFlow</p>
    <p style="font-size:22px;line-height:1.4;margin:0 0 16px;">${esc(t.title)}</p>
    <p style="font-size:15px;line-height:1.8;color:${INK_86};margin:0 0 20px;">${esc(t.lead)}</p>
    ${i.timingQuote ? `
    <div style="border-left:2px solid ${GOLD};padding-left:16px;margin:0 0 20px;">
      <p style="font-size:12px;color:${GOLD_TEXT};margin:0 0 4px;">${esc(t.said)}</p>
      <p style="font-size:15px;line-height:1.8;margin:0;color:${INK};">${esc(i.timingQuote)}</p>
    </div>` : ""}
    <p style="font-size:17px;line-height:1.7;margin:0 0 24px;color:${i.hit ? CINNABAR : INK};">${esc(verdict)}</p>
    <p style="margin:0 0 26px;"><a href="${esc(i.sealUrl)}" style="${BTN}padding:12px 26px;border-radius:2px;font-size:14px;">${esc(t.cta)}</a></p>
    <p style="font-size:14px;line-height:1.8;color:${INK_66};margin:0 0 8px;">${esc(t.askLead)}</p>
    <p style="margin:0 0 26px;"><a href="${esc(i.castUrl)}" style="font-size:14px;color:${INK};">${esc(t.ask)} →</a></p>
    <hr style="border:none;border-top:1px solid ${RULE};margin:0 0 16px;">
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0 0 6px;">${esc(t.last)}</p>
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(t.foot)}</p>
  </div>
</body>
</html>`;
  const text = [t.title, "", t.lead, "", ...(i.timingQuote ? [`${t.said}: ${i.timingQuote}`, ""] : []), verdict, "", `${t.cta}: ${i.sealUrl}`, `${t.ask}: ${i.castUrl}`, "", t.last, "", t.foot].join("\n");
  return { subject, html, text };
}



/* ---------------- 挽回 (09-23): cancellation receipt, and the one letter before the end ---------------- */

export type RetainLetter = "confirm" | "winback" | "reminder";

export interface RetainEmailInput {
  locale: Locale;
  letter: RetainLetter;
  /** the day it ends, already formatted for the reader */
  date: string;
  /** 10-22 进度表 93: no longer said (a member has no allowance under the 通卡 model); kept so older callers still type */
  deepLeft?: number | null;
  resumeUrl: string;
  /** 10-22 进度表 93: the confirmation ends with 「之後有事再來，買通卡就好」 — where the passes are */
  passUrl?: string | null;
  /** winback only */
  pauseUrl?: string | null;
  yearUrl?: string | null;
  yearPrice?: string | null;
  yearPct?: number | null;
  castUrl: string;
  /** 09-25 合规: the winback letter is commercial mail — it carries a one-click unsubscribe */
  unsubUrl?: string | null;
  /** 09-30 续订专属: renewal-only perks stopped with this cancellation — the letters say resuming brings them back */
  perksBack?: boolean;
}

export function buildRetainEmail(i: RetainEmailInput): { subject: string; html: string; text: string } {
  const t = contentFor(RETAIN_T, i.locale);
  const fill = (x: string) => x.replace(/\{date\}/g, i.date)
    .replace(/\{price\}/g, i.yearPrice ?? "").replace(/\{pct\}/g, String(i.yearPct ?? ""));
  const p = (x: string, color = INK_86, size = 15) => `<p style="font-size:${size}px;line-height:1.8;color:${color};margin:0 0 16px;">${esc(x)}</p>`;
  const btn = (href: string, label: string, style = BTN) => `<p style="margin:0 0 10px;"><a href="${esc(href)}" style="${style}padding:12px 26px;border-radius:2px;font-size:14px;">${esc(label)}</a></p>`;

  let subject: string, title: string, body: string, text: string[];
  if (i.letter === "confirm") {
    // 10-22 进度表 93: until the end everything carries on; after it, what stays and what stops; the tap back; a pass later
    subject = fill(t.confirmSubject); title = t.confirmTitle;
    body = p(fill(t.confirmLead)) + p(fill(t.endNote), INK_66, 14) +
      `<hr style="border:none;border-top:1px solid ${RULE};margin:8px 0 20px;">` +
      p(t.resumeLead, INK_66, 14) + btn(i.resumeUrl, t.resume, BTN_LINE) + p(t.resumeNote, INK_50, 12) +
      (i.perksBack ? p(t.perksBack, INK_50, 12) : "") +
      (i.passUrl ? `<p style="font-size:13px;line-height:1.8;color:${INK_66};margin:14px 0 0;">${esc(t.passLater)} <a href="${esc(i.passUrl)}" style="color:${INK_66};">${esc(t.passGo)} →</a></p>` : "");
    text = [title, "", fill(t.confirmLead), fill(t.endNote), "", t.resumeLead, `${t.resume}: ${i.resumeUrl}`, t.resumeNote, ...(i.perksBack ? [t.perksBack] : []), ...(i.passUrl ? ["", `${t.passLater} ${t.passGo}: ${i.passUrl}`] : [])];
  } else if (i.letter === "winback") {
    subject = fill(t.winSubject); title = t.winTitle;
    body = p(fill(t.winLead)) +
      (i.pauseUrl ? btn(i.pauseUrl, t.pause) + p(t.pauseNote, INK_66, 13) : "") +
      (i.yearUrl ? btn(i.yearUrl, t.year, BTN_LINE) + p(fill(t.yearNote), INK_66, 13) : "") +
      p(t.orEnd, INK_66, 14) +
      (i.perksBack ? p(t.perksBack, INK_66, 13) : "") +
      `<p style="margin:0 0 20px;"><a href="${esc(i.resumeUrl)}" style="font-size:13px;color:${INK_66};">${esc(t.resume)} →</a></p>`;
    text = [title, "", fill(t.winLead), "",
      ...(i.pauseUrl ? [`${t.pause}: ${i.pauseUrl}`, t.pauseNote, ""] : []),
      ...(i.yearUrl ? [`${t.year}: ${i.yearUrl}`, fill(t.yearNote), ""] : []),
      t.orEnd, ...(i.perksBack ? [t.perksBack] : []), `${t.resume}: ${i.resumeUrl}`];
  } else {
    subject = fill(t.remSubject); title = t.remTitle;
    body = p(fill(t.remLead)) + btn(i.castUrl, t.use) + (i.perksBack ? p(t.perksBack, INK_66, 13) : "") +
      `<p style="margin:14px 0 20px;"><a href="${esc(i.resumeUrl)}" style="font-size:13px;color:${INK_66};">${esc(t.resume)} →</a></p>`;
    text = [title, "", fill(t.remLead), "", `${t.use}: ${i.castUrl}`, ...(i.perksBack ? [t.perksBack] : []), `${t.resume}: ${i.resumeUrl}`];
  }
  const last = i.letter === "confirm" ? null : t.last;
  const foot = contentFor(SEAL_EMAIL_T, i.locale).foot;
  const html = `<!doctype html>
<html lang="${htmlLang(i.locale)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BODY}">
  <div style="max-width:560px;margin:0 auto;padding:44px 24px 40px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:${INK_50};margin:0 0 32px;">YaoFlow</p>
    <p style="font-size:22px;line-height:1.4;margin:0 0 16px;">${esc(title)}</p>
    ${body}
    <hr style="border:none;border-top:1px solid ${RULE};margin:16px 0 16px;">
    ${last ? `<p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0 0 6px;">${esc(last)}</p>` : ""}${i.unsubUrl && i.letter === "winback" ? `
    <p style="font-size:11px;line-height:1.6;margin:0 0 6px;"><a href="${esc(i.unsubUrl)}" style="color:${INK_50};">${esc(contentFor(LAUNCH_EMAIL_T, i.locale).unsub)}</a></p>` : ""}
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(foot)}</p>
  </div>
</body>
</html>`;
  return { subject, html, text: [...text, "", ...(last ? [last] : []), ...(i.unsubUrl && i.letter === "winback" ? [`${contentFor(LAUNCH_EMAIL_T, i.locale).unsub}: ${i.unsubUrl}`] : []), foot].join("\n") };
}


/* ---------------- 年付续费预告 (09-25 合规): ~30 days before a yearly plan renews ---------------- */

export function buildRenewEmail(i: { locale: Locale; date: string; price: string; manageUrl: string }): { subject: string; html: string; text: string } {
  const t = contentFor(RENEW_T, i.locale);
  const fill = (x: string) => x.replace(/\{date\}/g, i.date).replace(/\{price\}/g, i.price);
  const p = (x: string, color = INK_86, size = 15) => `<p style="font-size:${size}px;line-height:1.8;color:${color};margin:0 0 16px;">${esc(x)}</p>`;
  const foot = contentFor(SEAL_EMAIL_T, i.locale).foot;
  const html = `<!doctype html>
<html lang="${htmlLang(i.locale)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BODY}">
  <div style="max-width:560px;margin:0 auto;padding:44px 24px 40px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:${INK_50};margin:0 0 32px;">YaoFlow</p>
    <p style="font-size:22px;line-height:1.4;margin:0 0 16px;">${esc(t.title)}</p>
    ${p(fill(t.lead))}
    ${p(fill(t.keep), INK_66, 14)}
    <p style="margin:0 0 18px;"><a href="${esc(i.manageUrl)}" style="${BTN_LINE}padding:12px 26px;border-radius:2px;font-size:14px;">${esc(t.manage)}</a></p>
    ${p(t.note, INK_50, 12)}
    <hr style="border:none;border-top:1px solid ${RULE};margin:16px 0 16px;">
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(foot)}</p>
  </div>
</body>
</html>`;
  return { subject: fill(t.subject), html, text: [t.title, "", fill(t.lead), "", fill(t.keep), `${t.manage}: ${i.manageUrl}`, "", t.note, "", foot].join("\n") };
}

/* ---------------- 应期提醒 (09-23): before the window, about the reader's own casts ---------------- */

export interface HeadsUpItem { question: string; hexName: string; timing: string; nextDate: string | null; readingUrl: string }

export function buildHeadsUpEmail(i: { locale: Locale; mode: "week" | "all"; items: HeadsUpItem[]; castUrl: string; stopUrl: string }): { subject: string; html: string; text: string } {
  const t = contentFor(HEADSUP_T, i.locale);
  const subject = i.mode === "all" ? t.subjectAll : i.items.length > 1 ? t.subjectMany.replace("{n}", String(i.items.length)) : t.subjectOne;
  const title = i.mode === "all" ? t.titleAll : t.title;
  const lead = i.mode === "week" ? t.leadWeek : t.leadAll;
  const cjk = LOCALE_META[i.locale].cjk;
  const [qo, qc, colon] = cjk ? ["「", "」", "："] : ["“", "”", ": "];
  const blocks = i.items.map((it) => `
    <div style="border-top:1px solid ${RULE};padding:18px 0 4px;">
      <p style="font-size:17px;line-height:1.6;margin:0 0 6px;color:${INK};">${qo}${esc(it.question)}${qc}</p>
      <p style="font-size:13px;color:${INK_50};margin:0 0 10px;">${esc(it.hexName)}</p>
      <div style="border-left:2px solid ${GOLD};padding-left:14px;margin:0 0 10px;">
        <p style="font-size:12px;color:${GOLD_TEXT};margin:0 0 4px;">${esc(t.timing)}</p>
        <p style="font-size:15px;line-height:1.8;margin:0;color:${INK_86};">${esc(it.timing)}</p>
      </div>
      ${it.nextDate ? `<p style="font-size:13px;color:${INK_66};margin:0 0 12px;">${esc(t.next)}${colon}${esc(it.nextDate)}</p>` : ""}
      <p style="margin:0 0 14px;"><a href="${esc(it.readingUrl)}" style="${BTN_LINE}padding:10px 22px;border-radius:2px;font-size:13px;">${esc(t.open)}</a></p>
    </div>`).join("");
  const html = `<!doctype html>
<html lang="${htmlLang(i.locale)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BODY}">
  <div style="max-width:560px;margin:0 auto;padding:44px 24px 40px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:${INK_50};margin:0 0 32px;">YaoFlow</p>
    <p style="font-size:22px;line-height:1.4;margin:0 0 16px;">${esc(title)}</p>
    <p style="font-size:15px;line-height:1.8;color:${INK_86};margin:0 0 20px;">${esc(lead)}</p>
    ${blocks}
    <p style="margin:18px 0 26px;"><a href="${esc(i.castUrl)}" style="font-size:14px;color:${INK};">${esc(t.ask)} →</a></p>
    <hr style="border:none;border-top:1px solid ${RULE};margin:0 0 16px;">
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0 0 6px;">${esc(t.foot)} <a href="${esc(i.stopUrl)}" style="color:${INK_50};">${esc(t.stop)}</a></p>
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(contentFor(SEAL_EMAIL_T, i.locale).foot)}</p>
  </div>
</body>
</html>`;
  const text = [title, "", lead, "",
    ...i.items.flatMap((it) => [`${qo}${it.question}${qc}`, it.hexName, `${t.timing}${colon}${it.timing}`, ...(it.nextDate ? [`${t.next}${colon}${it.nextDate}`] : []), `${t.open}: ${it.readingUrl}`, ""]),
    `${t.ask}: ${i.castUrl}`, "", `${t.foot} ${t.stop}: ${i.stopUrl}`, contentFor(SEAL_EMAIL_T, i.locale).foot].join("\n");
  return { subject, html, text };
}

/* ---------------- 应期当天 (09-23): the short letter on the first named day ---------------- */

export interface DayOfItem { question: string; hexName: string; timing: string; signals: string | null; readingUrl: string; noteUrl: string; /** 10-14 进度表 46 */ hint?: string | null }

export function buildDayOfEmail(i: { locale: Locale; item: DayOfItem; stopUrl: string }): { subject: string; html: string; text: string } {
  const t = contentFor(HEADSUP_T, i.locale);
  const it = i.item;
  const cjk = LOCALE_META[i.locale].cjk;
  const [qo, qc, colon] = cjk ? ["「", "」", "："] : ["“", "”", ": "];
  const html = `<!doctype html>
<html lang="${htmlLang(i.locale)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BODY}">
  <div style="max-width:560px;margin:0 auto;padding:44px 24px 40px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:${INK_50};margin:0 0 32px;">YaoFlow</p>
    <p style="font-size:22px;line-height:1.4;margin:0 0 16px;">${esc(t.dayTitle)}</p>
    <p style="font-size:15px;line-height:1.8;color:${INK_86};margin:0 0 20px;">${esc(t.dayLead)}</p>
    <div style="border-top:1px solid ${RULE};padding:18px 0 4px;">
      <p style="font-size:17px;line-height:1.6;margin:0 0 6px;color:${INK};">${qo}${esc(it.question)}${qc}</p>
      <p style="font-size:13px;color:${INK_50};margin:0 0 10px;">${esc(it.hexName)}</p>
      <div style="border-left:2px solid ${GOLD};padding-left:14px;margin:0 0 12px;">
        <p style="font-size:12px;color:${GOLD_TEXT};margin:0 0 4px;">${esc(t.timing)}</p>
        <p style="font-size:15px;line-height:1.8;margin:0;color:${INK_86};">${esc(it.timing)}</p>
      </div>
      ${it.signals ? `<div style="border-left:2px solid ${GOLD};padding-left:14px;margin:0 0 12px;">
        <p style="font-size:12px;color:${GOLD_TEXT};margin:0 0 4px;">${esc(t.dayWatch)}</p>
        <p style="font-size:15px;line-height:1.8;margin:0;color:${INK_86};">${esc(it.signals)}</p>
      </div>` : ""}
      ${it.hint ? `<p style="font-size:15px;line-height:1.8;color:${INK};margin:0 0 12px;">${esc(hintLine(i.locale, "day", it.hint))}</p>` : ""}
      <p style="font-size:13px;line-height:1.7;color:${INK_66};margin:0 0 16px;">${esc(t.dayQuiet)}</p>
      <p style="margin:0 0 10px;"><a href="${esc(it.noteUrl)}" style="${BTN_LINE}padding:10px 22px;border-radius:2px;font-size:13px;">${esc(t.dayNote)}</a></p>
      <p style="margin:0 0 18px;"><a href="${esc(it.readingUrl)}" style="font-size:13px;color:${INK_66};">${esc(t.open)} →</a></p>
    </div>
    <hr style="border:none;border-top:1px solid ${RULE};margin:8px 0 16px;">
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0 0 6px;">${esc(t.foot)} <a href="${esc(i.stopUrl)}" style="color:${INK_50};">${esc(t.stop)}</a></p>
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(contentFor(SEAL_EMAIL_T, i.locale).foot)}</p>
  </div>
</body>
</html>`;
  const text = [t.dayTitle, "", t.dayLead, "", `${qo}${it.question}${qc}`, it.hexName, `${t.timing}${colon}${it.timing}`,
    ...(it.signals ? [`${t.dayWatch}${colon}${it.signals}`] : []), ...(it.hint ? ["", hintLine(i.locale, "day", it.hint)] : []), "", t.dayQuiet, "",
    `${t.dayNote}: ${it.noteUrl}`, `${t.open}: ${it.readingUrl}`, "", `${t.foot} ${t.stop}: ${i.stopUrl}`, contentFor(SEAL_EMAIL_T, i.locale).foot].join("\n");
  return { subject: t.daySubject, html, text };
}

/* ---------------- 多段应期 (10-12): the check-in after an earlier window ---------------- */

export interface CheckpointEmailInput {
  locale: Locale; question: string; hexName: string; timingQuote: string | null;
  /** this stretch and the reading's last one, already formatted */
  range: string; next: string;
  urls: { seen: string; none: string; unsure: string };
  readingUrl: string; noteUrl: string;
  /** 10-14 进度表 46 */
  hint?: string | null;
}

export function buildCheckpointEmail(i: CheckpointEmailInput): { subject: string; html: string; text: string } {
  const v = { range: i.range, next: i.next };
  const t = (k: keyof CheckpointCopy) => cpT(i.locale, k, v);
  const cjk = LOCALE_META[i.locale].cjk;
  const [qo, qc] = cjk ? ["「", "」"] : ["“", "”"];
  const html = `<!doctype html>
<html lang="${htmlLang(i.locale)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BODY}">
  <div style="max-width:560px;margin:0 auto;padding:44px 24px 40px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:${INK_50};margin:0 0 32px;">YaoFlow</p>
    <p style="font-size:22px;line-height:1.4;margin:0 0 16px;">${esc(t("title"))}</p>
    <p style="font-size:15px;line-height:1.8;color:${INK_86};margin:0 0 20px;">${esc(t("lead"))}</p>
    <div style="border-top:1px solid ${RULE};padding:18px 0 4px;">
      <p style="font-size:12px;color:${INK_50};margin:0 0 6px;">${esc(t("asked"))}</p>
      <p style="font-size:17px;line-height:1.6;margin:0 0 6px;color:${INK};">${qo}${esc(i.question)}${qc}</p>
      <p style="font-size:13px;color:${INK_50};margin:0 0 12px;">${esc(i.hexName)}</p>
      ${i.timingQuote ? `<div style="border-left:2px solid ${GOLD};padding-left:14px;margin:0 0 18px;">
        <p style="font-size:12px;color:${GOLD_TEXT};margin:0 0 4px;">${esc(t("quoteLabel"))}</p>
        <p style="font-size:15px;line-height:1.8;margin:0;color:${INK_86};">${esc(i.timingQuote)}</p>
      </div>` : ""}
    </div>
    <p style="font-size:15px;line-height:1.9;margin:0 0 14px;color:${INK};">${esc(i.hint ? hintLine(i.locale, "seen", i.hint) : t("how"))}</p>
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 22px;">
      <tr><td style="padding:0 0 10px 0;"><a href="${esc(i.urls.seen)}" style="${BTN}padding:11px 20px;border-radius:2px;font-size:14px;">${esc(t("seen"))}</a></td></tr>
      <tr><td style="padding:0 0 10px 0;"><a href="${esc(i.urls.none)}" style="${BTN_LINE}padding:10px 20px;border-radius:2px;font-size:14px;">${esc(t("none"))}</a></td></tr>
      <tr><td style="padding:0 0 10px 0;"><a href="${esc(i.urls.unsure)}" style="${BTN_QUIET}padding:10px 20px;border-radius:2px;font-size:14px;">${esc(t("unsure"))}</a></td></tr>
    </table>
    <p style="font-size:14px;line-height:1.8;color:${INK_66};margin:0 0 18px;">${esc(t("later"))}</p>
    <p style="margin:0 0 8px;"><a href="${esc(i.noteUrl)}" style="font-size:13px;color:${INK_66};">${esc(t("note"))} →</a></p>
    <p style="margin:0 0 18px;"><a href="${esc(i.readingUrl)}" style="font-size:13px;color:${INK_66};">${esc(t("open"))} →</a></p>
    <hr style="border:none;border-top:1px solid ${RULE};margin:8px 0 16px;">
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0 0 6px;">${esc(t("foot"))}</p>
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(contentFor(SEAL_EMAIL_T, i.locale).foot)}</p>
  </div>
</body>
</html>`;
  const text = [t("title"), "", t("lead"), "", `${t("asked")}: ${qo}${i.question}${qc}`, i.hexName,
    ...(i.timingQuote ? [`${t("quoteLabel")}: ${i.timingQuote}`] : []), "", (i.hint ? hintLine(i.locale, "seen", i.hint) : t("how")),
    `${t("seen")}: ${i.urls.seen}`, `${t("none")}: ${i.urls.none}`, `${t("unsure")}: ${i.urls.unsure}`, "",
    t("later"), "", `${t("note")}: ${i.noteUrl}`, `${t("open")}: ${i.readingUrl}`, "", t("foot"), contentFor(SEAL_EMAIL_T, i.locale).foot].join("\n");
  return { subject: t("subject"), html, text };
}

/* ---------------- 解籤 (10-12): the personal reading of a lot, for a buyer who did not come back to the page ---------------- */

export function buildQianEmail(i: { num: number; title: string; url: string; setName?: string; receipt?: PaidReceipt | null }): { subject: string; html: string; text: string } {
  const rc = receiptLine(i.receipt);
  const subject = `你的解籤：${i.setName ?? "六十甲子籤"}第 ${i.num} 籤`;
  const html = `<!doctype html>
<html lang="zh-Hant">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BODY}">
  <div style="max-width:560px;margin:0 auto;padding:44px 24px 40px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:${INK_50};margin:0 0 32px;">YaoFlow</p>
    <p style="font-size:22px;line-height:1.4;margin:0 0 16px;">${esc(`第 ${i.num} 籤：${i.title}`)}</p>
    <p style="font-size:15px;line-height:1.8;color:${INK_86};margin:0 0 22px;">你買的「這支籤放在你這件事上」已經寫好了，打開就能看；之後也能隨時從這封信回去看。</p>
    <p style="margin:0 0 22px;"><a href="${esc(i.url)}" style="${BTN}padding:12px 26px;border-radius:2px;font-size:14px;">打開我的解籤</a></p>
    <p style="font-size:14px;line-height:1.8;color:${INK_86};margin:0 0 10px;">讀完還有想不通的，解讀下面可以<b>再追問一句</b>，已經含在這次裡。</p>
    <p style="font-size:14px;line-height:1.8;color:${INK_86};margin:0 0 22px;">籤給方向，不給日子。想知道這件事哪幾天會有動靜，<a href="${esc(i.url)}#cast" style="color:${INK_86};">帶著同一個問題起一卦</a>，問題已經幫你帶過去；到那幾天我們會寫信回來問你。</p>${rc.html}
    <hr style="border:none;border-top:1px solid ${RULE};margin:8px 0 16px;">
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">有問題直接回覆這封信。</p>
  </div>
</body>
</html>`;
  const text = [`第 ${i.num} 籤：${i.title}`, "", "你買的「這支籤放在你這件事上」已經寫好了：", i.url, "", "讀完還有想不通的，解讀下面可以再追問一句，已經含在這次裡。", `籤給方向，不給日子。想知道哪幾天，帶著同一個問題起一卦：${i.url}#cast`, ...(rc.text.length ? ["", ...rc.text] : []), "", "有問題直接回覆這封信。"].join("\n");
  return { subject, html, text };
}

/* ---------------- 会员欢迎信 (09-25, Neil) ---------------- */

export interface WelcomeEmailInput {
  locale: Locale;
  /** 09-26 会员单月: a one-off month — label, "ends" instead of "renews", and no "manage subscription" */
  pass?: boolean;
  plan: "month" | "year";
  /** the renewal date, already formatted for the reader */
  renews: string;
  /** what they pay, already formatted (US$9.99 / NT$269 / HK$68) */
  price: string;
  deepPerMonth: number;
  followups: number;
  giftsPerMonth: number;
  giftCap: number;
  castUrl: string;
  manageUrl: string;
  /** 09-25: Stripe's hosted invoice / receipt for the first charge */
  invoiceUrl?: string | null;
  termsUrl?: string | null;
}

/**
 * The one letter a new member gets. Paper, not a brochure: a card with the
 * plan, six perks as a numbered list, three lines on how to ask well, one
 * button. Every figure comes from the caller so this never drifts from the
 * membership rules in lib/membership.ts.
 */
export function buildWelcomeEmail(i: WelcomeEmailInput): { subject: string; html: string; text: string } {
  let t: WelcomeEmailCopy = contentFor(WELCOME_EMAIL_T as Record<string, WelcomeEmailCopy> & { zh: WelcomeEmailCopy; en: WelcomeEmailCopy }, i.locale);
  const fill = (x: string) => x.replace(/\{n\}/g, "{N}").replace(/\{cap\}/g, String(i.giftCap));
  const n = (x: string, v: number) => fill(x).replace(/\{N\}/g, String(v));
  const perks: [string, string][] = [
    [n(t.perkDeep, i.deepPerMonth), n(t.perkDeepNote, i.deepPerMonth)],
    [t.perkLight, t.perkLightNote],
    [n(t.perkFollow, i.followups), n(t.perkFollowNote, i.followups)],
    [t.perkNotes, t.perkNotesNote],
    // 09-30 续订专属: the monthly gifts belong to a membership that renews — the one-off month's letter leaves them out
    ...(i.pass ? [] : [[n(t.perkGift, i.giftsPerMonth), n(t.perkGiftNote, i.giftsPerMonth)] as [string, string]]),
    [t.perkAddon, t.perkAddonNote],
  ];
  // 09-26 会员单月: the same letter, told as a month that ends
  if (i.pass) t = { ...t, planMonth: passT(i.locale, "mailPlan"), cardRenews: passT(i.locale, "mailEnds"), manage: passT(i.locale, "mailManage"), manageNote: passT(i.locale, "mailNote") };
  const planLabel = i.plan === "year" ? t.planYear : t.planMonth;
  const cell = (k: string, v: string) => `<td style="padding:0 18px 0 0;vertical-align:top;"><p style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${INK_50};margin:0 0 4px;">${esc(k)}</p><p style="font-size:15px;margin:0;color:${INK};white-space:nowrap;">${esc(v)}</p></td>`;
  const perkRow = (idx: number, title: string, note: string) => `
      <tr>
        <td style="width:34px;vertical-align:top;padding:14px 0 0;border-top:1px solid ${RULE};"><span style="font-size:13px;color:${GOLD_TEXT};letter-spacing:.06em;">${String(idx).padStart(2, "0")}</span></td>
        <td style="vertical-align:top;padding:14px 0 0;border-top:1px solid ${RULE};">
          <p style="font-size:15px;line-height:1.5;margin:0 0 3px;color:${INK};">${esc(title)}</p>
          <p style="font-size:13px;line-height:1.7;margin:0 0 12px;color:${INK_66};">${esc(note)}</p>
        </td>
      </tr>`;
  const html = `<!doctype html>
<html lang="${htmlLang(i.locale)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BODY}">
  <div style="max-width:560px;margin:0 auto;padding:44px 24px 40px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:${INK_50};margin:0 0 36px;">YaoFlow</p>
    <p style="font-size:26px;line-height:1.35;margin:0 0 16px;color:${INK};">${esc(t.title)}</p>
    <p style="font-size:15px;line-height:1.85;color:${INK_86};margin:0 0 30px;">${esc(t.lead)}</p>

    <table role="presentation" cellpadding="0" cellspacing="0" style="border:1px solid ${INK_30};border-radius:2px;padding:0;margin:0 0 34px;width:100%;">
      <tr><td style="padding:18px 20px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          ${cell(t.cardPlan, planLabel)}${cell(t.cardRenews, i.renews)}${cell(t.cardPrice, i.price)}
        </tr></table>
      </td></tr>
    </table>

    <p style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:${GOLD_TEXT};margin:0 0 4px;">${esc(t.perksTitle)}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 30px;">${perks.map(([a, b], k) => perkRow(k + 1, a, b)).join("")}
    </table>

    <p style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:${GOLD_TEXT};margin:0 0 10px;">${esc(t.howTitle)}</p>
    <div style="border-left:2px solid ${GOLD};padding-left:16px;margin:0 0 34px;">
      <p style="font-size:14px;line-height:1.8;margin:0 0 8px;color:${INK_86};">${esc(t.how1)}</p>
      <p style="font-size:14px;line-height:1.8;margin:0 0 8px;color:${INK_86};">${esc(t.how2)}</p>
      <p style="font-size:14px;line-height:1.8;margin:0;color:${INK_86};">${esc(t.how3)}</p>
    </div>

    <p style="margin:0 0 28px;"><a href="${esc(i.castUrl)}" style="${BTN}padding:13px 30px;border-radius:2px;font-size:14px;letter-spacing:.08em;">${esc(t.cta)} →</a></p>
    <p style="font-size:13px;line-height:1.7;color:${INK_66};margin:0 0 4px;"><a href="${esc(i.manageUrl)}" style="color:${INK};">${esc(t.manage)}</a> · ${esc(t.manageNote)}</p>${i.invoiceUrl ? `
    <p style="font-size:13px;line-height:1.7;color:${INK_66};margin:0 0 4px;"><a href="${esc(i.invoiceUrl)}" style="color:${INK};">${esc(t.invoice)} →</a></p>` : ""}${i.termsUrl ? `
    <p style="font-size:11px;line-height:1.6;color:${INK_50};margin:0 0 4px;">${esc(t.terms.replace("{url}", i.termsUrl))}</p>` : ""}
    <p style="font-size:13px;line-height:1.7;color:${INK_66};margin:0 0 28px;">${esc(t.reply)}</p>
    <hr style="border:none;border-top:1px solid ${RULE};margin:0 0 16px;">
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(t.foot)}</p>
  </div>
</body>
</html>`;
  const text = [
    t.title, "", t.lead, "",
    `${t.cardPlan}: ${planLabel} · ${t.cardRenews}: ${i.renews} · ${t.cardPrice}: ${i.price}`, "",
    t.perksTitle, ...perks.map(([a, b], k) => `${k + 1}. ${a}\n   ${b}`), "",
    t.howTitle, `- ${t.how1}`, `- ${t.how2}`, `- ${t.how3}`, "",
    `${t.cta}: ${i.castUrl}`, `${t.manage}: ${i.manageUrl}`, ...(i.invoiceUrl ? [`${t.invoice}: ${i.invoiceUrl}`] : []), ...(i.termsUrl ? [t.terms.replace("{url}", i.termsUrl)] : []), "", t.reply, "", t.foot,
  ].join("\n");
  return { subject: t.subject, html, text };
}


/* ---------------- 10-22 进度表 95 ③: the 通卡 letter and the member letter — two letters now ---------------- */

const perkList = (lines: string[]) => lines.length ? `
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 10px;">${lines.map((s) => `
      <tr><td style="width:18px;vertical-align:top;padding:12px 0 0;border-top:1px solid ${RULE};font-size:14px;color:${GOLD_TEXT};">·</td><td style="vertical-align:top;padding:12px 0 12px;border-top:1px solid ${RULE};font-size:15px;line-height:1.7;color:${INK};">${esc(s)}</td></tr>`).join("")}
    </table>` : "";

export interface PassOpenEmailInput {
  locale: Locale;
  /** the pass's name in the reader's language (lib/tongka.ts), e.g. 「7 天通卡」 */
  name: string;
  /** its end, already formatted — a 1-day pass to the minute */
  until: string;
  /** what is included, already written (lib/welcome.ts openLetterPerks — from the rights table, never by hand) */
  perks: string[];
  /** the first-payment line, when it applies (lib/db.ts guaranteeCheck) */
  guarantee?: string | null;
  castUrl: string;
  servicesUrl: string;
  /** the line on what a membership adds — only where it adds something the reader can see */
  upsell?: boolean;
  receiptUrl?: string | null;
  /** 10-23 进度表 111 ③: bought while another pass runs — its first day, already formatted (it starts when that one ends) */
  queuedFrom?: string | null;
}

/** The letter a new 通卡 holder gets: what is unlimited, until when, that it ends by itself. */
export function buildPassOpenEmail(i: PassOpenEmailInput): { subject: string; html: string; text: string } {
  const t = openLetterT(i.locale);
  const f = (s: string) => s.replace(/\{name\}/g, i.name).replace(/\{until\}/g, i.until);
  const subject = f(t.passSubject);
  const html = `<!doctype html>
<html lang="${htmlLang(i.locale)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BODY}">
  <div style="max-width:560px;margin:0 auto;padding:44px 24px 40px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:${INK_50};margin:0 0 36px;">YaoFlow</p>
    <p style="font-size:24px;line-height:1.4;margin:0 0 16px;color:${INK};">${esc(f(t.passTitle))}</p>
    <p style="font-size:15px;line-height:1.85;color:${INK_86};margin:0 0 14px;">${esc(f(t.passLead))}</p>${i.queuedFrom ? `
    <div style="border-left:2px solid ${GOLD};padding-left:14px;margin:0 0 16px;"><p style="font-size:14px;line-height:1.8;margin:0;color:${INK_86};">${esc(f(t.passQueued).replace("{start}", i.queuedFrom))}</p></div>` : ""}
    ${perkList(i.perks)}
    <p style="font-size:12px;line-height:1.7;color:${INK_50};margin:0 0 22px;">${esc(t.fair)}</p>
    <p style="font-size:14px;line-height:1.8;color:${INK_86};margin:0 0 14px;">${esc(t.passEnds)}</p>${i.guarantee ? `
    <div style="border-left:2px solid ${GOLD};padding-left:14px;margin:0 0 22px;"><p style="font-size:14px;line-height:1.8;margin:0;color:${INK_86};">${esc(i.guarantee)}</p></div>` : ""}
    <p style="margin:8px 0 12px;"><a href="${esc(i.castUrl)}" style="${BTN}padding:13px 28px;border-radius:2px;font-size:14px;letter-spacing:.06em;">${esc(t.passCta)} →</a></p>
    <p style="margin:0 0 24px;"><a href="${esc(i.servicesUrl)}" style="font-size:13px;color:${INK_66};">${esc(t.passMore)} →</a></p>${i.upsell ? `
    <p style="font-size:13px;line-height:1.8;color:${INK_66};margin:0 0 18px;">${esc(t.passUpsell)}</p>` : ""}${i.receiptUrl ? `
    <p style="font-size:13px;line-height:1.7;margin:0 0 6px;"><a href="${esc(i.receiptUrl)}" style="color:${INK};">${esc(t.receipt)} →</a></p>` : ""}
    <p style="font-size:13px;line-height:1.7;color:${INK_66};margin:0 0 24px;">${esc(t.reply)}</p>
    <hr style="border:none;border-top:1px solid ${RULE};margin:0 0 16px;">
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(contentFor(SEAL_EMAIL_T, i.locale).foot)}</p>
  </div>
</body>
</html>`;
  const text = [f(t.passTitle), "", f(t.passLead), ...(i.queuedFrom ? [f(t.passQueued).replace("{start}", i.queuedFrom)] : []), ...i.perks.map((s) => `· ${s}`), t.fair, "", t.passEnds,
    ...(i.guarantee ? ["", i.guarantee] : []), "", `${t.passCta}: ${i.castUrl}`, `${t.passMore}: ${i.servicesUrl}`,
    ...(i.upsell ? ["", t.passUpsell] : []), ...(i.receiptUrl ? ["", `${t.receipt}: ${i.receiptUrl}`] : []), "", t.reply].join("\n");
  return { subject, html, text };
}

export interface MemberWelcomeEmailInput {
  locale: Locale;
  /** gift = a complimentary membership (comp_): no price, an end instead of a renewal */
  plan: "month" | "year" | "gift";
  /** what this first period cost, formatted (the first month at 349 says 349) */
  paid: string;
  /** the price from the next period on, when it differs from what was paid now */
  later?: string | null;
  /** the next renewal (a gift: its end), formatted */
  date: string;
  /** what is included, already written (lib/welcome.ts openLetterPerks) */
  perks: string[];
  castUrl: string;
  manageUrl: string;
  receiptUrl?: string | null;
  termsUrl?: string | null;
  /** 10-23 进度表 111 ③: the unused days of a 通卡 taken off this first payment, already formatted */
  passCredit?: string | null;
}

/** The letter a new member gets: the plan card, what is unlimited, what comes every day and month, how to stop. */
export function buildMemberWelcomeEmail(i: MemberWelcomeEmailInput): { subject: string; html: string; text: string } {
  const t = openLetterT(i.locale);
  const gift = i.plan === "gift";
  const subject = (gift ? t.memSubjectEnds : t.memSubject).replace("{date}", i.date);
  const planLabel = gift ? t.planGift : i.plan === "year" ? t.planYear : t.planMonth;
  const laterLine = i.later ? (i.plan === "year" ? t.cardLaterYear : t.cardLater).replace("{later}", i.later) : "";
  const cell = (k: string, v: string, sub = "") => `<td style="padding:0 18px 0 0;vertical-align:top;"><p style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${INK_50};margin:0 0 4px;">${esc(k)}</p><p style="font-size:15px;margin:0;color:${INK};white-space:nowrap;">${esc(v)}</p>${sub ? `<p style="font-size:12px;margin:3px 0 0;color:${INK_66};white-space:nowrap;">${esc(sub)}</p>` : ""}</td>`;
  const html = `<!doctype html>
<html lang="${htmlLang(i.locale)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BODY}">
  <div style="max-width:560px;margin:0 auto;padding:44px 24px 40px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:${INK_50};margin:0 0 36px;">YaoFlow</p>
    <p style="font-size:26px;line-height:1.35;margin:0 0 16px;color:${INK};">${esc(t.memTitle)}</p>
    <p style="font-size:15px;line-height:1.85;color:${INK_86};margin:0 0 28px;">${esc(t.memLead)}</p>

    <table role="presentation" cellpadding="0" cellspacing="0" style="border:1px solid ${INK_30};border-radius:2px;padding:0;margin:0 0 30px;width:100%;">
      <tr><td style="padding:18px 20px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          ${cell(t.cardPlan, planLabel)}${gift || !i.paid ? "" : cell(t.cardPaid, i.paid, laterLine)}${cell(gift ? t.cardEnds : t.cardRenews, i.date)}
        </tr></table>
      </td></tr>
    </table>${i.passCredit ? `
    <p style="font-size:14px;line-height:1.8;color:${INK_86};margin:-14px 0 26px;">${esc(t.memCredit.replace("{credit}", i.passCredit))}</p>` : ""}

    <p style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:${GOLD_TEXT};margin:0 0 4px;">${esc(t.perksTitle)}</p>
    ${perkList(i.perks)}
    <p style="font-size:12px;line-height:1.7;color:${INK_50};margin:0 0 22px;">${esc(t.fair)}</p>${gift ? "" : `
    <p style="font-size:14px;line-height:1.8;color:${INK_86};margin:0 0 22px;">${esc(t.memCancel)}</p>`}
    <p style="margin:0 0 26px;"><a href="${esc(i.castUrl)}" style="${BTN}padding:13px 28px;border-radius:2px;font-size:14px;letter-spacing:.06em;">${esc(t.memCta)} →</a></p>
    <p style="font-size:13px;line-height:1.7;margin:0 0 6px;"><a href="${esc(i.manageUrl)}" style="color:${INK};">${esc(t.manage)} →</a></p>${i.receiptUrl ? `
    <p style="font-size:13px;line-height:1.7;margin:0 0 6px;"><a href="${esc(i.receiptUrl)}" style="color:${INK};">${esc(t.receipt)} →</a></p>` : ""}${i.termsUrl ? `
    <p style="font-size:11px;line-height:1.6;color:${INK_50};margin:0 0 6px;">${esc(t.terms.replace("{url}", i.termsUrl))}</p>` : ""}
    <p style="font-size:13px;line-height:1.7;color:${INK_66};margin:0 0 24px;">${esc(t.reply)}</p>
    <hr style="border:none;border-top:1px solid ${RULE};margin:0 0 16px;">
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(contentFor(SEAL_EMAIL_T, i.locale).foot)}</p>
  </div>
</body>
</html>`;
  const card = [`${t.cardPlan}: ${planLabel}`, ...(gift || !i.paid ? [] : [`${t.cardPaid}: ${i.paid}${laterLine ? ` (${laterLine})` : ""}`]), `${gift ? t.cardEnds : t.cardRenews}: ${i.date}`].join(" · ");
  const text = [t.memTitle, "", t.memLead, "", card, ...(i.passCredit ? [t.memCredit.replace("{credit}", i.passCredit)] : []), "", t.perksTitle, ...i.perks.map((s) => `· ${s}`), t.fair, "",
    ...(gift ? [] : [t.memCancel, ""]), `${t.memCta}: ${i.castUrl}`, `${t.manage}: ${i.manageUrl}`,
    ...(i.receiptUrl ? [`${t.receipt}: ${i.receiptUrl}`] : []), ...(i.termsUrl ? [t.terms.replace("{url}", i.termsUrl)] : []), "", t.reply].join("\n");
  return { subject, html, text };
}

/* ---------------- 09-26 会员：续费前回顾 · 权益升级 ---------------- */

export interface RecapInput {
  locale: Locale; date: string; paid: string;
  /** 10-22 进度表 95 ④: the days of this period something was used, and what they come to at the 1-day pass price */
  days: number; value: string | null;
  /** 10-22: what was used this period — full readings, tarot, lot readings, chart reports, chart questions — and the daily letters received */
  deep: number; tarot: number; qian: number; report: number; qa: number; letters: number;
  matters: { q: string; status: "next" | "waiting" | "answered"; date?: string }[];
  castUrl: string; manageUrl: string;
  year: { url: string; price: string; pct: number } | null;
}

export function buildRecapEmail(i: RecapInput): { subject: string; html: string; text: string } {
  const t = contentFor(RECAP_T, i.locale);
  const f = (x: string, v: Record<string, string | number> = {}) => x.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? { date: i.date, paid: i.paid, value: i.value ?? "", days: i.days }[k] ?? `{${k}}`));
  // 10-22 进度表 95 ④: what the membership is now — full readings, tarot, lots, reports, chart questions, the daily letter
  const used = [
    i.deep ? f(t.deep, { n: i.deep }) : null, i.tarot ? f(t.tarot, { n: i.tarot }) : null, i.qian ? f(t.qian, { n: i.qian }) : null,
    i.report ? f(t.report, { n: i.report }) : null, i.qa ? f(t.qa, { n: i.qa }) : null, i.letters ? f(t.letters, { n: i.letters }) : null,
  ].filter(Boolean) as string[];
  const p = (x: string, color = INK_86, size = 15) => `<p style="font-size:${size}px;line-height:1.8;color:${color};margin:0 0 14px;">${esc(x)}</p>`;
  const status = (m: RecapInput["matters"][number]) => m.status === "next" ? f(t.next, { date: m.date ?? "" }) : m.status === "answered" ? t.answered : t.waiting;
  const html = `<!doctype html>
<html lang="${htmlLang(i.locale)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BODY}">
  <div style="max-width:560px;margin:0 auto;padding:44px 24px 40px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:${INK_50};margin:0 0 32px;">YaoFlow</p>
    <p style="font-size:22px;line-height:1.4;margin:0 0 18px;">${esc(t.title)}</p>
    ${used.length ? `${p(t.used, INK_66, 14)}<p style="font-size:17px;line-height:1.9;margin:0 0 14px;color:${INK};">${used.map(esc).join(" · ")}</p>${i.value && i.days > 0 ? p(f(t.worth), GOLD_TEXT, 14) : ""}` : p(t.quiet)}
    ${i.matters.length ? `<hr style="border:none;border-top:1px solid ${RULE};margin:18px 0;"><p style="font-size:12px;color:${INK_50};letter-spacing:.2em;margin:0 0 10px;">${esc(t.matters)}</p>
    ${i.matters.map((m) => `<p style="font-size:15px;line-height:1.7;margin:0 0 10px;color:${INK_86};">「${esc(m.q)}」<br><span style="font-size:13px;color:${m.status === "next" ? GOLD_TEXT : INK_50};">${esc(status(m))}</span></p>`).join("")}` : ""}
    <hr style="border:none;border-top:1px solid ${RULE};margin:18px 0;">
    ${p(f(t.renew), INK_66, 14)}
    ${i.year ? `<div style="border-left:2px solid ${GOLD};padding-left:14px;margin:0 0 18px;">${p(f(t.year, { price: i.year.price, pct: i.year.pct }), INK_86, 14)}<p style="margin:0 0 4px;"><a href="${esc(i.year.url)}" style="${BTN_LINE}padding:9px 20px;border-radius:2px;font-size:13px;">${esc(t.yearBtn)}</a></p></div>` : ""}
    <p style="margin:6px 0 10px;"><a href="${esc(i.castUrl)}" style="${BTN}padding:12px 26px;border-radius:2px;font-size:14px;">${esc(t.cast)}</a></p>
    <p style="margin:0 0 20px;"><a href="${esc(i.manageUrl)}" style="font-size:13px;color:${INK_66};">${esc(t.manage)} →</a></p>
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(contentFor(SEAL_EMAIL_T, i.locale).foot)}</p>
  </div>
</body>
</html>`;
  const text = [t.title, "", ...(used.length ? [t.used, used.join(" · "), ...(i.value && i.days > 0 ? [f(t.worth)] : [])] : [t.quiet]), "",
    ...(i.matters.length ? [t.matters, ...i.matters.map((m) => `「${m.q}」 — ${status(m)}`), ""] : []),
    f(t.renew), ...(i.year ? ["", f(t.year, { price: i.year.price, pct: i.year.pct }), `${t.yearBtn}: ${i.year.url}`] : []),
    "", `${t.cast}: ${i.castUrl}`, `${t.manage}: ${i.manageUrl}`].join("\n");
  return { subject: f(t.subject), html, text };
}

export function buildPerksEmail(i: { locale: Locale; deep: number; follow: number; gifts: number; cap: number; accountUrl: string; manageUrl: string }): { subject: string; html: string; text: string } {
  const t = PERKS_T[i.locale] ?? PERKS_T.en!;
  const f = (x: string) => x.replace(/\{deep\}/g, String(i.deep)).replace(/\{follow\}/g, String(i.follow)).replace(/\{gifts\}/g, String(i.gifts)).replace(/\{cap\}/g, String(i.cap));
  const rows = t.perks.map((k) => `
    <tr><td style="padding:12px 0;border-top:1px solid ${RULE};vertical-align:top;">
      <p style="font-size:16px;line-height:1.5;margin:0 0 4px;color:${INK};">${esc(f(k.t))}${k.isNew ? ` <span style="font-size:11px;letter-spacing:.1em;color:#fff;background:${GOLD};padding:2px 6px;border-radius:2px;vertical-align:2px;">${esc(t.newTag)}</span>` : ""}</p>
      <p style="font-size:14px;line-height:1.7;margin:0;color:${INK_66};">${esc(f(k.d))}</p>
    </td></tr>`).join("");
  const html = `<!doctype html>
<html lang="${htmlLang(i.locale)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BODY}">
  <div style="max-width:560px;margin:0 auto;padding:44px 24px 40px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:${INK_50};margin:0 0 32px;">YaoFlow</p>
    <p style="font-size:24px;line-height:1.4;margin:0 0 14px;">${esc(t.title)}</p>
    <p style="font-size:15px;line-height:1.8;margin:0 0 20px;color:${INK_86};">${esc(t.lead)}</p>
    <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;margin:0 0 24px;border-bottom:1px solid ${RULE};">${rows}</table>
    <p style="font-size:14px;line-height:1.8;margin:0 0 20px;color:${INK_66};">${esc(t.close)}</p>
    <p style="margin:0 0 10px;"><a href="${esc(i.accountUrl)}" style="${BTN}padding:12px 26px;border-radius:2px;font-size:14px;">${esc(t.cta)}</a></p>
    <p style="margin:0 0 20px;"><a href="${esc(i.manageUrl)}" style="font-size:13px;color:${INK_66};">${esc(t.manage)} →</a></p>
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(contentFor(SEAL_EMAIL_T, i.locale).foot)}</p>
  </div>
</body>
</html>`;
  const text = [t.title, "", t.lead, "", ...t.perks.map((k) => `${k.isNew ? `[${t.newTag}] ` : ""}${f(k.t)} — ${f(k.d)}`), "", t.close, "", `${t.cta}: ${i.accountUrl}`, `${t.manage}: ${i.manageUrl}`].join("\n");
  return { subject: t.subject, html, text };
}

/* ---------------- 送一卦被用掉了 (09-26 裂变): tell the giver, never the question ---------------- */

export function buildGiftUsedEmail(i: { locale: Locale; giftUrl: string; rewardUrl?: string | null; rewardDays?: number; via?: "gift" | "share"; allowance?: boolean }): { subject: string; html: string; text: string } {
  // 09-29: the same letter thanks a sharer whose link brought a newcomer — only the first line and the subject differ
  const swap: Partial<Record<string, "shLead" | "shSubject">> = i.via === "share" ? { gvLead: "shLead", gvSubject: "shSubject" } : {};
  // 09-29 会员裂变: a member's thank-you is already in their allowance — the letter says so and points at the cast page
  const allow: Partial<Record<string, "gvAllowNow" | "gvAllowUse">> = i.allowance ? { gvRewardNow: "gvAllowNow", gvUse: "gvAllowUse" } : {};
  const k = (key: "gvLead" | "gvReward" | "gvAgain" | "gvSubject" | "gvRewardNow" | "gvUse") => tt(i.locale, swap[key] ?? allow[key] ?? key, { n: i.rewardDays ?? 30 });
  // 09-29 裂变 P1: the thank-you comes when the friend claims, not when (if ever) they pay — the letter carries it
  if (i.rewardUrl) {
    const html = `<!doctype html>
<html lang="${htmlLang(i.locale)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BODY}">
  <div style="max-width:560px;margin:0 auto;padding:44px 24px 40px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:${INK_50};margin:0 0 36px;">YaoFlow</p>
    <p style="font-size:15px;line-height:1.9;margin:0 0 14px;color:${INK};">${esc(k("gvLead"))}</p>
    <p style="font-size:15px;line-height:1.9;margin:0 0 28px;color:${INK_86};">${esc(k("gvRewardNow"))}</p>
    <p style="margin:0 0 14px;"><a href="${esc(i.rewardUrl)}" style="${BTN}padding:12px 26px;border-radius:2px;font-size:14px;">${esc(k("gvUse"))}</a></p>
    <p style="margin:0 0 32px;"><a href="${esc(i.giftUrl)}" style="font-size:13px;color:${INK_66};">${esc(k("gvAgain"))} →</a></p>
    <hr style="border:none;border-top:1px solid ${RULE};margin:0 0 16px;">
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(contentFor(SEAL_EMAIL_T, i.locale).foot)}</p>
  </div>
</body>
</html>`;
    const text = [k("gvLead"), "", k("gvRewardNow"), "", `${k("gvUse")}: ${i.rewardUrl}`, `${k("gvAgain")}: ${i.giftUrl}`].join("\n");
    return { subject: k("gvSubject"), html, text };
  }
  const html = `<!doctype html>
<html lang="${htmlLang(i.locale)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BODY}">
  <div style="max-width:560px;margin:0 auto;padding:44px 24px 40px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:${INK_50};margin:0 0 36px;">YaoFlow</p>
    <p style="font-size:15px;line-height:1.9;margin:0 0 14px;color:${INK};">${esc(k("gvLead"))}</p>
    <p style="font-size:15px;line-height:1.9;margin:0 0 28px;color:${INK_86};">${esc(k("gvReward"))}</p>
    <p style="margin:0 0 32px;"><a href="${esc(i.giftUrl)}" style="${BTN}padding:12px 26px;border-radius:2px;font-size:14px;">${esc(k("gvAgain"))}</a></p>
    <hr style="border:none;border-top:1px solid ${RULE};margin:0 0 16px;">
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(contentFor(SEAL_EMAIL_T, i.locale).foot)}</p>
  </div>
</body>
</html>`;
  const text = [k("gvLead"), "", k("gvReward"), "", `${k("gvAgain")}: ${i.giftUrl}`].join("\n");
  return { subject: k("gvSubject"), html, text };
}

/* ---------------- 每日三卦 (09-26): the confirmation, and the morning letter ---------------- */

function simpleLetter(locale: Locale, parts: { title?: string; lines: string[]; cta: { label: string; url: string }; foot: string[] }): string {
  return `<!doctype html>
<html lang="${htmlLang(locale)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BODY}">
  <div style="max-width:560px;margin:0 auto;padding:44px 24px 40px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:${INK_50};margin:0 0 32px;">YaoFlow</p>
    ${parts.title ? `<p style="font-size:22px;line-height:1.45;margin:0 0 16px;color:${INK};">${esc(parts.title)}</p>` : ""}
    ${parts.lines.map((l) => `<p style="font-size:15px;line-height:1.85;margin:0 0 12px;color:${INK_86};">${l}</p>`).join("")}
    <p style="margin:22px 0 30px;"><a href="${esc(parts.cta.url)}" style="${BTN}padding:12px 26px;border-radius:2px;font-size:14px;">${esc(parts.cta.label)}</a></p>
    <hr style="border:none;border-top:1px solid ${RULE};margin:0 0 14px;">
    ${parts.foot.map((f) => `<p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0 0 4px;">${f}</p>`).join("")}
  </div>
</body>
</html>`;
}

/* ---------------- 09-29 会员增购包邮件 ---------------- */

export function buildPackOfferEmail(i: {
  locale: Locale; left: number; cap: number; reset: string; price: string; per: string; one: string; fifteen: string; save: string; pct: number;
  /** 10-02 小包 */
  smallPrice?: string; smallPer?: string;
  accountUrl: string; unsubUrl: string;
}): { subject: string; html: string; text: string } {
  const v = { left: i.left, cap: i.cap, reset: i.reset, price: i.price, per: i.per, one: i.one, fifteen: i.fifteen, save: i.save, pct: i.pct, smallPrice: i.smallPrice ?? "", smallPer: i.smallPer ?? "" };
  const k = (x: Parameters<typeof po>[1]) => po(i.locale, x, v);
  const subject = k(i.left > 0 ? "subjectLeft" : "subjectOut");
  const lines = [k(i.left > 0 ? "whyLeft" : "whyOut"), k("what"), k("save"), ...(i.smallPrice ? [k("small")] : []), k("rules"), k("where")];
  const html = simpleLetter(i.locale, {
    lines: lines.map(esc),
    cta: { label: k("cta"), url: i.accountUrl },
    foot: [esc(k("alt")), `<a href="${esc(i.unsubUrl)}" style="color:${INK_50};">${esc(k("unsub"))}</a>`],
  });
  const text = [...lines, "", `${k("cta")}: ${i.accountUrl}`, "", k("alt"), "", `${k("unsub")}: ${i.unsubUrl}`].join("\n");
  return { subject, html, text };
}

/**
 * 10-02 存到信箱: the cast the reader asked us to keep — the question, the figure, the free line they saw, and the way
 * back to it. Asked for, so not commercial; it still says the one reminder is coming and how to stop it.
 */
export function buildSavedCastEmail(i: { locale: Locale; hex: string; question: string; teaser: string | null; url: string; unsubUrl: string; next?: string }): { subject: string; html: string; text: string } {
  const k = (x: Parameters<typeof svT>[1], v: Record<string, string | number> = {}) => svT(i.locale, x, v);
  const lines = [k("sLead"), k("sAsked", { q: i.question }), k("sGot", { hex: i.hex }), ...(i.teaser ? [k("sFree", { teaser: i.teaser })] : []), k("sBack")];
  // 10-12 B②: a matter kept on its 3rd–4th cast says what comes next itself (the date letter, or nothing)
  const next = i.next ?? k("sNext");
  const html = simpleLetter(i.locale, {
    lines: lines.map(esc),
    cta: { label: k("sCta"), url: i.url },
    foot: [esc(next), `<a href="${esc(i.unsubUrl)}" style="color:${INK_50};">${esc(k("sStop"))}</a>`],
  });
  const text = [...lines, "", `${k("sCta")}: ${i.url}`, "", next, `${k("sStop")}: ${i.unsubUrl}`].join("\n");
  return { subject: k("sSubject", { hex: i.hex }), html, text };
}

/** 10-12 B②: the one date letter for a matter kept on its 3rd–4th cast — the time the chart names is near. */
export function buildSavedRemindEmail(i: { locale: Locale; hex: string; question: string; when: string; url: string; unsubUrl: string }): { subject: string; html: string; text: string } {
  const k = (x: Parameters<typeof msT>[1]) => msT(i.locale, x, { q: i.question, hex: i.hex, when: i.when });
  const lines = [k("rLead"), k("rWhat")];
  const html = simpleLetter(i.locale, {
    lines: lines.map(esc),
    cta: { label: k("rCta"), url: i.url },
    foot: [esc(k("rFoot")), `<a href="${esc(i.unsubUrl)}" style="color:${INK_50};">${esc(svT(i.locale, "sStop", {}))}</a>`],
  });
  const text = [...lines, "", `${k("rCta")}: ${i.url}`, "", k("rFoot"), `${svT(i.locale, "sStop", {})}: ${i.unsubUrl}`].join("\n");
  return { subject: k("rSubject"), html, text };
}

/** 10-02 存到信箱: the one reminder, about a day later — what the full reading gives on that figure, and its price. */
/** `pass`: the 通卡 is open to everyone (10-23 进度表 101) — the price line is the 1-day pass (first one / regular), not a single reading. */
export function buildSavedFollowupEmail(i: { locale: Locale; hex: string; question: string; price: string; full: string; first: boolean; followups: number; url: string; unsubUrl: string; pass?: boolean }): { subject: string; html: string; text: string } {
  const k = (x: Parameters<typeof svT>[1], v: Record<string, string | number> = {}) => svT(i.locale, x, v);
  // the subject quotes the question: 18 characters of Chinese / Japanese / Korean, about 40 of a spaced language, cut at a word
  const cjk = /^(zh|ja|ko)/.test(i.locale);
  const max = cjk ? 18 : 40;
  const cut = i.question.length <= max ? i.question : cjk ? i.question.slice(0, max) : i.question.slice(0, max).replace(/\s+\S*$/, "");
  const qShort = cut.length < i.question.length ? `${cut}…` : cut;
  const priceLine = i.pass
    ? (i.first ? k("fPassFirst", { price: i.price, full: i.full }) : k("fPass", { price: i.price }))
    : (i.first ? k("fPriceFirst", { price: i.price, full: i.full }) : k("fPrice", { price: i.price }));
  const lines = [k("fLead", { hex: i.hex, q: i.question }), k("fWhat", { n: i.followups }), priceLine];
  const html = simpleLetter(i.locale, {
    lines: lines.map(esc),
    cta: { label: k("fCta"), url: i.url },
    foot: [esc(k("fFoot")), `<a href="${esc(i.unsubUrl)}" style="color:${INK_50};">${esc(k("unsub"))}</a>`],
  });
  const text = [...lines, "", `${k("fCta")}: ${i.url}`, "", k("fFoot"), `${k("unsub")}: ${i.unsubUrl}`].join("\n");
  return { subject: k("fSubject", { qShort, hex: i.hex }), html, text };
}

/**
 * 10-04 挽回信 (Neil: 「91人你现在全部补发一封」): the one letter to someone who reached the payment page and never paid.
 * `kind` picks the shape (an upgrade of a light reading / a full reading on a cast / a membership); `q` is null when the
 * question is not to be quoted (health, sex life, a criminal record — and a membership has none).
 */
export interface RecoverEmailInput {
  locale: Locale;
  kind: "upgrade" | "deep" | "member";
  date: string;
  q: string | null;
  hex: string;
  url: string;
  unsubUrl: string;
  /** the first-time price and the full one, formatted (readings) */
  price?: string; full?: string;
  /** they saw US dollars on the old upgrade page — say it was our mistake */
  usdSorry?: boolean;
  /** a mainland buyer: Alipay is there now */
  alipay?: boolean;
  /** membership: the monthly price, the one-month price, the allowance */
  month?: string; pass?: string; deep?: number; fu?: number;
  /** follow-up questions on a full reading */
  n?: number;
}

export function buildRecoverEmail(i: RecoverEmailInput): { subject: string; html: string; text: string } {
  const v = { date: i.date, q: i.q ?? "", hex: i.hex, price: i.price ?? "", full: i.full ?? "", n: i.n ?? 0, month: i.month ?? "", pass: i.pass ?? "", deep: i.deep ?? 0, fu: i.fu ?? 0 };
  const k = (x: Parameters<typeof rcT>[1]) => rcT(i.locale, x, v);
  let lines: string[];
  let cta: string;
  let foot: string;
  if (i.kind === "member") {
    lines = [k("memLead"), k("memWhat"), k("memPass"), ...(i.alipay ? [k("memAlipay")] : []), k("help")];
    cta = k("ctaMem");
    foot = k("memFoot");
  } else if (i.kind === "upgrade") {
    lines = [k(i.q ? "upLead" : "upLeadNoQ"), ...(i.usdSorry ? [k("usdSorry")] : []), k("keepUp"), k("what"), k("priceFirst"), ...(i.alipay ? [k("alipay")] : []), k("passed"), k("help")];
    cta = k("ctaUp");
    foot = k("foot");
  } else {
    lines = [k(i.q ? "deepLead" : "deepLeadNoQ"), k("keep"), k("what"), k("priceFirst"), ...(i.alipay ? [k("alipay")] : []), k("passed"), k("help")];
    cta = k("ctaDeep");
    foot = k("foot");
  }
  const html = simpleLetter(i.locale, {
    lines: lines.map(esc),
    cta: { label: cta, url: i.url },
    foot: [esc(foot), `<a href="${esc(i.unsubUrl)}" style="color:${INK_50};">${esc(k("unsub"))}</a>`],
  });
  const text = [...lines, "", `${cta}: ${i.url}`, "", foot, `${k("unsub")}: ${i.unsubUrl}`].join("\n");
  return { subject: k(i.kind === "member" ? "subjectMember" : "subject"), html, text };
}

/** 10-12 挽回信序列: letter {step} of up to four to someone who ticked 「沒付完時寄信提醒我」 (lib/recover-seq.ts). */
export function buildRecoverSeqEmail(i: {
  locale: Locale; step: 1 | 2 | 3 | 4; kind: "deep" | "upgrade" | "member"; date: string; q: string | null; hex: string;
  price: string; url: string; unsubUrl: string; n: number; month?: string; pass?: string; deep?: number; fu?: number;
}): { subject: string; html: string; text: string } {
  const v = { date: i.date, q: i.q ?? "", hex: i.hex, price: i.price, n: i.n, month: i.month ?? "", pass: i.pass ?? "", deep: i.deep ?? 0, fu: i.fu ?? 0, k: i.step, full: "" };
  const r = (x: Parameters<typeof rcT>[1]) => rcT(i.locale, x, v);
  const s = (x: Parameters<typeof rsT>[1]) => rsT(i.locale, x, v);
  let lines: string[];
  let cta: string;
  let foot: string;
  let subject: string;
  if (i.kind === "member") {
    lines = [r("memLead"), r("memWhat"), r("memPass"), r("help")];
    cta = r("ctaMem"); foot = s("memFoot"); subject = s("memSubject");
  } else {
    const lead = i.kind === "upgrade" ? r(i.q ? "upLead" : "upLeadNoQ") : r(i.q ? "deepLead" : "deepLeadNoQ");
    const keep = i.kind === "upgrade" ? r("keepUp") : r("keep");
    const step = i.step === 1 ? [s("lead1"), keep] : i.step === 2 ? [s("step2")] : i.step === 3 ? [s("step3"), r("passed")] : [keep];
    lines = [lead, ...step, r("what"), s("price"), ...(i.step === 3 ? [] : [r("help")])];
    cta = i.kind === "upgrade" ? r("ctaUp") : r("ctaDeep");
    foot = i.step === 4 ? s("step4") : s("foot");
    subject = s(`subject${i.step}` as "subject1");
  }
  const html = simpleLetter(i.locale, {
    lines: lines.map(esc),
    cta: { label: cta, url: i.url },
    foot: [esc(foot), `<a href="${esc(i.unsubUrl)}" style="color:${INK_50};">${esc(r("unsub"))}</a>`],
  });
  const text = [...lines, "", `${cta}: ${i.url}`, "", foot, `${r("unsub")}: ${i.unsubUrl}`].join("\n");
  return { subject, html, text };
}

/** 09-29 (Neil: 「会员增购包购买之后不会自动发邮件的吗？」): the pack arrived — what was paid, what is held now, how it is used. */
export function buildPackBoughtEmail(i: { locale: Locale; paid: string; n: number; credit?: number; left: number; cap: number; castUrl: string }): { subject: string; html: string; text: string } {
  const k = (x: Parameters<typeof po>[1]) => po(i.locale, x, { paid: i.paid, n: i.n, credit: i.credit ?? 0, left: i.left, cap: i.cap });
  const lines = [k("bLead"), ...((i.credit ?? 0) > 0 ? [k("bCredit")] : []), k("bBalance"), k("bRules"), k("bReceipt")];
  const html = simpleLetter(i.locale, { lines: lines.map(esc), cta: { label: k("bCta"), url: i.castUrl }, foot: [esc(k("bHelp"))] });
  return { subject: k("bSubject"), html, text: [...lines, "", `${k("bCta")}: ${i.castUrl}`, "", k("bHelp")].join("\n") };
}

export function buildDailyConfirmEmail(i: { locale: Locale; confirmUrl: string }): { subject: string; html: string; text: string } {
  const k = (x: Parameters<typeof dpT>[1]) => dpT(i.locale, x);
  const html = simpleLetter(i.locale, { lines: [esc(k("confBody"))], cta: { label: k("confCta"), url: i.confirmUrl }, foot: [esc(k("confIgnore"))] });
  return { subject: k("confSubject"), html, text: [k("confBody"), "", `${k("confCta")}: ${i.confirmUrl}`, "", k("confIgnore")].join("\n") };
}

export function buildDailyEmail(i: { locale: Locale; names: string[]; todayUrl: string; unsubUrl: string }): { subject: string; html: string; text: string } {
  const k = (x: Parameters<typeof dpT>[1], v: Record<string, string | number> = {}) => dpT(i.locale, x, v);
  const piles = i.names.map((n, j) => `<span style="color:${INK_50};font-size:12px;">${esc(k("mailPile", { n: j + 1 }))}</span>&nbsp;&nbsp;${esc(n)}`);
  const html = simpleLetter(i.locale, {
    title: k("mailLead"), lines: piles, cta: { label: k("mailCta"), url: i.todayUrl },
    foot: [esc(k("mailWhy")), `<a href="${esc(i.unsubUrl)}" style="color:${INK_50};">${esc(k("mailUnsub"))}</a>`],
  });
  const text = [k("mailLead"), "", ...i.names.map((n, j) => `${k("mailPile", { n: j + 1 })}  ${n}`), "", `${k("mailCta")}: ${i.todayUrl}`, "", k("mailWhy"), `${k("mailUnsub")}: ${i.unsubUrl}`].join("\n");
  return { subject: k("mailSubject", { a: i.names[0] ?? "", b: i.names[1] ?? "", c: i.names[2] ?? "" }), html, text };
}

/* ---------------- 会员额度刷新 (10-14, Neil: 「做吧」) ---------------- */

export function buildResetEmail(i: { locale: Locale; deep: number; carry: number; friends: number; follow: number; until: string; castUrl: string; manageUrl: string }): { subject: string; html: string; text: string } {
  const t = RESET_T[i.locale] ?? RESET_T.en;
  const f = (x: string) => x.replace(/\{deep\}/g, String(i.deep)).replace(/\{carry\}/g, String(i.carry)).replace(/\{friends\}/g, String(i.friends)).replace(/\{follow\}/g, String(i.follow)).replace(/\{until\}/g, i.until);
  const parts = [i.carry > 0 ? f(t.carry) : null, i.friends > 0 ? f(t.friends) : null].filter(Boolean) as string[];
  const deepLine = f(t.deep) + (parts.length ? `${t.open}${parts.join(t.join)}${t.close}` : "");
  const items = [deepLine, t.light, f(t.follow)];
  const html = `<!doctype html>
<html lang="${htmlLang(i.locale)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BODY}">
  <div style="max-width:560px;margin:0 auto;padding:44px 24px 40px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:${INK_50};margin:0 0 32px;">YaoFlow</p>
    <p style="font-size:22px;line-height:1.4;margin:0 0 18px;">${esc(t.title)}</p>
    <p style="font-size:15px;line-height:1.8;color:${INK_66};margin:0 0 12px;">${esc(f(t.lead))}</p>
    ${items.map((x, k) => `<p style="font-size:${k === 0 ? 18 : 15}px;line-height:1.7;margin:0 0 8px;color:${k === 0 ? INK : INK_86};">· ${esc(x)}</p>`).join("\n    ")}
    <p style="font-size:15px;line-height:1.8;color:${INK_86};margin:18px 0 22px;">${esc(t.nudge)}</p>
    <p style="margin:0 0 10px;"><a href="${esc(i.castUrl)}" style="${BTN}padding:12px 26px;border-radius:2px;font-size:14px;">${esc(t.cast)}</a></p>
    <p style="margin:0 0 20px;"><a href="${esc(i.manageUrl)}" style="font-size:13px;color:${INK_66};">${esc(t.manage)} →</a></p>
    <hr style="border:none;border-top:1px solid ${RULE};margin:8px 0 16px;">
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(t.foot)}</p>
  </div>
</body>
</html>`;
  const text = [t.title, "", f(t.lead), ...items.map((x) => `· ${x}`), "", t.nudge, "", `${t.cast}: ${i.castUrl}`, `${t.manage}: ${i.manageUrl}`, "", t.foot].join("\n");
  return { subject: f(t.subject), html, text };
}

/* ---------------- 10-14 进度表 47 推荐回馈: the sharer's short letter ---------------- */
const REF_T: Record<string, { subject: string; title: string; lead: string; until: string; cta: string; foot: string }> = {
  "zh-hant": { subject: "你的朋友起了第一卦，送你一次輕解讀", title: "你的朋友起了第一卦", lead: "你分享的連結帶來了一位朋友，他起了第一卦。謝謝你，送你一次輕解讀，問你自己的一件事。", until: "{until} 前有效。", cta: "用這次輕解讀起一卦", foot: "你朋友問了什麼，我們不會告訴你，也不會把你的事告訴他。這是服務通知，有問題直接回覆這封信。" },
  zh: { subject: "你的朋友起了第一卦，送你一次轻解读", title: "你的朋友起了第一卦", lead: "你分享的链接带来了一位朋友，他起了第一卦。谢谢你，送你一次轻解读，问你自己的一件事。", until: "{until} 前有效。", cta: "用这次轻解读起一卦", foot: "你朋友问了什么，我们不会告诉你，也不会把你的事告诉他。这是服务通知，有问题直接回复这封信。" },
  en: { subject: "Your friend cast their first reading — a light reading for you", title: "Your friend cast their first reading", lead: "Someone came through the link you shared and cast their first reading. Thank you — here is one light reading for a matter of your own.", until: "Good until {until}.", cta: "Cast with this light reading", foot: "We never tell you what your friend asked, nor them what you ask. This is a service notice — just reply if you have a question." },
};
export function buildRefRewardEmail(i: { locale: Locale; url: string; until: string }): { subject: string; html: string; text: string } {
  const t = REF_T[i.locale] ?? REF_T.en!;
  const until = t.until.replace("{until}", i.until);
  const html = `<!doctype html>
<html lang="${htmlLang(i.locale)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BODY}">
  <div style="max-width:560px;margin:0 auto;padding:44px 24px 40px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:${INK_50};margin:0 0 32px;">YaoFlow</p>
    <p style="font-size:22px;line-height:1.4;margin:0 0 18px;">${esc(t.title)}</p>
    <p style="font-size:15px;line-height:1.8;color:${INK_86};margin:0 0 10px;">${esc(t.lead)}</p>
    <p style="font-size:13px;line-height:1.7;color:${INK_66};margin:0 0 22px;">${esc(until)}</p>
    <p style="margin:0 0 24px;"><a href="${esc(i.url)}" style="${BTN}padding:12px 26px;border-radius:2px;font-size:14px;">${esc(t.cta)}</a></p>
    <hr style="border:none;border-top:1px solid ${RULE};margin:8px 0 16px;">
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(t.foot)}</p>
  </div>
</body>
</html>`;
  return { subject: t.subject, html, text: [t.title, "", t.lead, until, "", `${t.cta}: ${i.url}`, "", t.foot].join("\n") };
}

/* ---------------- 10-16 进度表 68 線上塔羅 ---------------- */

/** The link to a paid tarot reading (once per spread, from whichever path writes it first). */
/** 10-23 进度表 111 ③: what was paid and Stripe's receipt, one line, in a single purchase's letter (lib/receipt.ts decides when) */
export interface PaidReceipt { amount: string; url: string }
// 10-29 进度表 128: `hans` may be a page language — the words of the reading letter in that language
function receiptLine(r: PaidReceipt | null | undefined, hans: boolean | Locale = false): { html: string; text: string[] } {
  if (!r) return { html: "", text: [] };
  const foreign = typeof hans === "string" && hans !== "zh" && hans !== "zh-hant";
  const rt = foreign ? contentFor(READING_EMAIL_T, hans) : null;
  const w = rt ? { paid: rt.paid.replace("{amount}", "").trim(), receipt: rt.receipt } : hans === true || hans === "zh" ? { paid: "已付", receipt: "付款收据" } : { paid: "已付", receipt: "付款收據" };
  const paid = rt ? rt.paid.replace("{amount}", r.amount) : `${w.paid} ${r.amount}`;
  return {
    html: `
    <p style="font-size:13px;color:${INK_66};line-height:1.7;margin:0 0 18px;">${esc(paid)} · <a href="${esc(r.url)}" style="color:${INK};">${esc(w.receipt)} →</a></p>`,
    text: [`${paid} · ${w.receipt}: ${r.url}`],
  };
}

/** 10-29 进度表 128: the two tarot letters' words, in the spread's language (lib/tarot-text.ts `mail`) */
export interface TarotMailText {
  readySubject: string; readyLead: string; readyBtn: string; readyMore: string; readyCast: string; foot: string;
  rvSubject: string; rvAsked: string; rvOutcome: string; rvPlan: string; rvLead: string; rvPage: string; rvFoot: string;
}

export function buildTarotEmail(i: { t: TarotMailText; locale: Locale; cards: string; url: string; receipt?: PaidReceipt | null }): { subject: string; html: string; text: string } {
  const t = i.t;
  const rc = receiptLine(i.receipt, i.locale);
  const subject = t.readySubject;
  const html = `<!doctype html>
<html lang="${htmlLang(i.locale)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BODY}">
  <div style="max-width:560px;margin:0 auto;padding:44px 24px 40px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:${INK_50};margin:0 0 32px;">YaoFlow</p>
    <p style="font-size:22px;line-height:1.4;margin:0 0 16px;">${esc(i.cards)}</p>
    <p style="font-size:15px;line-height:1.8;color:${INK_86};margin:0 0 22px;">${esc(t.readyLead)}</p>
    <p style="margin:0 0 22px;"><a href="${esc(i.url)}" style="${BTN}padding:12px 26px;border-radius:2px;font-size:14px;">${esc(t.readyBtn)}</a></p>
    <p style="font-size:14px;line-height:1.8;color:${INK_86};margin:0 0 10px;">${esc(t.readyMore)}</p>
    <p style="font-size:14px;line-height:1.8;color:${INK_86};margin:0 0 22px;"><a href="${esc(i.url)}#cast" style="color:${INK_86};">${esc(t.readyCast)}</a></p>${rc.html}
    <hr style="border:none;border-top:1px solid ${RULE};margin:8px 0 16px;">
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(t.foot)}</p>
  </div>
</body>
</html>`;
  const text = [i.cards, "", t.readyLead, i.url, "", t.readyMore, `${t.readyCast} ${i.url}#cast`, ...(rc.text.length ? ["", ...rc.text] : []), "", t.foot].join("\n");
  return { subject, html, text };
}

/** The day the reader chose: what happened? Four one-tap answers. */
export function buildTarotRevisitEmail(i: { t: TarotMailText; locale: Locale; question: string; outcome: string | null; plan?: string | null; links: { label: string; url: string }[]; pageUrl: string }): { subject: string; html: string; text: string } {
  const t = i.t;
  const fill = (s: string, k: string, v: string) => s.split(`{${k}}`).join(v);
  const subject = t.rvSubject;
  const html = `<!doctype html>
<html lang="${htmlLang(i.locale)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BODY}">
  <div style="max-width:560px;margin:0 auto;padding:44px 24px 40px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:${INK_50};margin:0 0 32px;">YaoFlow</p>
    <p style="font-size:15px;line-height:1.8;color:${INK_86};margin:0 0 8px;">${esc(t.rvAsked)}</p>
    <p style="font-size:19px;line-height:1.5;margin:0 0 18px;">${esc(i.question)}</p>
    ${i.outcome ? `<p style="font-size:14px;line-height:1.8;color:${INK_86};margin:0 0 18px;">${esc(fill(t.rvOutcome, "o", i.outcome))}</p>` : ""}
    ${i.plan ? `<p style="font-size:14px;line-height:1.8;color:${INK_66};margin:-10px 0 18px;">${esc(fill(t.rvPlan, "p", i.plan))}</p>` : ""}
    <p style="font-size:15px;line-height:1.8;color:${INK_86};margin:0 0 16px;">${esc(t.rvLead)}</p>
    <p style="margin:0 0 22px;">${i.links.map((l) => `<a href="${esc(l.url)}" style="${BTN_LINE}padding:10px 18px;border-radius:2px;font-size:14px;margin:0 8px 8px 0;">${esc(l.label)}</a>`).join("")}</p>
    <p style="font-size:13px;line-height:1.8;color:${INK_50};margin:0 0 22px;"><a href="${esc(i.pageUrl)}" style="color:${INK_50};">${esc(t.rvPage)}</a></p>
    <hr style="border:none;border-top:1px solid ${RULE};margin:8px 0 16px;">
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(t.rvFoot)} ${esc(t.foot)}</p>
  </div>
</body>
</html>`;
  const text = [t.rvAsked, i.question, ...(i.outcome ? ["", fill(t.rvOutcome, "o", i.outcome)] : []), ...(i.plan ? [fill(t.rvPlan, "p", i.plan)] : []), "", t.rvLead, ...i.links.map((l) => `${l.label}: ${l.url}`), "", `${t.rvPage} ${i.pageUrl}`].join("\n");
  return { subject, html, text };
}

/** 10-17 进度表 70 擇日: the day before the date the reader picked — the matter, the day's almanac, a way to stop it. */
/** 10-18 (Neil: 设了提醒没收到信): right away, a short note that the reminder is kept, with the day and a cancel link */
export function buildZeriSetEmail(i: { matter: string; date: string; lunar: string; sendOn: string; dayUrl: string; cancelUrl: string }): { subject: string; html: string; text: string } {
  const subject = `已記下：${i.date} ${i.matter}`;
  const html = `<!doctype html>
<html lang="zh-Hant">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BODY}">
  <div style="max-width:560px;margin:0 auto;padding:44px 24px 40px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:${INK_50};margin:0 0 32px;">YaoFlow</p>
    <p style="font-size:22px;line-height:1.4;margin:0 0 12px;">${esc(i.date)}（${esc(i.lunar)}）${esc(i.matter)}</p>
    <p style="font-size:15px;line-height:1.8;color:${INK_86};margin:0 0 18px;">這一天記下了。${esc(i.sendOn)}早上會再寄一封信提醒你；那天過了三天，再問你一句辦得順不順。</p>
    <p style="margin:0 0 22px;"><a href="${esc(i.dayUrl)}" style="${BTN}padding:12px 26px;border-radius:2px;font-size:14px;">看這天的黃曆</a></p>
    <hr style="border:none;border-top:1px solid ${RULE};margin:8px 0 16px;">
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">不需要這個提醒了？<a href="${esc(i.cancelUrl)}" style="color:${INK_50};">取消</a>。</p>
  </div>
</body>
</html>`;
  const text = [`${i.date}（${i.lunar}）${i.matter}`, "", `這一天記下了。${i.sendOn}早上會再寄一封信提醒你；那天過了三天，再問你一句辦得順不順。`, `看這天的黃曆：${i.dayUrl}`, "", `不需要這個提醒了？取消：${i.cancelUrl}`].join("\n");
  return { subject, html, text };
}

export function buildZeriRemindEmail(i: { matter: string; date: string; lunar: string; dayUrl: string; castUrl: string; cancelUrl: string; yi: string }): { subject: string; html: string; text: string } {
  const subject = `明天是你選的${i.matter}日子`;
  const html = `<!doctype html>
<html lang="zh-Hant">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BODY}">
  <div style="max-width:560px;margin:0 auto;padding:44px 24px 40px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:${INK_50};margin:0 0 32px;">YaoFlow</p>
    <p style="font-size:22px;line-height:1.4;margin:0 0 12px;">明天 ${esc(i.date)}（${esc(i.lunar)}）</p>
    <p style="font-size:15px;line-height:1.8;color:${INK_86};margin:0 0 18px;">這是你選來${esc(i.matter)}的日子。通書寫這天宜${esc(i.yi)}。</p>
    <p style="margin:0 0 22px;"><a href="${esc(i.dayUrl)}" style="${BTN}padding:12px 26px;border-radius:2px;font-size:14px;">看明天的黃曆</a></p>
    <p style="font-size:14px;line-height:1.8;color:${INK_86};margin:0 0 22px;">想知道這件事順不順、哪幾天有動靜，<a href="${esc(i.castUrl)}" style="color:${INK_86};">起一卦看看</a>。</p>
    <hr style="border:none;border-top:1px solid ${RULE};margin:8px 0 16px;">
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">不需要這個提醒了？<a href="${esc(i.cancelUrl)}" style="color:${INK_50};">取消</a>。民間通書常見宜忌，各家不一，僅供參考。</p>
  </div>
</body>
</html>`;
  const text = [`明天 ${i.date}（${i.lunar}）`, "", `這是你選來${i.matter}的日子。通書寫這天宜${i.yi}。`, `看明天的黃曆：${i.dayUrl}`, "", `想知道這件事順不順、哪幾天有動靜，起一卦：${i.castUrl}`, "", `不需要這個提醒了？取消：${i.cancelUrl}`].join("\n");
  return { subject, html, text };
}

/**
 * 10-18 八字②③④: the report is written — the link (once per report, lib/mingli/bazi/report.ts mailBaziOnce).
 * The same words as the report page's fixed copy (report-facts REPORT_UI), in both scripts.
 */
const BAZI_MAIL = {
  hant: {
    subject: { deep: "你的八字深度報告寫好了", love: "你的正緣畫像寫好了", year: "你的流年報告寫好了" },
    title: { deep: "八字深度報告", love: "正緣畫像", year: "流年報告" },
    body: { deep: "十一章的八字深度報告已經寫好了，之後也能隨時從這封信回去看。", love: "你的正緣畫像已經寫好了，之後也能隨時從這封信回去看。", year: "你的流年報告已經寫好了，十二個月逐月都在裡面，之後也能隨時從這封信回去看。" },
    button: "打開我的報告", foot: "有問題直接回覆這封信。", lang: "zh-Hant",
  },
  hans: {
    subject: { deep: "你的八字深度报告写好了", love: "你的正缘画像写好了", year: "你的流年报告写好了" },
    title: { deep: "八字深度报告", love: "正缘画像", year: "流年报告" },
    body: { deep: "十一章的八字深度报告已经写好了，之后也能随时从这封信回去看。", love: "你的正缘画像已经写好了，之后也能随时从这封信回去看。", year: "你的流年报告已经写好了，十二个月逐月都在里面，之后也能随时从这封信回去看。" },
    button: "打开我的报告", foot: "有问题直接回复这封信。", lang: "zh-Hans",
  },
};
export function buildBaziReportEmail(i: { kind: "deep" | "love" | "year"; url: string; hans?: boolean; foreign?: { t: ReportMailText; lang: string } }): { subject: string; html: string; text: string } {
  // 10-30 进度表 128 ④: a report written for a page in another language — its letter in that language (one kind per letter)
  const f = i.foreign;
  const t = f
    ? { subject: { deep: f.t.subject, love: f.t.subject, year: f.t.subject }, title: { deep: f.t.title, love: f.t.title, year: f.t.title }, body: { deep: f.t.body, love: f.t.body, year: f.t.body }, button: f.t.button, foot: f.t.foot, lang: f.lang }
    : i.hans ? BAZI_MAIL.hans : BAZI_MAIL.hant;
  const subject = t.subject[i.kind];
  const html = `<!doctype html>
<html lang="${t.lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BODY}">
  <div style="max-width:560px;margin:0 auto;padding:44px 24px 40px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:${INK_50};margin:0 0 32px;">YaoFlow</p>
    <p style="font-size:22px;line-height:1.4;margin:0 0 16px;">${esc(t.title[i.kind])}</p>
    <p style="font-size:15px;line-height:1.8;color:${INK_86};margin:0 0 22px;">${esc(t.body[i.kind])}</p>
    <p style="margin:0 0 22px;"><a href="${esc(i.url)}" style="${BTN}padding:12px 26px;border-radius:2px;font-size:14px;">${esc(t.button)}</a></p>
    <hr style="border:none;border-top:1px solid ${RULE};margin:8px 0 16px;">
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(t.foot)}</p>
  </div>
</body>
</html>`;
  const text = [t.title[i.kind], "", t.body[i.kind], i.url, "", t.foot].join("\n");
  return { subject, html, text };
}

/** 10-20 紫微②③: the letter with the link to a 紫微 report (深度報告 / 年書), same layout as the 八字 one */
const ZIWEI_MAIL = {
  hant: {
    subject: { deep: "你的紫微深度報告寫好了", year: "你的紫微年書寫好了" },
    title: { deep: "紫微深度報告", year: "紫微年書" },
    body: { deep: "十二章的紫微深度報告已經寫好了，之後也能隨時從這封信回去看。", year: "你的紫微年書已經寫好了，十二個農曆月逐月都在裡面（每個月都標了國曆日期），之後也能隨時從這封信回去看。" },
    button: "打開我的報告", foot: "有問題直接回覆這封信。", lang: "zh-Hant",
  },
  hans: {
    subject: { deep: "你的紫微深度报告写好了", year: "你的紫微年书写好了" },
    title: { deep: "紫微深度报告", year: "紫微年书" },
    body: { deep: "十二章的紫微深度报告已经写好了，之后也能随时从这封信回去看。", year: "你的紫微年书已经写好了，十二个农历月逐月都在里面（每个月都标了公历日期），之后也能随时从这封信回去看。" },
    button: "打开我的报告", foot: "有问题直接回复这封信。", lang: "zh-Hans",
  },
};
export function buildZiweiReportEmail(i: { kind: "deep" | "year"; url: string; hans?: boolean; foreign?: { t: ReportMailText; lang: string } }): { subject: string; html: string; text: string } {
  // 10-30 进度表 128 ④: a report written for a page in another language — its letter in that language
  const f = i.foreign;
  const t = f
    ? { subject: { deep: f.t.subject, year: f.t.subject }, title: { deep: f.t.title, year: f.t.title }, body: { deep: f.t.body, year: f.t.body }, button: f.t.button, foot: f.t.foot, lang: f.lang }
    : i.hans ? ZIWEI_MAIL.hans : ZIWEI_MAIL.hant;
  const subject = t.subject[i.kind];
  const html = `<!doctype html>
<html lang="${t.lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BODY}">
  <div style="max-width:560px;margin:0 auto;padding:44px 24px 40px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:${INK_50};margin:0 0 32px;">YaoFlow</p>
    <p style="font-size:22px;line-height:1.4;margin:0 0 16px;">${esc(t.title[i.kind])}</p>
    <p style="font-size:15px;line-height:1.8;color:${INK_86};margin:0 0 22px;">${esc(t.body[i.kind])}</p>
    <p style="margin:0 0 22px;"><a href="${esc(i.url)}" style="${BTN}padding:12px 26px;border-radius:2px;font-size:14px;">${esc(t.button)}</a></p>
    <hr style="border:none;border-top:1px solid ${RULE};margin:8px 0 16px;">
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(t.foot)}</p>
  </div>
</body>
</html>`;
  const text = [t.title[i.kind], "", t.body[i.kind], i.url, "", t.foot].join("\n");
  return { subject, html, text };
}

/** 10-20 星盤②③: the letter with the link to a 星盤 report (深度報告 / 年報), same layout as the 紫微 one */
const ASTRO_MAIL = {
  hant: {
    subject: { deep: "你的星盤深度報告寫好了", year: "你的星盤年報寫好了" },
    title: { deep: "星盤深度報告", year: "星盤年報" },
    body: { deep: "十章的星盤深度報告已經寫好了，之後也能隨時從這封信回去看。", year: "你的星盤年報已經寫好了，十二個月逐月都在裡面（日期都是國曆），之後也能隨時從這封信回去看。" },
    button: "打開我的報告", foot: "有問題直接回覆這封信。", lang: "zh-Hant",
  },
  hans: {
    subject: { deep: "你的星盘深度报告写好了", year: "你的星盘年报写好了" },
    title: { deep: "星盘深度报告", year: "星盘年报" },
    body: { deep: "十章的星盘深度报告已经写好了，之后也能随时从这封信回去看。", year: "你的星盘年报已经写好了，十二个月逐月都在里面（日期都是公历），之后也能随时从这封信回去看。" },
    button: "打开我的报告", foot: "有问题直接回复这封信。", lang: "zh-Hans",
  },
};
/** 10-30 进度表 128 ④: a foreign page's letter carries its own words (lib/mingli/astro/page-ui.ts REPORT.mail) */
export type ReportMailText = { subject: string; title: string; body: string; button: string; foot: string };
export function buildAstroReportEmail(i: { kind: "deep" | "year"; url: string; hans?: boolean; foreign?: { t: ReportMailText; lang: string } }): { subject: string; html: string; text: string } {
  const f = i.foreign;
  const t = f
    ? { subject: { deep: f.t.subject, year: f.t.subject }, title: { deep: f.t.title, year: f.t.title }, body: { deep: f.t.body, year: f.t.body }, button: f.t.button, foot: f.t.foot, lang: f.lang }
    : i.hans ? ASTRO_MAIL.hans : ASTRO_MAIL.hant;
  const subject = t.subject[i.kind];
  const html = `<!doctype html>
<html lang="${t.lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BODY}">
  <div style="max-width:560px;margin:0 auto;padding:44px 24px 40px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:${INK_50};margin:0 0 32px;">YaoFlow</p>
    <p style="font-size:22px;line-height:1.4;margin:0 0 16px;">${esc(t.title[i.kind])}</p>
    <p style="font-size:15px;line-height:1.8;color:${INK_86};margin:0 0 22px;">${esc(t.body[i.kind])}</p>
    <p style="margin:0 0 22px;"><a href="${esc(i.url)}" style="${BTN}padding:12px 26px;border-radius:2px;font-size:14px;">${esc(t.button)}</a></p>
    <hr style="border:none;border-top:1px solid ${RULE};margin:8px 0 16px;">
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(t.foot)}</p>
  </div>
</body>
</html>`;
  const text = [t.title[i.kind], "", t.body[i.kind], i.url, "", t.foot].join("\n");
  return { subject, html, text };
}

/** 10-20 合盤: the letter with the link to a 合盤報告, same layout as the 星盤 one */
const NIANSHU_MAIL = {
  hant: { subject: "你的年書寫好了", title: "年書", body: "你的年書已經寫好了：八字、紫微、星盤三套合看的這一年，加上三篇各自的逐月細節，之後也能隨時從這封信回去看。", button: "打開年書", foot: "有問題直接回覆這封信。", lang: "zh-Hant" },
  hans: { subject: "你的年书写好了", title: "年书", body: "你的年书已经写好了：八字、紫微、星盘三套合看的这一年，加上三篇各自的逐月细节，之后也能随时从这封信回去看。", button: "打开年书", foot: "有问题直接回复这封信。", lang: "zh-Hans" },
};
/** 10-21 三合一年書 — the letter with the link, as the 合盤 one */
export function buildNianshuEmail(i: { url: string; hans?: boolean; receipt?: PaidReceipt | null; foreign?: { t: ReportMailText; lang: string; locale: Locale } }): { subject: string; html: string; text: string } {
  // 10-30 进度表 128 ④-5: a 年書 written for a page in another language — its letter (and its receipt line) in that language
  const t = i.foreign ? { ...i.foreign.t, lang: i.foreign.lang } : i.hans ? NIANSHU_MAIL.hans : NIANSHU_MAIL.hant;
  const rc = receiptLine(i.receipt, i.foreign ? i.foreign.locale : !!i.hans);
  const html = `<!doctype html>
<html lang="${t.lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BODY}">
  <div style="max-width:560px;margin:0 auto;padding:44px 24px 40px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:${INK_50};margin:0 0 32px;">YaoFlow</p>
    <p style="font-size:22px;line-height:1.4;margin:0 0 16px;">${esc(t.title)}</p>
    <p style="font-size:15px;line-height:1.8;color:${INK_86};margin:0 0 22px;">${esc(t.body)}</p>
    <p style="margin:0 0 22px;"><a href="${esc(i.url)}" style="${BTN}padding:12px 26px;border-radius:2px;font-size:14px;">${esc(t.button)}</a></p>${rc.html}
    <hr style="border:none;border-top:1px solid ${RULE};margin:8px 0 16px;">
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(t.foot)}</p>
  </div>
</body>
</html>`;
  const text = [t.title, "", t.body, i.url, ...(rc.text.length ? ["", ...rc.text] : []), "", t.foot].join("\n");
  return { subject: t.subject, html, text };
}

const HEPAN_MAIL = {
  hant: { subject: "你們的合盤報告寫好了", title: "合盤報告", body: "你和 TA 的合盤報告已經寫好了：兩個人的底色、吸引、相處節奏、摩擦與怎麼接、溝通、生活、長期功課和今年的互動都在裡面，之後也能隨時從這封信回去看。", button: "打開合盤報告", foot: "有問題直接回覆這封信。", lang: "zh-Hant" },
  hans: { subject: "你们的合盘报告写好了", title: "合盘报告", body: "你和 TA 的合盘报告已经写好了：两个人的底色、吸引、相处节奏、摩擦与怎么接、沟通、生活、长期功课和今年的互动都在里面，之后也能随时从这封信回去看。", button: "打开合盘报告", foot: "有问题直接回复这封信。", lang: "zh-Hans" },
};
/**
 * 10-22 (客服核对): a report page says of a chapter that did not get written 「我們會補上，寫好會寄信通知你」. This is that
 * letter — once, when the background mend (lib/mingli/report-mend.ts) has every chapter in. Same layout as the others.
 */
export type MendedSys = "bazi" | "ziwei" | "astro" | "hepan" | "nianshu";
/** 10-30 进度表 128 ④: the same letter for a report written for a page in another language ({name} = the report's name there) */
const MENDED_FOREIGN: Record<string, { subject: string; body: string; button: string; foot: string }> = {
  en: { subject: "{name}: the missing chapter is in", body: "The chapter that wasn't written last time is now in, and every chapter is there. You can come back to it anytime from this email.", button: "Open my report", foot: "Questions? Just reply to this email." },
  ja: { subject: "{name}の残りの章を書き足しました", body: "前回書けなかった章を書き足し、すべての章がそろいました。このメールからいつでも読み返せます。", button: "レポートを開く", foot: "ご不明な点は、このメールにそのまま返信してください。" },
  ko: { subject: "{name}의 빠진 장을 채웠습니다", body: "지난번에 쓰지 못한 장을 채워 이제 모든 장이 다 있습니다. 이 메일에서 언제든 다시 볼 수 있습니다.", button: "내 리포트 열기", foot: "궁금한 점은 이 메일에 바로 답장해 주세요." },
  fr: { subject: "{name} : le chapitre manquant est là", body: "Le chapitre qui n'avait pas pu être écrit la dernière fois est maintenant ajouté : tous les chapitres sont là. Vous pouvez y revenir à tout moment depuis cet e-mail.", button: "Ouvrir mon rapport", foot: "Une question ? Répondez simplement à cet e-mail." },
  de: { subject: "{name}: Das fehlende Kapitel ist da", body: "Das Kapitel, das beim letzten Mal nicht geschrieben wurde, ist jetzt ergänzt – alle Kapitel sind vollständig. Über diese E-Mail kannst du jederzeit zurückkehren.", button: "Meinen Bericht öffnen", foot: "Fragen? Antworte einfach auf diese E-Mail." },
  es: { subject: "{name}: ya está el capítulo que faltaba", body: "El capítulo que no se pudo escribir la última vez ya está añadido: están todos los capítulos. Puedes volver a él cuando quieras desde este correo.", button: "Abrir mi informe", foot: "¿Dudas? Responde a este correo." },
  pt: { subject: "{name}: o capítulo que faltava já está aí", body: "O capítulo que não foi escrito da última vez já foi adicionado: todos os capítulos estão lá. Você pode voltar a ele quando quiser por este e-mail.", button: "Abrir meu relatório", foot: "Dúvidas? É só responder a este e-mail." },
};
export function buildReportMendedEmail(i: { sys: MendedSys; kind?: string | null; url: string; hans?: boolean; foreign?: { l: string; name: string; lang: string } }): { subject: string; html: string; text: string } {
  const fo = i.foreign && MENDED_FOREIGN[i.foreign.l] ? i.foreign : null;
  if (fo) {
    const m = MENDED_FOREIGN[fo.l]!;
    return mendedLetter(fo.name, { subject: m.subject.replace("{name}", fo.name), body: m.body, button: m.button, foot: m.foot, lang: fo.lang }, i.url);
  }
  const h = !!i.hans;
  const k2 = i.kind === "year" ? "year" : "deep";
  const name = i.sys === "bazi" ? (h ? BAZI_MAIL.hans : BAZI_MAIL.hant).title[i.kind === "love" ? "love" : k2]
    : i.sys === "ziwei" ? (h ? ZIWEI_MAIL.hans : ZIWEI_MAIL.hant).title[k2]
    : i.sys === "astro" ? (h ? ASTRO_MAIL.hans : ASTRO_MAIL.hant).title[k2]
    : i.sys === "hepan" ? (h ? HEPAN_MAIL.hans : HEPAN_MAIL.hant).title
    : (h ? NIANSHU_MAIL.hans : NIANSHU_MAIL.hant).title;
  const whose = i.sys === "hepan" ? (h ? "你们的" : "你們的") : "你的";
  const t = h
    ? { subject: `${whose}${name}补好了`, body: "上次没写成的那一章已经补上了，现在每一章都在。之后也能随时从这封信回去看。", button: "打开我的报告", foot: "有问题直接回复这封信。", lang: "zh-Hans" }
    : { subject: `${whose}${name}補好了`, body: "上次沒寫成的那一章已經補上了，現在每一章都在。之後也能隨時從這封信回去看。", button: "打開我的報告", foot: "有問題直接回覆這封信。", lang: "zh-Hant" };
  return mendedLetter(name, t, i.url);
}
function mendedLetter(name: string, t: { subject: string; body: string; button: string; foot: string; lang: string }, url: string): { subject: string; html: string; text: string } {
  const html = `<!doctype html>
<html lang="${t.lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BODY}">
  <div style="max-width:560px;margin:0 auto;padding:44px 24px 40px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:${INK_50};margin:0 0 32px;">YaoFlow</p>
    <p style="font-size:22px;line-height:1.4;margin:0 0 16px;">${esc(name)}</p>
    <p style="font-size:15px;line-height:1.8;color:${INK_86};margin:0 0 22px;">${esc(t.body)}</p>
    <p style="margin:0 0 22px;"><a href="${esc(url)}" style="${BTN}padding:12px 26px;border-radius:2px;font-size:14px;">${esc(t.button)}</a></p>
    <hr style="border:none;border-top:1px solid ${RULE};margin:8px 0 16px;">
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(t.foot)}</p>
  </div>
</body>
</html>`;
  const text = [name, "", t.body, url, "", t.foot].join("\n");
  return { subject: t.subject, html, text };
}

export function buildHepanReportEmail(i: { url: string; hans?: boolean; receipt?: PaidReceipt | null; foreign?: { t: ReportMailText; lang: string; locale: Locale } }): { subject: string; html: string; text: string } {
  // 10-30 进度表 128 ④: a report written for a page in another language — its letter (and its receipt line) in that language
  const t = i.foreign ? { ...i.foreign.t, lang: i.foreign.lang } : i.hans ? HEPAN_MAIL.hans : HEPAN_MAIL.hant;
  const rc = receiptLine(i.receipt, i.foreign ? i.foreign.locale : !!i.hans);
  const html = `<!doctype html>
<html lang="${t.lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BODY}">
  <div style="max-width:560px;margin:0 auto;padding:44px 24px 40px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:${INK_50};margin:0 0 32px;">YaoFlow</p>
    <p style="font-size:22px;line-height:1.4;margin:0 0 16px;">${esc(t.title)}</p>
    <p style="font-size:15px;line-height:1.8;color:${INK_86};margin:0 0 22px;">${esc(t.body)}</p>
    <p style="margin:0 0 22px;"><a href="${esc(i.url)}" style="${BTN}padding:12px 26px;border-radius:2px;font-size:14px;">${esc(t.button)}</a></p>${rc.html}
    <hr style="border:none;border-top:1px solid ${RULE};margin:8px 0 16px;">
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(t.foot)}</p>
  </div>
</body>
</html>`;
  const text = [t.title, "", t.body, i.url, ...(rc.text.length ? ["", ...rc.text] : []), "", t.foot].join("\n");
  return { subject: t.subject, html, text };
}

/* 10-29 进度表 122 姓名學: the 取名／改名參考 is written — the same layout as the 合盤 letter */
const NAME_MAIL = {
  hant: { subject: { baby: "寶寶取名參考寫好了", rename: "改名參考寫好了" }, title: { baby: "寶寶取名參考", rename: "改名參考" }, body: "候選的字、組好的名字，每個都附字義、讀音、筆劃與五格，之後也能隨時從這封信回去看。名字是要叫一輩子的，讀起來順、意思喜歡最重要。", button: "打開報告", foot: "有問題直接回覆這封信。", lang: "zh-Hant" },
  hans: { subject: { baby: "宝宝取名参考写好了", rename: "改名参考写好了" }, title: { baby: "宝宝取名参考", rename: "改名参考" }, body: "候选的字、组好的名字，每个都附字义、读音、笔划与五格，之后也能随时从这封信回去看。名字是要叫一辈子的，读起来顺、意思喜欢最重要。", button: "打开报告", foot: "有问题直接回复这封信。", lang: "zh-Hans" },
};
export function buildNameReportEmail(i: { url: string; kind: "baby" | "rename"; hans?: boolean; receipt?: PaidReceipt | null }): { subject: string; html: string; text: string } {
  const t = i.hans ? NAME_MAIL.hans : NAME_MAIL.hant;
  const rc = receiptLine(i.receipt, !!i.hans);
  const title = t.title[i.kind];
  const html = `<!doctype html>
<html lang="${t.lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BODY}">
  <div style="max-width:560px;margin:0 auto;padding:44px 24px 40px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:${INK_50};margin:0 0 32px;">YaoFlow</p>
    <p style="font-size:22px;line-height:1.4;margin:0 0 16px;">${esc(title)}</p>
    <p style="font-size:15px;line-height:1.8;color:${INK_86};margin:0 0 22px;">${esc(t.body)}</p>
    <p style="margin:0 0 22px;"><a href="${esc(i.url)}" style="${BTN}padding:12px 26px;border-radius:2px;font-size:14px;">${esc(t.button)}</a></p>${rc.html}
    <hr style="border:none;border-top:1px solid ${RULE};margin:8px 0 16px;">
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(t.foot)}</p>
  </div>
</body>
</html>`;
  const text = [title, "", t.body, i.url, ...(rc.text.length ? ["", ...rc.text] : []), "", t.foot].join("\n");
  return { subject: t.subject[i.kind], html, text };
}

/* ---------------- 10-23 进度表 103 公告信：10 月产品与会员更新 ---------------- */

/**
 * The one announcement letter (lib/announce-1023.ts decides who gets it). `prices` are already formatted in the reader's
 * currency; `pass` / `member` add the one line for a pass holder / a member. Copy: lib/dict/announce-1023.ts.
 */
export function buildAnnounceEmail(i: {
  locale: "zh-hant" | "zh"; prices: { p1: string; p1first: string; p7: string; p30: string; one: string; month: string; first: string };
  pass: boolean; member: boolean; site: string; unsubUrl: string; subjectPrefix?: string;
}): { subject: string; html: string; text: string } {
  const t = ANNOUNCE_T[i.locale];
  const fill = (x: string) => x.replace(/\{(\w+)\}/g, (m, k: string) => (k in i.prices ? i.prices[k as keyof typeof i.prices] : m));
  const strong = (x: string) => esc(fill(x)).replace(/\*\*(.+?)\*\*/g, `<strong style="color:${INK};font-weight:600;">$1</strong>`);
  const plain = (x: string) => fill(x).replace(/\*\*(.+?)\*\*/g, "$1");
  const home = `${i.site}/${i.locale}`;
  const cta = `${home}?c=announce1023`;
  const terms = `${home}/terms`, privacy = `${home}/privacy`;
  const P = (x: string) => `<p style="font-size:15px;line-height:1.85;margin:0 0 12px;color:${INK_86};">${x}</p>`;
  const H = (x: string) => `<p style="font-size:17px;line-height:1.5;margin:30px 0 12px;color:${INK};font-weight:600;">${esc(x)}</p>`;
  const SUB = (x: string) => `<p style="font-size:15px;line-height:1.6;margin:16px 0 6px;color:${INK};font-weight:600;">${esc(x)}</p>`;
  const UL = (items: string[]) => `<ul style="margin:0 0 12px;padding-left:22px;">${items.map((x) => `<li style="font-size:15px;line-height:1.8;margin:0 0 4px;color:${INK_86};">${strong(x)}</li>`).join("")}</ul>`;
  const link = (url: string, label: string) => `<a href="${esc(url)}" style="color:${INK};">${esc(label)}</a>`;
  const body = [
    P(strong(t.hello)), P(strong(t.intro)), P(strong(t.keep)),
    H(t.s1Title),
    ...t.s1Groups.flatMap((g) => [SUB(g.title), UL(g.items)]),
    P(strong(t.s1Name)),
    H(t.s2Title), P(strong(t.s2Lead)), UL(t.s2Prices), P(strong(t.s2Time)), P(strong(t.s2Incl)), P(strong(t.s2Guarantee)), P(strong(t.s2Single)),
    ...(i.pass ? [P(strong(t.passHolder))] : []),
    H(t.s3Title), P(strong(t.s3Lead)), UL(t.s3Items), P(strong(t.s3Tag)),
    ...(i.member ? [P(strong(t.member))] : []),
    H(t.s4Title), P(`${strong(t.s4Body)}${link(terms, t.terms)}${esc(t.sep)}${link(privacy, t.privacy)}`),
  ].join("\n    ");
  const html = `<!doctype html>
<html lang="${htmlLang(i.locale)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BODY}">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${PAPER};">${esc(t.preheader)}</div>
  <div style="max-width:560px;margin:0 auto;padding:44px 24px 40px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:${INK_50};margin:0 0 32px;">YaoFlow</p>
    ${body}
    <hr style="border:none;border-top:1px solid ${RULE};margin:30px 0 18px;">
    ${P(`${esc(t.outro1)}${link(cta, cta.replace(/^https?:\/\//, "").replace(/\?.*$/, ""))}`)}
    ${P(esc(t.outro2))}
    <p style="font-size:15px;line-height:1.7;margin:18px 0 28px;color:${INK_86};">${esc(t.sign)}<br>${link(`mailto:${CONTACT_EMAIL}`, CONTACT_EMAIL)}</p>
    <hr style="border:none;border-top:1px solid ${RULE};margin:0 0 14px;">
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(t.unsubLine)} <a href="${esc(i.unsubUrl)}" style="color:${INK_50};">${esc(t.unsub)}</a></p>
  </div>
</body>
</html>`;
  const text = [
    plain(t.hello), "", plain(t.intro), "", plain(t.keep), "",
    t.s1Title, ...t.s1Groups.flatMap((g) => ["", g.title, ...g.items.map((x) => `- ${plain(x)}`)]), "", plain(t.s1Name), "",
    t.s2Title, "", plain(t.s2Lead), ...t.s2Prices.map((x) => `- ${plain(x)}`), "", plain(t.s2Time), "", plain(t.s2Incl), "", plain(t.s2Guarantee), "", plain(t.s2Single),
    ...(i.pass ? ["", plain(t.passHolder)] : []), "",
    t.s3Title, "", plain(t.s3Lead), ...t.s3Items.map((x) => `- ${plain(x)}`), "", plain(t.s3Tag),
    ...(i.member ? ["", plain(t.member)] : []), "",
    t.s4Title, "", `${plain(t.s4Body)}${t.terms} ${terms}${t.sep}${t.privacy} ${privacy}`, "",
    `${t.outro1}${cta}`, "", t.outro2, "", t.sign, CONTACT_EMAIL, "", `${t.unsubLine}${t.unsub}: ${i.unsubUrl}`,
  ].join("\n");
  return { subject: `${i.subjectPrefix ?? ""}${t.subject}`, html, text };
}



/**
 * 10-23 进度表 112 年书早鸟信 (11/1): the copy Neil read (lib/dict/nianshu-early.ts), laid out like the 10-23 announcement —
 * same paper, same type, the one-click unsubscribe at the foot. Prices already in the reader's money.
 */
export function buildNianshuEarlyEmail(i: { locale: "zh-hant" | "zh"; early: string; regular: string; url: string; unsubUrl: string; subjectPrefix?: string }): { subject: string; html: string; text: string } {
  const t = NIANSHU_EARLY_T[i.locale];
  const fill = (x: string) => x.replace(/\{early\}/g, i.early).replace(/\{regular\}/g, i.regular);
  const strong = (x: string) => esc(fill(x)).replace(/\*\*(.+?)\*\*/g, `<strong style="color:${INK};font-weight:600;">$1</strong>`);
  const plain = (x: string) => fill(x).replace(/\*\*(.+?)\*\*/g, "$1");
  const P = (x: string) => `<p style="font-size:15px;line-height:1.85;margin:0 0 12px;color:${INK_86};">${x}</p>`;
  const H = (x: string) => `<p style="font-size:17px;line-height:1.5;margin:28px 0 12px;color:${INK};font-weight:600;">${esc(x)}</p>`;
  const UL = (items: string[]) => `<ul style="margin:0 0 12px;padding-left:22px;">${items.map((x) => `<li style="font-size:15px;line-height:1.8;margin:0 0 4px;color:${INK_86};">${strong(x)}</li>`).join("")}</ul>`;
  const html = `<!doctype html>
<html lang="${htmlLang(i.locale)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BODY}">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${PAPER};">${esc(fill(t.preheader))}</div>
  <div style="max-width:560px;margin:0 auto;padding:44px 24px 40px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:${INK_50};margin:0 0 32px;">YaoFlow</p>
    ${P(esc(t.hello))}
    ${P(esc(t.intro))}
    ${H(t.whatTitle)}
    ${P(esc(t.whatLead))}
    ${UL(t.whatItems)}
    ${H(t.priceTitle)}
    ${UL(t.priceItems)}
    <p style="margin:22px 0 22px;"><a href="${esc(i.url)}" style="${BTN}padding:13px 28px;border-radius:2px;font-size:14px;letter-spacing:.06em;">${esc(t.see.replace(/[：:]$/, ""))} →</a></p>
    ${P(esc(t.free))}
    ${P(esc(t.help))}
    <p style="font-size:15px;line-height:1.7;margin:18px 0 28px;color:${INK_86};">${esc(t.sign)}</p>
    <hr style="border:none;border-top:1px solid ${RULE};margin:0 0 14px;">
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(t.unsubLine)} <a href="${esc(i.unsubUrl)}" style="color:${INK_50};">${esc(t.unsub)}</a></p>
  </div>
</body>
</html>`;
  const text = [t.hello, "", t.intro, "", t.whatTitle, t.whatLead, ...t.whatItems.map((x) => `- ${plain(x)}`), "", t.priceTitle, ...t.priceItems.map((x) => `- ${plain(x)}`), "",
    `${t.see}${i.url}`, "", t.free, "", t.help, "", t.sign, "", `${t.unsubLine}${t.unsub}: ${i.unsubUrl}`].join("\n");
  return { subject: `${i.subjectPrefix ?? ""}${t.subject}`, html, text };
}

/**
 * 10-23 进度表 107 ③ 分群群发 (lib/campaigns.ts): a letter the admin writes — the body as plain text with three marks:
 * a blank line between paragraphs, 「- 」 at the start of a list line, **bold**; bare links become links. Laid out like
 * the 10-23 announcement (same paper, same type), signed by 客服, with the one-click unsubscribe at the foot.
 */
export function buildCampaignEmail(i: { locale: "zh-hant" | "zh"; subject: string; body: string; unsubUrl: string; preheader?: string | null }): { subject: string; html: string; text: string } {
  const hant = i.locale === "zh-hant";
  const words = hant
    ? { sign: "爻流 YaoFlow 客服", unsubLine: "不想再收到這類通知？", unsub: "一鍵退訂" }
    : { sign: "爻流 YaoFlow 客服", unsubLine: "不想再收到这类通知？", unsub: "一键退订" };
  const linkify = (x: string) => x.replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)。，；：！？）」])/g, (u) => `<a href="${u}" style="color:${INK};">${u.replace(/^https?:\/\//, "")}</a>`);
  const strong = (x: string) => linkify(esc(x)).replace(/\*\*(.+?)\*\*/g, `<strong style="color:${INK};font-weight:600;">$1</strong>`);
  const plain = (x: string) => x.replace(/\*\*(.+?)\*\*/g, "$1");
  const blocks = i.body.replace(/\r\n/g, "\n").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const html_blocks = blocks.map((b) => {
    const lines = b.split("\n");
    if (lines.every((l) => /^- /.test(l))) {
      return `<ul style="margin:0 0 12px;padding-left:22px;">${lines.map((l) => `<li style="font-size:15px;line-height:1.8;margin:0 0 4px;color:${INK_86};">${strong(l.slice(2))}</li>`).join("")}</ul>`;
    }
    return `<p style="font-size:15px;line-height:1.85;margin:0 0 12px;color:${INK_86};">${lines.map(strong).join("<br>")}</p>`;
  }).join("\n    ");
  const html = `<!doctype html>
<html lang="${htmlLang(i.locale)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BODY}">
  ${i.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${PAPER};">${esc(i.preheader)}</div>` : ""}
  <div style="max-width:560px;margin:0 auto;padding:44px 24px 40px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:${INK_50};margin:0 0 32px;">YaoFlow</p>
    ${html_blocks}
    <p style="font-size:15px;line-height:1.7;margin:18px 0 28px;color:${INK_86};">${esc(words.sign)}<br><a href="mailto:${CONTACT_EMAIL}" style="color:${INK};">${CONTACT_EMAIL}</a></p>
    <hr style="border:none;border-top:1px solid ${RULE};margin:0 0 14px;">
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(words.unsubLine)} <a href="${esc(i.unsubUrl)}" style="color:${INK_50};">${esc(words.unsub)}</a></p>
  </div>
</body>
</html>`;
  const text = [...blocks.map((b) => plain(b)).flatMap((b) => [b, ""]), words.sign, CONTACT_EMAIL, "", `${words.unsubLine}${words.unsub}: ${i.unsubUrl}`].join("\n");
  return { subject: i.subject, html, text };
}

/* ---------------- 10-23 进度表 111: one plain service notice, for the letters that only tell the reader where things stand ---------------- */

export interface NoticeEmailInput {
  locale: Locale;
  subject: string;
  title: string;
  /** paragraphs in order — the first is the lead */
  paras: string[];
  /** a few facts in a box: 下次扣款 · 金額 (a `sub` line under a value) */
  card?: { k: string; v: string; sub?: string }[];
  perksTitle?: string;
  perks?: string[];
  /** small print after the list */
  notes?: string[];
  cta?: { label: string; url: string };
  links?: { label: string; url: string }[];
  /** the line before the rule — 「有任何問題，直接回這封信就好。」 */
  reply?: string | null;
}

/**
 * The paper, the type and the footer every letter has; no unsubscribe (these are about the reader's own purchase or
 * account). Used by the membership notices (lib/sub-letters.ts) and the other service letters 111 added.
 */
export function buildNoticeEmail(i: NoticeEmailInput): { subject: string; html: string; text: string } {
  const [lead, ...rest] = i.paras;
  const cell = (c: { k: string; v: string; sub?: string }) => `<td style="padding:0 22px 0 0;vertical-align:top;"><p style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${INK_50};margin:0 0 4px;">${esc(c.k)}</p><p style="font-size:15px;margin:0;color:${INK};white-space:nowrap;">${esc(c.v)}</p>${c.sub ? `<p style="font-size:12px;margin:3px 0 0;color:${INK_66};">${esc(c.sub)}</p>` : ""}</td>`;
  const html = `<!doctype html>
<html lang="${htmlLang(i.locale)}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="${BODY}">
  <div style="max-width:560px;margin:0 auto;padding:44px 24px 40px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:${INK_50};margin:0 0 36px;">YaoFlow</p>
    <p style="font-size:24px;line-height:1.4;margin:0 0 16px;color:${INK};">${esc(i.title)}</p>${lead ? `
    <p style="font-size:15px;line-height:1.85;color:${INK_86};margin:0 0 18px;">${esc(lead)}</p>` : ""}${i.card?.length ? `
    <table role="presentation" cellpadding="0" cellspacing="0" style="border:1px solid ${INK_30};border-radius:2px;margin:4px 0 24px;width:100%;">
      <tr><td style="padding:16px 20px 14px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>${i.card.map(cell).join("")}</tr></table></td></tr>
    </table>` : ""}${rest.map((p) => `
    <p style="font-size:14px;line-height:1.85;color:${INK_86};margin:0 0 14px;">${esc(p)}</p>`).join("")}${i.perks?.length ? `${i.perksTitle ? `
    <p style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:${GOLD_TEXT};margin:14px 0 4px;">${esc(i.perksTitle)}</p>` : ""}${perkList(i.perks)}` : ""}${(i.notes ?? []).map((n) => `
    <p style="font-size:13px;line-height:1.75;color:${INK_66};margin:0 0 12px;">${esc(n)}</p>`).join("")}${i.cta ? `
    <p style="margin:10px 0 18px;"><a href="${esc(i.cta.url)}" style="${BTN}padding:13px 28px;border-radius:2px;font-size:14px;letter-spacing:.06em;">${esc(i.cta.label)} →</a></p>` : ""}${(i.links ?? []).map((l) => `
    <p style="font-size:13px;line-height:1.7;margin:0 0 6px;"><a href="${esc(l.url)}" style="color:${INK};">${esc(l.label)} →</a></p>`).join("")}${i.reply ? `
    <p style="font-size:13px;line-height:1.7;color:${INK_66};margin:14px 0 24px;">${esc(i.reply)}</p>` : `
    <div style="height:18px;"></div>`}
    <hr style="border:none;border-top:1px solid ${RULE};margin:0 0 16px;">
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(contentFor(SEAL_EMAIL_T, i.locale).foot)}</p>
  </div>
</body>
</html>`;
  const text = [
    i.title, "",
    ...(lead ? [lead, ""] : []),
    ...(i.card?.length ? [i.card.map((c) => `${c.k}: ${c.v}${c.sub ? ` (${c.sub})` : ""}`).join(" · "), ""] : []),
    ...rest.flatMap((p) => [p, ""]),
    ...(i.perks?.length ? [...(i.perksTitle ? [i.perksTitle] : []), ...i.perks.map((s) => `· ${s}`), ""] : []),
    ...(i.notes ?? []).flatMap((n) => [n, ""]),
    ...(i.cta ? [`${i.cta.label}: ${i.cta.url}`] : []),
    ...(i.links ?? []).map((l) => `${l.label}: ${l.url}`),
    ...(i.reply ? ["", i.reply] : []),
    "", contentFor(SEAL_EMAIL_T, i.locale).foot,
  ].join("\n");
  return { subject: i.subject, html, text };
}
