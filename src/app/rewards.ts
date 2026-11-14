/**
 * One call to reward the player from any feature:
 *
 *   import { reward } from '../../app/rewards'
 *   reward('lesson-completed', { stageId })                     // record + celebrate
 *   reward('solve-completed', { context: 'timer', ms }, { mode: 'quiet' })
 *   const result = reward('pattern-made', { patternId }, { mode: 'silent' })
 *   reward('lesson-completed', { stageId }, { moment: { title: 'White cross learned' } })
 *   reward('solve-completed', { context: 'capstone' }, { milestone: { title: 'You solved the cube' } })
 *
 * It records the event in the progress store (XP, streak, badges, the daily challenge — see
 * src/store/progressLogic.ts) and returns the `EventResult`. What the player then sees comes from
 * the celebration system (`celebration` in src/ui/celebrate.ts), at the tier the reward deserves:
 *
 *   first full solve,   → a MILESTONE takeover, headlined by the achievement ("You solved the
 *   all eight stages      cube"), whatever page it happened on (`MILESTONE_BADGES`)
 *   level-up (3 and up) → a MILESTONE takeover (the level as a big keycap, XP counting up)
 *   level 2             → a MOMENT card: it comes with the first 100 XP — a first lesson or a
 *                         first timer press — and a takeover there is noise, not an achievement
 *   new badge(s)        → a MOMENT card (the badge as a keycap that lands and presses in)
 *   daily challenge     → a toast (or a line inside the moment/milestone when there is one)
 *   plain XP            → a small "+N XP" toast ('full' mode only)
 *
 * `cap: 'moment'`: never a takeover from this reward (a level-up or first solve becomes a moment
 * card). For pages where the next action is one key press away — the timer.
 *
 * `mode`:
 *   'full'   (default) Everything above.
 *   'quiet'  For things that happen over and over, or on a page that shows its own result
 *            (every timer solve, every practice rep, every drill). No "+N XP" toast — the XP
 *            pill in the navigation ticks up by itself. Level-ups, badges and the daily still show.
 *   'silent' Nothing at all, ever. The page celebrates by itself (it can still call
 *            `celebrate(result)` later, e.g. after its own animation).
 *
 * `moment` / `milestone`: the page's own pay-off at that tier, in its own words. The reward's XP,
 * badges and level are folded into that ONE celebration (a stage that also earns a badge and a
 * level-up is a single milestone, titled the way the page asked).
 *
 * Coalescing: rewards that land close together (same handler, or within ~⅓ s) are merged, and
 * celebrations within ~1 s of each other merge too. Nothing stacks up.
 */
import { useProgress, LEVEL_TITLES, type BadgeDef, type DailyChallenge, type EventResult, type ProgressEventMap, type ProgressEventType } from '../store'
import { celebration, sound, toast, type MilestoneOptions, type MomentOptions, type ToastOptions } from '../ui'

export type RewardMode = 'full' | 'quiet' | 'silent'

export interface RewardOptions {
  /** How loudly to celebrate. Default `'full'`. See the notes at the top of this file. */
  mode?: RewardMode
  /** Show the page's own pay-off as a moment; the reward is folded into it. */
  moment?: MomentOptions
  /** Show the page's own pay-off as a milestone takeover; the reward is folded into it. */
  milestone?: MilestoneOptions
  /** The highest tier this reward may show: `'moment'` never takes over the screen. */
  cap?: 'moment'
}

export function reward<K extends ProgressEventType>(type: K, payload: ProgressEventMap[K], options: RewardOptions = {}): EventResult {
  const result = useProgress.getState().recordEvent(type, payload)
  const own = options.milestone ?? options.moment
  if (own) {
    const tier = options.milestone && options.cap !== 'moment' ? 'milestone' : 'moment'
    celebration[tier]({
      ...own,
      xp: own.xp ?? result.xpGained,
      badges: [...(own.badges ?? []), ...result.newBadges],
    })
    // Fold the reward's own tier in at once (not after the coalescing pause): a first solve must
    // not show as a card that turns into a takeover a moment later.
    celebrate(result, options)
    flushRewards()
    return result
  }
  celebrate(result, options)
  return result
}

// ───────────────────────── Combining ─────────────────────────

export interface RewardSummary {
  /** XP to mention. XP from quiet rewards is only counted when something big is shown anyway. */
  xp: number
  badges: BadgeDef[]
  /** The level reached, when any reward in the batch levelled him up. */
  level: number | null
  daily: DailyChallenge | null
}

/** Fold a batch of results into one summary. Pure, for tests. */
export function combineRewards(batch: readonly { result: EventResult; mode: RewardMode }[]): RewardSummary {
  const heard = batch.filter((entry) => entry.mode !== 'silent')
  const badges: BadgeDef[] = []
  for (const { result } of heard) for (const badge of result.newBadges) if (!badges.some((b) => b.id === badge.id)) badges.push(badge)
  const levels = heard.filter((entry) => entry.result.leveledUp).map((entry) => entry.result.level)
  const level = levels.length > 0 ? Math.max(...levels) : null
  const daily = heard.find((entry) => entry.result.dailyCompleted)?.result.dailyCompleted ?? null
  const big = badges.length > 0 || level !== null || daily !== null
  const xp = heard.filter((entry) => big || entry.mode === 'full').reduce((sum, entry) => sum + entry.result.xpGained, 0)
  return { xp, badges, level, daily }
}

const joinParts = (parts: (string | false | null | undefined)[]): string | undefined => parts.filter(Boolean).join(' · ') || undefined

export interface RewardPlan {
  /** The celebration to show, if the batch earned one. */
  celebration: { tier: 'moment' | 'milestone'; options: MilestoneOptions } | null
  /** Small news that does not need a celebration (the daily on its own, plain XP). */
  toasts: ToastOptions[]
}

/** Badges that are achievements in their own right: earning one is a takeover, on any page. */
export const MILESTONE_BADGES: Readonly<Record<string, { eyebrow: string; title: string; subtitle: string }>> = {
  'first-solve': { eyebrow: 'First full solve', title: 'You solved the cube', subtitle: 'Scrambled to solved. Remember this one.' },
  'full-method': { eyebrow: 'All eight stages', title: 'You know the whole method', subtitle: 'Every stage of the solve is yours now.' },
}

/** "You’re a Twister now" / "You’re an Apprentice now". */
export const youreA = (title: string): string => `You’re ${/^[aeiou]/i.test(title) ? 'an' : 'a'} ${title} now`

/** The first level-up that takes over the screen. Level 2 comes with the first 100 XP. */
export const FIRST_MILESTONE_LEVEL = 3

/**
 * What a summary deserves (pure, for tests): a first solve or all stages learned is a milestone,
 * so is a level-up from level 3; level 2 and new badges are a moment; the daily challenge on its
 * own and plain XP are toasts. `levelTitle` names a level ("Twister"). `cap: 'moment'` turns a
 * milestone into a moment.
 */
export function rewardPlan(summary: RewardSummary, levelTitle: (level: number) => string, cap?: 'moment'): RewardPlan {
  const { xp, badges, level, daily } = summary
  const dailyText = daily ? 'Daily challenge done' : null
  const big = badges.find((badge) => badge.id in MILESTONE_BADGES)

  if (big && cap !== 'moment') {
    const words = MILESTONE_BADGES[big.id]
    return {
      celebration: {
        tier: 'milestone',
        options: { ...words, headline: true, notes: dailyText ? [dailyText] : [], badges: [big, ...badges.filter((b) => b !== big)], level: level ?? undefined, levelTitle: level !== null ? levelTitle(level) : undefined, xp },
      },
      toasts: [],
    }
  }

  if (level !== null && level >= FIRST_MILESTONE_LEVEL && cap !== 'moment') {
    return {
      celebration: {
        tier: 'milestone',
        options: {
          title: `Level ${level}`,
          subtitle: youreA(levelTitle(level)),
          notes: dailyText ? [dailyText] : [],
          level,
          levelTitle: levelTitle(level),
          badges,
          xp,
        },
      },
      toasts: [],
    }
  }

  if (badges.length > 0) {
    const [first] = badges
    const single = badges.length === 1
    return {
      celebration: {
        tier: 'moment',
        options: {
          eyebrow: single ? 'New badge' : `${badges.length} new badges`,
          title: single ? first.name : `${first.name} and more`,
          subtitle: single ? first.description : undefined,
          notes: dailyText ? [dailyText] : [],
          level: level ?? undefined,
          levelTitle: level !== null ? levelTitle(level) : undefined,
          badges,
          xp,
        },
      },
      toasts: [],
    }
  }

  if (level !== null) {
    return {
      celebration: {
        tier: 'moment',
        options: { eyebrow: 'Level up', title: `Level ${level}`, subtitle: youreA(levelTitle(level)), notes: dailyText ? [dailyText] : [], level, levelTitle: levelTitle(level), xp },
      },
      toasts: [],
    }
  }

  const xpText = xp > 0 ? `+${xp} XP` : null
  if (daily) {
    return { celebration: null, toasts: [{ key: 'reward-daily', title: 'Daily challenge done', description: joinParts([daily.title, xpText]), tone: 'green', icon: 'check', duration: 4200 }] }
  }
  if (xpText) return { celebration: null, toasts: [{ key: 'reward-xp', title: xpText, tone: 'yellow', icon: 'bolt', duration: 2200 }] }
  return { celebration: null, toasts: [] }
}

// ───────────────────────── Showing ─────────────────────────

/** Rewards closer together than this are announced as one. */
const COALESCE_MS = 320
let pending: { result: EventResult; mode: RewardMode; cap?: 'moment' }[] = []
let timer: ReturnType<typeof setTimeout> | null = null

function flush(): void {
  timer = null
  const summary = combineRewards(pending)
  // One capped reward in the batch caps the batch: they are one announcement.
  const cap = pending.some((entry) => entry.cap === 'moment') ? 'moment' : undefined
  pending = []
  const plan = rewardPlan(summary, (level) => LEVEL_TITLES[Math.min(Math.max(level, 1), LEVEL_TITLES.length) - 1], cap)
  // The celebration plays its own sound (and merges with a page's own moment or milestone).
  if (plan.celebration) celebration.fromReward(plan.celebration.tier, plan.celebration.options)
  // A page is already celebrating (a pattern made, a stage learned): the daily joins it as a line.
  else if (summary.daily && celebration.busy) celebration.fromReward('moment', { title: 'Daily challenge done', notes: ['Daily challenge done'], xp: summary.xp })
  else if (plan.toasts.length > 0 && summary.daily) sound.play('success')
  if (plan.celebration || !(summary.daily && celebration.busy)) for (const options of plan.toasts) toast(options)
}

/**
 * Celebrate a result at the tier it deserves (see the notes at the top of this file for `mode`).
 * Results arriving together are merged: one celebration or one toast, one sound.
 */
export function celebrate(result: EventResult, options: RewardOptions = {}): void {
  const mode = options.mode ?? 'full'
  if (mode === 'silent') return
  const { xpGained, newBadges, leveledUp, dailyCompleted } = result
  if (xpGained <= 0 && newBadges.length === 0 && !leveledUp && !dailyCompleted) return
  pending.push({ result, mode, cap: options.cap })
  if (timer === null) timer = setTimeout(flush, COALESCE_MS)
}

/** Show whatever is waiting right now (tests; or just before navigating away). */
export function flushRewards(): void {
  if (timer !== null) {
    clearTimeout(timer)
    flush()
  }
}
