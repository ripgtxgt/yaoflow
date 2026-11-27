import { chatJson, chatText, type LlmMessage } from "./llm";
import { recordOps } from "./db";

/**
 * 10-18 客服实时自动处理 (Neil: 「我的意思是实时自动处理，而不是每隔2小时再来看」「可以加AI API key去处理的」).
 *
 * The model that reads a reader's letter and drafts the answer. Anthropic's Messages API when ANTHROPIC_API_KEY is
 * set (ANTHROPIC_MODEL picks the model); otherwise the readings' own DeepSeek chain (lib/llm.ts) answers, so the
 * desk keeps working with whatever key is in .env.local. The key is read here and nowhere else — never logged.
 *
 * Two calls only: `supportJson` (classification, strict JSON) and `supportText` (a draft letter). Both have a hard
 * deadline: a letter that cannot be read in time goes to Neil as class F, it is never answered blind.
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
// 10-28 (Neil: 「不是设置成了 claude opus 5.5 吗」— the key was set on 10-18, the model never was): Opus is the default now
const DEFAULT_MODEL = "claude-opus-5-5";
const TIMEOUT_MS = 40_000;

export function supportLlmName(): string {
  return process.env.ANTHROPIC_API_KEY ? `anthropic:${process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL}` : "deepseek-chain";
}

async function anthropic(system: string, user: string, maxTokens: number, temperature: number): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY!;
  const r = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
      // 10-28: the Claude 5 models think before they answer and the thinking counts against max_tokens (a 700-token
      // budget came back as thinking only, "empty answer"); they also reject `temperature`. So: adaptive thinking at
      // medium effort, room for it on top of the answer, no temperature. The older models keep the plain call.
      ...(/opus-5|sonnet-5|haiku-5|fable/.test(process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL)
        ? { max_tokens: maxTokens + 4000, thinking: { type: "adaptive" }, output_config: { effort: "medium" } }
        : { max_tokens: maxTokens, temperature }),
      system,
      messages: [{ role: "user", content: user }],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`anthropic ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { content?: { type: string; text?: string }[]; stop_reason?: string };
  const text = (j.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
  if (!text.trim()) throw new Error("anthropic: empty answer");
  return text;
}

/** Strict JSON answer (the classification). Throws when the model is unreachable or answers nonsense. */
export async function supportJson(system: string, user: string, maxTokens = 600): Promise<string> {
  if (process.env.ANTHROPIC_API_KEY) {
    // 11-04 T-013 (Neil 10-30 定；巡检：Anthropic 余额用完，3 封来信没被自动处理): Claude fails → the DeepSeek chain, as opsText
    try {
      const raw = await anthropic(`${system}\n\n只输出一个 JSON 对象，不要任何解释、不要 Markdown 代码块。`, user, maxTokens, 0);
      return stripFence(raw);
    } catch (e) { recordOps("support_llm_fallback", `json ${supportLlmName()} ${e instanceof Error ? e.message.slice(0, 120) : "?"}`); }
  }
  const messages: LlmMessage[] = [{ role: "system", content: system }, { role: "user", content: user }];
  return chatJson(messages, { maxTokens, temperature: 0, timeoutMs: TIMEOUT_MS, light: true });
}

/** Plain text (a draft letter). */
export async function supportText(system: string, user: string, maxTokens = 900): Promise<string> {
  if (process.env.ANTHROPIC_API_KEY) {
    try { return await anthropic(system, user, maxTokens, 0.3); }
    catch (e) { recordOps("support_llm_fallback", `text ${supportLlmName()} ${e instanceof Error ? e.message.slice(0, 120) : "?"}`); }
  }
  const messages: LlmMessage[] = [{ role: "system", content: system }, { role: "user", content: user }];
  return chatText(messages, { maxTokens, temperature: 0.3, timeoutMs: TIMEOUT_MS, light: true });
}

/**
 * 10-28 进度表 119 補: the OPERATIONS calls — the morning 運營摘要 (lib/daily-insight.ts) and the 運營動作 proposals
 * (lib/ops-actions.ts) — read numbers and judge; they go to Claude when the key is set, and fall back to the readings'
 * DeepSeek chain when Claude fails, so the morning mail always goes out. Once or twice a day each; never a reader's text.
 */
export const opsLlmName = supportLlmName;
export async function opsText(system: string, user: string, opts: { maxTokens: number; temperature: number; timeoutMs: number }): Promise<{ text: string; how: string }> {
  const messages: LlmMessage[] = [{ role: "system", content: system }, { role: "user", content: user }];
  if (process.env.ANTHROPIC_API_KEY) {
    try { return { text: await anthropic(system, user, opts.maxTokens, opts.temperature), how: "claude" }; }
    catch (e) { recordOps("ops_llm_fallback", `${supportLlmName()} ${e instanceof Error ? e.message.slice(0, 120) : "?"}`); }
  }
  return { text: await chatText(messages, opts), how: "deepseek" };
}
export async function opsJson(system: string, user: string, opts: { maxTokens: number; temperature: number; timeoutMs: number }): Promise<{ text: string; how: string }> {
  const messages: LlmMessage[] = [{ role: "system", content: system }, { role: "user", content: user }];
  if (process.env.ANTHROPIC_API_KEY) {
    try { return { text: stripFence(await anthropic(`${system}\n\n只输出一个 JSON 对象，不要任何解释、不要 Markdown 代码块。`, user, opts.maxTokens, opts.temperature)), how: "claude" }; }
    catch (e) { recordOps("ops_llm_fallback", `${supportLlmName()} ${e instanceof Error ? e.message.slice(0, 120) : "?"}`); }
  }
  return { text: await chatJson(messages, opts), how: "deepseek" };
}

/** ```json … ``` → … (some models wrap even when told not to) */
export function stripFence(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (m ? m[1]! : s).trim();
  const a = body.indexOf("{"), b = body.lastIndexOf("}");
  return a >= 0 && b > a ? body.slice(a, b + 1) : body;
}

/** One ops row per failure, with the provider named and the key never in it. */
export function noteLlmFailure(where: string, e: unknown): void {
  recordOps("support_auto_llm_fail", `${where} ${supportLlmName()} ${e instanceof Error ? e.message.slice(0, 160) : "?"}`);
}
