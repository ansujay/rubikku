import { beforeEach, describe, expect, it, vi } from 'vitest'
import { installMemoryStorage, type MemoryStorage } from '../../store/testStorage'

let storage: MemoryStorage

async function load() {
  vi.resetModules()
  return (await import('./patternsStore')).usePatterns
}

beforeEach(() => {
  storage = installMemoryStorage()
})

describe('patterns store', () => {
  it('keeps places in flags as well as tricks, and drops ones that do not fit', async () => {
    const first = await load()
    first.getState().setTryAt('flag-india', 3)
    first.getState().setFollowAt('checkerboard', 2)
    const second = await load()
    expect(second.getState().tryAt).toEqual({ 'flag-india': 3 })
    expect(second.getState().followAt).toEqual({ checkerboard: 2 })
  })

  it('reads a version 1 save unchanged and sanitises it', async () => {
    storage.setItem('rubikku:patterns', JSON.stringify({ version: 1, state: { tryAt: { checkerboard: 2, 'flag-nigeria': 1, 'flag-nigeria-x': 1, superflip: 99 }, followAt: { 'six-spots': 4 } } }))
    const usePatterns = await load()
    expect(usePatterns.getState().tryAt).toEqual({ checkerboard: 2, 'flag-nigeria': 1 })
    expect(usePatterns.getState().followAt).toEqual({ 'six-spots': 4 })
  })
})

describe('the saved design', () => {
  it('starts blank, and keeps the face and the slices choice', async () => {
    const first = await load()
    expect(first.getState().design).toEqual({ face: 'WWWWWWWWW', slices: false })
    first.getState().setDesign({ face: 'OOOWBWGGG' })
    first.getState().setDesign({ slices: true })
    const second = await load()
    expect(second.getState().design).toEqual({ face: 'OOOWBWGGG', slices: true })
  })

  it('never stores a face that is not nine cube letters', async () => {
    const usePatterns = await load()
    usePatterns.getState().setDesign({ face: 'OOOWBWGGG' })
    usePatterns.getState().setDesign({ face: 'nope' })
    expect(usePatterns.getState().design.face).toBe('WWWWWWWWW')
    storage.setItem('rubikku:patterns', JSON.stringify({ version: 3, state: { tryAt: {}, followAt: {}, design: { face: 'oooXXXggg', slices: 'yes' } } }))
    expect((await load()).getState().design).toEqual({ face: 'WWWWWWWWW', slices: false })
  })

  it('keeps a place for the newest design only, and drops ones that do not fit', async () => {
    const first = await load()
    first.getState().setTryAt('flag-own:OOOWBWGGG', 3)
    first.getState().setTryAt('flag-india', 2)
    first.getState().setTryAt('flag-own:WWWWRWWWW+s', 1)
    expect(first.getState().tryAt).toEqual({ 'flag-india': 2, 'flag-own:WWWWRWWWW+s': 1 })
    const second = await load()
    expect(second.getState().tryAt).toEqual({ 'flag-india': 2, 'flag-own:WWWWRWWWW+s': 1 })
    storage.setItem('rubikku:patterns', JSON.stringify({ version: 3, state: { tryAt: { 'flag-own': 2, 'flag-own:OOO': 1, 'flag-own:OOOWBWGGG': 99, 'flag-own:OOOWBWGGG+x': 1 }, followAt: { 'flag-own:OOOWBWGGG': 4 } } }))
    const third = await load()
    expect(third.getState().tryAt).toEqual({})
    expect(third.getState().followAt).toEqual({ 'flag-own:OOOWBWGGG': 4 })
  })

  it('reads a version 2 save with no design', async () => {
    storage.setItem('rubikku:patterns', JSON.stringify({ version: 2, state: { tryAt: { 'flag-nigeria': 1 }, followAt: {} } }))
    const usePatterns = await load()
    expect(usePatterns.getState().tryAt).toEqual({ 'flag-nigeria': 1 })
    expect(usePatterns.getState().design).toEqual({ face: 'WWWWWWWWW', slices: false })
  })
})
