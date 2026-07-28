import { eur, ron, num, pct, signedEur } from '../format.js'
import { hasTimeline } from '../engine/schedule.js'
import { isSrl } from '../engine/compute.js'

/**
 * The line-by-line comparison.
 *
 * The first column is sticky because the table scrolls horizontally as soon as
 * there are more than three offers, and a row of numbers whose label has
 * scrolled off screen is worse than no table.
 */
export default function ComparisonTable({ offers, results, engagementResults, bestIdx, pensionWeight, metric }) {
  const anyTimeline = offers.some(hasTimeline)
  const bestMetric = bestIdx >= 0 ? metric(results[bestIdx]) : 0

  const rows = [
    { l: 'Days you actually work', f: (r) => num(r.work.daysWorked) },
    {
      l: 'Annual gross',
      f: (r) => eur(r.grossEUR),
      sub: (r) => ron(r.grossRON),
    },
    {
      l: 'Lost to unpaid leave',
      f: (r) => (r.unpaidLossEUR > 0.5 ? '−' + eur(r.unpaidLossEUR) : 'covered'),
      dim: (r) => r.unpaidLossEUR <= 0.5,
    },
    {
      l: 'Contributions + tax',
      f: (r) => '−' + eur(r.casEUR + r.cassEUR + r.taxEUR),
      sub: (r) => pct(((r.casEUR + r.cassEUR + r.taxEUR) / Math.max(r.grossEUR, 1)) * 100) + ' of gross',
    },
    {
      l: 'Business costs',
      f: (r) => (r.expensesEUR > 0 ? '−' + eur(r.expensesEUR) : '—'),
      dim: (r) => r.expensesEUR === 0,
    },
    {
      l: 'Meal tickets + perks',
      f: (r) => (r.ticketsNetEUR + r.benefitsEUR > 0.5 ? '+' + eur(r.ticketsNetEUR + r.benefitsEUR) : '—'),
      dim: (r) => r.ticketsNetEUR + r.benefitsEUR <= 0.5,
    },
    {
      l: 'Cost to the payer',
      f: (r) => eur(r.employerCostEUR),
      sub: () => 'incl. employer contributions',
    },
  ]

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" style={{ minWidth: 150 + offers.length * 140 }}>
          <caption className="sr-only">Offer comparison, line by line</caption>
          <thead>
            {/* Plain surface, not the tinted `--line-soft` the rest of the page
                uses for label bars: this row sits immediately under the panel
                head, which is already tinted, and two stacked grey bands read
                as one fat ambiguous header. */}
            <tr className="border-b-2 rule" style={{ background: 'var(--surface)' }}>
              <th
                scope="col"
                className="text-left px-3 py-2.5 text-[10px] font-bold ink-3 uppercase tracking-[0.12em] sticky left-0 z-10"
                style={{ background: 'var(--surface)' }}
              >
                Line
              </th>
              {offers.map((o) => (
                <th
                  key={o.id}
                  scope="col"
                  className="text-right px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em]"
                  style={{ color: o.color.hex }}
                >
                  {o.name}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr key={row.l} className="border-b rule-soft">
                <th
                  scope="row"
                  className="text-left px-3 py-2 text-xs ink-2 font-medium sticky left-0 z-10"
                  style={{ background: 'var(--surface)' }}
                >
                  {row.l}
                </th>
                {results.map((r, i) => (
                  <td
                    key={i}
                    className={`px-3 py-2 text-right text-xs font-bold tabular-nums ${
                      row.dim?.(r) ? 'ink-3' : 'ink'
                    }`}
                  >
                    {row.f(r)}
                    {row.sub && <div className="text-[10px] font-medium ink-3">{row.sub(r)}</div>}
                  </td>
                ))}
              </tr>
            ))}

            {/* The bottom line, given the emphasis it deserves. */}
            <tr style={{ background: 'var(--inverse)' }}>
              <th
                scope="row"
                className="text-left px-3 py-3 text-xs font-bold sticky left-0 z-10"
                style={{ background: 'var(--inverse)', color: 'var(--inverse-ink)' }}
              >
                Take-home / year
              </th>
              {results.map((r, i) => (
                <td key={i} className="px-3 py-3 text-right tabular-nums">
                  <div
                    className="text-sm font-black"
                    style={{ color: i === bestIdx ? offers[i].color.hex : 'var(--inverse-ink)' }}
                  >
                    {eur(r.takeHomeEUR)}
                  </div>
                  <div className="text-[10px] font-semibold" style={{ color: 'var(--ink-3)' }}>
                    {ron(r.annualRON)}
                  </div>
                </td>
              ))}
            </tr>

            <tr className="border-b rule-soft">
              <th
                scope="row"
                className="text-left px-3 py-2 text-xs ink-2 font-medium sticky left-0 z-10"
                style={{ background: 'var(--surface)' }}
              >
                Difference vs leader
              </th>
              {results.map((r, i) => (
                <td key={i} className="px-3 py-2 text-right text-xs font-bold tabular-nums">
                  {i === bestIdx ? (
                    <span className="ink-3">leader</span>
                  ) : (
                    <span className="text-rose-600">{signedEur(metric(r) - bestMetric)}</span>
                  )}
                </td>
              ))}
            </tr>

            {anyTimeline && (
              <tr className="border-b rule-soft">
                <th
                  scope="row"
                  className="text-left px-3 py-2 text-xs ink-2 font-medium sticky left-0 z-10"
                  style={{ background: 'var(--surface)' }}
                >
                  Contract total
                  <div className="text-[10px] ink-3 font-normal">as actually scheduled</div>
                </th>
                {engagementResults.map((r, i) => (
                  <td key={i} className="px-3 py-2 text-right text-xs font-bold tabular-nums ink">
                    {hasTimeline(offers[i]) ? (
                      <>
                        {eur(r.takeHomeEUR)}
                        <div className="text-[10px] font-medium ink-3">
                          over {num(r.activeMonths)} mo
                        </div>
                      </>
                    ) : (
                      <span className="ink-3">—</span>
                    )}
                  </td>
                ))}
              </tr>
            )}

            <tr className="border-b rule-soft">
              <th
                scope="row"
                className="text-left px-3 py-2 text-xs ink-2 font-medium sticky left-0 z-10"
                style={{ background: 'var(--surface)' }}
              >
                Pension credited (CAS)
              </th>
              {results.map((r, i) => (
                <td key={i} className="px-3 py-2 text-right text-xs font-bold tabular-nums ink">
                  {eur(r.pensionEUR)}
                  {isSrl(offers[i].engagement) && (
                    <div className="text-[10px] font-medium ink-3">
                      {r.pensionEUR > 0.5 ? 'on the salary only' : 'no salary, no pension'}
                    </div>
                  )}
                </td>
              ))}
            </tr>

            <tr>
              <th
                scope="row"
                className="text-left px-3 py-2 text-xs ink-2 font-medium sticky left-0 z-10"
                style={{ background: 'var(--surface)' }}
              >
                Take-home + {pensionWeight}% of pension
              </th>
              {results.map((r, i) => (
                <td
                  key={i}
                  className="px-3 py-2 text-right text-xs font-black tabular-nums"
                  style={{ color: offers[i].color.hex }}
                >
                  {eur(r.valueEUR)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
    </div>
  )
}
