/**
 * Per-card notices, triaged by severity.
 *
 * These used to render as a flat stack, which on the seeded four-offer page put
 * three full-width tinted blocks on most cards — more vertical space than the
 * take-home figure they surround, and largely the same sentences repeated card
 * to card. The wall of yellow trained people to skip the whole region, which
 * costs exactly the warnings that were worth reading.
 *
 * So the triage follows the severity contract in engine/warnings.js literally
 * rather than compressing all three the same way:
 *
 *   'error' — blocks belief in the number. Always open.
 *   'warn'  — changes a decision. Always open. The CASS-cliff notice lives here
 *             and is arguably the highest-value line the tool produces; burying
 *             it behind a click to save 40px would be a bad trade.
 *   'info'  — worth knowing, harmless, and the repetitive ones ("past the VAT
 *             threshold", "an employee is mandatory", "ranked on the settled
 *             rate"). Collapsed behind a count, still one keystroke away and
 *             still fully expanded in print.
 */
export default function WarningList({ warnings }) {
  if (!warnings.length) return null

  const loud = warnings.filter((w) => w.severity !== 'info')
  const notes = warnings.filter((w) => w.severity === 'info')

  return (
    <div className="space-y-1 mb-2">
      {loud.map((w, i) => (
        <div key={i} className={`sev sev-${w.severity} rounded-md px-2 py-1.5 text-[10px] leading-snug`}>
          <span className="font-bold">{w.title}.</span> <span className="opacity-90">{w.detail}</span>
        </div>
      ))}

      {notes.length > 0 && (
        <details>
          <summary className="disclosure no-print text-[10px] ink-3 hover:ink-2 py-0.5">
            <span className="caret">›</span>
            {notes.length} note{notes.length === 1 ? '' : 's'}
          </summary>
          <div className="space-y-1 pt-1">
            {notes.map((w, i) => (
              <div key={i} className="sev sev-info rounded-md px-2 py-1.5 text-[10px] leading-snug">
                <span className="font-bold">{w.title}.</span> <span className="opacity-90">{w.detail}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
