import { NextRequest, NextResponse } from "next/server";
import { hkReader } from "@/lib/register";
import { detectRegister } from "@/lib/question-lang";
import { randomBytes } from "node:crypto";
import { createQianDraw, matterById, matterForSession, setQianMatter, upsertCustomer } from "@/lib/db";
import { EMAIL_RE } from "@/lib/auth";
import { markCustomer } from "@/lib/browsers";
import { customerFromRequest } from "@/lib/auth";
import { deviceFor, keepDevice } from "@/lib/device";
import { record } from "@/lib/analytics-server";
import { isQianSituation, isTemple, QIAN_LOCALE, qianResultPath, qianSet, situationsFor, templesFor } from "@/lib/qian-meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HITS = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now();
  const list = (HITS.get(ip) ?? []).filter((t) => now - t < 600_000);
  list.push(now);
  HITS.set(ip, list);
  if (HITS.size > 4000) HITS.clear();
  return list.length > 20;
}

/**
 * 10-12 解籤 (进度表 §四 36): a reader submits the lot they drew — number, temple, situation, one question. The draw is
 * kept (so the cast that follows can carry it and land in the same matter) and the result page is its own URL, which
 * holds a token and never the question.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (limited(ip)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  let body: { num?: unknown; temple?: unknown; situation?: unknown; question?: unknown; set?: unknown; email?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  // 10-12 籤系: absent or unknown = 六十甲子籤 (every client before this sent no set)
  const set = qianSet(typeof body.set === "string" ? body.set : null);
  const num = Number(body.num);
  if (!Number.isInteger(num) || num < 1 || num > set.count) return NextResponse.json({ error: "bad_num" }, { status: 400 });
  const temple = isTemple(body.temple) && templesFor(set.id).some((t) => t.id === body.temple) ? body.temple : null;
  const situation = isQianSituation(body.situation) && situationsFor(set.id).some((s) => s.id === body.situation) ? body.situation : null; // 10-12 月老: love only
  if (!situation) return NextResponse.json({ error: "bad_situation" }, { status: 400 });
  const question = typeof body.question === "string" ? body.question.replace(/\s+/g, " ").trim() : "";
  if (question.length < 2) return NextResponse.json({ error: "question_required" }, { status: 400 });
  const token = randomBytes(12).toString("hex");
  const dev = deviceFor(req);
  const me = customerFromRequest(req);
  // 10-13 (Neil: 「为什么解签还会有匿名？」→ 提交时必须留邮箱「要」): everyone not signed in leaves an address — the lot is
  // filed under that customer, and the paid reading is sent there
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 200) : "";
  if (!me && !EMAIL_RE.test(email)) return NextResponse.json({ error: "email_required" }, { status: 400 });
  const customerId = me?.customerId ?? upsertCustomer(email, QIAN_LOCALE);
  // 10-12 读者识别: the wording this reader is written to — Cantonese if they asked in it, Hong Kong written Chinese for a
  // Hong Kong / Macau reader, else Taiwan's (only the register is kept, never the country)
  const register = detectRegister(question) === "yue" ? "yue" : hkReader(req.headers) ? "hk" : null;
  createQianDraw({ token, setName: set.id, num, temple, situation, question, locale: QIAN_LOCALE, device: dev.id, customerId, register, email: me?.email ?? email });
  // 10-12 承接 ⑨ 卦→籤: added from a full reading (its session) or from the owner's matter page — the lot joins that matter
  const b = body as { from?: unknown; matter?: unknown };
  let joined: string | null = null;
  try {
    if (typeof b.from === "string" && /^[A-Za-z0-9_-]{8,120}$/.test(b.from)) {
      const mid = matterForSession(b.from);
      if (mid) { setQianMatter(token, mid); joined = "reading"; }
    } else if (typeof b.matter === "number" && me) {
      const mt = matterById(b.matter);
      if (mt && mt.customer_id === me.customerId) { setQianMatter(token, mt.id); joined = "matter"; }
    }
  } catch { /* the draw stands on its own */ }
  record({ t: Date.now(), e: "qian_draw", s: token.slice(-12), locale: QIAN_LOCALE, method: `${num}:${situation}${joined ? `:${joined}` : ""}`, path: "/jieqian" });
  const res = keepDevice(NextResponse.json({ url: qianResultPath(token), token }), dev);
  return me ? res : markCustomer(req, res, customerId, "qian_email");
}
