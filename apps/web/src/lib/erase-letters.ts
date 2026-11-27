import { customerEmailById, customerLocaleById, db, recordOps } from "./db";
import { buildNoticeEmail, sendEmail } from "./email";
import type { Locale } from "./locales";

/**
 * 10-23 进度表 111 ③ 删除帐号: an account is deleted by hand from the admin (隐私政策 §4 删除权), when the reader asks.
 * Two letters: before — what will go, what stays (the accounting record without their address), that it cannot be
 * undone, and that a reply 「確定刪除」 is what it takes; after — that it is done, and that this is the last letter.
 * The second one leaves no trace either: its mail_log row is removed once it is sent (the deletion took the rest).
 * Written in 繁體, 简体 or English (the account's language; the other languages read the English one).
 */

type Lang = "zh-hant" | "zh" | "en";
const T: Record<Lang, { confirm: { subject: string; title: string; paras: string[] }; done: { subject: string; title: string; paras: string[] } }> = {
  "zh-hant": {
    confirm: {
      subject: "刪除帳號前的確認 · YaoFlow", title: "要刪除你的帳號嗎？",
      paras: [
        "我們收到刪除帳號的要求。刪除後，這些會一併清除：你的卦和解讀、追問、回訪與應期提醒、生辰檔案與命盤報告、存下來的卦、登入紀錄，以及我們寄給你的信件紀錄。",
        "付款紀錄會保留金額、日期和 Stripe 編號（記帳需要），但不再連到你的信箱。",
        "刪除後無法恢復，解讀的連結也會打不開。還有生效中的會員的話，要先關掉續訂、等這一期結束。",
        "確定要刪的話，直接回這封信說「確定刪除」就好；如果不是你提出的，或改變主意了，不用理會這封信。",
      ],
    },
    done: {
      subject: "帳號已刪除 · YaoFlow", title: "你的帳號已經刪除",
      paras: ["你在 YaoFlow 的帳號和相關資料已經刪除。", "付款紀錄只保留記帳需要的金額、日期和 Stripe 編號，不再連到你。", "這是我們寄給你的最後一封信。謝謝你來過。"],
    },
  },
  zh: {
    confirm: {
      subject: "删除帐号前的确认 · YaoFlow", title: "要删除你的帐号吗？",
      paras: [
        "我们收到删除帐号的要求。删除后，这些会一并清除：你的卦和解读、追问、回访与应期提醒、生辰档案与命盘报告、存下来的卦、登录记录，以及我们寄给你的邮件记录。",
        "付款记录会保留金额、日期和 Stripe 编号（记账需要），但不再关联你的邮箱。",
        "删除后无法恢复，解读的链接也会打不开。还有生效中的会员的话，要先关掉续费、等这一期结束。",
        "确定要删的话，直接回这封信说「确定删除」就好；如果不是你提出的，或改变主意了，不用理会这封信。",
      ],
    },
    done: {
      subject: "帐号已删除 · YaoFlow", title: "你的帐号已经删除",
      paras: ["你在 YaoFlow 的帐号和相关数据已经删除。", "付款记录只保留记账需要的金额、日期和 Stripe 编号，不再关联你。", "这是我们寄给你的最后一封信。谢谢你来过。"],
    },
  },
  en: {
    confirm: {
      subject: "Before we delete your account · YaoFlow", title: "Delete your account?",
      paras: [
        "We've been asked to delete your account. Deleting it removes your casts and readings, follow-up questions, check-in letters and timing reminders, saved birth details and chart reports, saved casts, sign-in records, and the record of emails we sent you.",
        "Payment records keep the amount, date and Stripe reference (we must keep accounts), but no longer point to your address.",
        "It can't be undone, and reading links will stop working. If a membership is still running, its renewal must be turned off and the period ended first.",
        "If you're sure, just reply to this email with “delete it”. If you didn't ask for this, or have changed your mind, you can ignore this email.",
      ],
    },
    done: {
      subject: "Your account has been deleted · YaoFlow", title: "Your account has been deleted",
      paras: ["Your YaoFlow account and the data that went with it have been deleted.", "Payment records keep only the amount, date and Stripe reference our accounts need, and no longer point to you.", "This is the last email we'll send you. Thank you for coming by."],
    },
  },
};

const lang = (l: string | null | undefined): Lang => (l === "zh" ? "zh" : l === "zh-hant" ? "zh-hant" : "en");

export function buildEraseEmail(step: "confirm" | "done", locale: string | null | undefined): { subject: string; html: string; text: string } {
  const L = lang(locale);
  const t = T[L][step];
  return buildNoticeEmail({ locale: L as Locale, subject: t.subject, title: t.title, paras: t.paras, reply: null });
}

/** before: the letter that asks them to confirm (sent from the customer's admin page) */
export async function sendEraseConfirm(customerId: number): Promise<{ ok: boolean; error?: string }> {
  const email = customerEmailById(customerId);
  if (!email) return { ok: false, error: "no_email" };
  const m = buildEraseEmail("confirm", customerLocaleById(customerId));
  const r = await sendEmail(email, m.subject, m.html, m.text, { kind: "erase", customerId });
  recordOps("erase_letter", `#${customerId} confirm ${r.ok ? "sent" : "failed"}`);
  return r.ok ? { ok: true } : { ok: false, error: r.error ?? "send_failed" };
}

/** after: done — to the address captured before the deletion; its own log row goes too */
export async function sendErased(email: string, locale: string | null): Promise<boolean> {
  const m = buildEraseEmail("done", locale);
  const r = await sendEmail(email, m.subject, m.html, m.text, { kind: "erase" });
  if (r.ok && r.id) { try { db().prepare("DELETE FROM mail_log WHERE id = ?").run(r.id); } catch { /* the log row is all that is left */ } }
  recordOps("erase_letter", `done ${r.ok ? "sent" : "failed"}`);
  return r.ok;
}
