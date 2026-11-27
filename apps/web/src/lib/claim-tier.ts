import type { Tier } from "./reading";

/**
 * 09-29 裂变 P2: a newcomer who arrives through a friend's share gets their first FULL (deep) reading free — the one
 * with a date, the one that brings them back. (Was light before 09-29.)
 */
export const INVITE_TIER: Tier = "deep";

/**
 * Which tier the signed-out "寄給我，開始解讀" email panel requests, decided by what opened it.
 *
 * 10-03 bug (客服 Chun Yu s10912045@gmail.com, 台灣): this panel is shared by three kinds of signed-out reader —
 * a free light reading (the f1 experiment, "free"), a friend's invite (free deep, "invite"), and 同题合参 ("pair").
 * Its button and Enter key hardcoded `"one"`, so an invited newcomer — nearly every real newcomer, since they arrive
 * without an account and so are never signed in — was sent to a PAID light checkout (NT$75) despite the panel saying
 * 「朋友邀請 · 第一份深斷免費」. The tier must follow what opened the panel, not a constant.
 */
export function claimPanelTier(emailFor: "free" | "invite" | "pair" | null, pairTier?: Tier | null): Tier {
  if (emailFor === "pair") return pairTier ?? "one";
  if (emailFor === "invite") return INVITE_TIER;
  return "one";
}
