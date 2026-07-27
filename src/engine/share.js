/**
 * Shareable links.
 *
 * The tool never persists anything, so a link is the only way to keep a
 * comparison: send it to a friend, an accountant, or your future self. That
 * makes the round trip load-bearing, which is why it is tested.
 *
 * Keys are shortened before encoding because URLs get pasted into chat clients
 * that wrap and truncate. Base64url keeps it copy-pasteable everywhere.
 */

import { OFFER_TEMPLATE, PALETTE, defaultGlobals } from '../defaults.js'

const OFFER_KEYS = {
  name: 'n', engagement: 'e', basis: 'b', amount: 'a', currency: 'c', isNet: 'N',
  hoursPerWeek: 'h', daysPerWeek: 'd', ptoDays: 'p', bonus: 'B', mealTicket: 'm',
  benefitsMonthly: 'k', dependents: 'D', startMonth: 's', contractMonths: 't',
  probationMonths: 'q', probationPct: 'Q', raiseAtMonth: 'r', raisePct: 'R',
  thirteenthSalaryMonths: 'x', onCallDaysPerMonth: 'o', onCallRatePerDay: 'O',
  overtimeHoursPerMonth: 'v', overtimeMultiplier: 'V',
  selfHireGrossMonthly: 'S', payoutRatio: 'y',
}

const GLOBAL_KEYS = {
  workDays: 'W', vacationDays: 'H', sickDays: 'K', pfaExpensesMonthly: 'X',
  pfaMode: 'M', pfaFlat: 'F', pensionWeight: 'P',
}

const FX_KEYS = { eurRon: 'ron', eurUsd: 'usd', eurGbp: 'gbp' }

function pack(obj, keyMap, reference) {
  const out = {}
  for (const [long, short] of Object.entries(keyMap)) {
    const v = obj[long]
    // Only carry what differs from the template — most offers differ in a
    // handful of fields, and this keeps typical links short.
    if (v !== undefined && v !== reference?.[long]) out[short] = v
  }
  return out
}

function unpack(packed, keyMap, reference) {
  const out = { ...reference }
  const reverse = Object.fromEntries(Object.entries(keyMap).map(([l, s]) => [s, l]))
  for (const [short, v] of Object.entries(packed || {})) {
    const long = reverse[short]
    if (long) out[long] = v
  }
  return out
}

export function encodeState({ offers, globals, fx }) {
  const payload = {
    o: offers.map((o) => ({ ...pack(o, OFFER_KEYS, OFFER_TEMPLATE), C: o.color?.name })),
    g: pack(globals, GLOBAL_KEYS, defaultGlobals()),
    f: pack(fx, FX_KEYS, {}),
    z: 1, // schema version, so an old link can be rejected rather than misread
  }
  return toBase64Url(JSON.stringify(payload))
}

export function decodeState(hash) {
  if (!hash) return null
  try {
    const payload = JSON.parse(fromBase64Url(hash.replace(/^#/, '')))
    if (!payload || payload.z !== 1 || !Array.isArray(payload.o) || !payload.o.length) return null

    const offers = payload.o.map((packed, i) => {
      const offer = unpack(packed, OFFER_KEYS, OFFER_TEMPLATE)
      const color = PALETTE.find((c) => c.name === packed.C) ?? PALETTE[i % PALETTE.length]
      return { ...offer, id: i + 1, name: offer.name ?? `Offer ${i + 1}`, color }
    })

    return {
      offers,
      globals: unpack(payload.g, GLOBAL_KEYS, defaultGlobals()),
      fx: unpack(payload.f, FX_KEYS, {}),
    }
  } catch {
    // A malformed link must degrade to the default state, never to a crash.
    return null
  }
}

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}
