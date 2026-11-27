import { useEffect, useState, type ReactNode } from 'react'
import { FLAGS, getFlag } from '../../cube'
import { BADGES } from '../../store'
import {
  AnimatedNumber,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardLink,
  Chip,
  CUBE_COLORS,
  CUBE_COLOR_NAME,
  CubeNet,
  CubeStage,
  CubeSwatch,
  cx,
  EmptyState,
  FaceGrid,
  Field,
  FlagArt,
  HoldButton,
  Icon,
  ICON_NAMES,
  IconButton,
  isIconName,
  IsoCube,
  Kbd,
  Logo,
  Modal,
  MoveChip,
  MoveSequence,
  Page,
  PageHeader,
  PlaybackBar,
  ProgressBar,
  ProgressRing,
  Reveal,
  SCRAMBLED_FACES,
  SegmentedControl,
  Sheet,
  Slider,
  sound,
  SOUND_NAMES,
  celebration,
  StageTracker,
  BadgeArt,
  type StageTrackerItem,
  StatTile,
  Sticker,
  TabPanel,
  Tabs,
  toast,
  Toggle,
  Tooltip,
  useTheme,
  type ButtonVariant,
  type CubeColor,
  type Tone,
} from '../../ui'
import { celebrate } from '../rewards'

function Block({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <Reveal as="section" className="mt-10 scroll-mt-6" >
      <div className="mb-4 border-b border-line pb-2">
        <h2 className="text-2xl text-ink">{title}</h2>
        {note && <p className="text-sm text-ink-muted">{note}</p>}
      </div>
      {children}
    </Reveal>
  )
}

function Row({ label, children, className }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <div className="mb-5">
      {label && <p className="eyebrow mb-2.5">{label}</p>}
      <div className={cx('flex flex-wrap items-center gap-3', className)}>{children}</div>
    </div>
  )
}

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'soft', 'ghost', 'ink', 'success', 'reward', 'danger']
const TONES: Tone[] = ['neutral', 'accent', 'white', 'yellow', 'green', 'blue', 'red', 'orange']
const ALG = "(R U R' U') F2 Rw' M x y' D L B' E2 u"

const SWATCH_TOKENS = [
  ['bg', 'bg-bg'],
  ['bg-sunken', 'bg-bg-sunken'],
  ['surface', 'bg-surface'],
  ['surface-2', 'bg-surface-2'],
  ['inset', 'bg-inset'],
  ['line', 'bg-line'],
  ['line-strong', 'bg-line-strong'],
  ['ink-faint', 'bg-ink-faint'],
  ['ink-muted', 'bg-ink-muted'],
  ['ink', 'bg-ink'],
] as const

const COLOR_ROLE: Record<CubeColor, string> = {
  blue: 'Action',
  green: 'Success',
  yellow: 'Reward · XP',
  orange: 'Streak · energy',
  red: 'Error · danger',
  white: 'Neutral',
}

const NET_SCRAMBLED = 'DRLUUBFBRBLURRLRUBLRDDFDLFUFUFFDBRDUBRUFLLFDDBFLUBLRBD'
const NET_CROSS = new Set([1, 3, 4, 5, 7, 10, 19, 37, 46])

const TRACKER_DEMO: StageTrackerItem[] = [
  { id: 'a', number: 1, title: 'The daisy', state: 'done' },
  { id: 'b', number: 2, title: 'White cross', state: 'done' },
  { id: 'c', number: 3, title: 'White corners', state: 'current' },
  { id: 'd', number: 4, title: 'Middle layer', state: 'todo' },
  { id: 'e', number: 5, title: 'Yellow cross', state: 'peeked' },
  { id: 'f', number: 6, title: 'Yellow edges', state: 'locked' },
  { id: 'g', number: 7, title: 'Place the corners', state: 'locked' },
  { id: 'h', number: 9, title: 'Full solve', state: 'locked', icon: 'trophy' },
]

function CubeNetDemo() {
  const [paint, setPaint] = useState<CubeColor>('red')
  const [painted, setPainted] = useState<(CubeColor | null)[]>(() => {
    const cells: (CubeColor | null)[] = new Array(54).fill(null)
    ;(['white', 'red', 'green', 'yellow', 'orange', 'blue'] as const).forEach((color, face) => {
      cells[face * 9 + 4] = color
    })
    return cells
  })
  const [cursor, setCursor] = useState<number | null>(null)
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <p className="eyebrow mb-2.5">Interactive: pick a colour, tap stickers (centres are locked)</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {CUBE_COLORS.map((color) => (
            <CubeSwatch key={color} color={color} showLetter selected={paint === color} onClick={() => setPaint(color)} />
          ))}
        </div>
        <CubeNet
          state={painted}
          showFaceLetters
          selected={cursor}
          isLocked={(index) => index % 9 === 4}
          onStickerClick={(index) => {
            setCursor(index)
            setPainted((cells) => cells.map((cell, i) => (i === index ? (cell === paint ? null : paint) : cell)))
          }}
          label="Paint the cube"
          className="max-w-md"
        />
      </div>
      <div className="space-y-5">
        <div>
          <p className="eyebrow mb-2.5">From a state string · fixed sizes 18, 10, 6</p>
          <div className="flex flex-wrap items-end gap-5">
            <CubeNet state={NET_SCRAMBLED} size={18} showFaceLetters />
            <CubeNet state={NET_SCRAMBLED} size={10} />
            <CubeNet state={NET_SCRAMBLED} size={6} />
          </div>
        </div>
        <div>
          <p className="eyebrow mb-2.5">Highlight (the white cross) · solved</p>
          <div className="flex flex-wrap items-end gap-5">
            <CubeNet state="UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB" size={14} highlight={NET_CROSS} />
            <CubeNet state="UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB" size={14} />
          </div>
        </div>
      </div>
    </div>
  )
}

function FlagDemo() {
  const [grid, setGrid] = useState<(CubeColor | null)[]>(() => [...getFlag('flag-italy')!.grid])
  const [cell, setCell] = useState<number | null>(4)
  return (
    <>
      <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">
        {FLAGS.map((f) => (
          <div key={f.id} className="flex flex-col gap-2">
            <p className="text-sm font-semibold text-ink">{f.name}</p>
            <div className="flex items-center gap-3">
              <FlagArt spec={f.art} size={84} label={`Flag of ${f.name}`} />
              <Icon name="arrowRight" size={16} className="text-ink-muted" />
              <FaceGrid colors={f.grid} size={14} label={`${f.name} on the cube`} />
            </div>
          </div>
        ))}
      </div>
      <Row label="Editable FaceGrid (arrow keys move, Enter or Space cycles the colour)" className="mt-6">
        <FaceGrid
          colors={grid}
          size={44}
          showLetters
          selected={cell}
          onCellClick={(i) => {
            setCell(i)
            setGrid((g) => g.map((c, j) => (j === i ? CUBE_COLORS[(CUBE_COLORS.indexOf(c ?? 'white') + 1) % CUBE_COLORS.length]! : c)))
          }}
        />
      </Row>
    </>
  )
}

export default function KitchenSinkPage() {
  const { resolved } = useTheme()
  const [segment, setSegment] = useState('light')
  const [tab, setTab] = useState('stats')
  const [toggleA, setToggleA] = useState(true)
  const [toggleB, setToggleB] = useState(false)
  const [slider, setSlider] = useState(1.25)
  const [chip, setChip] = useState('all')
  const [swatch, setSwatch] = useState<CubeColor>('red')
  const [modal, setModal] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [position, setPosition] = useState(3)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [xp, setXp] = useState(140)
  const total = 8

  useEffect(() => {
    if (!playing) return
    if (position >= total) {
      setPlaying(false)
      return
    }
    const timer = window.setTimeout(() => {
      setPosition((p) => p + 1)
      sound.play('turn')
    }, 700 / speed)
    return () => window.clearTimeout(timer)
  }, [playing, position, speed])

  return (
    <Page>
      <PageHeader
        eyebrow={`Design system · ${resolved} theme`}
        title="Kitchen sink"
        lede="Every primitive in every state. If it looks right here in both themes, it looks right everywhere."
        actions={<Logo size={34} />}
      />

      <Block title="Colour" note="Neutrals carry the interface. The six cube colours are accents, and each has one job.">
        <Row label="Neutrals">
          {SWATCH_TOKENS.map(([name, cls]) => (
            <div key={name} className="w-[4.5rem]">
              <div className={cx('h-12 rounded-md ring-1 ring-line-strong ring-inset', cls)} />
              <p className="mt-1.5 font-mono text-2xs text-ink-muted">{name}</p>
            </div>
          ))}
        </Row>
        <Row label="Cube colours — solid, edge, soft, text" className="items-start gap-4">
          {CUBE_COLORS.map((color) => (
            <div key={color} className="w-28">
              <Sticker tone={color} size="lg" className="w-full!">
                {CUBE_COLOR_NAME[color][0]}
              </Sticker>
              <div className={cx('mt-3 rounded-md px-2.5 py-2', `bg-cube-${color}-soft`)}>
                <p className={cx('text-sm font-bold', `text-cube-${color}-text`)}>{CUBE_COLOR_NAME[color]}</p>
                <p className={cx('text-xs font-semibold', `text-cube-${color}-text`)}>{COLOR_ROLE[color]}</p>
              </div>
            </div>
          ))}
        </Row>
      </Block>

      <Block title="Type" note="Bricolage Grotesque for display, Figtree for reading, JetBrains Mono for notation.">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <p className="font-display text-5xl font-extrabold tracking-[-0.03em] text-ink">Solve it.</p>
            <h1 className="text-4xl text-ink">Display 4xl — page titles</h1>
            <h2 className="text-2xl text-ink">Heading 2xl — sections</h2>
            <h3 className="text-xl text-ink">Heading xl — cards</h3>
            <p className="eyebrow">Eyebrow — small caps label</p>
          </div>
          <div className="space-y-3">
            <p className="text-lg text-ink-muted">Lede (lg): one or two friendly sentences that say what this page is for.</p>
            <p className="text-base text-ink">Body (base): hold the cube with white on top. Find the white edge with a green side.</p>
            <p className="text-sm text-ink-muted">Small (sm): hints, captions and helper text.</p>
            <p className="font-mono text-lg font-semibold text-ink">R U R′ U′ · F2 · 0123456789</p>
            <p className="num font-display text-3xl font-extrabold text-ink">
              1:23.45 <span className="text-base font-bold text-ink-muted">tabular numbers</span>
            </p>
          </div>
        </div>
      </Block>

      <Block title="Buttons" note="Keycaps: a face on an edge. Press one — it sinks.">
        {(['lg', 'md', 'sm'] as const).map((size) => (
          <Row key={size} label={`Size ${size}`}>
            {VARIANTS.map((variant) => (
              <Button key={variant} variant={variant} size={size}>
                {variant[0].toUpperCase() + variant.slice(1)}
              </Button>
            ))}
          </Row>
        ))}
        <Row label="With icons, loading, disabled, pressed, link">
          <Button iconRight="arrowRight">Continue</Button>
          <Button variant="secondary" iconLeft="shuffle">
            Scramble
          </Button>
          <Button loading>Saving</Button>
          <Button disabled>Disabled</Button>
          <Button variant="secondary" disabled>
            Disabled
          </Button>
          <Button data-pressed="true">Pressed</Button>
          <ButtonLink to="/kitchen-sink" variant="reward" iconLeft="bolt">
            Link button
          </ButtonLink>
          <HoldButton onConfirm={() => toast({ title: 'Held all the way', icon: 'check', tone: 'green' })}>Hold to confirm</HoldButton>
        </Row>
        <Row label="Icon buttons">
          <IconButton icon="undo" label="Undo" />
          <IconButton icon="redo" label="Redo" />
          <IconButton icon="shuffle" label="Scramble" variant="secondary" />
          <IconButton icon="lightbulb" label="Hint" variant="reward" />
          <IconButton icon="play" label="Play" variant="primary" filled size="lg" />
          <IconButton icon="eye" label="Peek at hidden faces" variant="soft" pressed />
          <IconButton icon="restart" label="Reset" size="sm" variant="soft" />
          <IconButton icon="trash" label="Delete" disabled />
        </Row>
      </Block>

      <Block title="Move notation" note="The stripe is the colour of the face that turns. Done moves stay pressed in; the live move lifts.">
        <Row label="Sizes">
          <MoveChip move="R" size="sm" />
          <MoveChip move="U'" size="sm" />
          <MoveChip move="F2" size="sm" />
          <MoveChip move="R" />
          <MoveChip move="U'" />
          <MoveChip move="F2" />
          <MoveChip move="R" size="lg" />
          <MoveChip move="U'" size="lg" />
          <MoveChip move="F2" size="lg" />
        </Row>
        <Row label="Every face, wide moves, slices, rotations, invalid">
          {['U', 'D', 'F', 'B', 'R', 'L', "U'", 'D2', 'Rw', "f'", 'M', "E'", 'S2', 'x', "y'", 'z2', 'Q'].map((move) => (
            <MoveChip key={move} move={move} />
          ))}
        </Row>
        <Row label="States: done · active · upcoming">
          <MoveChip move="R" state="done" />
          <MoveChip move="U" state="done" />
          <MoveChip move="R'" state="active" />
          <MoveChip move="U'" state="upcoming" />
          <span className="mx-3 h-8 w-px bg-line" />
          <MoveChip move="L" size="lg" state="done" />
          <MoveChip move="F'" size="lg" state="active" />
          <MoveChip move="B2" size="lg" />
        </Row>
        <Row label="Sequence with playback position (tap a move)">
          <MoveSequence moves={ALG} activeIndex={position} onMoveClick={setPosition} label="Example algorithm" />
        </Row>
        <Row label="Small sequence in text">
          <p className="flex flex-wrap items-center gap-2 text-base text-ink">
            The “sexy move” is <MoveSequence moves="R U R' U'" size="sm" className="inline-flex" /> — do it six times.
          </p>
        </Row>
      </Block>

      <Block title="Playback bar" note="Controlled shell: the owner holds position and playing.">
        <PlaybackBar
          playing={playing}
          onPlayPause={() => {
            if (position >= total) setPosition(0)
            setPlaying((p) => !p)
          }}
          position={position}
          total={total}
          onStepBack={() => setPosition((p) => Math.max(0, p - 1))}
          onStepForward={() => setPosition((p) => Math.min(total, p + 1))}
          onRestart={() => setPosition(0)}
          onScrub={setPosition}
          speed={speed}
          onSpeedChange={setSpeed}
        />
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <PlaybackBar playing onPlayPause={() => {}} position={40} total={62} onStepBack={() => {}} onStepForward={() => {}} onScrub={() => {}} />
          <PlaybackBar playing={false} onPlayPause={() => {}} position={0} total={0} onStepBack={() => {}} onStepForward={() => {}} onRestart={() => {}} speed={1} onSpeedChange={() => {}} />
        </div>
      </Block>

      <Block title="Cube colours and stickers">
        <Row label="Swatches (sm, md, lg) with letters">
          {CUBE_COLORS.map((color) => (
            <CubeSwatch key={color} color={color} size="sm" />
          ))}
          <span className="mx-1" />
          {CUBE_COLORS.map((color) => (
            <CubeSwatch key={color} color={color} showLetter />
          ))}
        </Row>
        <Row label="Palette (pick one)">
          {CUBE_COLORS.map((color) => (
            <CubeSwatch key={color} color={color} size="lg" showLetter selected={swatch === color} onClick={() => setSwatch(color)} />
          ))}
        </Row>
        <Row label="Stickers: solid tones">
          {TONES.map((tone, i) => (
            <Sticker key={tone} tone={tone} icon={(['cube', 'route', 'layers', 'bolt', 'check', 'notation', 'alert', 'flame'] as const)[i]} />
          ))}
        </Row>
        <Row label="Stickers: sizes, soft, locked">
          <Sticker tone="orange" icon="flame" size="xs" filled />
          <Sticker tone="orange" icon="flame" size="sm" filled />
          <Sticker tone="orange" icon="flame" size="md" filled />
          <Sticker tone="orange" icon="flame" size="lg" filled />
          <Sticker tone="orange" icon="flame" size="xl" filled />
          <Sticker tone="green" icon="check" variant="soft" size="lg" />
          <Sticker tone="yellow" icon="star" variant="soft" size="lg" />
          <Sticker icon="lock" variant="locked" size="lg" />
          <Sticker tone="accent" size="lg">
            3
          </Sticker>
        </Row>
      </Block>

      <Block title="Badges and chips">
        <Row label="Badge: soft">
          {TONES.map((tone) => (
            <Badge key={tone} tone={tone}>
              {tone}
            </Badge>
          ))}
        </Row>
        <Row label="Badge: solid">
          {TONES.map((tone) => (
            <Badge key={tone} tone={tone} variant="solid">
              {tone}
            </Badge>
          ))}
        </Row>
        <Row label="Badge: outline, icons, small">
          <Badge variant="outline">Outline</Badge>
          <Badge tone="green" icon="check">
            Complete
          </Badge>
          <Badge tone="yellow" icon="bolt">
            +120 XP
          </Badge>
          <Badge tone="orange" icon="flame">
            7 days
          </Badge>
          <Badge tone="neutral" icon="lock">
            Locked
          </Badge>
          <Badge tone="accent" size="sm">
            New
          </Badge>
          <Badge tone="red" size="sm" variant="solid">
            3
          </Badge>
        </Row>
        <Row label="Chips (selectable)">
          {['all', 'first layer', 'second layer', 'last layer'].map((value) => (
            <Chip key={value} selected={chip === value} onClick={() => setChip(value)}>
              {value[0].toUpperCase() + value.slice(1)}
            </Chip>
          ))}
          <Chip icon="star">With icon</Chip>
          <Chip disabled>Disabled</Chip>
        </Row>
      </Block>

      <Block title="Cards">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <p className="eyebrow">Raised</p>
            <p className="mt-1 text-base text-ink">The default surface.</p>
          </Card>
          <Card variant="flat">
            <p className="eyebrow">Flat</p>
            <p className="mt-1 text-base text-ink">Border, no shadow.</p>
          </Card>
          <Card variant="inset">
            <p className="eyebrow">Inset</p>
            <p className="mt-1 text-base text-ink">Sunk into the page.</p>
          </Card>
          <Card variant="outline">
            <p className="eyebrow">Outline</p>
            <p className="mt-1 text-base text-ink">Empty or optional.</p>
          </Card>
          <CardLink to="/kitchen-sink" className="sm:col-span-2">
            <div className="flex items-center gap-4">
              <Sticker tone="blue" icon="notation" size="lg" />
              <div className="min-w-0 flex-1">
                <h3 className="text-lg text-ink">CardLink — the whole card is a link</h3>
                <p className="text-base text-ink-muted">Lifts on hover, squeezes on press.</p>
              </div>
              <Icon name="chevronRight" className="text-ink-faint" />
            </div>
          </CardLink>
          <Card interactive className="sm:col-span-2" tabIndex={0}>
            <div className="flex items-center gap-4">
              <ProgressRing label="Stage progress" value={0.66} tone="green" size={56}>
                <span className="num text-sm font-extrabold text-ink">66%</span>
              </ProgressRing>
              <div>
                <h3 className="text-lg text-ink">Interactive card</h3>
                <p className="text-base text-ink-muted">Any card can opt in.</p>
              </div>
            </div>
          </Card>
        </div>
      </Block>

      <Block title="Progress">
        <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
          <ProgressBar label="Level 2 · Twister" value={xp} max={200} tone="yellow" showLabel valueText={`${xp} / 200 XP`} />
          <ProgressBar label="Stages" value={3} max={8} segments={8} tone="green" showLabel />
          <ProgressBar label="Small" value={0.35} size="sm" />
          <ProgressBar label="Large, orange" value={0.8} size="lg" tone="orange" />
          <ProgressBar label="Empty" value={0} />
          <ProgressBar label="Full, segmented, large" value={5} max={5} segments={5} size="lg" tone="accent" />
        </div>
        <Row label="Rings" className="mt-6 gap-5">
          <ProgressRing label="Empty" value={0} size={72}>
            <span className="num font-display text-xl font-extrabold text-ink">1</span>
          </ProgressRing>
          <ProgressRing label="Level" value={xp / 200} size={72} tone="yellow">
            <span className="num font-display text-xl font-extrabold text-ink">2</span>
          </ProgressRing>
          <ProgressRing label="Done" value={1} size={72} tone="green">
            <Icon name="check" size={26} weight={3} className="text-cube-green-text" />
          </ProgressRing>
          <ProgressRing label="Big" value={0.42} size={112} thickness={11} tone="accent">
            <span className="text-center">
              <span className="num block font-display text-2xl leading-7 font-extrabold text-ink">42%</span>
              <span className="block text-2xs font-bold text-ink-muted">accuracy</span>
            </span>
          </ProgressRing>
          <ProgressRing label="Tiny" value={0.6} size={32} thickness={4} tone="orange" />
          <Button variant="secondary" size="sm" iconLeft="plus" onClick={() => setXp((v) => (v >= 200 ? 20 : v + 30))}>
            Add XP
          </Button>
          <span className="font-display text-3xl font-extrabold text-ink">
            <AnimatedNumber value={xp} />
          </span>
        </Row>
      </Block>

      <Block title="Stat tiles">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile label="Streak" value={7} unit="days" icon="flame" tone="orange" hint="Best: 12 days" />
          <StatTile label="Total XP" value="1,240" unit="XP" icon="bolt" tone="yellow" hint="Level 5" />
          <StatTile label="Best time" value="1:42.08" icon="timer" tone="green" hint="12 solves" />
          <StatTile label="Badges" value={`9/${BADGES.length}`} icon="medal" tone="blue" />
        </div>
        <Card className="mt-4 grid gap-5 sm:grid-cols-3">
          <StatTile variant="bare" label="ao5" value="2:01.33" />
          <StatTile variant="bare" label="ao12" value="2:14.90" />
          <StatTile variant="bare" label="Solves" value={48} hint="This week: 9" />
        </Card>
      </Block>

      <Block title="Selection controls">
        <div className="grid gap-x-10 gap-y-2 md:grid-cols-2">
          <div className="min-w-0">
            <Row label="Segmented control">
              <SegmentedControl
                ariaLabel="Theme example"
                value={segment}
                onChange={setSegment}
                items={[
                  { value: 'light', label: 'Light', icon: 'sun' },
                  { value: 'dark', label: 'Dark', icon: 'moon' },
                  { value: 'system', label: 'Auto', icon: 'monitor' },
                ]}
              />
            </Row>
            <Row label="Small, icon only · with a disabled option">
              <SegmentedControl
                ariaLabel="Icon example"
                size="sm"
                iconOnly
                value={segment}
                onChange={setSegment}
                items={[
                  { value: 'light', label: 'Light', icon: 'sun' },
                  { value: 'dark', label: 'Dark', icon: 'moon' },
                  { value: 'system', label: 'Auto', icon: 'monitor' },
                ]}
              />
              <SegmentedControl
                ariaLabel="Disabled example"
                size="sm"
                value="a"
                onChange={() => {}}
                items={[
                  { value: 'a', label: 'Beginner' },
                  { value: 'b', label: 'Shortest', disabled: true },
                ]}
              />
            </Row>
            <Row label="Tabs">
              <div className="w-full">
                <Tabs
                  idBase="ks"
                  ariaLabel="Example tabs"
                  value={tab}
                  onChange={setTab}
                  items={[
                    { value: 'stats', label: 'Stats', icon: 'trophy' },
                    { value: 'history', label: 'History', icon: 'calendar' },
                    { value: 'badges', label: 'Badges', icon: 'medal' },
                    { value: 'off', label: 'Disabled', disabled: true },
                  ]}
                />
                <TabPanel idBase="ks" value={tab} className="rounded-b-md p-3 text-base text-ink-muted">
                  Panel for “{tab}”.
                </TabPanel>
              </div>
            </Row>
          </div>
          <div className="min-w-0">
            <Row label="Toggles">
              <Toggle label="On example" checked={toggleA} onChange={setToggleA} />
              <Toggle label="Off example" checked={toggleB} onChange={setToggleB} />
              <Toggle label="Disabled on" checked onChange={() => {}} disabled />
              <Toggle label="Disabled off" checked={false} onChange={() => {}} disabled />
            </Row>
            <Card padding="none" className="mb-5 divide-y divide-line px-5">
              <Field label="Sound effects" labelId="ks-sound" hint="A labelled row from Settings.">
                <Toggle labelledBy="ks-sound" checked={toggleA} onChange={setToggleA} />
              </Field>
              <div className="py-4">
                <Slider label="Turn speed" min={0.5} max={2} step={0.25} value={slider} onChange={setSlider} formatValue={(v) => `${v}×`} ends={['Slow', 'Fast']} />
              </div>
            </Card>
            <Row label="Slider: bare, toned, disabled" className="flex-col items-stretch gap-0">
              <Slider aria-label="Bare slider" value={30} onChange={() => {}} />
              <Slider aria-label="Orange slider" value={70} onChange={() => {}} tone="orange" />
              <Slider aria-label="Disabled slider" value={50} onChange={() => {}} disabled />
            </Row>
          </div>
        </div>
      </Block>

      <Block title="Overlays and feedback">
        <Row label="Modal, sheet, toasts">
          <Button variant="secondary" onClick={() => setModal(true)}>
            Open modal
          </Button>
          <Button variant="secondary" onClick={() => setSheet(true)}>
            Open sheet
          </Button>
          <Button variant="secondary" onClick={() => toast({ title: 'Saved', description: 'Your cube is right where you left it.' })}>
            Plain toast
          </Button>
          <Button variant="secondary" onClick={() => toast({ title: '+120 XP', description: 'Lesson complete', tone: 'yellow', icon: 'bolt' })}>
            XP toast
          </Button>
          <Button
            variant="secondary"
            onClick={() => celebrate({ xpGained: 120, newBadges: [BADGES[1]], leveledUp: true, level: 2, streak: 3, streakExtended: true, dailyCompleted: null })}
          >
            Level up + badge
          </Button>
          <Button variant="secondary" data-testid="ks-tick" onClick={(event) => celebration.tick(event.currentTarget)}>
            Tick
          </Button>
          <Button
            variant="secondary"
            data-testid="ks-moment"
            onClick={() => celebration.moment({ eyebrow: 'Stage learned', title: 'White cross', subtitle: 'Stage 2 of 8 · the first layer is next', badge: BADGES[2], xp: 120 })}
          >
            Moment
          </Button>
          <Button
            variant="secondary"
            data-testid="ks-milestone"
            onClick={() =>
              celebration.milestone({ eyebrow: 'First full solve', title: 'You solved the cube', subtitle: 'Scrambled to solved, every move yours.', badge: BADGES.find((b) => b.id === 'first-solve'), badges: BADGES.filter((b) => b.id === 'stage-yellow-corners-orient'), xp: 340, action: { label: 'Time a solve', to: '/timer' } })
            }
          >
            Milestone
          </Button>
          <Button variant="secondary" onClick={() => toast({ title: 'Not quite', description: 'That edge is flipped. Try again.', tone: 'red', icon: 'alert' })}>
            Error toast
          </Button>
        </Row>
        <Row label="Sounds (after your first tap)">
          {SOUND_NAMES.map((name) => (
            <Button key={name} size="sm" variant="soft" iconLeft="volume" onClick={() => sound.play(name)}>
              {name}
            </Button>
          ))}
        </Row>
        <Row label="Tooltip (hover or focus) · Kbd">
          <Tooltip label="Tooltips are short and never essential">
            <Button variant="secondary">Hover me</Button>
          </Tooltip>
          <Tooltip label="Shown below" side="bottom">
            <Badge tone="accent" icon="info">
              Bottom
            </Badge>
          </Tooltip>
          <span className="flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
            Hold <Kbd>Space</Kbd> to start · <Kbd>R</Kbd> <Kbd>U</Kbd> <Kbd>Shift</Kbd>+<Kbd>R</Kbd> to turn · <Kbd>Esc</Kbd> to stop
          </span>
        </Row>
        <Row label="Static toast (as rendered)" className="flex-col items-start">
          <div className="flex w-full max-w-sm items-center gap-3 rounded-lg bg-surface py-2.5 pr-4 pl-2.5 shadow-pop ring-1 ring-line">
            <Sticker tone="yellow" icon="crown" />
            <div>
              <p className="font-display text-base font-bold text-ink">Level 2 — Twister</p>
              <p className="text-sm text-ink-muted">+120 XP took you up a level</p>
            </div>
          </div>
        </Row>
        <Modal
          open={modal}
          onClose={() => setModal(false)}
          title="Start a new scramble?"
          description="Your current cube will be replaced. You can undo this from the toolbar."
          media={<Sticker icon="shuffle" tone="accent" size="lg" />}
          footer={
            <>
              <Button variant="ghost" onClick={() => setModal(false)}>
                Cancel
              </Button>
              <Button onClick={() => setModal(false)} iconLeft="shuffle">
                Scramble
              </Button>
            </>
          }
        />
        <Sheet open={sheet} onClose={() => setSheet(false)} title="Pick a colour" description="Sheets slide up from the bottom edge.">
          <div className="flex flex-wrap gap-3 pb-2">
            {CUBE_COLORS.map((color) => (
              <CubeSwatch key={color} color={color} size="lg" showLetter selected={swatch === color} onClick={() => setSwatch(color)} />
            ))}
          </div>
        </Sheet>
      </Block>

      <Block title="Cube stage and illustrations" note="The stage is where the 3D cube mounts. Until then a still isometric cube stands in.">
        <div className="grid gap-4 md:grid-cols-2">
          <CubeStage
            className="aspect-[4/3]"
            topLeft={<Badge tone="neutral" variant="outline">Stage with overlays</Badge>}
            topRight={<IconButton icon="eye" label="Peek" size="sm" variant="secondary" />}
            bottomRight={<IconButton icon="restart" label="Reset view" size="sm" variant="secondary" />}
          />
          <CubeStage className="aspect-[4/3]" placeholder={SCRAMBLED_FACES} label="Scrambled cube" />
        </div>
        <Row label="IsoCube: 3×3, scrambled, 2×2, mark, ghost · Logo" className="mt-5 items-end gap-6">
          <IsoCube size={110} />
          <IsoCube size={110} {...SCRAMBLED_FACES} />
          <IsoCube size={80} n={2} top={['yellow', 'yellow', 'yellow', 'yellow']} front={['blue', 'blue', 'blue', 'blue']} right={['orange', 'orange', 'orange', 'orange']} />
          <IsoCube size={48} n={1} top={['yellow']} front={['blue']} right={['red']} />
          <IsoCube size={110} ghost />
          <Logo size={44} />
          <Logo size={24} />
        </Row>
      </Block>

      <Block title="Cube net" note="A flat, unfolded cube: U on top, L F R B in a row, D below. Read-only for previews; with onStickerClick every sticker is a button (arrow keys move across the net).">
        <CubeNetDemo />
      </Block>

      <Block title="Flags" note="FlagArt draws the real flag; FaceGrid is what it becomes on one cube face. All 21, with a hairline border so white flags read in both themes.">
        <FlagDemo />
      </Block>

      <Block title="Stage tracker" note="The one drawing of the journey (StageTracker): strip, list with summaries, vertical. Done · current · to do · locked · peeked.">
        <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
          <StageTracker items={TRACKER_DEMO} variant="strip" label="Demo strip" />
          <StageTracker items={TRACKER_DEMO.slice(0, 5)} variant="vertical" label="Demo vertical" />
          <StageTracker items={TRACKER_DEMO.slice(0, 4).map((item) => ({ ...item, summary: 'One line about this stage.', meta: item.state === 'done' ? '6 Nov' : undefined }))} variant="list" size="sm" label="Demo list" />
        </div>
      </Block>

      <Block title="Badge art" note="BadgeArt: shape by family, a cube motif, tier (white · yellow rim · gold). Locked badges are silhouettes.">
        <Row label="Every badge, earned, then locked">
          {BADGES.map((badge) => (
            <BadgeArt key={badge.id} badge={badge} size={56} title={badge.name} />
          ))}
        </Row>
        <Row label="Locked">
          {BADGES.slice(0, 12).map((badge) => (
            <BadgeArt key={badge.id} badge={badge} earned={false} size={56} title={badge.name} />
          ))}
        </Row>
      </Block>

      <Block title="Empty states">
        <div className="grid gap-4 md:grid-cols-2">
          <EmptyState icon="timer" tone="green" title="No solves yet" description="Your times will show up here after your first timed solve." action={<Button iconLeft="timer">Start the timer</Button>} />
          <EmptyState title="Nothing here yet" description="Without an icon, a ghost cube is drawn." />
        </div>
      </Block>

      <Block title="Badge catalogue" note={`${BADGES.length} badges from the progress store — unlocked and locked.`}>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {BADGES.map((badge, i) => {
            const unlocked = i % 3 !== 2
            return (
              <li key={badge.id} className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3">
                <Sticker tone={badge.color} icon={isIconName(badge.icon) ? badge.icon : 'medal'} variant={unlocked ? 'solid' : 'locked'} filled={unlocked && (badge.icon === 'flame' || badge.icon === 'star' || badge.icon === 'bolt')} />
                <div className="min-w-0">
                  <p className={cx('truncate font-display text-sm font-bold', unlocked ? 'text-ink' : 'text-ink-muted')}>{badge.name}</p>
                  <p className="line-clamp-2 text-xs leading-4 text-ink-muted">{badge.description}</p>
                </div>
              </li>
            )
          })}
        </ul>
      </Block>

      <Block title="Icons" note={`${ICON_NAMES.length} icons, 24px grid, 2px strokes.`}>
        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-9">
          {ICON_NAMES.map((name) => (
            <li key={name} className="flex flex-col items-center gap-1.5 rounded-md border border-line bg-surface px-1 py-3 text-ink">
              <Icon name={name} size={24} />
              <span className="w-full truncate text-center font-mono text-2xs text-ink-muted">{name}</span>
            </li>
          ))}
        </ul>
      </Block>
    </Page>
  )
}
