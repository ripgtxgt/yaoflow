/**
 * 邮箱校对 (Neil 09-26: 「加上输入邮箱的正确校对，发现很多邮箱有问题」).
 *
 * What the live data showed (09-26, 187 addresses): gamil.com, gmaol.com,
 * gmail.comu, hotmail.con, hitmaik.com, mail.nknu.edu-tw. Three bounced; two
 * were DELIVERED — hitmaik.com and gmaol.com are typo domains someone owns
 * and accepts mail on, so a reading went to a stranger. A mail-server check
 * alone would not have caught those; the "did you mean" below does.
 *
 * Runs in the browser and on the server. No lookbehind.
 */

/** Providers people actually use here — the typo target list. Exact matches are never questioned. */
const KNOWN = [
  "gmail.com", "googlemail.com", "hotmail.com", "outlook.com", "live.com", "msn.com", "icloud.com", "me.com", "mac.com",
  "yahoo.com", "yahoo.com.tw", "yahoo.com.hk", "yahoo.co.jp", "yahoo.co.uk", "yahoo.fr", "yahoo.de", "yahoo.es", "yahoo.com.br",
  "hotmail.com.hk", "hotmail.com.tw", "hotmail.co.jp", "hotmail.co.uk", "hotmail.fr", "hotmail.de", "hotmail.es", "outlook.jp", "outlook.fr", "outlook.de", "outlook.es",
  "qq.com", "163.com", "126.com", "foxmail.com", "sina.com", "sina.cn", "sohu.com", "aliyun.com", "139.com",
  "msa.hinet.net", "pchome.com.tw", "kimo.com",
  "naver.com", "daum.net", "hanmail.net", "kakao.com", "nate.com",
  "docomo.ne.jp", "ezweb.ne.jp", "au.com", "softbank.ne.jp", "i.softbank.jp", "ymobile.ne.jp",
  "gmx.de", "gmx.net", "web.de", "t-online.de", "orange.fr", "free.fr", "sfr.fr", "laposte.net", "wanadoo.fr",
  "uol.com.br", "bol.com.br", "terra.com.br", "sapo.pt",
  "proton.me", "protonmail.com", "aol.com", "mail.com", "yandex.com", "duck.com",
];
const KNOWN_SET = new Set(KNOWN);

/** Full-width and CJK punctuation typed with an IME: ＠ 。 ． ， and stray spaces. */
export function normalizeEmail(raw: string): string {
  return (raw ?? "").normalize("NFKC").replace(/[。｡．，,]/g, ".").replace(/\s+/g, "").toLowerCase();
}

const LOCAL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/;
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Plain shape: one @, a sane local part, a domain of real labels with a letter TLD. */
export function emailSyntaxOk(e: string): boolean {
  if (e.length > 254) return false;
  const at = e.split("@");
  if (at.length !== 2) return false;
  const [local, domain] = at;
  if (!local || local.length > 64 || !LOCAL.test(local) || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  const labels = domain.split(".");
  if (labels.length < 2 || labels.some((l) => !LABEL.test(l))) return false;
  return /^[a-z]{2,24}$/.test(labels[labels.length - 1]);
}

/** Optimal string alignment distance (Levenshtein + adjacent transposition): gamil → gmail is 1. */
function osa(a: string, b: string): number {
  const m = a.length, n = b.length;
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}

/** Common slips at the end of a domain: .con .cmo .comu .om — and edu-tw for edu.tw. */
function fixTail(domain: string): string {
  return domain
    .replace(/-(tw|hk|jp|kr|cn|uk|br|pt)$/, ".$1")
    .replace(/\.(?:con|cmo|ocm|vom|xom|cpm|comm|comu|coom|c0m|om|cm)$/, ".com")
    .replace(/\.(?:nte|ner|nett)$/, ".net");
}

/**
 * A likely intended address, or null when it looks right (or we cannot tell).
 * Only suggests toward a well-known provider, and only for close misses — a
 * company domain nobody has heard of is left alone.
 */
export function suggestEmail(raw: string): string | null {
  const e = normalizeEmail(raw);
  const at = e.lastIndexOf("@");
  if (at < 1) return null;
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  if (!domain || KNOWN_SET.has(domain)) return null;
  if (/\.hinet\.net$|\.edu\.tw$|\.gov\.tw$/.test(domain)) return null; // ms1…ms99.hinet.net and schools are real, and close to each other
  const tail = fixTail(domain);
  if (tail !== domain && (KNOWN_SET.has(tail) || !KNOWN.some((k) => osa(tail, k) <= 1))) return `${local}@${tail}`;
  let best: string | null = null, bestD = 99;
  for (const k of KNOWN) {
    const dist = osa(tail, k);
    if (dist < bestD) { bestD = dist; best = k; }
  }
  if (!best) return null;
  // one slip anywhere; two only on a long name with the same ending (hitmaik.com → hotmail.com, never 126 → 163)
  const sameEnd = best.slice(best.indexOf(".")) === tail.slice(tail.indexOf("."));
  const ok = bestD === 1 ? tail.length >= 6 : bestD === 2 && tail.length >= 10 && sameEnd;
  return ok ? `${local}@${best}` : null;
}

/** What is wrong with it for the page: nothing, the shape, or a probable typo (with the fix). */
export type EmailVerdict = { ok: true; email: string } | { ok: false; kind: "syntax"; email: string } | { ok: false; kind: "typo"; email: string; suggestion: string };

export function checkEmail(raw: string): EmailVerdict {
  const email = normalizeEmail(raw);
  if (!emailSyntaxOk(email)) {
    const s = suggestEmail(email);
    return s && emailSyntaxOk(s) ? { ok: false, kind: "typo", email, suggestion: s } : { ok: false, kind: "syntax", email };
  }
  const s = suggestEmail(email);
  return s ? { ok: false, kind: "typo", email, suggestion: s } : { ok: true, email };
}

/**
 * Addresses the reader has confirmed as typed ("no, that's right") — module
 * state in the browser tab, so a submit handler can let it through without
 * the page threading a flag around.
 */
const CONFIRMED = new Set<string>();
export function confirmEmailAsTyped(raw: string): void { CONFIRMED.add(normalizeEmail(raw)); }

/**
 * 10-23: true exactly while EmailHint's 「是不是 …？」 line shows under the box — a probable typo, not yet taken or kept.
 * The forms that show the hint but judged only the shape (解籤, 塔羅 and 看自己 / 免費 check-ins, the 2027 list) let
 * gmail.con and icloud.con through; they stop on this now. A wrong shape stays the form's or the server's to answer.
 */
export function emailTypoPending(raw: string): boolean {
  const v = (raw ?? "").trim();
  if (!/@[^@]+\.[^@]{2,}$/.test(v)) return false;
  const r = checkEmail(v);
  return !r.ok && r.kind === "typo" && !CONFIRMED.has(r.email);
}

/** True when a submit should stop: the shape is wrong, or a typo is suspected and not yet confirmed. */
export function emailNeedsAttention(raw: string): boolean {
  const v = checkEmail(raw);
  if (v.ok) return false;
  if (v.kind === "typo" && CONFIRMED.has(v.email) && emailSyntaxOk(v.email)) return false;
  return true;
}
