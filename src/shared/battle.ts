// Motor de batalha 1 vs 1 automática (D5/D6/D7b). Cada chamada de nextTurn() resolve um turno
// e devolve eventos (com texto em pt-BR) para o renderer animar.
import { IGNORES_INTIMIDATE } from './abilities'
import { catchProbability, throwBall, type CaptureContext } from './capture'
import { MOVES, species } from './data'
import { itemName, POTIONS } from './items'
import { createMon, gainExp, maxHp } from './mon'
import { FIXED_DAMAGE, POWDER_MOVES, PUNCH_MOVES, isStatusMove, movePower, wildMoves } from './moves'
import { chance, randInt } from './rng'
import { expYield, monStats } from './stats'
import { effectiveness } from './typechart'
import type { Gender, Move, OwnedMon, Stats, Status, TypeName } from './types'

export type Side = 'player' | 'enemy'

/** Struggle: golpe sem tipo usado quando nada do repertório consegue causar dano. */
MOVES['struggle'] ??= {
  id: 165,
  slug: 'struggle',
  name: 'Struggle',
  type: 'normal',
  power: 50,
  accuracy: null,
  pp: 1,
  priority: 0,
  category: 'physical',
  target: 'selected-pokemon',
  effectChance: null,
  meta: { category: 'damage', ailment: 'none', ailmentChance: 0, drain: -25, healing: 0, critRate: 0, minHits: null, maxHits: null, flinchChance: 0 },
  shortEffect: ''
}

/** Turnos máximos antes de encerrar a batalha em fuga (trava de segurança). */
export const MAX_TURNS = 60

export interface Combatant {
  side: Side
  ref: OwnedMon
  species: number
  name: string
  level: number
  shiny: boolean
  gender: Gender
  ability: string
  types: TypeName[]
  stats: Stats
  maxHp: number
  hp: number
  status: Status
  sleepTurns: number
  moves: string[]
  atkMult: number
  spaMult: number
  speStage: number
  flashFire: boolean
}

export type BattleEvent =
  | { t: 'send'; side: Side; c: Combatant; hp: number; maxHp: number; status: Status; level: number; text: string }
  | { t: 'move'; side: Side; move: string; text: string }
  | { t: 'damage'; side: Side; amount: number; hp: number; eff: number; crit: boolean; text: string }
  | { t: 'miss'; side: Side; text: string }
  | { t: 'status'; side: Side; status: Status; text: string }
  | { t: 'cant'; side: Side; text: string }
  | { t: 'heal'; side: Side; hp: number; text: string }
  | { t: 'info'; side?: Side; text: string }
  | { t: 'faint'; side: Side; text: string }
  | { t: 'exp'; uid: string; amount: number; levels: number; level: number; hp: number; maxHp: number; learned: string[]; text: string }
  | { t: 'throw'; ball: string; shakes: number; caught: boolean; text: string }
  | { t: 'item'; item: string; side: Side; hp: number; text: string }
  | { t: 'end'; result: BattleResult; text: string }

export type BattleResult = 'win' | 'lose' | 'caught' | 'flee'

export interface EnemySpec {
  species: number
  level: number
  shiny?: boolean
}

export interface BattleHooks {
  /** Bola a usar contra o selvagem atual (null = não tentar). Respeita regras e estoque. */
  chooseBall(ctx: CaptureContext, throwsSoFar: number): string | null
  /** Consome 1 unidade do item; false se não houver. */
  consume(item: string): boolean
  has(item: string): boolean
  potionThreshold: number
}

export interface BattleSetup {
  kind: 'wild' | 'trainer'
  party: OwnedMon[]
  enemies: EnemySpec[]
  trainerLabel?: string
  fished?: boolean
  /** Captura permitida (selvagens e lendários). */
  capturable: boolean
  /** O jogador apertou "Capturar": força a tentativa mesmo sem regra. */
  forceCapture?: () => boolean
  hooks: BattleHooks
  zone: string
}

const STATUS_PT: Record<Status, string> = {
  none: '',
  sleep: 'adormeceu',
  paralysis: 'ficou paralisado',
  poison: 'foi envenenado',
  burn: 'foi queimado'
}

const snap = (c: Combatant): { hp: number; maxHp: number; status: Status; level: number } => ({
  hp: c.hp,
  maxHp: c.maxHp,
  status: c.status,
  level: c.level
})

function makeCombatant(side: Side, ref: OwnedMon): Combatant {
  const sp = species(ref.species)
  return {
    side,
    ref,
    species: ref.species,
    name: sp.name,
    level: ref.level,
    shiny: ref.shiny,
    gender: ref.gender,
    ability: ref.ability,
    types: sp.types,
    stats: monStats(ref),
    maxHp: maxHp(ref),
    hp: ref.hp,
    status: ref.status,
    sleepTurns: ref.status === 'sleep' ? randInt(1, 3) : 0,
    moves: ref.moves,
    atkMult: 1,
    spaMult: 1,
    speStage: 0,
    flashFire: false
  }
}

export class Battle {
  readonly setup: BattleSetup
  player: Combatant | null = null
  enemy: Combatant | null = null
  enemyQueue: OwnedMon[]
  enemyIndex = 0
  ended: BattleResult | null = null
  turn = 0
  throws = 0
  caughtMon: OwnedMon | null = null
  /** Pokémon do jogador que enfrentaram o inimigo atual (recebem XP cheia). */
  private participants = new Set<string>()
  private movedThisTurn = new Set<Side>()

  constructor(setup: BattleSetup) {
    this.setup = setup
    this.enemyQueue = setup.enemies.map((e) => {
      const m = createMon(e.species, e.level, { shiny: e.shiny })
      m.moves = wildMoves(e.species, e.level)
      return m
    })
  }

  get isWild(): boolean {
    return this.setup.kind === 'wild'
  }

  start(): BattleEvent[] {
    const ev: BattleEvent[] = []
    const first = this.enemyQueue[0]
    this.enemy = makeCombatant('enemy', first)
    if (this.isWild) {
      ev.push({ t: 'send', side: 'enemy', c: this.enemy, ...snap(this.enemy), text: `${this.enemy.shiny ? '✨ ' : ''}Um ${this.enemy.name} selvagem apareceu!` })
    } else {
      ev.push({ t: 'info', text: `${this.setup.trainerLabel} quer lutar!` })
      ev.push({ t: 'send', side: 'enemy', c: this.enemy, ...snap(this.enemy), text: `${this.setup.trainerLabel} enviou ${this.enemy.name}!` })
    }
    const mine = this.setup.party.find((m) => m.hp > 0)
    if (!mine) {
      this.ended = 'lose'
      ev.push({ t: 'end', result: 'lose', text: 'Nenhum Pokémon em condições de lutar.' })
      return ev
    }
    this.player = makeCombatant('player', mine)
    this.participants.add(mine.uid)
    ev.push({ t: 'send', side: 'player', c: this.player, ...snap(this.player), text: `Vai, ${this.player.name}!` })
    ev.push(...this.entryAbility(this.player, this.enemy), ...this.entryAbility(this.enemy, this.player))
    return ev
  }

  private entryAbility(c: Combatant, foe: Combatant): BattleEvent[] {
    if (c.ability === 'intimidate' && !IGNORES_INTIMIDATE.has(foe.ability)) {
      foe.atkMult *= 2 / 3
      return [{ t: 'info', side: c.side, text: `Intimidate de ${c.name} reduziu o Ataque de ${foe.name}!` }]
    }
    return []
  }

  // ---------------------------------------------------------------- turno

  nextTurn(): BattleEvent[] {
    if (this.ended || !this.player || !this.enemy) return []
    this.turn++
    if (this.turn > MAX_TURNS) {
      this.ended = 'flee'
      return [{ t: 'end', result: 'flee', text: 'A batalha se arrastou demais e vocês seguiram caminhos diferentes.' }]
    }
    this.movedThisTurn.clear()
    const ev: BattleEvent[] = []
    const p = this.player
    const e = this.enemy

    type Action = { side: Side; kind: 'move'; move: string } | { side: Side; kind: 'item'; run: () => BattleEvent[] }
    const actions: Action[] = []

    // --- decisão do jogador
    const playerAction = this.decidePlayer()
    actions.push(playerAction)
    // --- decisão do inimigo
    actions.push({ side: 'enemy', kind: 'move', move: this.canDamage(e, p) ? this.bestMove(e, p, true) : 'struggle' })

    const prio = (a: Action): number => (a.kind === 'item' ? 10 : MOVES[a.move]?.priority ?? 0)
    actions.sort((a, b) => {
      const d = prio(b) - prio(a)
      if (d !== 0) return d
      const sa = this.speed(a.side === 'player' ? p : e)
      const sb = this.speed(b.side === 'player' ? p : e)
      return sb !== sa ? sb - sa : Math.random() - 0.5
    })

    for (const a of actions) {
      if (this.ended) break
      const user = a.side === 'player' ? this.player : this.enemy
      const target = a.side === 'player' ? this.enemy : this.player
      if (!user || !target || user.hp <= 0) continue
      if (a.kind === 'item') ev.push(...a.run())
      else ev.push(...this.useMove(user, target, a.move))
      this.movedThisTurn.add(a.side)
      ev.push(...this.checkFaints())
    }
    if (!this.ended) {
      for (const c of [this.player, this.enemy]) if (c && c.hp > 0) ev.push(...this.endOfTurn(c))
      ev.push(...this.checkFaints())
    }
    return ev
  }

  private speed(c: Combatant): number {
    let s = c.stats.spe * ((2 + c.speStage) / 2)
    if (c.status === 'paralysis' && c.ability !== 'quick-feet') s *= 0.5
    if (c.status !== 'none' && c.ability === 'quick-feet') s *= 1.5
    return s
  }

  // ---------------------------------------------------------------- decisões

  private captureContext(): CaptureContext | null {
    const p = this.player
    const e = this.enemy
    if (!p || !e) return null
    return {
      target: e.species,
      targetLevel: e.level,
      targetGender: e.gender,
      hp: e.hp,
      maxHp: e.maxHp,
      status: e.status,
      fished: !!this.setup.fished,
      myLevel: p.level,
      mySpecies: p.species,
      myGender: p.gender
    }
  }

  private decidePlayer(): { side: Side; kind: 'move'; move: string } | { side: Side; kind: 'item'; run: () => BattleEvent[] } {
    const p = this.player as Combatant
    const e = this.enemy as Combatant

    // Captura
    if (this.setup.capturable) {
      const ctx = this.captureContext() as CaptureContext
      const ball = this.setup.hooks.chooseBall(ctx, this.throws)
      const forced = this.setup.forceCapture?.() ?? false
      if (ball || forced) {
        const useBall = ball ?? this.bestOwnedBall(ctx)
        if (useBall) {
          const hpFrac = e.hp / e.maxHp
          const prob = catchProbability(useBall, ctx)
          const safe = this.safeCaptureMove(p, e)
          const throwNow =
            useBall === 'master-ball' ||
            prob >= 0.5 ||
            hpFrac <= 0.3 ||
            ((e.status === 'sleep' || e.status === 'paralysis') && hpFrac <= 0.6) ||
            !safe
          if (throwNow) return { side: 'player', kind: 'item', run: () => this.doThrow(useBall) }
          return { side: 'player', kind: 'move', move: safe }
        }
      }
    }

    // Sem nenhum golpe que cause dano: troca por quem consiga; senão, Struggle.
    if (!this.canDamage(p, e)) {
      const sub = this.setup.party.find((m) => m.hp > 0 && m.uid !== p.ref.uid && this.canDamage(makeCombatant('player', m), e))
      if (sub) return { side: 'player', kind: 'item', run: () => this.doSwitch(sub) }
      return { side: 'player', kind: 'move', move: 'struggle' }
    }

    // Poção
    if (p.hp / p.maxHp < this.setup.hooks.potionThreshold / 100) {
      const missing = p.maxHp - p.hp
      const owned = POTIONS.filter((x) => this.setup.hooks.has(x.slug))
      if (owned.length) {
        const fit = owned.find((x) => (x.heal ?? 0) >= missing * 0.6) ?? owned[owned.length - 1]
        return { side: 'player', kind: 'item', run: () => this.doPotion(fit.slug, fit.heal ?? 20) }
      }
    }
    return { side: 'player', kind: 'move', move: this.bestMove(p, e, false) }
  }

  /** Algum golpe de dano que afeta o alvo? */
  canDamage(user: Combatant, target: Combatant): boolean {
    return user.moves.some((slug) => {
      const mv = MOVES[slug]
      if (!mv || isStatusMove(mv)) return false
      if (slug === 'dream-eater' && target.status !== 'sleep') return false
      return this.estimateDamage(user, target, mv, 1) > 0
    })
  }

  private doSwitch(m: OwnedMon): BattleEvent[] {
    const old = this.player as Combatant
    this.player = makeCombatant('player', m)
    this.participants.add(m.uid)
    const ev: BattleEvent[] = [
      { t: 'info', side: 'player', text: `${old.name}, volte!` },
      { t: 'send', side: 'player', c: this.player, ...snap(this.player), text: `Vai, ${this.player.name}!` }
    ]
    if (this.enemy) ev.push(...this.entryAbility(this.player, this.enemy))
    return ev
  }

  /** Captura manual: a bola com maior chance (Master Ball só em lendário ou shiny). */
  private bestOwnedBall(ctx: CaptureContext): string | null {
    const sp = species(ctx.target)
    const allowMaster = (this.enemy?.shiny ?? false) || sp.isLegendary || sp.isMythical
    const balls = ['poke-ball', 'great-ball', 'ultra-ball', 'friend-ball', 'level-ball', 'fast-ball', 'lure-ball', 'heavy-ball', 'moon-ball', 'love-ball']
    if (allowMaster) balls.push('master-ball')
    const owned = balls.filter((b) => this.setup.hooks.has(b))
    if (!owned.length) return null
    return owned.sort((a, b) => catchProbability(b, ctx) - catchProbability(a, ctx))[0]
  }

  /** Golpe que não nocauteia (ou status que ajuda na captura). Null = nenhum seguro. */
  private safeCaptureMove(p: Combatant, e: Combatant): string | null {
    if (e.status === 'none') {
      for (const want of ['sleep', 'paralysis'] as Status[]) {
        const m = p.moves.find((slug) => {
          const mv = MOVES[slug]
          return isStatusMove(mv) && mv.meta?.ailment === want && this.canStatus(e, want, slug)
        })
        if (m) return m
      }
    }
    if (p.moves.includes('false-swipe') && e.hp > 1) return 'false-swipe'
    let best: string | null = null
    let bestDmg = 0
    for (const slug of p.moves) {
      const mv = MOVES[slug]
      if (!mv || isStatusMove(mv)) continue
      const max = this.estimateDamage(p, e, mv, 1)
      if (max <= 0 || max >= e.hp) continue
      const avg = this.estimateDamage(p, e, mv, 0.925)
      if (avg > bestDmg) {
        bestDmg = avg
        best = slug
      }
    }
    return best
  }

  /** Melhor golpe por dano esperado (ou status útil). Selvagens às vezes escolhem ao acaso. */
  bestMove(user: Combatant, target: Combatant, isEnemy: boolean): string {
    const usable = user.moves.filter((s) => MOVES[s])
    if (!usable.length) return 'tackle'
    if (isEnemy && this.isWild && chance(0.25)) return usable[Math.floor(Math.random() * usable.length)]
    let bestDamage = 0
    const values = usable.map((slug) => {
      const mv = MOVES[slug]
      if (isStatusMove(mv)) return { slug, v: -1 }
      const acc = this.hitChance(user, target, mv)
      const hits = mv.meta?.minHits ? (user.ability === 'skill-link' ? mv.meta.maxHits ?? 2 : (mv.meta.minHits + (mv.meta.maxHits ?? mv.meta.minHits)) / 2) : 1
      const dmg = Math.min(target.hp, this.estimateDamage(user, target, mv, 0.925) * hits) * acc
      if (slug === 'dream-eater' && target.status !== 'sleep') return { slug, v: 0 }
      bestDamage = Math.max(bestDamage, dmg)
      return { slug, v: dmg + (dmg >= target.hp ? 5 : 0) + (mv.priority > 0 && dmg >= target.hp ? 10 : 0) }
    })
    for (const x of values) {
      if (x.v !== -1) continue
      const mv = MOVES[x.slug]
      const ail = mv.meta?.ailment as Status
      const ok = target.status === 'none' && target.hp / target.maxHp > 0.5 && this.canStatus(target, ail, x.slug)
      const k = ail === 'sleep' ? 1.3 : ail === 'paralysis' ? 0.9 : ail === 'burn' ? (target.stats.atk > target.stats.spa ? 1 : 0.6) : 0.6
      x.v = ok ? Math.max(1, bestDamage * k) * this.hitChance(user, target, mv) : 0
    }
    values.sort((a, b) => b.v - a.v)
    return values[0].slug
  }

  // ---------------------------------------------------------------- mecânica

  private hitChance(user: Combatant, target: Combatant, mv: Move): number {
    if (mv.accuracy === null) return 1
    if (user.ability === 'no-guard' || target.ability === 'no-guard') return 1
    let acc = mv.accuracy / 100
    if (user.ability === 'compound-eyes') acc *= 1.3
    if (user.ability === 'hustle' && mv.category === 'physical') acc *= 0.8
    return Math.min(1, acc)
  }

  private canStatus(target: Combatant, status: Status, moveSlug?: string): boolean {
    if (target.status !== 'none' || status === 'none') return false
    const t = target.types
    if (moveSlug && POWDER_MOVES.has(moveSlug) && t.includes('grass')) return false
    if (status === 'paralysis' && (t.includes('electric') || target.ability === 'limber')) return false
    if (status === 'poison' && (t.includes('poison') || t.includes('steel') || target.ability === 'immunity')) return false
    if (status === 'burn' && (t.includes('fire') || target.ability === 'water-veil')) return false
    if (status === 'sleep' && (target.ability === 'insomnia' || target.ability === 'vital-spirit')) return false
    return true
  }

  private typeEff(user: Combatant, target: Combatant, mv: Move): number {
    if (mv.slug === 'struggle') return 1
    let defTypes = target.types
    if (user.ability === 'scrappy' && (mv.type === 'normal' || mv.type === 'fighting')) {
      defTypes = defTypes.filter((x) => x !== 'ghost')
    }
    let eff = effectiveness(mv.type, defTypes)
    if (mv.type === 'ground' && target.ability === 'levitate') eff = 0
    return eff
  }

  /** Dano de um acerto (sem crítico), com fator aleatório fixo. */
  estimateDamage(user: Combatant, target: Combatant, mv: Move, rand: number): number {
    const fixed = FIXED_DAMAGE[mv.slug]
    const eff = this.typeEff(user, target, mv)
    if (eff === 0 || this.absorbs(target, mv)) return 0
    if (fixed !== undefined) {
      if (fixed === 'level') return user.level
      if (fixed === 'half') return Math.max(1, Math.floor(target.hp / 2))
      if (fixed === 'psywave') return Math.floor(user.level * (0.5 + rand / 2))
      return fixed
    }
    return this.baseDamage(user, target, mv, eff, false, rand)
  }

  private absorbs(target: Combatant, mv: Move): boolean {
    const a = target.ability
    return (
      (mv.type === 'water' && (a === 'water-absorb' || a === 'dry-skin')) ||
      (mv.type === 'electric' && (a === 'volt-absorb' || a === 'lightning-rod')) ||
      (mv.type === 'fire' && a === 'flash-fire') ||
      (mv.type === 'grass' && a === 'sap-sipper')
    )
  }

  private baseDamage(user: Combatant, target: Combatant, mv: Move, eff: number, crit: boolean, rand: number): number {
    const physical = mv.category === 'physical'
    let power = movePower(mv)
    const ua = user.ability
    if (ua === 'technician' && power <= 60) power *= 1.5
    if (ua === 'iron-fist' && PUNCH_MOVES.has(mv.slug)) power *= 1.2
    if (ua === 'reckless' && (mv.meta?.drain ?? 0) < 0) power *= 1.2
    if (ua === 'sheer-force' && this.hasSecondary(mv)) power *= 1.3
    const pinch: Record<string, TypeName> = { overgrow: 'grass', blaze: 'fire', torrent: 'water', swarm: 'bug' }
    if (pinch[ua] === mv.type && user.hp <= user.maxHp / 3) power *= 1.5
    if (user.flashFire && mv.type === 'fire') power *= 1.5

    let A = physical ? user.stats.atk * user.atkMult : user.stats.spa * user.spaMult
    let D = physical ? target.stats.def : target.stats.spd
    if (physical) {
      if (ua === 'huge-power') A *= 2
      if (ua === 'hustle') A *= 1.5
      if (ua === 'guts' && user.status !== 'none') A *= 1.5
      if (target.ability === 'marvel-scale' && target.status !== 'none') D *= 1.5
    }
    let dmg = Math.floor(Math.floor((Math.floor((2 * user.level) / 5 + 2) * power * A) / Math.max(1, D)) / 50) + 2
    if (crit) dmg *= ua === 'sniper' ? 2.25 : 1.5
    dmg *= rand
    if (mv.slug !== 'struggle' && user.types.includes(mv.type)) dmg *= ua === 'adaptability' ? 2 : 1.5
    dmg *= eff
    if (physical && user.status === 'burn' && ua !== 'guts') dmg *= 0.5
    const ta = target.ability
    if (ta === 'thick-fat' && (mv.type === 'fire' || mv.type === 'ice')) dmg *= 0.5
    if (ta === 'dry-skin' && mv.type === 'fire') dmg *= 1.25
    if (ta === 'filter' && eff > 1) dmg *= 0.75
    if (ta === 'multiscale' && target.hp === target.maxHp) dmg *= 0.5
    if (ua === 'tinted-lens' && eff < 1) dmg *= 2
    return Math.max(1, Math.floor(dmg))
  }

  private hasSecondary(mv: Move): boolean {
    return !!mv.meta && (mv.meta.ailmentChance > 0 || mv.meta.flinchChance > 0)
  }

  private setHp(c: Combatant, hp: number): void {
    c.hp = Math.max(0, Math.min(c.maxHp, Math.round(hp)))
    c.ref.hp = c.hp
  }

  private setStatus(c: Combatant, s: Status): void {
    c.status = s
    c.ref.status = s
    if (s === 'sleep') {
      const turns = randInt(1, 3)
      c.sleepTurns = c.ability === 'early-bird' ? Math.ceil(turns / 2) : turns
    }
  }

  private applyStatus(target: Combatant, s: Status, source: Combatant | null, moveSlug?: string): BattleEvent[] {
    if (!this.canStatus(target, s, moveSlug)) return []
    this.setStatus(target, s)
    const ev: BattleEvent[] = [{ t: 'status', side: target.side, status: s, text: `${target.name} ${STATUS_PT[s]}!` }]
    if (source && target.ability === 'synchronize' && s !== 'sleep' && this.canStatus(source, s)) {
      this.setStatus(source, s)
      ev.push({ t: 'status', side: source.side, status: s, text: `Synchronize! ${source.name} ${STATUS_PT[s]}!` })
    }
    return ev
  }

  private useMove(user: Combatant, target: Combatant, slug: string): BattleEvent[] {
    const ev: BattleEvent[] = []
    const fl = user as Combatant & { flinched?: boolean }
    if (fl.flinched) {
      fl.flinched = false
      return [{ t: 'cant', side: user.side, text: `${user.name} recuou e não atacou!` }]
    }
    // Status que impedem a ação
    if (user.status === 'sleep') {
      user.sleepTurns--
      if (user.sleepTurns > 0) return [{ t: 'cant', side: user.side, text: `${user.name} está dormindo.` }]
      this.setStatus(user, 'none')
      ev.push({ t: 'status', side: user.side, status: 'none', text: `${user.name} acordou!` })
    }
    if (user.status === 'paralysis' && chance(0.25)) {
      return [{ t: 'cant', side: user.side, text: `${user.name} está paralisado e não consegue se mover!` }]
    }

    const mv = MOVES[slug] ?? MOVES['tackle']
    ev.push({ t: 'move', side: user.side, move: mv.slug, text: `${user.name} usou ${mv.name}!` })

    if (!chance(this.hitChance(user, target, mv))) {
      ev.push({ t: 'miss', side: user.side, text: `${user.name} errou!` })
      return ev
    }

    // Golpe de status
    if (isStatusMove(mv)) {
      const ail = (mv.meta?.ailment ?? 'none') as Status
      const res = this.applyStatus(target, ail, user, mv.slug)
      if (!res.length) ev.push({ t: 'info', text: 'Mas não teve efeito.' })
      return [...ev, ...res]
    }

    if (mv.slug === 'dream-eater' && target.status !== 'sleep') {
      ev.push({ t: 'info', text: 'Mas falhou!' })
      return ev
    }

    // Absorção por habilidade
    if (this.absorbs(target, mv)) {
      const a = target.ability
      if (a === 'flash-fire') {
        target.flashFire = true
        ev.push({ t: 'info', side: target.side, text: `Flash Fire de ${target.name} fortaleceu seus golpes de Fogo!` })
      } else if (a === 'lightning-rod') {
        target.spaMult *= 1.5
        ev.push({ t: 'info', side: target.side, text: `Lightning Rod de ${target.name} aumentou seu At. Esp.!` })
      } else if (a === 'sap-sipper') {
        target.atkMult *= 1.5
        ev.push({ t: 'info', side: target.side, text: `Sap Sipper de ${target.name} aumentou seu Ataque!` })
      } else {
        this.setHp(target, target.hp + target.maxHp / 4)
        ev.push({ t: 'heal', side: target.side, hp: target.hp, text: `${target.name} absorveu o golpe e recuperou HP!` })
      }
      return ev
    }

    const eff = this.typeEff(user, target, mv)
    if (eff === 0) {
      ev.push({ t: 'info', text: `Não afeta ${target.name}...` })
      return ev
    }

    // Número de acertos
    let hits = 1
    if (mv.meta?.minHits) {
      const min = mv.meta.minHits
      const max = mv.meta.maxHits ?? min
      if (user.ability === 'skill-link') hits = max
      else if (min === 2 && max === 5) hits = [2, 2, 2, 3, 3, 3, 4, 5][randInt(0, 7)] ?? 2
      else hits = randInt(min, max)
    }

    let total = 0
    let anyCrit = false
    const wasFull = target.hp === target.maxHp
    for (let i = 0; i < hits && target.hp > 0; i++) {
      let dmg: number
      let crit = false
      const fixed = FIXED_DAMAGE[mv.slug]
      if (fixed !== undefined) {
        dmg = this.estimateDamage(user, target, mv, Math.random())
      } else {
        const noCrit = target.ability === 'battle-armor' || target.ability === 'shell-armor'
        const stage = (mv.meta?.critRate ?? 0) + (user.ability === 'super-luck' ? 1 : 0)
        const critChance = stage <= 0 ? 1 / 24 : stage === 1 ? 1 / 8 : stage === 2 ? 1 / 2 : 1
        crit = !noCrit && chance(critChance)
        dmg = this.baseDamage(user, target, mv, eff, crit, 0.85 + Math.random() * 0.15)
      }
      if (mv.slug === 'false-swipe' && dmg >= target.hp) dmg = target.hp - 1
      if (target.ability === 'sturdy' && wasFull && i === 0 && dmg >= target.hp) {
        dmg = target.hp - 1
        ev.push({ t: 'info', side: target.side, text: `${target.name} aguentou firme com Sturdy!` })
      }
      if (crit) anyCrit = true
      this.setHp(target, target.hp - dmg)
      total += dmg
      const effTxt = eff > 1 ? ' É super eficaz!' : eff < 1 ? ' Não é muito eficaz...' : ''
      ev.push({
        t: 'damage',
        side: target.side,
        amount: dmg,
        hp: target.hp,
        eff,
        crit,
        text: `${crit ? 'Acerto crítico! ' : ''}${target.name} perdeu ${dmg} HP.${i === 0 ? effTxt : ''}`
      })
      if (crit && target.ability === 'anger-point' && target.hp > 0) {
        target.atkMult = 4
        ev.push({ t: 'info', side: target.side, text: `Anger Point! O Ataque de ${target.name} foi ao máximo!` })
      }
    }
    if (hits > 1) ev.push({ t: 'info', text: `Acertou ${hits} vezes!` })
    void anyCrit

    // Dreno / recuo
    const drain = mv.meta?.drain ?? 0
    if (drain > 0 && total > 0) {
      const amount = Math.max(1, Math.floor((total * drain) / 100))
      if (target.ability === 'liquid-ooze') {
        this.setHp(user, user.hp - amount)
        ev.push({ t: 'damage', side: user.side, amount, hp: user.hp, eff: 1, crit: false, text: `${user.name} sugou Liquid Ooze e perdeu ${amount} HP!` })
      } else {
        this.setHp(user, user.hp + amount)
        ev.push({ t: 'heal', side: user.side, hp: user.hp, text: `${user.name} drenou energia.` })
      }
    } else if (drain < 0 && total > 0 && user.ability !== 'rock-head') {
      const amount = Math.max(1, Math.floor((total * -drain) / 100))
      this.setHp(user, user.hp - amount)
      ev.push({ t: 'damage', side: user.side, amount, hp: user.hp, eff: 1, crit: false, text: `${user.name} sofreu ${amount} de recuo.` })
    }

    const contact = mv.category === 'physical'
    if (target.hp > 0) {
      // Efeito secundário
      if (user.ability !== 'sheer-force' && target.ability !== 'shield-dust' && mv.meta) {
        const ail = mv.meta.ailment as Status
        const p = (mv.meta.ailmentChance || 0) * (user.ability === 'serene-grace' ? 2 : 1)
        if (p > 0 && ['sleep', 'paralysis', 'poison', 'burn'].includes(ail) && chance(p / 100)) {
          ev.push(...this.applyStatus(target, ail, user))
        }
        const f = (mv.meta.flinchChance || 0) * (user.ability === 'serene-grace' ? 2 : 1)
        if (f > 0 && !this.movedThisTurn.has(target.side) && target.ability !== 'inner-focus' && chance(f / 100)) {
          ;(target as Combatant & { flinched?: boolean }).flinched = true
        }
      }
      // Habilidades de contato do alvo
      if (contact && user.hp > 0 && user.status === 'none' && chance(0.3)) {
        const ta = target.ability
        const map: Record<string, Status> = { static: 'paralysis', 'flame-body': 'burn', 'poison-point': 'poison' }
        let s: Status | undefined = map[ta]
        if (ta === 'effect-spore') s = (['sleep', 'paralysis', 'poison'] as Status[])[randInt(0, 2)]
        if (s) {
          const r = this.applyStatus(user, s, null)
          if (r.length) ev.push({ t: 'info', side: target.side, text: `${ta.replace(/-/g, ' ')} de ${target.name}!` }, ...r)
        }
      }
      if (contact && user.ability === 'poison-touch' && chance(0.3)) ev.push(...this.applyStatus(target, 'poison', user))
    } else {
      if (contact && target.ability === 'aftermath' && user.hp > 0) {
        const amount = Math.floor(user.maxHp / 4)
        this.setHp(user, user.hp - amount)
        ev.push({ t: 'damage', side: user.side, amount, hp: user.hp, eff: 1, crit: false, text: `Aftermath! ${user.name} perdeu ${amount} HP.` })
      }
      if (user.ability === 'moxie') {
        user.atkMult = Math.min(4, user.atkMult * 1.5)
        ev.push({ t: 'info', side: user.side, text: `Moxie aumentou o Ataque de ${user.name}!` })
      }
    }
    return ev
  }

  private endOfTurn(c: Combatant): BattleEvent[] {
    const ev: BattleEvent[] = []
    ;(c as Combatant & { flinched?: boolean }).flinched = false
    if (c.status === 'poison' || c.status === 'burn') {
      const amount = Math.max(1, Math.floor(c.maxHp / (c.status === 'poison' ? 8 : 16)))
      this.setHp(c, c.hp - amount)
      ev.push({
        t: 'damage',
        side: c.side,
        amount,
        hp: c.hp,
        eff: 1,
        crit: false,
        text: `${c.name} sofreu com ${c.status === 'poison' ? 'o veneno' : 'a queimadura'}.`
      })
    }
    if (c.hp > 0 && c.status !== 'none' && c.ability === 'shed-skin' && chance(0.3)) {
      this.setStatus(c, 'none')
      ev.push({ t: 'status', side: c.side, status: 'none', text: `Shed Skin curou ${c.name}!` })
    }
    if (c.hp > 0 && c.ability === 'speed-boost' && c.speStage < 6) {
      c.speStage++
      ev.push({ t: 'info', side: c.side, text: `Speed Boost aumentou a Velocidade de ${c.name}!` })
    }
    return ev
  }

  // ---------------------------------------------------------------- itens

  private doThrow(ball: string): BattleEvent[] {
    const ctx = this.captureContext()
    const e = this.enemy
    if (!ctx || !e || !this.setup.hooks.consume(ball)) return [{ t: 'info', text: 'Sem bolas!' }]
    this.throws++
    const { shakes, caught } = throwBall(ball, ctx)
    const ev: BattleEvent[] = []
    if (caught) {
      e.ref.ball = ball
      e.ref.caughtAt = this.setup.zone
      e.ref.caughtOn = Date.now()
      e.ref.hp = e.hp
      e.ref.status = e.status
      this.caughtMon = e.ref
      this.ended = 'caught'
      ev.push({ t: 'throw', ball, shakes, caught, text: `Você jogou uma ${itemName(ball)}... Pegou! ${e.name} foi capturado!` })
      ev.push({ t: 'end', result: 'caught', text: '' })
    } else {
      const msg = ['Ah, não! Escapou!', 'Quase! Saiu da bola.', 'Por pouco!', 'Tão perto!'][shakes]
      ev.push({ t: 'throw', ball, shakes, caught, text: `Você jogou uma ${itemName(ball)}... ${msg}` })
    }
    return ev
  }

  private doPotion(item: string, heal: number): BattleEvent[] {
    const p = this.player
    if (!p || !this.setup.hooks.consume(item)) return []
    this.setHp(p, p.hp + heal)
    return [{ t: 'item', item, side: 'player', hp: p.hp, text: `Você usou ${itemName(item)} em ${p.name}.` }]
  }

  // ---------------------------------------------------------------- desmaios

  private checkFaints(): BattleEvent[] {
    const ev: BattleEvent[] = []
    const e = this.enemy
    const p = this.player
    if (e && e.hp <= 0 && !this.ended) {
      ev.push({ t: 'faint', side: 'enemy', text: `${e.name}${this.isWild ? ' selvagem' : ''} desmaiou!` })
      ev.push(...this.giveExp(e))
      this.enemyIndex++
      const next = this.enemyQueue[this.enemyIndex]
      if (next) {
        this.enemy = makeCombatant('enemy', next)
        this.participants.clear()
        if (this.player && this.player.hp > 0) this.participants.add(this.player.ref.uid)
        ev.push({ t: 'send', side: 'enemy', c: this.enemy, ...snap(this.enemy), text: `${this.setup.trainerLabel} enviou ${this.enemy.name}!` })
        if (this.player) ev.push(...this.entryAbility(this.enemy, this.player))
      } else {
        this.ended = 'win'
        ev.push({ t: 'end', result: 'win', text: this.isWild ? '' : `Você venceu ${this.setup.trainerLabel}!` })
        return ev
      }
    }
    if (p && p.hp <= 0 && !this.ended) {
      ev.push({ t: 'faint', side: 'player', text: `${p.name} desmaiou!` })
      const next = this.setup.party.find((m) => m.hp > 0)
      if (!next) {
        this.ended = 'lose'
        ev.push({ t: 'end', result: 'lose', text: 'Todos os seus Pokémon desmaiaram...' })
        return ev
      }
      this.player = makeCombatant('player', next)
      this.participants.add(next.uid)
      ev.push({ t: 'send', side: 'player', c: this.player, ...snap(this.player), text: `Vai, ${this.player.name}!` })
      if (this.enemy) ev.push(...this.entryAbility(this.player, this.enemy))
    }
    return ev
  }

  /** XP: quem lutou recebe tudo; o resto do time recebe metade (tipo Exp. Share). */
  private giveExp(defeated: Combatant): BattleEvent[] {
    const ev: BattleEvent[] = []
    const base = expYield(defeated.species, defeated.level, !this.isWild)
    for (const m of this.setup.party) {
      if (m.hp <= 0) continue
      const amount = this.participants.has(m.uid) ? base : Math.floor(base / 2)
      if (amount <= 0) continue
      const before = m.level
      const res = gainExp(m, amount)
      const name = species(m.species).name
      let text = `${name} ganhou ${amount} de experiência.`
      if (res.levels > 0) text += ` Subiu para o nível ${m.level}!`
      if (res.learned.length) text += ` Aprendeu ${res.learned.map((s) => MOVES[s]?.name ?? s).join(', ')}!`
      ev.push({ t: 'exp', uid: m.uid, amount, levels: m.level - before, level: m.level, hp: m.hp, maxHp: maxHp(m), learned: res.learned, text })
      if (this.player && this.player.ref.uid === m.uid && res.levels > 0) {
        const hp = m.hp
        this.player.stats = monStats(m)
        this.player.maxHp = maxHp(m)
        this.player.level = m.level
        this.player.moves = m.moves
        this.player.hp = hp
      }
    }
    return ev
  }
}
