import { describe, expect, it } from 'vitest'
import { ALGORITHMS, algToString, applyAlg, getAlgorithm, isSolved, seededRng } from '../../cube'
import { HOLD_STATE, algView, caseState, distinctAlgorithms, fixesCase, guidanceFor, makeFlashCards, matchesSearch, mirrorInfo, mnemonicBeats, recordRep, statusOf, type AlgStat } from './logic'

describe('algorithm views', () => {
  it('every demo and practice case ends solved, as written and mirrored', () => {
    for (const algorithm of ALGORITHMS) {
      for (const mirrored of [false, true]) {
        const view = algView(algorithm, mirrored)
        expect(applyAlg(view.demoStart, view.demo)).toBe(HOLD_STATE)
        expect(applyAlg(view.practiceStart, view.moves)).toBe(HOLD_STATE)
        expect(isSolved(applyAlg(view.practiceStart, view.moves))).toBe(true)
        expect(view.practiceStart).not.toBe(HOLD_STATE)
      }
    }
  })

  it('holds the cube yellow up', () => {
    expect(HOLD_STATE[4]).toBe('D')
    expect(caseState("R U R' U'")).toBe(applyAlg(HOLD_STATE, "U R U' R'"))
  })

  it('knows which mirrors mean something', () => {
    const right = mirrorInfo(getAlgorithm('right-trigger')!)
    expect(right.meaningful).toBe(true)
    expect(algToString(right.moves)).toBe("L' U' L U")
    expect(right.twin?.id).toBe('left-trigger')
    expect(mirrorInfo(getAlgorithm('middle-right')!).twin?.id).toBe('middle-left')
    expect(mirrorInfo(getAlgorithm('white-cross-drop')!).meaningful).toBe(false)
    expect(mirrorInfo(getAlgorithm('sune')!).twin).toBeNull()
  })
})

describe('practice mastery', () => {
  it('goes learning → practised → mastered', () => {
    let stat: AlgStat | undefined
    expect(statusOf(stat)).toBe('learning')
    expect(guidanceFor(stat)).toBe('arrows')
    stat = recordRep(stat, { clean: false, guidance: 'arrows' })
    expect(stat).toEqual({ reps: 1, clean: 0, blind: 0 })
    expect(statusOf(stat)).toBe('practised')
    expect(guidanceFor(stat)).toBe('arrows')
    stat = recordRep(recordRep(stat, { clean: true, guidance: 'arrows' }), { clean: true, guidance: 'arrows' })
    expect(guidanceFor(stat)).toBe('moves')
    stat = recordRep(recordRep(stat, { clean: true, guidance: 'moves' }), { clean: true, guidance: 'moves' })
    expect(guidanceFor(stat)).toBe('memory')
    stat = recordRep(stat, { clean: false, guidance: 'memory' })
    stat = recordRep(recordRep(stat, { clean: true, guidance: 'memory' }), { clean: true, guidance: 'memory' })
    expect(statusOf(stat)).toBe('practised')
    stat = recordRep(stat, { clean: true, guidance: 'memory' })
    expect(statusOf(stat)).toBe('mastered')
    expect(stat.reps).toBe(9)
  })
})

describe('search', () => {
  it('matches names and moves', () => {
    const sune = getAlgorithm('sune')!
    expect(matchesSearch(sune, '')).toBe(true)
    expect(matchesSearch(sune, ' SUN ')).toBe(true)
    expect(matchesSearch(sune, "r u r'")).toBe(true)
    expect(matchesSearch(sune, "RUR'")).toBe(true)
    expect(matchesSearch(sune, 'trigger')).toBe(false)
  })
})

describe('flash cards', () => {
  it('have one right answer among distinct choices', () => {
    const cards = makeFlashCards(seededRng('cards'), 6, 4)
    expect(cards).toHaveLength(6)
    expect(new Set(cards.map((c) => c.answerId)).size).toBe(6)
    for (const card of cards) {
      expect(card.options).toHaveLength(4)
      expect(new Set(card.options).size).toBe(4)
      expect(card.options).toContain(card.answerId)
      const answer = getAlgorithm(card.answerId)!
      expect(isSolved(applyAlg(card.state, answer.moves))).toBe(true)
      for (const id of card.options) if (id !== card.answerId) expect(isSolved(applyAlg(card.state, getAlgorithm(id)!.moves))).toBe(false)
    }
  })

  it('never marks an equally valid answer wrong (Sune vs edge swap, trigger vs corner insert)', () => {
    // These pairs differ only by a final turn of the top layer: each fixes the other's case.
    for (const [a, b] of [['sune', 'yellow-edge-swap'], ['right-trigger', 'white-corner-right']] as const) {
      expect(fixesCase(caseState(getAlgorithm(a)!.moves), getAlgorithm(b)!.moves), `${b} fixes ${a}`).toBe(true)
      expect(fixesCase(caseState(getAlgorithm(b)!.moves), getAlgorithm(a)!.moves), `${a} fixes ${b}`).toBe(true)
    }
    // Over many deals: every option that fixes the case is accepted, and no distractor does.
    for (let seed = 0; seed < 300; seed++) {
      for (const card of makeFlashCards(seededRng(`deal-${seed}`), 6, 4)) {
        expect(card.accepts).toContain(card.answerId)
        expect(new Set(card.options).size).toBe(4)
        for (const id of card.options) {
          const fixes = fixesCase(card.state, getAlgorithm(id)!.moves)
          expect(card.accepts.includes(id), `${id} on ${card.answerId}`).toBe(fixes)
          if (id !== card.answerId) expect(fixes, `distractor ${id} also fixes ${card.answerId}`).toBe(false)
        }
      }
    }
  })

  it('never offers two algorithms with the same moves', () => {
    const texts = distinctAlgorithms().map((a) => algToString(a.moves))
    expect(new Set(texts).size).toBe(texts.length)
    expect(texts.length).toBeLessThan(ALGORITHMS.length)
  })
})

describe('mnemonic beats', () => {
  it('lines a chant up with the moves', () => {
    expect(mnemonicBeats('Up, over, down, back.', 4)).toEqual({ beats: ['Up', 'over', 'down', 'back'], rest: '' })
    const sune = getAlgorithm('sune')!
    expect(mnemonicBeats(sune.mnemonic, sune.moves.length).beats).toEqual(['Up', 'over', 'down', 'over', 'up', 'over-over', 'down'])
    const cycle = getAlgorithm('corner-cycle')!
    expect(mnemonicBeats(cycle.mnemonic, cycle.moves.length).beats).toHaveLength(8)
    const twist = getAlgorithm('corner-twist')!
    const beats = mnemonicBeats(twist.mnemonic, twist.moves.length)
    expect(beats.beats).toEqual(['Down', 'left', 'up', 'right'])
    expect(beats.rest).toContain('Never rotate the whole cube')
  })

  it('leaves other mnemonics whole', () => {
    const drop = getAlgorithm('white-cross-drop')!
    expect(mnemonicBeats(drop.mnemonic, drop.moves.length)).toEqual({ beats: null, rest: drop.mnemonic })
    for (const algorithm of ALGORITHMS) {
      const { beats, rest } = mnemonicBeats(algorithm.mnemonic, algorithm.moves.length)
      if (beats) expect(beats).toHaveLength(algorithm.moves.length)
      else expect(rest).toBe(algorithm.mnemonic)
    }
  })
})
