import { chatJson, type LlmMessage } from "./llm";
import { CANTONESE_NOTE, HK_WRITTEN_NOTE } from "./reading";
import { customerIdByEmail, markQianPaid, qianDrawByToken, recordOps, recordOrder, sessionRefunded, setQianFollowup, setQianPersonal, upsertCustomer, type QianDrawRow } from "./db";
import { isVagueTemple, qianByNum, qianDiffAt, qianPoemAt, qianResultPath, qianSetName, qianSituation, qianTag, TEMPLES, type QianEntry } from "./qian";
import type { CheckoutSession } from "./stripe";
import { record } from "./analytics-server";

/**
 * 10-12 解籤 · 次路径 (进度表 §四 36 ③): 「這支籤放在我這件事上」 — a short personal reading of the lot against the
 * reader's own question, at the light-reading price. Written from the poem, our plain reading of it and the question;
 * no date (dates come from a cast), and it ends by pointing at the cast. Paid through a one-off Checkout
 * (metadata.kind = "qian"); written the first time the result page is opened after payment, or by the fulfil sweep
 * for a buyer who never came back (who then gets the link by mail).
 */

export interface QianPersonal { reading: string; watch: string; next: string }

const FORBIDDEN = /神明|神說|神说|菩薩說|媽祖說|妈祖说|靈驗|灵验|改運|改运|保證|保证|一定會|一定会|\bAI\b|人工智慧|準確|准确/;
const DATEISH = /\d{1,2}\s*[月日號号]|[一二三四五六七八九十]+[月日]|下週|下周|這週|这周|本週|本周|幾天內|几天内|\d+\s*天/;

export function qianPersonalSystem(register?: string | null): string {
  return [
    "You write for YaoFlow, a Taiwanese site about the Yijing and temple lots. A reader drew a temple lot (六十甲子籤, 天后宮籤, 關帝籤, 月老聖籤 or 黃大仙靈籤) and asks how it applies to their own matter.",
    register === "yue" ? `Short plain sentences, second person, like a knowledgeable friend talking — warm, never preachy, never frightening. ${CANTONESE_NOTE}`
      : register === "hk" ? `Write in Traditional Chinese, short plain sentences, second person 你, like a knowledgeable friend talking — warm, never preachy, never frightening. ${HK_WRITTEN_NOTE}`
      : "Write in Traditional Chinese as people in Taiwan write it (傳訊息、已讀不回、曖昧、斷聯、主動、面試), short plain sentences, second person 你, like a knowledgeable friend talking — warm, never preachy, never frightening.",
    "Read the lot honestly: if it points to obstacles, say where the difficulty lies and what to do now. Do not flatter.",
    "HARD RULES: never say a deity said, showed or promised anything; never use 靈驗、改運、保證、一定、準、AI; never give a date, a month, a week, a number of days or any time point — timing is what a separate cast is for; never tell a story about historical figures; no medical, legal or investment advice (say to ask a professional where it matters); never criticise the reader.",
    "Do not quote the poem line by line; do not repeat the plain reading you are given — apply it to THIS question.",
    'Output JSON only: {"reading": "<how this lot reads for their question: 160–240 characters>", "watch": "<one concrete thing to watch for or do now: 30–60 characters>", "next": "<one sentence, 20–40 characters, a question to the reader that names THEIR matter in a few plain words (paraphrase it — e.g. 他什麼時候會先開口、這份 offer 哪幾天會有回音) and leads to finding out WHEN by casting a hexagram for it (起一卦); it must contain 卦. Never suggest drawing another lot (抽籤/再抽一支) and never offer to do it for them>"}',
    "The lot gives the direction and the attitude; it does not give days. When the reading reaches the question of timing, say plainly that the lot does not say which days — that is what casting a hexagram for the same matter is for.",
  ].join("\n");
}

export function qianPersonalUser(e: QianEntry, d: Pick<QianDrawRow, "question" | "situation" | "temple">): string {
  const sit = qianSituation(d.situation);
  // 10-12 各廟用字: the reader's slip is the temple's own wording; our plain reading was written from the base text
  const diff = qianDiffAt(e, d.temple);
  return JSON.stringify({
    lot: {
      set: qianSetName(e), number: e.num, ...(e.ganzhi ? { ganzhi: e.ganzhi } : qianTag(e) ? { printed_title: qianTag(e) } : {}), poem: qianPoemAt(e, d.temple), gist: e.title, plain: e.plain, overall: e.overall, love: e.love, work: e.work,
      ...(diff.length ? { wording_note: `The reader's temple prints ${diff.map((x) => `line ${x.line} as 「${x.theirs}」`).join(", ")}; "plain" was written from another temple's wording (${diff.map((x) => `「${x.base}」`).join(", ")}). Read the reader's own lines.` } : {}),
    },
    reader: { question: d.question, kind_of_matter: sit.label, temple: !isVagueTemple(d.temple) ? TEMPLES.find((t) => t.id === d.temple)?.name ?? null : null },
  });
}

export function personalOffense(p: QianPersonal): string | null {
  const all = `${p.reading} ${p.watch} ${p.next}`;
  const f = all.match(FORBIDDEN);
  if (f) return `forbidden:${f[0]}`;
  const t = all.match(DATEISH);
  if (t) return `date:${t[0]}`;
  // 10-12 实测: the closing line offered 「幫你抽一支」 — the way on is a cast, never another lot
  const redraw = all.match(/再抽|重抽|抽一支|抽支籤|抽另一支|幫你抽|帮你抽/);
  if (redraw) return `redraw:${redraw[0]}`;
  if (p.reading.length < 80) return "short";
  // 10-13 承接: the closing question is the door to the cast — it has to name it
  if (!/卦/.test(p.next)) return "next:no-cast";
  return null;
}

/* ---------------- 10-13 the one included follow-up ---------------- */

/** {answer, cast}: cast = this answer should end at the cast door (a timing question, or the lot has said all it can). */
export interface QianFollowup { answer: string; cast: boolean }

/** A question about WHEN — the lot cannot answer it; the reply points at the cast whatever the model says. */
export const TIMING_Q = /什麼時候|什么时候|甚麼時候|甚么时候|幾時|几时|何時|何时|哪天|哪一天|哪幾天|哪几天|多久|多快|還要等|还要等|要等多|時間點|时间点|日子|幾月|几月|哪個月|哪个月|今年|明年|月底|年底/;

export function qianFollowupSystem(register?: string | null): string {
  const base = qianPersonalSystem(register).split("\n");
  return [
    ...base.slice(0, 4), // who we are, the voice, read honestly, the hard rules (no deity, no date, no 準/AI…)
    "You already wrote this reader a personal reading of their lot (given). They have ONE follow-up question, included in what they paid. Answer it about THIS lot and THIS matter — concretely, kindly, honestly; do not repeat the reading.",
    "If they ask WHEN (which day, how long, this month or next): say plainly that a lot speaks of direction and attitude, not days, then say what the lot does suggest about 節奏 and 準備 (in Chinese — never an English word), and that casting a hexagram for the same matter gives the days. Never guess a time.",
    "If the follow-up is about a different matter, answer in one sentence how this lot bears on it, and say a new matter deserves its own cast.",
    "Never suggest drawing another lot (再抽/重抽/抽一支); never offer to do anything for them.",
    'Output JSON only: {"answer": "<120–220 characters>", "cast": <true if the honest next step is casting a hexagram for this matter (always true for a timing question), else false>}',
  ].join("\n");
}

export function qianFollowupUser(e: QianEntry, d: Pick<QianDrawRow, "question" | "situation" | "temple">, personal: QianPersonal, followup: string): string {
  const base = JSON.parse(qianPersonalUser(e, d)) as Record<string, unknown>;
  return JSON.stringify({ ...base, our_reading: personal, follow_up: followup });
}

export function followupOffense(f: QianFollowup): string | null {
  const m = f.answer.match(FORBIDDEN) ?? f.answer.match(DATEISH) ?? f.answer.match(/再抽|重抽|抽一支|抽支籤|抽另一支|幫你抽|帮你抽/);
  if (m) return `bad:${m[0]}`;
  // 10-13 实测: a word of the prompt's English leaked into the answer (「pace 上」); the words readers use (offer, LINE, IG) stay fine
  const en = f.answer.match(/\b(?!(?:offer|line|ig|email|mail|ok|app)\b)[A-Za-z]{3,}\b/i);
  if (en) return `english:${en[0]}`;
  if (f.answer.length < 50) return "short";
  return null;
}

export type FollowupResult = { ok: true; followup: QianFollowup; question: string } | { ok: false; why: "no_draw" | "unpaid" | "no_reading" | "used" | "failed" };

const answering = new Map<string, Promise<FollowupResult>>();

/** Answer (once) the follow-up a paid personal reading includes. A failed answer does not use it up. */
export function answerQianFollowup(token: string, question: string): Promise<FollowupResult> {
  const d = qianDrawByToken(token);
  if (!d) return Promise.resolve({ ok: false, why: "no_draw" });
  if (!d.paid_at || sessionRefunded(d.paid_session)) return Promise.resolve({ ok: false, why: "unpaid" });
  if (d.followup_json) return Promise.resolve({ ok: false, why: "used" });
  const running = answering.get(token);
  if (running) return running;
  let personal: QianPersonal | null = null;
  try { personal = d.personal_json ? (JSON.parse(d.personal_json) as QianPersonal) : null; } catch { /* */ }
  const e = qianByNum(d.num, d.set_name);
  if (!personal || !e) return Promise.resolve({ ok: false, why: "no_reading" });
  const timing = TIMING_Q.test(question);
  const p = (async (): Promise<FollowupResult> => {
    const messages: LlmMessage[] = [
      { role: "system", content: qianFollowupSystem(d.register) },
      { role: "user", content: qianFollowupUser(e, d, personal!, question) },
    ];
    let last = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const raw = await chatJson(messages, { temperature: attempt === 0 ? 0.5 : 0.3, maxTokens: 800 });
        const j = JSON.parse(raw) as { answer?: unknown; cast?: unknown };
        const f: QianFollowup = { answer: typeof j.answer === "string" ? j.answer.trim() : "", cast: j.cast === true || timing };
        const bad = f.answer ? followupOffense(f) : "parse";
        if (!bad) {
          if (!setQianFollowup(token, question, f)) return { ok: false, why: "used" };
          recordOps("qian_followup", `${d.num} ${attempt}${f.cast ? " cast" : ""}`);
          record({ t: Date.now(), e: "qian_followup", s: token.slice(-12), locale: "zh-hant", method: f.cast ? "cast" : "plain", path: "/jieqian", c: "jieqian" });
          return { ok: true, followup: f, question };
        }
        last = bad;
        messages.push({ role: "assistant", content: raw }, { role: "user", content: `REWRITE REQUIRED (${bad}). No deity speaking, no 靈驗/改運/保證/一定/準, no date, month, week or number of days, never another lot; 120–220 characters. Output the ENTIRE JSON again.` });
      } catch (err) { last = err instanceof Error ? err.message.slice(0, 60) : "?"; }
    }
    recordOps("qian_followup_fail", `${d.num} ${last}`);
    return { ok: false, why: "failed" };
  })().finally(() => answering.delete(token));
  answering.set(token, p);
  return p;
}

export function qianFollowupOf(d: Pick<QianDrawRow, "followup_q" | "followup_json">): { question: string; followup: QianFollowup } | null {
  if (!d.followup_q || !d.followup_json) return null;
  try { return { question: d.followup_q, followup: JSON.parse(d.followup_json) as QianFollowup }; } catch { return null; }
}

function parsePersonal(raw: string): QianPersonal | null {
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    const s = (k: string) => (typeof j[k] === "string" ? (j[k] as string).trim() : "");
    const p = { reading: s("reading"), watch: s("watch"), next: s("next") };
    return p.reading && p.next ? p : null;
  } catch { return null; }
}

const writing = new Map<string, Promise<QianPersonal | null>>();

/** Write (once) the personal reading of a paid draw; concurrent callers share one generation. */
export function ensureQianPersonal(token: string): Promise<QianPersonal | null> {
  const d = qianDrawByToken(token);
  if (!d || !d.paid_at) return Promise.resolve(null);
  if (d.personal_json) { try { return Promise.resolve(JSON.parse(d.personal_json) as QianPersonal); } catch { /* rewrite */ } }
  const running = writing.get(token);
  if (running) return running;
  const e = qianByNum(d.num, d.set_name);
  if (!e) return Promise.resolve(null);
  const p = (async () => {
    const messages: LlmMessage[] = [
      { role: "system", content: qianPersonalSystem(d.register) },
      { role: "user", content: qianPersonalUser(e, d) },
    ];
    let last = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const raw = await chatJson(messages, { temperature: attempt === 0 ? 0.6 : 0.4, maxTokens: 1200 });
        const out = parsePersonal(raw);
        if (!out) { last = "parse"; continue; }
        const bad = personalOffense(out);
        if (!bad) { setQianPersonal(token, out); recordOps("qian_personal", `${d.num} ${attempt}`); return out; }
        last = bad;
        messages.push({ role: "assistant", content: raw }, { role: "user", content: `REWRITE REQUIRED (${bad}). Follow the HARD RULES: no deity speaking, no 靈驗/改運/保證/一定/準, no date, month, week or number of days anywhere, and "next" names their matter and leads to casting a hexagram (起一卦, it must contain 卦) — never to drawing another lot. Output the ENTIRE JSON again.` });
      } catch (err) { last = err instanceof Error ? err.message.slice(0, 60) : "?"; }
    }
    recordOps("qian_personal_fail", `${d.num} ${last}`);
    return null;
  })().finally(() => writing.delete(token));
  writing.set(token, p);
  return p;
}

export type QianPayResult = { ok: true; created: boolean; token: string; email: string | null } | { ok: false; why: "not_qian" | "unpaid" | "no_draw" };

/** A paid kind=qian session → the draw marked paid. Idempotent (the result page's return and the sweep may both call). */
export function fulfilQianPayment(s: CheckoutSession): QianPayResult {
  if (s.metadata?.kind !== "qian") return { ok: false, why: "not_qian" };
  if (s.payment_status !== "paid") return { ok: false, why: "unpaid" };
  const token = s.metadata?.qian ?? "";
  const d = qianDrawByToken(token);
  if (!d) return { ok: false, why: "no_draw" };
  const email = (s.customer_details?.email || s.metadata?.email || "").toLowerCase() || null;
  const amount = (s as { amount_total?: number }).amount_total ?? 0;
  const currency = (s.currency ?? s.metadata?.currency ?? "").toUpperCase();
  // 10-12 收尾 ④: a paid lot reading is an order like any other (tier "qian", no cast) — the dashboard counts its money and
  // the customer page's refund button works on it; idempotent per session, so the late sweep finding it again is harmless
  const customerId = Number(s.metadata?.cust) || (email ? customerIdByEmail(email) ?? upsertCustomer(email, "zh-hant") : null);
  recordOrder({
    sessionId: s.id, customerId, castId: null, tier: "qian", amountCents: amount, currency, email, status: "paid",
    paymentIntent: typeof s.payment_intent === "string" ? s.payment_intent : null, campaign: s.metadata?.c ?? "jieqian",
  });
  if (d.paid_at && d.paid_session === s.id) return { ok: true, created: false, token, email: d.email ?? email };
  markQianPaid(token, { session: s.id, email, currency, amountMinor: amount, customerId });
  record({ t: Date.now(), e: "qian_personal_buy", s: token.slice(-12), locale: "zh-hant", method: (s.currency ?? "").toUpperCase(), path: "/jieqian", c: "jieqian" });
  recordOps("qian_paid", `${d.num} ${(s.currency ?? "?").toUpperCase()} ${(s as { amount_total?: number }).amount_total ?? "?"}`);
  return { ok: true, created: true, token, email };
}

export const qianResultUrl = (site: string, token: string) => `${site}${qianResultPath(token)}`;

/**
 * 10-14 (Neil: 「解签之后没有发邮件给客户吗？我这边好像看不到」): the letter with the link went out only when the 10-minute
 * sweep was the first to see the payment — a buyer who came back from Stripe (the page records it first) and every member
 * using an allowance never got one. 26 paid lot readings, 0 letters. Now: once per lot, from whichever path finds the
 * written reading first — the result page, the sweep, a member's allowance. The emails row is the claim, so two paths
 * running at once still send one.
 */
export async function mailQianOnce(token: string, site: string): Promise<"sent" | "already" | "skip" | "failed"> {
  const { db, recordEmail } = await import("./db");
  const { buildQianEmail, sendEmail } = await import("./email");
  const { CONTACT_EMAIL } = await import("./trust");
  const d = qianDrawByToken(token);
  if (!d?.paid_at || !d.personal_json) return "skip";
  const email = (d.email ?? "").trim().toLowerCase();
  if (!email) return "skip";
  const e = qianByNum(d.num, d.set_name);
  if (!e) return "skip";
  const claimed = (db().prepare("INSERT INTO emails (session_id, kind, email, sent_at, status, detail) VALUES (?, 'qian-mail', ?, ?, 'sending', NULL) ON CONFLICT(session_id, kind) DO NOTHING")
    .run(`qian:${token}`, email, Date.now()) as unknown as { changes?: number }).changes;
  if (!claimed) return "already";
  // 10-23 进度表 111 ③: what was paid and the receipt, when this was bought on its own
  const { receiptFor } = await import("./receipt");
  const m = buildQianEmail({ num: e.num, title: e.title, url: `${site}${qianResultPath(token)}`, setName: qianSetName(e), receipt: await receiptFor(d.paid_session, "zh-hant") });
  const r = await sendEmail(email, m.subject, m.html, m.text, { kind: "qian", sessionId: d.paid_session ?? `qian:${token}`, customerId: d.customer_id ?? undefined, replyTo: CONTACT_EMAIL }).catch(() => ({ ok: false, error: "throw" } as { ok: boolean; error?: string; id?: string }));
  recordEmail(`qian:${token}`, "qian-mail", email, r.ok ? "sent" : "failed", r.ok ? r.id : r.error);
  return r.ok ? "sent" : "failed";
}
