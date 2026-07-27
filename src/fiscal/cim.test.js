import { describe, it, expect } from 'vitest'
import { personalDeduction, cimMonthlyFromGross, cimGrossFromNet, deductionCliff } from './cim.js'
import { MW_JANUARY, MW_JULY, CIM_NET_RATIO, TICKET_NET_RATIO } from './constants.js'

/**
 * The personal deduction is published as a table, and this codebase reduces it
 * to a formula. These tests are the proof that the reduction is faithful — if
 * anyone touches the formula, the published grid is what they answer to.
 *
 * Grid source: the 2026 deducere personală table, anchored to the July minimum
 * wage of 4.325 lei.
 */
describe('personalDeduction — reproduces the published 2026 grid', () => {
  const mw = MW_JULY

  it.each([
    [4325, 865], // at the minimum wage: full 20%
    [4500, 779],
    [4750, 670],
    [5000, 562],
    [5250, 454],
    [5500, 346],
    [5750, 238],
    [6000, 130],
    [6250, 22], // last non-zero rung
  ])('gross %i lei → %i lei deduction', (gross, expected) => {
    expect(Math.round(personalDeduction(gross, mw, 0))).toBe(expected)
  })

  it.each([
    [0, 865],
    [1, 1081],
    [2, 1298],
    [3, 1514],
    [4, 1730],
  ])('at minimum wage with %i dependents → %i lei', (dependents, expected) => {
    expect(Math.round(personalDeduction(mw, mw, dependents))).toBe(expected)
  })

  it('is exactly zero above the MW + 2.000 ceiling', () => {
    expect(personalDeduction(mw + 2000, mw, 0)).toBe(0)
    expect(personalDeduction(mw + 2001, mw, 0)).toBe(0)
    expect(personalDeduction(30000, mw, 4)).toBe(0)
  })

  it('is a staircase, not a ramp — 50-lei brackets', () => {
    // Everything inside one 50-lei step collapses to the same deduction.
    expect(personalDeduction(4326, mw, 0)).toBe(personalDeduction(4375, mw, 0))
    // And the next step is strictly lower.
    expect(personalDeduction(4376, mw, 0)).toBeLessThan(personalDeduction(4375, mw, 0))
  })

  it('caps the dependent bonus at 4', () => {
    expect(personalDeduction(mw, mw, 9)).toBe(personalDeduction(mw, mw, 4))
  })
})

describe('cimMonthlyFromGross', () => {
  it('matches the 58,5% net ratio once the deduction is out of range', () => {
    const r = cimMonthlyFromGross(30000, { month: 1 })
    expect(r.net).toBeCloseTo(30000 * CIM_NET_RATIO, 6)
    expect(r.deduction).toBe(0)
  })

  it('beats the flat ratio at minimum wage, because of the deduction', () => {
    const r = cimMonthlyFromGross(MW_JANUARY, { month: 1 })
    expect(r.deduction).toBeGreaterThan(0)
    expect(r.net).toBeGreaterThan(MW_JANUARY * CIM_NET_RATIO)
  })

  it('tracks the July minimum-wage increase', () => {
    // The same gross yields a different deduction either side of July, because
    // the grid is anchored to the minimum wage in force that month.
    const june = cimMonthlyFromGross(5000, { month: 6 })
    const july = cimMonthlyFromGross(5000, { month: 7 })
    expect(july.deduction).toBeGreaterThan(june.deduction)
  })

  it('keeps CAM employer-side, never deducted from the employee', () => {
    const r = cimMonthlyFromGross(10000, { month: 1 })
    expect(r.net).toBe(10000 - r.cas - r.cass - r.tax)
    expect(r.employerCost).toBeCloseTo(10000 + r.cam, 6)
    expect(r.employerCost).toBeGreaterThan(r.gross)
  })

  it('never produces NaN or negatives on degenerate input', () => {
    for (const bad of [0, -1, NaN, undefined, null, Infinity]) {
      const r = cimMonthlyFromGross(bad, { month: 1 })
      expect(Number.isFinite(r.net)).toBe(true)
      expect(r.net).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('cimGrossFromNet — numeric inversion', () => {
  /**
   * The regression this suite exists for: the old `net / 0.585` closed form is
   * only correct where the deduction is zero. Asserting the round-trip only at
   * senior salaries passes trivially and hides the bug. These cases sit inside
   * the deduction grid, which is exactly where the SRL self-hire lives.
   *
   * Exact recovery of the original gross is NOT the property to assert. Inside
   * the grid the mapping is one-to-many and net dips at every bracket boundary
   * (see the sawtooth tests below), so "the" inverse does not exist. Worse, a
   * target net sitting in the shadow of a dip is not attainable at all from a
   * smaller gross — the smallest gross that reaches it overshoots.
   *
   * The contract is therefore: the smallest gross that reaches AT LEAST the
   * requested net. Both halves of that are checked.
   */
  it.each([
    ['minimum wage', MW_JANUARY],
    ['minimum wage + 1 leu', MW_JANUARY + 1],
    ['mid-grid', MW_JANUARY + 900],
    ['one leu below the grid ceiling', MW_JANUARY + 1999],
    ['at the grid ceiling', MW_JANUARY + 2000],
    ['senior salary', 30000],
    ['very high salary', 120000],
  ])('reaches at least the requested net, from no more gross, at %s', (_label, gross) => {
    const net = cimMonthlyFromGross(gross, { month: 1 }).net
    const recovered = cimGrossFromNet(net, { month: 1 })

    expect(cimMonthlyFromGross(recovered, { month: 1 }).net).toBeGreaterThanOrEqual(net - 1e-6)
    expect(recovered).toBeLessThanOrEqual(gross + 1e-6)
  })

  it('finds a strictly cheaper gross when the target sits in a dip', () => {
    // gross 4051 nets 2448,81 — but 4048 nets 2449,08. Less gross, more net.
    const net = cimMonthlyFromGross(MW_JANUARY + 1, { month: 1 }).net
    const recovered = cimGrossFromNet(net, { month: 1 })
    expect(recovered).toBeLessThan(MW_JANUARY + 1)
    expect(cimMonthlyFromGross(recovered, { month: 1 }).net).toBeGreaterThan(net)
  })

  it('recovers gross exactly above the grid, where net is single-valued', () => {
    for (const gross of [30000, 120000, MW_JANUARY + 2001]) {
      const net = cimMonthlyFromGross(gross, { month: 1 }).net
      expect(cimGrossFromNet(net, { month: 1 })).toBeCloseTo(gross, 4)
    }
  })

  it('disagrees with the naive closed form inside the deduction grid', () => {
    // Proves the round-trip test above is actually load-bearing: the closed
    // form is off by hundreds of lei exactly where the SRL self-hire sits.
    const net = cimMonthlyFromGross(MW_JANUARY, { month: 1 }).net
    const naive = net / CIM_NET_RATIO
    expect(Math.abs(naive - MW_JANUARY)).toBeGreaterThan(100)

    const solved = cimGrossFromNet(net, { month: 1 })
    expect(cimMonthlyFromGross(solved, { month: 1 }).net).toBeCloseTo(net, 4)
    expect(Math.abs(solved - MW_JANUARY)).toBeLessThan(5)
  })

  it('returns 0 rather than NaN for degenerate input', () => {
    for (const bad of [0, -5, NaN, undefined, null]) {
      expect(cimGrossFromNet(bad)).toBe(0)
    }
  })
})

describe('the personal-deduction sawtooth', () => {
  /**
   * A genuine quirk of Romanian payroll, not a modelling artefact: inside the
   * deduction grid a one-leu RAISE can LOWER take-home pay. Each 50-lei bracket
   * boundary removes ~20 lei of deduction at once, adding ~2 lei of tax, which
   * outweighs the ~0,58 lei of net that the extra leu of gross brings.
   *
   * Pinned down here because it drives two design decisions elsewhere: the
   * inversion must use the non-monotonic solver, and the UI warns about it.
   */
  it('drops net pay when gross crosses a bracket boundary', () => {
    const at = (g) => cimMonthlyFromGross(g, { month: 1 }).net
    expect(at(MW_JANUARY + 1)).toBeLessThan(at(MW_JANUARY))
  })

  it('dips at every one of the 40 boundaries in the grid, and nowhere else', () => {
    let dips = 0
    for (let g = MW_JANUARY; g < MW_JANUARY + 2000; g++) {
      if (cimMonthlyFromGross(g + 1, { month: 1 }).net < cimMonthlyFromGross(g, { month: 1 }).net) {
        dips++
      }
    }
    expect(dips).toBe(40) // 2000 lei of phase-out / 50-lei brackets
  })

  it('is strictly increasing once past the grid', () => {
    const at = (g) => cimMonthlyFromGross(g, { month: 1 }).net
    for (let g = MW_JANUARY + 2000; g < MW_JANUARY + 2200; g += 7) {
      expect(at(g + 7)).toBeGreaterThan(at(g))
    }
  })

  it('reports the cheaper gross via deductionCliff', () => {
    const c = deductionCliff(MW_JANUARY + 1, { month: 1 })
    expect(c).not.toBeNull()
    expect(c.bestGross).toBe(MW_JANUARY)
    expect(c.gain).toBeCloseTo(1.44, 2)
  })

  it('reports nothing where net is well behaved', () => {
    expect(deductionCliff(30000, { month: 1 })).toBeNull()
  })
})

describe('meal tickets', () => {
  /**
   * Guards against a plausible-looking "fix". Both withholdings apply to the
   * full nominal value and simply add to 20%; they do NOT compound to 19%.
   * Verified against the standard worked example: 21 days × 45 lei = 945 lei
   * nominal, 189 lei retained, 756 lei net.
   */
  it('keeps exactly 80% of nominal value', () => {
    expect(TICKET_NET_RATIO).toBeCloseTo(0.8, 10)
    expect(945 * TICKET_NET_RATIO).toBeCloseTo(756, 6)
    expect(945 - 945 * TICKET_NET_RATIO).toBeCloseTo(189, 6)
  })

  it('is more efficient than ordinary gross salary', () => {
    expect(TICKET_NET_RATIO).toBeGreaterThan(CIM_NET_RATIO)
  })
})
