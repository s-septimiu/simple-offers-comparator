/**
 * SRL — societate cu răspundere limitată, in both 2026 regimes.
 *
 * All figures RON, all annual.
 *
 * This is the structure most Romanian developers actually use above roughly
 * 5.000 €/month, and it is the one the old tool could not express at all. It
 * is also the most intricate, because take-home arrives through two different
 * pipes — a salary and a dividend — that are taxed on completely different
 * bases and interact through the company's profit.
 *
 * 2026 rules, all in force from 1 January:
 *   • micro: flat 1% of TURNOVER (the 3% tier is abolished), 100.000 € ceiling
 *   • micro requires at least one employee — in practice you hire yourself
 *   • dividends: 16% (up from 10%), plus CASS on a stepped threshold
 *   • outside micro: 16% on PROFIT
 */

import {
  CASS_RATE,
  MICRO_TAX_RATE,
  MICRO_REQUIRES_EMPLOYEE,
  PROFIT_TAX_RATE,
  DIVIDEND_TAX_RATE,
  DIVIDEND_CASS_BRACKET_MULTIPLES,
  PLAFON_ANCHOR,
  TICKET_NET_RATIO,
  TICKET_MAX,
  minimumWageForMonth,
} from './constants.js'
import { cimMonthlyFromGross } from './cim.js'

/* ── CASS on dividends ──────────────────────────────────────────────────── */

/** The three thresholds, in RON, ascending. */
export function dividendCassThresholds() {
  return DIVIDEND_CASS_BRACKET_MULTIPLES.map((m) => m * PLAFON_ANCHOR)
}

/**
 * CASS owed on dividend income.
 *
 * ⚠ This is a STEP function. You owe 10% of a *threshold*, never 10% of what
 * you received. Below 6 minimum wages you owe nothing; at 6 you abruptly owe
 * 2.430 lei; at 12, 4.860; at 24, 9.720.
 *
 * The consequence is that take-home is not monotonic in revenue — earning one
 * leu more can leave you thousands worse off. Every solver in this codebase
 * has to tolerate that, and the UI warns about it explicitly.
 *
 * Base assumption: the plafon is tested against GROSS dividends distributed,
 * cumulated with any other non-salary income. Salary income does not exempt
 * you — that changed in 2023.
 */
export function cassOnDividends(grossDividendsRON, otherPassiveIncomeRON = 0) {
  const assessable =
    Math.max(0, grossDividendsRON || 0) + Math.max(0, otherPassiveIncomeRON || 0)
  const thresholds = dividendCassThresholds()

  let base = 0
  for (const t of thresholds) if (assessable >= t) base = t

  return { cass: base * CASS_RATE, base, assessable }
}

/**
 * Detects the dead zone just above a CASS threshold.
 *
 * Crossing a threshold costs the whole step at once, so there is a band above
 * each one in which distributing MORE leaves you with LESS. The band ends where
 * the extra net dividend finally outweighs the step:
 *
 *   width = step / (1 − dividend tax rate)
 *
 * Returns null when the distribution is not inside such a band.
 */
export function dividendCassCliff(grossDividendsRON, otherPassiveIncomeRON = 0) {
  const assessable =
    Math.max(0, grossDividendsRON || 0) + Math.max(0, otherPassiveIncomeRON || 0)
  const thresholds = dividendCassThresholds()

  for (let i = thresholds.length - 1; i >= 0; i--) {
    const threshold = thresholds[i]
    if (assessable < threshold) continue

    const here = cassOnDividends(threshold).cass
    const below = i === 0 ? 0 : cassOnDividends(thresholds[i - 1]).cass
    const step = here - below
    const deadZoneWidth = step / (1 - DIVIDEND_TAX_RATE)
    const over = assessable - threshold

    if (over < deadZoneWidth) {
      return {
        threshold,
        over,
        step,
        deadZoneEnd: threshold + deadZoneWidth,
        /** Net gained by dropping just below the threshold instead. */
        netGainFromDropping: step - over * (1 - DIVIDEND_TAX_RATE),
      }
    }
    return null
  }
  return null
}

/* ── The full SRL chain ─────────────────────────────────────────────────── */

/**
 * @param {object} p
 * @param {number} p.turnoverRON            annual invoiced revenue
 * @param {number} p.expensesRON            annual deductible costs, excl. salary
 * @param {number} p.selfHireGrossMonthly   gross salary of the mandatory employee
 * @param {'micro'|'real'} p.regime
 * @param {number} p.payoutRatio            0–1, share of profit distributed
 * @param {number} p.microCeilingRON        100.000 € converted at the user's rate
 * @param {number} p.mealTicketPerDay       the company may grant these to itself
 * @param {number} p.workedDays
 * @param {number} p.dependents
 */
export function computeSrl(p) {
  const turnover = Math.max(0, p.turnoverRON || 0)
  const expenses = Math.max(0, p.expensesRON || 0)
  const payoutRatio = Math.min(Math.max(p.payoutRatio ?? 1, 0), 1)
  const microCeilingRON = p.microCeilingRON || Infinity

  // A company over the ceiling is no longer eligible, whatever the user picked.
  const overCeiling = turnover > microCeilingRON
  const regime = p.regime === 'micro' && !overCeiling ? 'micro' : 'real'

  /* 1 ── The mandatory employee. Micro status is conditional on having one,
   *      so its full cost is unavoidable, not optional.
   *
   *      `selfHireGrossMonthly == null` means "whatever the statutory minimum
   *      is that month" — which is not one number in 2026, since the minimum
   *      wage rose in July. Pinning it to a single figure would have the
   *      company illegally underpaying for half the year. */
  /* The employee requirement belongs to the MICRO regime, not to SRLs in
   * general. An unset salary therefore means the statutory minimum under
   * micro (where you have no choice) but genuinely nothing under the profit
   * tax regime (where you may simply take dividends). Charging a mandatory
   * salary in both would overstate the cost of the real regime. */
  const requiresEmployee = regime === 'micro' && MICRO_REQUIRES_EMPLOYEE
  const atStatutoryMinimum = p.selfHireGrossMonthly == null && requiresEmployee
  const noEmployee = p.selfHireGrossMonthly == null && !requiresEmployee

  /* Which calendar months the employee is actually on the payroll. Defaults to
   * the full year, but a mid-year start or a short contract pays fewer months —
   * and since the minimum wage rose in July, WHICH months matters, not just how
   * many. */
  const payrollMonths =
    Array.isArray(p.salaryMonths) && p.salaryMonths.length
      ? p.salaryMonths
      : Array.from({ length: 12 }, (_, i) => i + 1)

  const salaryMonths = payrollMonths.map((month) => {
    const gross = atStatutoryMinimum
      ? minimumWageForMonth(month)
      : noEmployee
        ? 0
        : Math.max(0, p.selfHireGrossMonthly || 0)
    return cimMonthlyFromGross(gross, { month, dependents: p.dependents || 0 })
  })
  const salary = salaryMonths.reduce(
    (a, m) => ({
      gross: a.gross + m.gross,
      cas: a.cas + m.cas,
      cass: a.cass + m.cass,
      tax: a.tax + m.tax,
      net: a.net + m.net,
      cam: a.cam + m.cam,
    }),
    { gross: 0, cas: 0, cass: 0, tax: 0, net: 0, cam: 0 },
  )

  /* 2 ── Meal tickets. CAS- and CAM-exempt, so 80% efficient against the
   *      58,5% of ordinary gross — the company can grant them to itself. */
  const ticketNominal =
    Math.min(Math.max(0, p.mealTicketPerDay || 0), TICKET_MAX) * Math.max(0, p.workedDays || 0)
  const ticketsNet = ticketNominal * TICKET_NET_RATIO

  /* 3 ── Company tax. The base differs fundamentally between regimes:
   *      micro taxes REVENUE, real taxes PROFIT. Expenses are irrelevant to
   *      a micro's tax bill — the most misunderstood thing about the regime. */
  const costsBeforeTax = salary.gross + salary.cam + expenses + ticketNominal
  const profitBeforeTax = turnover - costsBeforeTax

  const companyTax =
    regime === 'micro'
      ? turnover * MICRO_TAX_RATE
      : Math.max(0, profitBeforeTax) * PROFIT_TAX_RATE

  /* 4 ── Distribution. */
  const distributable = Math.max(0, profitBeforeTax - companyTax)
  const dividendsGross = distributable * payoutRatio
  const dividendTax = dividendsGross * DIVIDEND_TAX_RATE
  const { cass: dividendCass, base: dividendCassBase } = cassOnDividends(
    dividendsGross,
    p.otherPassiveIncomeRON || 0,
  )
  const dividendsNet = Math.max(0, dividendsGross - dividendTax - dividendCass)

  /* 5 ── What actually lands. Profit left undistributed stays in the company;
   *      it is not lost, but it is not take-home either. */
  const takeHome = salary.net + ticketsNet + dividendsNet

  return {
    regime,
    overCeiling,
    turnover,
    expenses,
    salary,
    ticketNominal,
    ticketsNet,
    companyTax,
    microTax: regime === 'micro' ? companyTax : 0,
    profitTax: regime === 'real' ? companyTax : 0,
    profitBeforeTax,
    distributable,
    retained: distributable - dividendsGross,
    dividendsGross,
    dividendTax,
    dividendCass,
    dividendCassBase,
    dividendsNet,
    takeHome,
    /** Only the salary accrues pension. A minimum-wage self-hire credits very
     *  little — the hidden cost of the SRL route, made visible by the pension
     *  slider in the UI. */
    pensionCredited: salary.cas,
    cliff: dividendCassCliff(dividendsGross, p.otherPassiveIncomeRON || 0),
    totalTax: companyTax + dividendTax + dividendCass + salary.cas + salary.cass + salary.tax + salary.cam,
  }
}

/**
 * The self-hire gross that maximises take-home.
 *
 * A genuine optimisation knob rather than a formality: salary is deductible
 * and carries pension rights, but is taxed far more heavily than a dividend
 * (58,5% net against 84% before CASS). Where the optimum sits depends on the
 * regime — under micro, salary does not even reduce the tax base, so the
 * minimum is almost always right; under `real` it shields 16% profit tax.
 *
 * Scanned rather than solved: the objective inherits the dividend CASS steps
 * and is therefore not concave.
 */
export function optimalSelfHireGross(params, { min, max, step = 50 } = {}) {
  const lo = min ?? PLAFON_ANCHOR
  const hi = max ?? Math.max(lo, PLAFON_ANCHOR * 6)

  let best = lo
  let bestTakeHome = -Infinity
  for (let g = lo; g <= hi; g += step) {
    const th = computeSrl({ ...params, selfHireGrossMonthly: g }).takeHome
    if (th > bestTakeHome) {
      bestTakeHome = th
      best = g
    }
  }
  return { gross: best, takeHome: bestTakeHome }
}
