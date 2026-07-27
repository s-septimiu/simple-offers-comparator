import { eur, ron, num, pct } from '../format.js'
import { isSrl } from '../engine/compute.js'
import { hasTimeline } from '../engine/schedule.js'
import {
  MICRO_TAX_RATE,
  PROFIT_TAX_RATE,
  DIVIDEND_TAX_RATE,
  CAS_RATE,
  CASS_RATE,
  TAX_RATE,
  CAM_RATE,
  TICKET_NET_RATIO,
} from '../fiscal/constants.js'

/**
 * The full derivation, line by line, each naming its legal basis.
 *
 * This is the part that decides whether a sceptical developer trusts the tool.
 * A single take-home figure is an assertion; a derivation that adds up in front
 * of you is an argument. It is also the PDF body — printing force-expands it.
 *
 * Every line here must reconcile to the headline. If a figure cannot be shown
 * honestly it should not be in the model.
 */
export default function MathDrilldown({ offer, result, engagementResult, globals }) {
  const rows = buildRows(offer, result, globals)

  return (
    <div className="text-[11px]">
      <table className="w-full">
        <caption className="sr-only">Line-by-line derivation for {offer.name}</caption>
        <tbody>
          {rows.map((r, i) =>
            r.divider ? (
              <tr key={i}>
                <td colSpan={2} className="pt-2.5 pb-1">
                  <div className="text-[9px] font-bold uppercase tracking-[0.14em] ink-3">{r.divider}</div>
                </td>
              </tr>
            ) : (
              <tr key={i} className={r.total ? 'border-t rule' : ''}>
                <td className={`py-1 pr-3 align-top ${r.total ? 'font-bold ink' : 'ink-2'}`}>
                  {r.label}
                  {r.note && <div className="ink-3 text-[10px] leading-snug mt-0.5">{r.note}</div>}
                </td>
                <td
                  className={`py-1 text-right tabular-nums whitespace-nowrap align-top ${
                    r.total ? 'font-black ink' : r.negative ? 'ink-2' : 'ink'
                  }`}
                >
                  {r.value}
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>

      {hasTimeline(offer) && engagementResult && (
        <div className="mt-3 pt-2.5 border-t rule">
          <div className="text-[9px] font-bold uppercase tracking-[0.14em] ink-3 mb-1.5">
            What you actually bank
          </div>
          <p className="ink-2 leading-relaxed mb-2">
            The figures above are a settled year, so offers stay comparable. This is the same
            offer as actually scheduled — {describeTimeline(offer)} — taxed on its own income,
            per calendar year. It is not the figure above scaled.
          </p>
          <div className="flex justify-between items-baseline">
            <span className="ink-2">
              Take-home over {num(engagementResult.activeMonths)} month
              {engagementResult.activeMonths === 1 ? '' : 's'}
            </span>
            <span className="font-black ink tabular-nums">{eur(engagementResult.takeHomeEUR)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function describeTimeline(o) {
  const parts = []
  if (o.startMonth > 1) parts.push(`starting in month ${o.startMonth}`)
  if (o.contractMonths > 0 && o.contractMonths < 12) parts.push(`${o.contractMonths} months long`)
  if (o.probationMonths > 0 && o.probationPct !== 100) {
    parts.push(`${o.probationMonths} months of probation at ${o.probationPct}%`)
  }
  if (o.raiseAtMonth > 0 && o.raisePct !== 0) {
    parts.push(`a ${o.raisePct}% raise at month ${o.raiseAtMonth}`)
  }
  return parts.join(', ') || 'as configured'
}

function buildRows(offer, r, globals) {
  const rows = []
  const push = (label, value, opts = {}) => rows.push({ label, value, ...opts })
  const divider = (d) => rows.push({ divider: d })
  const neg = (v) => '−' + ron(Math.abs(v))

  divider('Working year')
  push('Days in the working year', num(r.work.contractDays), {
    note: offer.daysPerWeek !== 5 ? `${offer.daysPerWeek} days/week, pro-rated` : null,
  })
  push('Days you actually work', num(r.work.daysWorked), {
    note: `after ${num(globals.vacationDays)} holiday and ${num(globals.sickDays)} sick days`,
  })
  if (r.work.unpaidOff > 0) {
    push('Of which unpaid', num(r.work.unpaidOff), {
      note:
        offer.engagement === 'cim'
          ? 'holiday beyond entitlement; sick leave is covered separately'
          : 'on B2B no absence is covered unless the contract grants it',
    })
  }
  push('Hours worked', num(r.work.hoursWorked))

  if (isSrl(offer.engagement)) {
    const s = r.srl
    if (!s) return rows

    divider(s.regime === 'micro' ? 'Company — microenterprise' : 'Company — profit tax')
    push('Turnover invoiced', ron(s.turnover))
    push('Deductible costs', neg(r.expensesRON), { negative: true })
    push('Salary of the mandatory employee', neg(s.salaryGross), {
      negative: true,
      note: 'micro status requires at least one employee — in practice, yourself',
    })
    push(`CAM at ${pct(CAM_RATE * 100)}`, neg(s.cam), {
      negative: true,
      note: 'employer-borne, on top of gross',
    })
    if (s.regime === 'micro') {
      push(`Micro tax at ${pct(MICRO_TAX_RATE * 100)}`, neg(s.companyTax), {
        negative: true,
        note: 'charged on turnover, not profit — expenses do not reduce it',
      })
    } else {
      push(`Profit tax at ${pct(PROFIT_TAX_RATE * 100)}`, neg(s.companyTax), { negative: true })
    }
    push('Distributable profit', ron(s.dividendsGross + s.retained))

    divider('Your salary')
    push(`CAS at ${pct(CAS_RATE * 100)}`, neg(s.salaryCas), { negative: true })
    push(`CASS at ${pct(CASS_RATE * 100)}`, neg(s.salaryCass), { negative: true })
    push(`Income tax at ${pct(TAX_RATE * 100)}`, neg(s.salaryTax), { negative: true })
    push('Net salary', ron(s.salaryNet))

    divider('Your dividends')
    push('Gross distributed', ron(s.dividendsGross))
    push(`Dividend tax at ${pct(DIVIDEND_TAX_RATE * 100)}`, neg(s.dividendTax), {
      negative: true,
      note: 'raised from 10% for 2026',
    })
    push('CASS on dividends', neg(s.dividendCass), {
      negative: true,
      note: s.dividendCass > 0
        ? 'a fixed step, not a percentage — 10% of a threshold, whatever you received'
        : 'below the 6-minimum-wage threshold, so nothing is owed',
    })
    push('Net dividends', ron(s.dividendsNet))
    if (s.retained > 0.5) {
      push('Left in the company', ron(s.retained), {
        note: 'not distributed, so not take-home — but not lost either',
      })
    }
  } else if (offer.engagement === 'cim') {
    divider('Payroll')
    push('Annual gross', ron(r.grossRON))
    if (r.deductionRON > 0.5) {
      push('Personal deduction', ron(r.deductionRON), {
        note: 'reduces the income-tax base; phases out 2.000 lei above the minimum wage',
      })
    }
    push(`CAS at ${pct(CAS_RATE * 100)}`, neg(r.casRON), { negative: true })
    push(`CASS at ${pct(CASS_RATE * 100)}`, neg(r.cassRON), { negative: true })
    push(`Income tax at ${pct(TAX_RATE * 100)}`, neg(r.taxRON), { negative: true })
    push('Employer cost', ron(r.employerCostRON), {
      note: `gross plus ${pct(CAM_RATE * 100)} CAM — what the role really costs to fill`,
    })
  } else {
    divider('PFA — sistem real')
    push('Gross receipts', ron(r.grossRON))
    push('Deductible costs', neg(r.expensesRON), { negative: true })
    push('CAS', neg(r.casRON), {
      negative: true,
      note: r.casRON > 0
        ? 'charged on a fixed base of 12 or 24 minimum wages, not on your income'
        : 'below the 12-minimum-wage floor, so nothing is owed',
    })
    push('CASS', neg(r.cassRON), {
      negative: true,
      note: 'on net income, floored at 6 and capped at 72 minimum wages',
    })
    push(`Income tax at ${pct(TAX_RATE * 100)}`, neg(r.taxRON), {
      negative: true,
      note: 'after both contributions, which are deductible',
    })
  }

  if (r.ticketsNetRON > 0.5 || r.benefitsRON > 0.5) {
    divider('On top')
    if (r.ticketsNetRON > 0.5) {
      push('Meal tickets', ron(r.ticketsNetRON), {
        note: `${ron(r.ticketNominalRON)} nominal, kept at ${pct(TICKET_NET_RATIO * 100, 0)} — CAS-exempt, so better per leu than salary`,
      })
    }
    if (r.benefitsRON > 0.5) push('Other perks', ron(r.benefitsRON))
  }

  divider('Result')
  push('Take-home for the year', `${ron(r.takeHomeRON)} · ${eur(r.takeHomeEUR)}`, { total: true })
  push('Per month', `${ron(r.monthlyRON)} · ${eur(r.monthlyEUR)}`)
  if (r.work.hoursWorked > 0) push('Per hour worked', eur(r.perHourEUR, 1))
  push('Kept from every leu', pct(r.keepRatio))
  push('Pension credited', ron(r.pensionRON), {
    note: isSrl(offer.engagement)
      ? 'only the minimum-wage salary accrues pension — the hidden cost of this route'
      : null,
  })

  return rows
}
