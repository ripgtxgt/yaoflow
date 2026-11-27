/**
 * The 「也告诉我正式上线和新功能」 box (09-23, Neil: 「愿意收推广邮件，这个改成默认勾选吧」).
 *
 * Ticked by default — except where the law says a pre-ticked box is not
 * consent at all: the EU/EEA and the UK (GDPR + ePrivacy; the CJEU's Planet49
 * ruling is exactly this box), Switzerland, Canada (CASL) and Korea (정보통신망법
 * requires a separate, affirmative opt-in). There the box starts empty, as before.
 * Taiwan, Hong Kong, Japan, the US and the rest start ticked; the reader can
 * untick it, and every such mail carries a one-click unsubscribe.
 *
 * Where we are unsure of a reader's country we look at the device clock and
 * the country the edge saw; if either names one of these places, the box
 * starts empty. Erring toward empty is the safe side.
 */
const OPT_IN_ONLY = new Set([
  // EU
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  // EEA + UK + CH
  "IS", "LI", "NO", "GB", "CH",
  // Canada, Korea
  "CA", "KR",
]);

export function marketingBoxStartsTicked(...countries: (string | null | undefined)[]): boolean {
  return !countries.some((c) => c && OPT_IN_ONLY.has(c.toUpperCase()));
}
