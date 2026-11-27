import { db } from "./db";

/**
 * 10-23 进度表 108 ① 自动信件的开关 (/admin/letters): each letter that goes out by itself can be turned off from the
 * admin — no deploy. Off means its run sends nothing (and claims nothing), so turning it back on picks up where the
 * run's own rules allow: a day's letter that was skipped is simply not sent; a revisit still waiting goes out then.
 * Kept in site_settings (`letter_off:<id>` = '1'); read through a 15-second cache so the 10-minute sweeps do not query
 * for every letter, and a switch flipped in one process (the admin page) reaches the cron's process within seconds.
 * Letters that confirm something the reader did, or that the law wants sent (开通信、关续订确认、年付续费预告), have
 * no switch — see lib/auto-mail.ts.
 */
export const LETTER_SWITCH_IDS = [
  "member_letter", "month_letter", "decade", "key_month", "today_qian", "qian_card_notice", "daily_mail",
  "revisit", "headsup", "dayof", "pass_notice", "sub_recap", "sub_winback", "saved_followup", "recover", "zeri", "tarot_revisit",
  // 10-23 进度表 111 / 110: the membership notices (lib/sub-letters.ts)
  "sub_payfail", "sub_unpaid_end", "sub_resume", "sub_pause", "support_ack",
  // 10-24: 续费成功
  "sub_renewed",
] as const;
export type LetterSwitchId = (typeof LETTER_SWITCH_IDS)[number];
export const isLetterSwitch = (x: unknown): x is LetterSwitchId => typeof x === "string" && (LETTER_SWITCH_IDS as readonly string[]).includes(x);

const TTL = 15_000;
let cache: { at: number; off: Map<string, number> } | null = null;

function ensure(): void {
  db().exec("CREATE TABLE IF NOT EXISTS site_settings (k TEXT PRIMARY KEY, v TEXT NOT NULL, updated_at INTEGER NOT NULL)");
}

function offMap(now = Date.now()): Map<string, number> {
  if (cache && now - cache.at < TTL) return cache.off;
  ensure();
  const rows = db().prepare("SELECT k, updated_at AS at FROM site_settings WHERE substr(k, 1, 11) = 'letter_off:' AND v = '1'").all() as { k: string; at: number }[];
  cache = { at: now, off: new Map(rows.map((r) => [r.k.slice(11), r.at])) };
  return cache.off;
}

/** is this letter allowed to go out? (a read failure leaves it on — the letters were on before the switch existed) */
export function letterOn(id: LetterSwitchId): boolean {
  try { return !offMap().has(id); } catch { return true; }
}

/** when it was turned off, or null while it is on */
export function letterOffSince(id: LetterSwitchId): number | null {
  try { return offMap().get(id) ?? null; } catch { return null; }
}

export function setLetterOn(id: LetterSwitchId, on: boolean, now = Date.now()): void {
  ensure();
  db().prepare("INSERT INTO site_settings (k, v, updated_at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at")
    .run(`letter_off:${id}`, on ? "0" : "1", now);
  cache = null;
}

/** for tests */
export const resetLetterSwitches = () => { cache = null; };
