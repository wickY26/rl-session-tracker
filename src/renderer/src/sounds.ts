import type { SoundName } from '../../shared/api'

/** Short feedback tones: no audio files, generated with Web Audio. */
const TONES: Record<SoundName, { freq: number; at: number; dur: number; type?: OscillatorType }[]> = {
  capture: [{ freq: 880, at: 0, dur: 0.07 }],
  ready: [
    { freq: 660, at: 0, dur: 0.08 },
    { freq: 990, at: 0.09, dur: 0.1 }
  ],
  saved: [
    { freq: 523, at: 0, dur: 0.09 },
    { freq: 659, at: 0.09, dur: 0.09 },
    { freq: 784, at: 0.18, dur: 0.16 }
  ],
  error: [
    { freq: 220, at: 0, dur: 0.14, type: 'square' },
    { freq: 196, at: 0.16, dur: 0.18, type: 'square' }
  ],
  undo: [
    { freq: 784, at: 0, dur: 0.08 },
    { freq: 523, at: 0.09, dur: 0.14 }
  ]
}

let ctx: AudioContext | null = null

export function playSound(name: SoundName): void {
  ctx ??= new AudioContext()
  const now = ctx.currentTime
  for (const tone of TONES[name]) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = tone.type ?? 'sine'
    osc.frequency.value = tone.freq
    const start = now + tone.at
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(tone.type === 'square' ? 0.06 : 0.18, start + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.dur)
    osc.connect(gain).connect(ctx.destination)
    osc.start(start)
    osc.stop(start + tone.dur + 0.02)
  }
}
