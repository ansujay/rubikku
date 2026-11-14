import { describe, expect, it } from 'vitest'
import { averageOf, bestOf, computeStats, meanOf, rolling } from './averages'
import { axisNeedsDecimals, indexTicks, timeAxis } from './chartScale'
import { formatAxisTime, formatResult, formatSolve, formatTime, formatWhen, spokenTime } from './format'
import { INSPECTION_DNF_MS, INSPECTION_MS, inspectionDisplay, inspectionPenalty, inspectionStage } from './inspection'
import { HOLD_MS, initialMachine, inspectionMs, runningMs, stepTimer, type TimerEvent, type TimerMachine, type TimerResult } from './machine'
import { bestCounted, bestResult, countsForRecords, DNF, isPersonalBest, reconcileBest, RECORD_FLOOR_MS, resultMs, sanitizeSolves, truncateCentis, type Solve } from './solves'

const s = (seconds: number) => seconds * 1000

describe('results and penalties', () => {
  it('truncates to hundredths', () => {
    expect(truncateCentis(12_349)).toBe(12_340)
    expect(truncateCentis(9)).toBe(0)
    expect(truncateCentis(-5)).toBe(0)
  })

  it('applies +2 and DNF', () => {
    expect(resultMs({ ms: 12_349, penalty: 'ok' })).toBe(12_340)
    expect(resultMs({ ms: 12_349, penalty: '+2' })).toBe(14_340)
    expect(resultMs({ ms: 12_349, penalty: 'dnf' })).toBe(DNF)
  })

  it('finds the best result, ignoring DNFs', () => {
    expect(bestResult([])).toBeNull()
    expect(bestResult([{ ms: 5000, penalty: 'dnf' }])).toBeNull()
    expect(bestResult([{ ms: 9000, penalty: 'ok' }, { ms: 8000, penalty: '+2' }, { ms: 1000, penalty: 'dnf' }])).toBe(9000)
  })

  it('knows a personal best', () => {
    expect(isPersonalBest(9000, [null, null])).toBe(true)
    expect(isPersonalBest(9000, [9500, null])).toBe(true)
    expect(isPersonalBest(9000, [9500, 8000])).toBe(false)
    expect(isPersonalBest(9000, [9000])).toBe(false)
    expect(isPersonalBest(DNF, [null])).toBe(false)
  })

  it('cleans up saved solves', () => {
    const good: Solve = { id: 'a', ms: 1234.4, penalty: '+2', scramble: 'R U', at: '2026-01-02T03:04:05.000Z' }
    const out = sanitizeSolves(
      [good, null, 'x', { ...good }, { ...good, id: 'b', ms: -1 }, { ...good, id: 'c', at: 'nope' }, { ...good, id: 'd', penalty: 'weird', scramble: 7 }, { ...good, id: '' }],
      10,
    )
    expect(out).toEqual([
      { ...good, ms: 1234 },
      { id: 'd', ms: 1234, penalty: 'ok', scramble: '', at: good.at },
    ])
    expect(sanitizeSolves('nope', 10)).toEqual([])
    const many = Array.from({ length: 30 }, (_, i) => ({ ...good, id: `n${i}` }))
    const capped = sanitizeSolves(many, 5)
    expect(capped.map((x) => x.id)).toEqual(['n25', 'n26', 'n27', 'n28', 'n29'])
  })
})

describe('what counts for records (M10)', () => {
  const ok = (ms: number) => ({ ms, penalty: 'ok' as const })

  it('a slip or a test press is not a solve: nothing under the floor counts, nor does a DNF', () => {
    expect(countsForRecords(ok(400))).toBe(false)
    expect(countsForRecords(ok(4_100))).toBe(false)
    expect(countsForRecords(ok(RECORD_FLOOR_MS - 1))).toBe(false)
    expect(countsForRecords(ok(RECORD_FLOOR_MS))).toBe(true)
    expect(countsForRecords({ ms: 60_000, penalty: '+2' })).toBe(true)
    expect(countsForRecords({ ms: 60_000, penalty: 'dnf' })).toBe(false)
    expect(bestCounted([ok(4_100), ok(62_000), { ms: 30_000, penalty: 'dnf' }, ok(71_000)])).toBe(62_000)
    expect(bestCounted([ok(4_100)])).toBeNull()
  })

  it('deleting the solve the record points at moves the record to the fastest solve still standing', () => {
    const best = ok(45_000)
    expect(reconcileBest(45_000, best, [ok(62_000), ok(58_010)])).toBe(58_010)
    expect(reconcileBest(45_000, best, [])).toBeNull()
    expect(reconcileBest(45_000, best, [ok(4_000)])).toBeNull()
  })

  it('a +2 or DNF on the record solve is reflected, and taking it off again restores it', () => {
    const best = ok(45_000)
    // +2: the same solve, two seconds slower, is still the fastest.
    expect(reconcileBest(45_000, best, [{ ms: 45_000, penalty: '+2' }, ok(62_000)])).toBe(47_000)
    // +2 puts it behind another solve.
    expect(reconcileBest(45_000, best, [{ ms: 45_000, penalty: '+2' }, ok(46_000)])).toBe(46_000)
    // DNF: it is no longer a time at all.
    expect(reconcileBest(45_000, best, [{ ms: 45_000, penalty: 'dnf' }, ok(62_000)])).toBe(62_000)
    // Back to OK: it is the record again.
    expect(reconcileBest(62_000, { ms: 45_000, penalty: 'dnf' }, [ok(45_000), ok(62_000)])).toBe(45_000)
  })

  it('leaves the record alone when another solve changes, or when its solve is long gone', () => {
    expect(reconcileBest(45_000, ok(62_000), [ok(45_000)])).toBe(45_000)
    // The record was set in a session that has been cleared: later edits do not erase it.
    expect(reconcileBest(45_000, ok(62_000), [ok(70_000)])).toBe(45_000)
    expect(reconcileBest(45_000, ok(62_000), [])).toBe(45_000)
    // A slip never held the record, so deleting it changes nothing.
    expect(reconcileBest(45_000, ok(4_000), [ok(70_000)])).toBe(45_000)
    expect(reconcileBest(null, ok(4_000), [])).toBeNull()
  })
})

describe('formatting', () => {
  it('writes stopwatch times', () => {
    expect(formatTime(0)).toBe('0.00')
    expect(formatTime(8049)).toBe('8.04')
    expect(formatTime(59_999)).toBe('59.99')
    expect(formatTime(60_000)).toBe('1:00.00')
    expect(formatTime(62_305)).toBe('1:02.30')
    expect(formatTime(725_000)).toBe('12:05.00')
    expect(formatTime(DNF)).toBe('DNF')
  })

  it('writes results and solves', () => {
    expect(formatResult(null)).toBe('—')
    expect(formatResult(DNF)).toBe('DNF')
    expect(formatResult(12_340)).toBe('12.34')
    expect(formatSolve({ ms: 12_349, penalty: 'ok' })).toBe('12.34')
    expect(formatSolve({ ms: 12_349, penalty: '+2' })).toBe('14.34+')
    expect(formatSolve({ ms: 12_349, penalty: 'dnf' })).toBe('DNF')
  })

  it('writes axis labels in m:ss', () => {
    expect(formatAxisTime(0)).toBe('0:00')
    expect(formatAxisTime(45_000)).toBe('0:45')
    expect(formatAxisTime(90_000)).toBe('1:30')
    expect(formatAxisTime(720_000)).toBe('12:00')
  })

  it('reads times aloud', () => {
    expect(spokenTime(8040)).toBe('8.04 seconds')
    expect(spokenTime(62_300)).toBe('1 minute 2.30 seconds')
    expect(spokenTime(DNF)).toBe('did not finish')
  })

  it('writes friendly dates', () => {
    const now = new Date(2026, 10, 12, 15, 0)
    expect(formatWhen(new Date(2026, 10, 12, 9, 5).toISOString(), now)).toBe('Today, 9:05 AM')
    expect(formatWhen(new Date(2026, 10, 11, 23, 59).toISOString(), now)).toBe('Yesterday, 11:59 PM')
    expect(formatWhen(new Date(2026, 10, 3, 16, 30).toISOString(), now)).toBe('3 Nov, 4:30 PM')
    expect(formatWhen(new Date(2025, 11, 25, 16, 30).toISOString(), now)).toBe('25 Dec 2025')
    expect(formatWhen('rubbish', now)).toBe('')
  })
})

describe('averages (WCA rules)', () => {
  it('mean of 3 is a plain mean, and any DNF spoils it', () => {
    expect(meanOf([])).toBeNull()
    expect(meanOf([s(10), s(11), s(12)])).toBe(s(11))
    expect(meanOf([s(10), DNF, s(12)])).toBe(DNF)
    expect(meanOf([10_000, 10_000, 10_010])).toBe(10_000) // 10.0033 → 10.00
  })

  it('average of 5 drops the best and the worst', () => {
    expect(averageOf([s(10), s(20), s(12), s(13), s(11)])).toBe(s(12))
    expect(averageOf([s(1), s(12), s(12), s(12), s(999)])).toBe(s(12))
    expect(averageOf([s(10), s(11)])).toBeNull()
  })

  it('one DNF counts as the worst; two make the average a DNF', () => {
    expect(averageOf([s(10), DNF, s(12), s(13), s(11)])).toBe(s(12))
    expect(averageOf([s(10), DNF, s(12), DNF, s(11)])).toBe(DNF)
    expect(averageOf(Array.from({ length: 12 }, (_, i) => (i === 3 ? DNF : s(10 + i))))).toBe(16_300) // drop 10 and the DNF → mean of 11, 12, 14 … 21
  })

  it('rounds averages to the nearest hundredth', () => {
    expect(averageOf([s(1), 10_000, 10_000, 10_020, s(99)])).toBe(10_010) // 10.0067 → 10.01
  })

  it('computes rolling series aligned to the last solve of each window', () => {
    const results = [s(10), s(20), s(12), s(13), s(11), s(9)]
    expect(rolling(results, 5)).toEqual([null, null, null, null, s(12), s(12)])
    expect(rolling(results, 3, meanOf)).toEqual([null, null, s(14), s(15), s(12), s(11)])
    expect(bestOf(rolling(results, 3, meanOf))).toBe(s(11))
    expect(bestOf([null, DNF])).toBeNull()
  })

  it('summarises a session', () => {
    expect(computeStats([])).toMatchObject({ count: 0, finished: 0, latest: null, best: null, bestIndex: -1, mean: null, mo3: null, ao5: null, ao12: null })
    const one = computeStats([s(30)])
    expect(one).toMatchObject({ count: 1, best: s(30), bestIndex: 0, latest: s(30), mo3: null, ao5: null })
    const stats = computeStats([s(30), s(20), DNF, s(25), s(22), s(21)])
    expect(stats).toMatchObject({ count: 6, finished: 5, latest: s(21), best: s(20), bestIndex: 1, worst: s(30) })
    expect(stats.mean).toBe(s(23.6))
    expect(stats.mo3).toBe(22_670) // (25+22+21)/3 = 22.666…
    expect(stats.ao5).toBe(22_670) // 20, DNF, 25, 22, 21 → drop 20 and DNF
    expect(stats.bestAo5).toBe(22_670) // first window: 30,20,DNF,25,22 → (30+25+22)/3 = 25.67
    expect(stats.bestMo3).toBe(22_670)
    expect(stats.ao12).toBeNull()
    expect(computeStats([DNF, DNF])).toMatchObject({ best: null, bestIndex: -1, latest: DNF, mean: null, finished: 0 })
  })
})

describe('inspection rules', () => {
  it('changes stage at 8, 12 and 15 seconds', () => {
    expect(inspectionStage(0)).toBe('calm')
    expect(inspectionStage(7999)).toBe('calm')
    expect(inspectionStage(8000)).toBe('eight')
    expect(inspectionStage(12_000)).toBe('twelve')
    expect(inspectionStage(15_000)).toBe('over')
  })

  it('gives +2 after 15 s and DNF after 17 s', () => {
    expect(inspectionPenalty(14_999)).toBe('ok')
    expect(inspectionPenalty(INSPECTION_MS)).toBe('ok')
    expect(inspectionPenalty(15_001)).toBe('+2')
    expect(inspectionPenalty(INSPECTION_DNF_MS)).toBe('+2')
    expect(inspectionPenalty(17_001)).toBe('dnf')
  })

  it('counts down in whole seconds', () => {
    expect(inspectionDisplay(0)).toBe('15')
    expect(inspectionDisplay(1)).toBe('15')
    expect(inspectionDisplay(1000)).toBe('14')
    expect(inspectionDisplay(14_500)).toBe('1')
    expect(inspectionDisplay(15_000)).toBe('+2')
  })
})

/** Run a list of events; returns the final state and every result produced. */
function run(events: TimerEvent[], inspection = false, start: TimerMachine = initialMachine) {
  let state = start
  const results: TimerResult[] = []
  for (const event of events) {
    const step = stepTimer(state, event, { inspection })
    state = step.state
    if (step.result) results.push(step.result)
  }
  return { state, results }
}
const press = (at: number): TimerEvent => ({ type: 'press', at })
const release = (at: number): TimerEvent => ({ type: 'release', at })
const tick = (at: number): TimerEvent => ({ type: 'tick', at })

describe('timer state machine', () => {
  it('hold, release to start, press to stop', () => {
    let { state } = run([press(1000)])
    expect(state.phase).toBe('holding')
    ;({ state } = run([tick(1000 + HOLD_MS - 1)], false, state))
    expect(state.phase).toBe('holding')
    ;({ state } = run([tick(1000 + HOLD_MS)], false, state))
    expect(state.phase).toBe('ready')
    ;({ state } = run([release(1500)], false, state))
    expect(state.phase).toBe('running')
    expect(runningMs(state, 2500)).toBe(1000)
    const end = run([tick(5000), press(13_840)], false, state)
    expect(end.results).toEqual([{ ms: 12_340, penalty: 'ok' }])
    expect(end.state.phase).toBe('idle')
  })

  it('a quick tap does not start the timer', () => {
    const { state, results } = run([press(0), tick(100), release(200)])
    expect(state).toEqual(initialMachine)
    expect(results).toEqual([])
  })

  it('a long hold starts on release even if no frame ticked in between', () => {
    const { state } = run([press(0), release(HOLD_MS + 50)])
    expect(state.phase).toBe('running')
    expect(state.runStart).toBe(HOLD_MS + 50)
  })

  it('the press that stops cannot start the next attempt', () => {
    const stopped = run([press(0), tick(400), release(500), press(9000)])
    expect(stopped.results).toHaveLength(1)
    // Key repeat / still held: more presses and ticks do nothing.
    let { state } = run([press(9050), tick(9500), press(9600)], false, stopped.state)
    expect(state.phase).toBe('idle')
    ;({ state } = run([release(9700)], false, state))
    expect(state).toEqual(initialMachine)
    ;({ state } = run([press(10_000), tick(10_400)], false, state))
    expect(state.phase).toBe('ready')
  })

  it('ignores extra presses while holding and releases while running', () => {
    const { state, results } = run([press(0), press(50), tick(400), press(420), release(500), release(600), tick(700)])
    expect(state.phase).toBe('running')
    expect(results).toEqual([])
  })

  it('cancel drops a hold but never a running solve', () => {
    expect(run([press(0), tick(400), { type: 'cancel' }]).state).toEqual(initialMachine)
    const running = run([press(0), tick(400), release(500), { type: 'cancel' }])
    expect(running.state.phase).toBe('running')
    expect(run([{ type: 'reset' }], false, running.state).state).toEqual(initialMachine)
  })

  it('cancel clears a lost key-up after a stop (window blur)', () => {
    const stopped = run([press(0), tick(400), release(500), press(9000), { type: 'cancel' }])
    expect(stopped.state).toEqual(initialMachine)
  })

  it('with inspection, a tap starts the countdown and a hold starts the solve', () => {
    let { state } = run([press(0)], true)
    expect(state.phase).toBe('idle')
    ;({ state } = run([release(100)], true, state))
    expect(state.phase).toBe('inspecting')
    expect(inspectionMs(state, 5100)).toBe(5000)
    // A short tap during inspection does nothing.
    ;({ state } = run([press(3000), release(3100)], true, state))
    expect(state.phase).toBe('inspecting')
    ;({ state } = run([press(6000), tick(6400)], true, state))
    expect(state.phase).toBe('ready')
    ;({ state } = run([release(7000)], true, state))
    expect(state).toMatchObject({ phase: 'running', runStart: 7000, penalty: 'ok' })
    expect(run([press(27_000)], true, state).results).toEqual([{ ms: 20_000, penalty: 'ok' }])
  })

  it('starting between 15 and 17 seconds of inspection costs +2', () => {
    const { state, results } = run([press(0), release(0), tick(15_000), press(15_200), tick(15_600), release(15_700), press(25_700)], true)
    expect(results).toEqual([{ ms: 10_000, penalty: '+2' }])
    expect(state.phase).toBe('idle')
  })

  it('inspection past 17 seconds is a DNF', () => {
    const idle = run([press(0), release(0), tick(16_999)], true)
    expect(idle.state.phase).toBe('inspecting')
    const out = run([tick(17_001)], true, idle.state)
    expect(out.results).toEqual([{ ms: 0, penalty: 'dnf' }])
    expect(out.state).toEqual(initialMachine)
  })

  it('a DNF while a finger is down waits for the release', () => {
    const { state, results } = run([press(0), release(0), press(16_800), tick(17_100)], true)
    expect(results).toEqual([{ ms: 0, penalty: 'dnf' }])
    expect(state.awaitRelease).toBe(true)
    expect(run([release(17_200)], true, state).state).toEqual(initialMachine)
  })

  it('reset (Escape) while running abandons the attempt: no result, and the next attempt starts clean', () => {
    let state: TimerMachine = initialMachine
    for (const event of [{ type: 'press', at: 0 }, { type: 'tick', at: HOLD_MS }, { type: 'release', at: HOLD_MS + 10 }] as TimerEvent[]) state = stepTimer(state, event, { inspection: false }).state
    expect(state.phase).toBe('running')
    const abandoned = stepTimer(state, { type: 'reset' }, { inspection: false })
    expect(abandoned.result).toBeUndefined()
    expect(abandoned.state).toEqual(initialMachine)
    expect(stepTimer(abandoned.state, { type: 'press', at: 9_000 }, { inspection: false }).state.phase).toBe('holding')
  })

  it('cancel during an inspection hold keeps inspecting; reset abandons it', () => {
    const { state } = run([press(0), release(0), press(2000), tick(2400), { type: 'cancel' }], true)
    expect(state.phase).toBe('inspecting')
    expect(state.inspectStart).toBe(0)
    expect(run([{ type: 'reset' }], true, state).state).toEqual(initialMachine)
  })

  it('returns the same state object when nothing changes (no re-render per frame)', () => {
    const running = run([press(0), tick(400), release(500)]).state
    expect(stepTimer(running, tick(600), { inspection: false }).state).toBe(running)
    expect(stepTimer(initialMachine, tick(600), { inspection: false }).state).toBe(initialMachine)
    expect(stepTimer(initialMachine, { type: 'reset' }, { inspection: false }).state).toBe(initialMachine)
  })
})

describe('chart axes', () => {
  it('picks readable steps and round bounds', () => {
    const axis = timeAxis(41_000, 118_000)
    expect(axis.step).toBe(30_000)
    expect(axis.ticks).toEqual([30_000, 60_000, 90_000, 120_000])
    expect(axis.min).toBe(30_000)
    expect(axis.max).toBe(120_000)
  })

  it('gives a single value some room, never below zero', () => {
    const axis = timeAxis(2000, 2000)
    expect(axis.min).toBeLessThan(2000)
    expect(axis.max).toBeGreaterThan(2000)
    expect(axis.min).toBeGreaterThanOrEqual(0)
    expect(timeAxis(0, 0).min).toBe(0)
    expect(timeAxis(Number.NaN, Number.POSITIVE_INFINITY).ticks.length).toBeGreaterThan(1)
  })

  it('always brackets the data with at least two ticks', () => {
    for (const [lo, hi] of [[8000, 9000], [300, 700], [55_000, 610_000], [3_000_000, 9_000_000], [12_340, 12_350]]) {
      const axis = timeAxis(lo, hi)
      expect(axis.min).toBeLessThanOrEqual(lo)
      expect(axis.max).toBeGreaterThanOrEqual(hi)
      expect(axis.ticks.length).toBeGreaterThanOrEqual(2)
      expect(axis.ticks.length).toBeLessThanOrEqual(7)
    }
    expect(axisNeedsDecimals(timeAxis(300, 700))).toBe(true)
    expect(axisNeedsDecimals(timeAxis(8000, 90_000))).toBe(false)
  })

  it('labels solve numbers sparsely', () => {
    expect(indexTicks(1, 0)).toEqual([])
    expect(indexTicks(1, 1)).toEqual([1])
    expect(indexTicks(1, 2)).toEqual([1, 2])
    expect(indexTicks(1, 5)).toEqual([1, 2, 3, 4, 5])
    const ticks = indexTicks(1, 100)
    expect(ticks[0]).toBe(1)
    expect(ticks[ticks.length - 1]).toBe(100)
    expect(ticks.length).toBeLessThanOrEqual(7)
    expect(indexTicks(76, 100).every((t) => t >= 76 && t <= 100)).toBe(true)
  })
})
