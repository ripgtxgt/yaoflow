/**
 * 10-31 进度表 131 (Neil: 「把免费一句给全部去掉，直接进行付费引导话术的展示」) took the free line away; 11-05 进度表 141
 * (Neil: 「还是全部开放免费那句吧，然后引导话术再根据现有的数据进行升级」) brings it back for everyone, every language.
 * FREE_LINE=off takes it away again without a deploy of code; FREE_LINE_FOREIGN=off only outside 简体／繁體.
 */
export const freeLineOn = (locale?: string | null): boolean => {
  if (process.env.FREE_LINE === "off") return false;
  if (process.env.FREE_LINE_FOREIGN === "off" && !!locale && locale !== "zh" && locale !== "zh-hant") return false;
  return true;
};
