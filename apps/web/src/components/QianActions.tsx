"use client";

import TongkaPanel, { TongkaSkeleton } from "@/components/TongkaPanel";
import PassReturn from "@/components/PassReturn";
import { useTongka } from "@/lib/use-tongka";

import { useState } from "react";
import Link from "next/link";
import { useCurrency } from "@/lib/use-currency";
import { formatMoney, priceMinor } from "@/lib/money";
import { track } from "@/lib/track";
import { checkoutV2 } from "@/lib/checkout-client";

/** 10-12 解籤 (进度表 §四 36 ③): the main door — the same question carried into a cast, the lot riding along. */
export function QianCastLink({ href, num }: { href: string; num: number }) {
  return (
    <Link href={href} data-heat="qian-cast" onClick={() => track("qian_cast_click", { locale: "zh-hant", method: String(num), path: "/jieqian" })}
      className="inline-block mt-[var(--s-4)] t-label !text-[var(--paper)] border border-[var(--paper-66)] rounded-[2px] px-5 py-3 hover:border-[var(--paper)] transition-colors">
      想知道哪一天？為這件事起一卦 →
    </Link>
  );
}

/**
 * 10-13 解籤承接 (Neil: 「维持 NT$75，但含 1 次追问」): the one follow-up the personal reading includes, under it. Once
 * answered it stays on the page; a timing question (or an answer that says the lot has said what it can) ends at the
 * cast door, because the days are what the cast gives.
 */
export function QianFollowup({ token, castHref, num, done }: {
  token: string; castHref: string; num: number; done: { question: string; answer: string; cast: boolean } | null;
}) {
  const [q, setQ] = useState("");
  const [state, setState] = useState<"idle" | "going" | "error" | "short">("idle");
  const [got, setGot] = useState(done);
  const send = async () => {
    const text = q.trim();
    if ([...text].length < 4) { setState("short"); return; }
    if (state === "going") return;
    setState("going");
    try {
      const r = await fetch("/api/qian/followup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, question: text }) });
      const j = (await r.json().catch(() => ({}))) as { answer?: string; cast?: boolean; error?: string };
      if (r.ok && j.answer) { setGot({ question: text, answer: j.answer, cast: !!j.cast }); return; }
      if (j.error === "used") { window.location.reload(); return; }
      setState("error");
    } catch { setState("error"); }
  };
  if (got) {
    return (
      <div className="mt-[var(--s-5)] pt-[var(--s-4)] border-t border-[var(--ink-16)]">
        <p className="t-label !text-[var(--ink-45)]">你追問的</p>
        <p className="t-small mt-1 !text-[var(--ink-66)]">「{got.question}」</p>
        <p className="t-body leading-relaxed mt-[var(--s-3)]">{got.answer}</p>
        {got.cast && (
          <Link href={castHref} data-heat="qian-followup-cast" onClick={() => track("qian_cast_click", { locale: "zh-hant", method: `${num}:followup`, path: "/jieqian" })}
            className="inline-block mt-[var(--s-4)] min-h-[var(--s-6)] px-6 py-3 rounded-[2px] bg-[var(--ink)] text-[var(--paper)] tracking-[0.12em] text-[13px] hover:opacity-90 transition">
            帶著這件事起一卦，看哪幾天 →
          </Link>
        )}
      </div>
    );
  }
  return (
    <div className="mt-[var(--s-5)] pt-[var(--s-4)] border-t border-[var(--ink-16)]">
      <p className="t-label !text-[var(--gold-text)]">這份解讀含一次追問</p>
      <p className="t-small mt-1 !text-[var(--ink-66)]">對這支籤、這件事還有哪裡想不通，問一句。想問哪一天，籤不給日子，起一卦才看得到。</p>
      <textarea value={q} onChange={(e) => { setQ(e.target.value.slice(0, 200)); if (state === "short") setState("idle"); }} rows={3} maxLength={200}
        placeholder="例如：如果他一直沒消息，我要先主動嗎？"
        className="mt-[var(--s-3)] w-full rounded-[2px] border border-[var(--ink-16)] bg-transparent px-3 py-2 t-body !text-[16px] focus:outline-none focus:border-[var(--ink-45)]" />
      <div className="mt-2 flex items-center gap-4">
        <button type="button" onClick={() => void send()} disabled={state === "going"} data-heat="qian-followup"
          className="min-h-[var(--s-6)] px-6 py-2.5 rounded-[2px] border border-[var(--ink)] text-[var(--ink)] tracking-[0.12em] text-[13px] hover:bg-[var(--ink)] hover:text-[var(--paper)] transition disabled:opacity-45">
          {state === "going" ? "正在寫…" : "送出追問"}
        </button>
        <span className="t-small !text-[var(--ink-45)] tabular-nums">{[...q].length}/200</span>
      </div>
      {state === "short" && <p className="t-small mt-2 !text-[var(--cinnabar)]">多寫幾個字，才答得到點上。</p>}
      {state === "error" && <p className="t-small mt-2 !text-[var(--cinnabar)]">這次沒寫出來，追問還在，稍後再送一次。</p>}
    </div>
  );
}

/** 10-12 解籤 · 次路径: 「這支籤放在我這件事上」 at the light-reading price, in the page's currency. */
export function QianPersonalBuy({ token, member = false, pass = false }: { token: string; /** 10-12 承接: a member with light readings left — no payment */ member?: boolean;
  /** 10-24 (Neil: 「会员是会员，通卡是通卡」): the covered reader holds a 通卡, not a membership — say 通卡 */ pass?: boolean }) {
  const covered = pass ? "通卡" : "會員";
  const [currency] = useCurrency();
  const [state, setState] = useState<"idle" | "going" | "error">("idle");
  // 10-22 通卡: the passes stand where the single price stood (a pass holder is `member` here)
  const tk = useTongka();
  const price = formatMoney(currency, priceMinor(currency, "one"), "zh-hant");
  const go = async () => {
    if (state === "going") return;
    setState("going");
    try {
      const r = await checkoutV2("qian_personal", { token, currency, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, tzOffsetMinutes: -new Date().getTimezoneOffset() }); // 10-22 进度表 57
      const j = (await r.json().catch(() => ({}))) as { url?: string };
      if (r.ok && j.url) { window.location.assign(j.url); return; }
      setState("error");
    } catch { setState("error"); }
  };
  // 10-24 (Neil: 塔羅結果頁「沒有付費引導嗎？」): until /api/me answers, the passes' frame — never the retired single price first
  if (!member && !tk.loaded) return <TongkaSkeleton locale={"zh-hant"} />;
  if (tk.tongka && !member && !tk.covered) {
    return (
      <div>
        <PassReturn locale="zh-hant" />
        <TongkaPanel locale="zh-hant" currency={currency} first={tk.first} compact title={null} lead={null} returnTo={typeof window === "undefined" ? undefined : window.location.pathname} />
        <ul className="mt-[var(--s-3)] space-y-1 t-small !text-[var(--ink-66)]">
          <li>· 籤詩白話：每一句在說什麼，放在感情或工作上怎麼讀</li>
          <li>· 照你的問題寫的專屬解讀：這支籤放在你這件事上怎麼看</li>
          <li>· 一句現在可以留意或去做的事</li>
          <li>· <b className="font-medium text-[var(--ink)]">含一次追問</b>：讀完還有想不通的，再問一句</li>
          <li>· 不給日期：哪幾天，要起一卦看</li>
        </ul>
      </div>
    );
  }
  return (
    <div>
      {tk.tongka && <PassReturn locale="zh-hant" />}
      <button type="button" onClick={() => void go()} disabled={state === "going"} data-heat="qian-personal-buy"
        className="min-h-[var(--s-6)] px-7 py-3 rounded-[2px] border border-[var(--ink)] text-[var(--ink)] tracking-[0.12em] text-[13px] hover:bg-[var(--ink)] hover:text-[var(--paper)] transition disabled:opacity-45">
        {state === "going" ? (member ? "正在寫…" : "正在前往付款…") : member ? `解這支籤 · ${covered}已含` : `解這支籤 · ${price}`}
      </button>
      {state === "error" && <p className="t-small mt-2 !text-[var(--cinnabar)]">沒能打開付款頁，稍後再試一次。</p>}
      {/* 10-13 承接: what the reading is — and what it is not (the days are the cast's) */}
      <ul className="mt-[var(--s-3)] space-y-1 t-small !text-[var(--ink-66)]">
        <li>· 籤詩白話：每一句在說什麼，放在感情或工作上怎麼讀</li>
        <li>· 照你的問題寫的專屬解讀：這支籤放在你這件事上怎麼看</li>
        <li>· 一句現在可以留意或去做的事</li>
        <li>· <b className="font-medium text-[var(--ink)]">含一次追問</b>：讀完還有想不通的，再問一句</li>
        <li>· 不給日期：哪幾天，要起一卦看</li>
      </ul>
      {member ? (
        <p className="t-small mt-2 !text-[var(--ink-45)]">{covered}已含，不另收費。</p>
      ) : (
        <p className="t-small mt-2 !text-[var(--ink-45)]">寫好也會寄到付款時填的信箱。會員已含。點擊付款即表示你同意<a href="/zh-hant/terms" className="underline underline-offset-4">服務條款</a>，並要求立即交付這份數位內容。</p>
      )}
    </div>
  );
}
