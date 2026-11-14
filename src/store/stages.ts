/**
 * The eight beginner stages, in teaching order. Ids are stable (PLAN.md) and are used as keys
 * in the progress store and in routes (`/learn/:stageId`). Lesson content lives in
 * src/features/learn; this is only the shared catalogue.
 */
export type CubeColor = 'white' | 'yellow' | 'green' | 'blue' | 'red' | 'orange'

export interface StageInfo {
  id: StageId
  /** 1-based position on the path. */
  number: number
  title: string
  /** One short line: what you will be able to do. */
  goal: string
  color: CubeColor
}

export const STAGE_IDS = [
  'daisy',
  'white-cross',
  'white-corners',
  'middle-layer',
  'yellow-cross',
  'yellow-edges',
  'yellow-corners-position',
  'yellow-corners-orient',
] as const

export type StageId = (typeof STAGE_IDS)[number]

export const STAGES: readonly StageInfo[] = [
  { id: 'daisy', number: 1, title: 'The daisy', goal: 'Put four white petals around the yellow centre.', color: 'yellow' },
  { id: 'white-cross', number: 2, title: 'White cross', goal: 'Turn the daisy into a cross that matches the sides.', color: 'white' },
  { id: 'white-corners', number: 3, title: 'White corners', goal: 'Drop the corners in to finish the first layer.', color: 'green' },
  { id: 'middle-layer', number: 4, title: 'Middle layer', goal: 'Slide four edges into the second layer.', color: 'orange' },
  { id: 'yellow-cross', number: 5, title: 'Yellow cross', goal: 'Make a yellow cross on the top face.', color: 'yellow' },
  { id: 'yellow-edges', number: 6, title: 'Yellow edges', goal: 'Line the cross up with the side colours.', color: 'red' },
  { id: 'yellow-corners-position', number: 7, title: 'Place the corners', goal: 'Move each yellow corner to its home.', color: 'blue' },
  { id: 'yellow-corners-orient', number: 8, title: 'Final twist', goal: 'Twist the last corners and finish the cube.', color: 'green' },
]

export const isStageId = (value: unknown): value is StageId =>
  typeof value === 'string' && (STAGE_IDS as readonly string[]).includes(value)

export const getStage = (id: string): StageInfo | undefined => STAGES.find((stage) => stage.id === id)
