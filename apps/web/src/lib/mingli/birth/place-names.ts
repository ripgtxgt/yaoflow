// server-side only (used by the place search and the place tree)
import type { Foreign } from "@/lib/l10n/core";

/**
 * 10-30 进度表 128 ④ — birthplaces for readers outside Chinese. The place data has Chinese and English names; a foreign
 * page shows the English name of a city, the country in the reader's own language (Intl.DisplayNames), and for the
 * three countries the tree splits by state (US, Canada, Australia) the state's English name below. A reader's own
 * countries come first, in the tree and in the search.
 */
export const MARKET: Record<Foreign, string[]> = {
  en: ["US", "GB", "CA", "AU", "NZ", "IE", "SG", "MY", "PH", "IN", "ZA"],
  ja: ["JP"],
  ko: ["KR"],
  fr: ["FR", "BE", "CH", "CA", "LU", "MA", "SN", "CI"],
  de: ["DE", "AT", "CH", "LU"],
  es: ["ES", "MX", "AR", "CO", "CL", "PE", "VE", "EC", "GT", "CU", "DO", "BO", "UY", "PY", "CR", "PA", "SV", "HN", "NI", "PR", "US"],
  pt: ["BR", "PT", "AO", "MZ"],
};

const DN = new Map<string, Intl.DisplayNames>();
/** a country's name in the reader's language ("JP" → 日本 / Japan / Japon / 일본) */
export function countryName(cc: string, locale: string): string {
  try {
    if (!DN.has(locale)) DN.set(locale, new Intl.DisplayNames([locale], { type: "region" }));
    return DN.get(locale)!.of(cc) ?? cc;
  } catch { return cc; }
}

/** the states and provinces the place tree splits US / Canada / Australia into (its 繁體 names) → English */
export const ADMIN_EN: Record<string, string> = {
  加利福尼亞州: "California", 紐約州: "New York", 德克薩斯州: "Texas", 佛羅里達州: "Florida", 伊利諾州: "Illinois", 亞利桑那州: "Arizona",
  麻省: "Massachusetts", 俄亥俄州: "Ohio", 紐澤西州: "New Jersey", 華盛頓州: "Washington", 北卡羅萊納州: "North Carolina", 賓夕法尼亞州: "Pennsylvania",
  維吉尼亞州: "Virginia", 密芝根州: "Michigan", 田納西州: "Tennessee", 馬利蘭州: "Maryland", 科羅拉多州: "Colorado", 喬治亞州: "Georgia",
  印第安納州: "Indiana", 明尼蘇達州: "Minnesota", 密蘇里州: "Missouri", 康乃狄克州: "Connecticut", 威斯康辛州: "Wisconsin", 內華達州: "Nevada",
  奧勒岡州: "Oregon", 猶他州: "Utah", 肯塔基州: "Kentucky", 俄克拉荷馬州: "Oklahoma", 阿拉巴馬州: "Alabama", 路易斯安那州: "Louisiana",
  堪薩斯州: "Kansas", 夏威夷州: "Hawaii", 愛荷華州: "Iowa", 南卡羅萊納州: "South Carolina", 新墨西哥州: "New Mexico", 阿肯色州: "Arkansas",
  華盛頓特區: "Washington, D.C.", 內布拉斯加州: "Nebraska", 密西西比州: "Mississippi", 羅德島州: "Rhode Island", 愛達荷州: "Idaho",
  新罕布夏州: "New Hampshire", 北達科他州: "North Dakota", 阿拉斯加: "Alaska", 蒙大拿州: "Montana", 緬因州: "Maine", 南達科他州: "South Dakota",
  西維吉尼亞州: "West Virginia", 懷俄明州: "Wyoming", 德拉瓦州: "Delaware", 佛蒙特州: "Vermont",
  安大略省: "Ontario", 魁北克省: "Quebec", 卑詩省: "British Columbia", 亞伯達省: "Alberta", 薩斯喀徹溫省: "Saskatchewan", 新斯科細亞省: "Nova Scotia",
  曼尼托巴省: "Manitoba", 新不倫瑞克省: "New Brunswick", 紐芬蘭與拉布拉多省: "Newfoundland and Labrador", 愛德華王子島: "Prince Edward Island",
  育空地區: "Yukon", 西北地區: "Northwest Territories",
  維多利亞州: "Victoria", 新南威爾斯州: "New South Wales", 昆士蘭州: "Queensland", 西澳州: "Western Australia", 南澳州: "South Australia",
  澳大利亞首都領地: "Australian Capital Territory", 塔斯馬尼亞州: "Tasmania", 北領地: "Northern Territory",
};
