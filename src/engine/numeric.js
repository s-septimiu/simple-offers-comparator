/**
 * Numeric root-finding shared by the tax engines and the "what would this
 * offer need to pay to match the leader?" solver.
 *
 * ⚠ The central constraint: take-home is NOT monotonic in the headline rate.
 *
 * CASS on dividends is a step function — you owe 10% of a *threshold*, not of
 * the amount. Crossing the 6-minimum-wage boundary by one leu costs 2.430 lei,
 * so an SRL offer's take-home genuinely DROPS as the rate rises through a
 * threshold. A plain bisection assumes monotonicity and silently converges to
 * a wrong answer there, which is what the previous implementation did.
 */

const DEFAULT_ITERATIONS = 80
const DEFAULT_MAX_DOUBLINGS = 48

/** Bisect within a bracket already known to contain the crossing. */
export function bisect(fn, target, lo, hi, iterations = DEFAULT_ITERATIONS) {
  for (let i = 0; i < iterations; i++) {
    const mid = (lo + hi) / 2
    if (fn(mid) < target) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/**
 * Smallest x ≥ 0 where fn(x) ≥ target, for a monotonically increasing fn.
 *
 * Grows the upper bound geometrically rather than guessing one. The previous
 * code used `Math.max(amount * 8, 1000)`, which for a RON-denominated offer
 * sitting at 0 gave a 1.000 lei bracket that could never reach a 30.000 lei
 * target — it then returned the bracket midpoint as if it were a solution.
 *
 * @returns {number|null} null when the target is unreachable.
 */
export function solveIncreasing(fn, target, { start = 1, maxDoublings = DEFAULT_MAX_DOUBLINGS } = {}) {
  if (!Number.isFinite(target)) return null
  if (fn(0) >= target) return 0

  let lo = 0
  let hi = start > 0 ? start : 1

  for (let i = 0; ; i++) {
    const v = fn(hi)
    if (Number.isFinite(v) && v >= target) break
    if (i >= maxDoublings) return null
    lo = hi
    hi *= 2
    if (!Number.isFinite(hi)) return null
  }
  return bisect(fn, target, lo, hi)
}

/** The first sub-interval of [lo, hi] in which fn reaches target, or null. */
function firstCrossingCell(fn, target, lo, hi, samples) {
  const step = (hi - lo) / samples
  if (!(step > 0)) return null
  let prev = lo
  for (let i = 1; i <= samples; i++) {
    const x = lo + i * step
    const v = fn(x)
    if (Number.isFinite(v) && v >= target) return [prev, x]
    prev = x
  }
  return null
}

/**
 * Smallest x ≥ 0 where fn(x) ≥ target, WITHOUT assuming fn is monotonic.
 *
 * Three stages: grow an upper bound until the target is reached somewhere, then
 * repeatedly scan for the FIRST cell in which fn crosses the target — refining
 * into that cell each pass — and finally bisect. Taking the first crossing is
 * what stops a later dip below `target` from dragging the answer past an
 * earlier, smaller solution.
 *
 * `depth` matters more than it looks. The features being resolved can be very
 * narrow: the personal-deduction sawtooth dips over a single leu inside a range
 * of thousands, so one pass of even 512 samples straddles the tooth and
 * bisection then lands in the wrong one. Each extra pass multiplies resolution
 * by `samples`, so two passes reach ~0,02 lei at a cost of only 2 × samples
 * evaluations.
 *
 * @returns {number|null} null when the target is unreachable.
 */
export function solveSmallestReaching(
  fn,
  target,
  { start = 1, samples = 256, depth = 2, maxDoublings = DEFAULT_MAX_DOUBLINGS } = {},
) {
  if (!Number.isFinite(target)) return null
  const at0 = fn(0)
  if (Number.isFinite(at0) && at0 >= target) return 0

  let hi = start > 0 ? start : 1
  for (let i = 0; ; i++) {
    const v = fn(hi)
    if (Number.isFinite(v) && v >= target) break
    if (i >= maxDoublings) return null
    hi *= 2
    if (!Number.isFinite(hi)) return null
  }

  let lo = 0
  let upper = hi
  for (let d = 0; d < depth; d++) {
    const cell = firstCrossingCell(fn, target, lo, upper, samples)
    if (!cell) break
    lo = cell[0]
    upper = cell[1]
  }
  return bisect(fn, target, lo, upper)
}
