import { NextRequest, NextResponse } from "next/server";
import { setHeadsUpOff, setMarketingConsent, recordOps, recordUnsub, stopSavedCasts } from "@/lib/db";
import { unsubValid } from "@/lib/unsub";
import { asLocale, LOCALE_META } from "@/lib/locales";
import { contentFor } from "@/lib/content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 09-23: the 应期提醒 letters carry the same signed link with &k=h — it stops those letters only
const HEADSUP_COPY = {
  zh: { ok: "已停止应期提醒。解读交付和应期过后的回访照常。", bad: "这个链接无效。" },
  "zh-hant": { ok: "已停止應期提醒。解讀交付和應期過後的回訪照常。", bad: "這個連結無效。" },
  en: { ok: "Timing reminders stopped. Reading deliveries and the follow-up after each window continue as before.", bad: "This link is not valid." },
  ja: { ok: "応期のお知らせを停止しました。読み解きの配信と、応期後のお伺いはこれまで通りです。", bad: "このリンクは無効です。" },
  ko: { ok: "응기 알림을 껐습니다. 풀이 메일과 응기가 지난 뒤의 확인 메일은 계속 보내 드립니다.", bad: "이 링크는 유효하지 않습니다." },
  fr: { ok: "Les rappels d'échéance sont désactivés. L'envoi des lectures et le suivi après chaque échéance continuent comme avant.", bad: "Ce lien n'est pas valide." },
  de: { ok: "Zeitpunkt-Erinnerungen gestoppt. Deutungen und die Nachfrage nach jedem Zeitfenster gehen weiter.", bad: "Dieser Link ist ungültig." },
  es: { ok: "Listo: ya no recibirás avisos de plazo. La entrega de lecturas y el seguimiento después de cada plazo siguen como siempre.", bad: "Este enlace no es válido." },
  pt: { ok: "Lembretes de prazo desativados. As leituras e o e-mail de acompanhamento após cada prazo continuam.", bad: "Este link não é válido." },
};

const COPY = {
  fr: { ok: "Désabonnement effectué. Vous ne recevrez plus d'e-mails sur le lancement ou les nouveautés\u202f; l'envoi des lectures et les rappels d'échéance continuent comme avant.", bad: "Ce lien de désabonnement n'est pas valide." },
  zh: { ok: "已退订。以后不会再收到上线或新功能的邮件；解读交付和应期提醒照常。", bad: "这个退订链接无效。" },
  en: { ok: "Unsubscribed. No more launch or feature news; reading deliveries and timing reminders continue as before.", bad: "This unsubscribe link is not valid." },
  ja: { ok: "配信停止しました。今後、公開や新機能のお知らせは届きません。読み解きの配信と応期のリマインダーはこれまで通りです。", bad: "この配信停止リンクは無効です。" },
  es: { ok: "Baja confirmada. Ya no recibirás correos sobre el lanzamiento ni sobre funciones nuevas; la entrega de lecturas y los avisos de plazo siguen como siempre.", bad: "Este enlace de baja no es válido." },
  // 09-25 合规: the page fell back to English for these three
  ko: { ok: "수신 거부되었습니다. 앞으로 출시나 새 기능 안내 메일은 보내지 않습니다. 풀이 전달과 응기 알림은 그대로 계속됩니다.", bad: "이 수신 거부 링크는 유효하지 않습니다." },
  de: { ok: "Abgemeldet. Du bekommst keine Mails mehr zu Start oder neuen Funktionen; Deutungen und Zeitfenster-Erinnerungen kommen weiterhin.", bad: "Dieser Abmeldelink ist ungültig." },
  pt: { ok: "Descadastrado. Você não receberá mais e-mails sobre lançamento ou novidades; a entrega das leituras e os lembretes de prazo continuam como antes.", bad: "Este link de descadastramento não é válido." },
  "zh-hant": { ok: "已退訂。以後不會再收到上線或新功能的信；解讀交付和應期提醒照常。", bad: "這個退訂連結無效。" },
};

/** The one-click link at the bottom of every launch mail. GET, no login. */
export async function GET(req: NextRequest) {
  const email = (req.nextUrl.searchParams.get("e") ?? "").trim().toLowerCase();
  const token = req.nextUrl.searchParams.get("t") ?? "";
  const locale = asLocale(req.nextUrl.searchParams.get("l"));
  const ok = !!email && unsubValid(email, token);
  const headsUp = req.nextUrl.searchParams.get("k") === "h";
  if (ok && headsUp) {
    setHeadsUpOff(email);
    recordOps("headsup_off", email.replace(/^(.).*@/, "$1…@"));
  } else if (ok) {
    setMarketingConsent(email, false);
    stopSavedCasts(email); // 10-02 存到信箱: no reminder for any cast this address saved
    recordUnsub(email, "link"); // 10-23 进度表 103: kept by the exact address — the ops line below is masked
    recordOps("unsub", email.replace(/^(.).*@/, "$1…@"));
  }
  const c = headsUp ? contentFor(HEADSUP_COPY, locale) : contentFor(COPY, locale);
  const html = `<!doctype html><html lang="${LOCALE_META[locale].htmlLang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>YaoFlow</title>
<style>body{margin:0;background:#f4f2ec;color:#14151c;font-family:Georgia,'Songti SC','Noto Serif SC',serif;}main{max-width:34rem;margin:0 auto;padding:6rem 1.5rem;}.mark{letter-spacing:.35em;text-transform:uppercase;font-size:12px;color:#7a7a7c;margin:0 0 2.5rem;}p{font-size:16px;line-height:1.8;}</style></head>
<body><main><p class="mark">YaoFlow</p><p>${ok ? c.ok : c.bad}</p></main></body></html>`;
  return new NextResponse(html, { status: ok ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
