import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { motion } from 'motion/react'
import { cx, easings, useMotionPref } from '../../../ui'
import { axisNeedsDecimals, indexTicks, timeAxis } from '../logic/chartScale'
import { formatAxisTime, formatResult, formatSolve, formatTime, formatWhen } from '../logic/format'
import { isDnf, type Solve } from '../logic/solves'

export interface TimeChartPoint {
  solve: Solve
  /** 1-based solve number in the whole history. */
  number: number
  /** Result in ms (Infinity for DNF). */
  result: number
  /** Rolling average of 5 ending at this solve; null before the fifth solve. */
  ao5: number | null
  isBest: boolean
}

export interface TimeChartProps {
  points: readonly TimeChartPoint[]
  className?: string
}

const M = { top: 26, right: 18, bottom: 28, left: 50 }

/** Split a series into runs of consecutive drawable values, as SVG path data. */
function linePath(values: readonly (number | null)[], x: (i: number) => number, y: (v: number) => number): string {
  let d = ''
  let pen = false
  values.forEach((value, i) => {
    if (value === null || isDnf(value)) {
      pen = false
      return
    }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(value).toFixed(1)}`
    pen = true
  })
  return d
}

/**
 * Solve times in order, with the rolling average of 5 drawn over them. Lower is faster, so a
 * line heading down means improvement. Hover, tap or use the arrow keys to read any solve.
 */
export function TimeChart({ points, className }: TimeChartProps) {
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const [active, setActive] = useState<number | null>(null)
  const { reduced } = useMotionPref()
  const clipId = useId()

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const measure = () => setWidth(Math.max(260, Math.round(el.clientWidth)))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const n = points.length
  const height = width < 480 ? 220 : 260
  const plotW = width - M.left - M.right
  const plotH = height - M.top - M.bottom

  const model = useMemo(() => {
    const finite: number[] = []
    for (const p of points) {
      if (!isDnf(p.result)) finite.push(p.result)
      if (p.ao5 !== null && !isDnf(p.ao5)) finite.push(p.ao5)
    }
    const axis = finite.length > 0 ? timeAxis(Math.min(...finite), Math.max(...finite)) : timeAxis(0, 60_000)
    return { axis, hasTimes: finite.length > 0 }
  }, [points])

  const { axis } = model
  const x = (i: number) => (n <= 1 ? M.left + plotW / 2 : M.left + (i / (n - 1)) * plotW)
  const y = (value: number) => M.top + (1 - (value - axis.min) / (axis.max - axis.min)) * plotH
  const yLabel = (ms: number) => (axisNeedsDecimals(axis) ? formatTime(ms) : formatAxisTime(ms))

  const singles = points.map((p) => p.result)
  const averages = points.map((p) => p.ao5)
  const singlesPath = linePath(singles, x, y)
  const ao5Path = linePath(averages, x, y)
  const hasAo5 = ao5Path.length > 0
  const showDots = n <= 60
  const bestIndex = points.findIndex((p) => p.isBest)
  const xTicks = n > 0 ? indexTicks(points[0].number, points[n - 1].number, width < 480 ? 4 : 7) : []

  const safeActive = active !== null && active < n ? active : null
  const current = safeActive !== null ? points[safeActive] : null

  const pick = (event: PointerEvent<SVGRectElement>) => {
    if (n === 0) return
    const box = event.currentTarget.getBoundingClientRect()
    const px = ((event.clientX - box.left) / box.width) * plotW
    const index = n <= 1 ? 0 : Math.round((px / plotW) * (n - 1))
    setActive(Math.min(n - 1, Math.max(0, index)))
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (n === 0) return
    const from = safeActive ?? n - 1
    let next: number | null = null
    if (event.key === 'ArrowLeft') next = safeActive === null ? n - 1 : Math.max(0, from - 1)
    else if (event.key === 'ArrowRight') next = safeActive === null ? n - 1 : Math.min(n - 1, from + 1)
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = n - 1
    else if (event.key === 'Escape') {
      setActive(null)
      return
    }
    if (next === null) return
    event.preventDefault()
    setActive(next)
  }

  const best = bestIndex >= 0 ? points[bestIndex] : null
  const summary =
    n === 0
      ? 'Chart of your solve times. No solves yet.'
      : `Chart of ${n} solve ${n === 1 ? 'time' : 'times'}. ${best ? `Best ${formatResult(best.result)}. ` : ''}Latest ${formatResult(points[n - 1].result)}. Use the left and right arrow keys to read each solve.`

  // Tooltip position (in px of the wrapper), kept inside the chart.
  const tipX = safeActive !== null ? Math.min(width - 92, Math.max(92, x(safeActive))) : 0
  const tipAnchorY = current ? (isDnf(current.result) ? M.top : y(current.result)) : 0
  const tipBelow = tipAnchorY < 96

  const draw = reduced ? { initial: false as const } : { initial: { pathLength: 0, opacity: 0 }, animate: { pathLength: 1, opacity: 1 } }

  return (
    <div
      ref={wrap}
      className={cx('relative w-full rounded-md outline-offset-4', className)}
      tabIndex={0}
      role="group"
      aria-label={summary}
      onKeyDown={onKeyDown}
      onBlur={() => setActive(null)}
      data-testid="time-chart"
    >
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block touch-pan-y select-none" aria-hidden="true">
        <defs>
          <clipPath id={clipId}>
            <rect x={M.left - 8} y={M.top - 12} width={plotW + 16} height={plotH + 24} />
          </clipPath>
        </defs>

        {/* Grid and y labels */}
        {axis.ticks.map((tick) => (
          <g key={tick}>
            <line x1={M.left} x2={width - M.right} y1={y(tick)} y2={y(tick)} stroke="var(--line)" strokeWidth={1} strokeDasharray={tick === axis.min ? undefined : '2 5'} />
            <text x={M.left - 10} y={y(tick)} dy="0.35em" textAnchor="end" className="num fill-ink-faint text-[11px] font-semibold">
              {yLabel(tick)}
            </text>
          </g>
        ))}

        {/* x labels: solve numbers */}
        {xTicks.map((tick) => (
          <text key={tick} x={x(tick - points[0].number)} y={height - 8} textAnchor="middle" className="num fill-ink-faint text-[11px] font-semibold">
            {n === 1 ? `Solve ${tick}` : tick}
          </text>
        ))}

        <g clipPath={`url(#${clipId})`}>
          {/* Every solve: a thin quiet line with dots */}
          {singlesPath && (
            <motion.path
              d={singlesPath}
              fill="none"
              stroke="var(--ink-faint)"
              strokeOpacity={0.55}
              strokeWidth={1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              {...draw}
              transition={{ duration: 0.55, ease: easings.out }}
            />
          )}
          {showDots &&
            points.map((p, i) =>
              isDnf(p.result) ? (
                <g key={p.solve.id} transform={`translate(${x(i)} ${M.top})`} stroke="var(--ink-faint)" strokeWidth={1.75} strokeLinecap="round">
                  <path d="M-3.5 -3.5 3.5 3.5M3.5 -3.5 -3.5 3.5" />
                </g>
              ) : p.isBest ? null : (
                <motion.circle
                  key={p.solve.id}
                  cx={x(i)}
                  cy={y(p.result)}
                  r={4}
                  fill="var(--ink-muted)"
                  stroke="var(--surface)"
                  strokeWidth={2}
                  initial={reduced ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2, delay: reduced ? 0 : Math.min(0.5, 0.1 + (i / Math.max(1, n)) * 0.45) }}
                />
              ),
            )}

          {/* Rolling average of 5: the line that matters */}
          {hasAo5 && (
            <motion.path
              d={ao5Path}
              fill="none"
              stroke="var(--accent)"
              strokeWidth={2.75}
              strokeLinejoin="round"
              strokeLinecap="round"
              {...draw}
              transition={{ duration: 0.6, ease: easings.out, delay: reduced ? 0 : 0.12 }}
            />
          )}
        </g>

        {/* Personal best */}
        {best && (
          <>
            <motion.g
              initial={reduced ? false : { opacity: 0, scale: 0.4 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 17, mass: 0.8, delay: reduced ? 0 : 0.5 }}
            >
              <circle cx={x(bestIndex)} cy={y(best.result)} r={7} fill="var(--cube-yellow)" stroke="var(--surface)" strokeWidth={2} />
              <circle cx={x(bestIndex)} cy={y(best.result)} r={7} fill="none" stroke="var(--cube-yellow-edge)" strokeWidth={1.25} />
            </motion.g>
            <motion.text
              x={Math.min(width - M.right - 4, Math.max(M.left + 4, x(bestIndex)))}
              y={y(best.result) + (y(best.result) > height - M.bottom - 26 ? -14 : 22)}
              textAnchor={x(bestIndex) > width - 80 ? 'end' : x(bestIndex) < M.left + 44 ? 'start' : 'middle'}
              className="num fill-ink text-[12px] font-bold"
              stroke="var(--surface)"
              strokeWidth={4}
              paintOrder="stroke"
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2, delay: reduced ? 0 : 0.55 }}
            >
              Best {formatResult(best.result)}
            </motion.text>
          </>
        )}

        {/* Crosshair and focused point */}
        {current && safeActive !== null && (
          <g pointerEvents="none">
            <line x1={x(safeActive)} x2={x(safeActive)} y1={M.top - 8} y2={height - M.bottom} stroke="var(--line-strong)" strokeWidth={1.25} />
            {current.ao5 !== null && !isDnf(current.ao5) && <circle cx={x(safeActive)} cy={y(current.ao5)} r={5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />}
            {!isDnf(current.result) && <circle cx={x(safeActive)} cy={y(current.result)} r={6} fill={current.isBest ? 'var(--cube-yellow)' : 'var(--ink)'} stroke="var(--surface)" strokeWidth={2} />}
          </g>
        )}

        {/* Hit area: the whole plot, so no one has to aim at a dot */}
        {n > 0 && (
          <rect
            x={M.left}
            y={0}
            width={plotW}
            height={height}
            fill="transparent"
            onPointerMove={pick}
            onPointerDown={pick}
            onPointerLeave={(event) => {
              if (event.pointerType === 'mouse') setActive(null)
            }}
            style={{ marginLeft: -12, cursor: 'crosshair' }}
          />
        )}
      </svg>

      {current && (
        <div
          role="status"
          className={cx('pointer-events-none absolute z-10 w-44 -translate-x-1/2 rounded-md border border-line bg-surface px-3 py-2.5 shadow-2')}
          style={{ left: tipX, top: tipBelow ? tipAnchorY + 16 : undefined, bottom: tipBelow ? undefined : height - tipAnchorY + 14 }}
        >
          <p className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-bold text-ink-muted">Solve {current.number}</span>
            {current.isBest && <span className="text-2xs font-bold text-cube-yellow-text">Best</span>}
          </p>
          <p className="num font-display text-xl leading-7 font-extrabold text-ink">{formatSolve(current.solve)}</p>
          {current.ao5 !== null && (
            <p className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
              <span aria-hidden="true" className="h-[3px] w-3.5 rounded-full bg-accent" />
              Average of 5 <span className="num ml-auto font-bold text-ink">{formatResult(current.ao5)}</span>
            </p>
          )}
          <p className="mt-0.5 text-2xs font-semibold text-ink-faint">{formatWhen(current.solve.at)}</p>
        </div>
      )}

      {n === 0 && (
        <p className="pointer-events-none absolute inset-0 grid place-items-center px-16 text-center text-sm font-semibold text-ink-faint">
          Your times will draw a line here.
        </p>
      )}
    </div>
  )
}

/** Legend for the chart: marks carry the colour, the words stay in ink. */
export function TimeChartLegend({ showAverage, className }: { showAverage: boolean; className?: string }) {
  return (
    <ul className={cx('flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-ink-muted', className)}>
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="size-2 rounded-full bg-ink-muted" />
        Each solve
      </li>
      {showAverage && (
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-[3px] w-4 rounded-full bg-accent" />
          Average of 5
        </li>
      )}
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="size-2.5 rounded-full bg-cube-yellow ring-1 ring-cube-yellow-edge" />
        Best
      </li>
    </ul>
  )
}
