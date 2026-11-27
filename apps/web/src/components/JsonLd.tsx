import { jsonLdBlocks } from "@/lib/json-ld";

/** Structured data for search engines: one escaped <script type="application/ld+json"> per node (see lib/json-ld). */
export default function JsonLd({ data }: { data: object | readonly object[] }) {
  return (
    <>
      {jsonLdBlocks(data).map((json, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
      ))}
    </>
  );
}
