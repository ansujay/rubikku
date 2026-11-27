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
