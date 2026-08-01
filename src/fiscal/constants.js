/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ROMANIAN FISCAL CONSTANTS — fiscal year 2026
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  THIS IS THE ONLY FILE YOU NEED TO EDIT WHEN THE LAW CHANGES.
 *
 *  Everything downstream — the four tax engines, the comparison table, the
 *  warnings — derives from the values below. Nothing is hardcoded elsewhere.
 *  Last reviewed: 2026-07-27.
 *
 *  When updating for a new fiscal year:
 *    1. Change MW_JANUARY / MW_JULY and the rates below.
 *    2. Run `npm test` — the boundary tests will tell you what moved.
 *    3. Update FISCAL_YEAR and LAST_REVIEWED.
 * ─────────────────────────────────────────────────────────────────────────── */

export const FISCAL_YEAR = 2026
export const LAST_REVIEWED = '2026-08-01'

/* ── Minimum wage ──────────────────────────────────────────────────────────
 *
 * Romania raised the gross minimum wage mid-year, which matters because two
 * different things depend on it and they do NOT move together:
 *
 *   • Annual plafoane (CAS/CASS thresholds for PFA and dividends) are pinned
 *     to the value in force on 1 JANUARY and stay there for the whole fiscal
 *     year — Cod fiscal art. 170 / 174.
 *   • Actual payroll (a minimum-wage employment contract, the personal
 *     deduction grid) uses whatever is in force THAT MONTH.
 *
 * ⚠ KNOWN AMBIGUITY: sources disagree on whether the plafoane follow the July
 *   increase mid-year. avocatnet.ro reports the 2026 plafoane stay pinned to
 *   4.050; several outlets say they adjust from July. We take the 1 January
 *   pinning as the safe reading of art. 170/174. If ANAF clarifies otherwise,
 *   change PLAFON_ANCHOR below — everything else follows automatically.
 */
export const MW_JANUARY = 4050
export const MW_JULY = 4325
export const MW_JULY_EFFECTIVE_MONTH = 7 // 1-indexed; July

/** The minimum wage the annual CAS/CASS plafoane are computed from. */
export const PLAFON_ANCHOR = MW_JANUARY

/** Gross minimum wage in force in a given month (1 = January). */
export function minimumWageForMonth(month) {
  return month >= MW_JULY_EFFECTIVE_MONTH ? MW_JULY : MW_JANUARY
}

/** Average minimum wage across a calendar year — for annualised payroll math. */
export const MW_ANNUAL_AVERAGE =
  Array.from({ length: 12 }, (_, i) => minimumWageForMonth(i + 1)).reduce(
    (a, b) => a + b,
    0,
  ) / 12

/* ── Contribution and tax rates ──────────────────────────────────────────── */

export const CAS_RATE = 0.25 // pension, employee-borne
export const CASS_RATE = 0.1 // health, employee-borne
export const TAX_RATE = 0.1 // income tax
export const CAM_RATE = 0.0225 // employer-borne work insurance contribution

/**
 * The IT income-tax exemption was ELIMINATED by OUG 156/2024 effective
 * January 2025. Kept as a flag only so the old regime can be modelled for
 * comparison — it is not available in 2026.
 */
export const IT_EXEMPTION_AVAILABLE = false

/* ── PFA / independent income plafoane (multiples of PLAFON_ANCHOR) ─────── */

export const CAS_FLOOR_12 = 12 * PLAFON_ANCHOR //  48.600 — below this, no CAS due
export const CAS_FLOOR_24 = 24 * PLAFON_ANCHOR //  97.200 — above this, base caps here
export const CASS_FLOOR_6 = 6 * PLAFON_ANCHOR //  24.300 — minimum CASS base
export const CASS_CAP_72 = 72 * PLAFON_ANCHOR // 291.600 — CASS ceiling, Legea 141/2025

/* ── Dividend taxation (SRL) ─────────────────────────────────────────────
 *
 * Raised from 10% to 16% for any distribution made in 2026, regardless of
 * which year the underlying profit comes from.
 */
export const DIVIDEND_TAX_RATE = 0.16

/**
 * CASS on dividends is a STEP function, not a percentage of the amount: you
 * owe 10% of a *threshold*, not 10% of what you received. Crossing a boundary
 * by one leu costs the full step. This is the sharpest cliff in the Romanian
 * tax code and the tool detects proximity to it explicitly.
 *
 * Brackets are cumulative across all non-salary income (dividends, rent,
 * interest, capital gains) but computed separately from salary and from
 * independent (PFA) income.
 *
 * Expressed as multiples of PLAFON_ANCHOR: reaching 6 MW of dividends means
 * owing CASS on 6 MW, reaching 12 means owing on 12, and so on.
 */
export const DIVIDEND_CASS_BRACKET_MULTIPLES = [6, 12, 24]

/* ── Microenterprise (SRL micro) ─────────────────────────────────────────
 *
 * 2026 changes, all in force from 1 January:
 *   • The 3% tier is ABOLISHED. One flat rate of 1% on turnover.
 *   • Ceiling cut to 100.000 EUR (from 250.000).
 *   • At least one employee is mandatory — in practice you hire yourself.
 *
 * The tax base is TURNOVER, not profit. Deductible expenses do not reduce it.
 * This is the single most misunderstood thing about the micro regime.
 */
export const MICRO_TAX_RATE = 0.01
export const MICRO_CEILING_EUR = 100_000
export const MICRO_REQUIRES_EMPLOYEE = true

/** Profit tax for an SRL outside the micro regime. */
export const PROFIT_TAX_RATE = 0.16

/* ── VAT ─────────────────────────────────────────────────────────────────
 *
 * Informational only. We do not model VAT: for B2B clients outside Romania
 * it is reverse-charged and never touches take-home. The threshold is
 * surfaced as a warning so nobody is blindsided by the registration duty.
 */
export const VAT_REGISTRATION_THRESHOLD_RON = 395_000

/* ── Mijloace fixe ───────────────────────────────────────────────────────
 *
 * The valoare de intrare at or above which a purchase stops being an expense
 * and becomes a MIJLOC FIX: deducted through linear amortization over its
 * Catalog life (HG 2139/2004 — 2 to 4 years for IT equipment) rather than in
 * the year it is paid. Below it, an obiect de inventar, deductible on payment.
 *
 * Raised from 2.500 by OUG 8/2026, in force 25 February 2026. Reaches PFA via
 * art. 68 alin. (4), which refers amortization to art. 28.
 *
 * We do NOT model amortization — the costs field is a single monthly figure
 * with no purchase dates in it, so there is nothing to amortize. This constant
 * exists only to warn that the figure assumes recurring spend. For the same
 * reason two refinements are deliberately skipped: the 25 February effective
 * date, and the transitional rule keeping assets of 2.500–5.000 lei already
 * depreciating on 31.12.2025 on their remaining life. Both matter only to
 * someone reconciling a real registru, which this tool is not.
 */
export const MIJLOC_FIX_THRESHOLD_RON = 5_000

/* ── Meal tickets ────────────────────────────────────────────────────────
 *
 * ⚠ DO NOT "FIX" TICKET_NET_RATIO TO 0.81.
 *
 * It is tempting to reason that CASS is deducted first and income tax then
 * applies to the remainder, giving 0.9 × 0.9 = 0.81. That is wrong. Both
 * withholdings apply to the FULL NOMINAL VALUE of the ticket, so they simply
 * add: 10% + 10% = 20% retained, 80% kept.
 *
 * Verified against the standard worked example:
 *   21 worked days × 45 lei = 945 lei nominal
 *   → 189 lei retained (exactly 20%) → 756 lei net.
 *
 * Tickets are CAS-exempt and CAM-exempt, which is precisely why they beat
 * salary per leu: 80% net efficiency against 58,5% on ordinary gross.
 */
export const TICKET_MAX = 45 // RON per worked day — Legea 201/2025
export const TICKET_NET_RATIO = 1 - CASS_RATE - TAX_RATE // 0.80 — see above

/* ── Derived salary ratios ───────────────────────────────────────────────
 *
 * Derived rather than hardcoded so they can never desync from the rates.
 * Valid only where the personal deduction is zero, i.e. above the grid
 * ceiling — which is why cimGrossFromNet() does a numeric solve instead of
 * dividing by this. See fiscal/cim.js.
 */
export const CIM_NET_RATIO = (1 - CAS_RATE - CASS_RATE) * (1 - TAX_RATE) // 0.585

/* ── Personal deduction (deducere personală) — Cod fiscal art. 77 ────────
 *
 * Applies only at the employee's "funcția de bază" and only up to
 * MW + 2.000 lei gross. Near-irrelevant at senior developer salaries, but
 * decisive for the mandatory minimum-wage self-hire inside an SRL — which is
 * exactly why it is modelled here rather than assumed to be zero.
 *
 * Formula, reverse-engineered from the published grid and verified against
 * five points of it (see cim.test.js):
 *
 *   deduction = pct × MW × (1 − ceil(delta / 50) × 50 / 2000)
 *   where delta = gross − MW, and pct = 20% + 5% per dependent (max 4).
 */
export const DEDUCTION_PHASE_OUT_RANGE = 2000
export const DEDUCTION_BRACKET_STEP = 50
export const DEDUCTION_BASE_PCT = 0.2
export const DEDUCTION_PCT_PER_DEPENDENT = 0.05
export const DEDUCTION_MAX_DEPENDENTS = 4

/** Supplementary deduction: 100 lei/month per enrolled child, one parent only. */
export const DEDUCTION_PER_CHILD = 100

/* ── FX fallback rates ───────────────────────────────────────────────────
 *
 * Used only when every live source fails. Rendered with an explicit
 * "fallback, not live" badge — silent stale defaults that look authoritative
 * are worse than no rate at all.
 */
export const FX_FALLBACK = {
  ron: 5.09,
  usd: 1.17,
  gbp: 0.87,
  asOf: '2026-07-27',
}

/* ── Working-time defaults ───────────────────────────────────────────────── */

export const DEFAULT_WORK_DAYS = 248 // RO business days net of public holidays
export const MAX_WORK_DAYS = 261
export const STATUTORY_MIN_PTO_DAYS = 20 // Codul muncii minimum for CIM
export const OVERTIME_MIN_MULTIPLIER = 1.75 // Codul muncii: +75% minimum
