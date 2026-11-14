import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent, type ReactNode } from 'react'
import { motion } from 'motion/react'
import {
  applyBackup,
  BADGES,
  downloadBackup,
  MAX_BACKUP_BYTES,
  parseBackup,
  resetEverything,
  TURN_SPEED_MAX,
  TURN_SPEED_MIN,
  TURN_SPEED_STEP,
  turnDurationMs,
  useLevel,
  useProgress,
  useSettings,
  useStreak,
  type BackupFile,
  type MotionChoice,
  type ThemeChoice,
} from '../../store'
import {
  Badge,
  Button,
  Card,
  CUBE_CLASSES,
  cx,
  Field,
  HoldButton,
  Icon,
  Modal,
  Page,
  PageHeader,
  radioGroupKeyDown,
  Reveal,
  SegmentedControl,
  Slider,
  sound,
  Sticker,
  toast,
  Toggle,
  useMotionPref,
  useTheme,
  type CubeColor,
  type IconName,
  type SoundName,
  type Tone,
} from '../../ui'

export default function SettingsPage() {
  return (
    <Page width="narrow">
      <PageHeader title="Settings" lede="Make Rubikku look, sound and move the way you like." />
      <AppearanceSection />
      <SoundSection />
      <MotionSection />
      <CubeSection />
      <BackupSection />
      <ResetSection />
    </Page>
  )
}

function Group({ icon, tone, title, children }: { icon: IconName; tone: Tone; title: string; children: ReactNode }) {
  return (
    <Reveal as="section" className="mt-5 first:mt-0">
      <Card padding="none" className="px-5 pt-5 pb-1 sm:px-6">
        <h2 className="flex items-center gap-3 text-xl text-ink">
          <Sticker icon={icon} tone={tone} size="sm" />
          {title}
        </h2>
        <div className="mt-1 divide-y divide-line">{children}</div>
      </Card>
    </Reveal>
  )
}

// ───────────────────────── Appearance ─────────────────────────

function ThemePreview({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <span data-theme={theme} className="flex h-full w-full flex-col gap-1.5 bg-bg p-2.5">
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-[3px] bg-cube-yellow" />
        <span className="size-2.5 rounded-[3px] bg-cube-blue" />
        <span className="size-2.5 rounded-[3px] bg-cube-red" />
      </span>
      <span className="flex flex-1 flex-col justify-center gap-1.5 rounded-[7px] border border-line bg-surface px-2">
        <span className="h-1.5 w-3/4 rounded-full bg-ink" />
        <span className="h-1.5 w-1/2 rounded-full bg-ink-faint" />
      </span>
    </span>
  )
}

const THEME_OPTIONS: { value: ThemeChoice; label: string; hint: string }[] = [
  { value: 'light', label: 'Light', hint: 'Bright, for daytime' },
  { value: 'dark', label: 'Dark', hint: 'Easy on the eyes at night' },
  { value: 'system', label: 'Auto', hint: 'Matches your tablet or phone' },
]

function AppearanceSection() {
  const { choice, resolved, setTheme } = useTheme()
  const pick = (value: ThemeChoice) => (event: MouseEvent) => setTheme(value, { x: event.clientX, y: event.clientY })
  return (
    <Group icon={resolved === 'dark' ? 'moon' : 'sun'} tone="white" title="Appearance">
      <div className="py-4">
        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-2.5 sm:gap-3" onKeyDown={radioGroupKeyDown}>
          {THEME_OPTIONS.map((option) => {
            const selected = choice === option.value
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected ? 0 : -1}
                onClick={pick(option.value)}
                className={cx(
                  'group relative flex flex-col rounded-lg border-2 p-1.5 text-left transition-[border-color,background-color,scale] duration-150 ease-out active:scale-[0.97]',
                  selected ? 'border-accent bg-accent-soft' : 'border-line bg-surface-2 hover:border-line-strong',
                )}
              >
                <span className="relative block aspect-[4/3] w-full overflow-hidden rounded-[13px] ring-1 ring-line">
                  {option.value === 'system' ? (
                    <>
                      <span className="absolute inset-0">
                        <ThemePreview theme="light" />
                      </span>
                      <span className="absolute inset-0 [clip-path:polygon(100%_0,100%_100%,0_100%)]">
                        <ThemePreview theme="dark" />
                      </span>
                    </>
                  ) : (
                    <ThemePreview theme={option.value} />
                  )}
                </span>
                <span className="flex items-center justify-between gap-1 px-1.5 pt-2 pb-1">
                  <span className="text-sm font-bold text-ink">{option.label}</span>
                  <span
                    className={cx(
                      'grid size-5 shrink-0 place-items-center rounded-full transition-[scale,opacity] duration-200 ease-out',
                      selected ? 'scale-100 bg-accent text-accent-ink opacity-100' : 'scale-50 opacity-0',
                    )}
                  >
                    <Icon name="check" size={12} weight={3.2} />
                  </span>
                </span>
                <span className="sr-only">{option.hint}</span>
              </button>
            )
          })}
        </div>
        <p className="mt-3 text-sm text-ink-muted">
          {choice === 'system' ? `Following your device — showing ${resolved} right now.` : THEME_OPTIONS.find((o) => o.value === choice)?.hint + '.'} You can
          also flip it any time from the menu.
        </p>
      </div>
    </Group>
  )
}

// ───────────────────────── Sound ─────────────────────────

const SOUND_DEMOS: { name: SoundName; label: string }[] = [
  { name: 'turn', label: 'Turn' },
  { name: 'success', label: 'Success' },
  { name: 'levelUp', label: 'Level up' },
  { name: 'error', label: 'Oops' },
]

function SoundSection() {
  const soundOn = useSettings((s) => s.sound)
  const setSound = useSettings((s) => s.setSound)
  return (
    <Group icon={soundOn ? 'volume' : 'volumeOff'} tone="white" title="Sound">
      <Field label="Sound effects" labelId="sound-label" hint="Clicks when the cube turns, a chime when you get it right.">
        <Toggle
          labelledBy="sound-label"
          checked={soundOn}
          onChange={(on) => {
            setSound(on)
            if (on) sound.play('success')
          }}
        />
      </Field>
      <Field label="Try them" hint={soundOn ? 'Tap to hear each one.' : 'Turn sound on to hear them.'} layout="stacked">
        <div className="flex flex-wrap gap-2">
          {SOUND_DEMOS.map((demo) => (
            <Button key={demo.name} variant="secondary" size="sm" iconLeft="volume" disabled={!soundOn} onClick={() => sound.play(demo.name)}>
              {demo.label}
            </Button>
          ))}
        </div>
      </Field>
    </Group>
  )
}

// ───────────────────────── Motion ─────────────────────────

const MOTION_ITEMS: { value: MotionChoice; label: string }[] = [
  { value: 'full', label: 'Full' },
  { value: 'reduced', label: 'Reduced' },
]

function MotionSection() {
  const motionSetting = useSettings((s) => s.motion)
  const setMotion = useSettings((s) => s.setMotion)
  const { system } = useMotionPref()
  return (
    <Group icon="motion" tone="white" title="Motion">
      <Field
        label="Animations"
        hint={
          system
            ? 'Your device asks for less motion, so Rubikku keeps things still.'
            : motionSetting === 'reduced'
              ? 'Pages and the cube change instantly, without sliding or spinning.'
              : 'Smooth turns, sliding pages and little celebrations.'
        }
      >
        {/* When the device itself asks for less motion the choice is made for him: show it, locked. */}
        <SegmentedControl ariaLabel="Animations" items={system ? MOTION_ITEMS.map((item) => ({ ...item, disabled: item.value !== 'reduced' })) : MOTION_ITEMS} value={system ? 'reduced' : motionSetting} onChange={setMotion} />
      </Field>
    </Group>
  )
}

// ───────────────────────── Cube ─────────────────────────

const FACE: CubeColor[] = ['green', 'green', 'white', 'green', 'green', 'white', 'green', 'green', 'white']

/** A little face that makes a quarter turn at the chosen speed whenever the speed changes. */
function TurnPreview({ speed }: { speed: number }) {
  const [turns, setTurns] = useState(0)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setTurns((t) => t + 1)
  }, [speed])
  return (
    <button
      type="button"
      onClick={() => {
        setTurns((t) => t + 1)
        sound.play('turn')
      }}
      aria-label="Preview a turn at this speed"
      className="grid size-16 shrink-0 place-items-center rounded-md bg-inset ring-1 ring-line ring-inset transition-transform duration-150 active:scale-95"
    >
      <motion.span
        animate={{ rotate: turns * 90 }}
        transition={{ duration: turnDurationMs(speed) / 1000, ease: [0.65, 0, 0.35, 1] }}
        className="grid size-10 grid-cols-3 gap-[2px] rounded-[7px] bg-cube-body p-[3px]"
      >
        {FACE.map((color, i) => (
          <span key={i} className={cx('rounded-[2.5px]', CUBE_CLASSES[color].solid)} />
        ))}
      </motion.span>
    </button>
  )
}

function CubeSection() {
  const turnSpeed = useSettings((s) => s.turnSpeed)
  const setTurnSpeed = useSettings((s) => s.setTurnSpeed)
  const showFaceLabels = useSettings((s) => s.showFaceLabels)
  const setShowFaceLabels = useSettings((s) => s.setShowFaceLabels)
  return (
    <Group icon="cube" tone="white" title="Cube">
      <div className="flex items-center gap-5 py-4">
        <Slider
          label="Turn speed"
          min={TURN_SPEED_MIN}
          max={TURN_SPEED_MAX}
          step={TURN_SPEED_STEP}
          value={turnSpeed}
          onChange={setTurnSpeed}
          formatValue={(v) => (v === 1 ? 'Normal' : `${v}×`)}
          ends={['Slow', 'Fast']}
        />
        <TurnPreview speed={turnSpeed} />
      </div>
      <Field label="Face letters" labelId="labels-label" hint="Show U, D, L, R, F and B on the cube’s centres.">
        <Toggle labelledBy="labels-label" checked={showFaceLabels} onChange={setShowFaceLabels} />
      </Field>
    </Group>
  )
}

// ───────────────────────── Backup ─────────────────────────

function describeBackup(backup: BackupFile): string {
  const date = new Date(backup.exportedAt)
  const when = date.getTime() > 0 ? date.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }) : 'an unknown date'
  return `Saved on ${when}.`
}

function BackupSection() {
  const input = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<BackupFile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError(null)
    // Check the size before reading anything: a huge file is never a backup.
    if (file.size > MAX_BACKUP_BYTES) {
      setError('That file is too big to be a Rubikku backup. Pick a file that Rubikku exported.')
      sound.play('error')
      return
    }
    let text = ''
    try {
      text = await file.text()
    } catch {
      setError('That file could not be opened.')
      return
    }
    const result = parseBackup(text)
    if (!result.ok) {
      setError(`${result.error} Pick a file that Rubikku exported.`)
      sound.play('error')
      return
    }
    setPending(result.backup)
  }

  const restore = async () => {
    if (!pending) return
    setBusy(true)
    try {
      const result = await applyBackup(pending)
      if (result.ok) {
        toast({ title: 'Backup restored', description: 'Everything is back where it was.', tone: 'green', icon: 'check' })
        sound.play('success')
      } else {
        // Nothing was changed: the old save was put back.
        setError(result.error)
        sound.play('error')
      }
    } catch {
      setError('Something went wrong restoring that backup. Nothing was changed.')
      sound.play('error')
    } finally {
      setBusy(false)
      setPending(null)
    }
  }

  return (
    <Group icon="download" tone="white" title="Backup">
      <Field label="Save a backup" hint="Downloads one file with your progress, times and settings.">
        <Button
          variant="secondary"
          iconLeft="download"
          onClick={() => {
            const name = downloadBackup()
            toast({ title: 'Backup saved', description: name, tone: 'green', icon: 'download' })
          }}
        >
          Export
        </Button>
      </Field>
      <Field label="Restore a backup" hint="Replaces everything here with what is in the file.">
        <input ref={input} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={onFile} data-testid="backup-file" />
        <Button variant="secondary" iconLeft="upload" onClick={() => input.current?.click()}>
          Import
        </Button>
      </Field>
      {error && (
        <div role="alert" data-testid="backup-error" className="mb-4 flex items-start gap-3 rounded-md border-0 bg-cube-red-soft p-3.5 text-cube-red-text">
          <Icon name="alert" size={20} className="mt-0.5" />
          <p className="text-sm font-semibold">{error}</p>
        </div>
      )}

      <Modal
        open={pending !== null}
        onClose={() => setPending(null)}
        title="Restore this backup?"
        description={pending ? `${describeBackup(pending)} It will replace your current progress and settings.` : undefined}
        media={<Sticker icon="upload" tone="orange" size="lg" />}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Keep what I have
            </Button>
            <Button loading={busy} onClick={restore} iconLeft="check" data-testid="backup-restore">
              Restore backup
            </Button>
          </>
        }
      />
    </Group>
  )
}

// ───────────────────────── Reset ─────────────────────────

function ResetSection() {
  const [open, setOpen] = useState(false)
  const level = useLevel()
  const streak = useStreak()
  const badgeCount = useProgress((s) => Object.keys(s.badges).length)

  const erase = () => {
    resetEverything()
    setOpen(false)
    toast({ title: 'Everything was reset', description: 'A fresh start.', icon: 'restart' })
  }

  return (
    <Group icon="trash" tone="white" title="Start over">
      <Field label="Reset everything" hint="Erases your progress, times and settings on this device.">
        <Button variant="secondary" iconLeft="trash" className="text-cube-red-text!" onClick={() => setOpen(true)}>
          Reset
        </Button>
      </Field>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Erase everything?"
        description="This can’t be undone. You would lose:"
        media={<Sticker icon="alert" tone="red" size="lg" />}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} data-autofocus>
              Keep my progress
            </Button>
            <HoldButton variant="danger" iconLeft="trash" onConfirm={erase}>
              Hold to erase
            </HoldButton>
          </>
        }
      >
        <ul className="grid grid-cols-3 gap-2.5">
          {[
            { value: `${level.xp}`, label: 'XP' },
            { value: `${badgeCount}/${BADGES.length}`, label: 'badges' },
            { value: `${streak.days}`, label: 'day streak' },
          ].map((item) => (
            <li key={item.label} className="rounded-md bg-inset px-3 py-3 text-center">
              <span className="num block font-display text-xl font-extrabold text-ink">{item.value}</span>
              <span className="block text-xs font-bold text-ink-muted">{item.label}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 flex items-center gap-2 text-sm text-ink-muted">
          <Badge tone="orange" icon="download">
            Tip
          </Badge>
          Export a backup first if you might want it back.
        </p>
      </Modal>
    </Group>
  )
}
