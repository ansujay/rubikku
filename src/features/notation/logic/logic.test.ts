import { describe, expect, it } from 'vitest'
import { ALL_MOVES, invertMove, moveAmount, moveBase, moveKind, seededRng, type Move } from '../../../cube'
import { explainWrongChoice, explainWrongTurn } from './explain'
import { FOLLOW_START, acceptsMove, followAll, followFraction, followMove } from './follow'
import { LEVELS, levelMoves, levelsFor, passesLevel, speedPool } from './levels'
import { currentRun, masteryOf, moveWeight, movesToWorkOn, recordAnswer, scoreRound, type AnswerRecord, type MoveStats } from './mastery'
import { makeQuestion, makeRound, nameOptions, oppositeFaceMove, pickMove } from './questions'

const m = (text: string) => text.split(' ') as Move[]

describe('followMove', () => {
  it('accepts the exact move', () => {
    expect(followAll(m('R'), m('R')).status).toBe('complete')
    expect(followAll(m("R'"), m("R'")).status).toBe('complete')
  })

  it('rejects the inverse and other faces', () => {
    expect(followAll(m('R'), m("R'")).status).toBe('wrong')
    expect(followAll(m('R'), m('L')).status).toBe('wrong')
    expect(followAll(m('R'), m('r')).status).toBe('wrong')
  })

  it('takes a double turn as two quarter turns in either direction', () => {
    expect(followAll(m('R2'), m('R R')).status).toBe('complete')
    expect(followAll(m('R2'), m("R' R'")).status).toBe('complete')
    expect(followAll(m('R2'), m('R2')).status).toBe('complete')
    expect(followAll(m('M2'), m("M' M'")).status).toBe('complete')
  })

  it('is half done after the first quarter of a double', () => {
    const half = followMove(m('R2'), FOLLOW_START, 'R')
    expect(half.status).toBe('progress')
    expect(half.next).toEqual({ index: 0, partial: 'R' })
    expect(followFraction(m('R2'), half.next)).toBe(0.5)
  })

  it('rejects a double that turns back or changes face half-way', () => {
    expect(followAll(m('R2'), m("R R'")).status).toBe('wrong')
    expect(followAll(m('R2'), m('R U')).status).toBe('wrong')
    expect(followAll(m('R2'), m('L')).status).toBe('wrong')
    expect(followAll(m('R2'), m('r')).status).toBe('wrong')
  })

  it('does not take a half turn for a quarter turn', () => {
    expect(followAll(m('R'), m('R2')).status).toBe('wrong')
  })

  it('walks a sequence and reports which move went wrong', () => {
    const alg = m("R U2 R' F")
    expect(followAll(alg, m("R U U R' F")).status).toBe('complete')
    expect(followAll(alg, m("R U' U' R' F")).status).toBe('complete')
    const partway = followAll(alg, m('R U'))
    expect(partway.status).toBe('progress')
    expect(partway.next).toEqual({ index: 1, partial: 'U' })
    const wrong = followAll(alg, m('R U U R'))
    expect(wrong.status).toBe('wrong')
    expect(wrong.expected).toBe("R'")
    expect(wrong.next.index).toBe(2)
  })

  it('takes one long drag for two identical quarter turns', () => {
    expect(followAll(m('R R U'), m('R2 U')).status).toBe('complete')
    expect(followAll(m('R U'), m('R2')).status).toBe('wrong')
  })

  it('never accepts anything after the end', () => {
    expect(followMove(m('R'), { index: 1, partial: null }, 'R').status).toBe('wrong')
    expect(acceptsMove(m('R'), FOLLOW_START, 'R')).toBe(true)
    expect(acceptsMove(m('R'), FOLLOW_START, 'U')).toBe(false)
  })
})

describe('levels', () => {
  it('start with the six clockwise faces and add one idea at a time', () => {
    expect([...LEVELS[0].focus].sort()).toEqual(['B', 'D', 'F', 'L', 'R', 'U'])
    expect(LEVELS[1].focus.every((move) => moveAmount(move) === 3)).toBe(true)
    expect(LEVELS[2].focus.every((move) => moveAmount(move) === 2)).toBe(true)
    expect(levelMoves(LEVELS[3])).toHaveLength(18)
    expect(LEVELS[4].sequence).toEqual([2, 4])
    expect(LEVELS[5].focus.every((move) => moveKind(move) !== 'face')).toBe(true)
  })

  it('has no sequence level in "name the move"', () => {
    expect(levelsFor('name').map((l) => l.id)).toEqual(['faces', 'primes', 'doubles', 'mixed', 'extras'])
    expect(levelsFor('do')).toHaveLength(6)
  })

  it('passes at 80%', () => {
    expect(passesLevel(8, 10)).toBe(true)
    expect(passesLevel(7, 10)).toBe(false)
    expect(passesLevel(0, 0)).toBe(false)
  })

  it('speed pool grows with the levels and never has bonus moves', () => {
    expect(speedPool(0).focus).toHaveLength(6)
    expect(speedPool(0).review).toHaveLength(0)
    const later = speedPool(5)
    expect([...later.focus, ...later.review].every((move) => moveKind(move) === 'face')).toBe(true)
    expect(new Set([...later.focus, ...later.review]).size).toBe(18)
  })
})

describe('mastery', () => {
  it('tracks seen, correct and recent accuracy', () => {
    let stats: MoveStats = {}
    stats = recordAnswer(stats, 'R', true)
    expect(stats.R).toEqual({ seen: 1, correct: 1, recent: 0.6 })
    stats = recordAnswer(stats, 'R', false)
    expect(stats.R.seen).toBe(2)
    expect(stats.R.correct).toBe(1)
    expect(stats.R.recent).toBeLessThan(0.6)
  })

  it('needs a few right answers before a move is mastered', () => {
    let stats: MoveStats = {}
    expect(masteryOf(stats.R)).toBe(0)
    stats = recordAnswer(stats, 'R', true)
    expect(masteryOf(stats.R)).toBe(2)
    for (let i = 0; i < 3; i++) stats = recordAnswer(stats, 'R', true)
    expect(masteryOf(stats.R)).toBe(3)
    stats = recordAnswer(recordAnswer(stats, 'R', false), 'R', false)
    expect(masteryOf(stats.R)).toBeLessThan(3)
    stats = recordAnswer({}, 'L', false)
    expect(masteryOf(stats.L)).toBe(1)
  })

  it('weights shaky moves above mastered ones', () => {
    let good: MoveStats = {}
    for (let i = 0; i < 6; i++) good = recordAnswer(good, 'R', true)
    const bad = recordAnswer(recordAnswer({}, 'R', false), 'R', false)
    expect(moveWeight(bad.R)).toBeGreaterThan(moveWeight(good.R) * 2.5)
    expect(moveWeight(undefined)).toBeGreaterThan(moveWeight(good.R))
  })

  it('scores a round with streaks', () => {
    const answers: AnswerRecord[] = [
      { moves: m('R'), result: 'correct' },
      { moves: m('U'), result: 'correct' },
      { moves: m("L'"), result: 'wrong' },
      { moves: m('F'), result: 'hinted' },
      { moves: m('D'), result: 'correct' },
    ]
    expect(scoreRound(answers)).toEqual({ correct: 3, total: 5, accuracy: 60, bestStreak: 2 })
    expect(currentRun(answers)).toBe(1)
    expect(scoreRound([])).toEqual({ correct: 0, total: 0, accuracy: 0, bestStreak: 0 })
  })

  it('lists the moves to work on, most missed first', () => {
    const answers: AnswerRecord[] = [
      { moves: m("L'"), result: 'wrong' },
      { moves: m('R U F'), result: 'wrong', missed: 'U' },
      { moves: m('U'), result: 'wrong' },
      { moves: m('D'), result: 'correct' },
    ]
    expect(movesToWorkOn(answers, {})).toEqual(['U', "L'"])
  })

  it('picks weak moves more often', () => {
    let stats: MoveStats = {}
    for (const move of m('R L U D F B')) for (let i = 0; i < 6; i++) stats = recordAnswer(stats, move, move !== 'L')
    const rng = seededRng(7)
    const counts: Record<string, number> = {}
    for (let i = 0; i < 3000; i++) {
      const move = pickMove({ focus: m('R L U D F B'), review: [] }, stats, rng)
      counts[move] = (counts[move] ?? 0) + 1
    }
    expect(counts.L).toBeGreaterThan(counts.R * 2)
    expect(counts.L).toBeGreaterThan(counts.F * 2)
  })
})

describe('questions', () => {
  it('builds a round from the level pool without back-to-back repeats', () => {
    const rng = seededRng('round')
    for (const level of LEVELS) {
      const round = makeRound(level, {}, rng)
      expect(round).toHaveLength(level.questions)
      const pool = levelMoves(level)
      for (const [i, question] of round.entries()) {
        expect(question.length).toBeGreaterThanOrEqual(level.sequence[0])
        expect(question.length).toBeLessThanOrEqual(level.sequence[1])
        for (const [k, move] of question.entries()) {
          expect(pool).toContain(move)
          if (k > 0) expect(moveBase(move)).not.toBe(moveBase(question[k - 1]))
        }
        if (i > 0 && question.length === 1 && round[i - 1].length === 1) expect(moveBase(question[0])).not.toBe(moveBase(round[i - 1][0]))
      }
    }
  })

  it('asks the new idea more than the review', () => {
    const rng = seededRng(3)
    let primes = 0
    for (let i = 0; i < 600; i++) if (moveAmount(makeQuestion(LEVELS[1], {}, rng)[0]) === 3) primes++
    expect(primes).toBeGreaterThan(400)
  })

  it('finds the opposite face', () => {
    expect(oppositeFaceMove('R')).toBe('L')
    expect(oppositeFaceMove("U'")).toBe("D'")
    expect(oppositeFaceMove('f2')).toBe('b2')
    expect(oppositeFaceMove('M')).toBeNull()
    expect(oppositeFaceMove('x')).toBeNull()
  })

  it('always offers the answer and its inverse, with no duplicates', () => {
    const rng = seededRng('options')
    for (const answer of ALL_MOVES) {
      for (const count of [4, 6]) {
        const options = nameOptions(answer, ALL_MOVES.filter((x) => moveKind(x) === moveKind(answer)), rng, count)
        expect(options).toHaveLength(count)
        expect(new Set(options).size).toBe(count)
        expect(options).toContain(answer)
        if (invertMove(answer) !== answer) expect(options).toContain(invertMove(answer))
        else {
          expect(options).toContain(moveBase(answer))
          expect(options).toContain(`${moveBase(answer)}'`)
        }
      }
    }
  })

  it('offers the opposite face that looks the same from the front', () => {
    const options = nameOptions('R', m('R L U D F B'), seededRng(1), 4)
    expect(options).toContain("L'")
  })

  it('does not always put the answer in the same place', () => {
    const rng = seededRng(11)
    const places = new Set<number>()
    for (let i = 0; i < 40; i++) places.add(nameOptions('U', m('R L U D F B'), rng, 4).indexOf('U'))
    expect(places.size).toBeGreaterThan(2)
  })
})

describe('explanations', () => {
  it('names the wrong direction', () => {
    expect(explainWrongTurn('R', "R'")).toBe('That was R′: the right face turned the other way. No tick means clockwise.')
    expect(explainWrongTurn("U'", 'U')).toContain('The tick ′ means against the clock')
  })

  it('names the wrong face', () => {
    expect(explainWrongTurn('R', 'L')).toBe('That was L, the left face. R is the right face.')
    expect(explainWrongTurn('R', 'M')).toContain('middle')
    expect(explainWrongTurn('R', 'r')).toContain('two layers')
    expect(explainWrongTurn('R', 'R2')).toContain('half turn')
  })

  it('explains a double that turned back', () => {
    expect(explainWrongTurn('R2', "R'", 'R')).toContain('two turns the same way')
  })

  it('explains a wrong pick', () => {
    expect(explainWrongChoice("R'", 'R')).toContain('needs the tick')
    expect(explainWrongChoice('R', "R'")).toContain('no tick')
    expect(explainWrongChoice('R2', 'R')).toContain('halfway')
    expect(explainWrongChoice('R', "L'")).toContain('right face')
    expect(explainWrongChoice('x', 'R')).toContain('whole cube')
  })

  it('has a line for every pair of face turns', () => {
    for (const asked of ALL_MOVES) for (const made of ALL_MOVES) if (asked !== made) expect(explainWrongTurn(asked, made).length).toBeGreaterThan(20)
  })
})
