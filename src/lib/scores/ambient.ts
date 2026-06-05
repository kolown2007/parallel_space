// Sound engine: superdough  (Tone.js version archived as ambient.tone.ts)
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore – superdough ships no TypeScript declarations
import { superdough,samples, getAudioContext, initAudio, registerSynthSounds, initAudioOnFirstClick } from 'superdough'


const samplesPromise = samples('github:tidalcycles/dirt-samples');

// ── typed wrappers ────────────────────────────────────────────────────────
type DoughValue = Record<string, unknown>
const dough = superdough as (value: DoughValue, deadline: number, duration: number) => Promise<void>

// ── state ─────────────────────────────────────────────────────────────────
let isRunning = false
let schedulerId: ReturnType<typeof setInterval> | null = null
let lfoPhase = 0

let activeVoices = 0
const MAX_POLYPHONY = 8

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
      gain: 0.08,
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
    gain: 0.025,
    attack: 1,
    sustain: 0.6,
    release: 4,
    cutoff: Math.round(cutoff * 0.4),
    room: 0.6,
  }, deadline, PAD_INTERVAL_S + 1)
}

// ── audio init ────────────────────────────────────────────────────────────


async function ensureContext(): Promise<boolean> {
  try {
    // Registers the synthesizer sounds (sawtooth, etc.)
    registerSynthSounds();
    
    // Wakes up the main audio driver
    await (initAudio as () => Promise<void>)();
    
    // CRITICAL: Makes sure the background sample downloads are 100% finished
    await samplesPromise; 
    
    // Double-checks that the browser actually let the audio start
    const ctx = getAudioContext() as AudioContext;
    if (ctx.state === 'suspended') await ctx.resume();
    
    return ctx.state === 'running';
  } catch (error) {
    console.error("Audio initialization failed:", error);
    return false;
  }
}

export async function startAmbient() {
  if (isRunning) return

  const ok = await ensureContext()
  if (!ok) return

  const ctx = getAudioContext() as AudioContext
  lfoPhase = 0
  isRunning = true

  // Fire first chord immediately, then schedule repeating chords
  triggerPadChord(ctx.currentTime + 0.05)

  schedulerId = setInterval(() => {
    if (!isRunning) return
    // Advance LFO one interval's worth of phase
    lfoPhase = (lfoPhase + LFO_FREQ_HZ * PAD_INTERVAL_S * 2 * Math.PI) % (Math.PI * 2)
    const ac = getAudioContext() as AudioContext
    triggerPadChord(ac.currentTime + 0.05)
  }, PAD_INTERVAL_MS)
}

export async function ensureAudioStarted(): Promise<boolean> {
  return ensureContext()
}

// Attach to a user gesture (canvas or document) to resume audio and start ambient
export function resumeAudioOnGesture(element?: HTMLElement | Document) {
  const target: any = element || document
  const handler = async () => {
    try { await startAmbient() } catch {}
    try { target.removeEventListener('pointerdown', handler) } catch {}
    try { target.removeEventListener('touchstart', handler) } catch {}
    try { target.removeEventListener('keydown', handler) } catch {}
  }
  try { target.addEventListener('pointerdown', handler, { once: true }) } catch {}
  try { target.addEventListener('touchstart', handler, { once: true }) } catch {}
  try { target.addEventListener('keydown', handler as any, { once: true }) } catch {}
}

// Trigger piano notes on collision events
export function playCollisionNote(velocity: number = 1.0) {
  if (!isRunning) return

  const ctx = getAudioContext() as AudioContext
  if (ctx.state !== 'running') return

  const chords = [
    ['C3', 'E3', 'G3', 'D4', 'E4'],
    ['A2', 'C3', 'E3', 'G3', 'B3'],
    ['F2', 'A2', 'C3', 'E3', 'G3'],
    ['G2', 'B2', 'D3', 'F3', 'A3'],
    ['D3', 'F#3', 'A3', 'C4', 'E4'],
    ['E2', 'G#2', 'B2', 'D3', 'F#3'],
  ]

  const chord = chords[Math.floor(Math.random() * chords.length)]
  const duration = Math.min(4 + velocity * 8, 12)
  const vol = Math.min(0.3 + velocity * 0.5, 0.8)

  const available = Math.max(0, MAX_POLYPHONY - activeVoices)
  if (available <= 0) return

  const notesToPlay = Math.min(chord.length, available)
  const now = ctx.currentTime

  chord.slice(0, notesToPlay).forEach((note, i) => {
    dough({
      s: 'sine',
      note,
      gain: vol,
      attack: 1.5,
      decay: 1,
      sustain: 0.8,
      release: 4,
      cutoff: 900,
      room: 0.6,
      roomsize: 10,
    }, now + i * 0.1, duration)
    activeVoices++
    const ms = Math.ceil((duration + 4) * 1000) + 100
    setTimeout(() => { activeVoices = Math.max(0, activeVoices - 1) }, ms)
  })
}

// Play a single random note for simple collisions (e.g. boxes)
// export function playCollisionNoteSingle(velocity: number = 1.0) {
//   if (!isRunning) return

//   const ctx = getAudioContext() as AudioContext
//   if (ctx.state !== 'running') return

//   const scale = ['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4']
//   const note = scale[Math.floor(Math.random() * scale.length)]
//   const duration = Math.min(0.25 + velocity * 0.75, 2)
//   const vol = Math.min(0.75 + velocity * 0.9, 1.0)
//   const now = ctx.currentTime

//   const available = Math.max(0, MAX_POLYPHONY - activeVoices)
//   if (available <= 0) {
//     dough({
//       s: 'triangle',
//       note,
//       gain: vol * 0.6,
//       attack: 0.01,
//       sustain: 0.0,
//       release: 0.12,
//     }, now, 0.12)
//     return
//   }

//   dough({
//     s: 'triangle',
//     note,
//     gain: vol,
//     attack: 0.02,
//     sustain: 0.3,
//     release: 0.5,
//     cutoff: 1200,
//   }, now, duration)
//   activeVoices++
//   const ms = Math.ceil((duration + 0.5) * 1000) + 80
//   setTimeout(() => { activeVoices = Math.max(0, activeVoices - 1) }, ms)
// }

export function playCollisionNoteSingle(velocity: number = 1.0) {
  if (!isRunning) return

  const ctx = getAudioContext() as AudioContext
  if (ctx.state !== 'running') return

  const scale = ['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4']
  const note = scale[Math.floor(Math.random() * scale.length)]
  const duration = Math.min(0.25 + velocity * 0.75, 2)
  const vol = Math.min(0.75 + velocity * 0.9, 1.0)
  const now = ctx.currentTime

  dough({s:'bd'}, now, duration),
   dough({s:'sd'}, now, duration)
 
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
  if (!isRunning) return

  const ctx = getAudioContext() as AudioContext
  if (ctx.state !== 'running') return

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

    const ctx = getAudioContext() as AudioContext
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
