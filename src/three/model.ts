/**
 * CubeModel: the three.js objects of one cube, with no React in it.
 *
 * The whole cube is a handful of instanced meshes (bodies, stickers, hint "mirror" stickers,
 * highlight rings, marks on unpainted stickers) — a few draw calls however it is turned.
 * Nothing is ever parented to a rotating group: every frame the instance matrices are rebuilt
 * from the fixed slot positions plus the layer angles about one axis, so the picture can never
 * drift away from the engine state.
 *
 * The same model is used by the big interactive <Cube3D> and by the shared mini renderer.
 */
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { FACE_NORMAL, FACELETS, FACES, isRotation, moveKind, moveLayer, SLOT_POSITION, SLOTS, type Axis, type Color, type Face, type Move } from '../cube'
import { AXIS_INDEX } from './turns'

export type StickerColors = ArrayLike<Color | null | undefined>

export interface ModelTheme {
  body: string
  stickers: Record<Color, string>
  /** Unpainted sticker: a dark, sunken slot… */
  blank: string
  /** …with a dashed ring in this colour, so it is never mistaken for white. */
  blankMark: string
  /** Highlight ring colour. */
  ring: string
  /** Move-arrow fill, its inner (light) stroke and its outer (dark) outline. */
  arrow: string
  arrowStroke: string
  arrowOutline: string
  /**
   * Dimmed stickers keep their hue: saturation is scaled by `dimSaturation` and lightness moves
   * `dimMix` of the way towards the lightness of `dimNeutral` (the stage's neutral).
   */
  dimNeutral: string
  dimMix: number
  dimSaturation: number
  /** White has no hue to keep: dimmed, it becomes this quiet grey. */
  dimWhite: string
  /** The `dimTo: 'grey'` highlight: every dimmed sticker becomes this neutral grey (map minis). */
  dimGrey: string
  /**
   * While anything is dimmed, the lit stickers (other than the centres) are this much brighter
   * (0.12 = +12%), so the lit piece "glows" a little without a glow effect. 0 = off.
   */
  litBoost?: number
}

const BODY_SIZE = 0.985
const BODY_RADIUS = 0.085
const STICKER_SIZE = 0.835
const STICKER_RADIUS = 0.115
const STICKER_BEVEL = 0.014
const STICKER_DEPTH = 0.012
const STICKER_LIFT = BODY_SIZE / 2 - 0.004
/** How far an unpainted sticker sinks into the body. */
const BLANK_SINK = 0.03
/** How far the hint ("mirror") stickers float off the cube. */
export const HINT_DISTANCE = 2.05
/**
 * The mirror faces are drawn smaller than the cube's own faces, so they fit in the stage's spare
 * space round the cube and the camera hardly has to pull back (the cube stays big).
 */
export const HINT_SCALE = 0.62
/**
 * Where each mirror slides to (cube units, in the cube's frame), so that from the usual
 * three-quarter view it sits clear of the cube instead of behind it: the back mirror up and to
 * the right, the left one up and towards the front. The bottom one is clear already.
 */
const HINT_OFFSET: Partial<Record<Face, readonly [number, number, number]>> = {
  B: [1.05, 0.75, 0],
  L: [0, 0.45, 0.32],
}

const AXIS_VECTORS: Record<Axis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
}

function roundedSquare(size: number, radius: number): THREE.Shape {
  const h = size / 2
  const r = Math.min(radius, h)
  const shape = new THREE.Shape()
  shape.moveTo(-h + r, -h)
  shape.lineTo(h - r, -h)
  shape.absarc(h - r, -h + r, r, -Math.PI / 2, 0, false)
  shape.lineTo(h, h - r)
  shape.absarc(h - r, h - r, r, 0, Math.PI / 2, false)
  shape.lineTo(-h + r, h)
  shape.absarc(-h + r, h - r, r, Math.PI / 2, Math.PI, false)
  shape.lineTo(-h, -h + r)
  shape.absarc(-h + r, -h + r, r, Math.PI, Math.PI * 1.5, false)
  return shape
}

function roundedSquareHole(size: number, radius: number): THREE.Path {
  const path = new THREE.Path()
  const h = size / 2
  const r = Math.min(radius, h)
  // Wound the other way round, as holes must be.
  path.moveTo(-h + r, -h)
  path.absarc(-h + r, -h + r, r, Math.PI * 1.5, Math.PI, true)
  path.lineTo(-h, h - r)
  path.absarc(-h + r, h - r, r, Math.PI, Math.PI / 2, true)
  path.lineTo(h - r, h)
  path.absarc(h - r, h - r, r, Math.PI / 2, 0, true)
  path.lineTo(h, -h + r)
  path.absarc(h - r, -h + r, r, 0, -Math.PI / 2, true)
  path.lineTo(-h + r, -h)
  return path
}

function stickerGeometry(detail: number): THREE.BufferGeometry {
  const inner = STICKER_SIZE - STICKER_BEVEL * 2
  const geometry = new THREE.ExtrudeGeometry(roundedSquare(inner, STICKER_RADIUS - STICKER_BEVEL), {
    depth: STICKER_DEPTH,
    bevelEnabled: true,
    bevelThickness: STICKER_BEVEL,
    bevelSize: STICKER_BEVEL,
    bevelSegments: detail > 1 ? 3 : 2,
    curveSegments: detail > 1 ? 6 : 4,
  })
  geometry.translate(0, 0, STICKER_BEVEL)
  return geometry
}

/** The mark on an unpainted sticker: a dashed rounded ring, white on transparent (tinted by the material). */
function blankMarkTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.strokeStyle = '#ffffff'
  ctx.fillStyle = '#ffffff'
  ctx.lineWidth = 7
  ctx.setLineDash([13, 10])
  const inset = 16
  const r = 18
  ctx.beginPath()
  ctx.roundRect(inset, inset, size - inset * 2, size - inset * 2, r)
  ctx.stroke()
  ctx.setLineDash([])
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

const scratchMatrix = new THREE.Matrix4()
const scratchColor = new THREE.Color()
const WHITE = new THREE.Color('#ffffff')
const Z_AXIS = new THREE.Vector3(0, 0, 1)

function faceMatrix(face: Face, position: readonly number[], lift: number): THREE.Matrix4 {
  const n = FACE_NORMAL[face]
  const normal = new THREE.Vector3(n[0], n[1], n[2])
  const quaternion = new THREE.Quaternion().setFromUnitVectors(Z_AXIS, normal)
  const at = new THREE.Vector3(position[0], position[1], position[2]).addScaledVector(normal, lift)
  return new THREE.Matrix4().compose(at, quaternion, new THREE.Vector3(1, 1, 1))
}

/** A mirror sticker: on its face's plane pushed out by `lift`, shrunk towards the face's centre by `scale`. */
function hintMatrix(face: Face, position: readonly number[], lift: number, scale: number): THREE.Matrix4 {
  const n = FACE_NORMAL[face]
  const normal = new THREE.Vector3(n[0], n[1], n[2])
  const quaternion = new THREE.Quaternion().setFromUnitVectors(Z_AXIS, normal)
  const p = new THREE.Vector3(position[0], position[1], position[2])
  const along = p.dot(normal)
  const at = p.addScaledVector(normal, -along).multiplyScalar(scale).addScaledVector(normal, along + lift)
  const offset = HINT_OFFSET[face]
  if (offset) at.add(new THREE.Vector3(offset[0], offset[1], offset[2]))
  return new THREE.Matrix4().compose(at, quaternion, new THREE.Vector3(scale, scale, 1))
}

/**
 * A dimmed version of a sticker colour that is still clearly that colour: same hue, less
 * chroma, lightness pulled towards the stage's neutral (pastel by day, a deep tint at night).
 */
export function dimmedColor(hex: string, theme: Pick<ModelTheme, 'dimNeutral' | 'dimMix' | 'dimSaturation' | 'dimWhite'>): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 }
  new THREE.Color(hex).getHSL(hsl, THREE.SRGBColorSpace)
  if (hsl.s < 0.4 && hsl.l > 0.85) return new THREE.Color(theme.dimWhite)
  const neutral = { h: 0, s: 0, l: 0 }
  new THREE.Color(theme.dimNeutral).getHSL(neutral, THREE.SRGBColorSpace)
  const l = hsl.l + (neutral.l - hsl.l) * theme.dimMix
  return new THREE.Color().setHSL(hsl.h, hsl.s * theme.dimSaturation, l, THREE.SRGBColorSpace)
}

export interface CubeModelOptions {
  /** 1 = cheap (minis), 2 = full. */
  detail?: 1 | 2
}

export class CubeModel {
  readonly group = new THREE.Group()

  private readonly bodyGeometry: THREE.BufferGeometry
  private readonly stickerGeo: THREE.BufferGeometry
  private readonly hintGeometry: THREE.BufferGeometry
  private readonly ringGeometry: THREE.BufferGeometry
  private readonly markGeometry: THREE.BufferGeometry
  readonly bodyMaterial: THREE.MeshStandardMaterial
  readonly stickerMaterial: THREE.MeshStandardMaterial
  private readonly hintMaterial: THREE.MeshBasicMaterial
  private readonly ringMaterial: THREE.MeshBasicMaterial
  private readonly markMaterial: THREE.MeshBasicMaterial
  private readonly bodies: THREE.InstancedMesh
  private readonly stickers: THREE.InstancedMesh
  private readonly hints: THREE.InstancedMesh
  private readonly rings: THREE.InstancedMesh
  private readonly marks: THREE.InstancedMesh

  private readonly bodyRest: THREE.Matrix4[]
  private readonly stickerRest: THREE.Matrix4[]
  private readonly stickerSunk: THREE.Matrix4[]
  private readonly hintRest: THREE.Matrix4[]
  private readonly ringRest: THREE.Matrix4[]
  private readonly markRest: THREE.Matrix4[]

  private theme: ModelTheme
  private palette = new Map<Color | 'blank', THREE.Color>()
  private dimPalette = new Map<Color | 'blank', THREE.Color>()
  /** Dim to one neutral grey instead of a tint of each colour (see `setDimGrey`). */
  private dimGrey = false
  private greyColor = new THREE.Color()
  private colors: (Color | null)[] = new Array(54).fill(null)
  /** Per-facelet light level: 1 = lit, 0 = dimmed. */
  private levels = new Float32Array(54).fill(1)
  /** Per-facelet extra shine (celebrations), 0…1. */
  private glow = new Float32Array(54)
  private glowing = false
  private ringFacelets: number[] = []
  private blankFacelets: number[] = []

  private turnAxis: Axis | null = null
  /** Angle of each layer (coordinates -1, 0, 1) about `turnAxis`. */
  private layerAngles: [number, number, number] = [0, 0, 0]
  private layerRotations = [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()]

  private arrow: THREE.Group | null = null
  private arrowMaterials: THREE.MeshBasicMaterial[] = []
  private arrowKey = ''

  constructor(theme: ModelTheme, options: CubeModelOptions = {}) {
    const detail = options.detail ?? 2
    this.theme = theme

    this.bodyGeometry = new RoundedBoxGeometry(BODY_SIZE, BODY_SIZE, BODY_SIZE, detail > 1 ? 4 : 2, BODY_RADIUS)
    this.stickerGeo = stickerGeometry(detail)
    this.hintGeometry = new THREE.ShapeGeometry(roundedSquare(0.8, 0.12), 4)
    const ringShape = roundedSquare(0.99, 0.16)
    ringShape.holes.push(roundedSquareHole(STICKER_SIZE + 0.012, STICKER_RADIUS + 0.006))
    this.ringGeometry = new THREE.ShapeGeometry(ringShape, 5)
    this.markGeometry = new THREE.PlaneGeometry(STICKER_SIZE * 0.92, STICKER_SIZE * 0.92)

    this.bodyMaterial = new THREE.MeshStandardMaterial({ color: theme.body, roughness: 0.3, metalness: 0, envMapIntensity: 0.62 })
    // A little more sheen than flat paint: the stickers catch the studio light along their bevels.
    this.stickerMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.42, metalness: 0, envMapIntensity: 0.2 })
    this.hintMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.BackSide, transparent: true, opacity: 0, toneMapped: false })
    this.ringMaterial = new THREE.MeshBasicMaterial({
      color: theme.ring,
      transparent: true,
      opacity: 0,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
    this.markMaterial = new THREE.MeshBasicMaterial({
      color: theme.blankMark,
      map: blankMarkTexture(),
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })

    this.bodyRest = SLOTS.map((slot) => {
      const p = SLOT_POSITION[slot]
      return new THREE.Matrix4().makeTranslation(p[0], p[1], p[2])
    })
    this.stickerRest = FACELETS.map((f) => faceMatrix(f.face, f.position, STICKER_LIFT))
    this.stickerSunk = FACELETS.map((f) => faceMatrix(f.face, f.position, STICKER_LIFT - BLANK_SINK))
    this.hintRest = FACELETS.map((f) => hintMatrix(f.face, f.position, 0.5 + HINT_DISTANCE, HINT_SCALE))
    this.ringRest = FACELETS.map((f) => faceMatrix(f.face, f.position, BODY_SIZE / 2 + 0.003))
    this.markRest = FACELETS.map((f) => faceMatrix(f.face, f.position, STICKER_LIFT - BLANK_SINK + STICKER_DEPTH + STICKER_BEVEL * 2 + 0.002))

    this.bodies = new THREE.InstancedMesh(this.bodyGeometry, this.bodyMaterial, 26)
    this.stickers = new THREE.InstancedMesh(this.stickerGeo, this.stickerMaterial, 54)
    this.hints = new THREE.InstancedMesh(this.hintGeometry, this.hintMaterial, 54)
    this.rings = new THREE.InstancedMesh(this.ringGeometry, this.ringMaterial, 54)
    this.marks = new THREE.InstancedMesh(this.markGeometry, this.markMaterial, 54)
    for (const mesh of [this.bodies, this.stickers, this.hints, this.rings, this.marks]) {
      mesh.frustumCulled = false
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    }
    this.hints.visible = false
    this.rings.visible = false
    this.rings.count = 0
    this.marks.visible = false
    this.marks.count = 0
    this.rings.renderOrder = 2
    this.hints.renderOrder = 1
    this.marks.renderOrder = 1
    this.group.add(this.bodies, this.stickers, this.hints, this.rings, this.marks)

    this.setTheme(theme)
    this.writeMatrices()
  }

  /** Reflections for the plastic. Set on the materials (not the scene) so each keeps its own strength. */
  setEnvironment(texture: THREE.Texture | null): void {
    this.bodyMaterial.envMap = texture
    this.stickerMaterial.envMap = texture
    this.bodyMaterial.needsUpdate = true
    this.stickerMaterial.needsUpdate = true
  }

  // ───────── colours ─────────

  setTheme(theme: ModelTheme): void {
    this.theme = theme
    this.bodyMaterial.color.set(theme.body)
    this.ringMaterial.color.set(theme.ring)
    this.markMaterial.color.set(theme.blankMark)
    this.palette.clear()
    this.dimPalette.clear()
    this.greyColor.set(theme.dimGrey)
    const entries: [Color | 'blank', string][] = [...(Object.entries(theme.stickers) as [Color, string][]), ['blank', theme.blank]]
    for (const [name, hex] of entries) {
      this.palette.set(name, new THREE.Color(hex))
      this.dimPalette.set(name, name === 'blank' ? new THREE.Color(hex) : dimmedColor(hex, theme))
    }
    for (const material of this.arrowMaterials) material.color.set(this.arrowColor(material.userData.part as ArrowPart))
    this.writeColors()
  }

  private arrowColor(part: ArrowPart): string {
    return part === 'outline' ? this.theme.arrowOutline : part === 'stroke' ? this.theme.arrowStroke : this.theme.arrow
  }

  /** Paint the 54 stickers (Kociemba facelet order). Null / undefined = unpainted. */
  setColors(colors: StickerColors): void {
    const blanks: number[] = []
    for (let i = 0; i < 54; i++) {
      this.colors[i] = colors[i] ?? null
      if (this.colors[i] === null) blanks.push(i)
    }
    const blanksChanged = blanks.length !== this.blankFacelets.length || blanks.some((b, k) => b !== this.blankFacelets[k])
    this.blankFacelets = blanks
    this.marks.count = blanks.length
    this.marks.visible = blanks.length > 0
    this.writeColors()
    if (blanksChanged) this.writeMatrices()
  }

  /** Per-facelet light levels (1 lit … 0 dimmed), 54 long. */
  setLevels(levels: ArrayLike<number>): void {
    for (let i = 0; i < 54; i++) this.levels[i] = levels[i]
    this.writeColors()
  }

  /** Dimmed stickers become one neutral grey (true) or keep a tint of their colour (false). */
  setDimGrey(on: boolean): void {
    if (on === this.dimGrey) return
    this.dimGrey = on
    this.writeColors()
  }

  /** Per-facelet extra shine (0…1), for celebrations. Null clears it. */
  setGlow(glow: ArrayLike<number> | null): void {
    this.glowing = glow !== null
    for (let i = 0; i < 54; i++) this.glow[i] = glow ? glow[i] : 0
    this.writeColors()
  }

  private writeColors(): void {
    let dimming = false
    for (let i = 0; i < 54; i++) if (this.levels[i] < 0.999) dimming = true
    const boost = dimming && !this.dimGrey ? (this.theme.litBoost ?? 0) : 0
    for (let i = 0; i < 54; i++) {
      const key = this.colors[i] ?? 'blank'
      const lit = this.palette.get(key)!
      const level = this.levels[i]
      if (level >= 0.999) {
        scratchColor.copy(lit)
        if (boost > 0 && i % 9 !== 4 && key !== 'blank') scratchColor.multiplyScalar(1 + boost)
      } else scratchColor.copy(this.dimGrey && key !== 'blank' ? this.greyColor : this.dimPalette.get(key)!).lerp(lit, level)
      if (this.glowing && this.glow[i] > 0) scratchColor.lerp(WHITE, Math.min(1, this.glow[i]) * 0.55)
      this.stickers.setColorAt(i, scratchColor)
      // The mirrors show the same picture as the cube, dimmed the same way.
      this.hints.setColorAt(i, scratchColor)
    }
    this.stickers.instanceColor!.needsUpdate = true
    this.hints.instanceColor!.needsUpdate = true
  }

  // ───────── turning ─────────

  /** Rotate the given layers by `angle` radians about `axis` (right-hand). Null axis = at rest. */
  setTurn(axis: Axis | null, layers: readonly number[] = [], angle = 0): void {
    if (!axis || angle === 0 || layers.length === 0) {
      this.setLayerAngles(null)
      return
    }
    this.setLayerAngles(axis, [layers.includes(-1) ? angle : 0, layers.includes(0) ? angle : 0, layers.includes(1) ? angle : 0])
  }

  /** Each of the three layers along `axis` at its own angle (the celebration ripple). Null = at rest. */
  setLayerAngles(axis: Axis | null, angles: readonly [number, number, number] = [0, 0, 0]): void {
    const moving = axis !== null && angles.some((a) => a !== 0)
    this.turnAxis = moving ? axis : null
    this.layerAngles = moving ? [angles[0], angles[1], angles[2]] : [0, 0, 0]
    if (moving) for (let k = 0; k < 3; k++) this.layerRotations[k].makeRotationAxis(AXIS_VECTORS[axis!], this.layerAngles[k])
    this.writeMatrices()
  }

  private writeMatrices(): void {
    const axis = this.turnAxis
    const index = axis ? AXIS_INDEX[axis] : 0
    const place = (mesh: THREE.InstancedMesh, i: number, rest: THREE.Matrix4, coordinate: number) => {
      const k = Math.round(coordinate) + 1
      if (axis && this.layerAngles[k] !== 0) mesh.setMatrixAt(i, scratchMatrix.multiplyMatrices(this.layerRotations[k], rest))
      else mesh.setMatrixAt(i, rest)
    }
    for (let i = 0; i < 26; i++) place(this.bodies, i, this.bodyRest[i], SLOT_POSITION[SLOTS[i]][index])
    for (let i = 0; i < 54; i++) {
      const coordinate = FACELETS[i].position[index]
      place(this.stickers, i, this.colors[i] === null ? this.stickerSunk[i] : this.stickerRest[i], coordinate)
      if (this.hints.visible) place(this.hints, i, this.hintRest[i], coordinate)
    }
    for (let k = 0; k < this.ringFacelets.length; k++) {
      const i = this.ringFacelets[k]
      place(this.rings, k, this.ringRest[i], FACELETS[i].position[index])
    }
    for (let k = 0; k < this.blankFacelets.length; k++) {
      const i = this.blankFacelets[k]
      place(this.marks, k, this.markRest[i], FACELETS[i].position[index])
    }
    this.bodies.instanceMatrix.needsUpdate = true
    this.stickers.instanceMatrix.needsUpdate = true
    this.hints.instanceMatrix.needsUpdate = true
    this.rings.instanceMatrix.needsUpdate = true
    this.marks.instanceMatrix.needsUpdate = true
  }

  // ───────── teaching aids ─────────

  /** Outline these facelets with a ring. */
  setRingFacelets(facelets: readonly number[]): void {
    this.ringFacelets = facelets.slice(0, 54)
    this.rings.count = this.ringFacelets.length
    this.writeMatrices()
  }

  setRingOpacity(opacity: number): void {
    this.ringMaterial.opacity = opacity
    this.rings.visible = opacity > 0.003 && this.ringFacelets.length > 0
  }

  /** Opacity of the floating copies of the faces that point away from the camera. */
  setHintOpacity(opacity: number): void {
    const visible = opacity > 0.003
    const changed = visible !== this.hints.visible
    this.hints.visible = visible
    this.hintMaterial.opacity = opacity
    if (changed && visible) this.writeMatrices()
  }

  /**
   * Show a curved arrow for a move: a narrow ribbon that runs round the turning layer on the
   * cube's surface, from `start` (a distance along the layer's ring, see `arrowRing`) for the
   * arrow's length, with its head the way the layer turns. Pick `start` with `bestArrowStart`
   * so it is on the visible side and clear of the highlighted pieces; `length` overrides the
   * ring's default length (a shorter arrow that fits beside a lit piece). Null removes it.
   */
  setArrow(move: Move | null, start = 0, length?: number, style: ArrowStyle = 'layer'): void {
    const key = move ? `${move}|${start.toFixed(3)}|${length?.toFixed(3) ?? ''}|${style}` : ''
    if (key === this.arrowKey) return
    this.arrowKey = key
    if (this.arrow) {
      this.group.remove(this.arrow)
      this.arrow.traverse((child) => (child as THREE.Mesh).geometry?.dispose())
      this.arrow = null
    }
    if (!move) return
    if (this.arrowMaterials.length === 0) {
      this.arrowMaterials = (['outline', 'stroke', 'fill'] as const).map((part) => {
        const material = new THREE.MeshBasicMaterial({
          color: this.arrowColor(part),
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          toneMapped: false,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -4,
          polygonOffsetUnits: -4,
        })
        material.userData.part = part
        return material
      })
    }
    const ring = arrowRing(move, style)
    if (length !== undefined && length > 0) ring.length = length
    const group = new THREE.Group()
    ARROW_PARTS.forEach((part, k) => {
      const mesh = new THREE.Mesh(arrowGeometry(ring, start, part.grow, part.lift), this.arrowMaterials[k])
      mesh.renderOrder = 3 + k
      group.add(mesh)
    })
    this.arrow = group
    this.group.add(group)
  }

  setArrowOpacity(opacity: number): void {
    for (const material of this.arrowMaterials) material.opacity = opacity
    if (this.arrow) this.arrow.visible = opacity > 0.003
  }

  dispose(): void {
    this.setArrow(null)
    for (const material of this.arrowMaterials) material.dispose()
    this.bodyGeometry.dispose()
    this.stickerGeo.dispose()
    this.hintGeometry.dispose()
    this.ringGeometry.dispose()
    this.markGeometry.dispose()
    this.bodyMaterial.dispose()
    this.stickerMaterial.dispose()
    this.hintMaterial.dispose()
    this.ringMaterial.dispose()
    this.markMaterial.map?.dispose()
    this.markMaterial.dispose()
    for (const mesh of [this.bodies, this.stickers, this.hints, this.rings, this.marks]) mesh.dispose()
  }
}

// ───────────────────────── Move arrow ─────────────────────────

type ArrowPart = 'outline' | 'stroke' | 'fill'
/** Three stacked ribbons: a dark outline, a white stroke, the blue fill (each a touch higher). */
const ARROW_PARTS: { part: ArrowPart; grow: number; lift: number }[] = [
  { part: 'outline', grow: 0.075, lift: 0 },
  { part: 'stroke', grow: 0.05, lift: 0.004 },
  { part: 'fill', grow: 0, lift: 0.008 },
]
/** Half the width of the blue shaft. With its strokes the arrow is 40% of a sticker wide. */
const SHAFT_HALF = 0.093
const HEAD_HALF = 0.25
const HEAD_LENGTH = 0.46

/** In-plane basis for each axis: u × v = axis, so a positive turn goes from u towards v. */
const PLANE_BASIS: Record<Axis, [THREE.Vector3, THREE.Vector3]> = {
  x: [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)],
  y: [new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)],
  z: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)],
}

/**
 * The loop an arrow can run along for a move: a rounded square round the turning layer(s),
 * just off the cube's surface. Whole-cube rotations get one ring round the middle, floating a
 * little further out; wide moves one ring between their two layers.
 */
export interface ArrowRing {
  axis: Axis
  /** Where along the axis the ribbon's centre line sits. */
  coordinate: number
  /** Half-size of the rounded square in the plane of the turn. */
  half: number
  /** Corner radius. */
  bend: number
  /** Length of the arrow along the ring. */
  length: number
  /** The arrow head points the positive way round (u → v). */
  positive: boolean
  double: boolean
  /** Rotations draw a wider, floating arrow. */
  scale: number
  /**
   * A circle ON the turning face (round its centre, radius `half`, just off the stickers),
   * instead of the strip round the layer's edge: the face itself turning, clockwise or not.
   * `coordinate` is then the face's plane. Only for single-face moves (see `ArrowStyle`).
   */
  face?: boolean
}

/**
 * How a move's arrow is drawn: `'layer'` (default) — a strip round the turning layer, on the
 * side that faces the camera (the layer is the point: lessons); `'face'` — a curved arc on the
 * turning face itself, round its centre (a letter is a face: Notation). Wide moves, slices and
 * rotations are always drawn round their layer.
 */
export type ArrowStyle = 'layer' | 'face'

/** True when `move` can be drawn as an arc on its face (U D L R F B, any amount). */
export const hasFaceArrow = (move: Move): boolean => moveKind(move) === 'face'

/** Radius of the face arc: inside the ring of eight outer stickers, round the centre one. */
const FACE_ARC_RADIUS = 0.92

export function arrowRing(move: Move, style: ArrowStyle = 'layer'): ArrowRing {
  const layer = moveLayer(move)
  const rotation = isRotation(move)
  const double = Math.abs(layer.quarterTurns) === 2
  if (style === 'face' && hasFaceArrow(move)) {
    // The face's plane: its layer is at ±1, the stickers' surface at ±1.5.
    const outer = layer.layers[0] > 0 ? 1 : -1
    return {
      axis: layer.axis,
      coordinate: outer * (1.5 + 0.02),
      half: FACE_ARC_RADIUS,
      bend: 0,
      // Most of the way round (a double turn further), so the circling reads at a glance.
      length: FACE_ARC_RADIUS * (double ? 5.2 : 4.3),
      positive: layer.quarterTurns > 0,
      double,
      scale: 1,
      face: true,
    }
  }
  const coordinate = rotation ? 0 : layer.layers.reduce((sum, c) => sum + c, 0) / layer.layers.length
  const lift = rotation ? 0.24 : 0.058
  return {
    axis: layer.axis,
    coordinate,
    half: 1.5 + lift,
    bend: rotation ? 0.5 : 0.2,
    length: (double ? 4.3 : 3.2) + (rotation ? 0.9 : 0),
    positive: layer.quarterTurns > 0,
    double,
    scale: rotation ? 1.35 : 1,
  }
}

/** Total length of a ring. */
export function ringPerimeter(ring: Pick<ArrowRing, 'half' | 'bend' | 'face'>): number {
  if (ring.face) return 2 * Math.PI * ring.half
  return 4 * (2 * (ring.half - ring.bend) + (Math.PI / 2) * ring.bend)
}

/**
 * A point on the ring at distance `s` (wrapping), with its outward normal, in world space.
 * `across` moves it along the axis (the ribbon's width).
 */
export function ringPoint(ring: ArrowRing, s: number, across = 0, outward = 0, point = new THREE.Vector3(), normal = new THREE.Vector3()): { point: THREE.Vector3; normal: THREE.Vector3 } {
  if (ring.face) {
    // A circle in the face's plane: `across` widens it radially, `outward` lifts it off the face.
    const [u, v] = PLANE_BASIS[ring.axis]
    const a = AXIS_VECTORS[ring.axis]
    const side = Math.sign(ring.coordinate) || 1
    const angle = s / ring.half
    const r = ring.half + across
    point.set(0, 0, 0).addScaledVector(u, r * Math.cos(angle)).addScaledVector(v, r * Math.sin(angle)).addScaledVector(a, ring.coordinate + side * outward)
    normal.copy(a).multiplyScalar(side)
    return { point, normal }
  }
  const h = ring.half + outward
  const bend = ring.bend
  const straight = 2 * (ring.half - bend)
  const arc = (Math.PI / 2) * bend
  const side = straight + arc
  const perimeter = 4 * side
  const t = ((s % perimeter) + perimeter) % perimeter
  const k = Math.min(3, Math.floor(t / side))
  const r = t - k * side
  let x: number
  let y: number
  let nx: number
  let ny: number
  if (r < straight) {
    x = h
    y = -(ring.half - bend) + r
    nx = 1
    ny = 0
  } else {
    const angle = (r - straight) / bend
    nx = Math.cos(angle)
    ny = Math.sin(angle)
    x = ring.half - bend + (bend + outward) * nx
    y = ring.half - bend + (bend + outward) * ny
  }
  const cos = Math.round(Math.cos((k * Math.PI) / 2))
  const sin = Math.round(Math.sin((k * Math.PI) / 2))
  const pu = x * cos - y * sin
  const pv = x * sin + y * cos
  const qu = nx * cos - ny * sin
  const qv = nx * sin + ny * cos
  const [u, v] = PLANE_BASIS[ring.axis]
  const a = AXIS_VECTORS[ring.axis]
  point.set(0, 0, 0).addScaledVector(u, pu).addScaledVector(v, pv).addScaledVector(a, ring.coordinate + across)
  normal.set(0, 0, 0).addScaledVector(u, qu).addScaledVector(v, qv)
  return { point, normal }
}

/**
 * A flat ribbon with an arrowhead that hugs the cube along part of the ring: from `start` for
 * `ring.length`, the head at the far end for a positive turn, at `start` for a negative one.
 * `grow` widens it all round (for the strokes underneath).
 */
function arrowGeometry(ring: ArrowRing, start: number, grow: number, lift: number): THREE.BufferGeometry {
  const L = ring.length
  const half = SHAFT_HALF * ring.scale + grow
  const headHalf = HEAD_HALF * ring.scale + grow * 1.6
  const headLength = HEAD_LENGTH * ring.scale + grow * 1.5
  // d runs from the tail (0) to the tip (L); s is the distance along the ring.
  const sAt = (d: number) => (ring.positive ? start + d : start + L - d)
  const positions: number[] = []
  const indices: number[] = []
  const p = new THREE.Vector3()
  const n = new THREE.Vector3()
  const push = (d: number, across: number) => {
    ringPoint(ring, sAt(d), across, lift, p, n)
    positions.push(p.x, p.y, p.z)
  }

  const tip = L + grow * 1.2
  const bodyEnd = tip - headLength + 0.02
  const tail = -grow
  const steps = Math.max(8, Math.ceil((bodyEnd - tail) / 0.05))
  for (let i = 0; i <= steps; i++) {
    const d = tail + ((bodyEnd - tail) * i) / steps
    push(d, -half)
    push(d, half)
    if (i > 0) {
      const b = i * 2
      indices.push(b - 2, b - 1, b, b - 1, b + 1, b)
    }
  }

  // The head: a triangle bent round the ring (in a few slices, so it follows a corner too).
  const head = (tipD: number) => {
    const slices = 6
    const base = positions.length / 3
    for (let i = 0; i <= slices; i++) {
      const f = i / slices
      const d = tipD - headLength + headLength * f
      const w = headHalf * (1 - f)
      push(d, -w)
      push(d, w)
      if (i > 0) {
        const b = base + i * 2
        indices.push(b - 2, b - 1, b, b - 1, b + 1, b)
      }
    }
  }
  head(tip)
  if (ring.double) head(tip - headLength * 0.78)

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  return geometry
}

// ───────────────────────── Face letters ─────────────────────────

/** A round badge with a face letter, as a texture for a sprite. */
export function faceLabelTexture(letter: string, ink: string, paper: string): THREE.CanvasTexture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2)
  ctx.fillStyle = paper
  ctx.fill()
  ctx.lineWidth = 5
  ctx.strokeStyle = ink
  ctx.globalAlpha = 0.22
  ctx.stroke()
  ctx.globalAlpha = 1
  ctx.fillStyle = ink
  ctx.font = '800 76px "Bricolage Grotesque Variable", "Figtree Variable", system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(letter, size / 2, size / 2 + 5)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

export class FaceLabels {
  readonly group = new THREE.Group()
  private sprites: THREE.Sprite[] = []
  private materials: THREE.SpriteMaterial[] = []

  constructor(ink: string, paper: string) {
    this.group.visible = false
    for (const face of FACES) {
      const material = new THREE.SpriteMaterial({ map: faceLabelTexture(face, ink, paper), transparent: true, opacity: 0, depthWrite: false, toneMapped: false })
      const sprite = new THREE.Sprite(material)
      sprite.scale.setScalar(0.6)
      sprite.renderOrder = 5
      this.sprites.push(sprite)
      this.materials.push(material)
      this.group.add(sprite)
    }
  }

  /** Redraw with new colours (theme change, or once the web font has loaded). */
  redraw(ink: string, paper: string): void {
    FACES.forEach((face, i) => {
      this.materials[i].map?.dispose()
      this.materials[i].map = faceLabelTexture(face, ink, paper)
      this.materials[i].needsUpdate = true
    })
  }

  /**
   * Place and fade the letters for this camera. A face turned towards the camera carries its
   * letter on its centre; a face turned away shows it on its mirror panel instead (when the
   * mirrors are out), so every letter is always somewhere you can see it.
   */
  update(opacity: number, camera: THREE.Vector3, mirrors: number): void {
    this.group.visible = opacity > 0.003
    if (!this.group.visible) return
    FACES.forEach((face, i) => {
      const n = FACE_NORMAL[face]
      const facing = ((camera.x - n[0] * 1.5) * n[0] + (camera.y - n[1] * 1.5) * n[1] + (camera.z - n[2] * 1.5) * n[2]) / camera.length()
      const front = facing > 0
      const distance = front ? 1.54 : 1.5 + HINT_DISTANCE - 0.34
      const sprite = this.sprites[i]
      sprite.position.set(n[0] * distance, n[1] * distance, n[2] * distance)
      // A letter on a mirror sits on that mirror, wherever it slid to.
      const offset = front ? undefined : HINT_OFFSET[face]
      if (offset) sprite.position.add(new THREE.Vector3(offset[0], offset[1], offset[2]))
      const material = this.materials[i]
      // On the cube the letter sits on the surface, so it must not be clipped by it.
      if (material.depthTest === front) {
        material.depthTest = !front
        material.needsUpdate = true
      }
      material.opacity = opacity * Math.min(1, Math.abs(facing) * 7) * (front ? 1 : mirrors)
      sprite.visible = material.opacity > 0.003
    })
  }

  dispose(): void {
    for (const material of this.materials) {
      material.map?.dispose()
      material.dispose()
    }
  }
}

// ───────────────────────── Contact shadow ─────────────────────────

export function shadowTexture(): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.22, 'rgba(255,255,255,0.86)')
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.42)')
  gradient.addColorStop(0.72, 'rgba(255,255,255,0.12)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(canvas)
}
