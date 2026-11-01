// Cena da faixa (PixiJS): sprites animados B/W, golpes, dano, captura, desmaio e caminhada.
import 'pixi.js/unsafe-eval'
import 'pixi.js/gif'
import { Application, Assets, Container, Graphics, Text, TextureSource } from 'pixi.js'
import { GifSprite, type GifSource } from 'pixi.js/gif'

export const STRIP_H = 110
export const LAYOUT = {
  playerX: 420,
  enemyX: 560,
  ground: STRIP_H - 10
}
const MAX_SPRITE_H = 90

TextureSource.defaultOptions.scaleMode = 'nearest'

type SlotSide = 'player' | 'enemy'

interface Slot {
  holder: Container
  sprite: GifSprite | null
  shadow: Graphics
  key: string
}

const gifCache = new Map<string, Promise<GifSource>>()
function loadGif(url: string): Promise<GifSource> {
  let p = gifCache.get(url)
  if (!p) {
    p = Assets.load<GifSource>(url)
    gifCache.set(url, p)
  }
  return p
}

export function spriteUrl(species: number, shiny: boolean, back: boolean): string {
  return `sprites/pokemon/${species}${back ? '-b' : ''}${back && shiny ? 's' : !back && shiny ? '-s' : ''}.gif`
}

export class Scene {
  app = new Application()
  speed = 1
  private stage!: Container
  private slots!: Record<SlotSide, Slot>
  private ball!: Graphics
  private grass!: Graphics
  private grassOffset = 0
  private walking = false
  private walkT = 0

  async init(host: HTMLElement): Promise<void> {
    await this.app.init({
      backgroundAlpha: 0,
      resizeTo: host,
      antialias: true,
      resolution: window.devicePixelRatio,
      autoDensity: true
    })
    host.appendChild(this.app.canvas)
    this.stage = new Container()
    this.app.stage.addChild(this.stage)

    this.grass = new Graphics()
    this.stage.addChild(this.grass)

    const mkSlot = (x: number): Slot => {
      const holder = new Container()
      holder.position.set(x, LAYOUT.ground)
      const shadow = new Graphics().ellipse(0, 0, 26, 5).fill({ color: 0x000000, alpha: 0.28 })
      holder.addChild(shadow)
      this.stage.addChild(holder)
      return { holder, sprite: null, shadow, key: '' }
    }
    this.slots = { player: mkSlot(LAYOUT.playerX), enemy: mkSlot(LAYOUT.enemyX) }
    this.slots.enemy.shadow.visible = false

    this.ball = makePokeball(7)
    this.ball.visible = false
    this.stage.addChild(this.ball)

    this.app.ticker.add((t) => this.tick(t.deltaMS))
  }

  private tick(dt: number): void {
    this.grass.clear()
    if (this.walking) {
      this.walkT += dt
      this.grassOffset = (this.grassOffset + dt * 0.06) % 40
      const p = this.slots.player
      p.holder.y = LAYOUT.ground - Math.abs(Math.sin(this.walkT / 140)) * 4
    }
    // Tufos de grama passando sob o Pokémon enquanto anda.
    const startX = LAYOUT.playerX - 140
    for (let x = startX - this.grassOffset; x < LAYOUT.enemyX + 60; x += 40) {
      if (x < startX - 20) continue
      const g = LAYOUT.ground + 2
      this.grass.moveTo(x, g).lineTo(x - 3, g - 7).moveTo(x, g).lineTo(x + 1, g - 9).moveTo(x, g).lineTo(x + 4, g - 6)
    }
    this.grass.stroke({ width: 1.5, color: 0x5d9b47, alpha: 0.55 })
  }

  // ---------------------------------------------------------------- utilidades

  private tween(ms: number, fn: (t: number) => void): Promise<void> {
    const total = Math.max(16, ms / this.speed)
    return new Promise((resolve) => {
      let elapsed = 0
      const step = (t: { deltaMS: number }): void => {
        elapsed += t.deltaMS
        const k = Math.min(1, elapsed / total)
        fn(k)
        if (k >= 1) {
          this.app.ticker.remove(step)
          resolve()
        }
      }
      this.app.ticker.add(step)
    })
  }

  wait(ms: number): Promise<void> {
    return this.tween(ms, () => {})
  }

  float(side: SlotSide, text: string, color: number, size = 13): void {
    const slot = this.slots[side]
    const t = new Text({
      text,
      style: { fontFamily: 'Segoe UI, sans-serif', fontSize: size, fontWeight: '700', fill: color, stroke: { color: 0x000000, width: 3 } }
    })
    t.anchor.set(0.5, 1)
    const h = slot.sprite ? slot.sprite.height : 40
    t.position.set(slot.holder.x + (side === 'player' ? -6 : 6), LAYOUT.ground - h - 2)
    this.stage.addChild(t)
    const y0 = t.y
    void this.tween(900, (k) => {
      t.y = y0 - k * 18
      t.alpha = 1 - k * k
    }).then(() => t.destroy())
  }

  // ---------------------------------------------------------------- sprites

  async setSprite(side: SlotSide, species: number, shiny: boolean): Promise<void> {
    const slot = this.slots[side]
    const key = `${species}|${shiny}`
    if (slot.key === key && slot.sprite) {
      slot.holder.alpha = 1
      slot.holder.scale.set(1)
      return
    }
    const url = spriteUrl(species, shiny, side === 'player')
    let source: GifSource
    try {
      source = await loadGif(url)
    } catch {
      source = await loadGif(spriteUrl(species, shiny, false))
    }
    slot.sprite?.destroy()
    const gif = new GifSprite({ source, autoPlay: true, loop: true })
    gif.anchor.set(0.5, 1)
    const scale = Math.min(1, MAX_SPRITE_H / gif.height)
    gif.scale.set(scale)
    // Sprite de costas do jogador olha para a direita; o de frente do inimigo olha para a esquerda.
    slot.holder.addChild(gif)
    slot.sprite = gif
    slot.key = key
    slot.shadow.visible = true
    slot.shadow.scale.set(Math.max(0.6, Math.min(1.6, gif.width / 52)), 1)
    slot.holder.alpha = 1
    slot.holder.scale.set(1)
    slot.holder.y = LAYOUT.ground
  }

  clear(side: SlotSide): void {
    const slot = this.slots[side]
    slot.sprite?.destroy()
    slot.sprite = null
    slot.key = ''
    slot.shadow.visible = false
  }

  /** O Pokémon líder caminha procurando encontro. */
  async walk(ms: number): Promise<void> {
    this.clear('enemy')
    this.walking = true
    await this.wait(ms)
    this.walking = false
    this.slots.player.holder.y = LAYOUT.ground
  }

  // ---------------------------------------------------------------- animações

  async appear(side: SlotSide, species: number, shiny: boolean): Promise<void> {
    await this.setSprite(side, species, shiny)
    const h = this.slots[side].holder
    if (side === 'enemy') {
      const x0 = LAYOUT.enemyX
      h.alpha = 0
      await this.tween(320, (k) => {
        h.x = x0 + (1 - k) * 50
        h.alpha = k
      })
      h.x = x0
    } else {
      h.scale.set(0)
      await this.tween(260, (k) => h.scale.set(easeOutBack(k)))
      h.scale.set(1)
    }
    if (shiny) await this.sparkle(side)
  }

  async sparkle(side: SlotSide): Promise<void> {
    const slot = this.slots[side]
    const stars: Graphics[] = []
    for (let i = 0; i < 6; i++) {
      const s = new Graphics().star(0, 0, 4, 5, 2).fill(0xfff59d)
      s.position.set(slot.holder.x + (Math.random() - 0.5) * 50, LAYOUT.ground - 20 - Math.random() * 50)
      this.stage.addChild(s)
      stars.push(s)
    }
    await this.tween(600, (k) => stars.forEach((s, i) => ((s.alpha = 1 - k), (s.rotation = k * 3 + i))))
    stars.forEach((s) => s.destroy())
  }

  async lunge(side: SlotSide): Promise<void> {
    const h = this.slots[side].holder
    const x0 = side === 'player' ? LAYOUT.playerX : LAYOUT.enemyX
    const dir = side === 'player' ? 1 : -1
    await this.tween(200, (k) => (h.x = x0 + Math.sin(k * Math.PI) * 18 * dir))
    h.x = x0
  }

  async hurt(side: SlotSide): Promise<void> {
    const h = this.slots[side].holder
    await this.tween(300, (k) => (h.alpha = Math.floor(k * 6) % 2 === 0 ? 0.25 : 1))
    h.alpha = 1
  }

  async shake(side: SlotSide): Promise<void> {
    const h = this.slots[side].holder
    const x0 = h.x
    await this.tween(240, (k) => (h.x = x0 + Math.sin(k * Math.PI * 6) * 3))
    h.x = x0
  }

  async faint(side: SlotSide): Promise<void> {
    const h = this.slots[side].holder
    await this.tween(380, (k) => {
      h.y = LAYOUT.ground + k * 30
      h.alpha = 1 - k
    })
    this.clear(side)
    h.y = LAYOUT.ground
    h.alpha = 1
  }

  /** Arremesso: arco até o alvo, balanços e resultado. */
  async throwBall(shakes: number, caught: boolean, onShake: () => void, onResult: () => void): Promise<void> {
    const b = this.ball
    const enemy = this.slots.enemy.holder
    const x0 = LAYOUT.playerX + 20
    const x1 = LAYOUT.enemyX
    const yTop = 18
    const yEnd = LAYOUT.ground - 8
    b.visible = true
    b.alpha = 1
    await this.tween(380, (k) => {
      b.x = x0 + (x1 - x0) * k
      b.y = LAYOUT.ground - 30 - Math.sin(k * Math.PI) * (LAYOUT.ground - 30 - yTop) + k * 22
      b.rotation = k * 10
    })
    await this.tween(180, (k) => enemy.scale.set(1 - k))
    await this.tween(150, (k) => (b.y = b.y + (yEnd - b.y) * k))
    b.rotation = 0
    for (let i = 0; i < shakes; i++) {
      onShake()
      await this.tween(330, (k) => (b.rotation = Math.sin(k * Math.PI * 2) * 0.45))
      await this.wait(160)
    }
    onResult()
    if (caught) {
      const g = new Graphics().star(0, 0, 5, 7, 3).fill(0xfff59d)
      g.position.set(b.x, b.y - 14)
      this.stage.addChild(g)
      await this.tween(500, (k) => (g.alpha = 1 - k))
      g.destroy()
      await this.tween(300, (k) => (b.alpha = 1 - k))
      this.clear('enemy')
      enemy.scale.set(1)
    } else {
      await this.tween(160, (k) => enemy.scale.set(k))
      enemy.scale.set(1)
    }
    b.visible = false
  }

  async flashEvolve(species: number, shiny: boolean): Promise<void> {
    const h = this.slots.player.holder
    await this.tween(500, (k) => (h.alpha = 0.3 + Math.abs(Math.sin(k * Math.PI * 4)) * 0.7))
    await this.setSprite('player', species, shiny)
    await this.tween(300, (k) => h.scale.set(0.6 + 0.4 * easeOutBack(k)))
    h.scale.set(1)
    h.alpha = 1
  }

  /** Há algo interativo sob o ponto (coordenadas da faixa)? */
  hitTest(x: number, y: number): boolean {
    const hit = this.app.renderer.events.rootBoundary.hitTest(x, y)
    return hit !== null && hit !== this.app.stage && hit !== this.stage
  }
}

function makePokeball(r: number): Graphics {
  return new Graphics()
    .circle(0, 0, r)
    .fill(0xfafafa)
    .arc(0, 0, r, Math.PI, 0)
    .closePath()
    .fill(0xe3350d)
    .rect(-r, -1, r * 2, 2)
    .fill(0x141414)
    .circle(0, 0, r)
    .stroke({ width: 1.5, color: 0x141414 })
    .circle(0, 0, r * 0.35)
    .fill(0xfafafa)
    .stroke({ width: 1.5, color: 0x141414 })
}

function easeOutBack(k: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2)
}
