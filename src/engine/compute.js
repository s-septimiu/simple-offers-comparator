/**
 * The core: one offer, any engagement type, reduced to what reaches the bank.
 *
 * Everything is computed in RON internally (the tax code is denominated in RON
 * and the plafoane are RON thresholds) and converted to EUR only for display.
 * Converting earlier would round plafon comparisons through a floating FX rate,
 * which is exactly the sort of drift that makes a cliff detector lie.
 */

import {
  TICKET_MAX,
  TICKET_NET_RATIO,
  MICRO_CEILING_EUR,
  VAT_REGISTRATION_THRESHOLD_RON,
} from '../fiscal/constants.js'
import { pfaTax } from '../fiscal/pfa.js'
import { cimMonthlyFromGross, cimGrossFromNet } from '../fiscal/cim.js'
import { computeSrl } from '../fiscal/srl.js'
import { steadySchedule, engagementSchedule, byCalendarYear, steadyFactor } from './schedule.js'

export const ENGAGEMENTS = ['pfa', 'cim', 'srl-micro', 'srl-real']
export const isSrl = (e) => e === 'srl-micro' || e === 'srl-real'
export const isB2B = (e) => e !== 'cim'

/* ── Micro eligibility ──────────────────────────────────────────────────────
 *
 * The only engagement type with a revenue ceiling. PFA and CIM have none — the
 * 72-minimum-wage CASS cap limits a contribution BASE, not eligibility — and
 * the profit-tax SRL is precisely the regime you fall into on the way out.
 *
 * Exported so the selector can mark the option unavailable using the same test
 * the tax engine applies, rather than a second copy of it that can drift.
 */

/** The 100.000 € ceiling in RON, at the rate currently in the header. */
export const microCeilingRON = (g) => MICRO_CEILING_EUR * (g.eurRon || 0)

/** Annual turnover already clears the ceiling → the 1% regime is unavailable.
 *  Strictly greater, matching srl.js: at exactly the ceiling you are still in. */
export const microUnavailable = (turnoverRON, g) => turnoverRON > microCeilingRON(g)

/* ── Currency ───────────────────────────────────────────────────────────── */

/** Units of `currency` per 1 EUR. */
function perEuro(currency, g) {
  const table = { EUR: 1, USD: g.eurUsd, GBP: g.eurGbp, RON: g.eurRon }
  const r = table[currency]
  return Number.isFinite(r) && r > 0 ? r : 1
}

/* ── Working time ───────────────────────────────────────────────────────── */

/**
 * Days and hours actually worked, and how many of them are paid.
 *
 * The asymmetry between contract types is the whole point of this block:
 * on B2B every absent day is simply unbilled, whereas employment pays holiday
 * and covers sick leave separately. A day off is not free on B2B.
 */
export function workingTime(offer, g) {
  const daysPerWeek = clamp(offer.daysPerWeek ?? 5, 0.5, 7)
  const hoursPerWeek = clamp(offer.hoursPerWeek ?? 40, 0, 80)
  const hoursPerDay = daysPerWeek > 0 ? hoursPerWeek / daysPerWeek : 0

  // Part-time by days scales the working year proportionally.
  const contractDays = Math.max(0, (g.workDays || 0) * (daysPerWeek / 5))

  const vacation = Math.max(0, g.vacationDays || 0)
  const sick = Math.max(0, g.sickDays || 0)
  const absent = vacation + sick
  const pto = Math.max(0, offer.ptoDays || 0)

  const daysWorked = Math.max(0, contractDays - absent)
  const unpaidOff =
    offer.engagement === 'cim'
      ? Math.max(0, vacation - pto) // sick leave is covered by the state
      : Math.max(0, absent - pto) // B2B: nothing is covered unless contracted
  const paidDays = Math.max(0, contractDays - unpaidOff)

  return {
    daysPerWeek,
    hoursPerWeek,
    hoursPerDay,
    contractDays,
    daysWorked,
    paidDays,
    unpaidOff,
    hoursWorked: daysWorked * hoursPerDay,
    attendance: contractDays > 0 ? paidDays / contractDays : 0,
  }
}

/* ── Headline amount → a monthly figure in RON ──────────────────────────── */

/**
 * The monthly amount the offer is worth at factor 1, in RON, before any
 * schedule is applied. Hourly and daily rates are annualised over the days
 * actually paid, then divided back to a month, so that unpaid leave is priced
 * in before the schedule modulates anything.
 */
function baseMonthlyRON(offer, g, work) {
  const toRON = g.eurRon / perEuro(offer.currency, g)
  const amount = Math.max(0, offer.amount || 0)

  switch (offer.basis) {
    case 'hourly':
      return (amount * work.hoursPerDay * work.paidDays * toRON) / 12
    case 'daily':
      return (amount * work.paidDays * toRON) / 12
    case 'monthly':
    default:
      // A monthly figure still has to be pro-rated by attendance. A B2B
      // retainer is not paid for months you do not work unless the contract
      // grants the time off, and employment docks unpaid leave beyond
      // entitlement the same way. Without this, "monthly" would be the one
      // basis where a day off is magically free.
      return amount * toRON * work.attendance
  }
}

/** Hourly-equivalent rate in RON, used to price overtime. */
function hourlyEquivalentRON(offer, g, work, monthlyRON) {
  if (offer.basis === 'hourly') {
    return Math.max(0, offer.amount || 0) * (g.eurRon / perEuro(offer.currency, g))
  }
  const monthlyHours = (work.hoursPerWeek * 52) / 12
  return monthlyHours > 0 ? monthlyRON / monthlyHours : 0
}

/**
 * Per-month extras in RON, keyed by engagement month.
 *
 * On-call and overtime recur; the annual bonus and the 13th salary land once.
 * The 13th is deliberately CIM-only — on B2B it is indistinguishable from the
 * annual bonus, and two fields doing one job is how a tool loses credibility.
 */
function monthlyExtrasRON(offer, g, work, monthlyRON, schedule) {
  const toRON = g.eurRon / perEuro(offer.currency, g)
  const hourly = hourlyEquivalentRON(offer, g, work, monthlyRON)

  const onCall = Math.max(0, offer.onCallDaysPerMonth || 0) * Math.max(0, offer.onCallRatePerDay || 0) * toRON
  const overtime =
    Math.max(0, offer.overtimeHoursPerMonth || 0) * hourly * Math.max(1, offer.overtimeMultiplier || 1)

  const activeMonths = schedule.filter((m) => m.active)
  const lastActive = activeMonths.length ? activeMonths[activeMonths.length - 1].engagementMonth : 0

  const bonus = Math.max(0, offer.bonus || 0) * toRON
  const thirteenth =
    offer.engagement === 'cim' ? Math.max(0, offer.thirteenthSalaryMonths || 0) * monthlyRON : 0

  return schedule.map((m) => {
    if (!m.active) return 0
    let extra = onCall + overtime
    // Lump sums land in the final active month rather than being smeared, so
    // that a short contract does not silently collect a full-year bonus.
    if (m.engagementMonth === lastActive) extra += bonus + thirteenth
    return extra
  })
}

/* ── Per-engagement tax passes ──────────────────────────────────────────── */

function computeCim(offer, g, work, schedule, monthlyRON, extras) {
  // A net quote is inverted per month, because the personal deduction makes
  // the net/gross relationship non-linear near the minimum wage.
  const grossFor = (month, factor) => {
    const raw = monthlyRON * factor
    if (!offer.isNet) return raw
    return cimGrossFromNet(raw, { month, dependents: offer.dependents || 0 })
  }

  let gross = 0, cas = 0, cass = 0, tax = 0, net = 0, cam = 0, deduction = 0
  for (let i = 0; i < schedule.length; i++) {
    const m = schedule[i]
    if (!m.active) continue
    const monthGross = grossFor(m.calendarMonth, m.factor) + extras[i]
    const r = cimMonthlyFromGross(monthGross, {
      month: m.calendarMonth,
      dependents: offer.dependents || 0,
      itExemption: offer.itExemption || false,
    })
    gross += r.gross
    cas += r.cas
    cass += r.cass
    tax += r.tax
    net += r.net
    cam += r.cam
    deduction += r.deduction
  }

  const activeMonths = schedule.filter((m) => m.active).length
  const ticketNominal =
    Math.min(Math.max(0, offer.mealTicket || 0), TICKET_MAX) *
    work.daysWorked *
    (activeMonths / 12)
  const ticketsNet = ticketNominal * TICKET_NET_RATIO

  return {
    grossRON: gross,
    casRON: cas,
    cassRON: cass,
    taxRON: tax,
    camRON: cam,
    deductionRON: deduction,
    expensesRON: 0,
    ticketNominalRON: ticketNominal,
    ticketsNetRON: ticketsNet,
    takeHomeRON: net + ticketsNet,
    pensionRON: cas,
    employerCostRON: gross + cam,
  }
}

function computePfa(offer, g, work, schedule, monthlyRON, extras) {
  const activeMonths = schedule.filter((m) => m.active).length
  const monthlyExpenses = Math.max(0, g.businessCostsMonthly || 0) * g.eurRon
  const expenses = monthlyExpenses * activeMonths

  /* Plafoane are assessed per CALENDAR YEAR, never per rolling window. An
   * engagement starting mid-year splits across two tax years and each partial
   * year is tested against the FULL annual thresholds independently — so
   * income that would clear the CAS 12-MW floor over twelve rolling months can
   * fall below it in both calendar years and owe no CAS at all. */
  let revenue = 0, cas = 0, cass = 0, tax = 0
  for (const yearMonths of byCalendarYear(schedule)) {
    const activeInYear = yearMonths.filter((m) => m.active)
    if (!activeInYear.length) continue

    let yearRevenue = 0
    for (const m of activeInYear) yearRevenue += monthlyRON * m.factor + extras[m.index]

    const yearNetIncome = Math.max(0, yearRevenue - monthlyExpenses * activeInYear.length)
    const t = pfaTax(yearNetIncome, g.pfaMode, g.pfaFlat, offer.chosenCasBase ?? null)
    revenue += yearRevenue
    cas += t.cas
    cass += t.cass
    tax += t.tax
  }

  /* Cash, not a tax base: receipts minus what you actually spent. Deliberately
   * NOT clamped at zero the way the per-year base above is — tax cannot go
   * negative, but a year whose costs outran its receipts really does leave you
   * down. Clamping here would also break the drilldown, which subtracts these
   * same lines from gross receipts and must reconcile to the headline. */
  const netIncome = revenue - expenses
  return {
    grossRON: revenue,
    casRON: cas,
    cassRON: cass,
    taxRON: tax,
    camRON: 0,
    deductionRON: 0,
    expensesRON: expenses,
    ticketNominalRON: 0,
    ticketsNetRON: 0,
    takeHomeRON: netIncome - (cas + cass + tax),
    pensionRON: cas,
    employerCostRON: revenue,
  }
}

function computeSrlOffer(offer, g, work, schedule, monthlyRON, extras) {
  const activeMonths = schedule.filter((m) => m.active).length
  const monthlyExpenses = Math.max(0, g.businessCostsMonthly || 0) * g.eurRon
  const expenses = monthlyExpenses * activeMonths
  const ceilingRON = microCeilingRON(g)
  const regime = offer.engagement === 'srl-micro' ? 'micro' : 'real'

  // Grouped by calendar year for the same reason as PFA: the micro ceiling and
  // the dividend CASS brackets are annual tests, and a mid-year start makes
  // each partial year face the full threshold on its own.
  let agg = null
  let overCeiling = false
  let cliff = null

  for (const yearMonths of byCalendarYear(schedule)) {
    const activeInYear = yearMonths.filter((m) => m.active)
    if (!activeInYear.length) continue

    let turnover = 0
    for (const m of activeInYear) turnover += monthlyRON * m.factor + extras[m.index]

    const yearShare = activeInYear.length / 12
    const r = computeSrl({
      turnoverRON: turnover,
      expensesRON: monthlyExpenses * activeInYear.length,
      selfHireGrossMonthly: offer.selfHireGrossMonthly ?? null,
      salaryMonths: activeInYear.map((m) => m.calendarMonth),
      regime,
      payoutRatio: offer.payoutRatio ?? 1,
      microCeilingRON: ceilingRON,
      mealTicketPerDay: offer.mealTicket || 0,
      workedDays: work.daysWorked * yearShare,
      dependents: offer.dependents || 0,
      otherPassiveIncomeRON: offer.otherPassiveIncomeRON || 0,
    })

    overCeiling = overCeiling || r.overCeiling
    cliff = cliff || r.cliff
    agg = agg
      ? {
          turnover: agg.turnover + r.turnover,
          companyTax: agg.companyTax + r.companyTax,
          salaryGross: agg.salaryGross + r.salary.gross,
          salaryNet: agg.salaryNet + r.salary.net,
          salaryCas: agg.salaryCas + r.salary.cas,
          salaryCass: agg.salaryCass + r.salary.cass,
          salaryTax: agg.salaryTax + r.salary.tax,
          cam: agg.cam + r.salary.cam,
          dividendsGross: agg.dividendsGross + r.dividendsGross,
          dividendTax: agg.dividendTax + r.dividendTax,
          dividendCass: agg.dividendCass + r.dividendCass,
          dividendsNet: agg.dividendsNet + r.dividendsNet,
          retained: agg.retained + r.retained,
          ticketNominal: agg.ticketNominal + r.ticketNominal,
          ticketsNet: agg.ticketsNet + r.ticketsNet,
          takeHome: agg.takeHome + r.takeHome,
        }
      : {
          turnover: r.turnover,
          companyTax: r.companyTax,
          salaryGross: r.salary.gross,
          salaryNet: r.salary.net,
          salaryCas: r.salary.cas,
          salaryCass: r.salary.cass,
          salaryTax: r.salary.tax,
          cam: r.salary.cam,
          dividendsGross: r.dividendsGross,
          dividendTax: r.dividendTax,
          dividendCass: r.dividendCass,
          dividendsNet: r.dividendsNet,
          retained: r.retained,
          ticketNominal: r.ticketNominal,
          ticketsNet: r.ticketsNet,
          takeHome: r.takeHome,
        }
  }

  if (!agg) {
    return {
      grossRON: 0, casRON: 0, cassRON: 0, taxRON: 0, camRON: 0, deductionRON: 0,
      expensesRON: 0, ticketNominalRON: 0, ticketsNetRON: 0, takeHomeRON: 0,
      pensionRON: 0, employerCostRON: 0, srl: null, overCeiling: false, cliff: null,
    }
  }

  return {
    grossRON: agg.turnover,
    casRON: agg.salaryCas,
    cassRON: agg.salaryCass + agg.dividendCass,
    taxRON: agg.salaryTax + agg.companyTax + agg.dividendTax,
    camRON: agg.cam,
    deductionRON: 0,
    expensesRON: expenses,
    ticketNominalRON: agg.ticketNominal,
    ticketsNetRON: agg.ticketsNet,
    takeHomeRON: agg.takeHome,
    pensionRON: agg.salaryCas,
    employerCostRON: agg.turnover,
    srl: { ...agg, regime: overCeiling ? 'real' : regime },
    overCeiling,
    cliff,
  }
}

/* ── Public entry points ────────────────────────────────────────────────── */

function run(offer, g, schedule) {
  const work = workingTime(offer, g)
  const monthlyRON = baseMonthlyRON(offer, g, work)
  const extras = monthlyExtrasRON(offer, g, work, monthlyRON, schedule)

  const core =
    offer.engagement === 'cim'
      ? computeCim(offer, g, work, schedule, monthlyRON, extras)
      : isSrl(offer.engagement)
        ? computeSrlOffer(offer, g, work, schedule, monthlyRON, extras)
        : computePfa(offer, g, work, schedule, monthlyRON, extras)

  const activeMonths = schedule.filter((m) => m.active).length
  const benefitsRON = Math.max(0, offer.benefitsMonthly || 0) * g.eurRon * activeMonths
  const takeHomeRON = core.takeHomeRON + benefitsRON

  // What a full-price year would have paid, so unpaid leave can be priced.
  const grossFullRON = grossIfNothingUnpaid(offer, g, work, schedule, extras)
  const unpaidLossRON = Math.max(0, grossFullRON - core.grossRON)

  const toEur = (v) => (g.eurRon > 0 ? v / g.eurRon : 0)
  const pensionValueRON = core.pensionRON * ((g.pensionWeight || 0) / 100)

  const barTotalRON =
    takeHomeRON + core.casRON + core.cassRON + core.taxRON + core.expensesRON + unpaidLossRON

  return {
    ...core,
    activeMonths,
    work,
    benefitsRON,
    unpaidLossRON,
    takeHomeRON,
    valueRON: takeHomeRON + pensionValueRON,
    barTotalRON,

    // EUR mirrors for display.
    grossEUR: toEur(core.grossRON),
    takeHomeEUR: toEur(takeHomeRON),
    casEUR: toEur(core.casRON),
    cassEUR: toEur(core.cassRON),
    taxEUR: toEur(core.taxRON),
    expensesEUR: toEur(core.expensesRON),
    unpaidLossEUR: toEur(unpaidLossRON),
    ticketsNetEUR: toEur(core.ticketsNetRON),
    benefitsEUR: toEur(benefitsRON),
    pensionEUR: toEur(core.pensionRON),
    valueEUR: toEur(takeHomeRON + pensionValueRON),
    barTotalEUR: toEur(barTotalRON),
    employerCostEUR: toEur(core.employerCostRON),

    monthlyEUR: toEur(takeHomeRON) / 12,
    monthlyRON: takeHomeRON / 12,
    annualRON: takeHomeRON,
    perHourEUR: work.hoursWorked > 0 ? toEur(takeHomeRON) / work.hoursWorked : 0,
    keepRatio: barTotalRON > 0 ? (takeHomeRON / barTotalRON) * 100 : 0,

    vatThresholdCrossed: isB2B(offer.engagement) && core.grossRON > VAT_REGISTRATION_THRESHOLD_RON,
  }
}

function grossIfNothingUnpaid(offer, g, work, schedule, extras) {
  if (work.unpaidOff <= 0) return 0
  const full = { ...offer, ptoDays: work.unpaidOff + (offer.ptoDays || 0) }
  const fullWork = workingTime(full, g)
  const monthly = baseMonthlyRON(full, g, fullWork)
  let total = 0
  for (let i = 0; i < schedule.length; i++) {
    if (!schedule[i].active) continue
    total += monthly * schedule[i].factor + extras[i]
  }
  return total
}

/**
 * THE HEADLINE. Twelve months at the settled rate, one full calendar year.
 *
 * This is what the ranking, the best-offer badge and the solver all use.
 * startMonth and contractMonths deliberately do not enter here: an ongoing
 * engagement fills a tax year, and a permanent role should not rank below an
 * identical one forever merely because year one had probation in it.
 */
export function compute(offer, g) {
  return run(offer, g, steadySchedule(offer))
}

/**
 * The cash actually banked over the engagement as scheduled — probation,
 * raise, contract end and mid-year start all applied, and taxed per calendar
 * year rather than per rolling window.
 *
 * Computed independently of compute(); neither figure is the other scaled.
 */
export function computeEngagement(offer, g) {
  return run(offer, g, engagementSchedule(offer))
}

export { steadyFactor }

function clamp(v, lo, hi) {
  const n = Number(v)
  if (!Number.isFinite(n)) return lo
  return Math.min(Math.max(n, lo), hi)
}
