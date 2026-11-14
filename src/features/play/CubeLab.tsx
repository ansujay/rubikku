/**
 * Cube lab: every mode of the 3D cube on one page, for checking it by eye and for the e2e
 * tests. Open it at #/play?lab — it is not linked from anywhere.
 */
import { useMemo, useState } from 'react'
import { ALGORITHMS, applyAlg, BEGINNER_HOLD, COLORS, PATTERNS, SOLVED, stateFromAlg, type Color, type Move, type PieceId } from '../../cube'
import { Cube3D, MiniCube, useCubeController, type CubeHighlight } from '../../three'
import { Button, Card, Chip, CubeStage, Page, PageHeader, Reveal, Section } from '../../ui'

const ARROWS: Move[] = ['R', "U'", 'F2', 'L', "D'", 'B', 'M', 'r', 'x', "y'"]
const HIGHLIGHTS: { name: string; value: CubeHighlight | null }[] = [
  { name: 'None', value: null },
  { name: 'White-green edge (piece)', value: { pieces: ['UF' as PieceId] } },
  { name: 'Top-front slot', value: { slots: ['UF'] } },
  { name: 'White cross', value: { pieces: ['UF', 'UR', 'UB', 'UL', 'U'] as PieceId[], outline: false } },
  { name: 'One sticker', value: { facelets: [22] } },
]

export default function CubeLab() {
  const [painted, setPainted] = useState<(Color | null)[]>(() => {
    const colors: (Color | null)[] = new Array(54).fill(null)
    COLORS.forEach((color, face) => (colors[face * 9 + 4] = color))
    return colors
  })
  const [brush, setBrush] = useState<Color>('green')
  const [arrow, setArrow] = useState<Move | null>('R')
  const [highlight, setHighlight] = useState(1)
  const demo = useCubeController({ initial: applyAlg(SOLVED, "F R U R' U' F'") })
  const cards = useMemo(
    () => [
      ...ALGORITHMS.map((a) => ({ id: a.id, name: a.name, state: applyAlg(applyAlg(SOLVED, BEGINNER_HOLD), a.demo.setup), alg: a.demo.alg })),
      ...PATTERNS.map((p) => ({ id: p.id, name: p.name, state: SOLVED, alg: p.alg })),
    ],
    [],
  )

  return (
    <Page>
      <PageHeader title="Cube lab" lede="Every mode of the 3D cube, for checking by eye." />

      <Section title="Mini cubes" description="One shared WebGL context draws all of these. The first row plays on hover or tap; the rest loop while on screen.">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6" data-testid="minis">
          {cards.map((card, i) => (
            <Card key={card.id} variant="raised" padding="sm" className="flex flex-col items-center gap-1">
              <MiniCube state={card.state} alg={card.alg} play={i < 6 ? 'hover' : 'visible'} label={card.name} />
              <span className="w-full truncate text-center text-xs font-semibold text-ink-muted">{card.name}</span>
            </Card>
          ))}
          <Card variant="raised" padding="sm" className="flex flex-col items-center gap-1">
            <MiniCube state={stateFromAlg('R U F')} highlight={{ pieces: ['UF' as PieceId] }} label="Highlighted still" />
            <span className="text-xs font-semibold text-ink-muted">Highlight</span>
          </Card>
          <Card variant="raised" padding="sm" className="flex flex-col items-center gap-1">
            <MiniCube state={painted} size={96} label="Painted still" />
            <span className="text-xs font-semibold text-ink-muted">Painted</span>
          </Card>
        </div>
      </Section>

      <Reveal className="mt-8 grid gap-5 md:grid-cols-2">
        <Card variant="raised" padding="md" className="flex flex-col gap-3">
          <h2 className="text-lg text-ink">Paint surface</h2>
          <CubeStage label="Painted cube" className="aspect-square">
            <Cube3D
              state={painted}
              debugId="paint"
              onStickerClick={(facelet, info) => {
                if (info.kind === 'center') return
                setPainted((colors) => colors.map((c, i) => (i === facelet ? brush : c)))
              }}
            />
          </CubeStage>
          <div className="flex flex-wrap gap-1.5">
            {COLORS.map((color) => (
              <Chip key={color} selected={brush === color} onClick={() => setBrush(color)}>
                {color}
              </Chip>
            ))}
          </div>
        </Card>

        <Card variant="raised" padding="md" className="flex flex-col gap-3">
          <h2 className="text-lg text-ink">Playback only · highlight · arrows</h2>
          <CubeStage label="Demo cube" className="aspect-square">
            <Cube3D {...demo.bind} mode="playback" debugId="demo" highlight={HIGHLIGHTS[highlight].value} arrow={arrow} />
          </CubeStage>
          <div className="flex flex-wrap gap-1.5">
            {HIGHLIGHTS.map((h, i) => (
              <Chip key={h.name} selected={highlight === i} onClick={() => setHighlight(i)}>
                {h.name}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ARROWS.map((move) => (
              <Chip key={move} selected={arrow === move} onClick={() => setArrow(arrow === move ? null : move)}>
                {move}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => arrow && void demo.apply([arrow])}>
              Do the arrow move
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void demo.apply("F U R U' R' F'", { speed: 0.6 })}>
              Play slowly
            </Button>
            <Button size="sm" variant="ghost" onClick={() => demo.undo()}>
              Undo
            </Button>
          </div>
        </Card>
      </Reveal>
    </Page>
  )
}
