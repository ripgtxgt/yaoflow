import type { Entitlement } from "@/lib/sub-plan";
import type { priceLabels } from "@/lib/money";

/**
 * 10-22 进度表 76 (CastFlow 拆分): what /api/me tells the cast page about the person casting — the one shape
 * CastFlow and its cast/ panels share. Everything optional but `signedIn`: an older server answers less.
 */
export type CastMe = {
  signedIn: boolean;
  entitlement?: Entitlement;
  country?: string | null;
  firstDeep?: boolean;
  inviteFree?: boolean;
  neverPaid?: boolean;
  firstMonth?: boolean;
  paidToday?: boolean;
  tongka?: boolean;
  firstTongka?: boolean;
  recent?: { sid: string; q: string; at: number } | null;
  ab?: { free: boolean; odds: boolean; onePrice?: boolean; verdict?: boolean; preview?: boolean; save?: boolean };
  refLight?: { url: string; until: number; side: "friend" | "sharer" }[];
};

/** the price labels the cast page shows (lib/money priceLabels) */
export type PriceLabels = ReturnType<typeof priceLabels>;
