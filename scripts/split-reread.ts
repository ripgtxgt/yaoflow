/**
 * 10-22 分開：把一份付费解读所属的那一卦从它被误归的「一件事」里分出来，并（当那份解读写的时候参考过先前的卦）按单独一卦免费重出。
 * 走的就是读者在解读页点「不是同一件事，分開」→「免費重出一份」的同一条路（lib/reread.ts），所以回访信也会按新应期重排。
 * 默认只看不写；加 --apply 才写库。
 *
 *   cd ~/yaoflow/apps/web && npx -y tsx --env-file=.env.local ../../scripts/split-reread.ts <order_session_id> [--apply]
 *
 * 10-22 首用：#1891 10-20 12:23「今年年底前，我會遇到可以認真交往的人嗎？」被归到「是否視他為戀愛對象」，解读接着前一卦写。
 */
import { castOfSession, readingHadContext, rereadAlone, rereadState, splitCastOff } from "../apps/web/src/lib/reread";
import { castsInMatter, db, matterById } from "../apps/web/src/lib/db";

async function main(): Promise<void> {
  const [sid, flag] = process.argv.slice(2);
  if (!sid) throw new Error("usage: split-reread.ts <order_session_id> [--apply]");
  const apply = flag === "--apply";
  const c = castOfSession(sid);
  if (!c) throw new Error("no order / cast for that session");
  const m = c.matterId ? matterById(c.matterId) : null;
  console.log("卦：", c.castId, "·", c.question);
  console.log("现在归在：", m ? `#${m.id}「${m.title ?? ""}」（${castsInMatter(m.id).length} 卦）` : "（无）");
  console.log("解读写时参考过先前的卦：", readingHadContext(sid, c) ? "是" : "否", "· 重出状态：", rereadState(sid) ?? "无");
  if (!apply) { console.log("\n(dry run — add --apply to write)"); return; }
  const r = splitCastOff(sid);
  if (!r) throw new Error("split failed");
  const nm = r.matterId ? matterById(r.matterId) : null;
  console.log("已分开 → ", nm ? `#${nm.id}「${nm.title ?? ""}」` : "（无）", "· 可免费重出：", r.rereadOk ? "是" : "否");
  if (!r.rereadOk) return;
  const reading = await rereadAlone(sid) as unknown as Record<string, Record<string, string>> | null;
  if (!reading) throw new Error("reread failed (see ops: reread_fail)");
  const l = c.locale;
  for (const k of ["verdict", "timing", "next_step"]) console.log(`\n[${k}] ${reading[k]?.[l] ?? JSON.stringify(reading[k])}`);
  console.log("\n重出状态：", rereadState(sid));
  db();
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
