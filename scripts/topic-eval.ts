/**
 * 起卦主题识别率 (09-23). Run ON THE SERVER — the questions never leave it:
 *   cd apps/web && npx tsx ../../scripts/topic-eval.ts [--show-other] [--show-changed]
 * Reads every real cast (our own test accounts left out), de-duplicates the
 * wording, and reports how many land on a topic with the current rules.
 */
import { DatabaseSync } from "node:sqlite";
import { classifyTopic } from "../apps/web/src/lib/topic";
import { toHans } from "../apps/web/src/lib/hant";

const d = new DatabaseSync(process.env.DB ?? "/home/ubuntu/yaoflow-data/yaoflow.db", { readOnly: true });
const rows = d.prepare("SELECT c.question, c.topic, c.locale FROM casts c LEFT JOIN customers cu ON cu.id = c.customer_id WHERE COALESCE(cu.test_flag,0) = 0").all() as { question: string; topic: string | null; locale: string }[];
const seen = new Set<string>();
const uniq = rows.filter((r) => { const k = r.question.trim(); if (!k || seen.has(k)) return false; seen.add(k); return true; });
const count: Record<string, number> = {};
const others: string[] = [];
const changed: string[] = [];
for (const r of uniq) {
  const t = classifyTopic(toHans(r.question));
  count[t] = (count[t] ?? 0) + 1;
  if (t === "other") others.push(r.question.replace(/\s+/g, " ").slice(0, 100));
  if (process.argv.includes("--show-rescued") && (r.topic ?? "other") === "other" && t !== "other" && t !== "relationship") console.log(`rescued → ${t}\t${r.question.replace(/\s+/g, " ").slice(0, 100)}`);
  if (process.argv.includes("--dump")) console.log(`${t}\t${r.question.replace(/\s+/g, " ").slice(0, 70)}`);
  if (r.topic && r.topic !== "other" && r.topic !== t) changed.push(`${r.topic} → ${t}\t${r.question.replace(/\s+/g, " ").slice(0, 100)}`);
}
const n = uniq.length;
console.log(`unique questions ${n} · recognised ${n - (count.other ?? 0)} (${(((n - (count.other ?? 0)) / n) * 100).toFixed(1)}%) · ${JSON.stringify(count)}`);
console.log(`was a topic, now a different one: ${changed.length}`);
if (process.argv.includes("--show-other")) console.log(others.join("\n"));
if (process.argv.includes("--show-changed")) console.log(changed.join("\n"));
