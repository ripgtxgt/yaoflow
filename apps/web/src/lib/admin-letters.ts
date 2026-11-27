import { db } from "./db";

/**
 * 10-22 进度表 94 第三批 「信件」 — the letters that go out by themselves: the member's daily letter, the month letter,
 * the 大運交接 letter, the 年書 key-month letter and the today's-lot letter — sent, opened, stopped; and every kind of
 * mail in the last 7 and 30 days under its current name (「会员额度刷新」 and 「单月到期提醒」 are gone). Each line opens
 * the letters behind it. Our own test accounts are left out unless asked for (`test`). Server only; read-only.
 */

const DAY = 86_400_000;
const notTestE = (test: boolean) => (test ? "1 = 1" : "(e.email NOT IN (SELECT email FROM customers WHERE test_flag = 1))");
const notTest = (test: boolean) => (test ? "1 = 1" : "(customer_id IS NULL OR customer_id NOT IN (SELECT id FROM customers WHERE test_flag = 1))");
const one = (sql: string, ...a: unknown[]): number => {
  try { return Number((db().prepare(sql).get(...(a as never[])) as { v: number | null } | undefined)?.v ?? 0); } catch { return 0; }
};
const many = <T,>(sql: string, ...a: unknown[]): T[] => {
  try { return db().prepare(sql).all(...(a as never[])) as T[]; } catch { return []; }
};

/** the current name of every mail kind (mail_log.kind) */
export const MAIL_NAME: Record<string, string> = {
  reading: "解读交付", revisit: "应期回访", login: "登录链接", refund: "退款通知", pair: "合参通知", reward: "推荐奖励", launch: "上线邮件",
  digest: "周报", seal: "封卦揭晓", test: "测试", other: "非本站发出", headsup: "应期提醒", dayof: "应期当日",
  sub_welcome: "开通信（会员／通卡）", sub_confirm: "关续订确认", sub_alert: "会员异常（发给我们）", sub_winback: "到期前那封", sub_renew: "年付续费预告",
  sub_recap: "续费前回顾", sub_reset: "额度刷新（10-22 已停）", pass_notice: "通卡到期提醒", sub_perks: "会员权益说明", gift_used: "赠送已被使用",
  daily: "每天寄的信（每日信、流月信、大运交接、年书关键月、今日一籤、每日三卦）", daily_confirm: "每日三卦订阅确认", support: "客服回信",
  pack_offer: "增购包提醒", pack_bought: "增购到账", comp_note: "补偿说明", report_mended: "报告补写完成", hepan: "合盘交付", nianshu: "年书交付", name: "取名／改名参考交付",
  bazi: "八字报告交付", ziwei: "紫微报告交付", astro: "星盘报告交付", tarot: "塔罗交付", qian: "解籤交付", recover: "挽回信",
  zeri: "择日提醒", saved_cast: "存下来的卦（寄给自己）", saved_followup: "存下来的卦 · 之后的提醒",
  support_auto: "客服自动回信", support_manual: "客服手动回信", support_reply: "客服回信", support_comp: "客服补偿信", support_revisit: "客服回访",
  support_forward: "客服转发（发给我们）", support_auto_notice: "客服自动台通知（发给我们）", relay_forward: "转发（发给我们）",
  ops_check: "定时核对（发给我们）",
  announce_1023: "10 月更新公告（进度表 103）",
  campaign: "分群群发（进度表 107）",
  // 10-23 进度表 111 / 110
  sub_payfail: "扣款失败／补缴成功", sub_unpaid_end: "欠费结束", sub_resume: "恢复续订确认", sub_pause: "暂停一个月确认", sub_renewed: "续费成功（收据）", support_ack: "客服自动回执", nianshu_received: "年书：收到了，写好就寄", erase: "删除帐号（确认／已删除）",
  nianshu_early_1101: "年书早鸟信（11/1，进度表 112）",
};

/** the letters that go out by themselves: their emails kind and key prefix */
export const AUTO_LETTERS = [
  { id: "ml", name: "会员每日信", when: "每天 07:30（中文会员）", kind: "member_letter", prefix: "ml" },
  { id: "mo", name: "流月信", when: "每月 1–3 日（中文会员）", kind: "month_letter", prefix: "mo" },
  { id: "dy", name: "大运交接信", when: "换大运那年一封（会员，有八字档案）", kind: "milestone", prefix: "dy" },
  { id: "km", name: "年书关键月信", when: "年书里的关键月到了（一年最多三封）", kind: "milestone", prefix: "km" },
  { id: "tq", name: "今日一籤信", when: "每天早上（订了的人；会员由每日信带）", kind: "today_qian", prefix: "tq" },
] as const;
export type AutoLetterId = (typeof AUTO_LETTERS)[number]["id"];

export interface AutoLetter { id: AutoLetterId; name: string; when: string; sent7: number; sent30: number; opened30: number; failed7: number; skipped7: number }

/** the letters that go out by themselves (emails rows by kind and key; opens from the mail log by the message id) */
export function autoLetters(now = Date.now(), test = false): AutoLetter[] {
  const w7 = now - 7 * DAY, w30 = now - 30 * DAY;
  return AUTO_LETTERS.map((l) => {
    const where = `e.kind = ? AND e.session_id >= ? AND e.session_id < ? AND ${notTestE(test)}`;
    const args = [l.kind, `${l.prefix}:`, `${l.prefix};`];
    return {
      id: l.id, name: l.name, when: l.when,
      sent7: one(`SELECT COUNT(*) AS v FROM emails e WHERE ${where} AND e.status = 'sent' AND e.sent_at >= ?`, ...args, w7),
      sent30: one(`SELECT COUNT(*) AS v FROM emails e WHERE ${where} AND e.status = 'sent' AND e.sent_at >= ?`, ...args, w30),
      opened30: one(`SELECT COUNT(*) AS v FROM emails e JOIN mail_log m ON m.id = e.detail WHERE ${where} AND e.status = 'sent' AND e.sent_at >= ? AND m.opened_at IS NOT NULL`, ...args, w30),
      failed7: one(`SELECT COUNT(*) AS v FROM emails e WHERE ${where} AND e.status = 'failed' AND e.sent_at >= ?`, ...args, w7),
      skipped7: one(`SELECT COUNT(*) AS v FROM emails e WHERE ${where} AND e.status = 'skipped' AND e.sent_at >= ?`, ...args, w7),
    };
  });
}

export interface LetterSend { at: number; customerId: number | null; status: string; detail: string | null; opened: number | null }

/** the latest sends of one of those letters (who, when, sent or why not, opened) */
export function autoLetterSends(id: string, test = false, limit = 80): LetterSend[] {
  const l = AUTO_LETTERS.find((x) => x.id === id);
  if (!l) return [];
  // the rows first (the key range uses the emails index), then each one's account and open by their own keys
  const rs = many<{ at: number; email: string; status: string; detail: string | null }>(
    `SELECT e.sent_at AS at, e.email, e.status, e.detail FROM emails e
      WHERE e.kind = ? AND e.session_id >= ? AND e.session_id < ? AND ${notTestE(test)} ORDER BY e.sent_at DESC LIMIT ?`,
    l.kind, `${l.prefix}:`, `${l.prefix};`, limit,
  );
  const cid = db().prepare("SELECT id FROM customers WHERE email = ?");
  const opened = db().prepare("SELECT opened_at FROM mail_log WHERE id = ?");
  return rs.map((r) => ({
    at: r.at,
    customerId: (cid.get(r.email.toLowerCase()) as { id: number } | undefined)?.id ?? null,
    status: r.status,
    detail: r.status === "sent" ? null : r.detail,
    opened: r.status === "sent" && r.detail ? ((opened.get(r.detail) as { opened_at: number | null } | undefined)?.opened_at ?? null) : null,
  }));
}

/** who stopped: the member letters' one-tap stop (daily, month, 大運, key month), and who has the today's-lot letter on */
export function letterStops(now = Date.now()): { off: number; off30: number; tqOn: number } {
  return {
    off: one("SELECT COUNT(*) AS v FROM member_letter_off"),
    off30: one("SELECT COUNT(*) AS v FROM member_letter_off WHERE at >= ?", now - 30 * DAY),
    tqOn: one("SELECT COUNT(*) AS v FROM tq_prefs WHERE mail = 1 AND subject LIKE 'c:%'"),
  };
}

export interface MailKindRow { kind: string; name: string; n7: number; n30: number; delivered30: number; opened30: number; bad30: number }

/** every kind of mail, 7 and 30 days */
export function mailKinds(now = Date.now(), test = false): MailKindRow[] {
  const w7 = now - 7 * DAY, w30 = now - 30 * DAY;
  return many<{ kind: string; n7: number; n30: number; delivered30: number; opened30: number; bad30: number }>(
    `SELECT kind,
            SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS n7,
            COUNT(*) AS n30,
            SUM(CASE WHEN delivered_at IS NOT NULL THEN 1 ELSE 0 END) AS delivered30,
            SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) AS opened30,
            SUM(CASE WHEN bounced_at IS NOT NULL OR complained_at IS NOT NULL OR failed_at IS NOT NULL THEN 1 ELSE 0 END) AS bad30
       FROM mail_log WHERE created_at >= ? AND ${notTest(test)} GROUP BY kind ORDER BY n30 DESC`, w7, w30,
  ).map((r) => ({ kind: r.kind, name: MAIL_NAME[r.kind] ?? r.kind, n7: Number(r.n7), n30: Number(r.n30), delivered30: Number(r.delivered30), opened30: Number(r.opened30), bad30: Number(r.bad30) }));
}

export interface MailRow94 { at: number; customerId: number | null; subject: string | null; state: string; bad: boolean }

/** the latest mails of one kind, with what became of each */
export function mailsOfKind(kind: string, test = false, limit = 80): MailRow94[] {
  return many<{ created_at: number; customer_id: number | null; subject: string | null; delivered_at: number | null; opened_at: number | null; bounced_at: number | null; complained_at: number | null; failed_at: number | null }>(
    `SELECT created_at, customer_id, subject, delivered_at, opened_at, bounced_at, complained_at, failed_at FROM mail_log
      WHERE kind = ? AND ${notTest(test)} ORDER BY created_at DESC LIMIT ?`, kind, limit,
  ).map((r) => ({
    at: r.created_at, customerId: r.customer_id, subject: r.subject,
    state: r.complained_at ? "投诉为垃圾邮件" : r.bounced_at ? "退信" : r.failed_at ? "发送失败" : r.opened_at ? "已打开" : r.delivered_at ? "已送达" : "已发出",
    bad: !!(r.complained_at || r.bounced_at || r.failed_at),
  }));
}
