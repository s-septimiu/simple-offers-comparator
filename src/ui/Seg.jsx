import { useRef } from 'react'

/**
 * Segmented control — a real ARIA radiogroup.
 *
 * The previous build rendered these as bare <button>s carrying state only in
 * their background colour, which meant a screen reader announced four
 * unlabelled buttons with no indication of which was active, and arrow keys did
 * nothing. Radio semantics plus roving focus fix both.
 */
export default function Seg({ options, value, onChange, accent, label, size = 'sm' }) {
  const refs = useRef([])

  const onKeyDown = (e) => {
    const i = options.findIndex((o) => o.v === value)
    let next = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % options.length
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + options.length) % options.length
    if (e.key === 'Home') next = 0
    if (e.key === 'End') next = options.length - 1
    if (next == null) return
    e.preventDefault()
    onChange(options[next].v)
    refs.current[next]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="flex rounded-lg p-0.5 gap-0.5"
      style={{ background: 'var(--line-soft)' }}
    >
      {options.map((opt, i) => {
        const on = opt.v === value
        return (
          <button
            key={opt.v}
            ref={(el) => (refs.current[i] = el)}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            title={opt.title}
            onClick={() => onChange(opt.v)}
            style={on ? { background: 'var(--surface)', color: accent, boxShadow: '0 1px 2px rgba(0,0,0,.08)' } : undefined}
            className={`flex-1 px-1.5 rounded-[6px] font-bold uppercase tracking-wider transition-colors ${
              size === 'sm' ? 'py-1 text-[10px]' : 'py-1.5 text-[11px]'
            } ${on ? '' : 'ink-3 hover:ink-2'}`}
          >
            {opt.l}
          </button>
        )
      })}
    </div>
  )
}
