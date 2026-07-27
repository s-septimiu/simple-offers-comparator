/**
 * Exchange rates: race several independent sources, first plausible one wins.
 *
 * No caching to localStorage — the tool deliberately starts every visitor from
 * the same state, and a cached rate is state. Rates are cheap to refetch.
 *
 * When every source fails we fall back to a DATED constant and say so. A silent
 * stale default that looks authoritative is worse than no rate at all: the user
 * would have no reason to check it.
 */

import { FX_FALLBACK } from '../fiscal/constants.js'

/**
 * Rejects payloads that parsed but are nonsense — a 200 with a null rate.
 *
 * Also rounds to four decimals. Sources hand back things like 5.22535729,
 * which is false precision for a rate that moves daily, overflows the input
 * box, and makes a hand-typed override look wrong by comparison.
 */
export function checkFx(r) {
  const ok = (v, lo, hi) => Number.isFinite(v) && v > lo && v < hi
  if (!ok(r.usd, 0.5, 5) || !ok(r.gbp, 0.3, 3) || !ok(r.ron, 1, 100)) {
    throw new Error('implausible FX payload')
  }
  const round4 = (v) => Math.round(v * 1e4) / 1e4
  return { ...r, usd: round4(r.usd), gbp: round4(r.gbp), ron: round4(r.ron) }
}

const json = (url, signal) =>
  fetch(url, { signal }).then((res) => {
    if (!res.ok) throw new Error(String(res.status))
    return res.json()
  })

export async function fetchRates({ timeoutMs = 8000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const { signal } = controller
  const today = new Date().toISOString().split('T')[0]

  const sources = [
    json('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/eur.json', signal).then(
      (d) => checkFx({ usd: d.eur?.usd, gbp: d.eur?.gbp, ron: d.eur?.ron, date: d.date, src: 'fawazahmed0' }),
    ),
    json('https://latest.currency-api.pages.dev/v1/currencies/eur.json', signal).then((d) =>
      checkFx({ usd: d.eur?.usd, gbp: d.eur?.gbp, ron: d.eur?.ron, date: d.date, src: 'currency-api' }),
    ),
    json('https://api.frankfurter.app/latest?from=EUR&to=USD,GBP,RON', signal).then((d) =>
      checkFx({ usd: d.rates?.USD, gbp: d.rates?.GBP, ron: d.rates?.RON, date: d.date, src: 'ECB' }),
    ),
    json('https://open.er-api.com/v6/latest/EUR', signal).then((d) =>
      checkFx({ usd: d.rates?.USD, gbp: d.rates?.GBP, ron: d.rates?.RON, date: today, src: 'er-api' }),
    ),
  ]

  try {
    return await Promise.any(sources)
  } finally {
    clearTimeout(timer)
    controller.abort() // stop the losers; nothing is listening to them
  }
}

/** The dated fallback, flagged so the UI can badge it as not live. */
export function fallbackRates() {
  return { ...FX_FALLBACK, date: FX_FALLBACK.asOf, src: 'fallback', isFallback: true }
}
