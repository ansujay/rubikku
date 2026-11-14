import { isMove, type Move } from '../../cube'
import { createPersistedStore, isRecord } from '../../store'
import { LEVELS, levelsFor, passesLevel, type GameMode } from './logic/levels'
import { blamedIndex, recordAnswer, scoreRound, type AnswerRecord, type MoveStats } from './logic/mastery'

export const SPEED_ROUND_MS = 60_000

export interface Round {
  mode: GameMode
  /** Id of the level (do / name); the speed round keeps 'speed'. */
  levelId: string
  /** The questions; the speed round appends as it goes. */
  questions: Move[][]
  /** Answer choices per question ("name the move" only). */
  options: Move[][]
  answers: AnswerRecord[]
  /** `question` waiting for an answer · `feedback` showing a mistake · `summary` finished. */
  phase: 'question' | 'feedback' | 'summary'
  /** What he did on the question being explained (feedback phase). */
  mistake: { made: Move[]; chosen: Move | null; line: string } | null
  /** Speed round: time left. */
  remainingMs: number
  /** Speed round: wrong turns so far (the question stays until he gets it). */
  misses: number
  /** What finishing the round earned, filled in once. */
  outcome: { xp: number; unlockedLevelId: string | null; newBest: boolean; previousBest: number } | null
}

export interface NotationState {
  stats: MoveStats
  /** Index of the highest open level in each game (see `levelsFor`). */
  unlocked: { do: number; name: number }
  /** Level last chosen in each game. */
  chosen: { do: number; name: number }
  /** Best accuracy (0–100) per `${mode}:${levelId}`. */
  best: Record<string, number>
  /** Most correct moves in one speed round. */
  speedBest: number
  round: Round | null
  /** The game picked on the hub. */
  hubMode: GameMode

  startRound: (round: Pick<Round, 'mode' | 'levelId' | 'questions' | 'options'>) => void
  /** Record an answer to the current question. A wrong answer in do / name opens the feedback. */
  answer: (record: AnswerRecord, mistake?: Round['mistake']) => void
  /** Speed round: a wrong turn (the question stays). */
  miss: (asked: Move) => void
  /** Move on after feedback, or straight after a right answer. */
  next: () => void
  appendQuestion: (question: Move[]) => void
  setRemaining: (ms: number) => void
  /** End the round now (the speed round's clock ran out). */
  finish: () => void
  /** Fold the finished round into bests and unlocks (once), remembering the XP it earned. */
  settle: (xp: number) => void
  quitRound: () => void
  chooseLevel: (mode: 'do' | 'name', index: number) => void
  setHubMode: (mode: GameMode) => void
}

const moves = (value: unknown): Move[] => (Array.isArray(value) ? value.filter((m): m is Move => typeof m === 'string' && isMove(m)) : [])
const int = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback

function sanitizeStats(saved: unknown): MoveStats {
  const out: MoveStats = {}
  if (!isRecord(saved)) return out
  for (const [move, stat] of Object.entries(saved)) {
    if (!isMove(move) || !isRecord(stat)) continue
    const seen = int(stat.seen, 0, 1e6, 0)
    out[move] = { seen, correct: int(stat.correct, 0, seen, 0), recent: typeof stat.recent === 'number' && stat.recent >= 0 && stat.recent <= 1 ? stat.recent : 0 }
  }
  return out
}

function sanitizeRound(saved: unknown): Round | null {
  if (!isRecord(saved)) return null
  const mode = saved.mode
  if (mode !== 'do' && mode !== 'name' && mode !== 'speed') return null
  const levelId = typeof saved.levelId === 'string' ? saved.levelId : ''
  if (mode !== 'speed' && !LEVELS.some((level) => level.id === levelId)) return null
  const questions = Array.isArray(saved.questions) ? saved.questions.map(moves).filter((q) => q.length > 0) : []
  if (questions.length === 0) return null
  const options = Array.isArray(saved.options) ? saved.options.map(moves) : []
  if (mode === 'name' && (options.length !== questions.length || options.some((o, i) => !o.includes(questions[i][0])))) return null
  const answers: AnswerRecord[] = (Array.isArray(saved.answers) ? saved.answers : [])
    .filter(isRecord)
    .map((a): AnswerRecord => ({
      moves: moves(a.moves),
      result: a.result === 'correct' || a.result === 'hinted' ? a.result : 'wrong',
      missed: typeof a.missed === 'string' && isMove(a.missed) ? a.missed : undefined,
      missedIndex: typeof a.missedIndex === 'number' && a.missedIndex >= 0 && a.missedIndex < 100 ? Math.floor(a.missedIndex) : undefined,
    }))
    .filter((a) => a.moves.length > 0)
    .slice(0, mode === 'speed' ? 500 : questions.length)
  const phase = saved.phase === 'summary' ? 'summary' : saved.phase === 'feedback' && isRecord(saved.mistake) ? 'feedback' : 'question'
  if (phase !== 'summary' && answers.length >= questions.length + (phase === 'feedback' ? 1 : 0)) return null
  const mistake = phase === 'feedback' && isRecord(saved.mistake)
    ? { made: moves(saved.mistake.made), chosen: typeof saved.mistake.chosen === 'string' && isMove(saved.mistake.chosen) ? saved.mistake.chosen : null, line: typeof saved.mistake.line === 'string' ? saved.mistake.line.slice(0, 300) : '' }
    : null
  const outcome = isRecord(saved.outcome)
    ? {
        xp: int(saved.outcome.xp, 0, 1e5, 0),
        unlockedLevelId: typeof saved.outcome.unlockedLevelId === 'string' ? saved.outcome.unlockedLevelId : null,
        newBest: saved.outcome.newBest === true,
        previousBest: int(saved.outcome.previousBest, 0, 1e5, 0),
      }
    : null
  return {
    mode,
    levelId: mode === 'speed' ? 'speed' : levelId,
    questions,
    options: mode === 'name' ? options : [],
    answers,
    phase,
    mistake,
    remainingMs: int(saved.remainingMs, 0, SPEED_ROUND_MS, SPEED_ROUND_MS),
    misses: int(saved.misses, 0, 1e4, 0),
    outcome,
  }
}

const pair = (saved: unknown, max: { do: number; name: number }) => {
  const r = isRecord(saved) ? saved : {}
  return { do: int(r.do, 0, max.do, 0), name: int(r.name, 0, max.name, 0) }
}

const LEVEL_MAX = { do: levelsFor('do').length - 1, name: levelsFor('name').length - 1 }

/** Fold a finished round into bests and unlocks. Pure; exported for tests. */
export function settleRound(state: Pick<NotationState, 'unlocked' | 'best' | 'speedBest'>, round: Round): Pick<NotationState, 'unlocked' | 'best' | 'speedBest'> & { unlockedLevelId: string | null; newBest: boolean; previousBest: number } {
  const score = scoreRound(round.answers)
  if (round.mode === 'speed') {
    const newBest = score.correct > state.speedBest
    return { ...state, speedBest: Math.max(state.speedBest, score.correct), unlockedLevelId: null, newBest: newBest && score.correct > 0, previousBest: state.speedBest }
  }
  const levels = levelsFor(round.mode)
  const index = levels.findIndex((level) => level.id === round.levelId)
  const key = `${round.mode}:${round.levelId}`
  const previousBest = state.best[key] ?? 0
  const best = { ...state.best, [key]: Math.max(previousBest, score.accuracy) }
  let unlocked = state.unlocked
  let unlockedLevelId: string | null = null
  if (index >= 0 && index === state.unlocked[round.mode] && index < levels.length - 1 && passesLevel(score.correct, score.total)) {
    unlocked = { ...state.unlocked, [round.mode]: index + 1 }
    unlockedLevelId = levels[index + 1].id
  }
  return { unlocked, best, speedBest: state.speedBest, unlockedLevelId, newBest: score.accuracy > previousBest && previousBest > 0, previousBest }
}

export const useNotation = createPersistedStore<NotationState>(
  {
    name: 'notation',
    version: 1,
    migrate: (saved) => saved,
    sanitize: (saved) => {
      if (!isRecord(saved)) return {}
      const out: Partial<NotationState> = { stats: sanitizeStats(saved.stats), round: sanitizeRound(saved.round) }
      out.unlocked = pair(saved.unlocked, LEVEL_MAX)
      const chosen = pair(saved.chosen, LEVEL_MAX)
      out.chosen = { do: Math.min(chosen.do, out.unlocked.do), name: Math.min(chosen.name, out.unlocked.name) }
      if (isRecord(saved.best)) out.best = Object.fromEntries(Object.entries(saved.best).filter(([, v]) => typeof v === 'number' && v >= 0 && v <= 100)) as Record<string, number>
      out.speedBest = int(saved.speedBest, 0, 1e4, 0)
      if (saved.hubMode === 'do' || saved.hubMode === 'name' || saved.hubMode === 'speed') out.hubMode = saved.hubMode
      return out
    },
  },
  (set, get) => ({
    stats: {},
    unlocked: { do: 0, name: 0 },
    chosen: { do: 0, name: 0 },
    best: {},
    speedBest: 0,
    round: null,
    hubMode: 'do',

    startRound: (round) =>
      set({ round: { ...round, answers: [], phase: 'question', mistake: null, remainingMs: SPEED_ROUND_MS, misses: 0, outcome: null } }),

    answer: (record, mistake) => {
      const { round, stats } = get()
      if (!round || round.phase !== 'question') return
      let nextStats = stats
      // Every move of a sequence up to the one that went wrong counts as seen (and right);
      // the one that went wrong — by position, not by letter — takes the miss.
      const blamed = blamedIndex(record)
      record.moves.forEach((move, i) => {
        if (blamed < 0 || i < blamed) nextStats = recordAnswer(nextStats, move, true)
        else if (i === blamed) nextStats = recordAnswer(nextStats, move, false)
      })
      const answers = [...round.answers, record]
      const wrong = record.result === 'wrong' && round.mode !== 'speed'
      set({ stats: nextStats, round: { ...round, answers, phase: wrong ? 'feedback' : 'question', mistake: wrong ? (mistake ?? null) : null } })
      if (!wrong) get().next()
    },

    miss: (asked) => {
      const { round, stats } = get()
      if (!round || round.mode !== 'speed' || round.phase !== 'question') return
      set({ stats: recordAnswer(stats, asked, false), round: { ...round, misses: round.misses + 1 } })
    },

    next: () => {
      const { round } = get()
      if (!round || round.phase === 'summary') return
      const done = round.mode !== 'speed' && round.answers.length >= round.questions.length
      set({ round: { ...round, phase: done ? 'summary' : 'question', mistake: null } })
    },

    appendQuestion: (question) => {
      const { round } = get()
      if (round && round.phase !== 'summary') set({ round: { ...round, questions: [...round.questions, question] } })
    },

    setRemaining: (ms) => {
      const { round } = get()
      if (round && round.mode === 'speed' && round.phase !== 'summary') set({ round: { ...round, remainingMs: Math.max(0, Math.round(ms)) } })
    },

    finish: () => {
      const { round } = get()
      if (round && round.phase !== 'summary') set({ round: { ...round, phase: 'summary', mistake: null, remainingMs: round.mode === 'speed' ? 0 : round.remainingMs } })
    },

    settle: (xp) => {
      const state = get()
      const { round } = state
      if (!round || round.phase !== 'summary' || round.outcome) return
      const { unlocked, best, speedBest, ...rest } = settleRound(state, round)
      set({ unlocked, best, speedBest, round: { ...round, outcome: { xp, ...rest } } })
    },

    quitRound: () => set({ round: null }),
    chooseLevel: (mode, index) => {
      const { unlocked, chosen } = get()
      set({ chosen: { ...chosen, [mode]: Math.min(Math.max(0, index), unlocked[mode]) } })
    },
    setHubMode: (hubMode) => set({ hubMode }),
  }),
)
