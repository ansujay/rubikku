/**
 * Where he is in every lesson: the beat, how far he has been, the cube exactly as he left it,
 * drill streaks, and the capstone solve. Saved as `rubikku:learn`.
 *
 * Whether a *stage* is complete lives in the shared progress store (`reward('lesson-completed')`);
 * this store adds the primer, the capstone and everything inside a lesson.
 */
import { isStateString, type StageId } from '../../cube'
import { createPersistedStore, isRecord } from '../../store'
// From the file, not the folder: the folder's index would pull the whole 3D cube into anything
// that only wants to know where he is on the path (the Home page).
import { sanitizeSession, type CubeSession } from '../../three/controller'
import { HARD_CASES } from './drillCases'

/** Clean drills needed to master a stage. */
export const MASTERY_TARGET = 3

export interface DrillSave {
  /** Which practice cube he is on (`drillState(stage, n)`). */
  n: number
  /** A hint was used on the current cube. */
  hinted: boolean
  /** The current cube has been solved (waiting for "next cube"). */
  solved: boolean
  /** Drills solved, with or without hints. */
  total: number
  /** Drills solved without a hint. */
  clean: number
  /** Drills solved with at least half of the turns his own ("Show me" did not do it for him). */
  own: number
  /** Turns "Show me" made on the current cube. */
  shown: number
  /** Clean drills in a row right now, and the best run. */
  streak: number
  best: number
  /** The stage's hard cases (`DRILL_HARD` ids) he has solved cleanly. */
  hard: string[]
}

export interface LessonSave {
  /** The beat he is on. */
  beatId: string | null
  /** Index of the furthest beat reached. */
  furthest: number
  /** Guided exercises finished, by beat id. */
  done: Record<string, true>
  /** The cube of the current beat, and which beat (and drill cube) it belongs to. */
  session: CubeSession | null
  sessionKey: string | null
  /**
   * The cube that beat started from. (Not `session.start`: a long history is trimmed from the
   * front, which moves `session.start` along with it.)
   */
  sessionStart: string | null
  drill: DrillSave
  /** The wrap-up has been reached. */
  completed: boolean
  /** Recognition rounds, by beat id: questions seen and answered right. */
  quiz: Record<string, QuizSave>
  /** "Five in a row" exercises: rounds finished, by beat id. */
  reps: Record<string, number>
  /** "Now on your cube": when he said his own cube looked like the picture, by beat id. */
  real: Record<string, string>
}

export interface QuizSave {
  /** The question he is on (`quizQuestion(kind, n)`). */
  n: number
  right: number
  wrong: number
  /** His answer to question `n`, once given (so a reload keeps the feedback). */
  answer: string | null
}

export interface CapstoneSave {
  /** Which scramble he is on (`capstoneState(n)`). */
  n: number
  session: CubeSession | null
  /** The scramble `session` belongs to (see `LessonSave.sessionStart`). */
  sessionStart: string | null
  /** Hints asked for on this scramble. */
  hints: number
  /** Turns the coach made for him on this scramble ("Show me"). */
  shown: number
  /** The current scramble has been solved. */
  solved: boolean
  /** Full solves finished here. */
  solves: number
  /** Times he said he solved his own, real cube from scrambled. */
  realSolves: number
}

export interface LearnState {
  lessons: Record<string, LessonSave>
  capstone: CapstoneSave
  /** The lesson he opened most recently. */
  last: string | null

  open: (lessonId: string) => void
  setBeat: (lessonId: string, beatId: string, index: number) => void
  saveSession: (lessonId: string, key: string, session: CubeSession, start: string) => void
  markDone: (lessonId: string, beatId: string) => void
  complete: (lessonId: string) => void
  restart: (lessonId: string) => void
  drillHint: (lessonId: string) => void
  /** `tags`: the hard cases the solved cube contained (see `drillTags`). */
  drillSolved: (lessonId: string, moves: number, tags?: readonly string[]) => void
  drillShown: (lessonId: string, turns: number) => void
  drillNext: (lessonId: string) => void
  quizAnswer: (lessonId: string, beatId: string, answer: string, right: boolean) => void
  quizNext: (lessonId: string, beatId: string) => void
  repDone: (lessonId: string, beatId: string) => void
  repReset: (lessonId: string, beatId: string) => void
  realDone: (lessonId: string, beatId: string) => void
  updateCapstone: (patch: Partial<CapstoneSave>) => void
}

export const emptyDrill = (): DrillSave => ({ n: 0, hinted: false, solved: false, total: 0, clean: 0, own: 0, shown: 0, streak: 0, best: 0, hard: [] })
export const emptyLesson = (): LessonSave => ({
  beatId: null,
  furthest: 0,
  done: {},
  session: null,
  sessionKey: null,
  sessionStart: null,
  drill: emptyDrill(),
  completed: false,
  quiz: {},
  reps: {},
  real: {},
})
export const emptyQuiz = (): QuizSave => ({ n: 0, right: 0, wrong: 0, answer: null })
export const emptyCapstone = (): CapstoneSave => ({ n: 0, session: null, sessionStart: null, hints: 0, shown: 0, solved: false, solves: 0, realSolves: 0 })

const count = (value: unknown, max = 100_000): number => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.min(max, Math.floor(value)) : 0)

function sanitizeDrill(saved: unknown): DrillSave {
  if (!isRecord(saved)) return emptyDrill()
  const total = count(saved.total)
  const clean = Math.min(total, count(saved.clean))
  const best = Math.min(clean, count(saved.best))
  return {
    n: count(saved.n),
    hinted: saved.hinted === true,
    solved: saved.solved === true,
    total,
    clean,
    // Saves from before this was counted: every solved drill was his own.
    own: Math.min(total, typeof saved.own === 'number' ? count(saved.own) : total),
    shown: count(saved.shown),
    streak: Math.min(best, count(saved.streak)),
    best,
    // A save from before the hard cases were counted: a stage he had already mastered stays mastered.
    hard: Array.isArray(saved.hard)
      ? saved.hard.filter((tag): tag is string => typeof tag === 'string').slice(0, 10)
      : clean >= MASTERY_TARGET
        ? ['*']
        : [],
  }
}

function sanitizeQuiz(saved: unknown): QuizSave {
  if (!isRecord(saved)) return emptyQuiz()
  return { n: count(saved.n), right: count(saved.right), wrong: count(saved.wrong), answer: typeof saved.answer === 'string' ? saved.answer.slice(0, 40) : null }
}

function sanitizeMap<T>(saved: unknown, each: (value: unknown) => T | null): Record<string, T> {
  const out: Record<string, T> = {}
  if (!isRecord(saved)) return out
  for (const [id, value] of Object.entries(saved).slice(0, 60)) {
    const clean = each(value)
    if (clean !== null) out[id] = clean
  }
  return out
}

function sanitizeLesson(saved: unknown): LessonSave {
  if (!isRecord(saved)) return emptyLesson()
  const done: Record<string, true> = {}
  if (isRecord(saved.done)) for (const [id, value] of Object.entries(saved.done).slice(0, 200)) if (value === true) done[id] = true
  const session = sanitizeSession(saved.session)
  return {
    beatId: typeof saved.beatId === 'string' ? saved.beatId : null,
    furthest: count(saved.furthest, 500),
    done,
    session,
    sessionKey: session && typeof saved.sessionKey === 'string' ? saved.sessionKey : null,
    // Saves from before this field existed: the session's own start (right unless it was trimmed).
    sessionStart: session ? (isStateString(saved.sessionStart) ? saved.sessionStart : session.start) : null,
    drill: sanitizeDrill(saved.drill),
    completed: saved.completed === true,
    quiz: sanitizeMap(saved.quiz, sanitizeQuiz),
    reps: sanitizeMap(saved.reps, (value) => (typeof value === 'number' ? count(value, 50) : null)),
    real: sanitizeMap(saved.real, (value) => (typeof value === 'string' ? value.slice(0, 40) : null)),
  }
}

export function sanitizeLearn(saved: unknown): Pick<LearnState, 'lessons' | 'capstone' | 'last'> {
  const out = { lessons: {} as Record<string, LessonSave>, capstone: emptyCapstone(), last: null as string | null }
  if (!isRecord(saved)) return out
  if (isRecord(saved.lessons)) {
    for (const [id, value] of Object.entries(saved.lessons).slice(0, 40)) out.lessons[id] = sanitizeLesson(value)
  }
  if (isRecord(saved.capstone)) {
    const c = saved.capstone
    const session = sanitizeSession(c.session)
    out.capstone = {
      n: count(c.n),
      session,
      sessionStart: session ? (isStateString(c.sessionStart) ? c.sessionStart : session.start) : null,
      hints: count(c.hints),
      shown: count(c.shown),
      solved: c.solved === true,
      solves: count(c.solves),
      realSolves: count(c.realSolves),
    }
  }
  if (typeof saved.last === 'string') out.last = saved.last
  return out
}

export const useLearn = createPersistedStore<LearnState>(
  {
    name: 'learn',
    version: 1,
    migrate: (saved) => saved,
    sanitize: (saved) => sanitizeLearn(saved),
  },
  (set) => {
    const update = (lessonId: string, change: (lesson: LessonSave) => Partial<LessonSave>) =>
      set((s) => {
        const lesson = s.lessons[lessonId] ?? emptyLesson()
        return { lessons: { ...s.lessons, [lessonId]: { ...lesson, ...change(lesson) } } }
      })
    return {
      lessons: {},
      capstone: emptyCapstone(),
      last: null,

      open: (lessonId) => set((s) => ({ last: lessonId, lessons: s.lessons[lessonId] ? s.lessons : { ...s.lessons, [lessonId]: emptyLesson() } })),
      setBeat: (lessonId, beatId, index) => update(lessonId, (l) => ({ beatId, furthest: Math.max(l.furthest, index) })),
      saveSession: (lessonId, key, session, start) => update(lessonId, () => ({ session, sessionKey: key, sessionStart: start })),
      markDone: (lessonId, beatId) => update(lessonId, (l) => (l.done[beatId] ? {} : { done: { ...l.done, [beatId]: true } })),
      complete: (lessonId) => update(lessonId, () => ({ completed: true })),
      restart: (lessonId) => update(lessonId, () => ({ beatId: null, session: null, sessionKey: null, sessionStart: null })),
      drillHint: (lessonId) => update(lessonId, (l) => (l.drill.hinted || l.drill.solved ? {} : { drill: { ...l.drill, hinted: true } })),
      drillSolved: (lessonId, moves, tags = []) =>
        update(lessonId, (l) => {
          const d = l.drill
          if (d.solved) return {}
          const clean = !d.hinted
          // Hints are fine; letting "Show me" make most of the turns is watching, not solving.
          const own = d.shown * 2 <= moves
          const streak = clean ? d.streak + 1 : 0
          const hard = clean ? [...new Set([...d.hard, ...tags])] : d.hard
          return { drill: { ...d, solved: true, total: d.total + 1, clean: d.clean + (clean ? 1 : 0), own: d.own + (own ? 1 : 0), streak, best: Math.max(d.best, streak), hard } }
        }),
      drillShown: (lessonId, turns) => update(lessonId, (l) => (l.drill.solved ? {} : { drill: { ...l.drill, hinted: true, shown: l.drill.shown + turns } })),
      drillNext: (lessonId) =>
        update(lessonId, (l) => ({ drill: { ...l.drill, n: l.drill.n + 1, hinted: false, solved: false, shown: 0, streak: l.drill.solved ? l.drill.streak : 0 } })),
      quizAnswer: (lessonId, beatId, answer, right) =>
        update(lessonId, (l) => {
          const q = l.quiz[beatId] ?? emptyQuiz()
          if (q.answer !== null) return {}
          return { quiz: { ...l.quiz, [beatId]: { ...q, answer, right: q.right + (right ? 1 : 0), wrong: q.wrong + (right ? 0 : 1) } } }
        }),
      quizNext: (lessonId, beatId) =>
        update(lessonId, (l) => {
          const q = l.quiz[beatId] ?? emptyQuiz()
          return { quiz: { ...l.quiz, [beatId]: { ...q, n: q.n + 1, answer: null } } }
        }),
      repDone: (lessonId, beatId) => update(lessonId, (l) => ({ reps: { ...l.reps, [beatId]: (l.reps[beatId] ?? 0) + 1 } })),
      repReset: (lessonId, beatId) => update(lessonId, (l) => ({ reps: { ...l.reps, [beatId]: 0 } })),
      realDone: (lessonId, beatId) => update(lessonId, (l) => (l.real[beatId] ? {} : { real: { ...l.real, [beatId]: new Date().toISOString() } })),
      updateCapstone: (patch) => set((s) => ({ capstone: { ...s.capstone, ...patch } })),
    }
  },
)

/** The hard cases of a stage he has not yet solved cleanly in practice. */
export function hardToGo(lesson: LessonSave | undefined, stage: StageId | null): { id: string; label: string }[] {
  if (!stage) return []
  const done = lesson?.drill.hard ?? []
  if (done.includes('*')) return []
  return HARD_CASES[stage].filter((hard) => !done.includes(hard.id))
}

/** Mastered: enough clean drills, and each of the stage's hard cases among them. */
export const isMastered = (lesson: LessonSave | undefined, stage: StageId | null): boolean => (lesson?.drill.clean ?? 0) >= MASTERY_TARGET && hardToGo(lesson, stage).length === 0
