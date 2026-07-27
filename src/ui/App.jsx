import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import Field from './Field.jsx'
import Seg from './Seg.jsx'
import { useNumericText } from './useNumericText.js'
import OfferCard from './OfferCard.jsx'
import Waterfall from './Waterfall.jsx'
import ComparisonTable from './ComparisonTable.jsx'
import { compute, computeEngagement } from '../engine/compute.js'
import { solveAmount } from '../engine/solve.js'
import { warningsFor } from '../engine/warnings.js'
import { fetchRates, fallbackRates } from '../engine/fx.js'
import { encodeState, decodeState } from '../engine/share.js'
import { defaultOffers, defaultGlobals, nextColor, OFFER_TEMPLATE, accentVars } from '../defaults.js'
import { eur, ron, pct, num } from '../format.js'
import {
  CASS_FLOOR_6, CASS_CAP_72, CAS_FLOOR_12, CAS_FLOOR_24,
  FISCAL_YEAR, MW_JANUARY, MW_JULY, LAST_REVIEWED, FX_FALLBACK,
} from '../fiscal/constants.js'

/**
 * A share link, if present, wins over the seeded defaults — it is an explicit
 * act by the user. A bare URL always gives the same starting state, because
 * nothing is ever written to localStorage.
 */
function initialState() {
  const shared = decodeState(window.location.hash)
  if (shared) return { ...shared, fromLink: true }
  return { offers: defaultOffers(), globals: defaultGlobals(), fx: null, fromLink: false }
}

export default function App() {
  const [boot] = useState(initialState)
  const [offers, setOffers] = useState(boot.offers)
  const [g, setG] = useState(boot.globals)
  const [rankBy, setRankBy] = useState('take')
  const [copied, setCopied] = useState(false)

  const [eurRon, setEurRon] = useState(boot.fx?.eurRon ?? FX_FALLBACK.ron)
  const [eurUsd, setEurUsd] = useState(boot.fx?.eurUsd ?? FX_FALLBACK.usd)
  const [eurGbp, setEurGbp] = useState(boot.fx?.eurGbp ?? FX_FALLBACK.gbp)
  const [fx, setFx] = useState({ date: null, src: null, loading: false, isFallback: true, manual: false })

  const fromLink = useRef(boot.fromLink)

  const loadFx = useCallback(async () => {
    setFx((s) => ({ ...s, loading: true }))
    try {
      const d = await fetchRates()
      setEurRon(d.ron)
      setEurUsd(d.usd)
      setEurGbp(d.gbp)
      setFx({ date: d.date, src: d.src, loading: false, isFallback: false, manual: false })
    } catch {
      const f = fallbackRates()
      // Do not clobber rates that arrived in a share link — those were chosen.
      if (!fromLink.current) {
        setEurRon(f.ron)
        setEurUsd(f.usd)
        setEurGbp(f.gbp)
      }
      setFx({ date: f.date, src: f.src, loading: false, isFallback: true, manual: false })
    }
  }, [])

  useEffect(() => {
    loadFx()
  }, [loadFx])

  const globals = useMemo(() => ({ ...g, eurRon, eurUsd, eurGbp }), [g, eurRon, eurUsd, eurGbp])

  const results = useMemo(() => offers.map((o) => compute(o, globals)), [offers, globals])
  const engagementResults = useMemo(
    () => offers.map((o) => computeEngagement(o, globals)),
    [offers, globals],
  )
  const warnings = useMemo(
    () => offers.map((o, i) => warningsFor(o, results[i], globals)),
    [offers, results, globals],
  )

  const metric = useCallback((r) => (rankBy === 'take' ? r.takeHomeEUR : r.valueEUR), [rankBy])

  const bestIdx = useMemo(() => {
    if (!results.length) return -1
    let best = 0
    for (let i = 1; i < results.length; i++) if (metric(results[i]) > metric(results[best])) best = i
    return best
  }, [results, metric])

  const scale = useMemo(() => Math.max(...results.map((r) => r.barTotalRON), 1), [results])

  /* ── Mutations ────────────────────────────────────────────────────────── */

  const patch = (id, k, v) => setOffers((os) => os.map((o) => (o.id === id ? { ...o, [k]: v } : o)))

  const addOffer = () =>
    setOffers((os) => [
      ...os,
      {
        ...OFFER_TEMPLATE,
        id: Math.max(0, ...os.map((o) => o.id)) + 1,
        name: `Offer ${os.length + 1}`,
        color: nextColor(os),
      },
    ])

  const dupOffer = (o) =>
    setOffers((os) => [
      ...os,
      { ...o, id: Math.max(0, ...os.map((x) => x.id)) + 1, name: `${o.name} copy`, color: nextColor(os) },
    ])

  const delOffer = (id) => setOffers((os) => (os.length > 1 ? os.filter((o) => o.id !== id) : os))

  const reset = () => {
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    fromLink.current = false
    setOffers(defaultOffers())
    setG(defaultGlobals())
  }

  const share = async () => {
    const hash = encodeState({ offers, globals: g, fx: { eurRon, eurUsd, eurGbp } })
    const url = `${window.location.origin}${window.location.pathname}#${hash}`
    window.history.replaceState(null, '', `#${hash}`)
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    } catch {
      // Clipboard is blocked on file:// and in some browsers; the URL bar now
      // holds the link either way, so say that instead of failing silently.
      setCopied('manual')
      setTimeout(() => setCopied(false), 4000)
    }
  }

  const setRate = (setter) => (v) => {
    setter(v)
    setFx((s) => ({ ...s, manual: true, isFallback: false }))
  }

  /* ── Render ───────────────────────────────────────────────────────────── */

  const best = bestIdx >= 0 ? results[bestIdx] : null

  return (
    <div className="min-h-screen p-3 sm:p-5 pb-12">
      <div className="max-w-6xl mx-auto">
        <Header
          eurRon={eurRon} eurUsd={eurUsd} eurGbp={eurGbp}
          setEurRon={setRate(setEurRon)} setEurUsd={setRate(setEurUsd)} setEurGbp={setRate(setEurGbp)}
          fx={fx} loadFx={loadFx} share={share} copied={copied} reset={reset}
        />

        {/* ── Offer cards ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-4 print-grid-2">
          {offers.map((o, i) => (
            <OfferCard
              key={o.id}
              offer={o}
              result={results[i]}
              engagementResult={engagementResults[i]}
              globals={globals}
              warnings={warnings[i]}
              isBest={i === bestIdx}
              canDelete={offers.length > 1}
              patch={(k, v) => patch(o.id, k, v)}
              onDuplicate={() => dupOffer(o)}
              onDelete={() => delOffer(o.id)}
              solveHint={
                i === bestIdx || !best ? null : <SolveHint offer={o} globals={globals} target={metric(best)} metric={metric} />
              }
            />
          ))}

          <button
            onClick={addOffer}
            className="no-print rounded-xl border-2 border-dashed rule ink-3 hover:ink-2 transition-colors min-h-[140px] flex flex-col items-center justify-center gap-1"
          >
            <span className="text-xl leading-none">+</span>
            <span className="text-xs font-bold">Add an offer</span>
          </button>
        </div>

        <Assumptions g={g} setG={setG} />

        {/* ── Waterfall ───────────────────────────────────────────────── */}
        <section className="surface rounded-xl border p-4 mb-4 print-avoid-break">
          <div className="flex items-baseline justify-between mb-3 gap-2 flex-wrap">
            <h2 className="text-xs font-bold ink-3 uppercase tracking-[0.14em]">Where the gross goes</h2>
            <span className="text-[10px] ink-3">bars scaled to the largest gross</span>
          </div>
          <Waterfall offers={offers} results={results} scale={scale} eurRon={eurRon} />
        </section>

        <ComparisonTable
          offers={offers} results={results} engagementResults={engagementResults}
          bestIdx={bestIdx} pensionWeight={g.pensionWeight} metric={metric}
        />

        {best && (
          <Verdict
            offers={offers} results={results} bestIdx={bestIdx}
            rankBy={rankBy} setRankBy={setRankBy} metric={metric} eurRon={eurRon}
          />
        )}

        <Insights />

        <footer className="text-center text-[11px] ink-3 mt-6 leading-relaxed">
          <p>
            Estimates for planning, not for filings. Confirm any offer's fine print, and your own
            fiscal position, with an accountant.
          </p>
          <p className="mt-1">
            Fiscal year {FISCAL_YEAR} · minimum wage {ron(MW_JANUARY)} to 30 June, {ron(MW_JULY)}{' '}
            from 1 July · rules last reviewed {LAST_REVIEWED}. Annual plafoane are pinned to the
            1 January minimum wage.
          </p>
        </footer>
      </div>
    </div>
  )
}

/* ── Header ─────────────────────────────────────────────────────────────── */

function Header({ eurRon, eurUsd, eurGbp, setEurRon, setEurUsd, setEurGbp, fx, loadFx, share, copied, reset }) {
  return (
    <header className="pt-4 pb-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold ink-3 uppercase tracking-[0.2em] mb-1">
            Romania · fiscal year {FISCAL_YEAR}
          </div>
          <h1 className="text-[26px] leading-none font-black ink tracking-tight">Offer normalizer</h1>
          <p className="text-sm ink-2 mt-1.5">
            Every contract shape reduced to one number: what reaches your account.
          </p>
        </div>

        <div className="no-print flex items-center gap-1.5 text-xs flex-wrap">
          <RateInput label="€/lei" value={eurRon} onChange={setEurRon} />
          <RateInput label="€/$" value={eurUsd} onChange={setEurUsd} />
          <RateInput label="€/£" value={eurGbp} onChange={setEurGbp} />
          <button
            onClick={loadFx} disabled={fx.loading} aria-label="Refresh exchange rates"
            className="px-2 py-1.5 rounded-lg text-xs font-bold ink-2 surface border rule hover:border-indigo-400 disabled:opacity-40"
          >
            {fx.loading ? '…' : '↻'}
          </button>
          <button
            onClick={share}
            className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700"
          >
            {copied === 'manual' ? 'Link in address bar' : copied ? 'Copied ✓' : 'Share link'}
          </button>
          <button
            onClick={() => window.print()}
            className="px-2.5 py-1.5 rounded-lg text-xs font-bold ink-2 surface border rule hover:border-indigo-400"
          >
            Print / PDF
          </button>
          <button
            onClick={reset}
            className="px-2 py-1.5 rounded-lg text-xs font-bold ink-3 hover:ink-2"
          >
            Reset
          </button>
        </div>
      </div>

      <FxStatus fx={fx} />
    </header>
  )
}

/** An FX rate field. Text-backed like every other numeric input, so that a
 *  half-typed "5." is not rewritten to "5" under the cursor. */
function RateInput({ label, value, onChange }) {
  const { inputProps } = useNumericText({ value, onChange, min: 0.0001 })
  return (
    <div className="flex items-center rounded-lg border surface overflow-hidden">
      <span className="px-1.5 py-1 text-[10px] font-bold ink-3 border-r rule">{label}</span>
      <input
        {...inputProps}
        data-step={0.01}
        aria-label={`Exchange rate ${label}`}
        className="w-16 px-1.5 py-1 text-xs font-bold ink outline-none tabular-nums bg-transparent"
      />
    </div>
  )
}

function FxStatus({ fx }) {
  if (fx.loading) return <p className="mt-3 text-[11px] ink-3">Fetching exchange rates…</p>

  if (fx.manual) {
    return <p className="mt-3 text-[11px] ink-3">Using the rates you entered.</p>
  }

  if (fx.isFallback) {
    return (
      <div className="mt-3 text-[11px] rounded-lg px-3 py-2 border" style={{ background: '#FFFBEB', borderColor: '#FDE68A', color: '#92400E' }}>
        <span className="font-bold">These are fallback rates from {FX_FALLBACK.asOf}, not live ones.</span>{' '}
        Every source failed or you are offline. Check them against the{' '}
        <a href="https://www.bnr.ro/Cursuri-de-schimb--1224.aspx" target="_blank" rel="noreferrer" className="underline font-semibold">
          BNR reference rate
        </a>{' '}
        and overwrite any field.
      </div>
    )
  }

  return (
    <p className="mt-3 text-[11px] ink-3">
      Rates from {fx.src}, {fx.date}. Overwrite any field to use your own.
    </p>
  )
}

/* ── Assumptions ────────────────────────────────────────────────────────── */

function Assumptions({ g, setG }) {
  const set = (k) => (v) => setG((s) => ({ ...s, [k]: v }))

  return (
    <section className="surface rounded-xl border p-4 mb-4 print-avoid-break">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-xs font-bold ink-3 uppercase tracking-[0.14em]">Your assumptions</h2>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold ink-3 uppercase tracking-wider">PFA tax</span>
          <div className="w-44">
            <Seg
              label="PFA tax mode"
              accent="var(--ink)"
              value={g.pfaMode}
              onChange={set('pfaMode')}
              options={[{ v: 'detailed', l: `${FISCAL_YEAR} rules` }, { v: 'flat', l: 'Flat %' }]}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-3">
        <Field label="Working days / yr" value={g.workDays} onChange={set('workDays')} suffix="days" min={1} max={261} hint="RO ≈ 248" />
        <Field label="Holiday you take" value={g.vacationDays} onChange={set('vacationDays')} suffix="days" max={90} />
        <Field label="Sick days expected" value={g.sickDays} onChange={set('sickDays')} suffix="days" max={90} />
        <Field label="Business costs / mo" value={g.pfaExpensesMonthly} onChange={set('pfaExpensesMonthly')} suffix="€" step={25} hint="accountant, kit" />
        {g.pfaMode === 'flat' ? (
          <Field label="Flat tax rate" value={g.pfaFlat} onChange={set('pfaFlat')} suffix="%" step={0.5} min={0} max={60} />
        ) : (
          <div className="mb-2.5">
            <div className="text-[10px] font-semibold ink-3 uppercase tracking-[0.12em] mb-1">Value of pension</div>
            <input
              type="range" min={0} max={100} step={5} value={g.pensionWeight}
              aria-label="How much of the pension contribution to count as value"
              onChange={(e) => set('pensionWeight')(parseFloat(e.target.value))}
              className="w-full accent-indigo-600 mt-2"
            />
            <div className="text-[10px] ink-3 mt-0.5">{g.pensionWeight}% of CAS counted as value</div>
          </div>
        )}
      </div>

      {g.pfaMode === 'detailed' && (
        <p className="text-[11px] ink-3 mt-1 leading-relaxed">
          PFA sistem real: CASS 10% on net income (floor {ron(CASS_FLOOR_6)}, ceiling {ron(CASS_CAP_72)}),
          CAS 25% on a stepped base ({ron(CAS_FLOOR_12)} or {ron(CAS_FLOOR_24)}), then 10% income tax on
          what remains. Employment: CAS 25% + CASS 10% + 10% tax, uncapped — the IT exemption ended with
          OUG 156/2024. SRL micro: 1% of turnover with a mandatory employee, then 16% on dividends plus
          stepped CASS.
        </p>
      )}
    </section>
  )
}

/* ── Verdict ────────────────────────────────────────────────────────────── */

function Verdict({ offers, results, bestIdx, rankBy, setRankBy, metric, eurRon }) {
  const winner = offers[bestIdx]
  const sorted = [...results].sort((a, b) => metric(b) - metric(a))
  const gap = results.length > 1 ? metric(sorted[0]) - metric(sorted[1]) : 0
  const gapPct = results.length > 1 && metric(sorted[1]) > 0 ? (gap / metric(sorted[1])) * 100 : 0

  return (
    <section
      className="accent-panel accent-panel-border rounded-xl border p-4 mb-4 print-avoid-break"
      style={accentVars(winner.color)}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
        <div className="text-base font-black">{winner.name} leads</div>
        <div
          className="no-print flex rounded-lg p-0.5 gap-0.5"
          style={{ background: 'color-mix(in srgb, var(--surface) 75%, transparent)' }}
        >
          {[
            { v: 'take', l: 'By cash' },
            { v: 'value', l: 'By cash + pension' },
          ].map((t) => (
            <button
              key={t.v}
              onClick={() => setRankBy(t.v)}
              aria-pressed={rankBy === t.v}
              style={
                rankBy === t.v
                  ? { background: winner.color.hex, color: '#fff' }
                  : { color: 'var(--ink-2)' }
              }
              className="px-2.5 py-1 rounded-[6px] text-[10px] font-bold uppercase tracking-wider"
            >
              {t.l}
            </button>
          ))}
        </div>
      </div>

      <div className="text-sm opacity-90">
        {results.length > 1 &&
          (gapPct < 5 ? (
            <>
              Only {eur(gap)} ({pct(gapPct)}) ahead of the runner-up — that is inside the noise.
              Decide on the terms, not the money.
            </>
          ) : (
            <>
              {eur(gap)} a year clear of the runner-up ({pct(gapPct)}), or {ron((gap * eurRon) / 12)} a
              month.
            </>
          ))}
      </div>
    </section>
  )
}

/** Rendered per non-leading card; kept out of compute() because it is costly. */
function SolveHint({ offer, globals, target, metric }) {
  const solved = useMemo(
    () => solveAmount(offer, globals, target, metric),
    [offer, globals, target, metric],
  )

  if (!solved) {
    return <>No rate reaches the leader — the gap is structural, not a matter of price.</>
  }
  if (solved.direction === 'met') return null

  const unit = offer.engagement === 'cim' ? '/mo' : { hourly: '/hr', daily: '/day', monthly: '/mo' }[offer.basis]
  const rounded = Math.round(solved.amount)

  // When the answer rounds to what is already entered, printing "needs 45" next
  // to a field showing 45 reads as a bug rather than as a near-tie.
  if (rounded === Math.round(offer.amount || 0)) {
    return <>Level with the leader, to within a rounding error. Decide on the terms.</>
  }

  const amount = (
    <span className="font-bold ink tabular-nums">
      {num(rounded)} {offer.currency}
    </span>
  )

  // The step functions make this genuinely possible: asking for less can leave
  // you with more, and printing it as a "needs" figure would look like a bug.
  if (solved.direction === 'cut') {
    return <>Dropping to {amount} {unit} would actually beat the leader — a tax threshold sits in between.</>
  }
  return <>Needs {amount} {unit} to match the leader.</>
}

/* ── Insights ───────────────────────────────────────────────────────────── */

const INSIGHTS = [
  ['Pension is the hidden transfer',
    'An SRL credits pension only on the mandatory minimum-wage salary, so you keep far more now and accrue far less later. Employment pays 25% on the whole gross. Set the pension slider to 0, then to 100 — if the ranking flips, your decision is about how much you trust the state pension, not about the offers.'],
  ['A day off is not free on B2B',
    'Employment pays your holiday, your public holidays and your sick leave. A day rate pays none of them. Raise "sick days expected" from 5 to 15 and watch which offers move.'],
  ['Thresholds are cliffs, not slopes',
    'CAS jumps by 12.150 lei the moment PFA income touches 12 minimum wages. Dividend CASS jumps by 2.430 lei at 6. Earning one leu more can genuinely leave you poorer, which is why this tool warns when you are sitting just the wrong side of one.'],
  ['Micro tax is charged on revenue',
    'The 1% applies to turnover, not profit — deductible costs do not reduce it at all. They only reduce the profit you can later distribute. This is the single most misunderstood thing about the regime.'],
  ['Currency is an unnegotiated pay cut',
    'A USD or GBP contract re-prices itself every month. Move the FX field 5% against you and see the damage, then decide whether the premium over a EUR offer actually covers that risk.'],
  ['Meal tickets beat salary per leu',
    'Tickets carry 10% tax and 10% CASS but no CAS, so you keep 80% against 58,5% on ordinary gross. At 45 lei a day that is roughly 8.500 lei of nominal value a year.'],
  ['Deductible costs are the lever you own',
    'Accountant, hardware, licences, courses and coworking cut taxable income directly. On an SRL under the real regime they also cut the profit tax. That field is the only number here you can move without anyone else agreeing.'],
  ['Gross is not a comparable unit',
    'An hourly rate, a monthly invoice, a dividend and a gross salary are four different promises. The only honest comparison is the bottom row: what lands in your account.'],
]

function Insights() {
  return (
    <section className="surface rounded-xl border p-4 print-avoid-break">
      <h2 className="text-xs font-bold ink-3 uppercase tracking-[0.14em] mb-3">What the numbers hide</h2>
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
        {INSIGHTS.map(([title, body]) => (
          <div key={title}>
            <div className="text-xs font-bold ink mb-0.5">{title}</div>
            <div className="text-xs ink-2 leading-relaxed">{body}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
