/**
 * PFA — persoană fizică autorizată, sistem real.
 *
 * All figures RON, all annual. Unlike payroll, independent income is assessed
 * once per year against plafoane fixed at the start of the year, so there is
 * no monthly decomposition to do here.
 */

import {
  CAS_RATE,
  CASS_RATE,
  TAX_RATE,
  CAS_FLOOR_12,
  CAS_FLOOR_24,
  CASS_FLOOR_6,
  CASS_CAP_72,
} from './constants.js'

const ZERO = { cas: 0, cass: 0, tax: 0, total: 0, casBase: 0, cassBase: 0 }

/**
 * The CAS base is a CHOSEN PLATEAU, not a percentage of income.
 *
 * Below 12 minimum wages of net income you owe nothing at all; above it you
 * owe 25% of 12 (or, past 24 MW, of 24) minimum wages regardless of how much
 * you actually earned. This produces two hard cliffs — earning one leu past
 * 48.600 costs 12.150 lei of CAS. The tool surfaces both.
 *
 * The law also permits electing a HIGHER base voluntarily (to accrue more
 * pension); `chosenBase` models that. Left unset, the statutory minimum applies.
 */
export function casBaseFor(netIncomeRON, chosenBase = null) {
  let statutory = 0
  if (netIncomeRON >= CAS_FLOOR_24) statutory = CAS_FLOOR_24
  else if (netIncomeRON >= CAS_FLOOR_12) statutory = CAS_FLOOR_12
  if (chosenBase != null && chosenBase > statutory) return chosenBase
  return statutory
}

/**
 * The CASS base is the net income itself, but clamped: floored at 6 minimum
 * wages (you pay on 24.300 even if you earned 5.000) and capped at 72
 * (Legea 141/2025).
 */
export function cassBaseFor(netIncomeRON) {
  return Math.min(Math.max(netIncomeRON, CASS_FLOOR_6), CASS_CAP_72)
}

/**
 * @param {number} netIncomeRON  annual gross receipts minus deductible expenses
 * @param {'detailed'|'flat'} mode
 * @param {number} flatPct       effective rate, when the user knows theirs
 * @param {number|null} chosenCasBase
 */
export function pfaTax(netIncomeRON, mode = 'detailed', flatPct = 22, chosenCasBase = null) {
  if (!Number.isFinite(netIncomeRON) || netIncomeRON <= 0) return { ...ZERO }

  if (mode === 'flat') {
    const total = netIncomeRON * (Math.max(0, flatPct) / 100)
    return { cas: 0, cass: 0, tax: total, total, casBase: 0, cassBase: 0, flat: true }
  }

  const casBase = casBaseFor(netIncomeRON, chosenCasBase)
  const cas = casBase * CAS_RATE

  const cassBase = cassBaseFor(netIncomeRON)
  const cass = cassBase * CASS_RATE

  // Both contributions are deductible from the income-tax base.
  const tax = Math.max(0, netIncomeRON - cas - cass) * TAX_RATE

  return { cas, cass, tax, total: cas + cass + tax, casBase, cassBase }
}
