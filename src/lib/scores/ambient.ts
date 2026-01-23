import * as Tone from 'tone'

let pad: Tone.PolySynth | null = null
let texture: Tone.Noise | null = null
let filter: Tone.Filter | null = null
let reverb: Tone.Reverb | null = null
let lfo: Tone.LFO | null = null
let loopId: number | null = null

export async function startAmbient() {
  if (Tone.context.state !== 'running') {
    try {
      await Tone.start()
    } catch (e) {
      // user gesture required in some browsers; caller should ensure gesture
    }
  }

  if (pad) return // already started

  reverb = new Tone.Reverb({ decay: 15, wet: 0.7 }).toDestination()

  filter = new Tone.Filter({ frequency: 800, Q: 1, type: 'lowpass' }).connect(reverb)

  pad = new Tone.PolySynth(Tone.Synth, ({
    maxPolyphony: 8,
    voice: {
      oscillator: { type: 'sine' },
      envelope: { attack: 8, decay: 2, sustain: 0.8, release: 12 }
    }
  } as any)).connect(filter)

  // gentle evolving noise texture
  texture = new Tone.Noise('pink')
  const textureFilter = new Tone.Filter(600, 'lowpass').connect(reverb)
  const textureGain = new Tone.Gain(0.2).connect(textureFilter)
  texture.connect(textureGain)

  // very slow LFO to move the filter cutoff
  lfo = new Tone.LFO({ frequency: 0.01, min: 200, max: 1200 }).start()
  if (filter) lfo.connect(filter.frequency)
  
  texture.start()

  Tone.Transport.start()

}

export async function ensureAudioStarted(): Promise<boolean> {
  if (Tone.context.state === 'running') return true
  try {
    await Tone.start()
  } catch (e) {
    return (Tone.context.state as any) === 'running'
  }
  return (Tone.context.state as any) === 'running'
}

// Attach to a user gesture (canvas or document) to resume audio and start ambient
export function resumeAudioOnGesture(element?: HTMLElement | Document) {
  const target: any = element || document
  const handler = async () => {
    try {
      await startAmbient()
    } catch (e) {
      // ignore — some environments may still block
    }
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
  if (!pad) return
  
  // chord pool for collision events
  const chords = [
    ['C3', 'E3', 'G3', 'D4', 'E4'],     // Cmaj9
    ['A2', 'C3', 'E3', 'G3', 'B3'],     // Am7add11
    ['F2', 'A2', 'C3', 'E3', 'G3'],     // Fmaj9
    ['G2', 'B2', 'D3', 'F3', 'A3'],     // G9sus
    ['D3', 'F#3', 'A3', 'C4', 'E4'],    // Dmaj9
    ['E2', 'G#2', 'B2', 'D3', 'F#3']    // Emaj7add11
  ]
  
  // pick random chord based on velocity
  const chord = chords[Math.floor(Math.random() * chords.length)]
  const duration = Math.min(4 + velocity * 8, 12) // 4-12 seconds based on impact
  const vol = Math.min(0.3 + velocity * 0.5, 0.8)
  
  chord.forEach((note, i) => {
    pad!.triggerAttackRelease(note, duration, `+${i * 0.1}`, vol)
  })
}

export function stopAmbient() {
  if (!pad) return

  Tone.Transport.stop()

  pad.dispose()
  pad = null

  if (texture) {
    texture.dispose()
    texture = null
  }
  if (filter) {
    filter.dispose()
    filter = null
  }
  if (reverb) {
    reverb.dispose()
    reverb = null
  }
  if (lfo) {
    lfo.dispose()
    lfo = null
  }
}

export function isAmbientRunning() {
  return !!pad
}
