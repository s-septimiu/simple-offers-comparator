import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import Field from './Field.jsx'
import Seg from './Seg.jsx'
import { useNumericText } from './useNumericText.js'
import OfferCard from './OfferCard.jsx'
import Waterfall from './Waterfall.jsx'
import ComparisonTable from './ComparisonTable.jsx'
import Panel, { Disclosure } from './Panel.jsx'
import { compute, computeEngagement } from '../engine/compute.js'
import { solveAmount } from '../engine/solve.js'
import { warningsFor } from '../engine/warnings.js'
import { fetchRates, fallbackRates } from '../engine/fx.js'
import { encodeState, decodeState } from '../engine/share.js'
import {
  defaultOffers, defaultGlobals, nextColor, OFFER_TEMPLATE, accentVars, defaultPtoDays,
  ENGAGEMENT_LABELS,
} from '../defaults.js'
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

  /* Offer indices, best first. The header badge, the summary band and the
   * runner-up gap all used to derive their own ordering — three sorts of the
   * same array that agreed only as long as nobody touched one of them. This is
   * the single ordering the whole page reads from.
   *
   * Array.prototype.sort is stable, so ties keep the order the offers were
   * entered in, which is what the previous strict-`>` scan did. */
  const order = useMemo(
    () => results.map((_, i) => i).sort((a, b) => metric(results[b]) - metric(results[a])),
    [results, metric],
  )

  const bestIdx = order.length ? order[0] : -1

  /** rank[i] is the 1-based position of offer i, for the badge on its card. */
  const rank = useMemo(() => {
    const out = []
    order.forEach((offerIdx, position) => (out[offerIdx] = position + 1))
    return out
  }, [order])

  const scale = useMemo(() => Math.max(...results.map((r) => r.barTotalRON), 1), [results])

  /* ── Mutations ────────────────────────────────────────────────────────── */

  const patch = (id, k, v) => setOffers((os) => os.map((o) => (o.id === id ? { ...o, [k]: v } : o)))

  // Switching contract type brings that type's standard paid leave with it —
  // but only while the field still holds the default for the type being left.
  // Once someone has typed their own number, it survives the switch.
  const setEngagement = (id, engagement) =>
    setOffers((os) =>
      os.map((o) =>
        o.id === id
          ? {
              ...o,
              engagement,
              ptoDays: o.ptoDays === defaultPtoDays(o.engagement) ? defaultPtoDays(engagement) : o.ptoDays,
            }
          : o,
      ),
    )

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
      <div className="max-w-6xl mx-auto space-y-4">
        <Header
          eurRon={eurRon} eurUsd={eurUsd} eurGbp={eurGbp}
          setEurRon={setRate(setEurRon)} setEurUsd={setRate(setEurUsd)} setEurGbp={setRate(setEurGbp)}
          fx={fx} loadFx={loadFx} share={share} copied={copied} reset={reset}
        />

        {/* ── The finding, first ───────────────────────────────────────────
            Deliberately above the offers rather than below the table, where it
            used to sit. The verdict is the one thing every visitor came for,
            and it was the last thing on the page — you had to scroll past four
            editing forms, a chart and a fourteen-row table to learn which offer
            won. Worse, the rank-by toggle lives here and changes the badge on
            every card above it, so the control was below everything it
            governed. Please do not "restore the reading order" by moving this
            back under the table. */}
        {best && (
          <Summary
            offers={offers} results={results} order={order}
            rankBy={rankBy} setRankBy={setRankBy} metric={metric}
          />
        )}

        {/* ── Offer cards ─────────────────────────────────────────────── */}
        <section>
          <div className="flex items-baseline justify-between gap-2 mb-2 px-0.5">
            <h2 className="text-[10px] font-bold ink-3 uppercase tracking-[0.14em]">
              Offers compared ({offers.length})
            </h2>
            {/* Was a full dashed card in the grid, which reserved a whole empty
                cell — about 400px of nothing on the seeded page, and an empty
                box in every PDF. */}
            <button
              onClick={addOffer}
              className="no-print text-[10px] font-bold uppercase tracking-[0.12em] ink-2 hover:ink px-2 py-1 rounded-lg border rule surface hover:border-indigo-400 transition-colors"
            >
              + Add offer
            </button>
          </div>

          {/* Four across on a wide screen, not three. Side-by-side is the whole
              point of a comparison, and the seeded page carries four offers —
              at three columns the fourth orphaned onto a row of its own beside
              a card-and-a-half of dead space. Print overrides this to two. */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 print-grid-2">
            {offers.map((o, i) => (
              <OfferCard
                key={o.id}
                offer={o}
                result={results[i]}
                engagementResult={engagementResults[i]}
                globals={globals}
                warnings={warnings[i]}
                rank={rank[i]}
                isBest={i === bestIdx}
                canDelete={offers.length > 1}
                patch={(k, v) => patch(o.id, k, v)}
                setEngagement={(v) => setEngagement(o.id, v)}
                onDuplicate={() => dupOffer(o)}
                onDelete={() => delOffer(o.id)}
                solveHint={
                  i === bestIdx || !best ? null : <SolveHint offer={o} globals={globals} target={metric(best)} metric={metric} />
                }
              />
            ))}
          </div>
        </section>

        <Assumptions g={g} setG={setG} />

        {/* ── Analysis ─────────────────────────────────────────────────────
            The table and the waterfall are two readings of one dataset, so they
            are one panel rather than two stacked boxes. The table is the
            reconciling one and stays open; the chart restates the same split as
            proportions and is a click away. Print force-opens it. */}
        <Panel
          title="Line by line"
          aside={<span className="text-[10px] ink-3">annual figures, settled rate</span>}
          bodyClass=""
        >
          <ComparisonTable
            offers={offers} results={results} engagementResults={engagementResults}
            bestIdx={bestIdx} pensionWeight={g.pensionWeight} metric={metric}
          />

          <details className="border-t rule px-4 py-2">
            <Disclosure>Where the gross goes</Disclosure>
            <div className="pt-3">
              {/* The print block hides every <summary>, so on paper this section
                  would arrive with no title at all — unlabelled bars directly
                  under the comparison table, reading as more of the table. It
                  had a persistent <h2> before it became a disclosure; this is
                  that heading, for the one medium that cannot open it. */}
              <h3 className="print-only text-[10px] font-bold ink-3 uppercase tracking-[0.14em] mb-2">
                Where the gross goes
              </h3>
              <Waterfall offers={offers} results={results} scale={scale} eurRon={eurRon} />
            </div>
          </details>
        </Panel>

        <Insights />

        <footer className="text-center text-[11px] ink-3 leading-relaxed pt-2">
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
    <header className="pt-2 pb-1">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold ink-3 uppercase tracking-[0.2em] mb-1">
            Romania · fiscal year {FISCAL_YEAR}
          </div>
          <h1 className="text-[22px] leading-none font-black ink tracking-tight">Offer normalizer</h1>
          <p className="text-xs ink-2 mt-1">
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
  if (fx.loading) return <p className="mt-2 text-[10px] ink-3">Fetching exchange rates…</p>

  if (fx.manual) {
    return <p className="mt-2 text-[10px] ink-3">Using the rates you entered.</p>
  }

  if (fx.isFallback) {
    return (
      <div className="mt-2 text-[11px] rounded-lg px-3 py-2 border" style={{ background: '#FFFBEB', borderColor: '#FDE68A', color: '#92400E' }}>
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
    <p className="mt-2 text-[10px] ink-3">
      Rates from {fx.src}, {fx.date}. Overwrite any field to use your own.
    </p>
  )
}

/* ── Assumptions ────────────────────────────────────────────────────────── */

function Assumptions({ g, setG }) {
  const set = (k) => (v) => setG((s) => ({ ...s, [k]: v }))

  const pfaMode = (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-semibold ink-3 uppercase tracking-wider">PFA tax</span>
      <div className="w-40">
        <Seg
          label="PFA tax mode"
          accent="var(--ink)"
          value={g.pfaMode}
          onChange={set('pfaMode')}
          options={[{ v: 'detailed', l: `${FISCAL_YEAR} rules` }, { v: 'flat', l: 'Flat %' }]}
        />
      </div>
    </div>
  )

  return (
    <Panel title="Applies to every offer" aside={pfaMode} bodyClass="px-4 pt-3 pb-0">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-3">
        <Field label="Working days / yr" value={g.workDays} onChange={set('workDays')} suffix="days" min={1} max={261} hint="RO ≈ 248" />
        <Field label="Holiday you take" value={g.vacationDays} onChange={set('vacationDays')} suffix="days" max={90} />
        <Field label="Sick days expected" value={g.sickDays} onChange={set('sickDays')} suffix="days" max={90} />
        {/* "Business costs / mo" wrapped to two lines in a fifth of the panel
            width and dragged its input below the rest of the row. */}
        <Field label="Costs / month" value={g.pfaExpensesMonthly} onChange={set('pfaExpensesMonthly')} suffix="€" step={25} hint="accountant, kit" />
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

      {/* Four regimes' worth of rates, previously printed in full under the
          fields on every load. It is reference material — true, worth having,
          and not something anyone reads twice. */}
      {g.pfaMode === 'detailed' && (
        <details className="-mx-4 px-4 border-t rule-soft">
          <Disclosure>How each regime is taxed</Disclosure>
          <p className="text-[11px] ink-2 leading-relaxed pb-3 pt-1">
            PFA sistem real: CASS 10% on net income (floor {ron(CASS_FLOOR_6)}, ceiling {ron(CASS_CAP_72)}),
            CAS 25% on a stepped base ({ron(CAS_FLOOR_12)} or {ron(CAS_FLOOR_24)}), then 10% income tax on
            what remains. Employment: CAS 25% + CASS 10% + 10% tax, uncapped — the IT exemption ended with
            OUG 156/2024. SRL micro: 1% of turnover with a mandatory employee, then 16% on dividends plus
            stepped CASS.
          </p>
        </details>
      )}
    </Panel>
  )
}

/* ── Summary band ───────────────────────────────────────────────────────── */

/** One statistic: label above, figure below. Sub-text stays inside the accent
 *  colour at reduced opacity — `ink-3` would be grey on a tinted panel, which
 *  fails contrast in light mode and disappears in dark. */
function Stat({ label, value, sub }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] font-bold uppercase tracking-[0.14em] opacity-70">{label}</div>
      <div className="text-lg font-black tabular-nums leading-tight truncate">{value}</div>
      {sub && <div className="text-[10px] font-semibold opacity-75 truncate">{sub}</div>}
    </div>
  )
}

/**
 * The finding, as four statistics and a sentence.
 *
 * `spread` is the one figure here that is not on any card: how much the whole
 * decision is worth. When it is small the honest answer is that the offers are
 * interchangeable on money, and saying so is more useful than a ranking that
 * implies a winner worth chasing.
 */
function Summary({ offers, results, order, rankBy, setRankBy, metric }) {
  const winner = offers[order[0]]
  const many = order.length > 1

  const top = metric(results[order[0]])
  const gap = many ? top - metric(results[order[1]]) : 0
  const runnerUpMetric = many ? metric(results[order[1]]) : 0
  const gapPct = many && runnerUpMetric > 0 ? (gap / runnerUpMetric) * 100 : 0
  const spread = many ? top - metric(results[order[order.length - 1]]) : 0

  const label = rankBy === 'take' ? 'Take-home / year' : 'Cash + pension / year'

  return (
    <section className="accent-panel accent-panel-border panel print-avoid-break" style={accentVars(winner.color)}>
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="text-[9px] font-bold uppercase tracking-[0.14em] opacity-70 pt-0.5">
            The finding
          </div>
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

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-3 mt-2">
          <Stat
            label="Leading offer"
            value={winner.name}
            sub={ENGAGEMENT_LABELS[winner.engagement]}
          />
          <Stat label={label} value={eur(top)} sub="net of tax and contributions" />
          {many && (
            <Stat
              label="Ahead by"
              value={eur(gap)}
              sub={`${pct(gapPct)} over ${offers[order[1]].name}`}
            />
          )}
          {many && (
            <Stat
              label="Spread"
              value={eur(spread)}
              sub={`best to worst of ${order.length}`}
            />
          )}
        </div>

        {many && (
          <p className="text-xs opacity-90 mt-3 pt-2.5 border-t" style={{ borderColor: 'color-mix(in srgb, currentColor 20%, transparent)' }}>
            {gapPct < 5
              ? 'That gap is inside the noise. These offers pay the same — decide on the terms, not the money.'
              : `Worth ${eur(gap / 12)} a month over the runner-up. Open the derivation on any card to see where the difference is made.`}
          </p>
        )}
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

/**
 * Eight essays, collapsed.
 *
 * This is the page's largest single block of prose and none of it is about the
 * offers on screen — it is the standing argument for why the tool models what
 * it models. Open it once, never again. Left expanded it was roughly a screen
 * of body copy under the answer, which is precisely the "too much to digest"
 * problem. Print expands it, so the PDF is unchanged.
 */
function Insights() {
  return (
    <section className="panel print-avoid-break">
      <details>
        <summary className="disclosure no-print panel-head px-4 py-2 text-[10px] font-bold uppercase tracking-[0.14em] ink-3 hover:ink-2">
          <span className="caret">›</span>
          What the numbers hide
          <span className="ml-auto text-[10px] font-semibold normal-case tracking-normal ink-3">
            {INSIGHTS.length} things worth knowing
          </span>
        </summary>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3 p-4">
          {/* Same reason as the waterfall heading: the summary is hidden in
              print, and eight untitled essays after the comparison table give
              the reader no idea what they are looking at. */}
          <h3 className="print-only sm:col-span-2 text-[10px] font-bold ink-3 uppercase tracking-[0.14em]">
            What the numbers hide
          </h3>
          {INSIGHTS.map(([title, body]) => (
            <div key={title}>
              <div className="text-xs font-bold ink mb-0.5">{title}</div>
              <div className="text-xs ink-2 leading-relaxed">{body}</div>
            </div>
          ))}
        </div>
      </details>
    </section>
  )
}
