import { useId } from 'react'
import { useNumericText } from './useNumericText.js'

/**
 * A labelled numeric field. All of the typing behaviour lives in
 * useNumericText — see that file for why binding a raw number is wrong.
 */
export default function Field({
  label,
  value,
  onChange,
  suffix,
  step = 1,
  min = 0,
  max,
  hint,
  accent,
  disabled,
  placeholder,
  allowEmpty = false,
  emptyValue = null,
}) {
  const id = useId()
  const { text, inputProps, isOutOfRange } = useNumericText({
    value, onChange, min, max, allowEmpty, emptyValue,
  })

  return (
    <label className="block mb-2.5" htmlFor={id}>
      <div className="flex justify-between items-baseline mb-1 gap-2">
        <span className="text-[10px] font-semibold ink-3 uppercase tracking-[0.12em]">{label}</span>
        {hint && <span className="text-[10px] ink-3 shrink-0">{hint}</span>}
      </div>
      <div
        className="flex items-stretch rounded-lg border surface overflow-hidden focus-within:border-indigo-400 transition-colors"
        style={isOutOfRange ? { borderColor: '#F59E0B' } : undefined}
      >
        <input
          {...inputProps}
          id={id}
          data-step={step}
          disabled={disabled}
          placeholder={placeholder}
          aria-label={label}
          style={{ color: accent }}
          className="flex-1 w-full min-w-0 px-2.5 py-1.5 text-sm font-semibold bg-transparent outline-none tabular-nums disabled:opacity-40"
        />
        {suffix && (
          <span className="px-2 py-1.5 text-[10px] font-semibold ink-3 border-l rule flex items-center whitespace-nowrap">
            {suffix}
          </span>
        )}
      </div>
      {isOutOfRange && (
        <span className="text-[10px] text-amber-600 mt-0.5 block">
          Clamped to {min ?? '−∞'}–{max ?? '∞'} when you leave the field.
        </span>
      )}
    </label>
  )
}
