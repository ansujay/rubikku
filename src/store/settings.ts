import { createPersistedStore, isRecord } from './persist'

export type ThemeChoice = 'system' | 'light' | 'dark'
export type MotionChoice = 'full' | 'reduced'

export const TURN_SPEED_MIN = 0.5
export const TURN_SPEED_MAX = 2
export const TURN_SPEED_STEP = 0.25
/** Duration of one quarter turn at speed 1. */
export const BASE_TURN_MS = 320

export interface SettingsState {
  /** `system` follows the device; the resolved value comes from `useTheme()` in src/ui. */
  theme: ThemeChoice
  sound: boolean
  /** `reduced` turns off decorative motion. The system preference also forces reduced. */
  motion: MotionChoice
  /** Multiplier for cube turn animation: 0.5 (slow) … 2 (fast). See `turnDurationMs`. */
  turnSpeed: number
  /** Show the U/D/L/R/F/B letters on the cube's centres. */
  showFaceLabels: boolean

  setTheme: (theme: ThemeChoice) => void
  setSound: (on: boolean) => void
  setMotion: (motion: MotionChoice) => void
  setTurnSpeed: (speed: number) => void
  setShowFaceLabels: (show: boolean) => void
}

export const clampTurnSpeed = (speed: number): number => {
  if (!Number.isFinite(speed)) return 1
  const stepped = Math.round(speed / TURN_SPEED_STEP) * TURN_SPEED_STEP
  return Math.min(TURN_SPEED_MAX, Math.max(TURN_SPEED_MIN, stepped))
}

/** Milliseconds for one quarter turn at the given speed setting. */
export const turnDurationMs = (speed: number): number => Math.round(BASE_TURN_MS / clampTurnSpeed(speed))

const THEMES: readonly ThemeChoice[] = ['system', 'light', 'dark']
const MOTIONS: readonly MotionChoice[] = ['full', 'reduced']

export function sanitizeSettings(persisted: unknown): Partial<SettingsState> {
  if (!isRecord(persisted)) return {}
  const out: Partial<SettingsState> = {}
  if (THEMES.includes(persisted.theme as ThemeChoice)) out.theme = persisted.theme as ThemeChoice
  if (MOTIONS.includes(persisted.motion as MotionChoice)) out.motion = persisted.motion as MotionChoice
  if (typeof persisted.sound === 'boolean') out.sound = persisted.sound
  if (typeof persisted.turnSpeed === 'number') out.turnSpeed = clampTurnSpeed(persisted.turnSpeed)
  if (typeof persisted.showFaceLabels === 'boolean') out.showFaceLabels = persisted.showFaceLabels
  return out
}

export const useSettings = createPersistedStore<SettingsState>(
  {
    name: 'settings',
    version: 1,
    // v1 is the first shape; unknown future versions are sanitised field by field.
    migrate: (persisted) => persisted,
    sanitize: sanitizeSettings,
  },
  (set) => ({
    theme: 'system',
    sound: true,
    motion: 'full',
    turnSpeed: 1,
    showFaceLabels: false,

    setTheme: (theme) => set({ theme }),
    setSound: (sound) => set({ sound }),
    setMotion: (motion) => set({ motion }),
    setTurnSpeed: (speed) => set({ turnSpeed: clampTurnSpeed(speed) }),
    setShowFaceLabels: (showFaceLabels) => set({ showFaceLabels }),
  }),
)
