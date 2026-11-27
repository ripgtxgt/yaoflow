import type { ReactNode } from "react";
import PageShell, { PreviewNote } from "@/components/ui/PageShell";
import type { Locale } from "@/lib/locales";

/**
 * 10-22 进度表 76 B — the product page, one template (调研结论 §三: 9 fixed blocks, only the content changes):
 *   1 一句話＋輸入區 (title, lead, input)   2 示例 (sample)   3 適合問／不適合問 (fit)   4 怎麼做 (how)
 *   5 免費看什麼／付費多什麼 (free, paid)   6 界線 (boundary)   7 FAQ (faq)   8 順帶看看 (promo — the PromoStrip)   9 免責 (disclaimer)
 * A block left out is simply not rendered; the order never changes. Section titles in nine languages live here, so a
 * product supplies its words only.
 */
export interface ProductPageProps {
  locale: Locale;
  preview?: boolean;
  title: string; lead?: string;
  input: ReactNode;
  sample?: ReactNode;
  fit?: { yes: string[]; no: string[] };
  how?: string[];
  free?: string | string[]; paid?: string | string[];
  boundary?: string | string[];
  faq?: { q: string; a: string }[];
  promo?: ReactNode;
  disclaimer?: string;
  /** anything that does not fit the blocks (a chart, a 3D scene) — rendered right after the input */
  children?: ReactNode;
}

const T: Record<string, Record<Locale, string>> = {
  sample: { zh: "示例", "zh-hant": "示例", en: "An example", ja: "例", ko: "예시", fr: "Un exemple", de: "Ein Beispiel", es: "Un ejemplo", pt: "Um exemplo" },
  fitYes: { zh: "适合问", "zh-hant": "適合問", en: "Good for", ja: "向いている問い", ko: "어울리는 질문", fr: "Convient pour", de: "Geeignet für", es: "Adecuado para", pt: "Adequado para" },
  fitNo: { zh: "不适合问", "zh-hant": "不適合問", en: "Not for", ja: "向かない問い", ko: "맞지 않는 질문", fr: "Ne convient pas pour", de: "Nicht für", es: "No es para", pt: "Não é para" },
  how: { zh: "怎么做", "zh-hant": "怎麼做", en: "How it works", ja: "進め方", ko: "진행 방법", fr: "Comment ça marche", de: "So geht es", es: "Cómo funciona", pt: "Como funciona" },
  free: { zh: "免费看什么", "zh-hant": "免費看什麼", en: "What is free", ja: "無料で見られるもの", ko: "무료로 보는 것", fr: "Ce qui est gratuit", de: "Was kostenlos ist", es: "Lo que es gratis", pt: "O que é grátis" },
  paid: { zh: "付费多什么", "zh-hant": "付費多什麼", en: "What paying adds", ja: "有料で加わるもの", ko: "유료로 더해지는 것", fr: "Ce que le paiement ajoute", de: "Was Bezahlen hinzufügt", es: "Lo que añade pagar", pt: "O que pagar acrescenta" },
  boundary: { zh: "界线", "zh-hant": "界線", en: "Where we stop", ja: "扱わないこと", ko: "다루지 않는 것", fr: "Nos limites", de: "Unsere Grenzen", es: "Nuestros límites", pt: "Nossos limites" },
  faq: { zh: "常见问题", "zh-hant": "常見問題", en: "Questions", ja: "よくある質問", ko: "자주 묻는 질문", fr: "Questions", de: "Fragen", es: "Preguntas", pt: "Perguntas" },
};
const list = (x: string | string[] | undefined) => (x === undefined ? [] : Array.isArray(x) ? x : [x]);

function Block({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="mt-[var(--s-6)]">
      <h2 className="t-sect">{title}</h2>
      <div className="mt-[var(--s-2)]">{children}</div>
    </section>
  );
}
const Lines = ({ items }: { items: string[] }) => (
  <ul className="grid gap-1.5">{items.map((x) => <li key={x} className="t-body leading-relaxed flex gap-2"><span className="!text-[var(--gold-text)]">·</span><span>{x}</span></li>)}</ul>
);

/** 10-22 进度表 76 ⑤: blocks 2–9 on their own, for a page whose input takes over the screen (the cast page hides them once a figure is up) */
export type ProductBlocksProps = Pick<ProductPageProps, "locale" | "sample" | "fit" | "how" | "free" | "paid" | "boundary" | "faq" | "promo" | "disclaimer">;
export function ProductBlocks(p: ProductBlocksProps) {
  const l = p.locale;
  return (
    <>
      {p.sample && <Block title={T.sample![l]} id="sample">{p.sample}</Block>}
      {p.fit && (p.fit.yes.length > 0 || p.fit.no.length > 0) && (
        <Block title={T.fitYes![l]} id="fit">
          <Lines items={p.fit.yes} />
          {p.fit.no.length > 0 && <><h3 className="t-sect mt-[var(--s-4)]">{T.fitNo![l]}</h3><div className="mt-[var(--s-2)]"><Lines items={p.fit.no} /></div></>}
        </Block>
      )}
      {p.how && p.how.length > 0 && (
        <Block title={T.how![l]} id="how">
          <ol className="grid gap-2">{p.how.map((x, i) => <li key={x} className="t-body leading-relaxed grid grid-cols-[28px_1fr] gap-x-2"><span className="t-label !text-[var(--cinnabar)] pt-[3px]">{String(i + 1).padStart(2, "0")}</span><span>{x}</span></li>)}</ol>
        </Block>
      )}
      {(p.free || p.paid) && (
        <Block title={p.free ? T.free![l] : T.paid![l]} id="price">
          {p.free && <Lines items={list(p.free)} />}
          {p.paid && <>{p.free && <h3 className="t-sect mt-[var(--s-4)]">{T.paid![l]}</h3>}<div className={p.free ? "mt-[var(--s-2)]" : ""}><Lines items={list(p.paid)} /></div></>}
        </Block>
      )}
      {p.boundary && <Block title={T.boundary![l]} id="boundary"><Lines items={list(p.boundary)} /></Block>}
      {p.faq && p.faq.length > 0 && (
        <Block title={T.faq![l]} id="faq">
          <div className="grid gap-2">{p.faq.map((f) => <details key={f.q} className="border-t border-[var(--ink-16)] pt-2"><summary className="t-body cursor-pointer">{f.q}</summary><p className="t-small mt-2 !text-[var(--ink-66)] leading-relaxed">{f.a}</p></details>)}</div>
        </Block>
      )}
      {p.promo}
      {p.disclaimer && <p className="t-small mt-[var(--s-6)] !text-[var(--ink-45)]">{p.disclaimer}</p>}
    </>
  );
}

export default function ProductPage(p: ProductPageProps) {
  return (
    <PageShell>
      <PreviewNote on={!!p.preview} />
      <h1 className="t-d1">{p.title}</h1>
      {p.lead && <p className="t-body mt-[var(--s-3)] text-[var(--ink-66)]">{p.lead}</p>}
      <section className="mt-[var(--s-5)]">{p.input}</section>
      {p.children}
      <ProductBlocks {...p} />
    </PageShell>
  );
}
