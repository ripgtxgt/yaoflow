import { castCountInMatter, db, matterById, orderBySession, recordOps, scheduleRevisit, sessionsForCast } from "./db";
import { moveCast } from "./matter-move";
import { fallbackTitle, retitle } from "./matter-assign";
import { logThreadHadEarlier, rejoinLogRowForCast, separateLogRowForCast } from "./cast-log";
import { asLocale, type Locale } from "./locales";
import { classifyTopic } from "./topic";
import { toHans } from "./hant";
import { verifyPaidSession, cacheReading } from "./paid-store";
import { generateReading, type AnyReading } from "./generate";
import { revisitWindow } from "./revisit";
import type { ReadingInput, Tier } from "./reading";

/**
 * 10-22 分開 (Neil, after a reader's Threads message: her casts about different people were filed as one matter and each
 * reading answered the previous person). On the reading page the reader can say 「不是同一件事」: the cast leaves the
 * matter it was filed under for one of its own, the browser's record follows, and — when the reading may have been
 * written with the wrong matter in view — one re-read without any earlier casts is free. The reading link is the key:
 * whoever holds it may do this for that one cast, signed in or not.
 */

export interface SessionCast {
  castId: number; customerId: number | null; matterId: number | null; castAt: number; values: string; question: string; locale: string; tier: string;
}

/** The cast behind a reading session. */
export function castOfSession(sid: string): SessionCast | null {
  const r = db().prepare(
    `SELECT c.id AS castId, c.customer_id AS customerId, c.matter_id AS matterId, c.cast_at AS castAt, c.values_str AS "values", c.question, c.locale, o.tier
     FROM orders o JOIN casts c ON c.id = o.cast_id WHERE o.session_id = ? LIMIT 1`,
  ).get(sid) as SessionCast | undefined;
  return r ?? null;
}

/** Whether the reading of this cast may have been written with earlier casts in view: others before it in its matter, or in its browser thread. */
export function readingHadContext(sid: string, c: SessionCast): boolean {
  if (c.matterId) {
    const m = matterById(c.matterId);
    if (m && !m.no_context) {
      const n = (db().prepare("SELECT COUNT(*) AS n FROM casts WHERE matter_id = ? AND id <> ? AND created_at <= ?").get(c.matterId, c.castId, c.castAt + 60_000) as { n: number }).n;
      if (n > 0) return true;
    }
  }
  return logThreadHadEarlier(sid, c);
}

export interface SplitResult { matterId: number | null; rereadOk: boolean }

/** 「不是同一件事？分開」 on the reading page. */
export function splitCastOff(sid: string): SplitResult | null {
  const c = castOfSession(sid);
  if (!c) return null;
  const hadContext = readingHadContext(sid, c);
  let matterId = c.matterId;
  // already alone in its matter (split before, or never joined): nothing to move
  if (c.customerId && c.matterId && castCountInMatter(c.matterId) > 1) {
    const l: Locale = asLocale(c.locale);
    const topic = classifyTopic(toHans(c.question));
    const to = moveCast(c.castId, null, c.customerId, fallbackTitle(c.question, l), "reader");
    if (to !== null) {
      matterId = to;
      // the new matter must not look at anything: its only cast is this one, and the reader has said so
      db().prepare("UPDATE matters SET topic = COALESCE(topic, ?) WHERE id = ?").run(topic, to);
      // 10-23 进度表 98: remember where it came from — 「分錯了？合併回去」 is open for a day (unsplitCast)
      db().prepare("UPDATE casts SET split_from_matter = ?, split_at = ? WHERE id = ?").run(c.matterId, Date.now(), c.castId);
      void retitle(to, c.customerId, c.question, topic, l);
    }
  }
  separateLogRowForCast(sid, c);
  const o = orderBySession(sid) as (ReturnType<typeof orderBySession> & { reread_ok?: number | null; reread_at?: number | null }) | null;
  let rereadOk = false;
  if (o && hadContext && !o.reread_at) {
    db().prepare("UPDATE orders SET reread_ok = 1 WHERE session_id = ?").run(sid);
    rereadOk = true;
  } else if (o?.reread_ok && !o.reread_at) rereadOk = true;
  recordOps("matter_split", `${c.customerId ?? "-"} cast ${c.castId} ${c.matterId ?? "-"}→${matterId ?? "-"}${hadContext ? " reread" : ""}`);
  return { matterId, rereadOk };
}

/**
 * 10-23 进度表 98 (客服 #510, 10-22 21:23 「如果不小心把同一件事情裡面的兩個問題分開了還能再加回去嗎」): the way back from a
 * 「分開」 tapped by mistake. For a day after the split the reading page offers 「分錯了？合併回去」 — the same key as the
 * split (the reading link, signed in or not). The cast goes back to the matter it left, the browser's record follows,
 * and an untaken free re-read is withdrawn (it was offered because the reading had looked at that very matter). Nothing
 * is rewritten and a re-read already taken stays. After the day, or when that matter is gone (its last cast moved on),
 * the offer is over and the 「我的」 page's 「不是這件事？→ 移過去」 is the way.
 */
export const UNSPLIT_WINDOW_MS = 24 * 3_600_000;

/** the open way back of this reading's cast: the matter it left, when the split is younger than a day and that matter still exists */
export function unsplitOffer(sid: string, now = Date.now()): { matterId: number } | null {
  const c = castOfSession(sid);
  if (!c?.customerId) return null;
  const r = db().prepare("SELECT split_from_matter AS m, split_at AS at FROM casts WHERE id = ?").get(c.castId) as { m: number | null; at: number | null } | undefined;
  if (!r?.m || !r.at || now - r.at > UNSPLIT_WINDOW_MS) return null;
  const m = matterById(r.m);
  if (!m || m.customer_id !== c.customerId || m.id === c.matterId) return null;
  return { matterId: m.id };
}

export type UnsplitResult = { ok: true; matterId: number } | { ok: false; why: "none" | "gone" };

/** 「分錯了？合併回去」: the cast returns to the matter it was split off from. */
export function unsplitCast(sid: string, now = Date.now()): UnsplitResult | null {
  const c = castOfSession(sid);
  if (!c) return null;
  if (!c.customerId) return { ok: false, why: "none" };
  const r = db().prepare("SELECT split_from_matter AS m, split_at AS at FROM casts WHERE id = ?").get(c.castId) as { m: number | null; at: number | null } | undefined;
  if (!r?.m || !r.at || now - r.at > UNSPLIT_WINDOW_MS) return { ok: false, why: "none" };
  const target = matterById(r.m);
  const clear = () => db().prepare("UPDATE casts SET split_from_matter = NULL, split_at = NULL WHERE id = ?").run(c.castId);
  if (!target || target.customer_id !== c.customerId) { clear(); return { ok: false, why: "gone" }; }
  if (target.id !== c.matterId) {
    const to = moveCast(c.castId, target.id, c.customerId, null, "reader_unsplit");
    if (to === null) { clear(); return { ok: false, why: "gone" }; }
  }
  clear();
  // the browser's record follows the cast back: any sibling in that matter shows which thread it belongs with
  const siblings = (db().prepare("SELECT id FROM casts WHERE matter_id = ? AND id <> ?").all(target.id, c.castId) as { id: number }[]).flatMap((x) => sessionsForCast(x.id));
  rejoinLogRowForCast(sid, c, siblings);
  // a free re-read offered by the split and not yet taken is withdrawn — the reading had looked at the matter it is back in
  db().prepare("UPDATE orders SET reread_ok = NULL WHERE session_id = ? AND reread_ok = 1 AND reread_at IS NULL").run(sid);
  recordOps("matter_unsplit", `${c.customerId} cast ${c.castId} →${target.id}`);
  return { ok: true, matterId: target.id };
}

/** A re-read claimed this long ago and not finished is taken to have died with its process: the offer is open again. */
export const REREAD_STALE_MS = 5 * 60_000;

/** The free re-read of this session: `offer` (owed, not taken), `pending` (being written), `done`, or none. */
export function rereadState(sid: string, now = Date.now()): "offer" | "pending" | "done" | null {
  const o = db().prepare("SELECT reread_ok, reread_at FROM orders WHERE session_id = ?").get(sid) as { reread_ok: number | null; reread_at: number | null } | undefined;
  if (!o || !o.reread_ok) return null;
  if (o.reread_ok === 2) return "done";
  if (o.reread_at && now - o.reread_at < REREAD_STALE_MS) return "pending";
  return "offer";
}

/**
 * Write the reading again with no earlier casts in view — same chart, same question, same instant — and put it in the
 * place of the first one. Once per session; a second tap while the first runs, or after it, changes nothing.
 */
export async function rereadAlone(sid: string, now = Date.now()): Promise<AnyReading | null> {
  const d = db();
  const claim = d.prepare("UPDATE orders SET reread_at = ? WHERE session_id = ? AND reread_ok = 1 AND (reread_at IS NULL OR reread_at < ?)").run(now, sid, now - REREAD_STALE_MS);
  if (!Number((claim as { changes?: number | bigint }).changes ?? 0)) return null;
  const c = castOfSession(sid);
  try {
    const rec = c ? await verifyPaidSession(sid) : null;
    if (!c || !rec) throw new Error("no_session");
    const tier: Tier = rec.tier;
    const locale = rec.locale;
    // nothing that was written with the other matter in view rides along: not the free line, not its odds, not the prior reading
    const rest: ReadingInput = { ...rec.input, solo: true };
    delete rest.teaser; delete rest.teaserOdds; delete rest.prior; delete rest.matterSoFar;
    const reading = await generateReading(tier, rest, true, locale);
    d.prepare("UPDATE readings SET body_json = ? WHERE id = (SELECT id FROM readings WHERE cast_id = ? ORDER BY id DESC LIMIT 1)").run(JSON.stringify(reading), c.castId);
    d.prepare("UPDATE orders SET reread_ok = 2, reread_at = ? WHERE session_id = ?").run(Date.now(), sid);
    cacheReading(sid, reading);
    // the revisit letter follows the new reading's timing
    try {
      const o = orderBySession(sid);
      if (o?.email && tier === "deep") {
        const old = d.prepare("SELECT id FROM revisits WHERE session_id = ?").get(sid) as { id: number } | undefined;
        if (old) { d.prepare("DELETE FROM revisit_checkpoints WHERE revisit_id = ?").run(old.id); d.prepare("DELETE FROM revisits WHERE id = ?").run(old.id); }
        const rw = revisitWindow(tier, reading, rest.question, rest.scaleHint, new Date(rest.castAtMs));
        scheduleRevisit({ sessionId: sid, castId: c.castId, customerId: o.customer_id, email: o.email, locale, tier, castAtMs: rest.castAtMs,
          windowDays: rw.days, timingQuote: rw.quote, question: rest.question, ...(rw.checkpoints.length ? { checkpoints: rw.checkpoints } : {}) });
      }
    } catch { /* the reading is in place; the old revisit stands */ }
    recordOps("reread", `${c.customerId ?? "-"} cast ${c.castId} ${tier}`);
    return reading;
  } catch (e) {
    // give the offer back
    d.prepare("UPDATE orders SET reread_at = NULL WHERE session_id = ?").run(sid);
    recordOps("reread_fail", (e instanceof Error ? e.message : "?").slice(0, 100));
    return null;
  }
}
