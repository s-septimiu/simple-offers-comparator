import { describe, it, expect } from 'vitest'
import { checkFx, fallbackRates } from './fx.js'
import { FX_FALLBACK } from '../fiscal/constants.js'

describe('checkFx', () => {
  const good = { usd: 1.1373, gbp: 0.8536, ron: 5.2254 }

  it('accepts a plausible payload', () => {
    expect(checkFx({ ...good })).toMatchObject(good)
  })

  it('rounds away the false precision the sources return', () => {
    const r = checkFx({ usd: 1.13730827, gbp: 0.85357506, ron: 5.22535729 })
    expect(r.usd).toBe(1.1373)
    expect(r.gbp).toBe(0.8536)
    expect(r.ron).toBe(5.2254)
  })

  it('rejects a 200 response carrying nulls', () => {
    expect(() => checkFx({ usd: null, gbp: null, ron: null })).toThrow()
    expect(() => checkFx({ ...good, ron: undefined })).toThrow()
  })

  it('rejects rates outside any plausible range', () => {
    expect(() => checkFx({ ...good, ron: 0.5 })).toThrow() // RON never trades near 1
    expect(() => checkFx({ ...good, ron: 500 })).toThrow()
    expect(() => checkFx({ ...good, usd: 0 })).toThrow()
    expect(() => checkFx({ ...good, gbp: 99 })).toThrow()
  })

  it('rejects NaN, which would silently poison every conversion', () => {
    expect(() => checkFx({ ...good, ron: NaN })).toThrow()
  })
})

describe('fallbackRates', () => {
  it('is flagged so the UI can never present it as live', () => {
    const f = fallbackRates()
    expect(f.isFallback).toBe(true)
    expect(f.date).toBe(FX_FALLBACK.asOf)
    expect(f.src).toBe('fallback')
  })

  it('is itself plausible', () => {
    expect(() => checkFx(fallbackRates())).not.toThrow()
  })
})
