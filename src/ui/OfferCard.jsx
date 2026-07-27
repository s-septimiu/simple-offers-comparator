import Field from './Field.jsx'
import Seg from './Seg.jsx'
import { useNumericText } from './useNumericText.js'
import MathDrilldown from './MathDrilldown.jsx'
import { eur, ron, num } from '../format.js'
import { isSrl } from '../engine/compute.js'
import { OFFER_TEMPLATE, ENGAGEMENT_DESCRIPTIONS, accentVars } from '../defaults.js'
import { TICKET_MAX, MW_JANUARY, OVERTIME_MIN_MULTIPLIER } from '../fiscal/constants.js'
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
  offer, result, engagementResult, globals, warnings,
  isBest, canDelete, patch, setEngagement, onDuplicate, onDelete, solveHint,
}) {
  const o = offer
  const srl = isSrl(o.engagement)
  const isCim = o.engagement === 'cim'
  const accent = o.color.hex

  const advancedCount = ADVANCED_FIELDS.filter((k) => o[k] !== OFFER_TEMPLATE[k]).length
  const blocking = warnings.filter((w) => w.severity === 'error')

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
      className="surface rounded-xl border p-3.5 flex flex-col print-avoid-break"
    >
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-3">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: accent }} />
        <input
          value={o.name}
          aria-label="Offer name"
          onChange={(e) => patch('name', e.target.value)}
          className="flex-1 min-w-0 text-sm font-bold ink bg-transparent outline-none rounded px-1 -ml-1"
        />
        {isBest && (
          <span
            className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{ background: accent, color: '#fff' }}
          >
            Leads
          </span>
        )}
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
            { v: 'srl-micro', l: 'SRL 1%', title: ENGAGEMENT_DESCRIPTIONS['srl-micro'] },
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
            suffix="lei/day" hint={`max ${TICKET_MAX}`} max={TICKET_MAX} accent={accent}
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
      <details className="mt-1 mb-2 group">
        <summary className="no-print cursor-pointer text-[10px] font-bold uppercase tracking-[0.12em] ink-3 hover:ink-2 flex items-center gap-1.5 py-1">
          <span className="inline-block transition-transform group-open:rotate-90">›</span>
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
      {warnings.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {warnings.map((w, i) => (
            <div
              key={i}
              className={`sev sev-${w.severity} rounded-lg px-2.5 py-1.5 text-[10px] leading-snug`}
            >
              <span className="font-bold">{w.title}.</span> <span className="opacity-90">{w.detail}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Result ─────────────────────────────────────────────────────── */}
      <div className="mt-auto pt-2">
        <div className="accent-panel rounded-lg px-3 py-2.5" style={accentVars(o.color)}>
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] mb-0.5 opacity-85">
            Take-home / month
          </div>
          <div className="text-xl font-black tabular-nums leading-none">{ron(result.monthlyRON)}</div>
          <div className="text-[11px] font-semibold tabular-nums mt-1 opacity-75">
            {eur(result.monthlyEUR)}
            {result.work.hoursWorked > 0 && <> · {eur(result.perHourEUR, 1)}/worked hour</>}
          </div>
        </div>

        {solveHint && <div className="mt-1.5 text-[11px] ink-2 leading-snug">{solveHint}</div>}

        {blocking.length === 0 && (
          <details className="mt-2">
            <summary className="no-print cursor-pointer text-[10px] font-bold uppercase tracking-[0.12em] ink-3 hover:ink-2 py-1">
              Show the math
            </summary>
            <div className="pt-2">
              <MathDrilldown
                offer={o} result={result} engagementResult={engagementResult} globals={globals}
              />
            </div>
          </details>
        )}
      </div>
    </div>
  )
}

