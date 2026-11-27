/**
 * 09-29 推荐系统上线信 + 补发回礼说明信 (Neil: 「先发给我看，我看了再发」).
 *
 * Nothing goes out without --send=… --yes. Previews are the exact HTML that
 * would be sent.
 *   cd apps/web && npx tsx --tsconfig tsconfig.json ../../scripts/referral-mails.ts --preview --out=/tmp/mail-preview
 *   … --send=backfill --yes         (the 13 in /home/ubuntu/share-rewards-0929.json)
 *   … --send=launch --yes [--limit=90]  (marketing consent + active members, once each)
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { db, emailAlreadySent, recordEmail, recordOps } from "../apps/web/src/lib/db";
import { sendEmail } from "../apps/web/src/lib/email";
import { unsubUrl } from "../apps/web/src/lib/unsub";

const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=").slice(1).join("=") ?? null;
const OUT = arg("out") ?? "/tmp/mail-preview";
const LIST = arg("list") ?? "/home/ubuntu/share-rewards-0929.json";

const PAPER = "#f4f2ec", INK = "#14151c", INK_86 = "#333439", INK_66 = "#606063", INK_50 = "#7a7a7c", RULE = "#d0cfcb";
const FONT = "Georgia,'Songti SC','Noto Serif TC','Noto Serif SC',serif";
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const FOOT: Record<string, string> = {
  "zh-hant": "YaoFlow 是文化反思體驗，不構成醫療、法律、財務或心理建議。",
  zh: "YaoFlow 是文化反思体验，不构成医疗、法律、财务或心理建议。",
  en: "YaoFlow is a cultural reflection experience — not medical, legal, financial, or mental-health advice.",
};

function letter(lang: string, parts: { lead: string; blocks: string[]; buttons: { label: string; url: string }[]; after: string[]; unsub?: string | null }): string {
  const btns = parts.buttons.map((b, i) => `<p style="margin:0 0 10px;"><a href="${esc(b.url)}" style="display:inline-block;${i === 0 ? `background:${INK};color:${PAPER};` : `border:1px solid ${INK};color:${INK};`}text-decoration:none;padding:12px 26px;border-radius:2px;font-size:14px;">${esc(b.label)}</a></p>`).join("");
  return `<!doctype html><html lang="${lang === "zh-hant" ? "zh-Hant" : lang === "zh" ? "zh-Hans" : "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:${PAPER};color:${INK};font-family:${FONT};">
  <div style="max-width:560px;margin:0 auto;padding:44px 24px 40px;">
    <p style="letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:${INK_50};margin:0 0 32px;">YaoFlow</p>
    <p style="font-size:20px;line-height:1.6;margin:0 0 18px;color:${INK};">${parts.lead}</p>
    ${parts.blocks.map((b) => `<p style="font-size:15px;line-height:1.85;margin:0 0 14px;color:${INK_86};">${b}</p>`).join("")}
    <div style="margin:24px 0 24px;">${btns}</div>
    ${parts.after.map((a) => `<p style="font-size:13px;line-height:1.75;margin:0 0 8px;color:${INK_66};">${a}</p>`).join("")}
    <hr style="border:none;border-top:1px solid ${RULE};margin:24px 0 14px;">
    ${parts.unsub ? `<p style="font-size:11px;line-height:1.6;margin:0 0 6px;"><a href="${esc(parts.unsub)}" style="color:${INK_50};">${lang === "en" ? "Unsubscribe" : lang === "zh" ? "退订" : "取消訂閱"}</a></p>` : ""}
    <p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(FOOT[lang] ?? FOOT.en!)}</p>
  </div></body></html>`;
}
const toText = (html: string) => html.replace(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g, "$2: $1").replace(/<br\s*\/?>/g, "\n").replace(/<\/p>/g, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').split("\n").map((l) => l.trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();

/* ---------------- 推荐系统上线信 ---------------- */
const LAUNCH: Record<string, { subject: string; lead: string; blocks: string[]; cta: string; after: string[] }> = {
  "zh-hant": {
    subject: "帶朋友來，一人一份深斷",
    lead: "從今天起，你每帶一位朋友來，就得一份深斷。沒有上限。",
    blocks: [
      "<b>送朋友一卦</b>：你的每份深斷都能送朋友一卦（會員每月另有 5 張）。朋友用它問自己的事，得一份完整深斷。",
      "<b>分享你的卦</b>：在解讀頁點「分享這一卦」，或存成帶 QR 碼的圖片。從你的連結進來的新朋友，第一份深斷免費。",
      "<b>公開一卦</b>：把一卦匿名公開，幫到正為同一件事睡不著的人。每公開一卦也回你一份：會員本月多一次深斷，或換成送朋友一份深斷。",
      "朋友讀完他自己的第一份深斷，我們就寄一份深斷給你，30 天內有效。朋友問了什麼，我們不會告訴任何人，包括你。",
    ],
    cta: "去帶朋友來",
    after: ["同一位朋友只算一次；自己送給自己的不算。"],
  },
  zh: {
    subject: "带朋友来，一人一份深断",
    lead: "从今天起，你每带一位朋友来，就得一份深断。没有上限。",
    blocks: [
      "<b>送朋友一卦</b>：你的每份深断都能送朋友一卦（会员每月另有 5 张）。朋友用它问自己的事，得一份完整深断。",
      "<b>分享你的卦</b>：在解读页点「分享这一卦」，或存成带二维码的图片。从你的链接进来的新朋友，第一份深断免费。",
      "<b>公开一卦</b>：把一卦匿名公开，帮到正为同一件事睡不着的人。每公开一卦也回你一份：会员本月多一次深断，或换成送朋友一份深断。",
      "朋友读完他自己的第一份深断，我们就寄一份深断给你，30 天内有效。朋友问了什么，我们不会告诉任何人，包括你。",
    ],
    cta: "去带朋友来",
    after: ["同一位朋友只算一次；自己送给自己的不算。"],
  },
  en: {
    subject: "Bring a friend, get a full reading",
    lead: "From today, every friend you bring to YaoFlow earns you a full reading. No limit.",
    blocks: [
      "<b>Give a friend a reading</b>: each of your full readings can give one away (members also get 5 a month). Your friend asks about their own matter and gets a complete full reading.",
      "<b>Share your cast</b>: on a reading, tap “Share this cast”, or save it as an image with a QR code. Newcomers who arrive through your link get their first full reading free.",
      "<b>Publish a cast</b>: publish one anonymously to help someone stuck on the same thing. Each one earns you a reading back — one more full reading this month for members, or a full reading to give a friend.",
      "Once your friend has read their own first full reading, we send you a full reading, valid for 30 days. What they asked stays private — we don't tell anyone, you included.",
    ],
    cta: "Bring a friend",
    after: ["Each friend counts once; sending one to yourself doesn't count."],
  },
};

function launchMail(lang: string, email: string | null): { subject: string; html: string; text: string } {
  const c = LAUNCH[lang] ?? LAUNCH.en!;
  const l = LAUNCH[lang] ? lang : "en";
  const html = letter(l, { lead: esc(c.lead), blocks: c.blocks, buttons: [{ label: c.cta, url: `${site}/${l}/account#invite` }], after: c.after.map(esc), unsub: email ? unsubUrl(site, email, l) : `${site}/${l}/unsub` });
  return { subject: c.subject, html, text: toText(html) };
}

/* ---------------- 补发回礼说明信 ---------------- */
type Person = { customer: number; email: string | null; locale: string; items: { grant: number; thread: string; friend: number | null; at: number; link: string }[] };

function backfillMail(p: Person): { subject: string; html: string; text: string } {
  const n = p.items.length;
  const gifts = p.items.filter((i) => i.thread === "gift").length;
  const shares = n - gifts;
  const what = [gifts ? `你送出的卦被朋友領取了 ${gifts} 次` : "", shares ? `你分享的卦帶來了 ${shares} 位新朋友` : ""].filter(Boolean).join("，");
  const html = letter("zh-hant", {
    lead: `謝謝你帶朋友來。這裡補給你 ${n} 份深斷。`,
    blocks: [
      `${what}，${n === 1 ? "他" : "他們"}都讀完了自己的第一份解讀。`,
      "那時「帶朋友來就回禮」還沒有上線，現在補上：這 " + n + " 份深斷是給你的，30 天內有效，問你自己的事。",
      "從今天起也一樣：每帶來一位朋友，就回你一份深斷，沒有上限。朋友問了什麼，我們不會告訴任何人，包括你。",
    ],
    buttons: p.items.map((it, i) => ({ label: n === 1 ? "用這份深斷" : `用第 ${i + 1} 份深斷`, url: it.link })),
    after: [`<a href="${esc(`${site}/zh-hant/account#referrals`)}" style="color:${INK_66};">看我的推薦 →</a>`],
  });
  return { subject: `謝謝你帶朋友來｜補給你 ${n} 份深斷`, html, text: toText(html) };
}

/** 09-29: the live server writes to the same database; wait for its lock instead of dying mid-send (it did, after mail 5). */
async function retry<T>(f: () => T): Promise<T> {
  for (let i = 0; ; i++) {
    try { return f(); } catch (e) {
      if (i >= 20 || !/locked|busy/i.test(e instanceof Error ? e.message : "")) throw e;
      await new Promise((r) => setTimeout(r, 250 * (i + 1)));
    }
  }
}

async function main() {
  try { db().exec("PRAGMA busy_timeout = 10000"); } catch { /* best effort */ }
  const people = JSON.parse(readFileSync(LIST, "utf8")) as Person[];
  if (process.argv.includes("--preview")) {
    mkdirSync(OUT, { recursive: true });
    for (const lang of ["zh-hant", "zh", "en"]) {
      const m = launchMail(lang, null);
      writeFileSync(`${OUT}/launch-${lang}.html`, m.html);
      writeFileSync(`${OUT}/launch-${lang}.txt`, `Subject: ${m.subject}\n\n${m.text}`);
    }
    for (const p of people) {
      const m = backfillMail(p);
      writeFileSync(`${OUT}/backfill-${p.customer}.html`, m.html);
      writeFileSync(`${OUT}/backfill-${p.customer}.txt`, `Subject: ${m.subject}\n\n${m.text}`);
    }
    // the launch audience, counted
    const aud = launchAudience();
    const byLang = aud.reduce<Record<string, number>>((a, r) => { a[r.locale] = (a[r.locale] ?? 0) + 1; return a; }, {});
    writeFileSync(`${OUT}/launch-audience.json`, JSON.stringify(byLang, null, 2));
    console.log(`preview → ${OUT} (launch audience ${aud.length}: ${JSON.stringify(byLang)})`);
    return;
  }
  const which = arg("send");
  if (!which || !process.argv.includes("--yes")) { console.log("nothing sent: pass --preview, or --send=backfill|launch --yes"); return; }
  const limit = Number(arg("limit") ?? 1000);
  let sent = 0, skipped = 0, failed = 0;
  if (which === "backfill") {
    for (const p of people) {
      if (!p.email) { skipped++; continue; }
      const key = `refbf_${p.customer}`;
      if (emailAlreadySent(key, "referral_backfill")) { skipped++; continue; }
      const m = backfillMail(p);
      recordEmail(key, "referral_backfill", p.email, "pending");
      const r = await sendEmail(p.email, m.subject, m.html, m.text, { kind: "reward", sessionId: key, customerId: p.customer, locale: "zh-hant" });
      recordEmail(key, "referral_backfill", p.email, r.ok ? "sent" : "failed", r.error ?? r.id);
      if (r.ok) sent++; else failed++;
    }
  } else if (which === "launch") {
    for (const a of launchAudience()) {
      if (sent >= limit) break;
      const key = `reflaunch_${a.id}`;
      if (await retry(() => emailAlreadySent(key, "referral_launch"))) { skipped++; continue; }
      const m = launchMail(a.locale, a.email);
      await retry(() => recordEmail(key, "referral_launch", a.email, "pending"));
      const r = await sendEmail(a.email, m.subject, m.html, m.text, { kind: "launch", sessionId: key, customerId: a.id, locale: a.locale, unsubUrl: unsubUrl(site, a.email, a.locale) });
      await retry(() => recordEmail(key, "referral_launch", a.email, r.ok ? "sent" : "failed", r.error ?? r.id));
      if (r.ok) sent++; else failed++;
      await new Promise((res) => setTimeout(res, 600)); // gentle on the mail provider
    }
  }
  const msg = `${which}: sent=${sent} skipped=${skipped} failed=${failed}`;
  console.log(msg);
  recordOps("referral_mail", msg);
}

/**
 * Who hears about it. This is commercial mail, so by default only people who said yes to news (marketing_ok = 1).
 * --with-members adds live members who never said yes (the change is to what their membership does) — Neil's call.
 * Never test accounts. An unsubscribe sets marketing_ok = 0, so it is always respected for the default audience.
 */
function launchAudience(): { id: number; email: string; locale: string }[] {
  // 09-29 (Neil: 「目前所有除了自己的邮箱都发一遍」): everyone we have an address for, minus our own accounts,
  // minus anyone who unsubscribed (marketing_ok back to 0 after a yes, or an unsub click — logged masked as
  // "1…@163.com", so every address with that shape is left out), minus addresses that bounced or complained.
  if (process.argv.includes("--all")) {
    const masks = (db().prepare("SELECT detail FROM ops_events WHERE kind = 'unsub'").all() as { detail: string }[])
      .map((r) => r.detail.match(/^(.)…(@.+)$/)).filter(Boolean).map((m) => ({ first: m![1]!.toLowerCase(), domain: m![2]!.toLowerCase() }));
    const bad = new Set((db().prepare("SELECT DISTINCT lower(email) AS e FROM mail_log WHERE bounced_at IS NOT NULL OR complained_at IS NOT NULL").all() as { e: string }[]).map((r) => r.e));
    const rows = db().prepare(
      `SELECT id, lower(email) AS email, CASE WHEN locale IN ('zh','zh-hant') THEN locale ELSE 'en' END AS locale FROM customers
       WHERE COALESCE(test_flag,0) = 0 AND email IS NOT NULL AND email LIKE '%@%' AND email NOT LIKE '%@example.com'
         AND lower(email) NOT LIKE 'ripgt%' AND lower(email) NOT LIKE '%@linedo.io' AND lower(email) NOT LIKE 'neil@%'
         AND NOT (marketing_ok = 0 AND marketing_at IS NOT NULL)
       ORDER BY id`,
    ).all() as { id: number; email: string; locale: string }[];
    return rows.filter((r) => !bad.has(r.email) && !masks.some((m) => r.email.startsWith(m.first) && r.email.endsWith(m.domain)));
  }
  const withMembers = process.argv.includes("--with-members");
  return db().prepare(
    `SELECT id, email, CASE WHEN locale IN ('zh','zh-hant') THEN locale ELSE 'en' END AS locale FROM customers c
     WHERE COALESCE(test_flag,0) = 0 AND email NOT LIKE '%@example.com'
       AND (marketing_ok = 1 ${withMembers ? "OR (marketing_at IS NULL AND EXISTS (SELECT 1 FROM subscriptions s WHERE s.customer_id = c.id AND s.status IN ('active','trialing')))" : ""})
     ORDER BY id`,
  ).all() as { id: number; email: string; locale: string }[];
}

main().catch((e) => { console.error(e); process.exit(1); });
