/** 10-29 进度表 128 — two site-wide lines in 繁體, kept apart from lib/l10n/site.ts so a component can read them without
 *  loading the whole service list (the translations: data/l10n/site.json `owed`, `switchRow`). */
export const SWITCH_HANT = { lead: "不想起卦？也可以", qiuqian: "求一支籤", jiaobei: "擲一次筊", tarot: "抽一張塔羅", xunwu: "東西不見了？擲骰子找" } as const;
export const OWED_HANT = "你有 {n} 件事到期了，等你說一句後來怎麼樣 →";
