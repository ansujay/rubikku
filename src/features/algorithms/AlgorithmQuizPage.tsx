import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { getAlgorithm } from '../../cube'
import { MiniCube } from '../../three'
import { Badge, Button, ButtonLink, Card, cx, Icon, MoveSequence, Page, ProgressBar, ProgressRing, Reveal, sound, springs, celebration } from '../../ui'
import { useAlgorithms } from './algorithmsStore'
import { makeFlashCards, type FlashCard } from './logic'

const CARD_COUNT = 6

/** "Which algorithm fixes this?" — a short flash-card quiz over the library. */
/** The deal in progress lives in this tab's session, so a reload carries on where he was (QA P1). */
const SESSION_KEY = 'rubikku-session:flash-cards'
interface QuizSession {
  cards: FlashCard[]
  index: number
  picked: string | null
  score: number
}
function loadSession(): QuizSession | null {
  try {
    const raw = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null') as QuizSession | null
    if (!raw || !Array.isArray(raw.cards) || raw.cards.length !== CARD_COUNT) return null
    if (!raw.cards.every((card) => card && typeof card.answerId === 'string' && getAlgorithm(card.answerId) && typeof card.state === 'string' && Array.isArray(card.options) && Array.isArray(card.accepts))) return null
    const index = Number.isInteger(raw.index) ? Math.min(Math.max(raw.index, 0), CARD_COUNT) : 0
    const score = Number.isInteger(raw.score) ? Math.min(Math.max(raw.score, 0), index + 1) : 0
    return { cards: raw.cards, index, picked: typeof raw.picked === 'string' ? raw.picked : null, score }
  } catch {
    return null
  }
}

/** "Which algorithm fixes this?" — a short flash-card quiz over the library. */
export default function AlgorithmQuizPage() {
  const [restored] = useState(loadSession)
  const [cards, setCards] = useState<FlashCard[]>(() => restored?.cards ?? makeFlashCards(Math.random, CARD_COUNT))
  const [index, setIndex] = useState(restored?.index ?? 0)
  const [picked, setPicked] = useState<string | null>(restored?.picked ?? null)
  const [score, setScore] = useState(restored?.score ?? 0)
  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ cards, index, picked, score }))
    } catch {
      /* no session storage: a reload deals again */
    }
  }, [cards, index, picked, score])
  const best = useAlgorithms((s) => s.quizBest)
  const finished = index >= cards.length
  const card = cards[Math.min(index, cards.length - 1)]
  const answer = getAlgorithm(card.answerId)!

  const pick = (id: string) => {
    if (picked) return
    setPicked(id)
    // Any algorithm that fixes the case is right (see `fixesCase`), not just the one we dealt.
    const right = card.accepts.includes(id)
    if (right) celebration.tick(document.querySelector(`[data-answer="${CSS.escape(id)}"]`))
    else sound.play('error')
    if (right) setScore((n) => n + 1)
  }

  const next = () => {
    if (index + 1 >= cards.length) useAlgorithms.getState().setQuizBest(score)
    setPicked(null)
    setIndex((n) => n + 1)
  }

  const again = () => {
    setCards(makeFlashCards(Math.random, CARD_COUNT))
    setIndex(0)
    setPicked(null)
    setScore(0)
  }

  return (
    <Page width="narrow">
      <Reveal as="header" className="mb-5 flex items-center gap-3">
        <Link to="/algorithms" aria-label="All algorithms" className="key key-secondary grid size-10 shrink-0 place-items-center rounded-sm">
          <Icon name="arrowLeft" size={18} weight={2.4} />
        </Link>
        <div className="min-w-0 grow">
          <h1 className="text-2xl text-ink">Flash cards</h1>
          <p className="text-sm font-semibold text-ink-muted">Which algorithm fixes this cube?</p>
        </div>
        {!finished && (
          <div className="w-28 shrink-0">
            <p className="num mb-1 text-right text-sm font-bold text-ink-muted" data-testid="quiz-progress">
              {index + 1} / {cards.length}
            </p>
            <ProgressBar label="Cards done" value={index + (picked ? 1 : 0)} max={cards.length} size="sm" />
          </div>
        )}
      </Reveal>

      <AnimatePresence mode="wait" initial={false}>
        {finished ? (
          <motion.div key="end" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={springs.gentle}>
            <Card padding="lg" className="flex flex-col items-center gap-4 text-center" data-testid="quiz-summary">
              <ProgressRing label="Score" value={score} max={cards.length} size={104} thickness={10} tone={score >= cards.length - 1 ? 'green' : 'yellow'}>
                <span className="num font-display text-3xl font-extrabold text-ink">
                  {score}
                  <span className="text-lg text-ink-faint">/{cards.length}</span>
                </span>
              </ProgressRing>
              <div>
                <h2 className="text-2xl text-ink">{score === cards.length ? 'You know them all!' : score >= cards.length / 2 ? 'Nice spotting' : 'Worth another look'}</h2>
                <p className="mt-1 text-base text-ink-muted">{score === cards.length ? 'Every case matched to its algorithm.' : 'Open a card you missed and watch it once more.'}</p>
              </div>
              <Badge tone="yellow" icon="star">
                Best {Math.max(best, score)} of {cards.length}
              </Badge>
              <div className="flex flex-wrap justify-center gap-2.5">
                <Button iconLeft="restart" onClick={again} data-testid="quiz-again">
                  New cards
                </Button>
                <ButtonLink to="/algorithms" variant="secondary">
                  Back to algorithms
                </ButtonLink>
              </div>
            </Card>
          </motion.div>
        ) : (
          <motion.div key={`${cards[0]?.answerId}-${cards[0]?.state}-${index}`} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={springs.gentle} className="flex flex-col gap-4">
            <div className="stage mx-auto grid aspect-[5/4] w-full max-w-md place-items-center" data-testid="quiz-card" data-answer={card.answerId}>
              <div className="w-[58%]">
                {/* Once answered, the right algorithm plays out on the case. */}
                <MiniCube key={picked ? 'play' : 'still'} state={card.state} alg={picked ? answer.moves : undefined} play={picked ? 'visible' : false} loop={false} speed={0.7} label="The case to fix" />
              </div>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2" role="group" aria-label="Algorithms to choose from">
              {card.options.map((id) => {
                const option = getAlgorithm(id)!
                const isAnswer = card.accepts.includes(id)
                const isPicked = picked === id
                return (
                  <button
                    key={id}
                    type="button"
                    data-answer={id}
                    onClick={() => pick(id)}
                    data-option={id}
                    aria-disabled={picked !== null}
                    className={cx(
                      'flex flex-col items-start gap-2 rounded-md border-[1.5px] p-3.5 text-left transition-[background-color,border-color,scale,opacity] duration-150 ease-out',
                      !picked && 'border-line-strong bg-surface hover:bg-surface-2 active:scale-[0.98]',
                      picked && isAnswer && 'border-cube-green bg-cube-green-soft',
                      picked && isPicked && !isAnswer && 'border-cube-red bg-cube-red-soft',
                      picked && !isAnswer && !isPicked && 'border-line bg-surface opacity-50',
                    )}
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="font-display text-lg leading-6 font-bold text-ink">{option.name}</span>
                      {picked && isAnswer && <Icon name="check" size={18} weight={3} className="text-cube-green-text" />}
                      {picked && isPicked && !isAnswer && <Icon name="x" size={18} weight={3} className="text-cube-red-text" />}
                    </span>
                    <MoveSequence moves={option.alg} size="sm" label={`${option.name} moves`} />
                  </button>
                )
              })}
            </div>
            <div className="flex min-h-12 items-center justify-between gap-3">
              <p className="text-base text-ink-muted" aria-live="polite">
                {picked ? (card.accepts.includes(picked) ? 'Yes. Watch it fix the cube.' : `It was the ${answer.name}. Watch it fix the cube.`) : answer.when.length > 0 ? 'Look at what is out of place.' : ''}
              </p>
              {picked && (
                <Button iconRight="arrowRight" onClick={next} autoFocus data-testid="quiz-next">
                  {index + 1 >= cards.length ? 'See score' : 'Next'}
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Page>
  )
}
