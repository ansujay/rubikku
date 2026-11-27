import { describe, expect, it } from 'vitest'
import { applyAlg, faceColors, flagStart, getFlag, type FaceGrid, type FaceSolution } from '..'
import { createFaceSearchClient, faceSearchKey, isFaceSearchCancelled } from '../faceSearchClient'
import { handleFaceSearchRequest, type FaceSearchRequest, type FaceSearchResponse, type FaceSearchTransport } from '../faceSearchProtocol'

const JAPAN = getFlag('flag-japan')!.grid
const NIGERIA = getFlag('flag-nigeria')!.grid
const FRANCE = getFlag('flag-france')!.grid

const shows = (grid: FaceGrid, s: FaceSolution) => expect(faceColors(applyAlg(flagStart(s.hold), s.moves), 'F')).toEqual([...grid])

function fakeTransport() {
  const sent: FaceSearchRequest[] = []
  let respond: (r: FaceSearchResponse) => void = () => {}
  let fail: (e: Error) => void = () => {}
  let terminated = 0
  const transport: FaceSearchTransport = {
    send: (r) => void sent.push(r),
    onResponse: (l) => void (respond = l),
    onFailure: (l) => void (fail = l),
    terminate: () => void terminated++,
  }
  return { transport, sent, respond: (r: FaceSearchResponse) => respond(r), fail: (e: Error) => fail(e), terminated: () => terminated }
}

const answer = (moves: string[]): FaceSolution => ({ hold: [], moves: moves as FaceSolution['moves'] })
/** Settle every pending promise callback. */
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('handleFaceSearchRequest', () => {
  it('answers with the best solution, and reports errors', () => {
    const core = { findFaceAlgs: () => [answer(['R']), answer(['L'])] }
    expect(handleFaceSearchRequest(core, { id: 3, grid: JAPAN, slices: false })).toEqual({ id: 3, ok: true, solution: answer(['R']) })
    expect(handleFaceSearchRequest({ findFaceAlgs: () => [] }, { id: 4, grid: JAPAN, slices: true })).toEqual({ id: 4, ok: true, solution: null })
    const broken = {
      findFaceAlgs: () => {
        throw new Error('boom')
      },
    }
    expect(handleFaceSearchRequest(broken, { id: 5, grid: JAPAN, slices: false })).toEqual({ id: 5, ok: false, error: 'boom' })
  })

  it('passes the slices option through', () => {
    const seen: unknown[] = []
    handleFaceSearchRequest({ findFaceAlgs: (_g, o) => (seen.push(o), []) }, { id: 1, grid: JAPAN, slices: true })
    expect(seen).toEqual([{ slices: true }])
  })
})

describe('faceSearchKey', () => {
  it('is nine letters, plus +s with slices', () => {
    expect(faceSearchKey(JAPAN)).toBe('wwwwrwwww')
    expect(faceSearchKey(JAPAN, { slices: true })).toBe('wwwwrwwww+s')
  })
})

describe('createFaceSearchClient with a custom transport', () => {
  it('is lazy, and answers a search', async () => {
    let created = 0
    const fake = fakeTransport()
    const client = createFaceSearchClient({
      createTransport: () => {
        created++
        return fake.transport
      },
    })
    expect(created).toBe(0)
    const p = client.search(JAPAN, { slices: true })
    expect(created).toBe(1)
    expect(fake.sent).toEqual([{ id: 1, grid: [...JAPAN], slices: true }])
    fake.respond({ id: 1, ok: true, solution: answer(['M', 'S', "M'"]) })
    expect(await p).toEqual(answer(['M', 'S', "M'"]))
  })

  it('latest wins: older searches are cancelled and only the newest waits behind the busy worker', async () => {
    const fake = fakeTransport()
    const client = createFaceSearchClient({ createTransport: () => fake.transport })
    const first = client.search(JAPAN)
    const second = client.search(NIGERIA)
    const third = client.search(FRANCE)
    const outcomes = [first, second].map((p) => p.then(() => 'resolved', (e: unknown) => (isFaceSearchCancelled(e) ? 'cancelled' : 'error')))
    expect(await Promise.all(outcomes)).toEqual(['cancelled', 'cancelled'])
    // Only the first went to the worker; Nigeria was never sent.
    expect(fake.sent.map((r) => r.id)).toEqual([1])
    fake.respond({ id: 1, ok: true, solution: answer(['A']) })
    await flush()
    expect(fake.sent).toHaveLength(2)
    expect(fake.sent[1].grid).toEqual([...FRANCE])
    fake.respond({ id: 2, ok: true, solution: answer(['F']) })
    expect(await third).toEqual(answer(['F']))
    // The stale answer was still worth keeping.
    expect(client.peek(JAPAN)).toEqual(answer(['A']))
    expect(client.peek(NIGERIA)).toBeUndefined()
  })

  it('asking again for the face being searched waits for that answer, without a new request', async () => {
    const fake = fakeTransport()
    const client = createFaceSearchClient({ createTransport: () => fake.transport })
    const first = client.search(JAPAN)
    const again = client.search(JAPAN)
    await expect(first).rejects.toSatisfy(isFaceSearchCancelled)
    fake.respond({ id: 1, ok: true, solution: answer(['M']) })
    expect(await again).toEqual(answer(['M']))
    expect(fake.sent).toHaveLength(1)
  })

  it('answers from the cache, and keeps slices and face turns apart', async () => {
    const fake = fakeTransport()
    const client = createFaceSearchClient({ createTransport: () => fake.transport })
    const p = client.search(NIGERIA)
    fake.respond({ id: 1, ok: true, solution: answer(['R', 'L']) })
    await p
    expect(await client.search(NIGERIA)).toEqual(answer(['R', 'L']))
    expect(fake.sent).toHaveLength(1)
    expect(client.peek(NIGERIA, { slices: true })).toBeUndefined()
    void client.search(NIGERIA, { slices: true })
    expect(fake.sent).toHaveLength(2)
  })

  it('does not keep "nothing found", so asking again searches again', async () => {
    const fake = fakeTransport()
    const client = createFaceSearchClient({ createTransport: () => fake.transport })
    const p = client.search(JAPAN)
    fake.respond({ id: 1, ok: true, solution: null })
    expect(await p).toBeNull()
    expect(client.peek(JAPAN)).toBeUndefined()
    const again = client.search(JAPAN)
    expect(fake.sent).toHaveLength(2)
    fake.respond({ id: 2, ok: true, solution: answer(['R']) })
    expect(await again).toEqual(answer(['R']))
    expect(client.peek(JAPAN)).toEqual(answer(['R']))
  })

  it('forgets the oldest answers past its cache size', async () => {
    const fake = fakeTransport()
    const client = createFaceSearchClient({ createTransport: () => fake.transport, cacheSize: 1 })
    const a = client.search(JAPAN)
    fake.respond({ id: 1, ok: true, solution: answer(['A']) })
    await a
    const b = client.search(NIGERIA)
    fake.respond({ id: 2, ok: true, solution: answer(['B']) })
    await b
    expect(client.peek(JAPAN)).toBeUndefined()
    expect(client.peek(NIGERIA)).toEqual(answer(['B']))
  })

  it('rejects on an error answer and on a broken worker, then starts a fresh one', async () => {
    let created = 0
    const fakes = [fakeTransport(), fakeTransport()]
    const client = createFaceSearchClient({ createTransport: () => fakes[created++].transport })
    const p = client.search(JAPAN)
    fakes[0].respond({ id: 1, ok: false, error: 'bad face' })
    await expect(p).rejects.toThrow('bad face')
    const q = client.search(NIGERIA)
    fakes[0].fail(new Error('worker died'))
    await expect(q).rejects.toThrow('worker died')
    expect(fakes[0].terminated()).toBe(1)
    const r = client.search(FRANCE)
    expect(created).toBe(2)
    fakes[1].respond({ id: fakes[1].sent[0].id, ok: true, solution: answer(['L']) })
    expect(await r).toEqual(answer(['L']))
  })

  it('dispose cancels what is pending and stops the worker', async () => {
    const fake = fakeTransport()
    const client = createFaceSearchClient({ createTransport: () => fake.transport })
    const p = client.search(JAPAN)
    client.dispose()
    await expect(p).rejects.toSatisfy(isFaceSearchCancelled)
    expect(fake.terminated()).toBe(1)
  })
})

describe('the inline fallback (no Worker in Node)', () => {
  it('really searches, and the answer makes the face', async () => {
    const client = createFaceSearchClient()
    const japan = await client.search(JAPAN)
    expect(japan!.moves).toHaveLength(6)
    shows(JAPAN, japan!)
    const japanSlices = await client.search(JAPAN, { slices: true })
    expect(japanSlices!.moves).toHaveLength(3)
    shows(JAPAN, japanSlices!)
    client.dispose()
  }, 20_000)

  it('cancels a superseded real search', async () => {
    const client = createFaceSearchClient()
    const old = client.search(FRANCE)
    const latest = client.search(NIGERIA)
    await expect(old).rejects.toSatisfy(isFaceSearchCancelled)
    const nigeria = await latest
    expect(nigeria!.moves).toHaveLength(2)
    shows(NIGERIA, nigeria!)
    client.dispose()
  }, 20_000)
})
