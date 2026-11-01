// Criação de Pokémon, ganho de experiência, golpes novos e evolução.
import { species } from './data'
import { bestFour, movesLearnedAt, movesUpTo } from './moves'
import { uid } from './rng'
import {
  SHINY_ODDS,
  calcStat,
  expForLevel,
  monStats,
  randomGender,
  randomIvs,
  randomNature,
  rollAbility
} from './stats'
import type { Evolution, OwnedMon } from './types'
import { timeOfDay } from './world'

export const MAX_LEVEL = 100

export interface NewMonOptions {
  shiny?: boolean
  ball?: string
  zone?: string
}

export function createMon(speciesId: number, level: number, opts: NewMonOptions = {}): OwnedMon {
  const sp = species(speciesId)
  const ab = rollAbility(sp)
  const mon: OwnedMon = {
    uid: uid(),
    species: speciesId,
    level,
    exp: expForLevel(sp.growthRate, level),
    ivs: randomIvs(),
    nature: randomNature(),
    ability: ab.ability,
    hiddenAbility: ab.hidden,
    shiny: opts.shiny ?? Math.random() < SHINY_ODDS,
    gender: randomGender(sp),
    moves: bestFour(speciesId, movesUpTo(speciesId, level)),
    hp: 0,
    status: 'none',
    ball: opts.ball ?? 'poke-ball',
    caughtAt: opts.zone ?? '',
    caughtOn: Date.now(),
    noEvolve: false
  }
  mon.hp = monStats(mon).hp
  return mon
}

export const maxHp = (m: OwnedMon): number => monStats(m).hp

export interface LevelUpResult {
  levels: number
  learned: string[]
}

/** Soma experiência; sobe níveis, ajusta HP e aprende golpes novos. */
export function gainExp(m: OwnedMon, amount: number): LevelUpResult {
  const sp = species(m.species)
  const res: LevelUpResult = { levels: 0, learned: [] }
  if (m.level >= MAX_LEVEL) return res
  m.exp += amount
  while (m.level < MAX_LEVEL && m.exp >= expForLevel(sp.growthRate, m.level + 1)) {
    const before = maxHp(m)
    m.level++
    res.levels++
    if (m.hp > 0) m.hp += maxHp(m) - before
    for (const slug of movesLearnedAt(m.species, m.level)) {
      if (m.moves.includes(slug)) continue
      const next = bestFour(m.species, [...m.moves, slug])
      if (next.includes(slug)) res.learned.push(slug)
      m.moves = next
    }
  }
  if (m.level >= MAX_LEVEL) m.exp = expForLevel(sp.growthRate, MAX_LEVEL)
  return res
}

/** Experiência que falta para o próximo nível (0–1). */
export function expProgress(m: OwnedMon): number {
  const sp = species(m.species)
  if (m.level >= MAX_LEVEL) return 1
  const a = expForLevel(sp.growthRate, m.level)
  const b = expForLevel(sp.growthRate, m.level + 1)
  return Math.max(0, Math.min(1, (m.exp - a) / (b - a)))
}

/** Evolução por nível pendente (nível, hora do dia ou regra do Tyrogue). */
export function pendingLevelEvolution(m: OwnedMon, now = new Date()): Evolution | null {
  if (m.noEvolve) return null
  const sp = species(m.species)
  for (const e of sp.evolutions) {
    if (e.kind === 'level' && m.level >= e.level) return e
    if (e.kind === 'level-time' && m.level >= e.level) {
      const tod = timeOfDay(now)
      const isNight = tod === 'night'
      if ((e.time === 'night') === isNight) return e
    }
    if (e.kind === 'tyrogue' && m.level >= e.level) {
      const s = monStats(m)
      const cmp = s.atk > s.def ? 'atk>def' : s.atk < s.def ? 'atk<def' : 'atk=def'
      if (cmp === e.cmp) return e
    }
  }
  return null
}

/** Evoluções possíveis com um item. */
export function itemEvolution(m: OwnedMon, item: string): Evolution | null {
  return species(m.species).evolutions.find((e) => e.kind === 'item' && e.item === item) ?? null
}

/** Aplica a evolução: troca espécie, recalcula HP, mantém IV/natureza; habilidade segue o "slot". */
export function evolve(m: OwnedMon, to: number): void {
  const from = species(m.species)
  const target = species(to)
  const hpBefore = maxHp(m)
  if (m.hiddenAbility) {
    m.ability = target.abilities.hidden ?? target.abilities.normal[0]
  } else {
    const slot = Math.max(0, from.abilities.normal.indexOf(m.ability))
    m.ability = target.abilities.normal[Math.min(slot, target.abilities.normal.length - 1)] ?? m.ability
  }
  m.species = to
  // A espécie nova pode ter outra curva: preserva o nível.
  m.exp = Math.max(m.exp, expForLevel(target.growthRate, m.level))
  const hpAfter = maxHp(m)
  if (m.hp > 0) m.hp = Math.min(hpAfter, m.hp + (hpAfter - hpBefore))
  m.moves = bestFour(to, [...m.moves, ...movesUpTo(to, m.level).slice(-4)])
}

export const fullHeal = (m: OwnedMon): void => {
  m.hp = maxHp(m)
  m.status = 'none'
}

export { calcStat }
