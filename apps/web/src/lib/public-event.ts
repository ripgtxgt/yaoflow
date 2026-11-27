import { chatJson, type LlmMessage } from "./llm";
import { db, recordOps } from "./db";

/**
 * 11-05 进度表 140 (Neil：「做吧」— 公开事件查事实). A question about a public, dated event (a match, an election, an exam
 * list, a draw, a launch) is read against the real calendar: the day it is decided, and whether it already was.
 *
 *   1. classify — one small DeepSeek call: is this a public, checkable event? Private matters (love, work, family, health,
 *      a named private person) are never searched; the question itself never leaves for the search.
 *   2. look up — OpenAI's web search, asked for three facts only: the event, the deciding date, the status (upcoming /
 *      in progress / decided) and the result if decided. No odds, no predictions, no commentary.
 *   3. check — the program, not the model: a real date; at least two distinct source domains from the search's own
 *      citations; a "decided" result needs its date on or before today; an "upcoming" one needs its date on or after
 *      today. Anything else is dropped and the reading goes on as before.
 *
 * Kept a day per (event, day) so ten readers asking about one final cost one search. Every failure is silent.
 */
export interface EventFacts {
  event: string;
  date: string;          // YYYY-MM-DD, the day it is decided
  status: "upcoming" | "in_progress" | "decided";
  result?: string;       // only when decided
  sources: string[];     // registrable domains
}

const CLASSIFY = `You sort questions people bring to a divination site. Answer ONLY strict JSON {"public":bool,"event":"...","kind":"..."}.
"public": true ONLY when the question asks how a PUBLIC event with a known date will turn out — a sports match or tournament, an election or vote, an official exam's published results, a lottery draw, an announced product launch or award. Its outcome must be something anyone can look up afterwards.
"public": false for anything personal or private — love, a partner or ex, a job, an interview, money they lent, family, health, a lawsuit, a private company deal, their own exam score — even if a date or a famous name appears.
"event": when public, the event in a short neutral search phrase with its year (e.g. "2026 League of Legends World Championship final"), naming only teams, parties or the competition — never the asker, never a private person. Empty when not public.
"kind": sports | election | exam | lottery | launch | award | other.`;

const SEEN = new Map<string, { event: string; kind: string } | null>();
export async function classifyEvent(question: string, today: string): Promise<{ event: string; kind: string } | null> {
  const q = question.trim().slice(0, 300);
  if (q.length < 4) return null;
  const ck = `${today}|${q}`;
  if (SEEN.has(ck)) return SEEN.get(ck)!;
  const v = await classifyOnce(q, today);
  SEEN.set(ck, v);
  if (SEEN.size > 3000) SEEN.clear();
  return v;
}
async function classifyOnce(q: string, today: string): Promise<{ event: string; kind: string } | null> {
  const messages: LlmMessage[] = [{ role: "system", content: CLASSIFY }, { role: "user", content: `Today: ${today}\nQuestion: ${q}` }];
  try {
    const raw = JSON.parse(await chatJson(messages, { temperature: 0, maxTokens: 120, timeoutMs: 8000, light: true })) as { public?: unknown; event?: unknown; kind?: unknown };
    if (raw.public !== true || typeof raw.event !== "string" || raw.event.trim().length < 4) return null;
    return { event: raw.event.trim().slice(0, 120), kind: typeof raw.kind === "string" ? raw.kind : "other" };
  } catch { return null; }
}

const DOMAIN = (u: string): string | null => {
  try { const h = new URL(u).hostname.replace(/^www\./, ""); const p = h.split("."); return p.length > 2 && p[p.length - 2]!.length <= 3 ? p.slice(-3).join(".") : p.slice(-2).join("."); } catch { return null; }
};
/** hosts that are throwaway mirrors, not publishers (seen 11-05: a vercel.app page claiming a final that had not been played) */
const NOT_A_SOURCE = /(vercel\.app|netlify\.app|github\.io|blogspot\.|medium\.com|reddit\.com|fandom\.com|wikipedia\.org)$/;

/** pure: the program's check of what the search returned (exported for tests) */
export function checkFacts(raw: Record<string, unknown>, citations: string[], today: string): EventFacts | null {
  const date = typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) && !Number.isNaN(Date.parse(`${raw.date}T00:00:00Z`)) ? raw.date : null;
  const status = raw.status === "upcoming" || raw.status === "in_progress" || raw.status === "decided" ? raw.status : null;
  const event = typeof raw.event === "string" ? raw.event.trim().slice(0, 160) : "";
  if (!date || !status || !event) return null;
  const domains = [...new Set(citations.map(DOMAIN).filter((d): d is string => !!d && !NOT_A_SOURCE.test(d)))];
  if (domains.length < 2) return null;
  if (status === "decided" && date > today) return null;             // a result claimed for a day still ahead
  // 11-09 (T-034: a Worlds semifinal on 11-08 Texas time — 11-09 06:00 Taipei — was reported 「已經打完」 on 11-09 morning,
  // with an old final's result): the date is the event's own local day, today is the reader's, so a result is taken
  // only for a day at least two days gone; and it must name this edition's year, so an earlier year's result can't pass
  const daysAgo = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);
  if (status === "decided" && daysAgo < 2) return null;
  const year = date.slice(0, 4);
  if (status === "decided" && !(event.includes(year) || (typeof raw.result === "string" && raw.result.includes(year)))) return null;
  if (status === "decided" && typeof raw.reported === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.reported) && raw.reported < date) return null; // reported before it happened
  if (status === "upcoming" && date < today) return null;            // "still to come" on a day already gone
  const result = status === "decided" && typeof raw.result === "string" && raw.result.trim().length >= 2 ? raw.result.trim().slice(0, 200) : undefined;
  if (status === "decided" && !result) return null;
  // far ahead is not checkable news, it is a guess
  if (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`) > 400 * 86_400_000) return null;
  return { event, date, status, ...(result ? { result } : {}), sources: domains.slice(0, 5) };
}

const LOOKUP = (event: string, today: string) => `Today is ${today}. Look up this public event on the web: "${event}".
Report ONLY facts, as strict JSON and nothing else:
{"event":"official name WITH the year/edition (e.g. \"2026 League of Legends World Championship semifinal T1 vs BLG\")","date":"YYYY-MM-DD the day its outcome is decided (the final, election day, results day, draw day) — this year's edition, in the event's local time","status":"upcoming|in_progress|decided","result":"only if decided: who won / what the outcome was, one short line","reported":"only if decided: YYYY-MM-DD the publish date of the report you took the result from"}
The same teams or parties may have met in earlier years — report ONLY this edition; if this edition's match has not been played yet, it is "upcoming" even if an earlier meeting has a result.
Use only official or major news sources. No odds, no predictions, no opinions. If you cannot confirm the date from reliable sources, answer {"status":"unknown"}.`;

async function lookup(event: string, today: string): Promise<{ raw: Record<string, unknown>; citations: string[] } | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 25_000);
  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", signal: ctl.signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      // the pages the search actually read come back with the call itself (a strict-JSON answer carries no inline citations)
      body: JSON.stringify({ model: process.env.EVENT_SEARCH_MODEL ?? "gpt-4.1-mini", tools: [{ type: "web_search" }], include: ["web_search_call.action.sources"], input: LOOKUP(event, today) }),
    });
    if (!res.ok) { recordOps("public_event_search_fail", `http ${res.status}`); return null; }
    const j = (await res.json()) as { output?: { type?: string; action?: { sources?: { url?: string }[] }; content?: { type?: string; text?: string; annotations?: { type?: string; url?: string }[] }[] }[] };
    let text = "";
    const citations: string[] = [];
    for (const o of j.output ?? []) for (const s of o.action?.sources ?? []) if (typeof s.url === "string") citations.push(s.url);
    for (const o of j.output ?? []) for (const c of o.content ?? []) {
      if (c.type === "output_text" && typeof c.text === "string") text += c.text;
      for (const a of c.annotations ?? []) if (a.type === "url_citation" && typeof a.url === "string") citations.push(a.url);
    }
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    return { raw: JSON.parse(m[0]) as Record<string, unknown>, citations };
  } catch { recordOps("public_event_search_fail", "error"); return null; } finally { clearTimeout(timer); }
}

let ready = false;
function ensure() {
  if (ready) return;
  db().exec("CREATE TABLE IF NOT EXISTS public_event_facts (k TEXT PRIMARY KEY, json TEXT, at INTEGER NOT NULL)");
  ready = true;
}

/** The whole path for one question: null whenever it is not a public event or nothing checkable came back. */
export async function publicEventFacts(question: string, today: string): Promise<EventFacts | null> {
  if (process.env.PUBLIC_EVENT_FACTS === "off") return null;
  // tests mock the model; a sorting call would eat their scripted answers
  if (process.env.VITEST === "true" && process.env.PUBLIC_EVENT_IN_TESTS !== "1") return null;
  const c = await classifyEvent(question, today);
  if (!c) return null;
  ensure();
  const k = `${c.event.toLowerCase()}|${today}`;
  const hit = db().prepare("SELECT json FROM public_event_facts WHERE k = ?").get(k) as { json: string | null } | undefined;
  // 11-09 T-034: a fact kept before the stricter check is checked again; one that no longer passes is looked up afresh
  const kept = hit?.json ? (JSON.parse(hit.json) as EventFacts) : null;
  if (hit && (!kept || checkFacts({ ...kept }, kept.sources.map((d) => `https://${d}`), today))) return kept;
  const got = await lookup(c.event, today);
  const facts = got ? checkFacts(got.raw, got.citations, today) : null;
  db().prepare("INSERT OR REPLACE INTO public_event_facts (k, json, at) VALUES (?,?,?)").run(k, facts ? JSON.stringify(facts) : null, Date.now());
  recordOps(facts ? `public_event_${facts.status}` : "public_event_unchecked", `${c.kind} ${c.event.slice(0, 60)}`);
  return facts;
}

/** the rule both tiers carry (only used when the payload has `public_event`) */
export const PUBLIC_EVENT_RULE = `- PUBLIC EVENT (11-05): when the payload has \`public_event\`, the question is about a public event and these facts were checked against at least two sources. They are binding facts about the world, not about the chart.
  · status "upcoming" or "in_progress": the outcome is decided on \`public_event.date\`. Any time you name must be that day (say it is when it will be known, e.g. "11月14日決賽那天見分曉"); never name another window as when it is decided. The lean still comes from the chart alone — never from rankings, odds or news.
  · status "decided": the outcome is already known (\`public_event.result\`). Say so plainly in the first field, in one sentence, without dressing it as a prediction; then read the chart for what the reader can take from it now, and suggest asking about something still open. Never contradict the result.
  · Never quote sources, scores, odds or commentary; never say you searched.`;
