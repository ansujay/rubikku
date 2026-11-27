/** One-line explanations of a mistake, in words a 10+ year-old can act on. */
import { MOVE_BASE_DEFS, describeMove, invertMove, moveAmount, moveBase, moveKind, type Move } from '../../../cube'

/** "R′" with a real prime, for sentences. */
export const pretty = (move: Move): string => move.replace("'", '′')

const layerName = (move: Move): string => describeMove(move).layer.toLowerCase()

const turnWords = (move: Move): string => {
  const amount = moveAmount(move)
  return amount === 1 ? 'clockwise' : amount === 3 ? 'the other way, against the clock' : 'twice, a half turn'
}

/** What a suffix means, for the move that was asked. */
function suffixRule(asked: Move): string {
  const amount = moveAmount(asked)
  if (amount === 1) return `No tick means clockwise.`
  if (amount === 3) return `The tick ′ means against the clock.`
  return `The 2 means two turns the same way.`
}

/**
 * He was asked for `asked` and turned `made` instead (a single turn — the one that went wrong).
 * `partial` is set when he had already done the first half of a double.
 */
export function explainWrongTurn(asked: Move, made: Move, partial: Move | null = null): string {
  const askedBase = moveBase(asked)
  const madeBase = moveBase(made)
  if (partial) {
    // He was half-way through a double turn. Only "back the way it came" went back again.
    if (made === invertMove(partial)) return `${pretty(asked)} is two turns the same way. Your second turn went back again.`
    if (madeBase === askedBase) return `${pretty(asked)} is two quarter turns the same way. One more like the first would have done it.`
    return `${pretty(asked)} is two turns of the ${layerName(asked)}. You were halfway, then turned the ${layerName(made)}.`
  }
  if (askedBase === madeBase) {
    if (made === invertMove(asked)) return `That was ${pretty(made)}: the ${layerName(made)} turned the other way. ${suffixRule(asked)}`
    if (moveAmount(made) === 2) return `That was ${pretty(made)}, a half turn. ${pretty(asked)} is just one quarter turn.`
    return `That was ${pretty(made)}. ${pretty(asked)} turns the ${layerName(asked)} ${turnWords(asked)}.`
  }
  const askedDef = MOVE_BASE_DEFS[askedBase]
  const madeDef = MOVE_BASE_DEFS[madeBase]
  if (askedDef.kind === 'face' && madeDef.kind === 'wide' && madeDef.follows === askedDef.follows) {
    return `That was ${pretty(made)}: two layers at once. ${pretty(asked)} turns only the outside layer.`
  }
  if (askedDef.kind === 'wide' && madeDef.kind === 'face' && madeDef.follows === askedDef.follows) {
    return `That was ${pretty(made)}: one layer. A small letter like ${pretty(asked)} takes the middle layer along too.`
  }
  if (moveKind(made) === 'slice' && moveKind(asked) !== 'slice') {
    return `That was ${pretty(made)}, the ${layerName(made)} in the middle. ${pretty(asked)} is the ${layerName(asked)}.`
  }
  if (moveKind(asked) === 'rotation') {
    return `That was ${pretty(made)}, the ${layerName(made)}. ${pretty(asked)} turns the whole cube: ${describeMove(asked).detail.toLowerCase().replace(/\.$/, '')}.`
  }
  return `That was ${pretty(made)}, the ${layerName(made)}. ${pretty(asked)} is the ${layerName(asked)}.`
}

/** The cube did `shown`; he picked `chosen` from the answers. */
export function explainWrongChoice(shown: Move, chosen: Move): string {
  const shownBase = moveBase(shown)
  if (shownBase === moveBase(chosen)) {
    const amount = moveAmount(shown)
    if (amount === 2) return `Right layer, but it went halfway round. Two quarter turns make ${pretty(shown)}.`
    if (moveAmount(chosen) === 2) return `Right layer, but it only made one quarter turn, so no 2.`
    const how = amount === 1 ? 'clockwise, so there is no tick' : 'against the clock, so it needs the tick ′'
    return `Right layer, wrong direction. Looking straight at that face, it turned ${how}.`
  }
  const shownDef = MOVE_BASE_DEFS[shownBase]
  const chosenDef = MOVE_BASE_DEFS[moveBase(chosen)]
  if (shownDef.axis === chosenDef.axis && shownDef.kind === chosenDef.kind && shownDef.kind !== 'rotation') {
    return `Close: those turn the same way round, but it was the ${layerName(shown)} that moved, not the ${layerName(chosen)}.`
  }
  if (shownDef.kind === 'rotation') return `The whole cube turned, not one layer. That is ${pretty(shown)}.`
  return `It was the ${layerName(shown)} that moved. That is ${pretty(shown)}; ${pretty(chosen)} is the ${layerName(chosen)}.`
}
