# src/store — saved state

Everything the app remembers lives in a zustand store created with `createPersistedStore`
(`persist.ts`). Do not call zustand's `persist` directly.

## Adding a store

```ts
// src/store/timer.ts  (or next to your feature, e.g. src/features/timer/timerStore.ts)
import { createPersistedStore, isRecord } from '../../store' // relative path to src/store

interface TimerState {
  solves: { ms: number; at: string; scramble: string }[]
  addSolve: (solve: TimerState['solves'][number]) => void
}

export const useTimer = createPersistedStore<TimerState>(
  {
    name: 'timer',            // saved as localStorage["rubikku:timer"]; short kebab-case, unique
    version: 1,               // bump when the saved shape changes…
    migrate: (saved, from) => {
      // …and convert older shapes here. Return data fields only. Throwing is safe.
      return saved
    },
    // Optional but recommended: validate what was saved before it is merged over defaults.
    sanitize: (saved) =>
      isRecord(saved) && Array.isArray(saved.solves) ? { solves: saved.solves.filter(isRecord) as never } : {},
    // Optional: choose what to save (default: every non-function field).
    // partialize: (s) => ({ solves: s.solves }),
  },
  (set) => ({
    solves: [],
    addSolve: (solve) => set((s) => ({ solves: [solve, ...s.solves] })),
  }),
)
```

What the helper guarantees:

- **Namespaced key** `rubikku:<name>`; duplicate names throw at start-up.
- **Version + migrate** are required. A `migrate` that throws falls back to defaults.
- **A corrupt save never crashes the app.** Unparseable JSON is moved to
  `rubikku:<name>:corrupt` and the store starts from defaults. Saved values are merged through
  `sanitize` (default: keep only known keys whose type matches the default).
- **Backup, import and reset just work.** `backup.ts` exports/imports every `rubikku:*` key and
  resets every registered store; you do not need to register anything.
- **Two tabs never overwrite each other.** A `storage` listener applies another tab's save to
  this tab's store as soon as it is written (default: the newer save replaces ours). Give
  `mergeRemote(local, remote)` when some fields must never go backwards — the progress store does,
  so XP, badges, lessons and collections are never lost (`mergeProgress`). A reset or import in
  one tab is taken as the truth by the others (`announceReplace` / `adoptStorage`).
- **A failed save is reported, not hidden.** On a quota error the helper frees the quarantined
  `:corrupt` copies and retries; if the write still fails the app keeps running from memory and
  `onSaveFailure(listener)` fires once (the app shell shows one friendly toast). `isSaveFailing()`
  says whether the last save reached storage.
- **Import is all-or-nothing.** `applyBackup` snapshots the old save, writes and reads back every
  store, and on any failure puts the snapshot back and returns `{ ok: false, error }`.

Rules of thumb: keep state serialisable (no Dates, Maps, class instances — use ISO strings and
plain objects), keep it small, and store dates that mean "a day" as local date keys
(`localDateKey()` from `dates.ts`).

## What is here

| File | What |
|---|---|
| `persist.ts` | `createPersistedStore`, safe storage, registry |
| `settings.ts` | `useSettings`: theme, sound, motion, turnSpeed, showFaceLabels |
| `progress.ts` | `useProgress`: XP, badges, streak, lessons, `recordEvent(type, payload)` |
| `progressLogic.ts` | Pure rules behind `recordEvent` (`applyEvent`, `levelFromXp`, streak maths) |
| `badges.ts` | Badge catalogue |
| `stages.ts` | The eight stage ids, titles, goals |
| `daily.ts` | Daily challenge catalogue, the per-day pick for his level, and progress detection from events |
| `hooks.ts` | `useLevel`, `useStreak`, `useLearningPath`, `useWeekActivity`, `useDailyChallenge` |
| `backup.ts` | `createBackup`, `parseBackup`, `applyBackup`, `downloadBackup`, `resetEverything` |

To reward the player from a feature, call `reward('lesson-completed', { stageId })` from
`src/app/rewards.ts`: it calls `recordEvent` and shows the toast / plays the sound. Pass
`{ mode: 'quiet' }` for things that repeat (timer solves, practice reps) and `{ mode: 'silent' }`
when the page celebrates by itself; rewards that land together are merged into one toast.
Pass `{ moment: {…} }` / `{ milestone: {…} }` for the page's own pay-off (the reward folds into
it), and `{ cap: 'moment' }` where a takeover would get in the way (the timer). The tiers: a first
solve and all stages learned are milestones on any page, level-ups from level 3 too; level 2 and
badges are moments (see `rewardPlan` in src/app/rewards.ts).

Lesson events: `lesson-started` (no XP, no badge), `lesson-completed` (`XP.lessonFirst`, 60, plus
the stage badge; practice inside a lesson pays separately) and `primer-completed` (the basics:
`XP.primer` once and the First Steps badge).

## Rules worth knowing (`progressLogic.ts`)

- **The daily challenge needs nothing from features.** `applyEvent` feeds every event to today's
  challenge (`daily.ts`); when its goal is met it adds `XP.daily`, bumps `counters.dailyChallenges`,
  logs `daily-challenge-completed` and sets `result.dailyCompleted` — once per local day. Today's
  pick is saved in `daily` on the first real event of the day, so it cannot change under him.
- **Repeats taper** (`REPEAT_RULES`, `repeatXp`): drills, solves and notation rounds pay full XP
  for a sensible day's practice and then less; an algorithm pays once per day; a repeated lesson
  once per day. Per-day counts live in `tally`.
- **The feed stays readable**: a run of the same event on the same day is one `log` row with a
  `count`, and events worth 0 XP are not logged.
