/**
 * The one way to make a saved store in Rubikku. See README.md in this folder.
 *
 * `createPersistedStore` wraps zustand `persist` and enforces:
 *  - a namespaced localStorage key (`rubikku:<name>`),
 *  - a version and a `migrate` function,
 *  - safe JSON parsing and a defensive merge, so a corrupt or hand-edited save
 *    falls back to defaults instead of crashing the app,
 *  - registration with the backup module (export / import / reset everything),
 *  - two-tab safety: when another tab saves, this tab picks the change up straight away
 *    (a `storage` listener), so a stale tab can never write old progress over new,
 *  - a signal when saving fails (storage full or blocked), so the app can say so.
 */
import { create, type StateCreator, type StoreApi, type UseBoundStore } from 'zustand'
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware'

export const NAMESPACE = 'rubikku'
const NAME_PATTERN = /^[a-z][a-z0-9-]{0,39}$/
const CORRUPT_SUFFIX = ':corrupt'
/** A quarantined broken save is kept for a grown-up to look at, but only this much of it. */
const CORRUPT_KEPT_CHARS = 50_000
/**
 * Written by a tab that is about to replace everything (import / reset). Other tabs then take
 * storage as the truth instead of merging their own state into it. Not a valid store name, so
 * it is never exported in a backup.
 */
export const SYNC_KEY = `${NAMESPACE}:!sync`

export const storageKey = (name: string) => `${NAMESPACE}:${name}`
export const isValidStoreName = (name: string) => NAME_PATTERN.test(name)

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** localStorage, or null when it is unavailable (private mode, SSR, tests without a stub). */
export function getStorage(): Storage | null {
  try {
    const storage = (globalThis as { localStorage?: Storage }).localStorage
    return storage ?? null
  } catch {
    return null
  }
}

/**
 * Can anything be saved and read back at all? False when storage is missing, blocked, or its
 * reads or writes throw (QA 2, N8 / UC3) — then nothing he does will be kept.
 */
export function storageWorks(): boolean {
  try {
    const storage = getStorage()
    if (!storage) return false
    const key = 'rubikku:!probe'
    storage.setItem(key, '1')
    const ok = storage.getItem(key) === '1'
    storage.removeItem(key)
    return ok
  } catch {
    return false
  }
}

export interface SavedEnvelope {
  state: Record<string, unknown>
  version: number
}

/** Parse one saved store. Returns null for anything that is not a `{ state, version }` object. */
export function parseEnvelope(raw: string | null | undefined): SavedEnvelope | null {
  if (typeof raw !== 'string' || raw.length === 0) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || !isRecord(parsed.state)) return null
    const version =
      typeof parsed.version === 'number' && Number.isFinite(parsed.version) ? parsed.version : 0
    return { state: parsed.state, version }
  } catch {
    return null
  }
}

// ───────────────────────── Save health ─────────────────────────

type SaveFailureListener = () => void
const saveFailureListeners = new Set<SaveFailureListener>()
let saveFailing = false
/** While > 0, stores change in memory without writing (used when adopting another tab's data). */
let writesPaused = 0

/** True while the most recent save did not reach localStorage. */
export const isSaveFailing = (): boolean => saveFailing

/**
 * Be told when saving stops working (storage full, or blocked by the browser). Called once
 * each time saving goes from working to failing. Returns an unsubscribe function.
 */
export function onSaveFailure(listener: SaveFailureListener): () => void {
  saveFailureListeners.add(listener)
  return () => {
    saveFailureListeners.delete(listener)
  }
}

function reportSave(ok: boolean): void {
  if (ok) {
    saveFailing = false
    return
  }
  if (saveFailing) return
  saveFailing = true
  for (const listener of [...saveFailureListeners]) {
    try {
      listener()
    } catch {
      /* a broken listener must not break saving */
    }
  }
}

/** Drop quarantined corrupt saves: they are a courtesy, and they count against the quota. */
function dropCorruptCopies(storage: Storage): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key && key.startsWith(NAMESPACE + ':') && key.endsWith(CORRUPT_SUFFIX)) keys.push(key)
    }
    for (const key of keys) storage.removeItem(key)
  } catch {
    /* ignore */
  }
}

/**
 * Write one key. On failure (quota), free the quarantined copies and try once more.
 * Returns whether the value is now in storage.
 */
export function writeKey(key: string, value: string): boolean {
  const storage = getStorage()
  if (!storage) return false
  try {
    storage.setItem(key, value)
    return true
  } catch {
    dropCorruptCopies(storage)
    try {
      storage.setItem(key, value)
      return true
    } catch {
      return false
    }
  }
}

function safeStorage<P>(): PersistStorage<P> {
  return {
    getItem(key) {
      const storage = getStorage()
      if (!storage) return null
      let raw: string | null = null
      try {
        raw = storage.getItem(key)
      } catch {
        return null
      }
      if (raw === null) return null
      const envelope = parseEnvelope(raw)
      if (!envelope) {
        // Keep the broken text aside (it may be recoverable by hand), then start fresh.
        try {
          storage.removeItem(key)
          storage.setItem(key + CORRUPT_SUFFIX, raw.slice(0, CORRUPT_KEPT_CHARS))
        } catch {
          /* storage full or blocked — nothing more we can do */
        }
        return null
      }
      return envelope as StorageValue<P>
    },
    setItem(key, value) {
      if (writesPaused > 0) return
      // Quota exceeded or storage blocked: keep running from memory, and let the app say so.
      if (getStorage()) reportSave(writeKey(key, JSON.stringify(value)))
    },
    removeItem(key) {
      try {
        getStorage()?.removeItem(key)
      } catch {
        /* ignore */
      }
    },
  }
}

/**
 * Default guard for hydrating: keep only keys the store already has, whose saved value has
 * the same basic type as the default. Functions (actions) are never overwritten.
 */
export function shallowSanitize<S extends object>(persisted: unknown, current: S): Partial<S> {
  if (!isRecord(persisted)) return {}
  const out: Record<string, unknown> = {}
  const base = current as Record<string, unknown>
  for (const key of Object.keys(base)) {
    if (!(key in persisted)) continue
    const def = base[key]
    const value = persisted[key]
    if (typeof def === 'function') continue
    if (def === null || value === null) {
      out[key] = value
      continue
    }
    if (typeof def !== typeof value) continue
    if (Array.isArray(def) !== Array.isArray(value)) continue
    out[key] = value
  }
  return out as Partial<S>
}

export interface PersistedStoreOptions<S extends object> {
  /** Short kebab-case name. The localStorage key becomes `rubikku:<name>`. */
  name: string
  /** Bump when the saved shape changes, and teach `migrate` about the old shape. */
  version: number
  /**
   * Turn a save written by an older (or unknown) version into the current shape.
   * Return only data fields. Throwing is safe: the store falls back to defaults.
   */
  migrate: (persisted: unknown, fromVersion: number) => unknown
  /** Which fields to save. Defaults to every non-function field. */
  partialize?: (state: S) => Partial<S>
  /**
   * Validate saved data before it is merged over the defaults. Defaults to `shallowSanitize`.
   * Use this to clamp numbers, drop unknown enum values, and so on.
   */
  sanitize?: (persisted: unknown, current: S) => Partial<S>
  /**
   * How to combine this tab's state with a save another tab just made. `remote` has already
   * been through `migrate` and `sanitize`. Default: the other tab's save simply replaces ours
   * (it is the newer one). Give this when some fields must never go backwards (XP, badges).
   */
  mergeRemote?: (local: S, remote: Partial<S>) => Partial<S>
}

type PersistApi<S> = {
  persist: {
    rehydrate: () => Promise<void> | void
    hasHydrated: () => boolean
    clearStorage: () => void
  }
  getInitialState: () => S
}

export type PersistedStore<S> = UseBoundStore<StoreApi<S>> & PersistApi<S>

interface RegistryEntry {
  name: string
  version: number
  store: PersistedStore<unknown>
  /** Apply a save made by another tab (already parsed). */
  adopt: (envelope: SavedEnvelope) => void
}

const registry = new Map<string, RegistryEntry>()

/** Every persisted store created so far (used by backup / reset). */
export const registeredStores = (): RegistryEntry[] => [...registry.values()]

function stripFunctions<S extends object>(state: S): Partial<S> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(state)) {
    if (typeof value !== 'function') out[key] = value
  }
  return out as Partial<S>
}

export function createPersistedStore<S extends object>(
  options: PersistedStoreOptions<S>,
  creator: StateCreator<S, [['zustand/persist', unknown]], []>,
): PersistedStore<S> {
  const { name, version, migrate, partialize = stripFunctions, sanitize = shallowSanitize } = options
  if (!isValidStoreName(name)) {
    throw new Error(`Store name "${name}" must be short kebab-case (a-z, 0-9, -).`)
  }
  if (registry.has(name) && !import.meta.hot) {
    throw new Error(`A persisted store named "${name}" already exists.`)
  }

  const store = create<S>()(
    persist(creator, {
      name: storageKey(name),
      version,
      storage: safeStorage<Partial<S>>(),
      partialize,
      migrate: (persisted, fromVersion) => {
        try {
          return migrate(persisted, fromVersion) as Partial<S>
        } catch {
          return {} as Partial<S>
        }
      },
      merge: (persisted, current) => {
        try {
          return { ...current, ...sanitize(persisted, current) }
        } catch {
          return current
        }
      },
    }),
  ) as unknown as PersistedStore<S>

  const safeMigrate = (state: unknown, fromVersion: number): unknown => {
    if (fromVersion === version) return state
    try {
      return migrate(state, fromVersion)
    } catch {
      return {}
    }
  }

  const adopt = (envelope: SavedEnvelope) => {
    // A newer app version wrote this: we cannot read it safely, and must not downgrade it.
    if (envelope.version > version) return
    if (!options.mergeRemote) {
      void store.persist.rehydrate()
      return
    }
    const current = store.getState()
    let merged: S
    try {
      const remote = sanitize(safeMigrate(envelope.state, envelope.version), current)
      merged = { ...current, ...options.mergeRemote(current, remote) }
    } catch {
      return
    }
    // Only touch the store (and so storage) when something really changed, or two tabs
    // would hand the same save back and forth for ever.
    if (!sameData(partialize(merged), partialize(current))) store.setState(merged, true)
  }

  registry.set(name, { name, version, store: store as unknown as PersistedStore<unknown>, adopt })
  listenForOtherTabs()
  return store
}

/** Deep equality for plain saved data, ignoring the order of object keys. */
export function sameData(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((item, i) => sameData(item, b[i]))
  }
  if (!isRecord(a) || !isRecord(b)) return false
  const keys = Object.keys(a).filter((key) => a[key] !== undefined)
  if (keys.length !== Object.keys(b).filter((key) => b[key] !== undefined).length) return false
  return keys.every((key) => sameData(a[key], b[key]))
}

// ───────────────────────── Other tabs ─────────────────────────

let listening = false
let replaceTimer: ReturnType<typeof setTimeout> | null = null
/** How long after the last change of a "replace everything" burst we re-read storage. */
const REPLACE_SETTLE_MS = 120

/**
 * Tell other tabs that everything is about to be replaced (import, reset). Call before
 * touching storage; they then re-read storage as the truth once the writes have settled.
 */
export function announceReplace(): void {
  writeKey(SYNC_KEY, `${Date.now()}:${Math.random().toString(36).slice(2)}`)
}

/**
 * Re-read every store from storage and take it as the truth: stores with a save load it,
 * stores without one go back to their defaults. Nothing is written.
 */
export function adoptStorage(): void {
  const storage = getStorage()
  if (!storage) return
  writesPaused++
  try {
    for (const { name, store } of registry.values()) {
      store.setState(store.getInitialState() as never, true)
      let raw: string | null = null
      try {
        raw = storage.getItem(storageKey(name))
      } catch {
        raw = null
      }
      if (raw !== null) void store.persist.rehydrate()
    }
  } finally {
    writesPaused--
  }
}

/**
 * React to a change another tab made to localStorage. Exported for tests; in the browser it is
 * wired to the `storage` event by `createPersistedStore`.
 */
export function handleStorageChange(key: string | null, newValue: string | null): void {
  const scheduleAdopt = () => {
    if (replaceTimer) clearTimeout(replaceTimer)
    replaceTimer = setTimeout(() => {
      replaceTimer = null
      adoptStorage()
    }, REPLACE_SETTLE_MS)
  }
  // `key === null` is a whole-storage clear; the sync marker announces an import or reset.
  if (key === null || (key === SYNC_KEY && newValue !== null)) return scheduleAdopt()
  if (!key.startsWith(NAMESPACE + ':')) return
  // In the middle of the other tab's import/reset: wait for it to finish, merge nothing.
  if (replaceTimer) return scheduleAdopt()
  const entry = registry.get(key.slice(NAMESPACE.length + 1))
  if (!entry || newValue === null) return
  const envelope = parseEnvelope(newValue)
  if (envelope) entry.adopt(envelope)
}

function listenForOtherTabs(): void {
  if (listening || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return
  listening = true
  window.addEventListener('storage', (event) => {
    if (event.storageArea && event.storageArea !== getStorage()) return
    handleStorageChange(event.key, event.newValue)
  })
}

/**
 * Put every registered store back to its defaults, in memory. Because `persist` saves on
 * every change, this also writes the defaults to localStorage.
 */
export function resetAllToDefaults(): void {
  for (const { store } of registry.values()) {
    store.setState(store.getInitialState() as never, true)
  }
}

/** Re-read every registered store from localStorage (after an import). */
export async function rehydrateAll(): Promise<void> {
  for (const { store } of registry.values()) {
    await store.persist.rehydrate()
  }
}

/** Keys in localStorage that belong to Rubikku stores (excludes quarantined corrupt saves). */
export function savedStoreNames(): string[] {
  const storage = getStorage()
  if (!storage) return []
  const prefix = NAMESPACE + ':'
  const names: string[] = []
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (!key || !key.startsWith(prefix) || key.endsWith(CORRUPT_SUFFIX) || key === SYNC_KEY) continue
      const name = key.slice(prefix.length)
      if (isValidStoreName(name)) names.push(name)
    }
  } catch {
    return names
  }
  return names.sort()
}

/** Remove every Rubikku key from localStorage, including quarantined corrupt saves. */
export function clearNamespace(): void {
  const storage = getStorage()
  if (!storage) return
  const prefix = NAMESPACE + ':'
  try {
    const keys: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key && key.startsWith(prefix)) keys.push(key)
    }
    for (const key of keys) storage.removeItem(key)
  } catch {
    /* ignore */
  }
}

/** The raw text of every Rubikku key (stores, corrupt copies), for rolling an import back. */
export function snapshotNamespace(): Record<string, string> {
  const storage = getStorage()
  const out: Record<string, string> = {}
  if (!storage) return out
  const prefix = NAMESPACE + ':'
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (!key || !key.startsWith(prefix) || key === SYNC_KEY) continue
      const value = storage.getItem(key)
      if (value !== null) out[key] = value
    }
  } catch {
    /* return what we have */
  }
  return out
}

/** Run `fn` with saving switched off: stores change in memory only. */
export function withoutSaving<T>(fn: () => T): T {
  writesPaused++
  try {
    return fn()
  } finally {
    writesPaused--
  }
}
