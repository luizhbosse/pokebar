// Laço do jogo: caminhar → encontro → turnos animados → pós-batalha → salvar. Também guarda o
// "modelo de tela" (cartões de HP, log, avisos) que a interface Preact lê.
import type { BattleEvent, Combatant } from '../../shared/battle'
import { species } from '../../shared/data'
import { Game, STARTERS, type AfterEvent } from '../../shared/game'
import { maxHp } from '../../shared/mon'
import {
  applyOffline,
  currentZone,
  migrate,
  newGame,
  type GameState,
  type OfflineSummary
} from '../../shared/state'
import type { Status } from '../../shared/types'
import { configureAudio, music, playCry, sfx } from './audio'
import { Scene } from './scene'

export interface Card {
  species: number
  name: string
  level: number
  hp: number
  maxHp: number
  status: Status
  shiny: boolean
  uid?: string
}

export interface Toast {
  id: number
  text: string
  kind: 'info' | 'good' | 'great'
}

const AUTOSAVE_MS = 30_000
const WALK_MS = 2500
const BETWEEN_TURNS_MS = 250

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export class Controller {
  game!: Game
  scene = new Scene()
  player: Card | null = null
  enemy: Card | null = null
  log: string[] = []
  toasts: Toast[] = []
  offline: OfflineSummary | null = null
  searching = false
  private listeners = new Set<() => void>()
  private toastId = 0
  private lastTick = Date.now()
  private dirty = false

  get state(): GameState {
    return this.game.state
  }

  // ---------------------------------------------------------------- assinatura (Preact)

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  emit(): void {
    for (const fn of this.listeners) fn()
  }

  /** Mudou algo no estado pelo painel: atualiza a tela e marca para salvar. */
  changed(): void {
    this.dirty = true
    this.syncPlayerCard()
    this.emit()
  }

  // ---------------------------------------------------------------- início

  async boot(host: HTMLElement): Promise<void> {
    await this.scene.init(host)
    const raw = await window.pokebar.load()
    let state: GameState
    try {
      state = raw ? migrate(JSON.parse(raw)) : newGame()
    } catch {
      state = newGame()
    }
    this.game = new Game(state)
    this.offline = state.starterChosen ? applyOffline(state) : null
    this.scene.speed = state.settings.speed
    configureAudio(state.settings)
    music.setRegion(currentZone(state).region)
    window.pokebar.onSaveNow(async () => {
      await this.save()
      window.pokebar.saved()
    })
    setInterval(() => void this.save(), AUTOSAVE_MS)
    if (this.state.party.length) await this.showLead()
    this.emit()
    void this.loop()
  }

  async save(): Promise<void> {
    const now = Date.now()
    this.state.stats.playMs += now - this.lastTick
    this.lastTick = now
    this.state.lastSaved = now
    this.dirty = false
    await window.pokebar.save(JSON.stringify(this.state))
  }

  chooseStarter(id: number): void {
    if (this.state.starterChosen || !STARTERS.includes(id)) return
    this.game.chooseStarter(id)
    void playCry(id, true)
    sfx('caught')
    void this.showLead()
    this.changed()
    void this.save()
  }

  applySettings(): void {
    const s = this.state.settings
    this.scene.speed = s.speed
    configureAudio(s)
    this.changed()
  }

  // ---------------------------------------------------------------- avisos

  toast(text: string, kind: Toast['kind'] = 'info', ms = 4500): void {
    const t = { id: ++this.toastId, text, kind }
    this.toasts = [...this.toasts.slice(-2), t]
    this.emit()
    setTimeout(() => {
      this.toasts = this.toasts.filter((x) => x.id !== t.id)
      this.emit()
    }, ms)
  }

  private pushLog(text: string): void {
    if (!text) return
    this.log = [...this.log.slice(-40), text]
  }

  // ---------------------------------------------------------------- cartões

  private card(c: Combatant, hp: number, maxHpV: number, status: Status, level: number): Card {
    return { species: c.species, name: c.name, level, hp, maxHp: maxHpV, status, shiny: c.shiny, uid: c.ref.uid }
  }

  /** Cartão/sprite do líder do time quando não há batalha (ou depois de mexer no time). */
  private syncPlayerCard(): void {
    if (this.game.encounter) return
    const lead = this.state.party.find((m) => m.hp > 0) ?? this.state.party[0]
    if (!lead) return
    this.player = {
      species: lead.species,
      name: species(lead.species).name,
      level: lead.level,
      hp: lead.hp,
      maxHp: maxHp(lead),
      status: lead.status,
      shiny: lead.shiny,
      uid: lead.uid
    }
  }

  private async showLead(): Promise<void> {
    this.syncPlayerCard()
    if (this.player) await this.scene.setSprite('player', this.player.species, this.player.shiny)
  }

  // ---------------------------------------------------------------- laço

  private async loop(): Promise<void> {
    for (;;) {
      try {
        await this.step()
      } catch (err) {
        window.pokebar.log(`erro no laço: ${(err as Error).stack ?? err}`)
        this.game.encounter = null
        await sleep(2000)
      }
    }
  }

  private walkMs(): number {
    const lead = this.state.party.find((m) => m.hp > 0)
    const k = lead?.ability === 'illuminate' ? 0.85 : lead?.ability === 'stench' ? 1.15 : 1
    return WALK_MS * k
  }

  private async step(): Promise<void> {
    if (!this.state.starterChosen) {
      await sleep(400)
      return
    }
    music.setRegion(currentZone(this.state).region)
    await this.showLead()
    this.searching = true
    this.enemy = null
    this.emit()
    await this.scene.walk(this.walkMs())
    this.searching = false

    const enc = this.game.nextEncounter()
    if (!enc) {
      await sleep(1000)
      return
    }
    this.emit()
    await this.play(this.game.start(), enc.kind)
    while (!enc.battle.ended) {
      await this.scene.wait(BETWEEN_TURNS_MS)
      await this.play(this.game.turn(), enc.kind)
    }
    const after = this.game.finish()
    await this.playAfter(after)
    this.enemy = null
    this.scene.clear('enemy')
    this.syncPlayerCard()
    this.emit()
    if (after.some((a) => a.t === 'caught' || a.t === 'badge' || a.t === 'evolve')) void this.save()
    else if (this.dirty) void this.save()
  }

  /** Captura manual (botão na faixa). */
  requestCapture(): boolean {
    const enc = this.game.encounter
    if (!enc || !enc.battle.setup.capturable || enc.battle.ended) return false
    const hasBall = Object.entries(this.state.items).some(([k, v]) => k.endsWith('-ball') && v > 0)
    if (!hasBall) {
      this.toast('Sem Poké Balls! Compre na Loja.', 'info')
      return false
    }
    this.game.manualCapture = true
    this.pushLog('Você decidiu tentar capturar!')
    this.emit()
    return true
  }

  get canCapture(): boolean {
    const enc = this.game?.encounter
    return !!enc && enc.battle.setup.capturable && !enc.battle.ended && !!this.enemy
  }

  // ---------------------------------------------------------------- eventos de batalha

  private async play(events: BattleEvent[], kind: string): Promise<void> {
    for (const e of events) {
      this.pushLog(e.text)
      await this.animate(e, kind)
      this.emit()
    }
  }

  private async animate(e: BattleEvent, kind: string): Promise<void> {
    const sc = this.scene
    switch (e.t) {
      case 'send': {
        const card = this.card(e.c, e.hp, e.maxHp, e.status, e.level)
        if (e.side === 'enemy') this.enemy = card
        else this.player = card
        this.emit()
        const important = e.side === 'enemy' && (e.c.shiny || kind === 'event' || kind === 'roaming' || kind === 'leader')
        if (e.side === 'enemy' && e.c.shiny) {
          sfx('shiny')
          this.toast(`✨ Um ${e.c.name} SHINY apareceu!`, 'great', 8000)
        }
        if (e.side === 'enemy' && (kind === 'event' || kind === 'roaming')) this.toast(`Um ${e.c.name} raro apareceu!`, 'great', 7000)
        void playCry(e.c.species, important)
        await sc.appear(e.side, e.c.species, e.c.shiny)
        break
      }
      case 'move':
        await sc.lunge(e.side)
        break
      case 'damage': {
        const card = e.side === 'enemy' ? this.enemy : this.player
        if (card) card.hp = e.hp
        this.emit()
        sfx(e.eff > 1 ? 'super' : e.eff < 1 ? 'weak' : 'hit')
        sc.float(e.side, `-${e.amount}${e.crit ? '!' : ''}`, e.eff > 1 ? 0xffa726 : 0xff5252, e.crit ? 16 : 13)
        await sc.hurt(e.side)
        break
      }
      case 'miss':
        sfx('miss')
        sc.float(e.side === 'player' ? 'enemy' : 'player', 'errou', 0xcfd8dc)
        await sc.wait(350)
        break
      case 'status': {
        const card = e.side === 'enemy' ? this.enemy : this.player
        if (card) card.status = e.status
        if (e.status !== 'none') sc.float(e.side, STATUS_TAG[e.status], STATUS_COLOR[e.status])
        await sc.wait(400)
        break
      }
      case 'cant':
        await sc.shake(e.side)
        break
      case 'heal':
      case 'item': {
        const card = e.side === 'enemy' ? this.enemy : this.player
        if (card) card.hp = e.hp
        sfx('heal')
        sc.float(e.side, '+HP', 0x69f0ae)
        await sc.wait(450)
        break
      }
      case 'faint':
        sfx('faint')
        void playCry(e.side === 'enemy' ? (this.enemy?.species ?? 0) : (this.player?.species ?? 0))
        await sc.faint(e.side)
        if (e.side === 'enemy') this.enemy = null
        break
      case 'exp':
        if (this.player?.uid === e.uid) {
          this.player.level = e.level
          this.player.hp = e.hp
          this.player.maxHp = e.maxHp
          sc.float('player', `+${e.amount} XP`, 0x80d8ff, 11)
        }
        if (e.levels > 0) {
          sfx('levelup')
          if (this.player?.uid === e.uid) sc.float('player', `Nv. ${e.level}!`, 0xffeb3b, 14)
          await sc.wait(450)
        } else await sc.wait(150)
        break
      case 'throw':
        sfx('throw')
        await sc.throwBall(
          e.shakes,
          e.caught,
          () => sfx('shake'),
          () => sfx(e.caught ? 'caught' : 'escape')
        )
        if (e.caught) {
          this.enemy = null
          this.toast(e.text, 'good')
        }
        break
      case 'info':
        await sc.wait(e.text.includes('quer lutar') ? 700 : 350)
        break
      case 'end':
        await sc.wait(400)
        break
    }
  }

  private async playAfter(after: AfterEvent[]): Promise<void> {
    for (const a of after) {
      this.pushLog(a.text)
      switch (a.t) {
        case 'money':
          sfx('money')
          break
        case 'caught':
          if (a.mon.shiny) this.toast(`✨ ${a.text}`, 'great', 8000)
          break
        case 'badge':
          sfx('badge')
          this.toast(`🏅 ${a.text}`, 'great', 9000)
          break
        case 'evolve': {
          sfx('evolve')
          this.toast(a.text, 'great', 7000)
          const m = this.state.party.find((x) => x.uid === a.uid)
          if (m && this.player?.uid === a.uid) {
            void playCry(a.to, true)
            await this.scene.flashEvolve(a.to, m.shiny)
            this.syncPlayerCard()
          }
          break
        }
        case 'item':
          this.toast(a.text, 'info')
          break
        case 'heal':
          sfx('heal')
          this.toast(a.text, 'info')
          break
        case 'zone':
          this.toast(a.text, 'info')
          music.setRegion(currentZone(this.state).region)
          break
        case 'info':
          if (a.text.includes('liberad') || a.text.includes('Campeão')) this.toast(a.text, 'good', 6000)
          break
      }
      this.emit()
      await this.scene.wait(120)
    }
  }
}

export const STATUS_TAG: Record<Status, string> = { none: '', sleep: 'DOR', paralysis: 'PAR', poison: 'VEN', burn: 'QUE' }
const STATUS_COLOR: Record<Status, number> = { none: 0xffffff, sleep: 0xb0bec5, paralysis: 0xffd54f, poison: 0xce93d8, burn: 0xff8a65 }

export const controller = new Controller()
