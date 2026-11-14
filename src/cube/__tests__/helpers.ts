import Cube from 'cubejs'
import { ALL_MOVES, type Move } from '../notation'
import { seededRng, type Rng } from '../scramble'

export function randomMoves(rng: Rng, length: number, pool: readonly Move[] = ALL_MOVES): Move[] {
  return Array.from({ length }, () => pool[Math.floor(rng() * pool.length)])
}

/** The facelet string cubejs produces for an algorithm — an independent implementation. */
export function cubejsState(alg: readonly Move[]): string {
  const cube = new Cube()
  if (alg.length) cube.move(alg.join(' '))
  return cube.asString()
}

export { seededRng }
