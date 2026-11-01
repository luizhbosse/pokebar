// Golpes: quais o motor suporta (D6), valor de cada golpe e golpes conhecidos por nível.
import { MOVES, species } from './data'
import type { Move, Species, Status } from './types'

/** Golpes fora do escopo (2 turnos, recarga, auto-nocaute, OHKO, mecânicas especiais). */
const EXCLUDED = new Set([
  'horn-drill', 'fissure', 'guillotine', 'mirror-coat', 'counter', 'bide', 'beat-up',
  'solar-beam', 'razor-wind', 'skull-bash', 'sky-attack', 'fly', 'dig', 'hyper-beam',
  'self-destruct', 'explosion', 'future-sight', 'snore', 'sleep-talk'
])

/** Dano fixo: número, 'level' (= nível do atacante), 'half' (metade do HP atual) ou 'psywave'. */
export const FIXED_DAMAGE: Record<string, number | 'level' | 'half' | 'psywave'> = {
  'seismic-toss': 'level',
  'night-shade': 'level',
  'dragon-rage': 40,
  'sonic-boom': 20,
  'super-fang': 'half',
  psywave: 'psywave'
}

/** Poder médio para golpes de poder variável. */
const POWER_OVERRIDE: Record<string, number> = {
  magnitude: 70,
  'low-kick': 60,
  reversal: 60,
  flail: 60,
  present: 40
}

export const SUPPORTED_AILMENTS: Status[] = ['sleep', 'paralysis', 'poison', 'burn']
export const POWDER_MOVES = new Set(['sleep-powder', 'stun-spore', 'poison-powder', 'spore'])
export const PUNCH_MOVES = new Set([
  'fire-punch', 'ice-punch', 'thunder-punch', 'mega-punch', 'comet-punch', 'dizzy-punch', 'dynamic-punch', 'mach-punch'
])

export function movePower(m: Move): number {
  return POWER_OVERRIDE[m.slug] ?? m.power ?? 0
}

export function isStatusMove(m: Move): boolean {
  return m.category === 'status'
}

export function isUsable(slug: string): boolean {
  const m = MOVES[slug]
  if (!m || EXCLUDED.has(slug)) return false
  if (m.meta?.category === 'ohko') return false
  if (m.category === 'status') {
    return !!m.meta && (SUPPORTED_AILMENTS as string[]).includes(m.meta.ailment)
  }
  return movePower(m) > 0 || slug in FIXED_DAMAGE
}

/** Valor "de bolso" para decidir quais 4 golpes manter (sem olhar o alvo). */
export function staticMoveValue(sp: Species, slug: string): number {
  const m = MOVES[slug]
  if (!m || !isUsable(slug)) return -1
  if (isStatusMove(m)) return 45
  const acc = (m.accuracy ?? 100) / 100
  const fixed = FIXED_DAMAGE[slug]
  if (fixed !== undefined) return 50 * acc
  const hits = m.meta?.minHits ? (m.meta.minHits + (m.meta.maxHits ?? m.meta.minHits)) / 2 : 1
  const stab = sp.types.includes(m.type) ? 1.5 : 1
  const atk = m.category === 'physical' ? sp.baseStats.atk : sp.baseStats.spa
  return movePower(m) * hits * acc * stab * (0.6 + atk / 250)
}

/** Golpes usáveis aprendidos até `level`, na ordem em que foram aprendidos. */
export function movesUpTo(speciesId: number, level: number): string[] {
  const out: string[] = []
  for (const [lv, slug] of species(speciesId).learnset) {
    if (lv <= level && isUsable(slug) && !out.includes(slug)) out.push(slug)
  }
  return out
}

/** Escolhe até 4 golpes: os de maior valor, no máximo 1 de status. */
export function bestFour(speciesId: number, candidates: string[]): string[] {
  const sp = species(speciesId)
  const uniq = [...new Set(candidates)].filter(isUsable)
  uniq.sort((a, b) => staticMoveValue(sp, b) - staticMoveValue(sp, a))
  const out: string[] = []
  let status = 0
  for (const slug of uniq) {
    if (out.length >= 4) break
    if (isStatusMove(MOVES[slug])) {
      if (status >= 1) continue
      status++
    }
    out.push(slug)
  }
  if (out.length === 0) out.push('tackle')
  return out
}

/** Golpes de um Pokémon selvagem: os últimos 4 aprendidos (como nos jogos), filtrando os não suportados. */
export function wildMoves(speciesId: number, level: number): string[] {
  const learned = movesUpTo(speciesId, level)
  const last = learned.slice(-4)
  return last.length ? last : ['tackle']
}

/** Golpes novos aprendidos exatamente ao chegar em `level`. */
export function movesLearnedAt(speciesId: number, level: number): string[] {
  return species(speciesId)
    .learnset.filter(([lv, slug]) => lv === level && isUsable(slug))
    .map(([, slug]) => slug)
}
