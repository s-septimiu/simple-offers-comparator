/** Display formatting. Romanian conventions: dot thousands, comma decimals. */

const eurFmt = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0, minimumFractionDigits: 0 })
const eurFmt1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 })
const ronFmt = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 })

const safe = (n) => (Number.isFinite(n) ? n : 0)

export const eur = (n, d = 0) => '€' + (d === 0 ? eurFmt : eurFmt1).format(safe(n))
export const ron = (n) => ronFmt.format(Math.round(safe(n))) + ' lei'
export const pct = (n, d = 1) => safe(n).toFixed(d) + '%'
export const num = (n) => ronFmt.format(Math.round(safe(n)))

/** Signed, for delta columns where the direction carries the meaning. */
export const signedEur = (n) => (safe(n) >= 0 ? '+' : '−') + eur(Math.abs(safe(n)))

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
