import { eur, pct } from '../format.js'

/**
 * Where every gross leu goes.
 *
 * The old version encoded meaning in colour opacity alone and exposed the
 * amounts only through `title` tooltips — invisible to a screen reader,
 * unreachable by keyboard, and gone entirely in print. Each segment is now a
 * focusable element with a real text alternative, and a table carrying the same
 * numbers renders underneath when printing.
 */

const SEGMENTS = [
  { key: 'Take-home', opacity: 1, of: (r) => r.takeHomeRON - r.ticketsNetRON - r.benefitsRON },
  { key: 'Meal tickets + perks', opacity: 0.72, of: (r) => r.ticketsNetRON + r.benefitsRON },
  { key: 'Pension (CAS)', opacity: 0.44, of: (r) => r.casRON },
  { key: 'Health (CASS)', opacity: 0.32, of: (r) => r.cassRON },
  { key: 'Tax', opacity: 0.22, of: (r) => r.taxRON },
  { key: 'Business costs', opacity: 0.14, of: (r) => r.expensesRON },
  { key: 'Unpaid leave', opacity: 0.07, of: (r) => r.unpaidLossRON },
]

export default function Waterfall({ offers, results, scale, eurRon }) {
  const toEur = (v) => (eurRon > 0 ? v / eurRon : 0)

  return (
    <div className="space-y-3">
      {offers.map((o, i) => {
        const r = results[i]
        const segs = SEGMENTS.map((s) => ({ ...s, value: s.of(r) })).filter((s) => s.value > 0.5)
        const total = segs.reduce((a, s) => a + s.value, 0)
        const width = scale > 0 ? (total / scale) * 100 : 0

        return (
          <div key={o.id} className="print-avoid-break">
            <div className="flex items-baseline justify-between mb-1 gap-2">
              <span className="text-xs font-bold ink truncate">{o.name}</span>
              <span className="text-[11px] tabular-nums ink-3 shrink-0">
                keeps{' '}
                <span className="font-bold" style={{ color: o.color.hex }}>
                  {pct(r.keepRatio)}
                </span>
              </span>
            </div>

            <div
              className="flex h-7 rounded-md overflow-hidden"
              style={{ width: `${Math.max(width, 2)}%`, background: 'var(--line-soft)' }}
              role="img"
              aria-label={`${o.name}: ${segs
                .map((s) => `${s.key} ${eur(toEur(s.value))}`)
                .join(', ')}`}
            >
              {segs.map((s) => (
                <div
                  key={s.key}
                  tabIndex={0}
                  title={`${s.key}: ${eur(toEur(s.value))} (${pct((s.value / total) * 100)})`}
                  aria-label={`${s.key}: ${eur(toEur(s.value))}`}
                  style={{
                    width: `${(s.value / total) * 100}%`,
                    background: o.color.hex,
                    opacity: s.opacity,
                  }}
                  className="h-full border-r border-white/40 last:border-r-0"
                />
              ))}
            </div>
          </div>
        )
      })}

      <div className="flex flex-wrap gap-x-3 gap-y-1 pt-2 border-t rule-soft">
        {SEGMENTS.map((s) => (
          <span key={s.key} className="flex items-center gap-1 text-[10px] ink-3">
            <span
              className="w-2 h-2 rounded-sm"
              style={{ background: 'var(--ink-2)', opacity: s.opacity }}
            />
            {s.key}
          </span>
        ))}
      </div>

      {/* Bars are meaningless on paper without their numbers. */}
      <table className="print-only w-full text-[10px] mt-3">
        <thead>
          <tr>
            <th className="text-left py-1">Offer</th>
            {SEGMENTS.map((s) => (
              <th key={s.key} className="text-right py-1 px-1">{s.key}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {offers.map((o, i) => (
            <tr key={o.id}>
              <td className="py-0.5">{o.name}</td>
              {SEGMENTS.map((s) => (
                <td key={s.key} className="text-right py-0.5 px-1 tabular-nums">
                  {eur(toEur(s.of(results[i])))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
