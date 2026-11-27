import { randomBytes } from "node:crypto";
import { db } from "./db";
import { cardById, dealtOf, POSITIONS, tarotDraw, TAROT_TOKEN_RE } from "./tarot";
import { cardName, positionsIn } from "./tarot-text";
import type { Sign } from "./jiaobei";
import { attachXunwuCast, xunwuByToken } from "./xunwu-store";
import { placeOf } from "./xunwu";
import { CAT_LABEL, PLACE_LABEL, AGO_LABEL, TIER_LABEL, TRIGRAM_ZH } from "./xunwu-text";

/**
 * 10-17 承接 (Neil: 「这个擲筊怎么和现在的产品做承接呢？」→「全部做好吧」): what a reader did just before a cast — a 擲筊 or a
 * tarot spread on the same matter — carried into the cast the way a temple lot already is (lib/cast-extras.ts qian):
 *
 *   the 擲筊 result is kept on our side (jiaobei_asks, only when the reader wrote the matter down), the cast link carries
 *   its token, the cast request carries it on (body.pre = "jb:<token>" | "tarot:<token>"), the reading is told it as
 *   background (prePromptNote), and once the cast is saved both are filed under the same matter (attachPreCast).
 *
 * Only a token we hold is ever believed; the words shown on the cast page come from the link, the words the reading sees
 * come from our own row.
 */
/** 10-29 进度表 127: "xw" — the 尋物 dice page (no account there; the cast that follows needs one, as every cast) */
export type PreKind = "jb" | "tarot" | "xw";
export interface PreRef { kind: PreKind; token: string }
export const JB_TOKEN_RE = /^[0-9a-f]{24}$/;
const FRESH_MS = 7 * 86_400_000;

let ready = false;
function ensure(): void {
  if (ready) return;
  const d = db();
  d.exec(`
    CREATE TABLE IF NOT EXISTS jiaobei_asks (
      token TEXT PRIMARY KEY, created_at INTEGER NOT NULL, locale TEXT NOT NULL, bid TEXT, customer_id INTEGER,
      question TEXT NOT NULL, rule INTEGER NOT NULL, seq TEXT NOT NULL, sign TEXT NOT NULL,
      cast_id INTEGER, matter_id INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_jb_cast ON jiaobei_asks(cast_id) WHERE cast_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_jb_matter ON jiaobei_asks(matter_id) WHERE matter_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_jb_created ON jiaobei_asks(created_at);
  `);
  // the tarot spread gets the same two columns (lib/tarot.ts owns the table; its ensure() runs inside tarotDraw)
  try { tarotDraw("0".repeat(24)); } catch { /* */ }
  const cols = new Set((d.prepare("PRAGMA table_info(tarot_draws)").all() as { name: string }[]).map((c) => c.name));
  if (cols.size && !cols.has("cast_id")) d.exec("ALTER TABLE tarot_draws ADD COLUMN cast_id INTEGER");
  if (cols.size && !cols.has("matter_id")) d.exec("ALTER TABLE tarot_draws ADD COLUMN matter_id INTEGER");
  ready = true;
}

const SIGN_CODE: Record<Sign, string> = { sheng: "s", xiao: "x", yin: "y" };
const CODE_SIGN: Record<string, Sign> = { s: "sheng", x: "xiao", y: "yin" };

export interface JiaobeiAsk { token: string; created_at: number; locale: string; question: string; rule: 1 | 3; seq: Sign[]; sign: Sign; cast_id: number | null; matter_id: number | null }

/** A finished 擲筊 on a written-down matter. `sign` is how it ended: three 聖筊 (rule 3) or the one toss count as "sheng". */
export function saveJiaobeiAsk(i: { question: string; rule: 1 | 3; seq: Sign[]; locale: string; bid: string | null; customerId: number | null }, now = Date.now()): string {
  ensure();
  const token = randomBytes(12).toString("hex");
  const last = i.seq[i.seq.length - 1] ?? "xiao";
  db().prepare("INSERT INTO jiaobei_asks (token, created_at, locale, bid, customer_id, question, rule, seq, sign) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(token, now, i.locale, i.bid, i.customerId, i.question.slice(0, 120), i.rule, i.seq.map((s) => SIGN_CODE[s]).join(""), last);
  return token;
}

export function jiaobeiAsk(token: string): JiaobeiAsk | null {
  ensure();
  if (!JB_TOKEN_RE.test(token)) return null;
  const r = db().prepare("SELECT * FROM jiaobei_asks WHERE token = ?").get(token) as (Omit<JiaobeiAsk, "seq"> & { seq: string }) | undefined;
  return r ? { ...r, rule: r.rule === 3 ? 3 : 1, seq: [...r.seq].map((c) => CODE_SIGN[c] ?? "xiao") } : null;
}

/** "jb:<token>" / "tarot:<token>" from a cast request — only a fresh row we hold */
export function preFromBody(body: unknown): PreRef | undefined {
  const raw = (body as { pre?: unknown })?.pre;
  return parsePre(typeof raw === "string" ? raw : "");
}
export function parsePre(raw: string): PreRef | undefined {
  const m = /^(jb|tarot|xw):([0-9a-f]{24})$/.exec(raw);
  if (!m) return undefined;
  try {
    if (m[1] === "jb") { const a = jiaobeiAsk(m[2]!); return a && Date.now() - a.created_at < FRESH_MS ? { kind: "jb", token: a.token } : undefined; }
    if (m[1] === "xw") { const x = xunwuByToken(m[2]!); return x && Date.now() - x.created_at < FRESH_MS ? { kind: "xw", token: x.token } : undefined; }
    const d = TAROT_TOKEN_RE.test(m[2]!) ? tarotDraw(m[2]!) : null;
    return d && Date.now() - d.created_at < FRESH_MS ? { kind: "tarot", token: d.token } : undefined;
  } catch { return undefined; }
}
export const preString = (p: PreRef) => `${p.kind}:${p.token}`;
export const isPreRef = (x: unknown): x is PreRef => !!x && typeof x === "object" && ((x as PreRef).kind === "jb" || (x as PreRef).kind === "tarot" || (x as PreRef).kind === "xw") && JB_TOKEN_RE.test((x as PreRef).token);

/** What the reading's model is told: background only — never a reason to bend the chart, never a deity speaking. */
export function prePromptNote(pre: PreRef | undefined): string {
  if (!pre) return "";
  try {
    if (pre.kind === "jb") {
      const a = jiaobeiAsk(pre.token);
      if (!a) return "";
      // 10-30 进度表 128 ⑤: a toss on a page in another language — no Chinese example sentence for the writer to copy
      const jbZh = !a.locale || a.locale === "zh" || a.locale === "zh-hant";
      const what = a.rule === 3
        ? (a.sign === "sheng" ? "they tossed until three 聖筊 came (a yes: the direction is confirmed)" : a.sign === "yin" ? "they tossed for three 聖筊 but a 陰筊 came (not confirmed for now)" : "the tosses kept coming up 笑筊 (the question was not yet clear)")
        : (a.sign === "sheng" ? "one toss, a 聖筊 (a yes: the direction is confirmed)" : a.sign === "yin" ? "one toss, a 陰筊 (not confirmed for now)" : "one toss, a 笑筊 (the question was not yet clear)");
      return `\n\nBACKGROUND — MOON BLOCKS (擲筊): just before this cast the reader asked about this same matter with moon blocks: ${what}. Treat it as part of their situation (what they already feel they were told). It does not change the chart, its lean or its timing. Near the opening put ONE short sentence that ties the two together in this sense: the blocks gave a direction, this chart adds where the matter stands and when${jbZh ? " (e.g. 「擲筊給了方向；這一卦接著看這件事走到哪、日子落在哪」)" : " (in the reading's language, calling them moon blocks)"}. If the chart's lean disagrees with the blocks, say both plainly and what the reader can do now. Never say a deity said or promised anything, never call it 靈驗, never tell the reader to toss again.`;
    }
    if (pre.kind === "xw") {
      // 10-29 进度表 127: the free 尋物 card they just saw (梅花〈失物占〉) — background; this chart is read on its own
      const x = xunwuByToken(pre.token);
      if (!x) return "";
      const toward = x.toward as keyof typeof TRIGRAM_ZH;
      return `\n\nBACKGROUND — LOST ITEM DICE PAGE (尋物): just before this cast the reader used our free 梅花易數〈失物占〉 page for this lost item: ${CAT_LABEL[x.cat]}, last seen ${PLACE_LABEL[x.place]}, lost ${AGO_LABEL[x.ago]}. That page told them: 「${TIER_LABEL[x.tier]}」, look first toward the ${placeOf(toward).dir} (${TRIGRAM_ZH[toward]}). Treat it as part of their situation. It does not change this chart, its lean or its timing — this chart answers what that page cannot: whether it comes back, at home or outside, whether it was moved, which days, which kind of place first. Near the opening put ONE short sentence tying the two together in this sense: the dice gave a direction to start; this chart looks closer (e.g. 「擲骰子給了先找的方向；這一卦接著看找不找得回、大概哪幾天」). If this chart leans differently from that page, say so in one plain sentence and follow the chart. Never promise it will be found, never say it is gone for good, never tell them to roll the dice again.`;
    }
    const d = tarotDraw(pre.token);
    if (!d) return "";
    // 10-30 进度表 128: a spread drawn in another language is named in that language (and in English) — the reading is written in it
    const zh = d.locale === "zh" || d.locale === "zh-hant";
    const pos = zh ? POSITIONS[d.spread] : positionsIn(d.locale, d.spread);
    const cards = dealtOf(d).map((x, i) => `${pos[i] ?? ""}${pos[i] ? ": " : ""}${zh ? cardById(x.id)?.zh ?? x.id : `${cardName(x.id, d.locale)} (${cardName(x.id, "en")})`}${x.rev ? " (reversed)" : ""}`).join("; ");
    return `\n\nBACKGROUND — TAROT: just before this cast the reader drew tarot cards about this same matter: ${cards}. Treat it as part of their situation. It does not change the chart, its lean or its timing; tarot gives no dates — this chart does. Near the opening put ONE short sentence tying the two together ${zh ? "(e.g. 「牌看的是現在；這一卦接著看日子落在哪」)" : "(in the reading's language, in this sense: the cards show where it stands now; this chart adds when)"}. Do not interpret the cards. Never say the cards promised anything, never tell the reader to draw again.`;
  } catch { return ""; }
}

/** The cast that followed, and its matter — set once (the first cast is the one that followed). */
export function attachPreCast(pre: PreRef | undefined, castId: number): void {
  if (!pre) return;
  try {
    ensure();
    const d = db();
    const m = d.prepare("SELECT matter_id FROM casts WHERE id = ?").get(castId) as { matter_id: number | null } | undefined;
    if (pre.kind === "xw") { attachXunwuCast(pre.token, castId, m?.matter_id ?? null); return; } // 10-29 进度表 127: the funnel's 「解讀」 step
    const table = pre.kind === "jb" ? "jiaobei_asks" : "tarot_draws";
    d.prepare(`UPDATE ${table} SET cast_id = COALESCE(cast_id, ?), matter_id = COALESCE(matter_id, ?) WHERE token = ?`).run(castId, m?.matter_id ?? null, pre.token);
  } catch { /* the cast stands on its own */ }
}

/** For the matter page: what was asked before casts on this matter, oldest first. */
export function preForMatter(matterId: number): { kind: PreKind; at: number; sign?: Sign; rule?: 1 | 3; cards?: string[]; token: string }[] {
  try {
    ensure();
    const d = db();
    const jb = (d.prepare("SELECT token, created_at, rule, seq, sign FROM jiaobei_asks WHERE matter_id = ? OR cast_id IN (SELECT id FROM casts WHERE matter_id = ?)").all(matterId, matterId) as { token: string; created_at: number; rule: number; seq: string; sign: Sign }[])
      .map((r) => ({ kind: "jb" as const, at: r.created_at, sign: r.sign, rule: (r.rule === 3 ? 3 : 1) as 1 | 3, token: r.token }));
    const tr = (d.prepare("SELECT token, created_at, cards_json FROM tarot_draws WHERE matter_id = ? OR cast_id IN (SELECT id FROM casts WHERE matter_id = ?)").all(matterId, matterId) as { token: string; created_at: number; cards_json: string }[])
      .map((r) => ({ kind: "tarot" as const, at: r.created_at, cards: dealtOf(r).map((x) => `${cardById(x.id)?.zh ?? x.id}${x.rev ? "（逆位）" : ""}`), token: r.token }));
    return [...jb, ...tr].sort((a, b) => a.at - b.at);
  } catch { return []; }
}

/** For the weekly review: of those who went on to cast, how many paid for a reading on that cast — by how the 擲筊 ended. */
export function preFunnel(since: number): { jb: Record<string, { asks: number; cast: number; paid: number }>; tarot: { draws: number; cast: number; paid: number } } {
  ensure();
  const d = db();
  const paidOn = "EXISTS (SELECT 1 FROM orders o WHERE o.cast_id = x.cast_id AND o.payment_state = 'paid')";
  const jb: Record<string, { asks: number; cast: number; paid: number }> = {};
  for (const r of d.prepare(`SELECT CASE WHEN rule = 3 AND sign = 'sheng' THEN 'sheng3' ELSE sign END k, COUNT(*) n, SUM(cast_id IS NOT NULL) c, SUM(cast_id IS NOT NULL AND ${paidOn}) p FROM jiaobei_asks x WHERE created_at >= ? GROUP BY k`).all(since) as { k: string; n: number; c: number; p: number }[]) {
    jb[r.k] = { asks: r.n, cast: r.c ?? 0, paid: r.p ?? 0 };
  }
  const t = d.prepare(`SELECT COUNT(*) n, SUM(cast_id IS NOT NULL) c, SUM(cast_id IS NOT NULL AND ${paidOn}) p FROM tarot_draws x WHERE created_at >= ?`).get(since) as { n: number; c: number | null; p: number | null };
  return { jb, tarot: { draws: t.n, cast: t.c ?? 0, paid: t.p ?? 0 } };
}
