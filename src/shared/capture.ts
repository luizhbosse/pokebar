// Fórmula de captura (Gen 3/4 com multiplicadores de status modernos) + bolas de Johto (regras HGSS/modernas).
import { species } from './data'
import type { Gender, Status } from './types'

export interface CaptureContext {
  target: number // espécie
  targetLevel: number
  targetGender: Gender
  hp: number
  maxHp: number
  status: Status
  fished: boolean
  myLevel: number
  mySpecies: number
  myGender: Gender
}

const MOON_STONE_USERS = new Set([30, 33, 35, 39]) // Nidorina, Nidorino, Clefairy, Jigglypuff

/** Retorna { mult, add } da bola para o alvo. */
export function ballModifier(ball: string, ctx: CaptureContext): { mult: number; add: number } {
  const sp = species(ctx.target)
  switch (ball) {
    case 'great-ball':
      return { mult: 1.5, add: 0 }
    case 'ultra-ball':
      return { mult: 2, add: 0 }
    case 'master-ball':
      return { mult: 255, add: 0 }
    case 'fast-ball':
      return { mult: sp.baseStats.spe >= 100 ? 4 : 1, add: 0 }
    case 'lure-ball':
      return { mult: ctx.fished ? 5 : 1, add: 0 }
    case 'moon-ball':
      return { mult: MOON_STONE_USERS.has(ctx.target) ? 4 : 1, add: 0 }
    case 'love-ball': {
      const ok =
        ctx.mySpecies === ctx.target && ctx.myGender && ctx.targetGender && ctx.myGender !== ctx.targetGender
      return { mult: ok ? 8 : 1, add: 0 }
    }
    case 'level-ball': {
      const r = ctx.myLevel / Math.max(1, ctx.targetLevel)
      return { mult: r > 4 ? 8 : r > 2 ? 4 : r > 1 ? 2 : 1, add: 0 }
    }
    case 'heavy-ball': {
      const kg = sp.weight / 10
      return { mult: 1, add: kg >= 300 ? 30 : kg >= 200 ? 20 : kg >= 100 ? 0 : -20 }
    }
    default:
      return { mult: 1, add: 0 }
  }
}

const STATUS_MULT: Record<Status, number> = { none: 1, sleep: 2.5, paralysis: 1.5, poison: 1.5, burn: 1.5 }

/** Valor "a" da fórmula. ≥255 = captura garantida. */
function catchValue(ball: string, ctx: CaptureContext): number {
  const sp = species(ctx.target)
  const { mult, add } = ballModifier(ball, ctx)
  const rate = Math.max(1, Math.min(255, sp.catchRate + add))
  return (((3 * ctx.maxHp - 2 * ctx.hp) * rate * mult) / (3 * ctx.maxHp)) * STATUS_MULT[ctx.status]
}

/** Probabilidade de captura (para escolher a melhor bola). */
export function catchProbability(ball: string, ctx: CaptureContext): number {
  if (ball === 'master-ball') return 1
  const a = catchValue(ball, ctx)
  if (a >= 255) return 1
  const b = 1048560 / Math.sqrt(Math.sqrt(16711680 / a))
  return Math.pow(b / 65536, 4)
}

/** Arremesso: número de balanços (0–3) e se capturou. */
export function throwBall(ball: string, ctx: CaptureContext): { shakes: number; caught: boolean } {
  if (ball === 'master-ball') return { shakes: 3, caught: true }
  const a = catchValue(ball, ctx)
  if (a >= 255) return { shakes: 3, caught: true }
  const b = 1048560 / Math.sqrt(Math.sqrt(16711680 / a))
  let shakes = 0
  for (let i = 0; i < 4; i++) {
    if (Math.floor(Math.random() * 65536) >= b) return { shakes: Math.min(shakes, 3), caught: false }
    shakes++
  }
  return { shakes: 3, caught: true }
}
