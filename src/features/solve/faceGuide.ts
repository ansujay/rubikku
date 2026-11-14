/**
 * Guided entry, one face at a time: how to turn the real cube to look at each face, and exactly
 * which way up the 3 × 3 grid on screen is.
 *
 * The rule that makes it safe: **the grid always shows the face exactly as he sees it after the
 * tilt described here** — and that view is, for every face, the engine's own row-by-row order.
 * The whole-cube turn that produces the view is recorded as `rotation`, and the tests check
 * with the engine that after that turn the face really is the front face, sticker for sticker.
 *
 * Home hold: top centre up, front centre facing him (white and green on a standard cube).
 *
 *   Top     tip the cube towards you             (x')   front edge stays nearest
 *   Front   just look                            ()
 *   Right   quarter turn, right side to front    (y)    top stays on top
 *   Back    another quarter turn, the same way   (y2)   top stays on top — never over the top
 *   Left    another quarter turn, the same way   (y')   top stays on top
 *   Bottom  back home, then tip it away from you (x)    front edge is now the top edge of the view
 */
import type { Color, Face, RotationMove } from '../../cube'

export interface FaceView {
  face: Face
  /** "Top", "Front"… where the face is in the home hold. */
  name: string
  /** Whole-cube turn, from the home hold, that brings this face to the front the way the grid shows it. */
  rotation: readonly RotationMove[]
  /** The faces that touch each side of the grid, as seen after the tilt. */
  neighbours: { top: Face; right: Face; bottom: Face; left: Face }
  /** Camera pose for the 3D cube that shows the same view (azimuth, elevation in radians). */
  pose: { azimuth: number; elevation: number }
}

/** The order the faces are asked for: top, then once round the sides, then the bottom. */
export const GUIDED_FACES: readonly FaceView[] = [
  { face: 'U', name: 'Top', rotation: ["x'"], neighbours: { top: 'B', right: 'R', bottom: 'F', left: 'L' }, pose: { azimuth: 0, elevation: 1.12 } },
  { face: 'F', name: 'Front', rotation: [], neighbours: { top: 'U', right: 'R', bottom: 'D', left: 'L' }, pose: { azimuth: 0.2, elevation: 0.3 } },
  { face: 'R', name: 'Right', rotation: ['y'], neighbours: { top: 'U', right: 'B', bottom: 'D', left: 'F' }, pose: { azimuth: Math.PI / 2 + 0.2, elevation: 0.3 } },
  { face: 'B', name: 'Back', rotation: ['y2'], neighbours: { top: 'U', right: 'L', bottom: 'D', left: 'R' }, pose: { azimuth: Math.PI + 0.2, elevation: 0.3 } },
  { face: 'L', name: 'Left', rotation: ["y'"], neighbours: { top: 'U', right: 'F', bottom: 'D', left: 'B' }, pose: { azimuth: (3 * Math.PI) / 2 + 0.2, elevation: 0.3 } },
  { face: 'D', name: 'Bottom', rotation: ['x'], neighbours: { top: 'F', right: 'R', bottom: 'B', left: 'L' }, pose: { azimuth: 0, elevation: -0.92 } },
]

export const guidedIndexOf = (face: Face): number => GUIDED_FACES.findIndex((view) => view.face === face)

/** How the centres are named in instructions: by colour when painted, by place otherwise. */
export type CentreNames = Record<Face, string>

const PLACE: Record<Face, string> = { U: 'top', D: 'bottom', F: 'front', B: 'back', R: 'right', L: 'left' }

/** "white", "green"… for each face's centre — or "top", "front"… while a centre is blank. */
export function centreNames(centres: Readonly<Record<Face, Color | null>>): CentreNames {
  const names = {} as CentreNames
  for (const face of Object.keys(PLACE) as Face[]) names[face] = centres[face] ?? PLACE[face]
  return names
}

export interface FaceInstruction {
  /** "Now the top face" */
  title: string
  /** How to move the real cube. One or two short sentences. */
  how: string
  /** The check that he is looking at it the right way up. */
  check: string
}

/** Kid-readable instructions for one face. `c` names each centre (see `centreNames`). */
export function faceInstruction(face: Face, c: CentreNames): FaceInstruction {
  switch (face) {
    case 'U':
      return {
        title: 'Start with the top face',
        how: `Hold the cube with the ${c.U} centre on top and the ${c.F} centre facing you. Tip the top towards you a little so you can see it.`,
        check: `The ${c.F} side is nearest to you — at the bottom of the grid. The ${c.B} side is far away, at the top.`,
      }
    case 'F':
      return {
        title: 'Now the front face',
        how: `Sit the cube back up straight and look at the ${c.F} centre.`,
        check: `The ${c.U} side is on top, the ${c.R} side is on your right.`,
      }
    case 'R':
      return {
        title: 'Now the right face',
        how: `Turn the whole cube a quarter turn, like turning a page, so the ${c.R} centre faces you. Don’t tip it over.`,
        check: `The ${c.U} side is still on top. The ${c.F} side is now on your left.`,
      }
    case 'B':
      return {
        title: 'Now the back face',
        how: `Turn the whole cube another quarter turn the same way, like turning the next page, so the ${c.B} centre faces you.`,
        check: `The ${c.U} side is still on top — never flip the cube over the top to see the back. The ${c.R} side is on your left.`,
      }
    case 'L':
      return {
        title: 'Now the left face',
        how: `One more quarter turn the same way. The ${c.L} centre faces you.`,
        check: `The ${c.U} side is still on top. The ${c.B} side is on your left.`,
      }
    case 'D':
      return {
        title: 'Last one: the bottom face',
        how: `Turn once more so the ${c.F} centre faces you again, just like at the start. Now tip the cube away from you until you can see the bottom.`,
        check: `The ${c.F} side is at the top of the grid now, and the ${c.B} side is at the bottom.`,
      }
  }
}
