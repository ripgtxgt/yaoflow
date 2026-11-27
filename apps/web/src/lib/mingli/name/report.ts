import { createHash, randomBytes } from "node:crypto";
import { chatJson, parseJsonLoose, type LlmMessage } from "@/lib/llm";
import { customerIdByEmail, db, recordOps, recordOrder, upsertCustomer } from "@/lib/db";
import type { CheckoutSession } from "@/lib/stripe";
import { toHans } from "@/lib/hant";
import { NAME_CHARS, charInfo, type CharInfo } from "./chars";
import { readName } from "./analyze";

/**
 * 10-29 进度表 122 姓名學 — the two paid reports (one-off; 會員 8 折; a signed-in admin browser is a tester):
 *   ① baby  寶寶取名參考 — 30 candidate characters and 10 names for a surname, a style (男／女／中性) and the chart's 喜用;
 *            bought on a 預產期 it can be recomputed once, free, when the real birth time is known;
 *   ② rename 改名參考 — the current name read first, then 10 candidate names.
 * The writing model only CHOOSES and EXPLAINS: the characters it may use are a pool we pick from the data (常用於名字、五行在
 * 喜用、not in the avoid list), and every 筆劃、讀音、五格 on the page comes from the data, never from the model.
 * Stored: the computed facts (surname, style, 喜用／忌, the avoid characters, the current given name) — never the birth.
 * 口径 (Neil 10-29): no 改名改運／旺財／化解, no 吉凶 of a number; the ending 「名字是你自己要叫一輩子的…」, and for a rename
 * 「法律上一生改名以三次為限（戶政規定）」.
 */

export const NAME_TOKEN_RE = /^[0-9a-f]{24}$/;
export type NameKind = "baby" | "rename";
export const nameReportPath = (token: string, locale = "zh-hant") => `/${locale}/name/r/${token}`;
export type NameStatus = "new" | "writing" | "retry" | "done" | "incomplete";
const LEASE_MS = 4 * 60_000;

export interface NameFacts {
  kind: NameKind;
  surname: string;
  /** m 男孩 / f 女孩 / n 中性 */
  style: "m" | "f" | "n";
  dayMaster: string; dmEl: string;
  favour: string[]; avoid: string[];
  /** bought before the birth: the chart is from the 預產期 (recomputed once for free) */
  due: boolean;
  avoidChars: string[];
  /** rename: the current given name */
  current?: string;
}
export interface NameReport {
  token: string; kind: NameKind; locale: string; register: string | null; customer_id: number | null;
  facts_json: string; input_hash: string; paid_at: number | null; paid_session: string | null; email: string | null;
  currency: string | null; amount_minor: number | null; body_json: string | null; status: NameStatus; lease_at: number | null;
  created_at: number; updated_at: number | null; recomputed: number;
}
export interface NameBody {
  intro: string;
  chars: { c: string; why: string }[];
  names: { given: string; meaning: string; sound: string; why: string }[];
  current?: { meaning: string; sound: string; fit: string };
  rounds: number;
}

let ready = false;
function ensure(): void {
  if (ready) return;
  db().exec(`
    CREATE TABLE IF NOT EXISTS name_reports (
      token TEXT PRIMARY KEY, kind TEXT NOT NULL, locale TEXT NOT NULL, register TEXT, customer_id INTEGER,
      facts_json TEXT NOT NULL, input_hash TEXT NOT NULL,
      paid_at INTEGER, paid_session TEXT, email TEXT, currency TEXT, amount_minor INTEGER,
      body_json TEXT, status TEXT NOT NULL DEFAULT 'new', lease_at INTEGER,
      created_at INTEGER NOT NULL, updated_at INTEGER, recomputed INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_name_reports_cust ON name_reports(customer_id, kind, input_hash);
    CREATE INDEX IF NOT EXISTS idx_name_reports_session ON name_reports(paid_session);
  `);
  ready = true;
}

export function nameReport(token: string): NameReport | null {
  if (!NAME_TOKEN_RE.test(token)) return null;
  ensure();
  return (db().prepare("SELECT * FROM name_reports WHERE token = ?").get(token) as NameReport | undefined) ?? null;
}
export const nmFactsOf = (r: Pick<NameReport, "facts_json">): NameFacts => JSON.parse(r.facts_json) as NameFacts;
export function nmBodyOf(r: Pick<NameReport, "body_json"> | null): NameBody | null {
  try { const b = r?.body_json ? (JSON.parse(r.body_json) as NameBody) : null; if (b && Array.isArray(b.names)) return b; } catch { /* none */ }
  return null;
}

/* ------------------------------------------------------------------ input */

const HAN = /[^\p{Script=Han}]/gu;
export const cleanHan = (v: unknown, max: number) => (typeof v === "string" ? [...v.replace(HAN, "")].slice(0, max).join("") : "");

/** the facts from the request body and a computed chart ({favour, avoid, dayMaster, dmEl}) */
export function nameFacts(i: { kind: unknown; surname: unknown; style: unknown; due: unknown; avoid: unknown; current: unknown },
  chart: { favour: string[]; avoid: string[]; dayMaster: string; dmEl: string }): NameFacts | { error: string } {
  const kind: NameKind = i.kind === "rename" ? "rename" : "baby";
  const surname = cleanHan(i.surname, 2);
  if (!surname) return { error: "surname" };
  if ([...surname].some((c) => !charInfo(c))) return { error: "surname" };
  const current = kind === "rename" ? cleanHan(i.current, 3) : undefined;
  if (kind === "rename" && !current) return { error: "current" };
  const style = i.style === "f" ? "f" : i.style === "n" ? "n" : "m";
  const avoidChars = [...new Set([...cleanHan(i.avoid, 30)])];
  return { kind, surname, style, dayMaster: chart.dayMaster, dmEl: chart.dmEl, favour: chart.favour, avoid: chart.avoid, due: kind === "baby" && i.due === true, avoidChars, ...(current ? { current } : {}) };
}

/** the dedupe key: the facts (not the 預產期 flag), the kind and the locale */
export function nmInputHash(f: NameFacts, locale: string): string {
  const { due: _d, ...rest } = f;
  return createHash("sha256").update(JSON.stringify({ ...rest, locale })).digest("hex");
}

/* ------------------------------------------------------------------ pool */

const same = (c: CharInfo, x: string) => c.h === x || c.s === x || c.a.includes(x);
/**
 * The characters the writer may use: 常用於名字 (ok 2, then ok 1), a 五行 in the chart's 喜用 (the 部首 rule first, then the 讀音 one),
 * 3–20 strokes, no warning text, none of the avoid characters, not the surname. At most 160, the most common first.
 */
const ALL_EL = ["木", "火", "土", "金", "水"];
/** a balanced chart (中和) has no 喜用: every 五行 is open, and the choice rests on meaning and sound */
export const poolElements = (favour: string[]) => (favour.length ? favour : ALL_EL);
export function namePool(f: Pick<NameFacts, "favour" | "avoidChars" | "surname">, max = 160): CharInfo[] {
  const els = poolElements(f.favour);
  const fav = new Set(els);
  const block = [...f.avoidChars, ...f.surname];
  // 常用 (ok 2) first; 可用 (ok 1) fills in when a 五行 has few
  const ok = NAME_CHARS.filter((c) => c.o >= 1 && fav.has(c.wx) && c.k >= 3 && c.k <= 20 && !c.x && !block.some((b) => same(c, b)));
  ok.sort((a, b) => b.o - a.o || (a.by === b.by ? 0 : a.by === "部首" ? -1 : 1) || a.lv - b.lv);
  // keep both 五行 represented when there are two
  const out: CharInfo[] = [];
  const per = Math.ceil(max / Math.max(1, fav.size));
  for (const el of els) out.push(...ok.filter((c) => c.wx === el).slice(0, per));
  return max === Infinity ? ok : out.slice(0, max);
}

/* ------------------------------------------------------------------ prompts */

export const NAME_BANNED = /吉凶|大吉|兇|凶數|旺財|旺夫|招財|改運|改运|化解|剋夫|克夫|不祥|開運|开运|靈驗|很準|準確|保證|一定會|AI|人工智慧|模型/;
const STYLE: Record<NameFacts["style"], string> = { m: "男孩", f: "女孩", n: "中性（男女都可）" };

function system(locale: string, register: string | null): string {
  const lang = locale === "zh"
    ? "全部用繁體中文寫（之後會轉成简体），用詞照大陸讀者習慣也可以。"
    : register === "hk" ? "全部用繁體中文書面語寫（香港讀者），不用粵語口語字。" : "全部用繁體中文（台灣用語）。";
  return [
    "你是一位幫人取名字的顧問，在寫一份「取名參考」給讀者。第二人稱「你」。" + lang,
    "原則：名字是要叫一輩子的，讀起來順、意思好、寫起來不難最重要；八字喜用的五行只是其中一個參考面向。",
    "只可以從給你的「可用字」裡挑字，名字也只能用這些字組成（不含姓）。不要自己加字。",
    "讀音：留意與姓連讀是否順口（聲調不要全同、不要疊韻拗口），點出常見的不雅諧音或容易被取笑的地方；沒有就說讀起來順。",
    "不可以：說名字或筆劃數吉凶、旺財旺夫、招財、改運、化解、剋、開運、保證；不編造典故出處（真實常見的詩文出處可以提，但不確定就不提）；不寫英文；不提到你是怎麼產生這份內容的。",
    "只輸出 JSON。",
  ].join("\n");
}

export function namePayload(f: NameFacts, pool: CharInfo[]): string {
  const list = pool.map((c) => `${c.h}(${c.wx}${c.k})${c.d.slice(0, 18)}`).join("；");
  const cur = f.kind === "rename" && f.current ? readName(f.surname, f.current, { favour: f.favour, avoid: f.avoid }) : null;
  const head = [
    `姓：${f.surname}`,
    `類型：${f.kind === "baby" ? `寶寶取名，${STYLE[f.style]}` : `改名，${STYLE[f.style]}`}`,
    f.favour.length ? `八字日主：${f.dayMaster}（${f.dmEl}）；比較需要的五行（喜用）：${f.favour.join("、")}；${f.avoid.length ? `較不需要的：${f.avoid.join("、")}` : ""}`
      : `八字日主：${f.dayMaster}（${f.dmEl}）；命盤五行大致平衡，沒有特別偏需要的五行，挑字以意思和讀音為主（理由裡不要說「補喜用」）。`,
    f.avoidChars.length ? `不要用的字（長輩名字或讀者不喜歡）：${f.avoidChars.join("")}` : "",
    cur ? `現在的名字：${f.surname}${f.current}；每個字：${cur.chars.map((x) => `${x.c}${x.info ? `（${x.info.wx}，${x.info.d.slice(0, 20)}）` : ""}`).join("、")}；名字裡落在喜用的字：${cur.favour?.carry.join("") || "沒有"}` : "",
    `可用字（字(五行筆劃)字義）：${list}`,
  ].filter(Boolean).join("\n");
  const shape = f.kind === "rename"
    ? `{"intro":"開頭 80–160 字：先說這份參考怎麼看名字（意思、讀音、喜用五行三方面）","current":{"meaning":"現在名字的意思 40–90 字","sound":"與姓連讀的感覺 20–60 字","fit":"和喜用五行的關係 30–80 字，只說落不落在喜用，不說好壞"},"chars":[{"c":"字","why":"為什麼選它 12–30 字"}…共 30 個],"names":[{"given":"名（不含姓，1–2 字）","meaning":"整個名字的意思與感覺 30–70 字","sound":"與姓連讀、諧音提醒 15–45 字","why":"選它的理由，可提喜用五行 20–50 字"}…共 10 個]}`
    : `{"intro":"開頭 80–160 字：先說這份參考怎麼挑字（意思、讀音、喜用五行三方面）${f.due ? "，並提一句目前是用預產期推算，出生後可以用實際時間重算一次" : ""}","chars":[{"c":"字","why":"為什麼選它 12–30 字"}…共 30 個],"names":[{"given":"名（不含姓，1–2 字，多數用 2 字）","meaning":"整個名字的意思與感覺 30–70 字","sound":"與姓連讀、諧音提醒 15–45 字","why":"選它的理由，可提喜用五行 20–50 字"}…共 10 個]}`;
  return `${head}\n\n請輸出：${shape}\n30 個候選字彼此不重複；10 個名字彼此不重複，只用可用字。`;
}

const len = (s: unknown) => (typeof s === "string" ? [...s].length : 0);
/** the model's JSON shaped and checked against the pool; null → the reason to send it back */
export function shapeName(j: Record<string, unknown>, f: NameFacts, pool: CharInfo[]): { ok: true; value: Omit<NameBody, "rounds"> } | { ok: false; why: string } {
  // the prompt lists at most 160; a common character of the same rules that the list left out is fine too
  const wide = namePool(f, Infinity);
  const inPool = (c: string) => pool.some((p) => same(p, c)) || wide.some((p) => same(p, c));
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const intro = str(j.intro);
  if (len(intro) < 40) return { ok: false, why: "short:intro" };
  const chars = (Array.isArray(j.chars) ? j.chars : []).map((x) => x as Record<string, unknown>)
    .map((x) => ({ c: str(x.c), why: str(x.why) })).filter((x) => [...x.c].length === 1 && inPool(x.c) && len(x.why) >= 6);
  const seen = new Set<string>();
  const charsU = chars.filter((x) => (seen.has(x.c) ? false : (seen.add(x.c), true))).slice(0, 30);
  const seenN = new Set<string>();
  const off: string[] = [];
  const names = (Array.isArray(j.names) ? j.names : []).map((x) => x as Record<string, unknown>)
    .map((x) => ({ given: str(x.given).replace(new RegExp(`^${f.surname}`), ""), meaning: str(x.meaning), sound: str(x.sound), why: str(x.why) }))
    .filter((x) => { const g = [...x.given]; const ok = g.length >= 1 && g.length <= 2 && g.every(inPool) && len(x.meaning) >= 15 && len(x.sound) >= 6 && len(x.why) >= 10 && x.given !== f.current; if (!ok) off.push(x.given); return ok; })
    .filter((x) => (seenN.has(x.given) ? false : (seenN.add(x.given), true))).slice(0, 10);
  if (charsU.length < 24) return { ok: false, why: `missing:chars ${charsU.length}` };
  if (names.length < 8) return { ok: false, why: `missing:names ${names.length} (not usable: ${off.join("、")})` };
  let current: NameBody["current"];
  if (f.kind === "rename") {
    const c = (j.current ?? {}) as Record<string, unknown>;
    current = { meaning: str(c.meaning), sound: str(c.sound), fit: str(c.fit) };
    if (len(current.meaning) < 20 || len(current.fit) < 15) return { ok: false, why: "short:current" };
  }
  const all = [intro, ...charsU.map((x) => x.why), ...names.flatMap((x) => [x.meaning, x.sound, x.why]), ...(current ? [current.meaning, current.sound, current.fit] : [])].join("");
  const bad = all.match(NAME_BANNED);
  if (bad) return { ok: false, why: `banned:${bad[0]}` };
  if (/[A-Za-z]{3,}/.test(all)) return { ok: false, why: "english" };
  return { ok: true, value: { intro, chars: charsU, names, ...(current ? { current } : {}) } };
}

const toScript = <T,>(v: T, locale: string): T =>
  (locale !== "zh" ? v
    : typeof v === "string" ? (toHans(v) as unknown as T)
    : Array.isArray(v) ? (v.map((x) => toScript(x, locale)) as unknown as T)
    : v && typeof v === "object" ? (Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toScript(x, locale)])) as T)
    : v);

async function write(r: NameReport): Promise<boolean> {
  const f = nmFactsOf(r);
  const pool = namePool(f);
  if (pool.length < 30) { recordOps("name_report_pool", `${r.token.slice(-6)} ${pool.length}`); }
  const messages: LlmMessage[] = [{ role: "system", content: system(r.locale, r.register) }, { role: "user", content: namePayload(f, pool) }];
  let last = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const raw = await chatJson(messages, { temperature: attempt === 0 ? 0.8 : 0.6, maxTokens: 6000 });
      let j: Record<string, unknown> | null = null;
      try { j = parseJsonLoose<Record<string, unknown>>(raw).value; } catch { j = null; }
      if (!j) { last = "parse"; messages.push({ role: "assistant", content: raw }, { role: "user", content: "REWRITE REQUIRED (not valid JSON). Output the ENTIRE JSON again, nothing else." }); continue; }
      const s = shapeName(j, f, pool);
      if (s.ok) {
        const body: NameBody = { ...toScript(s.value, r.locale), rounds: 1 };
        db().prepare("UPDATE name_reports SET body_json = ?, updated_at = ? WHERE token = ?").run(JSON.stringify(body), Date.now(), r.token);
        recordOps("name_report_part", `${r.kind} ${attempt}`);
        return true;
      }
      last = s.why;
      messages.push({ role: "assistant", content: raw }, { role: "user", content: `REWRITE REQUIRED (${s.why}). ${s.why.startsWith("missing") ? "Give all 30 characters and all 10 names. A name is the given name only (1–2 characters, no surname), every character from 可用字, and each name has meaning, sound and why at the full length asked for. Replace the names listed as not usable." : s.why.startsWith("banned") || s.why === "english" ? "Remove that wording: no 吉凶, no 旺財／改運／化解, no promises, no English." : "Write the full length asked for."} Output the ENTIRE JSON again.` });
    } catch (e) { last = e instanceof Error ? e.message.slice(0, 60) : "?"; }
  }
  recordOps("name_report_part_fail", `${r.token.slice(-6)} ${last}`);
  return false;
}

/* ------------------------------------------------------------------ rows */

export function createNameReport(i: { locale: string; register: string | null; customerId: number | null; email: string | null; facts: NameFacts; paid?: { session: string; amountMinor?: number } }, now = Date.now()): { token: string; created: boolean } {
  ensure();
  const hash = nmInputHash(i.facts, i.locale);
  if (i.customerId) {
    const prev = (i.paid
      ? db().prepare("SELECT token FROM name_reports WHERE customer_id = ? AND input_hash = ? AND paid_at IS NOT NULL ORDER BY created_at DESC LIMIT 1").get(i.customerId, hash)
      : db().prepare("SELECT token FROM name_reports WHERE customer_id = ? AND input_hash = ? AND paid_at IS NULL AND created_at > ? ORDER BY created_at DESC LIMIT 1").get(i.customerId, hash, now - 86_400_000)) as { token: string } | undefined;
    if (prev) return { token: prev.token, created: false };
  }
  const token = randomBytes(12).toString("hex");
  db().prepare(`INSERT INTO name_reports (token, kind, locale, register, customer_id, facts_json, input_hash, paid_at, paid_session, email, amount_minor, status, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?, 'new', ?)`)
    .run(token, i.facts.kind, i.locale, i.register, i.customerId, JSON.stringify(i.facts), hash, i.paid ? now : null, i.paid?.session ?? null, i.email, i.paid ? i.paid.amountMinor ?? 0 : null, now);
  return { token, created: true };
}

export function paidNameReportFor(customerId: number, facts: NameFacts, locale: string): string | null {
  ensure();
  return (db().prepare("SELECT token FROM name_reports WHERE customer_id = ? AND input_hash = ? AND paid_at IS NOT NULL ORDER BY created_at DESC LIMIT 1")
    .get(customerId, nmInputHash(facts, locale)) as { token: string } | undefined)?.token ?? null;
}

export function markNamePaid(token: string, p: { session: string; email: string | null; currency: string; amountMinor: number; customerId: number | null }, now = Date.now()): void {
  ensure();
  db().prepare("UPDATE name_reports SET paid_at = COALESCE(paid_at, ?), paid_session = COALESCE(paid_session, ?), email = COALESCE(email, ?), currency = COALESCE(currency, ?), amount_minor = COALESCE(amount_minor, ?), customer_id = COALESCE(customer_id, ?), updated_at = ? WHERE token = ?")
    .run(now, p.session, p.email, p.currency, p.amountMinor, p.customerId, now, token);
}

/**
 * 寶寶取名 bought on a 預產期: once, free, the chart from the real birth time — the 喜用 replaced, the writing done again.
 * false when it is not a 預產期 report, already recomputed, or unpaid.
 */
export function recomputeNameReport(token: string, chart: { favour: string[]; avoid: string[]; dayMaster: string; dmEl: string }, now = Date.now()): boolean {
  const r = nameReport(token);
  if (!r || !r.paid_at || r.kind !== "baby" || r.recomputed) return false;
  const f = nmFactsOf(r);
  if (!f.due) return false;
  const next: NameFacts = { ...f, favour: chart.favour, avoid: chart.avoid, dayMaster: chart.dayMaster, dmEl: chart.dmEl, due: false };
  db().prepare("UPDATE name_reports SET facts_json = ?, input_hash = ?, body_json = NULL, status = 'new', lease_at = NULL, recomputed = 1, updated_at = ? WHERE token = ?")
    .run(JSON.stringify(next), nmInputHash(next, r.locale), now, token);
  recordOps("name_report_recompute", token.slice(-6));
  void ensureNameReport(token).catch(() => null);
  return true;
}

function claim(token: string, now = Date.now()): boolean {
  ensure();
  const res = db().prepare("UPDATE name_reports SET status = 'writing', lease_at = ? WHERE token = ? AND status NOT IN ('done','incomplete') AND (status != 'writing' OR lease_at IS NULL OR lease_at < ?)")
    .run(now, token, now - LEASE_MS) as unknown as { changes?: number | bigint };
  return Number(res.changes ?? 0) > 0;
}
const writing = new Map<string, Promise<NameBody | null>>();

/** Write (once) a paid report; concurrent callers share one run. */
export function ensureNameReport(token: string): Promise<NameBody | null> {
  const r = nameReport(token);
  if (!r || !r.paid_at) return Promise.resolve(null);
  if (r.status === "done" || r.status === "incomplete") return Promise.resolve(nmBodyOf(r));
  const running = writing.get(token);
  if (running) return running;
  if (!claim(token)) return Promise.resolve(nmBodyOf(r));
  const p = (async () => {
    const okNow = nmBodyOf(r) ? true : await write(r).catch(() => false);
    // a second failed round (status was already 'retry') stops: the page says so, the sweep does not loop on it
    const status: NameStatus = okNow ? "done" : r.status === "retry" ? "incomplete" : "retry";
    db().prepare("UPDATE name_reports SET status = ?, lease_at = NULL, updated_at = ? WHERE token = ?").run(status, Date.now(), token);
    recordOps(status === "done" ? "name_report_done" : `name_report_${status}`, token.slice(-6));
    return nmBodyOf(nameReport(token));
  })().finally(() => writing.delete(token));
  writing.set(token, p);
  return p;
}

/* ------------------------------------------------------------------ payment */

export type NamePayResult = { ok: true; created: boolean; token: string } | { ok: false; why: "not_name" | "unpaid" | "no_report" };

/** A paid kind=name session → the report marked paid and the order recorded (tier name_baby / name_rename). Idempotent. */
export function fulfilNamePayment(s: CheckoutSession): NamePayResult {
  if (s.metadata?.kind !== "name") return { ok: false, why: "not_name" };
  if (s.payment_status !== "paid") return { ok: false, why: "unpaid" };
  const token = s.metadata?.name ?? "";
  const r = nameReport(token);
  if (!r) return { ok: false, why: "no_report" };
  const email = (s.customer_details?.email || s.metadata?.email || "").toLowerCase() || null;
  const amount = (s as { amount_total?: number }).amount_total ?? 0;
  const currency = (s.currency ?? s.metadata?.currency ?? "").toUpperCase();
  const customerId = Number(s.metadata?.cust) || (email ? customerIdByEmail(email) ?? upsertCustomer(email, r.locale) : null);
  recordOrder({
    sessionId: s.id, customerId, castId: null, tier: `name_${r.kind}`, amountCents: amount, currency, email, status: "paid",
    paymentIntent: typeof s.payment_intent === "string" ? s.payment_intent : null, campaign: s.metadata?.c ?? "name",
  });
  if (r.paid_at && r.paid_session === s.id) return { ok: true, created: false, token };
  markNamePaid(token, { session: s.id, email, currency, amountMinor: amount, customerId });
  recordOps("name_paid", `${r.kind} ${currency} ${amount}`);
  return { ok: true, created: true, token };
}

/** The letter with the link — once per report, when the writing has finished. */
export async function mailNameOnce(token: string, site: string): Promise<"sent" | "already" | "skip" | "failed"> {
  const { recordEmail } = await import("@/lib/db");
  const { buildNameReportEmail, sendEmail } = await import("@/lib/email");
  const { CONTACT_EMAIL } = await import("@/lib/trust");
  const r = nameReport(token);
  if (!r?.paid_at || r.status !== "done") return "skip";
  const email = (r.email ?? "").trim().toLowerCase();
  if (!email) return "skip";
  const claimed = (db().prepare("INSERT INTO emails (session_id, kind, email, sent_at, status, detail) VALUES (?, 'name-mail', ?, ?, 'sending', NULL) ON CONFLICT(session_id, kind) DO NOTHING")
    .run(`name:${token}`, email, Date.now()) as unknown as { changes?: number }).changes;
  if (!claimed) return "already";
  const { receiptFor } = await import("@/lib/receipt");
  const m = buildNameReportEmail({ url: `${site}${nameReportPath(token, r.locale)}`, kind: r.kind, hans: r.locale === "zh", receipt: await receiptFor(r.paid_session, r.locale === "zh" ? "zh" : "zh-hant") });
  const res = await sendEmail(email, m.subject, m.html, m.text, { kind: "name", sessionId: r.paid_session ?? `name:${token}`, customerId: r.customer_id ?? undefined, replyTo: CONTACT_EMAIL }).catch(() => ({ ok: false, error: "throw" } as { ok: boolean; error?: string; id?: string }));
  recordEmail(`name:${token}`, "name-mail", email, res.ok ? "sent" : "failed", res.ok ? res.id : res.error);
  return res.ok ? "sent" : "failed";
}

/** the reports to pick up again (a sweep): paid, not finished, not being written */
export function pendingNameReports(now = Date.now()): string[] {
  ensure();
  return (db().prepare("SELECT token FROM name_reports WHERE paid_at IS NOT NULL AND status IN ('new','retry','writing') AND (lease_at IS NULL OR lease_at < ?) ORDER BY paid_at LIMIT 10").all(now - LEASE_MS) as { token: string }[]).map((x) => x.token);
}
