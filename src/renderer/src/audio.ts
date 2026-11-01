// Áudio (D14): gritos clássicos da PokeAPI + efeitos sintetizados + trilha chiptune original.
import type { Settings } from '../../shared/state'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let musicGain: GainNode | null = null
const cries = new Map<number, AudioBuffer>()
let settings: Settings | null = null

function ac(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext()
    master = ctx.createGain()
    master.connect(ctx.destination)
    musicGain = ctx.createGain()
    musicGain.connect(master)
    applyVolumes()
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

export function configureAudio(s: Settings): void {
  settings = s
  applyVolumes()
  if (s.music) music.start()
  else music.stop()
}

function applyVolumes(): void {
  if (!settings || !master || !musicGain) return
  master.gain.value = settings.volume
  musicGain.gain.value = settings.musicVolume
}

export async function playCry(speciesId: number, important = false): Promise<void> {
  if (!settings?.cries) return
  if (!important && !settings.battleSounds) return
  const c = ac()
  try {
    let buf = cries.get(speciesId)
    if (!buf) {
      const res = await fetch(`cries/${speciesId}.ogg`)
      buf = await c.decodeAudioData(await res.arrayBuffer())
      if (cries.size > 40) cries.delete(cries.keys().next().value as number)
      cries.set(speciesId, buf)
    }
    const src = c.createBufferSource()
    src.buffer = buf
    const g = c.createGain()
    g.gain.value = 0.55
    src.connect(g).connect(master as GainNode)
    src.start()
  } catch {
    // sem grito para esta espécie: ignora
  }
}

// ------------------------------------------------------------ efeitos

type Sfx =
  | 'hit' | 'super' | 'weak' | 'miss' | 'faint' | 'throw' | 'shake' | 'caught' | 'escape'
  | 'levelup' | 'evolve' | 'badge' | 'shiny' | 'money' | 'heal' | 'click'

/** Efeitos que tocam mesmo com "sons de batalha" desligados. */
const IMPORTANT: Sfx[] = ['caught', 'evolve', 'badge', 'shiny', 'click']

function tone(
  c: AudioContext,
  freq: number,
  start: number,
  dur: number,
  type: OscillatorType,
  vol = 0.15,
  slideTo?: number,
  dest: AudioNode = master as GainNode
): void {
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, start)
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur)
  g.gain.setValueAtTime(0.0001, start)
  g.gain.exponentialRampToValueAtTime(vol, start + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  o.connect(g).connect(dest)
  o.start(start)
  o.stop(start + dur + 0.02)
}

function noise(c: AudioContext, start: number, dur: number, vol = 0.12, dest: AudioNode = master as GainNode): void {
  const len = Math.floor(c.sampleRate * dur)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len)
  const src = c.createBufferSource()
  src.buffer = buf
  const g = c.createGain()
  g.gain.value = vol
  src.connect(g).connect(dest)
  src.start(start)
}

const arpeggio = (c: AudioContext, notes: number[], step: number, type: OscillatorType = 'square', vol = 0.1): void => {
  const t = c.currentTime
  notes.forEach((f, i) => tone(c, f, t + i * step, step * 1.6, type, vol))
}

export function sfx(name: Sfx): void {
  if (!settings?.sfx) return
  if (!IMPORTANT.includes(name) && !settings.battleSounds) return
  const c = ac()
  const t = c.currentTime
  switch (name) {
    case 'hit':
      noise(c, t, 0.12, 0.18)
      tone(c, 180, t, 0.1, 'square', 0.08, 90)
      break
    case 'super':
      noise(c, t, 0.2, 0.22)
      tone(c, 260, t, 0.18, 'square', 0.1, 70)
      break
    case 'weak':
      noise(c, t, 0.08, 0.08)
      break
    case 'miss':
      tone(c, 600, t, 0.15, 'triangle', 0.06, 300)
      break
    case 'faint':
      tone(c, 400, t, 0.5, 'square', 0.08, 60)
      break
    case 'throw':
      tone(c, 300, t, 0.25, 'triangle', 0.08, 900)
      break
    case 'shake':
      tone(c, 140, t, 0.08, 'square', 0.08)
      break
    case 'caught':
      arpeggio(c, [523, 659, 784, 1047], 0.09)
      break
    case 'escape':
      tone(c, 500, t, 0.2, 'square', 0.08, 200)
      break
    case 'levelup':
      arpeggio(c, [659, 784, 988, 1319], 0.07)
      break
    case 'evolve':
      arpeggio(c, [392, 494, 587, 784, 988, 1175, 1568], 0.1, 'square', 0.09)
      break
    case 'badge':
      arpeggio(c, [523, 523, 523, 659, 784, 659, 784, 1047], 0.12, 'square', 0.1)
      break
    case 'shiny':
      arpeggio(c, [1568, 2093, 2637, 3136], 0.06, 'sine', 0.08)
      break
    case 'money':
      arpeggio(c, [988, 1319], 0.06, 'square', 0.06)
      break
    case 'heal':
      arpeggio(c, [523, 659, 784], 0.08, 'triangle', 0.08)
      break
    case 'click':
      tone(c, 900, t, 0.04, 'square', 0.04)
      break
  }
}

// ------------------------------------------------------------ trilha chiptune original

/** Gera e toca em loop uma trilha simples e original (não é a música oficial). */
class Music {
  private timer: number | null = null
  private region: 'johto' | 'kanto' = 'johto'
  private step = 0
  private nextTime = 0
  private melody: number[] = []
  private bass: number[] = []

  setRegion(r: 'johto' | 'kanto'): void {
    if (r === this.region && this.melody.length) return
    this.region = r
    this.compose()
  }

  private compose(): void {
    // Semente fixa por região: a mesma trilha toda vez.
    let seed = this.region === 'johto' ? 1337 : 4242
    const rnd = (): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x7fffffff
    }
    const root = this.region === 'johto' ? 62 : 60 // Ré maior / Dó maior (MIDI)
    const scale = [0, 2, 4, 7, 9, 12, 14, 16] // pentatônica + oitava
    const chords = this.region === 'johto' ? [0, 9, 5, 7] : [0, 5, 9, 7] // graus em semitons
    this.melody = []
    this.bass = []
    let idx = 3
    for (let bar = 0; bar < 8; bar++) {
      const chord = chords[bar % 4]
      for (let s = 0; s < 8; s++) {
        idx = Math.max(0, Math.min(scale.length - 1, idx + Math.round((rnd() - 0.5) * 3)))
        const rest = rnd() < 0.22
        this.melody.push(rest ? -1 : root + 12 + scale[idx])
        this.bass.push(s % 2 === 0 ? root - 12 + chord : -1)
      }
    }
  }

  start(): void {
    if (this.timer !== null) return
    if (!this.melody.length) this.compose()
    const c = ac()
    this.nextTime = c.currentTime + 0.1
    this.timer = window.setInterval(() => this.schedule(), 50)
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer)
    this.timer = null
  }

  private schedule(): void {
    const c = ac()
    const stepDur = 60 / 96 / 2 // colcheia a 96 bpm
    while (this.nextTime < c.currentTime + 0.2) {
      const m = this.melody[this.step % this.melody.length]
      const b = this.bass[this.step % this.bass.length]
      const midi = (n: number): number => 440 * Math.pow(2, (n - 69) / 12)
      if (m > 0) tone(c, midi(m), this.nextTime, stepDur * 0.9, 'square', 0.05, undefined, musicGain as GainNode)
      if (b > 0) tone(c, midi(b), this.nextTime, stepDur * 1.8, 'triangle', 0.09, undefined, musicGain as GainNode)
      if (this.step % 4 === 2) noise(c, this.nextTime, 0.03, 0.03, musicGain as GainNode)
      this.nextTime += stepDur
      this.step++
    }
  }
}

export const music = new Music()
