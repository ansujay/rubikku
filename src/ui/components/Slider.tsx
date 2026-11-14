import { useId, type CSSProperties, type InputHTMLAttributes } from 'react'
import { cx } from '../cx'
import { TONE_CLASSES, type Tone } from '../colors'

export interface SliderProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'min' | 'max' | 'step'> {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  /** Visible label (also the accessible name). Use `aria-label` instead for a bare slider. */
  label?: string
  /** Text for the current value, shown on the right and read by screen readers. */
  formatValue?: (value: number) => string
  /** Captions under the two ends, e.g. ['Slow', 'Fast']. */
  ends?: [string, string]
  tone?: Tone
}

/** <Slider label="Turn speed" min={0.5} max={2} step={0.25} value={v} onChange={setV} formatValue={(v) => `${v}×`} /> */
export function Slider({ value, onChange, min = 0, max = 100, step = 1, label, formatValue, ends, tone = 'accent', className, id, ...rest }: SliderProps) {
  const auto = useId()
  const inputId = id ?? auto
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0
  const text = formatValue?.(value)
  return (
    <div className={cx('w-full', className)}>
      {(label || text) && (
        <div className="flex items-baseline justify-between gap-3 text-sm">
          {label && (
            <label htmlFor={inputId} className="font-semibold text-ink">
              {label}
            </label>
          )}
          {text && <span className="num ml-auto font-bold text-ink">{text}</span>}
        </div>
      )}
      <input
        id={inputId}
        type="range"
        className="slider block"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={text}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ '--_pct': `${Math.min(100, Math.max(0, pct))}%`, '--_fill': TONE_CLASSES[tone].cssVar } as CSSProperties}
        {...rest}
      />
      {ends && (
        <div className="-mt-1 flex justify-between text-xs font-semibold text-ink-faint">
          <span>{ends[0]}</span>
          <span>{ends[1]}</span>
        </div>
      )}
    </div>
  )
}
