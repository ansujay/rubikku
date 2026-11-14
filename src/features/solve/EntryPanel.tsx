/**
 * Step 1 + 2: copy the real cube's colours into the site, with the check running live.
 * The 3D cube (the other painting surface) lives in SolvePage; this panel holds the palette,
 * the guided one-face-at-a-time grid, the flat net, the helpers and the check card.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { applyAlg, FACES, randomScramble, SOLVED, toColors, type Color, type Face } from '../../cube'
import { Badge, Button, Card, CubeNet, CUBE_CLASSES, cx, Icon, IconButton, Kbd, Modal, ProgressBar, SegmentedControl, sound, springs, Toggle } from '../../ui'
import { flaggedFacelets, withChanges, type CubeCheck, type Issue } from './checkModel'
import { applyForced, blanksOnFace, centreOf, countColors, decode, faceFacelets, faceOfFacelet, inferForced, isCentre, PALETTE, PER_COLOR, STICKERS, type Cell, type Painted } from './entryModel'
import { centreNames, faceInstruction, GUIDED_FACES, guidedIndexOf } from './faceGuide'
import { TiltPicture } from './parts'
import { useSolve } from './solveStore'

// ───────────────────────── Drag-painting ─────────────────────────

/**
 * Paint by tapping or by dragging across stickers. Put the returned handlers on an element
 * that contains `[data-facelet]` stickers. The first sticker of a drag starts a new undo step;
 * the rest of the drag joins it.
 */
function usePaintStroke() {
  const stroke = useRef<{ id: number; last: number; painted: boolean } | null>(null)
  const paintAt = (x: number, y: number) => {
    const current = stroke.current
    if (!current) return
    const element = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-facelet]')
    if (!element) return
    const facelet = Number(element.dataset.facelet)
    if (!Number.isInteger(facelet) || facelet === current.last) return
    current.last = facelet
    const before = useSolve.getState().cells
    useSolve.getState().paintSticker(facelet, undefined, current.painted)
    if (useSolve.getState().cells !== before) current.painted = true
  }
  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      // Touch pointers are captured by the sticker they land on; let the drag roam.
      ;(event.target as Element).releasePointerCapture?.(event.pointerId)
      stroke.current = { id: event.pointerId, last: -1, painted: false }
      paintAt(event.clientX, event.clientY)
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (stroke.current?.id === event.pointerId) paintAt(event.clientX, event.clientY)
    },
    onPointerUp: () => {
      stroke.current = null
    },
    onPointerCancel: () => {
      stroke.current = null
    },
  }
}

/**
 * S4: a painting surface can appear under a finger that is already down (the last tap of
 * face-by-face entry completes the cube and swaps the 3x3 grid for the net, or for the zoomed
 * grid). The click that ends that touch must not paint what is now under it. Spread this on the
 * surface: a pointer click only counts when its press began there. (A keyboard click, detail 0,
 * always counts.)
 */
function usePressGuard() {
  const pressed = useRef(false)
  return {
    onPointerDownCapture: () => {
      pressed.current = true
    },
    onClickCapture: (event: MouseEvent<HTMLElement>) => {
      const began = pressed.current
      pressed.current = false
      if (event.detail > 0 && !began) event.stopPropagation()
    },
  }
}

// ───────────────────────── Palette ─────────────────────────

function Palette({ painted }: { painted: Painted }) {
  const brush = useSolve((s) => s.brush)
  const counts = useMemo(() => countColors(painted), [painted])
  return (
    <div role="radiogroup" aria-label="Colour to paint with" className="grid grid-cols-6 gap-1.5 sm:gap-2" data-testid="palette">
      {PALETTE.map((color, i) => {
        const used = counts[color]
        const left = PER_COLOR - used
        const selected = brush === color
        const c = CUBE_CLASSES[color]
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${color}: ${left > 0 ? `${left} left` : left === 0 ? 'all nine placed' : `${-left} too many`}`}
            data-color={color}
            data-left={left}
            onClick={() => useSolve.getState().setBrush(color)}
            className={cx(
              'group relative flex flex-col items-center gap-1 rounded-md px-1 pt-1.5 pb-1 transition-[background-color,box-shadow] duration-150',
              selected ? 'bg-surface shadow-2 ring-2 ring-ink' : 'ring-1 ring-line hover:bg-surface',
            )}
          >
            <span
              className={cx(
                'relative grid aspect-square w-full max-w-14 place-items-center rounded-[12px] font-mono text-base font-bold',
                'shadow-[inset_0_0_0_1px_var(--sticker-outline),inset_0_-4px_0_0_rgb(0_0_0/0.12)] transition-[scale,opacity] duration-150 group-active:scale-90',
                c.solid,
                c.onSolid,
                left === 0 && !selected && 'opacity-45',
              )}
            >
              {left === 0 ? <Icon name="check" size={22} weight={3} /> : <span aria-hidden="true">{color[0].toUpperCase()}</span>}
              <Kbd className="absolute -top-1.5 -left-1.5 h-5! min-w-5! px-1! text-2xs! max-md:hidden" aria-hidden="true">
                {i + 1}
              </Kbd>
            </span>
            <span className={cx('num text-xs leading-4 font-bold whitespace-nowrap', left < 0 ? 'text-cube-red-text' : left === 0 ? 'text-cube-green-text' : 'text-ink-muted')}>
              {left > 0 ? `${left} left` : left === 0 ? 'done' : `${-left} extra`}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ───────────────────────── Guided: one face at a time ─────────────────────────

const stickerClasses = (color: Cell) =>
  color ? [CUBE_CLASSES[color].solid, CUBE_CLASSES[color].onSolid, 'shadow-[inset_0_0_0_1px_var(--sticker-outline),inset_0_-4px_0_0_rgb(0_0_0/0.1)]'] : 'bg-surface-2 text-ink-faint shadow-[inset_0_0_0_2px_var(--line-strong)]'

function SideBar({ color, name, side }: { color: Color | null; name: string; side: 'top' | 'bottom' | 'left' | 'right' }) {
  const vertical = side === 'left' || side === 'right'
  return (
    <div
      className={cx('flex items-center justify-center gap-1.5 rounded-[8px] text-2xs font-bold whitespace-nowrap', color ? [CUBE_CLASSES[color].solid, CUBE_CLASSES[color].onSolid, 'shadow-[inset_0_0_0_1px_var(--sticker-outline)]'] : 'bg-inset text-ink-faint', vertical ? 'w-6 [writing-mode:vertical-rl]' : 'h-6', side === 'left' && 'rotate-180')}
      data-side={side}
      data-neighbour={color ?? 'blank'}
    >
      {name} side
    </div>
  )
}

function FaceGrid({ painted, faceIndex, flagged, locked }: { painted: Painted; faceIndex: number; flagged: ReadonlySet<number>; locked: boolean }) {
  const view = GUIDED_FACES[faceIndex]
  const facelets = faceFacelets(view.face)
  const centre = (face: Face) => painted[centreOf(face)]
  const names = centreNames(Object.fromEntries(FACES.map((face) => [face, centre(face)])) as Record<Face, Color | null>)
  const stroke = usePaintStroke()
  const pressGuard = usePressGuard()
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const onKeyDown = (event: KeyboardEvent, i: number) => {
    const delta = { ArrowUp: -3, ArrowDown: 3, ArrowLeft: -1, ArrowRight: 1 }[event.key]
    if (delta === undefined) return
    event.preventDefault()
    const sameRow = Math.abs(delta) === 3 || Math.floor((i + delta) / 3) === Math.floor(i / 3)
    const target = i + delta
    if (sameRow && target >= 0 && target < 9) buttons.current[target]?.focus()
  }
  const n = view.neighbours
  return (
    <div className="mx-auto grid w-full max-w-[21rem] grid-cols-[auto_minmax(0,1fr)_auto] grid-rows-[auto_minmax(0,1fr)_auto] gap-1.5" data-testid="face-grid" data-face={view.face}>
      <div className="col-start-2">
        <SideBar color={centre(n.top)} name={names[n.top]} side="top" />
      </div>
      <div className="col-start-1 row-start-2 flex">
        <SideBar color={centre(n.left)} name={names[n.left]} side="left" />
      </div>
      <div
        role="group"
        aria-label={`${view.name} face, as you see it`}
        className="col-start-2 row-start-2 grid aspect-square touch-none grid-cols-3 gap-1.5 rounded-[18px] bg-cube-body p-2 select-none"
        {...stroke}
        {...pressGuard}
      >
        {facelets.map((facelet, i) => {
          const color = painted[facelet]
          const fixed = locked && isCentre(facelet)
          return (
            <button
              key={facelet}
              ref={(el) => {
                buttons.current[i] = el
              }}
              type="button"
              data-facelet={facelet}
              data-color={color ?? 'empty'}
              aria-label={`Row ${Math.floor(i / 3) + 1}, column ${(i % 3) + 1}: ${color ?? 'empty'}${fixed ? ' (the centre, fixed)' : ''}`}
              aria-disabled={fixed || undefined}
              onKeyDown={(event) => onKeyDown(event, i)}
              onClick={() => useSolve.getState().paintSticker(facelet)}
              className={cx(
                'relative grid aspect-square place-items-center rounded-[11px] font-mono text-lg font-bold transition-[background-color,scale] duration-150 ease-out',
                stickerClasses(color),
                !fixed && 'cursor-pointer active:scale-90',
                flagged.has(facelet) && 'outline-[3px] outline-offset-[-3px] outline-cube-red',
              )}
            >
              {fixed ? (
                <Icon name="lock" size={18} className="opacity-55" />
              ) : color ? (
                // The letter as well as the colour: red and orange are easy to mix up.
                <span aria-hidden="true" className="text-base opacity-60">
                  {color[0].toUpperCase()}
                </span>
              ) : (
                <span aria-hidden="true" className="size-2 rounded-full bg-line-strong" />
              )}
            </button>
          )
        })}
      </div>
      <div className="col-start-3 row-start-2 flex">
        <SideBar color={centre(n.right)} name={names[n.right]} side="right" />
      </div>
      <div className="col-start-2 row-start-3">
        <SideBar color={centre(n.bottom)} name={names[n.bottom]} side="bottom" />
      </div>
    </div>
  )
}

/**
 * The words for the face being entered: how to turn the real cube, and how to check it is the
 * right way up. On a tablet it sits under the 3D cube; on a phone, around the grid.
 */
export function GuidedInstruction({ painted, part = 'both', className }: { painted: Painted; part?: 'how' | 'check' | 'both'; className?: string }) {
  const index = useSolve((s) => s.guidedIndex)
  const view = GUIDED_FACES[index]
  const centres = Object.fromEntries(FACES.map((face) => [face, painted[centreOf(face)]])) as Record<Face, Color | null>
  const text = faceInstruction(view.face, centreNames(centres))
  return (
    <div className={cx('flex flex-col gap-3', className)} data-testid={part === 'check' ? undefined : 'guided-instruction'}>
      {part !== 'check' && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <TiltPicture face={view.face} centres={centres} />
            <div className="min-w-0">
              <p className="eyebrow">Face {index + 1} of 6</p>
              <h2 className="text-xl text-ink" data-testid="guided-title">
                {text.title}
              </h2>
            </div>
          </div>
          <p className="text-base text-ink-muted">{text.how}</p>
        </div>
      )}
      {part !== 'how' && (
        <p className="flex items-start gap-2 rounded-md bg-inset px-3 py-2.5 text-sm font-semibold text-ink-muted">
          <Icon name="eye" size={17} className="mt-0.5 shrink-0 text-accent-text" />
          <span>
            <span className="text-ink">Right way up? </span>
            {text.check}
          </span>
        </p>
      )}
    </div>
  )
}

function GuidedEntry({ painted, flagged }: { painted: Painted; flagged: ReadonlySet<number> }) {
  const index = useSolve((s) => s.guidedIndex)
  const locked = useSolve((s) => s.centresLocked)
  const view = GUIDED_FACES[index]
  const left = blanksOnFace(painted, view.face)
  const firstUnfinished = GUIDED_FACES.findIndex((v) => blanksOnFace(painted, v.face) > 0)
  const last = index === GUIDED_FACES.length - 1
  const go = (to: number) => useSolve.getState().setGuidedIndex(to)

  return (
    <div className="flex flex-col gap-4">
      <ol className="grid grid-cols-6 gap-1" aria-label="Faces">
        {GUIDED_FACES.map((v, i) => {
          const done = blanksOnFace(painted, v.face) === 0
          const warn = faceFacelets(v.face).some((f) => flagged.has(f))
          const now = i === index
          return (
            <li key={v.face}>
              <button
                type="button"
                onClick={() => go(i)}
                aria-current={now ? 'step' : undefined}
                aria-label={`${v.name} face${done ? ', filled in' : ''}${warn ? ', needs another look' : ''}`}
                data-face-tab={v.face}
                data-done={done}
                className={cx(
                  'relative flex h-11 w-full flex-col items-center justify-center rounded-[10px] text-xs leading-4 font-bold transition-colors duration-150',
                  now ? 'bg-ink text-ink-inverse' : done ? 'bg-cube-green-soft text-cube-green-text' : 'bg-inset text-ink-muted hover:text-ink',
                )}
              >
                <span className="flex items-center gap-0.5">
                  {done && !warn && <Icon name="check" size={11} weight={3.2} />}
                  {warn && <Icon name="alert" size={11} weight={2.6} />}
                  {v.name}
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={view.face} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12, transition: { duration: 0.1 } }} transition={springs.gentle} className="flex flex-col gap-4">
          <GuidedInstruction painted={painted} part="how" className="md:hidden" />
          <FaceGrid painted={painted} faceIndex={index} flagged={flagged} locked={locked} />
          <GuidedInstruction painted={painted} part="check" className="md:hidden" />
        </motion.div>
      </AnimatePresence>

      <div className="flex items-center gap-2.5">
        <Button variant="secondary" iconLeft="chevronLeft" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous face">
          Back
        </Button>
        <Button
          variant={left === 0 ? 'primary' : 'secondary'}
          iconRight="chevronRight"
          fullWidth
          data-testid="next-face"
          onClick={() => {
            if (!last) go(index + 1)
            else if (firstUnfinished >= 0) go(firstUnfinished)
            else useSolve.getState().setEntryMode('free')
          }}
        >
          {left > 0 && !last ? 'Skip this face for now' : last ? (firstUnfinished >= 0 && firstUnfinished !== index ? 'Go to the unfinished face' : left > 0 ? `${left} to go on this face` : 'See the whole cube') : `Next: the ${GUIDED_FACES[index + 1].name.toLowerCase()} face`}
        </Button>
      </div>
    </div>
  )
}

// ───────────────────────── Free-form: the whole net ─────────────────────────

/** Smallest sticker a finger can hit reliably (the design system's touch target). */
const TOUCH_TARGET = 44
/** A sticker's share of the net's width: a twelfth, less the gaps round it. */
const STICKER_SHARE = 0.076
/** Where each face sits on the 12 × 9 net (column, row of its top-left cell). */
const NET_ORIGIN: Record<Face, readonly [number, number]> = { U: [3, 0], L: [0, 3], F: [3, 3], R: [6, 3], B: [9, 3], D: [3, 6] }

/**
 * True when fingers are the pointer and the net's stickers would be smaller than a fingertip
 * at this width. Then the net becomes a map and the painting happens on one big face.
 */
function useNeedsZoom(element: { current: HTMLElement | null }): boolean {
  const [needs, setNeeds] = useState(false)
  useLayoutEffect(() => {
    const node = element.current
    if (!node || typeof window.matchMedia !== 'function') return
    const coarse = window.matchMedia('(pointer: coarse)')
    const measure = () => setNeeds(coarse.matches && node.clientWidth * STICKER_SHARE < TOUCH_TARGET)
    measure()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
    observer?.observe(node)
    coarse.addEventListener?.('change', measure)
    return () => {
      observer?.disconnect()
      coarse.removeEventListener?.('change', measure)
    }
  }, [element])
  return needs
}

function FreeEntry({ painted, highlight, flagged }: { painted: Painted; highlight: readonly number[] | null; flagged: ReadonlySet<number> }) {
  const locked = useSolve((s) => s.centresLocked)
  const faceIndex = useSolve((s) => s.guidedIndex)
  const stroke = usePaintStroke()
  const pressGuard = usePressGuard()
  const box = useRef<HTMLDivElement>(null)
  const zoom = useNeedsZoom(box)
  const view = GUIDED_FACES[faceIndex]
  const lit = highlight && highlight.length > 0 ? highlight : undefined

  // When a slip is pointed out, open the face it is on.
  const firstLit = lit?.[0]
  useEffect(() => {
    if (zoom && firstLit !== undefined) useSolve.getState().setGuidedIndex(guidedIndexOf(faceOfFacelet(firstLit)))
  }, [zoom, firstLit])

  if (!zoom) {
    return (
      <div ref={box} className="flex flex-col gap-2">
        <div
          className="touch-none select-none"
          {...stroke}
          {...pressGuard}
          data-testid="entry-net"
          data-zoom="false"
        >
          <CubeNet
            state={painted}
            onStickerClick={(facelet) => useSolve.getState().paintSticker(facelet)}
            isLocked={(facelet) => locked && isCentre(facelet)}
            highlight={lit}
            dimOpacity={0.45}
            label="Your cube, unfolded. Arrow keys move, Enter paints."
          />
        </div>
        <p className="text-center text-xs font-semibold text-ink-faint">Top above · left, front, right, back across the middle · bottom below</p>
      </div>
    )
  }

  // Fingers on a small net: the net is the map (tap a face to open it), and the open face is
  // painted on a grid with stickers big enough to hit.
  const [col, row] = NET_ORIGIN[view.face]
  return (
    <div ref={box} className="flex flex-col gap-3">
      <div className="mx-auto w-full max-w-72">
        <div className="relative select-none" data-testid="entry-net" data-zoom="true">
          <CubeNet
            state={painted}
            onStickerClick={(facelet) => useSolve.getState().setGuidedIndex(guidedIndexOf(faceOfFacelet(facelet)))}
            highlight={lit}
            dimOpacity={0.45}
            label="Your cube, unfolded. Tap a face to open it."
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute rounded-[7px] ring-[3px] ring-accent ring-offset-2 ring-offset-bg transition-[left,top] duration-200 ease-out"
            style={{ left: `${(col / 12) * 100}%`, top: `${(row / 9) * 100}%`, width: '25%', height: `${100 / 3}%` }}
            data-testid="net-open-face"
            data-face={view.face}
          />
        </div>
        <p className="mt-2 text-center text-xs font-semibold text-ink-faint">The whole cube. Tap a face to open it big.</p>
      </div>
      <div className="flex flex-col gap-2" data-testid="zoom-face">
        <p className="text-center text-sm font-bold text-ink" aria-live="polite">
          {view.name} face <span className="font-semibold text-ink-muted">— tap or drag across the stickers to paint</span>
        </p>
        <FaceGrid painted={painted} faceIndex={faceIndex} flagged={flagged} locked={locked} />
      </div>
    </div>
  )
}

// ───────────────────────── The check card ─────────────────────────

function IssueCard({ issue, open, onOpen, onFix }: { issue: Issue; open: boolean; onOpen: () => void; onFix: () => void }) {
  const cube = issue.kind === 'cube'
  return (
    <li className={cx('rounded-md transition-colors duration-150', open ? 'bg-inset' : 'hover:bg-inset/60')} data-issue={issue.code} data-issue-id={issue.id} data-open={open}>
      <button type="button" onClick={onOpen} aria-expanded={open} className="flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left">
        <span className={cx('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[9px]', cube ? 'bg-accent-soft text-accent-text' : 'bg-cube-yellow-soft text-cube-yellow-text')}>
          <Icon name={issue.id === 'guess' ? 'sparkle' : cube ? 'info' : 'eye'} size={18} />
        </span>
        <span className="min-w-0 grow">
          <span className="block text-base font-bold text-ink">{issue.title}</span>
          {!open && <span className="block truncate text-sm text-ink-muted">{issue.body}</span>}
        </span>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={18} className="mt-1.5 shrink-0 text-ink-faint" />
      </button>
      {open && (
        <div className="flex flex-col gap-3 px-3 pb-3 pl-14">
          <p className="text-base text-ink-muted">{issue.body}</p>
          {issue.steps && (
            <ol className="flex flex-col gap-2">
              {issue.steps.map((step, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-ink">
                  <span className="num mt-px flex size-5.5 shrink-0 items-center justify-center rounded-[7px] bg-surface text-xs font-extrabold text-ink ring-1 ring-line-strong">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          )}
          {issue.fix && (
            <Button variant={issue.id === 'guess' ? 'primary' : 'secondary'} size="sm" iconLeft="check" onClick={onFix} className="self-start" data-testid="issue-fix">
              {issue.fix.label}
            </Button>
          )}
        </div>
      )}
    </li>
  )
}

function CheckCard({ check, openIssue, onOpenIssue, onContinue, reentryOffset }: { check: CubeCheck; openIssue: string | null; onOpenIssue: (id: string | null) => void; onContinue: () => void; reentryOffset: number | null }) {
  const reentry = useSolve((s) => s.reentry)
  const intent = useSolve((s) => s.intent)
  const unchanged = useSolve((s) => s.reentry && s.cells === s.expected)
  // After "fix the colours": his cube turned out to be a cube the solution passes through
  // anyway, this many turns from where we were (so nothing needs working out again).
  const known = reentry && !unchanged && reentryOffset !== null
  const turns = (n: number) => (n === 1 ? 'one turn' : `${n} turns`)
  const filled = STICKERS - check.blanks
  const fix = (issue: Issue) => {
    if (!issue.fix) return
    const current = useSolve.getState()
    current.setCells(withChanges(decode(current.cells), issue.fix.changes))
    sound.play('success')
  }

  return (
    <Card variant="raised" padding="md" className="flex flex-col gap-3" data-testid="check-card" data-status={check.status} aria-live="polite">
      {check.status === 'ok' ? (
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={springs.bouncy} className="flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-[11px] bg-cube-green text-on-green shadow-[0_3px_0_0_var(--cube-green-edge)]">
              <Icon name="check" size={22} weight={3} />
            </span>
            <div>
              <h2 className="text-lg text-ink">{unchanged ? 'Compare it with your cube' : known ? 'Found your place' : reentry ? 'Got it — that’s your cube now' : 'That’s a real cube!'}</h2>
              <p className="text-base text-ink-muted" data-testid="check-ok-text" data-reentry={unchanged ? 'same' : known ? 'known' : reentry ? 'new' : undefined}>
                {unchanged
                  ? 'Tap a colour, then tap every sticker that is different on your cube. If it really is all the same, we carry on exactly where we were.'
                  : known
                    ? `Your cube is ${reentryOffset! < 0 ? `${turns(-reentryOffset!)} back from` : `${turns(reentryOffset!)} ahead of`} where I thought. Nothing is lost — we carry on from there.`
                    : reentry
                      ? 'It’s somewhere new, so I’ll work out a fresh way home from exactly where your cube is.'
                      : 'Every sticker checks out. Nice careful work.'}
              </p>
            </div>
          </div>
          <Button variant="primary" size="lg" iconRight="arrowRight" fullWidth onClick={onContinue} data-testid="entry-continue">
            {unchanged ? 'It’s all the same — carry on' : known ? 'Carry on from there' : reentry ? 'Solve from here' : intent === 'where' ? 'Where am I?' : 'Next: where am I?'}
          </Button>
        </motion.div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-lg text-ink">{check.blanks > 0 ? (reentry ? 'Fix what’s different' : 'Checking as you go') : 'Nearly — let’s find the slip'}</h2>
              <span className="num text-sm font-bold text-ink-muted" data-testid="entry-progress">
                {filled} / {STICKERS}
              </span>
            </div>
            <ProgressBar value={filled} max={STICKERS} tone={check.issues.length > 0 ? 'yellow' : 'accent'} size="sm" label="Stickers filled in" />
            <p className="text-sm font-semibold text-ink-muted" data-testid="entry-progress-line">
              {check.blanks > 0
                ? check.progress
                : 'Every sticker is in, but this can’t be a real cube yet. That’s normal — almost everyone slips on a sticker or two. The lit stickers are the ones to compare with your cube.'}
            </p>
          </div>
          {check.issues.length > 0 && (
            <ul className="-mx-1 flex flex-col gap-1" data-testid="issues">
              {check.issues.map((issue) => (
                <IssueCard key={issue.id} issue={issue} open={openIssue === issue.id} onOpen={() => onOpenIssue(openIssue === issue.id ? null : issue.id)} onFix={() => fix(issue)} />
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  )
}

// ───────────────────────── Helpers row ─────────────────────────

function Helpers({ painted }: { painted: Painted }) {
  const mode = useSolve((s) => s.entryMode)
  const guidedIndex = useSolve((s) => s.guidedIndex)
  const locked = useSolve((s) => s.centresLocked)
  const canUndo = useSolve((s) => s.history.past.length > 0)
  const canRedo = useSolve((s) => s.history.future.length > 0)
  const demo = useSolve((s) => s.demo)
  const rewarded = useSolve((s) => s.rewarded)
  const [confirmClear, setConfirmClear] = useState(false)
  const [more, setMore] = useState(false)
  const painted48 = painted.filter((color, i) => color && !isCentre(i)).length
  const forced = useMemo(() => inferForced(painted), [painted])
  const store = useSolve.getState

  const clearEverything = () => {
    setConfirmClear(false)
    store().clearAll()
  }

  return (
    <div className="flex flex-col gap-3">
      <AnimatePresence initial={false}>
        {forced.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={springs.gentle} className="overflow-hidden">
            <Button
              variant="reward"
              size="sm"
              iconLeft="sparkle"
              fullWidth
              data-testid="fill-forced"
              onClick={() => {
                store().setCells(applyForced(painted, forced))
                sound.play('success')
              }}
            >
              {forced.length === 1 ? 'I’m sure about 1 more sticker — fill it in' : `I’m sure about ${forced.length} more stickers — fill them in`}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-wrap items-center gap-1.5">
        <IconButton icon="undo" label="Undo" variant="secondary" size="sm" onClick={() => store().undo()} disabled={!canUndo} />
        <IconButton icon="redo" label="Redo" variant="secondary" size="sm" onClick={() => store().redo()} disabled={!canRedo} />
        {mode === 'guided' && (
          <Button variant="ghost" size="sm" onClick={() => store().clearFace(guidedIndex)} disabled={blanksOnFace(painted, GUIDED_FACES[guidedIndex].face) >= 8}>
            Clear face
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => (painted48 > 8 ? setConfirmClear(true) : clearEverything())} disabled={painted48 === 0} data-testid="clear-all">
          Clear all
        </Button>
        <Button variant="ghost" size="sm" iconRight={more ? 'chevronUp' : 'chevronDown'} onClick={() => setMore(!more)} aria-expanded={more} className="ml-auto" data-testid="more-helpers">
          More
        </Button>
      </div>

      {demo && (
        <p className="flex items-start gap-2 rounded-md bg-cube-yellow-soft px-3 py-2.5 text-sm text-ink" data-testid="pretend-note">
          <Icon name="sparkle" size={17} className="mt-0.5 shrink-0 text-cube-yellow-text" />
          <span>
            <span className="font-bold">This is a pretend cube.</span> Great for trying things out — it doesn’t count as solving your real one. To copy in your own cube, tap Clear all first.
          </span>
        </p>
      )}

      <AnimatePresence initial={false}>
        {more && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={springs.gentle} className="overflow-hidden">
            <div className="flex flex-col gap-3 rounded-md bg-inset p-3">
              <div>
                <p className="text-sm font-bold text-ink">No cube in your hands?</p>
                <p className="text-sm text-ink-muted">Try the whole thing with a pretend one.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    iconLeft="shuffle"
                    data-testid="fill-random"
                    onClick={() => {
                      store().setCells(toColors(applyAlg(SOLVED, randomScramble())), { demo: true })
                    }}
                  >
                    Random scramble
                  </Button>
                  <Button variant="secondary" size="sm" iconLeft="cube" data-testid="fill-solved" onClick={() => store().setCells(toColors(SOLVED), { demo: true })}>
                    Solved cube
                  </Button>
                </div>
              </div>
              <Toggle checked={locked} onChange={(value) => store().setCentresLocked(value)} className="w-full">
                <span className="block text-sm font-bold text-ink">Lock the six middles</span>
                <span className="block text-sm text-ink-muted">Turn this off if you hold your cube another way round, then paint the middles too.</span>
              </Toggle>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Modal
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="Clear every sticker?"
        description={rewarded ? 'All the colours go back to empty, ready for a new cube.' : 'All the colours you entered go back to empty. (Undo brings them back.)'}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmClear(false)}>
              Keep them
            </Button>
            <Button variant="danger" iconLeft="trash" onClick={clearEverything} data-testid="confirm-clear">
              Clear all
            </Button>
          </>
        }
      />
    </div>
  )
}

// ───────────────────────── The panel ─────────────────────────

export interface EntryPanelProps {
  painted: Painted
  check: CubeCheck
  /** The issue whose stickers are lit (also on the 3D cube). */
  openIssue: string | null
  onOpenIssue: (id: string | null) => void
  highlight: readonly number[] | null
  onContinue: () => void
  /**
   * After "fix the colours": how many turns from the place we were the entered cube sits in the
   * solution he was following (0 = the same place), or null when it is not in it at all.
   */
  reentryOffset?: number | null
  /** The check is still catching up with the last tap (QA N12: never show a stale "problems" over a cube that is right). */
  pending?: boolean
}

export function EntryPanel({ painted, check, openIssue, onOpenIssue, highlight, onContinue, reentryOffset = null, pending = false }: EntryPanelProps) {
  const mode = useSolve((s) => s.entryMode)
  const surface = useSolve((s) => s.surface)
  const reentry = useSolve((s) => s.reentry)
  const flagged = useMemo(() => flaggedFacelets(check.issues), [check.issues])

  return (
    <div className="flex flex-col gap-4" data-testid="entry-panel">
      {reentry && (
        <Card variant="inset" padding="sm" className="flex items-start gap-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-accent-soft text-accent-text">
            <Icon name="info" size={18} />
          </span>
          <p className="text-sm text-ink-muted">
            <span className="font-bold text-ink">This is what I expected your cube to look like.</span> Hold your cube the same way round as before and change only the stickers that are different. Then I’ll solve it from where it really is.
          </p>
        </Card>
      )}

      {!reentry && (
        <p className="flex items-start gap-2.5 rounded-md bg-accent-soft px-3.5 py-2.5 text-sm text-ink" data-testid="entry-hold">
          <Icon name="rotateCw" size={17} className="mt-0.5 shrink-0 text-accent-text" />
          <span>
            <span className="font-bold">For copying the colours, hold it white on top and green in front;</span> we’ll roll it to yellow-up to solve.
          </span>
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <SegmentedControl
          ariaLabel="How to enter the colours: one face at a time, or the whole cube"
          size="sm"
          value={mode}
          onChange={(value) => useSolve.getState().setEntryMode(value)}
          items={[
            { value: 'guided', label: 'Face by face' },
            { value: 'free', label: 'Whole cube' },
          ]}
        />
        <SegmentedControl
          ariaLabel="Painting surface"
          size="sm"
          className="md:hidden"
          value={surface}
          onChange={(value) => useSolve.getState().setSurface(value)}
          items={[
            { value: 'flat', label: 'Flat' },
            { value: '3d', label: '3D', icon: 'cube' },
          ]}
        />
      </div>

      <div className="sticky top-(--topbar-h) z-20 -mx-4 bg-bg px-4 py-2 sm:-mx-6 sm:px-6 md:static md:mx-0 md:bg-transparent md:p-0">
        <Palette painted={painted} />
      </div>

      <div className={cx(surface === '3d' && 'max-md:hidden')}>
        {mode === 'guided' ? <GuidedEntry painted={painted} flagged={flagged} /> : <FreeEntry painted={painted} highlight={highlight} flagged={flagged} />}
      </div>
      {surface === '3d' && <p className="text-center text-sm font-semibold text-ink-muted md:hidden">Tap the stickers on the cube. Drag beside it to turn it round.</p>}

      <Helpers painted={painted} />
      {pending ? (
        <Card variant="raised" padding="md" className="flex items-center gap-3" data-testid="check-card" data-status="checking" aria-live="polite">
          <Icon name="sparkle" size={20} className="shrink-0 text-accent-text" />
          <p className="text-base font-semibold text-ink-muted">Checking your cube…</p>
        </Card>
      ) : (
        <CheckCard check={check} openIssue={openIssue} onOpenIssue={onOpenIssue} onContinue={onContinue} reentryOffset={reentryOffset} />
      )}
      {check.status !== 'ok' && check.blanks === 0 && (
        <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-ink-faint">
          <Badge tone="neutral" size="sm">
            Tip
          </Badge>
          Pick a colour above, then tap a lit sticker to change it.
        </p>
      )}
    </div>
  )
}
