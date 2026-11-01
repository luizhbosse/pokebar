// Regras de jogo sem tela: encontros, pós-batalha, mapa, loja, PC. O renderer só cuida de tempo e animação.
import { BALANCE } from './balance'
import { Battle, type BattleEvent, type BattleSetup, type EnemySpec } from './battle'
import { species } from './data'
import { SHOP, itemInfo, itemName, releaseMoney, trainerMoney, wildMoney } from './items'
import { createMon, evolve, fullHeal, itemEvolution, maxHp, pendingLevelEvolution } from './mon'
import { chance, pick, randInt, weighted } from './rng'
import {
  addItem,
  currentZone,
  isUnlocked,
  markCaught,
  markSeen,
  pickBall,
  useItem,
  zoneProgress,
  type GameState
} from './state'
import { ivPercent } from './stats'
import type { OwnedMon } from './types'
import { ROAMING, ZONES, fitSpecies, randomTrainerLabel, rollPool, zoneIndex, zonePool, type Zone, type ZoneEvent } from './world'

export const PARTY_MAX = 6
export const TRAINER_EVERY = 7
export const GYM_RETRY_WINS = BALANCE.gymRetryWins

export type EncounterKind = 'wild' | 'trainer' | 'leader' | 'event' | 'roaming'

export interface Encounter {
  kind: EncounterKind
  battle: Battle
  zone: Zone
  event?: ZoneEvent
  label?: string
}

export type AfterEvent =
  | { t: 'money'; amount: number; text: string }
  | { t: 'caught'; mon: OwnedMon; toBox: boolean; text: string }
  | { t: 'badge'; badge: string; text: string }
  | { t: 'evolve'; uid: string; from: number; to: number; text: string }
  | { t: 'item'; item: string; text: string }
  | { t: 'heal'; text: string }
  | { t: 'zone'; zone: string; text: string }
  | { t: 'info'; text: string }

export const STARTERS = [152, 155, 158, 1, 4, 7]

export class Game {
  state: GameState
  encounter: Encounter | null = null
  /** Botão "Capturar" pressionado para o encontro atual. */
  manualCapture = false

  constructor(state: GameState) {
    this.state = state
  }

  // ---------------------------------------------------------------- início

  chooseStarter(id: number): OwnedMon {
    const m = createMon(id, 5, { ball: 'poke-ball', zone: 'new-bark' })
    this.state.party.push(m)
    markCaught(this.state, m)
    this.state.starterChosen = true
    return m
  }

  // ---------------------------------------------------------------- encontros

  private hooks(shinyRef: () => boolean): BattleSetup['hooks'] {
    const s = this.state
    return {
      chooseBall: (ctx, throws) => pickBall(s, ctx, shinyRef(), throws),
      consume: (item) => useItem(s, item),
      has: (item) => (s.items[item] ?? 0) > 0,
      potionThreshold: s.settings.potionThreshold
    }
  }

  /** Monta o próximo encontro na zona atual. */
  nextEncounter(): Encounter | null {
    const s = this.state
    if (!s.party.some((m) => m.hp > 0)) return null
    const zone = currentZone(s)
    let kind: EncounterKind = 'wild'
    let enemies: EnemySpec[] = []
    let label: string | undefined
    let event: ZoneEvent | undefined
    let fished = false

    if (zone.trainer) {
      kind = 'leader'
      label = `${zone.trainer.title} ${zone.trainer.name}`
      enemies = zone.trainer.team.map(([sp, lv]) => ({ species: sp, level: lv, shiny: false }))
    } else {
      event = this.rollEvent(zone)
      const roam = !event ? this.rollRoaming(zone) : null
      if (event) {
        kind = 'event'
        enemies = [{ species: event.species, level: event.level, shiny: event.shiny }]
      } else if (roam) {
        kind = 'roaming'
        enemies = [{ species: roam, level: ROAMING.level }]
      } else if (s.stats.trainerCounter >= TRAINER_EVERY - 1) {
        s.stats.trainerCounter = 0
        kind = 'trainer'
        label = randomTrainerLabel()
        const pool = zonePool(zone)
        const n = weighted([1, 2, 3], (x) => (x === 1 ? 50 : x === 2 ? 35 : 15)) ?? 1
        for (let i = 0; i < n; i++) {
          const e = rollPool(pool)
          if (e) {
            const lv = Math.max(2, zone.levels[1] + randInt(-1, 1))
            enemies.push({ species: fitSpecies(e.species, lv), level: lv, shiny: false })
          }
        }
      } else {
        s.stats.trainerCounter++
        const extra = (zone.extras ?? []).find((x) => chance(x.p))
        const lead = s.party.find((m) => m.hp > 0)
        const boost = lead?.ability === 'magnet-pull' ? 'steel' : undefined
        const e = extra ? { species: extra.species, fished: false } : rollPool(zonePool(zone), boost)
        if (e) {
          const lv = randInt(zone.levels[0], zone.levels[1])
          enemies = [{ species: extra ? e.species : fitSpecies(e.species, lv), level: lv }]
          fished = e.fished
        }
      }
    }
    if (!enemies.length) return null

    let battle: Battle | null = null
    const setup: BattleSetup = {
      kind: kind === 'trainer' || kind === 'leader' ? 'trainer' : 'wild',
      party: s.party,
      enemies,
      trainerLabel: label,
      fished,
      capturable: kind === 'wild' || kind === 'event' || kind === 'roaming',
      forceCapture: () => this.manualCapture,
      hooks: this.hooks(() => battle?.enemy?.shiny ?? false),
      zone: zone.id
    }
    battle = new Battle(setup)
    this.manualCapture = false
    this.encounter = { kind, battle, zone, event, label }
    return this.encounter
  }

  private rollEvent(zone: Zone): ZoneEvent | undefined {
    const s = this.state
    const friday = new Date().getDay() === 5
    return (zone.events ?? []).find((ev) => {
      if (s.eventsCaught.includes(ev.id)) return false
      if (ev.requires?.defeated && !s.defeated.includes(ev.requires.defeated)) return false
      if (ev.requires?.friday && !friday) return false
      return chance(ev.p)
    })
  }

  private rollRoaming(zone: Zone): number | null {
    const s = this.state
    if (zone.region !== 'johto' || s.badges.length < ROAMING.minBadges) return null
    const left = ROAMING.species.filter((id) => !s.eventsCaught.includes(`roam-${id}`))
    if (!left.length || !chance(ROAMING.p)) return null
    return pick(left)
  }

  /** Começa o encontro: eventos iniciais (e marca vistos). */
  start(): BattleEvent[] {
    const ev = this.encounter?.battle.start() ?? []
    this.track(ev)
    return ev
  }

  turn(): BattleEvent[] {
    const ev = this.encounter?.battle.nextTurn() ?? []
    this.track(ev)
    return ev
  }

  private track(ev: BattleEvent[]): void {
    for (const e of ev) if (e.t === 'send' && e.side === 'enemy') markSeen(this.state, e.c.species)
  }

  // ---------------------------------------------------------------- pós-batalha

  finish(): AfterEvent[] {
    const enc = this.encounter
    const s = this.state
    if (!enc || !enc.battle.ended) return []
    this.encounter = null
    const out: AfterEvent[] = []
    const result = enc.battle.ended
    const zone = enc.zone
    s.stats.battles++

    if (result === 'caught' && enc.battle.caughtMon) {
      const m = enc.battle.caughtMon
      m.moves = m.moves.length ? m.moves : ['tackle']
      if (m.hp <= 0) m.hp = 1
      const toBox = s.party.length >= PARTY_MAX
      ;(toBox ? s.box : s.party).push(m)
      markCaught(s, m)
      s.stats.caught++
      if (m.shiny) s.stats.shinies++
      if (enc.event) s.eventsCaught.push(enc.event.id)
      if (enc.kind === 'roaming') s.eventsCaught.push(`roam-${m.species}`)
      out.push({
        t: 'caught',
        mon: m,
        toBox,
        text: `${species(m.species).name} (IV ${ivPercent(m.ivs)}%) foi ${toBox ? 'enviado ao PC' : 'para o time'}.`
      })
    }

    if (result === 'win') {
      const b = enc.battle
      let money = 0
      if (enc.kind === 'leader' && zone.trainer) money = zone.trainer.reward
      else if (enc.kind === 'trainer') {
        const last = b.enemyQueue[b.enemyQueue.length - 1]
        money = trainerMoney(last.level, b.enemyQueue.length)
      } else money = wildMoney(b.enemyQueue[0].level)
      if (money > 0) {
        s.money += money
        out.push({ t: 'money', amount: money, text: `Você ganhou ₽${money}.` })
      }
      if (enc.kind === 'leader' && zone.trainer) out.push(...this.leaderDefeated(zone))
    }

    if (result === 'win' || result === 'caught') {
      if (zone.kind === 'route') {
        const p = zoneProgress(s, zone.id)
        p.wins++
        if (!p.cleared && p.wins >= zone.wins) {
          p.cleared = true
          const next = ZONES[zoneIndex(zone.id) + 1]
          if (next) out.push({ t: 'info', text: `${zone.name} concluída! ${next.name} liberado.` })
        }
      }
      out.push(...this.afterWinEffects())
    }

    out.push(...this.evolutions())

    if (result === 'flee') out.push({ t: 'info', text: 'Sem vencedor desta vez.' })

    // Time inteiro desmaiado (inclusive em vitória no mesmo turno) = Centro Pokémon.
    if (result === 'lose' || !s.party.some((m) => m.hp > 0)) {
      for (const m of s.party) fullHeal(m)
      out.push({ t: 'heal', text: 'Você correu para o Centro Pokémon. Seu time foi curado.' })
      if (zone.kind !== 'route') {
        const back = this.previousRoute(zone)
        if (back) {
          s.zone = back.id
          const p = zoneProgress(s, back.id)
          p.retryAt = p.wins + GYM_RETRY_WINS
          out.push({ t: 'zone', zone: back.id, text: `De volta para ${back.name} para treinar mais.` })
        }
      }
    } else {
      out.push(...this.maybeAdvance(zone))
    }

    // Reviver e poção fora da batalha
    if (s.settings.autoRevive) {
      for (const m of s.party) {
        if (m.hp <= 0 && useItem(s, 'revive')) {
          m.hp = Math.floor(maxHp(m) / 2)
          m.status = 'none'
          out.push({ t: 'item', item: 'revive', text: `Revive usado em ${species(m.species).name}.` })
        }
      }
    }
    return out
  }

  private leaderDefeated(zone: Zone): AfterEvent[] {
    const s = this.state
    const tr = zone.trainer!
    const out: AfterEvent[] = []
    zoneProgress(s, zone.id).cleared = true
    if (!s.defeated.includes(zone.id)) {
      s.defeated.push(zone.id)
      if (tr.badge && !s.badges.includes(tr.badge)) {
        s.badges.push(tr.badge)
        out.push({ t: 'badge', badge: tr.badge, text: `Você ganhou a insígnia ${tr.badge}!` })
      }
      if (tr.prize) {
        addItem(s, tr.prize)
        out.push({ t: 'item', item: tr.prize, text: `Você recebeu uma ${itemName(tr.prize)}!` })
      }
      if (zone.id === 'lance') out.push({ t: 'info', text: 'Você é o novo Campeão! Kanto está liberada.' })
      if (zone.id === 'red') out.push({ t: 'info', text: 'Você venceu Red! Cerulean Cave e Ilha Distante liberadas.' })
    }
    return out
  }

  private afterWinEffects(): AfterEvent[] {
    const s = this.state
    const out: AfterEvent[] = []
    for (const m of s.party) {
      const name = species(m.species).name
      if (m.hp > 0 && m.ability === 'natural-cure' && m.status !== 'none') m.status = 'none'
      if (m.hp > 0 && m.ability === 'regenerator') m.hp = Math.min(maxHp(m), m.hp + Math.floor(maxHp(m) / 3))
      if (m.hp > 0 && m.ability === 'pickup' && chance(0.1)) {
        const item = weighted(['poke-ball', 'potion', 'great-ball', 'super-potion'], (x) =>
          x === 'poke-ball' ? 50 : x === 'potion' ? 30 : x === 'great-ball' ? 12 : 8
        ) as string
        addItem(s, item)
        out.push({ t: 'item', item, text: `${name} achou uma ${itemName(item)} (Pickup)!` })
      }
      if (m.hp > 0 && m.ability === 'honey-gather' && chance(0.08)) {
        s.money += 100
        out.push({ t: 'money', amount: 100, text: `${name} juntou mel e vendeu por ₽100.` })
      }
    }
    const healer = s.party.find((m) => m.hp > 0 && m.ability === 'healer')
    if (healer && chance(0.3)) {
      const sick = s.party.find((m) => m.status !== 'none' && m.hp > 0)
      if (sick) sick.status = 'none'
    }
    // Poção fora de batalha no líder do time
    const lead = s.party.find((m) => m.hp > 0)
    if (lead && lead.hp / maxHp(lead) < s.settings.potionThreshold / 100) {
      const missing = maxHp(lead) - lead.hp
      const owned = SHOP.filter((i) => i.kind === 'potion' && (s.items[i.slug] ?? 0) > 0)
      const fit = owned.find((x) => (x.heal ?? 0) >= missing * 0.6) ?? owned[owned.length - 1]
      if (fit && useItem(s, fit.slug)) {
        lead.hp = Math.min(maxHp(lead), lead.hp + (fit.heal ?? 20))
        out.push({ t: 'item', item: fit.slug, text: `${fit.name} usada em ${species(lead.species).name}.` })
      }
    }
    return out
  }

  private evolutions(): AfterEvent[] {
    const s = this.state
    const out: AfterEvent[] = []
    for (const m of s.party) {
      const evo = pendingLevelEvolution(m)
      if (!evo) continue
      const from = m.species
      evolve(m, evo.to)
      markCaught(s, m)
      out.push({
        t: 'evolve',
        uid: m.uid,
        from,
        to: evo.to,
        text: `Parabéns! ${species(from).name} evoluiu para ${species(evo.to).name}!`
      })
    }
    return out
  }

  private previousRoute(zone: Zone): Zone | null {
    for (let i = zoneIndex(zone.id) - 1; i >= 0; i--) if (ZONES[i].kind === 'route') return ZONES[i]
    return null
  }

  private maybeAdvance(zone: Zone): AfterEvent[] {
    const s = this.state
    const i = zoneIndex(zone.id)
    const next = ZONES[i + 1]
    // O jogador trocou de zona no meio da batalha: respeita a escolha dele.
    if (!next || s.zone !== zone.id) return []
    const p = zoneProgress(s, zone.id)
    // Depois de vencer um líder, segue em frente sempre.
    const leaderBeaten = zone.kind !== 'route' && p.cleared
    const routeReady =
      zone.kind === 'route' && s.settings.autoAdvance && p.cleared && p.wins >= (p.retryAt ?? 0)
    if (!leaderBeaten && !routeReady) return []
    // Com avanço automático, pula zonas já concluídas até a primeira pendente.
    let target = next
    if (s.settings.autoAdvance) {
      for (let j = i + 1; j < ZONES.length; j++) {
        target = ZONES[j]
        if (!zoneProgress(s, ZONES[j].id).cleared) break
      }
    }
    return this.setZone(target.id)
  }

  // ---------------------------------------------------------------- ações do jogador

  setZone(id: string): AfterEvent[] {
    const s = this.state
    if (!isUnlocked(s, id) || s.zone === id) return []
    s.zone = id
    for (const m of s.party) fullHeal(m)
    const z = currentZone(s)
    return [{ t: 'zone', zone: id, text: `Indo para ${z.name}. Time curado no Centro Pokémon.` }]
  }

  buy(slug: string, qty: number): boolean {
    const s = this.state
    const it = itemInfo(slug)
    if (!it || it.badges > s.badges.length) return false
    const cost = it.price * qty
    if (cost <= 0 || s.money < cost) return false
    s.money -= cost
    addItem(s, slug, qty)
    return true
  }

  release(uid: string): number {
    const s = this.state
    const inBox = s.box.findIndex((m) => m.uid === uid)
    const inParty = s.party.findIndex((m) => m.uid === uid)
    let m: OwnedMon | undefined
    if (inBox >= 0) m = s.box.splice(inBox, 1)[0]
    else if (inParty >= 0 && s.party.length > 1) m = s.party.splice(inParty, 1)[0]
    if (!m) return 0
    const money = releaseMoney(m.level, ivPercent(m.ivs), m.shiny)
    s.money += money
    return money
  }

  toParty(uid: string): boolean {
    const s = this.state
    if (s.party.length >= PARTY_MAX) return false
    const i = s.box.findIndex((m) => m.uid === uid)
    if (i < 0) return false
    s.party.push(s.box.splice(i, 1)[0])
    return true
  }

  toBox(uid: string): boolean {
    const s = this.state
    if (s.party.length <= 1) return false
    const i = s.party.findIndex((m) => m.uid === uid)
    if (i < 0) return false
    const [m] = s.party.splice(i, 1)
    fullHeal(m)
    s.box.unshift(m)
    return true
  }

  /** Troca um do time por um do PC na mesma posição. */
  swap(partyUid: string, boxUid: string): boolean {
    const s = this.state
    const i = s.party.findIndex((m) => m.uid === partyUid)
    const j = s.box.findIndex((m) => m.uid === boxUid)
    if (i < 0 || j < 0) return false
    const out = s.party[i]
    fullHeal(out)
    s.party[i] = s.box[j]
    s.box[j] = out
    return true
  }

  movePartySlot(uid: string, dir: -1 | 1): void {
    const p = this.state.party
    const i = p.findIndex((m) => m.uid === uid)
    const j = i + dir
    if (i < 0 || j < 0 || j >= p.length) return
    ;[p[i], p[j]] = [p[j], p[i]]
  }

  useEvoItem(uid: string, item: string): AfterEvent | null {
    const s = this.state
    const m = [...s.party, ...s.box].find((x) => x.uid === uid)
    if (!m) return null
    const evo = itemEvolution(m, item)
    if (!evo || !useItem(s, item)) return null
    const from = m.species
    evolve(m, evo.to)
    markCaught(s, m)
    return { t: 'evolve', uid, from, to: evo.to, text: `Parabéns! ${species(from).name} evoluiu para ${species(evo.to).name}!` }
  }

  isBusy(): boolean {
    return this.encounter !== null
  }
}
