import type { TrackedEvent } from "./analytics-server";
import { QIAN_SETS } from "./qian-meta";

/**
 * 10-13 进度表 40 ⑥ (Neil: 「直接开始做吧」): per set, the sessions that came in from a search engine on a lot page (or
 * that set's index), and how far they went — read the plain reading → cast → paid. The entry page /jieqian is its own row.
 *
 * - landed:  the session's first page is /zh-hant/qian/<set>[/n] (or /zh-hant/jieqian) and the referrer is a search engine
 * - read:    it stayed on a lot page (scrolled ≥ 60 % or ≥ 15 s), or opened a 解籤 result page
 * - cast:    a cast was completed in the same session
 * - paid:    the session ended in a real paid order (ours excluded)
 */
export const SEARCH_REF = /(^|\.)(google|bing|yahoo|duckduckgo|baidu|naver|yandex|ecosia)\./;
const LOT = /^\/zh-hant\/qian\/([a-z0-9-]+)(?:\/(\d+))?\/?$/;
const ENTRY = /^\/zh-hant\/jieqian\/?$/;

export interface QianFunnelRow { key: string; landed: number; read: number; cast: number; paid: number }

export function qianSearchFunnel(events: readonly TrackedEvent[], paidSessions: ReadonlySet<string>): { rows: QianFunnelRow[]; total: QianFunnelRow } {
  const bySession = new Map<string, TrackedEvent[]>();
  for (const e of events) { if (!e.s) continue; const l = bySession.get(e.s); if (l) l.push(e); else bySession.set(e.s, [e]); }
  const rows = new Map<string, QianFunnelRow>();
  const row = (k: string) => { let r = rows.get(k); if (!r) { r = { key: k, landed: 0, read: 0, cast: 0, paid: 0 }; rows.set(k, r); } return r; };
  for (const [sid, list] of bySession) {
    list.sort((a, b) => a.t - b.t);
    const first = list.find((e) => e.e === "page_view");
    if (!first?.path || !SEARCH_REF.test(first.ref ?? "")) continue;
    const path = first.path.split("?")[0]!;
    const lot = path.match(LOT);
    const key = lot && QIAN_SETS.some((s) => s.id === lot[1]) ? lot[1]! : ENTRY.test(path) ? "entry" : null;
    if (!key) continue;
    const r = row(key);
    r.landed++;
    const read = list.some((e) =>
      (e.e === "page_leave" && LOT.test((e.path ?? "").split("?")[0]!) && /\/\d+\/?$/.test((e.path ?? "").split("?")[0]!) && ((e.depth ?? 0) >= 60 || (e.ms ?? 0) >= 15_000))
      || (e.e === "page_view" && (e.path ?? "").startsWith("/zh-hant/jieqian/r/")));
    if (read) r.read++;
    if (list.some((e) => e.e === "cast_complete")) r.cast++;
    if (paidSessions.has(sid)) r.paid++;
  }
  const order = [...QIAN_SETS.map((s) => s.id as string), "entry"];
  const out = [...rows.values()].sort((a, b) => b.landed - a.landed || order.indexOf(a.key) - order.indexOf(b.key));
  const total = out.reduce((t, r) => ({ key: "total", landed: t.landed + r.landed, read: t.read + r.read, cast: t.cast + r.cast, paid: t.paid + r.paid }), { key: "total", landed: 0, read: 0, cast: 0, paid: 0 });
  return { rows: out, total };
}
