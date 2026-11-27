import { fill, tongkaT } from "./tongka";

/**
 * 10-05 (进度表 §四 28, 客服 #838): what the light-reading upgrade panel shows, decided by the viewer's OWN-reading
 * membership. A member with deep readings left redeems their allowance — no price, no pay-consent; once the month is
 * spent, an extra one costs the light add-on price (what api/checkout's memberAddon charges, 09-24 M2); a non-member,
 * or anyone on a forwarded link, pays as before. Pure on purpose — "a member is never shown a price on their own
 * reading" is then a test, not a render.
 *
 * The allowance note uses the cast page's wording (what membership includes — 「已用 N 次」, not a counting-down
 * 「還剩 N」, by the 09-22 decision that a ticking counter made members ration the very thing they pay for).
 *
 * 10-23 进度表 96 ④ (客服 #510): under the 通卡 model nobody has a monthly allowance, so the note never says 「本月 10 次」
 * again — a pass holder reads 「通卡期內不限次 · 到 {date}」, a member 「會員不限次」 (lib/tongka.ts, nine languages).
 * The old wording stays only for the older model (TONGKA_MODEL off), where the numbers are real.
 */
export type MemberState = {
  deepLeft: number; deepTotal: number; packLeft: number;
  /** 10-23: the 通卡 model is live — no allowance to count; `pass` + `periodEnd` say which line to print */
  unlimited?: boolean; pass?: boolean; passDays?: 1 | 7 | 30; periodEnd?: number | null;
} | null;

export interface UpgradePanelView {
  allowance: boolean;    // redeem — no price, no consent, show what's included
  addOnMember: boolean;  // member out of deep this month — pay the light price (+ consent)
  usingPack: boolean;    // the included note comes from the bought pack, not the month's own
  usedThisPeriod: number;
  /** 10-23: the 通卡-model note — a pass with its end, or a member; null under the older allowance model */
  included: "pass" | "member" | null;
}

export function upgradePanelView(member: MemberState): UpgradePanelView {
  if (member?.unlimited) return { allowance: true, addOnMember: false, usingPack: false, usedThisPeriod: 0, included: member.pass ? "pass" : "member" };
  const allowance = !!member && member.deepLeft > 0;
  const addOnMember = !!member && member.deepLeft <= 0;
  const usingPack = allowance && member!.packLeft > 0 && member!.deepLeft - member!.packLeft <= 0;
  const usedThisPeriod = allowance && !usingPack
    ? Math.max(0, member!.deepTotal - (member!.deepLeft - member!.packLeft))
    : 0;
  return { allowance, addOnMember, usingPack, usedThisPeriod, included: null };
}

/** 10-23: the end of a pass as a panel prints it — month and day in the reader's language; a 1-day pass ends at an hour, so the time too */
export function passEndLabel(ms: number, locale: string, withTime: boolean): string {
  const tag = locale === "zh" ? "zh-CN" : locale === "zh-hant" ? "zh-TW" : locale;
  try {
    return new Date(ms).toLocaleString(tag, { month: "short", day: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}) });
  } catch { return new Date(ms).toISOString().slice(5, withTime ? 16 : 10); }
}

/** the note itself, from the rights table's words (lib/tongka.ts) — null when the older model's numbers apply */
export function includedNote(member: MemberState, locale: string): string | null {
  const v = upgradePanelView(member);
  if (!v.included) return null;
  const tk = tongkaT(locale);
  return v.included === "pass" ? fill(tk.includedPass, { date: member?.periodEnd ? passEndLabel(member.periodEnd, locale, member.passDays === 1) : "—" }) : tk.includedMember;
}
