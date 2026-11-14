import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { PATTERNS, SOLVED, countMoves, type CubePattern } from '../../cube'
import { useProgress } from '../../store'
import { MiniCube } from '../../three'
import { Badge, Chip, cx, EmptyState, Page, PageHeader, ProgressBar, Reveal, springs, Sticker } from '../../ui'
import { collectedCount, DIFFICULTY_LABEL, filterPatterns, type GalleryFilter } from './logic'

const canHover = () => typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover)').matches

export function Difficulty({ level, className }: { level: 1 | 2 | 3; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 text-xs font-bold text-ink-muted', className)} role="img" aria-label={`Difficulty: ${DIFFICULTY_LABEL[level]}`}>
      <span className="flex gap-[3px]" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <span key={n} className={cx('size-2 rounded-[3px]', n <= level ? 'bg-ink-muted' : 'bg-line-strong/70')} />
        ))}
      </span>
      {DIFFICULTY_LABEL[level]}
    </span>
  )
}

const firstSentence = (text: string) => {
  const match = /^.*?[.!?](?=\s|$)/.exec(text.trim())
  return match ? match[0] : text
}

function PatternCard({ pattern, made, hover, index }: { pattern: CubePattern; made: boolean; hover: boolean; index: number }) {
  return (
    <motion.li layout initial={{ opacity: 0, y: 14, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ ...springs.gentle, delay: Math.min(index, 11) * 0.04 }} className="min-w-0">
      <Link
        to={`/patterns/${pattern.id}`}
        data-testid={`pattern-card-${pattern.id}`}
        data-made={made}
        className={cx(
          'group flex h-full flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-1',
          'transition-[translate,box-shadow,border-color] duration-200 ease-out hover:-translate-y-1 hover:border-line-strong hover:shadow-3 active:translate-y-0 active:scale-[0.99]',
        )}
      >
        <div className="stage relative grid aspect-[5/4] place-items-center rounded-none! border-0! border-b! border-line! shadow-none!">
          <div className="w-[62%] transition-[scale,rotate] duration-300 ease-out group-hover:scale-110 group-hover:-rotate-2">
            <MiniCube state={SOLVED} alg={pattern.moves} play={hover ? 'hover' : 'visible'} restOnEnd speed={1.3} label={`${pattern.name} pattern`} />
          </div>
          <span className="absolute top-2.5 right-2.5">
            {made && (
              <Badge tone="green" variant="solid" icon="check">
                Collected
              </Badge>
            )}
          </span>
        </div>
        <div className="flex grow flex-col gap-1.5 p-4">
          <h3 className="text-lg leading-6 text-ink">{pattern.name}</h3>
          {/* One line, never cut mid-sentence: the first sentence of the description. */}
          <p className="text-sm text-ink-muted">{firstSentence(pattern.description)}</p>
          <div className="mt-auto flex items-center justify-between gap-2 pt-2">
            <Difficulty level={pattern.difficulty} />
            <span className="num text-xs font-bold whitespace-nowrap text-ink-faint">{countMoves(pattern.moves)} moves</span>
          </div>
        </div>
      </Link>
    </motion.li>
  )
}

export default function PatternsPage() {
  const made = useProgress((s) => s.patterns)
  const [filter, setFilter] = useState<GalleryFilter>('all')
  const hover = useMemo(canHover, [])
  const count = collectedCount(made, PATTERNS)
  const shown = filterPatterns(PATTERNS, made, filter)
  const complete = count === PATTERNS.length

  return (
    <Page>
      <PageHeader title="Patterns" lede="Twelve tricks that turn a solved cube into something else. Make one and it joins your collection." className="mb-5! md:mb-6!" />

      <Reveal className="mb-5 flex items-center gap-4 rounded-lg border border-line bg-surface p-4 shadow-1 sm:gap-5">
        <Sticker tone={complete ? 'yellow' : 'green'} icon={complete ? 'crown' : 'grid'} size="lg" />
        <div className="min-w-0 grow">
          <p className="font-display text-xl leading-7 font-bold text-ink" data-testid="collection-count">
            <span className="num">{count}</span> of {PATTERNS.length} collected
          </p>
          <ProgressBar label="Patterns collected" value={count} max={PATTERNS.length} segments={PATTERNS.length} tone="green" size="md" className="mt-2" />
          <p className="mt-1.5 text-sm text-ink-muted">{complete ? 'The whole set. You are a pattern curator.' : count === 0 ? 'Start with the Checkerboard. It is only three moves.' : count < 5 ? `${5 - count} more for the Pattern Collector badge.` : `${PATTERNS.length - count} to go for the full set.`}</p>
        </div>
      </Reveal>

      <Reveal className="mb-4 flex gap-2">
        {(
          [
            ['all', 'All'],
            ['todo', 'To make'],
            ['made', 'Collected'],
          ] as const
        ).map(([value, label]) => (
          <Chip key={value} selected={filter === value} onClick={() => setFilter(value)} data-testid={`filter-${value}`}>
            {label}
          </Chip>
        ))}
      </Reveal>

      {shown.length === 0 ? (
        <Reveal>
          <EmptyState icon="grid" tone="green" title={filter === 'made' ? 'Nothing collected yet' : 'You have made them all'} description={filter === 'made' ? 'Open a pattern and try it yourself. It lands here when you finish.' : 'Every pattern is in your collection.'} />
        </Reveal>
      ) : (
        <Reveal>
          <ul className="grid grid-cols-2 gap-3.5 lg:grid-cols-3 lg:gap-4">
            <AnimatePresence mode="popLayout">
              {shown.map((pattern, index) => (
                <PatternCard key={pattern.id} index={index} pattern={pattern} made={made.includes(pattern.id)} hover={hover} />
              ))}
            </AnimatePresence>
          </ul>
        </Reveal>
      )}
    </Page>
  )
}
