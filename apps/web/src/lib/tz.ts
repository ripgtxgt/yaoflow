/**
 * 客户时区 (Neil 09-26: 「是否能精准地判断出客户的时区，后期个人页面要加功能」).
 *
 * The device's IANA zone (Intl.DateTimeFormat().resolvedOptions().timeZone,
 * e.g. "Asia/Taipei") is the most precise thing a browser can tell us: it is
 * what the phone's own clock uses, daylight saving included. A UTC offset
 * (+480) cannot tell Taipei from Perth, nor know that Berlin moves an hour in
 * March. The edge's country header is a guess from the IP — a VPN moves it.
 */
export function validTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length < 3 || tz.length > 40 || !/^[A-Za-z0-9_+\-\/]+$/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
