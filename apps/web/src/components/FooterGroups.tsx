import Link from "next/link";
import { cookies } from "next/headers";
import { ADMIN_COOKIE } from "@/lib/admin-auth";
import { GROUP_LABEL, servicesFor, serviceText } from "@/lib/services";
import type { Locale } from "@/lib/locales";

/**
 * 10-22 进度表 88 (设计稿第 2 節 頁尾): the footer names every product by its group — 問事：六爻、求籤、擲筊、塔羅 · 看自己：
 * 紫微、八字、星盤 · 每天：今日一籤、每日運勢、黃曆、擇日 — only what is open to this request. Chinese pages only.
 */
export default async function FooterGroups({ locale }: { locale: Locale }) {
  if (locale !== "zh" && locale !== "zh-hant") return null;
  const items = await servicesFor(locale, (await cookies()).get(ADMIN_COOKIE)?.value).catch(() => []);
  const groups = (["ask", "self", "daily"] as const).map((g) => ({ g, list: items.filter((s) => s.group === g) })).filter((x) => x.list.length > 0);
  if (!groups.length) return null;
  return (
    <div className="mb-5 flex flex-col gap-2" data-heat="footer-groups">
      {groups.map(({ g, list }) => (
        <p key={g} className="t-small flex flex-wrap gap-x-3 gap-y-1">
          <span className="!text-[var(--ink-45)]">{GROUP_LABEL[g][locale]}</span>
          {list.map((s) => (
            <Link key={s.id} href={`/${locale}${s.path}?c=footer`} className="hover:text-[var(--ink)] transition-colors">{serviceText(s, locale).label}</Link>
          ))}
        </p>
      ))}
    </div>
  );
}
