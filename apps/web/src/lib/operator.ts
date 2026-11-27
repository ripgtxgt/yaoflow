/**
 * 经营者 (Neil 09-26): the legal entity behind YaoFlow. Printed at the foot of
 * every email (CAN-SPAM wants a physical postal address on commercial mail;
 * we put it on all of them) and in the terms and privacy policy.
 */
export const OPERATOR_NAME = "Linedo LLC";
export const OPERATOR_ADDRESS = "312 W 2nd St, Unit A919, Casper, Wyoming 82601, USA";
export const OPERATOR_LINE = `YaoFlow · ${OPERATOR_NAME} · ${OPERATOR_ADDRESS}`;

/** Adds the operator line to a built email (html before </body>, text at the end). Idempotent. */
export function withOperatorFooter(html: string, text: string): { html: string; text: string } {
  if (html.includes(OPERATOR_ADDRESS)) return { html, text };
  const foot = `<div style="max-width:560px;margin:0 auto;padding:0 24px 32px;"><p style="font-size:10px;line-height:1.6;color:#9a958c;margin:0;">${OPERATOR_LINE}</p></div>`;
  const i = html.lastIndexOf("</body>");
  const h = i >= 0 ? html.slice(0, i) + foot + "\n" + html.slice(i) : html + foot;
  return { html: h, text: `${text}\n\n${OPERATOR_LINE}` };
}
