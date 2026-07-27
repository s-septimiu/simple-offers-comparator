/**
 * CIM — contract individual de muncă (standard employment).
 *
 * All figures RON, all per-month. Payroll in Romania is computed monthly, not
 * annually: the personal deduction depends on that month's gross against that
 * month's minimum wage. Summing twelve monthly results and dividing an annual
 * gross by twelve are NOT equivalent once the deduction is non-zero, so this
 * module works strictly per month and callers aggregate.
 */

import {
  CAS_RATE,
  CASS_RATE,
  TAX_RATE,
  CAM_RATE,
  DEDUCTION_PHASE_OUT_RANGE,
  DEDUCTION_BRACKET_STEP,
  DEDUCTION_BASE_PCT,
  DEDUCTION_PCT_PER_DEPENDENT,
  DEDUCTION_MAX_DEPENDENTS,
  minimumWageForMonth,
} from './constants.js'
import { solveSmallestReaching } from '../engine/numeric.js'

/**
 * Personal deduction (deducere personală) — Cod fiscal art. 77.
 *
 * Granted only at the employee's funcția de bază, and only while gross sits
 * within 2.000 lei of the minimum wage. Above that it is exactly zero, which
 * is why it is invisible at senior developer salaries — and decisive for the
 * mandatory minimum-wage self-hire inside an SRL micro.
 *
 * The published grid is a table; this is its closed form, verified against
 * five of its rows in cim.test.js. Note the ceil() — the grid moves in 50-lei
 * steps, so it is a staircase, not a straight line. Treating it as linear
 * overstates the deduction by up to ~10 lei per step.
 */
export function personalDeduction(grossMonthly, mw, dependents = 0) {
  if (!(grossMonthly > 0) || !(mw > 0)) return 0
  if (grossMonthly > mw + DEDUCTION_PHASE_OUT_RANGE) return 0

  const pct =
    DEDUCTION_BASE_PCT +
    Math.min(Math.max(dependents, 0), DEDUCTION_MAX_DEPENDENTS) * DEDUCTION_PCT_PER_DEPENDENT

  const delta = Math.max(0, grossMonthly - mw)
  const stepped = Math.ceil(delta / DEDUCTION_BRACKET_STEP) * DEDUCTION_BRACKET_STEP
  const factor = Math.max(0, 1 - stepped / DEDUCTION_PHASE_OUT_RANGE)

  return pct * mw * factor
}

/**
 * One month of payroll, from gross.
 *
 * @param {number} grossMonthly     gross salary in RON for this month
 * @param {object} [opts]
 * @param {number} [opts.month]     1-indexed calendar month, selects the
 *                                  minimum wage in force (it rose in July 2026)
 * @param {number} [opts.dependents]
 * @param {boolean} [opts.itExemption]  model the pre-2025 IT income-tax
 *                                  exemption; not available in 2026
 */
export function cimMonthlyFromGross(grossMonthly, opts = {}) {
  const gross = Number.isFinite(grossMonthly) && grossMonthly > 0 ? grossMonthly : 0
  const { month = 1, dependents = 0, itExemption = false } = opts

  const mw = minimumWageForMonth(month)
  const cas = gross * CAS_RATE
  const cass = gross * CASS_RATE
  const deduction = personalDeduction(gross, mw, dependents)
  const taxBase = Math.max(0, gross - cas - cass - deduction)
  const tax = itExemption ? 0 : taxBase * TAX_RATE

  return {
    gross,
    cas,
    cass,
    tax,
    deduction,
    net: gross - cas - cass - tax,
    /** Employer-borne, on top of gross — never deducted from the employee. */
    cam: gross * CAM_RATE,
    /** What the employer actually spends to pay this salary. */
    employerCost: gross * (1 + CAM_RATE),
  }
}

/**
 * Detects the deduction sawtooth: a gross where earning slightly LESS would
 * leave the employee with slightly MORE net.
 *
 * Each 50-lei bracket boundary knocks ~20 lei off the deduction at once, which
 * costs ~2 lei of tax — more than the ~0,58 lei of net that one extra leu of
 * gross brings in. Net therefore falls at all 40 boundaries inside the grid.
 * Small in absolute terms, but genuinely counter-intuitive, so the UI says so
 * rather than letting the number look like a rounding error.
 *
 * @returns {{bestGross:number, gain:number}|null}
 */
export function deductionCliff(grossMonthly, opts = {}) {
  const here = cimMonthlyFromGross(grossMonthly, opts).net
  let bestGross = grossMonthly
  let bestNet = here

  // One bracket back is enough — the sawtooth never spans more than that.
  const floor = Math.max(0, grossMonthly - DEDUCTION_BRACKET_STEP)
  for (let g = Math.floor(grossMonthly); g >= floor; g--) {
    const net = cimMonthlyFromGross(g, opts).net
    if (net > bestNet) {
      bestNet = net
      bestGross = g
    }
  }
  return bestGross === grossMonthly ? null : { bestGross, gain: bestNet - here }
}

/**
 * Inverse of cimMonthlyFromGross: the smallest gross that yields a given net.
 *
 * Solved numerically rather than by dividing by CIM_NET_RATIO. The closed form
 * `net / 0.585` is only valid where the personal deduction is zero; inside the
 * deduction grid it is wrong by up to the full deduction, and that grid is
 * exactly where the SRL minimum-wage self-hire lives.
 *
 * Uses the non-monotonic solver, because net genuinely dips at every deduction
 * bracket boundary (see deductionCliff). A monotonic bisection lands in the
 * wrong tooth and overshoots by a few lei.
 *
 * Note this inversion is one-to-many: several grosses can produce the same net.
 * We return the smallest, which is the canonical and employer-cheapest answer.
 *
 * The final integer snap is not cosmetic. The deduction steps on ceil(), so the
 * full-deduction region ends at exactly `gross === minimum wage` — a single
 * point of zero width. Continuous sampling can never land on it and overshoots
 * by a few lei. Salaries are quoted in whole lei anyway, so we scan back over
 * integers to recover the true smallest answer.
 */
export function cimGrossFromNet(netMonthly, opts = {}) {
  if (!Number.isFinite(netMonthly) || netMonthly <= 0) return 0

  const netAt = (gross) => cimMonthlyFromGross(gross, opts).net
  const solved = solveSmallestReaching(netAt, netMonthly, {
    start: Math.max(netMonthly, 100),
  })
  if (solved == null) return 0

  // One deduction bracket back is enough; the sawtooth never spans more.
  const tolerance = 1e-6
  const from = Math.max(0, Math.floor(solved) - DEDUCTION_BRACKET_STEP - 1)
  for (let g = from; g <= Math.ceil(solved); g++) {
    if (netAt(g) >= netMonthly - tolerance) return g
  }
  return solved
}

/** Convenience: twelve identical months. Callers with a schedule sum instead. */
export function cimAnnualFromMonthlyGross(grossMonthly, opts = {}) {
  const months = Array.from({ length: 12 }, (_, i) =>
    cimMonthlyFromGross(grossMonthly, { ...opts, month: i + 1 }),
  )
  return months.reduce(
    (acc, m) => ({
      gross: acc.gross + m.gross,
      cas: acc.cas + m.cas,
      cass: acc.cass + m.cass,
      tax: acc.tax + m.tax,
      deduction: acc.deduction + m.deduction,
      net: acc.net + m.net,
      cam: acc.cam + m.cam,
      employerCost: acc.employerCost + m.employerCost,
    }),
    { gross: 0, cas: 0, cass: 0, tax: 0, deduction: 0, net: 0, cam: 0, employerCost: 0 },
  )
}
