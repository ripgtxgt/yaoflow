/**
 * Which sales bucket an orders.tier belongs to — the finance page's buckets (10-22 进度表 55, the catalog's groups), shared
 * since 10-23 (进度表 105 ⑤) with the dashboard's 「解读 $」 so the two pages split a charge the same way. No imports: db.ts
 * reads it too.
 */
export const SALE_KEYS = ["one", "deep", "sub", "pack", "pass", "qian", "tarot", "mingli"] as const;
export type SaleKey = (typeof SALE_KEYS)[number];
export function saleBucket(tier: string): SaleKey {
  if (tier.startsWith("pass_")) return "pass";
  if (tier === "deep") return "deep";
  if (tier === "one" || tier === "light") return "one";
  if (tier === "pack") return "pack";
  if (tier === "tarot") return "tarot";
  if (tier === "qian" || tier === "qiancard") return "qian";
  if (/^(hepan|nianshu|bazi_|ziwei_|astro_)/.test(tier)) return "mingli";
  return "one";
}
export const SALE_KEY_ZH: Record<SaleKey, string> = {
  one: "轻解读", deep: "深断", sub: "会员", pack: "会员增购包", pass: "通卡", qian: "解籤", tarot: "塔罗", mingli: "命理（合盘、年书、报告）",
};
