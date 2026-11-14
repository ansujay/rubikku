import { lazy, useEffect, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { reward } from '../../app/rewards'
import { AlgParseError, algToString, applyAlg, BEGINNER_HOLD, EDGES, CORNERS, isSlotSolved, isSolved, parseAlg, randomScramble, SOLVED, type CubeState, type Move } from '../../cube'
import { useSettings } from '../../store'
import { Cube3D, KeyboardHelp, StageControls, useCubeController } from '../../three'
import {
  Badge,
  Button,
  Card,
  CubeStage,
  cx,
  IconButton,
  Modal,
  MoveChip,
  MoveSequence,
  Page,
  PageHeader,
  PlaybackBar,
  popIn,
  Reveal,
  sound,
  springs,
} from '../../ui'
import { HintCard, useCoach } from '../learn/player/coach'
import { usePlay } from './playStore'

const SCRAMBLE_SPEED = 3.2
/** A fresh cube sits in the method's hold: yellow on top, white underneath, green in front. */
const FRESH: CubeState = applyAlg(SOLVED, BEGINNER_HOLD)
const PLAYER_SPEEDS = [0.5, 1, 2] as const

// The cube lab (#/play?lab) shows every cube mode on one page; it is for checking, not for players.
// It is its own chunk, loaded only when that address is opened.
const CubeLab = lazy(() => import('./CubeLab'))

/**
 * Properly mixed up: at most 6 of the 20 edges and corners are where they belong. A real
 * scramble leaves 0–3; a turn or two away from solved leaves 12 or more.
 */
function isWellMixed(state: CubeState): boolean {
  let solved = 0
  for (const slot of [...EDGES, ...CORNERS]) if (isSlotSolved(state, slot)) solved++
  return solved <= 6
}

export default function PlayPage() {
  const [params] = useSearchParams()
  return params.has('lab') ? <CubeLab /> : <FreePlay />
}

function FreePlay() {
  const stage = useRef<HTMLDivElement>(null)
  const mirrors = usePlay((s) => s.mirrors)
  const algText = usePlay((s) => s.algText)
  const faceLabels = useSettings((s) => s.showFaceLabels)
  const [helpOpen, setHelpOpen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [algError, setAlgError] = useState<string | null>(null)
  const [justSolved, setJustSolved] = useState(false)

  const cube = useCubeController({
    // A saved cube comes back exactly as it was; a first visit starts in the method's hold.
    initial: () => usePlay.getState().session ?? FRESH,
    onChange: (session) => usePlay.getState().setSession(session),
    // Turns he makes himself (not "Show me", the algorithm player or redo): see the solved check below.
    onUserMove: () => usePlay.getState().countOwnMove(),
  })
  const { state, history, moveCount, player, busy } = cube
  const solved = isSolved(state)
  // The same coach as the lessons, kept open from one step to the next.
  const coach = useCoach(cube, { advance: true, solvedNote: 'It’s already solved. Scramble it and have a go!' })

  // Mixed up → solved is the moment worth a cheer, however the last turn was made (by hand, with
  // "Show me", with redo). It is judged on the cube itself: `scrambled` is set by the Scramble
  // button or by mixing the cube properly by hand, and cleared whenever the cube is solved — so
  // a later `R R′` on a solved cube is not a solve. The reward needs at least half of the turns
  // to have been his own.
  const wasSolved = useRef(solved)
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])
  useEffect(() => {
    const play = usePlay.getState()
    if (solved) {
      if (!wasSolved.current && play.scrambled && moveCount > 0) {
        // His own solve is a moment (the card, the cube spins); the reward lifts it to a
        // milestone by itself when it is his first solve ever (src/app/rewards.ts). A solve the
        // coach mostly did gets a quiet "Solved!" on the cube instead.
        if (play.ownMoves * 2 >= moveCount)
          reward('solve-completed', { context: 'play' }, { moment: { eyebrow: 'Solved', title: 'You solved it!', subtitle: `Scrambled to solved in ${moveCount} ${moveCount === 1 ? 'move' : 'moves'}.`, icon: 'cube' } })
        else {
          sound.play('success')
          setJustSolved(true)
          timers.current.push(window.setTimeout(() => setJustSolved(false), 2600))
        }
      }
      if (play.scrambled || play.ownMoves > 0) play.setScrambled(false)
    } else if (!play.scrambled && isWellMixed(state)) {
      play.setScrambled(true, play.ownMoves)
    }
    wasSolved.current = solved
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  // ── actions ──

  const scramble = () => {
    coach.clear()
    usePlay.getState().setScrambled(true)
    void cube.apply(randomScramble(), { speed: SCRAMBLE_SPEED, record: false })
  }

  const reset = () => {
    setConfirmReset(false)
    coach.clear()
    usePlay.getState().setScrambled(false)
    cube.reset(FRESH)
  }

  const askReset = () => {
    if (!solved && history.length >= 8) setConfirmReset(true)
    else reset()
  }

  const playTyped = (event: FormEvent) => {
    event.preventDefault()
    const text = algText.trim()
    if (!text) return
    try {
      const moves = parseAlg(text)
      if (moves.length === 0) return
      setAlgError(null)
      coach.clear()
      cube.load(moves, { autoplay: true })
    } catch (error) {
      sound.play('error')
      setAlgError(error instanceof AlgParseError ? `That doesn’t look like cube moves: ${error.message}` : 'That doesn’t look like cube moves.')
    }
  }

  const turnCube = (move: Move) => {
    usePlay.getState().countOwnMove() // his own turn, even though a button made it
    void cube.apply([move], { speed: 1.2 })
  }

  // Keep the newest move in view.
  const historyBox = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const box = historyBox.current
    if (box) box.scrollTop = box.scrollHeight
  }, [history.length])

  const fresh = solved && history.length === 0 && !player

  return (
    <Page>
      <PageHeader title="Free play" lede="Your cube, your rules. Scramble it, turn it, solve it your way." className="mb-5! md:mb-6!" />

      <Reveal className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3.5">
          <div ref={stage}>
            <CubeStage
              label="Your cube"
              fit="square"
              // The view, its bar and the Scramble / Hint row all fit one screen (1024×768, 1440×900).
              maxViewHeight="calc(100dvh - 17.75rem)"
              minViewHeight="18rem"
              className="w-full"
              controls={
                <StageControls
                  view={cube.view}
                  onTurnCube={turnCube}
                  busy={busy}
                  mirrors={mirrors}
                  onMirrorsChange={(on) => usePlay.getState().setMirrors(on)}
                  labels={faceLabels}
                  onLabelsChange={(on) => useSettings.getState().setShowFaceLabels(on)}
                  extra={<IconButton icon="keyboard" label="Keyboard moves" size="sm" className="max-sm:hidden" onClick={() => setHelpOpen(true)} />}
                  status={
                    fresh ? (
                      <p className="hidden text-xs leading-tight font-semibold text-ink-muted @min-[30rem]/stage:line-clamp-2">
                        Drag a sticker to turn a layer<span className="@max-[38rem]/stage:hidden">. Drag beside the cube to look around</span>.
                      </p>
                    ) : (
                      <AnimatePresence mode="popLayout" initial={false}>
                        <motion.span key={solved ? 'solved' : 'moves'} variants={popIn} initial="hidden" animate="show" exit="exit">
                          {solved ? (
                            <Badge tone="green" icon="check" data-testid="cube-status">
                              Solved
                            </Badge>
                          ) : (
                            <Badge tone="neutral" data-testid="cube-status">
                              {history.length} {history.length === 1 ? 'move' : 'moves'}
                            </Badge>
                          )}
                        </motion.span>
                      </AnimatePresence>
                    )
                  }
                />
              }
            >
              <Cube3D {...cube.bind} highlight={coach.highlight} arrow={busy ? null : coach.nextMove} mirrors={mirrors || coach.hidden} debugId="play" />
              <AnimatePresence>
                {justSolved && (
                  <motion.div
                    className="pointer-events-none absolute inset-x-0 bottom-[14%] flex justify-center"
                    initial={{ opacity: 0, y: 14, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={springs.bouncy}
                  >
                    <span className="rounded-lg bg-ink px-5 py-2.5 font-display text-2xl font-extrabold text-ink-inverse shadow-3">Solved!</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </CubeStage>
          </div>

          {/* One row from sm up. On a phone, by design, two: Scramble and Hint side by side, then
              Undo · Redo … Reset (one row of five does not fit 390 px). */}
          <div className="flex flex-wrap items-center gap-2.5" data-testid="play-actions">
            <Button variant="primary" iconLeft="shuffle" onClick={scramble} disabled={busy && !player} className="max-sm:order-1 max-sm:basis-[calc(50%-0.3125rem)]">
              Scramble
            </Button>
            <div className="flex items-center gap-1 max-sm:order-3">
              <IconButton icon="undo" label="Undo" variant="secondary" onClick={cube.undo} disabled={!cube.canUndo} />
              <IconButton icon="redo" label="Redo" variant="secondary" onClick={cube.redo} disabled={!cube.canRedo} />
            </div>
            {/* Hint: the next step of the beginner method, explained, with its pieces lit (see the coach). */}
            <Button variant="reward" iconLeft="lightbulb" onClick={coach.ask} disabled={busy} data-testid="hint-button" className="max-sm:order-2 max-sm:basis-[calc(50%-0.3125rem)]">
              Hint
            </Button>
            <Button variant="ghost" iconLeft="restart" onClick={askReset} className="ml-auto max-sm:order-4" disabled={fresh}>
              Reset
            </Button>
          </div>

          <AnimatePresence initial={false}>
            {(coach.step || coach.note) && (
              <motion.div key="hint" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={springs.gentle}>
                <HintCard coach={coach} size="md" busy={busy} onUndo={cube.undo} onShowMe={(moves) => void cube.apply(moves, { speed: 0.8 })} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Card variant="raised" padding="md">
            <h2 className="text-lg text-ink">Type some moves</h2>
            <p className="mt-0.5 text-sm text-ink-muted">
              Like <span className="font-mono font-semibold text-ink">R U R' U'</span>. Paste a whole algorithm if you like.
            </p>
            <form onSubmit={playTyped} className="mt-3 flex gap-2">
              <input
                value={algText}
                onChange={(event) => {
                  usePlay.getState().setAlgText(event.target.value)
                  if (algError) setAlgError(null)
                }}
                aria-label="Moves to play"
                aria-invalid={algError !== null}
                aria-describedby={algError ? 'alg-error' : undefined}
                placeholder="R U R' U'"
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                className={cx(
                  'h-12 min-w-0 grow rounded-md border-[1.5px] bg-inset px-3.5 font-mono text-base font-semibold text-ink placeholder:font-medium placeholder:text-ink-faint',
                  algError ? 'border-cube-red' : 'border-line-strong',
                )}
              />
              <Button type="submit" variant="secondary" iconLeft="play" disabled={algText.trim() === ''}>
                Play
              </Button>
            </form>
            {algError && (
              <p id="alg-error" role="alert" className="mt-2 text-sm font-semibold text-cube-red-text">
                {algError}
              </p>
            )}

            {player && (
              <div className="mt-4 flex flex-col gap-3" data-testid="player">
                <div className="flex items-start justify-between gap-2">
                  <MoveSequence
                    moves={player.alg}
                    size="sm"
                    activeIndex={player.detached ? undefined : player.activeIndex >= 0 ? player.activeIndex : player.position}
                    onMoveClick={(index) => player.seek(index + 1)}
                    label="The algorithm"
                  />
                  <IconButton icon="x" label="Put the algorithm away" size="sm" onClick={player.unload} />
                </div>
                <PlaybackBar
                  playing={player.playing}
                  onPlayPause={player.toggle}
                  position={player.position}
                  total={player.total}
                  onStepBack={() => player.step(-1)}
                  onStepForward={() => player.step(1)}
                  onRestart={player.restart}
                  onScrub={player.seek}
                  speed={player.speed}
                  speeds={PLAYER_SPEEDS}
                  onSpeedChange={player.setSpeed}
                  className="border-0! bg-inset! p-1.5! shadow-none!"
                />
              </div>
            )}
          </Card>

          <Card variant="raised" padding="md">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-lg text-ink">Your moves</h2>
              <span className="num text-sm font-semibold text-ink-muted" data-testid="move-count">
                {history.length}
              </span>
            </div>
            {history.length === 0 ? (
              <p className="mt-2 text-sm text-ink-muted">Nothing yet. Every turn you make shows up here, and Undo walks back through them.</p>
            ) : (
              <div ref={historyBox} className="mt-3 flex max-h-44 flex-wrap gap-x-1 gap-y-2 overflow-y-auto pb-1" data-testid="history" data-moves={algToString(history)}>
                {history.map((move, i) => (
                  <MoveChip key={i} move={move} size="sm" />
                ))}
              </div>
            )}
          </Card>
        </div>
      </Reveal>

      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title="Keyboard moves" description="Click the cube first, then type." size="sm">
        <KeyboardHelp />
      </Modal>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Start over?"
        description="The cube goes back to solved and your moves are cleared."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Keep going
            </Button>
            <Button variant="danger" iconLeft="restart" onClick={reset}>
              Reset
            </Button>
          </>
        }
      />
    </Page>
  )
}
