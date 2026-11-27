"use client";

import ShareButton from "@/components/ShareButton";
import { tt } from "@/lib/dict/thread";
import type { Locale } from "@/lib/locales";

/** 会员今日一卦: share the day's line — never the question behind it. 10-22 分享 13 合 1: a ShareButton on the one share hook. */
export default function DailyShare({ locale, text, url }: { locale: Locale; text: string; url: string }) {
  return <ShareButton locale={locale} surface="daily" url="" text={`${text}\n— YaoFlow ${url}`} methods={{ native: "daily", copy: "daily" }} look="link" heat="daily-share" label={tt(locale, "dailyShare")} copiedLabel={tt(locale, "dailyCopied")} />;
}
