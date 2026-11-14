import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { reward } from '../../app/rewards'
import { useProgress } from '../../store'
import { Card, celebration, CelebrationSlot, EmptyState, Field, Page, PageHeader, Reveal, SegmentedControl, sound, Toggle } from '../../ui'
import { FocusOverlay } from './components/FocusOverlay'
import { HistoryCard } from './components/HistoryCard'
import { ScrambleCard } from './components/ScrambleCard'
import { StatsGrid } from './components/StatsGrid'
import { TimeChart, TimeChartLegend, type TimeChartPoint } from './components/TimeChart'
import { TimerPad } from './components/TimerPad'
import { computeStats, rolling } from './logic/averages'
import { formatTime } from './logic/format'
import { inspectionDisplay, inspectionStage } from './logic/inspection'
import { inspectionMs, runningMs, type TimerMachine, type TimerResult } from './logic/machine'
import { bestCounted, countsForRecords, isPersonalBest, reconcileBest, resultMs, type Penalty } from './logic/solves'
import { currentScramble, useTimer } from './timerStore'
import { useTimerEngine } from './useTimerEngine'

type Range = '25' | '100' | 'all'
const RUNNING_KEY = 'rubikku-session:timer-running'
const RANGE_ITEMS: { value: Range; label: string }[] = [
  { value: '25', label: 'Last 25' },
  { value: '100', label: 'Last 100' },
  { value: 'all', label: 'All' },
]

export default function TimerPage() {
  const solves = useTimer((s) => s.solves)
  const scramble = useTimer(currentScramble)
  const scrambleIndex = useTimer((s) => s.scrambleIndex)
  const inspection = useTimer((s) => s.inspection)
  const { addSolve, setPenalty, deleteSolve, clearSolves, nextScramble, previousScramble, setInspection } = useTimer.getState()

  /** The solve that just finished (shown on the pad until the next attempt). Not saved: a reload starts clean. */
  const [last, setLast] = useState<{ id: string; best: boolean; xp: number } | null>(null)
  /** Escape threw the running attempt away (said on the pad until the next attempt). */
  const [cancelled, setCancelled] = useState(false)
  /** The page was reloaded (or closed) while an attempt was running: say so, once (QA P4). */
  const [interrupted, setInterrupted] = useState(() => {
    try {
      // (Cleared by the effect below as soon as the page is idle.)
      return sessionStorage.getItem(RUNNING_KEY) !== null
    } catch {
      return false
    }
  })
  const allTimeBest = useProgress((s) => s.bestSolveMs)
  const [range, setRange] = useState<Range>('25')

  const overlayRoot = useRef<HTMLDivElement>(null)
  const numerals = useRef<HTMLParagraphElement>(null)

  // Make sure the very first scramble is written to storage, so a reload shows the same one.
  useEffect(() => {
    useTimer.setState({})
  }, [])

  const onResult = useCallback(
    (result: TimerResult) => {
      const sessionBest = bestCounted(useTimer.getState().solves)
      const progress = useProgress.getState()
      const recordBefore = progress.bestSolveMs
      const solve = addSolve(result)
      const time = resultMs(solve)
      // A slip of the finger is not a solve: too-quick times and DNFs earn nothing and set no records.
      if (!countsForRecords(solve)) {
        setLast({ id: solve.id, best: false, xp: 0 })
        sound.play('tap')
        return
      }
      const best = isPersonalBest(time, [sessionBest, recordBefore])
      // Beating a time he already had is a personal best worth a moment. (The very first time is
      // "best" by default: no card for that — its badge, if any, says it.)
      const record = best && (sessionBest !== null || recordBefore !== null)
      // Quiet: in a long session a "+40 XP" toast for every solve is noise. The XP is shown on
      // the pad beside the time; only a level-up, a new badge or the daily challenge raises a
      // card. Capped at a moment: the next attempt is one key press away, so nothing here takes
      // over the screen (a level-up or a first solve shows as a card).
      const earned = reward(
        'solve-completed',
        { context: 'timer', ms: time },
        { mode: 'quiet', cap: 'moment', moment: record ? { eyebrow: 'Personal best', title: formatTime(time), subtitle: 'Your fastest solve yet.', art: { time: formatTime(time) }, icon: 'timer', cube: null } : undefined },
      )
      setLast({ id: solve.id, best, xp: earned.xpGained })
      if (!record && !earned.leveledUp && earned.newBadges.length === 0) sound.play('tap')
    },
    [addSolve],
  )

  const onFrame = useCallback((machine: TimerMachine, now: number) => {
    const el = numerals.current
    const root = overlayRoot.current
    if (!el || !root) return
    let text: string
    let stage: string
    if (machine.phase === 'running') {
      text = formatTime(runningMs(machine, now))
      stage = 'run'
    } else if (machine.inspectStart !== null) {
      const used = inspectionMs(machine, now)
      text = inspectionDisplay(used)
      stage = inspectionStage(used)
    } else return
    if (el.textContent !== text) el.textContent = text
    if (root.dataset.stage !== stage) root.dataset.stage = stage
  }, [])

  const engine = useTimerEngine({
    inspection,
    onResult,
    onFrame,
    onAttempt: () => {
      setLast(null)
      setCancelled(false)
      setInterrupted(false)
    },
    onAbandon: () => setCancelled(true),
  })

  // While an attempt is under way (holding, inspecting, running) celebrations wait their turn,
  // and one still on screen from the last solve gets out of the way.
  const attempting = engine.machine.phase !== 'idle'
  // Mark a running attempt in this tab's session, so a reload mid-solve can say what happened.
  const live = engine.machine.phase === 'running' || engine.machine.phase === 'inspecting'
  useEffect(() => {
    try {
      if (live) sessionStorage.setItem(RUNNING_KEY, String(Date.now()))
      else sessionStorage.removeItem(RUNNING_KEY)
    } catch {
      /* nothing to say after a reload, then */
    }
  }, [live])
  useEffect(() => {
    if (!attempting) return
    const release = celebration.hold()
    celebration.dismiss()
    return release
  }, [attempting])

  const results = useMemo(() => solves.map(resultMs), [solves])
  const stats = useMemo(() => {
    const all = computeStats(results)
    // "Best" is the best real solve: a slip that is still in the list is not a record.
    let bestIndex = -1
    solves.forEach((solve, i) => {
      if (countsForRecords(solve) && (bestIndex < 0 || results[i] < results[bestIndex])) bestIndex = i
    })
    return { ...all, best: bestIndex >= 0 ? results[bestIndex] : null, bestIndex }
  }, [results, solves])
  const bestId = stats.bestIndex >= 0 ? solves[stats.bestIndex].id : null

  const points = useMemo((): TimeChartPoint[] => {
    const ao5 = rolling(results, 5)
    const all = solves.map((solve, i) => ({ solve, number: i + 1, result: results[i], ao5: ao5[i], isBest: i === stats.bestIndex }))
    return range === 'all' ? all : all.slice(-Number(range))
  }, [solves, results, stats.bestIndex, range])

  const lastSolve = last ? (solves.find((solve) => solve.id === last.id) ?? null) : null
  const empty = solves.length === 0

  /**
   * Fixing the list fixes the record: after a delete or a change of penalty the all-time best
   * is brought back in line with the solves that still stand (see `reconcileBest`).
   */
  const edit = (id: string, change: () => void) => {
    const before = useTimer.getState().solves.find((solve) => solve.id === id) ?? null
    change()
    const progress = useProgress.getState()
    progress.correctBestSolve(reconcileBest(progress.bestSolveMs, before, useTimer.getState().solves))
  }
  const changePenalty = (id: string, penalty: Penalty) => edit(id, () => setPenalty(id, penalty))
  const remove = (id: string) => {
    edit(id, () => deleteSolve(id))
    if (last?.id === id) setLast(null)
  }
  // The badge stays only while it is true: a +2 or a faster solve elsewhere takes it away.
  const lastIsBest = Boolean(last?.best) && lastSolve !== null && countsForRecords(lastSolve) && resultMs(lastSolve) === allTimeBest

  return (
    <Page>
      <PageHeader title="Timer" lede="Scramble, solve, and watch your times drop." />

      {/* On a phone the pad comes first (it is what he came for); the scramble follows. */}
      <div className="flex flex-col">
      <Reveal className="max-sm:order-2 max-sm:mt-4">
        <ScrambleCard scramble={scramble} canGoBack={scrambleIndex > 0} onPrevious={previousScramble} onNext={nextScramble} />
      </Reveal>

      <Reveal className="mt-4 max-sm:order-1 max-sm:mt-0">
        <TimerPad
          machine={engine.machine}
          padProps={engine.padProps}
          inspection={inspection}
          last={lastSolve}
          lastIsBest={lastIsBest}
          xp={last?.xp ?? 0}
          cancelled={cancelled || interrupted}
          cancelledText={interrupted && !cancelled ? 'The page reloaded while the timer was running, so that one wasn’t saved.' : undefined}
          onPenalty={(penalty) => lastSolve && changePenalty(lastSolve.id, penalty)}
          onDelete={() => {
            if (lastSolve) remove(lastSolve.id)
            setLast(null)
          }}
        />
        {/* On a phone a personal best or a badge lands here, under the pad — never over it. */}
        <CelebrationSlot media="(max-width: 639.98px)" />
      </Reveal>
      </div>

      <Reveal className="mt-4">
        <Card padding="none" className="px-5 sm:px-6">
          <Field label="15-second inspection" labelId="inspection-label" hint="Like a competition: look first, then start. Over 15 seconds adds +2.">
            <Toggle labelledBy="inspection-label" checked={inspection} onChange={setInspection} />
          </Field>
        </Card>
      </Reveal>

      {empty ? (
        <Reveal className="mt-8">
          <EmptyState
            icon="timer"
            tone="white"
            title="No times yet"
            description={
              <>
                Mix up your cube with the scramble above, then hold Space or the big pad and let go to start.
                <br />
                When the cube is solved, tap anywhere or press any key to stop the clock.
              </>
            }
          />
        </Reveal>
      ) : (
        <>
          <Reveal as="section" className="mt-8" >
            <h2 className="mb-3.5 text-xl text-ink">Your records</h2>
            <StatsGrid stats={stats} />
          </Reveal>

          <Reveal as="section" className="mt-8">
            <Card padding="none" className="p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
                <div>
                  <h2 className="text-xl text-ink">Getting faster</h2>
                  <p className="text-sm text-ink-muted">{solves.length < 5 ? 'Lower is faster. The average line starts at your fifth solve.' : 'Lower is faster. Watch the blue line: that is your average of 5.'}</p>
                </div>
                {solves.length > 25 && <SegmentedControl ariaLabel="Solves shown" size="sm" items={RANGE_ITEMS} value={range} onChange={setRange} />}
              </div>
              <TimeChart points={points} className="mt-3" />
              <TimeChartLegend showAverage={solves.length >= 5} className="mt-2" />
            </Card>
          </Reveal>

          <Reveal as="section" className="mt-8">
            <HistoryCard
              solves={solves}
              bestId={bestId}
              onPenalty={changePenalty}
              onDelete={remove}
              onClear={() => {
                clearSolves()
                setLast(null)
              }}
            />
          </Reveal>
        </>
      )}

      <FocusOverlay machine={engine.machine} rootRef={overlayRoot} numeralsRef={numerals} />
    </Page>
  )
}
