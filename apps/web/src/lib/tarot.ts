import { randomBytes, randomInt } from "node:crypto";
import CARDS from "@/data/tarot-cards.json";
import MEANINGS from "@/data/tarot-meanings.json";
import { db } from "./db";
import { classifyTopic } from "./topic";
import { isCrisis } from "./crisis";

/**
 * 10-16 进度表 68 線上塔羅：一事一牌陣，到期回訪 (Neil 10-16「我想上它的所有产品，包括塔罗」→「一起做吧」; 调研
 * _research/塔罗竞品-台港-1016.md).
 *
 *   free   write the matter (required, kept for the reader only) → shuffle → pick from the fan → the cards turn over:
 *          picture, name, upright/reversed (50/50), keywords and the card's overall meaning — from the meaning library,
 *          no model call.
 *   paid   at the light-reading price (members: one of their light readings) — the cards read against THIS matter by the
 *          model, from the library's love/work/overall text for the kind of question; one follow-up included; tarot gives
 *          no dates (the reading points to a cast for that); the reader may set when we come back to ask what happened.
 *
 * One matter, one spread: the same matter from the same browser within 24 hours shows the first spread again.
 * The server deals (crypto), so a reload cannot redeal. Spreads: one card (「這件事現在」) or three (「現在／卡住的地方／
 * 接下來」). No 十字 / 凱爾特 in this first version; no daily free unlimited draws; no 「再抽一次看看」.
 *
 * Card faces: Pamela Colman Smith's 1909–10 Rider–Waite drawings (public domain), redrawn in the site's ink —
 * 推广素材/塔罗牌面/来源.md. Meaning library: data/tarot-meanings.json — 推广's reviewed 牌義定稿 (10-17, 78 cards,
 * 内容/塔羅/牌義定稿.json, checked by 内容/塔羅/_check.py: lengths, banned words, no dates); swapped in 10-22 before opening.
 */

export interface TarotCard { id: string; zh: string; en: string; roman: string | null; arcana: "major" | "minor" }
export interface Side { overall: string; love: string; work: string; ask_next: string }
export interface Meaning { keywords: { upright: string[]; reversed: string[] }; upright: Side; reversed: Side }

export const TAROT_CARDS = CARDS as TarotCard[];
const M = MEANINGS as Record<string, Meaning>;
export const meaningOf = (id: string): Meaning | null => M[id] ?? null;

/** /tarot/<slug>: majors by name (lovers, wheel-of-fortune), minors by suit and number (cups-02) */
export const tarotSlug = (c: TarotCard) => (c.arcana === "major" ? c.id.replace(/^\d+-/, "") : c.id);
export const cardBySlug = (slug: string) => TAROT_CARDS.find((c) => tarotSlug(c) === slug) ?? null;
export const cardById = (id: string) => TAROT_CARDS.find((c) => c.id === id) ?? null;
export const cardImage = (c: TarotCard, small = false) => `/tarot/${c.id}${small ? "-s" : ""}.webp`;

export type Spread = 1 | 3;
export const POSITIONS: Record<Spread, string[]> = { 1: ["這件事現在"], 3: ["現在", "卡住的地方", "接下來"] };
export interface Dealt { id: string; rev: boolean }

/** deal `n` distinct cards, each upright or reversed with even chance */
export function deal(n: Spread, rand: (max: number) => number = randomInt): Dealt[] {
  const pool = TAROT_CARDS.map((c) => c.id);
  const out: Dealt[] = [];
  for (let i = 0; i < n; i++) {
    const k = rand(pool.length);
    out.push({ id: pool.splice(k, 1)[0]!, rev: rand(2) === 1 });
  }
  return out;
}

/** which part of the library a question reads from */
export type Kind = "love" | "work" | "overall";
// 10-17 (Neil: 塔羅「解读根本和问题无关」— a website's traffic read as a quarrel): a business, a shop, a product is work
const BUSINESS = /流量|生意|網站|网站|客戶|客户|業績|业绩|營收|营收|創業|创业|專案|项目|項目|產品|产品|品牌|銷售|销售|公司|店面|開店|开店|粉絲|粉丝|訂單|订单|用戶|用户|帳號|账号|自媒體|自媒体|投資人|投资人|合作|老闆|老板|升職|升职|加薪|offer|app|App/i;
export function kindOf(question: string): Kind {
  if (BUSINESS.test(question) && !/前任|復合|复合|曖昧|暧昧|男友|女友|另一半|老公|老婆/.test(question)) return "work";
  const t = classifyTopic(question);
  return t === "relationship" ? "love" : t === "career" || t === "study" ? "work" : "overall";
}

/** the questions this does not answer — the same lines the cast draws (crisis, health, gambling / investing, a third party) */
export type Refusal = "crisis" | "health" | "money" | "affair";
// 10-29 进度表 128: the same lines in the seven other languages (a question is checked in every language, whatever the page)
// (the sign Cancer / Krebs / Cáncer is not an illness, and がんばる is not one either: the illness only with its verbs)
const HEALTH_FOREIGN = /\b(pregnan\w*|(?:has|have|got|with|of) cancer|cancer (?:diagnosis|treatment|scan|test)|tumou?rs?|surgery|life expectancy|enceinte|grossesse|chirurgie|(?:un|du|mon|son|sa) cancer|schwanger\w*|(?:habe|hat|an) krebs|(?:eine|meine|seine|ihre) operation|embarazad\w*|embarazo|cirug[ií]a|(?:tengo|tiene|un|de) c[aá]ncer|gr[aá]vida|gravidez|cirurgia|(?:tenho|tem|um|de) c[aâ]ncer)\b|妊娠|手術|癌|余命|임신|수술|암\s?(?:검사|진단|수술|환자)|시한부/i;
// (acciones / ações are also "actions": only the stock market's)
const MONEY_FOREIGN = /\b(stocks|stock market|stock price|crypto\w*|bitcoin|gambl\w*|lottery|casino|betting|en bourse|loto|pari sportif|aktien|börse|krypto\w*|glücksspiel|lotto|sportwette\w*|bolsa de valores|acciones de bolsa|criptomoneda\w*|apuestas?|loter[ií]a|a[cç][oõ]es da bolsa|cripto\w*|apostas?|loteria|cassino)\b|株価|株式|仮想通貨|ビットコイン|ギャンブル|宝くじ|競馬|パチンコ|주식|코인|비트코인|도박|로또|복권/i;
// (se tromper is "to be wrong": only someone deceiving the reader)
const AFFAIR_FOREIGN = /\b(affair|cheating on|cheats on|the other (?:woman|man)|mistress|side piece|une liaison|(?:il|elle) me trompe|m'a tromp[ée]e?|infid[èe]l\w*|ma[iî]tresse|aff[äa]re|fremdgeh\w*|die geliebte|infidelidad|infiel|la amante|me engaña|trai[cç][aã]o|me traiu|me trai|caso extraconjugal)\b|不倫|浮気|불륜|바람(?:을|이)?\s?(?:피|폈)/i;
export function refusalOf(question: string): Refusal | null {
  if (isCrisis(question)) return "crisis";
  const t = classifyTopic(question);
  if (t === "health" || /懷孕|怀孕|生病|病情|手術|手术|開刀|开刀|癌|壽命|寿命|會不會死|会不会死/.test(question) || HEALTH_FOREIGN.test(question)) return "health";
  if (/股票|股市|基金|期貨|期货|加密貨幣|加密货币|比特幣|比特币|虛擬幣|虚拟币|投資|投资|賭|赌|彩券|樂透|乐透|六合彩|運彩|运彩|中獎|中奖/.test(question) || MONEY_FOREIGN.test(question)) return "money";
  if (/小三|第三者|外遇|劈腿|出軌|出轨|偷吃|婚外/.test(question) || AFFAIR_FOREIGN.test(question)) return "affair";
  return null;
}

// 10-30 进度表 128: 200 — a Latin-script question is longer (the Chinese, Japanese and Korean box stops at 120)
export const normQuestion = (q: string) => q.normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, 200);
const qkey = (q: string) => normQuestion(q).replace(/[\s，。、？?！!「」『』,.]/g, "").toLowerCase();

/* ------------------------------------------------------------------ storage */

export interface TarotDraw {
  token: string; created_at: number; locale: string; bid: string | null; customer_id: number | null;
  question: string; spread: Spread; cards_json: string; register: string | null;
  paid_at: number | null; paid_session: string | null; email: string | null; currency: string | null; amount_minor: number | null;
  personal_json: string | null; followup_q: string | null; followup_json: string | null; followup_at: number | null;
  revisit_days: number | null; outcome_def: string | null; revisit_due: number | null; revisit_sent_at: number | null;
  revisit_answer: string | null; revisit_answer_at: number | null; public_ok: number;
  /** 10-22 进度表 89 */
  plan?: string | null;
}
export const TAROT_TOKEN_RE = /^[0-9a-f]{24}$/;

let ready = false;
function ensure(): void {
  if (ready) return;
  db().exec(`
    CREATE TABLE IF NOT EXISTS tarot_draws (
      token TEXT PRIMARY KEY, created_at INTEGER NOT NULL, locale TEXT NOT NULL, bid TEXT, customer_id INTEGER,
      question TEXT NOT NULL, qkey TEXT NOT NULL, spread INTEGER NOT NULL, cards_json TEXT NOT NULL, register TEXT,
      paid_at INTEGER, paid_session TEXT, email TEXT, currency TEXT, amount_minor INTEGER,
      personal_json TEXT, followup_q TEXT, followup_json TEXT, followup_at INTEGER,
      revisit_days INTEGER, outcome_def TEXT, revisit_due INTEGER, revisit_sent_at INTEGER,
      revisit_answer TEXT, revisit_answer_at INTEGER, public_ok INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_tarot_bid ON tarot_draws(bid, qkey, created_at);
    CREATE INDEX IF NOT EXISTS idx_tarot_due ON tarot_draws(revisit_due) WHERE revisit_due IS NOT NULL AND revisit_sent_at IS NULL;
  `);
  // 10-22 进度表 89: 「你打算怎麼做」 — the reader's own line, shown back on the page and in the letter
  try {
    const cols = (db().prepare("PRAGMA table_info(tarot_draws)").all() as { name: string }[]).map((c) => c.name);
    if (!cols.includes("plan")) db().exec("ALTER TABLE tarot_draws ADD COLUMN plan TEXT");
  } catch { /* read-only: the plan is simply not kept */ }
  ready = true;
}

export function tarotDraw(token: string): TarotDraw | null {
  ensure();
  return TAROT_TOKEN_RE.test(token) ? ((db().prepare("SELECT * FROM tarot_draws WHERE token = ?").get(token) as TarotDraw | undefined) ?? null) : null;
}
export const dealtOf = (d: Pick<TarotDraw, "cards_json">): Dealt[] => { try { return JSON.parse(d.cards_json) as Dealt[]; } catch { return []; } };

/**
 * A new spread — or, for the same matter from this browser within 24 hours, the first one again (`again: true`).
 */
export function createDraw(i: { question: string; spread: Spread; locale: string; bid: string | null; customerId: number | null; register: string | null }, now = Date.now()): { token: string; again: boolean } {
  ensure();
  const k = qkey(i.question);
  if (i.bid) {
    const prev = db().prepare("SELECT token FROM tarot_draws WHERE bid = ? AND qkey = ? AND created_at > ? ORDER BY created_at LIMIT 1").get(i.bid, k, now - 86_400_000) as { token: string } | undefined;
    if (prev) return { token: prev.token, again: true };
  }
  const token = randomBytes(12).toString("hex");
  db().prepare(`INSERT INTO tarot_draws (token, created_at, locale, bid, customer_id, question, qkey, spread, cards_json, register) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(token, now, i.locale, i.bid, i.customerId, normQuestion(i.question), k, i.spread, JSON.stringify(deal(i.spread)), i.register);
  return { token, again: false };
}

export function markTarotPaid(token: string, p: { session: string; email: string | null; currency: string; amountMinor: number; customerId: number | null }, now = Date.now()): void {
  ensure();
  db().prepare("UPDATE tarot_draws SET paid_at = COALESCE(paid_at, ?), paid_session = COALESCE(paid_session, ?), email = COALESCE(email, ?), currency = COALESCE(currency, ?), amount_minor = COALESCE(amount_minor, ?), customer_id = COALESCE(customer_id, ?) WHERE token = ?")
    .run(now, p.session, p.email, p.currency, p.amountMinor, p.customerId, token);
}
export function setTarotPersonal(token: string, json: string): void { ensure(); db().prepare("UPDATE tarot_draws SET personal_json = ? WHERE token = ?").run(json, token); }
export function setTarotFollowup(token: string, q: string, json: string, now = Date.now()): boolean {
  ensure();
  return Number((db().prepare("UPDATE tarot_draws SET followup_q = ?, followup_json = ?, followup_at = ? WHERE token = ? AND followup_at IS NULL").run(q, json, now, token) as { changes?: number | bigint }).changes ?? 0) > 0;
}

/** the reader's own date to be asked again (14 / 30 / 90 days) and what would count as an answer */
export const REVISIT_DAYS = [14, 30, 90] as const;
/**
 * 10-22 进度表 90 (设计稿 R7「付不付費都給回訪」): a free spread may be asked too — it then needs an address (the reader's
 * account's, or one typed with it), kept on the draw for this one letter. `plan` (进度表 89) is left as it was when not given.
 */
export function setTarotRevisit(token: string, days: number, outcome: string, now = Date.now(), extra: { plan?: string | null; email?: string | null; customerId?: number | null } = {}): boolean {
  ensure();
  if (!(REVISIT_DAYS as readonly number[]).includes(days)) return false;
  const plan = extra.plan === undefined ? undefined : (extra.plan ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || null;
  return Number((db().prepare(`UPDATE tarot_draws SET revisit_days = ?, outcome_def = ?, revisit_due = ?, email = COALESCE(email, ?), customer_id = COALESCE(customer_id, ?)${plan === undefined ? "" : ", plan = ?"}
      WHERE token = ? AND revisit_sent_at IS NULL AND (paid_at IS NOT NULL OR email IS NOT NULL OR ? IS NOT NULL)`)
    .run(...([days, outcome.trim().slice(0, 80) || null, now + days * 86_400_000, extra.email ?? null, extra.customerId ?? null, ...(plan === undefined ? [] : [plan]), token, extra.email ?? null] as (string | number | null)[])) as { changes?: number | bigint }).changes ?? 0) > 0;
}
export const ANSWERS = ["happened", "moving", "nothing", "undecided"] as const;
export type Answer = (typeof ANSWERS)[number];
export const ANSWER_ZH: Record<Answer, string> = { happened: "發生了", moving: "有動靜", nothing: "沒動靜", undecided: "還沒定" };
export function setTarotAnswer(token: string, a: Answer, now = Date.now()): boolean {
  ensure();
  return Number((db().prepare("UPDATE tarot_draws SET revisit_answer = ?, revisit_answer_at = ? WHERE token = ?").run(a, now, token) as { changes?: number | bigint }).changes ?? 0) > 0;
}
/** 10-23 进度表 104 ②: no longer asked on the page (nothing ever listed a spread on /outcomes); kept for the answers already given */
export function setTarotPublic(token: string, ok: boolean): void { ensure(); db().prepare("UPDATE tarot_draws SET public_ok = ? WHERE token = ? AND revisit_answer IS NOT NULL").run(ok ? 1 : 0, token); }
/** 10-23 进度表 104 ②: a spread already answered on its page (anything but 還沒定) is not asked again by letter */
export function dueTarotRevisits(now = Date.now(), limit = 20): TarotDraw[] {
  ensure();
  return db().prepare("SELECT * FROM tarot_draws WHERE revisit_due IS NOT NULL AND revisit_due <= ? AND revisit_sent_at IS NULL AND email IS NOT NULL AND (revisit_answer IS NULL OR revisit_answer = 'undecided') ORDER BY revisit_due LIMIT ?").all(now, limit) as unknown as TarotDraw[];
}
export function markTarotRevisitSent(token: string, now = Date.now()): boolean {
  ensure();
  return Number((db().prepare("UPDATE tarot_draws SET revisit_sent_at = ? WHERE token = ? AND revisit_sent_at IS NULL").run(now, token) as { changes?: number | bigint }).changes ?? 0) > 0;
}

/** for the weekly report / the two-week review (进度表 59) */
/**
 * 10-22 进度表 79: the spreads' revisits, all time — letters sent, answers, and each answer counted (the home page's results line).
 * 10-23 进度表 104 ②: `asked` also counts a spread answered on its page before the letter went; our own draws stay out.
 */
export function tarotRevisitCounts(): { sent: number; asked: number; answered: number; happened: number; moving: number; nothing: number; undecided: number } {
  ensure();
  const NOT_OURS = "(customer_id IS NULL OR customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1))";
  const one = (sql: string) => (db().prepare(`${sql} AND ${NOT_OURS}`).get() as { n: number }).n;
  const by = (a: Answer) => (db().prepare(`SELECT COUNT(*) n FROM tarot_draws WHERE revisit_answer = ? AND ${NOT_OURS}`).get(a) as { n: number }).n;
  return {
    sent: one("SELECT COUNT(*) n FROM tarot_draws WHERE revisit_sent_at IS NOT NULL"),
    asked: one("SELECT COUNT(*) n FROM tarot_draws WHERE (revisit_sent_at IS NOT NULL OR revisit_answer IS NOT NULL)"),
    answered: one("SELECT COUNT(*) n FROM tarot_draws WHERE revisit_answer IS NOT NULL"),
    happened: by("happened"), moving: by("moving"), nothing: by("nothing"), undecided: by("undecided"),
  };
}

export function tarotStats(since: number): { draws: number; people: number; paid: number; revisitSet: number; answered: number } {
  ensure();
  const one = (sql: string) => (db().prepare(sql).get(since) as { n: number }).n;
  return {
    draws: one("SELECT COUNT(*) n FROM tarot_draws WHERE created_at >= ?"),
    people: one("SELECT COUNT(DISTINCT COALESCE(bid, token)) n FROM tarot_draws WHERE created_at >= ?"),
    paid: one("SELECT COUNT(*) n FROM tarot_draws WHERE paid_at >= ?"),
    revisitSet: one("SELECT COUNT(*) n FROM tarot_draws WHERE paid_at >= ? AND revisit_due IS NOT NULL"),
    answered: one("SELECT COUNT(*) n FROM tarot_draws WHERE paid_at >= ? AND revisit_answer IS NOT NULL"),
  };
}
