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
  // increase base and sensitivity so cube hits are much more audible
  const vol = Math.min(0.75 + velocity * 0.9, 1.0)

  // Respect polyphony budget
  const available = Math.max(0, MAX_POLYPHONY - activeVoices)
  if (available <= 0) {
    // No free voices — play a very short, slightly quieter note to reduce pressure
    pad.triggerAttackRelease(note, 0.12, undefined, vol * 0.95)
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

    const dest: any = reverb || Tone.Destination;
    const now = Tone.now();
    const dur = 3.0;

    // gentle master filter to keep things warm
    const masterFilter = new Tone.Filter({ type: 'lowpass', frequency: 1600, Q: 0.9 }).connect(dest);
    masterFilter.frequency.setValueAtTime(1600, now);
    masterFilter.frequency.exponentialRampToValueAtTime(700, now + dur * 0.85);

    // subtle shimmer for spatial richness
    const shimmer = new Tone.Chorus({ frequency: 0.6, delayTime: 2.5, depth: 0.25, spread: 30 }).connect(masterFilter);
    shimmer.start();

    // Warm, slow-evolving pad (two layers for thickness)
    const padA = new Tone.PolySynth(Tone.Synth, ({
      maxPolyphony: 4,
      voice: {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.8, decay: 1.8, sustain: 0.88, release: 2.8 }
      }
    } as any)).connect(masterFilter);
    padA.volume.value = -8;
    padA.triggerAttackRelease(['C2', 'E2', 'G2'], dur, now, 0.56);

    const padB = new Tone.PolySynth(Tone.Synth, ({
      maxPolyphony: 3,
      voice: {
        oscillator: { type: 'triangle' },
        envelope: { attack: 1.0, decay: 1.6, sustain: 0.82, release: 3.0 }
      }
    } as any)).connect(masterFilter);
    padB.volume.value = -10;
    padB.triggerAttackRelease([
      Tone.Frequency('C2').transpose(0.5).toNote(),
      Tone.Frequency('E2').transpose(0.5).toNote(),
      Tone.Frequency('G2').transpose(0.5).toNote()
    ], dur, now, 0.44);

    // A calming, bell-like accent that isn't harsh
    const bell = new Tone.FMSynth({
      modulationIndex: 8,
      harmonicity: 2.2,
      envelope: { attack: 0.004, decay: 1.0, sustain: 0.0, release: 1.8 }
    }).connect(masterFilter);
    bell.volume.value = -6;
    bell.triggerAttackRelease('E4', 0.9, now + 0.12, 0.9);

    // Soft, rounded sub for tactile weight
    const sub = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.02, decay: 0.9, sustain: 0.8, release: 1.8 }
    }).connect(masterFilter);
    sub.volume.value = -9;
    sub.triggerAttackRelease('C1', dur, now, 0.7);

    // Gentle noise riser for a smooth swell
    const noise = new Tone.Noise('pink');
    const noiseGain = new Tone.Gain(0.04).connect(masterFilter);
    noise.connect(noiseGain);
    noise.start(now);
    noiseGain.gain.setValueAtTime(0.02, now);
    noiseGain.gain.linearRampTo(0.08, now + dur * 0.25);
    noiseGain.gain.exponentialRampTo(0.0001, now + dur);

    // Small ping/reverb tail to add sparkle without harshness
    const ping = new Tone.MetalSynth({
      envelope: { attack: 0.004, decay: 1.0, release: 1.6 },
      harmonicity: 4.5,
      modulationIndex: 10,
      resonance: 1500
    }).connect(masterFilter);
    ping.volume.value = -18;
    ping.triggerAttackRelease('G4', 0.8, now + 0.28, 0.5);

    // Melodic motif: gentle, short notes to add a clear melodic identity
    const melody = new Tone.PolySynth(Tone.Synth, ({
      maxPolyphony: 3,
      voice: {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.02, decay: 0.6, sustain: 0.0, release: 1.0 }
      }
    } as any)).connect(masterFilter);
    melody.volume.value = -6;
    const melodyNotes = ['E4', 'G4', 'B4', 'C5'];
    melody.triggerAttackRelease(melodyNotes[0], 0.6, now + 0.18, 0.72);
    melody.triggerAttackRelease(melodyNotes[1], 0.6, now + 0.46, 0.64);
    melody.triggerAttackRelease(melodyNotes[2], 0.8, now + 0.86, 0.56);
    melody.triggerAttackRelease(melodyNotes[3], 1.2, now + 1.36, 0.6);

    // cleanup after sound finished
    setTimeout(() => {
      try { padA.dispose(); } catch (e) {}
      try { padB.dispose(); } catch (e) {}
      try { bell.dispose(); } catch (e) {}
      try { sub.dispose(); } catch (e) {}
      try { ping.dispose(); } catch (e) {}
      try { melody.dispose(); } catch (e) {}
      try { noise.stop(); } catch (e) {}
      try { noise.dispose(); } catch (e) {}
      try { noiseGain.dispose(); } catch (e) {}
      try { shimmer.dispose(); } catch (e) {}
      try { masterFilter.dispose(); } catch (e) {}
    }, Math.ceil(dur * 1000) + 600);
  } catch (e) {
    // swallow errors; non-critical
  }
}
