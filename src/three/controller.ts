/**
 * CubeController: the state side of a cube — current state, undo/redo history, animated
 * algorithm runs and a step-through "player" — with no React and no three.js in it.
 *
 * It talks to a mounted <Cube3D> through the tiny `CubeViewDriver` interface (the view's
 * imperative handle satisfies it). With no view attached everything still works, instantly.
 * React code uses it through `useCubeController` (useCubeController.ts).
 *
 * One rule keeps it simple: **the history is the single source of truth.** The player does
 * not keep its own copy of the cube; it is a window onto the history ("the moves after
 * `offset` are the first `position` moves of `alg`"), so undo is "step back" and the saved
 * session restores a half-played algorithm exactly.
 */
import {
  applyAlg,
  applyMove,
  invertMove,
  isMove,
  isStateString,
  SOLVED,
  toAlg,
  type Alg,
  type CubeState,
  type Move,
} from '../cube'

// ───────────────────────── Session (serialisable) ─────────────────────────

export interface PlayerSession {
  /** The algorithm loaded into the player. */
  alg: Move[]
  /** Index in `done` where the algorithm starts. */
  offset: number
  /** How many of its moves are applied: 0 … alg.length. */
  position: number
  speed: number
}

/** Everything needed to restore a cube exactly: plain JSON, safe to persist. */
export interface CubeSession {
  /** The cube before the first move in `done`. */
  start: CubeState
  /** The cube now: always `applyAlg(start, done)`. */
  state: CubeState
  /** Moves made since `start`, oldest first (what undo walks back through). */
  done: Move[]
  /** Moves that were undone, most recently undone last (what redo replays). */
  undone: Move[]
  player?: PlayerSession | null
  /**
   * How many of the oldest moves have been trimmed off the front of `done` (the history keeps
   * `HISTORY_LIMIT` moves; `start` moves along with the trim). Absent or 0: nothing trimmed.
   */
  dropped?: number
}

export const HISTORY_LIMIT = 600

export function createSession(state: CubeState = SOLVED): CubeSession {
  return { start: state, state, done: [], undone: [], player: null }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Validate a saved session. Anything that does not add up (bad states, unknown moves, a history
 * that does not lead to the saved state) is repaired or dropped; the result is always usable.
 * Returns null only when there is no usable cube state at all.
 */
export function sanitizeSession(saved: unknown): CubeSession | null {
  if (isStateString(saved)) return createSession(saved)
  if (!isRecord(saved)) return null
  const state = isStateString(saved.state) ? saved.state : null
  const start = isStateString(saved.start) ? saved.start : null
  if (!state && !start) return null
  const moves = (value: unknown): Move[] | null => (Array.isArray(value) && value.every(isMove) ? (value.slice(-HISTORY_LIMIT * 2) as Move[]) : null)
  const done = moves(saved.done)
  if (!start || !done || (state && applyAlg(start, done) !== state)) return createSession(state ?? start!)
  const session: CubeSession = { start, state: applyAlg(start, done), done, undone: moves(saved.undone) ?? [], player: null }
  const p = saved.player
  if (isRecord(p)) {
    const alg = moves(p.alg)
    const offset = typeof p.offset === 'number' ? p.offset : -1
    const position = typeof p.position === 'number' ? p.position : -1
    const speed = typeof p.speed === 'number' && p.speed > 0 && p.speed <= 4 ? p.speed : 1
    const fits =
      alg !== null &&
      Number.isInteger(offset) &&
      Number.isInteger(position) &&
      offset >= 0 &&
      position >= 0 &&
      position <= alg.length &&
      offset + position === done.length &&
      alg.slice(0, position).every((move, i) => done[offset + i] === move)
    if (fits) session.player = { alg: alg!, offset, position, speed }
  }
  if (typeof saved.dropped === 'number' && Number.isInteger(saved.dropped) && saved.dropped > 0) session.dropped = Math.min(saved.dropped, 10_000_000)
  return session
}

// ───────────────────────── View driver ─────────────────────────

export type MoveSource = 'drag' | 'keyboard' | 'play'

export interface MoveMeta {
  /** `drag` and `keyboard` are the user's own turns; `play` is a turn started by `play()`. */
  source: MoveSource
  /** The cube after the move. */
  state: CubeState
}

export interface PlayOptions {
  /** Speed multiplier on top of the user's turn-speed setting. Default 1. */
  speed?: number
  /** Apply without animating. */
  instant?: boolean
}

/** The part of the <Cube3D> handle the controller needs. */
export interface CubeViewDriver {
  play(alg: Alg | string, options?: PlayOptions): Promise<boolean>
  stop(): void
  whenIdle(): Promise<void>
  /**
   * Show this state now, without animating. The controller calls it before every run: a run is
   * often started in the same handler that changed the state (load + play, reset + apply, "play
   * again"), before React has handed the new `state` prop to the view.
   */
  setStateInstant?(state: CubeState): void
}

// ───────────────────────── Controller ─────────────────────────

export interface PlayerSnapshot {
  alg: readonly Move[]
  /** Moves of `alg` applied so far: 0 … total. Feed to PlaybackBar. */
  position: number
  total: number
  playing: boolean
  speed: number
  /** Index of the move being animated right now, or -1. Feed to MoveSequence `activeIndex`. */
  activeIndex: number
  /** True after the user turned the cube themselves; the next player action snaps back. */
  detached: boolean
}

export interface CubeSnapshot {
  state: CubeState
  start: CubeState
  /** Moves since `start`, oldest first. */
  history: readonly Move[]
  /** Moves made since the cube was last set up — `history.length` plus any moves trimmed off its front. */
  moveCount: number
  redoStack: readonly Move[]
  canUndo: boolean
  canRedo: boolean
  /** True while an `apply()` run or a player move is animating. */
  busy: boolean
  player: PlayerSnapshot | null
}

export interface ApplyOptions {
  /** Animate on the attached view (default true). */
  animate?: boolean
  /** Speed multiplier for this run. */
  speed?: number
  /** Add the moves to the undo history (default true). */
  record?: boolean
}

export interface LoadOptions {
  /** Set the cube to this state first (clears the history). Default: carry on from the current cube. */
  from?: CubeState
  autoplay?: boolean
  speed?: number
}

export interface CubeControllerOptions {
  initial?: CubeSession | CubeState | null
  historyLimit?: number
  /** Pause between moves while the player is playing, in ms at speed 1. Default 110. */
  playerGapMs?: number
}

type Listener = () => void
type UserMoveListener = (move: Move, state: CubeState, source: MoveSource) => void

export class CubeController {
  private session: CubeSession
  private snapshot: CubeSnapshot
  private listeners = new Set<Listener>()
  private userMoveListeners = new Set<UserMoveListener>()
  private view: CubeViewDriver | null = null
  private limit: number
  private gapMs: number

  /** The run in flight: its moves arrive one by one through `handleViewMove`. */
  private run: { id: number; record: boolean; player: boolean } | null = null
  private runCounter = 0
  private playing = false
  private playToken = 0
  private detached = false
  private animatingIndex = -1

  constructor(options: CubeControllerOptions = {}) {
    this.session = sanitizeSession(options.initial) ?? createSession()
    this.limit = Math.max(10, options.historyLimit ?? HISTORY_LIMIT)
    this.gapMs = options.playerGapMs ?? 110
    this.snapshot = this.buildSnapshot()
  }

  // ── store plumbing ──

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): CubeSnapshot => this.snapshot

  /** The serialisable session (state + history + player position). */
  getSession(): CubeSession {
    return this.session
  }

  /** Called with every turn the user makes on the cube (not for `apply`, undo or the player). */
  onUserMove(listener: UserMoveListener): () => void {
    this.userMoveListeners.add(listener)
    return () => this.userMoveListeners.delete(listener)
  }

  attachView = (view: CubeViewDriver | null): void => {
    if (this.view === view) return
    this.view = view
    // The cube went away mid-run: nothing will finish it, so do not leave `busy`/`playing` set.
    if (!view && (this.run || this.playing)) {
      this.cancelRuns()
      this.commit()
    }
  }

  get state(): CubeState {
    return this.session.state
  }

  private buildSnapshot(): CubeSnapshot {
    const { session } = this
    const p = session.player
    return {
      state: session.state,
      start: session.start,
      history: session.done,
      moveCount: (session.dropped ?? 0) + session.done.length,
      redoStack: session.undone,
      canUndo: session.done.length > 0,
      canRedo: session.undone.length > 0,
      busy: this.run !== null,
      player: p
        ? {
            alg: p.alg,
            position: p.position,
            total: p.alg.length,
            playing: this.playing,
            speed: p.speed,
            activeIndex: this.animatingIndex,
            detached: this.detached,
          }
        : null,
    }
  }

  private commit(session: CubeSession = this.session): void {
    this.session = session
    this.snapshot = this.buildSnapshot()
    for (const listener of [...this.listeners]) listener()
  }

  /** Append a move to the history, trimming the oldest moves past the limit. */
  private pushed(move: Move, player: PlayerSession | null | undefined): CubeSession {
    let { start, dropped = 0 } = this.session
    let done = [...this.session.done, move]
    let nextPlayer = player ?? null
    if (done.length > this.limit) {
      const drop = done.length - this.limit
      start = applyAlg(start, done.slice(0, drop))
      done = done.slice(drop)
      dropped += drop
      if (nextPlayer) nextPlayer = nextPlayer.offset >= drop ? { ...nextPlayer, offset: nextPlayer.offset - drop } : null
    }
    return { start, state: applyMove(this.session.state, move), done, undone: [], player: nextPlayer, ...(dropped > 0 ? { dropped } : {}) }
  }

  private cancelRuns(): void {
    this.playToken++
    this.playing = false
    this.run = null
    this.animatingIndex = -1
  }

  // ── moves coming from the view ──

  /** Wire this to <Cube3D onMove>. */
  handleViewMove = (move: Move, meta: { source: MoveSource }): void => {
    const p = this.session.player
    if (meta.source === 'play') {
      const run = this.run
      if (run?.player && p) {
        this.animatingIndex = p.position
        this.commit(this.pushed(move, { ...p, position: p.position + 1 }))
      } else if (!run || run.record) {
        this.detachPlayer()
        this.commit(this.pushed(move, p))
      } else {
        // Unrecorded: the cube changes but the history starts over from here.
        const state = applyMove(this.session.state, move)
        this.detached = false
        this.commit({ start: state, state, done: [], undone: [], player: null })
      }
      return
    }
    // The user's own turn. Doing the player's next move by hand counts as a step forward.
    if (this.playing) this.pause()
    if (p && !this.detached && p.alg[p.position] === move) {
      this.commit(this.pushed(move, { ...p, position: p.position + 1 }))
    } else {
      this.detachPlayer()
      this.commit(this.pushed(move, p))
    }
    for (const listener of [...this.userMoveListeners]) listener(move, this.session.state, meta.source)
  }

  private detachPlayer(): void {
    if (this.session.player) this.detached = true
  }

  // ── direct changes ──

  /** Set the cube to a state instantly. Clears the history and unloads the player. */
  reset(state: CubeState = SOLVED): void {
    this.cancelRuns()
    this.view?.stop()
    this.detached = false
    this.commit(createSession(state))
  }

  /** Replace the whole session (e.g. restoring a save). */
  restore(session: CubeSession | CubeState): void {
    this.cancelRuns()
    this.view?.stop()
    this.detached = false
    this.commit(sanitizeSession(session) ?? createSession())
  }

  /** Stop any animation in flight; the move being animated finishes at once. */
  stop(): void {
    this.cancelRuns()
    this.view?.stop()
    this.commit()
  }

  /**
   * Do an algorithm. Animated on the attached view (moves appear in the state one by one as
   * they start); instant when there is no view or `animate` is false. Resolves true when every
   * move was done, false if it was interrupted (the moves done so far stay done).
   */
  async apply(alg: Alg | string, options: ApplyOptions = {}): Promise<boolean> {
    const moves = toAlg(alg)
    const { animate = true, speed = 1, record = true } = options
    if (this.playing) this.pause()
    if (this.run) {
      this.cancelRuns()
      this.view?.stop()
    }
    if (moves.length === 0) return true
    const run = { id: ++this.runCounter, record, player: false }
    this.run = run
    this.commit()
    const completed = await this.drive(moves, { speed, instant: !animate })
    if (this.run === run) {
      this.run = null
      this.animatingIndex = -1
      this.commit()
    }
    return completed
  }

  /** Send moves through the view (so they animate), or straight through when there is none. */
  private async drive(moves: readonly Move[], options: PlayOptions): Promise<boolean> {
    const run = this.run
    if (this.view) {
      // The view may not have been given the current state yet (see `CubeViewDriver.setStateInstant`);
      // started from a stale cube, the run would be cancelled by the next render's snap.
      this.view.setStateInstant?.(this.session.state)
      return this.view.play(moves, options)
    }
    for (const move of moves) {
      if (this.run !== run) return false
      this.handleViewMove(move, { source: 'play' })
    }
    return true
  }

  undo(): boolean {
    const { done, undone, player } = this.session
    if (done.length === 0) return false
    this.interrupt()
    const move = done[done.length - 1]
    const nextDone = done.slice(0, -1)
    let nextPlayer = player ?? null
    if (nextPlayer) {
      if (nextDone.length < nextPlayer.offset) nextPlayer = null
      else if (!this.detached) nextPlayer = { ...nextPlayer, position: nextPlayer.position - 1 }
      else if (nextDone.length === nextPlayer.offset + nextPlayer.position) this.detached = false
    }
    if (!nextPlayer) this.detached = false
    this.commit({ ...this.session, state: applyMove(this.session.state, invertMove(move)), done: nextDone, undone: [...undone, move], player: nextPlayer })
    return true
  }

  redo(): boolean {
    const { done, undone, player } = this.session
    if (undone.length === 0) return false
    this.interrupt()
    const move = undone[undone.length - 1]
    let nextPlayer = player ?? null
    if (nextPlayer && !this.detached) {
      if (nextPlayer.alg[nextPlayer.position] === move) nextPlayer = { ...nextPlayer, position: nextPlayer.position + 1 }
      else this.detached = true
    }
    this.commit({
      ...this.session,
      state: applyMove(this.session.state, move),
      done: [...done, move],
      undone: undone.slice(0, -1),
      player: nextPlayer,
    })
    return true
  }

  /** Stop the player and any run before a direct change to the history. */
  private interrupt(): void {
    if (this.playing || this.run) {
      this.cancelRuns()
      this.view?.stop()
    }
  }

  // ── player ──

  /** Load an algorithm to step through. Does not move the cube unless `from` is given. */
  load(alg: Alg | string, options: LoadOptions = {}): void {
    const moves = [...toAlg(alg)]
    this.interrupt()
    this.detached = false
    const base: CubeSession = options.from ? createSession(options.from) : { ...this.session, undone: [] }
    this.commit({ ...base, player: { alg: moves, offset: base.done.length, position: 0, speed: options.speed ?? this.session.player?.speed ?? 1 } })
    if (options.autoplay) this.play()
  }

  /** Forget the loaded algorithm (the cube and the history stay as they are). */
  unload(): void {
    if (!this.session.player) return
    this.interrupt()
    this.detached = false
    this.commit({ ...this.session, player: null })
  }

  /** If the user wandered off (turned the cube mid-algorithm), snap back to the player's position. */
  private resync(): PlayerSession | null {
    const p = this.session.player
    if (!p) return null
    if (!this.detached) return p
    this.detached = false
    const done = [...this.session.done.slice(0, p.offset), ...p.alg.slice(0, p.position)]
    this.commit({ ...this.session, state: applyAlg(this.session.start, done), done, undone: [] })
    return p
  }

  play(): void {
    let p = this.resync()
    if (!p || this.playing) return
    if (p.position >= p.alg.length) {
      this.seek(0)
      p = this.session.player!
    }
    this.playing = true
    const token = ++this.playToken
    this.commit()
    void this.playLoop(token)
  }

  private async playLoop(token: number): Promise<void> {
    while (this.playing && token === this.playToken) {
      const p = this.session.player
      if (!p || p.position >= p.alg.length) break
      const ok = await this.playerMove(p)
      if (token !== this.playToken) return
      // The view dropped the move (he grabbed a layer, the cube snapped): playback is over.
      if (!ok) break
      const next = this.session.player
      if (!next || next.position >= next.alg.length) break
      const gap = this.view ? this.gapMs / next.speed : 0
      if (gap > 0) await new Promise((resolve) => setTimeout(resolve, gap))
    }
    if (token === this.playToken && this.playing) {
      this.playing = false
      this.commit()
    }
  }

  /** Animate the player's next move. */
  private async playerMove(p: PlayerSession): Promise<boolean> {
    const run = { id: ++this.runCounter, record: true, player: true }
    this.run = run
    this.commit()
    const ok = await this.drive([p.alg[p.position]], { speed: p.speed })
    if (this.run === run) {
      this.run = null
      this.animatingIndex = -1
      this.commit()
    }
    return ok
  }

  pause(): void {
    if (!this.playing) return
    this.playToken++
    this.playing = false
    this.commit()
  }

  toggle(): void {
    if (this.playing) this.pause()
    else this.play()
  }

  /** Step one move forward (+1) or back (-1), animated. */
  step(delta: 1 | -1): void {
    this.pause()
    const p = this.resync()
    if (!p) return
    if (this.run) {
      this.cancelRuns()
      this.view?.stop()
    }
    if (delta > 0) {
      if (p.position < p.alg.length) void this.playerMove(this.session.player!)
    } else if (p.position > 0) {
      this.undo()
    }
  }

  /** Jump to a position (0 … total). One step away animates; further jumps are instant. */
  seek(position: number): void {
    this.pause()
    const p = this.resync()
    if (!p) return
    const target = Math.min(p.alg.length, Math.max(0, Math.round(position)))
    if (target === p.position) return
    this.interrupt()
    const done = [...this.session.done.slice(0, p.offset), ...p.alg.slice(0, target)]
    this.commit({ ...this.session, state: applyAlg(this.session.start, done), done, undone: [], player: { ...p, position: target } })
  }

  restart(): void {
    this.seek(0)
  }

  setSpeed(speed: number): void {
    const p = this.session.player
    if (!p || !(speed > 0)) return
    this.commit({ ...this.session, player: { ...p, speed } })
  }
}
