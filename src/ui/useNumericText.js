import { useEffect, useState } from 'react'

/**
 * Keeps the *text* of a numeric input while it has focus, publishing parsed
 * numbers upward without ever writing a number back into the box mid-edit.
 *
 * Every numeric input in the app must use this. Binding `value={someNumber}`
 * and coercing with `parseFloat(x) || 0` looks equivalent and is not: clearing
 * the field snaps it to 0, a half-typed "0." is rewritten to "0" before you can
 * reach the decimals, and backspacing the last digit leaves a 0 sitting under
 * the cursor that you then have to select and overwrite. It is the single most
 * felt defect in a form like this.
 */
export function useNumericText({ value, onChange, min = null, max = null, allowEmpty = false, emptyValue = null }) {
  const [text, setText] = useState(() => toText(value))
  const [focused, setFocused] = useState(false)

  // Follow external changes (share link, reset, engagement switch) but never
  // fight the user while they are typing.
  useEffect(() => {
    if (!focused) setText(toText(value))
  }, [value, focused])

  const clamp = (n) => {
    let next = n
    if (min != null) next = Math.max(next, min)
    if (max != null) next = Math.min(next, max)
    return next
  }

  const parse = (raw) => {
    const trimmed = String(raw).trim()
    if (trimmed === '' || trimmed === '-') return null
    // The Romanian decimal separator is a comma; accept both.
    const parsed = parseFloat(trimmed.replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : null
  }

  return {
    text,
    isOutOfRange: (() => {
      const p = parse(text)
      return p != null && (p !== clamp(p))
    })(),
    inputProps: {
      type: 'text',
      inputMode: 'decimal',
      value: text,
      onFocus: () => setFocused(true),
      onChange: (e) => {
        setText(e.target.value)
        const parsed = parse(e.target.value)
        // Publish valid intermediate values so the comparison stays live, but
        // leave the text untouched so editing stays fluid.
        if (parsed != null) onChange(clamp(parsed))
        else if (e.target.value.trim() === '' && allowEmpty) onChange(emptyValue)
      },
      onBlur: (e) => {
        setFocused(false)
        const parsed = parse(e.target.value)
        const settled = parsed == null ? (allowEmpty ? emptyValue : (min ?? 0)) : clamp(parsed)
        onChange(settled)
        setText(toText(settled))
      },
      onKeyDown: (e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur()
          return
        }
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
        // Arrow keys still nudge, as they would on a real number input.
        e.preventDefault()
        const step = e.currentTarget.dataset.step ? parseFloat(e.currentTarget.dataset.step) : 1
        const current = parse(text) ?? 0
        const next = clamp(current + (e.key === 'ArrowUp' ? step : -step))
        setText(toText(next))
        onChange(next)
      },
    },
  }
}

function toText(v) {
  if (v == null || !Number.isFinite(v)) return ''
  return String(Math.round(v * 1e6) / 1e6)
}
