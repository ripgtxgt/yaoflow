/**
 * 09-29 「一件事」 backfill: file every existing customer cast under a matter.
 * Chronological per customer, the same model decision the live path makes, as
 * if made at the time of each cast (only matters open then are candidates).
 * Idempotent: only casts with no matter_id are touched. Run on the server:
 *   cd apps/web && npx tsx --tsconfig tsconfig.json ../../scripts/backfill-matters.ts [--dry] [--limit=N]
 */
import { createMatter, matterById, recordOps, sessionsForCast, setCastMatter, setMatterTitle, setSessionMatter, unfiledCasts } from "../apps/web/src/lib/db";
import { decideMatter } from "../apps/web/src/lib/matter-assign";
import { asLocale } from "../apps/web/src/lib/locales";
import { classifyTopic } from "../apps/web/src/lib/topic";
import { toHans } from "../apps/web/src/lib/hant";

const dry = process.argv.includes("--dry");
const limArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limArg ? Number(limArg.split("=")[1]) : 5000;
const custArg = process.argv.find((a) => a.startsWith("--customers="));
const only = custArg ? new Set(custArg.split("=")[1]!.split(",").map(Number)) : null;
const PAR = 4;

async function main() {
  const rows = unfiledCasts(limit).filter((r) => !only || only.has(r.customer_id));
  const byCustomer = new Map<number, typeof rows>();
  for (const r of rows) (byCustomer.get(r.customer_id) ?? byCustomer.set(r.customer_id, []).get(r.customer_id)!).push(r);
  const queue = [...byCustomer.entries()];
  let done = 0, joined = 0, opened = 0, rule = 0;
  const t0 = Date.now();
  async function worker() {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      const [cid, casts] = next;
      for (const c of casts) {
        const l = asLocale(c.locale);
        const topic = c.topic ?? classifyTopic(toHans(c.question));
        const dec = await decideMatter(cid, c.question, topic, l, c.created_at);
        if (dec.how === "rule") rule++;
        if (dry) { done++; if (dec.matterId) joined++; else opened++; continue; }
        let id = dec.matterId;
        if (id) {
          const m = matterById(id);
          if (m && m.title_by !== "reader" && dec.how === "model" && dec.title && dec.title !== m.title) setMatterTitle(id, dec.title, "model");
          joined++;
        } else {
          id = createMatter(cid, dec.title, dec.how, topic, c.created_at);
          opened++;
        }
        setCastMatter(c.id, id, `backfill-${dec.how}`);
        for (const sid of sessionsForCast(c.id)) setSessionMatter(sid, id, "backfill");
        done++;
      }
      if (done % 50 < casts.length) console.log(`${done}/${rows.length} casts · ${Math.round((Date.now() - t0) / 1000)}s`);
    }
  }
  await Promise.all(Array.from({ length: PAR }, worker));
  const msg = `casts=${done} joined=${joined} new=${opened} rule_fallback=${rule} ${Math.round((Date.now() - t0) / 1000)}s${dry ? " (dry)" : ""}`;
  console.log(msg);
  if (!dry) recordOps("matter_backfill", msg);
}

main().catch((e) => { console.error(e); process.exit(1); });
