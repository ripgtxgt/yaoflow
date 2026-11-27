import { NextRequest, NextResponse } from "next/server";
import { record } from "@/lib/analytics-server";
import { recordOps } from "@/lib/db";
import { keepPhoto } from "@/lib/qian-photo-store";
import { describeMatch, normaliseSlip, readSlipPhoto, templeFromPrint, type SlipMatch } from "@/lib/qian-photo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** a phone photo, shrunk in the browser to ≤1400 px JPEG and under 900 KB (nginx refuses bodies over 1 MB on this site) */
const MAX_CHARS = 1_000_000;
const PER_IP = 8;          // per 10 minutes
const PER_DAY = 600;       // whole site — a ceiling on what a scripted flood could cost

const HITS = new Map<string, number[]>();
let day = "";
let dayCount = 0;
function limited(ip: string): "ip" | "day" | null {
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  if (today !== day) { day = today; dayCount = 0; }
  if (dayCount >= PER_DAY) return "day";
  const list = (HITS.get(ip) ?? []).filter((t) => now - t < 600_000);
  if (list.length >= PER_IP) return "ip";
  list.push(now);
  HITS.set(ip, list);
  if (HITS.size > 4000) HITS.clear();
  dayCount++;
  return null;
}

/**
 * 10-13 拍照认籤: POST { image: "data:image/jpeg;base64,…" } → which lot it is. The photo goes to the vision model to be
 * transcribed and is then dropped: it is not written to disk, the database or any log. What we keep is one event
 * saying how the recognition went (one / some / none / not a slip / failed).
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const lim = limited(ip);
  if (lim) return NextResponse.json({ error: lim === "day" ? "busy" : "rate_limited" }, { status: 429 });
  let body: { image?: unknown };
  try { body = (await req.json()) as typeof body; } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const image = typeof body.image === "string" ? body.image : "";
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]/.test(image) || image.length > MAX_CHARS || image.length < 2000) {
    return NextResponse.json({ error: "bad_image" }, { status: 400 });
  }
  const t0 = Date.now();
  // 10-14: the fast read as it is, then — if that names no lot — the photo turned both ways by the stronger model
  const { best, tries } = await readSlipPhoto(image);
  const reading = best?.reading ?? null;
  const ms = Date.now() - t0;
  const note = (method: string) => {
    record({ t: Date.now(), e: "qian_photo", s: `photo-${Date.now().toString(36)}`, locale: "zh-hant", method, path: "/jieqian", c: "jieqian" });
    recordOps("qian_photo", `${method} ${ms}ms ${reading?.model?.split("/")[1] ?? "-"} rot${best?.rot ?? "-"} tries${tries}`);
  };
  // 10-14: the photos we could not name are kept 30 days (lib/qian-photo-store.ts) — tied to nothing but this reading
  const keep = (kind: string, extra: { number?: number | null; temple?: string; text?: string; top?: string } = {}) => {
    try { keepPhoto(image, { kind, number: extra.number ?? null, temple: extra.temple ?? "", text: extra.text ?? "", top: extra.top ?? "", model: reading?.model ?? null, ms }); }
    catch (e) { recordOps("qian_photo_keep", `failed ${e instanceof Error ? e.message.slice(0, 80) : "?"}`); }
  };
  if (!reading) { note("fail"); keep("fail"); return NextResponse.json({ error: "read_failed" }, { status: 502 }); }
  if (!reading.isSlip) { note("notslip"); return NextResponse.json({ kind: "notslip" }); }
  const found = best!.found;
  const v = best!.verdict;
  note(v.kind);
  // 10-14: when we could not name one lot, keep what the slip SAID (its printed characters only — never the photo), so the
  // misses can be studied: a wording we lack, a set we do not hold, or a bad reading
  if (v.kind !== "one") keep(v.kind, { number: reading.number, temple: normaliseSlip(reading.temple).slice(0, 20), text: reading.text.slice(0, 600), top: found.slice(0, 3).map((m) => `${m.set}#${m.num}:${m.score}`).join(", ") });
  if (v.kind !== "one") recordOps("qian_photo_read", `${v.kind} n=${reading.number ?? "-"} t=${normaliseSlip(reading.temple).slice(0, 12) || "-"} top=${found.slice(0, 2).map((m) => `${m.set}#${m.num}:${m.score}`).join(",") || "-"} | ${normaliseSlip(reading.text).slice(0, 90)}`);
  const withTemple = (m: SlipMatch) => describeMatch({ ...m, temple: templeFromPrint(reading.temple, m.set) });
  if (v.kind === "one") return NextResponse.json({ kind: "one", matches: [withTemple(v.match)], number: reading.number });
  if (v.kind === "some") return NextResponse.json({ kind: "some", matches: v.matches.map(withTemple), number: reading.number });
  return NextResponse.json({ kind: "none", number: reading.number });
}
