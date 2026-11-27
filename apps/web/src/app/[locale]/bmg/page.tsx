import type { Metadata } from "next";
import { notFound } from "next/navigation";
import TrackOnce from "@/components/TrackOnce";
import ProductPage from "@/components/product/ProductPage";
import CrossCards from "@/components/CrossCards";
import BmgQuiz from "@/components/bmg/BmgQuiz";
import { canSee, featureState } from "@/lib/features";
import { brandName } from "@/lib/brand";
import { isLocale, pageAlternates, type Locale } from "@/lib/locales";
import { serviceLocales, serviceOpenIn } from "@/lib/services";
import Link from "next/link";
import { BMG_TYPES, QUESTIONS, QUICK_QUESTIONS, RESULT_COPY } from "@/lib/bmg";
import { bmgByToken } from "@/lib/bmg-store";

export const dynamic = "force-dynamic";

/**
 * 11-05 进度表 136 本命卦小測 (Neil 11-05；文案：推广 T-015). Two doors, no sign-in, no birth data: twelve questions, or the
 * four letters plus two. 繁中 first (日文、英文 later). The result: /bmg/r/<token>.
 */
const P = {
  metaTitle: "本命卦小測：你是六十四卦裡的哪一卦？",
  metaDesc: "12 題，約 2 分鐘，不用登入、不用生辰。用六爻看你做事、心裡有事、看事情、心力、推動自己、和人相處這六件事的習慣，得到你的本命卦。",
  title: "你是六十四卦裡的哪一卦？",
  lead: "六個爻，看六件事：你做事的方式、心裡有事時、看事情的角度、心力往哪裡放、怎麼推動自己、怎麼和人相處。12 題，約 2 分鐘，不用登入、不用生辰。",
  copy: {
    full: "開始（12 題，約 2 分鐘）", quickBtn: "我知道自己的四個字母（快速版，2 題）",
    next: "下一題", back: "上一題", done: "看我的本命卦", error: "沒送出去，請再試一次。", of: "第 {n} 題，共 {t} 題",
  },
  how: ["每一題選比較像你的那一邊，沒有對錯。", "六個爻由下往上長出來：下面三爻是「本來的你」，上面三爻是「現在的你」。", "結果頁告訴你六件事各是哪一邊、壓力大的時候會變成哪一卦、一個可以試試不一樣的地方。"],
  fitYes: ["想用一個不一樣的角度看看自己", "想知道自己和人相處、做決定時的習慣", "想帶著自己的本命卦問一件事"],
  fitNo: ["想要一份心理測驗或診斷", "想知道一個人「好不好」"],
  free: ["小測與結果頁都不用付費，也不用登入。"],
  boundary: [RESULT_COPY.footer, "我們不給人格分好壞，也不幫真實人物配卦。"],
  faq: [
    { q: "本命卦跟生辰八字有關嗎？", a: "沒有關係。本命卦只看你答的 12 題，不需要生日、時辰，也不用登入。" },
    { q: "四個字母是什麼？", a: RESULT_COPY.quickNote },
    { q: "可以重測嗎？", a: "可以。每一次結果都會留著，在「我的」可以看到；答案變了，本命卦也會跟著變。" },
    { q: "本命卦會用在哪裡？", a: "之後你在 YaoFlow 問事，解讀會多一段「以你的本命卦來說」：這件事順不順你的習慣、哪一層要用不習慣的方式。" },
  ],
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale) || !serviceOpenIn("bmg", locale)) return {};
  if (!(await canSee("bmg"))) return {};
  return { title: { absolute: `${P.metaTitle} — ${brandName(locale)}` }, description: P.metaDesc, alternates: pageAlternates(locale, "/bmg", serviceLocales("bmg")) };
}

export default async function BmgPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ c?: string; inv?: string }> }) {
  const { locale } = await params;
  const sp = await searchParams;
  if (!isLocale(locale) || !serviceOpenIn("bmg", locale)) notFound();
  if (!(await canSee("bmg"))) notFound();
  const l: Locale = locale;
  // 进度表 138 合卦: an invitation carries the inviter's result token; only while that feature is visible
  const inv = sp.inv && (await canSee("bmg-pair")) && bmgByToken(sp.inv) ? sp.inv : null;
  const pages = await canSee("bmg-pages");
  return (
    <ProductPage
      locale={l}
      preview={featureState("bmg") === "preview"}
      title={P.title}
      lead={inv ? "朋友邀你一起做本命卦。做完，就能並排看你們倆六個爻哪幾層相合、哪幾層不一樣。" : P.lead}
      input={
        <>
          <TrackOnce event="bmg_view" locale={l} method={inv ? "invite" : "quiz"} />
          <BmgQuiz locale={l} questions={QUESTIONS} quick={QUICK_QUESTIONS} inv={inv} c={sp.c ?? null}
            copy={{ ...P.copy, quickAsk: RESULT_COPY.quickAsk, quickFallback: RESULT_COPY.quickFallback, quickNote: RESULT_COPY.quickNote }} />
        </>
      }
      fit={{ yes: P.fitYes, no: P.fitNo }}
      how={P.how}
      free={P.free}
      boundary={P.boundary}
      faq={P.faq}
      promo={<CrossCards source="bmg" locale={l} exclude={["bmg"]} />}
    >
      {/* 11-05 进度表 139: the 16 four-letter pages, one tap each (also what the search engines walk) */}
      {pages && (
        <section className="mt-[var(--s-6)]" data-heat="bmg-types">
          <h2 className="t-sect">四個字母各是哪幾卦？</h2>
          <p className="mt-[var(--s-3)] flex flex-wrap gap-2">
            {BMG_TYPES.map((t) => <Link key={t} href={`/${l}/bmg/type/${t.toLowerCase()}`} className="t-small px-3 py-1 rounded-full border border-[var(--ink-16)] hover:border-[var(--ink)]">{t}</Link>)}
          </p>
          <p className="t-small mt-[var(--s-3)]"><Link href={`/${l}/gua?c=bmg`} className="underline underline-offset-4">六十四卦，一卦一頁 →</Link></p>
        </section>
      )}
    </ProductPage>
  );
}
