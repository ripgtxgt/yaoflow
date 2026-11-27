import { hexagramByNumber } from "@yaoflow/engine";
import type { CaseView } from "./db";
import { casePath, outcomeKey, outcomeWord } from "./cases";
import { t } from "./i18n";
import { asLocale } from "./locales";
import { hexName } from "./names";
import { TOPIC_NAMES, type Topic } from "./topic";

/**
 * 09-26 (裂变 ②, Neil: 「好，都做好吧」): a published case, turned into a Threads
 * post Neil can copy. Only what the case page already shows in public — the
 * figure, the owner's public wording (if any), the call, how it turned out —
 * never the original question. The link carries ?c=threads so the 带新 table
 * can count what it brought. Threads allows 500 characters; we stay under.
 */
export const THREADS_MAX = 500;

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

export function threadsDraft(c: CaseView, site: string): string {
  const l = asLocale(c.locale);
  const primary = hexagramByNumber(c.primary_num);
  const changed = c.changed_num ? hexagramByNumber(c.changed_num) : null;
  const hex = `${hexName(primary, l)}${changed ? ` → ${hexName(changed, l)}` : ""}`;
  const topic = TOPIC_NAMES[(c.topic && c.topic in TOPIC_NAMES ? c.topic : "other") as Topic][l];
  const fields = JSON.parse(c.fields_json) as Record<string, string>;
  const call = fields.verdict ?? fields.summary ?? "";
  const timing = fields.timing ?? "";
  const ok = outcomeKey(c);
  // only a settled, favourable-to-show result is worth a line; "unanswered" says nothing to a stranger
  const result = ok === "caseOutcomeHit" || ok === "caseOutcomeOpen" || ok === "caseOutcomeMiss" || ok === "caseOutcomePartial" ? outcomeWord(ok, l) : null;
  const link = `${site.replace(/\/$/, "")}${casePath(l, c.public_id)}?c=threads`;
  const head = c.framing ? `「${c.framing}」` : t(l, "caseMetaTitle", { hex, topic });
  const lines = [head, ...(c.framing ? [hex] : []), "", cut(call, 160), ...(timing ? [cut(timing, 90)] : []), ...(result ? ["", result] : [])];
  let body = lines.join("\n");
  const room = THREADS_MAX - link.length - 2;
  if (body.length > room) body = cut(body, room);
  return `${body}\n\n${link}`;
}
