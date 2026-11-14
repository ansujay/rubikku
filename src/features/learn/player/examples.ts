/** Example cubes drawn from the solver for the lesson figures. */
import { applyAlg, type CubeState } from '../../../cube'
import { heldScramble, solverSteps, solveToStage } from '../engine'

export interface ShapeExample {
  id: 'dot' | 'L' | 'line' | 'cross'
  label: string
  state: CubeState
}

let shapes: ShapeExample[] | null = null

/**
 * The four yellow-cross shapes, each a real cube from a yellow-cross step (stray yellow corners
 * and all, so he learns to ignore them), the L and the line held the way the algorithm wants.
 */
export function yellowShapeExamples(): ShapeExample[] {
  if (shapes) return shapes
  const found: Partial<Record<ShapeExample['id'], CubeState>> = {}
  for (let seed = 0; seed < 200 && Object.keys(found).length < 4; seed++) {
    for (const step of solverSteps(solveToStage(heldScramble(`shapes:${seed}`), 'yellow-cross'))) {
      if (step.stage !== 'yellow-cross') {
        found.cross ??= step.before
        break
      }
      const id = step.caseId.split('/')[1]
      if (id === 'dot' || id === 'L' || id === 'line') found[id] ??= applyAlg(step.before, step.setup)
    }
  }
  shapes = (['dot', 'L', 'line', 'cross'] as const).map((id) => ({ id, label: id === 'L' ? 'L' : id[0].toUpperCase() + id.slice(1), state: found[id]! }))
  return shapes
}
