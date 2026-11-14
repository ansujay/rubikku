import { Kbd } from '../ui'
import { KEYBOARD_HELP } from './turns'

/** The list of cube keys, for a help popover or dialog. */
export function KeyboardHelp({ className }: { className?: string }) {
  return (
    <dl className={className}>
      {KEYBOARD_HELP.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-4 border-b border-line py-2 last:border-b-0">
          <dt className="text-sm text-ink-muted">{row.label}</dt>
          <dd className="flex shrink-0 flex-wrap items-center justify-end gap-1">
            {row.keys.map((key) =>
              key.startsWith('+') ? (
                <span key={key} className="text-xs font-semibold text-ink-faint">
                  {key}
                </span>
              ) : (
                <Kbd key={key}>{key}</Kbd>
              ),
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}
