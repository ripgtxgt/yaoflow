import type { NextRequest } from "next/server";
import { customerFromRequest } from "./auth";
import { can, rightsFor } from "./entitlements";

/**
 * 10-25 (Neil: 「我刚用无痕浏览器试了一下八字，没有登录，为什么会有解读？解读必须要有付费」): the plain reading of a chart
 * (八字／紫微／星盤「看懂這張盤」) is for a signed-in 通卡 or membership holder; the chart itself only needs signing in.
 */
export async function chartReader(req: NextRequest): Promise<{ signedIn: boolean; covered: boolean }> {
  const me = customerFromRequest(req);
  if (!me) return { signedIn: false, covered: false };
  const r = await rightsFor(me.customerId);
  return { signedIn: true, covered: can(r, "chart_qa") };
}
