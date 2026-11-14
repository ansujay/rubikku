/**
 * Display-side helpers for move notation (MoveChip, MoveSequence).
 *
 * The cube engine is the one source of truth for what a token means and how it is described
 * in words: this file only adds what a chip needs to draw itself (the letters as typed, the
 * face whose colour marks it). So a chip's tooltip, the Solve panel, the notation trainer and
 * the lessons all say the same thing: "Top face, clockwise".
 */
// Imported from the engine's notation file directly (not the engine's index) so that the
// design system does not drag the solver into the first chunk.
import { describeMove as describeEngineMove, moveAmount, moveBase, moveKind, tryParseAlg, type Move } from '../cube/notation'
import type { Face } from './colors'

export type MoveKind = 'face' | 'wide' | 'slice' | 'rotation'
export type MoveModifier = '' | "'" | '2'

export interface ParsedMove {
  /** The token as typed, with primes normalised to '. */
  raw: string
  /** The letter part to show: R, Rw, r, M, x … */
  base: string
  /** The face whose colour marks this move, or null for slices and rotations. */
  face: Face | null
  kind: MoveKind
  modifier: MoveModifier
  valid: boolean
  /** The engine's move for this token ("Rw'" → "r'", "R3" → "R'"); null when it is not a move. */
  move: Move | null
}

/** The letters of a token as typed, without the turn suffix: "Rw" from "Rw2", "R" from "R3". */
const LETTERS = /^([UDLRFB]w|[A-Za-z])/

export function parseMoveToken(token: string): ParsedMove {
  const raw = token.trim().replace(/[’′`´]/g, "'")
  // One token must be exactly one move for the engine.
  const parsed = /\s/.test(raw) ? null : tryParseAlg(raw)
  const move = parsed && parsed.length === 1 ? parsed[0] : null
  if (!move) return { raw, base: raw, face: null, kind: 'face', modifier: '', valid: false, move: null }
  const kind = moveKind(move)
  const amount = moveAmount(move)
  const modifier: MoveModifier = amount === 2 ? '2' : amount === 3 ? "'" : ''
  const base = LETTERS.exec(raw)?.[1] ?? moveBase(move)
  const face = kind === 'face' || kind === 'wide' ? (moveBase(move).toUpperCase() as Face) : null
  return { raw, base, face, kind, modifier, valid: true, move }
}

/**
 * A sentence for screen readers and tooltips, in the engine's words:
 * "Right face, counter-clockwise", "Top face, half turn", "Whole cube, clockwise (like R)".
 */
export function describeMove(move: ParsedMove): string {
  return move.move ? describeEngineMove(move.move).text : move.raw
}

export type SequenceToken =
  | { type: 'move'; move: ParsedMove; index: number }
  | { type: 'open' | 'close' }

/**
 * Split an algorithm string into chips. Parentheses group triggers — "(R U R' U') F" — and are
 * kept as tokens. `index` counts moves only, so it lines up with a playback position.
 */
export function tokenizeMoves(input: string | readonly string[]): SequenceToken[] {
  const text = typeof input === 'string' ? input : input.join(' ')
  const parts = text.replace(/([()])/g, ' $1 ').split(/\s+/).filter(Boolean)
  const out: SequenceToken[] = []
  let index = 0
  for (const part of parts) {
    if (part === '(') out.push({ type: 'open' })
    else if (part === ')') out.push({ type: 'close' })
    else out.push({ type: 'move', move: parseMoveToken(part), index: index++ })
  }
  return out
}
