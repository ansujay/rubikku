import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { reward } from '../../app/rewards'
import { PATTERNS as ALL_PATTERNS } from '../../cube'
import { SOLVED, applyAlg, describeMove, getPattern, isSolved, type CubePattern, type CubeState, type Move } from '../../cube'
import { useProgress } from '../../store'
import { Cube3D, StageControls, useCubeController } from '../../three'
import { Badge, Button, ButtonLink, Card, CubeStage, cx, EmptyState, Icon, IconButton, Kbd, MoveChip, MoveSequence, Page, PlaybackBar, Reveal, SegmentedControl, sound, springs, Sticker, useCelebrations } from '../../ui'
import { pretty } from '../notation/logic/explain'
import { FOLLOW_START, acceptsMove, followMove, type FollowState } from '../notation/logic/follow'
import { patternState, showsPattern, undoMoves } from './logic'
import { Difficulty } from './PatternsPage'
import { usePatterns } from './patternsStore'

type Mode = 'watch' | 'try' | 'follow'
const SPEEDS = [0.5, 1, 2] as const

export default function PatternDetailPage() {
  const { id = '' } = useParams()
  const pattern = getPattern(id)
  if (!pattern) {
    return (
      <Page width="narrow">
        <EmptyState headingLevel="h1" icon="grid" tone="white" title="No pattern by that name" description="All twelve are in the gallery." action={<ButtonLink to="/patterns">Open the gallery</ButtonLink>} />
      </Page>
    )
  }
  return <Detail key={pattern.id} pattern={pattern} />
}

function Detail({ pattern }: { pattern: CubePattern }) {
  const [params, setParams] = useSearchParams()
  const raw = params.get('mode')
  const mode: Mode = raw === 'try' || raw === 'follow' ? raw : 'watch'
  const setMode = (next: Mode) => {
    const updated = new URLSearchParams(params)
    if (next === 'watch') updated.delete('mode')
    else updated.set('mode', next)
    setParams(updated, { replace: true })
  }

  const moves = pattern.moves
  const target = useMemo(() => patternState(pattern), [pattern])
  const undo = useMemo(() => undoMoves(pattern), [pattern])
  const owned = useProgress((s) => s.patterns.includes(pattern.id))
  // While the "Pattern made" card is up it says so; the header's "Collected" joins after it
  // leaves, so one achievement is not four "done" signals at once (design review 2, P-a).
  const celebrating = useCelebrations((s) => s.current !== null)
  const [holdCollected, setHoldCollected] = useState(false)
  const sawCard = useRef(false)
  useEffect(() => {
    if (!holdCollected) return
    if (celebrating) sawCard.current = true
    else if (sawCard.current) setHoldCollected(false)
  }, [celebrating, holdCollected])
  useEffect(() => {
    if (!holdCollected) return
    const safety = window.setTimeout(() => setHoldCollected(false), 6000)
    return () => window.clearTimeout(safety)
  }, [holdCollected])
  const collected = owned && !holdCollected
  const stageBox = useRef<HTMLDivElement>(null)

  const [follow, setFollowState] = useState<FollowState>(FOLLOW_START)
  const followRef = useRef(FOLLOW_START)
  const setFollow = (next: FollowState) => {
    followRef.current = next
    setFollowState(next)
  }
  const [nudge, setNudge] = useState(false)
  const [undoing, setUndoing] = useState(false)
  const [justMade, setJustMade] = useState(false)

  const cube = useCubeController({ initial: SOLVED, onUserMove: (move, state) => handleTurn(move, state) })
  const { controller, player } = cube

  // Set the cube up for the mode (and restore where he was).
  useEffect(() => {
    controller.stop()
    setNudge(false)
    setUndoing(false)
    if (mode === 'try') {
      const at = Math.min(usePatterns.getState().tryAt[pattern.id] ?? 0, moves.length)
      controller.reset(applyAlg(SOLVED, moves.slice(0, at)))
      setFollow({ index: at, partial: null })
    } else {
      controller.load(moves, { from: SOLVED, autoplay: false })
      if (mode === 'follow') controller.seek(usePatterns.getState().followAt[pattern.id] ?? 0)
      setFollow(FOLLOW_START)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, pattern.id])

  const celebrate = () => {
    if (!useProgress.getState().patterns.includes(pattern.id)) {
      sawCard.current = false
      setHoldCollected(true)
    }
    setJustMade(true)
    window.setTimeout(() => setJustMade(false), 2600)
    window.setTimeout(() => {
      // A stage moment: the cube spins, the card lands (with the XP and any badge it earned).
      const already = useProgress.getState().patterns.includes(pattern.id)
      const count = useProgress.getState().patterns.length + (already ? 0 : 1)
      reward('pattern-made', { patternId: pattern.id }, { moment: { eyebrow: already ? 'Made it again' : 'Pattern made', title: pattern.name, subtitle: `${count} of ${ALL_PATTERNS.length} in your collection`, icon: 'grid' } })
    }, 240)
  }

  // ── try it yourself ──

  function handleTurn(move: Move, state: CubeState) {
    if (mode !== 'try') return
    const result = followMove(moves, followRef.current, move)
    if (result.status === 'wrong') return
    setNudge(false)
    setFollow(result.next)
    usePatterns.getState().setTryAt(pattern.id, result.next.index)
    // The real test: does the cube show the pattern, however it is held?
    if (showsPattern(state, pattern)) celebrate()
  }

  const allowMove = useCallback((move: Move) => !controller.getSnapshot().busy && acceptsMove(moves, followRef.current, move), [controller, moves])

  const onRejected = () => {
    if (controller.getSnapshot().busy || followRef.current.index >= moves.length) return
    sound.play('error')
    setNudge(true)
  }

  const restartTry = () => {
    controller.stop()
    controller.reset(SOLVED)
    setFollow(FOLLOW_START)
    setNudge(false)
    usePatterns.getState().setTryAt(pattern.id, 0)
  }

  // ── undo: the same moves backwards ──

  const playUndo = () => {
    controller.stop()
    setUndoing(true)
    controller.load(undo, { from: target, autoplay: true, speed: 1 })
    if (mode === 'try') {
      setFollow(FOLLOW_START)
      usePatterns.getState().setTryAt(pattern.id, 0)
    }
  }

  const watchAgain = () => {
    setUndoing(false)
    controller.load(moves, { from: SOLVED, autoplay: true })
  }

  // After undoing in "try" mode, hand the cube back for another go.
  const undoFinished = undoing && player !== null && player.position >= player.total && !cube.busy
  useEffect(() => {
    if (mode === 'try' && undoFinished) {
      const timer = window.setTimeout(() => {
        setUndoing(false)
        controller.reset(SOLVED)
      }, 1400)
      return () => window.clearTimeout(timer)
    }
  }, [mode, undoFinished, controller])

  // ── follow along ──

  const followPos = mode === 'follow' && player ? player.position : 0
  useEffect(() => {
    if (mode === 'follow' && player) usePatterns.getState().setFollowAt(pattern.id, player.position)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, followPos])

  const stepFollow = useCallback(
    (delta: 1 | -1) => {
      const now = controller.getSnapshot().player
      if (!now) return
      if (delta > 0 && now.position >= now.total) return
      if (delta < 0 && now.position <= 0) return
      controller.step(delta)
    },
    [controller],
  )

  useEffect(() => {
    if (mode !== 'follow') return
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const element = event.target as HTMLElement | null
      if (element?.closest('a, input, button:not([role=radio])')) return
      const inCube = !!element?.closest('.stage')
      if (event.key === ' ' || event.key === 'Enter' || (!inCube && event.key === 'ArrowRight')) {
        event.preventDefault()
        stepFollow(1)
      } else if (event.key === 'Backspace' || (!inCube && event.key === 'ArrowLeft')) {
        event.preventDefault()
        stepFollow(-1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, stepFollow])

  // ── what to show ──

  const showing = showsPattern(cube.state, pattern)
  const solved = isSolved(cube.state)
  const tryDone = mode === 'try' && follow.index >= moves.length && !undoing
  const nextTry = mode === 'try' && !undoing && follow.index < moves.length ? moves[follow.index] : null
  const watchEnd = mode === 'watch' && player !== null && player.position >= player.total
  // Half-way through a double turn, only the same quarter turn again is accepted: point at that.
  const arrow = cube.busy ? null : mode === 'try' ? (nextTry && follow.partial ? follow.partial : nextTry) : mode === 'watch' && player && !player.playing && player.position < player.total && player.position > 0 ? player.alg[player.position] : null
  const followMoveNow = mode === 'follow' && followPos < moves.length ? moves[followPos] : null
  const followDone = mode === 'follow' && followPos >= moves.length

  const undoCard = (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={springs.gentle}>
      <Card padding="md" className="flex flex-col gap-3" data-testid="undo-card">
        <div className="flex items-start gap-3">
          <Sticker tone="accent" icon="undo" size="sm" />
          <div className="min-w-0">
            <h2 className="text-lg text-ink">{undoing && undoFinished ? 'Back to solved' : 'Every algorithm can be undone'}</h2>
            <p className="mt-0.5 text-base text-ink-muted">
              {undoing && undoFinished ? 'That trick works for any moves at all, not just this pattern.' : 'Do the same moves backwards, last one first, and turn each one the other way.'}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5">
          <span className="eyebrow">Made by</span>
          <MoveSequence moves={moves} size="sm" label="The pattern's moves" className={cx(undoing && 'opacity-50')} />
          <span className="eyebrow">Undone by</span>
          <MoveSequence
            moves={undo}
            size="sm"
            label="The moves that undo it"
            activeIndex={undoing && player ? (player.activeIndex >= 0 ? player.activeIndex : player.position) : undefined}
          />
        </div>
        <div className="flex flex-wrap gap-2.5">
          {!undoing && (
            <Button iconLeft="undo" onClick={playUndo} disabled={!showing} data-testid="undo-it">
              Undo it
            </Button>
          )}
          {undoing && mode === 'watch' && undoFinished && (
            <Button variant="secondary" iconLeft="play" onClick={watchAgain}>
              Watch it again
            </Button>
          )}
        </div>
      </Card>
    </motion.div>
  )

  return (
    <Page>
      <Reveal as="header" className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 md:mb-5">
        <Link to="/patterns" aria-label="All patterns" className="key key-secondary grid size-10 shrink-0 place-items-center rounded-sm">
          <Icon name="arrowLeft" size={18} weight={2.4} />
        </Link>
        <div className="min-w-0 grow">
          <h1 className="text-2xl text-ink md:text-3xl">{pattern.name}</h1>
          <Difficulty level={pattern.difficulty} className="mt-1" />
        </div>
        <AnimatePresence mode="popLayout" initial={false}>
          {!holdCollected && (
          <motion.span key={collected ? 'yes' : 'no'} initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={springs.bouncy}>
            {collected ? (
              <Badge tone="green" variant="solid" icon="check" size="md" data-testid="collected-badge">
                Collected
              </Badge>
            ) : (
              <Badge tone="neutral" size="md" data-testid="collected-badge">
                Not made yet
              </Badge>
            )}
          </motion.span>
          )}
        </AnimatePresence>
      </Reveal>

      <Reveal className={cx('grid items-start gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-5', mode === 'follow' && "max-lg:[grid-template-areas:'side'_'stage']")}>
        <motion.div
          ref={stageBox}
          initial={{ scale: 0.94, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={springs.gentle}
          className={cx('flex min-w-0 flex-col gap-3 lg:sticky lg:top-6', mode === 'follow' && 'max-lg:[grid-area:stage]')}
        >
          <CubeStage
            label={`${pattern.name} on the cube`}
            fit="square"
            maxViewHeight={mode === 'follow' ? 'calc(100dvh - 22rem)' : 'calc(100dvh - 18rem)'}
            minViewHeight="15rem"
            className="w-full"
            controls={
              <StageControls
                view={cube.view}
                status={
                  <AnimatePresence mode="popLayout" initial={false}>
                    {(showing || solved) && !cube.busy && (
                      <motion.span key={showing ? 'pattern' : 'solved'} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={springs.bouncy}>
                        <Badge tone={showing ? 'green' : 'neutral'} icon={showing ? 'sparkle' : undefined} data-testid="cube-status">
                          {showing ? pattern.name : 'Solved'}
                        </Badge>
                      </motion.span>
                    )}
                  </AnimatePresence>
                }
              />
            }
          >
            <Cube3D {...cube.bind} mode={mode === 'try' && !undoing ? 'interactive' : 'view'} allowMove={allowMove} onRejectedMove={onRejected} arrow={arrow} debugId="pattern" />
            <AnimatePresence>
              {justMade && (
                <motion.div className="pointer-events-none absolute inset-x-0 bottom-[12%] flex justify-center" initial={{ opacity: 0, y: 14, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }} transition={springs.bouncy} data-testid="made-banner">
                  <span className="rounded-lg bg-ink px-5 py-2.5 font-display text-2xl font-extrabold text-ink-inverse shadow-3">You made it!</span>
                </motion.div>
              )}
            </AnimatePresence>
          </CubeStage>
          {mode === 'watch' && player && (
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
              speeds={SPEEDS}
              onSpeedChange={player.setSpeed}
            />
          )}
        </motion.div>

        <div className={cx('flex min-w-0 flex-col gap-4', mode === 'follow' && 'max-lg:[grid-area:side]')}>
          <SegmentedControl
            ariaLabel="Mode"
            fullWidth
            value={mode}
            onChange={setMode}
            items={[
              { value: 'watch', label: 'Watch' },
              { value: 'try', label: 'Try it' },
              { value: 'follow', label: 'Real cube' },
            ]}
          />

          {mode === 'watch' && player && (
            <>
              {!undoing && (
                <Card padding="md" className="flex flex-col gap-3" data-testid="watch-panel">
                  <p className="text-base text-ink-muted">{pattern.description}</p>
                  <MoveSequence
                    moves={player.alg}
                    size={player.alg.length > 12 ? 'sm' : 'md'}
                    activeIndex={player.detached ? undefined : player.activeIndex >= 0 ? player.activeIndex : player.position}
                    onMoveClick={(index) => player.seek(index + 1)}
                    label={`${pattern.name}, move by move`}
                  />
                  {player.position === 0 && !player.playing && (
                    <Button iconLeft="play" onClick={player.play} className="self-start" data-testid="watch-play">
                      Watch
                    </Button>
                  )}
                </Card>
              )}
              {(watchEnd || undoing) && undoCard}
            </>
          )}

          {mode === 'try' && (
            <>
              {!undoing && (
                <Card padding="md" className="flex flex-col gap-3.5" data-testid="try-panel" data-follow={follow.index}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="eyebrow">{tryDone ? 'Finished' : `Move ${Math.min(follow.index + 1, moves.length)} of ${moves.length}`}</p>
                    <Button variant="ghost" size="sm" iconLeft="restart" onClick={restartTry} disabled={follow.index === 0 && !follow.partial}>
                      Start over
                    </Button>
                  </div>
                  <MoveSequence moves={moves} size={moves.length > 12 ? 'sm' : 'md'} activeIndex={follow.index} label="Moves to do" />
                  <p className="min-h-12 text-base text-ink-muted" aria-live="polite" data-testid="try-line">
                    {tryDone ? (
                      'Make it again with Start over, or take it apart move by move below.'
                    ) : nudge && nextTry ? (
                      <span className="font-semibold text-cube-red-text">
                        Not that one. Next is {pretty(nextTry)}: {describeMove(nextTry).detail.toLowerCase()}
                      </span>
                    ) : follow.partial ? (
                      'Halfway. Once more, the same way.'
                    ) : nextTry ? (
                      <>
                        <span className="font-bold text-ink">{pretty(nextTry)}.</span> {describeMove(nextTry).text}. {describeMove(nextTry).detail}
                      </>
                    ) : null}
                  </p>
                </Card>
              )}
              {(tryDone || undoing) && undoCard}
            </>
          )}

          {mode === 'follow' && (
            <Card padding="md" className="flex flex-col gap-4" data-testid="follow-panel" data-position={followPos}>
              <button
                type="button"
                onClick={() => stepFollow(1)}
                disabled={followDone}
                aria-label={followMoveNow ? `Move ${followPos + 1} of ${moves.length}: ${describeMove(followMoveNow).text}. Tap for the next move.` : 'All moves done'}
                className="group relative grid min-h-52 place-items-center rounded-lg bg-inset px-4 py-5 transition-[background-color,scale] duration-150 ease-out enabled:hover:bg-surface-2 enabled:active:scale-[0.985]"
                data-testid="follow-tap"
              >
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span key={followPos} initial={{ opacity: 0, x: 40, scale: 0.9 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: -40, scale: 0.9 }} transition={springs.snappy} className="flex flex-col items-center gap-2">
                    {followMoveNow ? (
                      <>
                        <span className="font-mono text-[7.5rem] leading-none font-bold tracking-[-0.06em] text-ink sm:text-[9rem]" data-testid="follow-move">
                          {pretty(followMoveNow)}
                        </span>
                        <span className="text-center text-lg font-semibold text-ink-muted">{describeMove(followMoveNow).detail}</span>
                      </>
                    ) : (
                      <>
                        <Sticker tone="green" icon="check" size="xl" />
                        <span className="font-display text-2xl font-bold text-ink">That was the last move</span>
                      </>
                    )}
                  </motion.span>
                </AnimatePresence>
                {followMoveNow && (
                  <span className="absolute right-3 bottom-2.5 flex items-center gap-1.5 text-xs font-bold text-ink-faint max-lg:hidden">
                    Tap or <Kbd>Space</Kbd>
                  </span>
                )}
              </button>

              <div className="flex items-center gap-3">
                <IconButton icon="chevronLeft" label="Previous move" variant="secondary" onClick={() => stepFollow(-1)} disabled={followPos === 0} />
                <div className="min-w-0 grow">
                  <div className="flex items-center justify-between text-sm font-bold text-ink-muted">
                    <span className="num" data-testid="follow-count">
                      {Math.min(followPos + 1, moves.length)} / {moves.length}
                    </span>
                    {followPos + 1 < moves.length && (
                      <span className="flex items-center gap-1.5">
                        then <MoveChip move={moves[followPos + 1]} size="sm" />
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex gap-[3px]" aria-hidden="true">
                    {moves.map((_, i) => (
                      <span key={i} className={cx('h-1.5 grow rounded-full transition-colors duration-200', i < followPos ? 'bg-cube-green' : i === followPos ? 'bg-accent' : 'bg-line-strong/70')} />
                    ))}
                  </div>
                </div>
                <IconButton icon="chevronRight" label="Next move" variant="primary" onClick={() => stepFollow(1)} disabled={followDone} data-testid="follow-next" />
              </div>

              {followDone ? (
                <div className="flex flex-col gap-3 rounded-md bg-cube-green-soft p-4">
                  <p className="text-base font-semibold text-ink">Does your cube look like the one on screen?</p>
                  <div className="flex flex-wrap gap-2.5">
                    {!collected && (
                      <Button variant="success" iconLeft="check" onClick={celebrate} data-testid="follow-made">
                        Yes, I made it
                      </Button>
                    )}
                    <Button variant="secondary" iconLeft="restart" onClick={() => controller.seek(0)}>
                      Back to the start
                    </Button>
                  </div>
                  <p className="text-sm text-ink-muted">To get back to solved, switch to Watch and press “Undo it”, or do the moves backwards.</p>
                </div>
              ) : (
                <p className="flex items-start gap-2 text-sm text-ink-muted">
                  <Icon name="lightbulb" size={16} className="mt-0.5 shrink-0 text-cube-yellow-text" />
                  Start with your real cube solved, white on top and green facing you. Prop this up where you can see it and do one move at a time.
                </p>
              )}
            </Card>
          )}
        </div>
      </Reveal>
    </Page>
  )
}
