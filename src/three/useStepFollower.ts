import { useCallback, useState } from 'react'
import {
  applyAlg,
  askFollow,
  followMove,
  followState,
  invertMove,
  replanFollow,
  startFollow,
  type CubeState,
  type FollowOptions,
  type Move,
  type StepFollower,
} from '../cube'

/** The part of `useCubeController()` the follower reads. */
export interface FollowedCube {
  state: CubeState
  start: CubeState
  history: readonly Move[]
}

export interface UseStepFollowerOptions extends FollowOptions {
  /** Set false on screens (or lesson beats) that do not coach a solve: nothing is computed. Default true. */
  enabled?: boolean
}

export interface StepFollowerApi {
  /** Where the learner is in the beginner method (see `StepFollower` in src/cube). */
  follower: StepFollower
  /** Call when a hint is about to be shown (makes a fresh plan if he is hopelessly far off the old one). */
  ask(): void
  /** A fresh plan from the cube as it is now, because he asked for one. */
  replan(): void
}

interface Box {
  follower: StepFollower
  start: CubeState
  history: readonly Move[]
  live: boolean
}

/** How much of a restored history is replayed to find out where he was (the rest is far behind him). */
const REPLAY_LIMIT = 200

/**
 * The follower for a cube that is met with a history already behind it (a restored save, a
 * follower that was asleep): replay the moves from where they started, so that a cube saved in
 * the middle of an algorithm is recognised as exactly that — not analysed as a broken cube.
 */
function fromSession(cube: FollowedCube, options: FollowOptions): StepFollower {
  const skip = Math.max(0, cube.history.length - REPLAY_LIMIT)
  let follower = startFollow(skip > 0 ? applyAlg(cube.start, cube.history.slice(0, skip)) : cube.start, options)
  for (let i = skip; i < cube.history.length; i++) follower = followMove(follower, cube.history[i], options)
  return follower.state === cube.state ? follower : startFollow(cube.state, options)
}

function catchUp(box: Box, cube: FollowedCube, live: boolean, options: FollowOptions): Box {
  const next = { start: cube.start, history: cube.history, live }
  if (!live) return { ...next, follower: box.follower }
  // A cube that was (re)set, or a follower that was asleep: start from here.
  if (!box.live || (cube.start !== box.start && cube.history.length === 0)) return { ...next, follower: fromSession(cube, options) }
  let follower = box.follower
  if (cube.start === box.start) {
    // Replay exactly what happened to the history: moves taken back (undo), then moves added.
    const before = box.history
    const after = cube.history
    let same = 0
    while (same < before.length && same < after.length && before[same] === after[same]) same++
    for (let i = before.length - 1; i >= same; i--) follower = followMove(follower, invertMove(before[i]), options)
    for (let i = same; i < after.length; i++) follower = followMove(follower, after[i], options)
  }
  // (The history was trimmed, or something else moved the cube: work it out from the cube itself.)
  if (follower.state !== cube.state) follower = followState(follower, cube.state, options)
  return { ...next, follower }
}

/**
 * Follows a cube through the beginner method, move by move, so that hints, stage trackers and
 * warnings are only ever worked out at step boundaries (see `src/cube/beginner/follow.ts`).
 *
 *   const cube = useCubeController(...)
 *   const { follower, ask, replan } = useStepFollower(cube, { guiding: hintIsOpen })
 *   follower.step / .moves / .position / .status ('on' | 'half' | 'off' | 'solved' | 'stuck')
 *   follower.next   // the move for the arrow: the next move, or the undo when off the step
 *   follower.undo   // the way back after a slip
 *   follower.view   // analyse THIS for "which stage / what came undone", never cube.state
 *
 * It reads the controller's history, so undo, redo, "show me" runs and several moves landing in
 * one render are all followed exactly.
 */
export function useStepFollower(cube: FollowedCube, options: UseStepFollowerOptions = {}): StepFollowerApi {
  const { enabled = true, guiding = false, whiteCorners } = options
  const follow: FollowOptions = { guiding, whiteCorners }
  const [box, setBox] = useState<Box>(() => ({
    follower: enabled ? fromSession(cube, follow) : startFollow(cube.state, follow),
    start: cube.start,
    history: cube.history,
    live: enabled,
  }))
  let current = box
  if (box.live !== enabled || (enabled && (box.follower.state !== cube.state || box.history !== cube.history || box.start !== cube.start))) {
    // Derived state, brought up to date during render (React re-renders at once, before painting).
    current = catchUp(box, cube, enabled, follow)
    setBox(current)
  }
  const ask = useCallback(() => setBox((b) => (b.live ? { ...b, follower: askFollow(b.follower) } : b)), [])
  const replan = useCallback(() => setBox((b) => (b.live ? { ...b, follower: replanFollow(b.follower) } : b)), [])
  return { follower: current.follower, ask, replan }
}
