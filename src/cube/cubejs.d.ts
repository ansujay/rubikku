/**
 * Minimal types for the `cubejs` package (CommonJS, no bundled types).
 * Only the parts the engine and its tests use are declared.
 */
declare module 'cubejs' {
  interface CubeJSON {
    center: number[]
    cp: number[]
    co: number[]
    ep: number[]
    eo: number[]
  }

  class Cube {
    constructor(state?: Cube | CubeJSON)
    /** Build a cube from a 54-character facelet string (faces U R F D L B). */
    static fromString(facelets: string): Cube
    /** A uniformly random solvable cube. */
    static random(): Cube
    /** Inverse of an algorithm given as text. */
    static inverse(alg: string): string
    /** Build the solver's lookup tables. Slow (seconds) — call once, off the main thread. */
    static initSolver(): void
    /** A random-state scramble. Requires `initSolver()`. */
    static scramble(): string
    /** Apply moves given as space-separated text (supports U R F D L B E M S x y z u r f d l b). */
    move(alg: string): this
    /** 54-character facelet string. */
    asString(): string
    toJSON(): CubeJSON
    clone(): Cube
    isSolved(): boolean
    /** Kociemba two-phase solution as text. Requires `initSolver()`. Do not call on a solved cube. */
    solve(maxDepth?: number): string
    randomize(): this
  }

  export default Cube
}

/** The cube model alone, without the solver (see `optimal/core.ts` for why it is loaded apart). */
declare module 'cubejs/lib/cube.js' {
  import Cube from 'cubejs'
  export default Cube
}
