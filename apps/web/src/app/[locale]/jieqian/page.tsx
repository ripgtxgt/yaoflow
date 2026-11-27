import JsonLd from "@/components/JsonLd";
import { featureOn } from "@/lib/features";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JIEQIAN_PATH, qianIndexPath, QIAN_LOCALE, QIAN_SET, qianSet } from "@/lib/qian";
import JieqianForm from "@/components/JieqianForm";
import { isForeign } from "@/lib/l10n/core";
import { isLocale, pageAlternates } from "@/lib/locales";
import { serviceLocales, serviceOpenIn } from "@/lib/services";
import { brandName } from "@/lib/brand";
import { ForeignJieqian, foreignJieqianMeta } from "@/components/ForeignQian";

// 10-25: who is reading decides the page (the login card or the rite) — never baked at build time
export const dynamic = "force-dynamic";
import { castIdForSession, castsInMatter, matterById, matterForSession, castQuestion } from "@/lib/db";
import { currentCustomer } from "@/lib/auth";
import QianFooter from "@/components/QianFooter";
import PromoStrip from "@/components/PromoStrip";
import ProductPage from "@/components/product/ProductPage";

/**
 * 10-12 解籤第一期 (进度表 §四 36): /zh-hant/jieqian — 「我有籤號，幫我解」. The form, how it works in three lines, and
 * one card per set to its index page (10-13; the full list of lots lived here until then). 繁體 only; never "AI 解籤".
 */
const TITLE = "線上解籤｜六十甲子籤、關帝籤、觀音籤、月老籤白話解說，輸入籤號看感情與工作";
const DESC = "在廟裡求到籤，看不懂籤詩？輸入籤號，看六十甲子籤（1–60）、天后宮一百籤、關聖帝君一百籤、觀音一百籤、月老聖籤或黃大仙靈籤（1–100）的白話、感情與工作怎麼讀；想知道事情落在哪幾天，再為同一件事起一卦。";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  // 10-30 进度表 128 ⑤: in another language, the number of a lot drawn at a temple of the market's own set
  if (isLocale(locale) && isForeign(locale) && serviceOpenIn("jieqian", locale)) { const m = foreignJieqianMeta(locale); return { title: { absolute: `${m.title} — ${brandName(locale)}` }, description: m.description, alternates: pageAlternates(locale, "/jieqian", serviceLocales("jieqian")) }; }
  if (locale !== QIAN_LOCALE) return {};
  return { title: { absolute: TITLE }, description: DESC, alternates: { canonical: JIEQIAN_PATH }, openGraph: { title: TITLE, description: DESC } };
}

export default async function JieqianPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ n?: string; from?: string; m?: string; s?: string }> }) {
  const { locale } = await params;
  if (isLocale(locale) && isForeign(locale) && serviceOpenIn("jieqian", locale)) {
    return <ForeignJieqian l={locale} n={(await searchParams).n} />;
  }
  if (locale !== QIAN_LOCALE) notFound();
  const { n, from, m, s } = await searchParams;
  const set = qianSet(s); // 10-12 籤系: ?s=huangdaxian opens the form on that set (a shared 黃大仙 card links here so)
  // 10-12 承接 ⑨ 卦→籤: from a full reading (?from=<sid>) or the matter page (?m=<id>) — the lot joins that matter, its question
  // already written (the reading's own question; a matter's newest one)
  const link = await linkedMatter(from, m);
  let signedIn = false;
  try { signedIn = !!(await currentCustomer()); } catch { /* no database */ }
  const initial = n && /^\d{1,3}$/.test(n) && Number(n) >= 1 && Number(n) <= set.count ? Number(n) : undefined;
  const site = (process.env.SITE_URL ?? "https://yaoflow.com").replace(/\/$/, "");
  const jsonLd = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
    { "@type": "ListItem", position: 1, name: "YaoFlow", item: `${site}/${QIAN_LOCALE}` },
    { "@type": "ListItem", position: 2, name: "線上解籤", item: `${site}${JIEQIAN_PATH}` },
  ] };
  return (
    <ProductPage
      locale={QIAN_LOCALE}
      title="我有籤號，幫我解"
      lead="輸入你抽到的籤號，先看這首籤詩在說什麼、放在你這件事上怎麼讀。籤給方向；想知道事情落在哪幾天，再為同一件事起一卦。"
      input={
        <>
          <JsonLd data={jsonLd} />
          <p className="t-label !text-[var(--gold-text)] mb-[var(--s-3)]">六十甲子籤 · 天后宮籤 · 關帝籤 · 觀音籤 · 月老籤 · 黃大仙靈籤 · 解籤</p>
          {/* 10-14 进度表 50 */}
          {/* 10-16 进度表 67: once 擲筊／求籤 is open (static page — shows on the next deploy after opening) */}
          {featureOn("jiaobei") && <p className="t-small mb-[var(--s-2)]"><Link href="/zh-hant/qiuqian" data-heat="jieqian-qq" className="underline underline-offset-4 hover:text-[var(--cinnabar)]">還沒抽籤？線上求籤：先擲筊請示，再抽一支 →</Link></p>}
          {featureOn("tarot") && <p className="t-small mb-[var(--s-2)]"><Link href="/zh-hant/tarot" data-heat="jieqian-tarot" className="underline underline-offset-4 hover:text-[var(--cinnabar)]">想用塔羅看這件事？一件事抽一次 →</Link></p>}
          {featureOn("today-qian") && <p className="t-small mb-[var(--s-4)]"><Link href="/zh-hant/today-qian" data-heat="jieqian-tq" className="underline underline-offset-4 hover:text-[var(--cinnabar)]">沒去廟裡也想抽？今日一籤：每天抽一支 →</Link></p>}
          {link && <p className="t-small mb-[var(--s-3)] !text-[var(--gold-text)]">這支籤會和「{link.title}」之前的卦放在一起看。</p>}
          {/* 10-31 进度表 131: no sign-in to start again (the address is still asked before the lot is read) */}
          <JieqianForm initialNum={initial} initialQuestion={link?.question} from={link?.from} matter={link?.matterId} initialSet={set.id} signedIn={signedIn} />
        </>
      }
      fit={{
        yes: ["在廟裡求到籤，想知道這首籤詩在說什麼", "一件具體的事：感情、工作，或整體", "已經有籤號，知道是哪一套籤"],
        no: ["還沒抽籤（先去線上求籤）", "想知道事情落在哪幾天（那要起一卦）", "一次問好幾件事"],
      }}
      how={[
        "選籤的種類和求籤的廟、填籤號、選你問的是哪一類，寫一句想問的事，留一個信箱。",
        "看籤詩白話、這支籤放在感情或工作上怎麼讀，和放在你這件事上的專屬解讀（含一次追問）。",
        "想知道哪一天：帶著同一個問題起一卦，深斷會給日期或幾天的窗口，到那天我們回來問你。",
      ]}
      free="籤詩本身；各套籤的籤詩與白話解說，都在各籤頁上免費看。"
      paid="這支籤的白話、放在感情或工作上怎麼讀，和照你的問題寫的專屬解讀（含一次追問）：一次輕解讀的價格，會員已含。"
      boundary={["籤給方向；哪幾天會有動靜，要為同一件事起一卦。", "白話都是我們自己寫的；每一套的籤詩出處寫在各籤頁上。"]}
      promo={<PromoStrip surface="jieqian" locale={QIAN_LOCALE} exclude={["jieqian"]} />}
      disclaimer="目前收十四套：六十甲子籤（東港鎮海宮、北港朝天宮、新港奉天宮、臺灣省城隍廟）、天后宮一百籤（臺南大天后宮、鹿港天后宮、關渡宮）、關聖帝君一百籤（行天宮）、觀音一百籤（龍山寺）、月老聖籤（新竹普天宮）、臺中樂成宮月老靈籤、保生大帝六十籤、註生娘娘三十籤、觀音二十八籤（內門紫竹寺）、觀音二十四籤、金錢卦三十二籤、烘爐地南山福德宮三十二籤、日本淺草寺觀音籤、香港黃大仙靈籤。"
    >
      {/* 10-13 (Neil: 「有必要把所有的签都放上去吗？」) → 10-22 进度表 76 ⑤: the library lives on its own pages — one link from the product page */}
      <p className="t-small mt-[var(--s-4)]"><Link href={qianIndexPath(QIAN_SET)} data-heat="jieqian-index" className="underline underline-offset-4 hover:text-[var(--cinnabar)]">各套籤的全部籤詩（十四套，每一首的白話、感情與工作）→</Link></p>
      <QianFooter />
    </ProductPage>
  );
}

/** The matter a lot is being added to, when the page was opened from a reading or a matter page the visitor may see. */
async function linkedMatter(from: string | undefined, m: string | undefined): Promise<{ matterId?: number; from?: string; title: string; question: string } | null> {
  try {
    if (from && /^[A-Za-z0-9_-]{8,120}$/.test(from)) {
      const mid = matterForSession(from);
      const c = castIdForSession(from);
      const q = c ? castQuestion(c) : null;
      const mt = mid ? matterById(mid) : null;
      return q ? { from, title: mt?.title ?? q.slice(0, 16), question: q } : null;
    }
    if (m && /^\d{1,10}$/.test(m)) {
      const me = await currentCustomer();
      const mt = matterById(Number(m));
      if (!me || !mt || mt.customer_id !== me.customerId) return null;
      const last = castsInMatter(mt.id)[0];
      return { matterId: mt.id, title: mt.title ?? "這件事", question: last?.question ?? "" };
    }
  } catch { /* no database */ }
  return null;
}
