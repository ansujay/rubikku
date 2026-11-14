import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { celebrate, reward } from '../../app/rewards'
import { describeMove, invertMove, isRotation, moveBase, moveKind, SOLVED, type Move } from '../../cube'
import { Cube3D, DEFAULT_POSE, StageControls, useCubeController, type CameraPose } from '../../three'
import { Button, celebration, CubeStage, Icon, MoveChip, Page, PageHeader, Reveal, Section, sound, springs } from '../../ui'
import { Guide, MasteryGrid, PlayCard } from './components/Hub'
import { DoPrompt, Feedback, KeyTip, NameOptions, NamePrompt, RoundBar, SpeedPanel, Summary, Trail, WorkOn } from './components/RoundPanels'
import { explainWrongChoice, explainWrongTurn, pretty } from './logic/explain'
import { FOLLOW_START, followMove, type FollowState } from './logic/follow'
import { levelMoves, levelsFor, LEVELS, speedPool, UNLOCK_ACCURACY, type GameMode } from './logic/levels'
import { scoreRound } from './logic/mastery'
import { makeQuestion, makeRound, nameOptions } from './logic/questions'
import { useNotation } from './notationStore'
import { sleep, useCubeQueue } from './useCubeQueue'

/** Camera angles that look almost straight at a face, so "clockwise" really looks clockwise. */
const FACE_ON: Record<string, Partial<CameraPose>> = {
  R: { azimuth: Math.PI / 2 - 0.2, elevation: 0.2 },
  L: { azimuth: -Math.PI / 2 + 0.2, elevation: 0.2 },
  F: { azimuth: 0.14, elevation: 0.16 },
  B: { azimuth: Math.PI - 0.2, elevation: 0.2 },
  U: { azimuth: 0.1, elevation: 1.2 },
  D: { azimuth: 0.1, elevation: -0.9 },
}

/**
 * Where to look from when the move being pointed at is on a face the usual view hides (the
 * left, the back, the bottom): a three-quarter view with that face towards him, so the hint
 * arrow is never drawn where he cannot see it.
 */
const HIDDEN_FACE_VIEW: Record<string, Partial<CameraPose>> = {
  L: { azimuth: -DEFAULT_POSE.azimuth, elevation: DEFAULT_POSE.elevation },
  B: { azimuth: Math.PI - DEFAULT_POSE.azimuth, elevation: DEFAULT_POSE.elevation },
  D: { azimuth: DEFAULT_POSE.azimuth, elevation: -0.62 },
}
/** The hidden face a move turns (L, B or D), else null. */
const hiddenFaceOf = (move: Move | null): string | null => {
  if (!move || (moveKind(move) !== 'face' && moveKind(move) !== 'wide')) return null
  const face = moveBase(move).toUpperCase()
  return face in HIDDEN_FACE_VIEW ? face : null
}

const hoverDevice = () => typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover)').matches

interface Demo {
  move: Move
  /** `faceOn`: looking straight at the turning face · `front`: the normal view. */
  view: 'faceOn' | 'front'
}

export default function NotationPage() {
  const round = useNotation((s) => s.round)
  const stats = useNotation((s) => s.stats)
  const speedBest = useNotation((s) => s.speedBest)

  const [follow, setFollowState] = useState<FollowState>(FOLLOW_START)
  const followRef = useRef<FollowState>(FOLLOW_START)
  const setFollow = (next: FollowState) => {
    followRef.current = next
    setFollowState(next)
  }
  const made = useRef<Move[]>([])
  const locked = useRef(true)
  const [hinted, setHinted] = useState(false)
  const hintedRef = useRef(false)
  /** Which move of the sequence he was on when he asked for the hint. */
  const hintAt = useRef(0)
  const [fresh, setFresh] = useState(false)
  const [flash, setFlash] = useState<'correct' | 'wrong' | null>(null)
  const [picked, setPicked] = useState<Move | null>(null)
  const [demo, setDemo] = useState<Demo | null>(null)
  const [arrow, setArrow] = useState<Move | null>(null)
  const [running, setRunning] = useState(false)
  const [timeLeft, setTimeLeft] = useState(() => useNotation.getState().round?.remainingMs ?? 0)
  const [speedLine, setSpeedLine] = useState<string | null>(null)
  const stageBox = useRef<HTMLDivElement>(null)
  const timers = useRef<number[]>([])
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms))
  }
  /** Drop answers and effects still waiting on a timer (they belong to the round being left). */
  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id))
    timers.current = []
  }
  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), [])

  const cube = useCubeController({ initial: SOLVED, onUserMove: (move) => handleTurn(move) })
  const { controller } = cube
  const queue = useCubeQueue(controller)

  const mode = round?.mode ?? null
  const phase = round?.phase ?? null
  const answered = round?.answers.length ?? 0
  // During feedback the question on screen is the one just answered.
  const questionIndex = round ? Math.min(round.questions.length - 1, phase === 'feedback' ? answered - 1 : answered) : -1
  const question = round && phase !== 'summary' ? round.questions[questionIndex] : null
  const options = round && mode === 'name' && phase !== 'summary' ? round.options[questionIndex] : null
  const level = round ? LEVELS.find((item) => item.id === round.levelId) : undefined
  const rotationsAllowed = !!level?.bonus

  // ── a new question (or phase): put the cube right and get ready ──

  const questionKey = round ? `${mode}:${answered}:${phase}` : 'hub'
  useEffect(() => {
    const now = useNotation.getState().round
    setFlash(null)
    setArrow(null)
    setDemo(null)
    if (!now) {
      // The hub: a clean cube for demos.
      locked.current = true
      queue.cancel()
      if (controller.getSnapshot().state !== SOLVED) controller.reset(SOLVED)
      void cube.view.current?.resetView()
      return
    }
    locked.current = true
    if (now.phase === 'summary') {
      void queue.rewind()
      return
    }
    if (now.phase === 'feedback') {
      // Leave what he did on show for a moment, then tidy up.
      void queue.run(() => sleep(now.mode === 'name' ? 0 : 650))
      if (now.mode !== 'name') void queue.rewind()
      return
    }
    const next = now.questions[now.answers.length]
    setFollow(FOLLOW_START)
    made.current = []
    hintedRef.current = false
    setHinted(false)
    setPicked(null)
    setFresh(now.mode === 'do' && next.length === 1 && !useNotation.getState().stats[next[0]]?.seen)
    void queue.rewind(now.mode === 'speed' ? 4 : 3)
    if (now.mode === 'name') {
      void queue.run(async (alive) => {
        await sleep(280)
        if (alive()) await controller.apply(next, { speed: 0.75 })
      })
    } else {
      void queue.run(() => {
        locked.current = false
        if (hoverDevice()) cube.view.current?.focus()
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionKey])

  // ── his own turns (do / speed) ──

  function handleTurn(move: Move) {
    const store = useNotation.getState()
    const now = store.round
    if (!now || now.phase !== 'question' || now.mode === 'name') return
    const asked = now.questions[now.answers.length]
    const before = followRef.current
    const result = followMove(asked, before, move)
    made.current.push(move)
    if (result.status === 'progress') {
      setFollow(result.next)
      return
    }
    locked.current = true
    if (result.status === 'complete') {
      setFollow(result.next)
      setFlash('correct')
      celebration.tick(document.querySelector('[data-testid="prompt"]'))
      setSpeedLine(null)
      const record = hintedRef.current ? { moves: asked, result: 'hinted' as const, missed: asked[hintAt.current], missedIndex: hintAt.current } : { moves: asked, result: 'correct' as const }
      if (now.mode === 'speed') {
        store.appendQuestion(makeQuestion({ ...speedPool(store.unlocked.do), sequence: [1, 1] }, store.stats, Math.random, asked))
        store.answer(record)
      } else {
        later(() => useNotation.getState().answer(record), 420)
      }
      return
    }
    // Wrong.
    sound.play('error')
    setFlash('wrong')
    const expected = result.expected ?? asked[0]
    const prefix = asked.length > 1 ? `Move ${before.index + 1} should be ${pretty(expected)}. ` : ''
    const line = prefix + explainWrongTurn(expected, move, before.partial)
    if (now.mode === 'speed') {
      store.miss(expected)
      setSpeedLine(line)
      void queue.run(() => sleep(260))
      void queue.rewind(4)
      void queue.run(() => {
        setFollow(FOLLOW_START)
        made.current = []
        setFlash(null)
        locked.current = false
      })
    } else {
      const mistake = { made: [...made.current], chosen: null, line }
      later(() => useNotation.getState().answer({ moves: asked, result: 'wrong', missed: expected, missedIndex: before.index }, mistake), 380)
    }
  }

  const allowMove = useCallback(
    (move: Move) => {
      if (locked.current || pausedRef.current || controller.getSnapshot().busy) return false
      if (isRotation(move) && !rotationsAllowed) return false
      return true
    },
    [controller, rotationsAllowed],
  )

  // ── name the move ──

  const pick = (move: Move) => {
    const store = useNotation.getState()
    const now = store.round
    if (!now || now.mode !== 'name' || now.phase !== 'question' || picked) return
    const shown = now.questions[now.answers.length]
    setPicked(move)
    if (move === shown[0]) {
      celebration.tick(document.querySelector(`[data-testid="options"] [data-move="${CSS.escape(move)}"]`) ?? document.querySelector('[data-testid="prompt"]'))
      setFlash('correct')
      later(() => useNotation.getState().answer({ moves: shown, result: 'correct' }), 520)
    } else {
      sound.play('error')
      setFlash('wrong')
      later(() => useNotation.getState().answer({ moves: shown, result: 'wrong', missed: shown[0], missedIndex: 0 }, { made: [], chosen: move, line: explainWrongChoice(shown[0], move) }), 380)
    }
  }

  const replay = () => {
    if (!question) return
    const moves = question
    void queue.rewind(3)
    void queue.run(async (alive) => {
      await sleep(200)
      if (alive()) await controller.apply(moves, { speed: 0.6 })
    })
  }

  /** Feedback: play the right answer slowly on the big cube, with the arrow. */
  const watchAnswer = () => {
    if (!question) return
    const moves = question
    void queue.rewind(3)
    void queue.run(async (alive) => {
      for (const move of moves) {
        if (!alive()) return
        setArrow(move)
        await sleep(520)
        if (!alive()) return
        await controller.apply([move], { speed: 0.55 })
      }
      setArrow(null)
      await sleep(700)
    })
    if (mode !== 'name') void queue.rewind(3)
  }

  // ── the hub: tap a move, watch it ──

  const showMove = (move: Move) => {
    queue.cancel()
    if (controller.getSnapshot().state !== SOLVED) controller.reset(SOLVED)
    const box = stageBox.current
    if (box) {
      const rect = box.getBoundingClientRect()
      if (rect.top < 0 || rect.bottom > window.innerHeight) box.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
    const pose = moveKind(move) === 'face' || moveKind(move) === 'wide' ? FACE_ON[moveBase(move).toUpperCase()] : undefined
    void queue.run(async (alive) => {
      const view = cube.view.current
      const turn = async () => {
        setArrow(move)
        await sleep(480)
        if (!alive()) return
        await controller.apply([move], { speed: 0.5 })
        await sleep(650)
        if (!alive()) return
        setArrow(null)
        await controller.apply([invertMove(move)], { speed: 3, record: false })
      }
      if (pose) {
        setDemo({ move, view: 'faceOn' })
        await view?.setPose({ ...pose, zoom: 1 }, { duration: 0.65 })
        if (!alive()) return
        await turn()
        if (!alive()) return
        await view?.resetView()
        if (!alive()) return
      } else {
        await view?.resetView()
      }
      setDemo({ move, view: 'front' })
      await turn()
      if (!alive()) return
      await sleep(500)
      if (alive()) setDemo(null)
    })
  }

  // ── starting, stopping ──

  const start = (which: GameMode) => {
    const store = useNotation.getState()
    clearTimers()
    queue.cancel()
    controller.reset(SOLVED)
    void cube.view.current?.resetView()
    setSpeedLine(null)
    setRunning(false)
    setTimeLeft(60_000)
    if (which === 'speed') {
      const pool = { ...speedPool(store.unlocked.do), sequence: [1, 1] as const }
      store.startRound({ mode: 'speed', levelId: 'speed', questions: [makeQuestion(pool, store.stats, Math.random)], options: [] })
      return
    }
    const picked = levelsFor(which)[store.chosen[which]]
    const questions = makeRound(picked, store.stats, Math.random)
    const count = picked.id === 'faces' || picked.id === 'primes' ? 4 : 6
    store.startRound({
      mode: which,
      levelId: picked.id,
      questions,
      options: which === 'name' ? questions.map((q) => nameOptions(q[0], levelMoves(picked), Math.random, count)) : [],
    })
  }

  const quit = () => {
    clearTimers()
    setRunning(false)
    useNotation.getState().quitRound()
  }

  const again = (nextLevel: boolean) => {
    const store = useNotation.getState()
    const last = store.round
    if (!last) return
    if (last.mode !== 'speed') {
      const levels = levelsFor(last.mode)
      const index = levels.findIndex((item) => item.id === last.levelId)
      store.chooseLevel(last.mode, nextLevel ? index + 1 : index)
    }
    start(last.mode)
  }

  // ── the speed round's clock ──

  useEffect(() => {
    if (!running) return
    const startedAt = performance.now()
    const base = useNotation.getState().round?.remainingMs ?? 0
    let saved = base
    const left = () => Math.max(0, base - (performance.now() - startedAt))
    const tick = window.setInterval(() => {
      const ms = left()
      setTimeLeft(ms)
      if (saved - ms >= 1000) {
        saved = ms
        useNotation.getState().setRemaining(ms)
      }
      if (ms <= 0) {
        setRunning(false)
        useNotation.getState().finish()
      }
    }, 100)
    return () => {
      window.clearInterval(tick)
      useNotation.getState().setRemaining(left())
    }
  }, [running])

  // A speed round only counts down while it is on screen: after a reload it waits for "Carry on".
  const speedPaused = mode === 'speed' && phase === 'question' && !running
  const pausedRef = useRef(speedPaused)
  pausedRef.current = speedPaused

  // ── the end of a round: reward once ──

  useEffect(() => {
    if (phase !== 'summary') return
    const store = useNotation.getState()
    const now = store.round
    if (!now || now.phase !== 'summary' || now.outcome) return
    const score = scoreRound(now.answers)
    const total = now.mode === 'speed' ? score.correct + now.misses : score.total
    // Recorded silently, then shown once at the right tier: a passed round or a new speed best is
    // a moment (the badge or level it earned folds into it); anything else is a small XP toast.
    const result = total > 0 ? reward('notation-round', { correct: score.correct, total }, { mode: 'silent' }) : null
    store.settle(result?.xpGained ?? 0)
    const settled = useNotation.getState().round?.outcome
    const cheer = now.mode === 'speed' ? settled?.newBest : score.total > 0 && score.correct / score.total >= UNLOCK_ACCURACY
    if (cheer) {
      celebration.moment(
        now.mode === 'speed'
          ? { eyebrow: 'New speed best', title: `${score.correct} moves in a minute`, subtitle: settled?.previousBest ? `Up from ${settled.previousBest}.` : 'Your first speed record.', icon: 'timer', xp: result?.xpGained }
          : { eyebrow: 'Round passed', title: `${score.correct} of ${score.total} right`, subtitle: score.correct === score.total ? 'Not a single miss.' : 'The next level is open.', icon: 'notation', xp: result?.xpGained },
      )
      if (result) celebrate(result, { mode: 'quiet' })
    } else if (result) celebrate(result)
  }, [phase])

  // Enter moves on from feedback.
  const nextQuestion = () => useNotation.getState().next()

  // ── what the cube shows ──

  const inRound = round !== null
  const turning = mode === 'do' || mode === 'speed'
  const help = turning && phase === 'question' && (hinted || fresh)
  const hintMove = help && question && !cube.busy ? (question[Math.min(follow.index, question.length - 1)] ?? null) : null
  // Half-way through a double turn only the same quarter turn again is accepted: point at that.
  const cubeArrow = arrow ?? (hintMove && follow.partial ? follow.partial : hintMove)

  // A move on the left, back or bottom: swing the camera round so the arrow can be seen, and
  // swing back afterwards. (The hub's demos set their own views; `demo` is set then.)
  const hiddenFace = demo ? null : hiddenFaceOf(cubeArrow)
  const swung = useRef(false)
  useEffect(() => {
    const view = cube.view.current
    if (!view) return
    if (hiddenFace) {
      swung.current = true
      void view.setPose({ ...HIDDEN_FACE_VIEW[hiddenFace], zoom: 1 }, { duration: 0.55 })
    } else if (swung.current) {
      swung.current = false
      void view.resetView()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hiddenFace])
  const speedScore = round ? scoreRound(round.answers).correct : 0
  const nextLevelOpen =
    round && round.mode !== 'speed' && phase === 'summary'
      ? (() => {
          const levels = levelsFor(round.mode)
          const index = levels.findIndex((item) => item.id === round.levelId)
          return index >= 0 && index < levels.length - 1 && index < useNotation.getState().unlocked[round.mode]
        })()
      : false

  return (
    <Page>
      {round ? <RoundBar round={round} onQuit={quit} /> : <PageHeader title="Notation" lede="Cubers write every move as a letter. Learn to read them and every algorithm opens up." className="mb-5! md:mb-6!" />}

      <Reveal
        className={
          inRound
            ? "grid items-start gap-3.5 [grid-template-areas:'prompt'_'stage'_'rest'] lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:gap-x-5 lg:gap-y-4 lg:[grid-template-areas:'stage_prompt'_'stage_rest']"
            : "grid items-start gap-4 [grid-template-areas:'prompt'_'stage'_'rest'] lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:gap-5 lg:[grid-template-areas:'stage_prompt'_'stage_rest']"
        }
      >
        <div ref={stageBox} className="min-w-0 [grid-area:stage] max-lg:[--round-cap:max(52dvh,22rem)] max-sm:[--round-cap:max(calc(100dvh-34rem),17rem)] lg:sticky lg:top-6" data-hidden-face={hiddenFace ?? undefined}>
          <CubeStage
            label="The cube"
            fit={inRound ? 'square' : 'wide'}
            // In a round on a portrait tablet the cube must leave room for the feedback under it.
            maxViewHeight={inRound ? 'min(calc(100dvh - 14rem), var(--round-cap, 100dvh))' : 'calc(100dvh - 16rem)'}
            className="w-full"
            controls={
              <StageControls
                view={cube.view}
                status={
                  demo ? (
                    <motion.div key={demo.move} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={springs.gentle} className="flex min-w-0 items-center gap-2.5" data-testid="demo-caption">
                      <MoveChip move={demo.move} size="sm" />
                      <span className="min-w-0 text-sm leading-4 font-semibold text-ink">
                        {describeMove(demo.move).text}
                        <span className="block truncate font-medium text-ink-muted">
                          {describeMove(demo.move).detail}
                          <span data-testid="demo-view" className="max-sm:hidden"> · {demo.view === 'faceOn' ? 'looking straight at it' : 'from the front'}</span>
                        </span>
                      </span>
                    </motion.div>
                  ) : !inRound ? (
                    <p className="text-xs font-semibold text-ink-muted">Tap any move to see it turn.</p>
                  ) : undefined
                }
              />
            }
          >
            <Cube3D
              {...cube.bind}
              mode={turning && phase === 'question' ? 'interactive' : 'view'}
              allowMove={allowMove}
              arrow={cubeArrow}
              // A letter is a face: its arrow circles on that face (not along a neighbour's edge).
              arrowStyle="face"
              faceLabels={!inRound || help || phase === 'feedback'}
              turnSound
              debugId="notation"
              label={inRound ? 'The cube. Drag a layer or use the keyboard to turn it.' : 'The cube'}
            />
            <AnimatePresence>
              {flash && (
                <motion.div
                  key={flash}
                  className="pointer-events-none absolute inset-x-0 bottom-[9%] flex justify-center"
                  initial={{ opacity: 0, scale: 0.6, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={springs.bouncy}
                  data-testid="flash"
                  data-flash={flash}
                >
                  <span className={flash === 'correct' ? 'grid size-14 place-items-center rounded-[16px] bg-cube-green text-on-green shadow-3' : 'grid size-14 place-items-center rounded-[16px] bg-cube-red text-on-red shadow-3'}>
                    <Icon name={flash === 'correct' ? 'check' : 'x'} size={30} weight={3.2} />
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
            {speedPaused && <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-bg/55" aria-hidden="true" />}
          </CubeStage>
        </div>

        {/* ── prompt ── */}
        <div className="min-w-0 [grid-area:prompt]">
          {!round && <PlayCard onStart={start} />}
          {round && phase === 'summary' && <Summary round={round} />}
          {round && phase !== 'summary' && mode === 'do' && question && <DoPrompt question={question} follow={follow} fresh={fresh} hinted={hinted} onHint={phase === 'question' ? () => ((hintedRef.current = true), (hintAt.current = followRef.current.index), setHinted(true)) : undefined} />}
          {round && phase !== 'summary' && mode === 'name' && <NamePrompt onReplay={replay} busy={cube.busy} />}
          {round && phase !== 'summary' && mode === 'speed' && question && (
            <div className="flex flex-col gap-3.5">
              <SpeedPanel timeLeft={running ? timeLeft : round.remainingMs} score={speedScore} best={speedBest} running={running} started={round.remainingMs < 60_000} onGo={() => (setTimeLeft(round.remainingMs), setRunning(true))} line={speedLine} />
              {running && <DoPrompt question={question} follow={follow} fresh={false} hinted={false} speed />}
            </div>
          )}
        </div>

        {/* ── everything else ── */}
        <div className="flex min-w-0 flex-col gap-4 [grid-area:rest]">
          {!round && <MasteryGrid stats={stats} activeMove={demo?.move ?? null} onPick={showMove} />}

          {round && phase === 'question' && mode === 'name' && options && question && <NameOptions key={answered} options={options} picked={picked} answer={question[0]} onPick={pick} disabled={picked !== null} />}

          {round && phase === 'feedback' && question && round.mistake && (
            <Feedback key={answered} asked={question} mistake={round.mistake} mode={round.mode} onWatch={watchAnswer} onNext={nextQuestion} busy={cube.busy} />
          )}

          {round && phase !== 'summary' && mode !== 'speed' && (
            <div className="flex flex-col gap-3 px-1">
              <Trail answers={round.answers} total={round.questions.length} />
              {mode === 'do' && phase === 'question' && <KeyTip />}
              {mode === 'name' && phase === 'question' && (
                <p className="text-sm text-ink-muted max-lg:hidden">Drag beside the cube to look around it. Number keys pick an answer.</p>
              )}
            </div>
          )}

          {round && phase === 'summary' && (
            <>
              <WorkOn round={round} stats={stats} activeMove={demo?.move ?? null} onPick={showMove} />
              <div className="flex flex-col gap-2.5">
                <Button size="lg" fullWidth iconRight={nextLevelOpen ? 'arrowRight' : undefined} iconLeft={nextLevelOpen ? undefined : 'restart'} onClick={() => again(nextLevelOpen)} data-testid={nextLevelOpen ? 'next-level' : 'play-again'}>
                  {nextLevelOpen ? 'Next level' : 'Play again'}
                </Button>
                <div className="flex gap-2.5">
                  {nextLevelOpen && (
                    <Button variant="secondary" iconLeft="restart" onClick={() => again(false)} className="grow basis-0" data-testid="play-again">
                      Same again
                    </Button>
                  )}
                  <Button variant={nextLevelOpen ? 'secondary' : 'ghost'} onClick={quit} className="grow basis-0" data-testid="done">
                    Done
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </Reveal>

      {!round && (
        <Section title="How to read moves" description="Three small ideas. That is the whole language.">
          <Guide onPick={showMove} activeMove={demo?.move ?? null} />
        </Section>
      )}
    </Page>
  )
}
