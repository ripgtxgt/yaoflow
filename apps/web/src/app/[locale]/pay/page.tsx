import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { isLocale, type Locale } from "@/lib/i18n";
import { blocksAppHandoff, handoffApp, isStripeCheckoutUrl, payHopLink } from "@/lib/inapp-pay";
import { payHopT } from "@/lib/dict/pay-hop";
import { record } from "@/lib/analytics-server";
import PayHopCopy from "@/components/PayHopCopy";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * 10-24 (Neil 转来 #2915：「完全没办法付款，支付宝一直在跳转页面不动」): the payment page asked for from inside WeChat / QQ
 * lands here first (lib/inapp-pay.ts). In there: why it cannot go on, 「···」→「在浏览器打开」, the link to copy, and the
 * card that does work in there. Opened anywhere else — which is what 「在浏览器打开」 does with this very URL — it goes
 * straight on to the Stripe page. Only Stripe Checkout pages are ever sent on to (isStripeCheckoutUrl).
 */
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? "");

export default async function PayHop({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ u?: string | string[] }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const l = locale as Locale;
  const { u } = await searchParams;
  const url = Array.isArray(u) ? u[0] : u;
  if (!isStripeCheckoutUrl(url)) notFound();
  const ua = (await headers()).get("user-agent");
  if (!blocksAppHandoff(ua)) {
    try { record({ t: Date.now(), e: "pay_hop", s: "pay-hop", locale: l, method: "on_browser" }); } catch { /* */ }
    redirect(url);
  }
  const app = handoffApp(ua) ?? "wechat";
  try { record({ t: Date.now(), e: "pay_hop", s: "pay-hop", locale: l, method: `view_${app}` }); } catch { /* */ }
  const t = payHopT(l);
  const v = { app: t.appName[app] };
  return (
    <div className="mx-auto w-full max-w-[34rem] px-[var(--s-4)] pt-[var(--s-3)] pb-20">
      {/* where WeChat's own menu is: just above this page, at the top right */}
      <p className="text-right t-small !text-[var(--cinnabar)] tracking-[0.06em]" aria-hidden="true">{t.point} ↗</p>
      <h1 className="t-d2 mt-[var(--s-4)]">{fill(t.title, v)}</h1>
      <p className="t-body mt-[var(--s-3)] text-[var(--ink-66)]">{fill(t.lead, v)}</p>
      <ol className="mt-[var(--s-5)] space-y-[var(--s-3)]">
        {[t.step1, t.step2, t.step3].map((s, i) => (
          <li key={i} className="flex gap-3 t-body !text-[16px]">
            <span className="shrink-0 w-6 h-6 rounded-full border border-[var(--ink)] text-[13px] leading-[22px] text-center">{i + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      <div className="mt-[var(--s-5)]">
        <PayHopCopy link={payHopLink(url, l)} copy={t.copy} copied={t.copied} manual={t.manual} />
      </div>
      <div className="mt-[var(--s-6)] pt-[var(--s-4)] border-t border-[var(--ink-16)]">
        <a href={url} data-heat="pay-hop-card" className="inline-block min-h-[var(--s-6)] px-6 py-3 rounded-[2px] border border-[var(--ink)] tracking-[0.12em] text-[14px]">{t.card} →</a>
        <p className="t-small mt-[var(--s-2)] !text-[var(--ink-45)]">{fill(t.cardNote, v)}</p>
      </div>
      <p className="t-small mt-[var(--s-5)] !text-[var(--ink-66)]">{fill(t.after, v)}</p>
    </div>
  );
}
