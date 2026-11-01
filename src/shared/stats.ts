// Status, naturezas, IV e curvas de experiência (fórmulas modernas, sem EVs — D7).
import { species } from './data'
import { chance, pick, randInt } from './rng'
import { BALANCE } from './balance'
import type { Gender, OwnedMon, Species, StatKey, Stats } from './types'

export const STAT_KEYS: StatKey[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe']
export const STAT_LABEL: Record<StatKey, string> = {
  hp: 'HP',
  atk: 'Ataque',
  def: 'Defesa',
  spa: 'At. Esp.',
  spd: 'Def. Esp.',
  spe: 'Velocidade'
}

/** 25 naturezas: [atributo +10%, atributo -10%] (neutras repetem o mesmo). */
export const NATURES: Record<string, [StatKey, StatKey]> = {
  Hardy: ['atk', 'atk'], Lonely: ['atk', 'def'], Brave: ['atk', 'spe'], Adamant: ['atk', 'spa'], Naughty: ['atk', 'spd'],
  Bold: ['def', 'atk'], Docile: ['def', 'def'], Relaxed: ['def', 'spe'], Impish: ['def', 'spa'], Lax: ['def', 'spd'],
  Timid: ['spe', 'atk'], Hasty: ['spe', 'def'], Serious: ['spe', 'spe'], Jolly: ['spe', 'spa'], Naive: ['spe', 'spd'],
  Modest: ['spa', 'atk'], Mild: ['spa', 'def'], Quiet: ['spa', 'spe'], Bashful: ['spa', 'spa'], Rash: ['spa', 'spd'],
  Calm: ['spd', 'atk'], Gentle: ['spd', 'def'], Sassy: ['spd', 'spe'], Careful: ['spd', 'spa'], Quirky: ['spd', 'spd']
}

export const SHINY_ODDS = 1 / 4096
export const HIDDEN_ABILITY_ODDS = 1 / 50

export function natureMult(nature: string, stat: StatKey): number {
  const [up, down] = NATURES[nature] ?? ['atk', 'atk']
  if (up === down) return 1
  if (stat === up) return 1.1
  if (stat === down) return 0.9
  return 1
}

export function calcStat(base: number, iv: number, level: number, stat: StatKey, nature: string): number {
  if (stat === 'hp') {
    if (base === 1) return 1
    return Math.floor(((2 * base + iv) * level) / 100) + level + 10
  }
  return Math.floor((Math.floor(((2 * base + iv) * level) / 100) + 5) * natureMult(nature, stat))
}

export function calcStats(sp: Species, ivs: Stats, level: number, nature: string): Stats {
  const out = {} as Stats
  for (const k of STAT_KEYS) out[k] = calcStat(sp.baseStats[k], ivs[k], level, k, nature)
  return out
}

export const monStats = (m: OwnedMon): Stats => calcStats(species(m.species), m.ivs, m.level, m.nature)

export function randomIvs(): Stats {
  return { hp: randInt(0, 31), atk: randInt(0, 31), def: randInt(0, 31), spa: randInt(0, 31), spd: randInt(0, 31), spe: randInt(0, 31) }
}

/** Soma dos IVs em % (0–100) e um julgamento curto. */
export function ivPercent(ivs: Stats): number {
  return Math.round((STAT_KEYS.reduce((s, k) => s + ivs[k], 0) / (31 * 6)) * 100)
}
export function ivGrade(ivs: Stats): string {
  const p = ivPercent(ivs)
  if (p >= 90) return 'Excepcional'
  if (p >= 75) return 'Ótimo'
  if (p >= 55) return 'Bom'
  if (p >= 35) return 'Mediano'
  return 'Fraco'
}

export const randomNature = (): string => pick(Object.keys(NATURES))

export function randomGender(sp: Species): Gender {
  if (sp.genderRate < 0) return null
  return chance(sp.genderRate / 8) ? 'F' : 'M'
}

export function rollAbility(sp: Species): { ability: string; hidden: boolean } {
  if (sp.abilities.hidden && chance(HIDDEN_ABILITY_ODDS)) return { ability: sp.abilities.hidden, hidden: true }
  return { ability: pick(sp.abilities.normal.length ? sp.abilities.normal : [sp.abilities.hidden ?? 'none']), hidden: false }
}

// ------------------------------------------------------------ experiência

/** Experiência total necessária para estar no nível `n` (curvas oficiais). */
export function expForLevel(growth: string, n: number): number {
  if (n <= 1) return 0
  const n3 = n ** 3
  switch (growth) {
    case 'fast':
      return Math.floor((4 * n3) / 5)
    case 'medium':
      return n3
    case 'slow':
      return Math.floor((5 * n3) / 4)
    case 'medium-slow':
      return Math.max(0, Math.floor((6 / 5) * n3 - 15 * n * n + 100 * n - 140))
    case 'slow-then-very-fast': // Erratic
      if (n <= 50) return Math.floor((n3 * (100 - n)) / 50)
      if (n <= 68) return Math.floor((n3 * (150 - n)) / 100)
      if (n <= 98) return Math.floor((n3 * Math.floor((1911 - 10 * n) / 3)) / 500)
      return Math.floor((n3 * (160 - n)) / 100)
    case 'fast-then-very-slow': // Fluctuating
      if (n <= 15) return Math.floor((n3 * (Math.floor((n + 1) / 3) + 24)) / 50)
      if (n <= 36) return Math.floor((n3 * (n + 14)) / 50)
      return Math.floor((n3 * (Math.floor(n / 2) + 32)) / 50)
    default:
      return n3
  }
}

/** Experiência ganha ao derrotar `defeated` (fórmula Gen 3/4; ×1.5 contra treinador). */
export function expYield(defeatedSpecies: number, defeatedLevel: number, trainer: boolean): number {
  const b = species(defeatedSpecies).baseExp || 50
  return Math.max(1, Math.floor((((trainer ? 1.5 : 1) * b * defeatedLevel) / 7) * BALANCE.expRate))
}
