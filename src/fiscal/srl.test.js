import { describe, it, expect } from 'vitest'
import {
  computeSrl,
  cassOnDividends,
  dividendCassCliff,
  dividendCassThresholds,
  optimalSelfHireGross,
} from './srl.js'
import {
  PLAFON_ANCHOR,
  MICRO_TAX_RATE,
  PROFIT_TAX_RATE,
  DIVIDEND_TAX_RATE,
  CASS_RATE,
} from './constants.js'

const [T6, T12, T24] = dividendCassThresholds()

describe('CASS on dividends — a step function, not a percentage', () => {
  it('owes nothing below 6 minimum wages', () => {
    expect(cassOnDividends(0).cass).toBe(0)
    expect(cassOnDividends(T6 - 1).cass).toBe(0)
  })

  it.each([
    ['6 MW', T6, T6],
    ['just above 6 MW', T6 + 1, T6],
    ['just below 12 MW', T12 - 1, T6],
    ['12 MW', T12, T12],
    ['just below 24 MW', T24 - 1, T12],
    ['24 MW', T24, T24],
    ['far above 24 MW', T24 * 10, T24],
  ])('at %s the base is the threshold, not the amount', (_l, dividends, expectedBase) => {
    const r = cassOnDividends(dividends)
    expect(r.base).toBe(expectedBase)
    expect(r.cass).toBeCloseTo(expectedBase * CASS_RATE, 6)
  })

  it('costs a full step for one extra leu', () => {
    const jump = cassOnDividends(T6).cass - cassOnDividends(T6 - 1).cass
    expect(jump).toBeCloseTo(T6 * CASS_RATE, 6)
    expect(jump).toBeCloseTo(2430, 6)
  })

  it('cumulates other passive income into the threshold test', () => {
    expect(cassOnDividends(T6 - 1000).cass).toBe(0)
    expect(cassOnDividends(T6 - 1000, 1000).cass).toBeCloseTo(T6 * CASS_RATE, 6)
  })
})

describe('dividend CASS cliff detection', () => {
  it('finds nothing below the first threshold', () => {
    expect(dividendCassCliff(T6 - 1)).toBeNull()
  })

  it('flags the dead zone immediately above a threshold', () => {
    const c = dividendCassCliff(T6 + 100)
    expect(c).not.toBeNull()
    expect(c.threshold).toBe(T6)
    expect(c.over).toBe(100)
    // Distributing 100 lei more triggered 2.430 lei of CASS to gain 84 lei net.
    expect(c.netGainFromDropping).toBeGreaterThan(0)
  })

  it('clears once past the dead zone', () => {
    const width = T6 * CASS_RATE / (1 - DIVIDEND_TAX_RATE)
    expect(dividendCassCliff(T6 + width + 1)).toBeNull()
  })

  it('the dead zone is real — more gross dividends, less net', () => {
    const at = (d) => d - d * DIVIDEND_TAX_RATE - cassOnDividends(d).cass
    expect(at(T6 + 100)).toBeLessThan(at(T6 - 1))
  })
})

/** A shared, realistic scenario: ~150.000 lei of revenue through an SRL. */
const scenario = {
  turnoverRON: 150_000,
  expensesRON: 12_000,
  selfHireGrossMonthly: null, // statutory minimum, tracking the July increase
  payoutRatio: 1,
  microCeilingRON: 100_000 * 5.09,
  mealTicketPerDay: 0,
  workedDays: 0,
  dependents: 0,
}

describe('computeSrl — accounting identity', () => {
  /**
   * The strongest test in this file: every leu of turnover must be accounted
   * for exactly once. Nothing may appear from nowhere or vanish silently.
   */
  it.each([['micro'], ['real']])('%s regime conserves every leu of turnover', (regime) => {
    const r = computeSrl({ ...scenario, regime })
    const accountedFor =
      r.salary.net +
      r.salary.cas +
      r.salary.cass +
      r.salary.tax +
      r.salary.cam +
      r.expenses +
      r.ticketNominal +
      r.companyTax +
      r.distributable
    expect(accountedFor).toBeCloseTo(r.turnover, 6)
  })

  it('take-home never exceeds turnover', () => {
    for (const regime of ['micro', 'real']) {
      const r = computeSrl({ ...scenario, regime })
      expect(r.takeHome).toBeLessThan(r.turnover)
      expect(r.takeHome).toBeGreaterThan(0)
    }
  })

  it('splits the dividend exactly three ways', () => {
    const r = computeSrl({ ...scenario, regime: 'micro' })
    expect(r.dividendsNet + r.dividendTax + r.dividendCass).toBeCloseTo(r.dividendsGross, 6)
  })
})

describe('computeSrl — regime mechanics', () => {
  it('taxes TURNOVER under micro, regardless of expenses', () => {
    const lean = computeSrl({ ...scenario, regime: 'micro', expensesRON: 0 })
    const heavy = computeSrl({ ...scenario, regime: 'micro', expensesRON: 50_000 })
    expect(lean.microTax).toBeCloseTo(scenario.turnoverRON * MICRO_TAX_RATE, 6)
    expect(heavy.microTax).toBeCloseTo(lean.microTax, 6)
  })

  it('taxes PROFIT under the real regime, so expenses do reduce the bill', () => {
    const lean = computeSrl({ ...scenario, regime: 'real', expensesRON: 0 })
    const heavy = computeSrl({ ...scenario, regime: 'real', expensesRON: 50_000 })
    expect(heavy.profitTax).toBeLessThan(lean.profitTax)
    expect(lean.profitTax).toBeCloseTo(lean.profitBeforeTax * PROFIT_TAX_RATE, 6)
  })

  it('forces the real regime above the micro ceiling, whatever the user picked', () => {
    const r = computeSrl({ ...scenario, regime: 'micro', turnoverRON: 900_000 })
    expect(r.overCeiling).toBe(true)
    expect(r.regime).toBe('real')
    expect(r.microTax).toBe(0)
    expect(r.profitTax).toBeGreaterThan(0)
  })

  /* The ceiling is tested with a strict >, and the UI now marks the 1% option
   * unavailable off the same flag — so an off-by-one here would either bar a
   * company that is still eligible or offer a regime it cannot have. */
  it('stays on micro at the ceiling and flips one leu past it', () => {
    const ceiling = scenario.microCeilingRON
    const at = computeSrl({ ...scenario, regime: 'micro', turnoverRON: ceiling })
    const over = computeSrl({ ...scenario, regime: 'micro', turnoverRON: ceiling + 1 })

    expect(at.regime).toBe('micro')
    expect(at.overCeiling).toBe(false)
    expect(over.regime).toBe('real')
    expect(over.overCeiling).toBe(true)
  })

  it('pays the statutory minimum wage, tracking the July increase', () => {
    const r = computeSrl({ ...scenario, regime: 'micro' })
    // Six months at 4.050 and six at 4.325, not twelve at either.
    expect(r.salary.gross).toBeCloseTo(6 * 4050 + 6 * 4325, 6)
  })

  /**
   * The employee requirement is a condition of MICRO status specifically. An
   * SRL on the profit tax may take dividends only, so charging it a mandatory
   * salary would overstate that regime's cost and skew the comparison.
   */
  it('hires nobody under the profit-tax regime unless asked', () => {
    const r = computeSrl({ ...scenario, regime: 'real', selfHireGrossMonthly: null })
    expect(r.salary.gross).toBe(0)
    expect(r.salary.cam).toBe(0)
    expect(r.pensionCredited).toBe(0)
  })

  it('still hires when the profit-tax regime asks for a salary', () => {
    const r = computeSrl({ ...scenario, regime: 'real', selfHireGrossMonthly: 8000 })
    expect(r.salary.gross).toBeCloseTo(12 * 8000, 6)
    expect(r.pensionCredited).toBeGreaterThan(0)
  })

  it('always hires under micro, because status depends on it', () => {
    const r = computeSrl({ ...scenario, regime: 'micro', selfHireGrossMonthly: null })
    expect(r.salary.gross).toBeGreaterThan(0)
  })

  it('credits pension only through the salary — the SRL blind spot', () => {
    const srl = computeSrl({ ...scenario, regime: 'micro' })
    expect(srl.pensionCredited).toBeCloseTo(srl.salary.cas, 6)
    // Far below what the same revenue would credit as employment income.
    expect(srl.pensionCredited).toBeLessThan(scenario.turnoverRON * 0.1)
  })

  it('retains undistributed profit instead of losing it', () => {
    const r = computeSrl({ ...scenario, regime: 'micro', payoutRatio: 0.5 })
    expect(r.retained).toBeCloseTo(r.distributable * 0.5, 6)
    expect(r.dividendsGross).toBeCloseTo(r.distributable * 0.5, 6)
  })

  it('survives turnover too small to cover the mandatory salary', () => {
    const r = computeSrl({ ...scenario, regime: 'micro', turnoverRON: 10_000 })
    expect(Number.isFinite(r.takeHome)).toBe(true)
    expect(r.profitBeforeTax).toBeLessThan(0)
    expect(r.dividendsGross).toBe(0)
  })

  it('never produces NaN on degenerate input', () => {
    for (const bad of [0, -1, NaN, undefined, null]) {
      const r = computeSrl({ ...scenario, regime: 'micro', turnoverRON: bad })
      expect(Number.isFinite(r.takeHome)).toBe(true)
    }
  })
})

describe('optimalSelfHireGross', () => {
  /**
   * The optimum is NOT simply the minimum wage, even under micro where salary
   * does not reduce the tax base. Raising the salary shrinks the distributable
   * profit, and if that carries the dividend under a CASS threshold it saves
   * the whole 2.430 or 4.860 lei step at once — more than the extra payroll
   * tax costs. The dividend cliffs reshape the objective, which is exactly why
   * this is scanned rather than reasoned about.
   */
  it('finds a genuine optimum, which need not be the minimum wage', () => {
    const params = { ...scenario, regime: 'micro' }
    const opts = { min: PLAFON_ANCHOR, max: PLAFON_ANCHOR * 4, step: 250 }
    const { gross, takeHome } = optimalSelfHireGross(params, opts)

    // Whatever it picks must beat the minimum-wage baseline...
    const atMinimum = computeSrl({ ...params, selfHireGrossMonthly: PLAFON_ANCHOR }).takeHome
    expect(takeHome).toBeGreaterThanOrEqual(atMinimum - 1e-6)

    // ...and must be the true argmax over the scanned grid.
    for (let g = opts.min; g <= opts.max; g += opts.step) {
      expect(computeSrl({ ...params, selfHireGrossMonthly: g }).takeHome).toBeLessThanOrEqual(
        takeHome + 1e-6,
      )
    }
    expect(computeSrl({ ...params, selfHireGrossMonthly: gross }).takeHome).toBeCloseTo(takeHome, 6)
  })

  it('the optimum beats the minimum precisely by dodging a CASS step', () => {
    const params = { ...scenario, regime: 'micro' }
    const { gross } = optimalSelfHireGross(params, {
      min: PLAFON_ANCHOR,
      max: PLAFON_ANCHOR * 4,
      step: 250,
    })
    const atMin = computeSrl({ ...params, selfHireGrossMonthly: PLAFON_ANCHOR })
    const atOpt = computeSrl({ ...params, selfHireGrossMonthly: gross })
    expect(atOpt.dividendCass).toBeLessThan(atMin.dividendCass)
  })

  it('returns a gross that really is at least as good as the minimum', () => {
    const params = { ...scenario, regime: 'real' }
    const { gross, takeHome } = optimalSelfHireGross(params, {
      min: PLAFON_ANCHOR,
      max: PLAFON_ANCHOR * 4,
      step: 250,
    })
    const atMinimum = computeSrl({ ...params, selfHireGrossMonthly: PLAFON_ANCHOR }).takeHome
    expect(takeHome).toBeGreaterThanOrEqual(atMinimum - 1e-6)
    expect(computeSrl({ ...params, selfHireGrossMonthly: gross }).takeHome).toBeCloseTo(takeHome, 6)
  })
})
