import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { applyAlg, SOLVED } from '../../../cube'
import { Badge, Button, Card, CubeNet, cx, HoldButton, Icon, Modal, MoveSequence, SegmentedControl, springs, Sticker } from '../../../ui'
import { formatSolve, formatTime, formatWhen } from '../logic/format'
import { countsForRecords, truncateCentis, type Penalty, type Solve } from '../logic/solves'

const PAGE = 12

const PENALTY_ITEMS: { value: Penalty; label: string; ariaLabel: string }[] = [
  { value: 'ok', label: 'OK', ariaLabel: 'OK, no penalty' },
  { value: '+2', label: '+2', ariaLabel: 'Plus 2 seconds' },
  { value: 'dnf', label: 'DNF', ariaLabel: 'Did not finish' },
]

export interface HistoryCardProps {
  /** Chronological (oldest first). */
  solves: readonly Solve[]
  bestId: string | null
  onPenalty: (id: string, penalty: Penalty) => void
  onDelete: (id: string) => void
  onClear: () => void
}

function ScramblePreview({ scramble }: { scramble: string }) {
  const state = useMemo(() => {
    try {
      return applyAlg(SOLVED, scramble)
    } catch {
      return SOLVED
    }
  }, [scramble])
  return <CubeNet state={state} size={9} label="The cube after this scramble" />
}

/** Every solve, newest first. Rows open to show the scramble and to fix the result. */
export function HistoryCard({ solves, bestId, onPenalty, onDelete, onClear }: HistoryCardProps) {
  const [shown, setShown] = useState(PAGE)
  const [open, setOpen] = useState<string | null>(null)
  const [confirm, setConfirm] = useState(false)

  const total = solves.length
  const rows = useMemo(() => {
    const out: { solve: Solve; number: number }[] = []
    for (let i = total - 1; i >= Math.max(0, total - shown); i--) out.push({ solve: solves[i], number: i + 1 })
    return out
  }, [solves, total, shown])

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3 sm:px-6">
        <div>
          <h2 className="text-xl text-ink">Record book</h2>
          <p className="text-sm text-ink-muted">
            {total} {total === 1 ? 'solve' : 'solves'} · newest first
          </p>
        </div>
        <Button variant="ghost" size="sm" iconLeft="trash" onClick={() => setConfirm(true)}>
          Clear session
        </Button>
      </div>

      <ol className="divide-y divide-line border-t border-line" data-testid="history">
        {rows.map(({ solve, number }) => {
          const expanded = open === solve.id
          const isBest = solve.id === bestId
          return (
            <li key={solve.id} data-testid="history-row">
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : solve.id)}
                className={cx('grid w-full grid-cols-[2.75rem_auto_1fr_auto] items-center gap-x-3 px-5 py-3 text-left transition-colors duration-150 hover:bg-surface-2 sm:px-6', expanded && 'bg-surface-2', isBest && !expanded && 'bg-cube-yellow-soft/45')}
              >
                <span className={cx('num justify-self-start rounded-[7px] px-1.5 py-0.5 font-mono text-xs font-bold', isBest ? 'bg-cube-yellow text-on-yellow shadow-[0_2px_0_0_var(--cube-yellow-edge)]' : 'bg-inset text-ink-muted')}>#{number}</span>
                <span className={cx('num font-display text-lg leading-7 font-extrabold tracking-[-0.02em]', solve.penalty === 'dnf' ? 'text-ink-muted' : 'text-ink')}>{formatSolve(solve)}</span>
                <span className="flex min-w-0 items-center gap-1.5">
                  {isBest && (
                    <Badge tone="yellow" size="sm" icon="trophy">
                      Best
                    </Badge>
                  )}
                  {solve.penalty === '+2' && (
                    <Badge tone="orange" size="sm">
                      +2 penalty
                    </Badge>
                  )}
                  {solve.penalty === 'dnf' && solve.ms > 0 && (
                    <Badge tone="neutral" size="sm">
                      {formatTime(truncateCentis(solve.ms))}
                    </Badge>
                  )}
                  {solve.penalty !== 'dnf' && !countsForRecords(solve) && (
                    <Badge tone="neutral" size="sm" data-testid="too-quick-row">
                      Too quick to count
                    </Badge>
                  )}
                </span>
                <span className="flex items-center gap-2 text-sm text-ink-muted">
                  <span className="max-xs:hidden">{formatWhen(solve.at)}</span>
                  <Icon name="chevronDown" size={16} className={cx('text-ink-faint transition-transform duration-200', expanded && 'rotate-180')} />
                </span>
              </button>
              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={springs.gentle} className="overflow-hidden bg-surface-2">
                    <div className="px-5 pt-1 pb-4 sm:px-6">
                      <p className="mb-2.5 text-sm text-ink-muted xs:hidden">{formatWhen(solve.at)}</p>
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                        {solve.scramble ? (
                          <>
                            <MoveSequence moves={solve.scramble} size="sm" label="Scramble" className="min-w-0 flex-1 basis-64" />
                            <ScramblePreview scramble={solve.scramble} />
                          </>
                        ) : (
                          <p className="text-sm text-ink-muted">No scramble saved for this solve.</p>
                        )}
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        {solve.penalty === 'dnf' && solve.ms === 0 ? (
                          <p className="text-sm text-ink-muted">Inspection ran out before the start: no time was recorded.</p>
                        ) : (
                          <SegmentedControl ariaLabel={`Result of solve ${number}`} size="sm" items={PENALTY_ITEMS} value={solve.penalty} onChange={(penalty) => onPenalty(solve.id, penalty)} />
                        )}
                        <Button variant="ghost" size="sm" iconLeft="trash" onClick={() => onDelete(solve.id)}>
                          Delete
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          )
        })}
      </ol>

      {shown < total && (
        <div className="border-t border-line p-3 text-center">
          <Button variant="soft" size="sm" iconRight="chevronDown" onClick={() => setShown((n) => n + PAGE * 2)}>
            Show {Math.min(PAGE * 2, total - shown)} more
          </Button>
        </div>
      )}

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Clear this session?"
        description={`This removes ${total === 1 ? 'your 1 solve' : `all ${total} solves`} from the timer. Your XP, badges and all-time best stay.`}
        media={<Sticker icon="trash" tone="red" size="lg" />}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Keep them
            </Button>
            <HoldButton
              holdMs={900}
              iconLeft="trash"
              onConfirm={() => {
                onClear()
                setConfirm(false)
                setShown(PAGE)
              }}
            >
              Hold to clear
            </HoldButton>
          </>
        }
      />
    </Card>
  )
}
