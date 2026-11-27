import { headers } from "next/headers";
import NotFoundPanel from "@/components/NotFoundPanel";
import { asLocale, isLocale } from "@/lib/locales";

/**
 * not-found boundaries receive no params, so the locale comes from the path
 * the middleware forwards in x-pathname. A path outside any locale falls
 * back to English rather than to the site's Chinese default.
 */
export default async function NotFound() {
  const h = await headers();
  const seg = (h.get("x-pathname") ?? "").split("/")[1] ?? "";
  const locale = isLocale(seg) ? asLocale(seg) : asLocale(undefined, "en");
  return <NotFoundPanel locale={locale} />;
}
