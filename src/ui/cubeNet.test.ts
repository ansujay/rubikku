import { describe, expect, it } from 'vitest'
import { FACELETS, SOLVED, applyAlg, toColors } from '../cube'
import { NET_CELLS, netCellAt, netColors, netNeighbor, netStickerLabel } from './cubeNetLayout'

describe('cube net layout', () => {
  it('numbers the 54 stickers exactly like the engine', () => {
    expect(NET_CELLS).toHaveLength(54)
    for (const cell of NET_CELLS) {
      const facelet = FACELETS[cell.index]
      expect([cell.face, cell.row, cell.col]).toEqual([facelet.face, facelet.row, facelet.col])
      expect(cell.isCenter).toBe(facelet.kind === 'center')
    }
  })

  it('places every sticker on its own cell of the cross', () => {
    const seen = new Set(NET_CELLS.map((c) => `${c.netRow},${c.netCol}`))
    expect(seen.size).toBe(54)
    expect(netCellAt(0, 3)).toBe(0) // U top-left
    expect(netCellAt(3, 0)).toBe(36) // L top-left
    expect(netCellAt(3, 3)).toBe(18) // F top-left
    expect(netCellAt(3, 6)).toBe(9) // R top-left
    expect(netCellAt(3, 9)).toBe(45) // B top-left
    expect(netCellAt(6, 3)).toBe(27) // D top-left
    expect(netCellAt(0, 0)).toBe(-1)
  })

  it('reads a state string the same way the engine does', () => {
    const state = applyAlg(SOLVED, "R U R' U' F2 D L'")
    expect(netColors(state)).toEqual(toColors(state))
  })

  it('treats unknown characters and missing entries as unpainted', () => {
    expect(netColors('U?').slice(0, 3)).toEqual(['white', null, null])
    expect(netColors(['red', null, undefined]).slice(0, 4)).toEqual(['red', null, null, null])
    expect(netColors([])).toHaveLength(54)
  })
})

describe('arrow-key movement', () => {
  it('moves within a face and across to the neighbouring face', () => {
    expect(netNeighbor(0, 'right')).toBe(1)
    expect(netNeighbor(6, 'down')).toBe(18) // U bottom-left → F top-left
    expect(netNeighbor(18, 'up')).toBe(6)
    expect(netNeighbor(20, 'right')).toBe(9) // F → R
    expect(netNeighbor(18, 'left')).toBe(38) // F → L
    expect(netNeighbor(24, 'down')).toBe(27) // F → D
  })

  it('wraps around the middle band but stops at the other edges', () => {
    expect(netNeighbor(47, 'right')).toBe(36) // B right edge → L left edge
    expect(netNeighbor(36, 'left')).toBe(47)
    expect(netNeighbor(0, 'up')).toBe(0)
    expect(netNeighbor(0, 'left')).toBe(0)
    expect(netNeighbor(35, 'down')).toBe(35)
    expect(netNeighbor(36, 'up')).toBe(36) // nothing above L on the net
  })

  it('every move can be undone or was blocked', () => {
    const back = { up: 'down', down: 'up', left: 'right', right: 'left' } as const
    for (const cell of NET_CELLS) {
      for (const dir of ['up', 'down', 'left', 'right'] as const) {
        const next = netNeighbor(cell.index, dir)
        if (next !== cell.index) expect(netNeighbor(next, back[dir])).toBe(cell.index)
      }
    }
  })
})

describe('sticker labels', () => {
  it('names face, row, column and colour', () => {
    expect(netStickerLabel(1, 'white')).toBe('Top face, row 1, column 2: white')
    expect(netStickerLabel(53, null)).toBe('Back face, row 3, column 3: empty')
  })
})
