/**
 * Tiny synthesised sound effects (Web Audio, no audio files).
 *
 *   import { sound } from '../ui'
 *   sound.play('turn')
 *
 * Safe by default: nothing is created until the first user gesture (browsers block audio
 * before that anyway), `play` never throws, and the mute setting is checked on every call.
 */
import { useSettings } from '../store/settings'

export type SoundName = 'turn' | 'tap' | 'tick' | 'success' | 'levelUp' | 'fanfare' | 'error'

type AudioCtor = typeof AudioContext

let ctx: AudioContext | null = null
let master: GainNode | null = null
let unlocked = false
let listening = false
let lastTurnAt = 0

function getCtor(): AudioCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

function ensureContext(): AudioContext | null {
  if (!unlocked) return null
  if (!ctx) {
    const Ctor = getCtor()
    if (!Ctor) return null
    try {
      ctx = new Ctor()
      master = ctx.createGain()
      master.gain.value = 0.5
      master.connect(ctx.destination)
    } catch {
      ctx = null
      return null
    }
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {})
  return ctx
}

/** Start listening for the first tap / key press. Called once from main.tsx. */
export function initSound(): void {
  if (listening || typeof window === 'undefined') return
  listening = true
  const unlock = () => {
    unlocked = true
    window.removeEventListener('pointerdown', unlock, true)
    window.removeEventListener('keydown', unlock, true)
    window.removeEventListener('touchend', unlock, true)
  }
  window.addEventListener('pointerdown', unlock, true)
  window.addEventListener('keydown', unlock, true)
  window.addEventListener('touchend', unlock, true)
}

interface ToneSpec {
  freq: number
  /** Glide to this frequency over the note. */
  to?: number
  at?: number
  dur: number
  gain?: number
  type?: OscillatorType
}

function tone(audio: AudioContext, out: AudioNode, spec: ToneSpec) {
  const start = audio.currentTime + (spec.at ?? 0)
  const osc = audio.createOscillator()
  const env = audio.createGain()
  osc.type = spec.type ?? 'sine'
  osc.frequency.setValueAtTime(spec.freq, start)
  if (spec.to) osc.frequency.exponentialRampToValueAtTime(spec.to, start + spec.dur)
  const peak = spec.gain ?? 0.2
  env.gain.setValueAtTime(0.0001, start)
  env.gain.exponentialRampToValueAtTime(peak, start + 0.008)
  env.gain.exponentialRampToValueAtTime(0.0001, start + spec.dur)
  osc.connect(env).connect(out)
  osc.start(start)
  osc.stop(start + spec.dur + 0.03)
}

/** A short burst of filtered noise: the plastic "tick" of a cube layer snapping into place. */
function click(audio: AudioContext, out: AudioNode, { at = 0, freq = 2400, gain = 0.25, dur = 0.035 } = {}) {
  const start = audio.currentTime + at
  const length = Math.max(1, Math.floor(audio.sampleRate * dur))
  const buffer = audio.createBuffer(1, length, audio.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2
  const source = audio.createBufferSource()
  source.buffer = buffer
  const filter = audio.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = freq
  filter.Q.value = 1.4
  const env = audio.createGain()
  env.gain.value = gain
  source.connect(filter).connect(env).connect(out)
  source.start(start)
}

const RECIPES: Record<SoundName, (audio: AudioContext, out: AudioNode) => void> = {
  // Soft plastic click with a low thud under it; pitch varies a little so repeats feel alive.
  turn: (audio, out) => {
    const jitter = 0.92 + Math.random() * 0.16
    click(audio, out, { freq: 2100 * jitter, gain: 0.22 })
    tone(audio, out, { freq: 190 * jitter, to: 120, dur: 0.06, gain: 0.12, type: 'triangle' })
  },
  tap: (audio, out) => {
    tone(audio, out, { freq: 660, to: 520, dur: 0.05, gain: 0.07, type: 'triangle' })
  },
  // One bright, short "ding" for a correct move or answer (celebration tier: tick).
  tick: (audio, out) => {
    tone(audio, out, { freq: 1318.5, dur: 0.12, gain: 0.08, type: 'triangle' })
    tone(audio, out, { freq: 2637, dur: 0.08, gain: 0.02 })
  },
  // Two rising notes (a fifth): "yes".
  success: (audio, out) => {
    tone(audio, out, { freq: 659.25, dur: 0.16, gain: 0.16, type: 'triangle' })
    tone(audio, out, { freq: 987.77, at: 0.09, dur: 0.3, gain: 0.16, type: 'triangle' })
    tone(audio, out, { freq: 1975.5, at: 0.09, dur: 0.22, gain: 0.04 })
  },
  // A quick major arpeggio with a sparkle on top.
  levelUp: (audio, out) => {
    const notes = [523.25, 659.25, 783.99, 1046.5]
    notes.forEach((freq, i) =>
      tone(audio, out, { freq, at: i * 0.075, dur: i === notes.length - 1 ? 0.5 : 0.18, gain: 0.15, type: 'triangle' }),
    )
    tone(audio, out, { freq: 2093, at: 0.3, dur: 0.4, gain: 0.04 })
  },
  // Milestones: the level-up arpeggio, then a held major chord that rings out.
  fanfare: (audio, out) => {
    const notes = [392, 523.25, 659.25, 783.99]
    notes.forEach((freq, i) => tone(audio, out, { freq, at: i * 0.085, dur: 0.2, gain: 0.13, type: 'triangle' }))
    for (const freq of [523.25, 659.25, 783.99, 1046.5]) tone(audio, out, { freq, at: 0.36, dur: 1.1, gain: 0.07, type: 'triangle' })
    tone(audio, out, { freq: 2093, at: 0.4, dur: 0.7, gain: 0.03 })
  },
  // Low and short, never harsh: "not quite".
  error: (audio, out) => {
    tone(audio, out, { freq: 220, to: 165, dur: 0.14, gain: 0.14, type: 'triangle' })
    tone(audio, out, { freq: 233, to: 175, at: 0.02, dur: 0.14, gain: 0.07, type: 'sine' })
  },
}

export const sound = {
  /** Play a sound if sound is on and the page has been interacted with. Never throws. */
  play(name: SoundName): void {
    try {
      if (!useSettings.getState().sound) return
      const audio = ensureContext()
      if (!audio || !master) return
      if (name === 'turn') {
        // Fast algorithm playback: do not stack clicks closer than 45ms.
        const now = audio.currentTime
        if (now - lastTurnAt < 0.045) return
        lastTurnAt = now
      }
      RECIPES[name](audio, master)
    } catch {
      /* audio is a nicety; never let it break the app */
    }
  },
  /** True once a user gesture has allowed audio. */
  get ready(): boolean {
    return unlocked
  },
}

export const SOUND_NAMES = Object.keys(RECIPES) as SoundName[]
