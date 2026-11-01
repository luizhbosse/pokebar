// Tipos de dados do jogo (dados gerados por scripts/build-data.mjs + estado do save).

export type TypeName =
  | 'normal' | 'fire' | 'water' | 'electric' | 'grass' | 'ice' | 'fighting' | 'poison' | 'ground'
  | 'flying' | 'psychic' | 'bug' | 'rock' | 'ghost' | 'dragon' | 'dark' | 'steel' | 'fairy'

export type StatKey = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe'
export type Stats = Record<StatKey, number>

export type Evolution =
  | { to: number; kind: 'level'; level: number }
  | { to: number; kind: 'item'; item: string }
  | { to: number; kind: 'level-time'; level: number; time: 'day' | 'night' }
  | { to: number; kind: 'tyrogue'; level: number; cmp: 'atk>def' | 'atk<def' | 'atk=def' }

export interface Species {
  id: number
  slug: string
  name: string
  types: TypeName[]
  baseStats: Stats
  baseExp: number
  catchRate: number
  growthRate: string
  genderRate: number
  height: number
  weight: number
  abilities: { normal: string[]; hidden: string | null }
  isLegendary: boolean
  isMythical: boolean
  isBaby: boolean
  evolvesFrom: number | null
  evolutions: Evolution[]
  learnset: [number, string][]
}

export interface MoveMeta {
  category: string | null
  ailment: string
  ailmentChance: number
  drain: number
  healing: number
  critRate: number
  minHits: number | null
  maxHits: number | null
  flinchChance: number
}

export interface Move {
  id: number
  slug: string
  name: string
  type: TypeName
  power: number | null
  accuracy: number | null
  pp: number
  priority: number
  category: 'physical' | 'special' | 'status'
  target: string
  effectChance: number | null
  meta: MoveMeta | null
  shortEffect: string
}

export interface Ability {
  slug: string
  name: string
  shortEffect: string
}

export interface ItemData {
  slug: string
  name: string
  cost: number
}

export interface EncounterRow {
  species: number
  version: string
  minLevel: number
  maxLevel: number
  chance: number
  method: string
  conditions: string[]
}

export type Gender = 'M' | 'F' | null
export type Status = 'none' | 'sleep' | 'paralysis' | 'poison' | 'burn'

/** Um Pokémon do jogador (time ou PC). */
export interface OwnedMon {
  uid: string
  species: number
  level: number
  exp: number
  ivs: Stats
  nature: string
  ability: string
  hiddenAbility: boolean
  shiny: boolean
  gender: Gender
  moves: string[]
  hp: number
  status: Status
  ball: string
  caughtAt: string // zona
  caughtOn: number // timestamp
  noEvolve: boolean
}
