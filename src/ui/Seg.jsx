import { useRef } from 'react'

/**
 * Segmented control — a real ARIA radiogroup.
 *
 * The previous build rendered these as bare <button>s carrying state only in
 * their background colour, which meant a screen reader announced four
 * unlabelled buttons with no indication of which was active, and arrow keys did
 * nothing. Radio semantics plus roving focus fix both.
 *
 * `opt.unavailable` marks an option the user cannot lawfully take — it is
 * PRESENTATIONAL ONLY and deliberately not `disabled`. Disabling would break the
 * roving tabindex in exactly the case that matters, when the unavailable option
 * is the selected one: the group would be left with no tabbable element, and the
 * arrow-key handler below moves selection unconditionally. It would also hide
 * the explanation, since selecting the option is how the user reads why.
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
            // Not colour- or strikethrough-only: the state has to survive a
            // screen reader, so it goes in the accessible name too.
            aria-label={opt.unavailable ? `${opt.l} — not available` : undefined}
            onClick={() => onChange(opt.v)}
            style={on ? { background: 'var(--surface)', color: accent, boxShadow: '0 1px 2px rgba(0,0,0,.08)' } : undefined}
            // `whitespace-nowrap` and the tightened tracking are load-bearing:
            // four options inside a quarter-width card left "SRL 16%" about two
            // pixels short of fitting, so it wrapped to two lines and made that
            // one control taller than the same control on the card beside it.
            className={`flex-1 px-1 rounded-[6px] font-bold uppercase tracking-wide whitespace-nowrap transition-colors flex items-center justify-center gap-1 ${
              size === 'sm' ? 'py-1 text-[10px]' : 'py-1.5 text-[11px]'
            } ${on ? '' : 'ink-3 hover:ink-2'}`}
          >
            {/* Strikethrough only, no dimming: when this is also the SELECTED
                option the label is already carrying the offer accent, and fading
                that on a dark card leaves dark-on-dark. The chip is the emphasis. */}
            <span className={opt.unavailable ? 'line-through' : undefined}>{opt.l}</span>
            {opt.unavailable && (
              <span className="chip-na text-[8px] font-black tracking-normal rounded px-1 py-px">
                n/a
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
