import { describe, it, expect } from 'vitest'
import { encodeState, decodeState } from './share.js'
import { defaultOffers, defaultGlobals, OFFER_TEMPLATE, PALETTE } from '../defaults.js'

// Node has btoa/atob globally from v16; assert rather than assume.
describe('share links', () => {
  const state = {
    offers: defaultOffers(),
    globals: defaultGlobals(),
    fx: { eurRon: 5.09, eurUsd: 1.17, eurGbp: 0.87 },
  }

  it('round-trips the default state exactly', () => {
    const decoded = decodeState(encodeState(state))
    expect(decoded).not.toBeNull()
    expect(decoded.offers).toHaveLength(state.offers.length)
    expect(decoded.globals).toEqual(state.globals)
    expect(decoded.fx).toEqual(state.fx)

    for (let i = 0; i < state.offers.length; i++) {
      for (const key of Object.keys(OFFER_TEMPLATE)) {
        expect(decoded.offers[i][key]).toEqual(state.offers[i][key])
      }
      expect(decoded.offers[i].name).toBe(state.offers[i].name)
      expect(decoded.offers[i].color.name).toBe(state.offers[i].color.name)
    }
  })

  it('round-trips every timeline field', () => {
    const offer = {
      ...OFFER_TEMPLATE,
      id: 1,
      name: 'Everything set',
      color: PALETTE[4],
      engagement: 'srl-real',
      basis: 'daily',
      amount: 725.5,
      currency: 'GBP',
      startMonth: 9,
      contractMonths: 7,
      probationMonths: 2,
      probationPct: 85,
      raiseAtMonth: 4,
      raisePct: 12.5,
      thirteenthSalaryMonths: 2,
      onCallDaysPerMonth: 6,
      onCallRatePerDay: 90,
      overtimeHoursPerMonth: 8,
      overtimeMultiplier: 2,
      selfHireGrossMonthly: 9000,
      payoutRatio: 0.6,
      dependents: 3,
    }
    const decoded = decodeState(encodeState({ offers: [offer], globals: defaultGlobals(), fx: {} }))
    for (const key of Object.keys(OFFER_TEMPLATE)) {
      expect(decoded.offers[0][key]).toEqual(offer[key])
    }
  })

  it('survives a name with unicode and symbols', () => {
    const offer = { ...OFFER_TEMPLATE, id: 1, name: 'Ofertă „specială" — 100% ✓', color: PALETTE[0] }
    const decoded = decodeState(encodeState({ offers: [offer], globals: defaultGlobals(), fx: {} }))
    expect(decoded.offers[0].name).toBe(offer.name)
  })

  it('degrades to null on junk rather than throwing', () => {
    for (const junk of ['', '#', 'not-base64!!!', '#eyJib2d1cyI6dHJ1ZX0', null, undefined]) {
      expect(() => decodeState(junk)).not.toThrow()
      expect(decodeState(junk)).toBeNull()
    }
  })

  it('rejects a payload from a different schema version', () => {
    // Build a real payload and bump only the version marker, so the rejection
    // is genuinely about `z` and not about the string being unparseable.
    const b64 = (s) =>
      btoa(String.fromCharCode(...new TextEncoder().encode(s)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')

    const future = b64(JSON.stringify({ o: [{ n: 'From v2' }], g: {}, f: {}, z: 2 }))
    expect(decodeState(future)).toBeNull()

    // Same payload at the current version must still decode, proving the test
    // discriminates on the version rather than on the payload being malformed.
    const current = b64(JSON.stringify({ o: [{ n: 'From v1' }], g: {}, f: {}, z: 1 }))
    expect(decodeState(current)?.offers?.[0]?.name).toBe('From v1')
  })

  it('rejects a truncated link instead of decoding half of it', () => {
    const truncated = encodeState(state).slice(0, -8)
    expect(() => decodeState(truncated)).not.toThrow()
    expect(decodeState(truncated)).toBeNull()
  })

  it('tolerates a leading # from location.hash', () => {
    const encoded = encodeState(state)
    expect(decodeState('#' + encoded)).not.toBeNull()
    expect(decodeState('#' + encoded).offers).toHaveLength(state.offers.length)
  })

  it('stays short enough to paste — under 2000 characters', () => {
    expect(encodeState(state).length).toBeLessThan(2000)
  })
})
