import {
  castOwnerMatter, createMatter, matterById, recordOps, refreshMatter, sessionsForCast, setCastMatter, setSessionMatter,
} from "./db";

/**
 * 09-29: move one cast to another of the same reader's matters, or out into a
 * new one (target null). Used by the model's second look at a rule filing, and
 * by the reader on the matter page ("this one is about something else").
 * The matter it left is refreshed, and removed if it is now empty.
 */
export function moveCast(castId: number, target: number | null, customerId: number, title: string | null, how: string): number | null {
  const cur = castOwnerMatter(castId);
  if (!cur || cur.customer_id !== customerId) return null;
  let to = target;
  if (to !== null) {
    const m = matterById(to);
    if (!m || m.customer_id !== customerId) return null;
  } else {
    to = createMatter(customerId, title, how === "reader" ? "rule" : how, null, cur.created_at);
  }
  if (cur.matter_id === to) return to;
  setCastMatter(castId, to, how);
  for (const sid of sessionsForCast(castId)) setSessionMatter(sid, to, how);
  if (cur.matter_id) refreshMatter(cur.matter_id);
  recordOps("matter_move", `${customerId} cast ${castId} ${cur.matter_id ?? "-"}→${to} ${how}`);
  return to;
}
