/**
 * "Make your own": paint a 3x3 face, and the moves that put it on a solved cube appear by
 * themselves. The search runs in a Web Worker (`searchFace`), debounced and latest-wins, so
 * painting never waits. Every face can be made: there is no "impossible".
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { FLAGS, flagStart, isFaceSearchCancelled, peekFace, searchFace, type Color, type FaceGrid, type FaceSolution } from '../../cube'
import { Button, ButtonLink, Card, CUBE_COLOR_NAME, CubeSwatch, cx, FaceGrid as FaceGridView, FlagArt, Icon, Modal, MoveSequence, Spinner, sound, springs, Sticker, Toggle } from '../../ui'
import { BLANK_FACE, designLink, designResultLine, faceCode, flagLookingLike, holdColors, isPlainFace, parseFaceCode } from './logic'
import { usePatterns } from './patternsStore'

/** The palette, in the order a kid reads a cube: the two neutrals, then the four bright ones. */
const PALETTE: readonly Color[] = ['white', 'yellow', 'red', 'orange', 'blue', 'green']
/** Wait this long after the last tap before searching (face turns take ~0.1 s on their own). */
const DEBOUNCE_MS = 220

interface Found {
  key: string
  solution: FaceSolution | null
  failed?: boolean
}

/** The colours to hold it by, as two stickers and words. */
function HoldWords({ solution }: { solution: FaceSolution }) {
  const { top, front } = holdColors(flagStart(solution.hold))
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
      Hold it with
      <span className="inline-flex items-center gap-1 font-semibold text-ink">
        <CubeSwatch color={top} size="sm" showLetter /> {top} on top
      </span>
      and
      <span className="inline-flex items-center gap-1 font-semibold text-ink">
        <CubeSwatch color={front} size="sm" showLetter /> {front} facing you
      </span>
    </span>
  )
}

function PresetPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (grid: FaceGrid) => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Start from a flag" description="Pick one, then change any sticker you like." size="lg">
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3" data-testid="design-presets">
        {FLAGS.map((flag) => (
          <li key={flag.id} className="min-w-0">
            <button
              type="button"
              onClick={() => onPick(flag.grid)}
              data-testid={`design-preset-${flag.id}`}
              className="flex w-full min-w-0 items-center gap-2.5 rounded-md border border-line bg-surface p-2.5 text-left transition-[border-color,background-color,scale] duration-150 hover:border-line-strong hover:bg-surface-2 active:scale-[0.97]"
            >
              <FaceGridView colors={flag.grid} size={11} label={`${flag.name} on the cube`} />
              <span className="min-w-0 truncate text-sm font-bold text-ink">{flag.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  )
}

/** The "Make your own" tab of the patterns page (`/patterns?tab=design&face=…`). */
export default function DesignStudio() {
  const design = usePatterns((s) => s.design)
  const setDesign = usePatterns((s) => s.setDesign)
  const [params, setParams] = useSearchParams()
  const [paint, setPaint] = useState<Color>('red')
  const [presets, setPresets] = useState(false)
  const grid = useMemo(() => parseFaceCode(design.face) ?? parseFaceCode(BLANK_FACE)!, [design.face])
  const code = faceCode(grid)
  const slices = design.slices
  const plain = isPlainFace(grid)
  const key = `${code}${slices ? '+s' : ''}`

  // A shared link (`?face=…`) opens on that design; after that the address follows the canvas,
  // so it can always be copied and reloaded.
  const adopted = useRef(false)
  useEffect(() => {
    if (!adopted.current) {
      adopted.current = true
      const shared = parseFaceCode(params.get('face'))
      if (shared) {
        const next = { face: faceCode(shared), slices: params.get('slices') === '1' }
        if (next.face !== design.face || next.slices !== design.slices) {
          setDesign(next)
          return
        }
      }
    }
    if (params.get('face') === code && (params.get('slices') === '1') === slices) return
    const updated = new URLSearchParams(params)
    updated.set('face', code)
    if (slices) updated.set('slices', '1')
    else updated.delete('slices')
    setParams(updated, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, slices])

  // ── the search: debounced, in the worker, newest wins ──
  const [found, setFound] = useState<Found | null>(() => {
    const cached = plain ? undefined : peekFace(grid, { slices })
    return cached === undefined ? null : { key, solution: cached }
  })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (plain) return
    const cached = peekFace(grid, { slices })
    if (cached !== undefined) {
      setFound({ key, solution: cached })
      return
    }
    let live = true
    const timer = window.setTimeout(() => {
      searchFace(grid, { slices }).then(
        (solution) => live && setFound({ key, solution }),
        (error: unknown) => live && !isFaceSearchCancelled(error) && setFound({ key, solution: null, failed: true }),
      )
    }, DEBOUNCE_MS)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
    // `grid` follows `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, plain, attempt])

  const current = found?.key === key ? found : null
  const thinking = !plain && current === null
  /** What the result card shows: the answer, or the last one (dimmed) while the new one comes. */
  const shown = plain ? null : (current ?? found)
  const solution = shown?.solution ?? null
  const failed = current?.failed === true || (current !== null && !current.solution)
  const looksLike = useMemo(() => flagLookingLike(grid), [grid])

  const paintCell = (index: number) => {
    if (grid[index] === paint) return
    const next = [...grid]
    next[index] = paint
    sound.play('tap')
    setDesign({ face: faceCode(next) })
  }

  const pickPreset = (preset: FaceGrid) => {
    setDesign({ face: faceCode(preset) })
    setPresets(false)
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-5" data-testid="design-studio">
      <Card padding="md" className="flex flex-col gap-4" data-testid="design-canvas">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="min-w-0">
            <h2 className="text-xl text-ink">Paint your face</h2>
            <p className="text-sm text-ink-muted">Pick a colour, then tap the stickers.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" iconLeft="flag" onClick={() => setPresets(true)} data-testid="design-start-from-flag">
              Start from a flag
            </Button>
            <Button variant="ghost" size="sm" iconLeft="restart" onClick={() => setDesign({ face: BLANK_FACE })} disabled={code === BLANK_FACE} data-testid="design-clear">
              Clear
            </Button>
          </div>
        </div>

        <div className="mx-auto w-full max-w-[17rem] py-1">
          <FaceGridView colors={grid} onCellClick={paintCell} label="Your design. Tap a sticker to paint it." className="w-full" />
        </div>

        <div role="group" aria-label="Paint colour" className="flex justify-center gap-x-2 sm:gap-x-3.5" data-testid="design-palette">
          {PALETTE.map((color) => (
            <span key={color} className="flex flex-col items-center gap-1" data-testid={`design-paint-${color}`}>
              <CubeSwatch color={color} size="lg" showLetter selected={paint === color} onClick={() => setPaint(color)} className="max-sm:size-11" />
              <span className={cx('text-xs font-bold', paint === color ? 'text-ink' : 'text-ink-faint')}>{CUBE_COLOR_NAME[color]}</span>
            </span>
          ))}
        </div>
      </Card>

      <Card padding="md" className="flex flex-col gap-4" data-testid="design-result-card">
        <div className="flex items-center justify-between gap-3">
          <p className="eyebrow">Your moves</p>
          <AnimatePresence initial={false}>
            {thinking && (
              <motion.span key="thinking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1.5 text-xs font-bold text-ink-muted" data-testid="design-thinking">
                <Spinner size={14} /> Working it out
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <div aria-live="polite" aria-busy={thinking} data-testid="design-result" data-state={plain ? 'plain' : thinking ? 'thinking' : failed ? 'failed' : 'ready'} data-moves={solution && !thinking ? solution.moves.length : undefined} data-alg={solution && !thinking ? solution.moves.join(' ') : undefined}>
          {plain ? (
            <div className="flex items-start gap-3">
              <Sticker tone="white" icon="wand" size="md" />
              <div>
                <p className="font-display text-xl font-bold text-ink">Paint a few stickers</p>
                <p className="mt-0.5 text-base text-ink-muted">A plain face is already on a solved cube. Change some stickers and the moves to make it show up here.</p>
              </div>
            </div>
          ) : failed && !thinking ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-base text-ink-muted">Something went wrong working that one out.</p>
              <Button
                variant="secondary"
                size="sm"
                iconLeft="restart"
                onClick={() => {
                  // Drop the failure so the spinner shows while it tries again.
                  setFound(null)
                  setAttempt((n) => n + 1)
                }}
              >
                Try again
              </Button>
            </div>
          ) : solution ? (
            <div className={cx('flex flex-col gap-3 transition-opacity duration-200', thinking && 'opacity-45')}>
              <p className="sr-only">{designResultLine(solution)}</p>
              <p className="font-display text-3xl leading-9 font-extrabold text-ink" aria-hidden="true">
                <motion.span key={`${key}:${solution.moves.length}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={springs.snappy} className="num inline-block" data-testid="design-move-count">
                  {solution.moves.length}
                </motion.span>{' '}
                {solution.moves.length === 1 ? 'move' : 'moves'}
              </p>
              <p className="text-base text-ink-muted" aria-hidden="true">
                <HoldWords solution={solution} />
              </p>
              <MoveSequence moves={solution.moves} size={solution.moves.length > 8 ? 'sm' : 'md'} label="Moves that make your design" />
            </div>
          ) : (
            <p className="flex min-h-24 items-center gap-2 text-base text-ink-muted">
              <Spinner /> Working out the moves…
            </p>
          )}
        </div>

        {looksLike && (
          <p className="flex items-center gap-2 rounded-md bg-inset px-3 py-2 text-sm font-semibold text-ink" data-testid="design-looks-like">
            <FlagArt spec={looksLike.art} label={`Flag of ${looksLike.name}`} size={36} />
            <span>
              That is the flag of{' '}
              <Link to={`/patterns/${looksLike.id}`} className="font-bold text-accent-text underline-offset-2 hover:underline">
                {looksLike.name}
              </Link>
              !
            </span>
          </p>
        )}

        <div className="border-t border-line pt-3.5" data-testid="design-slices">
          <Toggle checked={slices} onChange={(on) => setDesign({ slices: on })}>
            <span className="block text-base font-semibold text-ink">Use middle slices</span>
            <span className="block text-sm text-ink-muted">M, E and S turn a middle layer. Often fewer moves, a bit trickier.</span>
          </Toggle>
        </div>

        {plain || thinking || failed || !solution ? (
          <Button size="lg" iconRight="arrowRight" disabled fullWidth data-testid="design-make">
            Make it
          </Button>
        ) : (
          <ButtonLink to={designLink(code, slices)} size="lg" iconRight="arrowRight" fullWidth data-testid="design-make">
            Make it
          </ButtonLink>
        )}
        <p className="flex items-start gap-2 text-sm text-ink-muted">
          <Icon name="lightbulb" size={16} className="mt-0.5 shrink-0 text-cube-yellow-text" />
          <span>Every design you can paint can be made. Some just take a few more moves.</span>
        </p>
      </Card>

      <PresetPicker open={presets} onClose={() => setPresets(false)} onPick={pickPreset} />
    </div>
  )
}
