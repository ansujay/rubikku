/**
 * Pretty patterns to make on a solved cube. Each algorithm starts from a solved cube; doing the
 * inverse (see `invertAlg`) brings it back.
 */
import { parseAlg, type Move } from './notation'

export interface CubePattern {
  id: string
  name: string
  /** One or two short sentences for a 10+ year-old. */
  description: string
  /** The algorithm as notation text. */
  alg: string
  /** The same algorithm, parsed. */
  moves: readonly Move[]
  /** 1 (easy to do and remember) to 3 (long — follow along carefully). */
  difficulty: 1 | 2 | 3
}

function pattern(
  id: string,
  name: string,
  difficulty: 1 | 2 | 3,
  alg: string,
  description: string,
): CubePattern {
  return { id, name, description, alg, moves: parseAlg(alg), difficulty }
}

export const PATTERNS: readonly CubePattern[] = [
  pattern(
    'checkerboard',
    'Checkerboard',
    1,
    'M2 E2 S2',
    'Every face turns into a two-colour chessboard. Just three half turns of the middle slices — and the same three undo it.',
  ),
  pattern(
    'four-spots',
    'Four Spots',
    1,
    "F2 B2 U D' R2 L2 U D'",
    'Four centres jump to the opposite side, leaving a spot on each side face. Top and bottom stay clean.',
  ),
  pattern(
    'six-spots',
    'Six Spots',
    1,
    "U D' R L' F B' U D'",
    'Every centre swaps onto another face, so all six sides get a spot of a different colour.',
  ),
  pattern(
    'zig-zag',
    'Zig-Zag',
    1,
    'R L F B R L F B R L F B',
    'Four moves, three times over, and a lightning-bolt Z appears on the four side faces.',
  ),
  pattern(
    'crosses',
    'Crosses',
    2,
    "U F B' L2 U2 L2 F' B U2 L2 U",
    'A plus sign on every face, each with different-coloured corners.',
  ),
  pattern(
    'stripes',
    'Stripes',
    3,
    "F U F R L2 B D' R D2 L D' B R2 L F U F",
    'The four side faces turn into three-colour stripes, like a row of flags.',
  ),
  pattern(
    'cube-in-a-cube',
    'Cube in a Cube',
    2,
    "F L F U' R U F2 L2 U' L' B D' B' L2 U",
    'A small cube appears to sit inside the corner of the big one.',
  ),
  pattern(
    'cube-in-a-cube-in-a-cube',
    'Cube in a Cube in a Cube',
    3,
    "U' L' U' F' R2 B' R F U B2 U B' L U' F U R F'",
    'A tiny cube inside a small cube inside the big cube — three layers of corners.',
  ),
  pattern(
    'anaconda',
    'Anaconda',
    2,
    "L U B' U' R L' B R' F B' D R D' F'",
    'A thick snake winds its way around all six faces.',
  ),
  pattern(
    'colourful-checkerboard',
    'Colourful Checkerboard',
    3,
    "F B2 R' D2 B R U D' R L' D' F' R2 D F2 B'",
    'A chessboard on every face, but with three colours mixing around the cube instead of two.',
  ),
  pattern(
    'plummers-cross',
    "Plummer's Cross",
    3,
    "R2 L' D F2 R' D' R' L U' D R D B2 R' U D2",
    'Crosses on all six faces, with corners in a third colour. One of the most famous patterns there is.',
  ),
  pattern(
    'superflip',
    'Superflip',
    3,
    "U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2",
    'Every corner is home but every single edge is flipped. It is one of the hardest positions to solve — it takes 20 moves, the most any cube ever needs.',
  ),
]

/** Look a pattern up by id. */
export function getPattern(id: string): CubePattern | undefined {
  return PATTERNS.find((p) => p.id === id)
}
