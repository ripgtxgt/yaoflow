import { NextRequest, NextResponse } from "next/server";
import { customerFromRequest } from "@/lib/auth";
import { castOwnerMatter, matterById, recordOps, setMatterNoContext, setMatterTitle } from "@/lib/db";
import { moveCast } from "@/lib/matter-move";
import { splitCastOff, unsplitCast } from "@/lib/reread";

export const runtime = "nodejs";

/**
 * 09-29 「一件事」: the reader tidies their own matters — rename one, or move a
 * cast that was filed under the wrong matter (to another of theirs, or out into
 * a new one). Signed-in owner only; plain form posts, back to the page.
 */
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const action = String(form.get("action") ?? "");
  const rawBack = String(form.get("back") ?? "");
  const origin = (process.env.SITE_URL ?? req.nextUrl.origin).replace(/\/$/, "");
  // 10-22 分開: the reading page posts here too, back to itself
  const readingBack = /^\/[a-z-]+\/reading\?sid=[\w-]+$/.test(rawBack);
  let back = /^\/[a-z-]+\/matter\/\d+(\?sid=[\w-]+)?$/.test(rawBack) || readingBack ? rawBack : "/";

  if (action === "split") {
    // 10-22 分開 (lib/reread.ts): 「不是同一件事」 on the reading page — the reading link itself is the key, signed in or not
    const sid = String(form.get("sid") ?? "");
    if (!/^[\w-]{8,120}$/.test(sid)) return NextResponse.json({ error: "bad_sid" }, { status: 400 });
    const r = splitCastOff(sid);
    if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const to = new URL(readingBack ? back : `/${String(form.get("locale") ?? "zh-hant").replace(/[^a-z-]/g, "") || "zh-hant"}/reading?sid=${sid}`, origin);
    to.searchParams.set("split", r.rereadOk ? "reread" : "1");
    to.hash = "matter";
    return NextResponse.redirect(to, { status: 303 });
  }
  if (action === "unsplit") {
    // 10-23 进度表 98: 「分錯了？合併回去」 — the same key as the split: the reading link, signed in or not
    const sid = String(form.get("sid") ?? "");
    if (!/^[\w-]{8,120}$/.test(sid)) return NextResponse.json({ error: "bad_sid" }, { status: 400 });
    const r = unsplitCast(sid);
    if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const to = new URL(readingBack ? back : `/${String(form.get("locale") ?? "zh-hant").replace(/[^a-z-]/g, "") || "zh-hant"}/reading?sid=${sid}`, origin);
    to.searchParams.set("merged", r.ok ? "1" : r.why);
    to.hash = "matter";
    return NextResponse.redirect(to, { status: 303 });
  }

  const me = customerFromRequest(req);
  if (!me) return NextResponse.json({ error: "sign_in" }, { status: 401 });

  if (action === "rename") {
    const id = Number(form.get("id"));
    const title = String(form.get("title") ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
    const m = Number.isInteger(id) ? matterById(id) : null;
    if (!m || m.customer_id !== me.customerId) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (title.length >= 1) {
      setMatterTitle(id, title, "reader");
      recordOps("matter_rename", `${me.customerId} #${id}`);
    }
  } else if (action === "context") {
    // 10-04 进度表 30: "don't look at this matter's earlier record when reading" — the reader's own switch
    const id = Number(form.get("id"));
    const off = String(form.get("off") ?? "") === "1";
    if (!Number.isInteger(id) || !setMatterNoContext(id, me.customerId, off)) return NextResponse.json({ error: "not_found" }, { status: 404 });
    recordOps("matter_context", `${me.customerId} #${id} ${off ? "off" : "on"}`);
  } else if (action === "move") {
    const castId = Number(form.get("cast"));
    const toRaw = String(form.get("to") ?? "");
    const cur = Number.isInteger(castId) ? castOwnerMatter(castId) : null;
    if (!cur || cur.customer_id !== me.customerId) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const target = toRaw === "new" ? null : Number(toRaw);
    if (target !== null && !Number.isInteger(target)) return NextResponse.json({ error: "bad_target" }, { status: 400 });
    const to = moveCast(castId, target, me.customerId, null, "reader");
    if (to === null) return NextResponse.json({ error: "not_found" }, { status: 404 });
    // the matter we came from may be gone now (its only cast left): land on where the cast went
    if (cur.matter_id && !matterById(cur.matter_id)) back = back.replace(/\/matter\/\d+/, `/matter/${to}`);
  } else {
    return NextResponse.json({ error: "bad_action" }, { status: 400 });
  }
  return NextResponse.redirect(new URL(back, origin), { status: 303 });
}
