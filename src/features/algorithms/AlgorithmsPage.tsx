import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'motion/react'
import { ALGORITHMS, analyzeCube, applyAlg, type BeginnerAlgorithm, type PieceId } from '../../cube'
import { STAGES, useProgress, type StageInfo } from '../../store'
import { MiniCube } from '../../three'
import { Badge, ButtonLink, Chip, cx, EmptyState, Icon, MoveSequence, Page, PageHeader, ProgressBar, Reveal, StageMarker, staggerContainer, staggerItem, Sticker } from '../../ui'
import { useAlgorithms } from './algorithmsStore'
import { algView, matchesSearch, STATUS_LABEL, statusOf, type AlgStatus } from './logic'

const STATUS_TONE: Record<AlgStatus, 'neutral' | 'accent' | 'green'> = { learning: 'neutral', practised: 'accent', mastered: 'green' }

export function StatusBadge({ status, size = 'sm', quietWhenNew = false }: { status: AlgStatus; size?: 'sm' | 'md'; quietWhenNew?: boolean }) {
  // On the list, a card he has not practised yet carries no pill at all (it is the default).
  if (quietWhenNew && status === 'learning')
    return (
      <span className="sr-only" data-status={status}>
        Not practised yet
      </span>
    )
  return (
    <Badge tone={STATUS_TONE[status]} size={size} icon={status === 'mastered' ? 'star' : status === 'practised' ? 'check' : undefined} data-status={status}>
      {STATUS_LABEL[status]}
    </Badge>
  )
}

/** A string kept in this tab's session storage (falls back to plain state). */
function useSessionState(key: string, initial: string): [string, (value: string) => void] {
  const [value, setValue] = useState(() => {
    try {
      return sessionStorage.getItem(key) ?? initial
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      sessionStorage.setItem(key, value)
    } catch {
      /* not kept */
    }
  }, [key, value])
  return [value, setValue]
}

const CENTRES: readonly PieceId[] = ['U', 'D', 'F', 'B', 'R', 'L']

function AlgorithmCard({ algorithm }: { algorithm: BeginnerAlgorithm }) {
  const stat = useAlgorithms((s) => s.stats[algorithm.id])
  const view = useMemo(() => algView(algorithm), [algorithm])
  // The case, not a colourful cube: light only the pieces this algorithm is for (the ones its
  // stage still needs, as the case is set up) and grey out the rest (design review S9). They
  // stay lit as the demo moves them home. Fallback: the stickers it moves.
  const highlight = useMemo(() => {
    try {
      const remaining = analyzeCube(view.demoStart).stages[algorithm.stage].remainingPieces
      if (remaining.length > 0 && remaining.length < 4) return { pieces: [...remaining, ...CENTRES], outline: false, dimTo: 'grey' as const }
      const end = applyAlg(view.demoStart, view.demo)
      const out: number[] = []
      for (let i = 0; i < 54; i++) if (end[i] !== view.demoStart[i]) out.push(i)
      return out.length > 0 && out.length < 40 ? { facelets: out, outline: false } : null
    } catch {
      return null
    }
  }, [view, algorithm.stage])
  const status = statusOf(stat)
  return (
    <motion.li variants={staggerItem} className="min-w-0">
      <Link
        to={`/algorithms/${algorithm.id}`}
        data-testid={`alg-card-${algorithm.id}`}
        className={cx(
          'group flex h-full gap-3.5 rounded-lg border border-line bg-surface p-3 shadow-1',
          'transition-[translate,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-line-strong hover:shadow-2 active:translate-y-0 active:scale-[0.99]',
        )}
      >
        <div className="stage grid size-24 shrink-0 place-items-center rounded-md! p-1.5">
          <MiniCube state={view.demoStart} alg={view.demo} play="visible" speed={0.8} highlight={highlight} label={`${algorithm.name}, playing`} className="transition-[scale] duration-300 ease-out group-hover:scale-105" />
        </div>
        <div className="flex min-w-0 grow flex-col">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-lg leading-6 text-ink">{algorithm.name}</h3>
            <StatusBadge status={status} quietWhenNew />
          </div>
          <MoveSequence moves={algorithm.alg} size="sm" className="mt-2" label={`${algorithm.name} moves`} />
          <p className="mt-2 text-sm text-ink-muted">{algorithm.when}</p>
        </div>
      </Link>
    </motion.li>
  )
}

function StageHeading({ stage }: { stage: StageInfo }) {
  // The same stage marker as everywhere else: green and pressed in once the stage is learned.
  const state = useProgress((s) => (s.lessons[stage.id]?.completedAt ? 'done' : STAGES.find((x) => !s.lessons[x.id]?.completedAt)?.id === stage.id ? 'current' : 'todo'))
  return (
    <div className="mb-3 flex items-center gap-3">
      <StageMarker state={state} number={stage.number} size="sm" />
      <div className="min-w-0 grow">
        <h2 className="text-xl leading-6 text-ink">{stage.title}</h2>
        <p className="truncate text-sm text-ink-muted">{stage.goal}</p>
      </div>
      <Link to={`/learn/${stage.id}`} className="flex min-h-11 shrink-0 items-center gap-1 rounded-sm px-3 text-sm font-bold text-accent-text hover:bg-accent-soft">
        Lesson
        <Icon name="chevronRight" size={15} weight={2.6} />
      </Link>
    </div>
  )
}

/** A stage solved by moving pieces freely, with no algorithm to learn (so the numbering does not skip it). */
function NoAlgorithmStage({ stage }: { stage: StageInfo }) {
  return (
    <Reveal as="section" className="mt-7 first:mt-0">
      <StageHeading stage={stage} />
      <div data-testid={`no-alg-stage-${stage.id}`} className="rounded-lg border border-dashed border-line-strong bg-surface p-4 text-sm text-ink-muted">
        <span className="font-bold text-ink">No algorithm needed.</span> You bring the white edges up around the yellow centre one at a time, with a turn or two each. The lesson shows you how.
      </div>
    </Reveal>
  )
}

function StageGroup({ stage, algorithms }: { stage: StageInfo; algorithms: BeginnerAlgorithm[] }) {
  return (
    <Reveal as="section" className="mt-7 first:mt-0">
      <StageHeading stage={stage} />
      <motion.ul variants={staggerContainer(0.04, 0)} className="grid gap-3.5 lg:grid-cols-2">
        {algorithms.map((algorithm) => (
          <AlgorithmCard key={algorithm.id} algorithm={algorithm} />
        ))}
      </motion.ul>
    </Reveal>
  )
}

export default function AlgorithmsPage() {
  // The search and the stage filter survive a reload of this tab (QA P3).
  const [query, setQuery] = useSessionState('rubikku-session:alg-search', '')
  const [stageFilter, setStageFilter] = useSessionState('rubikku-session:alg-stage', 'all')
  const stats = useAlgorithms((s) => s.stats)
  const practisedIds = useProgress((s) => s.algorithms)

  const stages = useMemo(() => STAGES.filter((stage) => ALGORITHMS.some((a) => a.stage === stage.id)), [])
  // Stages before the first one with an algorithm (the daisy): shown on the unfiltered list so it starts at 1.
  const leadingStages = useMemo(() => STAGES.slice(0, STAGES.findIndex((stage) => stages.includes(stage))), [stages])
  const showLeading = stageFilter === 'all' && query.trim() === ''
  const groups = stages
    .filter((stage) => stageFilter === 'all' || stage.id === stageFilter)
    .map((stage) => ({ stage, algorithms: ALGORITHMS.filter((a) => a.stage === stage.id && matchesSearch(a, query)) }))
    .filter((group) => group.algorithms.length > 0)

  const practised = ALGORITHMS.filter((a) => statusOf(stats[a.id]) !== 'learning' || practisedIds.includes(a.id)).length
  const mastered = ALGORITHMS.filter((a) => statusOf(stats[a.id]) === 'mastered').length

  return (
    <Page>
      <PageHeader
        title="Algorithms"
        lede="An algorithm is a short set of moves that does one job. These fourteen solve the whole cube."
        actions={
          <ButtonLink to="/algorithms/quiz" variant="secondary" iconLeft="cards" data-testid="open-quiz">
            Flash cards
          </ButtonLink>
        }
        className="mb-5! md:mb-6!"
      />

      <Reveal className="mb-5 flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 shadow-1 sm:flex-row sm:items-center sm:gap-6">
        <div className="min-w-0 grow">
          <ProgressBar label="Practised" value={practised} max={ALGORITHMS.length} segments={ALGORITHMS.length} tone="accent" showLabel valueText={`${practised} of ${ALGORITHMS.length}`} />
        </div>
        <div className="flex shrink-0 items-center gap-2 text-sm font-bold text-ink-muted">
          <Sticker tone="green" icon="star" size="xs" filled />
          <span data-testid="mastered-count">{mastered} mastered</span>
        </div>
      </Reveal>

      <Reveal className="mb-6 flex flex-col gap-3">
        <label className="relative block">
          <span className="sr-only">Search algorithms</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or moves"
            autoComplete="off"
            spellCheck={false}
            data-testid="alg-search"
            className="h-12 w-full rounded-md border-[1.5px] border-line-strong bg-surface px-4 text-base font-semibold text-ink placeholder:font-medium placeholder:text-ink-faint"
          />
        </label>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Filter by stage">
          <Chip selected={stageFilter === 'all'} onClick={() => setStageFilter('all')}>
            All
          </Chip>
          {stages.map((stage) => (
            <Chip key={stage.id} selected={stageFilter === stage.id} onClick={() => setStageFilter(stage.id)} data-testid={`filter-${stage.id}`}>
              {stage.title}
            </Chip>
          ))}
        </div>
      </Reveal>

      {groups.length === 0 ? (
        <Reveal>
          <EmptyState icon="cards" title="No algorithm matches that" description="Try a name like “Sune”, or some moves like R U R'." />
        </Reveal>
      ) : (
        <>
          {showLeading && leadingStages.map((stage) => <NoAlgorithmStage key={stage.id} stage={stage} />)}
          {groups.map((group) => (
            <StageGroup key={group.stage.id} {...group} />
          ))}
        </>
      )}
    </Page>
  )
}
