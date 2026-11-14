/**
 * "Solve my cube": show me your cube → check → where am I? → guided solution.
 *
 * One 3D cube stays on screen for the whole flow: it is a painting surface during entry, shows
 * what is already done in "where am I?", and then turns move by move through the solution. The
 * panel beside it changes with the phase. Everything is saved as it happens (solveStore).
 */
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { reward } from '../../app/rewards'
import { analyzeCube, findPiece, isSolved, SOLVED, solveBeginner, solveOptimal, toColors, warmUpOptimalSolver, type CubeState, type Move } from '../../cube'
import { Cube3D, StageControls, type Cube3DHandle, type CubeHighlight } from '../../three'
import { getStage } from '../../store'
import { Badge, Button, Card, celebration, CubeStage, CubeSwatch, cx, Icon, Page, Reveal, sound, springs, toast } from '../../ui'
import { checkCube } from './checkModel'
import { EntryPanel, GuidedInstruction } from './EntryPanel'
import { blankCount, centreOf, decode, faceFacelets, PALETTE } from './entryModel'
import { GUIDED_FACES } from './faceGuide'
import { FlowSteps, HoldLine, type FlowStep } from './parts'
import { useSolve, type WalkMode } from './solveStore'
import { BigMove, WalkDock, WalkPanel } from './WalkPanel'
import { back, clampPos, currentMove, endsSolved, faceTurns, globalIndex, isBoundary, isFinished, isMilestone, locate, movesToBoundary, next, stateAt, stepStart, walkFromBeginner, walkFromFastest, type Walk } from './walkthrough'
import { WherePanel } from './WherePanel'
import { Chooser } from '../learn/Chooser'
import { beatIndex, getLesson } from '../learn/content'
import { useLearn } from '../learn/learnStore'
import { stagePicture, type RescuePick } from '../learn/rescue'

/** Pause between moves while "play this step" runs, in ms at speed 1 — slow enough to copy. */
const PLAY_GAP_MS = 1100

const panelMotion = { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8, transition: { duration: 0.12 } }, transition: springs.gentle }

/**
 * The solution of `start`: the stage-by-stage way, or the fastest way once the search has
 * answered. Null while there is nothing to walk (still searching, or a saved answer that does
 * not actually solve this cube).
 */
function planWalk(start: CubeState, mode: WalkMode, fastest: readonly Move[] | null): Walk | null {
  try {
    if (mode === 'beginner') return walkFromBeginner(solveBeginner(start))
    if (!fastest) return null
    const walk = walkFromFastest(start, fastest)
    return endsSolved(walk) ? walk : null
  } catch {
    return null
  }
}

export default function SolvePage() {
  const phase = useSolve((s) => s.phase)
  const cells = useSolve((s) => s.cells)
  const entryMode = useSolve((s) => s.entryMode)
  const guidedIndex = useSolve((s) => s.guidedIndex)
  const surface = useSolve((s) => s.surface)
  const start = useSolve((s) => s.start)
  const walkMode = useSolve((s) => s.walkMode)
  const fastest = useSolve((s) => s.fastest)
  const savedPos = useSolve((s) => s.pos)
  const speed = useSolve((s) => s.speed)
  const mirrorsOn = useSolve((s) => s.mirrors)
  const paused = useSolve((s) => s.paused)
  const reentry = useSolve((s) => s.reentry)
  const store = useSolve.getState

  const cube = useRef<Cube3DHandle>(null)
  const stage = useRef<HTMLDivElement>(null)
  const [params, setParams] = useSearchParams()
  const [openIssue, setOpenIssue] = useState<string | null>(null)
  const [animating, setAnimating] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [compare, setCompare] = useState(false)
  const [fastestError, setFastestError] = useState(false)
  /** Counts the searches for the fastest way, so that asking again after a failure really searches again. */
  const [fastestTry, setFastestTry] = useState(0)
  /** A change of mode asked for in the middle of a step: it happens at the next step boundary. */
  const [pendingMode, setPendingMode] = useState<WalkMode | null>(null)

  // The shortcut solver builds its tables in a worker; start early so it is ready when asked.
  useEffect(() => {
    warmUpOptimalSolver().catch(() => {})
  }, [])

  // #/solve?where opens with "which picture looks most like your cube?" — twenty seconds, not
  // 54 stickers. Painting the stickers ("check it exactly") is the fallback.
  const navigate = useNavigate()
  const [picking, setPicking] = useState(() => params.has('where') && !params.has('exact'))
  const [preview, setPreview] = useState<RescuePick | null>(null)
  const exact = () => {
    setPicking(false)
    setPreview(null)
    // Leave the address as plain #/solve: a reload then comes back to the stickers, not the pictures.
    if (params.has('where')) setParams({}, { replace: true })
    const s = store()
    if (s.phase === 'intro') s.begin('where')
    else s.setIntent('where')
    window.scrollTo({ top: 0 })
  }
  const openLesson = (lesson: string, beat: 'cube' | 'drill') => {
    const target = getLesson(lesson)
    if (target) useLearn.getState().setBeat(lesson, beat, beatIndex(target, beat))
    navigate(`/learn/${lesson}`)
  }
  // #/solve?where&exact: straight to the stickers (the chooser's "none of these" from a lesson).
  useEffect(() => {
    if (params.has('where') && params.has('exact')) exact()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Every arrival at #/solve?where starts from the pictures again (the page may have stayed mounted).
  const location = useLocation()
  const [arrival, setArrival] = useState(0)
  useEffect(() => {
    const again = () => {
      if (!/[#/]solve\?(.*&)?where/.test(window.location.hash) || /exact/.test(window.location.hash)) return
      setPicking(true)
      setPreview(null)
      setArrival((n) => n + 1)
    }
    again()
    window.addEventListener('hashchange', again)
    return () => window.removeEventListener('hashchange', again)
  }, [location.key])
  const picture = useMemo(() => (picking ? stagePicture(preview ?? 'scrambled') : null), [picking, preview])
  useEffect(() => {
    if (!picture) return
    void (picture.below ? cube.current?.setPose({ azimuth: 0.62, elevation: -0.52, zoom: 1 }, { duration: 0.5 }) : cube.current?.resetView())
  }, [picture?.below]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── entry ──
  const painted = useMemo(() => decode(cells), [cells])
  // The check of a full cube with a slip in it tries hundreds of swaps: it follows the paint a
  // moment later, so a tap always paints at once.
  const checked = useDeferredValue(painted)
  const check = useMemo(() => checkCube(checked), [checked])
  const issue = check.issues.find((item) => item.id === openIssue) ?? check.issues[0] ?? null
  const issueFacelets = issue ? issue.facelets : null
  const complete = useMemo(() => blankCount(painted) === 0, [painted])

  // QA N2: the face being painted never changes under his finger. Completing the cube (often by
  // the last stickers of a colour filling themselves in) used to swap the 3x3 grid for the whole
  // net mid-face, and the next tap landed on another face. Now the grid stays; the check card
  // below it reviews the whole cube, and "See the whole cube" is his own choice.
  // ── solution ──
  // The walk exists while it is being walked, while "where am I?" is looking in on it, and
  // while the colours are being fixed (to find his place in it again).
  const walkWanted = phase === 'walk' || (phase === 'where' && paused) || (phase === 'entry' && reentry)
  const walk = useMemo<Walk | null>(() => (walkWanted && start ? planWalk(start, walkMode, fastest) : null), [walkWanted, start, walkMode, fastest])
  const pos = useMemo(() => (walk ? clampPos(walk, savedPos) : savedPos), [walk, savedPos])
  const walkState = walk ? stateAt(walk, pos) : start
  const finished = walk ? isFinished(walk, pos) : false
  const milestone = walk ? isMilestone(walk, pos) : false
  const step = walk && walk.steps.length > 0 ? walk.steps[pos.step] : null
  const upcoming: Move | null = walk ? currentMove(walk, pos) : null

  // Ask the worker for the fastest way when that mode is on and there is no answer yet.
  useEffect(() => {
    if (phase !== 'walk' || walkMode !== 'fastest' || !start) return
    if (fastest) {
      // A saved answer that does not solve this cube (a damaged save) is thrown away and searched again.
      if (!planWalk(start, 'fastest', fastest)) store().setFastest(null)
      return
    }
    let stale = false
    setFastestError(false)
    solveOptimal(start)
      .then((moves) => {
        if (!stale) store().setFastest(moves)
      })
      .catch(() => {
        if (!stale) setFastestError(true)
      })
    return () => {
      stale = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, walkMode, fastest, start, fastestTry])

  /** Stage boundaries already cheered in this walk (by step index). */
  const stagesCheered = useRef(new Set<string>())
  useEffect(() => {
    stagesCheered.current = new Set()
  }, [walk])
  const advance = useCallback(() => {
    const s = store()
    if (!walk || compare) return
    const from = clampPos(walk, s.pos)
    const to = next(walk, from)
    // A stage finished on his real cube: a moment (the card, and the big cube spins). Stepping
    // back and forward over the same boundary celebrates it once per walk.
    if (isMilestone(walk, to) && !isMilestone(walk, from)) {
      const group = walk.steps[to.step]?.group
      const info = group && group !== 'fastest' ? getStage(group) : undefined
      const key = `${to.step}`
      if (info && !stagesCheered.current.has(key)) {
        stagesCheered.current.add(key)
        celebration.moment({ eyebrow: 'Stage done', title: `${info.title} done`, subtitle: `Stage ${info.number} of 8 — check your cube matches.`, icon: 'check', cube: cube.current })
      } else sound.play('success')
    }
    s.setPos(to)
  }, [walk, compare, store])
  const retreat = useCallback(() => {
    const s = store()
    if (walk) s.setPos(back(walk, clampPos(walk, s.pos)))
  }, [walk, store])

  // "Play this step": one move, a pause long enough to copy it, the next — never past the step.
  const playStep = useRef(-1)
  useEffect(() => {
    if (!playing || !walk) return
    if (animating) return
    if (pos.step !== playStep.current || milestone || compare) {
      setPlaying(false)
      return
    }
    const timer = window.setTimeout(advance, PLAY_GAP_MS / speed)
    return () => window.clearTimeout(timer)
  }, [playing, walk, animating, pos, milestone, compare, advance, speed])
  const togglePlay = () => {
    playStep.current = pos.step
    setPlaying((value) => !value)
  }
  const manual = (action: () => void) => () => {
    setPlaying(false)
    action()
  }

  // The finish: his real cube, solved — a milestone, and the reward, once per cube he entered
  // himself, however many times it is re-solved, re-walked or switched between the two ways. A
  // pretend cube (or a second walk of the same one) gets a moment.
  useEffect(() => {
    if (phase !== 'walk' || !walk || !finished || walk.total === 0 || store().celebrated) return
    const timer = window.setTimeout(() => {
      const s = store()
      s.setCelebrated()
      if (!s.demo && !s.rewarded && endsSolved(walk)) {
        s.setRewarded()
        reward(
          'real-cube-solved',
          {},
          {
            milestone: {
              eyebrow: 'Real cube solved',
              title: 'You solved your cube!',
              subtitle: 'Every face one colour — and you turned every turn yourself.',
              icon: 'trophy',
              cube: cube.current,
              action: { label: 'Learn to do it alone', to: '/learn' },
            },
          },
        )
      } else celebration.moment({ eyebrow: s.demo ? 'Pretend cube' : 'Solved again', title: 'Solved!', subtitle: s.demo ? 'Now try it with your real cube.' : undefined, icon: 'check', cube: cube.current })
    }, 380)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, walk, finished])

  // After "fix the colours": is the entered cube one the solution passes through anyway?
  const reentryOffset = useMemo(() => {
    if (phase !== 'entry' || !reentry || !walk || !check.state) return null
    const at = globalIndex(walk, pos)
    const place = locate(walk, check.state, at)
    return place ? globalIndex(walk, place) - at : null
  }, [phase, reentry, walk, check.state, pos])

  // ── flow actions ──
  const toWhere = () => {
    const s = store()
    // Checked afresh from what is saved: the check on screen may be a keystroke behind.
    const entered = checkCube(decode(s.cells)).state
    if (!entered) return
    setCompare(false)
    setPlaying(false)
    setPendingMode(null)
    if (!s.reentry || !s.start) s.showWhere(entered)
    else {
      // After "fix the colours". The solution he was following is only thrown away if his cube
      // really is somewhere it never goes: re-solving from a half-done step would undo layers
      // he has already finished.
      const old = planWalk(s.start, s.walkMode, s.fastest)
      const at = old ? globalIndex(old, clampPos(old, s.pos)) : 0
      const place = old ? locate(old, entered, at) : null
      if (old && place) {
        const found = globalIndex(old, place)
        s.resumeWalk(place)
        if (found !== at) toast({ title: 'Found your place', description: found < at ? `Your cube is ${at - found === 1 ? 'one turn' : `${at - found} turns`} back. We carry on from there.` : `Your cube is ${found - at === 1 ? 'one turn' : `${found - at} turns`} ahead. We carry on from there.`, tone: 'green', icon: 'check' })
      } else {
        setFastestError(false)
        setFastestTry((n) => n + 1)
        s.startWalk(entered, s.walkMode, { priorTurns: s.priorTurns + (old ? faceTurns(old, at) : 0) })
      }
    }
    window.scrollTo({ top: 0 })
  }
  const startWalk = (mode: WalkMode, from: CubeState, priorTurns = 0) => {
    setCompare(false)
    setPlaying(false)
    setFastestError(false)
    setFastestTry((n) => n + 1)
    setPendingMode(null)
    store().startWalk(from, mode, { priorTurns })
    window.scrollTo({ top: 0 })
  }
  /**
   * The other way of solving, from the cube as it is now. Only ever from a step boundary: in
   * the middle of a step the switch waits (see `pendingMode`) until the step is finished or
   * rewound, because a solution planned from a half-done step undoes finished layers.
   */
  const switchMode = (mode: WalkMode) => {
    if (!walk) {
      // Still searching, or the search failed: the cube is where this plan started — a boundary.
      if (start && (mode !== walkMode || fastestError)) startWalk(mode, start, store().priorTurns)
      return
    }
    if (mode === walkMode) setPendingMode(null)
    else if (!isBoundary(walk, pos)) {
      setPlaying(false)
      setPendingMode(mode)
    } else if (walkState) startWalk(mode, walkState, store().priorTurns + faceTurns(walk, globalIndex(walk, pos)))
  }
  useEffect(() => {
    if (!pendingMode || phase !== 'walk' || !walk || animating || !isBoundary(walk, pos)) return
    // Nothing left to plan once the cube is solved.
    if (isFinished(walk, pos)) setPendingMode(null)
    else switchMode(pendingMode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingMode, phase, walk, pos, animating])
  const reenter = () => {
    if (!walk || !walkState) return
    setCompare(false)
    setPlaying(false)
    setPendingMode(null)
    store().reenter(toColors(walkState))
    window.scrollTo({ top: 0 })
  }
  const pause = () => {
    setCompare(false)
    setPlaying(false)
    setPendingMode(null)
    store().pauseWalk()
    window.scrollTo({ top: 0 })
  }

  // ── keyboard ──
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [role="dialog"], [contenteditable]')) return
      const s = store()
      if (s.phase === 'entry') {
        const mod = event.ctrlKey || event.metaKey
        if (mod && event.key.toLowerCase() === 'z') {
          event.preventDefault()
          if (event.shiftKey) s.redo()
          else s.undo()
        } else if (mod && event.key.toLowerCase() === 'y') {
          event.preventDefault()
          s.redo()
        } else if (!mod && /^[1-6]$/.test(event.key)) {
          event.preventDefault()
          s.setBrush(PALETTE[Number(event.key) - 1])
        }
        return
      }
      if (s.phase !== 'walk' || event.ctrlKey || event.metaKey) return
      const onControl = target?.closest('button, a, [role="radio"], [data-cube3d]')
      if (event.key === ' ' || event.key === 'Enter') {
        if (onControl && !target?.closest('[data-cube3d]')) return // the focused button handles it
        event.preventDefault()
        if (event.repeat) return // one press, one turn: a held key must not run through the solve
        setPlaying(false)
        advance()
      } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        if (target?.closest('[role="radio"], [data-cube3d]')) return
        event.preventDefault()
        if (event.repeat) return
        setPlaying(false)
        if (event.key === 'ArrowRight') advance()
        else retreat()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [advance, retreat, store])

  // ── what the cube shows ──
  const guided = !picking && phase === 'entry' && entryMode === 'guided'
  const view = GUIDED_FACES[guidedIndex]

  // Guided entry turns the 3D cube to the face being asked for; leaving it eases back home.
  const posed = useRef(false)
  useEffect(() => {
    const handle = cube.current
    if (!handle) return
    if (guided) {
      posed.current = true
      void handle.setPose({ ...view.pose, zoom: 1 }, { duration: 0.6 })
    } else if (posed.current) {
      posed.current = false
      void handle.resetView()
    }
  }, [guided, view])

  // "Where am I?" opened from inside a solution is about the cube as it is now. In the middle of
  // a step the stages are read at the start of that step: half-way through an algorithm the
  // layers below are out of place for a moment, which is not "undone".
  const midStep = walk ? movesToBoundary(walk, pos) > 0 : false
  const whereState = phase !== 'where' ? null : paused && walk ? (midStep && walkMode === 'beginner' ? stateAt(walk, { step: pos.step, move: 0 }) : walkState) : start
  const analysis = useMemo(() => (whereState ? analyzeCube(whereState) : null), [whereState])

  const highlight = useMemo<CubeHighlight | null>(() => {
    if (picture) return picture.lit ? { pieces: picture.lit, dimOthers: true, outline: false, dimTo: 'grey' } : null
    if (phase === 'entry') {
      if (guided) return { facelets: faceFacelets(view.face), outline: false }
      return issueFacelets && issueFacelets.length > 0 ? { facelets: issueFacelets } : null
    }
    if (phase === 'where' && analysis && !analysis.solved && analysis.completed.length > 0 && !(paused && midStep)) {
      const pieces = analysis.stageList.flatMap((progress) => (progress.complete || progress.stage === analysis.current ? progress.donePieces : []))
      return pieces.length > 0 ? { pieces, outline: false } : null
    }
    // In the solution the whole cube stays bright — he is comparing it with the one in his hands.
    if (phase === 'walk' && step && !compare && !milestone && step.pieces.length > 0) return { pieces: step.pieces, dimOthers: false }
    return null
  }, [picture, phase, guided, view, issueFacelets, analysis, step, compare, milestone, paused, midStep])

  // A piece round the back is no help if he cannot see it: bring out the mirrors.
  const hidden = useMemo(() => {
    if (phase !== 'walk' || !step || step.kind === 'hold' || !walkState || milestone) return false
    try {
      return step.pieces.some((piece) => findPiece(walkState, piece).stickers.every((sticker) => 'BLD'.includes(sticker.face)))
    } catch {
      return false
    }
  }, [phase, step, walkState, milestone])

  const cubeInput = picture ? picture.state : phase === 'intro' ? SOLVED : phase === 'entry' ? painted : phase === 'walk' || paused ? (walkState ?? SOLVED) : (start ?? SOLVED)
  const mirrors = picking ? false : phase === 'walk' ? compare || mirrorsOn || hidden : phase === 'where' ? mirrorsOn : false
  const flow: FlowStep = phase === 'intro' ? 0 : phase === 'entry' ? (complete ? 1 : 0) : phase === 'where' ? 2 : 3
  const solvedNow = phase === 'walk' && walkState ? isSolved(walkState) : false
  const hideCubeOnPhone = !picking && phase === 'entry' && surface === 'flat'

  return (
    <Page>
      <Reveal as="header" className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 md:mb-6">
        <div className="min-w-0">
          <h1 className={cx('whitespace-nowrap text-ink', phase === 'walk' && !picking ? 'text-2xl md:text-3xl' : 'text-3xl md:text-4xl')}>Solve my cube</h1>
          {picking && <p className="mt-2 max-w-xl text-lg text-ink-muted">Lost on your own cube? Find your place in about 20 seconds.</p>}
          {!picking && phase === 'intro' && <p className="mt-2 max-w-xl text-lg text-ink-muted">Stuck with a scrambled cube? Show it to me and we’ll solve it together, one turn at a time.</p>}
        </div>
        {phase !== 'intro' && !picking && <FlowSteps current={flow} />}
      </Reveal>

      <Reveal className={cx('grid items-start gap-4 md:gap-5', phase === 'entry' ? 'md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]' : 'md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]')}>
        {/* Left on a tablet: the cube and what goes with it. On a phone its parts join the page flow. */}
        <div className="min-w-0 max-md:contents md:sticky md:top-6 md:flex md:flex-col md:gap-4">
          {/* The cube: the one thing that never leaves. */}
          <div
            ref={stage}
            className={cx(
              'flex min-w-0 flex-col gap-2 max-md:order-1',
              phase === 'walk' && 'max-md:sticky max-md:top-(--topbar-h) max-md:z-20 max-md:-mx-4 max-md:-mt-1 max-md:bg-bg max-md:px-4 max-md:pt-1 max-md:pb-2 sm:max-md:-mx-6 sm:max-md:px-6',
              hideCubeOnPhone && 'max-md:hidden',
            )}
          >
            <CubeStage
              label="Your cube"
              fit="square"
              className={cx(
                'w-full',
                phase === 'walk' ? '[--stage-max-h:34dvh] md:[--stage-max-h:calc(100dvh-26.5rem)] [@media(max-height:520px)]:[--stage-max-h:30dvh]' : phase === 'entry' ? '[--stage-max-h:46dvh] md:[--stage-max-h:calc(100dvh-16rem)]' : 'md:[--stage-max-h:calc(100dvh-16rem)]',
                '[--stage-min-h:12rem]',
              )}
              controls={
                <StageControls
                  view={phase === 'intro' ? undefined : cube}
                  mirrors={mirrors}
                  onMirrorsChange={phase === 'where' || phase === 'walk' ? () => store().setMirrors(!mirrorsOn) : undefined}
                  mirrorsDisabled={phase === 'walk' && (compare || hidden)}
                  status={
                    picking ? (
                      <HoldLine top="yellow" front="green" className="text-xs!" />
                    ) : solvedNow ? (
                      <motion.span key="solved" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={springs.bouncy}>
                        <Badge tone="green" icon="check">
                          Solved
                        </Badge>
                      </motion.span>
                    ) : phase === 'entry' ? (
                      guided ? (
                        <p className="flex min-w-0 items-center gap-2 text-sm leading-tight font-bold text-ink" data-testid="painting-face" data-face={view.face}>
                          {painted[centreOf(view.face)] && <CubeSwatch color={painted[centreOf(view.face)]!} size="sm" showLetter />}
                          <span className="min-w-0">Painting the {view.name.toLowerCase()} face — the bright one</span>
                        </p>
                      ) : (
                        <p className="text-xs font-semibold text-ink-muted">Tap a sticker to paint it</p>
                      )
                    ) : phase === 'intro' ? (
                      <HoldLine top="white" front="green" className="text-xs!" />
                    ) : phase === 'walk' && walkState && !finished && step?.kind !== 'hold' ? (
                      <HoldLine top={toColors(walkState)[4]} front={toColors(walkState)[22]} className="text-xs!" />
                    ) : undefined
                  }
                />
              }
            >
              <Cube3D
                ref={cube}
                state={cubeInput}
                mode={phase === 'entry' && !picking ? 'interactive' : 'view'}
                keyboard={false}
                zoom={false}
                onStickerClick={
                  picking
                    ? undefined
                    : phase === 'entry'
                    ? (facelet) => store().paintSticker(facelet)
                    : phase === 'walk' && !compare && !finished
                      ? () => {
                          setPlaying(false)
                          advance()
                        }
                      : undefined
                }
                onAnimatingChange={setAnimating}
                speed={playing ? Math.max(0.6, speed) : 1}
                highlight={highlight}
                arrow={!picking && phase === 'walk' && !animating && !compare ? upcoming : null}
                mirrors={mirrors}
                debugId="solve"
                label={phase === 'entry' ? 'Your cube in 3D. Tap a sticker to paint it with the chosen colour.' : phase === 'walk' ? 'The cube. Tap it for the next turn.' : 'The cube'}
              />
            </CubeStage>
            {/* The move to make now, huge, right under the cube. */}
            {!picking && phase === 'walk' && walk && step && upcoming && !compare && <BigMove move={upcoming} index={pos.move} total={step.moves.length} hold={step.kind === 'hold'} />}
          </div>

          {!picking && phase === 'walk' && walk && <WalkDock walk={walk} pos={pos} compare={compare} onNext={manual(advance)} onBack={manual(retreat)} onCompare={setCompare} />}
          {phase === 'walk' && walk && !compare && !finished && <p className="text-center text-xs font-semibold text-ink-faint max-md:hidden">Space or → next turn · ← back · or tap the cube</p>}
          {!picking && guided && <GuidedInstruction painted={painted} className="max-md:hidden" />}
        </div>

        {/* The panel for the current step. */}
        <div className="min-w-0 max-md:order-3">
          <AnimatePresence mode="wait" initial={false}>
            {picking && (
              <motion.div key="pick" {...panelMotion}>
                <Card variant="raised" padding="md" data-testid="where-chooser">
                  <Chooser key={`${location.key}:${arrival}`} onGo={openLesson} onExact={exact} onPreview={setPreview} />
                </Card>
              </motion.div>
            )}
            {!picking && phase === 'intro' && (
              <motion.div key="intro" {...panelMotion}>
                <IntroPanel />
              </motion.div>
            )}
            {!picking && phase === 'entry' && (
              <motion.div key="entry" {...panelMotion}>
                <EntryPanel painted={painted} check={check} openIssue={issue?.id ?? null} onOpenIssue={setOpenIssue} highlight={issueFacelets} onContinue={toWhere} reentryOffset={reentryOffset} pending={checked !== painted && blankCount(painted) === 0} />
              </motion.div>
            )}
            {!picking && phase === 'where' && start && (
              <motion.div key="where" {...panelMotion}>
                <WherePanel
                  state={whereState ?? start}
                  onSolve={() => startWalk('beginner', start)}
                  onFastest={() => startWalk('fastest', start)}
                  resume={paused && walk ? { turn: globalIndex(walk, pos), total: walk.total, toStepEnd: movesToBoundary(walk, pos), mode: walkMode, onResume: () => store().resumeWalk() } : undefined}
                />
              </motion.div>
            )}
            {!picking && phase === 'walk' && (
              <motion.div key="walk" {...panelMotion}>
                <WalkPanel
                  walk={walk}
                  pos={pos}
                  mode={walkMode}
                  fastestError={fastestError}
                  pendingMode={pendingMode}
                  playing={playing}
                  compare={compare}
                  onBack={manual(retreat)}
                  onStepStart={manual(() => walk && store().setPos(stepStart(walk, pos)))}
                  onTogglePlay={togglePlay}
                  onCompare={(open) => {
                    setPlaying(false)
                    setCompare(open)
                    window.scrollTo({ top: 0 })
                  }}
                  onReenter={reenter}
                  onSwitchMode={switchMode}
                />
                <div className="mt-4 flex justify-center">
                  <Button variant="ghost" size="sm" iconLeft="target" onClick={pause} data-testid="walk-exit">
                    Where am I?
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </Reveal>
    </Page>
  )
}

function IntroPanel() {
  const begin = useSolve((s) => s.begin)
  const steps: { title: string; text: string }[] = [
    { title: 'Hold it one way and keep it', text: 'For copying the colours, hold it white on top and green in front; we’ll roll it to yellow-up to solve. The centres are the middle stickers — they never move, so they tell us which way up the cube is.' },
    { title: 'Copy the colours', text: 'Paint each sticker here to match your cube. I check it as you go and help you find any slips.' },
    { title: 'Follow along', text: 'I show one turn at a time on the big cube. You make the same turn on yours.' },
  ]
  return (
    <div className="flex flex-col gap-4" data-testid="intro-panel">
      <Card variant="raised" padding="md" className="flex flex-col gap-4">
        <h2 className="text-xl text-ink">Grab your cube</h2>
        <ol className="flex flex-col gap-3.5">
          {steps.map((item, i) => (
            <li key={item.title} className="flex items-start gap-3">
              <span className="num mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-inset font-display text-sm font-extrabold text-ink">{i + 1}</span>
              <div>
                <p className="text-base font-bold text-ink">{item.title}</p>
                <p className="text-base text-ink-muted">{item.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <Button variant="primary" size="lg" iconRight="arrowRight" fullWidth onClick={() => begin('solve')} data-testid="begin-solve">
          Solve it with me
        </Button>
      </Card>
      <Card variant="raised" padding="md" className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[11px] bg-cube-yellow-soft text-cube-yellow-text">
          <Icon name="target" size={22} />
        </span>
        <div className="flex min-w-0 grow flex-col items-start gap-2.5">
          <div>
            <p className="text-base font-bold text-ink">Just want to know where you are?</p>
            <p className="text-sm text-ink-muted">Show me the cube and I’ll tell you which stage you’re on and what to do next.</p>
          </div>
          <Button variant="secondary" size="sm" iconRight="arrowRight" onClick={() => begin('where')} data-testid="begin-where">
            Where am I?
          </Button>
        </div>
      </Card>
    </div>
  )
}
