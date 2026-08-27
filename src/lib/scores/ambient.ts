// Sound engine: superdough  (Tone.js version archived as ambient.tone.ts)
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore – superdough ships no TypeScript declarations
import { superdough,samples, getAudioContext, initAudio, registerSynthSounds, initAudioOnFirstClick } from 'superdough'


const samplesPromise = samples('github:tidalcycles/dirt-samples');
samplesPromise.catch((error: unknown) => {
  console.warn('Audio samples load failed:', error);
});

// ── typed wrappers ────────────────────────────────────────────────────────
type DoughValue = Record<string, unknown>
const dough = superdough as (value: DoughValue, deadline: number, duration: number) => Promise<void>

// ── state ─────────────────────────────────────────────────────────────────
let isRunning = false
let schedulerId: ReturnType<typeof setInterval> | null = null
let lfoPhase = 0

let activeVoices = 0
const MAX_POLYPHONY = 8
let audioInitPromise: Promise<boolean> | null = null

// Ambient scheduling constants
const PAD_INTERVAL_S = 7       // seconds between chord onsets
const PAD_INTERVAL_MS = PAD_INTERVAL_S * 1000
const LFO_FREQ_HZ = 0.01       // very slow filter modulation (~100 s period)

const PAD_CHORDS = [
  ['C3', 'E3', 'G3', 'D4', 'E4'],    // Cmaj9
  ['A2', 'C3', 'E3', 'G3', 'B3'],    // Am7add11
  ['F2', 'A2', 'C3', 'E3', 'G3'],    // Fmaj9
  ['G2', 'B2', 'D3', 'F3', 'A3'],    // G9sus
]

// ── helpers ───────────────────────────────────────────────────────────────
function lfoVal(min: number, max: number): number {
  return min + (max - min) * (0.5 + 0.5 * Math.sin(lfoPhase))
}

function triggerPadChord(deadline: number) {
  const cutoff = Math.round(lfoVal(200, 1200))
  const chord = PAD_CHORDS[Math.floor(Math.random() * PAD_CHORDS.length)]
  for (const note of chord) {
    dough({
      s: 'sine',
      note,
      gain: 0.035,
      attack: 3,
      decay: 2,
      sustain: 0.75,
      release: 7,
      cutoff,
      resonance: 1,
      room: 0.75,
      roomsize: 12,
    }, deadline, PAD_INTERVAL_S + 3)
  }
  // brown-noise texture underneath each chord
  dough({
    s: 'white',
    gain: 0.01,
    attack: 1,
    sustain: 0.6,
    release: 4,
    cutoff: Math.round(cutoff * 0.4),
    room: 0.6,
  }, deadline, PAD_INTERVAL_S + 1)
}

function getSoundContext(): AudioContext | null {
  const ctx = getAudioContext() as AudioContext | null
  return ctx && ctx.state === 'running' ? ctx : null
}

// ── audio init ────────────────────────────────────────────────────────────


async function initAudioInternal(): Promise<boolean> {
  if (audioInitPromise) return audioInitPromise

  audioInitPromise = (async () => {
    try {
      registerSynthSounds();
      await (initAudio as () => Promise<void>)();
    } catch (error: unknown) {
      console.warn("Audio init failed:", error);
    }

    const ctx = getAudioContext() as AudioContext | null;
    if (!ctx) return false;

    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (error: unknown) {
        console.warn("Audio context resume failed:", error);
      }
    }

    const running = ctx.state === 'running';
    if (!running) {
      audioInitPromise = null;
    }
    return running;
  })();

  return audioInitPromise;
}

export async function startAmbient() {
  const ok = await initAudioInternal()
  if (!ok) return

  isRunning = true
  lfoPhase = 0

  if (schedulerId !== null) {
    clearInterval(schedulerId)
  }

  schedulerId = setInterval(() => {
    if (!isRunning) return
    triggerPadChord(Date.now() + 50)
  }, 7000)
}

export async function ensureAudioStarted(): Promise<boolean> {
  return initAudioInternal()
}

// Attach to a user gesture (canvas or document) to resume audio and start ambient
export function resumeAudioOnGesture(element?: HTMLElement | Document) {
  const target: any = element || document
  const fallback: any = document

  try {
    initAudioOnFirstClick?.(target as any)
    if (target !== document) initAudioOnFirstClick?.(fallback)
  } catch {
    // ignore if the helper is not supported or the target is invalid
  }

  const cleanup = () => {
    try { target.removeEventListener('pointerdown', handler) } catch {}
    try { target.removeEventListener('touchstart', handler) } catch {}
    try { target.removeEventListener('keydown', handler) } catch {}
    if (target !== document) {
      try { fallback.removeEventListener('pointerdown', handler) } catch {}
      try { fallback.removeEventListener('touchstart', handler) } catch {}
      try { fallback.removeEventListener('keydown', handler) } catch {}
    }
  }

  const handler = async () => {
    try {
      await initAudioInternal()
    } catch {}
    cleanup()
  }

  const addListeners = (obj: any) => {
    try { obj.addEventListener('pointerdown', handler, { once: true }) } catch {}
    try { obj.addEventListener('touchstart', handler, { once: true }) } catch {}
    try { obj.addEventListener('keydown', handler as any, { once: true }) } catch {}
  }

  addListeners(target)
  if (target !== document) addListeners(fallback)
}

// Uniform rock hit for all collisions: low, dense, and cavernous. The ambient pad
// is disabled, so this is the only sustained texture in the scene.
export function playCollisionNote(velocity: number = 1.0) {
  playCollisionNoteSingle(velocity)
}

export function playCollisionNoteSingle(velocity: number = 1.0) {
  const ctx = getAudioContext() as AudioContext | null
  if (!ctx || ctx.state !== 'running') return

  const hits = ['A1', 'C2', 'D2', 'E2', 'F2', 'G2']
  const note = hits[Math.floor(Math.random() * hits.length)]
  const duration = Math.min(0.22 + velocity * 0.65, 1.8)
  const vol = Math.min(0.9 + velocity * 0.7, 1.7)
  const now = ctx.currentTime

  dough({
    s: 'triangle',
    note,
    gain: vol * 1.1,
    attack: 0.003,
    decay: 0.08,
    sustain: 0.08,
    release: 0.8,
    cutoff: 380 + velocity * 280,
    resonance: 4.5,
    room: 0.95,
    roomsize: 18,
  }, now, duration)

  dough({
    s: 'sawtooth',
    note,
    gain: vol * 0.7,
    attack: 0.004,
    decay: 0.06,
    sustain: 0.04,
    release: 0.6,
    cutoff: 700 + velocity * 1200,
    resonance: 3.2,
    room: 0.9,
    roomsize: 16,
  }, now + 0.015, duration * 0.9)

  dough({
    s: 'white',
    gain: 0.13 + velocity * 0.18,
    attack: 0.002,
    decay: 0.06,
    sustain: 0,
    release: 0.55,
    cutoff: 2500,
    room: 0.9,
    roomsize: 19,
  }, now, duration)
}

export function playLaserFireSound() {
  const ctx = getSoundContext()
  if (!ctx) return

  const now = ctx.currentTime
  const dur = 0.18

  dough({
    s: 'sawtooth',
    note: 'C5',
    gain: 0.12,
    attack: 0.01,
    decay: 0.04,
    sustain: 0.04,
    release: 0.12,
    cutoff: 1800,
    resonance: 1.2,
    room: 0.1,
    roomsize: 1,
  }, now, dur)

  dough({
    s: 'square',
    note: 'G5',
    gain: 0.08,
    attack: 0.005,
    decay: 0.02,
    sustain: 0.02,
    release: 0.08,
    cutoff: 2600,
    resonance: 1.5,
    room: 0.1,
  }, now, dur * 0.9)
}

// Loud, sharp beep for the final countdown seconds
export async function playCountdownBeep() {
  // make sure the audio context is actually resumed instead of silently
  // no-oping when it hasn't been running yet
  const ok = await ensureAudioStarted()
  if (!ok) return

  const ctx = getSoundContext()
  if (!ctx) return

  const now = ctx.currentTime
  const dur = 0.2

  dough({
    s: 'square',
    note: 'A5',
    gain: 1,
    attack: 0.001,
    decay: 0.05,
    sustain: 0.6,
    release: 0.15,
    cutoff: 6000,
    resonance: 1,
    room: 0,
  }, now, dur)

  dough({
    s: 'square',
    note: 'A6',
    gain: 0.5,
    attack: 0.001,
    decay: 0.04,
    sustain: 0.3,
    release: 0.1,
    cutoff: 8000,
    resonance: 1,
    room: 0,
  }, now, dur * 0.8)
}







export function stopAmbient() {
  if (!isRunning) return

  if (schedulerId !== null) {
    clearInterval(schedulerId)
    schedulerId = null
  }

  isRunning = false
  activeVoices = 0
  lfoPhase = 0
  // Currently-playing notes fade out naturally — superdough manages their nodes
}

export function isAmbientRunning() {
  return isRunning
}

// Play a triumphant sound when the drone completes a full revolution
export function playRevolutionComplete(loopCount: number = 1) {
  const ctx = getSoundContext()
  if (!ctx) return

  const chords = [
    ['C4', 'E4', 'G4', 'B4', 'D5'],
    ['G3', 'D4', 'G4', 'B4', 'C5'],
    ['A3', 'C#4', 'E4', 'G#4', 'B4'],
    ['F3', 'A3', 'C4', 'E4', 'G4'],
    ['E3', 'G#3', 'B3', 'D4', 'F#4'],
    ['D3', 'F#3', 'A3', 'B3', 'E4'],
    ['Bb3', 'D4', 'F4', 'A4', 'C5'],
    ['C4', 'G4', 'E5', 'C5'],
  ]

  const chord = chords[Math.abs(loopCount - 1) % chords.length]
  const duration = 3
  const vol = 0.6
  const now = ctx.currentTime

  const available = Math.max(0, MAX_POLYPHONY - activeVoices)
  const notesToPlay = Math.min(chord.length, available)
  if (notesToPlay <= 0) return

  chord.slice(0, notesToPlay).forEach((note, i) => {
    dough({
      s: 'sine',
      note,
      gain: vol,
      attack: 0.1,
      decay: 1,
      sustain: 0.7,
      release: 2.5,
      cutoff: 1400,
      room: 0.6,
      roomsize: 8,
    }, now + i * 0.05, duration)
    activeVoices++
    const ms = Math.ceil((duration + 2.5) * 1000) + 100
    setTimeout(() => { activeVoices = Math.max(0, activeVoices - 1) }, ms)
  })
}

/**
 * Play a short eerie sound for portal collisions.
 */
export async function playPortalSound() {
  try {
    const ok = await ensureAudioStarted()
    if (!ok) return

    const ctx = getSoundContext()
    if (!ctx) return
    const now = ctx.currentTime
    const dur = 3.0

    // Warm pad — layer A (sine)
    for (const note of ['C2', 'E2', 'G2']) {
      dough({
        s: 'sine',
        note,
        gain: 0.38,
        attack: 0.8,
        decay: 1.8,
        sustain: 0.85,
        release: 2.8,
        cutoff: 1600,
        room: 0.7,
        roomsize: 12,
      }, now, dur)
    }

    // Detuned layer B (triangle, fractional MIDI offset)
    const detuneMap: Record<string, number> = { C2: 36, E2: 40, G2: 43 }
    for (const [, midi] of Object.entries(detuneMap)) {
      dough({
        s: 'triangle',
        note: midi + 0.5,
        gain: 0.25,
        attack: 1.0,
        decay: 1.6,
        sustain: 0.8,
        release: 3.0,
        cutoff: 1400,
        room: 0.65,
        roomsize: 14,
      }, now, dur)
    }

    // Bell accent
    dough({
      s: 'sine',
      note: 'E4',
      gain: 0.55,
      attack: 0.004,
      decay: 1.0,
      sustain: 0.0,
      release: 1.8,
      cutoff: 3000,
      room: 0.5,
    }, now + 0.12, 0.9)

    // Sub bass
    dough({
      s: 'sine',
      note: 'C1',
      gain: 0.45,
      attack: 0.02,
      decay: 0.9,
      sustain: 0.8,
      release: 1.8,
      cutoff: 400,
    }, now, dur)

    // Melodic motif
    const motif: Array<[string, number, number]> = [
      ['E4', now + 0.18, 0.6],
      ['G4', now + 0.46, 0.6],
      ['B4', now + 0.86, 0.8],
      ['C5', now + 1.36, 1.2],
    ]
    for (const [note, t, d] of motif) {
      dough({
        s: 'sine',
        note,
        gain: 0.48,
        attack: 0.02,
        decay: 0.6,
        sustain: 0.0,
        release: 1.0,
        cutoff: 2000,
        room: 0.4,
      }, t, d)
    }
  } catch {
    // non-critical
  }
}
