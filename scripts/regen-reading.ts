/**
 * 重出一份已交付的付费解读（同一盘、同一问题、同一起卦时刻），用于修完 bug 后补正读者手里那份。
 * 默认只打印新稿；加 --apply 才写库：覆盖订单所指那一卦的解读、删掉同一笔付款多存的重复卦、按新应期重排回访。
 *
 *   cd ~/yaoflow/apps/web && npx -y tsx --env-file=.env.local ../../scripts/regen-reading.ts <order_session_id> [--apply]
 *
 * 10-18 首用：#1928（10-12「七月他提分手…」被当成问七月，应期答成明年七月；一次付款存了 6 份）。
 */
import { verifyPaidSession } from "../apps/web/src/lib/paid-store";
import { generateReading } from "../apps/web/src/lib/generate";
import { askWindow } from "../apps/web/src/lib/ask-window";
import { revisitWindow } from "../apps/web/src/lib/revisit";
import { db, scheduleRevisit } from "../apps/web/src/lib/db";
import type { Locale } from "../apps/web/src/lib/locales";

async function main(): Promise<void> {
const [sid, flag] = process.argv.slice(2);
if (!sid) throw new Error("usage: regen-reading.ts <order_session_id> [--apply]");
const apply = flag === "--apply";
const order = db().prepare("SELECT session_id, customer_id, cast_id, tier, email FROM orders WHERE session_id = ?").get(sid) as
  { session_id: string; customer_id: number | null; cast_id: number | null; tier: string; email: string | null } | undefined;
if (!order?.cast_id) throw new Error("no order / cast for that session");
const rec = await verifyPaidSession(sid);
if (!rec) throw new Error("session not verifiable");
const input = rec.input;
const locale = rec.locale as Locale;
const w = askWindow(input.question, input.castAtMs, input.tzOffsetMinutes);
console.log("问题：", input.question);
console.log("问的时间（修后）：", w ? `${w.phrase} → ${w.start}~${w.end}` : "无（让卦来定）");
const reading = await generateReading(order.tier as "deep", input, true, locale) as unknown as Record<string, unknown>;
const zh = (v: unknown) => (v && typeof v === "object" ? ((v as Record<string, string>)[locale] ?? JSON.stringify(v)) : String(v));
for (const k of ["verdict", "timing", "next_step", "signals", "basis"]) console.log(`\n[${k}] ${zh(reading[k])}`);
if (!apply) { console.log("\n(dry run — add --apply to write)"); return; }

const d = db();
const castId = order.cast_id;
const cast = d.prepare("SELECT customer_id, created_at FROM casts WHERE id = ?").get(castId) as { customer_id: number; created_at: number };
d.exec("BEGIN");
try {
  d.prepare("UPDATE readings SET body_json = ? WHERE cast_id = ?").run(JSON.stringify(reading), castId);
  const dups = d.prepare("SELECT id FROM casts WHERE customer_id = ? AND created_at = ? AND id != ?").all(cast.customer_id, cast.created_at, castId) as { id: number }[];
  for (const x of dups) d.prepare("DELETE FROM casts WHERE id = ?").run(x.id);
  console.log("\n删除重复卦：", dups.map((x) => x.id).join(",") || "无");
  const old = d.prepare("SELECT id FROM revisits WHERE session_id = ?").get(sid) as { id: number } | undefined;
  if (old) { d.prepare("DELETE FROM revisit_checkpoints WHERE revisit_id = ?").run(old.id); d.prepare("DELETE FROM revisits WHERE id = ?").run(old.id); }
  d.exec("COMMIT");
} catch (e) { d.exec("ROLLBACK"); throw e; }
if (order.email && order.tier === "deep") {
  const rw = revisitWindow(order.tier, reading as never, input.question, input.scaleHint, new Date(input.castAtMs));
  scheduleRevisit({ sessionId: sid, castId, customerId: order.customer_id, email: order.email, locale, tier: order.tier, castAtMs: input.castAtMs,
    windowDays: rw.days, timingQuote: rw.quote, question: input.question, ...(rw.checkpoints ? { checkpoints: rw.checkpoints } : {}) } as never);
  console.log("回访重排：", rw.days, "天后 ·", rw.quote);
}
console.log("已写入 cast", castId);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
