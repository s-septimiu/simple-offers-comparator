/**
 * The one section container on the page.
 *
 * Sections used to each spell out `surface rounded-xl border p-4 mb-4` and had
 * quietly drifted apart. On a page this dense the chrome has to be invisible —
 * every border that differs from its neighbour reads as a meaningful
 * distinction and costs the reader a glance to dismiss.
 *
 * `bodyClass` exists for the comparison table, which brings its own padding
 * because its cells have to reach the panel edge for the sticky first column
 * to look right.
 */
export default function Panel({ title, aside, children, className = '', bodyClass = 'p-4' }) {
  return (
    <section className={`panel print-avoid-break ${className}`}>
      {title && (
        <div className="panel-head px-4 py-2 flex items-baseline justify-between gap-2 flex-wrap">
          <h2 className="text-[10px] font-bold ink-3 uppercase tracking-[0.14em]">{title}</h2>
          {aside}
        </div>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  )
}

/** The summary line of a collapsed section. Caret rotation is in styles.css. */
export function Disclosure({ children, count }) {
  return (
    <summary className="disclosure no-print text-[10px] font-bold uppercase tracking-[0.12em] ink-3 hover:ink-2 py-1">
      <span className="caret">›</span>
      {children}
      {count != null && count > 0 && (
        <span className="ml-auto text-[9px] font-black tabular-nums ink-3">{count}</span>
      )}
    </summary>
  )
}
