/**
 * 11-01 (Neil: 「我们系统内的通卡和会员标识一定要区分清楚」): one place that names what a subscription row is, for every
 * back-office label — a 会员 (the monthly / yearly membership), a 通卡 (1 / 7 / 30 days, the old one-off month = 30), or a
 * membership we gave (赠送会员). Never call a 通卡 holder 「会员」.
 */
export type StandingKind = "member" | "pass" | "comp";
export const standingKindOf = (sid: string | null | undefined): StandingKind | null =>
  !sid ? null : sid.startsWith("pass_") ? "pass" : sid.startsWith("comp_") ? "comp" : "member";
export function standingLabel(kind: StandingKind | null | undefined, passDays?: number | null): string {
  if (kind === "pass") return `通卡${passDays === 1 || passDays === 7 || passDays === 30 ? ` ${passDays} 天` : ""}`;
  if (kind === "comp") return "赠送会员";
  if (kind === "member") return "会员";
  return "";
}
/** the colour class of each: 会员 cinnabar, 通卡 emerald, 赠送 gold */
export const standingTone = (kind: StandingKind | null | undefined): string =>
  kind === "pass" ? "text-emerald-700" : kind === "comp" ? "text-[var(--gold-text)]" : "text-[var(--cinnabar)]";
