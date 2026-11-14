/**
 * Backup: every Rubikku store in one JSON file, plus import with validation and
 * "reset everything". Works on whatever is in localStorage under the `rubikku:` namespace, so
 * stores added later by other features are included automatically.
 */
import {
  adoptStorage,
  announceReplace,
  clearNamespace,
  getStorage,
  isRecord,
  isValidStoreName,
  parseEnvelope,
  registeredStores,
  resetAllToDefaults,
  savedStoreNames,
  snapshotNamespace,
  storageKey,
  withoutSaving,
  writeKey,
  type SavedEnvelope,
} from './persist'

export const BACKUP_SCHEMA = 1
export const MAX_BACKUP_BYTES = 5_000_000

export interface BackupFile {
  app: 'rubikku'
  kind: 'backup'
  schema: number
  exportedAt: string
  stores: Record<string, SavedEnvelope>
}

export type BackupParseResult = { ok: true; backup: BackupFile } | { ok: false; error: string }

/** Snapshot every saved store. */
export function createBackup(now: Date = new Date()): BackupFile {
  const storage = getStorage()
  const stores: Record<string, SavedEnvelope> = {}
  if (storage) {
    for (const name of savedStoreNames()) {
      let raw: string | null = null
      try {
        raw = storage.getItem(storageKey(name))
      } catch {
        raw = null
      }
      const envelope = parseEnvelope(raw)
      if (envelope) stores[name] = envelope
    }
  }
  return { app: 'rubikku', kind: 'backup', schema: BACKUP_SCHEMA, exportedAt: now.toISOString(), stores }
}

export const serializeBackup = (backup: BackupFile): string => JSON.stringify(backup, null, 2)

/** Validate the text of a backup file. Error messages are written for an 11-year-old. */
export function parseBackup(text: string): BackupParseResult {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return { ok: false, error: 'That file is empty.' }
  }
  if (text.length > MAX_BACKUP_BYTES) {
    return { ok: false, error: 'That file is too big to be a Rubikku backup.' }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: "That file isn't a Rubikku backup — it couldn't be read." }
  }
  if (!isRecord(parsed) || parsed.app !== 'rubikku' || parsed.kind !== 'backup') {
    return { ok: false, error: "That file isn't a Rubikku backup." }
  }
  if (typeof parsed.schema !== 'number' || parsed.schema > BACKUP_SCHEMA) {
    return { ok: false, error: 'That backup was made by a newer version of Rubikku.' }
  }
  if (!isRecord(parsed.stores)) {
    return { ok: false, error: 'That backup has nothing saved inside it.' }
  }
  const stores: Record<string, SavedEnvelope> = {}
  for (const [name, value] of Object.entries(parsed.stores)) {
    if (!isValidStoreName(name)) continue
    // Round-trip through the same parser the stores use, so only `{ state, version }` passes.
    const envelope = parseEnvelope(JSON.stringify(value))
    if (envelope) stores[name] = envelope
  }
  if (Object.keys(stores).length === 0) {
    return { ok: false, error: 'That backup has nothing saved inside it.' }
  }
  const exportedAt =
    typeof parsed.exportedAt === 'string' && !Number.isNaN(Date.parse(parsed.exportedAt))
      ? parsed.exportedAt
      : new Date(0).toISOString()
  return { ok: true, backup: { app: 'rubikku', kind: 'backup', schema: parsed.schema, exportedAt, stores } }
}

export type BackupApplyResult =
  | { ok: true; restored: string[] }
  /** Nothing was changed: what was saved before is still there. */
  | { ok: false; error: string }

const WRITE_FAILED = 'There was not enough room on this device to restore that backup, so nothing was changed.'

/**
 * Replace everything saved with the contents of a backup — all of it, or none of it.
 *
 * The old save is snapshotted first. Every store in the backup is written and read back; if a
 * single one fails (storage full, storage blocked) the snapshot is put back and the app carries
 * on exactly as it was. Each store still runs its own migrate + sanitize when it re-reads the
 * data, so an old or odd backup cannot break it.
 */
export async function applyBackup(backup: BackupFile): Promise<BackupApplyResult> {
  const storage = getStorage()
  if (!storage) return { ok: false, error: 'This browser is not letting Rubikku save, so the backup could not be restored.' }

  const entries = Object.entries(backup.stores).filter(([name]) => isValidStoreName(name))
  if (entries.length === 0) return { ok: false, error: 'That backup has nothing saved inside it.' }
  const texts = entries.map(([name, envelope]) => [storageKey(name), JSON.stringify(envelope)] as const)

  const before = snapshotNamespace()
  announceReplace()
  // Memory goes back to defaults without saving: storage is rewritten by hand below.
  withoutSaving(() => resetAllToDefaults())
  clearNamespace()

  let ok = true
  for (const [key, text] of texts) {
    if (!writeKey(key, text)) {
      ok = false
      break
    }
  }
  // Verify: every store must read back exactly as written.
  if (ok) {
    try {
      ok = texts.every(([key, text]) => storage.getItem(key) === text)
    } catch {
      ok = false
    }
  }

  if (!ok) {
    // Roll back: put the old save back, byte for byte, and reload it into memory.
    clearNamespace()
    for (const [key, text] of Object.entries(before)) writeKey(key, text)
    adoptStorage()
    announceReplace()
    return { ok: false, error: WRITE_FAILED }
  }

  adoptStorage()
  // Stores that were not in the backup are at their defaults in memory; save those too.
  flushDefaults(new Set(entries.map(([name]) => name)))
  // The marker was cleared with the rest; leave one behind so other tabs re-read the result.
  announceReplace()
  return { ok: true, restored: entries.map(([name]) => name).sort() }
}

/** Write the current (default) state of every registered store that is not in `skip`. */
function flushDefaults(skip: ReadonlySet<string>): void {
  for (const { name, store } of registeredStores()) {
    if (!skip.has(name)) store.setState(store.getInitialState() as never, true)
  }
}

export type BackupImportResult = { ok: true; backup: BackupFile; restored: string[] } | { ok: false; error: string }

/** Validate the text of a backup file fully, then restore it atomically. */
export async function importBackupText(text: string): Promise<BackupImportResult> {
  const result = parseBackup(text)
  if (!result.ok) return result
  const applied = await applyBackup(result.backup)
  if (!applied.ok) return applied
  return { ok: true, backup: result.backup, restored: applied.restored }
}

/** Wipe every saved store and put the running app back to its defaults. */
export function resetEverything(): void {
  announceReplace()
  resetAllToDefaults()
  clearNamespace()
  // Write the defaults back so the next load starts from a clean, valid save.
  resetAllToDefaults()
  announceReplace()
}

export const backupFileName = (now: Date = new Date()): string => {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `rubikku-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`
}

/** Browser only: download the backup as a file. Returns the file name used. */
export function downloadBackup(now: Date = new Date()): string {
  const name = backupFileName(now)
  const blob = new Blob([serializeBackup(createBackup(now))], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  return name
}
