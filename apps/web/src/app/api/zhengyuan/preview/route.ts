import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE } from "@/lib/admin-auth";
import { featureVisible } from "@/lib/features";
import { birthFromBody, factsFromBirth } from "@/lib/mingli/bazi/report";
import { toHant } from "@/lib/hant";
import { isLocale } from "@/lib/locales";
import { isForeign } from "@/lib/l10n/core";
import { serviceOpenIn } from "@/lib/services";
import { zhengyuanIn } from "@/lib/mingli/bazi/zhengyuan-in";

export const runtime = "nodejs";

/**
 * 10-26 正緣畫像 product page, the free taste: from the birth input, the first trait of the portrait (氣韻意象 — what TA
 * feels like) in the page's script. Rules only (zhengyuan.ts), no model call; nothing is stored.
 *   POST {input, gender, partner?: "same", locale} → {text, element} · 400 {error: "bad_birth", field} · 404 {error: "off"}
 * 10-30 进度表 128 ④: a page in another language gets the same trait from the portrait's copy in that language.
 */
export async function POST(req: NextRequest) {
  if (!(await featureVisible("zhengyuan", req.cookies.get(ADMIN_COOKIE)?.value))) return NextResponse.json({ error: "off" }, { status: 404 });
  let body: { input?: unknown; gender?: unknown; partner?: unknown; locale?: unknown };
  try { body = (await req.json()) as typeof body; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const birth = birthFromBody(body.input, body.gender);
  if ("error" in birth) return NextResponse.json({ error: "bad_birth", field: birth.error }, { status: 400 });
  const partner = body.partner === "same" ? birth.gender : undefined;
  let f;
  try { f = factsFromBirth(birth.n, birth.gender, "love", Date.now(), undefined, { partner }); } catch { return NextResponse.json({ error: "bad_birth", field: "chart" }, { status: 400 }); }
  const z = f.zhengyuan;
  const t = z?.traits.find((x) => x.key === "qiyun");
  if (!z || !t) return NextResponse.json({ error: "bad_birth", field: "chart" }, { status: 400 });
  const l = typeof body.locale === "string" && isLocale(body.locale) ? body.locale : "zh-hant";
  if (isForeign(l) && serviceOpenIn("zhengyuan", l)) {
    const zy = zhengyuanIn({ pillars: f.pillars.map((p) => p.gz), gender: birth.gender, partner: z.partner }, l);
    return NextResponse.json({ text: zy.texts.qiyun, element: z.star.element }, { headers: { "Cache-Control": "no-store" } });
  }
  const hans = l === "zh";
  return NextResponse.json({ text: hans ? t.text : toHant(t.text), element: z.star.element }, { headers: { "Cache-Control": "no-store" } });
}
