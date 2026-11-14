import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { Alg, CubeState, Move } from '../cube'
import { celebration } from '../ui'
import type { Cube3DHandle, Cube3DProps } from './Cube3D'
import {
  CubeController,
  type ApplyOptions,
  type CubeControllerOptions,
  type CubeSession,
  type CubeSnapshot,
  type LoadOptions,
  type MoveSource,
  type PlayerSnapshot,
} from './controller'

export interface UseCubeControllerOptions extends Omit<CubeControllerOptions, 'initial'> {
  /**
   * Where to start: a state, or a saved session (state + history + player position). Read once,
   * on the first render — pass a function to read it lazily from a store.
   */
  initial?: CubeSession | CubeState | null | (() => CubeSession | CubeState | null | undefined)
  /** Called after every change with the serialisable session: save it to a persisted store. */
  onChange?: (session: CubeSession) => void
  /** Called for every turn the user makes on the cube (drag or keyboard) — not for apply/undo/player. */
  onUserMove?: (move: Move, state: CubeState, source: MoveSource) => void
  /**
   * While its `<Cube3D>` is mounted, this cube is "the cube on screen" for the celebration system
   * (`celebration.registerCube`): moments and milestones make it celebrate. Default true; pass
   * false for a cube that should never react (e.g. a second cube on the same page).
   */
  celebrate?: boolean
}

export interface CubePlayerApi extends PlayerSnapshot {
  play(): void
  pause(): void
  toggle(): void
  /** One move forward or back, animated. */
  step(delta: 1 | -1): void
  /** Jump to a position (0 … total). */
  seek(position: number): void
  restart(): void
  setSpeed(speed: number): void
  /** Forget the algorithm; the cube stays as it is. */
  unload(): void
}

export interface CubeControllerApi extends Omit<CubeSnapshot, 'player'> {
  /** Spread onto <Cube3D>: `<Cube3D {...cube.bind} />`. */
  bind: Pick<Cube3DProps, 'state' | 'onMove' | 'onUndo' | 'onRedo'> & { ref: (handle: Cube3DHandle | null) => void }
  /** The mounted cube's handle, for camera work: `cube.view.current?.peek()`. */
  view: { readonly current: Cube3DHandle | null }
  /** Do an algorithm (animated; pass `{ animate: false }` for instant). */
  apply(alg: Alg | string, options?: ApplyOptions): Promise<boolean>
  undo(): boolean
  redo(): boolean
  /** Set the cube to a state instantly; clears the history and unloads the player. Default: solved. */
  reset(state?: CubeState): void
  /** Replace everything from a saved session. */
  restore(session: CubeSession | CubeState): void
  /** Stop any run in flight. */
  stop(): void
  /** Load an algorithm into the player (for PlaybackBar). `from` sets the cube up first. */
  load(alg: Alg | string, options?: LoadOptions): void
  /** The loaded algorithm and its transport controls; null when nothing is loaded. */
  player: CubePlayerApi | null
  /** The serialisable session right now. */
  getSession(): CubeSession
  /** The underlying controller (framework-free). */
  controller: CubeController
}

/**
 * Owns a cube's state, undo/redo history, animated runs and step-through playback, so pages do
 * not reimplement them.
 *
 *   const cube = useCubeController({ initial: () => usePlayStore.getState().session, onChange: save })
 *   <Cube3D {...cube.bind} />
 *   <Button onClick={() => cube.apply(randomScramble(), { speed: 3, record: false })}>Scramble</Button>
 *   <Button onClick={cube.undo} disabled={!cube.canUndo}>Undo</Button>
 *
 *   cube.load("R U R' U'", { from: setupState })          // lesson demo
 *   {cube.player && <PlaybackBar playing={cube.player.playing} onPlayPause={cube.player.toggle}
 *      position={cube.player.position} total={cube.player.total}
 *      onStepBack={() => cube.player.step(-1)} onStepForward={() => cube.player.step(1)}
 *      onRestart={cube.player.restart} onScrub={cube.player.seek}
 *      speed={cube.player.speed} onSpeedChange={cube.player.setSpeed} />}
 */
export function useCubeController(options: UseCubeControllerOptions = {}): CubeControllerApi {
  const [controller] = useState(() => {
    const { initial, onChange: _onChange, onUserMove: _onUserMove, celebrate: _celebrate, ...rest } = options
    return new CubeController({ ...rest, initial: typeof initial === 'function' ? (initial() ?? null) : initial })
  })
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const viewRef = useRef<Cube3DHandle | null>(null)
  const unregister = useRef<(() => void) | null>(null)

  const callbacks = useRef(options)
  useLayoutEffect(() => {
    callbacks.current = options
  })

  useEffect(() => {
    const offMove = controller.onUserMove((move, state, source) => callbacks.current.onUserMove?.(move, state, source))
    let last = controller.getSession()
    const offChange = controller.subscribe(() => {
      const session = controller.getSession()
      if (session === last) return
      last = session
      callbacks.current.onChange?.(session)
    })
    return () => {
      offMove()
      offChange()
    }
  }, [controller])

  useEffect(
    () => () => {
      unregister.current?.()
      unregister.current = null
    },
    [],
  )

  const stable = useMemo(
    () => ({
      ref: (handle: Cube3DHandle | null) => {
        viewRef.current = handle
        controller.attachView(handle)
        // The mounted view is the one celebrations spin (pages need no `useCelebrationCube`).
        unregister.current?.()
        unregister.current = null
        if (handle && callbacks.current.celebrate !== false) unregister.current = celebration.registerCube({ celebrate: (tier) => viewRef.current?.celebrate(tier) })
      },
      view: viewRef as { readonly current: Cube3DHandle | null },
      apply: (alg: Alg | string, o?: ApplyOptions) => controller.apply(alg, o),
      undo: () => controller.undo(),
      redo: () => controller.redo(),
      reset: (state?: CubeState) => controller.reset(state),
      restore: (session: CubeSession | CubeState) => controller.restore(session),
      stop: () => controller.stop(),
      load: (alg: Alg | string, o?: LoadOptions) => controller.load(alg, o),
      getSession: () => controller.getSession(),
      player: {
        play: () => controller.play(),
        pause: () => controller.pause(),
        toggle: () => controller.toggle(),
        step: (delta: 1 | -1) => controller.step(delta),
        seek: (position: number) => controller.seek(position),
        restart: () => controller.restart(),
        setSpeed: (speed: number) => controller.setSpeed(speed),
        unload: () => controller.unload(),
      },
    }),
    [controller],
  )

  return useMemo<CubeControllerApi>(() => {
    const { player, ...rest } = snapshot
    return {
      ...rest,
      bind: { ref: stable.ref, state: snapshot.state, onMove: controller.handleViewMove, onUndo: stable.undo, onRedo: stable.redo },
      view: stable.view,
      apply: stable.apply,
      undo: stable.undo,
      redo: stable.redo,
      reset: stable.reset,
      restore: stable.restore,
      stop: stable.stop,
      load: stable.load,
      getSession: stable.getSession,
      player: player ? { ...player, ...stable.player } : null,
      controller,
    }
  }, [snapshot, stable, controller])
}
