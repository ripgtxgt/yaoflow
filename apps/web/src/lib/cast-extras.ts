import type { Locale } from "./locales";
import type { PriorReading, QianRef } from "./reading";
import { qianDrawByToken } from "./db";
import { isVagueTemple, QIAN_SET, QIAN_TOKEN_RE, TEMPLES } from "./qian-meta";
import { detectRegister } from "./question-lang";
import { hkReader, type ReaderRegister } from "./register";
import { preFromBody, type PreRef } from "./pre-cast";

/**
 * The two optional things a cast request may carry besides the cast itself
 * (09-18), read the same way by every route that mints a reading session:
 *
 *   register — the question was written in Cantonese (decided here, on the
 *              server, from the question; the client has no say); 10-12: or
 *              "hk", a Hong Kong reader writing standard Chinese (the edge's
 *              country / the browser's language — lib/register.ts)
 *   prior    — what this reader was told about the same matter earlier, sent
 *              by the cast page from the browser's own cast record when the
 *              一事一占 gate recognised the matter and the reader went ahead
 *
 * `prior` is the reader's own data about their own reading; it is only
 * accepted in the shape the cast page produces and only when fresh (the gate
 * window is 24 h — anything older did not come from the gate).
 */
export const PRIOR_MAX_AGE_MS = 48 * 3_600_000;

export function readCastExtras(body: unknown, question: string, readingLocale: Locale, headers?: Headers | null): { register?: ReaderRegister; prior?: PriorReading; qian?: QianRef; pre?: PreRef; solo?: true } {
  const out: { register?: ReaderRegister; prior?: PriorReading; qian?: QianRef; pre?: PreRef; solo?: true } = {};
  // 10-22 分開 (lib/solo.ts): the reader said this cast is a new matter
  if ((body as { solo?: unknown })?.solo === true) out.solo = true;
  if (readingLocale === "zh-hant" && detectRegister(question) === "yue") out.register = "yue";
  else if (readingLocale === "zh-hant" && hkReader(headers)) out.register = "hk";

  // a solo cast carries no prior reading either: the one the page would send is about the other matter
  const p = out.solo ? undefined : (body as { prior?: unknown })?.prior;
  if (p && typeof p === "object") {
    const o = p as Record<string, unknown>;
    const q = typeof o.q === "string" ? o.q.trim().slice(0, 200) : "";
    const call = typeof o.call === "string" ? o.call.trim().slice(0, 400) : "";
    const hex = typeof o.hex === "string" ? o.hex.trim().slice(0, 40) : "";
    const at = typeof o.at === "number" ? o.at : NaN;
    const fresh = Number.isFinite(at) && at <= Date.now() + 60_000 && Date.now() - at <= PRIOR_MAX_AGE_MS;
    if (q.length >= 2 && call.length >= 4 && hex && fresh) out.prior = { question: q, at, hex, call };
  }
  // 10-12 解籤 (进度表 §四 36): the lot this cast follows — only a draw we hold, read from our own row, never the client's words
  const qt = (body as { qian?: unknown })?.qian;
  if (typeof qt === "string" && QIAN_TOKEN_RE.test(qt)) {
    try {
      const d = qianDrawByToken(qt);
      if (d && Date.now() - d.created_at < 7 * 86_400_000) out.qian = { token: d.token, num: d.num, temple: !isVagueTemple(d.temple) ? TEMPLES.find((t) => t.id === d.temple)?.name ?? null : null, ...(d.set_name && d.set_name !== QIAN_SET ? { set: d.set_name } : {}) };
    } catch { /* no database: the cast goes ahead without its lot */ }
  }
  // 10-17 承接: a 擲筊 or a tarot spread just before this cast — only a row we hold
  const pre = preFromBody(body);
  if (pre) out.pre = pre;
  return out;
}
