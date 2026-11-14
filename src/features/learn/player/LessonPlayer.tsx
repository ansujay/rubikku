/**
 * The lesson player: one persistent cube on the stage, a "now" strip pinned under it, a compact
 * text panel beside it (below it on a phone, with the stage staying in view), and a beat-by-beat
 * walk through the lesson data.
 *
 * It owns the cube controller for the whole lesson. Moving between beats sets the same cube up
 * again rather than mounting a new one, so the WebGL context persists — but the camera goes back
 * to the standard view on every new beat, so "top" and "right" always mean what the text says.
 *
 * Guided exercises are judged two ways (see `GuidedBeat`): explicit moves are followed move by
 * move; solver plays are judged by result through the shared step follower, so any sound move
 * is accepted and the plan re-made from wherever he is.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { reward } from '../../../app/rewards'
import { analyzeCube, findPiece, isRotation, type CubeState, type Move } from '../../../cube'
import { Cube3D, DEFAULT_POSE, StageControls, useCubeController, type CubeHighlight, type CubeSession } from '../../../three'
import { Badge, Button, Card, celebration, CubeStage, cx, Icon, Modal, Page, sound, springs, useMotionPref } from '../../../ui'
import { beatIndex, getLesson, lessonStage, nextOnPath, PRIMER_ID, RECOVERY_RULES, type Beat, type Lesson } from '../content'
import { afterStageState, drillState, drillTags, excursion, excursionWords, followPath, HELD, neutralSegments, outcomeReached, playOfSteps, resolvePlay, resolveScene, segmentAt, stageDone, stepsUntil, type ResolvedPlay } from '../engine'
import { lessonTodo } from '../completion'
import { emptyDrill, emptyQuiz, hardToGo, isMastered, useLearn, type LessonSave } from '../learnStore'
import { HARD_CASES } from '../drillCases'
import { stopLabel } from '../path'
import { quizQuestion } from '../quiz'
import { useLearnPath } from '../usePath'
import { NowStrip, QuizPanel, RealActions, RealChecks, RealPanel, type NowState } from './beats'
import { TwistMeter } from './bits'
import { resolveHighlight } from './highlight'
import { useCoach } from './coach'
import { Chooser } from '../Chooser'
import { BeatBody, DemoDock, DemoPanel, DrillPanel, GoalPanel, GuidedPanel, InfoPanel, type GuidedStatus, type RepScaffold } from './panels'
import { SectionStepper } from './SectionStepper'
import { TopView, TopViewLegend } from './TopView'
import { TroubleList, WrapPanel } from './WrapPanel'
import { yellowShapeExamples } from './examples'

const GOAL_SPEED = 2
const DEMO_SPEEDS = [0.5, 1, 2] as const
const BELOW_POSE = { ...DEFAULT_POSE, elevation: -0.5 }

interface Where {
  drillN: number
  quizN: number
}

function whereIn(save: LessonSave | undefined, beat: Beat): Where {
  return { drillN: save?.drill.n ?? 0, quizN: beat.kind === 'quiz' ? (save?.quiz[beat.id]?.n ?? 0) : 0 }
}

function beatStart(lesson: Lesson, beat: Beat, where: Where): CubeState {
  switch (beat.kind) {
    case 'info':
      return resolveScene(beat.scene)
    case 'goal':
    case 'demo':
    case 'guided':
      return resolvePlay(beat.play).start
    case 'drill':
      return drillState(beat.stage, where.drillN)
    case 'quiz':
      return quizQuestion(beat.quiz, where.quizN).state
    case 'real':
      return beat.picture ? afterStageState(beat.picture) : HELD
    case 'wrap': {
      const stage = lessonStage(lesson)
      return stage ? afterStageState(stage) : HELD
    }
  }
}

const sessionKeyFor = (beat: Beat, where: Where) => (beat.kind === 'drill' ? `${beat.id}#${where.drillN}` : beat.kind === 'quiz' ? `${beat.id}#${where.quizN}` : beat.id)

/** How much help each round of a "five in a row" gives. */
function repScaffold(round: number): RepScaffold {
  return round <= 0 ? 'full' : round === 1 ? 'chips' : round === 2 ? 'first' : 'none'
}

export function LessonPlayer({ lesson }: { lesson: Lesson }) {
  const { reduced } = useMotionPref()
  const path = useLearnPath()
  const stop = path.stops.find((s) => s.id === lesson.id)!
  const save = useLearn((s) => s.lessons[lesson.id])
  const drill = save?.drill ?? emptyDrill()
  const stage = lessonStage(lesson)
  // White corners: the trigger is the main line; the shortcuts only once he has opened them.
  const shortcuts = useLearn((s) => Boolean(s.lessons['white-corners']?.done['faster']))

  const [index, setIndex] = useState(() => beatIndex(lesson, useLearn.getState().lessons[lesson.id]?.beatId))
  const [direction, setDirection] = useState(1)
  const beat = lesson.beats[index]
  const last = index === lesson.beats.length - 1
  const quizSave = beat.kind === 'quiz' ? (save?.quiz[beat.id] ?? emptyQuiz()) : null
  const question = beat.kind === 'quiz' ? quizQuestion(beat.quiz, quizSave!.n) : null

  // ── the cube ──

  const keyRef = useRef(sessionKeyFor(beat, whereIn(save, beat)))
  // The cube the current beat started from. Saved beside the session: a long history is trimmed
  // from the front, so `session.start` cannot be used to tell which cube a save belongs to.
  const originRef = useRef<CubeState | null>(null)
  const restored = useRef(false)
  const cube = useCubeController({
    initial: (): CubeSession | CubeState => {
      const saved = useLearn.getState().lessons[lesson.id]
      const start = beatStart(lesson, beat, whereIn(saved, beat))
      originRef.current = start
      if (saved?.session && saved.sessionKey === keyRef.current && saved.sessionStart === start) {
        restored.current = true
        return saved.session
      }
      return start
    },
    onChange: (session) => useLearn.getState().saveSession(lesson.id, keyRef.current, session, originRef.current ?? session.start),
  })
  const { state, history, player, busy } = cube

  const stageBox = useRef<HTMLDivElement>(null)
  const cubeBox = useRef<HTMLDivElement>(null)
  const timers = useRef<number[]>([])
  const wasBelow = useRef(false)
  const [mirrors, setMirrors] = useState(false)
  const [hintAt, setHintAt] = useState<string | null>(null)
  const [stuckOpen, setStuckOpen] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const navigate = useNavigate()
  const [watched, setWatched] = useState(false)
  const [between, setBetween] = useState<string | null>(null)

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms))
  }
  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
  }

  const play = useMemo(() => (beat.kind === 'goal' || beat.kind === 'demo' || beat.kind === 'guided' ? resolvePlay(beat.play) : null), [beat])
  /** A guided exercise from the solver is judged by result; explicit moves by the path. */
  const judgedByResult = beat.kind === 'guided' && play !== null && play.steps.length > 0
  const triggerOnly = (lesson.id === 'white-corners' && !shortcuts) || (beat.kind === 'guided' && Boolean(beat.play.trigger))
  const coached = beat.kind === 'drill' || judgedByResult
  const coach = useCoach(cube, { enabled: coached, levels: true, whiteCorners: triggerOnly ? 'trigger' : undefined })

  /** Put the cube into the starting position of a beat. */
  const enter = (next: Beat, where: Where, options: { arrive?: boolean; autoplay?: boolean } = {}) => {
    const { arrive = true, autoplay = true } = options
    clearTimers()
    coach.clear()
    setHintAt(null)
    setWatched(false)
    setBetween(null)
    keyRef.current = sessionKeyFor(next, where)
    const start = beatStart(lesson, next, where)
    originRef.current = start
    const changed = start !== cube.controller.state
    if (next.kind === 'goal' || next.kind === 'demo') {
      cube.load(resolvePlay(next.play).moves, { from: start, speed: next.kind === 'goal' ? GOAL_SPEED : 1 })
    } else {
      cube.reset(start)
    }
    // A new cube arrives with a short settle rather than popping in.
    if (arrive && changed && !reduced) {
      cubeBox.current?.animate(
        [
          { opacity: 0.15, transform: 'scale(0.9)' },
          { opacity: 1, transform: 'scale(1)' },
        ],
        { duration: 340, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      )
    }
    // Every beat starts from the standard view (or from below, when it asks for that): a view
    // he swung round on an earlier beat must not make "top" and "right" lie on this one.
    const below = Boolean(next.view?.below)
    if (below) void cube.view.current?.setPose(BELOW_POSE, { duration: 0.6 })
    else void cube.view.current?.resetView()
    wasBelow.current = below
    if (!autoplay || reduced) return
    // The goal plays by itself, slowly, once he has had a moment to read. Info animations wait
    // for "Watch": they used to finish before he had read the first line.
    if (next.kind === 'goal') later(() => cube.controller.play(), 1500)
  }

  const goTo = (target: number) => {
    const clamped = Math.max(0, Math.min(lesson.beats.length - 1, target))
    if (clamped === index) return
    if (stage && stop.status === 'locked') reward('lesson-started', { stageId: stage })
    setDirection(clamped > index ? 1 : -1)
    setIndex(clamped)
    const next = lesson.beats[clamped]
    useLearn.getState().setBeat(lesson.id, next.id, clamped)
    // Opening the optional shortcuts of stage 3 switches its hints to them from then on.
    if (lesson.id === 'white-corners' && next.section === 'faster') useLearn.getState().markDone(lesson.id, 'faster')
    enter(next, whereIn(useLearn.getState().lessons[lesson.id], next))
    // QA X3: Back/Next leave with the old panel, so focus would fall to the page. Put it on the new
    // beat's title instead: Tab then goes on into this beat, and a screen reader reads where he is.
    const hadFocus = document.activeElement instanceof HTMLElement && Boolean(document.activeElement.closest('[data-testid="lesson-panel"]'))
    if (hadFocus) later(() => {
      const lost = !document.activeElement || document.activeElement === document.body || !document.activeElement.isConnected
      if (lost) document.querySelector<HTMLElement>('[data-testid="lesson-panel"] [data-testid="beat-title"]')?.focus({ preventScroll: true })
    }, reduced ? 120 : 320)
    // Stacked layout (phone, portrait): bring the stage up under the top bar so the cube and the
    // new text share the screen. Side by side: just make sure the top of the panel is in view.
    const box = stageBox.current
    const stacked = box !== null && box.offsetWidth > window.innerWidth * 0.8
    const top = stacked && box.parentElement ? Math.max(0, box.parentElement.getBoundingClientRect().top + window.scrollY - (window.innerWidth < 768 ? 56 : 0)) : 0
    if (Math.abs(window.scrollY - top) > 4) window.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' })
  }

  // First arrival: note where he is, and set the cube up unless it was restored exactly.
  useEffect(() => {
    const learn = useLearn.getState()
    learn.open(lesson.id)
    learn.setBeat(lesson.id, beat.id, index)
    if (stage && stop.status !== 'locked') reward('lesson-started', { stageId: stage })
    const needsPlayer = beat.kind === 'goal' || beat.kind === 'demo'
    if (!restored.current || (needsPlayer && !cube.controller.getSnapshot().player)) enter(beat, whereIn(learn.lessons[lesson.id], beat), { arrive: false })
    else if (beat.view?.below) {
      wasBelow.current = true
      later(() => void cube.view.current?.setPose(BELOW_POSE, { instant: true }), 60)
    }
    return clearTimers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── what this beat is doing ──

  const start = useMemo(() => beatStart(lesson, beat, whereIn(save, beat)), [lesson, beat, save])
  // What the panel and the twist meter describe: never a cube that is half-way through an algorithm.
  const analysis = useMemo(() => analyzeCube(coach.view), [coach.view])
  const follower = coach.follower

  // Explicit moves: followed move by move ("five in a row" too).
  const pathPlay = beat.kind === 'guided' && play && !judgedByResult ? play : null
  const progress = useMemo(() => (pathPlay ? followPath(pathPlay.start, pathPlay.moves, history) : null), [pathPlay, history])
  const reps = beat.kind === 'guided' ? (beat.reps ?? 0) : 0
  const repsDone = beat.kind === 'guided' ? (save?.reps[beat.id] ?? 0) : 0
  const scaffoldNow: RepScaffold = beat.kind !== 'guided' ? 'full' : reps > 0 ? repScaffold(repsDone) : beat.scaffold === 'full' ? 'full' : beat.scaffold === 'name' ? 'names' : 'none'

  // Solver plays: what is still ahead of him, re-planned from wherever he is.
  const ahead = useMemo(() => {
    if (!judgedByResult || beat.kind !== 'guided' || !play || !follower.step) return null
    const end = follower.states[follower.states.length - 1]
    const rest = stepsUntil(play.start, end, beat.outcome, triggerOnly)
    const plan = playOfSteps([follower.step, ...rest], follower.moves)
    // Names only: the names must not make his decisions for him.
    return beat.scaffold === 'name' ? { ...plan, segments: neutralSegments(plan.segments) } : plan
  }, [judgedByResult, beat, play, follower.step, follower.states, follower.moves, triggerOnly])

  // Off the plan: is it one of the stage's algorithms, started from the wrong side or hold (or his own good way)?
  const choice = useMemo(() => {
    if (!judgedByResult || !stage || follower.trail.length === 0) return null
    const ex = excursion(stage, follower.state, history, follower.trail.length)
    if (!ex) return null
    const undo = follower.trail.length > 1 ? `Undo the last ${follower.trail.length} moves` : `Undo \`${follower.trail[0]}\``
    return { good: ex.good, words: excursionWords(stage, ex, undo) }
  }, [judgedByResult, stage, follower.state, follower.trail, history])

  const roundComplete =
    beat.kind === 'guided' &&
    !busy &&
    history.length > 0 &&
    (progress
      ? progress.complete
      : play !== null && outcomeReached(beat.outcome, play.start, state) && follower.trail.length === 0 && !follower.half && (follower.position === 0 || follower.status === 'solved'))
  const guidedComplete = roundComplete && (reps === 0 || repsDone >= reps)
  const guidedDone = beat.kind === 'guided' && (guidedComplete || Boolean(save?.done[beat.id]))

  const hardHere = useMemo(() => (beat.kind === 'drill' ? drillTags(beat.stage, drillState(beat.stage, drill.n)).map((id) => HARD_CASES[beat.stage].find((h) => h.id === id)!.label) : []), [beat, drill.n])

  const drillSolvedNow = beat.kind === 'drill' && !busy && history.length > 0 && stageDone(state, beat.stage)

  // Finished a guided exercise (or one round of five): tick, sound, remember.
  const celebrated = useRef<string | null>(null)
  useEffect(() => {
    if (!roundComplete || beat.kind !== 'guided') return
    const key = `${beat.id}#${repsDone}`
    if (celebrated.current === key) return
    celebrated.current = key
    if (reps > 0 && repsDone < reps) {
      useLearn.getState().repDone(lesson.id, beat.id)
      if (repsDone + 1 < reps) {
        // One more round: a moment to see it worked, then the same cube again, with less help.
        sound.play('success')
        setBetween(`Round ${repsDone + 1} of ${reps} done. Again — with less help.`)
        later(() => enter(beat, whereIn(useLearn.getState().lessons[lesson.id], beat), { arrive: true, autoplay: false }), reduced ? 500 : 1300)
        return
      }
    }
    useLearn.getState().markDone(lesson.id, beat.id)
    sound.play('success')
    // The exercise is done: the cube hops (the success sound is the ding; no second one).
    void cube.view.current?.celebrate('tick')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundComplete, beat.id, lesson.id])

  // Each right move of a guided exercise: a tick (a ding, and a pop on the move just made). The
  // last move is the exercise's own success above, so it does not tick as well.
  const pathAt = useRef(0)
  useEffect(() => {
    const at = progress?.position ?? 0
    if (progress && at > pathAt.current && progress.off === 0 && !progress.complete) {
      const done = document.querySelectorAll('[data-testid="moves"] [data-state="done"]')
      celebration.tick(done.length > 0 ? done[done.length - 1] : null)
    }
    pathAt.current = at
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress?.position])
  useEffect(() => {
    if (!roundComplete && history.length === 0) celebrated.current = null
  }, [roundComplete, history.length])

  // A slip: a soft blip (the strip explains).
  const offNow = progress ? progress.off : judgedByResult && !choice?.good ? follower.trail.length : 0
  const offBefore = useRef(0)
  useEffect(() => {
    if (offNow > 0 && offBefore.current === 0) sound.play('error')
    offBefore.current = offNow
  }, [offNow])

  // Solved a drill.
  useEffect(() => {
    if (!drillSolvedNow || beat.kind !== 'drill' || drill.solved) return
    const learn = useLearn.getState()
    const wasMastered = isMastered(learn.lessons[lesson.id], beat.stage)
    learn.drillSolved(lesson.id, history.length, drillTags(beat.stage, drillState(beat.stage, drill.n)))
    sound.play('success')
    reward('drill-completed', { stageId: beat.stage }, { mode: 'quiet' })
    // Practice pays: a cube solved without being shown the moves earns a bonus on top.
    if (!drill.hinted) reward('custom', { xp: 10, label: `Clean solve: ${lesson.title}` }, { mode: 'quiet' })
    if (!wasMastered && isMastered(useLearn.getState().lessons[lesson.id], beat.stage)) {
      reward('custom', { xp: 40, label: `Mastered: ${lesson.title}` }, { moment: { eyebrow: 'Mastered', title: lesson.title, subtitle: 'Three clean solves in practice — the hard cases too.', icon: 'star' } })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drillSolvedNow])

  // A hint that shows the moves costs the clean star (the first two levels are free).
  useEffect(() => {
    if (beat.kind === 'drill' && coach.showing && coach.level === 3 && !coach.done && !drill.hinted && !drill.solved) useLearn.getState().drillHint(lesson.id)
  }, [beat.kind, coach.showing, coach.level, coach.done, drill.hinted, drill.solved, lesson.id])

  // The wrap-up completes the lesson (once) — but only a lesson that has been earned: its
  // exercises and rounds done, the stage practised, and not while peeking ahead at a locked stage.
  const todo = useMemo(() => lessonTodo(lesson, save), [lesson, save])
  const locked = stop.status === 'locked'
  const alreadyComplete = Boolean(save?.completed) || stop.status === 'complete'
  useEffect(() => {
    if (beat.kind !== 'wrap' || save?.completed || !todo.earned || locked) return
    useLearn.getState().complete(lesson.id)
    const finale = stage === 'yellow-corners-orient'
    if (stage) {
      reward(
        'lesson-completed',
        { stageId: stage },
        finale
          ? { milestone: { eyebrow: 'All eight stages', title: 'You know the whole method', subtitle: 'Now the full solve — and then your own cube, start to finish.', headline: true, action: { label: 'Full solve', to: '/learn/full-solve' } } }
          : { moment: { eyebrow: 'Stage learned', title: lesson.title, subtitle: `Stage ${lesson.number} of 8` } },
      )
    } else reward('primer-completed', {}, { moment: { eyebrow: 'Basics learned', title: 'You speak cube', icon: 'cube' } })
    // No confetti of our own: a milestone brings it, a moment is a card and the cube's spin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat.kind, todo.earned, locked])

  // ── what the cube shows ──

  const position = player ? player.position : progress ? progress.position : 0
  const current = judgedByResult ? (guidedComplete ? null : follower.step) : undefined
  const baseHighlight = useMemo(() => resolveHighlight(beat.view?.highlight, start, play, position, current), [beat, start, play, position, current])
  const finished = (player !== null && player.position === player.total && !busy) || guidedComplete || (beat.kind === 'drill' && drill.solved)
  const fromStep = typeof beat.view?.highlight === 'string' || (typeof beat.view?.highlight === 'object' && Boolean(beat.view.highlight.step))
  let highlight: CubeHighlight | null = coach.highlight ?? (finished && fromStep ? null : baseHighlight)
  if (question) {
    const light = quizSave!.answer !== null ? question.reveal : question.ask
    highlight = (light.pieces?.length ?? 0) + (light.slots?.length ?? 0) > 0 ? { pieces: light.pieces, slots: light.slots, dimOthers: true } : null
  }

  const hiddenPiece = useMemo(() => {
    const pieces = highlight?.pieces
    if (!pieces || pieces.length === 0 || pieces.length > 2) return false
    try {
      return pieces.some((piece) => findPiece(state, piece).stickers.every((s) => 'BLD'.includes(s.face)))
    } catch {
      return false
    }
  }, [highlight, state])
  const wantsMirrors = question ? question.mirrors : Boolean(beat.view?.mirrors)
  const showMirrors = !beat.view?.below && (mirrors || wantsMirrors || hiddenPiece || coach.hidden)

  const interactive = (beat.kind === 'info' && Boolean(beat.free)) || (beat.kind === 'guided' && !guidedComplete && between === null) || (beat.kind === 'drill' && !drill.solved)

  // ── guided: the status, the strip, the arrow ──

  let guidedStatus: GuidedStatus | null = null
  let now: NowState | null = null
  let arrow: Move | null = null
  const hintKey = judgedByResult ? `${follower.serial}:${follower.position}` : String(progress?.position ?? 0)

  if (beat.kind === 'guided' && play) {
    if (between) {
      guidedStatus = { kind: 'go', expected: play.moves[0], revealed: false }
      now = { kind: 'done', title: between }
    } else if (guidedComplete) {
      guidedStatus = { kind: 'done' }
      now = { kind: 'done', title: beat.success }
    } else if (progress && pathPlay) {
      const expected = pathPlay.moves[progress.position]
      const revealed = scaffoldNow === 'full' || hintAt === hintKey
      if (progress.off > 0) {
        guidedStatus = { kind: 'off', wrong: progress.wrong!, count: progress.off, expected }
        now = {
          kind: 'off',
          title: progress.off > 1 ? `Off the path by ${progress.off} moves.` : `That was \`${progress.wrong}\`, not the next move.`,
          sub: progress.off > 1 ? 'Undo them one at a time and you are back on track.' : revealed ? `No harm done. Undo it, then do \`${expected}\`.` : 'No harm done. Undo it and have another look.',
          back: null,
        }
      } else if (progress.complete) {
        // The last move is still landing.
        guidedStatus = { kind: 'go', expected: pathPlay.moves[pathPlay.moves.length - 1], revealed: false }
        now = { kind: 'name', title: 'Nearly…', sub: 'Let the last turn land.' }
      } else if (progress.half) {
        guidedStatus = { kind: 'half', expected }
        now = { kind: 'half', move: expected }
      } else {
        guidedStatus = { kind: 'go', expected, revealed }
        const segment = segmentAt(pathPlay, progress.position)
        const count = reps > 0 ? `Round ${Math.min(repsDone + 1, reps)} of ${reps}` : pathPlay.moves.length > 1 ? `Move ${progress.position + 1} of ${pathPlay.moves.length}` : undefined
        now = revealed
          ? { kind: 'move', move: expected, step: pathPlay.moves.length > 1 ? segment?.label : undefined, count }
          : { kind: 'name', title: segment?.label ?? 'Your move', sub: `${count ? `${count} · ` : ''}Make the next move yourself. Not sure? Tap Hint.` }
      }
      if (!busy && progress.off === 0 && !progress.complete && revealed) arrow = expected
    } else if (judgedByResult) {
      const f = follower
      const segment = ahead ? segmentAt({ ...play, ...ahead } as ResolvedPlay, Math.min(f.position, Math.max(0, ahead.moves.length - 1))) : null
      const stepName = segment?.label ?? (beat.scaffold === 'name' ? 'Your move' : f.step?.caseName) ?? 'Your move'
      if (f.status === 'off' && choice?.good) {
        // His own way (another edge first, the opposite pair from another side): say so, and let him finish it.
        guidedStatus = { kind: 'free' }
        now = { kind: 'name', title: choice.words.title, sub: choice.words.sub }
      } else if (f.status === 'off') {
        const wrong = f.trail[0]
        guidedStatus = { kind: 'off', wrong, count: f.trail.length, expected: f.next ?? wrong }
        now = choice
          ? // The right algorithm from the wrong side or hold: name the decision, not "you broke it".
            { kind: 'off', title: choice.words.title, sub: choice.words.sub, back: f.next }
          : {
              kind: 'off',
              title: f.trail.length > 1 ? `${f.trail.length} moves off the plan.` : `That was \`${wrong}\`. ${lesson.slip ?? 'It undid something you had finished.'}`,
              sub: f.trail.length > 1 ? 'Undo them one at a time — the arrow shows which way.' : `Turn it straight back with \`${f.next}\`, or tap Undo.`,
              back: f.next,
            }
        arrow = busy ? null : f.next
      } else if (beat.scaffold === 'none') {
        guidedStatus = { kind: 'free' }
        now =
          coach.showing && coach.nextMove && f.next
            ? { kind: 'move', move: coach.nextMove, step: coach.step?.caseName }
            : { kind: 'name', title: 'Over to you.', sub: 'Any way you like. It knows when you have done it. Stuck? Tap Hint.' }
        if (!busy) arrow = coach.nextMove
      } else if (f.next) {
        const revealed = beat.scaffold === 'full' || hintAt === hintKey
        guidedStatus = f.status === 'half' ? { kind: 'half', expected: f.next } : { kind: 'go', expected: f.next, revealed }
        now =
          f.status === 'half'
            ? { kind: 'half', move: f.next }
            : revealed
              ? { kind: 'move', move: f.next, step: stepName }
              : { kind: 'name', title: stepName, sub: 'Make the next move yourself. Not sure? Tap Hint.' }
        if (!busy && revealed) arrow = f.next
      } else {
        guidedStatus = { kind: 'go', expected: play.moves[0], revealed: false }
        now = { kind: 'name', title: 'Nearly…', sub: 'Let the last turn land.' }
      }
    }
  }
  if (!busy && arrow === null) {
    if (beat.kind === 'info') arrow = beat.view?.arrow ?? null
    else if (beat.kind === 'demo' && player && !player.playing) arrow = player.alg[player.position] ?? null
    else if (beat.kind === 'drill' && coach.nextMove) arrow = coach.nextMove
  }
  if (beat.kind === 'drill' && !drill.solved) {
    now =
      coach.showing && coach.status === 'off' && coach.wrong
        ? { kind: 'off', title: `That was \`${coach.wrong}\`, not the next move.`, sub: 'No harm done. Turn it straight back and the hint is still there.', back: coach.nextMove }
        : coach.showing && coach.nextMove && coach.status === 'half'
          ? { kind: 'half', move: coach.nextMove }
          : coach.showing && coach.nextMove
            ? { kind: 'move', move: coach.nextMove, step: coach.step?.caseName }
            : { kind: 'name', title: `Cube ${drill.n + 1}`, sub: analysis.twistInProgress ? 'Twisting corners. The bottom comes back at the end.' : analysis.stages[beat.stage].summary }
  }

  // ── actions ──

  const turnCube = (move: Move) => void cube.apply([move], { speed: 1.2 })
  const restartBeat = () => {
    if (beat.kind === 'guided' && reps > 0 && repsDone >= reps) useLearn.getState().repReset(lesson.id, beat.id)
    enter(beat, whereIn(useLearn.getState().lessons[lesson.id], beat), { autoplay: false })
  }
  const replayShow = () => {
    if (beat.kind !== 'info' || !beat.show) return
    const alg = beat.show.alg
    clearTimers()
    cube.reset(start)
    setWatched(true)
    later(() => void cube.apply(alg, { speed: 0.8 }), reduced ? 0 : 320)
  }
  const askHint = () => {
    if (beat.kind === 'drill' || (judgedByResult && beat.kind === 'guided' && beat.scaffold === 'none')) coach.ask()
    else setHintAt(hintKey)
  }
  const showMe = (moves: readonly Move[]) => {
    if (beat.kind === 'drill') useLearn.getState().drillShown(lesson.id, moves.filter((m) => !isRotation(m)).length)
    void cube.apply(moves, { speed: 0.8 })
  }
  const nextDrill = () => {
    if (beat.kind !== 'drill') return
    useLearn.getState().drillNext(lesson.id)
    enter(beat, whereIn(useLearn.getState().lessons[lesson.id], beat))
  }
  const answerQuiz = (id: string) => {
    if (beat.kind !== 'quiz' || !question || !quizSave || quizSave.answer !== null) return
    const right = id === question.answer
    const learn = useLearn.getState()
    learn.quizAnswer(lesson.id, beat.id, id, right)
    // A right answer is a tick (the quiz card plays it, on the button); a wrong one a soft blip.
    if (!right) sound.play('error')
    if (right && quizSave.right + 1 >= (beat.count ?? 5) && !save?.done[beat.id]) {
      learn.markDone(lesson.id, beat.id)
      reward('custom', { xp: 20, label: `${beat.title} — ${lesson.title}` }, { mode: 'quiet' })
    }
  }
  const nextQuestion = () => {
    if (beat.kind !== 'quiz') return
    useLearn.getState().quizNext(lesson.id, beat.id)
    enter(beat, whereIn(useLearn.getState().lessons[lesson.id], beat))
  }
  const confirmReal = () => {
    if (beat.kind !== 'real' || save?.real[beat.id]) return
    const learn = useLearn.getState()
    learn.realDone(lesson.id, beat.id)
    if (lesson.id === 'yellow-corners-orient') {
      // Stage 8 by hand is his first whole solve of his own cube: the biggest moment on the site
      // (and the capstone then counts it, so it is not celebrated twice).
      const first = learn.capstone.realSolves === 0
      learn.updateCapstone({ realSolves: learn.capstone.realSolves + 1 })
      reward(
        'real-cube-solved',
        {},
        first
          ? { milestone: { eyebrow: 'Your first real solve', title: 'You solved your real cube!', subtitle: 'Go and show someone — then scramble it and do it again.', icon: 'trophy', headline: true, action: { label: 'Keep going' } } }
          : { moment: { eyebrow: 'Another real solve', title: 'Solved it again!', subtitle: 'Every solve is a little faster. Try the timer.', icon: 'trophy' } },
      )
      return
    }
    // The moment plays its own sound. Doing it on his own cube pays more than reading the lesson.
    reward(
      'custom',
      { xp: 80, label: `${lesson.title} on my own cube` },
      { moment: { eyebrow: 'On your own cube', title: lesson.number > 0 ? `Stage ${lesson.number} by hand` : 'Your cube, your moves', subtitle: lesson.title, icon: 'cube' } },
    )
  }

  /** The picture chooser sends him to a stage's real-cube step or practice: here, or in another lesson. */
  const openFromChooser = (id: string, beatId: 'cube' | 'drill') => {
    setStuckOpen(false)
    setChoosing(false)
    if (id === lesson.id) {
      goTo(beatIndex(lesson, beatId))
      return
    }
    const target = getLesson(id)
    if (target) useLearn.getState().setBeat(id, beatId, beatIndex(target, beatId))
    navigate(`/learn/${id}`)
  }

  const ready =
    beat.kind === 'guided'
      ? guidedDone
      : beat.kind === 'drill'
        ? drill.total > 0
        : beat.kind === 'quiz'
          ? Boolean(save?.done[beat.id])
          : beat.kind === 'real'
            ? Boolean(save?.real[beat.id])
            : true

  // Arrow keys and Enter move between beats — unless the cube, a control or a dialog has the keys.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || stuckOpen) return
      const target = event.target as HTMLElement | null
      if (target?.closest('.stage, button, a, input, textarea, select, summary, [role="dialog"], [role="slider"], [role="radiogroup"]')) return
      if (event.key === 'ArrowLeft') goTo(index - 1)
      else if ((event.key === 'ArrowRight' || (event.key === 'Enter' && beat.kind !== 'quiz')) && ready && !last) goTo(index + 1)
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const nextId = nextOnPath(lesson.id)
  const section = lesson.sections.find((s) => s.id === beat.section)
  const modeBadge =
    beat.kind === 'quiz'
      ? { label: 'Which is it?', tone: 'accent' as const, icon: 'target' as const }
      : beat.kind === 'real'
        ? { label: 'Your cube', tone: 'accent' as const, icon: 'cube' as const }
        : beat.kind === 'guided' || beat.kind === 'drill' || (beat.kind === 'info' && beat.free)
          ? { label: beat.kind === 'drill' ? 'Practice' : 'Your turn', tone: 'accent' as const, icon: 'target' as const }
          : beat.kind === 'demo' || beat.kind === 'goal' || (beat.kind === 'info' && beat.show)
            ? { label: 'Watch', tone: 'neutral' as const, icon: 'eye' as const }
            : null
  const stageStatus = (
    <AnimatePresence mode="popLayout" initial={false}>
      {finished && beat.kind !== 'goal' && beat.kind !== 'demo' ? (
        <motion.span key="done" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={springs.bouncy}>
          <Badge tone="green" icon="check" data-testid="beat-done">
            Done
          </Badge>
        </motion.span>
      ) : beat.kind === 'real' ? (
        <motion.span key="picture" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={springs.gentle}>
          <Badge tone="neutral" icon="eye" data-testid="beat-mode">
            {beat.caption ?? 'Your cube should look like this'}
          </Badge>
        </motion.span>
      ) : modeBadge ? (
        <motion.span key={modeBadge.label} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={springs.gentle}>
          <Badge tone={modeBadge.tone} icon={modeBadge.icon} data-testid="beat-mode">
            {modeBadge.label}
          </Badge>
        </motion.span>
      ) : null}
    </AnimatePresence>
  )

  const showTop = Boolean(beat.view?.top) || Boolean(question?.top)
  const shapes = beat.view?.figure === 'yellow-shapes' ? yellowShapeExamples() : null
  const showNow = now !== null && (beat.kind === 'guided' || beat.kind === 'drill')
  // Under the cube, always in view: what to do now, and the controls of the beat (the playback
  // bar, Before/After, Watch) — with the flat diagram beside them on a tablet, where the column
  // under the cube would otherwise be empty.
  const dockControls = beat.kind === 'demo' || beat.kind === 'goal' || (beat.kind === 'info' && Boolean(beat.show))
  const dockFigure = showTop && !shapes && beat.kind !== 'real'
  const dockChecks = beat.kind === 'real'
  const dockTall = dockFigure || Boolean(shapes) || beat.kind === 'demo' || beat.kind === 'goal'
  // The hint lives in the strip only (one Hint on screen): to open it, or (for the three-level
  // hints of drills and free exercises) to see more.
  const leveled = beat.kind === 'drill' || (judgedByResult && beat.kind === 'guided' && beat.scaffold === 'none')
  const stripHint =
    now !== null && !between && !guidedComplete && !(beat.kind === 'drill' && drill.solved) && (now.kind === 'name' || now.kind === 'move') && (leveled ? !coach.showing || coach.level < 3 : now.kind === 'name' && scaffoldNow !== 'full')

  return (
    // On a phone every pixel above the fold is the lesson's text: the header, the stepper and
    // the stage are kept tight there, and open up from `sm` on.
    <Page className="pt-1.5! sm:pt-3! md:pt-6!">
      <header className="mb-1.5 flex items-center gap-2 sm:mb-3 md:mb-4">
        <Link
          to="/learn"
          aria-label="Back to the path"
          className="-ml-1.5 flex size-11 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors duration-150 hover:bg-inset hover:text-ink"
        >
          <Icon name="arrowLeft" size={22} />
        </Link>
        <div className="min-w-0 grow">
          <p className="eyebrow flex items-center gap-2 max-sm:leading-tight">
            {stopLabel(stop)}
            {stop.status === 'locked' && (
              <span className="inline-flex items-center gap-1 rounded-xs bg-cube-yellow-soft px-1.5 py-px text-cube-yellow-text normal-case" data-testid="peek-banner" title={path.next ? `${stopLabel(path.next)}: ${path.next.title} comes first on the path.` : undefined}>
                <Icon name="eye" size={12} /> Peeking ahead
              </span>
            )}
          </p>
          <h1 className="truncate text-lg leading-tight text-ink sm:text-xl md:text-2xl">{lesson.title}</h1>
        </div>
        <Button variant="ghost" size="sm" iconLeft="info" onClick={() => setStuckOpen(true)} data-testid="stuck-button">
          Stuck?
        </Button>
      </header>

      <SectionStepper lesson={lesson} index={index} furthest={Math.max(save?.furthest ?? 0, index)} onJump={goTo} />

      <div className="mt-1.5 grid items-start gap-x-5 gap-y-2 sm:mt-3 sm:gap-y-3 min-[900px]:mt-4 min-[900px]:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* The stage (and the "now" strip under it) stays in view while the text scrolls. */}
        <div ref={stageBox} className={cx('sticky top-(--topbar-h) z-20 -mx-4 bg-bg px-4 pt-1 pb-1 sm:-mx-6 sm:px-6 sm:pb-2 md:top-0 md:-mx-0 md:px-0 md:pt-4 min-[900px]:pb-0', beat.kind === 'real' && 'max-[899px]:static', '[@media(max-height:520px)]:static')}>
          <CubeStage
            label="Lesson cube"
            fit="square"
            className={cx(
              'w-full [--stage-min-h:11rem] [@media(max-height:520px)]:[--stage-min-h:7rem]',
              beat.kind === 'quiz'
                ? // The question and its answers must fit under the cube on a phone.
                  '[--stage-max-h:22dvh] sm:[--stage-max-h:34dvh] md:[--stage-max-h:40dvh]'
                : showNow || dockControls
                  ? '[--stage-max-h:31dvh] sm:[--stage-max-h:34dvh] md:[--stage-max-h:40dvh]'
                  : '[--stage-max-h:36dvh] sm:[--stage-max-h:40dvh] md:[--stage-max-h:46dvh]',
              dockTall
                ? 'min-[56.25rem]:[--stage-max-h:calc(100dvh-22.5rem)]'
                : dockChecks
                  ? 'min-[56.25rem]:[--stage-max-h:calc(100dvh-28rem)]'
                  : showNow || dockControls
                  ? 'min-[56.25rem]:[--stage-max-h:calc(100dvh-19rem)]'
                  : 'min-[56.25rem]:[--stage-max-h:calc(100dvh-14rem)]',
            )}
            bottomLeft={<TwistMeter analysis={analysis} />}
            controls={
              <StageControls
                view={cube.view}
                onTurnCube={interactive && beat.kind !== 'info' ? turnCube : undefined}
                busy={busy}
                status={stageStatus}
                mirrors={showMirrors}
                onMirrorsChange={(on) => setMirrors(on)}
                mirrorsDisabled={Boolean(beat.view?.below)}
                onResetView={() => void (beat.view?.below ? cube.view.current?.setPose(BELOW_POSE) : cube.view.current?.resetView())}
              />
            }
          >
            <div ref={cubeBox} className="absolute inset-0">
              <Cube3D
                {...cube.bind}
                mode={interactive ? 'interactive' : 'view'}
                highlight={highlight}
                arrow={arrow}
                mirrors={showMirrors}
                faceLabels={beat.view?.labels ? true : undefined}
                arrowStyle={lesson.id === PRIMER_ID ? 'face' : undefined}
                label={`${lesson.title} cube`}
                debugId="lesson"
              />
            </div>
          </CubeStage>
          {dockChecks && beat.kind === 'real' && <RealChecks checks={beat.checks} figure={showTop ? <TopView state={state} size={84} /> : undefined} className="mt-2 hidden border border-line bg-surface! shadow-1 min-[900px]:flex" />}
          {(showNow || dockControls || dockFigure) && (
            <div className="mt-2 flex items-stretch gap-2" data-testid="stage-dock">
              {dockFigure && (
                <figure className="hidden shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border border-line bg-surface px-1.5 pt-1.5 pb-1 shadow-1 min-[900px]:flex" title="Seen from above. The front is at the bottom. The small bars round the outside are the side centres." data-testid="top-figure">
                  <TopView state={state} size={92} />
                  <figcaption className="text-[0.6875rem] leading-none font-bold text-ink-muted">From above</figcaption>
                </figure>
              )}
              <div className="flex min-w-0 grow flex-col justify-center">
                {showNow && now && <NowStrip now={now} busy={busy} onTurnCube={turnCube} onUndo={cube.undo} onHint={stripHint ? askHint : undefined} />}
                {beat.kind === 'demo' && player && play && <DemoDock play={play} player={player} speeds={DEMO_SPEEDS} />}
                {beat.kind === 'goal' && player && <GoalPanel player={player} busy={busy} />}
                {beat.kind === 'info' && beat.show && <InfoPanel label={beat.show.label ?? 'Watch'} watched={watched} busy={busy} onWatch={replayShow} />}
                {!showNow && !dockControls && dockFigure && (
                  <p className="hidden rounded-md bg-inset px-3 py-2.5 text-sm leading-snug text-ink-muted min-[900px]:block">
                    <span className="font-bold text-ink">Seen from above.</span> The front is at the bottom. The small bars round the outside are the side centres.
                  </p>
                )}
              </div>
            </div>
          )}
          {shapes && (
            <div className="mt-2 hidden min-[900px]:block">
              <TopViewLegend items={shapes} size={84} row active={shapes.find((s) => s.state === state)?.id ?? null} onPick={(id) => cube.reset(shapes.find((s) => s.id === id)!.state)} />
            </div>
          )}
        </div>

        <Card variant="raised" padding="none" className="min-w-0 overflow-x-clip" data-testid="lesson-panel" data-beat={beat.id} data-kind={beat.kind}>
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div
              key={beat.id}
              custom={direction}
              initial={reduced ? { opacity: 0 } : { opacity: 0, x: 18 * direction }}
              animate={{ opacity: 1, x: 0, transition: { ...springs.gentle, opacity: { duration: 0.2 } } }}
              exit={reduced ? { opacity: 0, transition: { duration: 0.08 } } : { opacity: 0, x: -12 * direction, transition: { duration: 0.1 } }}
              className="flex flex-col gap-3.5 p-4 pt-3.5 sm:gap-4 sm:p-5 [@media(max-height:520px)]:pb-24"
            >
              <BeatBody beat={beat} section={section?.label ?? ''} index={index} total={lesson.beats.length} compact={beat.kind === 'guided' && history.length > 0 && !guidedComplete} fold={beat.kind === 'quiz'} />

              {beat.kind === 'quiz' && question && quizSave && <QuizPanel beat={beat} question={question} save={quizSave} onAnswer={answerQuiz} onNext={nextQuestion} />}

              {/* On a phone the diagrams sit in the text (the stage above is already as tall as it can be). */}
              {showTop && !shapes && (
                <figure className="flex items-center gap-3.5 rounded-md bg-inset p-2.5 min-[900px]:hidden" data-testid="top-figure-inline">
                  <TopView state={state} size={104} />
                  <figcaption className="text-sm leading-snug text-ink-muted">
                    <span className="font-bold text-ink">Seen from above.</span> The front is at the bottom. The small bars round the outside are the side centres.
                  </figcaption>
                </figure>
              )}
              {shapes && (
                <div className="min-[900px]:hidden">
                  <TopViewLegend items={shapes} active={shapes.find((s) => s.state === state)?.id ?? null} onPick={(id) => cube.reset(shapes.find((s) => s.id === id)!.state)} />
                </div>
              )}

              {beat.kind === 'demo' && player && play && <DemoPanel beat={beat} play={play} player={player} />}
              {beat.kind === 'guided' && play && guidedStatus && (
                <GuidedPanel
                  beat={beat}
                  display={pathPlay ?? ahead ?? play}
                  status={guidedStatus}
                  position={pathPlay ? (progress?.position ?? 0) : guidedComplete ? (ahead?.moves.length ?? 0) : follower.position}
                  scaffold={scaffoldNow}
                  judged={judgedByResult ? 'result' : 'path'}
                  rep={reps > 0 ? { done: repsDone, total: reps } : null}
                  explanation={judgedByResult && hintAt === hintKey ? (follower.step?.explanation ?? null) : null}
                  coach={coach}
                  busy={busy}
                  canUndo={cube.canUndo}
                  onUndo={cube.undo}
                  onHint={askHint}
                  onRestart={restartBeat}
                  onShowMe={showMe}
                />
              )}
              {beat.kind === 'real' && <RealPanel beat={beat} doneAt={save?.real[beat.id] ?? null} onDone={confirmReal} />}
              {beat.kind === 'drill' && (
                <DrillPanel
                  beat={beat}
                  drill={drill}
                  mastered={isMastered(save, beat.stage)}
                  hardLeft={hardToGo(save, beat.stage).map((h) => h.label)}
                  hardHere={hardHere}
                  analysis={analysis}
                  coach={coach}
                  busy={busy}
                  moves={history.length}
                  canUndo={cube.canUndo}
                  onUndo={cube.undo}
                  onHint={askHint}
                  onRestart={restartBeat}
                  onNext={nextDrill}
                  onShowMe={showMe}
                />
              )}
              {beat.kind === 'wrap' && (
                <WrapPanel lesson={lesson} nextId={nextId} stops={path.stops} todo={todo} complete={alreadyComplete || (todo.earned && !locked)} locked={locked} onJump={(id) => goTo(beatIndex(lesson, id))} />
              )}

              {!(beat.kind === 'wrap') && (
                <div className={`sticky bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))] z-10 -mx-4 -mb-4 flex flex-col gap-2 rounded-b-[inherit] border-t border-line bg-surface px-4 py-2 sm:-mx-5 sm:py-3 sm:-mb-5 sm:px-5 md:bottom-0 ${beat.kind === 'quiz' && quizSave?.answer === null && !save?.done[beat.id] ? 'max-sm:static' : ''} [@media(max-height:520px)]:fixed [@media(max-height:520px)]:inset-x-0 [@media(max-height:520px)]:z-30 [@media(max-height:520px)]:mx-0 [@media(max-height:520px)]:mb-0 [@media(max-height:520px)]:rounded-none [@media(max-height:520px)]:shadow-2`} data-testid="beat-footer">
                  {beat.kind === 'real' && !save?.real[beat.id] && <RealActions onDone={confirmReal} onStuck={() => setStuckOpen(true)} />}
                  <div className="flex items-center gap-2.5">
                    <Button variant="ghost" size={beat.kind === 'real' && !ready ? 'sm' : 'md'} iconLeft="arrowLeft" onClick={() => goTo(index - 1)} disabled={index === 0} data-testid="beat-back">
                      Back
                    </Button>
                    <span className="num grow text-center text-xs font-semibold whitespace-nowrap text-ink-faint" aria-hidden="true">
                      {index + 1} / {lesson.beats.length}
                    </span>
                    <Button variant={ready ? 'primary' : beat.kind === 'real' ? 'ghost' : 'secondary'} size={beat.kind === 'real' && !ready ? 'sm' : 'md'} iconRight="arrowRight" onClick={() => goTo(index + 1)} data-testid="beat-next" data-ready={ready}>
                      {ready ? 'Next' : beat.kind === 'real' ? 'Later' : 'Skip'}
                    </Button>
                  </div>
                </div>
              )}
              {beat.kind === 'wrap' && index > 0 && (
                <div className="-mt-1 flex">
                  <Button variant="ghost" size="sm" iconLeft="arrowLeft" onClick={() => goTo(index - 1)} data-testid="beat-back">
                    Back
                  </Button>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </Card>
      </div>

      <Modal
        open={stuckOpen}
        onClose={() => {
          setStuckOpen(false)
          setChoosing(false)
        }}
        title={choosing ? 'Where is your cube?' : 'Stuck?'}
        description={choosing ? 'Find your place in about 20 seconds.' : `What to do when it goes wrong${lesson.id === PRIMER_ID ? '' : ` — on screen or on your own cube`}.`}
        size="md"
      >
        {choosing ? (
          <>
            <Chooser compact onGo={openFromChooser} onExact={() => navigate('/solve?where&exact')} />
            <Button variant="ghost" size="sm" iconLeft="arrowLeft" className="mt-3" onClick={() => setChoosing(false)} data-testid="chooser-close">
              Back to Stuck?
            </Button>
          </>
        ) : (
          <>
            {lesson.id !== PRIMER_ID && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 rounded-md bg-accent-soft px-3.5 py-3" data-testid="where-card">
                <p className="min-w-0 basis-56 grow text-sm text-ink">
                  <span className="font-bold">Lost on your real cube?</span> Pick the picture that looks most like it, and go straight to the right stage.
                </p>
                <Button variant="primary" size="sm" iconLeft="target" onClick={() => setChoosing(true)} data-testid="where-link">
                  Which picture is my cube?
                </Button>
              </div>
            )}
            {lesson.number > 0 && (
              <section className="mb-4" data-testid="recovery-rules">
                <h3 className="mb-2 text-sm font-bold text-ink">On your real cube</h3>
                <TroubleList troubles={RECOVERY_RULES.slice(0, lesson.id === 'yellow-corners-orient' ? 4 : 3)} open />
              </section>
            )}
            <h3 className="mb-2 text-sm font-bold text-ink">{lesson.id === PRIMER_ID ? 'Common problems' : `Common problems in “${lesson.title}”`}</h3>
            <TroubleList troubles={lesson.troubles} />
            <div className="mt-4 flex flex-wrap gap-2.5">
              <Button variant="ghost" size="sm" onClick={() => setStuckOpen(false)}>
                Back to the lesson
              </Button>
            </div>
          </>
        )}
      </Modal>
    </Page>
  )
}
