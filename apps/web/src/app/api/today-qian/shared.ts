import type { NextRequest } from "next/server";
import { bidOf } from "@/lib/browsers";
import { customerFromRequest } from "@/lib/auth";
import { hkReader } from "@/lib/register";
import { accessOf, adoptBrowser, lotToHans, lotView, sectionFor, subjectOf, type Access, type Draw, type LotView } from "@/lib/today-qian";

/** 10-14 进度表 50: who is asking (account, else browser) and what they may see. */
export function who(req: NextRequest): { cid: number | null; bid: string | null; subject: string | null; access: Access; hk: boolean } {
  const me = customerFromRequest(req);
  const bid = bidOf(req);
  if (me) adoptBrowser(me.customerId, bid);
  return { cid: me?.customerId ?? null, bid, subject: subjectOf(me?.customerId, bid), access: accessOf(me?.customerId), hk: hkReader(req.headers) };
}

export function viewFor(d: Draw, w: { cid: number | null; bid: string | null; access: Access; hk: boolean }, locale: string = "zh-hant"): LotView | null {
  const v = lotView(d, { full: !!w.access, section: sectionFor(w.cid, w.bid), hk: w.hk && locale !== "zh" });
  return v && locale === "zh" ? lotToHans(v) : v;
}
