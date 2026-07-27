/**
 * The state every visitor starts from.
 *
 * Nothing is persisted, so this is the first — and for many people the only —
 * impression the tool makes. The four offers are chosen so that between them
 * they exercise every engagement type and most of the timeline machinery:
 * opening the page IS the feature tour.
 *
 *   1. PFA hourly in EUR                        → the day-off-is-not-free case
 *   2. SRL sistem real, above the micro ceiling → 16% on profit
 *   3. SRL micro monthly in EUR                 → 1% + mandatory salary + dividends
 *   4. CIM in RON, tickets + 13th + probation   → the full payroll stack
 *
 * The three B2B seeds carry no paid leave and the employment one carries the
 * statutory 21 days — see DEFAULT_PTO_DAYS.
 */

/**
 * Each colour carries four values, because a panel tinted for a white page is
 * unreadable on a dark one and vice versa:
 *   hex   — the identity colour (dots, bars, headings) on any background
 *   soft  — pale panel fill, light theme
 *   deep  — text on `soft`, light theme
 *   light — text on the dark-theme panel fill
 */
export const PALETTE = [
  { hex: '#4F46E5', soft: '#EEF2FF', deep: '#312E81', light: '#A5B4FC', name: 'indigo' },
  { hex: '#0D9488', soft: '#F0FDFA', deep: '#134E4A', light: '#5EEAD4', name: 'teal' },
  { hex: '#B45309', soft: '#FFFBEB', deep: '#78350F', light: '#FCD34D', name: 'amber' },
  { hex: '#BE123C', soft: '#FFF1F2', deep: '#881337', light: '#FDA4AF', name: 'rose' },
  { hex: '#7C3AED', soft: '#F5F3FF', deep: '#4C1D95', light: '#C4B5FD', name: 'violet' },
  { hex: '#0369A1', soft: '#F0F9FF', deep: '#0C4A6E', light: '#7DD3FC', name: 'sky' },
]

/** Custom properties the .accent-panel classes resolve against. */
export const accentVars = (color) => ({
  '--a': color.hex,
  '--a-soft': color.soft,
  '--a-deep': color.deep,
  '--a-light': color.light,
})

/** First colour not already in use, so deleting and re-adding never collides. */
export function nextColor(offers) {
  const taken = new Set(offers.map((o) => o.color?.name))
  return PALETTE.find((c) => !taken.has(c.name)) ?? PALETTE[offers.length % PALETTE.length]
}

/**
 * Paid leave belongs to the contract type, not to the person. Employment carries
 * the statutory 21 days; on B2B a day off is a day unbilled until you negotiate
 * otherwise, so every other type starts at zero.
 */
export const DEFAULT_PTO_DAYS = {
  pfa: 0,
  'srl-micro': 0,
  'srl-real': 0,
  cim: 21,
}

export const defaultPtoDays = (engagement) => DEFAULT_PTO_DAYS[engagement] ?? 0

export const OFFER_TEMPLATE = {
  engagement: 'pfa',
  basis: 'monthly',
  amount: 6000,
  currency: 'EUR',
  isNet: false,
  hoursPerWeek: 40,
  daysPerWeek: 5,
  ptoDays: DEFAULT_PTO_DAYS.pfa, // new offers start as PFA
  bonus: 0,
  mealTicket: 0,
  benefitsMonthly: 0,
  dependents: 0,

  // Timeline — all inert by default, so a plain offer stays a plain offer.
  startMonth: 1,
  contractMonths: 12,
  probationMonths: 0,
  probationPct: 100,
  raiseAtMonth: 0,
  raisePct: 0,
  thirteenthSalaryMonths: 0,
  onCallDaysPerMonth: 0,
  onCallRatePerDay: 0,
  overtimeHoursPerMonth: 0,
  overtimeMultiplier: 1.75,

  // SRL only.
  selfHireGrossMonthly: null, // null = statutory minimum, tracking July's rise
  payoutRatio: 1,
}

export function defaultOffers() {
  return [
    {
      ...OFFER_TEMPLATE,
      id: 1,
      name: 'Hourly B2B',
      engagement: 'pfa',
      basis: 'hourly',
      amount: 45,
      currency: 'EUR',
      ptoDays: 0,
      color: PALETTE[0],
    },
    {
      ...OFFER_TEMPLATE,
      id: 2,
      name: 'SRL profit tax',
      engagement: 'srl-real',
      basis: 'daily',
      // Sized so the four offers land within a few thousand euro of each other.
      // A seed where one option wins by 70% teaches nothing — the interesting
      // question is which shape wins when the headline numbers are comparable.
      amount: 390,
      currency: 'EUR',
      ptoDays: 0,
      contractMonths: 6,
      color: PALETTE[1],
    },
    {
      ...OFFER_TEMPLATE,
      id: 3,
      name: 'SRL micro',
      engagement: 'srl-micro',
      basis: 'monthly',
      amount: 7000,
      currency: 'EUR',
      ptoDays: 0,
      color: PALETTE[2],
    },
    {
      ...OFFER_TEMPLATE,
      id: 4,
      name: 'Employment',
      engagement: 'cim',
      basis: 'monthly',
      amount: 32000,
      currency: 'RON',
      ptoDays: 21,
      mealTicket: 45,
      benefitsMonthly: 40,
      thirteenthSalaryMonths: 1,
      probationMonths: 3,
      probationPct: 90,
      color: PALETTE[3],
    },
  ]
}

export function defaultGlobals() {
  return {
    workDays: 248,
    vacationDays: 25,
    sickDays: 5,
    pfaExpensesMonthly: 250,
    pfaMode: 'detailed',
    pfaFlat: 22,
    pensionWeight: 50,
  }
}

export const ENGAGEMENT_LABELS = {
  pfa: 'PFA',
  cim: 'Employment',
  'srl-micro': 'SRL micro',
  'srl-real': 'SRL profit',
}

export const ENGAGEMENT_DESCRIPTIONS = {
  pfa: 'PFA sistem real — CASS on net income between 6 and 72 minimum wages, CAS on a stepped base, then 10% tax.',
  cim: 'Contract individual de muncă — CAS 25% + CASS 10% + 10% tax on the full gross, uncapped.',
  'srl-micro':
    '1% of turnover, a mandatory minimum-wage employee, then 16% on dividends plus stepped CASS. ' +
    'Available only up to 100.000 € of turnover.',
  'srl-real': '16% on profit, then 16% on dividends plus stepped CASS. Required above 100.000 € of turnover.',
}
