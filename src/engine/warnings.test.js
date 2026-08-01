import { describe, it, expect } from 'vitest'
import { warningsFor } from './warnings.js'
import { compute } from './compute.js'
import { MIJLOC_FIX_THRESHOLD_RON } from '../fiscal/constants.js'

const globals = {
  workDays: 248,
  vacationDays: 25,
  sickDays: 5,
  businessCostsMonthly: 250,
  pfaMode: 'detailed',
  pfaFlat: 22,
  pensionWeight: 50,
  eurRon: 5.09,
  eurUsd: 1.17,
  eurGbp: 0.87,
}

const base = {
  id: 1,
  name: 'Test',
  engagement: 'pfa',
  basis: 'monthly',
  amount: 6000,
  currency: 'EUR',
  isNet: false,
  hoursPerWeek: 40,
  daysPerWeek: 5,
  ptoDays: 25,
  bonus: 0,
  mealTicket: 0,
  benefitsMonthly: 0,
  startMonth: 1,
  contractMonths: 12,
  probationMonths: 0,
  probationPct: 100,
  raiseAtMonth: 0,
  raisePct: 0,
  thirteenthSalaryMonths: 0,
  onCallDaysPerMonth: 0,
  onCallRatePerDay: 0,
  overtimeHoursPerMonth: 0,
  overtimeMultiplier: 1.75,
  payoutRatio: 1,
}

const offer = (over = {}) => ({ ...base, ...over })

const warn = (over = {}, g = {}) => {
  const o = offer(over)
  const merged = { ...globals, ...g }
  return warningsFor(o, compute(o, merged), merged)
}

const amortization = (list) =>
  list.find((w) => w.title === 'Costs are assumed fully deductible this year')

/* The costs field deducts everything in the year it falls, which is exact for
 * recurring spend and wrong for a mijloc fix. The warning is the disclosure, so
 * it has to appear exactly where the model stops being provably right — pinned
 * here from both sides, as constants.js asks of every threshold. */
describe('the mijloc fix disclosure', () => {
  /* Costs reach the result as twelve months of monthly spend, so the boundary
   * is expressed that way rather than as a euro figure — an FX move must not
   * silently walk these cases across the line. */
  const monthlyForAnnual = (annualRON) => annualRON / 12 / globals.eurRon

  it('is silent below the threshold, where no single item can be a mijloc fix', () => {
    const list = warn({}, { businessCostsMonthly: monthlyForAnnual(MIJLOC_FIX_THRESHOLD_RON - 1) })
    expect(amortization(list)).toBeUndefined()
  })

  it('fires at the threshold', () => {
    const list = warn({}, { businessCostsMonthly: monthlyForAnnual(MIJLOC_FIX_THRESHOLD_RON) })
    expect(amortization(list)).toBeDefined()
  })

  it('is silent when there are no costs at all', () => {
    expect(amortization(warn({}, { businessCostsMonthly: 0 }))).toBeUndefined()
  })

  /* Severity matters as much as the text: WarningList collapses 'info' behind a
   * count, which is what makes a disclosure that fires on the default config
   * acceptable rather than noise. */
  it('is info severity, so the card keeps it collapsed', () => {
    expect(amortization(warn()).severity).toBe('info')
  })

  it('never fires on employment, which deducts nothing', () => {
    const list = warn({ engagement: 'cim' }, { businessCostsMonthly: 5000 })
    expect(amortization(list)).toBeUndefined()
  })

  it('fires on every B2B route, since costs cut the base on all of them', () => {
    for (const engagement of ['pfa', 'srl-micro', 'srl-real']) {
      expect(amortization(warn({ engagement }))).toBeDefined()
    }
  })

  /* warningsFor is called with the steady result, never the engagement one.
   * Were that ever swapped, a short contract would carry too few months of cost
   * to reach the threshold and would quietly lose the disclosure. */
  it('survives a short contract, because it reads the steady twelve months', () => {
    expect(amortization(warn({ contractMonths: 3 }))).toBeDefined()
  })
})
