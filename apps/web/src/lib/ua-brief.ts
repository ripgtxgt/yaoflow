/**
 * 10-02: a page error is only fixable when we know which browser had it — the iOS 16.2 Threads reader whose cast page
 * crashed showed up in our events as 「pr:Invalid regular expre」 and nothing else. For client_error events only, the
 * server keeps a short label of the browser: system and version, and the app it was opened in. Nothing finer (no
 * device model, no build numbers, no language), and never on any other event.
 *   "iOS 16.2 · Threads" · "Android 14 · Chrome 130" · "macOS · Safari 16.3" · "Windows · Edge 129"
 */
export function uaBrief(ua: string | null | undefined): string | undefined {
  if (!ua) return undefined;
  let os = "";
  let m: RegExpMatchArray | null;
  if ((m = ua.match(/(?:iPhone|iPad|iPod).*? OS (\d+)[._](\d+)/))) os = `iOS ${m[1]}.${m[2]}`;
  else if ((m = ua.match(/Android (\d+)/))) os = `Android ${m[1]}`;
  else if (/Mac OS X/.test(ua)) os = "macOS";
  else if (/Windows/.test(ua)) os = "Windows";
  else if (/CrOS/.test(ua)) os = "ChromeOS";
  else if (/Linux/.test(ua)) os = "Linux";
  let app = "";
  if (/Barcelona/.test(ua)) app = "Threads";
  else if (/Instagram/.test(ua)) app = "Instagram";
  else if (/FBAN|FBAV|FB_IAB/.test(ua)) app = "Facebook";
  else if (/\bLine\//.test(ua)) app = "LINE";
  else if (/MicroMessenger/.test(ua)) app = "WeChat";
  else if (/XiaoHongShu|xhsdiscover/i.test(ua)) app = "小红书";
  else if ((m = ua.match(/EdgA?\/(\d+)/))) app = `Edge ${m[1]}`;
  else if ((m = ua.match(/SamsungBrowser\/(\d+)/))) app = `Samsung ${m[1]}`;
  else if ((m = ua.match(/(?:CriOS|Chrome)\/(\d+)/))) app = `Chrome ${m[1]}`;
  else if ((m = ua.match(/(?:FxiOS|Firefox)\/(\d+)/))) app = `Firefox ${m[1]}`;
  else if ((m = ua.match(/Version\/(\d+(?:\.\d+)?).*Safari/))) app = `Safari ${m[1]}`;
  else if (/Safari/.test(ua)) app = "Safari";
  const s = [os, app].filter(Boolean).join(" · ");
  return s ? s.slice(0, 40) : undefined;
}

/**
 * 10-03 分组 (lib/segments.ts): the coarse class of a cast's device and the app it was opened in — enough to compare
 * conversion between Threads' own browser and Safari, phones and computers. No model, no version, nothing finer.
 */
export type UaDevice = "ios" | "android" | "desktop" | "other";
export type UaApp = "threads" | "instagram" | "facebook" | "line" | "wechat" | "xiaohongshu" | "browser";
export function uaSegment(ua: string | null | undefined): { device: UaDevice; app: UaApp } {
  const u = ua ?? "";
  const device: UaDevice = /iPhone|iPad|iPod/.test(u) ? "ios" : /Android/.test(u) ? "android" : /Windows|Mac OS X|CrOS|Linux|X11/.test(u) ? "desktop" : "other";
  const app: UaApp = /Barcelona/.test(u) ? "threads"
    : /Instagram/.test(u) ? "instagram"
    : /FBAN|FBAV|FB_IAB/.test(u) ? "facebook"
    : /\bLine\//.test(u) ? "line"
    : /MicroMessenger/.test(u) ? "wechat"
    : /XiaoHongShu|xhsdiscover/i.test(u) ? "xiaohongshu"
    : "browser";
  return { device, app };
}

/**
 * 10-02 (Neil: 「设备的具体型号应该能查出来的吧」): the live board's device line — the phone's model when the browser
 * names it, else the system and the app. Board only (memory, 30 minutes); never written to the event files.
 * Threads / Instagram / Facebook in-app browsers name it (iOS: "iPhone17,2"; Android: "samsung; SM-S9310"); Safari and
 * Chrome on an iPhone do not (Apple keeps the model from web pages), nor does Chrome on Android ("Android 10; K").
 *   "iPhone 16 Pro Max · iOS 26.6 · Threads" · "Galaxy S25 · Android 16 · Threads" · "iPhone · iOS 18.7 · Safari 18.7"
 */
const IPHONE: Record<string, string> = {
  "iPhone10,1": "iPhone 8", "iPhone10,4": "iPhone 8", "iPhone10,2": "iPhone 8 Plus", "iPhone10,5": "iPhone 8 Plus",
  "iPhone10,3": "iPhone X", "iPhone10,6": "iPhone X", "iPhone11,2": "iPhone XS", "iPhone11,4": "iPhone XS Max",
  "iPhone11,6": "iPhone XS Max", "iPhone11,8": "iPhone XR", "iPhone12,1": "iPhone 11", "iPhone12,3": "iPhone 11 Pro",
  "iPhone12,5": "iPhone 11 Pro Max", "iPhone12,8": "iPhone SE (2nd)", "iPhone13,1": "iPhone 12 mini", "iPhone13,2": "iPhone 12",
  "iPhone13,3": "iPhone 12 Pro", "iPhone13,4": "iPhone 12 Pro Max", "iPhone14,4": "iPhone 13 mini", "iPhone14,5": "iPhone 13",
  "iPhone14,2": "iPhone 13 Pro", "iPhone14,3": "iPhone 13 Pro Max", "iPhone14,6": "iPhone SE (3rd)", "iPhone14,7": "iPhone 14",
  "iPhone14,8": "iPhone 14 Plus", "iPhone15,2": "iPhone 14 Pro", "iPhone15,3": "iPhone 14 Pro Max", "iPhone15,4": "iPhone 15",
  "iPhone15,5": "iPhone 15 Plus", "iPhone16,1": "iPhone 15 Pro", "iPhone16,2": "iPhone 15 Pro Max", "iPhone17,1": "iPhone 16 Pro",
  "iPhone17,2": "iPhone 16 Pro Max", "iPhone17,3": "iPhone 16", "iPhone17,4": "iPhone 16 Plus", "iPhone17,5": "iPhone 16e",
  "iPhone18,1": "iPhone 17 Pro", "iPhone18,2": "iPhone 17 Pro Max", "iPhone18,3": "iPhone 17", "iPhone18,4": "iPhone Air",
};
/** Samsung's model codes for the phones most often seen here; anything else keeps its code ("SM-A5660"). */
const GALAXY: [RegExp, string][] = [
  [/^SM-S90[16]/, "Galaxy S22"], [/^SM-S908/, "Galaxy S22 Ultra"], [/^SM-S91[16]/, "Galaxy S23"], [/^SM-S918/, "Galaxy S23 Ultra"],
  [/^SM-S92[16]/, "Galaxy S24"], [/^SM-S928/, "Galaxy S24 Ultra"], [/^SM-S93[16]/, "Galaxy S25"], [/^SM-S937/, "Galaxy S25 Edge"],
  [/^SM-S938/, "Galaxy S25 Ultra"], [/^SM-F946/, "Galaxy Z Fold5"], [/^SM-F956/, "Galaxy Z Fold6"], [/^SM-F966/, "Galaxy Z Fold7"],
  [/^SM-F731/, "Galaxy Z Flip5"], [/^SM-F741/, "Galaxy Z Flip6"], [/^SM-F761/, "Galaxy Z Flip7"],
];

export function deviceModel(ua: string | null | undefined): string | undefined {
  if (!ua || /bot|crawl|spider|headless/i.test(ua)) return undefined;
  const parts: string[] = [];
  let m: RegExpMatchArray | null;
  if (/iPhone|iPad|iPod/.test(ua)) {
    const id = ua.match(/\b(iPhone\d+,\d+|iPad\d+,\d+)\b/)?.[1];
    parts.push(id ? IPHONE[id] ?? id : /iPad/.test(ua) ? "iPad" : "iPhone");
    // an in-app browser states its own iOS version ("iOS 26_6_2"); WebKit's "OS 18_6" can be frozen
    const v = ua.match(/\biOS (\d+)[._](\d+)/) ?? ua.match(/ OS (\d+)[._](\d+)/);
    if (v) parts.push(`iOS ${v[1]}.${v[2]}`);
  } else if ((m = ua.match(/Android (\d+)/))) {
    // an in-app browser's own tail: "Android (36/16; 420dpi; 1080x2340; samsung; SM-S9310; pa1q; …)"
    const tail = ua.match(/\(\d+\/[\d.]+; \d+dpi; \d+x\d+; ([^;]+); ([^;]+);/);
    const fromLinux = ua.match(/Android [\d.]+; ([^;)]+?)(?: Build\/[^;)]*)?[;)]/)?.[1]?.trim();
    const code = tail?.[2]?.trim() ?? (fromLinux && fromLinux !== "K" && fromLinux !== "wv" ? fromLinux : undefined);
    const brand = tail?.[1]?.trim().split("/")[0]; // "Google/google" → "Google"
    if (code) {
      const galaxy = GALAXY.find(([re]) => re.test(code))?.[1];
      parts.push(galaxy ?? (brand && !code.toLowerCase().startsWith(brand.toLowerCase()) ? `${brand} ${code}` : code));
    }
    parts.push(`Android ${m[1]}`);
  } else {
    const os = uaBrief(ua)?.split(" · ")[0];
    if (os) parts.push(os);
  }
  const app = uaBrief(ua)?.split(" · ").slice(1).join(" · ");
  if (app) parts.push(app);
  const s = parts.join(" · ");
  return s ? s.slice(0, 60) : undefined;
}
