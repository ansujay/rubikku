import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { FLAGS, FLAG_FAMILIES, LEFT_OUT_FLAGS, PATTERNS, SOLVED, countMoves, type CubeFlag, type CubePattern } from '../../cube'
import { useProgress } from '../../store'
import { MiniCube } from '../../three'
import { Badge, Chip, cx, EmptyState, FaceGrid, FlagArt, Icon, Page, PageHeader, ProgressBar, Reveal, springs, Sticker, TabPanel, Tabs } from '../../ui'
import DesignStudio from './DesignPage'
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

type GalleryTab = 'tricks' | 'flags' | 'design'
const TAB_ID = 'patterns'

function FlagCard({ flag, made, index }: { flag: CubeFlag; made: boolean; index: number }) {
  const count = countMoves(flag.moves)
  return (
    <motion.li layout initial={{ opacity: 0, y: 14, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ ...springs.gentle, delay: Math.min(index, 11) * 0.04 }} className="min-w-0">
      <Link
        to={`/patterns/${flag.id}`}
        data-testid={`flag-card-${flag.id}`}
        data-made={made}
        className={cx(
          'group flex h-full flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-1',
          'transition-[translate,box-shadow,border-color] duration-200 ease-out hover:-translate-y-1 hover:border-line-strong hover:shadow-3 active:translate-y-0 active:scale-[0.99]',
        )}
      >
        {/* The real flag, then the nine stickers that make it. Widths 3:2, so both stand the same height. */}
        <div className="flex items-center gap-2 border-b border-line bg-inset px-3.5 py-4 sm:gap-3 sm:px-5 sm:py-5">
          <FlagArt spec={flag.art} label={`Flag of ${flag.name}`} className="min-w-0 flex-[3] transition-[rotate,scale] duration-300 ease-out group-hover:-rotate-2 group-hover:scale-105" />
          <Icon name="arrowRight" size={16} weight={2.4} className="shrink-0 text-ink-faint" />
          {/* A picture of the stickers: hidden so the link's name stays "Flag of …, name, moves". */}
          <div aria-hidden="true" className="min-w-0 flex-[2]">
            <FaceGrid colors={flag.grid} label={`${flag.name} on the cube`} />
          </div>
        </div>
        <div className="flex grow flex-col gap-1.5 p-4">
          <h3 className="flex items-center justify-between gap-2 text-lg leading-6 text-ink">
            <span className="min-w-0 truncate">{flag.name}</span>
            {made && (
              <span className="shrink-0" role="img" aria-label="Collected">
                <Sticker tone="green" icon="check" size="xs" />
              </span>
            )}
          </h3>
          <div className="mt-auto flex items-center justify-between gap-2 pt-1">
            <Difficulty level={flag.difficulty} />
            <span className="num text-xs font-bold whitespace-nowrap text-ink-faint">
              {count} {count === 1 ? 'move' : 'moves'}
            </span>
          </div>
        </div>
      </Link>
    </motion.li>
  )
}

function FilterChips({ filter, onChange }: { filter: GalleryFilter; onChange: (filter: GalleryFilter) => void }) {
  return (
    <Reveal className="mb-4 flex gap-2">
      {(
        [
          ['all', 'All'],
          ['todo', 'To make'],
          ['made', 'Collected'],
        ] as const
      ).map(([value, label]) => (
        <Chip key={value} selected={filter === value} onClick={() => onChange(value)} data-testid={`filter-${value}`}>
          {label}
        </Chip>
      ))}
    </Reveal>
  )
}

function TricksTab({ made }: { made: readonly string[] }) {
  const [filter, setFilter] = useState<GalleryFilter>('all')
  const hover = useMemo(canHover, [])
  const count = collectedCount(made, PATTERNS)
  const shown = filterPatterns(PATTERNS, made, filter)
  const complete = count === PATTERNS.length

  return (
    <>
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

      <FilterChips filter={filter} onChange={setFilter} />

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
    </>
  )
}

function flagHint(count: number): string {
  if (count >= FLAGS.length) return 'Every flag. That is a real world tour.'
  if (count === 0) return 'Start with Nigeria. It is one move.'
  if (count < 3) return `${3 - count} more for the Flag Bearer badge.`
  if (count < 12) return `${12 - count} more for the World Tour badge.`
  return `${FLAGS.length - count} to go for every flag.`
}

function LeftOutNote() {
  return (
    <details className="group mt-6 rounded-lg border border-line bg-surface shadow-1" data-testid="flags-left-out">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-lg px-4 py-3 font-bold text-ink [&::-webkit-details-marker]:hidden">
        <Icon name="lightbulb" size={18} className="shrink-0 text-cube-yellow-text" />
        <span className="grow">Why isn&rsquo;t my flag here?</span>
        <Icon name="chevronDown" size={18} className="shrink-0 text-ink-faint transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <div className="border-t border-line px-4 pt-3 pb-4">
        <p className="text-base text-ink-muted">A cube has six colours and nine stickers on a side. Some flags need more than that.</p>
        <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {LEFT_OUT_FLAGS.map((flag) => (
            <li key={flag.name} className="text-sm text-ink-muted">
              <span className="font-bold text-ink">{flag.name}.</span> {flag.reason}
            </li>
          ))}
        </ul>
      </div>
    </details>
  )
}

function FlagsTab({ made }: { made: readonly string[] }) {
  const [filter, setFilter] = useState<GalleryFilter>('all')
  const count = collectedCount(made, FLAGS)
  const shown = filterPatterns(FLAGS, made, filter)
  const complete = count === FLAGS.length

  return (
    <>
      <Reveal className="mb-5 flex items-center gap-4 rounded-lg border border-line bg-surface p-4 shadow-1 sm:gap-5">
        <Sticker tone={complete ? 'yellow' : 'green'} icon={complete ? 'crown' : 'flag'} size="lg" />
        <div className="min-w-0 grow">
          <p className="font-display text-xl leading-7 font-bold text-ink" data-testid="flag-collection-count">
            <span className="num">{count}</span> of {FLAGS.length} flags
          </p>
          <ProgressBar label="Flags made" value={count} max={FLAGS.length} segments={FLAGS.length} tone="green" size="md" className="mt-2" />
          <p className="mt-1.5 text-sm text-ink-muted">{flagHint(count)}</p>
        </div>
      </Reveal>

      <FilterChips filter={filter} onChange={setFilter} />

      {shown.length === 0 ? (
        <Reveal>
          <EmptyState icon="flag" tone="green" title={filter === 'made' ? 'No flags yet' : 'You have made them all'} description={filter === 'made' ? 'Open a flag and try it yourself. It lands here when you finish.' : 'Every flag is in your collection.'} />
        </Reveal>
      ) : (
        <div className="flex flex-col gap-7">
          {FLAG_FAMILIES.map((family) => {
            const flags = shown.filter((flag) => flag.family === family.id)
            if (flags.length === 0) return null
            return (
              <Reveal key={family.id}>
                <section aria-labelledby={`flag-family-${family.id}`} data-testid={`flag-family-${family.id}`}>
                  <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                    <h2 id={`flag-family-${family.id}`} className="text-xl text-ink">
                      {family.name}
                    </h2>
                    <p className="text-sm text-ink-muted">{family.blurb}</p>
                  </div>
                  <ul className="grid grid-cols-2 gap-3.5 lg:grid-cols-3 lg:gap-4">
                    <AnimatePresence mode="popLayout">
                      {flags.map((flag, index) => (
                        <FlagCard key={flag.id} index={index} flag={flag} made={made.includes(flag.id)} />
                      ))}
                    </AnimatePresence>
                  </ul>
                </section>
              </Reveal>
            )
          })}
        </div>
      )}

      <LeftOutNote />
    </>
  )
}

export default function PatternsPage() {
  const made = useProgress((s) => s.patterns)
  const [params, setParams] = useSearchParams()
  // All three tabs are `?tab=` on /patterns, so switching never leaves the page (focus stays on
  // the tab). The designer keeps its face in the search too (`&face=…[&slices=1]`), so a design
  // can be shared; /patterns/design is an old alias that redirects here.
  const raw = params.get('tab')
  const tab: GalleryTab = raw === 'flags' || raw === 'design' ? raw : 'tricks'
  const designing = tab === 'design'
  const setTab = (next: GalleryTab) => {
    if (next === tab) return
    const updated = new URLSearchParams(params)
    if (next === 'tricks') updated.delete('tab')
    else updated.set('tab', next)
    if (next !== 'design') {
      updated.delete('face')
      updated.delete('slices')
    }
    setParams(updated, { replace: true })
  }

  return (
    <Page>
      <PageHeader title="Patterns" lede={designing ? 'Paint any face you like. The moves to make it on a real cube appear by themselves.' : 'Tricks and flags you can make on a solved cube. Make one and it joins your collection.'} className="mb-4! md:mb-5!" />

      <Reveal className="mb-5">
        <Tabs
          ariaLabel="Kinds of pattern"
          idBase={TAB_ID}
          value={tab}
          onChange={setTab}
          items={[
            { value: 'tricks', label: 'Tricks', icon: 'grid' },
            { value: 'flags', label: 'Flags', icon: 'flag' },
            { value: 'design', label: 'Make your own', icon: 'wand' },
          ]}
        />
      </Reveal>

      <TabPanel idBase={TAB_ID} value={tab} className="rounded-lg">
        {tab === 'tricks' ? <TricksTab made={made} /> : tab === 'flags' ? <FlagsTab made={made} /> : <DesignStudio />}
      </TabPanel>
    </Page>
  )
}
