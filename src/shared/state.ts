// Estado do jogo (save), regras de captura (D8) e progresso offline (D11).
import { catchProbability, type CaptureContext } from './capture'
import { species } from './data'
import { BALLS, START_MONEY, itemInfo, wildMoney } from './items'
import { gainExp } from './mon'
import { expYield, ivPercent } from './stats'
import type { OwnedMon } from './types'
import { ZONES, zoneIndex, zonePool, type Zone } from './world'

export const SAVE_VERSION = 1

export interface DexEntry {
  seen: boolean
  caught: boolean
  shiny: boolean
  bestIv: number
}

export type RuleWhen = 'shiny' | 'legendary' | 'new' | 'species' | 'all'
export type BallChoice = 'cheapest' | 'best' | string

export interface CaptureRule {
  id: string
  enabled: boolean
  when: RuleWhen
  species?: number
  ball: BallChoice
  maxThrows: number
}

export interface Settings {
  volume: number
  cries: boolean
  sfx: boolean
  battleSounds: boolean
  music: boolean
  musicVolume: number
  stripWidthPct: number
  stripAlign: 'left' | 'center' | 'right'
  displayId: number | null
  autoAdvance: boolean
  potionThreshold: number
  autoRevive: boolean
  speed: number
  openAtLogin: boolean
}

export interface ZoneProgress {
  wins: number
  cleared: boolean
  /** Depois de perder para um líder: só tenta de novo com esse número de vitórias na rota. */
  retryAt?: number
}

export interface GameState {
  version: number
  createdAt: number
  lastSaved: number
  starterChosen: boolean
  money: number
  items: Record<string, number>
  party: OwnedMon[]
  box: OwnedMon[]
  dex: Record<number, DexEntry>
  zone: string
  progress: Record<string, ZoneProgress>
  badges: string[]
  defeated: string[]
  eventsCaught: string[]
  rules: CaptureRule[]
  settings: Settings
  stats: { battles: number; caught: number; shinies: number; playMs: number; trainerCounter: number }
}

export const DEFAULT_RULES: CaptureRule[] = [
  { id: 'r-shiny', enabled: true, when: 'shiny', ball: 'best', maxThrows: 30 },
  { id: 'r-legend', enabled: true, when: 'legendary', ball: 'best', maxThrows: 30 },
  { id: 'r-new', enabled: true, when: 'new', ball: 'cheapest', maxThrows: 10 },
  { id: 'r-all', enabled: false, when: 'all', ball: 'cheapest', maxThrows: 3 }
]

export const DEFAULT_SETTINGS: Settings = {
  volume: 0.5,
  cries: true,
  sfx: true,
  battleSounds: false,
  music: false,
  musicVolume: 0.25,
  stripWidthPct: 100,
  stripAlign: 'left',
  displayId: null,
  autoAdvance: true,
  potionThreshold: 35,
  autoRevive: true,
  speed: 1,
  openAtLogin: false
}

export function newGame(): GameState {
  return {
    version: SAVE_VERSION,
    createdAt: Date.now(),
    lastSaved: Date.now(),
    starterChosen: false,
    money: START_MONEY,
    items: {},
    party: [],
    box: [],
    dex: {},
    zone: ZONES[0].id,
    progress: {},
    badges: [],
    defeated: [],
    eventsCaught: [],
    rules: structuredClone(DEFAULT_RULES),
    settings: { ...DEFAULT_SETTINGS },
    stats: { battles: 0, caught: 0, shinies: 0, playMs: 0, trainerCounter: 0 }
  }
}

/** Completa saves antigos com campos novos. */
export function migrate(raw: Partial<GameState>): GameState {
  const base = newGame()
  const s = { ...base, ...raw } as GameState
  s.settings = { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) }
  s.stats = { ...base.stats, ...(raw.stats ?? {}) }
  s.rules = raw.rules?.length ? raw.rules : base.rules
  s.version = SAVE_VERSION
  return s
}

// ------------------------------------------------------------ Pokédex

export function markSeen(s: GameState, id: number): void {
  const d = (s.dex[id] ??= { seen: false, caught: false, shiny: false, bestIv: 0 })
  d.seen = true
}

export function markCaught(s: GameState, m: OwnedMon): void {
  const d = (s.dex[m.species] ??= { seen: true, caught: false, shiny: false, bestIv: 0 })
  d.seen = true
  d.caught = true
  if (m.shiny) d.shiny = true
  d.bestIv = Math.max(d.bestIv, ivPercent(m.ivs))
}

export const dexCounts = (s: GameState): { seen: number; caught: number } => {
  let seen = 0
  let caught = 0
  for (const d of Object.values(s.dex)) {
    if (d.seen) seen++
    if (d.caught) caught++
  }
  return { seen, caught }
}

// ------------------------------------------------------------ progresso no mapa

export function zoneProgress(s: GameState, id: string): ZoneProgress {
  return (s.progress[id] ??= { wins: 0, cleared: false })
}

export function isUnlocked(s: GameState, id: string): boolean {
  const i = zoneIndex(id)
  if (i <= 0) return true
  return zoneProgress(s, ZONES[i - 1].id).cleared
}

export function currentZone(s: GameState): Zone {
  return ZONES.find((z) => z.id === s.zone) ?? ZONES[0]
}

// ------------------------------------------------------------ regras de captura

export function ruleMatches(rule: CaptureRule, s: GameState, target: number, shiny: boolean): boolean {
  if (!rule.enabled) return false
  const sp = species(target)
  switch (rule.when) {
    case 'shiny':
      return shiny
    case 'legendary':
      return sp.isLegendary || sp.isMythical
    case 'new':
      return !s.dex[target]?.caught
    case 'species':
      return rule.species === target
    case 'all':
      return true
  }
}

/** Escolhe a bola conforme a 1ª regra que casar e o estoque. */
export function pickBall(s: GameState, ctx: CaptureContext, shiny: boolean, throws: number): string | null {
  const rule = s.rules.find((r) => ruleMatches(r, s, ctx.target, shiny))
  if (!rule || throws >= rule.maxThrows) return null
  const owned = BALLS.filter((b) => (s.items[b] ?? 0) > 0)
  if (!owned.length) return null
  if (rule.ball === 'cheapest') {
    const regular = owned.filter((b) => b !== 'master-ball')
    if (!regular.length) return null
    return regular.sort((a, b) => (itemInfo(a)?.price ?? 0) - (itemInfo(b)?.price ?? 0))[0]
  }
  if (rule.ball === 'best') {
    // Master Ball só em lendário ou shiny.
    const sp = species(ctx.target)
    const allowMaster = shiny || sp.isLegendary || sp.isMythical
    const cands = owned.filter((b) => b !== 'master-ball' || allowMaster)
    if (!cands.length) return null
    return cands.sort((a, b) => catchProbability(b, ctx) - catchProbability(a, ctx) || (itemInfo(a)?.price ?? 0) - (itemInfo(b)?.price ?? 0))[0]
  }
  return (s.items[rule.ball] ?? 0) > 0 ? rule.ball : null
}

// ------------------------------------------------------------ inventário

export const addItem = (s: GameState, slug: string, n = 1): void => {
  s.items[slug] = (s.items[slug] ?? 0) + n
}
export function useItem(s: GameState, slug: string): boolean {
  if ((s.items[slug] ?? 0) <= 0) return false
  s.items[slug]--
  if (s.items[slug] <= 0) delete s.items[slug]
  return true
}

// ------------------------------------------------------------ offline (D11)

export const OFFLINE_CAP_MS = 8 * 3600 * 1000
export const OFFLINE_EFFICIENCY = 0.5
const SECONDS_PER_BATTLE = 8

export interface OfflineSummary {
  ms: number
  battles: number
  money: number
  exp: number
  levelUps: { name: string; from: number; to: number }[]
}

/** Calcula e aplica XP e dinheiro do tempo com o jogo fechado (sem captura). */
export function applyOffline(s: GameState, now = Date.now()): OfflineSummary | null {
  const ms = Math.min(OFFLINE_CAP_MS, now - s.lastSaved)
  if (ms < 60_000 || !s.party.some((m) => m.hp > 0)) return null
  const zone = currentZone(s)
  if (zone.kind !== 'route') return null
  const pool = zonePool(zone)
  if (!pool.length) return null
  const battles = Math.floor((ms / 1000 / SECONDS_PER_BATTLE) * OFFLINE_EFFICIENCY)
  if (battles <= 0) return null
  const avgLevel = (zone.levels[0] + zone.levels[1]) / 2
  const totalW = pool.reduce((a, e) => a + e.weight, 0)
  const avgExp = pool.reduce((a, e) => a + (e.weight / totalW) * expYield(e.species, avgLevel, false), 0)
  const money = Math.round(battles * wildMoney(avgLevel))
  const expEach = Math.round(battles * avgExp)
  s.money += money
  const levelUps: OfflineSummary['levelUps'] = []
  s.party.forEach((m, i) => {
    if (m.hp <= 0) return
    const from = m.level
    gainExp(m, i === 0 ? expEach : Math.floor(expEach / 2))
    if (m.level > from) levelUps.push({ name: species(m.species).name, from, to: m.level })
  })
  return { ms, battles, money, exp: expEach, levelUps }
}
