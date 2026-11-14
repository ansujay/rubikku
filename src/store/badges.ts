import { STAGES, type CubeColor } from './stages'

export type BadgeCategory = 'learning' | 'solving' | 'speed' | 'streak' | 'skills'

export interface BadgeDef {
  id: string
  name: string
  /** How to earn it — shown on locked badges too, so it doubles as a goal. */
  description: string
  category: BadgeCategory
  color: CubeColor
  /** Icon name from src/ui/icons (kept as a string so the store does not depend on the UI). */
  icon: string
}

const stageBadgeNames: Record<string, string> = {
  daisy: 'Daisy Maker',
  'white-cross': 'Cross Builder',
  'white-corners': 'Corner Captain',
  'middle-layer': 'Second Storey',
  'yellow-cross': 'Top Cross',
  'yellow-edges': 'Edge Aligner',
  'yellow-corners-position': 'Corner Placer',
  'yellow-corners-orient': 'Final Twist',
}

export const stageBadgeId = (stageId: string) => `stage-${stageId}`

export const BADGES: readonly BadgeDef[] = [
  { id: 'first-steps', name: 'First Steps', description: 'Finish the basics: Meet your cube.', category: 'learning', color: 'white', icon: 'route' },
  ...STAGES.map(
    (stage): BadgeDef => ({
      id: stageBadgeId(stage.id),
      name: stageBadgeNames[stage.id] ?? stage.title,
      description: `Finish stage ${stage.number}: ${stage.title}.`,
      category: 'learning',
      color: stage.color,
      icon: 'layers',
    }),
  ),
  { id: 'full-method', name: 'Method Master', description: 'Finish all eight stages.', category: 'learning', color: 'yellow', icon: 'crown' },

  { id: 'first-solve', name: 'First Solve', description: 'Solve the whole cube for the first time.', category: 'solving', color: 'green', icon: 'cube' },
  { id: 'solves-10', name: 'Ten Down', description: 'Solve the cube 10 times.', category: 'solving', color: 'green', icon: 'cube' },
  { id: 'solves-50', name: 'Fifty Club', description: 'Solve the cube 50 times.', category: 'solving', color: 'blue', icon: 'cube' },
  { id: 'solves-100', name: 'Centurion', description: 'Solve the cube 100 times.', category: 'solving', color: 'red', icon: 'medal' },
  { id: 'real-deal', name: 'The Real Deal', description: 'Solve your real cube with the guided solver.', category: 'solving', color: 'orange', icon: 'wand' },

  { id: 'sub-5', name: 'Under Five', description: 'Solve on the timer in under 5 minutes. Counts once you have solved the whole cube in Rubikku (Free play, the last lesson or your real cube); times under 20 seconds don’t count.', category: 'speed', color: 'white', icon: 'timer' },
  { id: 'sub-3', name: 'Under Three', description: 'Solve on the timer in under 3 minutes. Counts once you have solved the whole cube in Rubikku (Free play, the last lesson or your real cube); times under 20 seconds don’t count.', category: 'speed', color: 'green', icon: 'timer' },
  { id: 'sub-2', name: 'Under Two', description: 'Solve on the timer in under 2 minutes. Counts once you have solved the whole cube in Rubikku (Free play, the last lesson or your real cube); times under 20 seconds don’t count.', category: 'speed', color: 'orange', icon: 'timer' },
  { id: 'sub-1', name: 'Sub-Minute', description: 'Solve on the timer in under 1 minute. Counts once you have solved the whole cube in Rubikku (Free play, the last lesson or your real cube); times under 20 seconds don’t count.', category: 'speed', color: 'red', icon: 'bolt' },

  { id: 'streak-3', name: 'Warming Up', description: 'Practise 3 days in a row.', category: 'streak', color: 'orange', icon: 'flame' },
  { id: 'streak-7', name: 'Full Week', description: 'Practise 7 days in a row.', category: 'streak', color: 'orange', icon: 'flame' },
  { id: 'streak-30', name: 'Unstoppable', description: 'Practise 30 days in a row.', category: 'streak', color: 'red', icon: 'flame' },
  { id: 'daily-5', name: 'Daily Driver', description: 'Finish 5 daily challenges.', category: 'streak', color: 'yellow', icon: 'calendar' },

  { id: 'notation-rookie', name: 'Speaks Cube', description: 'Finish a round of the notation trainer.', category: 'skills', color: 'blue', icon: 'notation' },
  { id: 'notation-master', name: 'Notation Master', description: 'Finish 3 notation rounds without a single miss.', category: 'skills', color: 'blue', icon: 'notation' },
  { id: 'algorithm-ace', name: 'Algorithm Ace', description: 'Practise 10 different algorithms.', category: 'skills', color: 'red', icon: 'cards' },
  { id: 'pattern-collector', name: 'Pattern Collector', description: 'Make 5 different patterns.', category: 'skills', color: 'green', icon: 'grid' },
  { id: 'pattern-curator', name: 'Pattern Curator', description: 'Make 12 different patterns.', category: 'skills', color: 'yellow', icon: 'grid' },
  { id: 'level-5', name: 'High Five', description: 'Reach level 5.', category: 'skills', color: 'yellow', icon: 'star' },
  { id: 'level-10', name: 'Double Digits', description: 'Reach level 10.', category: 'skills', color: 'red', icon: 'star' },
]

const byId = new Map(BADGES.map((badge) => [badge.id, badge]))

export const getBadge = (id: string): BadgeDef | undefined => byId.get(id)
