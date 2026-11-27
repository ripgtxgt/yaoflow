import { toHans } from "./hant";
import { unsubToken } from "./unsub";
import type { LotView } from "./today-qian";

/**
 * 10-14 进度表 50 今日一籤: the 07:30 letter (members and 籤卡 holders who turned it on) and the one letter three days
 * before a 籤卡 ends. Short, nothing else sold in them. 繁體 first; 简体 readers get the same words converted.
 */
const PAPER = "#f4f2ec", INK = "#14151c", INK_86 = "#333439", INK_66 = "#606063", INK_50 = "#7a7a7c", RULE = "#d0cfcb", GOLD = "#8a6a1f";
const FONT = "Georgia,'Songti SC','Noto Serif SC',serif";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const BTN = `display:inline-block;background:${INK};color:${PAPER};text-decoration:none;padding:12px 22px;border-radius:2px;font-size:14px;`;
const BTN_LINE = `display:inline-block;border:1px solid ${INK};color:${INK};text-decoration:none;padding:11px 22px;border-radius:2px;font-size:14px;`;

const SECTION: Record<string, string> = { love: "放在你的感情上", work: "放在你的工作上", overall: "放在你最近的事上" };

export const tqUnsubUrl = (site: string, email: string, locale: string) =>
  `${site}/api/today-qian/unsub?u=${encodeURIComponent(email.trim().toLowerCase())}&t=${unsubToken(`tq:${email.trim().toLowerCase()}`)}&l=${locale}`;

function frame(locale: string, inner: string): string {
  return `<!doctype html><html lang="${locale === "zh" ? "zh-CN" : "zh-Hant"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${PAPER};color:${INK};font-family:${FONT};"><div style="max-width:560px;margin:0 auto;padding:40px 24px 36px;">
<p style="letter-spacing:.35em;font-size:12px;color:${INK_50};margin:0 0 28px;">YAOFLOW</p>${inner}</div></body></html>`;
}

export function buildTodayQianEmail(i: { locale: "zh" | "zh-hant"; day: string; lot: LotView; site: string; email: string }): { subject: string; html: string; text: string; unsubUrl: string } {
  const z = (s: string) => (i.locale === "zh" ? toHans(s) : s);
  const v = i.lot;
  const unsubUrl = tqUnsubUrl(i.site, i.email, i.locale);
  const pageUrl = `${i.site}/${i.locale}/today-qian?c=tqmail`;
  const castUrl = `${i.site}/${i.locale}/cast?c=tqmail`;
  const [m, d] = i.day.slice(5).split("-").map(Number);
  const head = z(`${m}月${d}日 · ${v.setName} 第 ${v.num} 籤${v.tag ? ` ${v.tag}` : ""}`);
  const f = v.full;
  const lines = [
    z(`今日一籤：${v.title}`),
    ...v.poem.map(z),
    ...(f ? [z(`${SECTION[f.section]}：${f.text}`), ...(f.yi ? [z(`今日宜：${f.yi}`)] : []), ...(f.ji ? [z(`今日忌：${f.ji}`)] : []), z(f.askNext)] : []),
  ];
  const html = frame(i.locale, `
<p style="font-size:13px;color:${GOLD};margin:0 0 8px;">${esc(head)}</p>
<p style="font-size:22px;line-height:1.45;margin:0 0 18px;">${esc(z(v.title))}</p>
<p style="font-size:17px;line-height:1.9;margin:0 0 20px;color:${INK_86};">${v.poem.map((l) => esc(z(l))).join("<br>")}</p>
${f ? `<p style="font-size:13px;color:${INK_50};margin:0 0 4px;">${esc(z(SECTION[f.section]!))}</p>
<p style="font-size:15px;line-height:1.8;margin:0 0 14px;color:${INK_86};">${esc(z(f.text))}</p>
${f.yi || f.ji ? `<p style="font-size:14px;line-height:1.8;margin:0 0 14px;">${f.yi ? `${esc(z("今日宜"))}　${esc(z(f.yi))}` : ""}${f.yi && f.ji ? "<br>" : ""}${f.ji ? `${esc(z("今日忌"))}　${esc(z(f.ji))}` : ""}</p>` : ""}
<p style="font-size:15px;line-height:1.8;margin:0 0 22px;color:${INK_86};">${esc(z(f.askNext))}</p>` : ""}
<p style="margin:0 0 10px;"><a href="${esc(castUrl)}" style="${BTN}">${esc(z("起一卦，看這件事落在哪幾天"))}</a></p>
<p style="margin:0 0 22px;"><a href="${esc(pageUrl)}" style="font-size:13px;color:${INK_66};">${esc(z("看本月的籤日曆"))} →</a></p>
<hr style="border:none;border-top:1px solid ${RULE};margin:8px 0 14px;">
<p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(z("籤看的是大方向和心態；你開過「每天寄給我」才會收到這封信。"))} <a href="${esc(unsubUrl)}" style="color:${INK_50};">${esc(z("不用再寄"))}</a></p>`);
  const text = [head, "", ...lines, "", `${z("起一卦")}: ${castUrl}`, `${z("本月的籤日曆")}: ${pageUrl}`, "", `${z("不用再寄")}: ${unsubUrl}`].join("\n");
  return { subject: z(`今日一籤｜${v.title}`), html, text, unsubUrl };
}

export function cardChoiceUrl(site: string, cardId: number, choice: "again" | "member" | "no", locale: string): string {
  return `${site}/api/today-qian/card-choice?id=${cardId}&c=${choice}&t=${unsubToken(`qcard:${cardId}`)}&l=${locale}`;
}

export function buildCardNoticeEmail(i: { locale: "zh" | "zh-hant"; endsAt: number; site: string; cardId: number }): { subject: string; html: string; text: string } {
  const z = (s: string) => (i.locale === "zh" ? toHans(s) : s);
  const t = new Date(i.endsAt + 8 * 3_600_000);
  const date = `${t.getUTCMonth() + 1}月${t.getUTCDate()}日`;
  // 10-22 进度表 92: the 籤卡 is no longer sold — the letter offers the membership (今日一籤全文 lives there now) or nothing
  const btn = [
    ["member", z("改成會員：首月 NT$349，之後 NT$269／月（每日一籤全文、你的今天、每天一封信）")],
    ["no", z("不用了")],
  ] as const;
  const html = frame(i.locale, `
<p style="font-size:22px;line-height:1.4;margin:0 0 16px;">${esc(z(`你的籤卡將在 ${date} 到期`))}</p>
<p style="font-size:15px;line-height:1.8;color:${INK_86};margin:0 0 20px;">${esc(z("到期後還是每天都能抽籤、看籤詩和日曆；對應你那件事的白話、今日宜忌、回看和每天寄信會停下。要怎麼辦，你來決定："))}</p>
${btn.map(([c, l]) => `<p style="margin:0 0 10px;"><a href="${esc(cardChoiceUrl(i.site, i.cardId, c, i.locale))}" style="${BTN_LINE}display:block;text-align:center;">${esc(l)}</a></p>`).join("\n")}
<hr style="border:none;border-top:1px solid ${RULE};margin:18px 0 14px;">
<p style="font-size:11px;color:${INK_50};line-height:1.6;margin:0;">${esc(z("籤卡不會自動續費。這是服務通知，有問題直接回覆這封信。"))}</p>`);
  const text = [z(`你的籤卡將在 ${date} 到期`), "", ...btn.map(([c, l]) => `${l}: ${cardChoiceUrl(i.site, i.cardId, c, i.locale)}`), "", z("籤卡不會自動續費。")].join("\n");
  return { subject: z(`你的籤卡將在 ${date} 到期`), html, text };
}
