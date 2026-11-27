/**
 * 10-13 进度表 41 提高分享率 ①: where a share happened and where it went. Pure — used by the browser (ShareSheet) and
 * by /api/track, which accepts only these values. The share_click event keeps `method` = the channel (so the old
 * native / copy counts still add up) and gains `sf` = the surface.
 */
export const SHARE_SURFACES = ["result", "deep", "qian", "matter", "revisit", "lot", "bazi", "ziwei", "astro", "hepan", "daily", "seal", "pair", "gift", "referral", "proof", "bmg"] as const; // 11-05 进度表 136: 本命卦 // 10-22 分享 13 合 1: the buttons that used to count themselves
export type ShareSurface = (typeof SHARE_SURFACES)[number];
export const isShareSurface = (x: unknown): x is ShareSurface => SHARE_SURFACES.includes(x as ShareSurface);

/** native = the phone's share sheet (with the picture when the browser allows), download = saved the 9:16 card */
export const SHARE_CHANNELS = ["native", "line", "threads", "ig", "download", "copy"] as const;
export type ShareChannel = (typeof SHARE_CHANNELS)[number];

export const SURFACE_LABEL: Record<ShareSurface, string> = {
  daily: "会员今日一卦", seal: "封卦", pair: "同题合参", gift: "送一卦", referral: "推荐面板", proof: "应验卡",
  result: "结果页", deep: "深断页", qian: "籤结果页", matter: "事页", revisit: "回访/应了", lot: "籤页", bazi: "八字命盘", astro: "星盘", ziwei: "紫微命盘", hepan: "合盘", bmg: "本命卦",
};
export const CHANNEL_LABEL: Record<ShareChannel, string> = {
  native: "系统分享", line: "LINE", threads: "Threads", ig: "IG 限动（存图）", download: "下载图片", copy: "复制链接",
};

/** The campaign tag every shared link carries (进度表 41 ①), so /admin's channel table shows share → visit → cast → paid */
export const SHARE_TAGS = { gua: "gua-share", qian: "qian-share", ying: "ying-share", friend: "qian-friend", bazi: "bazi-share", ziwei: "ziwei-share", astro: "astro-share", hepan: "hepan-share" } as const;

/** Add ?c=<tag> to a link unless it already names a campaign */
export function withShareTag(url: string, tag: string): string {
  try {
    const u = new URL(url);
    if (!u.searchParams.has("c")) u.searchParams.set("c", tag);
    return u.toString();
  } catch {
    return url.includes("?") ? `${url}&c=${tag}` : `${url}?c=${tag}`;
  }
}
