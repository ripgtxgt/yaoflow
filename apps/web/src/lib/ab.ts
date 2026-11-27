/**
 * 09-26 对照测试 (Neil: 「做第一类吧」). Two experiments, one browser-level draw:
 *   f — 新访客的第一份轻解读免费（留邮箱）      f1 = free, f0 = as before
 *   o — 预览那一句上方先给五档倾向              o1 = shown, o0 = as before
 * The draw is a number kept in localStorage (nothing personal, no cookie), so a
 * returning browser stays in its arm; the two bits are independent. Every
 * event carries the tag ("f1o0"), so the dashboard can compare arms.
 * Client-safe.
 */
const KEY = "yaoflow:ab";
/**
 * 09-28 (Neil: 「按照你来的做吧」), two more bits on the same draw:
 *   p — 首次用户只给一个价格（首次深断；轻解读退成一行小字）   p1 = one price, p0 = two buttons
 *   v — 预览多露一点（断语整段公开，只锁应期和怎么做）        v1 = paragraph, v0 = one line
 * Old tags "f1o0" are still accepted everywhere (events before today carry them).
 */
export const AB_RE = /^f[01]o[01](p[01]v[01](h[01](x[01]y[01])?)?)?$/;
/**
 * 09-30 (Neil: 「1，2，3都做吧」), a fifth bit:
 *   h — 首页首屏改成「心里悬着一件事？」+ 一点就起卦的例题   h1 = new hero, h0 = as before
 * The home page reads this bit before paint (an inline script, see HOME_AB_SCRIPT) so neither arm flashes.
 */
export const HOME_BIT = (n: number): boolean => Math.floor(n / 16) % 2 === 1;
/**
 * 10-02 (Neil: 「做 3 和 4 吧，然后话术上面还能优化吗」), two more bits:
 *   x — 免费那一句下面列出「这一卦的深断里还有」（应期只露月份）+ 价格按钮的新话术   x1 = new, x0 = as before
 *   y — 「还没想好？把这一卦存到信箱」，一天后提醒一次（首次价）                       y1 = offered, y0 = as before
 * Tags drawn before today ("f1o0p0v0h1") are still accepted; they sit in neither x/y arm.
 */
export const PREVIEW_BIT = (n: number): boolean => Math.floor(n / 32) % 2 === 1;
export const SAVE_BIT = (n: number): boolean => Math.floor(n / 64) % 2 === 1;

function draw(): number {
  try {
    const raw = localStorage.getItem(KEY);
    const n = raw ? Number(raw) : NaN;
    if (Number.isInteger(n) && n >= 0 && n < 10000) return n;
    const fresh = Math.floor(Math.random() * 10000);
    localStorage.setItem(KEY, String(fresh));
    return fresh;
  } catch {
    return -1;
  }
}

/** The arms, or null when the browser keeps no storage (then it gets the old experience and no tag). */
export function abArms(): { free: boolean; odds: boolean; onePrice: boolean; verdict: boolean; home: boolean; preview: boolean; save: boolean; tag: string } | null {
  if (typeof window === "undefined") return null;
  const n = draw();
  if (n < 0) return null;
  // 10-08 (Neil: 「要，收了吧」): f, o, h and y ended — none of them could move paying by more than noise, and at this
  // traffic (about 190 browsers per arm per day) a one-point difference would take four more months to see. Over
  // 09-23..10-07, paid / saw-the-preview: f 5.0% → 5.4%, o 5.0% → 5.5%, y 5.3% → 5.8%; h by landed browser 3.1% → 3.7%,
  // and the two heroes started a cast at the same rate (63% / 64%). Decided: the free first light reading stays for
  // everyone (no cost to paying, 283 addresses left in 15 days); the preview goes back to the plain line; the old hero
  // stays; "save to email" goes (6 of 982 used it). The tag keeps saying which (f1o0h0y0); the bits stay for old rows.
  const free = true; // was: n % 2 === 1
  const odds = false; // was: Math.floor(n / 2) % 2 === 1
  // 10-02 (Neil: 「停掉吧」): both ended — against the control (two prices, a one-line preview) each cut paying visits by
  // about 45% (3.6% → 1.9%; both together 1.3%). Every browser now gets the control, and its tag says so (p0v0).
  const onePrice = false; // was: Math.floor(n / 4) % 2 === 1
  const verdict = false; // was: Math.floor(n / 8) % 2 === 1
  const home = false; // was: HOME_BIT(n) — 10-08, see above
  // 10-05 (Neil: 「要」): x ended — by person over 10-03..05, the preview arm clicked a price 33% against 23% and paid
  // 10.7% against 5.6% (318 vs 288 people; for a first line that read "bad", 6.4% against 3.3%). Everyone now gets the
  // preview and the new button copy, and the tag says so (x1); PREVIEW_BIT stays for the heat page's older rows.
  const preview = true; // was: PREVIEW_BIT(n)
  const save = false; // was: SAVE_BIT(n) — 10-08, see above
  const b = (x: boolean) => (x ? 1 : 0);
  return { free, odds, onePrice, verdict, home, preview, save, tag: `f${b(free)}o${b(odds)}p${b(onePrice)}v${b(verdict)}h${b(home)}x${b(preview)}y${b(save)}` };
}

export const abTag = (): string | undefined => abArms()?.tag;

/**
 * Runs inline at the top of the home page, before the hero paints: the same draw as `draw()` (creating it if
 * this is the browser's first page), and `data-abh="1"` on <html> for the new-hero arm. CSS in globals.css
 * shows one hero or the other. With no storage it does nothing — the old hero, and no tag, as everywhere.
 * 10-08: h ended on the old hero — the page no longer includes this script (kept for the test and the record).
 */
export const HOME_AB_SCRIPT = `try{var k="${KEY}",r=localStorage.getItem(k),n=r?Number(r):NaN;if(!(n>=0&&n<10000&&n%1===0)){n=Math.floor(Math.random()*10000);localStorage.setItem(k,String(n))}if(Math.floor(n/16)%2===1)document.documentElement.setAttribute("data-abh","1")}catch(e){}`;
