import { recordOps } from "./db";

/**
 * Thin LLM provider wrapper. The interface is the contract, so swapping
 * providers never touches business code.
 *
 * Since 09-15 there is a chain of providers, all serving the same DeepSeek
 * model through OpenAI-compatible endpoints: DeepSeek's own API first, then
 * the same model on other hosts (SiliconFlow, Volcengine Ark). A night-time
 * "Service is too busy" on the official API cost a reader ten readings in a
 * row; the hosts run their own capacity, so one being busy says nothing
 * about the others. A provider that times out or answers 5xx/429 is marked
 * down for ten minutes and the next one takes over; a provider that fails
 * any other way (bad key, unknown model) is simply skipped for this call.
 *
 * Thinking mode is OFF everywhere on purpose: the readings are tuned for
 * the non-thinking model (temperature is honoured only there), and thinking
 * multiplies output tokens ~20× for no gain on a prose task.
 */

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmOptions {
  maxTokens?: number;
  temperature?: number;
  /** per-provider deadline for this call; the readings keep CALL_TIMEOUT_MS */
  timeoutMs?: number;
  /**
   * A side call (09-20: the one-word matter check) with its own short
   * deadline: when it times out or fails, nothing is learned about the host's
   * health, so it must NOT mark the provider down for the readings.
   */
  light?: boolean;
}

interface Provider {
  name: string;
  url: string;
  key: string;
  model: string;
  /** provider-specific body fields (thinking switches) */
  extra: Record<string, unknown>;
}

const NO_THINKING = { thinking: { type: "disabled" } };

/** The chain, in order of preference; only providers with a key configured. LLM_FORCE_PROVIDER pins one (regression runs). */
export function providers(): Provider[] {
  const list: Provider[] = [];
  if (process.env.DEEPSEEK_API_KEY) {
    // 09-23: the model's own name. `deepseek-chat` was the legacy alias DeepSeek announced for retirement
    // (04-24 → 07-24); it still answered, as deepseek-flash, but the day it stops the whole main channel
    // would have fallen to the backups. Same model underneath — /models lists deepseek-flash = V4.1-Flash.
    list.push({ name: "deepseek", url: "https://api.deepseek.com/chat/completions", key: process.env.DEEPSEEK_API_KEY, model: process.env.DEEPSEEK_MODEL ?? "deepseek-flash", extra: NO_THINKING });
  }
  if (process.env.SILICONFLOW_API_KEY) {
    list.push({ name: "siliconflow", url: "https://api.siliconflow.cn/v1/chat/completions", key: process.env.SILICONFLOW_API_KEY, model: process.env.SILICONFLOW_MODEL ?? "deepseek-ai/DeepSeek-V4-Flash", extra: { enable_thinking: false, ...NO_THINKING } });
  }
  if (process.env.ARK_API_KEY && process.env.ARK_MODEL) {
    list.push({ name: "ark", url: process.env.ARK_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/v3/chat/completions", key: process.env.ARK_API_KEY, model: process.env.ARK_MODEL, extra: NO_THINKING });
  }
  const force = process.env.LLM_FORCE_PROVIDER;
  return force ? list.filter((p) => p.name === force) : list;
}

/** Circuit breaker: provider name → epoch ms until which it is considered down. */
const downUntil = new Map<string, number>();
const DOWN_MS = 10 * 60_000;
// a reading normally lands in 5–15 s; 45 s is already a broken host, and every second here is a reader waiting
const CALL_TIMEOUT_MS = 45_000;
const PROBE_TIMEOUT_MS = 15_000;
const PROBE_RETRY_MS = process.env.VITEST ? 0 : 3_000;

/** Which providers are currently marked down (for the health card). */
export function providersDown(): string[] {
  const now = Date.now();
  return [...downUntil.entries()].filter(([, t]) => t > now).map(([n]) => n);
}

/** True when every configured host is marked down — the only state a reader cannot be served in. */
export function allProvidersDown(): boolean {
  const chain = providers();
  return chain.length > 0 && chain.every((p) => (downUntil.get(p.name) ?? 0) > Date.now());
}

export interface ProbeResult { name: string; ok: boolean; ms: number; error?: string }

/**
 * A five-token probe of every host, run by the ten-minute sweep (09-15).
 * A host that fails is marked down before any reader meets it — the first
 * reader after an outage otherwise ate the full call timeout before the
 * switch; a host that answers has its mark cleared, so a short blip does
 * not cost the whole ten minutes.
 */
export async function probeProviders(): Promise<ProbeResult[]> {
  return Promise.all(providers().map(async (p) => {
    const started = Date.now();
    const ping = () => callOne(p, [{ role: "user", content: "回一个字" }], { maxTokens: 5, temperature: 0 }, false, PROBE_TIMEOUT_MS);
    try {
      // 11-06: the Beijing host (ark) drops ~7 % of single probes from Tokyo ("fetch failed") and answers the next one —
      // one network blip is asked again a few seconds later before the host is marked down and logged
      try { await ping(); } catch (e) {
        if (e instanceof ProviderError && !e.transient) throw e;
        await new Promise((r) => setTimeout(r, PROBE_RETRY_MS));
        await ping();
      }
      downUntil.delete(p.name);
      return { name: p.name, ok: true, ms: Date.now() - started };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      if (!(e instanceof ProviderError) || e.transient) {
        downUntil.set(p.name, Date.now() + DOWN_MS);
        recordOps("llm_down", `${p.name} probe ${msg.slice(0, 150)}`);
      }
      return { name: p.name, ok: false, ms: Date.now() - started, error: msg.slice(0, 120) };
    }
  }));
}

/** Plain-text chat (no JSON forcing) — for follow-up conversation. */
export async function chatText(messages: LlmMessage[], opts: LlmOptions = {}): Promise<string> {
  return (await call(messages, opts, false)).content;
}

export async function chatJson(messages: LlmMessage[], opts: LlmOptions = {}): Promise<string> {
  return (await call(messages, opts, true)).content;
}

/** One answer, and whether the model ran out of room before it finished (finish_reason "length"): such a JSON never parses whole. */
export interface LlmAnswer { content: string; cutOff: boolean }

/**
 * 10-04 (the weekly review's report was cut off at max_tokens and read as nothing): the JSON answer together with the
 * cut-off flag, so a caller with a long answer can repair it (repairJson) or ask again shorter.
 */
export async function chatJsonFull(messages: LlmMessage[], opts: LlmOptions = {}): Promise<LlmAnswer> {
  return call(messages, opts, true);
}

/**
 * A JSON text the model stopped writing mid-way: cut back to the last value it finished and close what was open, so
 * the complete part is read instead of nothing (an unfinished string, number or key is dropped). Leading or trailing
 * text around a complete JSON value is cut away. null when nothing complete is in it.
 */
export function repairJson(raw: string): string | null {
  const start = raw.search(/[{[]/);
  if (start < 0) return null;
  const stack: ("{" | "[")[] = [];
  let inStr = false, esc = false, isKey = false, expectKey = false;
  let cut = -1, open = "";
  const done = (i: number) => { cut = i + 1; open = stack.join(""); };
  for (let i = start; i < raw.length; i++) {
    const c = raw[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') { inStr = false; if (!isKey) done(i); }
      continue;
    }
    if (c === '"') { inStr = true; isKey = expectKey; continue; }
    if (c === "{") { stack.push("{"); expectKey = true; continue; }
    if (c === "[") { stack.push("["); expectKey = false; continue; }
    if (c === "}" || c === "]") { stack.pop(); if (!stack.length) return raw.slice(start, i + 1); done(i); continue; }
    if (c === ",") { expectKey = stack[stack.length - 1] === "{"; continue; }
    if (c === ":") { expectKey = false; continue; }
    if (/[-0-9tfn]/.test(c)) {
      let j = i;
      while (j + 1 < raw.length && !/[,}\]\s]/.test(raw[j + 1]!)) j++;
      if (/^(-?\d+(\.\d+)?([eE][+-]?\d+)?|true|false|null)$/.test(raw.slice(i, j + 1))) done(j);
      i = j;
    }
  }
  if (cut < 0) return null;
  return raw.slice(start, cut) + [...open].reverse().map((b) => (b === "{" ? "}" : "]")).join("");
}

/** JSON.parse — and when the text does not parse whole, the complete part of it (`repaired`); throws like JSON.parse when nothing can be read. */
export function parseJsonLoose<T = unknown>(raw: string): { value: T; repaired: boolean } {
  try { return { value: JSON.parse(raw) as T, repaired: false }; }
  catch (e) {
    // 10-30 (进度表 128 ④: answers in Latin languages come with paragraph breaks): a line break typed raw inside a
    // string is the one thing JSON.parse refuses that a reader would never notice — escaped, the answer reads whole
    const escaped = escapeRawControls(raw);
    if (escaped !== raw) { try { return { value: JSON.parse(escaped) as T, repaired: true }; } catch { /* below */ } }
    const fixed = repairJson(escaped);
    if (fixed !== null) { try { return { value: JSON.parse(fixed) as T, repaired: true }; } catch { /* nothing readable */ } }
    throw e;
  }
}

/** a raw newline, carriage return or tab inside a JSON string written as its escape (outside strings: left alone) */
export function escapeRawControls(raw: string): string {
  let out = "", inStr = false, esc = false;
  for (const c of raw) {
    if (inStr) {
      if (esc) { esc = false; out += c; continue; }
      if (c === "\\") { esc = true; out += c; continue; }
      if (c === '"') { inStr = false; out += c; continue; }
      out += c === "\n" ? "\\n" : c === "\r" ? "\\r" : c === "\t" ? "\\t" : c;
      continue;
    }
    if (c === '"') inStr = true;
    out += c;
  }
  return out;
}

class ProviderError extends Error {
  constructor(message: string, readonly transient: boolean) {
    super(message);
  }
}

async function callOne(p: Provider, messages: LlmMessage[], opts: LlmOptions, json: boolean, timeoutMs = CALL_TIMEOUT_MS): Promise<LlmAnswer> {
  let res: Response;
  try {
    res = await fetch(p.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.key}` },
      body: JSON.stringify({
        model: p.model,
        messages,
        ...(json ? { response_format: { type: "json_object" } } : {}),
        max_tokens: opts.maxTokens ?? 2400,
        temperature: opts.temperature ?? 0.8,
        stream: false,
        ...p.extra,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    // timeout, DNS, reset — the host is unreachable or too slow: transient
    throw new ProviderError(e instanceof Error ? e.message : "network", true);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ProviderError(`llm http ${res.status}: ${body.slice(0, 200)}`, res.status >= 500 || res.status === 429);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string }; finish_reason?: string }[] };
  const choice = data.choices?.[0];
  const content = choice?.message?.content;
  if (!content) throw new ProviderError("llm empty response", true);
  return { content, cutOff: choice?.finish_reason === "length" };
}

async function call(messages: LlmMessage[], opts: LlmOptions, json: boolean): Promise<LlmAnswer> {
  const chain = providers();
  if (chain.length === 0) throw new Error("no LLM provider configured (DEEPSEEK_API_KEY)");
  const now = Date.now();
  // providers not marked down first; if every one is down, try them all anyway
  const up = chain.filter((p) => (downUntil.get(p.name) ?? 0) <= now);
  const order = up.length ? up : chain;
  let lastErr: Error | null = null;
  for (const p of order) {
    try {
      const out = await callOne(p, messages, opts, json, opts.timeoutMs ?? CALL_TIMEOUT_MS);
      downUntil.delete(p.name); // answered — whatever mark it carried is stale
      if (p.name !== chain[0]!.name && !opts.light) recordOps("llm_fallback", `${p.name} served (${chain[0]!.name} down)`);
      return out;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error("unknown");
      const transient = e instanceof ProviderError ? e.transient : true;
      if (transient && !opts.light) {
        downUntil.set(p.name, Date.now() + DOWN_MS);
        recordOps("llm_down", `${p.name} ${lastErr.message.slice(0, 160)}`);
      }
    }
  }
  throw lastErr ?? new Error("llm failed");
}
