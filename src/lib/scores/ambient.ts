import * as Tone from 'tone'

let pad: Tone.PolySynth | null = null
let texture: Tone.Noise | null = null
let filter: Tone.Filter | null = null
let reverb: Tone.Reverb | null = null
let lfo: Tone.LFO | null = null
let loopId: number | null = null
let activeVoices = 0
const MAX_POLYPHONY = 8

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
    maxPolyphony: MAX_POLYPHONY,
    voice: {
      oscillator: { type: 'sine' },
      envelope: { attack: 8, decay: 2, sustain: 0.8, release: 12 }
    }
  } as any)).connect(filter)

  // gentle evolving noise texture
  texture = new Tone.Noise('brown')
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
  
  // Prevent exceeding max polyphony: only play as many notes as available.
  const available = Math.max(0, MAX_POLYPHONY - activeVoices)
  let notesToPlay = chord.length
  if (available <= 0) {
    // no free voices; fall back to a single, quieter note
    notesToPlay = 1
  } else if (available < chord.length) {
    notesToPlay = available
  }

  chord.slice(0, notesToPlay).forEach((note, i) => {
    pad!.triggerAttackRelease(note, duration, `+${i * 0.1}`, vol)
    // approximate voice usage: increment and schedule decrement after note ends
    activeVoices += 1
    const ms = Math.ceil(duration * 1000) + 100
    setTimeout(() => { activeVoices = Math.max(0, activeVoices - 1) }, ms)
  })
}

// Play a single random note for simple collisions (e.g. boxes)
export function playCollisionNoteSingle(velocity: number = 1.0) {
  if (!pad) return

  const scale = ['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4']
  const note = scale[Math.floor(Math.random() * scale.length)]
  const duration = Math.min(0.25 + velocity * 0.75, 2) // shorter for single hits
  // const vol = Math.min(0.15 + velocity * 0.6, 0.9)
   const vol = 1.0

  // Respect polyphony budget
  const available = Math.max(0, MAX_POLYPHONY - activeVoices)
  if (available <= 0) {
    // No free voices — play a very short, quiet note to reduce pressure
    pad.triggerAttackRelease(note, 0.12, undefined, vol * 0.6)
    return
  }

  pad.triggerAttackRelease(note, duration, undefined, vol)
  activeVoices += 1
  const ms = Math.ceil(duration * 1000) + 80
  setTimeout(() => { activeVoices = Math.max(0, activeVoices - 1) }, ms)
}

export function stopAmbient() {
  if (!pad) return

  Tone.Transport.stop()

  pad.dispose()
  pad = null

  // reset voice tracking
  activeVoices = 0

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

// Play a triumphant sound when the drone completes a full revolution
export function playRevolutionComplete(loopCount: number = 1) {
  if (!pad) return

  // Ascending triumphant chord progression
  // Expanded celebratory chord palette (extended and voiced for richness)
  const chords = [
    ['C4', 'E4', 'G4', 'B4', 'D5'],    // Cmaj9
    ['G3', 'D4', 'G4', 'B4', 'C5'],     // Gsus4(add9) — open, uplifting
    ['A3', 'C#4', 'E4', 'G#4', 'B4'],   // Amaj7(add9) — bright
    ['F3', 'A3', 'C4', 'E4', 'G4'],     // Fmaj9 — warm
    ['E3', 'G#3', 'B3', 'D4', 'F#4'],   // Em9 — slightly wistful
    ['D3', 'F#3', 'A3', 'B3', 'E4'],    // D6/9-ish — jazzy lift
    ['Bb3', 'D4', 'F4', 'A4', 'C5'],    // Bbmaj9 — triumphant color
    ['C4', 'G4', 'E5', 'C5']            // high-register spread triad for sparkle
  ]

  // Pick chord based on loop count for variety
  const chord = chords[Math.abs(loopCount - 1) % chords.length]
  const duration = 3
  const vol = 0.6

  // Respect polyphony budget
  const available = Math.max(0, MAX_POLYPHONY - activeVoices)
  const notesToPlay = Math.min(chord.length, available)
  if (notesToPlay <= 0) return

  chord.slice(0, notesToPlay).forEach((note, i) => {
    pad!.triggerAttackRelease(note, duration, `+${i * 0.05}`, vol)
    activeVoices += 1
    const ms = Math.ceil(duration * 1000) + 100
    setTimeout(() => { activeVoices = Math.max(0, activeVoices - 1) }, ms)
  })
}

/**
 * Play a short eerie sound for portal collisions.
 */
export async function playPortalSound() {
  try {
    console.debug('[ambient] playPortalSound() called');
    const ok = await ensureAudioStarted();
    console.debug('[ambient] ensureAudioStarted ->', ok);
    if (!ok) return; // user gesture required or audio blocked

    // Use existing reverb if available, otherwise destination
    const dest: any = reverb || Tone.Destination;
    // Dungeon-like, bass-forward variant: master lowpass, big drone + sub, deep thump, softened metallics, low arp, subtle noise
    const now = Tone.now()
    const dur = 4.0

    // Master lowpass filter to remove excessive highs and emphasize low-mid
    const masterFilter = new Tone.Filter({ type: 'lowpass', frequency: 1200, Q: 0.8 }).connect(dest)
    // gently move cutoff downward for darker result
    masterFilter.frequency.setValueAtTime(1200, now)
    masterFilter.frequency.exponentialRampToValueAtTime(600, now + dur * 0.6)

    // Low sustaining drone (thickened by two detuned voices)
    const droneA = new Tone.Synth({
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.5, decay: 2.8, sustain: 0.8, release: 3.6 }
    }).connect(masterFilter)
    const droneB = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.6, decay: 2.8, sustain: 0.72, release: 3.6 }
    }).connect(masterFilter)
    droneA.volume.value = -8
    droneB.volume.value = -10
    droneA.triggerAttack('C1', now)
    // slight detune for warmth
    droneB.triggerAttack(Tone.Frequency('C1').transpose(-0.02), now)

    // Sub-bass fundamental for weight
    const sub = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.02, decay: 1.8, sustain: 0.9, release: 2.8 }
    }).connect(masterFilter)
    sub.volume.value = -6
    sub.triggerAttack('C0', now)

    // Deeper, rounder thump
    const thump = new Tone.MembraneSynth({
      pitchDecay: 0.12,
      octaves: 2,
      envelope: { attack: 0.001, decay: 0.9, sustain: 0 }
    }).connect(masterFilter)
    thump.triggerAttackRelease('C1', 0.9, now + 0.02, 1.0)

    // Soft metallic resonance reduced in level (adds texture but not sharpness)
    const metal = new Tone.MetalSynth({
      envelope: { attack: 0.004, decay: 1.2, release: 1.8 },
      harmonicity: 3.5,
      modulationIndex: 18,
      resonance: 3000
    }).connect(masterFilter)
    metal.volume.value = -18
    metal.triggerAttackRelease('C2', 1.2, now + 0.06)

    // Lower-register arpeggiated cluster for unease (more bassy)
    const arp = new Tone.PolySynth(Tone.Synth, ({
      maxPolyphony: 4,
      voice: {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.02, decay: 1.2, sustain: 0.0, release: 2.0 }
      }
    } as any)).connect(masterFilter)
    arp.triggerAttackRelease(['C2', 'Db2', 'E2'], 1.6, now + 0.18, 0.36)
    arp.triggerAttackRelease(['B1', 'C2', 'Eb2'], 1.6, now + 0.9, 0.28)

    // Subtle, lower-level noise swell
    const noise = new Tone.Noise('pink')
    const ng = new Tone.Gain(0.06).connect(masterFilter)
    noise.connect(ng)
    noise.start(now)
    ng.gain.setValueAtTime(0.06, now)
    ng.gain.exponentialRampTo(0.0001, dur)

    // Schedule release and cleanup
    setTimeout(() => {
      try { droneA.triggerRelease(); } catch (e) {}
      try { droneB.triggerRelease(); } catch (e) {}
      try { sub.triggerRelease(); } catch (e) {}
      try { noise.stop(); } catch (e) {}
      try { droneA.dispose(); } catch (e) {}
      try { droneB.dispose(); } catch (e) {}
      try { sub.dispose(); } catch (e) {}
      try { thump.dispose(); } catch (e) {}
      try { metal.dispose(); } catch (e) {}
      try { arp.dispose(); } catch (e) {}
      try { ng.dispose(); } catch (e) {}
      try { masterFilter.dispose(); } catch (e) {}
    }, Math.ceil(dur * 1000) + 400)
  } catch (e) {
    // swallow errors; this is non-critical
  }
}
