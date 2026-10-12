import { state } from './store.js'

let ctx

function tone(freq, start, dur, { type = 'triangle', gain = 0.12, to } = {}) {
  ctx ??= new AudioContext()
  const t = ctx.currentTime + start
  const osc = ctx.createOscillator(), amp = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur)
  amp.gain.setValueAtTime(0, t)
  amp.gain.linearRampToValueAtTime(gain, t + 0.012)
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(amp).connect(ctx.destination)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

const cues = {
  tap: () => tone(1400, 0, 0.04, { type: 'sine', gain: 0.05 }),
  right: () => { tone(784, 0, 0.12); tone(1175, 0.09, 0.22) },
  wrong: () => tone(196, 0, 0.26, { type: 'square', gain: 0.05, to: 147 }),
  done: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.35, { gain: 0.1 })),
}

export function play(name) {
  if (!state.sound) return
  try { cues[name]() } catch {}
}
