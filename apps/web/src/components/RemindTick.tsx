"use client";

/**
 * 10-23 进度表 111 ③: the reader's own yes to the one reminder letter if this payment is not finished — on the 合盤 and
 * 年書 pages, as the cast page and the membership buttons have it. Unticked by default (the letter is mail they asked for).
 * The letter reminds at the same price (lib/recover-offer.ts — only a 通卡 gets the hour at 70 %).
 * 10-30 进度表 128 ④: in the page's language (the 正緣畫像 page is open in all nine).
 */
const TEXT: Record<string, string> = {
  zh: "没付完的话，寄一封信提醒我（只这一封）",
  "zh-hant": "沒付完的話，寄一封信提醒我（只這一封）",
  en: "If I don't finish paying, send me one reminder email (just this one)",
  ja: "支払いが終わらなかったら、リマインドのメールを1通だけ送ってください",
  ko: "결제를 마치지 못하면 알림 메일을 한 통만 보내 주세요",
  fr: "Si je ne termine pas le paiement, m'envoyer un seul e-mail de rappel",
  de: "Wenn ich nicht fertig bezahle, schick mir eine einzige Erinnerungs-E-Mail",
  es: "Si no termino de pagar, envíame un solo correo de recordatorio",
  pt: "Se eu não terminar o pagamento, me envie um único e-mail de lembrete",
};
export default function RemindTick({ locale, checked, onChange }: { locale: string; checked: boolean; onChange: (v: boolean) => void }) {
  const text = TEXT[locale] ?? TEXT["zh-hant"]!;
  return (
    <label className="mt-[var(--s-3)] flex items-start gap-2 cursor-pointer" data-heat="pay-remind">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-[3px] accent-[var(--ink)]" />
      <span className="t-small !text-[var(--ink-66)]">{text}</span>
    </label>
  );
}
