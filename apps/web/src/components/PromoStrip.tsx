import Link from "next/link";
import { cookies } from "next/headers";
import { ADMIN_COOKIE } from "@/lib/admin-auth";
import { featureVisible } from "@/lib/features";
import { promoFor, type PromoSurface } from "@/lib/promo";
import { serviceText } from "@/lib/services";
import type { Locale } from "@/lib/locales";

const HEAD: Record<string, string> = { zh: "也可以试试", "zh-hant": "也可以試試", en: "You might also like", ja: "こちらもどうぞ", ko: "이것도 해보세요", fr: "À essayer aussi", de: "Auch einen Blick wert", es: "También puedes probar", pt: "Experimente também" };

/**
 * 10-22 进度表 58 ②: the 「也可以試試」 strip — one or two services the owner picked for this surface on /admin/features
 * (lib/promo.ts); nothing when none is open to this request. Server component; the `services` switch gates it.
 */
export default async function PromoStrip({ surface, locale, exclude = [] }: { surface: PromoSurface; locale: Locale; exclude?: string[] }) {
  const admin = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!(await featureVisible("services", admin))) return null;
  const items = await promoFor(surface, locale, admin, exclude);
  if (!items.length) return null;
  return (
    <aside className="mt-[var(--s-6)] pt-[var(--s-4)] border-t border-[var(--ink-16)]" data-heat={`promo-${surface}`}>
      <p className="t-label !text-[var(--ink-45)] mb-[var(--s-3)]">{HEAD[locale] ?? HEAD.en}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((s) => {
          const t = serviceText(s, locale);
          return (
            <Link key={s.id} href={`/${locale}${s.path}?c=promo-${surface}`} className="block rounded-[6px] border border-[var(--ink-16)] p-4 hover:border-[var(--ink)] no-underline">
              <span className="t-d3 block">{t.label}</span>
              <span className="t-small block mt-1 !text-[var(--ink-66)]">{t.line}</span>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
