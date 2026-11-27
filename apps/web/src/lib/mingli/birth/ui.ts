import { loc } from "@/lib/mingli/calendar/content";
import type { HlLocale } from "@/lib/mingli/calendar/day";
import GEN from "@/data/l10n/birth.json";
import { isForeign, type Generated } from "@/lib/l10n/core";
import { localize } from "@/lib/l10n/server";
import { GROUP_NAMES, PLACES, type PlaceGroup } from "./places";

/**
 * 10-18 进度表 71–74: the birth form's words and the place list in the reader's script (built on the server, passed down).
 * 10-30 进度表 128 ④: in all nine languages (data/l10n/birth.json). Outside Chinese the form opens on the "intl" place
 * tree (countries in the reader's language, cities in English) and keeps no Taiwan default place.
 */
const UI = {
  who: "給誰看", whoOpts: "自己,伴侶,家人,朋友,其他", name: "稱呼", namePh: "我", gender: "性別", male: "男", female: "女",
  cal: "曆法", solar: "國曆", lunar: "農曆", leap: "閏月", date: "出生日期", y: "年", m: "月", d: "日",
  time: "出生時間", hourUnit: "時", minUnit: "分", exact: "知道幾點幾分", branch: "只知道大概時辰", unknown: "不確定",
  branches: "早子時（00–01）,丑時（01–03）,寅時（03–05）,卯時（05–07）,辰時（07–09）,巳時（09–11）,午時（11–13）,未時（13–15）,申時（15–17）,酉時（17–19）,戌時（19–21）,亥時（21–23）,晚子時（23–24）",
  place: "出生地點", placePick: "選地區", cityPick: "選城市", placeSearch: "搜尋城市、鄉鎮或區，例如 竹北、深圳、溫哥華", placeNone: "找不到，換個名稱試試。", reg_tw: "台灣", reg_hkmo: "港澳", reg_cn: "大陸", reg_intl: "海外", cols_tw: "縣市,鄉鎮市區", cols_hkmo: "地區,區", cols_cn: "省份,城市,區縣", cols_intl: "國家地區,州省,城市",
  timeUnknown: "時辰未知", pickTime: "請選擇", trueSolarLine: "真太陽時：{t}", unknownShort: "未知", quickPh: "也可以直接輸入，例如 199303270255", ok: "確定",
  dstNote: "這段時間當地實施夏令時間，已幫你換回平常的時間（扣掉夏令的一小時）。", dstSkip: "我填的已經扣掉夏令時間",
  go: "排盤", privacy: "只用來排盤，不會公開。",
  saved: "之前排過的", use: "用這份", del: "刪除", newOne: "排一份新的",
  errDate: "這個日期不存在，請再確認一次。", errLunar: "這個農曆日期不存在（或這年沒有這個閏月）。", errYear: "年份請填 1900 年到今年。",
  errTime: "請填出生時間。", errPlace: "知道出生時間時，請選出生地。", errGender: "請選性別。", errBranch: "請選時辰。",
  needTime: "星盤需要出生時間和地點；不確定時間的話，還是可以看太陽和其他行星。",
  // 10-30: the column heads of the date wheels (the form used the bare characters)
  "col_年": "年", "col_月": "月", "col_日": "日", "col_時": "時", "col_分": "分",
};
export const BIRTH_UI_HANT = UI;
export type BirthUi = typeof UI & { places: { id: string; name: string; group: PlaceGroup; region?: string }[]; groups: [PlaceGroup, string][]; foreign?: boolean; lunarOk?: boolean };

export function birthUi(locale: HlLocale | string): BirthUi {
  if (isForeign(locale)) {
    const out = localize(UI, GEN as unknown as Generated, locale);
    // the quick list of Chinese places is not offered outside Chinese (the tree and the search are)
    return { ...out, places: [], groups: (Object.keys(GROUP_NAMES) as PlaceGroup[]).map((g) => [g, out[`reg_${g === "hk" || g === "mo" ? "hkmo" : g}` as keyof typeof UI] as string]), foreign: true, lunarOk: locale === "ko" };
  }
  const l = locale as HlLocale;
  const w = (s: string) => loc(s, l);
  const out = Object.fromEntries(Object.entries(UI).map(([k, v]) => [k, w(v)])) as typeof UI;
  return {
    ...out,
    places: PLACES.map((p) => ({ id: p.id, name: w(p.name), group: p.group, region: p.region ? w(p.region) : undefined })),
    groups: (Object.entries(GROUP_NAMES) as [PlaceGroup, string][]).map(([g, n]) => [g, w(n)]),
  };
}
