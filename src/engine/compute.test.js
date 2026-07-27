import { describe, it, expect } from 'vitest'
import { compute, computeEngagement, workingTime, ENGAGEMENTS } from './compute.js'
import { solveAmount } from './solve.js'
import { steadySchedule, engagementSchedule, byCalendarYear, hasTimeline } from './schedule.js'
import { CAS_FLOOR_12 } from '../fiscal/constants.js'

const globals = {
  workDays: 248,
  vacationDays: 25,
  sickDays: 5,
  pfaExpensesMonthly: 250,
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
  ptoDays: 0,
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

describe('every engagement type produces sane numbers', () => {
  it.each(ENGAGEMENTS)('%s', (engagement) => {
    const r = compute(offer({ engagement }), globals)
    expect(Number.isFinite(r.takeHomeEUR)).toBe(true)
    expect(r.takeHomeEUR).toBeGreaterThan(0)
    expect(r.takeHomeEUR).toBeLessThan(r.grossEUR)
    expect(r.keepRatio).toBeGreaterThan(0)
    expect(r.keepRatio).toBeLessThanOrEqual(100)
  })

  it.each(ENGAGEMENTS)('%s survives every degenerate input', (engagement) => {
    const nasty = [
      { amount: 0 }, { amount: -100 }, { amount: NaN },
      { hoursPerWeek: 0 }, { daysPerWeek: 0 }, { ptoDays: 999 },
      { currency: 'XXX' }, { basis: 'nonsense' }, { contractMonths: 0 },
    ]
    for (const patch of nasty) {
      const r = compute(offer({ engagement, ...patch }), globals)
      expect(Number.isFinite(r.takeHomeEUR)).toBe(true)
      expect(Number.isFinite(r.monthlyRON)).toBe(true)
      expect(Number.isFinite(r.perHourEUR)).toBe(true)
      expect(Number.isFinite(r.keepRatio)).toBe(true)
    }
  })

  it('survives degenerate globals', () => {
    for (const patch of [{ workDays: 0 }, { eurRon: 0 }, { eurRon: NaN }, { vacationDays: 999 }]) {
      const r = compute(offer(), { ...globals, ...patch })
      expect(Number.isFinite(r.takeHomeEUR)).toBe(true)
    }
  })
})

describe('currency handling', () => {
  it('is indifferent to the currency an equivalent amount is quoted in', () => {
    const inEur = compute(offer({ currency: 'EUR', amount: 6000 }), globals)
    const inUsd = compute(offer({ currency: 'USD', amount: 6000 * globals.eurUsd }), globals)
    const inRon = compute(offer({ currency: 'RON', amount: 6000 * globals.eurRon }), globals)
    expect(inUsd.takeHomeEUR).toBeCloseTo(inEur.takeHomeEUR, 4)
    expect(inRon.takeHomeEUR).toBeCloseTo(inEur.takeHomeEUR, 4)
  })
})

describe('unpaid leave', () => {
  it('costs a B2B contractor real money', () => {
    const noPto = compute(offer({ engagement: 'pfa', ptoDays: 0 }), globals)
    const fullPto = compute(offer({ engagement: 'pfa', ptoDays: 30 }), globals)
    expect(noPto.unpaidLossEUR).toBeGreaterThan(0)
    expect(fullPto.unpaidLossEUR).toBe(0)
    expect(fullPto.takeHomeEUR).toBeGreaterThan(noPto.takeHomeEUR)
  })

  it('bites a monthly retainer too, not only day rates', () => {
    // Regression: pro-rating used to apply to hourly/daily only, which made a
    // day off free on a monthly B2B contract.
    const r = compute(offer({ engagement: 'pfa', basis: 'monthly', ptoDays: 0 }), globals)
    expect(r.unpaidLossEUR).toBeGreaterThan(0)
  })

  it('does not charge employment for sick days, which the state covers', () => {
    const cim = (sickDays) => compute(offer({ engagement: 'cim', ptoDays: 25 }), { ...globals, sickDays })
    expect(cim(20).unpaidLossEUR).toBe(0)
    expect(cim(0).unpaidLossEUR).toBe(0)
  })
})

describe('the headline is a steady-state calendar year', () => {
  it('ignores probation and contract length, so ranking stays stable', () => {
    const plain = compute(offer(), globals)
    const withProbation = compute(offer({ probationMonths: 3, probationPct: 80 }), globals)
    const shortTerm = compute(offer({ contractMonths: 6 }), globals)
    expect(withProbation.takeHomeEUR).toBeCloseTo(plain.takeHomeEUR, 6)
    expect(shortTerm.takeHomeEUR).toBeCloseTo(plain.takeHomeEUR, 6)
  })

  it('does include a permanent raise, which is part of the settled rate', () => {
    const raised = compute(offer({ raiseAtMonth: 6, raisePct: 10 }), globals)
    expect(raised.takeHomeEUR).toBeGreaterThan(compute(offer(), globals).takeHomeEUR)
  })

  it('always spans exactly twelve active months', () => {
    expect(compute(offer({ startMonth: 9, contractMonths: 4 }), globals).activeMonths).toBe(12)
  })
})

describe('the engagement figure is the cash actually banked', () => {
  it('is reduced by probation', () => {
    const plain = computeEngagement(offer(), globals)
    const probation = computeEngagement(offer({ probationMonths: 3, probationPct: 80 }), globals)
    expect(probation.takeHomeEUR).toBeLessThan(plain.takeHomeEUR)
  })

  it('is reduced by a short contract', () => {
    const short = computeEngagement(offer({ contractMonths: 6 }), globals)
    expect(short.activeMonths).toBe(6)
    expect(short.takeHomeEUR).toBeLessThan(computeEngagement(offer(), globals).takeHomeEUR)
  })

  it('is NOT the steady-state figure scaled — it is taxed on its own income', () => {
    const steady = compute(offer({ contractMonths: 6 }), globals)
    const actual = computeEngagement(offer({ contractMonths: 6 }), globals)
    // Halving a year of PFA income drops it under the CAS floor entirely, so
    // the six-month figure is worth MORE than half the annual one.
    expect(actual.takeHomeEUR).not.toBeCloseTo(steady.takeHomeEUR / 2, 2)
  })

  it('matches the steady figure when no timeline is set', () => {
    expect(computeEngagement(offer(), globals).takeHomeEUR).toBeCloseTo(
      compute(offer(), globals).takeHomeEUR,
      6,
    )
    expect(hasTimeline(offer())).toBe(false)
  })
})

describe('calendar-year splitting — the mid-year start trap', () => {
  it('splits a September start across two tax years', () => {
    const years = byCalendarYear(engagementSchedule(offer({ startMonth: 9 })))
    expect(years).toHaveLength(2)
    expect(years[0]).toHaveLength(4) // Sep–Dec
    expect(years[1]).toHaveLength(8) // Jan–Aug
  })

  it('keeps a January start in a single tax year', () => {
    expect(byCalendarYear(engagementSchedule(offer({ startMonth: 1 })))).toHaveLength(1)
  })

  it('can drop CAS entirely by splitting income under the floor in both years', () => {
    // Annual income comfortably over the 12-MW floor, but half in each year.
    const annualRON = CAS_FLOOR_12 * 1.6
    const monthlyEur = annualRON / 12 / globals.eurRon
    const o = offer({ engagement: 'pfa', basis: 'monthly', amount: monthlyEur, ptoDays: 30 })

    const january = computeEngagement({ ...o, startMonth: 1 }, globals)
    const july = computeEngagement({ ...o, startMonth: 7 }, globals)

    expect(january.casRON).toBeGreaterThan(0)
    expect(july.casRON).toBe(0)
    expect(july.takeHomeEUR).toBeGreaterThan(january.takeHomeEUR)
  })

  it('leaves the steady headline untouched by start month', () => {
    expect(compute(offer({ startMonth: 9 }), globals).takeHomeEUR).toBeCloseTo(
      compute(offer({ startMonth: 1 }), globals).takeHomeEUR,
      6,
    )
  })
})

describe('extras', () => {
  it('adds on-call and overtime to the take-home', () => {
    const plain = compute(offer({ engagement: 'cim' }), globals)
    const onCall = compute(offer({ engagement: 'cim', onCallDaysPerMonth: 5, onCallRatePerDay: 50 }), globals)
    const overtime = compute(offer({ engagement: 'cim', overtimeHoursPerMonth: 10 }), globals)
    expect(onCall.takeHomeEUR).toBeGreaterThan(plain.takeHomeEUR)
    expect(overtime.takeHomeEUR).toBeGreaterThan(plain.takeHomeEUR)
  })

  it('pays overtime at the statutory premium, not the flat rate', () => {
    const at1 = compute(offer({ engagement: 'cim', overtimeHoursPerMonth: 10, overtimeMultiplier: 1 }), globals)
    const at175 = compute(offer({ engagement: 'cim', overtimeHoursPerMonth: 10, overtimeMultiplier: 1.75 }), globals)
    expect(at175.takeHomeEUR).toBeGreaterThan(at1.takeHomeEUR)
  })

  it('restricts the 13th salary to employment', () => {
    const cim = offer({ engagement: 'cim', thirteenthSalaryMonths: 1 })
    const pfa = offer({ engagement: 'pfa', thirteenthSalaryMonths: 1 })
    expect(compute(cim, globals).takeHomeEUR).toBeGreaterThan(
      compute({ ...cim, thirteenthSalaryMonths: 0 }, globals).takeHomeEUR,
    )
    expect(compute(pfa, globals).takeHomeEUR).toBeCloseTo(
      compute({ ...pfa, thirteenthSalaryMonths: 0 }, globals).takeHomeEUR,
      6,
    )
  })

  it('does not award a full-year bonus to a half-year contract', () => {
    const short = computeEngagement(offer({ contractMonths: 6, bonus: 12000 }), globals)
    const shortNoBonus = computeEngagement(offer({ contractMonths: 6, bonus: 0 }), globals)
    const full = computeEngagement(offer({ bonus: 12000 }), globals)
    expect(short.takeHomeEUR).toBeGreaterThan(shortNoBonus.takeHomeEUR)
    expect(short.takeHomeEUR).toBeLessThan(full.takeHomeEUR)
  })
})

describe('meal tickets and perks', () => {
  it('credits tickets to employment at 80% efficiency', () => {
    const without = compute(offer({ engagement: 'cim', mealTicket: 0 }), globals)
    const with45 = compute(offer({ engagement: 'cim', mealTicket: 45 }), globals)
    expect(with45.ticketsNetEUR).toBeGreaterThan(0)
    expect(with45.takeHomeEUR).toBeGreaterThan(without.takeHomeEUR)
    expect(with45.ticketsNetEUR).toBeCloseTo((with45.ticketNominalRON * 0.8) / globals.eurRon, 6)
  })

  it('caps tickets at the statutory 45 lei/day', () => {
    const at45 = compute(offer({ engagement: 'cim', mealTicket: 45 }), globals)
    const at90 = compute(offer({ engagement: 'cim', mealTicket: 90 }), globals)
    expect(at90.ticketsNetEUR).toBeCloseTo(at45.ticketsNetEUR, 6)
  })
})

describe('part-time', () => {
  it('scales a day rate by days worked per week', () => {
    const full = compute(offer({ engagement: 'pfa', basis: 'daily', amount: 400, daysPerWeek: 5 }), globals)
    const three = compute(offer({ engagement: 'pfa', basis: 'daily', amount: 400, daysPerWeek: 3 }), globals)
    expect(three.grossEUR).toBeLessThan(full.grossEUR)
  })

  it('treats days/week as redistribution, and hours/week as the real lever', () => {
    const hourly = (patch) =>
      compute(offer({ engagement: 'pfa', basis: 'hourly', amount: 40, ptoDays: 30, ...patch }), globals)

    // Compressing 40 hours into 3 days makes the days longer, not the year
    // shorter — same hours billed, so the same gross. This is intended.
    expect(hourly({ daysPerWeek: 3 }).grossEUR).toBeCloseTo(hourly({ daysPerWeek: 5 }).grossEUR, 6)
    expect(hourly({ daysPerWeek: 3 }).work.hoursPerDay).toBeCloseTo(40 / 3, 6)

    // Actually going part-time means fewer hours, and that does cut the gross.
    expect(hourly({ hoursPerWeek: 24 }).grossEUR).toBeLessThan(hourly({ hoursPerWeek: 40 }).grossEUR)
  })
})

describe('workingTime', () => {
  it('never returns negative days', () => {
    const w = workingTime(offer({ ptoDays: 0 }), { ...globals, vacationDays: 400, sickDays: 400 })
    expect(w.daysWorked).toBeGreaterThanOrEqual(0)
    expect(w.paidDays).toBeGreaterThanOrEqual(0)
  })

  it('reports zero attendance rather than NaN when there are no working days', () => {
    const w = workingTime(offer(), { ...globals, workDays: 0 })
    expect(w.attendance).toBe(0)
  })
})

describe('solveAmount', () => {
  it('finds a rate that reaches the target, for every engagement type', () => {
    for (const engagement of ENGAGEMENTS) {
      const o = offer({ engagement })
      const target = compute(offer({ engagement, amount: 9000 }), globals).takeHomeEUR
      const s = solveAmount(o, globals, target)
      expect(s).not.toBeNull()
      expect(compute({ ...o, amount: s.amount }, globals).takeHomeEUR).toBeGreaterThanOrEqual(
        target * 0.995,
      )
    }
  })

  it('reports "met" without moving the rate when the offer already leads', () => {
    const o = offer()
    const target = compute(offer({ amount: 1000 }), globals).takeHomeEUR
    expect(solveAmount(o, globals, target).direction).toBe('met')
  })

  it('works from a zero starting amount in RON, where the old bracket failed', () => {
    // Regression: the previous bracket was max(amount * 8, 1000), so a RON
    // offer at 0 could never reach a 30.000 lei target and silently returned
    // the midpoint of a bracket it had never verified.
    const o = offer({ currency: 'RON', amount: 0 })
    const target = compute(offer({ currency: 'RON', amount: 30000 }), globals).takeHomeEUR
    const s = solveAmount(o, globals, target)
    expect(s).not.toBeNull()
    expect(s.amount).toBeGreaterThan(1000)
  })

  it('returns null rather than a wrong number when the target is unreachable', () => {
    expect(solveAmount(offer(), globals, Number.POSITIVE_INFINITY)).toBeNull()
    expect(solveAmount(offer(), globals, NaN)).toBeNull()
  })

  /**
   * The whole reason the solver scans instead of bisecting: because take-home
   * dips at the tax thresholds, the smallest rate reaching a target can sit
   * BELOW the rate already entered. Asking for less genuinely pays more.
   *
   * The UI has copy for this case, so it needs a test proving the state is
   * reachable — dead copy for an impossible state is its own small lie.
   */
  it('can answer with a LOWER rate, because take-home dips at a threshold', () => {
    // Walk an SRL offer across its dividend-CASS cliffs looking for a rate
    // whose take-home is beaten by some smaller rate.
    const at = (amount) => compute(offer({ engagement: 'srl-micro', amount }), globals).takeHomeEUR

    let found = null
    for (let amount = 2000; amount <= 9000 && !found; amount += 10) {
      const here = at(amount)
      for (let lower = amount - 10; lower >= 2000; lower -= 10) {
        if (at(lower) > here) {
          found = { amount, lower, here, peak: at(lower) }
          break
        }
      }
    }

    // Assert the non-monotonicity is real first, so this cannot pass vacuously.
    expect(found).not.toBeNull()
    expect(found.peak).toBeGreaterThan(found.here)

    // A target exactly at the local peak is reachable only at a single point,
    // which no finite grid can land on. A real competing offer sits somewhere
    // between the two, which is what makes a band of lower rates qualify.
    const target = (found.here + found.peak) / 2

    const o = offer({ engagement: 'srl-micro', amount: found.amount })
    const solved = solveAmount(o, globals, target)

    expect(solved).not.toBeNull()
    expect(solved.direction).toBe('cut')
    expect(solved.amount).toBeLessThan(found.amount)
    expect(at(solved.amount)).toBeGreaterThanOrEqual(target)
  })
})

describe('schedule', () => {
  it('applies probation and the raise multiplicatively', () => {
    const s = engagementSchedule(offer({ probationMonths: 3, probationPct: 80, raiseAtMonth: 6, raisePct: 10 }))
    expect(s[0].factor).toBeCloseTo(0.8, 6)
    expect(s[4].factor).toBeCloseTo(1, 6)
    expect(s[5].factor).toBeCloseTo(1.1, 6)
  })

  it('zeroes months past the contract end', () => {
    const s = engagementSchedule(offer({ contractMonths: 6 }))
    expect(s[5].active).toBe(true)
    expect(s[6].active).toBe(false)
    expect(s[6].factor).toBe(0)
  })

  it('always has twelve entries and a steady schedule of factor 1', () => {
    expect(steadySchedule(offer())).toHaveLength(12)
    expect(steadySchedule(offer()).every((m) => m.factor === 1)).toBe(true)
  })
})
