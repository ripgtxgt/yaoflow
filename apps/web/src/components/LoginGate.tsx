import { loginGateT } from "@/lib/dict/login-gate";

/**
 * 10-25 (Neil: 「把这些可以不登录使用的产品也改为需要登录才能使用」): stands where a product starts (六爻起卦、塔羅抽牌、擲筊、
 * 求籤、解籤) when the reader is not signed in; the login page brings them back to `next` with what they had typed.
 */
export default function LoginGate({ locale, next }: { locale: string; next: string }) {
  const t = loginGateT(locale);
  return (
    <section data-heat="login-gate" className="panel px-[var(--s-4)] py-[var(--s-5)] text-center">
      <h2 className="t-sect">{t.title}</h2>
      <p className="t-small mt-[var(--s-2)] !text-[var(--ink-66)]">{t.lead}</p>
      <a href={`/${locale}/login?next=${encodeURIComponent(next)}`} data-heat="login-gate-go"
        className="inline-block mt-[var(--s-4)] min-h-[var(--s-6)] px-8 py-3 rounded-[2px] bg-[var(--ink)] !text-[var(--paper)] text-[14px] tracking-[0.1em] no-underline">{t.btn}</a>
    </section>
  );
}
