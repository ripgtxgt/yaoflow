import { resolveCast, type LineValue } from "@yaoflow/engine";
import { db, unsubscribedAddress, type SubscriptionRow } from "./db";
import { buildSubLetter } from "./sub-letters";
import { buildEraseEmail } from "./erase-letters";
import { ackText } from "./support-ack";
import { asHtml as replyHtml } from "./support-auto";
import {
  buildDayOfEmail, buildHeadsUpEmail, buildMemberWelcomeEmail, buildPassOpenEmail, buildRecapEmail, buildRenewEmail, buildRetainEmail,
  buildRevisitDigestEmail, buildRevisitEmail, buildSavedFollowupEmail, buildTarotRevisitEmail, buildZeriRemindEmail, buildDailyEmail, buildRefundEmail, buildNoticeEmail,
} from "./email";
import { buildMemberLetter, letterPieces, type LetterPieces } from "./member-letter";
import { buildMonthLetter, monthBits, type MonthBits } from "./month-letter";
import { buildGenericLetter, genericBits } from "./month-letter-generic";
import { buildDecadeLetter, buildKeyMonthLetter } from "./milestone-letter";
import { buildTodayQianEmail, buildCardNoticeEmail } from "./today-qian-mail";
import { drawnOn, lotNumberFor, lotView, prefsFor } from "./today-qian";
import { buildPassNoticeEmail } from "./pass-notice";
import { buildRecoverOfferEmail } from "./recover-offer-mail";
import type { PendingRow } from "./recover-offer";
import { openLetterPerks, letterDate } from "./welcome";
import { dailyUnsubUrl } from "./daily-mail";
import { PILES, dailyValues } from "./daily";
import { tongkaT } from "./tongka";
import { formatMoney, firstMonthMinor, isCurrency, nianshuMinor, priceMinor, tongkaMinor, type Currency } from "./money";
import { hexName } from "./names";
import { homeDay } from "./clock";
import { unsubUrl } from "./unsub";
import { ANSWERS } from "./tarot";
import { tarotText } from "./tarot-text";
import { FOLLOWUP_LIMIT } from "./followup-limit";
import type { Locale } from "./locales";
import { letterOffSince, letterOn, type LetterSwitchId } from "./letter-switch";

/**
 * 10-23 进度表 108 ① 自动信件 (/admin/letters): every letter that goes out by itself, in one list — what it is, when it
 * goes, its switch, a sample rendered for one of our test readers (their own cast, chart or lot where the letter uses
 * one; sample facts where they have none), and its last seven days: sent, opened, unsubscribed after it, bounced or
 * called spam, failed. The words of a letter are changed in the code as before; this page shows them and can stop them.
 *
 * No switch on the letters that answer something the reader did or that the law wants sent: the opening letters of a
 * pass or a membership, the cancellation confirmation, the yearly renewal notice.
 */

export interface SampleReader { id: number | null; email: string; locale: "zh" | "zh-hant"; currency: Currency }
export interface Mail { subject: string; html: string; text: string }
type Stats = { mail: string; extra?: string } | { emails: string; prefix: string };
export interface AutoMail {
  id: string; name: string; when: string; group: string;
  /** the switch it answers to (two letters can share one); none = it cannot be turned off here */
  switchId: LetterSwitchId | null;
  noSwitch?: string;
  stats: Stats;
  statsNote?: string;
  sample: (r: SampleReader, site: string, now: number) => Promise<Mail>;
}

const DAY = 86_400_000;
const L = (r: SampleReader): Locale => r.locale;
const z = (r: SampleReader, hant: string, hans: string) => (r.locale === "zh" ? hans : hant);
const money = (r: SampleReader, minor: number) => formatMoney(r.currency, minor, r.locale);
const date = (r: SampleReader, ms: number) => letterDate(ms, r.locale, null);
const V: LineValue[] = [7, 8, 9, 8, 7, 8];

/** the test reader's latest cast, for the letters that are about one (a sample when they have none) */
function readerCast(r: SampleReader): { question: string; values: LineValue[]; sid: string } {
  if (r.id) {
    try {
      const c = db().prepare("SELECT c.question, c.values_str, o.session_id AS sid FROM casts c LEFT JOIN orders o ON o.cast_id = c.id WHERE c.customer_id = ? ORDER BY c.created_at DESC LIMIT 1")
        .get(r.id) as { question: string; values_str: string; sid: string | null } | undefined;
      if (c?.question && c.values_str) return { question: c.question, values: c.values_str.split(",").map(Number) as LineValue[], sid: c.sid ?? "sample" };
    } catch { /* a sample below */ }
  }
  return { question: z(r, "這份工作要不要換", "这份工作要不要换"), values: V, sid: "sample" };
}
function names(r: SampleReader, values: LineValue[]) {
  const c = resolveCast(values);
  return { hex: hexName(c.primary, L(r)), changed: c.changed ? hexName(c.changed, L(r)) : null };
}
const outcomeLinks = (site: string) => ({ hit: `${site}/#`, partial: `${site}/#`, miss: `${site}/#`, open: `${site}/#` });
/** a monthly membership for the samples of the membership notices — no Stripe object behind it */
function sampleSub(r: SampleReader, now: number): SubscriptionRow {
  return {
    id: 0, customer_id: r.id ?? 0, stripe_customer_id: null, stripe_subscription_id: "sub_sample", status: "active", plan: "month",
    period_start: now - 2 * DAY, period_end: now + 28 * DAY, cancel_at_period_end: 0, cancel_at: null, created_at: now - 60 * DAY, updated_at: now, synced_at: now,
    currency: r.currency, amount_minor: priceMinor(r.currency, "month"),
  };
}
const timing = (r: SampleReader) => z(r, "下個月中旬前後，這件事會有一個明確的回音。", "下个月中旬前后，这件事会有一个明确的回音。");

export const AUTO_MAILS: AutoMail[] = [
  /* ---------------- 每天的信 ---------------- */
  {
    id: "member_letter", name: "会员每日信", when: "每天 07:30（中文会员；读者可一键停）", group: "每天的信", switchId: "member_letter",
    stats: { emails: "member_letter", prefix: "ml" },
    sample: async (r, site, now) => {
      let p: LetterPieces;
      try { p = await letterPieces(r.id ?? 0, r.locale, now); } catch { p = { day: homeDay(now), locale: r.locale, lot: null, yunshi: null, note: null, due: [], month: null, me: null }; }
      return buildMemberLetter(p, site, r.email);
    },
  },
  {
    id: "month_letter", name: "流月信", when: "每月 1–3 日（中文会员；有命盘按个人盘写，没有的寄通用版＋补生日入口）", group: "每天的信", switchId: "month_letter",
    stats: { emails: "month_letter", prefix: "mo" }, statsNote: "正文每月由模型按这个人的盘写；没有命盘的寄通用版（每月每种文字写一次）。样信不调用模型，用占位文字；选一位没有命盘的读者看通用版",
    sample: async (r, site, now) => {
      const d = new Date(now + 8 * 3_600_000);
      const own = r.id ? monthBits(r.id, now) : null;
      if (r.id && !own) {
        // 11-01 进度表 133: a member with no chart gets the shared month and the 「補上出生資料」 button
        const g = genericBits(now);
        return buildGenericLetter(g, { keyword: z(r, "（關鍵詞）", "（关键词）"), season: z(r, "（節氣與這個月的干支，每月寫一次，大家同一份；樣信不調用模型。）", "（节气与这个月的干支，每月写一次，大家同一份；样信不调用模型。）"), sky: z(r, "（這個月的逆行與日月食。）", "（这个月的逆行与日月食。）") }, r.locale, site, r.email, "sample");
      }
      const bits: MonthBits = own ?? {
        ym: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, monthNo: d.getUTCMonth() + 1, year: d.getUTCFullYear(), register: null,
        bazi: { month: { term: "立冬", start: "11/7", gz: "丁亥", stemTen: "正財", branchTen: "七殺", level: 3, tags: [] }, yearGz: "丙午", yearTen: null, favour: [], avoid: [], dayMaster: "壬" },
        ziwei: null, astro: null,
      };
      return buildMonthLetter(bits, { keyword: z(r, "（關鍵詞，每月由模型寫）", "（关键词，每月由模型写）"), bazi: z(r, "（這一段每月按這個人這個月的盤寫；樣信不調用模型。）", "（这一段每月按这个人这个月的盘写；样信不调用模型。）") }, r.locale, site, r.email);
    },
  },
  {
    id: "decade", name: "大运交接信", when: "换大运那年一封（会员，有八字报告）", group: "每天的信", switchId: "decade",
    stats: { emails: "milestone", prefix: "dy" },
    sample: async (r, site, now) => {
      const y = new Date(now + 8 * 3_600_000).getUTCFullYear();
      return buildDecadeLetter({ year: y, from: { gz: "甲子", ten: "食神", startAge: 23, endAge: 32, startYear: y - 10 }, to: { gz: "乙丑", ten: "傷官", startAge: 33, endAge: 42, startYear: y }, dayMaster: "壬" }, r.locale, site, r.email);
    },
  },
  {
    id: "key_month", name: "年书关键月信", when: "年书里的关键月到了（一年最多三封）", group: "每天的信", switchId: "key_month",
    stats: { emails: "milestone", prefix: "km" },
    sample: async (r, site, now) => {
      const y = new Date(now + 8 * 3_600_000).getUTCFullYear();
      return buildKeyMonthLetter({ year: y, token: "sample", km: { kind: "pivot", i: 9, flags: [], month: { i: 9, term: "立冬", start: "11/7", gz: "丁亥", stemEl: "火", branchEl: "水", stemTen: "正財", branchTen: "七殺", score: 3.5, level: 4, tags: [] } } }, r.locale, site, r.email);
    },
  },
  {
    id: "today_qian", name: "今日一籤信", when: "每天早上（订了的人；会员由每日信带）", group: "每天的信", switchId: "today_qian",
    stats: { emails: "today_qian", prefix: "tq" },
    sample: async (r, site, now) => {
      // read only: the lot this reader has (or would get) today — a preview draws nothing and records nothing
      const subject = `c:${r.id ?? 0}`, day = homeDay(now);
      const draw = drawnOn(subject, day) ?? (() => { const set = prefsFor(subject).set; return { day, set, num: lotNumberFor(subject, day, set), fresh: true }; })();
      const v = lotView(draw, { full: true, section: "overall", hk: false });
      if (!v) throw new Error("今天的籤取不到");
      return buildTodayQianEmail({ locale: r.locale, day: homeDay(now), lot: v, site, email: r.email });
    },
  },
  {
    id: "daily_mail", name: "每日三卦信", when: "每天 07:00（订阅者自己的时区，确认过的才寄）", group: "每天的信", switchId: "daily_mail",
    stats: { mail: "daily", extra: "customer_id IS NULL" },
    sample: async (r, site, now) => {
      const day = homeDay(now);
      return buildDailyEmail({ locale: L(r), names: PILES.map((p) => hexName(resolveCast(dailyValues(day, p)).primary, L(r))), todayUrl: `${site}/${r.locale}/today?c=dailymail`, unsubUrl: dailyUnsubUrl(r.email, r.locale) });
    },
  },

  /* ---------------- 回访与应期 ---------------- */
  {
    id: "revisit", name: "回访信", when: "应期过了的那天（一天、一周有上限；同一信箱几件合成一封）", group: "回访与应期", switchId: "revisit",
    stats: { mail: "revisit" }, statsNote: "和下面的合并信一起算",
    sample: async (r, site) => {
      const c = readerCast(r); const n = names(r, c.values);
      return buildRevisitEmail({
        locale: L(r), question: c.question, values: c.values, hexName: n.hex, changedName: n.changed, timingQuote: timing(r), windowDays: 30,
        readingUrl: `${site}/${r.locale}/reading?sid=${encodeURIComponent(c.sid)}`, castUrl: `${site}/${r.locale}/cast`, outcomeUrls: outcomeLinks(site), giftUrl: null, ask: "event", qianLine: null, hint: null, plan: null,
      });
    },
  },
  {
    id: "revisit_digest", name: "回访合并信", when: "同一信箱同一天有几件到期", group: "回访与应期", switchId: "revisit",
    stats: { mail: "revisit" }, statsNote: "和回访信一起算",
    sample: async (r, site) => {
      const c = readerCast(r); const n = names(r, c.values);
      const item = (q: string, values: LineValue[], ago: number) => {
        const m = names(r, values);
        return { question: q, values, hexName: m.hex, changedName: m.changed, timingQuote: timing(r), windowDays: 30, readingUrl: `${site}/${r.locale}/reading?sid=sample`, outcomeUrls: outcomeLinks(site), ask: "event" as const, askedOn: z(r, `${ago} 天前`, `${ago} 天前`) };
      };
      return buildRevisitDigestEmail({ locale: L(r), castUrl: `${site}/${r.locale}/cast`, items: [{ ...item(c.question, c.values, 32), hexName: n.hex, changedName: n.changed }, item(z(r, "他會不會回來找我", "他会不会回来找我"), [8, 7, 7, 9, 8, 8], 40)] });
    },
  },
  {
    id: "headsup", name: "应期提醒（这一周）", when: "应期那一周开始前（一天一封、一周三封的上限里）", group: "回访与应期", switchId: "headsup",
    stats: { mail: "headsup" },
    sample: async (r, site, now) => {
      const c = readerCast(r); const n = names(r, c.values);
      return buildHeadsUpEmail({ locale: L(r), mode: "week", castUrl: `${site}/${r.locale}/cast`, stopUrl: `${unsubUrl(site, r.email, r.locale)}&k=h`, items: [{ question: c.question, hexName: n.changed ? `${n.hex} → ${n.changed}` : n.hex, timing: timing(r), nextDate: date(r, now + 5 * DAY), readingUrl: `${site}/${r.locale}/reading?sid=sample` }] });
    },
  },
  {
    id: "dayof", name: "应期当日", when: "应期说的第一天", group: "回访与应期", switchId: "dayof",
    stats: { mail: "dayof" },
    sample: async (r, site) => {
      const c = readerCast(r); const n = names(r, c.values);
      const readingUrl = `${site}/${r.locale}/reading?sid=sample`;
      return buildDayOfEmail({ locale: L(r), stopUrl: `${unsubUrl(site, r.email, r.locale)}&k=h`, item: { question: c.question, hexName: n.changed ? `${n.hex} → ${n.changed}` : n.hex, timing: timing(r), signals: z(r, "對方主動提起、或有人替你開口。", "对方主动提起、或有人替你开口。"), readingUrl, noteUrl: `${readingUrl}#progress`, hint: null } });
    },
  },
  {
    id: "tarot_revisit", name: "塔罗回访", when: "读者自己选的那天到了", group: "回访与应期", switchId: "tarot_revisit",
    stats: { mail: "tarot_revisit" },
    sample: async (r, site) => buildTarotRevisitEmail({
      t: tarotText(L(r)).mail, locale: L(r),
      question: z(r, "我們還有沒有可能", "我们还有没有可能"), outcome: z(r, "他主動聯絡我", "他主动联络我"), plan: null,
      links: ANSWERS.map((a) => ({ label: tarotText(L(r)).answers[a], url: `${site}/#` })), pageUrl: `${site}/${r.locale}/tarot`,
    }),
  },
  {
    id: "zeri", name: "择日提醒", when: "读者设好的日子前一天（09:00 起）", group: "回访与应期", switchId: "zeri",
    stats: { mail: "zeri", extra: "substr(session_id, 1, 5) = 'zeri:'" },
    sample: async (r, site) => buildZeriRemindEmail({ matter: "搬家", date: "11/8", lunar: "九月十八", yi: "嫁娶、出行、移徙、入宅", dayUrl: `${site}/${r.locale}/huangli`, castUrl: `${site}/${r.locale}/cast?c=zeri`, cancelUrl: `${site}/#` }),
  },

  /* ---------------- 会员与通卡 ---------------- */
  {
    id: "pass_open", name: "通卡开通信", when: "买通卡后马上", group: "会员与通卡", switchId: null, noSwitch: "交易信：读者刚付钱，信里是他买到什么、到什么时候",
    stats: { mail: "sub_welcome" }, statsNote: "和会员欢迎信一起算",
    sample: async (r, site, now) => buildPassOpenEmail({
      locale: L(r), name: tongkaT(r.locale).name[7], until: date(r, now + 7 * DAY), perks: openLetterPerks("pass", L(r)), guarantee: null,
      castUrl: `${site}/${r.locale}/cast`, servicesUrl: `${site}/${r.locale}/services`, upsell: true, receiptUrl: null,
    }),
  },
  {
    id: "member_welcome", name: "会员欢迎信", when: "开会员后马上", group: "会员与通卡", switchId: null, noSwitch: "交易信：读者刚付钱",
    stats: { mail: "sub_welcome" }, statsNote: "和通卡开通信一起算",
    sample: async (r, site, now) => buildMemberWelcomeEmail({
      locale: L(r), plan: "month", paid: money(r, firstMonthMinor(r.currency)), later: money(r, priceMinor(r.currency, "month")), date: date(r, now + 30 * DAY),
      perks: openLetterPerks("member", L(r)), castUrl: `${site}/${r.locale}/cast`, manageUrl: `${site}/${r.locale}/account#membership`, receiptUrl: null, termsUrl: `${site}/${r.locale}/terms`,
    }),
  },
  {
    id: "pass_notice", name: "通卡到期提醒", when: "通卡到期前（北京时间 9–21 点）", group: "会员与通卡", switchId: "pass_notice",
    stats: { mail: "pass_notice" }, statsNote: "含籤卡到期提醒（同一种信）",
    sample: async (r, _site, now) => buildPassNoticeEmail({ locale: L(r), passId: "pass_sample", end: now + 2 * DAY, currency: r.currency, asked: 3, revisitDates: [date(r, now + 12 * DAY)], passDays: 7 }),
  },
  {
    id: "qian_card_notice", name: "籤卡到期提醒", when: "籤卡到期前 3 天（籤卡已停卖，旧卡才有）", group: "会员与通卡", switchId: "qian_card_notice",
    stats: { emails: "qian_card_notice", prefix: "qcard" },
    sample: async (r, site, now) => buildCardNoticeEmail({ locale: r.locale, endsAt: now + 3 * DAY, site, cardId: 0 }),
  },
  {
    id: "sub_recap", name: "续费前回顾", when: "月付会员续费前 3 天", group: "会员与通卡", switchId: "sub_recap",
    stats: { mail: "sub_recap" },
    sample: async (r, site, now) => buildRecapEmail({
      locale: L(r), date: date(r, now + 3 * DAY), paid: money(r, priceMinor(r.currency, "month")), days: 6, value: money(r, 6 * tongkaMinor(r.currency, 1)),
      deep: 4, tarot: 1, qian: 2, report: 1, qa: 5, letters: 27,
      matters: [{ q: z(r, "這份工作要不要換", "这份工作要不要换"), status: "next", date: date(r, now + 10 * DAY) }, { q: z(r, "他會不會回來", "他会不会回来"), status: "answered" }],
      castUrl: `${site}/${r.locale}/cast`, manageUrl: `${site}/${r.locale}/account#membership`, year: null,
    }),
  },
  {
    id: "sub_renew", name: "年付续费预告", when: "年付会员续费前约 30 天", group: "会员与通卡", switchId: null, noSwitch: "法规要求先告知",
    stats: { mail: "sub_renew" },
    sample: async (r, site, now) => buildRenewEmail({ locale: L(r), date: date(r, now + 30 * DAY), price: money(r, priceMinor(r.currency, "year")), manageUrl: `${site}/${r.locale}/account#membership` }),
  },
  {
    id: "sub_confirm", name: "关续订确认", when: "读者关掉续订时马上", group: "会员与通卡", switchId: null, noSwitch: "确认读者自己做的事（含一键恢复）",
    stats: { mail: "sub_confirm" },
    sample: async (r, site, now) => buildRetainEmail({ locale: L(r), letter: "confirm", date: date(r, now + 12 * DAY), resumeUrl: `${site}/#`, castUrl: `${site}/${r.locale}/cast`, passUrl: `${site}/${r.locale}/account?want=pass#membership`, perksBack: true }),
  },
  {
    id: "sub_winback", name: "到期前那封", when: "关了续订、到期前 3 天（一封）", group: "会员与通卡", switchId: "sub_winback",
    stats: { mail: "sub_winback" },
    sample: async (r, site, now) => buildRetainEmail({ locale: L(r), letter: "winback", date: date(r, now + 3 * DAY), resumeUrl: `${site}/#`, pauseUrl: `${site}/#`, yearUrl: null, castUrl: `${site}/${r.locale}/cast`, unsubUrl: unsubUrl(site, r.email, r.locale), perksBack: true }),
  },
  /* 10-23 进度表 111 / 110: the membership notices (lib/sub-letters.ts) */
  {
    id: "sub_payfail", name: "扣款失败通知", when: "续扣没扣成功时马上（Stripe 之后自己重试几次）", group: "会员与通卡", switchId: "sub_payfail",
    stats: { mail: "sub_payfail" }, statsNote: "和补缴成功那封一起算",
    sample: async (r, _site, now) => {
      const row = sampleSub(r, now);
      return buildSubLetter("payfail", row, L(r), { bill: { created: now - 3_600_000, amountDue: row.amount_minor!, currency: r.currency, hosted: null, nextAttempt: now + 3 * DAY } });
    },
  },
  {
    id: "sub_paid", name: "补缴成功", when: "扣款失败后付上了", group: "会员与通卡", switchId: "sub_payfail",
    stats: { mail: "sub_payfail" }, statsNote: "和扣款失败通知一起算（同一个开关）",
    sample: async (r, _site, now) => buildSubLetter("paid", sampleSub(r, now), L(r)),
  },
  {
    id: "sub_unpaid_end", name: "欠费结束", when: "重试都没成功、Stripe 结束会员时", group: "会员与通卡", switchId: "sub_unpaid_end",
    stats: { mail: "sub_unpaid_end" },
    sample: async (r, _site, now) => buildSubLetter("unpaid_end", { ...sampleSub(r, now), status: "canceled" }, L(r)),
  },
  {
    id: "sub_resume", name: "恢复续订确认", when: "读者恢复续订时马上（信里的连结、我的页或 Stripe 页面都算，一次一封）", group: "会员与通卡", switchId: "sub_resume",
    stats: { mail: "sub_resume" }, statsNote: "金额取 Stripe 下一张帐单的预览（扣掉帐户余额）",
    sample: async (r, _site, now) => {
      const row = sampleSub(r, now);
      const credit = Math.round(row.amount_minor! / 4);
      return buildSubLetter("resume", row, L(r), { next: { amount: row.amount_minor! - credit, credit, currency: r.currency } });
    },
  },
  {
    // 10-24 (Neil: 「然后续费为什么没有发邮件呢」): Stripe sends members nothing when a renewal is charged
    id: "sub_renewed", name: "续费成功（收据）", when: "会员每期自动续费扣款成功后（每 10 分钟查一次 Stripe 帐单，一期一封；扣款失败那期由「扣款失败／补缴成功」两封说）", group: "会员与通卡", switchId: "sub_renewed",
    stats: { mail: "sub_renewed" }, statsNote: "金额取 Stripe 这期帐单实扣（帐户余额抵扣的另起一行），附 Stripe 的收据页",
    sample: async (r, _site, now) => {
      const row = { ...sampleSub(r, now), period_start: now - 3_600_000, period_end: now + 30 * DAY };
      return buildSubLetter("renewed", row, L(r), { renewal: { id: "in_sample", total: row.amount_minor!, paid: row.amount_minor!, currency: r.currency, at: now - 3_000_000, hosted: "https://invoice.stripe.com/i/sample" } });
    },
  },
  {
    id: "sub_pause", name: "暂停一个月确认", when: "读者在到期前那封里选了暂停一个月时马上", group: "会员与通卡", switchId: "sub_pause",
    stats: { mail: "sub_pause" },
    sample: async (r, _site, now) => buildSubLetter("pause", sampleSub(r, now), L(r), { pause: { from: now + 3 * DAY, until: now + 33 * DAY } }),
  },

  /* ---------------- 客服与退款 (10-23 进度表 111 ②) ---------------- */
  {
    id: "support_ack", name: "客服自动回执", when: "读者写信到 support@，客服台读过、要人回的那种（谢谢信、回访回信不寄；同一信箱一天一封）", group: "客服与退款", switchId: "support_ack",
    stats: { mail: "support_ack" }, statsNote: "从 support@ 寄出，接在读者那封信的同一串里",
    sample: async (r) => {
      const text = ackText(r.locale);
      return { subject: z(r, "Re: 我付了款但沒收到解讀", "Re: 我付了款但没收到解读"), html: replyHtml(text), text };
    },
  },
  {
    id: "nianshu_received", name: "年书：收到了，写好就寄", when: "年书付款后马上（写好那封另寄；写完之前才寄）", group: "客服与退款", switchId: null, noSwitch: "交易信：读者刚付钱，附收据",
    stats: { mail: "nianshu_received" },
    sample: async (r, site) => {
      const hans = r.locale === "zh";
      return buildNoticeEmail({
        locale: r.locale, subject: hans ? "收到了，正在写你的年书" : "收到了，正在寫你的年書", title: hans ? "收到了，正在写你的年书" : "收到了，正在寫你的年書",
        paras: hans ? ["付款已经收到。年书要写几分钟，写好会再寄一封信给你，附上连结。", "这段时间可以关掉页面，不影响；想看进度，随时打开下面的连结。"] : ["付款已經收到。年書要寫幾分鐘，寫好會再寄一封信給你，附上連結。", "這段時間可以關掉頁面，不影響；想看進度，隨時打開下面的連結。"],
        cta: { label: hans ? "看写作进度" : "看寫作進度", url: `${site}/${r.locale}/nianshu` }, links: [{ label: `${hans ? "已付" : "已付"} ${money(r, nianshuMinor(r.currency, true))} · ${hans ? "付款收据" : "付款收據"}`, url: `${site}/#` }],
        reply: hans ? "有问题直接回复这封信。" : "有問題直接回覆這封信。",
      });
    },
  },
  {
    id: "erase_confirm", name: "删除帐号 · 确认信", when: "后台「删除此客户全部数据」第一步（读者要求删除时）", group: "客服与退款", switchId: null, noSwitch: "后台手动寄，不会自己寄",
    stats: { mail: "erase" }, statsNote: "和「已删除」那封一起算",
    sample: async (r) => buildEraseEmail("confirm", r.locale),
  },
  {
    id: "erase_done", name: "删除帐号 · 已删除", when: "后台删除完成后马上（这封的记录也不留）", group: "客服与退款", switchId: null, noSwitch: "读者要求的删除，必须告知",
    stats: { mail: "erase" }, statsNote: "寄出后记录即删，这里通常是 0",
    sample: async (r) => buildEraseEmail("done", r.locale),
  },
  {
    id: "refund_member", name: "退款通知（会员）", when: "会员费退回（Stripe 后台退的也算）；等 5 分钟，读到会员这时的状态再寄", group: "客服与退款", switchId: null, noSwitch: "交易信：钱退回去了",
    stats: { mail: "refund" }, statsNote: "和所有退款信一起算（解读、通卡、单买、会员）",
    sample: async (r, _site, now) => buildRefundEmail({ locale: L(r), amountLabel: money(r, priceMinor(r.currency, "month")), reason: "requested", what: "member_until", until: date(r, now + 12 * DAY) }),
  },
  {
    id: "refund_part", name: "退款通知（部分退款）", when: "退了一部分（后台按钮或 Stripe 后台）；那一单仍算已付", group: "客服与退款", switchId: null, noSwitch: "交易信：钱退回去了",
    stats: { mail: "refund" }, statsNote: "和所有退款信一起算",
    sample: async (r, _site, now) => buildRefundEmail({ locale: L(r), amountLabel: money(r, Math.round(tongkaMinor(r.currency, 7) / 2)), reason: "other", partial: true, what: "pass_keeps", until: date(r, now + 4 * DAY) }),
  },

  /* ---------------- 挽回与提醒 ---------------- */
  {
    id: "saved_followup", name: "存卦后的提醒", when: "存卦后一天一封；卦里说的日子前一天再一封", group: "挽回与提醒", switchId: "saved_followup",
    stats: { mail: "saved_followup" },
    sample: async (r, site) => {
      const c = readerCast(r); const n = names(r, c.values);
      return buildSavedFollowupEmail({ locale: L(r), hex: n.hex, question: c.question, price: money(r, tongkaMinor(r.currency, 1, true)), full: money(r, tongkaMinor(r.currency, 1)), first: true, pass: true, followups: FOLLOWUP_LIMIT, url: `${site}/${r.locale}/saved/sample`, unsubUrl: unsubUrl(site, r.email, r.locale) });
    },
  },
  {
    id: "recover", name: "结账没完成的那封", when: "结账没完成后（一封；附一小时内有效的价格）", group: "挽回与提醒", switchId: "recover",
    stats: { mail: "recover" },
    sample: async (r, site, now) => {
      const p = { co: "sample", session_id: "sample", kind: "pass", created: now, left_at: null, letter_at: null, letter_state: null, email: r.email, remind: 1, locale: r.locale, currency: r.currency, amount: tongkaMinor(r.currency, 1), product: "pass", managed: 0, methods: null, card_hint: 0, meta_json: JSON.stringify({ days: "1" }), cancel_url: "", success_url: "" } as PendingRow;
      return buildRecoverOfferEmail({ p, locale: L(r), url: `${site}/#`, base: money(r, p.amount), offer: money(r, Math.round(p.amount * 0.7)), until: "21:30", unsub: unsubUrl(site, r.email, r.locale) });
    },
  },
  {
    id: "recover_remind", name: "结账没完成 · 会员／合盘／年书（不打折）", when: "会员、合盘、年书的结账没完成后（一封；连结 1 小时内照原价接着付）", group: "挽回与提醒", switchId: "recover",
    stats: { mail: "recover" }, statsNote: "和通卡那封一起算（同一个开关）；10-23 进度表 113 起会员不再 7 折",
    sample: async (r, site, now) => {
      const p = { co: "sample", session_id: "sample", kind: "month", created: now, left_at: null, letter_at: null, letter_state: null, email: r.email, remind: 1, locale: r.locale, currency: r.currency, amount: firstMonthMinor(r.currency), product: z(r, "YaoFlow 會員", "YaoFlow 会员"), managed: 0, methods: null, card_hint: 0, meta_json: "{}", cancel_url: "", success_url: "" } as PendingRow;
      return buildRecoverOfferEmail({ p, locale: L(r), url: `${site}/#`, base: money(r, p.amount), offer: money(r, p.amount), until: "21:30", unsub: unsubUrl(site, r.email, r.locale), passUrl: `${site}/${r.locale}/account?want=pass#membership` });
    },
  },
];

export const autoMail = (id: string): AutoMail | null => AUTO_MAILS.find((m) => m.id === id) ?? null;

/* ---------------- the reader a sample is written for ---------------- */

/** our own test accounts that have an address — the readers a sample can be written for (newest first) */
export function sampleReaders(): SampleReader[] {
  try {
    const rows = db().prepare("SELECT id, lower(email) AS email, locale FROM customers WHERE test_flag = 1 AND email LIKE '%@%' ORDER BY id DESC LIMIT 20").all() as { id: number; email: string; locale: string | null }[];
    return rows.map((c) => ({ id: c.id, email: c.email, locale: c.locale === "zh" ? "zh" : "zh-hant", currency: readerCurrency(c.id, c.locale) }));
  } catch { return []; }
}
function readerCurrency(id: number, locale: string | null): Currency {
  try {
    const o = db().prepare("SELECT UPPER(currency) AS c FROM orders WHERE customer_id = ? AND currency IS NOT NULL ORDER BY created_at DESC LIMIT 1").get(id) as { c: string } | undefined;
    if (o && isCurrency(o.c)) return o.c;
  } catch { /* by the language below */ }
  return locale === "zh" ? "CNY" : "TWD";
}
export const SAMPLE_READER: SampleReader = { id: null, email: "reader@example.com", locale: "zh-hant", currency: "TWD" };

export async function renderSample(m: AutoMail, r: SampleReader, site: string, now = Date.now()): Promise<Mail | { error: string }> {
  try { return await m.sample(r, site, now); } catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
}

/* ---------------- the last seven days ---------------- */

export interface MailStats { sent: number; opened: number; unsub: number; bad: number; failed: number }

/** sent / opened / unsubscribed after it (within a week) / bounced or spam / failed — our own test accounts left out */
export function autoMailStats(m: AutoMail, now = Date.now(), days = 7): MailStats {
  const since = now - days * DAY;
  const zero: MailStats = { sent: 0, opened: 0, unsub: 0, bad: 0, failed: 0 };
  try { unsubscribedAddress("x@x"); } catch { /* the unsubscribe table is made on first use */ }
  try {
    const d = db();
    if ("emails" in m.stats) {
      const s = m.stats;
      const where = `e.kind = ? AND e.session_id >= ? AND e.session_id < ? AND e.sent_at >= ? AND lower(e.email) NOT IN (SELECT lower(email) FROM customers WHERE test_flag = 1)`;
      const args = [s.emails, `${s.prefix}:`, `${s.prefix};`, since];
      const r = d.prepare(`SELECT SUM(e.status = 'sent') AS sent, SUM(e.status = 'sent' AND m.opened_at IS NOT NULL) AS opened,
          SUM(e.status = 'sent' AND (m.bounced_at IS NOT NULL OR m.complained_at IS NOT NULL)) AS bad, SUM(e.status = 'failed') AS failed,
          SUM(e.status = 'sent' AND EXISTS (SELECT 1 FROM mail_unsubs u WHERE u.email = lower(e.email) AND u.at >= e.sent_at AND u.at < e.sent_at + ${7 * DAY})) AS unsub
        FROM emails e LEFT JOIN mail_log m ON m.id = e.detail WHERE ${where}`).get(...args) as Record<keyof MailStats, number | null>;
      return { sent: r.sent ?? 0, opened: r.opened ?? 0, unsub: r.unsub ?? 0, bad: r.bad ?? 0, failed: r.failed ?? 0 };
    }
    const s = m.stats;
    const r = d.prepare(`SELECT COUNT(*) AS sent, SUM(opened_at IS NOT NULL) AS opened, SUM(bounced_at IS NOT NULL OR complained_at IS NOT NULL) AS bad, SUM(failed_at IS NOT NULL) AS failed,
        SUM(EXISTS (SELECT 1 FROM mail_unsubs u WHERE u.email = lower(m.email) AND u.at >= m.created_at AND u.at < m.created_at + ${7 * DAY})) AS unsub
      FROM mail_log m WHERE m.kind = ? AND m.created_at >= ? ${s.extra ? `AND ${s.extra}` : ""}
        AND (m.customer_id IS NULL OR m.customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1))`).get(s.mail, since) as Record<keyof MailStats, number | null>;
    return { sent: r.sent ?? 0, opened: r.opened ?? 0, unsub: r.unsub ?? 0, bad: r.bad ?? 0, failed: r.failed ?? 0 };
  } catch { return zero; }
}

/** the switch's state as the page shows it */
export function switchState(m: AutoMail): { on: boolean; since: number | null } | null {
  if (!m.switchId) return null;
  return { on: letterOn(m.switchId), since: letterOffSince(m.switchId) };
}
