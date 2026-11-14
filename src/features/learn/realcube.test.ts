/**
 * The instructions for the real cube ("Now on your cube", the Stuck? entries, the recovery rules)
 * are checked here against cubejs, sticker by sticker — not against the engine that wrote them.
 * The cubes come from the method (a seeded scramble solved up to the moment that matters); every
 * claim is then replayed on cubejs and judged from the raw 54 stickers.
 */
import Cube from 'cubejs'
import { describe, expect, it } from 'vitest'
import { applyAlg, BEGINNER_HOLD, getAlgorithm, randomState, seededRng, SOLVED, type CubeState } from '../../cube'
import { getLesson, type Beat } from './content'
import { heldScramble, solverSteps, solveToStage } from './engine'

/** Facelets of the slots, in the Kociemba order (U R F D L B, each face read row by row). */
const EDGE = { UF: [7, 19], UR: [5, 10], UB: [1, 46], UL: [3, 37], DF: [28, 25], DR: [32, 16], DB: [34, 52], DL: [30, 43], FR: [23, 12], FL: [21, 41], BR: [48, 14], BL: [50, 39] } as const
const CORNER = { URF: [8, 9, 20], UFL: [6, 18, 38], ULB: [0, 36, 47], UBR: [2, 45, 11], DFR: [29, 26, 15], DLF: [27, 44, 24], DBL: [33, 53, 42], DRB: [35, 17, 51] } as const
const CENTRE = { U: 4, R: 13, F: 22, D: 31, L: 40, B: 49 } as const
type Face = keyof typeof CENTRE
type EdgeSlot = keyof typeof EDGE
const TOP_EDGES: readonly EdgeSlot[] = ['UF', 'UR', 'UB', 'UL']
const MIDDLE: readonly EdgeSlot[] = ['FR', 'FL', 'BR', 'BL']
const BOTTOM = [EDGE.DF, EDGE.DR, EDGE.DB, EDGE.DL, CORNER.DFR, CORNER.DLF, CORNER.DBL, CORNER.DRB]
const SPINS = ['', 'y', 'y2', "y'"] as const
const TURNS = ['', 'U', 'U2', "U'"] as const

const centre = (s: string, face: Face) => s[CENTRE[face]]
const faceOf = (index: number): Face => 'URFDLB'[Math.floor(index / 9)] as Face
const solvedAt = (s: string, facelets: readonly number[]) => facelets.every((i) => s[i] === centre(s, faceOf(i)))
const after = (s: string, alg: string) => (alg.trim() ? Cube.fromString(s).move(alg).asString() : s)
const colours = (s: string, facelets: readonly number[]) => facelets.map((i) => s[i])
const sameSet = (a: readonly string[], b: readonly string[]) => [...a].sort().join() === [...b].sort().join()
/** The piece with these colours sits in its own slot, but turned the wrong way. */
const homeAt = (s: string, facelets: readonly number[]) => sameSet(colours(s, facelets), facelets.map((i) => centre(s, faceOf(i))))
const yellow = (s: string) => centre(s, 'U')
const bottomWhole = (s: string) => BOTTOM.every((f) => solvedAt(s, f)) && [27, 28, 29, 30, 31, 32, 33, 34, 35].every((i) => s[i] === centre(s, 'D'))
/** The colours of a piece, wherever it is: the slot holding exactly these colours. */
const edgeWith = (s: string, cols: readonly string[]) => (Object.keys(EDGE) as EdgeSlot[]).find((slot) => sameSet(colours(s, EDGE[slot]), cols))!

const RIGHT = getAlgorithm('middle-right')!.alg
const LEFT = getAlgorithm('middle-left')!.alg
const TRIGGER = getAlgorithm('right-trigger')!.alg
const SWAP = getAlgorithm('yellow-edge-swap')!.alg
const TWIST = getAlgorithm('corner-twist')!.alg

/** Cubes during a stage, at every step boundary of the method (the moments he looks at his cube). */
function boundaries(stage: Parameters<typeof solveToStage>[1], seeds: number, trigger = false): string[] {
  const out: string[] = []
  for (let seed = 0; seed < seeds; seed++) {
    for (const step of solverSteps(solveToStage(heldScramble(`real:${stage}:${seed}`), stage), trigger)) {
      if (step.stage !== stage) break
      out.push(step.before)
    }
  }
  return out
}

function realBeat(id: string) {
  const beat = getLesson(id)!.beats.find((b) => b.kind === 'real') as Extract<Beat, { kind: 'real' }>
  return beat
}

it('cubejs and the engine agree on face turns and whole-cube turns', () => {
  for (let seed = 0; seed < 20; seed++) {
    const s = randomState(seededRng(`agree-${seed}`))
    for (const alg of ['R U F D L B', "y R' y2 U2", "y' F B' x", 'z2 L']) {
      if (/[xz]/.test(alg)) continue
      expect(after(s, alg)).toBe(applyAlg(s, alg))
    }
  }
})

describe('stage 4 on the real cube (MF1)', () => {
  const beat = realBeat('middle-layer')
  const states = boundaries('middle-layer', 50)
  const middleNotDone = (s: string) => MIDDLE.some((slot) => !solvedAt(s, EDGE[slot]))
  const noYellow = (s: string, slot: EdgeSlot) => !colours(s, EDGE[slot]).includes(yellow(s))

  it('says what the review asked for: the T on any side, turn the whole cube, the top sticker, and the stuck edge', () => {
    const text = beat.steps.join(' ')
    expect(text).toMatch(/side sticker and turn the top until that sticker sits above the centre of the same colour/)
    expect(text).toMatch(/Turn the \*\*whole cube\*\* round \(not over\) so that T faces you/)
    expect(text).toMatch(/Every top edge has yellow, but the middle is not done\?/)
    expect(text).not.toMatch(/front sticker/)
    expect(beat.checks.join(' ')).toMatch(/wrong way round\? That is step 5 too/)
  })

  it('steps 2–4: any top edge with no yellow — one turn of the top makes its T somewhere, turning the cube brings it to the front, and the top sticker picks the side that puts it home', () => {
    let tried = 0
    for (const s of states) {
      for (const slot of TOP_EDGES) {
        if (!noYellow(s, slot)) continue
        const cols = colours(s, EDGE[slot])
        // Step 2: exactly one turn of the top puts its side sticker above the centre of the same colour.
        const tees = TURNS.filter((t) => {
          const now = after(s, t)
          const at = edgeWith(now, cols)
          const side = EDGE[at][1]
          return now[side] === centre(now, faceOf(side))
        })
        expect(tees, `${s} ${slot}`).toHaveLength(1)
        const made = after(s, tees[0])
        // Step 3: one whole-cube turn (round, not over) brings that T to the front.
        const spins = SPINS.filter((r) => {
          const now = after(made, r)
          return sameSet(colours(now, EDGE.UF), cols) && now[19] === centre(now, 'F')
        })
        expect(spins).toHaveLength(1)
        const ready = after(made, spins[0])
        expect(yellow(ready)).toBe(yellow(s)) // still yellow on top
        // Step 4: the top sticker is the colour of the right or the left centre; that side's moves put it home.
        const top = ready[7]
        expect([centre(ready, 'R'), centre(ready, 'L')]).toContain(top)
        const goRight = top === centre(ready, 'R')
        const done = after(ready, goRight ? RIGHT : LEFT)
        expect(solvedAt(done, EDGE[goRight ? 'FR' : 'FL']), `${s} ${slot}`).toBe(true)
        expect(bottomWhole(done)).toBe(true)
        // …and nothing already finished in the middle layer is lost.
        const before = MIDDLE.filter((m) => solvedAt(ready, EDGE[m]))
        expect(before.every((m) => solvedAt(done, EDGE[m]))).toBe(true)
        tried++
      }
    }
    expect(tried).toBeGreaterThan(150)
  })

  it('step 5: every top edge has yellow but the middle is not done — one is stuck in the middle; at the front-right, the "to the right" moves pop it out to the top', () => {
    let stuck = 0
    let flipped = 0
    for (const s of states) {
      if (TOP_EDGES.some((slot) => noYellow(s, slot)) || !middleNotDone(s)) continue
      for (const r of SPINS) {
        const held = after(s, r)
        if (solvedAt(held, EDGE.FR)) continue
        const cols = colours(held, EDGE.FR)
        expect(cols).not.toContain(yellow(held)) // the stuck one is a middle edge
        if (homeAt(held, EDGE.FR)) flipped++
        const popped = after(held, RIGHT)
        expect(TOP_EDGES).toContain(edgeWith(popped, cols))
        expect(bottomWhole(popped)).toBe(true)
        expect(MIDDLE.filter((m) => m !== 'FR' && solvedAt(held, EDGE[m])).every((m) => solvedAt(popped, EDGE[m]))).toBe(true)
        stuck++
      }
    }
    expect(stuck).toBeGreaterThan(10)
    expect(flipped, 'the wrong-way-round edge is covered by step 5 too').toBeGreaterThan(0)
  })

  it('the Stuck? entry: sent to the wrong side lands in the wrong slot; only an edge sent before its T was made comes out the wrong way round', () => {
    let wrongSide = 0
    let noT = 0
    for (const s of states) {
      for (const t of TURNS) {
        const held = after(s, t)
        const cols = colours(held, EDGE.UF)
        if (cols.includes(yellow(held))) continue
        const tee = held[19] === centre(held, 'F')
        for (const [alg, slot, other] of [
          [RIGHT, 'FR', 'FL'],
          [LEFT, 'FL', 'FR'],
        ] as const) {
          const done = after(held, alg)
          expect(edgeWith(done, cols)).toBe(slot)
          const isFlipped = homeAt(done, EDGE[slot]) && !solvedAt(done, EDGE[slot])
          if (tee) {
            // With the T made it is never turned the wrong way round: right side → home, wrong side → the other slot, not its own.
            expect(isFlipped).toBe(false)
            if (!solvedAt(done, EDGE[slot])) {
              expect(homeAt(done, EDGE[slot]), `${held}: wrong side means wrong slot`).toBe(false)
              expect(sameSet(cols, [centre(done, 'F'), centre(done, other === 'FR' ? 'R' : 'L')])).toBe(true)
              wrongSide++
            }
          } else if (isFlipped) noT++
        }
      }
    }
    expect(wrongSide).toBeGreaterThan(50)
    expect(noT).toBeGreaterThan(5)
    const trouble = getLesson('middle-layer')!.troubles.find((t) => /wrong slot/.test(t.problem))!
    expect(trouble.fix).toMatch(/Wrong slot: it was sent to the wrong side/)
    expect(trouble.fix).toMatch(/Wrong way round: the T was not made first/)
  })
})

describe('stage 3 and stage 6 on the real cube (SF7)', () => {
  it('stage 3: no white corner on top but the layer not done — one is stuck below; at the front-right one Right Trigger pops it up', () => {
    expect(realBeat('white-corners').steps.join(' ')).toMatch(/No white corner on top, but the layer is not done\? One is stuck below/)
    const white = (s: string) => centre(s, 'D')
    const whiteOnTop = (s: string) => (['URF', 'UFL', 'ULB', 'UBR'] as const).some((c) => colours(s, CORNER[c]).includes(white(s)))
    const downCorners = ['DFR', 'DLF', 'DBL', 'DRB'] as const
    let tried = 0
    for (const s of boundaries('white-corners', 80, true)) {
      if (whiteOnTop(s) || downCorners.every((c) => solvedAt(s, CORNER[c]))) continue
      for (const r of SPINS) {
        const held = after(s, r)
        if (solvedAt(held, CORNER.DFR)) continue
        const popped = after(held, TRIGGER)
        expect(colours(popped, CORNER.URF)).toContain(white(popped))
        expect([EDGE.DF, EDGE.DR, EDGE.DB, EDGE.DL].every((e) => solvedAt(popped, e))).toBe(true)
        expect(downCorners.filter((c) => c !== 'DFR' && solvedAt(held, CORNER[c])).every((c) => solvedAt(popped, CORNER[c]))).toBe(true)
        tried++
      }
    }
    expect(tried).toBeGreaterThan(10)
  })

  it('stage 6: two that match sit opposite — one Edge Swap from any side, and then some turn of the top matches two neighbours (or all four)', () => {
    expect(realBeat('yellow-edges').steps.join(' ')).toMatch(/opposite each other\? Do the Edge Swap once from any side, then count again/)
    const matches = (s: string) => TOP_EDGES.filter((slot) => solvedAt(s, EDGE[slot]))
    let tried = 0
    for (const s of boundaries('yellow-edges', 120)) {
      for (const t of TURNS) {
        const now = after(s, t)
        const m = matches(now)
        const opposite = m.length === 2 && ((m.includes('UF') && m.includes('UB')) || (m.includes('UR') && m.includes('UL')))
        if (!opposite) continue
        for (const r of SPINS) {
          const swapped = after(after(now, r), SWAP)
          const best = TURNS.map((u) => matches(after(swapped, u)))
          const neighbours = best.some((x) => x.length === 4 || (x.length === 2 && !((x.includes('UF') && x.includes('UB')) || (x.includes('UR') && x.includes('UL')))))
          expect(neighbours).toBe(true)
          tried++
        }
      }
    }
    expect(tried).toBeGreaterThan(8)
  })
})

describe('stage 8: turned the whole cube by accident (SF5)', () => {
  const lesson = getLesson('yellow-corners-orient')!
  const text = [
    ...lesson.beats.flatMap((b) => [...b.body, b.tip ?? '', ...(b.kind === 'real' ? [...b.steps, ...b.checks] : [])]),
    ...lesson.troubles.map((t) => t.fix),
    ...lesson.learned,
  ].join(' ')

  it('uses the centres, never a "scrambled column"', () => {
    expect(text).not.toMatch(/column/i)
    expect(text).toMatch(/say the colour of the \*\*front centre\*\* out loud/)
    expect(lesson.troubles.find((t) => /whole cube in the middle/.test(t.problem))!.fix).toMatch(/front centre you named/)
    expect(realBeat('yellow-corners-orient').checks.join(' ')).toMatch(/front centre you named faces you again, yellow on top/)
  })

  it('the rule works: mid-twist, any accidental turn round (or over) is undone by bringing back the named front centre with yellow on top — and the cube then solves', () => {
    let tried = 0
    for (let seed = 0; seed < 40; seed++) {
      const start = solveToStage(applyAlg(randomState(seededRng(`acc-${seed}`)), BEGINNER_HOLD), 'yellow-corners-orient')
      for (const step of solverSteps(start)) {
        if (step.caseId !== 'yellow-corners-orient/twist' && step.caseId !== 'yellow-corners-orient/next-corner') continue
        const named = step.before[CENTRE.F]
        // Somewhere in the middle of the twisting: after one round of this step.
        const mid = after(after(step.before, step.setup.join(' ')), TWIST) as CubeState
        for (const accident of ['y', 'y2', "y'", 'x2 y', 'z2']) {
          const turned = applyAlg(mid, accident)
          // The rule: whole-cube turns until yellow is on top and the named centre faces you.
          const back = ['', 'y', 'y2', "y'", 'x2', 'x2 y', 'x2 y2', "x2 y'", 'z2', 'z2 y', 'z2 y2', "z2 y'"]
            .map((r) => applyAlg(turned, r))
            .filter((c) => c[CENTRE.U] === mid[CENTRE.U] && c[CENTRE.F] === named)
          expect(back.length).toBeGreaterThan(0)
          for (const c of back) expect(c).toBe(mid)
          tried++
        }
        // …and carrying on from there finishes the cube.
        let current: CubeState = mid
        for (const next of solverSteps(mid)) current = next.after
        expect(Cube.fromString(current).isSolved()).toBe(true)
        break
      }
    }
    expect(tried).toBeGreaterThan(100)
  })

  it('after one Corner Twist the displaced stickers are spread round the bottom, not one column — which is why the old rule failed', () => {
    const held = applyAlg(SOLVED, BEGINNER_HOLD)
    const moved = after(held, TWIST)
    const changed = [...held].map((c, i) => (c !== moved[i] ? i : -1)).filter((i) => i >= 0 && i < 54)
    const columns = new Set(changed.filter((i) => ![8, 9, 20].includes(i)).map((i) => faceOf(i)))
    expect(columns.size).toBeGreaterThanOrEqual(3)
  })
})
