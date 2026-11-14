/**
 * The recognition rounds ("Which is it?"): every question is a real cube in the method's hold,
 * and every answer is checked here against the raw stickers — not against the engine's piece
 * code that built it — and, where the answer is "do this algorithm", against cubejs.
 */
import Cube from 'cubejs'
import { describe, expect, it } from 'vitest'
import { isSolvable, type CubeState } from '../../cube'
import type { QuizKind } from './content'
import { LESSONS } from './content'
import { QUIZ_STAGE, quizQuestion } from './quiz'

const KINDS = Object.keys(QUIZ_STAGE) as QuizKind[]
const N = 18

/** Facelets of the slots, in the Kociemba order (U R F D L B, each face read row by row). */
const EDGE = { UF: [7, 19], UR: [5, 10], UB: [1, 46], UL: [3, 37], DF: [28, 25], DR: [32, 16], DB: [34, 52], DL: [30, 43], FR: [23, 12], FL: [21, 41], BR: [48, 14], BL: [50, 39] } as const
const CORNER = { URF: [8, 9, 20], UFL: [6, 18, 38], ULB: [0, 36, 47], UBR: [2, 45, 11], DFR: [29, 26, 15], DLF: [27, 44, 24], DBL: [33, 53, 42], DRB: [35, 17, 51] } as const
const CENTRE = { U: 4, R: 13, F: 22, D: 31, L: 40, B: 49 } as const
type Face = keyof typeof CENTRE
const COLOUR: Record<string, string> = { U: 'white', R: 'red', F: 'green', D: 'yellow', L: 'orange', B: 'blue' }

const centre = (s: string, face: Face) => s[CENTRE[face]]
const faceOf = (index: number): Face => 'URFDLB'[Math.floor(index / 9)] as Face
/** Every sticker of the piece in a slot matches the centre of the face it is on. */
const solvedAt = (s: string, facelets: readonly number[]) => facelets.every((i) => s[i] === centre(s, faceOf(i)))
/** The piece in a slot has the colours of the centres round that slot (twist ignored). */
const homeAt = (s: string, facelets: readonly number[]) => [...facelets.map((i) => s[i])].sort().join() === [...facelets.map((i) => centre(s, faceOf(i)))].sort().join()
const after = (s: string, alg: string) => Cube.fromString(s).move(alg.replace(/′/g, "'")).asString()
const shape = (s: string) => {
  const up = [1, 3, 5, 7].filter((i) => s[i] === s[4])
  if (up.length === 0) return 'dot'
  if (up.length === 4) return 'cross'
  return up.length === 2 && up[0] + up[1] === 8 ? 'line' : up.length === 2 ? 'L' : 'other'
}
const firstTwoLayers = (s: string) =>
  [EDGE.DF, EDGE.DR, EDGE.DB, EDGE.DL, EDGE.FR, EDGE.FL, EDGE.BR, EDGE.BL, CORNER.DFR, CORNER.DLF, CORNER.DBL, CORNER.DRB].every((f) => solvedAt(s, f))

describe('recognition rounds', () => {
  it('every lesson of a stage with a round asks its own stage’s question, and each round can be finished', () => {
    for (const lesson of LESSONS) {
      for (const beat of lesson.beats) {
        if (beat.kind !== 'quiz') continue
        expect(QUIZ_STAGE[beat.quiz]).toBe(lesson.id)
        expect(beat.count ?? 5).toBeGreaterThanOrEqual(4)
      }
    }
    const withRounds = LESSONS.filter((l) => l.beats.some((b) => b.kind === 'quiz')).map((l) => l.id)
    expect(withRounds).toEqual(Object.values(QUIZ_STAGE))
  })

  it.each(KINDS.map((k) => [k] as const))('%s: real cubes, yellow on top, the answer among the options, a mix of answers', (kind) => {
    const answers = new Set<string>()
    const states = new Set<string>()
    for (let n = 0; n < N; n++) {
      const q = quizQuestion(kind, n)
      expect(quizQuestion(kind, n)).toBe(q)
      expect(isSolvable(q.state as CubeState)).toBe(true)
      expect(Cube.fromString(q.state).asString()).toBe(q.state)
      expect(centre(q.state, 'U'), `${kind} ${n}: yellow on top`).toBe('D')
      expect(centre(q.state, 'D')).toBe('U')
      const ids = q.options.map((o) => o.id)
      expect(new Set(ids).size).toBe(ids.length)
      expect(ids).toContain(q.answer)
      expect(q.why.length).toBeGreaterThan(20)
      // The question never lights the answer for him.
      if (kind === 'corner-place' && q.answer !== 'none') expect(q.ask.pieces ?? []).toEqual([])
      answers.add(q.answer)
      states.add(q.state)
    }
    expect(answers.size, `${kind}: not always the same answer`).toBeGreaterThanOrEqual(kind === 'twist-next' ? 2 : 3)
    expect(states.size).toBeGreaterThan(N * 0.8)
  })

  it('daisy: the case named is where the lit edge really is', () => {
    for (let n = 0; n < N; n++) {
      const q = quizQuestion('daisy-case', n)
      const piece = q.ask.pieces![0] // a white edge, named by its home slot on a white-up cube: U + its side
      const other = piece.replace('U', '') as Face
      const [slot, facelets] = Object.entries(EDGE).find(([, f]) => f.some((i) => q.state[i] === 'U') && f.some((i) => q.state[i] === other))!
      const white = facelets.find((i) => q.state[i] === 'U')!
      const layer = slot[0] === 'U' ? 'top' : slot[0] === 'D' ? 'bottom' : 'middle'
      const expected = layer === 'middle' ? 'middle' : layer === 'top' ? (faceOf(white) === 'U' ? 'petal' : 'top-flipped') : faceOf(white) === 'D' ? 'bottom' : 'bottom-flipped'
      expect(expected, `daisy ${n}`).toBe(q.answer)
    }
  })

  it('white cross: the petal’s side colour, and whether it already sits on its centre', () => {
    for (let n = 0; n < N; n++) {
      const q = quizQuestion('cross-petal', n)
      expect(q.state[7], 'a petal at the front').toBe('U')
      if (q.type === 'centre') expect(q.answer).toBe(COLOUR[q.state[19]])
      else expect(q.answer).toBe(q.state[19] === centre(q.state, 'F') ? 'yes' : 'no')
      // Dropping a matched petal really puts it home.
      if (q.answer === 'yes') expect(solvedAt(after(q.state, 'F2'), EDGE.DF)).toBe(true)
    }
  })

  it('white corners: the home named is between the centres of the corner’s side colours; done / twisted / wrong from the stickers', () => {
    for (let n = 0; n < N; n++) {
      const q = quizQuestion('corner-home', n)
      if (q.type === 'home') {
        const colours = CORNER.URF.map((i) => q.state[i]).filter((c) => c !== 'U')
        expect(colours).toHaveLength(2)
        const faces = q.answer.split('') as Face[]
        expect([...faces.map((f) => centre(q.state, f))].sort()).toEqual([...colours].sort())
      } else {
        const expected = solvedAt(q.state, CORNER.DFR) ? 'done' : homeAt(q.state, CORNER.DFR) ? 'twisted' : 'wrong'
        expect(CORNER.DFR.some((i) => q.state[i] === 'U')).toBe(true)
        expect(q.answer).toBe(expected)
        // "Twisted": the Right Trigger 2 or 4 times puts it right.
        if (expected === 'twisted') expect([2, 4].some((k) => solvedAt(after(q.state, Array(k).fill("R U R' U'").join(' ')), CORNER.DFR))).toBe(true)
      }
    }
  })

  it('middle layer: the top sticker says right or left, and that algorithm really puts the edge in', () => {
    for (let n = 0; n < N; n++) {
      const q = quizQuestion('middle-side', n)
      const s = q.state
      const [top, front] = EDGE.UF.map((i) => s[i])
      if (top === 'D' || front === 'D') {
        expect(q.answer).toBe('neither')
        continue
      }
      // Both centres can be seen (the left one in the mirror), and the answer lights the centre it matches — never a slot, which would light whatever sits in it.
      expect(q.mirrors).toBe(true)
      expect(q.reveal.slots?.some((slot) => slot.length > 1)).toBe(false)
      expect(front, 'the T is made').toBe(centre(s, 'F'))
      const side = top === centre(s, 'R') ? 'right' : top === centre(s, 'L') ? 'left' : 'none'
      expect(q.answer).toBe(side)
      const done = after(s, side === 'right' ? "U R U' R' U' F' U F" : "U' L' U L U F U' F'")
      expect(solvedAt(done, side === 'right' ? EDGE.FR : EDGE.FL)).toBe(true)
      expect([EDGE.DF, EDGE.DR, EDGE.DB, EDGE.DL, CORNER.DFR, CORNER.DLF, CORNER.DBL, CORNER.DRB].every((f) => solvedAt(done, f)), 'the white layer is still whole').toBe(true)
    }
  })

  it('yellow cross: the shape from the four edge stickers; a shape held right moves on, held wrong does not', () => {
    for (let n = 0; n < N; n++) {
      const q = quizQuestion('yellow-shape', n)
      expect(firstTwoLayers(q.state)).toBe(true)
      if (q.type === 'shape') {
        expect(q.answer).toBe(shape(q.state))
        continue
      }
      const before = shape(q.state)
      expect(['L', 'line']).toContain(before)
      const next = shape(after(q.state, "F R U R' U' F'"))
      expect(next === (before === 'L' ? 'line' : 'cross')).toBe(q.answer === 'yes')
    }
  })

  it('yellow edges: the count is of edges matching their centres; "swap now" really finishes the edges', () => {
    const top = [EDGE.UF, EDGE.UR, EDGE.UB, EDGE.UL]
    for (let n = 0; n < N; n++) {
      const q = quizQuestion('edges-match', n)
      const count = top.filter((f) => solvedAt(q.state, f)).length
      if (q.type === 'count') {
        expect(q.answer).toBe(String(count))
        // The counts come round 2, 1, 2, 0 — the useful answer, 2, every other time.
        expect(q.answer).toBe(String([2, 1, 2, 0][Math.floor(n / 2) % 4]))
      } else if (q.answer === 'swap') expect(top.every((f) => solvedAt(after(q.state, "R U R' U R U2 R' U"), f))).toBe(true)
      else if (q.answer === 'cube') expect(count).toBe(2)
      else expect(count).toBeLessThan(2)
    }
  })

  it('placing corners: "at home" from the colours of the three centres, twist ignored — and mostly twisted ones', () => {
    let twisted = 0
    for (let n = 0; n < N; n++) {
      const q = quizQuestion('corner-place', n)
      const home = (['URF', 'UFL', 'ULB', 'UBR'] as const).filter((slot) => homeAt(q.state, CORNER[slot]))
      expect(home.length).toBeLessThanOrEqual(1)
      expect(q.answer).toBe(home[0] ?? 'none')
      if (home[0] && !solvedAt(q.state, CORNER[home[0]])) twisted++
      expect([EDGE.UF, EDGE.UR, EDGE.UB, EDGE.UL].every((f) => solvedAt(q.state, f)), 'the top is lined up').toBe(true)
    }
    expect(twisted).toBeGreaterThanOrEqual(N / 3)
  })

  it('final twist: keep twisting while the workbench is not yellow-up; turn the top when it is', () => {
    for (let n = 0; n < N; n++) {
      const q = quizQuestion('twist-next', n)
      const yellowUp = q.state[8] === 'D'
      if (q.answer === 'twist') expect(yellowUp).toBe(false)
      else {
        expect(q.answer).toBe('top')
        expect(yellowUp).toBe(true)
      }
      if (q.type === 'continue') expect(CORNER.URF.some((i) => q.state[i] === 'U'), 'half-way: white on the workbench').toBe(true)
    }
  })
})
