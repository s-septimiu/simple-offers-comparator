import Field from './Field.jsx'
import Seg from './Seg.jsx'
import { useNumericText } from './useNumericText.js'
import MathDrilldown from './MathDrilldown.jsx'
import WarningList from './WarningList.jsx'
import { Disclosure } from './Panel.jsx'
import { eur, ron, pct } from '../format.js'
import { isSrl, isB2B, microUnavailable } from '../engine/compute.js'
import { OFFER_TEMPLATE, ENGAGEMENT_DESCRIPTIONS, accentVars } from '../defaults.js'
import { TICKET_MAX, MW_JANUARY, OVERTIME_MIN_MULTIPLIER, MICRO_CEILING_EUR } from '../fiscal/constants.js'
import { MONTH_NAMES } from '../format.js'

const CURRENCIES = ['EUR', 'USD', 'GBP', 'RON']

/** Fields the user has moved away from the inert default, for the badge count. */
const ADVANCED_FIELDS = [
  'startMonth', 'contractMonths', 'probationMonths', 'probationPct',
  'raiseAtMonth', 'raisePct', 'thirteenthSalaryMonths',
  'onCallDaysPerMonth', 'onCallRatePerDay', 'overtimeHoursPerMonth',
  'daysPerWeek', 'dependents', 'selfHireGrossMonthly', 'payoutRatio',
]

export default function OfferCard({
  offer, result, engagementResult, globals, warnings, rank,
  isBest, canDelete, patch, setEngagement, onDuplicate, onDelete, solveHint,
}) {
  const o = offer
  const srl = isSrl(o.engagement)
  const isCim = o.engagement === 'cim'
  const accent = o.color.hex

  const advancedCount = ADVANCED_FIELDS.filter((k) => o[k] !== OFFER_TEMPLATE[k]).length

  /* The micro ceiling is an error about ELIGIBILITY, not about the arithmetic:
   * the figure shown is the 16% one and it is correct. So it alone does not
   * suppress the derivation — hiding the maths there would withhold the very
   * panel that shows what the offer really pays. */
  const blocking = warnings.filter((w) => w.severity === 'error' && w.code !== 'micro-ceiling')

  /* Whether the 1% regime is off the table at this turnover. On a B2B card
   * `result.grossRON` IS the annual turnover, so this costs nothing. Not shown
   * on employment cards: there the headline is a salary, `grossRON` comes from
   * the net→gross solve and carries the 13th, so it is not a turnover figure —
   * switching to SRL recomputes and the marker appears then. */
  const microOff = isB2B(o.engagement) && microUnavailable(result.grossRON, globals)

  // The headline amount goes through the same text-backed machinery as every
  // other numeric field — it is the most-typed input on the page.
  const amountInput = useNumericText({
    value: o.amount,
    onChange: (v) => patch('amount', v),
    min: 0,
  })

  return (
    <div
      style={isBest ? { borderColor: accent, boxShadow: `0 0 0 2px ${accent}22` } : undefined}
      // `print-avoid-break` is not decoration: an offer torn across a page
      // boundary is the one thing the print rules were written to prevent.
      className="panel p-3.5 flex flex-col print-avoid-break"
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: accent }} />
        <input
          value={o.name}
          aria-label="Offer name"
          onChange={(e) => patch('name', e.target.value)}
          className="flex-1 min-w-0 text-sm font-bold ink bg-transparent outline-none rounded px-1 -ml-1"
        />
        {/* The rank replaces the old lone "Leads" badge. A badge on one card
            says which card won; a rank on every card says by how much you are
            reading down the page, which is the question a comparison is for. */}
        <span
          className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
          style={isBest ? { background: accent, color: '#fff' } : { background: 'var(--line-soft)', color: 'var(--ink-3)' }}
        >
          {isBest ? 'Leads' : `#${rank}`}
        </span>
        <button
          onClick={onDuplicate}
          aria-label={`Duplicate ${o.name}`}
          title="Duplicate"
          className="no-print ink-3 hover:ink text-xs font-bold px-1"
        >
          ⧉
        </button>
        <button
          onClick={onDelete}
          aria-label={`Remove ${o.name}`}
          title="Remove"
          disabled={!canDelete}
          className="no-print ink-3 hover:text-rose-500 text-sm font-bold px-1 disabled:opacity-20"
        >
          ×
        </button>
      </div>

      {/* ── The answer ─────────────────────────────────────────────────────
          Directly under the card's own name, not pinned to its foot. The take-
          home used to sit below four field groups and a stack of notices, so
          the cause (a rate you just typed) and the effect (what it pays) were
          a screen apart on the one card you were editing. Card headers also
          share a baseline across a grid row for free, which is the alignment
          the old `mt-auto` was reaching for and only got when cards happened
          to be the same height. */}
      <div className="accent-panel rounded-lg px-3 py-2 mb-2.5" style={accentVars(o.color)}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] opacity-80">
            Take-home / month
          </span>
          <span className="text-[10px] font-semibold tabular-nums opacity-75">
            {pct(result.keepRatio)} kept
          </span>
        </div>
        <div className="text-xl font-black tabular-nums leading-tight mt-0.5">{ron(result.monthlyRON)}</div>
        <div className="text-[11px] font-semibold tabular-nums opacity-75">
          {eur(result.monthlyEUR)}
          {result.work.hoursWorked > 0 && <> · {eur(result.perHourEUR, 1)}/worked hour</>}
        </div>
      </div>

      {/* ── Engagement type ────────────────────────────────────────────── */}
      <div className="mb-2.5">
        <Seg
          label="Contract type"
          accent={accent}
          value={o.engagement}
          onChange={setEngagement}
          options={[
            { v: 'pfa', l: 'PFA', title: ENGAGEMENT_DESCRIPTIONS.pfa },
            { v: 'srl-real', l: 'SRL 16%', title: ENGAGEMENT_DESCRIPTIONS['srl-real'] },
            {
              v: 'srl-micro',
              l: 'SRL 1%',
              unavailable: microOff,
              title: microOff
                ? `Turnover of ${eur(result.grossEUR)} is over the ${eur(MICRO_CEILING_EUR)} ceiling, ` +
                  `so the 1% regime is not available on this offer.`
                : ENGAGEMENT_DESCRIPTIONS['srl-micro'],
            },
            { v: 'cim', l: 'Employed', title: ENGAGEMENT_DESCRIPTIONS.cim },
          ]}
        />
      </div>

      {!isCim && (
        <div className="mb-2.5">
          <Seg
            label="Billing basis"
            accent={accent}
            value={o.basis}
            onChange={(v) => patch('basis', v)}
            options={[
              { v: 'hourly', l: 'Hourly' },
              { v: 'daily', l: 'Daily' },
              { v: 'monthly', l: 'Monthly' },
            ]}
          />
        </div>
      )}

      {/* ── Headline amount ────────────────────────────────────────────── */}
      <label className="block mb-2.5">
        <span className="text-[10px] font-semibold ink-3 uppercase tracking-[0.12em] mb-1 block">
          {isCim
            ? o.isNet ? 'Monthly salary — net' : 'Monthly salary — gross'
            : { hourly: 'Rate per hour', daily: 'Rate per day', monthly: 'Monthly invoice' }[o.basis]}
        </span>
        <div className="flex items-stretch rounded-lg border surface overflow-hidden focus-within:border-indigo-400">
          <input
            {...amountInput.inputProps}
            data-step={o.basis === 'hourly' ? 0.5 : 100}
            aria-label="Amount"
            style={{ color: accent }}
            className="flex-1 w-full min-w-0 px-2.5 py-1.5 text-base font-black bg-transparent outline-none tabular-nums"
          />
          <select
            value={o.currency}
            aria-label="Currency"
            onChange={(e) => patch('currency', e.target.value)}
            className="px-1.5 text-[11px] font-bold ink-2 border-l rule outline-none cursor-pointer"
            style={{ background: 'var(--line-soft)' }}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </label>

      {isCim && (
        <div className="mb-2.5">
          <Seg
            label="Quoted as"
            accent={accent}
            value={o.isNet ? 'net' : 'gross'}
            onChange={(v) => patch('isNet', v === 'net')}
            options={[{ v: 'gross', l: 'Quoted gross' }, { v: 'net', l: 'Quoted net' }]}
          />
        </div>
      )}

      {/* ── Core fields ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-x-2">
        <Field
          label="Paid days off" value={o.ptoDays} onChange={(v) => patch('ptoDays', v)}
          suffix="days" max={60} accent={accent}
        />
        <Field
          label="Hours / week" value={o.hoursPerWeek} onChange={(v) => patch('hoursPerWeek', v)}
          suffix="h" min={1} max={80} accent={accent}
        />
        <Field
          label="Annual bonus" value={o.bonus} onChange={(v) => patch('bonus', v)}
          suffix={o.currency} step={500} accent={accent}
        />
        {isCim ? (
          <Field
            label="Meal ticket" value={o.mealTicket} onChange={(v) => patch('mealTicket', v)}
            suffix="lei/day" hint={`≤${TICKET_MAX}`} max={TICKET_MAX} accent={accent}
          />
        ) : (
          <Field
            label="Perks / month" value={o.benefitsMonthly} onChange={(v) => patch('benefitsMonthly', v)}
            suffix="€" step={10} accent={accent}
          />
        )}
      </div>

      {isCim && (
        <Field
          label="Other perks / month" value={o.benefitsMonthly}
          onChange={(v) => patch('benefitsMonthly', v)}
          suffix="€" step={10} hint="medical, gym…" accent={accent}
        />
      )}

      {/* ── Advanced ───────────────────────────────────────────────────── */}
      <details className="mt-1 mb-2">
        <summary className="disclosure no-print text-[10px] font-bold uppercase tracking-[0.12em] ink-3 hover:ink-2 py-1">
          <span className="caret">›</span>
          Timeline &amp; extras
          {advancedCount > 0 && (
            <span
              className="ml-auto text-[9px] font-black px-1.5 py-0.5 rounded-full"
              style={{ background: o.color.soft, color: accent }}
            >
              {advancedCount} set
            </span>
          )}
        </summary>

        <div className="pt-2">
          <div className="grid grid-cols-2 gap-x-2">
            <Field
              label="Starts in" value={o.startMonth} onChange={(v) => patch('startMonth', v)}
              min={1} max={12} hint={MONTH_NAMES[(o.startMonth || 1) - 1]?.slice(0, 3)} accent={accent}
            />
            <Field
              label="Contract length" value={o.contractMonths} onChange={(v) => patch('contractMonths', v)}
              suffix="mo" min={1} max={12} accent={accent}
            />
            <Field
              label="Probation" value={o.probationMonths} onChange={(v) => patch('probationMonths', v)}
              suffix="mo" min={0} max={12} accent={accent}
            />
            <Field
              label="Probation pay" value={o.probationPct} onChange={(v) => patch('probationPct', v)}
              suffix="%" min={0} max={100} accent={accent}
            />
            <Field
              label="Raise at month" value={o.raiseAtMonth} onChange={(v) => patch('raiseAtMonth', v)}
              min={0} max={12} hint="0 = none" accent={accent}
            />
            <Field
              label="Raise size" value={o.raisePct} onChange={(v) => patch('raisePct', v)}
              suffix="%" min={0} max={200} accent={accent}
            />
            <Field
              label="Days / week" value={o.daysPerWeek} onChange={(v) => patch('daysPerWeek', v)}
              suffix="d" min={1} max={7} step={0.5} accent={accent}
            />
            {isCim && (
              <Field
                label="13th salary" value={o.thirteenthSalaryMonths}
                onChange={(v) => patch('thirteenthSalaryMonths', v)}
                suffix="mo" min={0} max={3} step={0.5} accent={accent}
              />
            )}
            <Field
              label="On-call days / mo" value={o.onCallDaysPerMonth}
              onChange={(v) => patch('onCallDaysPerMonth', v)} suffix="d" min={0} max={31} accent={accent}
            />
            <Field
              label="On-call rate" value={o.onCallRatePerDay}
              onChange={(v) => patch('onCallRatePerDay', v)} suffix={o.currency} min={0} accent={accent}
            />
            <Field
              label="Overtime / mo" value={o.overtimeHoursPerMonth}
              onChange={(v) => patch('overtimeHoursPerMonth', v)} suffix="h" min={0} max={80} accent={accent}
            />
            <Field
              label="Overtime rate" value={o.overtimeMultiplier}
              onChange={(v) => patch('overtimeMultiplier', v)} suffix="×" min={1} max={3} step={0.25}
              hint={`min ${OVERTIME_MIN_MULTIPLIER}`} accent={accent}
            />
            {isCim && (
              <Field
                label="Dependents" value={o.dependents} onChange={(v) => patch('dependents', v)}
                min={0} max={10} hint="deduction" accent={accent}
              />
            )}
            {srl && (
              <>
                <Field
                  label="Your salary" value={o.selfHireGrossMonthly}
                  onChange={(v) => patch('selfHireGrossMonthly', v)}
                  suffix="lei" min={0} step={500} allowEmpty emptyValue={null}
                  placeholder={String(MW_JANUARY)}
                  hint="blank = minimum" accent={accent}
                />
                <Field
                  label="Profit paid out" value={(o.payoutRatio ?? 1) * 100}
                  onChange={(v) => patch('payoutRatio', v / 100)}
                  suffix="%" min={0} max={100} step={10} accent={accent}
                />
              </>
            )}
          </div>
        </div>
      </details>

      {/* ── Warnings ───────────────────────────────────────────────────── */}
      <WarningList warnings={warnings} />

      {/* ── What it would take to win ──────────────────────────────────────
          Sits in the slack at the foot of the card rather than up beside the
          take-home figure, where it read better but pushed every input below it
          down by a line — on the leading card there is no hint, so its fields
          then sat a line higher than the same fields on every other card and
          the row lost the alignment a comparison depends on. */}
      {solveHint && <div className="mt-auto pt-2 text-[11px] ink-2 leading-snug">{solveHint}</div>}

      {/* ── Derivation ─────────────────────────────────────────────────────
          `mt-auto` keeps this pinned to the foot of the card, so the disclosure
          triangles line up across a grid row however tall each card grew. */}
      {blocking.length === 0 && (
        <details className={`${solveHint ? 'mt-2' : 'mt-auto'} pt-1 border-t rule-soft`}>
          <Disclosure>Show the math</Disclosure>
          <div className="pt-2">
            <MathDrilldown
              offer={o} result={result} engagementResult={engagementResult} globals={globals}
            />
          </div>
        </details>
      )}
    </div>
  )
}

