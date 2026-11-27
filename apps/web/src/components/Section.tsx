/**
 * A numbered section of the dossier. The number is the only ornament;
 * sections are separated by a hairline rather than by extra size.
 */
export default function Section({
  n,
  title,
  children,
  last = false,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <section className={`pt-[var(--s-5)] ${last ? "pb-4" : "pb-[var(--s-6)]"} border-t border-[var(--ink-16)]`}>
      <h2 className="t-sect mb-[var(--s-4)]">
        <span className="font-[family-name:var(--mono)] mr-2">{n}</span>
        <span aria-hidden className="mr-2">·</span>
        {title}
      </h2>
      {children}
    </section>
  );
}
