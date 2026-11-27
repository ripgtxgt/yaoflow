import Link from "next/link";
import { cookies } from "next/headers";
import { ADMIN_COOKIE } from "@/lib/admin-auth";
import { currentCustomer } from "@/lib/auth";
import { db } from "@/lib/db";
import { toHans } from "@/lib/hant";
import { crossFor, type CrossPick, type CrossSource } from "@/lib/cross-map";
import { crossLine, servicesFor, serviceText, siteLine, type Service } from "@/lib/services";
import { OWED_HANT } from "@/lib/l10n/site-words";
import { fmt } from "@/lib/l10n/core";
import { promoPick, type PromoSurface } from "@/lib/promo";
import type { Locale } from "@/lib/locales";
import ProfileGate from "@/components/ProfileGate";

/**
 * 10-22 进度表 86 承接地圖 (设计稿第 3 節): the bottom of a result page — an answer still owed comes first (「你有 2 件到期，
 * 等你回答」 → 我的), then one main card and up to two smaller ones, each saying why. A product switched off for this
 * request is left out; a 命盤 card waits for a birth profile. `skipMain`: the page already shows its own main block
 * (the 塔羅 and 解籤 pages' 「起一卦」 panel). 10-29 进度表 128: every language — the sentences from data/l10n/site.json, and
 * only the services open in that language.
 */
/** 10-30 进度表 128 ⑤: products that are a different page in Japanese and Korean — their card says the service line, not the Chinese cross line */
const LOCAL_LINE = new Set(["taisui", "huangli", "zeri"]);
const SURFACE: Partial<Record<CrossSource, PromoSurface>> = { reading: "reading", reading_love: "reading", reading_lost: "reading", jieqian: "jieqian", tarot: "tarot" };
/** 10-30 (seen live: 「You have 1 matters」): the one-matter sentence of the languages that inflect for it */
const OWED_ONE: Partial<Record<Locale, string>> = {
  en: "You have 1 matter that has come due. Tell us how it turned out →",
  fr: "Une de vos questions est arrivée à échéance ; il suffit de dire comment les choses se sont passées →",
  de: "1 Angelegenheit ist fällig. Sie wartet darauf, dass du sagst, wie es ausgegangen ist →",
  es: "Tienes 1 asunto vencido; solo falta que cuentes cómo terminó →",
  pt: "Você tem 1 assunto vencido, esperando que diga como terminou →",
};

export default async function CrossCards({ source, locale, exclude = [], skipMain = false }: { source: CrossSource; locale: Locale; exclude?: string[]; skipMain?: boolean }) {
  const z = (s: string) => (locale === "zh" ? toHans(s) : s);
  const owedLine = (n: number) => (n === 1 && OWED_ONE[locale]) || fmt(siteLine(locale, "owed") ?? z(OWED_HANT), { n });
  const admin = (await cookies()).get(ADMIN_COOKIE)?.value;
  const visible = new Map((await servicesFor(locale, admin)).map((s) => [s.id, s] as const));
  // who is reading: a signed-in reader with an answer due, and whether their account keeps a birth profile
  let owed = 0, hasProfile = false;
  try {
    const me = await currentCustomer();
    if (me) {
      owed = (db().prepare("SELECT COUNT(*) AS n FROM revisits WHERE customer_id = ? AND outcome IS NULL AND due_at <= ? AND status IN ('sent','pending')").get(me.customerId, Date.now()) as { n: number }).n;
      try { hasProfile = !!db().prepare("SELECT 1 FROM birth_profiles WHERE customer_id = ? LIMIT 1").get(me.customerId); } catch { hasProfile = false; }
    }
  } catch { /* signed out, or no database */ }
  const { main, more: mapMore } = crossFor(source, exclude);
  // the owner's pick for this page on /admin/features (进度表 58 ②) still decides the small cards when one was made
  const surface = SURFACE[source];
  const owner = surface ? promoPick(surface) : null;
  const more: CrossPick[] = owner?.set ? owner.ids.filter((id) => !exclude.includes(id) && id !== main?.id).map((id) => ({ id, line: "" })) : mapMore;
  const card = (p: CrossPick, big: boolean) => {
    const s: Service | undefined = visible.get(p.id);
    if (!s) return null;
    const t = serviceText(s, locale);
    const el = (
      <Link key={`${p.id}${p.path ?? ""}`} href={`/${locale}${p.path ?? s.path}?c=cross-${source}`} data-heat={`cross-${source}-${p.id}`}
        className={big
          ? "block rounded-[2px] bg-[var(--ink)] text-[var(--paper)] px-[var(--s-5)] py-[var(--s-4)] no-underline hover:opacity-95"
          : "block rounded-[2px] border border-[var(--ink-16)] px-4 py-3 no-underline hover:border-[var(--ink)]"}>
        <span className={big ? "t-d3 block !text-[var(--paper)]" : "t-body block !text-[15px]"}>{p.line && !(LOCAL_LINE.has(p.id) && (locale === "ja" || locale === "ko")) ? crossLine(p.line, locale) : t.line}</span>
        <span className={big ? "t-small block mt-1 !text-[var(--paper-66)]" : "t-small block mt-0.5 !text-[var(--ink-45)]"}>{t.label} →</span>
      </Link>
    );
    return p.needsProfile ? <ProfileGate key={p.id} server={hasProfile}>{el}</ProfileGate> : el;
  };
  const mainEl = !skipMain && main ? card(main, true) : null;
  const moreEls = more.slice(0, 2).map((p) => card(p, false)).filter(Boolean);
  if (!owed && !mainEl && !moreEls.length) return null;
  return (
    <aside className="mt-[var(--s-6)] flex flex-col gap-3" data-heat={`cross-${source}`}>
      {owed > 0 && (
        <Link href={`/${locale}/account`} data-heat={`cross-${source}-owed`}
          className="block rounded-[2px] border border-[var(--gold)] px-4 py-3 no-underline hover:border-[var(--ink)]">
          <span className="t-body block !text-[15px]">{owedLine(owed)}</span>
        </Link>
      )}
      {mainEl}
      {moreEls.length > 0 && <div className="grid gap-3 sm:grid-cols-2">{moreEls}</div>}
    </aside>
  );
}
