/**
 * "Which picture looks most like your cube?" — the quick way back for a learner who is lost on his
 * real cube (see `rescue.ts`). Used at the top of every lesson's Stuck? sheet and of
 * `#/solve?where`. Eight pictures; a tap asks one or two quick checks and then offers the stage
 * after it, on his cube or on screen. "None of these" leads to painting the 54 stickers.
 */
import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { MiniCube } from '../../three'
import { Button, cx, Icon, springs } from '../../ui'
import { getLesson } from './content'
import { RichText } from './player/RichText'
import { TroubleList } from './player/WrapPanel'
import { RESCUE_PICKS, rescueLabel, rescueRoute, stagePicture, type RescuePick } from './rescue'

export interface ChooserProps {
  /** Open a lesson at a beat (the real-cube step, or the practice cubes). */
  onGo: (lesson: string, beat: 'cube' | 'drill') => void
  /** "None of these": check it exactly, sticker by sticker. */
  onExact: () => void
  /** Called with the picture he is looking at (to show it big, where there is a big cube). */
  onPreview?: (pick: RescuePick | null) => void
  /** Tighter tiles (inside a dialog). */
  compact?: boolean
}

export function Chooser({ onGo, onExact, onPreview, compact = false }: ChooserProps) {
  const [picked, setPicked] = useState<RescuePick | null>(null)
  const pick = (value: RescuePick | null) => {
    setPicked(value)
    onPreview?.(value)
  }
  const route = picked ? rescueRoute(picked) : null
  const troubles = route ? (getLesson(route.next)?.troubles ?? []) : []
  const tile = compact ? 76 : 88

  return (
    <div className="flex flex-col gap-3" data-testid="chooser" data-picked={picked ?? ''}>
      <AnimatePresence mode="wait" initial={false}>
        {!route ? (
          <motion.div key="pictures" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4, transition: { duration: 0.1 } }} transition={springs.gentle} className="flex flex-col gap-3">
            <div>
              <h3 className="text-lg leading-tight font-bold text-ink">Which picture looks most like your cube?</h3>
              <p className="mt-1 text-sm leading-snug text-ink-muted">Hold it yellow on top. The grey parts can be anything — look only at the coloured ones. Pictures 2 and 3 show the bottom.</p>
            </div>
            <ul className="grid grid-cols-2 gap-2 min-[420px]:grid-cols-4">
              {RESCUE_PICKS.map((id, i) => {
                const picture = stagePicture(id)
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => pick(id)}
                      onMouseEnter={() => onPreview?.(id)}
                      onFocus={() => onPreview?.(id)}
                      className="flex h-full w-full flex-col items-center gap-1 rounded-md bg-inset p-1.5 text-center transition-colors duration-150 hover:bg-surface hover:ring-1 hover:ring-line-strong focus-visible:ring-2 focus-visible:ring-accent"
                      data-testid={`chooser-pick-${id}`}
                    >
                      <MiniCube
                        state={picture.state}
                        size={tile}
                        play={false}
                        highlight={picture.lit ? { pieces: picture.lit, dimOthers: true, outline: false, dimTo: 'grey' } : undefined}
                        pose={picture.below ? { elevation: -0.52 } : undefined}
                        label={rescueLabel(id)}
                      />
                      <span className="text-xs leading-tight font-bold text-ink">
                        <span className="num text-ink-faint">{i === 0 ? '0' : i} · </span>
                        {id === 'scrambled' ? 'Nothing done' : rescueLabel(id).replace(/^Stage \d done: /, '')}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
            <Button variant="ghost" size="sm" iconLeft="grid" onClick={onExact} className="self-start" data-testid="chooser-none">
              None of these — check it exactly (54 stickers)
            </Button>
          </motion.div>
        ) : (
          <motion.div key={route.pick} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4, transition: { duration: 0.1 } }} transition={springs.gentle} className="flex flex-col gap-3" data-testid="chooser-route" data-next={route.next}>
            <div className="flex items-center gap-3">
              <MiniCube
                state={stagePicture(route.pick).state}
                size={64}
                play={false}
                highlight={stagePicture(route.pick).lit ? { pieces: stagePicture(route.pick).lit!, dimOthers: true, outline: false, dimTo: 'grey' } : undefined}
                pose={stagePicture(route.pick).below ? { elevation: -0.52 } : undefined}
                label={route.label}
              />
              <div className="min-w-0">
                <p className="eyebrow">You picked</p>
                <h3 className="text-lg leading-tight font-bold text-ink">{route.label}</h3>
              </div>
            </div>
            {route.checks.length > 0 && (
              <div className="rounded-md bg-inset px-3.5 py-3" data-testid="chooser-checks">
                <p className="eyebrow mb-1.5">Quick check on your cube</p>
                <ul className="flex flex-col gap-1.5">
                  {route.checks.map((check) => (
                    <li key={check} className="flex gap-2 text-sm leading-snug text-ink-muted">
                      <Icon name="eye" size={15} className="mt-0.5 shrink-0 text-ink-faint" />
                      <span>
                        <RichText text={check} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-base leading-snug text-ink">
              {route.checks.length > 0 ? 'Yes? ' : ''}Then you are on <span className="font-bold">stage {route.nextNumber}: {route.nextTitle}</span>.
            </p>
            <div className="flex flex-col gap-2">
              <Button variant="primary" iconRight="arrowRight" fullWidth onClick={() => onGo(route.cube.lesson, route.cube.beat)} data-testid="chooser-go-cube">
                Do stage {route.nextNumber} on my cube
              </Button>
              <Button variant="secondary" iconLeft="cube" fullWidth onClick={() => onGo(route.drill.lesson, route.drill.beat)} data-testid="chooser-go-drill">
                Practise it on screen first
              </Button>
            </div>
            {troubles.length > 0 && (
              <details className="group rounded-md">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-bold text-accent-text [&::-webkit-details-marker]:hidden">
                  <Icon name="chevronRight" size={16} className="transition-transform duration-150 group-open:rotate-90" />
                  What goes wrong in stage {route.nextNumber}
                </summary>
                <TroubleList troubles={troubles} />
              </details>
            )}
            <div className={cx('flex flex-wrap gap-2', route.earlier ? 'justify-between' : '')}>
              <Button variant="ghost" size="sm" iconLeft="arrowLeft" onClick={() => pick(null)} data-testid="chooser-back">
                Other pictures
              </Button>
              {route.earlier && (
                <Button variant="ghost" size="sm" iconLeft="chevronLeft" onClick={() => pick(route.earlier)} data-testid="chooser-earlier">
                  Not quite? One stage earlier
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
