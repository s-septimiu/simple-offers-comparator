/**
 * "What would this offer have to pay to match the leader?"
 *
 * Deceptively hard, because take-home is not monotonic in the headline rate.
 * Two separate step functions bend the curve downward:
 *
 *   • CASS on dividends (SRL) — crossing 6 minimum wages costs 2.430 lei at once
 *   • the CAS floors (PFA)    — crossing 12 minimum wages costs 12.150 lei
 *
 * So the answer can legitimately be LOWER than what the offer already pays:
 * there are bands where asking for less leaves you with more. A naive bisection
 * both misses those and, worse, converges confidently to a wrong number.
 */

import { compute } from './compute.js'
import { solveSmallestReaching } from './numeric.js'

/**
 * @returns {{amount: number, direction: 'raise'|'cut'|'met'}|null}
 *   null when no achievable rate reaches the target.
 */
export function solveAmount(offer, globals, target, metric = (r) => r.takeHomeEUR) {
  if (!Number.isFinite(target) || target <= 0) return null

  const at = (amount) => metric(compute({ ...offer, amount }, globals))

  const current = at(Math.max(0, offer.amount || 0))
  if (current >= target) return { amount: Math.max(0, offer.amount || 0), direction: 'met' }

  const amount = solveSmallestReaching(at, target, {
    start: Math.max(offer.amount || 0, 1),
    samples: 192,
    depth: 2,
  })
  if (amount == null || !Number.isFinite(amount)) return null

  if (amount < (offer.amount || 0)) return { amount, direction: 'cut' }

  /* The upward scan alone under-reports the "ask for less" case.
   *
   * Its cells are sized from the search ceiling, but a dividend-CASS dead zone
   * is a FIXED width in lei (the step divided by 1 − dividend tax), so the
   * higher the rate, the narrower that band is relative to a cell — and the
   * more reliably a general-purpose scan steps straight over it.
   *
   * Since the question "could I do better by asking for less?" is bounded by
   * the current rate, probe that interval directly at fixed resolution. Two
   * hundred extra evaluations is well under a millisecond. */
  const ceiling = offer.amount || 0
  if (ceiling > 0) {
    const steps = 200
    for (let i = 1; i <= steps; i++) {
      const candidate = (ceiling * i) / steps
      if (at(candidate) >= target) {
        return candidate < ceiling
          ? { amount: candidate, direction: 'cut' }
          : { amount, direction: 'raise' }
      }
    }
  }

  return { amount, direction: 'raise' }
}
