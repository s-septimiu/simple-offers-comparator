import { describe, it, expect } from 'vitest'
import { pfaTax, casBaseFor, cassBaseFor } from './pfa.js'
import {
  CAS_FLOOR_12,
  CAS_FLOOR_24,
  CASS_FLOOR_6,
  CASS_CAP_72,
  CAS_RATE,
  CASS_RATE,
} from './constants.js'

/**
 * Plafoane are cliffs, not slopes. Every one of them is asserted on BOTH sides
 * plus the boundary itself, because an off-by-one in a comparison operator here
 * is worth thousands of lei and is invisible in any smooth-looking test.
 */
describe('PFA plafon boundaries', () => {
  describe(`CAS 12-MW floor (${CAS_FLOOR_12} lei)`, () => {
    it('owes nothing one leu below', () => {
      expect(pfaTax(CAS_FLOOR_12 - 1).cas).toBe(0)
    })
    it('owes the full 12-MW base exactly at the threshold', () => {
      expect(pfaTax(CAS_FLOOR_12).cas).toBeCloseTo(CAS_FLOOR_12 * CAS_RATE, 6)
    })
    it('still owes the 12-MW base one leu above', () => {
      expect(pfaTax(CAS_FLOOR_12 + 1).cas).toBeCloseTo(CAS_FLOOR_12 * CAS_RATE, 6)
    })
    it('is a genuine cliff — one leu costs 12.150 lei', () => {
      const jump = pfaTax(CAS_FLOOR_12).cas - pfaTax(CAS_FLOOR_12 - 1).cas
      expect(jump).toBeCloseTo(12150, 6)
    })
  })

  describe(`CAS 24-MW floor (${CAS_FLOOR_24} lei)`, () => {
    it('uses the 12-MW base one leu below', () => {
      expect(casBaseFor(CAS_FLOOR_24 - 1)).toBe(CAS_FLOOR_12)
    })
    it('switches to the 24-MW base at the threshold', () => {
      expect(casBaseFor(CAS_FLOOR_24)).toBe(CAS_FLOOR_24)
    })
    it('stays on the 24-MW base above it — the base never exceeds 24 MW', () => {
      expect(casBaseFor(CAS_FLOOR_24 + 1)).toBe(CAS_FLOOR_24)
      expect(casBaseFor(CAS_FLOOR_24 * 10)).toBe(CAS_FLOOR_24)
    })
  })

  describe(`CASS 6-MW floor (${CASS_FLOOR_6} lei)`, () => {
    it('floors the base below the threshold — you pay on income you did not earn', () => {
      expect(cassBaseFor(1)).toBe(CASS_FLOOR_6)
      expect(cassBaseFor(CASS_FLOOR_6 - 1)).toBe(CASS_FLOOR_6)
    })
    it('tracks actual income at and above it', () => {
      expect(cassBaseFor(CASS_FLOOR_6)).toBe(CASS_FLOOR_6)
      expect(cassBaseFor(CASS_FLOOR_6 + 1)).toBe(CASS_FLOOR_6 + 1)
    })
  })

  describe(`CASS 72-MW cap (${CASS_CAP_72} lei)`, () => {
    it('tracks income one leu below', () => {
      expect(cassBaseFor(CASS_CAP_72 - 1)).toBe(CASS_CAP_72 - 1)
    })
    it('caps at the threshold and stays there', () => {
      expect(cassBaseFor(CASS_CAP_72)).toBe(CASS_CAP_72)
      expect(cassBaseFor(CASS_CAP_72 + 1)).toBe(CASS_CAP_72)
      expect(cassBaseFor(CASS_CAP_72 * 5)).toBe(CASS_CAP_72)
    })
    it('makes CASS flat above the cap, so extra income is cheaper', () => {
      const a = pfaTax(CASS_CAP_72)
      const b = pfaTax(CASS_CAP_72 + 100_000)
      expect(b.cass).toBeCloseTo(a.cass, 6)
    })
  })
})

describe('pfaTax', () => {
  it('deducts both contributions from the income-tax base', () => {
    const income = 200_000
    const r = pfaTax(income)
    expect(r.tax).toBeCloseTo((income - r.cas - r.cass) * 0.1, 6)
    expect(r.total).toBeCloseTo(r.cas + r.cass + r.tax, 6)
  })

  it('applies the flat override to the whole net income', () => {
    const r = pfaTax(100_000, 'flat', 22)
    expect(r.total).toBeCloseTo(22_000, 6)
    expect(r.cas).toBe(0)
    expect(r.cass).toBe(0)
    expect(r.flat).toBe(true)
  })

  it('honours a voluntarily elected higher CAS base', () => {
    const base = CAS_FLOOR_24 * 2
    expect(pfaTax(CAS_FLOOR_12 + 1, 'detailed', 22, base).cas).toBeCloseTo(base * CAS_RATE, 6)
  })

  it('ignores an elected base lower than the statutory one', () => {
    expect(pfaTax(CAS_FLOOR_24, 'detailed', 22, 1000).cas).toBeCloseTo(CAS_FLOOR_24 * CAS_RATE, 6)
  })

  it('returns zeros, never NaN, on degenerate input', () => {
    for (const bad of [0, -1, NaN, undefined, null, -Infinity]) {
      const r = pfaTax(bad)
      expect(r.total).toBe(0)
      expect(Number.isFinite(r.total)).toBe(true)
    }
  })

  it('leaves take-home non-monotonic across the CAS cliff', () => {
    // Documents the behaviour every solver in this codebase must tolerate.
    const below = CAS_FLOOR_12 - 1 - pfaTax(CAS_FLOOR_12 - 1).total
    const above = CAS_FLOOR_12 - pfaTax(CAS_FLOOR_12).total
    expect(above).toBeLessThan(below)
  })

  it('charges the CASS floor even on tiny income', () => {
    expect(pfaTax(1000).cass).toBeCloseTo(CASS_FLOOR_6 * CASS_RATE, 6)
  })
})
