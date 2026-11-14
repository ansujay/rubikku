/**
 * Following an expected sequence of moves as the player makes turns on the cube.
 *
 * The cube reports quarter turns one at a time, so a double turn (R2) usually arrives as two
 * quarter turns — R R or R' R' — and both directions are right. A long drag can also land a
 * whole half turn at once. `followMove` hides all of that: feed it each turn and it says
 * whether the player is still on track.
 *
 * Shared by the notation trainer, algorithm practice and "try it yourself" for patterns.
 */
import { moveAmount, moveBase, type Move } from '../../../cube'

export interface FollowState {
  /** How many expected moves are finished. */
  index: number
  /** The first quarter turn of a double that is half done, else null. */
  partial: Move | null
}

export const FOLLOW_START: FollowState = { index: 0, partial: null }

export type FollowStatus = 'progress' | 'complete' | 'wrong'

export interface FollowResult {
  status: FollowStatus
  /** Where the player is now (unchanged when the move was wrong). */
  next: FollowState
  /** The expected move this turn was judged against. */
  expected: Move | null
}

const isDouble = (move: Move) => moveAmount(move) === 2

/** Judge one turn against the expected sequence. Pure: returns the new position. */
export function followMove(expected: readonly Move[], at: FollowState, made: Move): FollowResult {
  const want = expected[at.index]
  if (!want) return { status: 'wrong', next: at, expected: null }
  const done = (index: number): FollowResult => ({
    status: index >= expected.length ? 'complete' : 'progress',
    next: { index, partial: null },
    expected: want,
  })

  if (at.partial) {
    // Half-way through a double: only the same quarter turn again finishes it.
    return made === at.partial ? done(at.index + 1) : { status: 'wrong', next: at, expected: want }
  }
  if (made === want) return done(at.index + 1)
  if (isDouble(want) && moveBase(made) === moveBase(want) && !isDouble(made)) {
    return { status: 'progress', next: { index: at.index, partial: made }, expected: want }
  }
  // One long drag that covers two identical expected quarter turns ("R R" done as R2).
  if (isDouble(made) && !isDouble(want) && moveBase(made) === moveBase(want) && expected[at.index + 1] === want) {
    return done(at.index + 2)
  }
  return { status: 'wrong', next: at, expected: want }
}

/** True when `made` keeps the player on track (for `allowMove`). */
export const acceptsMove = (expected: readonly Move[], at: FollowState, made: Move): boolean =>
  followMove(expected, at, made).status !== 'wrong'

/** Run a whole list of turns through `followMove`; stops at the first wrong one. */
export function followAll(expected: readonly Move[], made: readonly Move[]): FollowResult {
  let at = FOLLOW_START
  let last: FollowResult = { status: 'progress', next: at, expected: expected[0] ?? null }
  for (const move of made) {
    last = followMove(expected, at, move)
    if (last.status !== 'progress') return last
    at = last.next
  }
  return last
}

/** How far through the sequence the player is, counting a half-done double as half a move. */
export const followFraction = (expected: readonly Move[], at: FollowState): number =>
  expected.length === 0 ? 1 : Math.min(1, (at.index + (at.partial ? 0.5 : 0)) / expected.length)
