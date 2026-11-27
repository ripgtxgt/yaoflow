/**
 * 09-29 补发回礼 (Neil: 「除去那些个自己互赠的，其他有效分享都全部补上深断次数」).
 * The shares that worked before the thank-you existed, each made good with one
 * full reading (a 30-day rw_ link, the same as today's thank-you). The list is
 * fixed by hand from the 09-29 audit (裂变体系完整版 §七): gifts claimed by a
 * real friend and share-code newcomers whose code has one owner. Left out: the
 * #678 ↔ #680 exchange; held for Neil: #678→#860, #680→#866, code 888787 (two owners).
 * Idempotent (via backfill:<thread>:<grant id>). Writes the list to --out.
 *   cd apps/web && npx tsx --tsconfig tsconfig.json ../../scripts/backfill-share-rewards.ts [--dry] --out=/tmp/rewards.json
 */
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { db, createReferral, customerEmailById, customerLocaleById, recordOps } from "../apps/web/src/lib/db";

type Row = { grant: number; thread: "gift" | "share"; sharer: number; friend: number | null };
const LIST: Row[] = [
  { grant: 21, thread: "gift", sharer: 170, friend: 559 },
  { grant: 27, thread: "gift", sharer: 95, friend: 959 },
  { grant: 29, thread: "gift", sharer: 129, friend: null },
  { grant: 60, thread: "gift", sharer: 580, friend: 617 },
  { grant: 61, thread: "gift", sharer: 619, friend: 622 },
  { grant: 65, thread: "gift", sharer: 625, friend: 637 },
  { grant: 67, thread: "gift", sharer: 648, friend: 649 },
  { grant: 99, thread: "gift", sharer: 732, friend: 735 },
  { grant: 22, thread: "share", sharer: 291, friend: 343 },
  { grant: 63, thread: "share", sharer: 622, friend: null },
  { grant: 94, thread: "share", sharer: 622, friend: 723 },
  { grant: 161, thread: "share", sharer: 622, friend: 814 },
  { grant: 95, thread: "share", sharer: 674, friend: 726 },
  { grant: 178, thread: "share", sharer: 759, friend: 465 },
  { grant: 34, thread: "share", sharer: 170, friend: null },
  { grant: 70, thread: "share", sharer: 112, friend: null },
  { grant: 76, thread: "share", sharer: 95, friend: null },
];
const DAYS = 30;
const dry = process.argv.includes("--dry");
const out = (process.argv.find((a) => a.startsWith("--out=")) ?? "--out=/tmp/share-rewards.json").slice(6);
const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");

const people = new Map<number, { customer: number; email: string | null; locale: string; items: { grant: number; thread: string; friend: number | null; at: number; link: string }[] }>();
let made = 0, had = 0;
for (const r of LIST) {
  const g = db().prepare("SELECT used_at, redeem_session_id FROM grants WHERE id = ?").get(r.grant) as { used_at: number | null; redeem_session_id: string | null } | undefined;
  if (!g?.used_at) { console.log("skip (not used)", r.grant); continue; }
  const via = `backfill:${r.thread}:${r.grant}`;
  const existing = db().prepare("SELECT token FROM referrals WHERE via = ?").get(via) as { token: string } | undefined;
  const locale = customerLocaleById(r.sharer) ?? "zh-hant";
  let token = existing?.token ?? null;
  if (token) had++;
  else if (!dry) {
    token = randomBytes(18).toString("hex");
    const ok = createReferral({ via, referrerCustomerId: r.sharer, referredCustomerId: r.friend, referredSessionId: g.redeem_session_id ?? `grant:${r.grant}`, token, expiresAt: Date.now() + DAYS * 86_400_000, locale });
    if (!ok) { console.log("insert failed", via); token = null; } else made++;
  }
  const p = people.get(r.sharer) ?? { customer: r.sharer, email: customerEmailById(r.sharer), locale, items: [] };
  p.items.push({ grant: r.grant, thread: r.thread, friend: r.friend, at: g.used_at, link: token ? `${site}/${locale}/cast?reward=${token}` : "(dry)" });
  people.set(r.sharer, p);
}
writeFileSync(out, JSON.stringify([...people.values()], null, 2));
const msg = `people=${people.size} rewards=${LIST.length} made=${made} existing=${had}${dry ? " (dry)" : ""}`;
console.log(msg, "→", out);
if (!dry) recordOps("share_backfill", msg);
