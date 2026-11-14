/** The ladder of notation levels. Each one adds a new idea and keeps reviewing the older ones. */
import { ALL_MOVES, moveAmount, moveKind, type Move } from '../../../cube'

export type GameMode = 'do' | 'name' | 'speed'

export interface NotationLevel {
  id: string
  title: string
  /** One short line for the level picker. */
  blurb: string
  /** The moves this level is about. */
  focus: readonly Move[]
  /** Older moves mixed in so they stay fresh (asked less often). */
  review: readonly Move[]
  /** Moves per question: [min, max]. */
  sequence: readonly [number, number]
  questions: number
  /** Which games have this level. */
  modes: readonly ('do' | 'name')[]
  bonus?: boolean
}

const face = (amount: 1 | 2 | 3) => ALL_MOVES.filter((m) => moveKind(m) === 'face' && moveAmount(m) === amount)
const CLOCKWISE = face(1)
const PRIMES = face(3)
const DOUBLES = face(2)
const FACE_TURNS = [...CLOCKWISE, ...PRIMES, ...DOUBLES]
const EXTRAS = ALL_MOVES.filter((m) => moveKind(m) !== 'face')

export const LEVELS: readonly NotationLevel[] = [
  { id: 'faces', title: 'Six faces', blurb: 'R L U D F B, all clockwise.', focus: CLOCKWISE, review: [], sequence: [1, 1], questions: 10, modes: ['do', 'name'] },
  { id: 'primes', title: 'Primes', blurb: 'The little tick means the other way.', focus: PRIMES, review: CLOCKWISE, sequence: [1, 1], questions: 10, modes: ['do', 'name'] },
  { id: 'doubles', title: 'Doubles', blurb: 'A 2 means turn it twice.', focus: DOUBLES, review: [...CLOCKWISE, ...PRIMES], sequence: [1, 1], questions: 10, modes: ['do', 'name'] },
  { id: 'mixed', title: 'All mixed up', blurb: 'Every face turn, any order.', focus: FACE_TURNS, review: [], sequence: [1, 1], questions: 12, modes: ['do', 'name'] },
  { id: 'sequences', title: 'Short sequences', blurb: 'Two to four moves in a row.', focus: FACE_TURNS, review: [], sequence: [2, 4], questions: 8, modes: ['do'] },
  { id: 'extras', title: 'Slices and more', blurb: 'M E S, wide turns, and x y z.', focus: EXTRAS, review: FACE_TURNS, sequence: [1, 1], questions: 12, modes: ['do', 'name'], bonus: true },
]

/** The levels of one game, in order. The speed round has no levels of its own. */
export const levelsFor = (mode: 'do' | 'name'): NotationLevel[] => LEVELS.filter((level) => level.modes.includes(mode))

/** Accuracy (0…1) in a round that opens the next level. */
export const UNLOCK_ACCURACY = 0.8

export const passesLevel = (correct: number, total: number): boolean => total > 0 && correct / total >= UNLOCK_ACCURACY

/** Every move a level can ask. */
export const levelMoves = (level: NotationLevel): Move[] => [...new Set([...level.focus, ...level.review])]

/** The moves the speed round draws from: everything in the "do" levels opened so far (single moves only). */
export function speedPool(unlockedDo: number): { focus: Move[]; review: Move[] } {
  const open = levelsFor('do').slice(0, Math.max(1, unlockedDo + 1)).filter((level) => !level.bonus)
  const newest = open[open.length - 1]
  const focus = [...newest.focus]
  const review = [...new Set(open.flatMap((level) => levelMoves(level)))].filter((m) => !focus.includes(m))
  return { focus, review }
}

/** The grid shown on the hub: rows of related moves. */
export const MOVE_GROUPS: readonly { id: string; title: string; moves: readonly Move[] }[] = [
  { id: 'clockwise', title: 'Clockwise', moves: CLOCKWISE },
  { id: 'primes', title: 'Prime', moves: PRIMES },
  { id: 'doubles', title: 'Double', moves: DOUBLES },
  { id: 'slices', title: 'Slices', moves: EXTRAS.filter((m) => moveKind(m) === 'slice') },
  { id: 'wide', title: 'Wide', moves: EXTRAS.filter((m) => moveKind(m) === 'wide') },
  { id: 'rotations', title: 'Whole cube', moves: EXTRAS.filter((m) => moveKind(m) === 'rotation') },
]
