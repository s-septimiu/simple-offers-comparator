/**
 * Compensation timelines.
 *
 * A real offer is rarely a flat rate for twelve months. It ramps through
 * probation, steps up at a review, starts mid-year, or ends after six months.
 * This module turns those fields into a per-month multiplier that the tax
 * engines can integrate over.
 *
 * ── Why there are two schedules ────────────────────────────────────────────
 *
 * `steadySchedule` is what the comparison RANKS on: twelve months at the
 * settled, post-probation, post-raise rate. It answers "what does this job
 * pay?", which is the question being compared, and it is stable — a permanent
 * role does not deserve to rank below an identical one forever merely because
 * it had three months of probation in year one.
 *
 * `engagementSchedule` is the actual cash: probation included, raise applied
 * when it lands, zero after the contract ends. It answers "what will I bank?".
 * It feeds the contract-total figure and the first-twelve-months line.
 *
 * Neither is derived from the other by scaling. Each is taxed on its own real
 * income so that the drill-down reproduces the headline exactly.
 */

/** Multiplier once every ramp has finished — what the job "really" pays. */
export function steadyFactor(offer) {
  const raise = offer.raiseAtMonth > 0 ? 1 + (offer.raisePct || 0) / 100 : 1
  return Math.max(0, raise)
}

/** True when any timeline field departs from "flat rate, twelve months". */
export function hasTimeline(offer) {
  return Boolean(
    (offer.probationMonths > 0 && offer.probationPct !== 100) ||
      (offer.raiseAtMonth > 0 && offer.raisePct !== 0) ||
      (offer.contractMonths > 0 && offer.contractMonths < 12) ||
      (offer.startMonth > 1),
  )
}

/**
 * The ranking schedule: twelve calendar months, January to December, all at the
 * settled rate. `calendarYear` is 0 throughout — an ongoing engagement always
 * fills a whole tax year, which is precisely why plafoane apply cleanly to it
 * and why startMonth is irrelevant here.
 */
export function steadySchedule(offer) {
  const factor = steadyFactor(offer)
  return Array.from({ length: 12 }, (_, i) => ({
    index: i,
    engagementMonth: i + 1,
    calendarMonth: i + 1,
    calendarYear: 0,
    factor,
    active: true,
  }))
}

/**
 * The cash-flow schedule: twelve months from the start date, with probation,
 * the raise and the contract end applied.
 *
 * ⚠ `calendarYear` is the load-bearing field. Plafoane (CAS floors, the CASS
 * cap, the dividend brackets) are assessed per CALENDAR YEAR, not per rolling
 * twelve-month window. An engagement starting in September splits its income
 * across two tax years, and each partial year is tested against the FULL annual
 * thresholds independently — so income that would clear the CAS 12-MW floor
 * over a rolling year can fall below it in both calendar years and owe no CAS
 * at all. Callers must group by this field before applying any annual tax.
 */
export function engagementSchedule(offer) {
  const start = clampMonth(offer.startMonth ?? 1)
  const term = offer.contractMonths > 0 ? offer.contractMonths : 12
  const probationMonths = Math.max(0, offer.probationMonths || 0)
  const probationFactor = probationMonths > 0 ? (offer.probationPct ?? 100) / 100 : 1
  const raiseAt = offer.raiseAtMonth > 0 ? offer.raiseAtMonth : null
  const raiseFactor = raiseAt ? 1 + (offer.raisePct || 0) / 100 : 1

  return Array.from({ length: 12 }, (_, i) => {
    const engagementMonth = i + 1
    const zeroBased = start - 1 + i
    const calendarMonth = (zeroBased % 12) + 1
    const calendarYear = Math.floor(zeroBased / 12)
    const active = engagementMonth <= term

    let factor = 1
    if (engagementMonth <= probationMonths) factor *= probationFactor
    if (raiseAt && engagementMonth >= raiseAt) factor *= raiseFactor

    return {
      index: i,
      engagementMonth,
      calendarMonth,
      calendarYear,
      factor: active ? Math.max(0, factor) : 0,
      active,
    }
  })
}

/** Groups a schedule into calendar years, so annual taxes apply to each. */
export function byCalendarYear(schedule) {
  const years = new Map()
  for (const m of schedule) {
    if (!years.has(m.calendarYear)) years.set(m.calendarYear, [])
    years.get(m.calendarYear).push(m)
  }
  return [...years.values()]
}

function clampMonth(m) {
  const n = Math.round(Number(m) || 1)
  return Math.min(Math.max(n, 1), 12)
}
