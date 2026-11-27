import { db, emailAlreadySent, recordEmail, recordOps } from "./db";
import { unsubUrl as unsubLink } from "./unsub";
import { formatMoney } from "./money";

/**
 * 10-22 进度表 38 (Neil: 併入年書) — the one letter to the 「2027 年卦」 waitlist: the product they signed up for became the
 * 三合一年書, on sale for 2027 from 11/1 at the early-bird price until 1/31. Sent once per address, only when the owner
 * presses the button on /admin/waitlist (a group letter is never sent on its own — Neil approves each one); the letter
 * carries the one-click unsubscribe the launch letters carry.
 */
const KIND_WORD: Record<string, string> = { love: "感情", work: "工作", money: "錢", other: "" };
const PAPER = "#f4f2ec", INK = "#14151c", INK_86 = "rgba(20,21,28,0.86)", INK_66 = "rgba(20,21,28,0.66)", INK_50 = "rgba(20,21,28,0.5)", GOLD = "#8a6c2c", RULE = "rgba(20,21,28,0.14)";
const FONT = "'Noto Serif TC','Songti TC','PingFang TC',serif";
const BTN = `display:inline-block;padding:12px 24px;border-radius:2px;background:${INK};color:${PAPER};text-decoration:none;font-size:14px;letter-spacing:.08em;`;
const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]!));

export function buildWaitlistLetter(i: { email: string; kind: string }, site: string): { subject: string; html: string; text: string; unsubUrl: string } {
  const unsubUrl = unsubLink(site, i.email, "zh-hant");
  const url = `${site}/zh-hant/nianshu?c=waitlist-letter`;
  const early = formatMoney("TWD", 89000, "zh-hant"), regular = formatMoney("TWD", 119000, "zh-hant");
  const matter = KIND_WORD[i.kind] ? `你留的是${KIND_WORD[i.kind]}的事——` : "";
  const p1 = "你在 YaoFlow 留過信箱，想看 2027 年這件事的年卦。我們把它做成更完整的一本：三合一年書——八字、紫微、星盤三套合看 2027 年，總覽、四季、各領域，標出關鍵的月份和要放慢的時段。";
  const p2 = `${matter}買的時候可以把那件事寫進去，年書裡會專門回答。`;
  const p3 = `國曆 11/1 起賣 2027 年，早鳥價 ${early}（原價 ${regular}），到 1/31；買了年書，關鍵月到了會寄一封信提醒你。`;
  const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${PAPER};color:${INK};font-family:${FONT};"><div style="max-width:560px;margin:0 auto;padding:40px 24px 36px;">
<p style="letter-spacing:.35em;font-size:12px;color:${INK_50};margin:0 0 6px;">YAOFLOW</p>
<p style="font-size:13px;color:${INK_66};margin:0 0 10px;">2027 年卦 · 預約名單</p>
<p style="font-size:24px;line-height:1.35;margin:0;color:${INK};">你預約的年卦，變成了一本年書</p>
<p style="font-size:15px;line-height:1.9;margin:24px 0 0;color:${INK_86};">${esc(p1)}</p>
<p style="font-size:15px;line-height:1.9;margin:14px 0 0;color:${INK_86};">${esc(p2)}</p>
<p style="font-size:12px;letter-spacing:.2em;color:${GOLD};margin:26px 0 8px;">早鳥</p>
<p style="font-size:15px;line-height:1.9;margin:0;color:${INK_86};">${esc(p3)}</p>
<p style="margin:28px 0 22px;"><a href="${esc(url)}" style="${BTN}">看三合一年書</a></p>
<hr style="border:none;border-top:1px solid ${RULE};margin:8px 0 14px;">
<p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">這是你預約時說好的那一封通知；之後不會再為這件事寄信。 <a href="${esc(unsubUrl)}" style="color:${INK_50};">不想收到 YaoFlow 的信</a></p>
</div></body></html>`;
  const text = ["你預約的年卦，變成了一本年書", "", p1, "", p2, "", p3, "", `看三合一年書: ${url}`, "", `不想收到 YaoFlow 的信: ${unsubUrl}`].join("\n");
  return { subject: "你預約的 2027 年卦，變成了三合一年書：11/1 起賣，早鳥到 1/31", html, text, unsubUrl };
}

/** send to everyone on the list who has not had it; returns the counts (the owner's button) */
export async function sendWaitlistLetter(site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, ""), max = 200): Promise<{ sent: number; failed: number; skipped: number }> {
  const out = { sent: 0, failed: 0, skipped: 0 };
  const rows = db().prepare("SELECT email, kind FROM year_waitlist ORDER BY created_at").all() as { email: string; kind: string }[];
  const { sendEmail } = await import("./email");
  let n = 0;
  for (const r of rows) {
    if (n >= max) break;
    const key = `wl:${r.email.toLowerCase()}`;
    if (emailAlreadySent(key, "waitlist_letter")) { out.skipped++; continue; }
    n++;
    const m = buildWaitlistLetter(r, site);
    recordEmail(key, "waitlist_letter", r.email, "pending");
    const res = await sendEmail(r.email, m.subject, m.html, m.text, { kind: "launch", locale: "zh-hant", unsubUrl: m.unsubUrl });
    recordEmail(key, "waitlist_letter", r.email, res.ok ? "sent" : "failed", res.error ?? res.id);
    if (res.ok) out.sent++; else out.failed++;
  }
  recordOps("waitlist_letter_run", JSON.stringify(out));
  return out;
}
