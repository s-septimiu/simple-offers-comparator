/**
 * Per-offer warnings.
 *
 * These are the payoff of modelling the step functions properly. A comparator
 * that silently prints a number the user cannot sanity-check is asking to be
 * distrusted; one that says "you are 812 lei the wrong side of a threshold"
 * earns the opposite reaction.
 *
 * Severity: 'error' blocks belief in the number, 'warn' changes a decision,
 * 'info' is worth knowing but harmless.
 */

import {
  MICRO_CEILING_EUR,
  VAT_REGISTRATION_THRESHOLD_RON,
  STATUTORY_MIN_PTO_DAYS,
  OVERTIME_MIN_MULTIPLIER,
  minimumWageForMonth,
  PLAFON_ANCHOR,
} from '../fiscal/constants.js'
import { isSrl, isB2B } from './compute.js'
import { deductionCliff } from '../fiscal/cim.js'
import { hasTimeline } from './schedule.js'
import { ron, eur, num } from '../format.js'

export function warningsFor(offer, result, globals) {
  const out = []
  const add = (severity, title, detail) => out.push({ severity, title, detail })

  /* ── The dividend CASS cliff: the sharpest edge in the whole model ────── */
  if (result.cliff) {
    const { over, step, netGainFromDropping } = result.cliff
    add(
      'warn',
      'Just over a CASS threshold',
      `Dividends clear the threshold by only ${ron(over)}, which triggers ${ron(step)} of CASS. ` +
        `Distributing ${ron(over)} less would leave you ${ron(netGainFromDropping)} better off — ` +
        `the rest stays in the company.`,
    )
  }

  /* ── Micro regime eligibility ─────────────────────────────────────────── */
  // Only worth saying when the user actually asked for the micro regime;
  // telling someone who chose the profit tax that "1% does not apply" is noise.
  if (result.overCeiling && offer.engagement === 'srl-micro') {
    add(
      'error',
      'Over the microenterprise ceiling',
      `Turnover exceeds the ${eur(MICRO_CEILING_EUR)} limit, so the 1% regime does not apply. ` +
        `Figures below are computed at 16% on profit instead.`,
    )
  }

  // Likewise the employee requirement is a condition of micro status, not of
  // running an SRL — a profit-tax company can simply take dividends.
  if (offer.engagement === 'srl-micro' && offer.selfHireGrossMonthly == null) {
    add(
      'info',
      'An employee is mandatory',
      `Micro status requires at least one employee, so a salary at the statutory minimum ` +
        `(${ron(minimumWageForMonth(1))}, rising to ${ron(minimumWageForMonth(12))} in July) plus ` +
        `2,25% CAM is priced in whether or not you want the job.`,
    )
  }

  /* ── VAT registration ─────────────────────────────────────────────────── */
  if (result.vatThresholdCrossed) {
    add(
      'info',
      'Past the VAT registration threshold',
      `Turnover is above ${ron(VAT_REGISTRATION_THRESHOLD_RON)}, so VAT registration is required. ` +
        `Take-home is unaffected for clients outside Romania — the invoice is reverse-charged — ` +
        `but the compliance work is real.`,
    )
  }

  /* ── Time off ─────────────────────────────────────────────────────────── */
  if (result.unpaidLossEUR > 0.5) {
    const days = Math.round(result.work.unpaidOff)
    add(
      'warn',
      `${days} day${days === 1 ? '' : 's'} of unpaid absence`,
      `You plan more time off than this offer covers, costing ${eur(result.unpaidLossEUR)} a year. ` +
        (isB2B(offer.engagement)
          ? 'On B2B nothing is covered unless the contract says so.'
          : 'Employment covers sick leave separately; this is holiday beyond entitlement.'),
    )
  }

  if (offer.engagement === 'cim' && (offer.ptoDays || 0) < STATUTORY_MIN_PTO_DAYS) {
    add(
      'error',
      'Below the statutory holiday minimum',
      `Codul muncii guarantees ${STATUTORY_MIN_PTO_DAYS} days of paid leave on an employment ` +
        `contract. ${num(offer.ptoDays || 0)} is not a lawful offer.`,
    )
  }

  /* ── Payroll floors ───────────────────────────────────────────────────── */
  if (offer.engagement === 'cim' && !offer.isNet && offer.basis === 'monthly') {
    const grossRON = (offer.amount || 0) * (globals.eurRon / perEuro(offer.currency, globals))
    if (grossRON > 0 && grossRON < PLAFON_ANCHOR) {
      add(
        'error',
        'Below the minimum wage',
        `A gross salary of ${ron(grossRON)} is under the ${ron(PLAFON_ANCHOR)} statutory minimum.`,
      )
    }

    const probationGross = grossRON * ((offer.probationPct ?? 100) / 100)
    if ((offer.probationMonths || 0) > 0 && probationGross > 0 && probationGross < PLAFON_ANCHOR) {
      add(
        'error',
        'Probation pay is below the minimum wage',
        `Probation at ${offer.probationPct}% works out to ${ron(probationGross)}, under the ` +
          `${ron(PLAFON_ANCHOR)} floor. The rate has to be at least the minimum wage.`,
      )
    }

    /* The personal-deduction sawtooth: rare, small, and genuinely baffling
     * when you hit it, which is exactly why it is worth naming. */
    const cliff = deductionCliff(grossRON, { month: 1, dependents: offer.dependents || 0 })
    if (cliff && cliff.gain > 0.01) {
      add(
        'info',
        'A slightly lower salary would pay more',
        `At ${ron(grossRON)} you have just crossed a personal-deduction bracket. ` +
          `A gross of ${ron(cliff.bestGross)} nets ${ron(cliff.gain)} more per month.`,
      )
    }
  }

  /* ── Plausibility ─────────────────────────────────────────────────────── */
  if ((offer.hoursPerWeek || 0) > 48) {
    add(
      'warn',
      'Over the 48-hour weekly limit',
      `Codul muncii caps the average working week at 48 hours including overtime.`,
    )
  }

  if ((offer.overtimeHoursPerMonth || 0) > 0 && (offer.overtimeMultiplier || 1) < OVERTIME_MIN_MULTIPLIER) {
    add(
      'warn',
      'Overtime below the statutory premium',
      `Overtime must be paid at least ${Math.round((OVERTIME_MIN_MULTIPLIER - 1) * 100)}% above ` +
        `the base rate, or compensated with time off.`,
    )
  }

  if (offer.currency !== 'RON' && offer.currency !== 'EUR') {
    add(
      'info',
      `Paid in ${offer.currency}`,
      `The rate re-prices itself every month. Move the FX field a few percent against you to see ` +
        `whether the premium over a EUR offer actually covers that risk.`,
    )
  }

  /* ── Timeline caveats ─────────────────────────────────────────────────── */
  if (hasTimeline(offer)) {
    add(
      'info',
      'Ranked on the settled rate',
      `The headline is a full year at the post-probation, post-raise rate, so offers stay ` +
        `comparable. The contract total below shows what you actually bank.`,
    )
  }

  return out
}

function perEuro(currency, g) {
  const table = { EUR: 1, USD: g.eurUsd, GBP: g.eurGbp, RON: g.eurRon }
  const r = table[currency]
  return Number.isFinite(r) && r > 0 ? r : 1
}
