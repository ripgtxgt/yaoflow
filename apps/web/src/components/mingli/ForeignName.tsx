import JsonLd from "@/components/JsonLd";
import TrackOnce from "@/components/TrackOnce";
import ProductPage from "@/components/product/ProductPage";
import CrossCards from "@/components/CrossCards";
import { featureState } from "@/lib/features";
import { EL_JA, EL_KO, JA_NAME, KO_NAME } from "@/lib/mingli/name/foreign-text";
import { JaNameForm, KoNameForm } from "@/components/mingli/ForeignNameForm";

/**
 * 10-30 进度表 128 ⑥ — 姓名判断 (ja) and 성명학 (ko): the product page; the form and its result run in the browser
 * (components/mingli/ForeignNameForm.tsx, numbers from /api/name/foreign). Numbers and their 五行 only.
 */
const faqLd = (faq: { q: string; a: string }[]) => ({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) });

export function JaNamePage() {
  const T = JA_NAME;
  return (
    <ProductPage locale="ja" preview={featureState("name") === "preview"} title={T.title} lead={T.lead}
      input={<JaNameForm T={T} EL={EL_JA} />}
      fit={{ yes: T.fitYes, no: T.fitNo }} how={T.how} free={T.free} boundary={T.boundary} faq={T.faq}
      promo={<CrossCards source="daily" locale="ja" exclude={["name"]} />}>
      <JsonLd data={faqLd(T.faq)} />
      <TrackOnce event="name" locale="ja" method="view" />
    </ProductPage>
  );
}
export function KoNamePage() {
  const T = KO_NAME;
  return (
    <ProductPage locale="ko" preview={featureState("name") === "preview"} title={T.title} lead={T.lead}
      input={<KoNameForm T={T} EL={EL_KO} />}
      fit={{ yes: T.fitYes, no: T.fitNo }} how={T.how} free={T.free} boundary={T.boundary} faq={T.faq}
      promo={<CrossCards source="daily" locale="ko" exclude={["name"]} />}>
      <JsonLd data={faqLd(T.faq)} />
      <TrackOnce event="name" locale="ko" method="view" />
    </ProductPage>
  );
}
